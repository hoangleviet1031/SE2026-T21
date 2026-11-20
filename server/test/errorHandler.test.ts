import { describe, expect, it } from 'vitest';
import { errorResponse } from '../src/errorHandler';

// Bộ xử lý lỗi cuối (nợ N28, design §7.1): lỗi bên gửi giữ 4xx để client không thử lại mãi.
describe('errorResponse', () => {
  it.each([
    ['JSON hỏng', { type: 'entity.parse.failed', status: 400 }, 400, 'invalid_body'],
    ['thân quá lớn', { type: 'entity.too.large', status: 413 }, 413, 'payload_too_large'],
    ['charset lạ', { type: 'charset.unsupported', status: 415 }, 400, 'invalid_body'],
    ['request bị huỷ giữa chừng', { type: 'request.aborted', status: 400 }, 400, 'invalid_body'],
    ['Error thường', new Error('ENOTDIR'), 500, 'internal_error'],
    ['có type nhưng status 5xx', { type: 'stream.not.readable', status: 500 }, 500, 'internal_error'],
    ['có type nhưng không có status', { type: 'x' }, 500, 'internal_error'],
    ['không phải object', 'boom', 500, 'internal_error'],
    ['null', null, 500, 'internal_error'],
  ])('%s → %i %s', (_label, error, status, code) => {
    expect(errorResponse(error)).toEqual({ status, body: { error: code } });
  });
});
