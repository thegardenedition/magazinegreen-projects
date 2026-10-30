// 프리셋: 노드 체인 전체를 JSON 하나로 저장·불러오기. LUT도 데이터째 넣어 파일 하나로 완결된다.

import { defaultPrimary, defaultWheel, LUMA, type PrimaryParams, type Vec3, type WheelName, type WheelValue } from './color';
import { MAX_NODES } from './constants';
import { CUSTOM_CURVES, defaultCurves, HUE_CURVES, type CurvePoint, type CurvesParams } from './curves';
import { LUT_MAX_SIZE, type CubeLut } from './lut';
import {
  defaultQualifier,
  defaultShape,
  defaultWindow,
  MAX_POLY_POINTS,
  type Qualifier,
  type WindowParams,
  type WindowShape,
} from './mask';

export const PRESET_FORMAT = 'green-grade-preset';
export const PRESET_VERSION = 1;

/** 노드 하나의 내용 (id 없이) */
export interface PresetNode {
  name: string;
  enabled: boolean;
  primary: PrimaryParams;
  curves: CurvesParams;
  lut: CubeLut | null;
  lutIntensity: number;
  qualifier: Qualifier;
  window: WindowParams;
}

export interface Preset {
  name: string;
  description?: string;
  nodes: PresetNode[];
}

// ── 직렬화 ──

interface PresetJson {
  format: typeof PRESET_FORMAT;
  version: number;
  name: string;
  description?: string;
  nodes: Array<Omit<PresetNode, 'lut'> & { lut: (Omit<CubeLut, 'data'> & { data: number[] }) | null }>;
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function serializePreset(p: Preset): string {
  const json: PresetJson = {
    format: PRESET_FORMAT,
    version: PRESET_VERSION,
    name: p.name,
    ...(p.description ? { description: p.description } : {}),
    nodes: p.nodes.map((n) => ({
      ...n,
      lut: n.lut
        ? {
            name: n.lut.name,
            size: n.lut.size,
            domainMin: n.lut.domainMin,
            domainMax: n.lut.domainMax,
            // RGB만 저장 (A는 항상 1)
            data: Array.from(n.lut.data).filter((_, i) => i % 4 !== 3).map(r6),
          }
        : null,
    })),
  };
  return JSON.stringify(json);
}

const num = (v: unknown, def: number, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;

function readWheel(name: WheelName, v: unknown): WheelValue {
  const d = defaultWheel(name);
  const o = (v ?? {}) as Partial<WheelValue>;
  let x = num(o.x, 0);
  let y = num(o.y, 0);
  const r = Math.hypot(x, y);
  if (r > 1) {
    x /= r;
    y /= r;
  }
  return { x, y, master: num(o.master, d.master) };
}

function readPrimary(v: unknown): PrimaryParams {
  const d = defaultPrimary();
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    lift: readWheel('lift', o.lift),
    gamma: readWheel('gamma', o.gamma),
    gain: readWheel('gain', o.gain),
    offset: readWheel('offset', o.offset),
    temperature: num(o.temperature, d.temperature, -100, 100),
    tint: num(o.tint, d.tint, -100, 100),
    contrast: num(o.contrast, d.contrast, 0, 2),
    pivot: num(o.pivot, d.pivot, 0, 1),
    saturation: num(o.saturation, d.saturation, 0, 2),
    hue: num(o.hue, d.hue, -180, 180),
  };
}

function readPoints(v: unknown, fallback: CurvePoint[]): CurvePoint[] {
  if (!Array.isArray(v)) return fallback;
  return v
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({ x: num(p.x, 0, 0, 1), y: num(p.y, 0.5, 0, 1) }))
    .sort((a, b) => a.x - b.x);
}

function readCurves(v: unknown): CurvesParams {
  const d = defaultCurves();
  const o = (v ?? {}) as Record<string, unknown>;
  for (const k of [...CUSTOM_CURVES, ...HUE_CURVES]) d[k] = readPoints(o[k], d[k]);
  return d;
}

