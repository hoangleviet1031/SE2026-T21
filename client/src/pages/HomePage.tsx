import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { MeResponse } from '@field-survey/shared';
import { RemovedProjectBanners } from '../components/RemovedProjectBanners';
import { OrgsPage } from './OrgsPage';
import { ExportButtons } from '../components/ExportButtons';
import { getAccountValue } from '../db/accountDb';
import { useCurrentProject, useCurrentProjectDb } from '../db/current';
import { canManageProject } from '../projects';
import { downloadJson } from '../download';
import type { LocalAttachment, ProjectDb } from '../db/projectDb';
import { syncNow } from '../sync/engine';
import { dropAttachment, retryAttachment } from '../sync/attachments';
import { displayState } from '../sync/displayState';
import { exportRecordJson } from '../sync/exportJson';
import { retryFailed } from '../sync/outbox';
import { staleWarnings } from '../sync/staleWarnings';
import { navigate } from '../useHashRoute';
import { RECORD_FILTERS, matchesFilter, needsAttention, type RecordFilter } from '../recordFilter';
import { statusIcon } from '../statusIcon';
import { formTone, latestForms } from '../formDisplay';
import { Icon } from '../components/Icon';

export function HomePage() {
  const db = useCurrentProjectDb();
  return (
    <>
      <RemovedProjectBanners />
      {db === null ? <NoProject /> : db && <ProjectHome db={db} />}
    </>
  );
}

/**
 * Chưa có dự án active nào. Chưa từng nhận /me thì đang tải (vừa đăng nhập, hoặc mất mạng ngay sau
 * đó); đã nhận mà không có dự án thì trang chủ là màn hình Tổ chức (design §4.7 "Sau khi đăng nhập").
 * Hiện tại chỗ thay vì chuyển sang #/orgs: yêu cầu được duyệt thì vòng đồng bộ kế tiếp tự đưa về trang
 * chủ của tổ chức mới.
 */
function NoProject() {
  const user = useLiveQuery(() => getAccountValue<MeResponse['user'] | null>('user', null), []);
  if (user === undefined) return null;
  if (user === null) return <p data-testid="no-project">Đang tải danh sách dự án…</p>;
  return <OrgsPage home />;
}

