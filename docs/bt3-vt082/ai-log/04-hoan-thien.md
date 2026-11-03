# Phần hoàn thiện: đối chiếu báo cáo với log, bổ sung evidence

Thực hiện ở một phiên Claude Code khác với A1–A4, do Đỗ Tùng Dương yêu cầu. Mọi chỉnh sửa nội dung báo cáo PDF được gửi bảng trước và sau để duyệt rồi mới sửa. Khớp với A5–A9 trong Phụ lục A của báo cáo.

## Yêu cầu giao cho AI

Bảng dưới tóm tắt yêu cầu theo từng bước, không chép nguyên văn hội thoại. Prompt chi tiết của bước A6, A7 ở cuối file.

| Mục | Yêu cầu giao cho AI | Kiểm soát của sinh viên |
|---|---|---|
| A5 | Đối chiếu bài làm với đề và khung chấm, kiểm tra lại số liệu trong báo cáo so với log, chỉ ra phần còn thiếu | Đọc danh sách lỗi; yêu cầu lập kế hoạch hoàn thiện theo từng bước và duyệt kế hoạch trước khi thực hiện |
| A6 | Bổ sung evidence còn thiếu, đo lại 500 KB theo thứ tự ABBA với quy tắc kết luận chốt trước | Cho phép bắt đầu đo; yêu cầu đo lại khi lượt đầu không đạt điều kiện máy rảnh |
| A7 | Sửa báo cáo theo log, nêu rõ trước, sau và file nguồn của từng chỗ | Duyệt bảng thay đổi trước khi sửa |
| A8 | Soạn lại reflection theo số liệu mới, cập nhật AI Usage Log, viết trang ôn vấn đáp | Duyệt nội dung trước khi đưa vào báo cáo; yêu cầu hỏi ý kiến trước mỗi lần push |
| A9 | Kiểm lại các quyết định xoá, sửa test; đánh giá bằng mutation | Chọn thêm test thay vì chỉ ghi nhận rủi ro; duyệt thay đổi trong báo cáo |

## Quy tắc đặt ra trong kế hoạch được duyệt

- Không sửa, xoá hay đo đè evidence cũ. Số mới vào file mới.
- Không amend, không rebase, không force-push. Không push khi chưa được đồng ý.
- 500 KB: "đạt ổn định" chỉ khi mọi lần có p95 ≤ 3.500 ms và 0 lỗi; trung vị đạt nhưng có lần vượt là "trung vị đạt, không ổn định"; trung vị vượt là "không đạt". Quy tắc chốt trước khi đo.
- Không chạy lại phép đo để lấy kết quả đẹp hơn. Lượt đo lại 32b có vì lượt 32 không đạt điều kiện máy rảnh, quyết định có sau khi đã thấy số; cả hai lượt được giữ.

## Output được dùng

| Việc                           | Output                                                                                                                                                                              | Evidence                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Đối chiếu báo cáo với log | Danh sách lỗi: nhánh chưa push, số điểm gãy lấy nhầm vòng tốt nhất, 250 KB và 2 MB viết đẹp hơn log, số 126,6 và 88 không có log, số chỗ gọi `createApp` | Sửa trong báo cáo, `PLAN-REVIEW.md`           |
| Bổ sung evidence               | Coverage trước TC15, thứ tự shuffle, hàm thiếu coverage, đo lại `putCost`, 500 KB ABBA hai lượt, `TRACEABILITY.md`                                                    | `evidence/28`–`32b`, `9b4c6c9`, `a8e763c` |
| Kiểm lại D1–S3               | Phát hiện xoá D2 để lộ khoảng trống; M11–M13 sống sót; thêm 3 test                                                                                                      | `evidence/34`–`38`, `be586c9`, `62c81b9`  |
| Soạn báo cáo                 | 14 chỗ sửa theo log, 10 chỗ theo kết quả mới, reflection theo số mới, dòng A5–A9                                                                                          | `report-src/report.html`, ngoài repo            |

Reflection trong báo cáo do AI soạn dựa trên log, sinh viên duyệt.

## Prompt chi tiết

Nguyên văn từ kế hoạch đã duyệt. Khi thực hiện có điều chỉnh: lượt đo lại 500 KB (`32b`) được thêm sau khi lượt đầu không đạt điều kiện máy rảnh; bảng sửa báo cáo có 14 chỗ vì bổ sung so với Prompt 2 sau khi kiểm thêm log; câu "nhánh mutation đã đẩy lên GitHub" ở mục 11 của Prompt 2 chưa áp dụng ở bước này.

