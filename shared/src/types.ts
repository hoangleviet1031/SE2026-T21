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

/** Thân request PUT /api/records/:id */
export interface PushRecordRequest {
  formId: string;
  formVersion: number;
  baseVersion: number;
  data: RecordData;
  deleted: boolean;
  updatedBy: string;
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
}