function ProjectHome({ db }: { db: ProjectDb }) {
  const project = useCurrentProject();
  // Sửa form, Thành viên chỉ cho giám sát viên và Owner (ui.md màn hình 2); server cũng chặn (403 forbidden)
  const canManage = project ? canManageProject(project.role) : false;
  const forms = useLiveQuery(async () => db.forms.toArray(), [db]) ?? [];
  const records = useLiveQuery(async () => db.records.orderBy('updatedAt').reverse().toArray(), [db]) ?? [];
  // Ảnh theo phiếu để tính nhãn "Đang tải ảnh (n)" / "Lỗi ảnh" (design §5.6)
  const attachments = useLiveQuery(async () => db.attachments.toArray(), [db]) ?? [];
  const photosByRecord = new Map<string, LocalAttachment[]>();
  for (const a of attachments) photosByRecord.set(a.recordId, [...(photosByRecord.get(a.recordId) ?? []), a]);
  // Bộ lọc trạng thái và số "Cần xử lý" đầu trang (design §4.8), tính theo nhãn hiển thị của từng phiếu.
  const [filter, setFilter] = useState<RecordFilter>('all');
  // Phiếu đã xoá ẩn khỏi danh sách (§4.8), trừ khi đang xung đột (vd. xoá ở máy này, sửa ở máy kia):
  // người dùng phải thấy để xử lý, không thì phiếu kẹt ở conflict mãi.
  const rows = records
    .filter((r) => !r.deleted || r.syncState === 'conflict')
    .map((r) => {
      const photos = photosByRecord.get(r.id) ?? [];
      return { r, photos, state: displayState(r, photos) };
    });
  const attentionCount = rows.filter((x) => needsAttention(x.state.kind)).length;
  const shown = rows.filter((x) => matchesFilter(x.state.kind, filter));
  // Tính lại mỗi khi outbox đổi; giờ thiết bị chỉ để hiển thị cảnh báo (design §5.2)
  const warnings = useLiveQuery(async () => staleWarnings(await db.outbox.toArray(), Date.now()), [db]);
  const shownForms = latestForms(forms);

  return (
    <>
      {warnings?.staleRecords ? (
        <p className="warning" role="status">
          ⚠ Có {warnings.staleRecords} phiếu chưa đồng bộ hơn 1 ngày
        </p>
      ) : null}
      {warnings?.serverFailing && (
        <p className="warning" role="status">
          ⚠ Máy chủ đang lỗi, sẽ thử lại
        </p>
      )}
      <section>
        <div className="sec">
          <h2>Biểu mẫu</h2>
        </div>
        {shownForms.length === 0 && <p>Chưa có biểu mẫu. Kết nối mạng một lần để tải về.</p>}
        {/* Thẻ màu xoay vòng theo thứ tự form, nút trong thẻ đậm cùng tông; trang điền phiếu dùng cùng màu */}
        <ul className="forms">
          {shownForms.map((f, i) => (
            <li key={f.key} className={`fcard tone-${formTone(i)}`}>
              <div className="t" id={`form-title-${i}`}>
                <span className="ft">
                  <Icon name="form" />
                </span>
                {f.title}
              </div>
              <button className="primary" onClick={() => navigate('fill', f.id, crypto.randomUUID())}>
                <Icon name="plus" />
                Tạo phiếu mới
              </button>
              {canManage && (
                <div className="more">
                  <a className="button-link" href={`#/builder/${encodeURIComponent(f.id)}`}>
                    Sửa form
                  </a>
                  {project && <ExportButtons projectId={project.id} formId={f.id} describedBy={`form-title-${i}`} />}
                </div>
              )}
            </li>
          ))}
        </ul>
        {canManage && (
          <a className="add-row" href="#/builder/new">
            + Biểu mẫu mới
          </a>
        )}
      </section>
      <section>
        <div className="sec">
          <h2>Phiếu đã nhập</h2>
          {attentionCount > 0 && (
            <button type="button" className="attn" data-testid="needs-attention" onClick={() => setFilter('attention')}>
              <Icon name="alert" />
              Cần xử lý ({attentionCount})
            </button>
          )}
        </div>
        {/* Chưa có phiếu nào thì bộ lọc không lọc được gì, ẩn đi (TV1-12 b2, design §4.8).
            Chọn đúng một trạng thái: nhóm radio (không dùng nút, để không trùng tên với nút "Đồng bộ") */}
        {rows.length > 0 && (
          <div className="record-filters" role="radiogroup" aria-label="Lọc theo trạng thái">
            {RECORD_FILTERS.map((f) => (
              <label key={f.id}>
                <input
                  type="radio"
                  name="record-filter"
                  checked={filter === f.id}
                  onChange={() => setFilter(f.id)}
                />
                <Icon name="check" />
                {f.label}
              </label>
            ))}
          </div>
        )}
        {rows.length === 0 && (
          <p className="empty" data-testid="records-empty">
            <Icon name="form" />
            Chưa có phiếu nào.
          </p>
        )}
        {rows.length > 0 && shown.length === 0 && (
          <p className="empty" data-testid="no-records">
            <Icon name="inbox" />
            Không có phiếu nào ở trạng thái này.
          </p>
        )}
        {shown.length > 0 && (
          <ul className="records" data-testid="records">
            {shown.map(({ r, photos, state }) => (
              <li key={r.id} className={`st-${state.kind}`}>
                {/* Link tên phủ cả phần trên của dòng (mũi tên › báo bấm được); link xung đột nằm trên lớp đó */}
                <div className="rec-top">
                  <Icon name={statusIcon(state.kind)} className="st-icon" />
                  <a className="name" href={`#/fill/${r.formId}/${r.id}`}>
                    {String(Object.values(r.data)[0] ?? r.id)}
                  </a>
                  <Icon name="right" className="go" />
                  {r.syncState === 'conflict' ? (
                    <a className="st st-link" href={`#/conflict/${r.id}`}>
                      {state.label}
                      <Icon name="right" />
                    </a>
                  ) : (
                    <span className="st" data-testid="sync-state">
                      {state.label}
                    </span>
                  )}
                </div>
                {r.syncState === 'error' && (
                  <div className="record-error">
                    <span data-testid="sync-error">{r.lastError ?? 'Máy chủ từ chối phiếu này'}</span>
                    <div className="acts">
                      <button className="primary" onClick={() => void retry(db, r.id)}>
                        Thử lại
                      </button>
                      <button onClick={() => void downloadRecord(db, r.id)}>Xuất JSON phiếu này</button>
                    </div>
                  </div>
                )}
                {state.failedPhotoIds.map((photoId) => (
                  <div className="record-error" key={photoId} data-testid="photo-error">
                    <span>Lỗi ảnh: {photos.find((p) => p.id === photoId)?.lastError ?? 'không gửi được ảnh'}</span>
                    <div className="acts">
                      <button className="primary" onClick={() => void retryPhoto(db, photoId)}>
                        Thử lại
                      </button>
                      {/* Phiếu đang xung đột thì chỉ đọc (ADR 0001 quy tắc 7): bỏ ảnh là sửa phiếu */}
                      {r.syncState !== 'conflict' && (
                        <button onClick={() => void dropPhoto(db, r.id, photoId)}>Bỏ ảnh này</button>
                      )}
                    </div>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
      {/* Màn hình Thành viên cần mạng; tự báo khi offline (ui.md màn hình 6) */}
      {canManage && (
        <a className="members-link" href="#/members">
          <Icon name="users" />
          <span>Thành viên</span>
          <Icon name="right" className="go" />
        </a>
      )}
    </>
  );
}

async function retryPhoto(db: ProjectDb, photoId: string) {
  await retryAttachment(db, photoId);
  void syncNow();
}

async function dropPhoto(db: ProjectDb, recordId: string, photoId: string) {
  await dropAttachment(db, recordId, photoId);
  void syncNow();
}

async function retry(db: ProjectDb, recordId: string) {
  await retryFailed(db, recordId);
  void syncNow();
}

/** Tải phiếu về máy dưới dạng file .json (design §8, phiếu "Lỗi"). */
async function downloadRecord(db: ProjectDb, recordId: string) {
  downloadJson(`phieu-${recordId}.json`, await exportRecordJson(db, recordId));
}
