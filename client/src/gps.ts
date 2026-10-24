// Câu báo khi bấm "Lấy vị trí" mà không lấy được (design §8, ui.md màn hình 4). Tách khỏi FormRenderer
// để unit test được: mã lỗi theo GeolocationPositionError (1 từ chối quyền, 2 không lấy được, 3 quá giờ).

/** Không đặt giờ chờ thì có máy chờ mãi, người dùng không biết gì (design §8). */
export const GPS_TIMEOUT_MS = 30_000;

export const GPS_DENIED_MSG =
  'Chưa được phép lấy vị trí. Bật quyền vị trí cho trang này trong cài đặt trình duyệt rồi bấm lại.';
export const GPS_UNAVAILABLE_MSG = 'Không lấy được vị trí. Ra chỗ thoáng rồi bấm lại.';
export const GPS_UNSUPPORTED_MSG = 'Trình duyệt này không lấy được vị trí.';

/** `'unsupported'`: trình duyệt không có `navigator.geolocation`. */
export function gpsErrorText(code: number | 'unsupported'): string {
  if (code === 'unsupported') return GPS_UNSUPPORTED_MSG;
  // Quá giờ chờ (3) hay mã lạ thì người dùng làm giống nhau: ra chỗ thoáng, bấm lại
  return code === 1 ? GPS_DENIED_MSG : GPS_UNAVAILABLE_MSG;
}
