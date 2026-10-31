// 기본 제공 LUT 라이브러리 (6개 분류, 98종). 파일로 들고 있지 않고 쓸 때 함수로 계산해 만든다.
// 구성은 DaVinci Resolve에 딸린 LUT 폴더(카메라 제조사별, VFX IO, Film Looks)를 따랐지만,
// 그 파일을 옮긴 것이 아니라 공개된 수식(제조사 백서·표준 문서)으로 직접 만든다.
// - 유틸리티 7: 항등, 반전, 흑백, 폴스 컬러, 비디오↔풀 레벨
// - VFX IO 15: 선형·sRGB·Rec.709·감마·Cineon·로그 사이의 1차원 변환
// - 카메라 로그 41: 19개 로그 곡선 + 색역 원색 → sRGB (클리핑 / 부드러운 하이라이트) + Sony 스타일 3
// - 필름 룩 6: 프린트 필름 2종 × 흰색 D55·D60·D65 (스타일 근사)
// - 룩 16: 필름·시네마 룩 (sRGB 코드값 → sRGB 코드값)
// - 정원 13: 정원 프리셋을 LUT로 구운 것

import { linearToSrgb, LUMA, srgbToLinear, type Vec3 } from './color';
import { buildLut, type CubeLut } from './lut';
import { bakeGradeLutSync } from './lutExport';
import { BUILTIN_PRESETS } from './presetLibrary';
import { chainOfPreset } from './presetChain';

export type LutCategory = 'utility' | 'vfx' | 'camera' | 'film' | 'look' | 'garden';

export const LUT_CATEGORIES: Array<[LutCategory, string]> = [
  ['utility', '유틸리티'],
  ['vfx', 'VFX IO'],
  ['camera', '카메라 로그'],
  ['film', '필름 룩'],
  ['look', '룩'],
  ['garden', '정원'],
];

export interface LibraryLut {
  id: string;
  name: string;
  category: LutCategory;
  description: string;
  /** 회색 축에서 밝기가 단조 증가하지 않는 LUT (반전·폴스 컬러) */
  nonMonotone?: boolean;
  /**
   * 값을 0–1로 자르지 않는 LUT. 자르면 꺾이는 점이 격자 사이에 걸려 보간 오차가 생기므로,
   * 직선 변환은 그대로 두고 최종 출력에서 자른다.
   */
  extendedRange?: boolean;
  /** 이 LUT의 기본 격자 크기 (가파른 1차원 곡선은 65) */
  size?: number;
  /** 카메라 → sRGB 변환: 18% 회색의 입력 코드값 (sRGB 118 근처가 되어야 한다) */
  grey?: number;
  /** 세 채널에 같은 1차원 곡선이면 그 함수 (.cube로 받을 때 1D LUT로 쓴다) */
  curve?: (v: number) => number;
  build(size: number): CubeLut;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const clampRgb = (c: Vec3): Vec3 => [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])];

// ── 색 수학 ──

type Mat3 = number[][];
type XY = [number, number];

const mul = (a: Mat3, b: Mat3): Mat3 => a.map((r) => [0, 1, 2].map((j) => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j]));
const apply3 = (m: Mat3, v: Vec3): Vec3 => [0, 1, 2].map((i) => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]) as Vec3;

