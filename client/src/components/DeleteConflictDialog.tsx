import { useId } from 'react';
import { recordLevelPrompt, type DeleteConflict, type RecordLevelChoice } from '../conflictView';

// Câu hỏi xoá vs sửa (design §4.5, ui.md màn hình 3, ADR 0001 quy tắc 6): hai lựa chọn, không chọn
// sẵn. Khung nằm ngay trong màn hình xung đột, không phải hộp modal: nút "Áp dụng" bên dưới mới là
// nút quyết định, modal có nút Huỷ sẽ cho thoát ra mà chưa trả lời.

export function DeleteConflictDialog({
  level,
  editor,
  choice,
  onChoose,
}: {
  level: DeleteConflict;
  editor: string;
  choice: RecordLevelChoice | undefined;
  onChoose: (choice: RecordLevelChoice) => void;
}) {
  const { question, keepLabel, deleteLabel } = recordLevelPrompt(level, editor);
  const questionId = useId();
  return (
    <div className="delete-conflict" role="radiogroup" aria-labelledby={questionId} data-testid="delete-conflict">
      <p id={questionId}>{question}</p>
      <label className="opt">
        <input type="radio" name="record-level" checked={choice === 'keep'} onChange={() => onChoose('keep')} />
        {keepLabel}
      </label>
      {/* Lựa chọn làm mất dữ liệu chữ đỏ (ui.md màn hình 3) */}
      <label className="opt danger">
        <input type="radio" name="record-level" checked={choice === 'delete'} onChange={() => onChoose('delete')} />
        {deleteLabel}
      </label>
    </div>
  );
}
