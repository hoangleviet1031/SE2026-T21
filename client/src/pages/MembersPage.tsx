import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { MeResponse, Member, ProjectSettings, Role } from '@field-survey/shared';
import { initialOf } from '../accountDisplay';
import { BusyNote } from '../components/BusyNote';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { getAccountValue, type AccountProject } from '../db/accountDb';
import { useCurrentProject } from '../db/current';
import {
  MAX_ADD_NAMES,
  MEMBER_ERROR_TEXT,
  addInOrder,
  addLineText,
  addManyConfirmText,
  addSummaryText,
  assignableRoles,
  confirmText,
  memberActions,
  namesToKeep,
  parseUsernameList,
  tooManyNamesText,
  type AddLine,
} from '../members';
import { ROLE_LABEL, canManageProject } from '../projects';
import { apiFailureText } from '../apiErrors';
import {
  addMember,
  apiFailure,
  changeMemberRole,
  fetchMembers,
  fetchSettings,
  removeMember,
  updateSettings,
  type MemberResult,
} from '../sync/api';
import { syncNow } from '../sync/engine';
import { navigate } from '../useHashRoute';

// Màn hình Thành viên (ui.md màn hình 6, design §4.7). Cần mạng: gọi API thẳng, không qua IndexedDB
// (CLAUDE.md bất biến 7 cho phép). Luật ai đụng được vai trò nào giống server (canAssignRole).

const OFFLINE_MSG = 'Cần kết nối mạng để quản lý thành viên';

// Nhãn vai trò mỗi vai một màu (ui.md màn hình 6); chữ vẫn nói rõ vai trò, màu chỉ giúp nhìn nhanh
const ROLE_CLASS: Record<Role, string> = { owner: 'role owner', supervisor: 'role sup', surveyor: 'role' };

/** Lỗi gọi API thành câu hiển thị (mất mạng, 5xx, 401, không còn thành viên); lỗi lập trình ném tiếp. */
function failureText(err: unknown): string {
  const failure = apiFailure(err);
  if (!failure) throw err;
  return apiFailureText(failure, OFFLINE_MSG);
}

export function MembersPage() {
  const project = useCurrentProject();
  const user = useLiveQuery(() => getAccountValue<MeResponse['user'] | null>('user', null), []);

  if (project === undefined || user === undefined) return null;
  return (
    <section className="members">
      {/* Đầu trang như Builder, Cài đặt; có cả khi không đủ quyền để không thành ngõ cụt (ui.md màn hình 6) */}
      <a href="#/" className="back">
        ← Quay lại
      </a>
      {!project || !user || !canManageProject(project.role) ? (
        <p>Chỉ giám sát viên và Owner xem được trang này.</p>
      ) : (
        // key theo dự án: đổi dự án thì nạp lại từ đầu, không lẫn danh sách của dự án trước
        <Members key={project.id} project={project} myUserId={user.id} />
      )}
    </section>
  );
}