function inverse(m: Mat3): Mat3 {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

const D65: XY = [0.3127, 0.329];

/** 원색 xy 좌표 → RGB→XYZ 행렬 */
export function npm(r: XY, g: XY, b: XY, w: XY = D65): Mat3 {
  const col = ([x, y]: XY) => [x / y, 1, (1 - x - y) / y];
  const P: Mat3 = [0, 1, 2].map((i) => [col(r)[i], col(g)[i], col(b)[i]]);
  const W = col(w) as Vec3;
  const S = apply3(inverse(P), W);
  return P.map((row) => row.map((v, j) => v * S[j]));
}

const REC709 = npm([0.64, 0.33], [0.3, 0.6], [0.15, 0.06]);
const REC2020: [XY, XY, XY] = [[0.708, 0.292], [0.17, 0.797], [0.131, 0.046]];

/** 카메라 색역 → 선형 sRGB(Rec.709 원색) 행렬 */
export const gamutToRec709 = (r: XY, g: XY, b: XY) => mul(inverse(REC709), npm(r, g, b));

// ── 카메라 로그 곡선 (코드값 0–1 → 장면 선형, 18% 회색 = 0.18) ──

/** 10bit 비디오 레벨 → 풀 레벨 */
const legalToFull = (v: number) => (v * 1023 - 64) / 876;

export const LOG_CURVES = {
  /** Sony S-Log3: 18% 회색 = 420/1023 */
  slog3: (x: number) =>
    x >= 171.2102946929 / 1023
      ? Math.pow(10, (x * 1023 - 420) / 261.5) * 0.19 - 0.01
      : ((x * 1023 - 95) * 0.01125) / (171.2102946929 - 95),
  /** ARRI LogC3 (EI 800): 18% 회색 = 0.391 */
  logc3: (x: number) => {
    const [cut, a, b, c, d, e, f] = [0.010591, 5.555556, 0.052272, 0.24719, 0.385537, 5.367655, 0.092809];
    return x > e * cut + f ? (Math.pow(10, (x - d) / c) - b) / a : (x - f) / e;
  },
  /** Canon Log 3: 비디오 레벨 코드값 기준, 18% 회색 ≈ 0.343 */
  clog3: (v: number) => {
    const x = legalToFull(v);
    let y: number;
    if (x < 0.04076162) y = -(Math.pow(10, (0.07623209 - x) / 0.42889912) - 1) / 14.98325;
    else if (x <= 0.105357102) y = (x - 0.073059361) / 2.3069815;
    else y = (Math.pow(10, (x - 0.069886632) / 0.42889912) - 1) / 14.98325;
    return y * 0.9;
  },
  /** Panasonic V-Log: 18% 회색 = 0.423 */
  vlog: (x: number) => (x < 0.181 ? (x - 0.125) / 5.6 : Math.pow(10, (x - 0.598206) / 0.241514) - 0.00873),
  /** Fujifilm F-Log: 18% 회색 = 0.459 */
  flog: (x: number) => {
    const [a, b, c, d, e, f] = [0.555556, 0.009468, 0.344676, 0.790453, 8.735631, 0.092864];
    return x >= 0.100537775223865 ? (Math.pow(10, (x - d) / c) - b) / a : (x - f) / e;
  },
  /** Nikon N-Log: 18% 회색은 세제곱 구간에 있다 (≈ 372/1023) */
  nlog: (x: number) => (x < 452 / 1023 ? Math.pow((x * 1023) / 650, 3) - 0.0075 : Math.exp((x * 1023 - 619) / 150)),
  /** HLG (BT.2100) 역 OETF. 신호 0.38이 18% 회색이 되도록 맞춘다 */
  hlg: (x: number) => {
    const a = 0.17883277;
    const b = 1 - 4 * a;
    const c = 0.5 - a * Math.log(4 * a);
    const e = x <= 0.5 ? (x * x) / 3 : (Math.exp((x - c) / a) + b) / 12;
    return e * (0.18 / ((0.38 * 0.38) / 3));
  },
  /** Sony S-Log2: 18% 회색 ≈ 347/1023 */
  slog2: (v: number) => {
    const x = legalToFull(v);
    const r = x >= 0.030001222851889303 ? Math.pow(10, (x - 0.616596 - 0.03) / 0.432699) - 0.037584 : (x - 0.030001222851889303) / 5;
    return ((r * 0.9) * 219) / 155;
  },
  /** ARRI LogC4: 18% 회색 = 0.278396 */
  logc4: (x: number) => {
    const a = (2 ** 18 - 16) / 117.45;
    const b = (1023 - 95) / 1023;
    const c = 95 / 1023;
    const s = (7 * Math.LN2 * 2 ** (7 - (14 * c) / b)) / (a * b);
    const t = (2 ** (14 * (-c / b) + 6) - 64) / a;
    return x >= 0 ? (2 ** ((14 * (x - c)) / b + 6) - 64) / a : x * s + t;
  },
  /** Canon Log (1세대): 비디오 레벨 코드값, 18% 회색 ≈ 0.343 */
  clog: (v: number) => ((Math.pow(10, (legalToFull(v) - 0.0730597) / 0.529136) - 1) / 10.1596) * 0.9,
  /** Canon Log 2: 비디오 레벨 코드값, 18% 회색 ≈ 0.404 */
  clog2: (v: number) => ((Math.pow(10, (legalToFull(v) - 0.092864125) / 0.24136077) - 1) / 87.09937546) * 0.9,
  /** Fujifilm F-Log2: 18% 회색 = 0.391 */
  flog2: (x: number) => {
    const [a, b, c, d, e, f] = [5.555556, 0.064829, 0.245281, 0.384316, 8.799461, 0.092864];
    return x >= 0.100686685370811 ? (Math.pow(10, (x - d) / c) - b) / a : (x - f) / e;
  },
  /** DJI D-Log: 18% 회색 ≈ 0.399 */
  dlog: (x: number) => (x <= 0.14 ? (x - 0.0929) / 6.025 : (Math.pow(10, 3.89616 * x - 2.27752) - 0.0108) / 0.9892),
  /** RED Log3G10: 18% 회색 = 1/3 */
  log3g10: (x: number) => (x < 0 ? x / 15.1927 : (Math.pow(10, x / 0.224282) - 1) / 155.975327) - 0.01,
  /** Blackmagic Design Film Gen 5: 18% 회색 ≈ 0.384 */
  bmdgen5: (x: number) => (x < 0.005 * 8.283605932 + 0.09246575342 ? (x - 0.09246575342) / 8.283605932 : Math.exp((x - 0.5300133392) / 0.08692876065) - 0.005494072432),
  /** GoPro Protune Flat: 18% 회색 ≈ 0.646 */
  protune: (x: number) => (Math.pow(113, x) - 1) / 112,
  /** Apple Log: 18% 회색 ≈ 0.488 */
  applelog: (x: number) => {
    const [R0, Rt, c, beta, gamma, delta] = [-0.05641088, 0.01, 47.28711236, 0.00964052, 0.08550479, 0.69336945];
    const cut = gamma * Math.log2(Rt + beta) + delta;
    if (x >= cut) return 2 ** ((x - delta) / gamma) - beta;
    return x > 0 ? Math.sqrt(x / c) + R0 : R0;
  },
  /** PQ (SMPTE ST 2084): 203 nit(BT.2408 기준 흰색)를 1로 둔다 */
  pq: (x: number) => pqToNits(x) / PQ_REFERENCE_WHITE,
};

/** ST 2084 상수 */
const PQ = { m1: 2610 / 16384, m2: (2523 / 4096) * 128, c1: 3424 / 4096, c2: (2413 / 4096) * 32, c3: (2392 / 4096) * 32 };
const PQ_REFERENCE_WHITE = 203;

function pqToNits(e: number): number {
  const p = Math.pow(Math.max(0, e), 1 / PQ.m2);
  return 10000 * Math.pow(Math.max(p - PQ.c1, 0) / (PQ.c2 - PQ.c3 * p), 1 / PQ.m1);
}

function nitsToPq(nits: number): number {
  const y = Math.pow(Math.max(0, nits) / 10000, PQ.m1);
  return Math.pow((PQ.c1 + PQ.c2 * y) / (1 + PQ.c3 * y), PQ.m2);
}

/** 18% 회색의 코드값 (테스트·설명용) */
export const LOG_GREY: Record<keyof typeof LOG_CURVES, number> = {
  slog3: 420 / 1023,
  logc3: 0.391007,
  clog3: 0.343367,
  vlog: 0.423311,
  flog: 0.459318,
  nlog: (650 * Math.cbrt(0.18 + 0.0075)) / 1023,
  hlg: 0.38,
  slog2: 0.339533,
  logc4: 0.278396,
  clog: 0.34339,
  clog2: 0.403589,
  flog2: 0.391007,
  dlog: 0.398765,
  log3g10: 1 / 3,
  bmdgen5: 0.383562,
  protune: 0.645623,
  applelog: 0.488272,
  pq: nitsToPq(0.18 * PQ_REFERENCE_WHITE),
};

/** 0.55 위에서 부드럽게 꺾여 1에 다가가는 숄더 (기울기 연속) */
export const softShoulder = (x: number) => {
  const k = 0.55;
  return x <= k ? x : k + (1 - k) * (1 - Math.exp(-(x - k) / (1 - k)));
};

interface CameraSpec {
  id: string;
  name: string;
  curve: keyof typeof LOG_CURVES;
  primaries: [XY, XY, XY];
  note: string;
}

const S_GAMUT: [XY, XY, XY] = [[0.73, 0.28], [0.14, 0.855], [0.1, -0.05]];
const S_GAMUT3_CINE: [XY, XY, XY] = [[0.766, 0.275], [0.225, 0.8], [0.089, -0.087]];
const CINEMA_GAMUT: [XY, XY, XY] = [[0.74, 0.27], [0.17, 1.14], [0.08, -0.1]];

const CAMERAS: CameraSpec[] = [
  { id: 'bmd-gen5', name: 'Blackmagic Film Gen 5 / Wide Gamut', curve: 'bmdgen5', primaries: [[0.7177215, 0.3171181], [0.228041, 0.861569], [0.1005841, -0.0820452]], note: 'Blackmagic 카메라(Gen 5 색과학, BRAW·ProRes Film)' },
  { id: 'arri', name: 'ARRI LogC3 / AWG3 (EI 800)', curve: 'logc3', primaries: [[0.684, 0.313], [0.221, 0.848], [0.0861, -0.102]], note: 'ARRI ALEXA 계열' },
  { id: 'arri-logc4', name: 'ARRI LogC4 / AWG4', curve: 'logc4', primaries: [[0.7347, 0.2653], [0.1424, 0.8576], [0.0991, -0.0308]], note: 'ARRI ALEXA 35' },
  { id: 'sony', name: 'Sony S-Log3 / S-Gamut3.Cine', curve: 'slog3', primaries: S_GAMUT3_CINE, note: 'Sony 카메라' },
  { id: 'sony-sgamut3', name: 'Sony S-Log3 / S-Gamut3', curve: 'slog3', primaries: S_GAMUT, note: 'Sony 카메라(넓은 S-Gamut3)' },
  { id: 'sony-slog2', name: 'Sony S-Log2 / S-Gamut', curve: 'slog2', primaries: S_GAMUT, note: '이전 Sony 카메라' },
  { id: 'canon-clog', name: 'Canon Log / Cinema Gamut', curve: 'clog', primaries: CINEMA_GAMUT, note: 'Canon 카메라(1세대 Canon Log, 비디오 레벨)' },
  { id: 'canon-clog2', name: 'Canon Log 2 / Cinema Gamut', curve: 'clog2', primaries: CINEMA_GAMUT, note: 'Canon 시네마 카메라(비디오 레벨)' },
  { id: 'canon', name: 'Canon Log 3 / Cinema Gamut', curve: 'clog3', primaries: CINEMA_GAMUT, note: 'Canon 카메라(비디오 레벨 녹화)' },
  { id: 'panasonic', name: 'Panasonic V-Log / V-Gamut', curve: 'vlog', primaries: [[0.73, 0.28], [0.165, 0.84], [0.1, -0.03]], note: 'Panasonic LUMIX 등' },
  { id: 'fujifilm', name: 'Fujifilm F-Log / F-Gamut', curve: 'flog', primaries: REC2020, note: 'Fujifilm X·GFX' },
  { id: 'fujifilm-flog2', name: 'Fujifilm F-Log2 / F-Gamut', curve: 'flog2', primaries: REC2020, note: 'Fujifilm X·GFX (넓은 관용도)' },
  { id: 'nikon', name: 'Nikon N-Log / Rec.2020', curve: 'nlog', primaries: REC2020, note: 'Nikon Z 계열' },
  { id: 'dji', name: 'DJI D-Log / D-Gamut', curve: 'dlog', primaries: [[0.71, 0.31], [0.21, 0.88], [0.09, -0.08]], note: 'DJI 드론·짐벌 카메라' },
  { id: 'red', name: 'RED Log3G10 / REDWideGamutRGB', curve: 'log3g10', primaries: [[0.780308, 0.304253], [0.121595, 1.493994], [0.095612, -0.084589]], note: 'RED 카메라(IPP2)' },
  { id: 'gopro', name: 'GoPro Protune Flat / Native', curve: 'protune', primaries: [[0.698448, 0.193026], [0.329555, 1.024597], [0.108443, -0.034679]], note: 'GoPro(Protune 플랫)' },
  { id: 'apple', name: 'Apple Log / Rec.2020', curve: 'applelog', primaries: REC2020, note: 'iPhone 15 Pro 이후 Apple Log' },
  { id: 'hlg', name: 'HLG / Rec.2020', curve: 'hlg', primaries: REC2020, note: 'HLG로 찍은 영상·사진' },
  { id: 'pq', name: 'PQ (ST 2084) / Rec.2020', curve: 'pq', primaries: REC2020, note: 'HDR10·PQ 영상(203 nit를 흰색으로)' },
];

function cameraLut(cam: CameraSpec, soft: boolean): LibraryLut {
  const m = gamutToRec709(...cam.primaries);
  const decode = LOG_CURVES[cam.curve];
  return {
    id: `camera-${cam.id}-${soft ? 'soft' : 'clip'}`,
    name: `${cam.name} → sRGB${soft ? ' (부드러운 하이라이트)' : ''}`,
    category: 'camera',
    grey: LOG_GREY[cam.curve],
    description: `${cam.note}의 로그 영상·사진을 sRGB로. ${
      soft ? '밝은 부분을 부드럽게 눌러 잘림을 줄인다 (Extended Video에 해당).' : '기술적 변환: 1을 넘는 밝기는 잘린다.'
    } 노드 체인의 첫 노드에 쓴다.`,
    build: (size) =>
      buildLut(size, `${cam.name} to sRGB${soft ? ' soft' : ''}`, (r, g, b) => {
        const lin = apply3(m, [decode(r), decode(g), decode(b)]);
        return lin.map((v) => linearToSrgb(clamp01(soft ? softShoulder(Math.max(0, v)) : v))) as Vec3;
      }),
  };
}

// ── 코드값 공간의 룩 도구 ──

const luma = (c: Vec3) => LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];
const sat = (c: Vec3, k: number): Vec3 => {
  const y = luma(c);
  return c.map((v) => y + (v - y) * k) as Vec3;
};
/** 0·0.5·1을 고정한 S커브 (k>0 대비 증가, k<0 감소; |k|<1이면 단조) */
const sCurve = (x: number, k: number) => x - (k * Math.sin(2 * Math.PI * x)) / (2 * Math.PI);
const per = (c: Vec3, f: (v: number, i: number) => number): Vec3 => c.map(f) as Vec3;
/** 섀도에 shadow 색, 하이라이트에 high 색을 더하는 스플릿 톤 (색은 합이 0이 되도록 옮긴다) */
function splitTone(c: Vec3, shadow: Vec3, high: Vec3, amount: number): Vec3 {
  const center = (t: Vec3) => {
    const m = (t[0] + t[1] + t[2]) / 3;
    return t.map((v) => v - m);
  };
  const s = center(shadow);
  const h = center(high);
  const w = luma(c);
  return per(c, (v, i) => v + amount * ((1 - w) * (1 - w) * s[i] + w * w * h[i]));
}
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => per(a, (v, i) => v + (b[i] - v) * t);

