import { defineConfig } from 'vitest/config';

// Unit test cho hàm thuần phía client (không React, không IndexedDB). E2E nằm ở e2e/, chạy bằng Playwright.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Giữ để workspace không có test vẫn xanh (vd. khi tách test ra file khác)
    passWithNoTests: true,
  },
});
