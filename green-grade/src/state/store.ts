import { create } from 'zustand';
import {
  defaultMixer,
  defaultPrimary,
  defaultWheel,
  type RgbMixer,
  SCALAR_SPECS,
  toUniforms,
  type GradeUniforms,
  type PrimaryParams,
  type ScalarName,
  type WheelName,
  type WheelValue,
} from '../engine/color';
import { MAX_NODES } from '../engine/constants';
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
import {
  defaultDetail,
  defaultDevelop,
  defaultGeometry,
  DETAIL_SPECS,
  PRESET_DETAIL_KEYS,
  updateGeometry,
  type DetailName,
  type Develop,
  type Geometry,
  type Rect,
} from '../engine/develop';
import type { LoadedImage } from '../engine/image';
import { resolveLutRef } from '../engine/lutRegistry';
import type { CubeLut } from '../engine/lut';
import type { Preset } from '../engine/presets';
import {
  defaultQualifier,
  defaultWindow,
  maskUniform,
  type Qualifier,
  type WindowParams,
} from '../engine/mask';

export type CurveName = CustomCurveName | HueCurveName;

export interface GradeNode {
  id: string;
  name: string;
  enabled: boolean;
  primary: PrimaryParams;
  curves: CurvesParams;
  lut: CubeLut | null;
  lutIntensity: number;
  qualifier: Qualifier;
  window: WindowParams;
}

export type CorrectionTab = 'primary' | 'curves' | 'mixer' | 'qualifier' | 'window' | 'transform' | 'detail' | 'heal';
export type MaskView = 'off' | 'highlight' | 'bw';
/** 뷰어 클릭 동작: 스포이드(새로/더하기), 펜(폴리곤 점 추가), 수평 기준선 */
export type ViewerTool = 'none' | 'pick' | 'pick-add' | 'pen' | 'level' | 'heal';

/** 되돌리기 대상이 되는 보정 상태 */
interface Grade {
  nodes: GradeNode[];
  /** 사진 단위의 형태·디테일 (노드 체인 앞에서 한 번) */
  develop: Develop;
}

interface GradeState extends Grade {
  selectedId: string;
  image: LoadedImage | null;
  bypass: boolean;
  split: boolean;
  splitPos: number;
  exportOpen: boolean;
  correctionTab: CorrectionTab;
  maskView: MaskView;
  viewerTool: ViewerTool;
  past: Grade[];
  future: Grade[];

  setImage(img: LoadedImage | null): void;
  // 선택한 노드의 보정
  setWheel(name: WheelName, patch: Partial<WheelValue>): void;
  resetWheel(name: WheelName, part?: 'color' | 'master'): void;
  setScalar(name: ScalarName, value: number): void;
  resetScalar(name: ScalarName): void;
  resetPrimary(): void;
  setCurve(name: CurveName, pts: CurvePoint[]): void;
  resetCurve(name: CurveName): void;
  resetCurves(): void;
  setMixer(fn: (m: RgbMixer) => RgbMixer): void;
  setLut(lut: CubeLut | null): void;
  setLutIntensity(v: number): void;
  setQualifier(fn: (q: Qualifier) => Qualifier): void;
  setWindow(fn: (w: WindowParams) => WindowParams): void;
  // 형태·디테일 (사진 전체)
  setGeometry(patch: Partial<Geometry>): void;
  setCrop(crop: Rect): void;
  resetGeometry(): void;
  setDetail(name: DetailName, value: number): void;
  resetDetail(): void;
  setCorrectionTab(t: CorrectionTab): void;
  setMaskView(v: MaskView): void;
  setViewerTool(t: ViewerTool): void;
  // 노드
  selectNode(id: string): void;
  addNode(): void;
  duplicateNode(): void;
  deleteNode(): void;
  moveNode(dir: -1 | 1): void;
  renameNode(id: string, name: string): void;
  toggleNode(id?: string): void;
  setNodes(nodes: GradeNode[]): void;
  resetAll(): void;
  // 보기
  toggleBypass(): void;
  toggleSplit(): void;
  setSplitPos(v: number): void;
  setExportOpen(v: boolean): void;
  undo(): void;
  redo(): void;
}

let idSeq = 0;
export const newNodeId = () => `n${Date.now().toString(36)}${(idSeq++).toString(36)}`;

export function createNode(name: string, patch: Partial<Omit<GradeNode, 'id'>> = {}): GradeNode {
  return {
    id: newNodeId(),
    name,
    enabled: true,
    primary: defaultPrimary(),
    curves: defaultCurves(),
    lut: null,
    lutIntensity: 1,
    qualifier: defaultQualifier(),
    window: defaultWindow(),
    ...patch,
  };
}

/** 새 노드 이름: 비어 있는 가장 작은 번호 */
function nextName(nodes: GradeNode[]) {
  for (let i = 1; ; i++) {
    const n = `노드 ${i}`;
    if (!nodes.some((x) => x.name === n)) return n;
  }
}

