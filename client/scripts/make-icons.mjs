// Sinh icon PNG từ public/icon.svg bằng Chromium của Playwright (không cần thêm thư viện ảnh).
// Chạy lại khi đổi icon: `node client/scripts/make-icons.mjs`, rồi commit các file PNG.
// Xem docs/design.md §4.3.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const pub = fileURLToPath(new URL('../public/', import.meta.url));
// Bỏ bo góc: iOS và launcher Android tự cắt góc, còn góc trong suốt thì iOS tô thành màu đen
const svg = (await readFile(pub + 'icon.svg', 'utf8')).replace(/\s*rx="\d+"/, '');

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
try {
  for (const [name, size] of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.screenshot({ path: pub + name });
    await page.close();
    console.log(`đã ghi ${name} (${size}×${size})`);
  }
} finally {
  await browser.close();
}
