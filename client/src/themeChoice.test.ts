import { describe, expect, it } from 'vitest';
import { parseThemeChoice, resolveTheme } from './theme';

// Lựa chọn giao diện ở màn hình 8 (ui.md màn hình 8 "Giao diện")
describe('parseThemeChoice', () => {
  it('chỉ nhận light, dark; chưa lưu hoặc giá trị lạ thì Theo máy', () => {
    expect(parseThemeChoice('light')).toBe('light');
    expect(parseThemeChoice('dark')).toBe('dark');
    expect(parseThemeChoice(null)).toBe('system');
    expect(parseThemeChoice('system')).toBe('system');
    expect(parseThemeChoice('Dark')).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('Theo máy thì theo chế độ của máy, chọn tay thì thắng chế độ của máy', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
