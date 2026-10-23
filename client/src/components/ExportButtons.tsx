import { useState } from 'react';
import { downloadBlob } from '../download';
import { BusyNote } from './BusyNote';
import { SERVER_ERROR_MSG, apiFailureText } from '../apiErrors';
import { ExportError, apiFailure, downloadExport, type ExportFormat } from '../sync/api';
import { useOnline } from '../useOnline';

// Nút Xuất ở trang chủ cạnh mỗi form (design §4.6, ui.md màn hình 2), chỉ supervisor và owner thấy.
// Xuất cần mạng (CLAUDE.md bất biến 7: màn hình Xuất là ngoại lệ được gọi API).

const FORMATS: { format: ExportFormat; label: string }[] = [
  { format: 'csv', label: 'Xuất CSV' },
  { format: 'json', label: 'Xuất JSON' },
];

export function ExportButtons({ projectId, formId }: { projectId: string; formId: string }) {
  const online = useOnline();
  // Định dạng đang xuất; nút còn lại cũng khoá (mỗi lần một file)
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (format: ExportFormat) => {
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
    <span className="export-buttons">
      {FORMATS.map(({ format, label }) => (
        <button key={format} type="button" disabled={!online || busy !== null} aria-busy={busy === format} onClick={() => void run(format)}>
          {label}
        </button>
      ))}
      <BusyNote busy={busy !== null} text="Đang xuất…" />
      {!online && <small data-testid="export-offline">Cần kết nối mạng để xuất</small>}
      {error && (
        <small className="field-error" role="alert">
          ⚠ {error}
        </small>
      )}
    </span>
  );
}
