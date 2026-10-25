# Đo hiệu năng

Số đo cho các chỉ tiêu ở [design.md §11.2](design.md#112-chỉ-tiêu) mà TV2-11 phụ trách: pull lần đầu, danh sách nhiều phiếu, đổi dự án. Các chỉ tiêu khác của §11.2 (mở app offline, lưu một phiếu, đồng bộ qua mạng chậm, ảnh) chưa đo ở đây.

## Kết quả (2026-10-25)

Mỗi lượt chạy 3 lần, bảng ghi **trung vị** (ba lần đo trong ngoặc). Đo lại sau khi giao diện đổi theo bản thiết kế (TV1-12 b2); số đo lần đầu (2026-10-18, giao diện cũ) ở cột cuối để so.

| Chỉ tiêu (§11.2) | Mục tiêu | Lượt A: CPU bình thường | Lượt B: CPU chậm ×4 | Đạt | 2026-10-18 (A / B) |
|---|---|---|---|---|---|
| Pull lần đầu 5.000 phiếu (supervisor) | ≤ 30 s | **2,3 s** (2,33 / 2,14 / 2,42) | **9,6 s** (10,30 / 9,60 / 9,24) | Đạt | 2,3 s / 9,1 s |
| Danh sách 2.000 phiếu hiển thị | ≤ 1 s | **211 ms** (203 / 211 / 224) | **880 ms** (679 / 991 / 880) | Đạt; lượt B sát ngưỡng | 123 ms / 498 ms |
| Đổi dự án đã tải (offline, sang dự án 2.000 phiếu) | ≤ 1 s | **246 ms** (248 / 230 / 246) | **559 ms** (593 / 331 / 559) | Đạt | 128 ms / 316 ms |
| *Tải lại trang tới khi đủ 2.000 dòng (tham khảo, không có chỉ tiêu riêng)* | – | 178 ms (178 / 186 / 174) | 1.152 ms (662 / 1.356 / 1.152) | – | 108 ms / 561 ms |
| Danh sách 2.000 phiếu cuộn mượt | thủ công | chưa thử | chưa thử | Chưa đo | – |

Truy vấn pull trên server đi theo index, không quét bảng: phạm vi `all` dùng `records_project_seq (project_id, seq)`, phạm vi `own` dùng `records_project_creator_seq (project_id, created_by, seq)`, ghép tên người tạo/sửa tra `users` theo khoá chính, không có bước sắp xếp tạm. Kiểm tự động trong `server/test/queryPlan.test.ts` (chạy cùng `npm test`).

**Máy đo:** laptop Intel Core i5-13500H (12 nhân, 16 luồng), RAM 16 GB, Windows 11; Node 24.19, Playwright 1.63 (Chromium đi kèm); server và trình duyệt cùng máy, không giới hạn mạng.

**Đọc số đo thế nào**
- Lượt A là điều kiện §11.2 ghi (không giới hạn CPU), có so ngưỡng: chạy lại mà vượt ngưỡng thì test đỏ.
- Lượt B giả lập máy yếu bằng `Emulation.setCPUThrottlingRate` của Chrome, giống cách §11.2 đo chỉ tiêu "mở app offline". Chỉ ghi số đo, không so ngưỡng. Thiết bị tham chiếu (§11.1, Android tầm trung 3 GB RAM) còn chậm ở IndexedDB và bộ nhớ, nên số thật có thể tệ hơn lượt B; vẫn còn dư nhiều so với chỉ tiêu.
- Server chạy cùng máy, không qua mạng thật: pull trên điện thoại qua 3G còn tốn thời gian tải. Đo được 5.000 phiếu mẫu là 2,28 MB JSON qua 11 request (10 trang 500 phiếu và một trang rỗng để dừng), chưa nén; ở 1,6 Mbps mất thêm khoảng 11 s. Hiện không có lớp nào nén: Express không bật nén, Caddyfile ở [deploy.md §7](deploy.md#7-caddy) không có `encode`. Thêm `encode zstd gzip` vào Caddyfile là cách rẻ nhất để giảm phần này (JSON lặp nhiều tên trường nên nén tốt); chưa làm vì ngoài phạm vi TV2-11.

## Cách đo

```bash
# Tắt `npm run dev` trước (cùng cổng 3001, 4173)
npm run test:perf                         # lượt A, có so ngưỡng §11.2
PERF_CPU_THROTTLE=4 npm run test:perf     # lượt B, chỉ ghi số đo (PowerShell: $env:PERF_CPU_THROTTLE=4; npm run test:perf)
```

Mỗi lượt khoảng 15–25 s sau khi build. Số đo in ra dòng `[perf] …` và nằm trong annotation của báo cáo Playwright. Bộ này (`client/e2e/perf/`, cấu hình `client/playwright.perf.config.ts`) **không** chạy trong `npm run test:e2e` và CI.

Cách đo từng chỉ tiêu (`client/e2e/perf/pull.spec.ts`):
- **Pull lần đầu:** seed 5.000 phiếu (người tạo `minh`) vào dự án mới, `lan` là supervisor nên pull phạm vi `all`. Bấm giờ từ lúc mở màn hình đăng nhập tới khi CSDL dự án trên máy có đủ 5.000 dòng (đọc IndexedDB mỗi 250 ms, nên sai số khoảng 0,25 s).
- **Danh sách:** dự án 2.000 phiếu đã tải xong; từ trang Cài đặt bấm về trang chủ, đo tới khi danh sách có đủ 2.000 dòng.
- **Đổi dự án:** offline, đang ở dự án nhỏ, chọn dự án 2.000 phiếu trong bộ chọn, đo tới khi danh sách có đủ 2.000 dòng.

Dữ liệu seed: `POST /api/__test/seed-perf` (server E2E chạy CSDL `:memory:`), cùng hàm với lệnh `npm run seed:perf -w server -- --project <id> --user <username> [--count 5000]` để seed vào CSDL file (dev, staging; từ chối khi `NODE_ENV=production`). Phiếu được ghi như một lần `PUT` thật: `records` và `record_history` version 1, `seq` cấp trong cùng transaction.

## Thử tay trên điện thoại (chưa làm)

§11.2 ghi "thủ công" cho "danh sách 2.000 phiếu cuộn mượt". Cách thử trên staging:
1. Trên máy staging (không phải production): tạo dự án thử, chạy `npm run seed:perf -w server -- --project <id> --user <tên người tạo> --count 2000`, thêm tài khoản thử làm supervisor.
2. Trên điện thoại Android tầm trung, đăng nhập tài khoản đó, chờ đồng bộ xong.
3. Cuộn danh sách từ đầu tới cuối: ghi lại có giật không, và thời gian từ lúc mở app tới khi thấy danh sách.
4. Ghi kết quả vào bảng trên (cột mới "Điện thoại"), kèm tên máy.

## Chỗ có thể chậm khi dữ liệu lớn hơn

Chưa vượt chỉ tiêu nên chưa sửa; ghi lại để biết chỗ cần xem khi số phiếu tăng:
- **Danh sách** (`client/src/pages/HomePage.tsx`) đọc toàn bộ `records` rồi vẽ hết, không ảo hoá. Thời gian tăng tuyến tính theo số phiếu. Giao diện mới (TV1-12 b2) vẽ mỗi dòng nặng hơn: ở 2.000 phiếu với CPU ×4 từ khoảng 0,5 s lên khoảng 0,9 s, một lần đo 991 ms, tức là máy yếu đã sát chỉ tiêu 1 s ngay ở 2.000 phiếu. TV2-18 (danh sách 2.000 phiếu) nên xem chỗ này trước: vẽ theo trang hoặc chỉ vẽ phần đang thấy.
- **Pull** (`pullAll` trong `client/src/sync/engine.ts`): mỗi phiếu đọc `records.get` và đếm `outbox` riêng trong transaction của trang. Server chưa trả `hasMore` (design §7), client dừng khi gặp trang rỗng nên tốn thêm một request.
