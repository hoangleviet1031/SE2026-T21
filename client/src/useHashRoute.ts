import { useEffect, useState } from 'react';

/** Router tối giản theo hash: #/fill/<formId>/<recordId>, #/conflict/<recordId> */
export function useHashRoute(): string[] {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

export function navigate(...parts: string[]) {
  location.hash = '/' + parts.map(encodeURIComponent).join('/');
}

/** Như `navigate` nhưng thay mục lịch sử hiện tại: bấm Back không về lại trang vừa rời (design §5.7, xoá phiếu). */
export function navigateReplace(...parts: string[]) {
  location.replace('#/' + parts.map(encodeURIComponent).join('/'));
}
