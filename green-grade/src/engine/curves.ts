// 커브 데이터와 LUT 굽기(bake). 셰이더는 여기서 만든 표를 그대로 읽고,
// CPU 기준 구현(color.ts)도 같은 표와 같은 보간을 쓴다.

import { LUMA, type Vec3 } from './constants';

export interface CurvePoint {
  x: number;
  y: number;
}

export type CustomCurveName = 'y' | 'r' | 'g' | 'b';
export type HueCurveName = 'hueHue' | 'hueSat' | 'hueLum' | 'lumSat';

export type CurvesParams = Record<CustomCurveName, CurvePoint[]> & Record<HueCurveName, CurvePoint[]>;

export const CUSTOM_CURVES: CustomCurveName[] = ['y', 'r', 'g', 'b'];
export const HUE_CURVES: HueCurveName[] = ['hueHue', 'hueSat', 'hueLum', 'lumSat'];

export const HUE_CURVE_LABELS: Record<HueCurveName, string> = {
  hueHue: 'Hue vs Hue',
  hueSat: 'Hue vs Sat',
  hueLum: 'Hue vs Lum',
  lumSat: 'Lum vs Sat',
};

/** Hue vs Hue 커브 맨 위/아래(y=1/0)에서의 색상 이동량 */
export const HUE_SHIFT_MAX_DEG = 60;

/** 표 해상도. 그레이딩 인코딩 0–1 구간을 1024칸으로 나눈다. */
export const LUT_SIZE = 1024;

/** 커브 표 텍스처의 행 구성: 0 = Y/R/G/B 커스텀, 1 = 색상 커브 3종, 2 = Lum vs Sat */
export const LUT_ROWS = 3;

export const identityCustom = (): CurvePoint[] => [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

export function defaultCurves(): CurvesParams {
  return {
    y: identityCustom(),
    r: identityCustom(),
    g: identityCustom(),
    b: identityCustom(),
    // 색상 커브는 점이 없으면 0.5(변화 없음)인 평평한 선
    hueHue: [],
    hueSat: [],
    hueLum: [],
    lumSat: [],
  };
}

export const isPeriodic = (name: CustomCurveName | HueCurveName) => name === 'hueHue' || name === 'hueSat' || name === 'hueLum';

/**
 * 단조 3차 보간(Fritsch–Carlson). 점 사이에서 값이 튀어 오르지(overshoot) 않으므로
 * 커브가 계조를 뒤집거나 클리핑을 만들지 않는다.
 */
function monotoneEvaluator(pts: CurvePoint[]): (x: number) => number {
  const n = pts.length;
  if (n === 0) return () => 0.5;
  if (n === 1) return () => pts[0].y;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-9, xs[i + 1] - xs[i]));
  const m: number[] = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * m[i + 1]
    );
  };
}

const sortPts = (pts: CurvePoint[]) => [...pts].sort((a, b) => a.x - b.x);

/** 커스텀 커브(0–1, 양 끝 고정) 평가기 */
export function customEvaluator(pts: CurvePoint[]) {
  return monotoneEvaluator(sortPts(pts));
}

/** 주기 커브(색상축 0과 1이 같은 점) 평가기. 점을 앞뒤로 한 바퀴씩 복제해 이음매를 없앤다. */
export function periodicEvaluator(pts: CurvePoint[]) {
  if (pts.length <= 1) return monotoneEvaluator(pts);
  const s = sortPts(pts);
  const ext = [...s.map((p) => ({ x: p.x - 1, y: p.y })), ...s, ...s.map((p) => ({ x: p.x + 1, y: p.y }))];
  const f = monotoneEvaluator(ext);
  return (x: number) => f(x - Math.floor(x));
}

export function evaluatorFor(name: CustomCurveName | HueCurveName, pts: CurvePoint[]) {
  return isPeriodic(name) ? periodicEvaluator(pts) : customEvaluator(pts);
}

export interface CurveLuts {
  /** LUT_SIZE × LUT_ROWS × RGBA, 행 우선 */
  data: Float32Array;
  /** 색상 커브(4종) 중 하나라도 평평하지 않은가 */
  hueActive: boolean;
}

const isFlat = (pts: CurvePoint[]) => pts.every((p) => Math.abs(p.y - 0.5) < 1e-6);

