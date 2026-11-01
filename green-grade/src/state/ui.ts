// 화면 모드: 쉬운 모드(프리셋 + 기본 슬라이더)와 전문가 모드(노드·휠·스코프), 사진 크게 보기
import { create } from 'zustand';

export type UiMode = 'easy' | 'pro';
const MODE_KEY = 'gg.mode';

function readMode(): UiMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'pro' ? 'pro' : 'easy';
  } catch {
    return 'easy';
  }
}

interface UiState {
  mode: UiMode;
  /** 보정 패널을 숨기고 사진만 크게 */
  focus: boolean;
  setMode(m: UiMode): void;
  toggleFocus(): void;
}

export const useUi = create<UiState>((set) => ({
  mode: readMode(),
  focus: false,
  setMode: (mode) => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // 저장이 막힌 브라우저: 이번 방문에만 적용
    }
    set({ mode });
  },
  toggleFocus: () => set((s) => ({ focus: !s.focus })),
}));
