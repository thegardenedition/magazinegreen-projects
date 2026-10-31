// 사진 한 장 단위의 현상(develop) 단계.
//  형태: 90° 회전·반전 → 원근(세로·가로) → 수평(기울기) → 크롭
//  디테일: 노이즈 감소 → 샤프닝·텍스처·선명도 → 디헤이즈
//  그레인: 노드 보정이 끝난 뒤 출력 직전에 더한다 (shaders.ts encodeOutput)
// 노드 보정보다 앞에서 한 번 처리하고, 결과(선형 RGB)를 노드 체인의 입력으로 쓴다.
// GPU(developGL.ts)와 같은 수식의 CPU 기준 구현을 함께 둔다.

import { GRADING_GAMMA, LUMA, type Vec3 } from './constants';

// ── 값 ──

export type Rotation = 0 | 90 | 180 | 270;
export type AspectId = 'free' | 'original' | '1:1' | '4:5' | '5:4' | '3:2' | '2:3' | '16:9' | '9:16';

export const ASPECTS: Array<[AspectId, string]> = [
  ['free', '자유'],
  ['original', '원본'],
  ['1:1', '1:1'],
  ['4:5', '4:5'],
  ['5:4', '5:4'],
  ['3:2', '3:2'],
  ['2:3', '2:3'],
  ['16:9', '16:9'],
  ['9:16', '9:16'],
];

/** 변형된 프레임 기준 0–1 좌표의 사각형 (좌상단 + 크기) */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_RECT: Rect = { x: 0, y: 0, w: 1, h: 1 };

export interface Geometry {
  /** 시계 방향 90° 단위 회전 */
  rotate: Rotation;
  flipH: boolean;
  flipV: boolean;
  /** 수평 보정(도). 시계 방향이 + */
  straighten: number;
  /** 세로 원근 −100–100. +면 위쪽을 넓혀 위로 모이는 수직선을 편다 */
  vertical: number;
  /** 가로 원근 −100–100. +면 왼쪽을 넓힌다 */
  horizontal: number;
  crop: Rect;
  aspect: AspectId;
  /** 크롭을 직접 고치지 않았으면, 형태가 바뀔 때마다 빈 모서리 없는 최대 크기로 다시 맞춘다 */
  cropAuto: boolean;
}

export type DetailName =
  | 'sharpen'
  | 'sharpenRadius'
  | 'sharpenMasking'
  | 'noiseLuma'
  | 'noiseColor'
  | 'texture'
  | 'clarity'
  | 'dehaze'
  | 'grain'
  | 'grainSize'
  | 'vignette'
  | 'vignetteMidpoint'
  | 'vignetteFeather'
  | 'glow'
  | 'halation';

export type Detail = Record<DetailName, number>;

export interface Develop {
  geometry: Geometry;
  detail: Detail;
}

export interface DetailSpec {
  label: string;
  group: string;
  def: number;
  min: number;
  max: number;
  step: number;
}

export const DETAIL_SPECS: Record<DetailName, DetailSpec> = {
  sharpen: { label: '양', group: '샤프닝', def: 0, min: 0, max: 150, step: 1 },
  sharpenRadius: { label: '반경', group: '샤프닝', def: 1, min: 0.5, max: 3, step: 0.1 },
  sharpenMasking: { label: '마스킹', group: '샤프닝', def: 0, min: 0, max: 100, step: 1 },
  noiseLuma: { label: '휘도', group: '노이즈 감소', def: 0, min: 0, max: 100, step: 1 },
  noiseColor: { label: '색상', group: '노이즈 감소', def: 0, min: 0, max: 100, step: 1 },
  texture: { label: '텍스처', group: '질감', def: 0, min: -100, max: 100, step: 1 },
  clarity: { label: '선명도', group: '질감', def: 0, min: -100, max: 100, step: 1 },
  dehaze: { label: '디헤이즈', group: '질감', def: 0, min: -100, max: 100, step: 1 },
  grain: { label: '양', group: '그레인', def: 0, min: 0, max: 100, step: 1 },
  grainSize: { label: '크기', group: '그레인', def: 100, min: 50, max: 300, step: 5 },
  vignette: { label: '비네트', group: '효과', def: 0, min: -100, max: 100, step: 1 },
  vignetteMidpoint: { label: '비네트 중심', group: '효과', def: 50, min: 0, max: 100, step: 1 },
  vignetteFeather: { label: '비네트 부드러움', group: '효과', def: 50, min: 0, max: 100, step: 1 },
  glow: { label: '글로우', group: '효과', def: 0, min: 0, max: 100, step: 1 },
  halation: { label: '할레이션', group: '효과', def: 0, min: 0, max: 100, step: 1 },
};

export const DETAIL_NAMES = Object.keys(DETAIL_SPECS) as DetailName[];

export function defaultGeometry(): Geometry {
  return {
    rotate: 0,
    flipH: false,
    flipV: false,
    straighten: 0,
    vertical: 0,
    horizontal: 0,
    crop: { ...FULL_RECT },
    aspect: 'original',
    cropAuto: true,
  };
}

