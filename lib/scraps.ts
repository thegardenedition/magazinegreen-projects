import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * lib/scraps.ts
 * ------------------------------------------------------------------------
 * 「저장」한 프로젝트 목록. 계정이 없는 사이트라 이 기기의 localStorage 에 slug 만 담는다
 * (서버로 보내지 않는 기기 안 저장이므로 새 개인정보 수집이 아니다).
 *
 * 예전에는 상세 페이지 안에서만 읽고 써서 목록 화면은 저장 여부를 알 수 없었다.
 * 목록 카드·분류 줄·상세가 같은 값을 보도록 한 곳으로 모았다. 저장소 키는 그대로라
 * 이미 저장해 둔 항목은 유지된다.
 */

const KEY = 'mg-scrapped-projects';
const CHANGE_EVENT = 'mg:scraps-changed';

/** 「저장한 프로젝트 보기」를 눌렀을 때 목록 화면에 보내는 신호 */
export const SHOW_SAVED_EVENT = 'mg:show-saved';

// 프라이빗 브라우징 등으로 localStorage 가 막혀도 이 페이지를 보는 동안은 저장이
// 동작하도록, 마지막으로 쓴 값을 메모리에도 둔다.
let memory: string | null = null;

function readStored(): string {
  try {
    return localStorage.getItem(KEY) ?? '[]';
  } catch {
    return '[]';
  }
}

function parse(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function getSnapshot(): string {
  return memory ?? readStored();
}

function getServerSnapshot(): string {
  return '[]';
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    // 다른 탭에서 바뀐 경우: 메모리 값이 낡았으니 버리고 저장소를 다시 읽는다.
    if (e.key === KEY || e.key === null) {
      memory = null;
      onChange();
    }
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function write(slugs: string[]) {
  const raw = JSON.stringify(slugs);
  memory = raw;
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    /* 저장소가 막힌 경우 조용히 넘어간다(메모리 값으로 이 방문 동안은 동작) */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** 저장 상태를 켜고 끈다. 켜졌으면 true. */
export function toggleScrap(slug: string): boolean {
  const current = parse(getSnapshot());
  const on = !current.includes(slug);
  write(on ? [...current, slug] : current.filter((s) => s !== slug));
  return on;
}

/** 서버 렌더에서는 항상 빈 목록으로 시작해(하이드레이션 불일치 방지), 화면이 뜬 뒤 실제 값으로 맞춘다. */
export function useScrapped() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const slugs = useMemo(() => parse(raw), [raw]);
  const has = useCallback((slug: string) => slugs.includes(slug), [slugs]);
  return { slugs, has };
}

/** 목록 화면이면 그 자리에서 저장한 것만 보여 주고, 다른 화면이면 목록으로 이동한다. */
export function openSavedView(push: (url: string) => void) {
  if (window.location.pathname === '/projects') {
    window.dispatchEvent(new Event(SHOW_SAVED_EVENT));
  } else {
    push('/projects?saved=1');
  }
}
