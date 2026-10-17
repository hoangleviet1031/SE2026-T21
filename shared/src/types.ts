// Kiểu dữ liệu dùng chung giữa client và server.
// Xem docs/design.md mục "Mô hình dữ liệu".

export type FieldType = 'text' | 'number' | 'select' | 'multiselect' | 'date' | 'photo' | 'gps';

export interface FieldDef {
  id: string;
  type: FieldType;
  label: string;
  required?: boolean;
  /** Chỉ dùng cho select / multiselect */
  options?: string[];
  /** Thay cho xoá trường: không hiện khi tạo phiếu mới, vẫn có cột khi export (design §4.1) */
  hidden?: boolean;
}

export interface FormSchema {
  id: string;
  /** Tăng mỗi lần form được sửa; bản ghi lưu formVersion lúc tạo */
  version: number;
  title: string;
  fields: FieldDef[];
}

export interface GpsValue {
  lat: number;
  lng: number;
  accuracy?: number;
}

/** photo: danh sách attachmentId; gps: toạ độ; multiselect: mảng chuỗi */
export type FieldValue = string | number | string[] | GpsValue | null;

export type RecordData = Record<string, FieldValue>;

/** Bản ghi theo góc nhìn server (nguồn sự thật) */
export interface ServerRecord {
  id: string;
  formId: string;
  formVersion: number;
  data: RecordData;
  /** Do server cấp, tăng 1 mỗi lần ghi thành công. 0 = chưa từng tồn tại */
  version: number;
  deleted: boolean;
  updatedAt: string;
  updatedBy: string;
}

/** Một dòng lịch sử, dùng để giải thích conflict ("ai sửa, lúc nào") */
export interface RecordHistoryEntry {
  version: number;
  data: RecordData;
  deleted: boolean;
  updatedAt: string;
  updatedBy: string;
}

/** Thân request POST P/forms: server tự đặt `version` (bản mới nhất + 1), không nhận từ client */
export type SaveFormRequest = Omit<FormSchema, 'version'>;

/** Thân request PUT /api/records/:id */
export interface PushRecordRequest {
  formId: string;
  formVersion: number;
  baseVersion: number;
  data: RecordData;
  deleted: boolean;
}

/** Thân response 409 */
export interface ConflictResponse {
  error: 'version_conflict';
  current: ServerRecord;
  /** Các phiên bản sau baseVersion, cũ đến mới */
  history: RecordHistoryEntry[];
}

export interface PullResponse {
  records: ServerRecord[];
  /** Truyền lại vào ?since= ở lần pull sau */
  cursor: number;
  /** Phạm vi pull theo vai trò; đổi phạm vi thì client đặt cursor về 0 (design §5.5) */
  scope: 'own' | 'all';
}

/**
 * Vai trò trong một dự án, thứ hạng tăng dần (ADR 0003 §2). `admin` là cờ toàn hệ thống của người
 * vận hành app, không phải vai trò dự án.
 */
export type Role = 'surveyor' | 'supervisor' | 'owner';

/** Một dự án mình đang là thành viên, như trong `GET /api/me` (design §7). Dự án đã lưu trữ không có ở đây. */
export interface ProjectSummary {
  id: string;
  name: string;
  role: Role;
}

/** Thân response `GET /api/me` */
export interface MeResponse {
  user: { id: string; username: string; name: string; isAdmin: boolean };
  projects: ProjectSummary[];
}

/** Thân request `POST /api/auth/register` (ADR 0003 §1) */
export interface RegisterRequest {
  username: string;
  name: string;
  password: string;
}

/** Thân request `POST /api/auth/login` */
export interface LoginRequest {
  username: string;
  password: string;
}

/** Response của register và login: token phiên của máy này */
export interface AuthResponse {
  token: string;
  user: MeResponse['user'];
}

/** Dự án theo góc nhìn admin (`/api/admin/projects`): có cả dự án đã lưu trữ */
export interface AdminProject {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;
}

/** Thân request `POST /api/admin/projects`. `id` do admin đặt, dùng trong URL và tên IndexedDB */
export interface CreateProjectRequest {
  id: string;
  name: string;
}

/** Thân request `PATCH /api/admin/projects/:projectId`; cần ít nhất một trường */
export interface UpdateProjectRequest {
  name?: string;
  archived?: boolean;
}

/** Một thành viên trong `GET P/members` (ADR 0003 §6). Chỉ supervisor, owner gọi được */
export interface Member {
  userId: string;
  username: string;
  name: string;
  role: Role;
  addedAt: string;
}

/** Thân request `POST P/members` */
export interface AddMemberRequest {
  username: string;
  role: Role;
}

/** Thân request `PUT P/members/:userId` */
export interface UpdateMemberRequest {
  role: Role;
}

/** Thân request `PATCH P/settings`; cần ít nhất một trường. Chỉ owner */
export interface UpdateSettingsRequest {
  name?: string;
  public?: boolean;
}

/** Response `PATCH P/settings` */
export interface ProjectSettings {
  name: string;
  public: boolean;
}
