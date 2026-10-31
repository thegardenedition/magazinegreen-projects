// 프리셋: 노드 체인 전체를 JSON 하나로 저장·불러오기. LUT도 데이터째 넣어 파일 하나로 완결된다.

import { defaultMixer, defaultPrimary, defaultWheel, type PrimaryParams, type RgbMixer, type Vec3, type WheelName, type WheelValue } from './color';
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

/** 기본 제공 프리셋의 분류 */
export type PresetCategory = 'garden' | 'correction' | 'bw' | 'film' | 'cinematic';

export const PRESET_CATEGORIES: Array<[PresetCategory, string]> = [
  ['garden', '정원'],
  ['correction', '보정'],
  ['bw', '흑백'],
  ['film', '필름'],
  ['cinematic', '시네마틱'],
];

export interface BuiltinPreset extends Preset {
  category: PresetCategory;
  /**
   * 의도적으로 색을 크게 바꾸는 룩(크로스 프로세스 등). 피부 색상 보존 검사에서 빠진다.
   */
  bold?: boolean;
  /** 노출을 올리는 등 하이라이트가 잘릴 수 있는 프리셋. 새 클리핑 검사에서 빠진다. */
  mayClip?: boolean;
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
    shadow: readWheel('shadow', o.shadow),
    midtone: readWheel('midtone', o.midtone),
    highlight: readWheel('highlight', o.highlight),
    lowRange: num(o.lowRange, d.lowRange, 0.05, 0.6),
    highRange: num(o.highRange, d.highRange, 0.4, 0.95),
    shadows: num(o.shadows, d.shadows, -100, 100),
    highlights: num(o.highlights, d.highlights, -100, 100),
    colorBoost: num(o.colorBoost, d.colorBoost, -100, 100),
    mixer: readMixer(o.mixer),
  };
}

function readMixer(v: unknown): RgbMixer {
  const d = defaultMixer();
  const o = (v ?? {}) as Partial<RgbMixer>;
  const rows = Array.isArray(o.rows) && o.rows.length === 3 ? o.rows : d.rows;
  return {
    rows: rows.map((r, i) => [0, 1, 2].map((k) => num(Array.isArray(r) ? r[k] : undefined, d.rows[i][k], -2, 2))) as RgbMixer['rows'],
    mono: o.mono === true,
    preserve: o.preserve === true,
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
