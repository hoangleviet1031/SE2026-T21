import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { missingFeatures } from './browserSupport';
import { UnsupportedBrowser } from './components/UnsupportedBrowser';
import { startSyncLoop } from './sync/engine';
import { deleteLegacyDb } from './db/current';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
const missing = missingFeatures(window);

if (missing.length > 0) {
  // Không chạy sync, không đụng IndexedDB, không đăng ký SW: thiếu API thì chạy nửa chừng còn tệ hơn
  root.render(<UnsupportedBrowser missing={missing} />);
} else {
  // SW đăng ký trong UpdatePrompt (App.tsx), để hiện dải khi có bản mới
  // CSDL `field-survey` của khung cũ không còn dùng (design §4.2). Không chặn khởi động vì
  // không đụng tới CSDL account hay CSDL dự án; lỗi thì ghi lại, lần mở sau xoá tiếp.
  deleteLegacyDb().catch((e) => console.warn('không xoá được CSDL cũ', e));
  startSyncLoop();

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
