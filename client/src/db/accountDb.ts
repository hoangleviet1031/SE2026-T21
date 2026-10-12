import Dexie, { type EntityTable } from 'dexie';
import type { Role } from '@field-survey/shared';

// Một CSDL cho cả máy: token, người dùng, danh sách dự án (bản sao GET /api/me) và dự án đang chọn.
// Dữ liệu khảo sát nằm ở CSDL riêng của từng dự án (projectDb.ts). Xem design §4.2, ADR 0002 §4.

/** Khoá trong bảng `account`. Thêm khoá mới ở đây để mọi chỗ đọc/ghi dùng cùng một tên. */
export type AccountKey = 'token' | 'currentProjectId';

export interface AccountEntry {
  key: AccountKey;
  value: unknown;
}

/** Một dự án mình thuộc (hoặc từng thuộc). TV2-06 ghi bảng này sau mỗi lần gọi /me. */
export interface AccountProject {
  id: string;
  name: string;
  role: Role;
  /** `removed`: không còn trong /me nhưng CSDL dự án có thể còn dữ liệu chưa gửi (ADR 0002 §6) */
  status: 'active' | 'removed';
  /** Số phiếu cần xử lý / chưa đồng bộ, cập nhật sau mỗi vòng đồng bộ */
  needsAttention: number;
  unsynced: number;
}

export class AccountDb extends Dexie {
  account!: EntityTable<AccountEntry, 'key'>;
  projects!: EntityTable<AccountProject, 'id'>;

  constructor() {
    super('field-survey-account');
    // Đổi schema: thêm this.version(2).stores(...) kèm .upgrade(), không sửa version(1)
    this.version(1).stores({
      account: 'key',
      projects: 'id',
    });
  }
}

export const accountDb = new AccountDb();

export async function getAccountValue<T>(key: AccountKey, fallback: T): Promise<T> {
  const row = await accountDb.account.get(key);
  return row ? (row.value as T) : fallback;
}

export function setAccountValue(key: AccountKey, value: unknown) {
  return accountDb.account.put({ key, value });
}