export function defaultDetail(): Detail {
  return Object.fromEntries(DETAIL_NAMES.map((n) => [n, DETAIL_SPECS[n].def])) as Detail;
}

export function defaultDevelop(): Develop {
  return { geometry: defaultGeometry(), detail: defaultDetail() };
}

// ── 형태 ──

/** 원근 슬라이더 ±100에 해당하는 사영 계수 */
export const PERSPECTIVE_MAX = 0.7;
/** 원본 밖 판정 여유 */
export const OUTSIDE_EPS = 1e-5;
/** 크롭의 최소 크기 (프레임 비율) */
export const MIN_CROP = 0.02;

/** 행 우선 3×3 */
export type Mat3 = number[];

export function orientedSize(rotate: Rotation, w: number, h: number): [number, number] {
  return rotate % 180 ? [h, w] : [w, h];
}

export function mul3(a: Mat3, b: Mat3): Mat3 {
  const o = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o;
}

export function mapPoint(m: Mat3, x: number, y: number): [number, number] {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

/** 방향(회전·반전)이 적용된 프레임 좌표 → 원본 좌표 */
function orientInverse(g: Geometry): Mat3 {
  const flip: Mat3 = [g.flipH ? -1 : 1, 0, g.flipH ? 1 : 0, 0, g.flipV ? -1 : 1, g.flipV ? 1 : 0, 0, 0, 1];
  const rot: Record<Rotation, Mat3> = {
    0: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    90: [0, 1, 0, -1, 0, 1, 0, 0, 1],
    180: [-1, 0, 1, 0, -1, 1, 0, 0, 1],
    270: [0, -1, 1, 1, 0, 0, 0, 0, 1],
  };
  return mul3(rot[g.rotate], flip);
}

/**
 * 출력 좌표(rect 안의 0–1) → 원본 좌표(0–1) 사영 행렬.
 * 정방향(원본 → 프레임)은 방향 → 원근 P → 회전 R이고, 여기서는 그 역을 쌓는다.
 * 원근·회전은 프레임 높이를 1로 둔 중심 좌표(X: ±aspect/2, Y: ±1/2)에서 계산해 해상도와 무관하다.
 */
export function geometryMatrix(g: Geometry, fullW: number, fullH: number, rect: Rect = g.crop): Mat3 {
  const [W, H] = orientedSize(g.rotate, fullW, fullH);
  const a = W / H;
  const toCentered: Mat3 = [rect.w * a, 0, (rect.x - 0.5) * a, 0, rect.h, rect.y - 0.5, 0, 0, 1];
  const t = (g.straighten * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const rotInv: Mat3 = [c, s, 0, -s, c, 0, 0, 0, 1];
  const kv = (g.vertical / 100) * PERSPECTIVE_MAX;
  const kh = (g.horizontal / 100) * PERSPECTIVE_MAX;
  const perspInv: Mat3 = [1, 0, 0, 0, 1, 0, -kh / a, -kv, 1];
  const toOriented: Mat3 = [1 / a, 0, 0.5, 0, 1, 0.5, 0, 0, 1];
  return mul3(orientInverse(g), mul3(toOriented, mul3(perspInv, mul3(rotInv, toCentered))));
}

/** 회전·원근이 없고 크롭이 전체인지 (rect를 그대로 보여 줄 때 원본과 같은지) */
export function isIdentityGeometry(g: Geometry, rect: Rect = g.crop): boolean {
  return (
    g.rotate === 0 &&
    !g.flipH &&
    !g.flipV &&
    g.straighten === 0 &&
    g.vertical === 0 &&
    g.horizontal === 0 &&
    Math.abs(rect.x) < 1e-9 &&
    Math.abs(rect.y) < 1e-9 &&
    Math.abs(rect.w - 1) < 1e-9 &&
    Math.abs(rect.h - 1) < 1e-9
  );
}

const inside = ([u, v]: [number, number]) =>
  Number.isFinite(u) && Number.isFinite(v) && u >= -1e-9 && v >= -1e-9 && u <= 1 + 1e-9 && v <= 1 + 1e-9;

/** 크롭의 네 모서리가 모두 원본 안에 있는지. 유효 영역이 볼록하므로 사각형 전체가 원본 안에 있는 것과 같다. */
export function cropValid(g: Geometry, fullW: number, fullH: number, crop: Rect): boolean {
  if (crop.x < -1e-9 || crop.y < -1e-9 || crop.x + crop.w > 1 + 1e-9 || crop.y + crop.h > 1 + 1e-9) return false;
  const m = geometryMatrix(g, fullW, fullH, FULL_RECT);
  return [
    [crop.x, crop.y],
    [crop.x + crop.w, crop.y],
    [crop.x, crop.y + crop.h],
    [crop.x + crop.w, crop.y + crop.h],
  ].every(([x, y]) => {
    // 정방향 사상을 직접 구하는 대신 역행렬로 원본 좌표를 구한다
    return inside(mapPoint(m, x, y));
  });
}

/** 비율 이름 → 픽셀 가로/세로 (자유는 null) */
export function ratioOf(aspect: AspectId, g: Geometry, fullW: number, fullH: number): number | null {
  if (aspect === 'free') return null;
  if (aspect === 'original') {
    const [W, H] = orientedSize(g.rotate, fullW, fullH);
    return W / H;
  }
  const [p, q] = aspect.split(':').map(Number);
  return p / q;
}

const centered = (cx: number, cy: number, w: number, h: number): Rect => ({ x: cx - w / 2, y: cy - h / 2, w, h });

/** 중심을 고정하고 크기만 줄여, 유효한 가장 큰 배율을 이분 탐색으로 찾는다 */
function largestScale(valid: (s: number) => boolean): number {
  if (valid(1)) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (valid(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** 주어진 비율에서 빈 모서리 없이 가장 큰, 프레임 중앙의 크롭 */
export function maxCrop(g: Geometry, fullW: number, fullH: number, ratio: number | null): Rect {
  const [W, H] = orientedSize(g.rotate, fullW, fullH);
  const a = W / H;
  const r = ratio ?? a;
  const w0 = Math.min(1, r / a);
  const h0 = (w0 * a) / r;
  const s = largestScale((k) => cropValid(g, fullW, fullH, centered(0.5, 0.5, w0 * k, h0 * k)));
  return centered(0.5, 0.5, w0 * s, h0 * s);
}

/** 크롭을 프레임 안으로 옮기고, 원본 밖이 들어오면 중심을 유지한 채 줄인다 */
export function constrainCrop(g: Geometry, fullW: number, fullH: number, crop: Rect): Rect {
  const w = Math.min(1, Math.max(MIN_CROP, crop.w));
  const h = Math.min(1, Math.max(MIN_CROP, crop.h));
  const c: Rect = { x: Math.min(1 - w, Math.max(0, crop.x)), y: Math.min(1 - h, Math.max(0, crop.y)), w, h };
  if (cropValid(g, fullW, fullH, c)) return c;
  let cx = c.x + w / 2;
  let cy = c.y + h / 2;
  const fits = (k: number) => cropValid(g, fullW, fullH, centered(cx, cy, w * k, h * k));
  if (!fits(1e-4)) {
    cx = 0.5;
    cy = 0.5;
  }
  const s = largestScale(fits);
  return centered(cx, cy, w * s, h * s);
}

/** 형태 값을 바꾸고 크롭을 맞춘다. fullW·fullH는 원본(EXIF 반영) 해상도. */
export function updateGeometry(g: Geometry, patch: Partial<Geometry>, fullW: number, fullH: number): Geometry {
  const next: Geometry = { ...g, ...patch };
  next.straighten = Math.min(45, Math.max(-45, next.straighten));
  next.vertical = Math.min(100, Math.max(-100, next.vertical));
  next.horizontal = Math.min(100, Math.max(-100, next.horizontal));
  const ratio = ratioOf(next.aspect, next, fullW, fullH);
  const orientChanged = patch.rotate !== undefined || patch.flipH !== undefined || patch.flipV !== undefined;
  const aspectChanged = patch.aspect !== undefined && patch.aspect !== g.aspect;

  if (patch.crop) {
    next.crop = constrainCrop(next, fullW, fullH, patch.crop);
    next.cropAuto = false;
  } else if (aspectChanged && next.aspect === 'free') {
    next.crop = constrainCrop(next, fullW, fullH, next.crop);
  } else if (orientChanged || aspectChanged || patch.cropAuto) {
    next.crop = maxCrop(next, fullW, fullH, ratio);
    next.cropAuto = true;
  } else if (next.cropAuto) {
    next.crop = maxCrop(next, fullW, fullH, ratio);
  } else {
    next.crop = constrainCrop(next, fullW, fullH, next.crop);
  }
  return next;
}

/** 크롭 결과의 픽셀 크기 (원본 해상도 기준) */
export function outputSize(g: Geometry, fullW: number, fullH: number, rect: Rect = g.crop): [number, number] {
  const [W, H] = orientedSize(g.rotate, fullW, fullH);
  return [Math.max(1, Math.round(rect.w * W)), Math.max(1, Math.round(rect.h * H))];
}

/** 기준선(프레임 픽셀 방향)을 수평 또는 수직으로 만드는 수평 보정 값 */
export function levelFromLine(straighten: number, dx: number, dy: number): number {
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  // 선의 방향(앞뒤)은 상관없다: −90–90으로
  if (ang > 90) ang -= 180;
  if (ang < -90) ang += 180;
  // 수직에 가까우면 수직으로 맞춘다
  if (Math.abs(ang) > 45) ang -= Math.sign(ang) * 90;
  return Math.min(45, Math.max(-45, Math.round((straighten - ang) * 100) / 100));
}

// ── 디테일 → 셰이더 값 ──

export interface DetailUniforms {
  /** 휘도 노이즈 감소: 공간 σ, 밝기 차 σ, 반경 */
  nrLuma: [number, number, number];
  /** 색상 노이즈 감소: 공간 σ, 섞는 양, 반경 */
  nrColor: [number, number, number];
  /** 샤프닝: 양, 마스킹, σ, 반경 */
  sharpen: [number, number, number, number];
  /** 텍스처: 양, σ, 반경 */
  texture: [number, number, number];
  clarity: number;
  dehaze: number;
  /** 비네트: 양(−1–1), 시작 반경, 퍼짐 */
  vignette: [number, number, number];
  /** 글로우·할레이션 양 (0–1) */
  glow: number;
  halation: number;
}

/** 색상 노이즈 감소가 경계를 넘지 않도록 쓰는 밝기 차 σ */
export const NR_COLOR_EDGE = 0.08;

const radiusOf = (sigma: number, k: number, cap: number) => (sigma < 0.25 ? 0 : Math.min(cap, Math.ceil(k * sigma)));

/**
 * 슬라이더 값 → 셰이더 값.
 * pxScale: 출력 1px이 원본 몇 px인지의 역수(출력 px / 원본 px). 샤프닝·노이즈 반경은 원본 픽셀 기준이라
 * 축소본 미리보기에서는 그만큼 작아진다.
 */
export function detailUniforms(d: Detail, pxScale: number, fullLong: number): DetailUniforms {
  const L = d.noiseLuma / 100;
  const C = d.noiseColor / 100;
  const lumaSigma = (0.8 + 1.2 * L) * pxScale;
  const colorSigma = (1 + 3 * C) * pxScale;
  const sharpSigma = d.sharpenRadius * pxScale;
  const texSigma = Math.min(16, 0.002 * fullLong) * pxScale;
  return {
    nrLuma: L > 0 ? [lumaSigma, 0.01 + 0.07 * L, radiusOf(lumaSigma, 2, 4)] : [1, 1, 0],
    nrColor: C > 0 ? [colorSigma, Math.min(1, 1.5 * C), radiusOf(colorSigma, 2, 6)] : [1, 0, 0],
    sharpen: d.sharpen > 0 ? [d.sharpen / 100, d.sharpenMasking / 100, sharpSigma, radiusOf(sharpSigma, 3, 12)] : [0, 0, 1, 0],
    texture: d.texture !== 0 ? [d.texture / 100, texSigma, radiusOf(texSigma, 3, 48)] : [0, 1, 0],
    clarity: d.clarity / 100,
    dehaze: d.dehaze / 100,
    vignette: [(d.vignette ?? 0) / 100, (d.vignetteMidpoint ?? 50) / 100, 0.05 + (d.vignetteFeather ?? 50) / 100],
    glow: (d.glow ?? 0) / 100,
    halation: (d.halation ?? 0) / 100,
  };
}

/** 디테일 처리(그레인 제외)가 하나라도 켜져 있는지 */
export function detailActive(d: Detail): boolean {
  return (
    d.noiseLuma > 0 ||
    d.noiseColor > 0 ||
    d.sharpen > 0 ||
    d.texture !== 0 ||
    d.clarity !== 0 ||
    d.dehaze !== 0 ||
    !!d.vignette ||
    !!d.glow ||
    !!d.halation
  );
}

export const needsBase = (d: Detail) => d.clarity !== 0 || d.dehaze !== 0 || !!d.glow || !!d.halation;

/** 타일 가장자리에 덧붙일 여유 픽셀 (노이즈 감소 + 블러 반경) */
export function apronOf(du: DetailUniforms): number {
  const nr = Math.max(du.nrLuma[2], du.nrColor[2]);
  const blur = Math.max(du.sharpen[3], du.texture[2]);
  return nr + blur;
}

// ── 그레인 ──

export interface GrainUniforms {
  amount: number;
  /** 출력 0–1 좌표 → 그레인 격자 좌표 배율 */
  scale: [number, number];
}

/**
 * 그레인 알갱이는 원본 해상도 기준으로 크기를 정한다 (긴 변 2000칸 × 크기).
 * 출력 좌표에 묶여 있으므로 미리보기와 원본 내보내기에서 같은 무늬가 나온다.
 */
export function grainUniforms(d: Detail, g: Geometry, fullW: number, fullH: number, rect: Rect = g.crop): GrainUniforms {
  const [W, H] = orientedSize(g.rotate, fullW, fullH);
  const cell = ((d.grainSize / 100) * Math.max(fullW, fullH)) / 2000;
  return { amount: d.grain / 100, scale: [(rect.w * W) / cell, (rect.h * H) / cell] };
}

/** 셰이더 hashU와 같은 32bit 정수 해시 */
export function hashU(x: number, y: number): number {
  let h = (Math.imul(x >>> 0, 0x8da6b343) ^ Math.imul(y >>> 0, 0xd8163841)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

const lattice = (x: number, y: number) => ((hashU(x, y) >>> 8) / 16777216) * 2 - 1;

function valueNoise(qx: number, qy: number): number {
  const ix = Math.floor(qx);
  const iy = Math.floor(qy);
  let fx = qx - ix;
  let fy = qy - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = lattice(ix, iy) + (lattice(ix + 1, iy) - lattice(ix, iy)) * fx;
  const b = lattice(ix, iy + 1) + (lattice(ix + 1, iy + 1) - lattice(ix, iy + 1)) * fx;
  return a + (b - a) * fy;
}

/** 두 옥타브 값 노이즈, 대략 −1–1 */
export function grainNoise(qx: number, qy: number): number {
  return (0.65 * valueNoise(qx, qy) + 0.35 * valueNoise(qx * 2 + 7, qy * 2 + 13)) * 1.6;
}

export const GRAIN_STRENGTH = 0.15;

/** sRGB 코드값(0–1)에 그레인을 더한다. 셰이더 applyGrain과 같다. */
export function applyGrain(s: Vec3, u: number, v: number, gu: GrainUniforms): Vec3 {
  if (gu.amount <= 0) return s;
  const n = grainNoise(u * gu.scale[0], v * gu.scale[1]);
  const y = LUMA[0] * s[0] + LUMA[1] * s[1] + LUMA[2] * s[2];
  const w = 0.3 + 0.7 * Math.min(1, Math.max(0, 4 * y * (1 - y)));
  const k = gu.amount * GRAIN_STRENGTH * n * w;
  return [s[0] + k, s[1] + k, s[2] + k];
}

// ── 선명도·디헤이즈용 저해상도 기준 ──

export interface PixelSource {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

export interface DevelopBase {
  width: number;
  height: number;
  /** RGBA: r = 흐린 휘도(그레이딩 인코딩), g = 안개 정도(정규화 다크 채널) */
  data: Float32Array;
  /** 대기광 (그레이딩 인코딩) */
  airlight: Vec3;
  /** RGBA: rgb = 글로우(밝은 부분을 넓게 번진 선형 RGB), a = 할레이션(밝은 부분 휘도를 좁게 번진 것) */
  fx: Float32Array;
}

/** 기준 격자의 긴 변 */
export const BASE_LONG = 320;

const srgbToLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const enc = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 1 / GRADING_GAMMA);
const dec = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), GRADING_GAMMA);

function gaussBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.ceil(3 * sigma);
  const k: number[] = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k.push(v);
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += k[i + r] * src[y * w + Math.min(w - 1, Math.max(0, x + i))];
      tmp[y * w + x] = a;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
      out[y * w + x] = a;
    }
  return out;
}

function minFilter(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = Infinity;
      for (let i = -r; i <= r; i++) m = Math.min(m, src[y * w + Math.min(w - 1, Math.max(0, x + i))]);
      tmp[y * w + x] = m;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = Infinity;
      for (let i = -r; i <= r; i++) m = Math.min(m, tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]);
      out[y * w + x] = m;
    }
  return out;
}

/** 원본 8bit 픽셀을 선형으로 쌍선형 보간 (가장자리 고정). 셰이더 warp와 같다. */
function sampleLinear(src: PixelSource, u: number, v: number): Vec3 {
  const fx = u * src.width - 0.5;
  const fy = v * src.height - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (x: number, y: number, c: number) => {
    const xi = Math.min(src.width - 1, Math.max(0, x));
    const yi = Math.min(src.height - 1, Math.max(0, y));
    return srgbToLin(src.data[(yi * src.width + xi) * 4 + c] / 255);
  };
  const out: Vec3 = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const a = at(x0, y0, c) + (at(x0 + 1, y0, c) - at(x0, y0, c)) * tx;
    const b = at(x0, y0 + 1, c) + (at(x0 + 1, y0 + 1, c) - at(x0, y0 + 1, c)) * tx;
    out[c] = a + (b - a) * ty;
  }
  return out;
}

