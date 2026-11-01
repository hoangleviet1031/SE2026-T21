import { useLiveQuery } from 'dexie-react-hooks';
import { getToken } from './auth';
import { useHashRoute } from './useHashRoute';
import { useOnline } from './useOnline';
import { HomePage } from './pages/HomePage';
import { FillPage } from './pages/FillPage';
import { ConflictPage } from './pages/ConflictPage';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';
import { BuilderPage } from './pages/BuilderPage';
import { MembersPage } from './pages/MembersPage';
import { OrgsPage } from './pages/OrgsPage';
import { ProjectSwitcher } from './components/ProjectSwitcher';
import { UpdatePrompt } from './components/UpdatePrompt';
import { Icon } from './components/Icon';
import { MenuButton, NavMenu, useNavMenu } from './components/NavMenu';
import { syncNow } from './sync/engine';
import { useCurrentProject } from './db/current';
import { canManageProject } from './projects';
import { currentNavId, navItems } from './navMenu';

export function App() {
  const [page, ...args] = useHashRoute();
  const online = useOnline();
  // Đọc qua liveQuery để khi token bị xoá (401, đăng xuất) app tự quay về màn hình đăng nhập
  const token = useLiveQuery(getToken, []);
  const project = useCurrentProject();
  const menu = useNavMenu([page, ...args].join('/'));

  // Đang đọc IndexedDB: chưa vẽ gì, tránh nháy màn hình đăng nhập với người đã đăng nhập
  if (token === undefined) return null;

  if (token === null) {
    return (
      <div className="app">
        <UpdatePrompt />
        <header className="hdr-simple">
          <span className="logo">
            <Icon name="logo" />
          </span>
          Khảo sát thực địa
        </header>
        <div className="page">
          <main>
            <LoginPage />
          </main>
        </div>
      </div>
    );
  }

  // Đang đọc IndexedDB (undefined) thì coi như có dự án để mục Phiếu không nháy
  const hasProject = project !== null;
  const navId = currentNavId([page ?? '', ...args], hasProject);

  return (
    <div className="app">
      {/* Ngăn kéo mở thì phần trang sau nền mờ có inert: không bấm, không Tab tới, trình đọc màn hình không vuốt ra
          được (ui.md "Menu điều hướng", tech-debt N22). Không đặt lên <nav> */}
      <UpdatePrompt inert={menu.open} />
      {/* Menu, Đồng bộ là biểu tượng + chữ nhỏ bên dưới để tên app không bị cắt ở 360px */}
      <header className="hdr" inert={menu.open}>
        {navId && <MenuButton open={menu.open} onToggle={menu.toggle} buttonRef={menu.buttonRef} />}
        <span className="logo">
          <Icon name="logo" />
        </span>
        <div className="brand">
          <a href="#/">Khảo sát thực địa</a>
          <span className={online ? 'net on' : 'net off'} data-testid="network-status">
            {online ? 'Trực tuyến' : 'Ngoại tuyến'}
          </span>
        </div>
        <button className="hbtn" onClick={() => void syncNow()} disabled={!online}>
          <Icon name="sync" />
          Đồng bộ
        </button>
      </header>
      <div className={navId ? 'shell with-nav' : 'shell'}>
        {navId && (
          <NavMenu
            items={navItems(project ? canManageProject(project.role) : false, hasProject)}
            current={navId}
            open={menu.open}
            onClose={menu.close}
          />
        )}
        <div className="page" inert={menu.open}>
          {/* Hàng riêng dưới header: header đã kín chỗ ở bề ngang 360px */}
          <ProjectSwitcher />
          <main>
            {page === 'fill' && args[0] ? (
              <FillPage formId={args[0]} recordId={args[1]} />
            ) : page === 'conflict' && args[0] ? (
              <ConflictPage recordId={args[0]} />
            ) : page === 'builder' && args[0] ? (
              // #/builder/new: form mới; #/builder/<formId>: sửa form đã có (ui.md màn hình 5)
              <BuilderPage formId={args[0] === 'new' ? undefined : args[0]} />
            ) : page === 'members' ? (
              <MembersPage />
            ) : page === 'orgs' ? (
              <OrgsPage />
            ) : page === 'settings' ? (
              <SettingsPage />
            ) : (
              <HomePage />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