function look(id: string, name: string, description: string, f: (c: Vec3) => Vec3): LibraryLut {
  return {
    id: `look-${id}`,
    name,
    category: 'look',
    description,
    build: (size) => buildLut(size, name, (r, g, b) => clampRgb(f([r, g, b]))),
  };
}

const LOOKS: LibraryLut[] = [
  look('print-warm', '필름 프린트 · 따뜻함', '부드러운 토·숄더, 청록 섀도와 따뜻한 하이라이트, 하이라이트 채도 억제', (c) => {
    let o = per(c, (v) => 0.015 + 0.96 * sCurve(v, 0.35));
    o = splitTone(o, [0.2, 0.55, 0.6], [1, 0.75, 0.45], 0.06);
    return sat(o, 0.95 - 0.1 * luma(o));
  }),
  look('print-neutral', '필름 프린트 · 중립', '프린트 필름의 S커브와 눌린 하이라이트, 색은 중립', (c) =>
    sat(per(c, (v) => 0.012 + 0.965 * sCurve(v, 0.35)), 0.95),
  ),
  look('slide', '슬라이드 필름', '깊은 대비, 높은 채도, 맑고 차가운 하이라이트', (c) =>
    splitTone(sat(per(c, (v) => sCurve(v, 0.42)), 1.05), [0.5, 0.5, 0.5], [0.85, 0.95, 1], 0.04),
  ),
  look('negative-soft', '네거티브 · 부드러움', '낮은 대비와 넓은 관용도, 섀도에 옅은 녹색', (c) =>
    sat(splitTone(per(c, (v) => 0.035 + 0.93 * sCurve(v, -0.2)), [0.4, 0.6, 0.45], [1, 0.95, 0.85], 0.04), 0.9),
  ),
  look('bleach', '블리치 바이패스', '채도를 절반으로 빼고 강한 대비', (c) => per(mix(c, [luma(c), luma(c), luma(c)], 0.5), (v) => sCurve(v, 0.45))),
  look('cross', '크로스 프로세스', '노란 하이라이트, 푸른 섀도, 강한 빨강 대비', (c) => [
    sCurve(c[0], 0.55),
    0.01 + 0.98 * sCurve(c[1], 0.3),
    0.12 + 0.72 * c[2],
  ]),
  look('teal-orange', '틸 & 오렌지', '청록 섀도와 주황 하이라이트', (c) => splitTone(per(c, (v) => sCurve(v, 0.2)), [0.1, 0.6, 0.65], [1, 0.6, 0.25], 0.12)),
  look('day-for-night', '데이 포 나이트', '낮에 찍은 장면을 달밤처럼: 어둡고 푸르고 채도 낮게', (c) => {
    const lin = per(c, (v) => srgbToLinear(v) * 0.22);
    const o = sat(per(lin, (v) => linearToSrgb(v)), 0.35);
    return per(o, (v, i) => v * [0.85, 0.95, 1.18][i]);
  }),
  look('golden', '골든아워', '해 질 녘의 따뜻한 빛, 하이라이트일수록 더 노랗게', (c) =>
    sat(splitTone(c, [0.9, 0.6, 0.4], [1, 0.75, 0.35], 0.09), 1.04),
  ),
  look('matte', '매트 블랙', '블랙을 들어 올린 무광 톤', (c) => per(c, (v) => 0.06 + 0.92 * sCurve(v, 0.15))),
  look('pastel', '파스텔', '밝고 옅은 색, 분홍빛 하이라이트', (c) =>
    splitTone(sat(per(c, (v) => 0.07 + 0.92 * v), 0.75), [0.5, 0.5, 0.55], [1, 0.85, 0.9], 0.05),
  ),
  look('vintage', '빈티지 브라운', '바랜 갈색 섀도와 크림색 하이라이트', (c) =>
    splitTone(sat(per(c, (v) => 0.05 + 0.9 * sCurve(v, 0.2)), 0.7), [0.6, 0.45, 0.3], [1, 0.92, 0.75], 0.1),
  ),
  look('sepia', '세피아', '휘도만 남겨 갈색 계조로', (c) => mix([0.1, 0.06, 0.03], [1, 0.94, 0.8], luma(c))),
  look('selenium', '셀레늄 흑백', '보랏빛 섀도의 흑백 프린트', (c) => {
    const y = sCurve(luma(c), 0.2);
    return per([y, y, y], (v, i) => v + (1 - v) * v * [0.02, -0.03, 0.06][i] * 2);
  }),
  look('cool-cinema', '쿨 시네마', '푸른 섀도, 절제된 채도, 단단한 대비', (c) =>
    sat(splitTone(per(c, (v) => sCurve(v, 0.3)), [0.2, 0.35, 0.8], [0.9, 0.95, 1], 0.1), 0.9),
  ),
  look('punchy', '하이 콘트라스트 컬러', '강한 대비와 진한 색', (c) => sat(per(c, (v) => sCurve(v, 0.5)), 1.04)),
];