function readLut(v: unknown): CubeLut | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const size = num(o.size, 0);
  if (!Number.isInteger(size) || size < 2 || size > LUT_MAX_SIZE) throw new Error('프리셋의 LUT 크기가 올바르지 않습니다.');
  const rgb = o.data;
  if (!Array.isArray(rgb) || rgb.length !== size ** 3 * 3) throw new Error('프리셋의 LUT 데이터 길이가 맞지 않습니다.');
  const data = new Float32Array(size ** 3 * 4);
  for (let i = 0; i < size ** 3; i++) {
    for (let k = 0; k < 3; k++) data[i * 4 + k] = num(rgb[i * 3 + k], 0);
    data[i * 4 + 3] = 1;
  }
  const triple = (t: unknown, def: number): Vec3 =>
    Array.isArray(t) && t.length === 3 ? (t.map((x) => num(x, def)) as Vec3) : [def, def, def];
  return {
    name: typeof o.name === 'string' ? o.name : 'LUT',
    size,
    data,
    domainMin: triple(o.domainMin, 0),
    domainMax: triple(o.domainMax, 1),
  };
}

const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);

function readQualifier(v: unknown): Qualifier {
  const d = defaultQualifier();
  const o = (v ?? {}) as Record<string, Record<string, unknown> | unknown>;
  const h = (o.hue ?? {}) as Record<string, unknown>;
  const range = (r: unknown, def: Qualifier['sat']) => {
    const x = (r ?? {}) as Record<string, unknown>;
    return {
      on: bool(x.on, def.on),
      low: num(x.low, def.low, 0, 1),
      high: num(x.high, def.high, 0, 1),
      soft: num(x.soft, def.soft, 0, 1),
    };
  };
  return {
    enabled: bool(o.enabled, d.enabled),
    invert: bool(o.invert, d.invert),
    hue: {
      on: bool(h.on, d.hue.on),
      center: num(h.center, d.hue.center, 0, 1),
      width: num(h.width, d.hue.width, 0, 0.5),
      soft: num(h.soft, d.hue.soft, 0, 0.5),
    },
    sat: range(o.sat, d.sat),
    lum: range(o.lum, d.lum),
  };
}

function readShape(v: unknown): WindowShape {
  const o = (v ?? {}) as Record<string, unknown>;
  const type = (['circle', 'rect', 'gradient', 'polygon'] as const).find((t) => t === o.type) ?? 'circle';
  const d = defaultShape(type) as Record<string, unknown>;
  if (type === 'polygon') {
    const pts = Array.isArray(o.points) ? o.points : [];
    return {
      type,
      points: pts
        .slice(0, MAX_POLY_POINTS)
        .map((p: { x?: unknown; y?: unknown }) => ({ x: num(p?.x, 0.5, -1, 2), y: num(p?.y, 0.5, -1, 2) })),
      smooth: bool(o.smooth, false),
    };
  }
  const out: Record<string, unknown> = { type };
  for (const k of Object.keys(d)) if (k !== 'type') out[k] = num(o[k], d[k] as number, -10, 10);
  return out as WindowShape;
}

function readWindow(v: unknown): WindowParams {
  const d = defaultWindow();
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    enabled: bool(o.enabled, d.enabled),
    invert: bool(o.invert, d.invert),
    feather: num(o.feather, d.feather, 0, 2),
    shape: o.shape ? readShape(o.shape) : d.shape,
  };
}

/** JSON 텍스트 → 프리셋. 빠진 값은 기본값으로 채우고 범위를 벗어난 값은 잘라낸다. */
export function parsePreset(text: string): Preset {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('JSON 형식이 아닙니다.');
  }
  const o = raw as Partial<PresetJson>;
  if (!o || o.format !== PRESET_FORMAT) throw new Error('GREEN GRADE 프리셋 파일이 아닙니다.');
  if (typeof o.version !== 'number' || o.version > PRESET_VERSION) {
    throw new Error('더 새로운 버전에서 만든 프리셋입니다.');
  }
  if (!Array.isArray(o.nodes) || o.nodes.length === 0) throw new Error('프리셋에 노드가 없습니다.');
  return {
    name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : '이름 없는 프리셋',
    description: typeof o.description === 'string' ? o.description : undefined,
    nodes: o.nodes.slice(0, MAX_NODES).map((n, i) => ({
      name: typeof n?.name === 'string' && n.name ? n.name : `노드 ${i + 1}`,
      enabled: n?.enabled !== false,
      primary: readPrimary(n?.primary),
      curves: readCurves(n?.curves),
      lut: readLut(n?.lut),
      lutIntensity: num(n?.lutIntensity, 1, 0, 1),
      qualifier: readQualifier(n?.qualifier),
      window: readWindow(n?.window),
    })),
  };
}

