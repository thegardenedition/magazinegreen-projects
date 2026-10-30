// 노드 마스크: HSL Qualifier(색으로 고르기)와 Window(영역으로 고르기).
// 노드의 보정은 마스크만큼만 적용된다: 출력 = mix(노드 입력, 보정 결과, 마스크).
// 셰이더의 nodeMask와 1:1로 대응하는 CPU 기준 구현을 함께 둔다.

import { LUMA, type Vec3 } from './constants';
import { RED_ANGLE } from './curves';

// ── 파라미터 ──

export interface HueRange {
  on: boolean;
  /** 색상축 위치 0–1 (빨강 0 → 노랑 → 초록 → 청록 → 파랑 → 마젠타) */
  center: number;
  /** 중심에서 양쪽으로 완전히 선택되는 폭 */
  width: number;
  soft: number;
}

export interface LinearRange {
  on: boolean;
  low: number;
  high: number;
  soft: number;
}

export interface Qualifier {
  enabled: boolean;
  invert: boolean;
  hue: HueRange;
  sat: LinearRange;
  lum: LinearRange;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * 좌표: x, y는 이미지 기준 0–1 (y는 위에서 아래). 크기·페더는 '이미지 높이' 단위라
 * 원은 가로세로 비율과 상관없이 원으로 보인다.
 */
export type WindowShape =
  | { type: 'circle'; cx: number; cy: number; rx: number; ry: number; angle: number }
  | { type: 'rect'; cx: number; cy: number; w: number; h: number; angle: number }
  | { type: 'gradient'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'polygon'; points: Point[]; smooth: boolean };

export type WindowType = WindowShape['type'];

export interface WindowParams {
  enabled: boolean;
  invert: boolean;
  feather: number;
  shape: WindowShape;
}

export const MAX_POLY_POINTS = 64;
/** 채도 1이 되는 Y'CbCr 채도(크로마). 순색 빨강·파랑이 약 0.5 */
export const SAT_SCALE = 0.5;

export function defaultQualifier(): Qualifier {
  return {
    enabled: false,
    invert: false,
    hue: { on: true, center: 0.38, width: 0.05, soft: 0.04 },
    sat: { on: true, low: 0.08, high: 1, soft: 0.06 },
    lum: { on: true, low: 0, high: 1, soft: 0.05 },
  };
}

export function defaultShape(type: WindowType): WindowShape {
  switch (type) {
    case 'circle':
      return { type, cx: 0.5, cy: 0.5, rx: 0.25, ry: 0.25, angle: 0 };
    case 'rect':
      return { type, cx: 0.5, cy: 0.5, w: 0.5, h: 0.35, angle: 0 };
    case 'gradient':
      // 위쪽(하늘)이 선택되고 화면 중간에서 사라지는 그라디언트
      return { type, x0: 0.5, y0: 0, x1: 0.5, y1: 0.5 };
    case 'polygon':
      return { type, points: [], smooth: false };
  }
}

export function defaultWindow(): WindowParams {
  return { enabled: false, invert: false, feather: 0.05, shape: defaultShape('circle') };
}

// ── 공통 수학 (셰이더와 동일) ──

/** e0→e1 사이 부드러운 0→1. e0=e1이어도 정의된다. */
export function softStep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / Math.max(e1 - e0, 1e-5)));
  return t * t * (3 - 2 * t);
}

const spow = (x: number, e: number) => Math.sign(x) * Math.pow(Math.abs(x), e);

export interface HslSample {
  /** 색상축 0–1 */
  h: number;
  /** 채도 0–1 (크로마 / SAT_SCALE, 1에서 자름) */
  s: number;
  /** 루마 Y' (그레이딩 인코딩) */
  l: number;
  chroma: number;
}

/** 선형 RGB → Qualifier가 보는 값. 색상 커브와 같은 Y'CbCr(감마 2.4 인코딩) 기준. */
export function hslOf(lin: Vec3): HslSample {
  const p = lin.map((v) => spow(v, 1 / 2.4));
  const l = LUMA[0] * p[0] + LUMA[1] * p[1] + LUMA[2] * p[2];
  const cb = (p[2] - l) / 1.8556;
  const cr = (p[0] - l) / 1.5748;
  const chroma = Math.hypot(cb, cr);
  let h = (Math.atan2(cr, cb) - RED_ANGLE) / (2 * Math.PI);
  h -= Math.floor(h);
  return { h, s: Math.min(1, chroma / SAT_SCALE), l, chroma };
}

