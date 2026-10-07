import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const apiProxy = { '/api': 'http://localhost:3001' };

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Bật SW khi chạy `npm run dev` để thử offline mà không cần build
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'Khảo sát thực địa',
        short_name: 'Khảo sát',
        lang: 'vi',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0f766e',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // App shell được precache; dữ liệu khảo sát nằm trong IndexedDB, không cache qua SW
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/forms'),
            handler: 'NetworkFirst',
            options: { cacheName: 'forms', networkTimeoutSeconds: 3 },
          },
        ],
      },
    }),
  ],
  server: { port: 5173, proxy: apiProxy },
  preview: { port: 4173, proxy: apiProxy },
});
