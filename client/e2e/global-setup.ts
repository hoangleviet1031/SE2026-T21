import { DEMO_PASSWORD, DEMO_USERS, TOKENS_ENV } from './helpers';

// Chạy một lần trước mọi test, sau khi server E2E đã lên (Playwright khởi động webServer trước
// globalSetup). Đăng nhập các tài khoản demo bằng mật khẩu như người dùng để lấy token phiên cho test gọi
// API thẳng; seed không còn tạo token cố định đoán được (docs/tech-debt.md N7). Biến môi trường đặt ở đây
// được các worker kế thừa.

const LOGIN_URL = 'http://localhost:3001/api/auth/login';

export default async function globalSetup(): Promise<void> {
  const tokens: Record<string, string> = {};
  for (const username of DEMO_USERS) {
    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: DEMO_PASSWORD }),
    });
    if (res.status !== 200) throw new Error(`Không đăng nhập được tài khoản demo ${username}: HTTP ${res.status}`);
    tokens[username] = ((await res.json()) as { token: string }).token;
  }
  process.env[TOKENS_ENV] = JSON.stringify(tokens);
}
