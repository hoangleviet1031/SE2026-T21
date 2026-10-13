import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { accountDb } from '../db/accountDb';
import { getCurrentProjectId, setCurrentProject } from '../db/current';
import { projectSubtitle } from '../projects';
import { navigate } from '../useHashRoute';

// Bộ chọn dự án (design §4.7, ui.md màn hình 2). Chỉ đọc CSDL account nên đổi dự án được cả khi
// offline; số đếm là bản lưu sau vòng đồng bộ gần nhất (design §4.2).
// TODO(TV1-15): thêm mục "Tổ chức khác…" mở màn hình 9 (ADR 0003).
export function ProjectSwitcher() {
  const projects = useLiveQuery(() => accountDb.projects.toArray(), []);
  const currentId = useLiveQuery(getCurrentProjectId, []);
  const [open, setOpen] = useState(false);

  const current = projects?.find((p) => p.id === currentId);
  if (!projects || !current) return null;

  // Chỉ một dự án thì không có gì để chọn, chỉ hiện tên
  if (projects.length === 1) {
    return (
      <div className="project-switcher" data-testid="project-switcher">
        <strong>{current.name}</strong>
      </div>
    );
  }

  const choose = async (id: string) => {
    setOpen(false);
    await setCurrentProject(id);
    // Trang đang mở (điền phiếu, xung đột) thuộc dự án cũ, nên về danh sách phiếu của dự án mới
    navigate();
  };

  return (
    <div className="project-switcher" data-testid="project-switcher">
      <button aria-expanded={open} onClick={() => setOpen(!open)}>
        <strong>{current.name}</strong> ▾
      </button>
      {open && (
        <ul className="project-list">
          {projects.map((p) =>
            p.status === 'removed' ? (
              // Dự án đã rời không chọn được; dữ liệu chưa gửi xử lý qua banner ở trang chủ
              <li key={p.id} className="removed" aria-disabled="true">
                <span>{p.name}</span>
                <span>Đã rời</span>
              </li>
            ) : (
              <li key={p.id}>
                <button aria-current={p.id === current.id} onClick={() => void choose(p.id)}>
                  <span>
                    {p.id === current.id ? '✓ ' : ''}
                    {p.name}
                  </span>
                  <small>{projectSubtitle(p)}</small>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
