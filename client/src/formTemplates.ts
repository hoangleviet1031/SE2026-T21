import type { FieldDef } from '@field-survey/shared';

// Mẫu form có sẵn ở "Biểu mẫu mới" (design §4.1 "Mẫu có sẵn", ui.md màn hình 5). Nội dung Dương chốt
// 2026-11-13. Đóng gói trong app nên offline vẫn dùng được; chỉ là điểm bắt đầu, không gửi lên server.
// Mã trường đúng bằng mã gợi ý từ nhãn để đổi nhãn thì mã đi theo như trường thêm tay.

export interface FormTemplate {
  title: string;
  fields: FieldDef[];
}

export const FORM_TEMPLATES: FormTemplate[] = [
  {
    title: 'Khảo sát hộ gia đình',
    fields: [
      { id: 'tenChuHo', type: 'text', label: 'Tên chủ hộ', required: true },
      { id: 'diaChi', type: 'text', label: 'Địa chỉ' },
      { id: 'soThanhVien', type: 'number', label: 'Số thành viên', required: true },
      {
        id: 'nguonNuocChinh',
        type: 'select',
        label: 'Nguồn nước chính',
        required: true,
        options: ['Nước máy', 'Giếng khoan', 'Giếng đào', 'Nước mưa', 'Sông, suối', 'Khác'],
      },
      { id: 'nhaVeSinh', type: 'select', label: 'Nhà vệ sinh', options: ['Tự hoại', 'Bán tự hoại', 'Loại khác', 'Không có'] },
      {
        id: 'taiSan',
        type: 'multiselect',
        label: 'Tài sản',
        options: ['Xe máy', 'Ô tô', 'Tivi', 'Tủ lạnh', 'Máy giặt', 'Điện thoại thông minh'],
      },
      { id: 'ngayKhaoSat', type: 'date', label: 'Ngày khảo sát', required: true },
      { id: 'anhNha', type: 'photo', label: 'Ảnh nhà' },
      { id: 'viTri', type: 'gps', label: 'Vị trí' },
    ],
  },
  {
    title: 'Khảo sát y tế hộ gia đình',
    fields: [
      { id: 'tenChuHo', type: 'text', label: 'Tên chủ hộ', required: true },
      { id: 'soThanhVien', type: 'number', label: 'Số thành viên', required: true },
      { id: 'soTreDuoi5Tuoi', type: 'number', label: 'Số trẻ dưới 5 tuổi' },
      { id: 'soNguoiTu60Tuoi', type: 'number', label: 'Số người từ 60 tuổi' },
      { id: 'theBhyt', type: 'select', label: 'Thẻ BHYT', options: ['Cả hộ có', 'Một số người có', 'Không ai có'] },
      {
        id: 'benhManTinhTrongHo',
        type: 'multiselect',
        label: 'Bệnh mãn tính trong hộ',
        options: ['Tăng huyết áp', 'Đái tháo đường', 'Bệnh tim', 'Bệnh phổi mạn tính', 'Khác'],
      },
      {
        id: 'tiemChungCuaTre',
        type: 'select',
        label: 'Tiêm chủng của trẻ',
        options: ['Đủ mũi', 'Chưa đủ mũi', 'Không rõ', 'Không có trẻ nhỏ'],
      },
      { id: 'ngayKhaoSat', type: 'date', label: 'Ngày khảo sát', required: true },
      { id: 'viTri', type: 'gps', label: 'Vị trí' },
    ],
  },
  {
    title: 'Khảo sát cây trồng',
    fields: [
      { id: 'tenChuHo', type: 'text', label: 'Tên chủ hộ', required: true },
      { id: 'soThua', type: 'text', label: 'Số thửa' },
      { id: 'dienTichM', type: 'number', label: 'Diện tích (m²)', required: true },
      {
        id: 'cayTrongChinh',
        type: 'select',
        label: 'Cây trồng chính',
        required: true,
        options: ['Lúa', 'Ngô', 'Rau màu', 'Cây ăn quả', 'Cà phê', 'Khác'],
      },
      { id: 'tinhTrangCay', type: 'select', label: 'Tình trạng cây', options: ['Tốt', 'Trung bình', 'Kém'] },
      {
        id: 'sauBenh',
        type: 'multiselect',
        label: 'Sâu bệnh',
        options: ['Rầy nâu', 'Đạo ôn', 'Sâu cuốn lá', 'Chuột', 'Khác'],
      },
      { id: 'ngayKhaoSat', type: 'date', label: 'Ngày khảo sát', required: true },
      { id: 'anhThuaRuong', type: 'photo', label: 'Ảnh thửa ruộng' },
      { id: 'viTri', type: 'gps', label: 'Vị trí' },
    ],
  },
];
