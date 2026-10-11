# Quy trình vibe coding có giám sát

Dự án này dùng AI (Claude Code hoặc công cụ tương tự) để viết phần lớn code. Nguyên tắc duy nhất: **AI viết, người chịu trách nhiệm.** Ai mở PR phải giải thích được từng dòng trong diff; ai duyệt PR phải đọc code, không chỉ nhìn CI xanh.

Tài liệu liên quan: [CLAUDE.md](../CLAUDE.md) (luật cho AI), [plan/](plan/) (ticket), [design.md](design.md), [adr/](adr/).

## 1. Việc gì giao cho AI, việc gì người tự làm

| Loại việc | Ai làm | Ghi chú |
|---|---|---|
| Quyết định kiến trúc, sửa ADR, đổi ngữ nghĩa merge | **Người** | AI có thể phân tích phương án, người quyết và viết |
| Thiết kế schema CSDL, hợp đồng API mới | **Người** viết phác thảo, AI hoàn thiện | Phác thảo nằm trong mô tả PR hoặc ticket trước khi code |
| Middleware xác thực, phân quyền, cách ly dự án | AI viết, **người review từng dòng** | Vùng rủi ro cao nhất (ADR 0002) |
| Sync engine, outbox, idempotency | AI viết **sau khi người viết test** (hoặc duyệt test AI viết trước) | Test trước, code sau |
| UI, form, CSS, màn hình CRUD | AI | Người thử trên điện thoại thật |
| Test E2E, integration | AI viết, người kiểm tra assertion có đúng spec không | Test sai thì "xanh" vô nghĩa |
| Hạ tầng: staging HTTPS, CI secrets, branch protection | **Người** | AI chỉ gợi ý cấu hình |
| Tài liệu người dùng, báo cáo | AI viết nháp, người sửa | |

## 2. Quy trình cho một ticket

1. **Chọn ticket** trong `docs/plan/tvN-*.md`, kiểm tra phần "Phụ thuộc" đã xong. Tạo nhánh `feat/<mã-ticket>-<tên-ngắn>`, vd. `feat/tv2-03-project-routes`.
2. **Phiên mới, ngữ cảnh sạch.** Mỗi ticket một phiên AI (`/clear` giữa các ticket). Với Claude Code: chạy `/ticket TV2-03`. Lệnh này đọc ticket, spec và CLAUDE.md liên quan rồi đưa ra kế hoạch, chưa viết code.
3. **Duyệt kế hoạch.** Đọc danh sách file sẽ sửa và test sẽ viết. Gạch bớt những gì ngoài phạm vi. Trả lời câu hỏi AI nêu ra; câu nào là quyết định spec thì hỏi nhóm, đừng để AI tự chọn.
4. **Test trước** cho ticket có nhãn *Lõi*: yêu cầu AI viết test theo tiêu chí "Xong khi" trước, chạy cho thấy đỏ, rồi mới viết code.
5. **Làm từng bước nhỏ**, mỗi bước chạy `npm run typecheck` và test liên quan. Commit thường xuyên; commit nào cũng phải build được.
6. **Tự kiểm tra** bằng `/self-check` rồi tự đọc toàn bộ diff (`git diff main...`) theo checklist ở mục 4.
7. **Thử thật**: tính năng có UI thì thử trên điện thoại qua staging ít nhất một lần trước khi đóng ticket (định nghĩa "xong" trong team-plan).
8. **Mở PR** theo mẫu (`.github/pull_request_template.md`), điền phần "AI đã làm gì / tôi đã kiểm tra gì".
9. **Review**: người duyệt dùng checklist mục 4; PR chạm vùng lõi cần hai người duyệt.
10. **Đánh dấu ticket xong** trong `docs/plan/` và **ghi worklog** (một dòng trong `docs/worklog/<tên>.md`, theo [quy ước](worklog/README.md)), cùng PR.

## 3. Mẫu prompt

Dùng khi không có lệnh `/ticket` (công cụ khác Claude Code):