function linearWeight(r: LinearRange, x: number): number {
  if (!r.on) return 1;
  // 0과 1 끝은 경계로 보지 않는다 (예: 낮은 끝 0 = 검정까지 모두 포함)
  const lo = r.low <= 0 ? 1 : softStep(r.low - r.soft, r.low, x);
  const hi = r.high >= 1 ? 1 : 1 - softStep(r.high, r.high + r.soft, x);
  return lo * hi;
}

export function qualifierWeight(q: Qualifier, lin: Vec3): number {
  const { h, s, l, chroma } = hslOf(lin);
  let w = 1;
  if (q.hue.on) {
    const d = Math.abs(h - q.hue.center + 0.5 - Math.floor(h - q.hue.center + 0.5) - 0.5);
    // 무채색은 색상이 정의되지 않으므로 색상 선택에서 빠진다
    w *= (1 - softStep(q.hue.width, q.hue.width + q.hue.soft, d)) * softStep(0, 0.02, chroma);
  }
  w *= linearWeight(q.sat, s);
  w *= linearWeight(q.lum, Math.min(1, Math.max(0, l)));
  return q.invert ? 1 - w : w;
}

// ── 창 ──

/** 부드러운 곡선 옵션: Catmull-Rom으로 꼭짓점 사이를 채운다 (닫힌 곡선) */
export function polygonVertices(points: Point[], smooth: boolean): Point[] {
  if (points.length < 3 || !smooth) return points.slice(0, MAX_POLY_POINTS);
  const n = points.length;
  const per = Math.max(1, Math.floor(MAX_POLY_POINTS / n));
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return out.slice(0, MAX_POLY_POINTS);
}

/** 셰이더로 넘길 형태로 정리한 창 */
export interface WindowUniform {
  type: 0 | 1 | 2 | 3;
  /** circle: cx, cy, rx, ry / rect: cx, cy, w, h / gradient: x0, y0, x1, y1 */
  a: [number, number, number, number];
  /** 회전(라디안), 페더 */
  angle: number;
  feather: number;
  /** 폴리곤 꼭짓점 (이미지 0–1 좌표) */
  poly: Point[];
}

export function windowUniform(w: WindowParams): WindowUniform {
  const s = w.shape;
  const base = { angle: 0, feather: Math.max(0, w.feather), poly: [] as Point[] };
  switch (s.type) {
    case 'circle':
      return { ...base, type: 0, a: [s.cx, s.cy, s.rx, s.ry], angle: (s.angle * Math.PI) / 180 };
    case 'rect':
      return { ...base, type: 1, a: [s.cx, s.cy, s.w, s.h], angle: (s.angle * Math.PI) / 180 };
    case 'gradient':
      return { ...base, type: 2, a: [s.x0, s.y0, s.x1, s.y1] };
    case 'polygon':
      return { ...base, type: 3, a: [0, 0, 0, 0], poly: polygonVertices(s.points, s.smooth) };
  }
}

function rotate(x: number, y: number, a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c * x + s * y, -s * x + c * y];
}

/** 부호 있는 거리 (안쪽 음수), 이미지 높이 단위 */
function polygonSdf(px: number, py: number, verts: Point[], aspect: number): number {
  const n = verts.length;
  const vx = (i: number) => verts[i].x * aspect;
  const vy = (i: number) => verts[i].y;
  let d = Infinity;
  let sign = 1;
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const ex = vx(j) - vx(i);
    const ey = vy(j) - vy(i);
    const wx = px - vx(i);
    const wy = py - vy(i);
    const t = Math.min(1, Math.max(0, (wx * ex + wy * ey) / Math.max(ex * ex + ey * ey, 1e-12)));
    const bx = wx - ex * t;
    const by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= vy(i);
    const c2 = py < vy(j);
    const c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) sign = -sign;
  }
  return sign * Math.sqrt(d);
}

/** 창 가중치 0–1. uv는 이미지 좌표(0–1), aspect = 가로/세로 */
export function windowWeight(w: WindowUniform, invert: boolean, u: number, v: number, aspect: number): number {
  const px = u * aspect;
  const py = v;
  let m: number;
  if (w.type === 2) {
    const [x0, y0, x1, y1] = w.a;
    const dx = (x1 - x0) * aspect;
    const dy = y1 - y0;
    const t = ((px - x0 * aspect) * dx + (py - y0) * dy) / Math.max(dx * dx + dy * dy, 1e-9);
    m = 1 - softStep(0, 1, t);
  } else {
    let d: number;
    if (w.type === 3) {
      if (w.poly.length < 3) return 1;
      d = polygonSdf(px, py, w.poly, aspect);
    } else {
      const [cx, cy, sx, sy] = w.a;
      const [qx, qy] = rotate(px - cx * aspect, py - cy, w.angle);
      if (w.type === 0) {
        const rx = Math.max(sx, 1e-4);
        const ry = Math.max(sy, 1e-4);
        d = (Math.hypot(qx / rx, qy / ry) - 1) * Math.min(rx, ry);
      } else {
        const ax = Math.abs(qx) - sx / 2;
        const ay = Math.abs(qy) - sy / 2;
        d = Math.hypot(Math.max(ax, 0), Math.max(ay, 0)) + Math.min(Math.max(ax, ay), 0);
      }
    }
    m = 1 - softStep(-w.feather / 2, w.feather / 2, d);
  }
  return invert ? 1 - m : m;
}

