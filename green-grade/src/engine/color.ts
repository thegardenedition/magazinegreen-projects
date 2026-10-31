// 색처리 파이프라인의 기준(reference) 구현.
// GLSL 셰이더(shaders.ts)는 이 파일의 수식을 그대로 옮긴 것이며,
// 단위 테스트와 E2E 테스트가 둘의 결과가 같은지 검증한다.

import { GRADING_GAMMA, LUMA, type Vec3 } from './constants';
import { sampleLut, type LutUniform } from './lut';
import { maskWeight, type MaskUniform } from './mask';
import { bakeCurves, defaultCurves, lookupCustom, lookupHue, lookupLumSat, RED_ANGLE, HUE_SHIFT_MAX_DEG, SAT_AXIS_SCALE, type CurveLuts } from './curves';

export { GRADING_GAMMA, LUMA, type Vec3 };

export interface WheelValue {
  /** 휠 위 색 위치. 벡터스코프 기준 U(가로), V(세로). 단위 원 안. */
  x: number;
  y: number;
  /** 하단 다이얼 값 (밝기) */
  master: number;
}

export type WheelName = 'lift' | 'gamma' | 'gain' | 'offset' | 'shadow' | 'midtone' | 'highlight';

/** RGB Mixer: 출력 채널마다 입력 R·G·B를 섞는 비율 (행 = 출력 R, G, B) */
export interface RgbMixer {
  rows: [Vec3, Vec3, Vec3];
  /** 흑백: 세 출력 채널 모두 '출력 R' 행을 쓴다 */
  mono: boolean;
  /** 휘도 유지: 행마다 합이 1이 되도록 맞춰 밝기가 변하지 않게 한다 */
  preserve: boolean;
}

export interface PrimaryParams {
  lift: WheelValue;
  gamma: WheelValue;
  gain: WheelValue;
  offset: WheelValue;
  /** Log 휠: 그림자·중간·밝은 영역에만 더하는 색·밝기 */
  shadow: WheelValue;
  midtone: WheelValue;
  highlight: WheelValue;
  /** Log 휠 경계: 이 아래가 그림자, highRange 위가 밝은 영역 (그레이딩 인코딩 휘도) */
  lowRange: number;
  highRange: number;
  temperature: number;
  tint: number;
  contrast: number;
  pivot: number;
  saturation: number;
  hue: number;
  /** 어두운 영역 / 밝은 영역 밝기 (−100–100) */
  shadows: number;
  highlights: number;
  /** 채도가 낮은 색일수록 더 올리는 채도 (−100–100) */
  colorBoost: number;
  mixer: RgbMixer;
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
  shadow: { label: 'Shadow', masterDefault: 0, masterMin: -0.5, masterMax: 0.5, colorScale: 0.12, unit: '' },
  midtone: { label: 'Midtone', masterDefault: 0, masterMin: -0.5, masterMax: 0.5, colorScale: 0.12, unit: '' },
  highlight: { label: 'Highlight', masterDefault: 0, masterMin: -0.5, masterMax: 0.5, colorScale: 0.12, unit: '' },
};

export const PRIMARY_WHEELS: WheelName[] = ['lift', 'gamma', 'gain', 'offset'];
export const LOG_WHEELS: WheelName[] = ['shadow', 'midtone', 'highlight', 'offset'];

export interface ScalarSpec {
  label: string;
  def: number;
  min: number;
  max: number;
  step: number;
}

export type ScalarName =
  | 'temperature'
  | 'tint'
  | 'contrast'
  | 'pivot'
  | 'saturation'
  | 'hue'
  | 'shadows'
  | 'highlights'
  | 'colorBoost'
  | 'lowRange'
  | 'highRange';

export const SCALAR_SPECS: Record<ScalarName, ScalarSpec> = {
  temperature: { label: 'Temp', def: 0, min: -100, max: 100, step: 1 },
  tint: { label: 'Tint', def: 0, min: -100, max: 100, step: 1 },
  contrast: { label: 'Contrast', def: 1, min: 0, max: 2, step: 0.01 },
  pivot: { label: 'Pivot', def: round(MID_GREY_PIVOT, 3), min: 0, max: 1, step: 0.001 },
  saturation: { label: 'Sat', def: 1, min: 0, max: 2, step: 0.01 },
  hue: { label: 'Hue', def: 0, min: -180, max: 180, step: 1 },
  shadows: { label: 'Shadows', def: 0, min: -100, max: 100, step: 1 },
  highlights: { label: 'Highlights', def: 0, min: -100, max: 100, step: 1 },
  colorBoost: { label: 'Color Boost', def: 0, min: -100, max: 100, step: 1 },
  lowRange: { label: 'Low Range', def: 0.333, min: 0.05, max: 0.6, step: 0.001 },
  highRange: { label: 'High Range', def: 0.55, min: 0.4, max: 0.95, step: 0.001 },
};

export function defaultMixer(): RgbMixer {
  return { rows: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], mono: false, preserve: false };
}

