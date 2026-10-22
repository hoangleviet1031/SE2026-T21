import { useState } from 'react';
import { downloadBlob } from '../download';
import { apiFailureText } from '../apiErrors';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (format: ExportFormat) => {
    setBusy(true);
    setError(null);
    try {
      downloadBlob(`${formId}.${format}`, await downloadExport(projectId, formId, format));
    } catch (e) {
      const failure = apiFailure(e);
      if (failure) setError(apiFailureText(failure, 'Không kết nối được máy chủ, thử lại sau'));
      else if (e instanceof ExportError) {
        setError(e.code === 'forbidden' ? 'Chỉ giám sát viên và Owner được xuất dữ liệu' : `Xuất thất bại (mã ${e.status})`);
      } else throw e;
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="export-buttons">
      {FORMATS.map(({ format, label }) => (
        <button key={format} type="button" disabled={!online || busy} onClick={() => void run(format)}>
          {label}
        </button>
      ))}
      {!online && <small data-testid="export-offline">Cần kết nối mạng để xuất</small>}
      {error && (
        <small className="field-error" role="alert">
          ⚠ {error}
        </small>
      )}
    </span>
  );
}
