// Tính chỗ thả khi kéo trường trong builder (TV1-12 b2, ui.md màn hình 5). Hàm thuần, toạ độ theo khung danh
// sách đo lúc bắt đầu kéo; không phụ thuộc React để unit test được.

/** Vị trí một dòng trong danh sách lúc bắt đầu kéo (offsetTop, offsetHeight) */
export type RowBox = { top: number; height: number };

/**
 * Chỗ thả: số dòng khác có điểm giữa nằm trên tâm dòng đang kéo. Tâm đúng bằng điểm giữa thì chưa qua dòng đó,
 * phải qua hẳn nửa dòng mới đổi chỗ để dòng không nhảy qua lại khi tay run.
 */
export function dropIndex(centerY: number, rows: readonly RowBox[], from: number): number {
  let index = 0;
  rows.forEach((r, i) => {
    if (i !== from && r.top + r.height / 2 < centerY) index += 1;
  });
  return index;
}

/** Khoảng cách giữa hai dòng kề nhau (đường kẻ), để dịch dòng khớp đúng chỗ */
function gapOf(rows: readonly RowBox[]): number {
  const [a, b] = rows;
  return a && b ? b.top - a.top - a.height : 0;
}

/**
 * Các dòng nằm giữa chỗ cũ và chỗ thả dịch lên (kéo xuống) hoặc dịch xuống (kéo lên) đúng bằng chiều cao dòng
 * đang kéo, nhường chỗ cho nó. Dòng khác đứng yên.
 */
export function shiftFor(index: number, from: number, to: number, rows: readonly RowBox[]): number {
  const dragged = rows[from];
  if (!dragged || index === from) return 0;
  const step = dragged.height + gapOf(rows);
  if (to > from && index > from && index <= to) return -step;
  if (to < from && index >= to && index < from) return step;
  return 0;
}

/** Mép trên của ô kẻ sọc: chỗ dòng đang kéo sẽ nằm sau khi thả */
export function slotTop(from: number, to: number, rows: readonly RowBox[]): number {
  const dragged = rows[from];
  const target = rows[to];
  if (!dragged || !target) return 0;
  if (to < from) return target.top;
  if (to > from) return target.top + target.height - dragged.height;
  return dragged.top;
}
