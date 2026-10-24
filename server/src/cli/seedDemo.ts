import { pathToFileURL } from 'node:url';
import { DEMO_PASSWORD, DEMO_PROJECTS, DEMO_USERNAMES, seedDemo } from '../seedDemo';
import { openDbFromEnv } from './openDbFromEnv';

// npm run seed:demo -w server (design §12). Mật khẩu demo cố định, có trong README,
// nên không bao giờ chạy trên server thật.

export function seedDemoAllowed(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV !== 'production';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!seedDemoAllowed(process.env)) {
    console.error('Không chạy seed:demo khi NODE_ENV=production: mật khẩu demo ai cũng biết.');
    process.exitCode = 1;
  } else {
    const db = openDbFromEnv();
    seedDemo(db);
    db.close();
    console.log(`Đã tạo dự án ${Object.values(DEMO_PROJECTS).join(', ')} và người dùng demo.`);
    console.log(`Mật khẩu chung: ${DEMO_PASSWORD}`);
    console.log(`Tài khoản: ${Object.values(DEMO_USERNAMES).join(', ')}`);
  }
}
