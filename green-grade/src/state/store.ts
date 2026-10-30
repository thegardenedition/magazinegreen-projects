import { create } from 'zustand';
import {
  defaultPrimary,
  defaultWheel,
  SCALAR_SPECS,
  toUniforms,
  type GradeUniforms,
  type PrimaryParams,
  type ScalarName,
  type WheelName,
  type WheelValue,
} from '../engine/color';
import {
  bakeCurves,
  defaultCurves,
  identityCustom,
  type CurveLuts,
  type CurvePoint,
  type CurvesParams,
  type CustomCurveName,
  type HueCurveName,
} from '../engine/curves';
import type { LoadedImage } from '../engine/image';

export type CurveName = CustomCurveName | HueCurveName;

/** 되돌리기 대상이 되는 보정 상태 */
interface Grade {
  primary: PrimaryParams;
  curves: CurvesParams;
  /** 노드 01의 on/off. Phase 3에서 노드 배열로 확장한다. */
  nodeEnabled: boolean;
}

interface GradeState extends Grade {
  image: LoadedImage | null;
  bypass: boolean;
  split: boolean;
  splitPos: number;
  exportOpen: boolean;
  past: Grade[];
  future: Grade[];

  setImage(img: LoadedImage | null): void;
  setWheel(name: WheelName, patch: Partial<WheelValue>): void;
  resetWheel(name: WheelName, part?: 'color' | 'master'): void;
  setScalar(name: ScalarName, value: number): void;
  resetScalar(name: ScalarName): void;
  resetPrimary(): void;
  setCurve(name: CurveName, pts: CurvePoint[]): void;
  resetCurve(name: CurveName): void;
  resetCurves(): void;
  toggleNode(): void;
  toggleBypass(): void;
  toggleSplit(): void;
  setSplitPos(v: number): void;
  setExportOpen(v: boolean): void;
  undo(): void;
  redo(): void;
}

const HISTORY_LIMIT = 200;
/** 드래그·연속 입력이 멈춘 뒤 이 시간이 지나면 한 단계로 기록한다 */
export const HISTORY_IDLE_MS = 250;

const pick = (s: Grade): Grade => ({ primary: s.primary, curves: s.curves, nodeEnabled: s.nodeEnabled });
const same = (a: Grade, b: Grade) => a.primary === b.primary && a.curves === b.curves && a.nodeEnabled === b.nodeEnabled;

export const useGrade = create<GradeState>((set, get) => ({
  image: null,
  primary: defaultPrimary(),
  curves: defaultCurves(),
  nodeEnabled: true,
  bypass: false,
  split: false,
  splitPos: 0.5,
  exportOpen: false,
  past: [],
  future: [],

  setImage: (image) => set({ image }),
  setWheel: (name, patch) =>
    set((s) => ({ primary: { ...s.primary, [name]: { ...s.primary[name], ...patch } } })),
  resetWheel: (name, part) =>
    set((s) => {
      const d = defaultWheel(name);
      const cur = s.primary[name];
      const next = part === 'color' ? { ...cur, x: 0, y: 0 } : part === 'master' ? { ...cur, master: d.master } : d;
      return { primary: { ...s.primary, [name]: next } };
    }),
  setScalar: (name, value) => set((s) => ({ primary: { ...s.primary, [name]: value } })),
  resetScalar: (name) => set((s) => ({ primary: { ...s.primary, [name]: SCALAR_SPECS[name].def } })),
  resetPrimary: () => set({ primary: defaultPrimary() }),
  setCurve: (name, pts) => set((s) => ({ curves: { ...s.curves, [name]: pts } })),
  resetCurve: (name) =>
    set((s) => ({ curves: { ...s.curves, [name]: name.length === 1 ? identityCustom() : [] } })),
  resetCurves: () => set({ curves: defaultCurves() }),
  toggleNode: () => set((s) => ({ nodeEnabled: !s.nodeEnabled })),
  toggleBypass: () => set((s) => ({ bypass: !s.bypass })),
  toggleSplit: () => set((s) => ({ split: !s.split })),
  setSplitPos: (splitPos) => set({ splitPos: Math.min(1, Math.max(0, splitPos)) }),
  setExportOpen: (exportOpen) => set({ exportOpen }),

  undo: () => {
    commitHistory();
    const { past, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    const cur = committed;
    committed = prev;
    set({ ...prev, past: past.slice(0, -1), future: [cur, ...future] });
  },
  redo: () => {
    commitHistory();
    const { past, future } = get();
    if (!future.length) return;
    const next = future[0];
    const cur = committed;
    committed = next;
    set({ ...next, past: [...past, cur], future: future.slice(1) });
  },
}));

// ── 히스토리 ──
// 마지막으로 기록된 상태. 보정값이 바뀌고 잠시 멈추면 이전 기록을 past에 쌓는다.
let committed: Grade = pick(useGrade.getState());
let timer: ReturnType<typeof setTimeout> | undefined;

/** 대기 중인 변경을 즉시 한 단계로 기록 */
export function commitHistory() {
  clearTimeout(timer);
  timer = undefined;
  const cur = pick(useGrade.getState());
  if (same(cur, committed)) return;
  const past = [...useGrade.getState().past, committed].slice(-HISTORY_LIMIT);
  committed = cur;
  useGrade.setState({ past, future: [] });
}

useGrade.subscribe((s, prev) => {
  if (same(pick(s), pick(prev)) || same(pick(s), committed)) return;
  clearTimeout(timer);
  timer = setTimeout(commitHistory, HISTORY_IDLE_MS);
});

// ── 셰이더 값 ──
let bakedFor: CurvesParams | null = null;
let baked: CurveLuts | null = null;

/** 현재 상태의 셰이더 값. 커브 표는 커브가 바뀔 때만 다시 굽는다. */
export function currentUniforms(s: Grade = useGrade.getState()): GradeUniforms {
  if (s.curves !== bakedFor || !baked) {
    baked = bakeCurves(s.curves);
    bakedFor = s.curves;
  }
  return toUniforms(s.primary, { enabled: s.nodeEnabled, curves: baked });
}
