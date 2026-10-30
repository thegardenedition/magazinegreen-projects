// 색처리 파이프라인의 기준(reference) 구현.
// GLSL 셰이더(shaders.ts)는 이 파일의 수식을 그대로 옮긴 것이며,
// 단위 테스트와 E2E 테스트가 둘의 결과가 같은지 검증한다.

import { GRADING_GAMMA, LUMA, type Vec3 } from './constants';
import { bakeCurves, defaultCurves, lookupCustom, lookupHue, lookupLumSat, RED_ANGLE, HUE_SHIFT_MAX_DEG, type CurveLuts } from './curves';

export { GRADING_GAMMA, LUMA, type Vec3 };

export interface WheelValue {
  /** 휠 위 색 위치. 벡터스코프 기준 U(가로), V(세로). 단위 원 안. */
  x: number;
  y: number;
  /** 하단 다이얼 값 (밝기) */
  master: number;
}

export type WheelName = 'lift' | 'gamma' | 'gain' | 'offset';

export interface PrimaryParams {
  lift: WheelValue;
  gamma: WheelValue;
  gain: WheelValue;
  offset: WheelValue;
  temperature: number;
  tint: number;
  contrast: number;
  pivot: number;
  saturation: number;
  hue: number;
}

/** 18% 그레이가 그레이딩 인코딩에서 갖는 값 ≈ 0.490 */
export const MID_GREY_PIVOT = Math.pow(0.18, 1 / GRADING_GAMMA);

interface WheelSpec {
  label: string;
  masterDefault: number;
  masterMin: number;
  masterMax: number;
  /** 휠 가장자리(반지름 1)에서 채널에 더해지는 색 변화량의 배율 */
  colorScale: number;
  unit: string;
}

export const WHEEL_SPECS: Record<WheelName, WheelSpec> = {
  lift: { label: 'Lift', masterDefault: 0, masterMin: -0.5, masterMax: 0.5, colorScale: 0.1, unit: '' },
  gamma: { label: 'Gamma', masterDefault: 0, masterMin: -0.9, masterMax: 1, colorScale: 0.25, unit: '' },
  gain: { label: 'Gain', masterDefault: 1, masterMin: 0, masterMax: 4, colorScale: 0.25, unit: '' },
  offset: { label: 'Offset', masterDefault: 0, masterMin: -4, masterMax: 4, colorScale: 0.5, unit: 'EV' },
};

export interface ScalarSpec {
  label: string;
  def: number;
  min: number;
  max: number;
  step: number;
}

export type ScalarName = 'temperature' | 'tint' | 'contrast' | 'pivot' | 'saturation' | 'hue';

export const SCALAR_SPECS: Record<ScalarName, ScalarSpec> = {
  temperature: { label: 'Temp', def: 0, min: -100, max: 100, step: 1 },
  tint: { label: 'Tint', def: 0, min: -100, max: 100, step: 1 },
  contrast: { label: 'Contrast', def: 1, min: 0, max: 2, step: 0.01 },
  pivot: { label: 'Pivot', def: round(MID_GREY_PIVOT, 3), min: 0, max: 1, step: 0.001 },
  saturation: { label: 'Sat', def: 1, min: 0, max: 2, step: 0.01 },
  hue: { label: 'Hue', def: 0, min: -180, max: 180, step: 1 },
};

function round(v: number, digits: number) {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}

export function defaultWheel(name: WheelName): WheelValue {
  return { x: 0, y: 0, master: WHEEL_SPECS[name].masterDefault };
}

export function defaultPrimary(): PrimaryParams {
  return {
    lift: defaultWheel('lift'),
    gamma: defaultWheel('gamma'),
    gain: defaultWheel('gain'),
    offset: defaultWheel('offset'),
    temperature: SCALAR_SPECS.temperature.def,
    tint: SCALAR_SPECS.tint.def,
    contrast: SCALAR_SPECS.contrast.def,
    pivot: SCALAR_SPECS.pivot.def,
    saturation: SCALAR_SPECS.saturation.def,
    hue: SCALAR_SPECS.hue.def,
  };
}

/**
 * 휠 위치(U,V) → 휘도 0인 RGB 색 편차. BT.709 YUV→RGB 식에서 Y=0으로 둔 값.
 * 휘도가 0이므로 휠을 돌려도 밝기는 다이얼만 결정한다.
 */
