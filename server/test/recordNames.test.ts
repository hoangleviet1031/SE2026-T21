import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConflictResponse, PullResponse, RecordHistoryEntry, ServerRecord } from '@field-survey/shared';
import { createTestServer, type TestServer } from './fixtures';

// TV1-17: ServerRecord có người tạo và tên người tạo/sửa, lịch sử có tên người sửa (design §6.2, P1).
// Tên ghép lúc đọc từ bảng users. Tài khoản demo: name của minh là "minh", của lan là "lan".

let t: TestServer;

beforeAll(async () => {
  t = await createTestServer();
});
afterAll(() => t.close());

const url = (path: string) => `${t.base}/api/projects/${t.projects.yte}/records${path}`;

function push(token: string, id: string, baseVersion: number, householdName: string) {
  return fetch(url(`/${id}`), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({ formId: 'household-survey', formVersion: 1, baseVersion, deleted: false, data: { householdName } }),
  });
}

async function get<T>(path: string, token: string): Promise<T> {
  const res = await fetch(url(path), { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
  return (await res.json()) as T;
}

const pulled = async (id: string, token = t.tokens.lan) =>
  (await get<PullResponse>('?since=0', token)).records.find((r) => r.id === id);

describe('tên người tạo/sửa trong ServerRecord', () => {
  it('PUT tạo mới trả người tạo và người sửa kèm tên', async () => {
    const res = await push(t.tokens.minh, 'n1', 0, 'An');
    expect(res.status).toBe(201);
    expect((await res.json()) as ServerRecord).toMatchObject({
      createdBy: 'u_minh',
      createdByName: 'minh',
      updatedBy: 'u_minh',
      updatedByName: 'minh',
    });
  });

  it('người khác sửa: người tạo giữ nguyên, người sửa đổi; pull trả đủ tên', async () => {
    const res = await push(t.tokens.lan, 'n1', 1, 'Bình');
    expect(res.status).toBe(200);
    const expected = { createdBy: 'u_minh', createdByName: 'minh', updatedBy: 'u_lan', updatedByName: 'lan' };
    expect((await res.json()) as ServerRecord).toMatchObject(expected);
    expect(await pulled('n1')).toMatchObject(expected);
    // Surveyor pull phạm vi "own" cũng có tên
    expect(await pulled('n1', t.tokens.minh)).toMatchObject(expected);
  });

  it('409 có tên ở bản server và ở từng dòng lịch sử', async () => {
    const res = await push(t.tokens.minh, 'n1', 1, 'Chi');
    expect(res.status).toBe(409);
    const body = (await res.json()) as ConflictResponse;
    expect(body.current).toMatchObject({ createdByName: 'minh', updatedBy: 'u_lan', updatedByName: 'lan' });
    expect(body.history).toEqual([expect.objectContaining({ version: 2, updatedBy: 'u_lan', updatedByName: 'lan' })]);
  });

  it('GET history có tên người sửa ở mọi phiên bản', async () => {
    const history = await get<RecordHistoryEntry[]>('/n1/history', t.tokens.lan);
    expect(history.map((h) => [h.version, h.updatedBy, h.updatedByName])).toEqual([
      [1, 'u_minh', 'minh'],
      [2, 'u_lan', 'lan'],
    ]);
  });

  it('không tìm thấy tài khoản người sửa: tên rỗng, phiếu vẫn trả về', async () => {
    await push(t.tokens.lan, 'n2', 0, 'Dung');
    // Không có FK tới users (design §6.1): mô phỏng userId không còn dòng users
    t.db.prepare(`UPDATE records SET updated_by = 'u_khong_co' WHERE id = 'n2'`).run();
    expect(await pulled('n2')).toMatchObject({ createdByName: 'lan', updatedBy: 'u_khong_co', updatedByName: '' });
  });

  it('tên lấy lúc đọc: đổi tên tài khoản thì lần pull sau thấy tên mới', async () => {
    t.db.prepare(`UPDATE users SET name = 'Lan Nguyễn' WHERE id = 'u_lan'`).run();
    expect(await pulled('n1')).toMatchObject({ updatedBy: 'u_lan', updatedByName: 'Lan Nguyễn' });
  });
});
