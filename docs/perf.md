# Đo hiệu năng

Số đo cho các chỉ tiêu ở [design.md §11.2](design.md#112-chỉ-tiêu): pull lần đầu, danh sách nhiều phiếu, đổi dự án (TV2-11, mục "Kết quả (2026-10-25)"); mở app offline (QS4) và lưu một phiếu (mục "Mở app offline và lưu phiếu (2026-11-20)"); danh sách 2.000 phiếu cuộn mượt (mục "Cuộn danh sách (2026-11-23)"); đồng bộ qua mạng chậm và dung lượng mỗi máy (mục "Mạng chậm và dung lượng (2026-11-24)"). Kích thước ảnh đo bằng `photo.spec.ts`.

## Kết quả (2026-10-25)

Mỗi lượt chạy 3 lần, bảng ghi **trung vị** (ba lần đo trong ngoặc). Đo lại sau khi giao diện đổi theo bản thiết kế (TV1-12 b2); số đo lần đầu (2026-10-18, giao diện cũ) ở cột cuối để so.

| Chỉ tiêu (§11.2) | Mục tiêu | Lượt A: CPU bình thường | Lượt B: CPU chậm ×4 | Đạt | 2026-10-18 (A / B) |
|---|---|---|---|---|---|
| Pull lần đầu 5.000 phiếu (supervisor) | ≤ 30 s | **2,3 s** (2,33 / 2,14 / 2,42) | **9,6 s** (10,30 / 9,60 / 9,24) | Đạt | 2,3 s / 9,1 s |
| Danh sách 2.000 phiếu hiển thị | ≤ 1 s | **211 ms** (203 / 211 / 224) | **880 ms** (679 / 991 / 880) | Đạt; lượt B sát ngưỡng | 123 ms / 498 ms |
| Đổi dự án đã tải (offline, sang dự án 2.000 phiếu) | ≤ 1 s | **246 ms** (248 / 230 / 246) | **559 ms** (593 / 331 / 559) | Đạt | 128 ms / 316 ms |
| *Tải lại trang tới khi đủ 2.000 dòng (tham khảo, không có chỉ tiêu riêng)* | – | 178 ms (178 / 186 / 174) | 1.152 ms (662 / 1.356 / 1.152) | – | 108 ms / 561 ms |
| Danh sách 2.000 phiếu cuộn mượt | p95 khung ≤ 50 ms | p95 17 ms (trang đầu 200 dòng) · 33 ms (đủ 2.000 dòng) | 33 ms · 67 ms | Đạt; lượt B đủ 2.000 dòng vượt (mục "Cuộn danh sách (2026-11-23)") | – |

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

## Mở app offline và lưu phiếu (2026-11-20)

Bộ đo `client/e2e/perf/client.spec.ts`, cùng cách chạy ở mục "Cách đo". Mỗi lượt 3 lần, bảng ghi **trung vị** (ba lần đo trong ngoặc).

| Chỉ tiêu (§11.2) | Mục tiêu | Lượt A: CPU bình thường | Lượt B: CPU chậm ×4 | Đạt |
|---|---|---|---|---|
| Mở app đã cài khi offline tới khi nhập được (QS4, §11.4) | ≤ 3 s, CPU ×4 | **310 ms** (292 / 317 / 310) | **1.128 ms** (1.128 / 1.276 / 1.067) | Đạt |
| *Trong đó: tới khi thấy danh sách 200 phiếu (tham khảo)* | – | 204 ms (203 / 204 / 205) | 869 ms (869 / 933 / 813) | – |
| Lưu một phiếu | ≤ 200 ms | **33 ms** (42 / 33 / 23) | **91 ms** (81 / 93 / 91) | Đạt |
| *Bấm Lưu tới khi phiếu hiện ở danh sách (tham khảo)* | – | 127 ms (131 / 127 / 118) | 344 ms (344 / 399 / 317) | – |

Cách đo:
- **Mở app offline:** `minh` có 200 phiếu (seed như mục trên) trong dự án `demo-yte`, đăng nhập, chờ service worker kiểm soát trang và danh sách đủ 200 dòng, đóng tab. Tắt mạng, mở **tab mới** tới `/` (đúng cảnh mở lại app đã cài, không phải tải lại tab cũ). Bấm giờ từ lúc mở trang tới khi danh sách đủ 200 dòng, nút "Tạo phiếu mới" bấm được, bấm nút đó và ô đầu tiên của phiếu gõ được. Test kiểm thêm app hiện "Ngoại tuyến" và trang do service worker phục vụ. Chỉ tiêu ghi ở CPU ×4 nên so ngưỡng ở cả hai lượt.
- **Lưu một phiếu:** offline (để lần đồng bộ ngay sau khi lưu không chen vào số đo), điền tên chủ hộ cho phiếu mới, bấm giờ **trong trang** bằng `performance.now()` từ sự kiện click nút Lưu tới khi app chuyển về trang chủ (`hashchange`). Trang nhập chỉ chuyển trang sau khi transaction phiếu + op đã xong (`saveRecordLocally`, bất biến 2), nên số này gồm thời gian ghi IndexedDB và phần React xử lý click, không lẫn độ trễ của Playwright. Dòng "tới khi phiếu hiện ở danh sách" đo từ phía Playwright, gồm cả vẽ lại danh sách. So ngưỡng ở lượt A, giống ba chỉ tiêu của TV2-11.
- Lượt B: Chrome DevTools Protocol `Emulation.setCPUThrottlingRate` trên tab mới mở. Phiên CDP riêng làm tab mất trạng thái offline của `context.setOffline` nên test đặt lại `Network.emulateNetworkConditions` offline trên chính phiên đó.

**Tốc độ máy đo dao động mạnh, số đo trên là lúc máy chậm:** cùng máy ở mục trên, sáng 2026-11-20 chạy lại bộ đo pull ở commit đo 2026-10-25 (c0d3169) được pull 5.000 phiếu 8–9 s (lúc đó 2,3 s), danh sách 2.000 phiếu 818–821 ms (lúc đó 211 ms); bộ đo pull trên `main` (850754d) lúc đó đỏ ở danh sách 2.000 phiếu (1.042 / 1.135 ms). Khoảng một giờ sau, cùng `main`, máy nhanh trở lại: pull khoảng 3,9 s, danh sách 175–311 ms, đổi dự án 319–364 ms, đều đạt. Vì vậy lần đỏ là do máy chậm lúc đo, **không phải code chậm đi**; hai bộ số chạy ở hai thời điểm không so được với nhau. Khi chạy xen kẽ ở CPU ×4 (chỉ ghi số đo), danh sách 2.000 phiếu trên `main` là 1.410 / 1.620 ms, đổi dự án 1.829 / 1.613 ms, chậm hơn số đo 2026-10-25 (880 / 559 ms) và vượt 1 s; tách danh sách thành component `memo` không cải thiện (1.408 / 2.011 ms), nên đã bỏ. Muốn so hai bản code phải chạy xen kẽ trong cùng một lúc. Máy yếu thật vẫn có thể vượt 1 s ở 2.000 phiếu: xem mục "Chỗ có thể chậm" bên dưới.

## Danh sách vẽ theo trang (2026-11-22, tech-debt N33)

Trước đó trang chủ vẽ hết mọi phiếu: 2.000 phiếu ở CPU ×4 vượt 1 s. Từ N33 mỗi nhóm form chỉ vẽ 200 phiếu mới nhất kèm nút [Xem thêm phiếu] (design §4.8). Bộ đo `perf/pull.spec.ts` đổi theo: "hiển thị" tính tới khi tiêu đề nhóm đếm đủ 2.000, trang đầu 200 dòng đã vẽ và nút đã có; thêm số đo bấm [Xem thêm phiếu]. Cùng máy, cùng buổi tối, `npm run test:perf -- -g "danh sách 2.000"`: trước là `main` 48c83eb (một lần mỗi mức), sau là nhánh N33 (hai lần mỗi mức).

| Số đo (2.000 phiếu) | Trước, CPU ×1 | Sau, CPU ×1 | Trước, CPU ×4 | Sau, CPU ×4 |
|---|---|---|---|---|
| Mở lại trang chủ (chỉ tiêu ≤ 1 s) | 872 ms | 124 / 115 ms | 1.099 ms | 727 / 447 ms |
| Đổi sang dự án 2.000 phiếu, offline (≤ 1 s) | 924 ms | 166 / 161 ms | 1.652 ms | 463 / 458 ms |
| Tải lại cả trang (chỉ ghi số) | 1.094 ms | 172 / 156 ms | 1.848 ms | 1.031 / 856 ms |
| Bấm [Xem thêm phiếu], thêm 200 dòng (chỉ ghi số) | – | 84 / 70 ms | – | 473 / 335 ms |

Máy đo dao động mạnh (xem trên), nên chỉ so được cỡ: ở CPU ×4 cả hai chỉ tiêu đã dưới 1 s, đổi dự án nhanh khoảng 3,5 lần. Tải lại cả trang ở CPU ×4 vẫn khoảng 1 s vì phần lớn là khởi động app và đọc IndexedDB, không phải vẽ danh sách.

## Cuộn danh sách (2026-11-23)

Bộ đo `perf/pull.spec.ts` ca "danh sách 2.000 phiếu cuộn mượt", cùng cách chạy ở mục "Cách đo" (`npm run test:perf -w client -- -g "cuộn mượt"`). Mỗi lượt chạy 3 lần; bảng ghi **trung vị** của p95 (ba lần trong ngoặc).

| Cảnh (2.000 phiếu trong một nhóm form) | Chỉ tiêu | Lượt A: CPU bình thường | Lượt B: CPU chậm ×4 | Đạt |
|---|---|---|---|---|
| Trang đầu 200 dòng (cảnh thường gặp, §4.8) | p95 khung ≤ 50 ms | **17 ms** (17 / 17 / 17); trung vị khung 17 ms; 0 khung > 50 ms | 33 ms (33 / 17 / 33); 2–3 khung > 50 ms trên 143 | Đạt |
| Bấm [Xem thêm phiếu] tới khi vẽ đủ 2.000 dòng (cảnh nặng nhất) | p95 khung ≤ 50 ms | **33 ms** (33 / 33 / 33); 1–5 khung > 50 ms trên 1.420 | 67 ms (83 / 67 / 50); 74–153 khung > 50 ms trên 1.420 | Đạt ở lượt A; lượt B vượt |

Cách đo: dự án mới seed 2.000 phiếu, `lan` (supervisor) pull xong, trang chủ hiện trang đầu. Trong trang, script cuộn cửa sổ từ đầu tới cuối, mỗi khung (`requestAnimationFrame`) xuống 100 px (khoảng 6.000 px/s, như vuốt nhanh), ghi khoảng cách giữa hai khung. Màn hình 60 Hz nên khung đều là 16,7 ms; khung 33 ms là rơi một khung. Đo trang đầu, rồi bấm [Xem thêm phiếu] 9 lần tới khi đủ 2.000 dòng và đo lại.

Đọc số đo:
- **Ngưỡng "mượt" là p95 khung ≤ 50 ms** (design §11.2, chốt 2026-11-23): 95% khung không chậm quá ba lần khung 60 Hz, tức không có khựng thấy được kéo dài. §11.2 trước đó chỉ ghi "cuộn mượt", không có số. Lượt A so ngưỡng (đỏ nếu vượt), lượt B chỉ ghi số, như các chỉ tiêu khác của bộ này.
- Cuộn bằng script chạy trên luồng chính nên khung nào luồng chính bận đều dài ra. Cuộn bằng ngón tay trên điện thoại do compositor làm, thường mượt hơn số đo này, nên số đo là cận xấu.
- Ở máy yếu (lượt B) trang đầu vẫn mượt. Bung hết 2.000 dòng thì khoảng 5–10% khung quá 50 ms: người dùng phải bấm [Xem thêm phiếu] 9 lần mới tới cảnh này. Nếu thử máy thật thấy giật thì hướng sửa ở mục "Chỗ có thể chậm" (chỉ vẽ phần đang thấy).

## Mạng chậm và dung lượng (2026-11-24)

Bộ đo `client/e2e/perf/network.spec.ts`, cùng cách chạy ở mục "Cách đo" (`npm run test:perf -w client -- network.spec.ts`, khoảng 8 phút mỗi lượt). Số đo do độ trễ mạng giả lập quyết định nên gần như không đổi giữa các lần chạy; bảng ghi trung bình lượt A (hai lần trong ngoặc) và một lần lượt B. CPU chậm ×4 gần như không đổi kết quả: chỗ nghẽn là mạng.

| Chỉ tiêu (§11.2) | Mục tiêu | Lượt A: CPU bình thường | Lượt B: CPU chậm ×4 | Đạt |
|---|---|---|---|---|
| Đồng bộ 100 phiếu không ảnh | ≤ 10 s, Slow 3G | **207,8 s** (207,7 / 207,9) | 209,3 s | **Không đạt** (tech-debt N35) |
| Đồng bộ 50 ảnh đã nén | ≤ 3 phút, 3G 1,6 Mbps | **197,7 s** (197,8 / 197,5) | 199,2 s | **Không đạt**, vượt khoảng 10% (tech-debt N36) |
| Dung lượng mỗi máy | 2.000 phiếu + 500 ảnh, khoảng 250 MB | **khoảng 142 MB** (ngoại suy, cách tính dưới) | – | Đạt |

Cách đo:
- **Mạng giả lập** bằng `Network.emulateNetworkConditions` của Chrome trên tab của app. Vòng đồng bộ chạy trong tab (`client/src/sync/engine.ts`); request gửi phiếu và chunk ảnh không qua service worker nên đều bị giới hạn. Thông số theo preset của Chrome DevTools: **Slow 3G** = 400 kbit/s hai chiều, trễ 2 s mỗi request; **3G 1,6 Mbps** = 1,6 Mbit/s hai chiều, trễ 562,5 ms (độ trễ của preset "Fast 3G"). Preset "Fast 3G" của DevTools giới hạn chiều tải lên còn 675 kbit/s; bộ đo lấy 1,6 Mbit/s cả hai chiều theo đúng chữ ở §11.2, nên là trường hợp tốt.
- **100 phiếu:** `minh` lưu 100 phiếu khi offline (chỉ điền tên chủ hộ, như một ngày ở vùng không có sóng), rồi bật Slow 3G. Bấm giờ từ lúc bật mạng tới khi outbox trên máy rỗng (đọc IndexedDB mỗi 250 ms); sau đó kiểm server có đủ 100 phiếu, 100 id khác nhau.
- **50 ảnh:** 10 phiếu × 5 ảnh, lưu khi offline. Ảnh vẽ bằng canvas 2000×1500 có nhiễu hạt (mỗi ảnh khác nhau), app nén xuống 1600×1200 như ảnh chụp thật (§6.1): **trung bình 276 KB mỗi ảnh, tổng 13,8 MB**. Bật mạng 3G, bấm giờ tới khi outbox rỗng và mọi ảnh `done`; server có đủ 10 phiếu, 50 ảnh.
- **Dung lượng:** dự án riêng seed 2.000 phiếu của `minh`, đăng nhập và chờ CSDL trên máy đủ 2.000 phiếu, đọc `navigator.storage.estimate()` (Chrome có `usageDetails` tách IndexedDB và Cache Storage): **IndexedDB 2,4 MB, Cache Storage (app shell) 0,5 MB, tổng 2,9 MB**. Ảnh: ở ca 50 ảnh, IndexedDB tăng **13,9 MB, 278 KB mỗi ảnh**, đúng bằng cỡ file ảnh. Ngoại suy 2.000 phiếu + 500 ảnh: 2,4 + 500 × 0,278 + 0,5 ≈ **142 MB**, dưới 250 MB §11.2 tính (§11.2 tính ảnh 500 KB; ảnh thật nhiều chi tiết có thể tới 600 KB, khi đó khoảng 300 MB). Hạn mức Chrome trên máy đo 3,2 GB; điện thoại tầm trung còn trống vài GB thì hạn mức vẫn trên 1 GB.

Đọc số đo:
- **100 phiếu mất khoảng 2,08 s mỗi phiếu, đúng bằng một lần trễ 2 s.** `pushAll` (`engine.ts`) gửi từng phiếu một, mỗi phiếu một `PUT` và chờ trả lời mới gửi phiếu sau. Băng thông không phải chỗ nghẽn (một phiếu chỉ vài trăm byte). Ở độ trễ 2 s, muốn ≤ 10 s thì cả 100 phiếu phải đi trong khoảng 5 lượt trễ: chỉ gửi theo lô (nhiều phiếu một request, đổi API §7) mới làm được; gửi song song 6 phiếu một lúc (chỉ sửa client) còn khoảng 35 s. Không mất dữ liệu: tắt app giữa chừng thì lần mở sau gửi tiếp, op đã gửi không gửi trùng (idempotency).
- **50 ảnh: khoảng 69 s là truyền dữ liệu** (13,8 MB ở 200 KB/s), phần còn lại là trễ. Ảnh trên 256 KB tốn 4 request nối tiếp (hỏi chunk đã có, 2 chunk 256 KB, complete) cộng `PUT` phiếu, khoảng 210 request × 0,56 s ≈ 118 s. Ảnh mới chưa gửi lần nào thì bước hỏi chunk đã có là thừa: bỏ bước đó ở lượt đầu bớt khoảng 28 s, vừa đủ dưới 3 phút. Nếu chiều tải lên chỉ 675 kbit/s như preset DevTools thì riêng truyền đã khoảng 164 s, tổng khoảng 290 s.
- Server chạy cùng máy, không qua Internet; trên staging còn thêm TLS và đường truyền thật. Lần thử O2 trên staging (test-report §7.3, 10 phiếu, mỗi phiếu một ảnh, mạng không giới hạn) xong sau 7,5 s.

## Thử tay trên điện thoại (chưa làm)

§11.2 có bộ đo tự động cho "danh sách 2.000 phiếu cuộn mượt" (mục trên) nhưng chưa thử trên điện thoại thật. Cách thử trên staging:
1. Trên máy staging (không phải production): tạo dự án thử, chạy `npm run seed:perf -w server -- --project <id> --user <tên người tạo> --count 2000`, thêm tài khoản thử làm supervisor.
2. Trên điện thoại Android tầm trung, đăng nhập tài khoản đó, chờ đồng bộ xong.
3. Cuộn danh sách từ đầu tới cuối: ghi lại có giật không, và thời gian từ lúc mở app tới khi thấy danh sách.
4. Ghi kết quả vào bảng trên (cột mới "Điện thoại"), kèm tên máy.

## Chỗ có thể chậm khi dữ liệu lớn hơn

Chưa vượt chỉ tiêu nên chưa sửa; ghi lại để biết chỗ cần xem khi số phiếu tăng:
- **Danh sách** (`client/src/pages/HomePage.tsx`): từ N33 (2026-11-22) chỉ vẽ 200 phiếu mỗi nhóm, nhưng vẫn đọc toàn bộ `records` và tính nhãn cho mọi phiếu; đoạn dưới là ghi chép trước N33. Trước đó đọc toàn bộ `records` rồi vẽ hết, không ảo hoá. Thời gian tăng tuyến tính theo số phiếu. Giao diện mới (TV1-12 b2) vẽ mỗi dòng nặng hơn: ở 2.000 phiếu với CPU ×4 từ khoảng 0,5 s lên khoảng 0,9 s, một lần đo 991 ms, tức là máy yếu đã sát chỉ tiêu 1 s ngay ở 2.000 phiếu. TV2-18 (danh sách 2.000 phiếu) nên xem chỗ này trước: vẽ theo trang hoặc chỉ vẽ phần đang thấy.
- **Pull** (`pullAll` trong `client/src/sync/engine.ts`): mỗi phiếu đọc `records.get` và đếm `outbox` riêng trong transaction của trang. Server chưa trả `hasMore` (design §7), client dừng khi gặp trang rỗng nên tốn thêm một request.
