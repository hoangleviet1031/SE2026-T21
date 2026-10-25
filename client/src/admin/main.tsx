import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './AdminApp';
import '../styles.css';
import './admin.css';

// Trang quản trị: không đăng ký service worker, không IndexedDB, không sync engine (design §4.9).
// Không import gì từ src/db, src/sync (trừ kiểu) hay virtual:pwa-register.
// index.html luôn có #root, giống src/main.tsx
const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