/** 선택한 노드 (되돌리기로 사라졌으면 첫 노드) */
export function selectedNode(s: { nodes: GradeNode[]; selectedId: string }): GradeNode {
  return s.nodes.find((n) => n.id === s.selectedId) ?? s.nodes[0];
}

const initialNode = createNode('Primary');

export const useGrade = create<GradeState>((set, get) => {
  /** 선택한 노드만 바꾼 새 노드 배열 */
  const updateSel = (fn: (n: GradeNode) => Partial<GradeNode>) =>
    set((s) => {
      const sel = selectedNode(s);
      return { nodes: s.nodes.map((n) => (n === sel ? { ...n, ...fn(n) } : n)) };
    });
  const selIndex = () => {
    const s = get();
    return s.nodes.indexOf(selectedNode(s));
  };

  /** 형태 계산에 쓰는 원본 크기 (사진이 없으면 3:2로 가정) */
  const fullSize = () => {
    const img = get().image;
    return img ? ([img.width, img.height] as const) : ([3000, 2000] as const);
  };
  const setGeom = (fn: (g: Geometry) => Geometry) => set((s) => ({ develop: { ...s.develop, geometry: fn(s.develop.geometry) } }));

  return {
    nodes: [initialNode],
    develop: defaultDevelop(),
    selectedId: initialNode.id,
    image: null,
    bypass: false,
    split: false,
    splitPos: 0.5,
    exportOpen: false,
    correctionTab: 'primary',
    maskView: 'off',
    viewerTool: 'none',
    past: [],
    future: [],

    setImage: (image) => set({ image }),

    setWheel: (name, patch) =>
      updateSel((n) => ({ primary: { ...n.primary, [name]: { ...n.primary[name], ...patch } } })),
    resetWheel: (name, part) =>
      updateSel((n) => {
        const d = defaultWheel(name);
        const cur = n.primary[name];
        const next = part === 'color' ? { ...cur, x: 0, y: 0 } : part === 'master' ? { ...cur, master: d.master } : d;
        return { primary: { ...n.primary, [name]: next } };
      }),
    setScalar: (name, value) => updateSel((n) => ({ primary: { ...n.primary, [name]: value } })),
    resetScalar: (name) => updateSel((n) => ({ primary: { ...n.primary, [name]: SCALAR_SPECS[name].def } })),
    resetPrimary: () => updateSel(() => ({ primary: defaultPrimary() })),
    setCurve: (name, pts) => updateSel((n) => ({ curves: { ...n.curves, [name]: pts } })),
    resetCurve: (name) =>
      updateSel((n) => ({ curves: { ...n.curves, [name]: name.length === 1 ? identityCustom() : [] } })),
    resetCurves: () => updateSel(() => ({ curves: defaultCurves() })),
    setMixer: (fn) => updateSel((n) => ({ primary: { ...n.primary, mixer: fn(n.primary.mixer ?? defaultMixer()) } })),
    setLut: (lut) => updateSel(() => ({ lut, lutIntensity: 1 })),
    setLutIntensity: (v) => updateSel(() => ({ lutIntensity: Math.min(1, Math.max(0, v)) })),
    setQualifier: (fn) => updateSel((n) => ({ qualifier: fn(n.qualifier) })),
    setWindow: (fn) => updateSel((n) => ({ window: fn(n.window) })),
    setGeometry: (patch) => setGeom((g) => updateGeometry(g, patch, ...fullSize())),
    setCrop: (crop) => setGeom((g) => updateGeometry(g, { crop }, ...fullSize())),
    resetGeometry: () => setGeom(() => defaultGeometry()),
    setDetail: (name, value) => {
      const spec = DETAIL_SPECS[name];
      const v = Math.min(spec.max, Math.max(spec.min, value));
      set((s) => ({ develop: { ...s.develop, detail: { ...s.develop.detail, [name]: v } } }));
    },
    resetDetail: () => set((s) => ({ develop: { ...s.develop, detail: defaultDetail() } })),
    setCorrectionTab: (correctionTab) =>
      set((s) => ({
        correctionTab,
        // 탭을 떠나면 그 탭의 뷰어 도구는 끈다
        viewerTool:
          (correctionTab !== 'qualifier' && s.viewerTool.startsWith('pick')) ||
          (correctionTab !== 'window' && s.viewerTool === 'pen') ||
          (correctionTab !== 'transform' && s.viewerTool === 'level') ||
          (correctionTab !== 'heal' && s.viewerTool === 'heal')
            ? 'none'
            : s.viewerTool,
      })),
    setMaskView: (maskView) => set({ maskView }),
    setViewerTool: (viewerTool) => set({ viewerTool }),

    selectNode: (selectedId) => set({ selectedId }),
    addNode: () => {
      const s = get();
      if (s.nodes.length >= MAX_NODES) return;
      const node = createNode(nextName(s.nodes));
      const i = selIndex();
      set({ nodes: [...s.nodes.slice(0, i + 1), node, ...s.nodes.slice(i + 1)], selectedId: node.id });
    },
    duplicateNode: () => {
      const s = get();
      if (s.nodes.length >= MAX_NODES) return;
      const src = selectedNode(s);
      const node = { ...src, id: newNodeId(), name: `${src.name} 복제` };
      const i = selIndex();
      set({ nodes: [...s.nodes.slice(0, i + 1), node, ...s.nodes.slice(i + 1)], selectedId: node.id });
    },
    deleteNode: () => {
      const s = get();
      if (s.nodes.length <= 1) return;
      const i = selIndex();
      const nodes = s.nodes.filter((_, k) => k !== i);
      set({ nodes, selectedId: nodes[Math.min(i, nodes.length - 1)].id });
    },
    moveNode: (dir) => {
      const s = get();
      const i = selIndex();
      const j = i + dir;
      if (j < 0 || j >= s.nodes.length) return;
      const nodes = [...s.nodes];
      [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
      set({ nodes });
    },
    renameNode: (id, name) =>
      set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, name: name.trim() || n.name } : n)) })),
    toggleNode: (id) =>
      set((s) => {
        const target = id ?? selectedNode(s).id;
        return { nodes: s.nodes.map((n) => (n.id === target ? { ...n, enabled: !n.enabled } : n)) };
      }),
    setNodes: (nodes) => set({ nodes: nodes.slice(0, MAX_NODES), selectedId: nodes[0].id }),
    resetAll: () => {
      const node = createNode('Primary');
      set({ nodes: [node], selectedId: node.id });
    },

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
  };
});

