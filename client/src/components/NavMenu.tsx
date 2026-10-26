import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { NavId, NavItem } from '../navMenu';
import { Icon } from './Icon';

// Menu điều hướng (ui.md "Menu điều hướng"). Điện thoại: nút ☰ ở thanh đầu mở ngăn kéo trượt từ trái;
// máy tính (≥1024px) thanh bên luôn hiện, nút ☰ ẩn bằng CSS. Cùng một <nav> cho cả hai để không lặp link.

const MENU_ID = 'app-menu';

/**
 * Đổi route bằng cách khác (Tab ra nội dung rồi Enter, nút Back) thì đóng ngăn kéo, không kéo con trỏ đi:
 * nếu không, quay lại trang có menu thì ngăn kéo tự mở lại và giật con trỏ vào mục đầu.
 */
export function useNavMenu(route: string) {
  const [open, setOpen] = useState(false);
  const [lastRoute, setLastRoute] = useState(route);
  if (route !== lastRoute) {
    setLastRoute(route);
    setOpen(false);
  }
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Đóng xong trả con trỏ về nút ☰ để người dùng bàn phím, trình đọc màn hình không bị lạc
  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);
  return { open, toggle: () => setOpen((v) => !v), close, buttonRef };
}

export function MenuButton({
  open,
  onToggle,
  buttonRef,
}: {
  open: boolean;
  onToggle: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button ref={buttonRef} className="hbtn menu-btn" aria-expanded={open} aria-controls={MENU_ID} onClick={onToggle}>
      <Icon name="menu" />
      Menu
    </button>
  );
}

export function NavMenu({
  items,
  current,
  open,
  onClose,
}: {
  items: NavItem[];
  current: NavId;
  open: boolean;
  onClose: () => void;
}) {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    navRef.current?.querySelector('a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {open && <div className="nav-backdrop" data-testid="nav-backdrop" onClick={onClose} />}
      <nav ref={navRef} id={MENU_ID} className={open ? 'sidenav open' : 'sidenav'} aria-label="Menu">
        {items.map((item) => (
          <a
            key={item.id}
            href={item.href}
            aria-current={item.id === current ? 'page' : undefined}
            onClick={open ? onClose : undefined}
          >
            <Icon name={item.icon} />
            {item.label}
          </a>
        ))}
      </nav>
    </>
  );
}