/**
 * 선명도·디헤이즈가 쓰는 저해상도 기준을 만든다.
 * src는 원본을 긴 변 512px 정도로 줄인 픽셀. 결과는 rect(보이는 영역)를 덮는 BASE_LONG 격자다.
 * 미리보기와 내보내기가 같은 기준을 쓰므로 두 결과의 큰 흐름이 같다.
 */
export function computeBase(src: PixelSource, g: Geometry, fullW: number, fullH: number, rect: Rect = g.crop): DevelopBase {
  const [W, H] = orientedSize(g.rotate, fullW, fullH);
  const aspect = (rect.w * W) / (rect.h * H);
  const bw = Math.max(8, aspect >= 1 ? BASE_LONG : Math.round(BASE_LONG * aspect));
  const bh = Math.max(8, aspect >= 1 ? Math.round(BASE_LONG / aspect) : BASE_LONG);
  const n = bw * bh;
  const m = geometryMatrix(g, fullW, fullH, rect);
  const p = new Float32Array(n * 3);
  const Y = new Float32Array(n);
  const dmin = new Float32Array(n);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const [su, sv] = mapPoint(m, (x + 0.5) / bw, (y + 0.5) / bh);
      const lin = sampleLinear(src, Math.min(1, Math.max(0, su)), Math.min(1, Math.max(0, sv)));
      const i = y * bw + x;
      for (let c = 0; c < 3; c++) p[i * 3 + c] = enc(lin[c]);
      Y[i] = LUMA[0] * p[i * 3] + LUMA[1] * p[i * 3 + 1] + LUMA[2] * p[i * 3 + 2];
      dmin[i] = Math.min(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    }
  const long = Math.max(bw, bh);
  const blurY = gaussBlur(Y, bw, bh, 0.012 * long);

  // 대기광: 다크 채널이 가장 밝은 0.5% 픽셀의 평균 색
  const r = Math.max(1, Math.round(0.015 * long));
  const dark = minFilter(dmin, bw, bh, r);
  const order = Array.from(dark.keys()).sort((a, b) => dark[b] - dark[a]);
  const top = order.slice(0, Math.max(1, Math.round(n * 0.005)));
  const air: Vec3 = [0, 0, 0];
  for (const i of top) for (let c = 0; c < 3; c++) air[c] += p[i * 3 + c] / top.length;
  for (let c = 0; c < 3; c++) air[c] = Math.min(1, Math.max(0.2, air[c]));

  const norm = new Float32Array(n);
  for (let i = 0; i < n; i++) norm[i] = Math.min(p[i * 3] / air[0], p[i * 3 + 1] / air[1], p[i * 3 + 2] / air[2]);
  const haze = gaussBlur(minFilter(norm, bw, bh, r), bw, bh, r);

  const data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = blurY[i];
    data[i * 4 + 1] = Math.min(1, Math.max(0, haze[i]));
  }

  // 글로우·할레이션: 밝은 부분(선형)만 뽑아 넓게 / 좁게 번진다
  const glowSrc = [0, 1, 2].map(() => new Float32Array(n));
  const halSrc = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let yl = 0;
    for (let c = 0; c < 3; c++) {
      const l = dec(p[i * 3 + c]);
      glowSrc[c][i] = Math.max(0, l - GLOW_THRESHOLD) / (1 - GLOW_THRESHOLD);
      yl += LUMA[c] * l;
    }
    halSrc[i] = Math.max(0, yl - HALATION_THRESHOLD) / (1 - HALATION_THRESHOLD);
  }
  const glow = glowSrc.map((a) => gaussBlur(a, bw, bh, 0.03 * long));
  const hal = gaussBlur(halSrc, bw, bh, 0.008 * long);
  const fx = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    fx[i * 4] = glow[0][i];
    fx[i * 4 + 1] = glow[1][i];
    fx[i * 4 + 2] = glow[2][i];
    fx[i * 4 + 3] = hal[i];
  }
  return { width: bw, height: bh, data, airlight: air, fx };
}