/** RGB Mixer → 3×3 행렬 (행 우선, 출력 = M · 입력) */
export function mixerMatrix(m: RgbMixer): number[][] {
  const rows = (m.mono ? [m.rows[0], m.rows[0], m.rows[0]] : m.rows).map((r) => {
    if (!m.preserve) return [...r];
    const sum = r[0] + r[1] + r[2];
    return Math.abs(sum) < 1e-6 ? [...r] : r.map((v) => v / sum);
  });
  return rows;
}

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
    shadow: defaultWheel('shadow'),
    midtone: defaultWheel('midtone'),
    highlight: defaultWheel('highlight'),
    lowRange: SCALAR_SPECS.lowRange.def,
    highRange: SCALAR_SPECS.highRange.def,
    shadows: SCALAR_SPECS.shadows.def,
    highlights: SCALAR_SPECS.highlights.def,
    colorBoost: SCALAR_SPECS.colorBoost.def,
    mixer: defaultMixer(),
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
  /** Shadows·Highlights 막대 (−1–1) */
  shadows: number;
  highlights: number;
  /** Color Boost (−1–1) */
  colorBoost: number;
  /** Log 휠의 R/G/B 더할 값과 경계 */
  logShadow: Vec3;
  logMidtone: Vec3;
  logHighlight: Vec3;
  lowRange: number;
  highRange: number;
  /** 열 우선(column-major) 3x3, WebGL uniformMatrix3fv 순서. 색상 회전 × RGB Mixer */
  hueMatrix: number[];
  /** 커브 표 (curves.ts의 bakeCurves) */
  curves: CurveLuts;
  /** 노드 끝에 적용하는 3D LUT */
  lut: LutUniform | null;
  /** Qualifier·Window. null이면 화면 전체에 적용 */
  mask: MaskUniform | null;
}

/** 픽셀 위치 (마스크 계산용). u, v는 이미지 0–1, aspect = 가로/세로 */
export interface PixelPos {
  u: number;
  v: number;
  aspect: number;
}

const CENTER: PixelPos = { u: 0.5, v: 0.5, aspect: 1 };

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

/** 색상 회전 · RGB Mixer를 하나의 열 우선 행렬로 (Mixer 먼저) */
function combinedMatrix(hueDeg: number, mixer: RgbMixer): number[] {
  const h = hueRotationMatrix(hueDeg); // 열 우선
  const H = [0, 1, 2].map((r) => [0, 1, 2].map((c) => h[c * 3 + r]));
  const M = mixerMatrix(mixer);
  const P = H.map((row) => [0, 1, 2].map((c) => row[0] * M[0][c] + row[1] * M[1][c] + row[2] * M[2][c]));
  return [P[0][0], P[1][0], P[2][0], P[0][1], P[1][1], P[2][1], P[0][2], P[1][2], P[2][2]];
}

export function toUniforms(
  p: PrimaryParams,
  opts: { enabled?: boolean; curves?: CurveLuts; lut?: LutUniform | null; mask?: MaskUniform | null } = {},
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
    shadows: (p.shadows ?? 0) / 100,
    highlights: (p.highlights ?? 0) / 100,
    colorBoost: (p.colorBoost ?? 0) / 100,
    logShadow: wheelChannels('shadow', p.shadow ?? defaultWheel('shadow')),
    logMidtone: wheelChannels('midtone', p.midtone ?? defaultWheel('midtone')),
    logHighlight: wheelChannels('highlight', p.highlight ?? defaultWheel('highlight')),
    lowRange: p.lowRange ?? SCALAR_SPECS.lowRange.def,
    highRange: Math.max((p.lowRange ?? SCALAR_SPECS.lowRange.def) + 0.02, p.highRange ?? SCALAR_SPECS.highRange.def),
    hueMatrix: combinedMatrix(p.hue, p.mixer ?? defaultMixer()),
    curves: opts.curves ?? identityCurveLuts(),
    lut: opts.lut ?? null,
    mask: opts.mask ?? null,
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
 * 13) LUT              — sRGB 코드값으로 바꿔 3D LUT, 선형으로 돌아와 강도만큼 섞음
 * 14) 마스크            — 노드 입력 색·위치로 구한 마스크만큼 입력과 결과를 섞음
 */
export function gradeLinear(rgb: Vec3, u: GradeUniforms, pos: PixelPos = CENTER): Vec3 {
  if (!u.enabled) return [...rgb] as Vec3;
  const graded = gradeUnmasked(rgb, u);
  if (!u.mask) return graded;
  const m = maskWeight(u.mask, rgb, pos.u, pos.v, pos.aspect);
  return graded.map((g, i) => rgb[i] + (g - rgb[i]) * m) as Vec3;
}

