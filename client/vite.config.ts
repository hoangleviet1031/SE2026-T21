import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { RUNTIME_CACHES } from './src/swCaches';

const apiProxy = { '/api': 'http://localhost:3001' };

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Không tự thay bản mới: UpdatePrompt hỏi người dùng rồi mới tải lại (design §4.3)
      registerType: 'prompt',
      // Bật SW khi chạy `npm run dev` để thử offline mà không cần build
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'Khảo sát thực địa',
        short_name: 'Khảo sát',
        lang: 'vi',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        // PNG cho Android cũ và để Chrome coi là cài được; icon nền vuông kín nên dùng được làm maskable
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell được precache; dữ liệu khảo sát nằm trong IndexedDB, không cache qua SW
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Trang quản trị không chạy offline nên không precache HTML và entry của nó (design §4.3, §4.9).
        // Chunk dùng chung với app khảo sát (React…) vẫn precache vì app khảo sát cần.
        globIgnores: ['admin/**', 'assets/admin-*'],
        navigateFallback: '/index.html',
        // Lần cài đầu SW nắm luôn trang đang mở, để rời mạng ngay vẫn chạy được (O1). Không ảnh hưởng
        // bản cập nhật: SW mới vẫn chờ tới khi người dùng bấm Tải lại (không có skipWaiting)
        clientsClaim: true,
        // Trang quản trị luôn lấy bản mới từ server, không chạy offline (design §4.3, §4.9). Khớp cả `/admin`
        // không có `/`: nếu không SW trả index.html của PWA trước khi request tới Caddy (redir sang `/admin/`)
        navigateFallbackDenylist: [/^\/api\//, /^\/admin(\/|$)/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /^\/api\/projects\/[^/]+\/forms$/.test(url.pathname),
            handler: 'NetworkFirst',
            options: { cacheName: RUNTIME_CACHES.forms, networkTimeoutSeconds: 3 },
          },
          {
            urlPattern: ({ url }) => url.pathname === '/api/me',
            handler: 'NetworkFirst',
            options: { cacheName: RUNTIME_CACHES.me, networkTimeoutSeconds: 3 },
          },
        ],
      },
    }),
    {
      // vite-plugin-pwa chèn <link rel="manifest"> vào mọi trang; trang quản trị không được có manifest
      // để trình duyệt không mời cài nó như app (design §4.9). Plugin PWA cũng là `post`, nên phải đứng
      // sau nó trong mảng mới chạy sau.
      name: 'admin-without-manifest',
      enforce: 'post',
      transformIndexHtml: {
        order: 'post',
        handler: (html, ctx) => (ctx.path.startsWith('/admin/') ? html.replace(/\s*<link rel="manifest"[^>]*>/g, '') : html),
      },
    },
  ],
  build: {
    // Hai trang: app khảo sát (PWA) và trang quản trị `/admin/` (design §4.9). Tên khoá `admin` thành
    // tiền tố file `assets/admin-*`, để precache ở trên loại được
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('index.html', import.meta.url)),
        admin: fileURLToPath(new URL('admin/index.html', import.meta.url)),
      },
      // Chunk dùng chung cho cả hai trang (React, shared…) mang tên `shared-*` cho dễ nhận khi xem kích
      // thước; chunk tải động giữ tên riêng
      output: { chunkFileNames: (chunk) => (chunk.isDynamicEntry ? 'assets/[name]-[hash].js' : 'assets/shared-[hash].js') },
    },
  },
  server: { port: 5173, proxy: apiProxy },
  preview: { port: 4173, proxy: apiProxy },
});
