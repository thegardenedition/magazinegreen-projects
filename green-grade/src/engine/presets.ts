// 프리셋: 노드 체인 전체를 JSON 하나로 저장·불러오기. LUT도 데이터째 넣어 파일 하나로 완결된다.

import { defaultPrimary, defaultWheel, LUMA, type PrimaryParams, type Vec3, type WheelName, type WheelValue } from './color';
import { MAX_NODES } from './constants';
import { CUSTOM_CURVES, defaultCurves, HUE_CURVES, SIX_VECTORS, type CurvePoint, type CurvesParams } from './curves';
import { LUT_MAX_SIZE, type CubeLut } from './lut';

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
const [, HUE_Y] = SIX_VECTORS[1];
const [, HUE_G] = SIX_VECTORS[2];
const [, HUE_C] = SIX_VECTORS[3];
const [, HUE_B] = SIX_VECTORS[4];
/** 연두(노랑과 초록 사이) */
const HUE_YG = (HUE_Y + HUE_G) / 2;
/** 주황·나무색(빨강과 노랑 사이) */
const HUE_OR = HUE_Y / 2;

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

function node(name: string, p: Partial<PrimaryParams>, c: Partial<CurvesParams> = {}): PresetNode {
  return {
    name,
    enabled: true,
    primary: { ...defaultPrimary(), ...p },
    curves: { ...defaultCurves(), ...c },
    lut: null,
    lutIntensity: 1,
  };
}

export const BUILTIN_PRESETS: Preset[] = [
  {
    name: '신록',
    description: '연두와 녹색을 갈라 잎의 층을 살리고, 녹색 과포화를 누른다',
    nodes: [
      node('톤', {
        gamma: { x: 0, y: 0, master: 0.04 },
        contrast: 1.06,
        temperature: 3,
      }, {
        y: [{ x: 0, y: 0 }, { x: 0.75, y: 0.76 }, { x: 1, y: 0.98 }],
      }),
      node('녹색 분리', {}, {
        // 연두는 노랑 쪽으로, 녹색은 청록 쪽으로 살짝 → 두 녹색이 갈라진다
        hueHue: bump([HUE_YG, 0.44], [HUE_G + 0.03, 0.54]),
        hueSat: bump([HUE_YG, 0.52], [HUE_G + 0.03, 0.43]),
        lumSat: [{ x: 0, y: 0.5 }, { x: 0.7, y: 0.5 }, { x: 1, y: 0.38 }],
      }),
    ],
  },
  {
    name: '늦가을 정원',
    description: '앰버빛 하이라이트, 가라앉은 섀도, 바랜 녹색',
    nodes: [
      node('가을빛', {
        temperature: 14,
        gain: toward(AMBER, 0.35, 1),
        lift: toward(TEAL, 0.25, -0.015),
        saturation: 0.92,
        contrast: 1.04,
      }, {
        hueHue: bump([HUE_G, 0.42]),
        hueSat: bump([HUE_G, 0.42]),
        lumSat: [{ x: 0, y: 0.36 }, { x: 0.3, y: 0.5 }, { x: 1, y: 0.5 }],
      }),
    ],
  },
  {
    name: '흐린 날 구제',
    description: '미드톤 대비를 세우고 하늘의 푸른 기를 조금 짙게',
    nodes: [
      node('대비', {
        contrast: 1.14,
        temperature: 6,
        saturation: 1.06,
      }, {
        y: [{ x: 0, y: 0 }, { x: 0.25, y: 0.21 }, { x: 0.75, y: 0.8 }, { x: 1, y: 1 }],
      }),
      node('하늘', {}, {
        hueLum: bump([HUE_B, 0.38]),
        hueSat: bump([HUE_C, 0.56], [HUE_B, 0.6]),
      }),
    ],
  },
  {
    name: '매거진 내추럴',
    description: '낮은 채도, 들린 블랙, 부드럽게 꺾이는 하이라이트',
    nodes: [
      node('내추럴', {
        saturation: 0.86,
        contrast: 0.96,
        gain: toward(AMBER, 0.1, 1),
      }, {
        y: [{ x: 0, y: 0.03 }, { x: 0.5, y: 0.5 }, { x: 0.85, y: 0.82 }, { x: 1, y: 0.95 }],
        lumSat: [{ x: 0, y: 0.42 }, { x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }, { x: 1, y: 0.36 }],
      }),
    ],
  },
  {
    name: '석재·목재 질감',
    description: '중간톤 대비로 돌결과 나뭇결을 세우고 나무색은 깊게',
    nodes: [
      node('질감', {
        contrast: 1.04,
        saturation: 0.92,
        gamma: { x: 0, y: 0, master: -0.02 },
      }, {
        y: [{ x: 0, y: 0 }, { x: 0.3, y: 0.26 }, { x: 0.5, y: 0.5 }, { x: 0.7, y: 0.75 }, { x: 1, y: 1 }],
        hueSat: bump([HUE_OR, 0.55]),
        hueLum: bump([HUE_OR, 0.46]),
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
