import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { accountDb } from '../db/accountDb';
import { getCurrentProjectId, setCurrentProject } from '../db/current';
import { initialOf } from '../accountDisplay';
import { projectSubtitle } from '../projects';
import { navigate } from '../useHashRoute';
import { Icon } from './Icon';

// Bộ chọn dự án (design §4.7, ui.md màn hình 2). Chỉ đọc CSDL account nên đổi dự án được cả khi
// offline; số đếm là bản lưu sau vòng đồng bộ gần nhất (design §4.2).
// "Tổ chức khác…" mở màn hình Tổ chức (ui.md màn hình 9, ADR 0003).
export function ProjectSwitcher() {
  const projects = useLiveQuery(() => accountDb.projects.toArray(), []);
  const currentId = useLiveQuery(getCurrentProjectId, []);
  const [open, setOpen] = useState(false);

  const current = projects?.find((p) => p.id === currentId);
  if (!projects || !current) return null;

  // Ô chữ cái chỉ để nhìn, tên nút/khối vẫn là tên tổ chức
  const tile = (
    <span className="tile" aria-hidden="true">
      {initialOf(current.name)}
    </span>
  );

  // Chỉ một dự án thì không có gì để chọn, chỉ hiện tên
  if (projects.length === 1) {
    return (
      <div className="org-one" data-testid="project-switcher">
        {tile}
        <strong className="name">{current.name}</strong>
        <a className="org-other" href="#/orgs">
          Tổ chức khác…
          <Icon name="right" />
        </a>
      </div>
    );
  }

  const choose = async (id: string) => {
    setOpen(false);
    await setCurrentProject(id);
    // Trang đang mở (điền phiếu, xung đột) thuộc dự án cũ, nên về danh sách phiếu của dự án mới
    navigate();
  };

  // Danh sách mở ngay dưới, đẩy nội dung xuống thay vì phủ lên (ui.md màn hình 2)
  return (
    <div className="org-switcher" data-testid="project-switcher">
      <button className="org-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        {tile}
        <strong className="name">{current.name}</strong>
        <Icon name="down" className={open ? 'up' : undefined} />
      </button>
      {open && (
        <ul className="project-list">
          {projects.map((p) =>
            p.status === 'removed' ? (
              // Dự án đã rời không chọn được; dữ liệu chưa gửi xử lý qua banner ở trang chủ
              <li key={p.id} className="removed" aria-disabled="true">
                <span>{p.name}</span>
                <span className="tag">Đã rời</span>
              </li>
            ) : (
              <li key={p.id}>
                <button aria-current={p.id === current.id} onClick={() => void choose(p.id)}>
                  {p.id === current.id ? <Icon name="check" /> : <span />}
                  <span className="n">{p.name}</span>
                  <small>{projectSubtitle(p)}</small>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      {/* Ngoài danh sách: danh sách chỉ gồm tổ chức của mình */}
      {open && (
        <div className="other-orgs">
          <button onClick={() => (setOpen(false), navigate('orgs'))}>Tổ chức khác…</button>
        </div>
      )}
    </div>
  );
}
