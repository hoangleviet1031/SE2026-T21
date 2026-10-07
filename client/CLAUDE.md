# client/ – quy tắc riêng

React 19 + Vite + Dexie + vite-plugin-pwa. Spec: design §4, §5; ADR 0001; ADR 0002 §4–6.

- **Local-first:** component đọc dữ liệu bằng `useLiveQuery` trên Dexie, ghi qua hàm trong `src/sync/` hoặc `src/db/`. Không `fetch` trong component, trừ màn hình bắt buộc online (Thành viên, Dự án, Xuất, lưu form) và phải hiện thông báo rõ khi offline.
- **Ghi phiếu** chỉ qua `saveRecordLocally` (transaction phiếu + outbox). Không `db.records.put` trực tiếp ở UI.
- **Mạng chỉ đi qua `src/sync/api.ts`** (timeout, token, tiền tố dự án, phân loại `NetworkError`).
- **Đổi schema Dexie:** thêm `this.version(n+1)`, không sửa version cũ. Chỉ TV2 nâng version (team-plan).
- **Phiếu `conflict` là chỉ đọc** (ADR 0001 quy tắc 7). Không tạo op khi phiếu đang `conflict`.
- **Router:** hash router tối giản trong `useHashRoute.ts` (`#/fill/<formId>/<recordId>`). Thêm trang thì thêm nhánh trong `App.tsx`, không thêm thư viện router.
- **CSS:** dùng `styles.css` sẵn có, class đơn giản; giao diện một cột, chạy tốt ở bề ngang 360px.
- **Chữ trên UI** tiếng Việt, đúng nhãn trong design (vd. "Chờ đồng bộ", "Cần xử lý xung đột", "Nháp"). Test E2E bám vào các chữ này, đổi chữ thì sửa test cùng PR.
- **`data-testid`** đặt kiểu kebab-case cho phần tử test cần (vd. `sync-state`, `conflict-table`, `project-switcher`).
- Không lưu dữ liệu nghiệp vụ trong `localStorage`; chỉ IndexedDB.

**E2E** (`e2e/*.spec.ts`): chạy trên bản build + `vite preview`, server API in-memory, `workers: 1`. Bật/tắt mạng bằng `context.setOffline`. Tiêm lỗi qua `POST /api/__test/faults`. Không `waitForTimeout`.
