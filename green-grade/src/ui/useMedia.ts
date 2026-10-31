import { useSyncExternalStore } from 'react';

/** 휴대폰: 좁은 세로 화면, 또는 높이가 낮은 터치 화면(가로로 든 휴대폰) */
export const MOBILE_QUERY = '(max-width: 760px), (max-height: 500px) and (pointer: coarse)';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