/** 글로우·할레이션이 시작되는 선형 밝기 */
export const GLOW_THRESHOLD = 0.55;
export const HALATION_THRESHOLD = 0.45;
/** 할레이션의 색 (필름 뒷면에서 반사된 빛의 붉은 번짐) */
export const HALATION_TINT: Vec3 = [1, 0.3, 0.08];

/** 기준 격자의 다른 표(fx 등)를 출력 좌표로 쌍선형 보간 (RGBA 4채널) */
export function sampleGrid(b: DevelopBase, grid: Float32Array, u: number, v: number): [number, number, number, number] {
  const fx = u * b.width - 0.5;
  const fy = v * b.height - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (x: number, y: number, c: number) =>
    grid[(Math.min(b.height - 1, Math.max(0, y)) * b.width + Math.min(b.width - 1, Math.max(0, x))) * 4 + c];
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const a = at(x0, y0, c) + (at(x0 + 1, y0, c) - at(x0, y0, c)) * tx;
    const bb = at(x0, y0 + 1, c) + (at(x0 + 1, y0 + 1, c) - at(x0, y0 + 1, c)) * tx;
    out[c] = a + (bb - a) * ty;
  }
  return out;
}

/** 비네트 가중치: 가운데 0 → 모서리 쪽 1 (셰이더 vignetteWeight와 같다) */
export function vignetteWeight(u: number, v: number, aspect: number, mid: number, feather: number): number {
  const dx = (u - 0.5) * aspect;
  const dy = v - 0.5;
  const d = Math.hypot(dx, dy) / (0.5 * Math.hypot(aspect, 1));
  return smoothstep(mid, mid + feather, d);
}

