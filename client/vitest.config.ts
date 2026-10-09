import { defineConfig } from 'vitest/config';

// Unit test cho hàm thuần phía client (không React, không IndexedDB). E2E nằm ở e2e/, chạy bằng Playwright.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Chưa có test client nào; TV3-03 (nén ảnh) và TV1-05 (validate) sẽ thêm
    passWithNoTests: true,
  },
});
