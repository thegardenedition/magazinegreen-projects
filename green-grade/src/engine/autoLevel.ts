// 자동 수평: 사진 속 직선(지평선·처마선·기둥 등)의 방향을 모아, 가장 많은 선이 수평·수직이 되는 기울기를 찾는다.
// 밝기 기울기를 모은 구조 텐서로 경계선 방향을 구하고, 수평·수직에서 30° 안쪽인 것만 세기·일관성 가중치로 히스토그램을 만든다.

import { FULL_RECT, geometryMatrix, mapPoint, orientedSize, type Geometry, type PixelSource } from './develop';

export interface TiltResult {
  /** 선들이 수평·수직에서 기운 각도(도). 화면 기준 시계 방향이 + */
  tilt: number;
  /** 가장 많은 방향에 모인 세기 비율 (0–1). 낮으면 뚜렷한 선이 없다 */
  confidence: number;
}

const RANGE = 30;
const BIN = 0.1;

/** 분리형 가우시안 블러 (가장자리 고정) */
function blur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
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

/**
 * 흑백 픽셀(행 우선)에서 기울기를 찾는다.
 * 계단진 경계·잡티에 흔들리지 않도록 살짝 흐린 뒤, 주변 기울기를 모은 구조 텐서로 선 방향을 구하고
 * 방향이 고른 곳(진짜 선)일수록 크게 센다.
 */
export function detectTilt(gray0: Float32Array, w: number, h: number): TiltResult {
  const nb = Math.round((2 * RANGE) / BIN) + 1;
  const hist = new Float64Array(nb);
  let total = 0;
  const gray = blur(gray0, w, h, 1.2);
  const at = (x: number, y: number) => gray[y * w + x];
  const jxx = new Float32Array(w * h);
  const jyy = new Float32Array(w * h);
  const jxy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const i = y * w + x;
      jxx[i] = gx * gx;
      jyy[i] = gy * gy;
      jxy[i] = gx * gy;
    }
  // 방향을 모으는 범위: 완만하게 기운 선은 픽셀로 보면 긴 계단이라, 계단 한 칸보다 넓게 모아야 실제 기울기가 나온다
  const sxx = blur(jxx, w, h, 6);
  const syy = blur(jyy, w, h, 6);
  const sxy = blur(jxy, w, h, 6);
  // 가장자리는 형태 변환으로 생긴 경계일 수 있어 뺀다
  const m = 8;
  for (let y = m; y < h - m; y++)
    for (let x = m; x < w - m; x++) {
      const i = y * w + x;
      const a = sxx[i];
      const b = syy[i];
      const c = sxy[i];
      const energy = a + b;
      if (energy < 0.004) continue;
      const coherence = Math.sqrt((a - b) * (a - b) + 4 * c * c) / energy;
      // 기울기의 주된 방향 → 경계선 방향 (y가 아래로 커지므로 시계 방향이 +)
      let ang = (0.5 * Math.atan2(2 * c, a - b) * 180) / Math.PI - 90;
      while (ang <= -90) ang += 180;
      while (ang > 90) ang -= 180;
      let dev: number;
      if (Math.abs(ang) <= RANGE) dev = ang;
      else if (Math.abs(ang) >= 90 - RANGE) dev = ang - Math.sign(ang) * 90;
      else continue;
      const wgt = energy * coherence * coherence;
      hist[Math.round((dev + RANGE) / BIN)] += wgt;
      total += wgt;
    }
  if (total === 0) return { tilt: 0, confidence: 0 };
  // 약 ±0.5° 폭으로 부드럽게 해 봉우리를 찾는다
  const k = 5;
  let best = 0;
  let bestI = 0;
  for (let i = 0; i < nb; i++) {
    let s = 0;
    for (let j = -k; j <= k; j++) if (i + j >= 0 && i + j < nb) s += hist[i + j] * (1 - Math.abs(j) / (k + 1));
    if (s > best) {
      best = s;
      bestI = i;
    }
  }
  // 봉우리 둘레의 가중 평균으로 0.1°보다 곱게
  let sw = 0;
  let sa = 0;
  for (let j = -k; j <= k; j++) {
    const i = bestI + j;
    if (i < 0 || i >= nb) continue;
    sw += hist[i];
    sa += hist[i] * (i * BIN - RANGE);
  }
  return { tilt: sw > 0 ? sa / sw : bestI * BIN - RANGE, confidence: sw / total };
}

/** 이보다 확신이 낮으면 '뚜렷한 선이 없다'고 본다 */
export const MIN_CONFIDENCE = 0.06;

/**
 * 지금 형태(회전·반전·원근, 수평 보정은 뺀 상태)로 본 사진에서 수평 보정 값을 구한다.
 * src는 긴 변 512px 정도의 작은 사본. 돌려줄 값은 그대로 geometry.straighten에 넣으면 된다.
 */
export function autoStraighten(src: PixelSource, g: Geometry, fullW: number, fullH: number): { straighten: number; confidence: number } {
  const g0: Geometry = { ...g, straighten: 0 };
  const [W, H] = orientedSize(g.rotate, fullW, fullH);
  const long = 512;
  const w = W >= H ? long : Math.round((long * W) / H);
  const h = W >= H ? Math.round((long * H) / W) : long;
  const m = geometryMatrix(g0, fullW, fullH, FULL_RECT);
  const gray = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // 쌍선형 보간 (가장 가까운 픽셀만 쓰면 기운 선이 계단이 된다)
      const [u, v] = mapPoint(m, (x + 0.5) / w, (y + 0.5) / h);
      const fx = Math.min(src.width - 1.001, Math.max(0, u * src.width - 0.5));
      const fy = Math.min(src.height - 1.001, Math.max(0, v * src.height - 0.5));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const lum = (xx: number, yy: number) => {
        const i = (yy * src.width + xx) * 4;
        return (0.2126 * src.data[i] + 0.7152 * src.data[i + 1] + 0.0722 * src.data[i + 2]) / 255;
      };
      const top = lum(x0, y0) * (1 - tx) + lum(x0 + 1, y0) * tx;
      const bot = lum(x0, y0 + 1) * (1 - tx) + lum(x0 + 1, y0 + 1) * tx;
      gray[y * w + x] = top * (1 - ty) + bot * ty;
    }
  const r = detectTilt(gray, w, h);
  // 선이 시계 방향으로 tilt만큼 기울었으면 반시계로 그만큼 돌린다
  return { straighten: Math.round(-r.tilt * 10) / 10, confidence: r.confidence };
}