### Prompt 1: bổ sung evidence (A6)

```text
Repo: D:\School\BT3_VT-082\repo, nhánh bt3/vt082-notify-new-record. Đây là bài tập cá nhân, không merge, không push trong lượt này.

Mục tiêu: bổ sung evidence còn thiếu. Không sửa src, không sửa test, không sửa hay ghi đè bất kỳ file evidence nào đã có; số mới vào file mới. Dùng git worktree tạm bên trong repo cho commit cũ (node_modules tìm được theo thư mục cha), xong thì xoá worktree. Không đổi nhánh của thư mục chính.

Làm lần lượt:

1. Coverage trước khi có test biên: tại commit 6a8e22f chạy
   npx vitest run test/notifications.test.ts test/notificationsRecords.test.ts --coverage --coverage.include=src/notifications.ts --coverage.reporter=text
   Lưu vào docs/bt3-vt082/evidence/28-coverage-before-tc15.txt, dòng đầu ghi commit và lệnh.
   Nếu thiếu @vitest/coverage-v8 thì cài bằng npm i --no-save @vitest/coverage-v8@5.0.3, không đổi package.json.

2. Chứng minh shuffle thật sự đổi thứ tự: chạy test thông báo với --sequence.shuffle.tests --sequence.shuffle.files và seed 1, 2, reporter verbose. Lưu 10 test đầu của mỗi seed vào evidence/29-flaky-order-proof.txt, kèm kết luận hai thứ tự có khác nhau hay không.

3. Xác định hàm nào trong notifications.ts làm coverage function còn 93,33%, bằng report chi tiết (json hoặc html) thay vì đoán. Ghi tên hàm, số dòng và lý do vào evidence/30-coverage-function-gap.txt.

4. Đo lại putCost: chạy server/test/perf/putCost.ts đúng theo README, lưu vào evidence/31-put-cost-recheck.jsonl. Tìm trong docs/bt3-vt082 và lịch sử git xem số 126,6 ms có nguồn không, rồi báo lại.

5. Đo lại 500 KB, quy tắc chốt TRƯỚC khi đo:
   - Máy phải đang rảnh; báo tôi trước khi bắt đầu đo. Tạo worktree baseline tại ef92b35 theo README.
   - Size s500k, 3 vòng mỗi lần, hai chế độ baseline và good, thứ tự ABBA ABBA ABBA, tổng 6 lần mỗi chế độ, giống cách đã làm ở evidence/15. Nếu harness không có sẵn cách chạy ABBA thì gọi harness nhiều lần với --modes khác nhau, không sửa harness; lệnh đã chạy phải ghi lại.
   - Lưu vào evidence/32-load-abba-500k.jsonl và một dòng đầu vào evidence/32-load-abba-500k.cmd.txt.
   - Chỉ được kết luận "đạt ổn định" nếu mọi lần đo của cả hai chế độ có p95 ≤ 3.500 ms và 0 lỗi. Nếu trung vị đạt nhưng có lần vượt thì kết luận "trung vị đạt, không ổn định". Trung vị vượt thì "không đạt".
   - Không chạy lại để lấy kết quả đẹp hơn. Có lần lỗi thì giữ nguyên và báo.
   - Nếu cần đo thêm chế độ failing, hanging thì hỏi tôi trước.

6. Tạo docs/bt3-vt082/TRACEABILITY.md: bảng TC01..TC20 → tên test đúng nguyên văn lấy từ `npx vitest list` → file → AC/Risk → mutation liên quan. TC không có test tương ứng thì ghi rõ, không ghép bừa. Đặc biệt kiểm TC05 ghi "JSON hỏng" có thật sự được test không: đọc code test, nếu không có thì báo tôi chứ đừng tự thêm.

7. Sửa docs/bt3-vt082/PLAN-REVIEW.md: số chỗ gọi createApp đúng theo `git grep -n "createApp(" ef92b35 -- server/test`. Thêm link TRACEABILITY.md và các evidence mới vào bảng tài liệu của README.md trong docs/bt3-vt082.

8. Chạy npx tsc -p . và toàn bộ test server để chắc chưa làm hỏng gì. Xem git diff, chỉ được có file trong docs/bt3-vt082.

Commit một dòng tiếng Việt, tiền tố docs(vt082):, kèm Co-Authored-By như các commit trước. Không push.

Báo cáo: bảng p95 từng lần của 500 KB (min, trung vị, max theo chế độ), kết luận theo quy tắc ở mục 5, kết quả mục 3, 4, 6, và mọi chỗ không làm được. Không làm đẹp số.
```