// ── Sony 스타일 (S-Log3 / S-Gamut3.Cine → 표시용 룩) ──

/** 장면 선형 → sRGB 코드값, 부드러운 숄더 */
const sceneToSrgb = (v: number, gain = 1) => linearToSrgb(clamp01(softShoulder(Math.max(0, v * gain))));

function sonyStyle(id: string, name: string, description: string, tone: (c: Vec3) => Vec3): LibraryLut {
  const m = gamutToRec709(...S_GAMUT3_CINE);
  return {
    id: `camera-sony-${id}`,
    name: `Sony S-Log3 / S-Gamut3.Cine → ${name}`,
    category: 'camera',
    description: `${description} Sony가 배포하는 같은 이름 LUT의 공개 데이터가 없어, 특성을 따라 만든 스타일 근사다.`,
    build: (size) =>
      buildLut(size, `S-Log3 S-Gamut3.Cine to ${name}`, (r, g, b) => {
        const lin = apply3(m, [LOG_CURVES.slog3(r), LOG_CURVES.slog3(g), LOG_CURVES.slog3(b)]);
        return clampRgb(tone(per(lin, (v) => sceneToSrgb(v))));
      }),
  };
}

const SONY_STYLES: LibraryLut[] = [
  sonyStyle('lc709', 'LC-709 스타일', '낮은 대비와 들린 블랙의 무난한 표시용 톤.', (c) => per(c, (v) => 0.025 + 0.95 * sCurve(v, -0.12))),
  sonyStyle('lc709a', 'LC-709 Type A 스타일', '낮은 대비에 조금 진한 색과 따뜻한 하이라이트.', (c) =>
    sat(splitTone(per(c, (v) => 0.02 + 0.96 * sCurve(v, -0.06)), [0.5, 0.5, 0.5], [1, 0.9, 0.75], 0.03), 1.08),
  ),
  sonyStyle('cine709', 'Cine+709 스타일', '중간톤 대비가 단단하고 하이라이트를 일찍 눌러 주는 영화 톤.', (c) => per(c, (v) => sCurve(v, 0.18))),
];