// ── 히스토리 ──
// 마지막으로 기록된 상태. 보정값이 바뀌고 잠시 멈추면 이전 기록을 past에 쌓는다.
const HISTORY_LIMIT = 200;
/** 드래그·연속 입력이 멈춘 뒤 이 시간이 지나면 한 단계로 기록한다 */
export const HISTORY_IDLE_MS = 250;

const pick = (s: Grade): Grade => ({ nodes: s.nodes, develop: s.develop });
const same = (a: Grade, b: Grade) => a.nodes === b.nodes && a.develop === b.develop;

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
const bakedCache = new WeakMap<CurvesParams, CurveLuts>();

function bakedFor(c: CurvesParams) {
  let b = bakedCache.get(c);
  if (!b) {
    b = bakeCurves(c);
    bakedCache.set(c, b);
  }
  return b;
}

export function nodeUniforms(n: GradeNode): GradeUniforms {
  return toUniforms(n.primary, {
    enabled: n.enabled,
    curves: bakedFor(n.curves),
    lut: n.lut ? { lut: n.lut, intensity: n.lutIntensity } : null,
    mask: maskUniform(n.qualifier, n.window),
  });
}

/** 노드 체인 전체의 셰이더 값. 커브 표는 커브가 바뀐 노드만 다시 굽는다. */
export function currentUniforms(s: Pick<Grade, 'nodes'> = useGrade.getState()): GradeUniforms[] {
  return s.nodes.map(nodeUniforms);
}

// ── 프리셋 ↔ 노드 ──

export function presetToNodes(p: Preset): GradeNode[] {
  // 라이브러리 LUT를 이름으로 가리키는 노드는 여기서 LUT를 만든다
  return p.nodes.map(({ lutRef, ...n }) => ({ ...n, lut: n.lut ?? (lutRef ? resolveLutRef(lutRef) : null), id: newNodeId() }));
}

export function currentPreset(name: string, s: Pick<Grade, 'nodes'> & Partial<Pick<Grade, 'develop'>> = useGrade.getState()): Preset {
  const nodes = s.nodes.map(({ id: _id, ...rest }) => rest);
  // 기본값과 다른 효과·질감 값만 함께 저장
  const d = s.develop?.detail;
  const detail = d ? Object.fromEntries(PRESET_DETAIL_KEYS.filter((k) => d[k] !== DETAIL_SPECS[k].def).map((k) => [k, d[k]])) : {};
  return Object.keys(detail).length ? { name, nodes, detail } : { name, nodes };
}

/** 프리셋 적용: 노드를 바꾸고, 프리셋이 정한 디테일 값만 바꾼다 */
export function applyPresetToGrade(p: Preset) {
  const g = useGrade.getState();
  g.setNodes(presetToNodes(p));
  if (p.detail) useGrade.setState((s) => ({ develop: { ...s.develop, detail: { ...s.develop.detail, ...p.detail } } }));
}

/** 다른 사진으로 넘어갈 때: 되돌리기 기록을 비우고 지금 상태를 기준으로 삼는다 */
export function resetHistory() {
  clearTimeout(timer);
  timer = undefined;
  committed = pick(useGrade.getState());
  useGrade.setState({ past: [], future: [] });
}
