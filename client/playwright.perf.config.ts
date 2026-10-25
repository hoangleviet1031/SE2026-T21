import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Bộ đo hiệu năng (TV2-11, design §11.2, docs/perf.md): `npm run test:perf`. Cùng server và bản build
// với E2E thường, chỉ khác thư mục test. Đặt PERF_CPU_THROTTLE=4 để đo thêm lượt giả lập máy yếu
// (chỉ ghi số đo, không so ngưỡng).
export default defineConfig({
  ...base,
  testDir: 'e2e/perf',
  testIgnore: [],
  // Seed 5.000 phiếu rồi pull hết; lượt CPU throttle chậm hơn nhiều
  timeout: 300_000,
});