export function chromaToRgb(u: number, v: number): Vec3 {
  const r = 1.5748 * v;
  const b = 1.8556 * u;
  // G는 휘도가 정확히 0이 되도록 R·B에서 역산 (≈ −0.1873u − 0.4681v)
  return [r, -(LUMA[0] * r + LUMA[2] * b) / LUMA[1], b];
}

/** 휠 하나의 R/G/B 채널 값 (master + 색 편차) */
export function wheelChannels(name: WheelName, w: WheelValue): Vec3 {
  const d = chromaToRgb(w.x, w.y);
  const s = WHEEL_SPECS[name].colorScale;
  return [w.master + s * d[0], w.master + s * d[1], w.master + s * d[2]];
}

/** R/G/B 채널 값을 직접 입력했을 때 휠 값으로 되돌린다 (wheelChannels의 역함수, 원 밖은 가장자리로). */
export function channelsToWheel(name: WheelName, rgb: Vec3): WheelValue {
  const master = LUMA[0] * rgb[0] + LUMA[1] * rgb[1] + LUMA[2] * rgb[2];
  const s = WHEEL_SPECS[name].colorScale;
  let x = (rgb[2] - master) / (1.8556 * s);
  let y = (rgb[0] - master) / (1.5748 * s);
  const r = Math.hypot(x, y);
  if (r > 1) {
    x /= r;
    y /= r;
  }
  return { x, y, master };
}

/** 셰이더에 넘기는 값. PrimaryParams를 수식에 바로 쓸 수 있는 형태로 정리한 것. */
export interface GradeUniforms {
  enabled: boolean;
  wb: Vec3;
  offsetMul: Vec3;
  gainMul: Vec3;
  lift: Vec3;
  gammaExp: Vec3;
  contrast: number;
  pivot: number;
  saturation: number;
  /** 열 우선(column-major) 3x3, WebGL uniformMatrix3fv 순서 */
  hueMatrix: number[];
  /** 커브 표 (curves.ts의 bakeCurves) */
  curves: CurveLuts;
}

let identityLuts: CurveLuts | null = null;
/** 모든 커브가 기본값인 표 (한 번만 굽는다) */
export function identityCurveLuts(): CurveLuts {
  return (identityLuts ??= bakeCurves(defaultCurves()));
}

export function whiteBalanceGains(temperature: number, tint: number): Vec3 {
  const t = temperature / 100;
  const g = tint / 100;
  const raw: Vec3 = [1 + 0.25 * t, 1 - 0.25 * g, 1 - 0.25 * t];
  // 중립 회색의 휘도가 변하지 않도록 정규화
  const k = 1 / (LUMA[0] * raw[0] + LUMA[1] * raw[1] + LUMA[2] * raw[2]);
  return [raw[0] * k, raw[1] * k, raw[2] * k];
}

/** 회색 축 (1,1,1)을 중심으로 한 색상 회전. 무채색은 그대로 둔다. */
export function hueRotationMatrix(degrees: number): number[] {
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const k = (1 - c) / 3;
  const q = s / Math.sqrt(3);
  // 행 우선으로 정의한 뒤 열 우선으로 펼친다
  const m = [
    [c + k, k - q, k + q],
    [k + q, c + k, k - q],
    [k - q, k + q, c + k],
  ];
  return [m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]];
}