/** 기준 격자를 출력 좌표로 쌍선형 보간 (셰이더 sampleBase와 같다) */
export function sampleBase(b: DevelopBase, u: number, v: number): [number, number] {
  const fx = u * b.width - 0.5;
  const fy = v * b.height - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (x: number, y: number, c: number) =>
    b.data[(Math.min(b.height - 1, Math.max(0, y)) * b.width + Math.min(b.width - 1, Math.max(0, x))) * 4 + c];
  const out: [number, number] = [0, 0];
  for (let c = 0; c < 2; c++) {
    const a = at(x0, y0, c) + (at(x0 + 1, y0, c) - at(x0, y0, c)) * tx;
    const bb = at(x0, y0 + 1, c) + (at(x0 + 1, y0 + 1, c) - at(x0, y0 + 1, c)) * tx;
    out[c] = a + (bb - a) * ty;
  }
  return out;
}

// ── 현상 계획 ──

/** 원본 밖(형태 보기에서 드러나는 빈 모서리)의 색, 그레이딩 인코딩 */
export const OUTSIDE_ENCODED = enc(srgbToLin(0.086));

export interface DevelopPlan {
  /** 현상 패스 없이 원본 텍스처를 그대로 노드 체인에 넣어도 되는지 */
  identity: boolean;
  /** 출력 0–1 → 원본 0–1 */
  matrix: Mat3;
  outW: number;
  outH: number;
  du: DetailUniforms;
  grain: GrainUniforms;
  /** 선명도·디헤이즈 기준이 필요한지 */
  needsBase: boolean;
}