### Prompt 2: sửa báo cáo theo log (A7)

```text
Sửa D:\School\BT3_VT-082\report-src\report.html theo log gốc trong D:\School\BT3_VT-082\repo\docs\bt3-vt082\evidence. Chưa xuất PDF. Không sửa reflection (div id="reflection"), không sửa khai báo mức độ dùng AI ở Phụ lục A, không sửa repo. Mọi số phải đọc lại từ file log, không chép từ prompt này mà không kiểm.

1. §6.3 mục "Điểm gãy": thay bằng số p95Ms thật của 13-load-breakpoint.jsonl:
   kênh tốt 500 KB 2.609, 750 KB 7.725, 1 MB 8.174; baseline 6.542, 7.542, 8.697 (ms).
   Nói rõ đây là lần đo nhanh, mỗi cấu hình một lần. Thêm kết quả đo lại 500 KB ABBA từ 32-load-abba-500k.jsonl và kết luận đúng quy tắc: "đạt ổn định" chỉ khi mọi lần ≤ 3.500 ms; trung vị đạt nhưng có lần vượt là "trung vị đạt, không ổn định"; trung vị vượt là "không đạt". Nói rõ ngưỡng gãy theo log: không dùng số roundP95 tốt nhất.

2. Bảng §6.3, dòng 250 KB, cột "So với 3.500 ms": đổi thành "Trung vị đạt, không ổn định: 6/24 lần đo có p95 vượt 3,5 s, gồm cả baseline". Tự đếm lại từ 12-load-final.jsonl, 15, 16: chỉ tính dòng size medium.

3. Khung "Kết luận" đầu trang 1 và mọi chỗ nói về 2 MB: dùng "24/24 lần đo không đạt, p95 từ 11,6 đến 25,5 s, kể cả baseline" (kiểm lại từ 12 và 15). Mục tiêu đạt ở đâu viết theo kết quả mục 1, không được ghi "đạt tới 500 KB" nếu log không cho phép. Ghi rõ phiếu thường (361 B) đạt, dư gấp khoảng 10 lần.

4. Bảng risk coverage §6.1 dòng N1: cập nhật cho khớp các kết luận trên. Bảng traceability §7 dòng N1 cũng vậy.

5. Nguyên nhân §6.3: bỏ số 126,6 ms nếu không có log; dùng số từ 14-put-cost.jsonl và 31-put-cost-recheck.jsonl, ghi rõ nguồn.

6. §7, bullet thứ ba: viết lại ý sau. Plan ước lượng 41 ms cho parse/stringify và tự ghi là chưa tính SQLite, tức cho rằng JSON là phần tốn đáng kể. Đo thật ở 2 MB: phần ngoài transaction khoảng 14 ms, transaction 54,5 ms, chiếm 79%. Điểm không đáng tin là AI đoán sai nút thắt, không phải đoán thấp. Giữ ý "harness đo sai".

7. §2 dòng R2: sửa số chỗ gọi createApp cho khớp PLAN-REVIEW.md.

8. §6.1: thêm một câu giải thích hàm nào làm coverage function còn 93%, theo evidence/30. Thêm trỏ tới evidence/28 ở câu "100% mà M2, M3 vẫn sống".

9. §6.2: thêm trỏ tới evidence/29 ở câu "đã xác nhận thứ tự có đổi".

10. §7 câu dẫn bảng traceability: trỏ tới docs/bt3-vt082/TRACEABILITY.md cho mức từng test.

11. §5 câu về git branch --contains: thêm "nhánh mutation/vt082-boundary-gte đã đẩy lên GitHub, ghi rõ không merge".

12. Tìm toàn file các số còn lệch với log: dò từng số ms, số lần, số test trong §4, §5, §6, §7 so với evidence. Liệt kê chỗ đã sửa và chỗ chưa kiểm được.

Sau khi xong, giữ nội dung chính trong 8 trang. Báo cáo dạng bảng: vị trí, trước, sau, file log làm nguồn.
```
