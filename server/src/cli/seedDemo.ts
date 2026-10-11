import { pathToFileURL } from 'node:url';
import { DEMO_PROJECTS, DEMO_TOKENS, seedDemo } from '../seedDemo';
import { openDbFromEnv } from './openDbFromEnv';

// npm run seed:demo -w server (design §12). Token demo cố định và có trong README,
// nên không bao giờ chạy trên server thật.

export function seedDemoAllowed(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV !== 'production';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!seedDemoAllowed(process.env)) {
    console.error('Không chạy seed:demo khi NODE_ENV=production: token demo ai cũng biết.');
    process.exitCode = 1;
  } else {
    const db = openDbFromEnv();
    seedDemo(db);
    db.close();
    console.log(`Đã tạo dự án ${Object.values(DEMO_PROJECTS).join(', ')} và người dùng demo.`);
    for (const [name, token] of Object.entries(DEMO_TOKENS)) console.log(`  ${name}: ${token}`);
  }
}