/**
 * 한 번의 렌더(미리보기·내보내기·썸네일·스코프)에 쓸 현상 계획.
 * outScale: 출력 px / 원본 px. 원본 해상도로 내보낼 때 1.
 */
export function planDevelop(dev: Develop, fullW: number, fullH: number, outScale: number, rect: Rect = dev.geometry.crop): DevelopPlan {
  const g = dev.geometry;
  const [W, H] = orientedSize(g.rotate, fullW, fullH);
  const outW = Math.max(1, Math.round(rect.w * W * outScale));
  const outH = Math.max(1, Math.round(rect.h * H * outScale));
  const du = detailUniforms(dev.detail, outScale, Math.max(fullW, fullH));
  return {
    identity: isIdentityGeometry(g, rect) && !detailActive(dev.detail),
    matrix: geometryMatrix(g, fullW, fullH, rect),
    outW,
    outH,
    du,
    grain: grainUniforms(dev.detail, g, fullW, fullH, rect),
    needsBase: needsBase(dev.detail),
  };
}

// ── CPU 기준 구현 ──

const luma = (r: number, g: number, b: number) => LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(b - a, 1e-5)));
  return t * t * (3 - 2 * t);
};

/**
 * 현상 결과(선형 RGB, 행 우선 outW×outH×3). GPU 결과와 비교하는 기준값이며 작은 이미지에 쓴다.
 * 단계: 형태 변환(선형 쌍선형) → 노이즈 감소 → 블러 → 샤프닝·텍스처·선명도 → 디헤이즈
 */
