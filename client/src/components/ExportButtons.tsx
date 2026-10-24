import { useEffect, useRef, useState } from 'react';
import { downloadBlob } from '../download';
import { BusyNote } from './BusyNote';
import { Icon } from './Icon';
import { SERVER_ERROR_MSG, apiFailureText } from '../apiErrors';
import { ExportError, apiFailure, downloadExport, type ExportFormat } from '../sync/api';
import { useOnline } from '../useOnline';

// Nút [Xuất ▾] trong thẻ mỗi form ở trang chủ (design §4.6, ui.md màn hình 2), chỉ supervisor và owner thấy.
// Xuất cần mạng (CLAUDE.md bất biến 7: màn hình Xuất là ngoại lệ được gọi API).
// Nút mở/đóng hai lựa chọn thường, không dùng role="menu": Tab và trình đọc màn hình dùng được ngay mà
// không phải tự viết điều hướng bằng phím mũi tên.

const FORMATS: { format: ExportFormat; label: string }[] = [
  { format: 'csv', label: 'Xuất CSV' },
  { format: 'json', label: 'Xuất JSON' },
];

export function ExportButtons({
  projectId,
  formId,
  describedBy,
}: {
  projectId: string;
  formId: string;
  /** id phần tử tên form: trang có nhiều nút "Xuất", trình đọc màn hình đọc kèm tên để phân biệt */
  describedBy?: string;
}) {
  const online = useOnline();
  // Định dạng đang xuất; mỗi lần một file
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // Mất mạng khi đang mở thì nút khoá, hai lựa chọn cũng phải biến mất
  const shown = open && online && busy === null;

  // Mất mạng thì đóng hẳn: có mạng lại, hai lựa chọn không tự hiện khi người dùng chưa bấm
  useEffect(() => {
    if (!online) setOpen(false);
  }, [online]);

  // Bấm ra ngoài thì đóng
  useEffect(() => {
    if (!shown) return;
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [shown]);

  const run = async (format: ExportFormat) => {
    setOpen(false);
    setBusy(format);
    setError(null);
    try {
      downloadBlob(`${formId}.${format}`, await downloadExport(projectId, formId, format));
    } catch (e) {
      const failure = apiFailure(e);
      if (failure) setError(apiFailureText(failure, 'Không kết nối được máy chủ, thử lại sau'));
      else if (e instanceof ExportError) {
        // Mã màn hình không xử lý (vd. 404 khi form vừa bị xoá) báo câu chung, không hiện mã HTTP (design §8)
        setError(e.code === 'forbidden' ? 'Chỉ giám sát viên và Owner được xuất dữ liệu' : SERVER_ERROR_MSG);
      } else throw e;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="export"
      ref={wrapRef}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && shown) {
          setOpen(false);
          toggleRef.current?.focus();
        }
      }}
    >
      {/* Khung bọc riêng nút và hai lựa chọn: hai lựa chọn mở ngay dưới nút, không phụ thuộc chữ báo bên cạnh */}
      <span className="export-anchor">
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={shown}
          aria-describedby={describedBy}
          disabled={!online || busy !== null}
          aria-busy={busy !== null}
          onClick={() => setOpen(!open)}
        >
          Xuất
          <Icon name="down" className={shown ? 'up' : undefined} />
        </button>
        {shown && (
          <div className="export-menu">
            {FORMATS.map(({ format, label }) => (
              <button key={format} type="button" onClick={() => void run(format)}>
                {label}
              </button>
            ))}
          </div>
        )}
      </span>
      <BusyNote busy={busy !== null} text="Đang xuất…" />
      {!online && (
        <small className="export-note" data-testid="export-offline">
          Cần kết nối mạng để xuất
        </small>
      )}
      {error && (
        <small className="field-error" role="alert">
          ⚠ {error}
        </small>
      )}
    </div>
  );
}