/** 노드 마스크 전체를 셰이더로 넘길 형태 */
export interface MaskUniform {
  qualifier: Qualifier | null;
  window: { w: WindowUniform; invert: boolean } | null;
}

export function maskUniform(q: Qualifier, w: WindowParams): MaskUniform | null {
  const win = w.enabled && !(w.shape.type === 'polygon' && w.shape.points.length < 3);
  if (!q.enabled && !win) return null;
  return {
    qualifier: q.enabled ? q : null,
    window: win ? { w: windowUniform(w), invert: w.invert } : null,
  };
}

/** 노드 입력 색과 위치로 마스크 값 계산 */
export function maskWeight(m: MaskUniform, lin: Vec3, u: number, v: number, aspect: number): number {
  let k = 1;
  if (m.qualifier) k *= qualifierWeight(m.qualifier, lin);
  if (m.window) k *= windowWeight(m.window.w, m.window.invert, u, v, aspect);
  return k;
}

// ── 셰이더 비트 (shaders.ts의 M_* 상수와 같다) ──

export function maskBits(m: MaskUniform | null): number {
  if (!m) return 0;
  let b = 0;
  if (m.qualifier) {
    b |= 1;
    if (m.qualifier.invert) b |= 2;
    if (m.qualifier.hue.on) b |= 4;
    if (m.qualifier.sat.on) b |= 8;
    if (m.qualifier.lum.on) b |= 16;
  }
  if (m.window) {
    b |= 32;
    if (m.window.invert) b |= 64;
    b |= m.window.w.type << 8;
    b |= Math.min(MAX_POLY_POINTS, m.window.w.poly.length) << 12;
  }
  return b;
}

// ── 스포이드 ──

/**
 * 고른 색(여러 픽셀)에 맞춰 Qualifier 범위를 정한다.
 * extend=true면 기존 범위를 넓혀 새 색까지 포함한다.
 */
export function qualifierFromSamples(samples: Vec3[], base: Qualifier, extend: boolean): Qualifier {
  const hs = samples.map(hslOf);
  const sats = hs.map((x) => x.s);
  const lums = hs.map((x) => x.l);
  // 색상: 가장 넓은 빈틈의 반대편을 범위로 (원형 평균)
  const sx = hs.reduce((a, x) => a + Math.cos(x.h * 2 * Math.PI), 0);
  const sy = hs.reduce((a, x) => a + Math.sin(x.h * 2 * Math.PI), 0);
  let center = Math.atan2(sy, sx) / (2 * Math.PI);
  center -= Math.floor(center);
  const dist = (h: number, c: number) => Math.abs(h - c + 0.5 - Math.floor(h - c + 0.5) - 0.5);
  let width = Math.max(0.02, ...hs.map((x) => dist(x.h, center)));
  let sLow = Math.max(0, Math.min(...sats) - 0.05);
  let sHigh = Math.min(1, Math.max(...sats) + 0.05);
  let lLow = Math.max(0, Math.min(...lums) - 0.08);
  let lHigh = Math.min(1, Math.max(...lums) + 0.08);

  if (extend && base.enabled) {
    // 원래 범위의 양 끝과 새 범위의 양 끝을 모두 덮는 가장 작은 호
    const ends = [base.hue.center - base.hue.width, base.hue.center + base.hue.width, center - width, center + width];
    const mid = Math.atan2(
      ends.reduce((a, e) => a + Math.sin(e * 2 * Math.PI), 0),
      ends.reduce((a, e) => a + Math.cos(e * 2 * Math.PI), 0),
    ) / (2 * Math.PI);
    center = mid - Math.floor(mid);
    width = Math.min(0.5, Math.max(...ends.map((e) => dist(e, center))));
    sLow = Math.min(sLow, base.sat.low);
    sHigh = Math.max(sHigh, base.sat.high);
    lLow = Math.min(lLow, base.lum.low);
    lHigh = Math.max(lHigh, base.lum.high);
  }
  return {
    ...base,
    enabled: true,
    hue: { ...base.hue, center, width },
    sat: { ...base.sat, low: sLow, high: sHigh },
    lum: { ...base.lum, low: lLow, high: lHigh },
  };
}