// ── VFX IO (1차원 변환, 코드값 0–1을 그대로 해석) ──

const CINEON_OFFSET = Math.pow(10, ((95 - 685) * 0.002) / 0.6);
export const cineonToLinear = (v: number) => (Math.pow(10, ((v * 1023 - 685) * 0.002) / 0.6) - CINEON_OFFSET) / (1 - CINEON_OFFSET);
export const linearToCineon = (x: number) => (685 + (Math.log10(x * (1 - CINEON_OFFSET) + CINEON_OFFSET) * 0.6) / 0.002) / 1023;
const rec709Oetf = (x: number) => (x < 0.018 ? 4.5 * x : 1.099 * Math.pow(x, 0.45) - 0.099);
const rec709Inverse = (v: number) => (v < 0.081 ? v / 4.5 : Math.pow((v + 0.099) / 1.099, 1 / 0.45));
const logc3Encode = (x: number) => (x > 0.010591 ? 0.24719 * Math.log10(5.555556 * x + 0.052272) + 0.385537 : 5.367655 * x + 0.092809);
const slog3Encode = (x: number) =>
  x >= 0.01125 ? (420 + Math.log10((x + 0.01) / 0.19) * 261.5) / 1023 : ((x * (171.2102946929 - 95)) / 0.01125 + 95) / 1023;