// ── 정원 사진 기본 프리셋 ──

/** 휠을 특정 색 방향으로 민 값 (amount: 0–1, 휠 반지름 비율) */
function toward(rgb: Vec3, amount: number, master: number): WheelValue {
  const y = LUMA[0] * rgb[0] + LUMA[1] * rgb[1] + LUMA[2] * rgb[2];
  const cb = (rgb[2] - y) / 1.8556;
  const cr = (rgb[0] - y) / 1.5748;
  const len = Math.hypot(cb, cr) || 1;
  return { x: (cb / len) * amount, y: (cr / len) * amount, master };
}

const AMBER: Vec3 = [1, 0.62, 0.2];
const TEAL: Vec3 = [0.1, 0.55, 0.6];

// 색상축 위치. 순색이 아니라 실제 정원 색의 자리(gardenSwatches.ts 측정값)에 맞춘다.
// 예: 실제 잎은 순수 초록(0.35)보다 노랑 쪽인 0.24–0.34에, 맑은 하늘은 파랑(0.70)이 아닌 0.61에 있다.
/** 새순·연두 */
const HUE_SPROUT = 0.245;
/** 햇빛 받은 잎·잔디 */
const HUE_FOLIAGE = 0.285;
/** 중간 녹색 잎 */
const HUE_LEAF = 0.316;
/** 하늘 */
const HUE_SKY = 0.61;
/** 목재·흙 */
const HUE_WOOD = 0.095;
/** 붉은 벽돌과 목재의 가운데 (피부 0.07도 이 근처라 밝기로 따로 덜어 낸다) */
const HUE_BRICK_WOOD = 0.065;

/** 고른 색상 하나만 올리거나 내리는 커브 (양옆 고정점 포함) */
const bump = (...pts: Array<[number, number]>): CurvePoint[] => {
  const out: CurvePoint[] = [];
  for (const [x, y] of pts) out.push({ x, y });
  const xs = pts.map(([x]) => x);
  const lo = Math.min(...xs) - 0.08;
  const hi = Math.max(...xs) + 0.08;
  out.push({ x: lo - Math.floor(lo), y: 0.5 }, { x: hi - Math.floor(hi), y: 0.5 });
  return out.sort((a, b) => a.x - b.x);
};

function node(
  name: string,
  p: Partial<PrimaryParams>,
  c: Partial<CurvesParams> = {},
  extra: Partial<PresetNode> = {},
): PresetNode {
  return {
    qualifier: defaultQualifier(),
    window: defaultWindow(),
    name,
    enabled: true,
    primary: { ...defaultPrimary(), ...p },
    curves: { ...defaultCurves(), ...c },
    lut: null,
    lutIntensity: 1,
    ...extra,
  };
}

