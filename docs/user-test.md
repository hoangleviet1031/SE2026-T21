# Thử với người dùng thật

- **Phiên bản:** 0.1 (2026-11-23)
- **Người viết:** Dương (TV1, Product)
- **Trạng thái:** kịch bản đã có, **chưa thử với ai**. Kết quả ghi vào mục 7 sau mỗi buổi.
- **Liên quan:** giả định ở [design.md §1](design.md#1-mục-tiêu-và-phạm-vi), kịch bản ở §2, story ở [requirements.md](requirements.md), lỗi tìm được ghi vào [tech-debt.md](tech-debt.md) hoặc sửa bằng PR.

Test tự động và [test-report.md](test-report.md) cho biết app chạy **đúng spec** (verification). File này để biết spec có **đúng nhu cầu** không (validation): người chưa từng thấy app có tự làm được việc chính không, có hiểu nhãn trạng thái và màn hình xung đột không. design §1 "Giả định" ghi rõ nhóm chưa thử với ai ngoài nhóm.

## 1. Mục tiêu

Mỗi buổi trả lời bốn câu:

| # | Câu hỏi | Giả định ở design §1 |
|---|---|---|
| Q1 | Người mới có tự cài app, tạo tài khoản, vào được tổ chức không? | Điều tra viên chịu dùng PWA thay app native |
| Q2 | Khi mất mạng, họ có tin là phiếu đã lưu và biết lúc nào phiếu đã lên server không? | Nhãn "Chờ đồng bộ", "Đã đồng bộ" đủ rõ (§5.1) |
| Q3 | Khi hai nơi cùng sửa một phiếu, họ có hiểu chuyện gì xảy ra và tự chọn được không? | Màn hình xung đột giải thích đủ (ADR 0001 quy tắc 6, 7) |
| Q4 | Giám sát viên có tự soạn form và lấy được dữ liệu dạng bảng không? | K3 "Không phải nhập lại" |

Không đo ở đây: tốc độ (đã có [perf.md](perf.md)), lỗi đồng bộ khi mạng chập chờn (đã có E2E R1–R4).

## 2. Người thử

- **2–3 người ngoài nhóm**, chưa dùng app lần nào. Tốt nhất là người từng đi khảo sát hoặc nhập liệu bằng giấy, Excel hay Google Form; không có thì bạn bè không học công nghệ thông tin.
- Mỗi người dùng **điện thoại của chính họ** (ghi lại hãng, Android hay iPhone, trình duyệt). Không có ai dùng iPhone thì ghi rõ là chưa thử iPhone.
- Một buổi một người, khoảng 30–40 phút.
- Ghi vào bảng ở mục 7: mã người thử (P1, P2, …), từng làm khảo sát chưa, điện thoại. **Không ghi họ tên, số điện thoại.**

## 3. Chuẩn bị (người điều phối, trước buổi thử)

1. Staging đang chạy `main`, `/api/health` trả 200 ([deploy.md](deploy.md)).
2. Một tổ chức thử riêng, không dùng `demo-yte`, `demo-nongnghiep`; người điều phối là Owner. Thao tác này đổi dữ liệu staging, nên làm theo luồng thường (gửi yêu cầu mở tổ chức, admin duyệt ở trang quản trị) chứ không sửa CSDL tay.
3. Biểu mẫu "Khảo sát hộ gia đình" tạo từ mẫu có sẵn ở "Biểu mẫu mới" (design §4.1): có tên chủ hộ, số thành viên, ngày khảo sát (bắt buộc), nguồn nước, ảnh nhà, vị trí.
4. Một tài khoản giám sát viên của người điều phối, đăng nhập sẵn trên máy tính để tạo xung đột ở nhiệm vụ 6.
5. In hoặc mở sẵn phiếu ghi (mục 6) cho từng nhiệm vụ.
6. Dữ liệu nhập là dữ liệu bịa (người điều phối đưa sẵn một tờ: tên chủ hộ, số thành viên, ngày, …). Không nhập thông tin thật của ai.
7. Mỗi địa chỉ IP chỉ tạo được 5 tài khoản trong 60 phút (design §7, `POST /auth/register`). Người thử cùng mạng Wi-Fi với nhau thì đếm cả tài khoản người điều phối tạo trong giờ đó.

## 4. Cách chạy buổi thử

- Đầu buổi đọc cho người thử: "Mình thử app, không thử bạn. Chỗ nào bạn bối rối là lỗi của app. Bạn cứ vừa làm vừa nói mình đang nghĩ gì."
- Hỏi họ có đồng ý cho ghi chép không. Không quay mặt; nếu quay thì chỉ quay màn hình, xin phép trước.
- **Không chỉ cách làm.** Người thử hỏi thì đáp "Bạn nghĩ nên làm gì?". Bị kẹt quá 3 phút ở một nhiệm vụ thì gợi ý một lần và ghi "có gợi ý"; kẹt tiếp thì làm hộ, ghi "không xong" rồi sang nhiệm vụ sau.
- Đọc nhiệm vụ đúng như chữ ở mục 5. Câu nhiệm vụ cố ý **không** nói tên nút để không dẫn đường.
- Không đưa [user-guide.md](user-guide.md) trước buổi thử. Sau buổi có thể cho xem để hỏi tài liệu có giúp không.

## 5. Nhiệm vụ

Người thử là **điều tra viên** ở nhiệm vụ 1–6, là **giám sát viên** ở nhiệm vụ 7–8 (người điều phối đổi vai cho họ trong màn Thành viên trước nhiệm vụ 7).

| # | Đọc cho người thử | Xong khi | Story | Trả lời |
|---|---|---|---|---|
| 1 | "Mở địa chỉ này trên điện thoại, cài app lên màn hình chính và tạo cho mình một tài khoản. Xong thì đọc tên đăng nhập của bạn cho mình." | App mở từ icon trên màn hình chính, đã đăng nhập, người thử đọc được tên đăng nhập | US-10 | Q1 |
| 2 | (Người điều phối thêm người thử vào tổ chức thử bằng tên đăng nhập vừa đọc.) "Bạn đã được thêm vào tổ chức của mình. Hãy vào tổ chức đó và mở biểu mẫu khảo sát hộ gia đình." | Đang ở trang chủ của tổ chức thử, thấy biểu mẫu | US-09, US-11 | Q1 |
| 3 | "Giả sử bạn đang ở vùng không có sóng. Tắt mạng điện thoại (chế độ máy bay), rồi nhập hai phiếu theo tờ này, có chụp ảnh và lấy vị trí." | Hai phiếu ở danh sách, nhãn "Chờ đồng bộ" | US-01, US-03 | Q2 |
| 4 | "Vẫn chưa có mạng. Nhập thêm một phiếu nhưng chỉ kịp ghi số thành viên, chưa biết tên chủ hộ. Lưu lại để lúc sau bổ sung." Rồi: "Giờ bạn đã biết tên, hãy bổ sung cho phiếu đó." | Phiếu thiếu tên thành "Nháp", sau khi bổ sung thành "Chờ đồng bộ" | US-02 | Q2 |
| 5 | "Bạn đã về chỗ có sóng. Bật mạng lại và cho mình biết các phiếu đã gửi lên chưa." | Người thử chỉ ra được phiếu nào đã lên server (nhãn "Đã đồng bộ"), phiếu nào chưa | US-04 | Q2 |
| 6 | "Bạn quay lại một hộ đã khảo sát và thấy số thành viên ghi sai. Tắt mạng, sửa lại số đó cho phiếu của hộ này, rồi bật mạng. Nếu app hỏi gì thì bạn tự quyết." (Lúc người thử đã tắt mạng, người điều phối dùng tài khoản giám sát viên trên máy tính sửa **cùng trường** của **cùng phiếu** thành số khác, như ca C2 ở design §10.1.) | Mở được phiếu "Cần xử lý xung đột", chọn một giá trị và nói được vì sao chọn | US-05 | Q3 |
| 7 | "Bây giờ bạn là giám sát viên. Thêm vào biểu mẫu một câu hỏi mới: hộ có nuôi gia súc không, chọn Có hoặc Không." | Bản form mới lưu được, trường mới có ở phiếu mới | US-07 | Q4 |
| 8 | "Lấy toàn bộ phiếu của biểu mẫu này ra một file để mở bằng Excel." | Có file CSV, mở được, đủ phiếu | US-08 | Q4 |

Hết giờ thì bỏ nhiệm vụ 7, 8 trước (Q4 ít rủi ro hơn Q1–Q3).

## 6. Phiếu ghi (mỗi nhiệm vụ một dòng)

| Nhiệm vụ | Kết quả | Thời gian | Bấm sai / quay lại | Chỗ vướng (ghi nguyên lời người thử nếu được) | Mức |
|---|---|---|---|---|---|
| 1 | Tự xong / Có gợi ý / Không xong | phút | số lần | | Chặn / Khó chịu / Nhỏ |

- **Chặn:** không tự làm tiếp được, hoặc hiểu sai mà có thể mất dữ liệu (vd. tưởng phiếu đã gửi khi chưa gửi).
- **Khó chịu:** làm được nhưng phải thử nhiều lần hoặc nói rõ là khó hiểu.
- **Nhỏ:** chữ, vị trí nút, góp ý mà không ảnh hưởng việc làm.

Sau mỗi nhiệm vụ hỏi: "Từ 1 (rất khó) tới 7 (rất dễ), việc vừa rồi dễ hay khó?" và ghi số vào cột Kết quả.

Cuối buổi hỏi thêm (ghi nguyên lời):
1. Lúc tắt mạng, bạn có lo phiếu bị mất không? Vì sao?
2. Khi app hỏi chọn giá trị (nhiệm vụ 6), bạn hiểu là chuyện gì đã xảy ra?
3. Nếu đi khảo sát thật, bạn có dùng app này thay giấy hoặc Google Form không? Điều gì làm bạn ngại?
4. Có chữ nào trên app bạn không hiểu?

## 7. Kết quả

Chưa có buổi thử nào. Mỗi buổi thêm một mục con:

```
### P1 – <ngày>, <điện thoại, trình duyệt>, <từng làm khảo sát chưa>

(bảng phiếu ghi mục 6, câu trả lời cuối buổi)
```

## 8. Sau buổi thử

1. Gom các chỗ vướng giống nhau giữa các người thử; chỗ có từ hai người trở lên gặp là ưu tiên.
2. Mỗi chỗ "Chặn" hoặc "Khó chịu": sửa bằng PR (nếu nằm trong phạm vi MVP, design §1) hoặc ghi vào [tech-debt.md](tech-debt.md), kèm mã người thử và số nhiệm vụ. Đổi chữ hay bố cục thì sửa [ui.md](ui.md) cùng PR.
3. Cập nhật design §1 "Giả định": thay dòng "Chưa phỏng vấn hay thử với nhóm khảo sát thật" bằng số người đã thử và điều đã kiểm được hay chưa (theo Q1–Q4).
4. Thêm một dòng tóm tắt vào [test-report.md](test-report.md) §1.

## Lịch sử

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 0.1 | 2026-11-23 | Bản đầu: mục tiêu Q1–Q4, người thử, chuẩn bị, 8 nhiệm vụ theo story, phiếu ghi, cách dùng kết quả. Chưa thử với ai |