export function toUniforms(
  p: PrimaryParams,
  opts: { enabled?: boolean; curves?: CurveLuts } = {},
): GradeUniforms {
  const enabled = opts.enabled ?? true;
  const off = wheelChannels('offset', p.offset);
  const gain = wheelChannels('gain', p.gain);
  const lift = wheelChannels('lift', p.lift);
  const gamma = wheelChannels('gamma', p.gamma);
  return {
    enabled,
    wb: whiteBalanceGains(p.temperature, p.tint),
    offsetMul: off.map((ev) => Math.pow(2, ev)) as Vec3,
    gainMul: gain.map((g) => Math.max(0, g)) as Vec3,
    lift,
    gammaExp: gamma.map((g) => 1 / (1 + Math.max(-0.95, g))) as Vec3,
    contrast: p.contrast,
    pivot: p.pivot,
    saturation: p.saturation,
    hueMatrix: hueRotationMatrix(p.hue),
    curves: opts.curves ?? identityCurveLuts(),
  };
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function spow(x: number, e: number): number {
  return Math.sign(x) * Math.pow(Math.abs(x), e);
}

/**
 * 선형 RGB에 Primary 보정을 적용한다 (셰이더 gradeLinear와 동일).
 *  1) 화이트밸런스      — 선형, 채널 곱
 *  2) Offset           — 선형, 노출(EV) 곱
 *  3) Gain             — 선형, 채널 곱
 *  4) 그레이딩 인코딩    — x^(1/2.4)
 *  5) Lift             — p + lift·(1−p)
 *  6) Gamma            — p^(1/(1+g))
 *  7) Contrast/Pivot   — (p−pivot)·contrast + pivot
 *  8) Custom Curves    — Y(전 채널) → R/G/B 순
 *  9) 선형 복귀         — p^2.4
 * 10) Saturation       — 휘도 기준 채도
 * 11) Hue              — 회색 축 회전
 * 12) Hue/Lum 커브      — 그레이딩 인코딩의 Y'CbCr에서 색상각·채도·휘도 조정
 */
export function gradeLinear(rgb: Vec3, u: GradeUniforms): Vec3 {
  if (!u.enabled) return [...rgb] as Vec3;
  let c = rgb.map((v, i) => v * u.wb[i] * u.offsetMul[i] * u.gainMul[i]);
  c = c.map((v, i) => {
    let p = spow(v, 1 / GRADING_GAMMA);
    p = p + u.lift[i] * (1 - p);
    p = spow(p, u.gammaExp[i]);
    p = (p - u.pivot) * u.contrast + u.pivot;
    p = lookupCustom(u.curves.data, 0, p);
    p = lookupCustom(u.curves.data, 1 + i, p);
    return spow(p, GRADING_GAMMA);
  });
  const y = LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];
  c = c.map((v) => y + (v - y) * u.saturation);
  const m = u.hueMatrix;
  const out: Vec3 = [
    m[0] * c[0] + m[3] * c[1] + m[6] * c[2],
    m[1] * c[0] + m[4] * c[1] + m[7] * c[2],
    m[2] * c[0] + m[5] * c[1] + m[8] * c[2],
  ];
  return u.curves.hueActive ? applyHueCurves(out, u.curves) : out;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 셰이더 applyHueCurves와 동일 */
export function applyHueCurves(lin: Vec3, l: CurveLuts): Vec3 {
  const p = lin.map((v) => spow(v, 1 / GRADING_GAMMA));
  let y = LUMA[0] * p[0] + LUMA[1] * p[1] + LUMA[2] * p[2];
  let cb = (p[2] - y) / 1.8556;
  let cr = (p[0] - y) / 1.5748;
  const chroma = Math.hypot(cb, cr);
  // 무채색은 색상각이 정의되지 않으므로 건드리지 않는다
  if (chroma < 1e-6) return [...lin] as Vec3;
  const a0 = Math.atan2(cr, cb);
  let h = (a0 - RED_ANGLE) / (2 * Math.PI);
  h -= Math.floor(h);
  const shift = (lookupHue(l.data, 0, h) - 0.5) * 2 * ((HUE_SHIFT_MAX_DEG * Math.PI) / 180);
  const sat = 2 * lookupHue(l.data, 1, h) * 2 * lookupLumSat(l.data, y);
  const lum = 1 + (lookupHue(l.data, 2, h) - 0.5) * smoothstep(0, 0.02, chroma);
  const a = a0 + shift;
  const c2 = chroma * sat;
  y *= lum;
  cb = c2 * Math.cos(a);
  cr = c2 * Math.sin(a);
  const r = y + 1.5748 * cr;
  const b = y + 1.8556 * cb;
  const g = (y - LUMA[0] * r - LUMA[2] * b) / LUMA[1];
  return [spow(r, GRADING_GAMMA), spow(g, GRADING_GAMMA), spow(b, GRADING_GAMMA)];
}

/** 8bit sRGB 픽셀 하나를 처리 (디더링 없음). E2E에서 GPU 결과와 비교하는 기준값. */
export function gradePixel8(rgb8: Vec3, u: GradeUniforms): Vec3 {
  const lin = rgb8.map((v) => srgbToLinear(v / 255)) as Vec3;
  const out = gradeLinear(lin, u);
  return out.map((v) => Math.round(Math.min(1, Math.max(0, linearToSrgb(Math.min(1, Math.max(0, v))))) * 255)) as Vec3;
}
