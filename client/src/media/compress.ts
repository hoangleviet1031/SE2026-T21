// Nén ảnh trước khi lưu vào IndexedDB (design §4.4, §11.2): xoay đúng chiều theo EXIF, cạnh dài
// tối đa 1600 px, JPEG. Vẽ lại qua canvas nên file mới không còn EXIF, kể cả toạ độ GPS (§9).

export const MAX_EDGE = 1600;
/** Chỉ tiêu §11.2. Vượt thì nén lại với chất lượng thấp hơn. */
export const TARGET_BYTES = 600 * 1024;
/** 0.8 theo §4.4; ảnh nhiều chi tiết (lá cây, tường gạch) vượt 600 KB thì thử tiếp 0.7, 0.6. */
export const JPEG_QUALITIES = [0.8, 0.7, 0.6] as const;

/** Trình duyệt không giải mã được file (vd. HEIC trên Chrome Android, file không phải ảnh). */
export class ImageDecodeError extends Error {
  constructor() {
    super('không giải mã được ảnh');
    this.name = 'ImageDecodeError';
  }
}

/** Kích thước mới giữ tỉ lệ, cạnh dài ≤ maxEdge. Ảnh nhỏ hơn giữ nguyên, không phóng to. */
export function fitWithin(width: number, height: number, maxEdge = MAX_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decodeWithImgElement(blob: Blob): Promise<Decoded> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new ImageDecodeError();
  }
  // <img> tự xoay theo EXIF (CSS image-orientation mặc định from-image), naturalWidth đã là chiều sau xoay.
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

async function decode(blob: Blob): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch (e) {
    // Safari iOS 16.4 (§11.1) có thể không nhận tuỳ chọn imageOrientation: thử lại bằng <img>.
    // <img> cũng không đọc được thì decodeWithImgElement ném ImageDecodeError.
    console.warn('createImageBitmap lỗi, thử giải mã bằng <img>', e);
    return decodeWithImgElement(blob);
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob trả về null'))), 'image/jpeg', quality),
  );
}

/**
 * Trả JPEG đã nén. Ảnh đã nhỏ vẫn đi qua canvas để bỏ EXIF. Vẫn vượt 600 KB ở chất lượng thấp
 * nhất thì vẫn trả về: giữ ảnh của người dùng quan trọng hơn chỉ tiêu dung lượng.
 */
export async function compressImage(blob: Blob): Promise<Blob> {
  const image = await decode(blob);
  try {
    const { width, height } = fitWithin(image.width, image.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('trình duyệt không cấp canvas 2D');
    // JPEG không có kênh trong suốt: nền trắng để PNG trong suốt không thành nền đen.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image.source, 0, 0, width, height);

    let out = await toJpeg(canvas, JPEG_QUALITIES[0]);
    for (const quality of JPEG_QUALITIES.slice(1)) {
      if (out.size <= TARGET_BYTES) break;
      out = await toJpeg(canvas, quality);
    }
    return out;
  } finally {
    image.release();
  }
}