function curveLut(id: string, name: string, description: string, f: (v: number) => number, size = 65): LibraryLut {
  return {
    id: `vfx-${id}`,
    name,
    category: 'vfx',
    description,
    size,
    curve: (v) => clamp01(f(v)),
    build: (s) => buildLut(s, name, (r, g, b) => [r, g, b].map((v) => clamp01(f(v))) as Vec3),
  };
}

const VFX: LibraryLut[] = [
  curveLut('lin-to-srgb', 'Linear → sRGB', '선형 값을 sRGB 표시 코드로 (렌더·합성 결과 확인)', linearToSrgb),
  curveLut('srgb-to-lin', 'sRGB → Linear', 'sRGB 코드를 선형 값으로', srgbToLinear),
  curveLut('lin-to-709', 'Linear → Rec.709', '선형 값을 Rec.709(BT.709 OETF) 코드로', rec709Oetf),
  curveLut('709-to-lin', 'Rec.709 → Linear', 'Rec.709 코드를 선형 값으로 (BT.709 OETF의 역)', rec709Inverse),
  curveLut('lin-to-g22', 'Linear → Gamma 2.2', '선형 값을 감마 2.2 코드로', (v) => Math.pow(v, 1 / 2.2)),
  curveLut('g22-to-lin', 'Gamma 2.2 → Linear', '감마 2.2 코드를 선형 값으로', (v) => Math.pow(v, 2.2)),
  curveLut('lin-to-g24', 'Linear → Gamma 2.4', '선형 값을 감마 2.4(BT.1886) 코드로', (v) => Math.pow(v, 1 / 2.4)),
  curveLut('g24-to-lin', 'Gamma 2.4 → Linear', '감마 2.4 코드를 선형 값으로', (v) => Math.pow(v, 2.4)),
  curveLut('g24-to-srgb', 'Gamma 2.4 → sRGB', 'Rec.709(감마 2.4) 화면용으로 만든 영상을 sRGB 화면에 맞게', (v) => linearToSrgb(Math.pow(v, 2.4))),
  curveLut('srgb-to-g24', 'sRGB → Gamma 2.4', 'sRGB 사진을 Rec.709(감마 2.4) 타임라인에 맞게', (v) => Math.pow(srgbToLinear(v), 1 / 2.4)),
  curveLut('cineon-to-lin', 'Cineon Log → Linear', 'Cineon(Kodak 10bit 로그, 흰색 685·검정 95) 코드를 선형 값으로', cineonToLinear, 33),
  curveLut('lin-to-cineon', 'Linear → Cineon Log', '선형 값을 Cineon 로그 코드로', linearToCineon),
  curveLut('cineon-to-srgb', 'Cineon Log → sRGB', 'Cineon 스캔을 sRGB로 보기 (부드러운 하이라이트)', (v) => sceneToSrgb(cineonToLinear(v)), 33),
  curveLut('lin-to-logc3', 'Linear → ARRI LogC3', '선형 값을 LogC3(EI 800) 코드로', logc3Encode),
  curveLut('lin-to-slog3', 'Linear → Sony S-Log3', '선형 값을 S-Log3 코드로', slog3Encode),
];

