import type { ReactNode } from 'react';

// Biểu tượng tự vẽ theo bản thiết kế của Dương (TV1-12 b2), không dùng thư viện biểu tượng.
// Luôn đi kèm chữ nên ẩn khỏi trình đọc màn hình: tên nút/link vẫn chỉ là phần chữ (E2E tìm theo tên).

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const ICONS = {
  logo: (
    <g {...line}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1M9 10l1.5 1.5L13 9M9 16h6" />
    </g>
  ),
  sync: <path {...line} d="M20 11a8 8 0 0 0-14.3-4.9L4 8m0-4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16m0 4v-4h-4" />,
  gear: (
    <g {...line}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </g>
  ),
  plus: <path {...line} strokeWidth={2.4} d="M12 5v14M5 12h14" />,
  down: <path {...line} strokeWidth={2.4} d="m6 9 6 6 6-6" />,
  right: <path {...line} strokeWidth={2.4} d="m9 6 6 6-6 6" />,
  check: <path {...line} strokeWidth={2.8} d="m5 12.5 4.5 4.5L19 7.5" />,
  form: (
    <g {...line}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </g>
  ),
  phone: (
    <g {...line}>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </g>
  ),
  pin: (
    <g {...line}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </g>
  ),
  camera: (
    <g {...line}>
      <path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </g>
  ),
  offline: (
    <path
      {...line}
      d="M2.5 8.5a14 14 0 0 1 5-3M11 5a14 14 0 0 1 10.5 3.5M5.5 12a9 9 0 0 1 4-2.3M14.5 9.8a9 9 0 0 1 4 2.2M8.8 15.3a4.5 4.5 0 0 1 6.4 0M12 19h.01M3 3l18 18"
    />
  ),
  grip: (
    <g fill="currentColor">
      <circle cx="9" cy="6" r="1.7" />
      <circle cx="15" cy="6" r="1.7" />
      <circle cx="9" cy="12" r="1.7" />
      <circle cx="15" cy="12" r="1.7" />
      <circle cx="9" cy="18" r="1.7" />
      <circle cx="15" cy="18" r="1.7" />
    </g>
  ),
  eye: (
    <g {...line}>
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </g>
  ),
  inbox: (
    <g {...line}>
      <path d="M3 13l3-8h12l3 8v6H3z" />
      <path d="M3 13h5l1.5 2.5h5L16 13h5" />
    </g>
  ),
  users: (
    <g {...line}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </g>
  ),
  lock: (
    <g {...line} strokeWidth={2.2}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </g>
  ),
  // Trạng thái phiếu: vòng nét đứt = cần làm, đồng hồ/nửa vòng = đang chờ, tích = ổn, chấm than = gấp
  draft: <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth={2.4} strokeDasharray="3.4 2.9" />,
  pending: (
    <g {...line} strokeWidth={2.2}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </g>
  ),
  upload: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth={2.2} />
      <path fill="currentColor" d="M12 3.5a8.5 8.5 0 0 1 0 17z" />
    </>
  ),
  synced: (
    <>
      <circle cx="12" cy="12" r="9.5" fill="currentColor" />
      <path {...line} stroke="#fff" strokeWidth={2.4} d="m7.8 12.3 2.8 2.8 5.6-5.8" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9.5" fill="currentColor" />
      <path {...line} stroke="#fff" strokeWidth={2.6} d="M12 7.3v5.6M12 16.7v.1" />
    </>
  ),
  cancel: (
    <g {...line} strokeWidth={2.2}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6.5 17.5l11-11" />
    </g>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className ? `icon ${className}` : 'icon'} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICONS[name]}
    </svg>
  );
}