```text
Làm ticket <MÃ> trong docs/plan/<file>.md.
Đọc trước: CLAUDE.md, <thư mục>/CLAUDE.md, docs/design.md §<mục>, <ADR nếu có>.
Bước 1: chưa viết code. Liệt kê file sẽ sửa/tạo, test sẽ viết (theo "Xong khi"),
và những điểm spec chưa rõ. Dừng lại chờ tôi duyệt.
Ràng buộc: chỉ trong phạm vi ticket; không thêm thư viện; không sửa test có sẵn để nó qua;
không sửa docs/adr; chữ UI và comment bằng tiếng Việt.
```

Khi AI làm sai hướng, **đừng sửa vòng vòng trong cùng phiên quá 2–3 lần**: `/clear`, viết lại prompt rõ hơn (thêm ví dụ, trỏ đúng file), làm lại.

Prompt hỏi để hiểu code (nên dùng trước khi review):

```text
Giải thích diff của nhánh này so với main: luồng dữ liệu đi qua những hàm nào,
trường hợp lỗi nào được xử lý ở đâu, và chỗ nào có thể vi phạm bất biến trong CLAUDE.md.
Không sửa code.
```

## 4. Checklist review (người tự kiểm và người duyệt)

**Phạm vi**
- [ ] Diff chỉ chạm các file ticket liệt kê (hoặc có lý do ghi trong PR).
- [ ] Không có thư viện mới trong `package.json`/`package-lock.json` (hoặc đã được nhóm đồng ý).
- [ ] Không còn code chết, `console.log`, file thử nghiệm, TODO không có mã ticket.

**Đúng spec**
- [ ] Mỗi tiêu chí "Xong khi" của ticket có test tương ứng, và assertion kiểm tra đúng điều spec nói (không chỉ "không lỗi").
- [ ] Mã lỗi, nhãn UI, tên trường khớp design.md.
- [ ] Đổi API/kiểu/schema thì design.md đã cập nhật cùng PR.
- [ ] Trạng thái ticket trong `docs/plan/` và dòng worklog của người làm đã cập nhật cùng PR.

**Bất biến (CLAUDE.md)**
- [ ] Không có đường nào xoá dữ liệu chưa đồng bộ mà không hỏi người dùng.
- [ ] Ghi phiếu + op vẫn trong một transaction.
- [ ] Server: `projectId` lấy từ `req.ctx`; mọi SQL trên bảng dự án có `project_id = ?`; `updatedBy` từ token.
- [ ] Không dùng giờ thiết bị để quyết định thứ tự.

**Dấu hiệu AI "lách"** – gặp là yêu cầu sửa:
- [ ] Test bị xoá, `skip`, `only`, assertion bị nới, timeout bị tăng không rõ lý do.
- [ ] `any`, `as unknown as X` mới, `@ts-ignore`, `!` rải rác.
- [ ] `catch` nuốt lỗi hoặc trả giá trị mặc định che lỗi.
- [ ] `waitForTimeout`/`sleep` trong test.
- [ ] Mock thay cho hành vi thật ở chỗ spec yêu cầu test thật (vd. mock IndexedDB trong E2E).
- [ ] Logic trùng lặp với hàm đã có trong `shared/` (merge, backoff, validate).
- [ ] Comment mô tả lại code, hoặc comment khẳng định điều code không làm.

## 5. Thói quen của nhóm

- **Hiểu trước khi merge.** Buổi demo cuối tuần, mỗi người chọn một đoạn code AI viết trong tuần của mình và giải thích cho hai bạn còn lại mà không nhìn AI. Ai không giải thích được thì đoạn đó cần review lại. Mục đích: không ai bị "mù" phần của mình khi bảo vệ đồ án.
- **Commit message** dạng `feat(TV2-03): chuyển route records sang /api/projects/:projectId`. Commit có phần lớn do AI viết thì thêm dòng `Assisted-by: <tên công cụ>`.
- **Ghi lại prompt hay** vào mục "Prompt hữu ích" cuối file này (prompt, tình huống, kết quả) để cả nhóm dùng lại.
- **Khi AI đề xuất đổi thiết kế:** không làm trong PR đang dở. Mở thảo luận nhóm; nếu chốt thì sửa design/ADR trước, code sau.
- **Bí mật:** không dán token thật, file `data/*.db`, dữ liệu khảo sát thật vào prompt.

## 6. Prompt hữu ích

| Tình huống | Prompt | Ghi chú |
|---|---|---|
| (thêm dần) | | |