// ── 필름 룩: 프린트 필름 에뮬레이션 (Rec.709/sRGB 입력) ──

/** 흰색 좌표의 Rec.709 선형 RGB (가장 큰 채널 = 1) */
function whiteRgb(w: XY): Vec3 {
  const xyz: Vec3 = [w[0] / w[1], 1, (1 - w[0] - w[1]) / w[1]];
  const rgb = apply3(inverse(REC709), xyz);
  const k = Math.max(...rgb);
  return rgb.map((v) => v / k) as Vec3;
}

const WHITES: Array<[string, XY]> = [
  ['D55', [0.3324, 0.3474]],
  ['D60', [0.32168, 0.33767]],
  ['D65', D65],
];

interface PrintStock {
  id: string;
  name: string;
  note: string;
  /** 염료 간섭: 행 합이 1인 선형 혼합 (회색은 그대로) */
  crosstalk: Mat3;
  /** 채널별 S커브 세기 */
  contrast: Vec3;
  toe: number;
  span: number;
  shadow: Vec3;
  high: Vec3;
  split: number;
  /** 하이라이트로 갈수록 채도를 줄이는 정도 */
  highDesat: number;
}

const STOCKS: PrintStock[] = [
  {
    id: '2383',
    name: '2383 프린트 스타일',
    note: '극장 상영용 프린트 필름의 깊은 블랙, 단단한 중간톤 대비, 청록 섀도와 따뜻한 하이라이트',
    crosstalk: [[1.06, -0.04, -0.02], [-0.03, 1.05, -0.02], [-0.01, -0.07, 1.08]],
    contrast: [0.4, 0.38, 0.44],
    toe: 0.012,
    span: 0.95,
    shadow: [0.2, 0.55, 0.62],
    high: [1, 0.78, 0.5],
    split: 0.05,
    highDesat: 0.14,
  },
  {
    id: '3513',
    name: '3513DI 프린트 스타일',
    note: '디지털 중간본용 프린트 필름의 조금 낮은 대비, 차분한 녹색과 중립에 가까운 하이라이트',
    crosstalk: [[1.03, -0.01, -0.02], [-0.02, 1.04, -0.02], [-0.01, -0.03, 1.04]],
    contrast: [0.32, 0.32, 0.35],
    toe: 0.018,
    span: 0.95,
    shadow: [0.35, 0.55, 0.5],
    high: [1, 0.9, 0.78],
    split: 0.035,
    highDesat: 0.08,
  },
];

function filmLut(stock: PrintStock, [wName, w]: [string, XY]): LibraryLut {
  const white = whiteRgb(w);
  return {
    id: `film-${stock.id}-${wName.toLowerCase()}`,
    name: `Rec.709 → ${stock.name} ${wName}`,
    category: 'film',
    description: `${stock.note}. 흰색 ${wName}${wName === 'D65' ? '(화면과 같은 중립)' : wName === 'D60' ? '(조금 따뜻하게)' : '(극장 영사처럼 따뜻하게)'}. 필름 제조사·Blackmagic의 측정 LUT가 아니라 특성을 따라 만든 스타일 근사다.`,
    build: (size) =>
      buildLut(size, `Rec709 ${stock.name} ${wName}`, (r, g, b) => {
        const lin = apply3(stock.crosstalk, [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]).map((v) => Math.max(0, v)) as Vec3;
        let o = per(lin, (v, i) => stock.toe + stock.span * sCurve(linearToSrgb(Math.min(1, v)), stock.contrast[i]));
        o = splitTone(o, stock.shadow, stock.high, stock.split);
        o = sat(o, 1 - stock.highDesat * luma(o));
        return clampRgb(per(o, (v, i) => linearToSrgb(srgbToLinear(clamp01(v)) * white[i])));
      }),
  };
}

const FILM_LOOKS: LibraryLut[] = STOCKS.flatMap((st) => WHITES.map((w) => filmLut(st, w)));

// ── 유틸리티 ──

