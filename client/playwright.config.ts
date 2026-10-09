import { defineConfig, devices } from '@playwright/test';

// E2E chạy trên bản build (vite preview) để service worker hoạt động như production.
// Máy có sẵn Chromium khác phiên bản: đặt PW_CHROMIUM_PATH=/đường/dẫn/chromium.
export default defineConfig({
  testDir: 'e2e',
  // Các test dùng chung một server và cơ chế tiêm lỗi toàn cục, nên chạy tuần tự
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['Desktop Chrome'],
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: [
    {
      command: 'npm run start -w server',
      cwd: '..',
      url: 'http://localhost:3001/api/health',
      env: { DB_PATH: ':memory:', PORT: '3001', ENABLE_TEST_ROUTES: '1' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npx vite build && npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
