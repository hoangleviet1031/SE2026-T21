import { describe, expect, it } from 'vitest';
import { GPS_DENIED_MSG, GPS_TIMEOUT_MS, GPS_UNAVAILABLE_MSG, GPS_UNSUPPORTED_MSG, gpsErrorText } from './gps';

describe('gpsErrorText', () => {
  it('bị từ chối quyền (mã 1) thì hướng dẫn bật quyền', () => {
    expect(gpsErrorText(1)).toBe(GPS_DENIED_MSG);
    expect(GPS_DENIED_MSG).toBe(
      'Chưa được phép lấy vị trí. Bật quyền vị trí cho trang này trong cài đặt trình duyệt rồi bấm lại.',
    );
  });

  it('không lấy được (mã 2) và quá giờ chờ (mã 3) cùng một câu', () => {
    expect(gpsErrorText(2)).toBe(GPS_UNAVAILABLE_MSG);
    expect(gpsErrorText(3)).toBe(GPS_UNAVAILABLE_MSG);
    expect(GPS_UNAVAILABLE_MSG).toBe('Không lấy được vị trí. Ra chỗ thoáng rồi bấm lại.');
  });

  it('mã lạ coi như không lấy được', () => {
    expect(gpsErrorText(99)).toBe(GPS_UNAVAILABLE_MSG);
  });

  it('trình duyệt không có geolocation', () => {
    expect(gpsErrorText('unsupported')).toBe(GPS_UNSUPPORTED_MSG);
    expect(GPS_UNSUPPORTED_MSG).toBe('Trình duyệt này không lấy được vị trí.');
  });

  it('chờ tối đa 30 giây (design §8)', () => {
    expect(GPS_TIMEOUT_MS).toBe(30_000);
  });
});
