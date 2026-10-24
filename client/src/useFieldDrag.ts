import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react';
import { dropIndex, shiftFor, slotTop, type RowBox } from './fieldDrag';

// Kéo thả sắp xếp trường trong builder (TV1-12 b2, ui.md màn hình 5 khung 5f) bằng Pointer Events, không thư
// viện. Chỉ bắt đầu từ tay nắm ⠿ (chỉ tay nắm có touch-action: none), nên vuốt chỗ khác vẫn cuộn trang.
// Lúc kéo không đổi thứ tự trong DOM, chỉ dịch dòng bằng transform: đổi DOM giữa chừng thì trình duyệt có thể
// nhả pointer capture. ▲ ▼ vẫn là cách cho bàn phím và trình đọc màn hình.

/** Dịch ít hơn chừng này thì coi là bấm rồi thả tại chỗ: không làm gì (Dương chốt p8 Q1) */
const START_PX = 4;
/** Cách mép trên hoặc mép trên hàng nút dính đáy chừng này thì trang tự cuộn */
const EDGE_PX = 56;
const SCROLL_STEP_PX = 12;

/** Đang kéo dòng `from`, sẽ thả ở `to`; `rows` là vị trí các dòng đo lúc bắt đầu kéo */
export type FieldDrag = { from: number; to: number; dy: number; rows: RowBox[] };

type Session = {
  from: number;
  pointerId: number;
  startY: number;
  startScroll: number;
  rows: RowBox[];
  lastY: number;
  moved: boolean;
  frame: number | null;
};

export function useFieldDrag({
  listRef,
  bottomEdge,
  onDrop,
}: {
  listRef: RefObject<HTMLElement | null>;
  /** Mép dưới vùng nhìn thấy (đỉnh hàng nút dính đáy), tính lại mỗi lần vì bàn phím ảo đổi chiều cao */
  bottomEdge: () => number;
  /** Thả xong (kể cả thả lại chỗ cũ): đổi thứ tự và chọn dòng vừa kéo */
  onDrop: (from: number, to: number) => void;
}) {
  const [drag, setDrag] = useState<FieldDrag | null>(null);
  const session = useRef<Session | null>(null);

  const update = useCallback(() => {
    const s = session.current;
    if (!s) return;
    // Cộng phần trang đã tự cuộn: tay đứng yên ở mép mà trang cuộn thì dòng vẫn phải đi theo
    const dy = s.lastY - s.startY + (window.scrollY - s.startScroll);
    if (!s.moved && Math.abs(dy) < START_PX) return;
    s.moved = true;
    const box = s.rows[s.from];
    if (!box) return;
    setDrag({ from: s.from, to: dropIndex(box.top + box.height / 2 + dy, s.rows, s.from), dy, rows: s.rows });
  }, []);

  const finish = useCallback(
    (commit: boolean) => {
      const s = session.current;
      if (!s) return;
      session.current = null;
      if (s.frame !== null) cancelAnimationFrame(s.frame);
      const box = s.rows[s.from];
      if (commit && s.moved && box) {
        const dy = s.lastY - s.startY + (window.scrollY - s.startScroll);
        onDrop(s.from, dropIndex(box.top + box.height / 2 + dy, s.rows, s.from));
      }
      setDrag(null);
    },
    [onDrop],
  );

  // Tự cuộn khi tay giữ gần mép, kể cả khi tay không nhúc nhích (không có pointermove)
  const autoScroll = useCallback(() => {
    const s = session.current;
    if (!s) return;
    s.frame = null;
    let step = 0;
    if (s.lastY < EDGE_PX) step = -SCROLL_STEP_PX;
    else if (s.lastY > bottomEdge() - EDGE_PX) step = SCROLL_STEP_PX;
    if (step === 0 || !s.moved) return;
    window.scrollBy(0, step);
    update();
    s.frame = requestAnimationFrame(autoScroll);
  }, [bottomEdge, update]);

  // Esc lúc đang kéo bằng chuột: huỷ, các dòng về chỗ cũ
  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drag, finish]);

  // Rời trang giữa lúc kéo thì dừng vòng tự cuộn
  useEffect(
    () => () => {
      const frame = session.current?.frame;
      if (frame !== null && frame !== undefined) cancelAnimationFrame(frame);
    },
    [],
  );

  function gripProps(index: number) {
    return {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        // Chỉ nút chính của chuột; chạm và bút luôn là 0
        if (e.button !== 0 || session.current) return;
        const list = listRef.current;
        if (!list) return;
        e.preventDefault();
        const rows = Array.from(list.querySelectorAll<HTMLElement>(':scope > [data-row]')).map((el) => ({
          top: el.offsetTop,
          height: el.offsetHeight,
        }));
        e.currentTarget.setPointerCapture(e.pointerId);
        session.current = {
          from: index,
          pointerId: e.pointerId,
          startY: e.clientY,
          startScroll: window.scrollY,
          rows,
          lastY: e.clientY,
          moved: false,
          frame: null,
        };
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const s = session.current;
        if (!s || e.pointerId !== s.pointerId) return;
        s.lastY = e.clientY;
        update();
        if (s.frame === null) s.frame = requestAnimationFrame(autoScroll);
      },
      onPointerUp: (e: PointerEvent<HTMLElement>) => {
        if (session.current?.pointerId === e.pointerId) finish(true);
      },
      // Hệ điều hành giành cử chỉ (cuộn, cuộc gọi đến…) hoặc mất capture: huỷ, không đổi thứ tự
      onPointerCancel: (e: PointerEvent<HTMLElement>) => {
        if (session.current?.pointerId === e.pointerId) finish(false);
      },
      onLostPointerCapture: (e: PointerEvent<HTMLElement>) => {
        if (session.current?.pointerId === e.pointerId) finish(false);
      },
    };
  }

  /** Style của dòng thứ `index` lúc đang kéo: dòng kéo theo tay, dòng giữa nhường chỗ */
  function rowStyle(index: number): CSSProperties | undefined {
    if (!drag) return undefined;
    if (index === drag.from) return { transform: `translateY(${drag.dy}px)` };
    const shift = shiftFor(index, drag.from, drag.to, drag.rows);
    return shift === 0 ? undefined : { transform: `translateY(${shift}px)` };
  }

  /** Ô kẻ sọc ở chỗ sẽ thả */
  function slot(): CSSProperties | null {
    const box = drag?.rows[drag.from];
    if (!drag || !box) return null;
    return { top: slotTop(drag.from, drag.to, drag.rows), height: box.height };
  }

  return { drag, gripProps, rowStyle, slot };
}