function Members({ project, myUserId }: { project: AccountProject; myUserId: string }) {
  const isOwner = project.role === 'owner';
  const [members, setMembers] = useState<Member[] | null>(null);
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Thao tác đang chờ người dùng xác nhận trong hộp thoại (đổi vai trò, rút)
  const [pending, setPending] = useState<{
    text: string;
    label: string;
    danger: boolean;
    act: () => void;
    cancel?: () => void;
  } | null>(null);
  const [addResults, setAddResults] = useState<{ lines: AddLine[]; duplicates: number } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await fetchMembers(project.id);
      if (!list.ok) return setLoadError(MEMBER_ERROR_TEXT[list.error]);
      setMembers(list.value);
      if (isOwner) {
        const s = await fetchSettings(project.id);
        if (!s.ok) return setLoadError(MEMBER_ERROR_TEXT[s.error]);
        setSettings(s.value);
      }
    } catch (err) {
      setLoadError(failureText(err));
    }
  }, [project.id, isOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Chạy một thao tác ghi. Thành công thì nạp lại danh sách; thao tác làm mình mất quyền thì đồng bộ
   * để /me cập nhật vai trò ngay rồi về trang chủ (góp ý review PR #38).
   */
  async function run<T>(action: () => Promise<MemberResult<T>>, opts: { self?: boolean } = {}): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    setAddResults(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(MEMBER_ERROR_TEXT[result.error]);
        return undefined;
      }
      if (opts.self) {
        await syncNow();
        navigate();
        return result.value;
      }
      await load();
      return result.value;
    } catch (err) {
      setError(failureText(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  /** Trước khi gửi nhiều tên: quá giới hạn thì báo, Owner thì hỏi lại. Trả false nghĩa là không gửi. */
  const prepareAddMany = (count: number, role: Role): Promise<boolean> => {
    if (count > MAX_ADD_NAMES) {
      setAddResults(null);
      setError(tooManyNamesText(count));
      return Promise.resolve(false);
    }
    const text = addManyConfirmText(count, role);
    if (!text) return Promise.resolve(true);
    return new Promise((resolve) => {
      setPending({ text, label: 'Thêm', danger: false, act: () => resolve(true), cancel: () => resolve(false) });
    });
  };

  /**
   * Thêm lần lượt, xong thì trả các tên còn để lại trong ô. Không dùng `load()`: làm mới hỏng thì không báo thêm,
   * bảng kết quả đã nói đúng từng tên (design §4.7). Vì không qua `load()` nên phải tự xoá câu lỗi tải cũ.
   */
  const addMany = async (names: string[], duplicates: number, role: Role): Promise<string[]> => {
    setBusy(true);
    setError(null);
    setLoadError(null);
    setAddResults(null);
    try {
      const { lines, stopReason } = await addInOrder(
        names,
        (username) => addMember(project.id, { username, role }),
        failureText,
      );
      setAddResults({ lines, duplicates });
      setError(stopReason);
      try {
        const list = await fetchMembers(project.id);
        if (list.ok) setMembers(list.value);
      } catch (err) {
        // Làm mới hỏng thì giữ danh sách cũ, không báo gì thêm: bảng kết quả đã nói đúng từng tên
        if (!apiFailure(err)) throw err;
      }
      return namesToKeep(lines);
    } finally {
      setBusy(false);
    }
  };

  const onChangeRole = (m: Member, role: Role) => {
    const act = () => void run(() => changeMemberRole(project.id, m.userId, role), { self: m.userId === myUserId });
    const text = confirmText(myUserId, m, role);
    if (text) setPending({ text, label: 'Đổi vai trò', danger: false, act });
    else act();
  };

  const onRemove = (m: Member) => {
    const act = () => void run(() => removeMember(project.id, m.userId), { self: m.userId === myUserId });
    const text = confirmText(myUserId, m, null);
    if (text) setPending({ text, label: 'Rút', danger: true, act });
    else act();
  };

  const loadFailure = loadError && (
    // Vùng alert chỉ có câu lỗi, [Thử lại] nằm ngoài để trình đọc màn hình không đọc lẫn vào câu.
    // Khoá khi đang ghi: GET chạy song song về sau có thể đè danh sách mới hơn
    <div className="load-err">
      <p className="field-error" role="alert">
        ⚠ {loadError}
      </p>
      <button disabled={busy} onClick={() => void load()}>
        Thử lại
      </button>
    </div>
  );

  return (
    <>
      <h2>Thành viên · {project.name}</h2>
      {pending && (
        <ConfirmDialog
          message={pending.text}
          confirmLabel={pending.label}
          danger={pending.danger}
          onConfirm={() => {
            setPending(null);
            pending.act();
          }}
          onCancel={() => {
            setPending(null);
            pending.cancel?.();
          }}
        />
      )}
      {members === null ? (
        (loadFailure || <p>Đang tải…</p>)
      ) : (
        // Đã có danh sách thì tải lại lỗi không được gỡ form: giữ nguyên phần đang nhập (design §8)
        <>
          {/* Lỗi nằm ngay dưới nút [Thêm], trong cùng khối */}
          <div className="card">
            <AddMemberForm
              roles={assignableRoles(project.role)}
              busy={busy}
              onAdd={(username, role) => run(() => addMember(project.id, { username, role }))}
              prepareAddMany={prepareAddMany}
              onAddMany={addMany}
            />
            {error && (
              <p className="field-error" role="alert" data-testid="member-error">
                ⚠ {error}
              </p>
            )}
            <AddResults results={addResults} />
          </div>
          {/* Nằm sát danh sách, không dưới nút [Thêm]: câu này nói về danh sách, thao tác vừa rồi đã xong */}
          {loadFailure}
          <ul className="card mlist" data-testid="members">
            {members.map((m) => (
              <MemberRow
                key={m.userId}
                member={m}
                myRole={project.role}
                busy={busy}
                onChangeRole={(role) => onChangeRole(m, role)}
                onRemove={() => onRemove(m)}
              />
            ))}
          </ul>
          {isOwner && settings && (
            <OrgSettings
              settings={settings}
              busy={busy}
              onSave={async (patch) => {
                const saved = await run(() => updateSettings(project.id, patch));
                if (saved) {
                  setSettings(saved);
                  // Tên mới hiện ở bộ chọn dự án sau khi /me trả về
                  if (patch.name !== undefined) void syncNow();
                }
                return saved !== undefined;
              }}
            />
          )}
        </>
      )}
    </>
  );
}

function AddMemberForm({
  roles,
  busy,
  onAdd,
  prepareAddMany,
  onAddMany,
}: {
  roles: Role[];
  busy: boolean;
  onAdd: (username: string, role: Role) => Promise<Member | undefined>;
  prepareAddMany: (count: number, role: Role) => Promise<boolean>;
  onAddMany: (names: string[], duplicates: number, role: Role) => Promise<string[]>;
}) {
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<Role>('surveyor');
  // `busy` chung cho mọi thao tác trên trang; chữ "Đang thêm…" chỉ hiện khi chính nút Thêm đang chạy
  const [adding, setAdding] = useState(false);
  const hintId = useId();
  const { names, duplicates } = parseUsernameList(username);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const [first, ...rest] = names;
    if (first === undefined) return;
    const single = rest.length === 0;
    // Chờ hộp hỏi lại xong mới bật "Đang thêm…": lúc đang hỏi chưa gửi gì
    if (!single && !(await prepareAddMany(names.length, role))) return;
    setAdding(true);
    try {
      // Một tên đi đường cũ: lỗi hiện một câu, chữ người dùng nhập giữ nguyên trong ô
      if (single) {
        if (await onAdd(first, role)) setUsername('');
      } else {
        setUsername((await onAddMany(names, duplicates, role)).join('\n'));
      }
    } finally {
      setAdding(false);
    }
  };

  return (
    <form className="form" onSubmit={(e) => void submit(e)}>
      <label className="field">
        Thêm theo tên đăng nhập
        {/* Tắt tự sửa chữ: bàn phím điện thoại đổi tên thành một tên khác là thêm nhầm người */}
        <textarea
          data-testid="member-username"
          value={username}
          disabled={busy}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={hintId}
          onChange={(e) => setUsername(e.target.value)}
        />
      </label>
      <p className="hint" id={hintId}>
        Mỗi dòng một tên, hoặc cách nhau bằng dấu phẩy. Tối đa {MAX_ADD_NAMES} tên mỗi lần.
      </p>
      <label className="field">
        Vai trò
        {/* aria-label: nhãn bọc select thì tên đọc được gồm cả chữ các lựa chọn */}
        <select
          aria-label="Vai trò"
          value={role}
          onChange={(e) => setRole(roles.find((r) => r === e.target.value) ?? 'surveyor')}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="primary wide" disabled={busy || names.length === 0} aria-busy={adding}>
        Thêm
      </button>
      <BusyNote busy={adding} text="Đang thêm…" />
    </form>
  );
}

/** Kết quả từng tên sau khi thêm nhiều người (ui.md màn hình 6). */
function AddResults({ results }: { results: { lines: AddLine[]; duplicates: number } | null }) {
  const summary = results ? addSummaryText(results.lines, results.duplicates) : '';
  return (
    <>
      {/* Vùng status luôn có, chỉ đổi chữ: vùng chèn vào cùng lúc với chữ thì có máy bỏ qua (như màn hình 9) */}
      <p className="visually-hidden" role="status" data-testid="member-result-status">
        {summary}
      </p>
      {results && (
        <div className="add-results">
          <p data-testid="member-result-summary">{summary}</p>
          <ul data-testid="member-results">
            {results.lines.map((line) => (
              <li key={line.username} className={line.kind} data-testid={`member-result-${line.username}`}>
                {line.kind === 'added' && <Icon name="synced" />}
                <b>{line.username}</b>
                <span>
                  {line.kind === 'failed' && '⚠ '}
                  {addLineText(line)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function MemberRow({
  member,
  myRole,
  busy,
  onChangeRole,
  onRemove,
}: {
  member: Member;
  myRole: Role;
  busy: boolean;
  onChangeRole: (role: Role) => void;
  onRemove: () => void;
}) {
  const actions = memberActions(myRole, member);
  // Ô chọn chỉ ghi lại vai trò muốn đổi, bấm [Đổi] mới gửi: đổi ngay khi ô đổi giá trị thì người dùng bàn
  // phím bấm mũi tên trên ô đang đóng là vai trò bị đổi luôn (audit C1, ui.md màn hình 6)
  const [pick, setPick] = useState<Role | ''>('');
  return (
    <li className="mrow" data-testid={`member-${member.username}`}>
      <span className="av" aria-hidden="true">
        {initialOf(member.name || member.username)}
      </span>
      {/* Tên và vai trò hai dòng nên bỏ " · " giữa hai phần (TV1-12 b2) */}
      <span className="who">
        <span>
          <b>{member.name}</b> <span className="un">({member.username})</span>
        </span>
        <span className={ROLE_CLASS[member.role]} data-testid={`member-role-${member.username}`}>
          {ROLE_LABEL[member.role]}
        </span>
      </span>
      {(actions.changeTo.length > 0 || actions.canRemove) && (
        <span className="acts">
          {actions.changeTo.length > 0 && (
            <>
              <select
                aria-label={`Vai trò mới của ${member.username}`}
                value={pick}
                disabled={busy}
                onChange={(e) => setPick(actions.changeTo.find((r) => r === e.target.value) ?? '')}
              >
                <option value="">Đổi vai trò…</option>
                {actions.changeTo.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <button
                aria-label={`Đổi vai trò ${member.username}`}
                disabled={busy || pick === ''}
                onClick={() => {
                  if (pick === '') return;
                  setPick('');
                  onChangeRole(pick);
                }}
              >
                Đổi
              </button>
            </>
          )}
          {actions.canRemove && (
            <button className="danger-outline" aria-label={`Rút ${member.username}`} disabled={busy} onClick={onRemove}>
              Rút
            </button>
          )}
        </span>
      )}
    </li>
  );
}

/** Chỉ Owner: đổi tên tổ chức (bấm Lưu), bật/tắt công khai (lưu ngay khi bấm). */
function OrgSettings({
  settings,
  busy,
  onSave,
}: {
  settings: ProjectSettings;
  busy: boolean;
  onSave: (patch: { name?: string; public?: boolean }) => Promise<boolean>;
}) {
  const [name, setName] = useState(settings.name);
  const trimmed = name.trim();

  return (
    <section className="card">
      <h3>Tổ chức</h3>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({ name: trimmed });
        }}
      >
        <label className="field">
          Tên tổ chức
          <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" disabled={busy || !trimmed || trimmed === settings.name}>
          Lưu tên
        </button>
      </form>
      <label className="ck">
        <input
          type="checkbox"
          data-testid="org-public"
          checked={settings.public}
          disabled={busy}
          onChange={(e) => void onSave({ public: e.target.checked })}
        />
        Công khai tên tổ chức
      </label>
      <p className="hint">Người đã đăng nhập thấy tên tổ chức trong danh sách và gửi tên đăng nhập cho bạn để được thêm.</p>
    </section>
  );
}