const UTILITIES: LibraryLut[] = [
  { id: 'util-identity', name: '항등 (변화 없음)', category: 'utility', description: '아무것도 바꾸지 않는 LUT. 다른 프로그램의 LUT 처리 확인용', build: (s) => buildLut(s, 'Identity', (r, g, b) => [r, g, b]) },
  { id: 'util-invert', name: '반전 (네거티브)', category: 'utility', description: '코드값을 뒤집는다 (x → 1−x)', nonMonotone: true, build: (s) => buildLut(s, 'Invert', (r, g, b) => [1 - r, 1 - g, 1 - b]) },
  {
    id: 'util-mono',
    name: '흑백 (휘도)',
    category: 'utility',
    description: '선형 공간의 Rec.709 휘도로 만든 정확한 흑백',
    build: (s) =>
      buildLut(s, 'Luminance', (r, g, b) => {
        const y = linearToSrgb(LUMA[0] * srgbToLinear(r) + LUMA[1] * srgbToLinear(g) + LUMA[2] * srgbToLinear(b));
        return [y, y, y];
      }),
  },
  {
    id: 'util-mono-contrast',
    name: '흑백 (고대비)',
    category: 'utility',
    description: '휘도 흑백에 S커브',
    build: (s) =>
      buildLut(s, 'Luminance contrast', (r, g, b) => {
        const y = sCurve(linearToSrgb(LUMA[0] * srgbToLinear(r) + LUMA[1] * srgbToLinear(g) + LUMA[2] * srgbToLinear(b)), 0.5);
        return [y, y, y];
      }),
  },
  {
    id: 'util-false-color',
    name: '폴스 컬러 (노출 확인)',
    category: 'utility',
    description: '밝기 구간을 색으로: 보라 = 블랙 잘림, 파랑 = 깊은 섀도, 초록 = 18% 회색, 분홍 = 밝은 피부, 노랑 = 하이라이트, 빨강 = 화이트 잘림',
    nonMonotone: true,
    build: (s) =>
      buildLut(s, 'False color', (r, g, b) => {
        const y = luma([r, g, b]);
        const grey = (t: number): Vec3 => [t, t, t];
        if (y < 0.02) return [0.5, 0, 0.6];
        if (y < 0.1) return [0.1, 0.25, 0.9];
        if (y >= 0.42 && y < 0.5) return [0.2, 0.75, 0.2];
        if (y >= 0.62 && y < 0.72) return [0.95, 0.55, 0.65];
        if (y >= 0.93 && y < 0.99) return [0.95, 0.9, 0.1];
        if (y >= 0.99) return [0.95, 0.1, 0.1];
        return grey(y * 0.8);
      }),
  },
  {
    id: 'util-legal-to-full',
    name: '비디오 레벨 → 풀 레벨',
    category: 'utility',
    description: '16–235로 저장된 영상을 0–255로 펼친다 (물 빠진 듯 뿌연 프레임을 바로잡기)',
    extendedRange: true,
    build: (s) => buildLut(s, 'Legal to Full', (r, g, b) => [r, g, b].map((v) => (v * 255 - 16) / 219) as Vec3),
  },
  {
    id: 'util-full-to-legal',
    name: '풀 레벨 → 비디오 레벨',
    category: 'utility',
    description: '0–255를 방송용 16–235로 좁힌다',
    build: (s) => buildLut(s, 'Full to Legal', (r, g, b) => [r, g, b].map((v) => (16 + v * 219) / 255) as Vec3),
  },
];

// ── 정원 (프리셋을 LUT로 구운 것) ──

const GARDEN_LUTS: LibraryLut[] = BUILTIN_PRESETS.filter((p) => p.category === 'garden').map((p) => ({
  id: `garden-${p.name}`,
  name: `정원 · ${p.name}`,
  category: 'garden' as const,
  description: `${p.description}.${p.nodes.some((n) => n.window.enabled) ? ' 창(Window)을 쓰는 노드는 위치 정보라 빼고 구웠다.' : ''} 수정하려면 같은 이름의 프리셋을 쓴다.`,
  build: (size: number) => bakeGradeLutSync(chainOfPreset(p), size, 'exclude', `GREEN GRADE ${p.name}`),
}));

export const LUT_LIBRARY: LibraryLut[] = [
  ...UTILITIES,
  ...VFX,
  ...CAMERAS.flatMap((c) => [cameraLut(c, false), cameraLut(c, true)]),
  ...SONY_STYLES,
  ...FILM_LOOKS,
  ...LOOKS,
  ...GARDEN_LUTS,
];

/** 노드에 넣을 때 쓰는 해상도. 33³이면 원래 함수와 평균 1 LSB 안팎 */
export const LIBRARY_LUT_SIZE = 33;

const built = new Map<string, CubeLut>();

/** 라이브러리 LUT를 만든다 (같은 LUT는 한 번만 계산). 크기를 주지 않으면 그 LUT의 기본 크기. */
export function buildLibraryLut(id: string, size?: number): CubeLut {
  const item = LUT_LIBRARY.find((x) => x.id === id);
  if (!item) throw new Error(`LUT 없음: ${id}`);
  const n = size ?? item.size ?? LIBRARY_LUT_SIZE;
  const key = `${id}@${n}`;
  let l = built.get(key);
  if (!l) {
    l = { ...item.build(n), name: item.name };
    built.set(key, l);
  }
  return l;
}