function gradeUnmasked(rgb: Vec3, u: GradeUniforms): Vec3 {
  if (!u.enabled) return [...rgb] as Vec3;
  let c = rgb.map((v, i) => v * u.wb[i] * u.offsetMul[i] * u.gainMul[i]);
  let p = c.map((v, i) => {
    let q = spow(v, 1 / GRADING_GAMMA);
    q = q + u.lift[i] * (1 - q);
    q = spow(q, u.gammaExp[i]);
    return (q - u.pivot) * u.contrast + u.pivot;
  });
  p = applyZones(p as Vec3, u);
  c = p.map((q, i) => {
    q = lookupCustom(u.curves.data, 0, q);
    q = lookupCustom(u.curves.data, 1 + i, q);
    return spow(q, GRADING_GAMMA);
  });
  const y = LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];
  c = c.map((v) => y + (v - y) * u.saturation);
  if (u.colorBoost !== 0) c = applyColorBoost(c as Vec3, u.colorBoost);
  const m = u.hueMatrix;
  const out: Vec3 = [
    m[0] * c[0] + m[3] * c[1] + m[6] * c[2],
    m[1] * c[0] + m[4] * c[1] + m[7] * c[2],
    m[2] * c[0] + m[5] * c[1] + m[8] * c[2],
  ];
  const graded = u.curves.hueActive ? applyHueCurves(out, u.curves) : out;
  return u.lut && u.lut.intensity > 0 ? applyLut(graded, u.lut) : graded;
}

const smooth01 = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(b - a, 1e-5)));
  return t * t * (3 - 2 * t);
};

/**
 * 그레이딩 인코딩에서 휘도 구간별 조정 (셰이더 applyZones와 동일).
 *  - Shadows / Highlights 막대: 어두운·밝은 영역 밝기를 올리고 내린다
 *  - Log 휠: lowRange 아래 = Shadow, highRange 위 = Highlight, 사이 = Midtone 에 색·밝기를 더한다
 */
export function applyZones(p: Vec3, u: GradeUniforms): Vec3 {
  const y = LUMA[0] * p[0] + LUMA[1] * p[1] + LUMA[2] * p[2];
  const yc = Math.min(1, Math.max(0, y));
  let d = 0;
  if (u.shadows !== 0) d += u.shadows * 0.25 * Math.pow(1 - smooth01(0, 0.6, yc), 2);
  if (u.highlights !== 0) d += u.highlights * 0.25 * Math.pow(smooth01(0.4, 1, yc), 2);
  const ws = 1 - smooth01(u.lowRange * 0.5, u.lowRange * 1.5, yc);
  const span = 1 - u.highRange;
  const wh = smooth01(u.highRange - span * 0.5, u.highRange + span * 0.5, yc);
  const wm = Math.max(0, 1 - ws - wh);
  return [0, 1, 2].map((i) => p[i] + d + ws * u.logShadow[i] + wm * u.logMidtone[i] + wh * u.logHighlight[i]) as Vec3;
}

/** Color Boost: 채도가 낮은 색일수록 채도를 더 올린다 (셰이더 applyColorBoost와 동일) */
export function applyColorBoost(c: Vec3, k: number): Vec3 {
  const mx = Math.max(c[0], c[1], c[2]);
  const mn = Math.min(c[0], c[1], c[2]);
  const s = mx > 1e-6 ? (mx - mn) / mx : 0;
  const f = 1 + k * (1 - Math.min(1, s));
  const y = LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];
  return c.map((v) => y + (v - y) * f) as Vec3;
}

/** 셰이더 applyLut과 동일 */
export function applyLut(lin: Vec3, l: LutUniform): Vec3 {
  const s = lin.map((v) => linearToSrgb(Math.min(1, Math.max(0, v)))) as Vec3;
  const o = sampleLut(l.lut, s);
  return lin.map((v, i) => {
    const t = srgbToLinear(o[i]);
    return v + (t - v) * l.intensity;
  }) as Vec3;
}

/** 노드를 순서대로 통과시킨다 (Serial). 꺼진 노드는 건너뛴다. */
export function gradeChain(rgb: Vec3, chain: GradeUniforms[], pos: PixelPos = CENTER): Vec3 {
  return chain.reduce((c, u) => gradeLinear(c, u, pos), rgb);
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
  const sx = Math.min(1, chroma / SAT_AXIS_SCALE);
  const sat = 2 * lookupHue(l.data, 1, h) * 2 * lookupLumSat(l.data, y) * 2 * lookupLumSat(l.data, sx, 1);
  const edge = smoothstep(0, 0.02, chroma);
  const lum = (1 + (lookupHue(l.data, 2, h) - 0.5) * edge) * (1 + (lookupLumSat(l.data, sx, 2) - 0.5) * edge);
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
export function gradePixel8(rgb8: Vec3, u: GradeUniforms | GradeUniforms[], pos: PixelPos = CENTER): Vec3 {
  const lin = rgb8.map((v) => srgbToLinear(v / 255)) as Vec3;
  const out = gradeChain(lin, Array.isArray(u) ? u : [u], pos);
  return out.map((v) => Math.round(Math.min(1, Math.max(0, linearToSrgb(Math.min(1, Math.max(0, v))))) * 255)) as Vec3;
}
