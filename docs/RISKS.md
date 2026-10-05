# RISKS — Rủi ro kỹ thuật và phương án giảm thiểu

> Rà soát mỗi Thứ Sáu. Cột "Dấu hiệu" = khi nào coi rủi ro đã xảy ra và kích hoạt phương án dự phòng.
> Xác suất / Tác động: C (cao), TB (trung bình), T (thấp). ID rủi ro dạng `R-xx` — khác với test sync retry `R1–R8` trong [TESTING.md](TESTING.md).

## 1. Risk register

| ID | Rủi ro | XS | TĐ | Owner | Dấu hiệu | Giảm thiểu | Dự phòng |
|---|---|---|---|---|---|---|---|
| R-01 | **Sync engine phức tạp hơn dự tính**, trễ dây chuyền sang conflict UI | C | C | B | M2 chưa đạt cuối Tuần 4 | Logic quyết định là hàm thuần trong `shared`; merge làm sớm từ Tuần 2; chốt [SYNC.md](SYNC.md) cuối Tuần 3; B không nhận UI/hạ tầng ([PLAN §7](PLAN.md#7-phân-công-và-cân-bằng-khối-lượng)); C pair khi B vượt giờ | Cắt theo §3; dời phần polish Tuần 7 |
| R-02 | **E2E offline/SW không ổn định** trên CI (flaky) | C | C | C | Test cùng commit lúc xanh lúc đỏ | Spike Tuần 1; test trên prod build; helper chờ SW ready & trạng thái; không sleep; `retries: 0` | Chạy tuần tự (`workers: 1`); ghi lại seed; endpoint fault dự phòng |
| R-03 | **Giới hạn iOS Safari**: storage bị xoá khi không dùng lâu, không Background Sync, camera/Blob khác biệt | TB | TB | B | E1–E3 hỏng trên iOS thật | `storage.persist()`; khuyến khích cài PWA; sync khi mở app ([ADR-003](ADR/sync-trigger-in-app.md)); test WebKit trong CI | Demo chính trên Android; ghi hạn chế iOS trong README |
| R-04 | `context.route` **không chặn được request khi SW hoạt động** | TB | TB | C | Spike Tuần 1 thất bại mục (2) | Kiểm tra ngay Tuần 1 | Endpoint `POST /api/__test__/faults` ([API §10](API.md#10-test-only-chỉ-khi-node_envtest)) |
| R-05 | **Ảnh làm đầy quota** IndexedDB / upload chậm | TB | TB | B | `QuotaExceededError`; sync > NFR1 | Nén ảnh, giới hạn số/cỡ, bỏ Blob sau upload, hiển thị dung lượng ([ADR-004](ADR/attachments.md)) | Giảm `IMAGE_MAX_EDGE` xuống 1280 px |
| R-06 | **Scope creep** (builder, admin, báo cáo) | TB | C | cả nhóm | Issue không có FR trong SPEC | Out-of-scope rõ ở [PROJECT §5](PROJECT.md#5-ngoài-phạm-vi-out-of-scope); nhãn `after-mvp` | Từ chối tại stand-up |
| R-07 | **Conflict UI không "giải thích được"** | TB | C | A | Usability test < 3/3 đạt | Wireframe S5 duyệt Tuần 1; câu giải thích sinh từ revisions ([SYNC §9.4](SYNC.md#94-lời-giải-thích-sharedexplain)); usability test Tuần 7 | Thêm dòng thời gian lịch sử phiếu trong S5 |
| R-08 | **Token hết hạn** khi offline dài ngày | T | TB | B | Người dùng không sync được sau 7 ngày | Hàng đợi vẫn nhận dữ liệu; 401 → đăng nhập lại (R5) | — |
| R-09 | **Thiếu người** (ốm, thi, việc riêng) | TB | C | cả nhóm | Vắng > 3 ngày | Review chéo, tài liệu là source of truth, người dự phòng ([TEAM §1](TEAM.md#1-vai-trò)) | Cắt theo §3 |
| R-10 | **Deploy HTTPS trục trặc** sát demo | TB | C | C | Staging không chạy sau Tuần 5 | Staging từ Tuần 5 (trước M3); `pg_dump` trước demo | Video demo quay sẵn; chạy local bằng Docker Compose + Caddy (HTTPS nội bộ) |
| R-11 | **Hợp đồng API thay đổi liên tục** làm vỡ song song | TB | TB | C | > 2 PR đổi contract/tuần sau Tuần 3 | Contract bằng Zod dùng chung; đổi cần A+B+C duyệt; MSW mock cho A | Đóng băng contract từ Tuần 5 trừ sửa lỗi |
| R-12 | **Migration schema Dexie** làm mất dữ liệu người dùng khi cập nhật app | T | C | B | Lỗi mở DB sau update | Luôn tăng `db.version` + migration; E6 | Hướng dẫn "đồng bộ trước khi cập nhật" trong demo |
| R-13 | **Tuần tự hoá ghi** (advisory lock) gây chậm | T | T | C | Ghi > 200 ms ở tải demo | Quy mô MVP ≤ 10 user; đo ở Tuần 8 | Chấp nhận, ghi trong ADR-001 |

## 2. Rủi ro lớn nhất

1. **R-01 sync engine** — là phần khó và là đường găng của Tuần 4 → 6. Theo dõi hằng tuần bằng test ID: cuối Tuần 3 phải có unit coalescing và merge C1–C7; cuối Tuần 4 unit R1–R4 + E3 xanh.
2. **R-02 E2E flaky** — evidence bắt buộc phụ thuộc vào nó. Spike Tuần 1 là điều kiện qua M0.
3. **R-07 conflict UI** — điểm khác biệt của đề tài ("giải thích được"). Không để tới Tuần 7 mới thử với người dùng.

## 3. Thứ tự cắt scope khi trễ

Cắt từ trên xuống; **không** cắt 6 tính năng bắt buộc và 4 loại evidence.

1. WebKit trong CI (giữ kiểm tay iOS).
2. E6 (SW update) tự động → kiểm tay.
3. R8 (hai tab) tự động → giữ Web Lock, kiểm tay.
4. Lọc theo surveyor và phân trang ở S8 (FR52) → danh sách đơn giản.
5. Thumbnail riêng → dùng lại ảnh nén.
6. JSON export (FR50) → chỉ CSV.
7. Hiển thị dung lượng (FR22 phần estimate).
