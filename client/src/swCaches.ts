// Tên cache runtime của SW (design §4.3), dùng chung cho vite.config.ts và logout.ts: đổi tên ở
// một chỗ thì Đăng xuất vẫn xoá đúng cache. Precache của workbox không nằm ở đây.
export const RUNTIME_CACHES = { me: 'me', forms: 'forms' } as const;
