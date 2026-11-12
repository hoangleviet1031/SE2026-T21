import type { BuilderDraft } from '../builderDraft';
import type { ProjectDb } from './projectDb';

// Bản tự lưu của builder nằm trong bảng `meta` của CSDL dự án (design §4.1, §4.2), như bộ đệm đang nhập của
// màn hình 4: không đổi schema; Đăng xuất hay "Xoá khỏi máy" xoá CSDL thì mất theo. Form mới dùng khoá riêng
// `builder-new` vì mã form được phép là "new".

const key = (formId: string | undefined) => (formId === undefined ? 'builder-new' : `builder:${formId}`);

export async function getBuilderDraft(db: ProjectDb, formId: string | undefined): Promise<BuilderDraft | undefined> {
  return (await db.meta.get(key(formId)))?.value as BuilderDraft | undefined;
}

export async function putBuilderDraft(db: ProjectDb, formId: string | undefined, draft: BuilderDraft): Promise<void> {
  await db.meta.put({ key: key(formId), value: draft });
}

export async function deleteBuilderDraft(db: ProjectDb, formId: string | undefined): Promise<void> {
  await db.meta.delete(key(formId));
}
