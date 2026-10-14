import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startSyncLoop } from './sync/engine';
import { deleteLegacyDb } from './db/current';
import './styles.css';

// SW đăng ký trong UpdatePrompt (App.tsx), để hiện dải khi có bản mới
// CSDL `field-survey` của khung cũ không còn dùng (design §4.2). Không chặn khởi động vì
// không đụng tới CSDL account hay CSDL dự án; lỗi thì ghi lại, lần mở sau xoá tiếp.
deleteLegacyDb().catch((e) => console.warn('không xoá được CSDL cũ', e));
startSyncLoop();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