export function bakeCurves(c: CurvesParams): CurveLuts {
  const data = new Float32Array(LUT_SIZE * LUT_ROWS * 4);
  const custom = CUSTOM_CURVES.map((n) => customEvaluator(c[n]));
  const hue = (['hueHue', 'hueSat', 'hueLum'] as const).map((n) => periodicEvaluator(c[n]));
  const lumSat = customEvaluator(c.lumSat.length ? c.lumSat : [{ x: 0, y: 0.5 }]);
  for (let i = 0; i < LUT_SIZE; i++) {
    const x = i / (LUT_SIZE - 1);
    const hx = i / LUT_SIZE;
    for (let k = 0; k < 4; k++) data[i * 4 + k] = custom[k](x);
    const r1 = (LUT_SIZE + i) * 4;
    for (let k = 0; k < 3; k++) data[r1 + k] = hue[k](hx);
    data[(2 * LUT_SIZE + i) * 4] = lumSat(x);
  }
  return { data, hueActive: !(isFlat(c.hueHue) && isFlat(c.hueSat) && isFlat(c.hueLum) && isFlat(c.lumSat)) };
}

// ── 표 조회. 셰이더의 같은 이름 함수와 1:1 ──

/** 커스텀 커브 표(0행) 조회. 0–1 밖은 끝점의 차이만큼 평행 이동해 슈퍼화이트를 보존한다. */
export function lookupCustom(data: Float32Array, ch: number, p: number): number {
  const q = Math.min(1, Math.max(0, p));
  const f = q * (LUT_SIZE - 1);
  const i0 = Math.min(LUT_SIZE - 2, Math.floor(f));
  const t = f - i0;
  const v = data[i0 * 4 + ch] * (1 - t) + data[(i0 + 1) * 4 + ch] * t;
  return v + (p - q);
}

/** 주기 표(1행) 조회 */
export function lookupHue(data: Float32Array, ch: number, h: number): number {
  const f = (h - Math.floor(h)) * LUT_SIZE;
  const i0 = Math.floor(f) % LUT_SIZE;
  const i1 = (i0 + 1) % LUT_SIZE;
  const t = f - Math.floor(f);
  const row = LUT_SIZE * 4;
  return data[row + i0 * 4 + ch] * (1 - t) + data[row + i1 * 4 + ch] * t;
}

/** Lum vs Sat 표(2행) 조회 */
export function lookupLumSat(data: Float32Array, y: number): number {
  const q = Math.min(1, Math.max(0, y));
  const f = q * (LUT_SIZE - 1);
  const i0 = Math.min(LUT_SIZE - 2, Math.floor(f));
  const t = f - i0;
  const row = 2 * LUT_SIZE * 4;
  return data[row + i0 * 4] * (1 - t) + data[row + (i0 + 1) * 4] * t;
}

// ── 색상축 ──

/** 순수 빨강의 Cb/Cr 각도. 색상축 0은 빨강에서 시작한다. */
export const RED_ANGLE = Math.atan2((1 - LUMA[0]) / 1.5748, -LUMA[0] / 1.8556);

/** 그레이딩 인코딩 RGB → 색상축 위치(0–1). 빨강→노랑→초록→청록→파랑→마젠타 순. */
export function hueOf(p: Vec3): number {
  const y = LUMA[0] * p[0] + LUMA[1] * p[1] + LUMA[2] * p[2];
  const cb = (p[2] - y) / 1.8556;
  const cr = (p[0] - y) / 1.5748;
  const h = (Math.atan2(cr, cb) - RED_ANGLE) / (2 * Math.PI);
  return h - Math.floor(h);
}

/** 색상축 위치 → 화면 표시용 sRGB 색 (커브 배경 그라디언트) */
export function hueSwatch(h: number, chroma = 0.22, luma = 0.55): Vec3 {
  const a = h * 2 * Math.PI + RED_ANGLE;
  const cb = chroma * Math.cos(a);
  const cr = chroma * Math.sin(a);
  const r = luma + 1.5748 * cr;
  const b = luma + 1.8556 * cb;
  const g = (luma - LUMA[0] * r - LUMA[2] * b) / LUMA[1];
  return [r, g, b].map((v) => Math.min(1, Math.max(0, v))) as Vec3;
}

/** 빨강·노랑·초록·청록·파랑·마젠타의 색상축 위치 (Hue 커브 '6점 추가'용) */
export const SIX_VECTORS: Array<[string, number]> = (
  [
    ['R', [1, 0, 0]],
    ['Y', [1, 1, 0]],
    ['G', [0, 1, 0]],
    ['C', [0, 1, 1]],
    ['B', [0, 0, 1]],
    ['M', [1, 0, 1]],
  ] as Array<[string, Vec3]>
).map(([n, c]) => [n, hueOf(c)]);