export function developReference(src: PixelSource, plan: DevelopPlan, base: DevelopBase | null): Float32Array {
  const { outW: w, outH: h, du, matrix } = plan;
  const n = w * h;
  const cl = (x: number, y: number) => Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x));

  // 1) 형태 변환 → 그레이딩 인코딩
  const P = new Float32Array(n * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [su, sv] = mapPoint(matrix, (x + 0.5) / w, (y + 0.5) / h);
      const i = (y * w + x) * 3;
      if (!(su >= -OUTSIDE_EPS && sv >= -OUTSIDE_EPS && su <= 1 + OUTSIDE_EPS && sv <= 1 + OUTSIDE_EPS)) {
        P[i] = P[i + 1] = P[i + 2] = OUTSIDE_ENCODED;
        continue;
      }
      const lin = sampleLinear(src, su, sv);
      for (let c = 0; c < 3; c++) P[i + c] = enc(lin[c]);
    }

  // 2) 노이즈 감소 (휘도: 양방향 필터, 색상: 밝기 경계를 지키는 크로마 블러)
  const Q = new Float32Array(n * 3);
  const QY = new Float32Array(n);
  const [ls, lr, lR] = du.nrLuma;
  const [cs, cmix, cR] = du.nrColor;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r0 = P[i * 3];
      const g0 = P[i * 3 + 1];
      const b0 = P[i * 3 + 2];
      const y0 = luma(r0, g0, b0);
      let Y = y0;
      if (lR > 0) {
        let sw = 0;
        let sy = 0;
        for (let dy = -lR; dy <= lR; dy++)
          for (let dx = -lR; dx <= lR; dx++) {
            const j = cl(x + dx, y + dy);
            const yn = luma(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]);
            const wt = Math.exp(-(dx * dx + dy * dy) / (2 * ls * ls) - ((yn - y0) * (yn - y0)) / (2 * lr * lr));
            sw += wt;
            sy += wt * yn;
          }
        Y = sy / sw;
      }
      let cb = b0 - y0;
      let cr = r0 - y0;
      if (cR > 0) {
        let sw = 0;
        let sb = 0;
        let sr = 0;
        for (let dy = -cR; dy <= cR; dy++)
          for (let dx = -cR; dx <= cR; dx++) {
            const j = cl(x + dx, y + dy);
            const yn = luma(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]);
            const wt = Math.exp(-(dx * dx + dy * dy) / (2 * cs * cs) - ((yn - y0) * (yn - y0)) / (2 * NR_COLOR_EDGE * NR_COLOR_EDGE));
            sw += wt;
            sb += wt * (P[j * 3 + 2] - yn);
            sr += wt * (P[j * 3] - yn);
          }
        cb += (sb / sw - cb) * cmix;
        cr += (sr / sw - cr) * cmix;
      }
      const r = Y + cr;
      const b = Y + cb;
      Q[i * 3] = r;
      Q[i * 3 + 1] = (Y - LUMA[0] * r - LUMA[2] * b) / LUMA[1];
      Q[i * 3 + 2] = b;
      QY[i] = Y;
    }

  // 3) 휘도 블러: 샤프닝용(작은 σ)과 텍스처용(중간 σ), 가로 → 세로
  const [sAmt, sMask, sSig, sR] = du.sharpen;
  const [tAmt, tSig, tR] = du.texture;
  const kernel = (sig: number, R: number) => {
    const k: number[] = [];
    let sum = 0;
    for (let i = -R; i <= R; i++) {
      const v = Math.exp(-(i * i) / (2 * sig * sig));
      k.push(v);
      sum += v;
    }
    return k.map((v) => v / sum);
  };
  const ks = kernel(sSig, sR);
  const kt = kernel(tSig, tR);
  const blur = (inS: Float32Array, inT: Float32Array, horiz: boolean) => {
    const oS = new Float32Array(n);
    const oT = new Float32Array(n);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const at = (arr: Float32Array, d: number) => arr[horiz ? cl(x + d, y) : cl(x, y + d)];
        let s = 0;
        for (let i = -sR; i <= sR; i++) s += ks[i + sR] * at(inS, i);
        let t = 0;
        for (let i = -tR; i <= tR; i++) t += kt[i + tR] * at(inT, i);
        oS[y * w + x] = sR > 0 ? s : inS[y * w + x];
        oT[y * w + x] = tR > 0 ? t : inT[y * w + x];
      }
    return [oS, oT] as const;
  };
  const needBlur = sR > 0 || tR > 0;
  const [h1S, h1T] = needBlur ? blur(QY, QY, true) : [QY, QY];
  const [BS, BT] = needBlur ? blur(h1S, h1T, false) : [QY, QY];

  // 4) 합성
  const out = new Float32Array(n * 3);
  const air = base?.airlight ?? [1, 1, 1];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const Y = QY[i];
      let det = 0;
      if (sAmt > 0 && sR > 0) {
        const d = Y - BS[i];
        const m = sMask > 0 ? smoothstep(0, 0.05 * sMask, Math.abs(d)) : 1;
        det += sAmt * d * m;
      }
      if (tAmt !== 0 && tR > 0) {
        const d = Y - BT[i];
        det += tAmt * 0.8 * (d / (1 + 6 * Math.abs(d)));
      }
      let hz = 0;
      if (base) {
        const [yb, hb] = sampleBase(base, (x + 0.5) / w, (y + 0.5) / h);
        hz = hb;
        if (du.clarity !== 0) {
          const d = Y - yb;
          const mid = Math.min(1, Math.max(0, 4 * Y * (1 - Y)));
          det += du.clarity * 0.9 * (d / (1 + 3 * Math.abs(d))) * mid;
        }
      }
      const u = (x + 0.5) / w;
      const vv = (y + 0.5) / h;
      const fx = base && (du.glow > 0 || du.halation > 0) ? sampleGrid(base, base.fx, u, vv) : null;
      const vw = du.vignette[0] !== 0 ? vignetteWeight(u, vv, w / h, du.vignette[1], du.vignette[2]) : 0;
      for (let c = 0; c < 3; c++) {
        let v = Q[i * 3 + c] + det;
        if (base && du.dehaze > 0) {
          const t = Math.max(0.15, 1 - 0.85 * du.dehaze * hz);
          v = (v - air[c]) / t + air[c];
        } else if (base && du.dehaze < 0) {
          v += (air[c] - v) * (-du.dehaze * 0.45);
        }
        let lin = dec(v);
        if (fx) lin += du.glow * 1.2 * fx[c] + du.halation * 1.5 * fx[3] * HALATION_TINT[c];
        if (du.vignette[0] > 0) lin *= 1 - du.vignette[0] * 0.85 * vw;
        else if (du.vignette[0] < 0) lin += Math.max(0, 1 - lin) * -du.vignette[0] * 0.6 * vw;
        out[i * 3 + c] = lin;
      }
    }
  return out;
}