export const BUILTIN_PRESETS: Preset[] = [
  {
    name: '신록',
    description: '연두는 노랑 쪽, 녹색은 청록 쪽으로 갈라 잎의 층을 살리고 녹색 과포화를 누른다',
    nodes: [
      node('톤', {
        gamma: { x: 0, y: 0, master: 0.03 },
        contrast: 1.04,
      }, {
        y: [{ x: 0, y: 0 }, { x: 0.75, y: 0.76 }, { x: 1, y: 0.985 }],
      }),
      node('녹색 분리', {}, {
        // 연두 −5°, 중간 녹색 +5° → 두 녹색 사이가 약 10° 벌어진다. 햇빛 받은 잎(0.285)은 거의 제자리.
        hueHue: bump([HUE_SPROUT, 0.46], [HUE_LEAF, 0.54]),
        hueSat: bump([HUE_SPROUT, 0.48], [HUE_FOLIAGE, 0.45], [HUE_LEAF, 0.46]),
        lumSat: [{ x: 0, y: 0.5 }, { x: 0.7, y: 0.5 }, { x: 1, y: 0.4 }],
      }),
    ],
  },
  {
    name: '늦가을 정원',
    description: '앰버빛 하이라이트, 가라앉은 섀도, 노랗게 바랜 녹색',
    nodes: [
      node('가을빛', {
        temperature: 8,
        gain: toward(AMBER, 0.3, 0.97),
        lift: toward(TEAL, 0.12, -0.012),
        saturation: 0.95,
        contrast: 1.03,
      }, {
        hueHue: bump([HUE_FOLIAGE, 0.42]),
        hueSat: bump([HUE_FOLIAGE, 0.42]),
        lumSat: [{ x: 0, y: 0.33 }, { x: 0.42, y: 0.5 }, { x: 1, y: 0.5 }],
      }),
    ],
  },
  {
    name: '흐린 날 구제',
    description: '미드톤 대비를 세우고, 위쪽 그라디언트 창으로 하늘만 짙게',
    nodes: [
      node('대비', {
        contrast: 1.06,
        temperature: 3,
        saturation: 0.93,
      }, {
        y: [{ x: 0, y: 0 }, { x: 0.25, y: 0.225 }, { x: 0.75, y: 0.78 }, { x: 1, y: 1 }],
      }),
      // 위쪽 그라디언트 창 안에서만: 하늘을 눌러 구름 결을 살리고 푸른 기를 더한다
      node('하늘', {
        gamma: { x: 0, y: 0, master: -0.15 },
        temperature: -4,
        saturation: 1,
      }, {
        hueLum: bump([HUE_SKY, 0.42]),
        hueSat: bump([HUE_SKY, 0.55]),
      }, {
        window: { enabled: true, invert: false, feather: 0.05, shape: { type: 'gradient', x0: 0.5, y0: 0.05, x1: 0.5, y1: 0.55 } },
      }),
    ],
  },
  {
    name: '매거진 내추럴',
    description: '낮은 채도, 들린 블랙, 부드럽게 꺾이는 하이라이트',
    nodes: [
      node('내추럴', {
        saturation: 0.93,
        contrast: 0.97,
        gain: toward(AMBER, 0.1, 1),
      }, {
        y: [{ x: 0, y: 0.085 }, { x: 0.5, y: 0.5 }, { x: 0.85, y: 0.83 }, { x: 1, y: 0.965 }],
        lumSat: [{ x: 0, y: 0.42 }, { x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }, { x: 1, y: 0.36 }],
      }),
    ],
  },
  {
    name: '석재·목재 질감',
    description: '중간톤 대비로 돌결과 나뭇결을 세우고, 돌은 무채색 그대로, 나무색은 깊게',
    nodes: [
      node('질감', {
        contrast: 1.02,
        saturation: 0.93,
      }, {
        y: [{ x: 0, y: 0 }, { x: 0.3, y: 0.285 }, { x: 0.5, y: 0.5 }, { x: 0.7, y: 0.72 }, { x: 1, y: 1 }],
        // 벽돌(0.04)–나무(0.09) 사이를 함께 짙게. 그 사이의 피부는 밝기가 높으므로 Lum vs Sat로 다시 덜어 낸다.
        hueSat: bump([HUE_BRICK_WOOD, 0.57]),
        hueLum: bump([HUE_WOOD, 0.46]),
        lumSat: [{ x: 0, y: 0.5 }, { x: 0.47, y: 0.5 }, { x: 0.6, y: 0.43 }, { x: 1, y: 0.43 }],
      }),
    ],
  },
];

// ── 내 프리셋 (브라우저 저장소) ──

const STORAGE_KEY = 'green-grade.presets.v1';

export function loadUserPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.flatMap((t) => {
      try {
        return [parsePreset(typeof t === 'string' ? t : JSON.stringify(t))];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

/** 저장에 실패하면(사생활 보호 모드, 용량 초과 등) 오류 메시지를 돌려준다 */
export function saveUserPresets(list: Preset[]): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.map(serializePreset)));
    return null;
  } catch {
    return '브라우저 저장소에 저장하지 못했습니다. LUT가 큰 프리셋은 JSON 파일로 내보내 보관하세요.';
  }
}
