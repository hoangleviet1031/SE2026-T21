// Chọn giao diện Sáng / Tối / Theo máy ở màn hình 8 (ui.md màn hình 8 "Giao diện", "Hệ thống thiết kế").
// Lựa chọn là tuỳ chọn hiển thị của máy, không phải dữ liệu người dùng: để ở localStorage (đọc được đồng bộ
// trước khi vẽ trang), Đăng xuất hay Xoá dữ liệu trên máy không xoá. Script nhỏ trong index.html, admin/index.html
// đặt `data-theme` trước khi vẽ cùng luật như resolveTheme, file này áp lại khi đổi và khi máy đổi chế độ.

export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

// Màu thanh trạng thái theo header ở từng chế độ, khớp --surface sáng/tối trong styles.css
const THEME_COLOR: Record<Theme, string> = { light: '#ffffff', dark: '#211f1c' };

/** Giá trị đã lưu → lựa chọn; chưa lưu hoặc giá trị lạ thì Theo máy */
export function parseThemeChoice(value: string | null): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  if (choice === 'system') return systemDark ? 'dark' : 'light';
  return choice;
}

export function readThemeChoice(): ThemeChoice {
  try {
    return parseThemeChoice(localStorage.getItem(THEME_KEY));
  } catch (e) {
    // Trình duyệt chặn bộ nhớ (vd. chế độ riêng tư chặn cookie): coi như chưa chọn, theo máy
    console.warn('không đọc được lựa chọn giao diện', e);
    return 'system';
  }
}

/** Lưu và áp ngay. Không lưu được thì vẫn áp cho lần mở này, lần sau về Theo máy */
export function saveThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch (e) {
    console.warn('không lưu được lựa chọn giao diện', e);
  }
  current = choice;
  apply();
}

let current: ThemeChoice = 'system';

function apply(): void {
  const theme = resolveTheme(current, matchMedia(DARK_QUERY).matches);
  document.documentElement.dataset.theme = theme;
  // Hai thẻ theme-color có media theo máy; chọn tay thì cả hai cùng màu đã chọn, Theo máy thì mỗi thẻ màu của nó
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own: Theme = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = THEME_COLOR[current === 'system' ? own : theme];
  }
}

/** Gọi một lần lúc khởi động: áp lựa chọn đã lưu và theo máy đổi chế độ khi đang Theo máy */
export function startTheme(): void {
  current = readThemeChoice();
  apply();
  matchMedia(DARK_QUERY).addEventListener('change', apply);
}
