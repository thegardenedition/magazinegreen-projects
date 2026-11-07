import React from 'react';

/* ---------------------------------------------------------------------------
 * 동화책 키트: 팔레트, 시드 난수, 수채 필터, 물감 덩어리 경로, 꽃·잎·나비 같은 그림 부품.
 * 모든 모양은 시드에서 결정적으로 만들어진다(프레임 N 의 그림은 N 만으로 정해짐).
 * ------------------------------------------------------------------------- */

export const P = {
  paper: '#FBF5EA',
  paperShade: '#EFE3CF',
  ink: '#5E4B57',
  inkSoft: 'rgba(94,75,87,0.55)',
  peach: '#F7C8B4',
  rose: '#F3B4C6',
  roseDeep: '#E996AE',
  butter: '#F8E3A3',
  mint: '#C3E6D2',
  sky: '#CFE3F3',
  skyTop: '#B7D2EE',
  lavender: '#D9CBF0',
  lilac: '#C6B3E8',
  sage: '#B4D3AA',
  sageDeep: '#8DB792',
  leaf: '#9CC79A',
  soil1: '#EAD6C2',
  soil2: '#DEC4AE',
  soil3: '#CFB49F',
  stone: '#CFC6D6',
  wood: '#D9B791',
  bark: '#A88A7A',
  white: '#FFFDF8',
};

/** mulberry32 — 시드 고정 난수 */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 선 끓음(line boil): 3프레임마다 바뀌는 필터 시드 → 10fps 로 떨리는 손그림 선 */
export const boil = (f: number) => Math.floor(f / 3) % 4;

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const mixHex = (a: string, b: string, t: number) => {
  const A = hex(a);
  const B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
};

type Pt = [number, number];
/** 닫힌 Catmull-Rom → 베지어 */
export function closedCurve(pts: Pt[]) {
  const n = pts.length;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}
/** 열린 곡선 */
export function openCurve(pts: Pt[]) {
  const n = pts.length;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/** 물감 덩어리: 타원 둘레를 시드로 흔든 닫힌 곡선 */
export function blob(cx: number, cy: number, rx: number, ry: number, seed: number, wob = 0.14, n = 9) {
  const r = rng(seed);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (r() - 0.5) * 2 * wob;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return closedCurve(pts);
}

/** 위가 물결치는 띠(언덕·지층) */
export function wavyBand(x0: number, x1: number, yTop: number, yBottom: number, amp: number, seed: number, steps = 9) {
  const r = rng(seed);
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    pts.push([x, yTop + Math.sin(i * 1.3 + seed) * amp + (r() - 0.5) * amp * 0.6]);
  }
  return `${openCurve(pts)} L${x1},${yBottom} L${x0},${yBottom} Z`;
}

/** 수채 한 칠: 묽은 면 + 가장자리에 고이는 진한 물감(wet edge) */
export const Wash: React.FC<{ d: string; fill: string; opacity?: number; edge?: number }> = ({ d, fill, opacity = 0.88, edge = 0.38 }) => (
  <g>
    <path d={d} fill={fill} opacity={opacity} />
    <path d={d} fill="none" stroke={mixHex(fill.startsWith('#') ? fill : '#888888', P.ink, 0.28)} strokeWidth={2.4} opacity={edge} />
  </g>
);

/** 필터 정의 — 문서 전체에서 url(#…) 로 쓴다 */
export const Defs: React.FC = () => (
  <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
    <defs>
      {[0, 1, 2, 3].map((i) => (
        <React.Fragment key={i}>
          {/* 수채 가장자리 번짐: 저주파 노이즈로 윤곽을 밀어낸다 */}
          <filter id={`wc${i}`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves={2} seed={i * 7 + 3} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={11} xChannelSelector="R" yChannelSelector="G" result="d" />
            <feGaussianBlur in="d" stdDeviation={0.7} />
          </filter>
          {/* 펜 선 떨림: 고주파, 작은 변위 */}
          <filter id={`ink${i}`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves={1} seed={i * 11 + 5} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={3.2} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </React.Fragment>
      ))}
      <radialGradient id="bokeh">
        <stop offset="0" stopColor="#FFFDF2" stopOpacity="0.95" />
        <stop offset="0.45" stopColor="#FFF4C8" stopOpacity="0.45" />
        <stop offset="1" stopColor="#FFF4C8" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="ray" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFFBEA" stopOpacity="0.75" />
        <stop offset="1" stopColor="#FFFBEA" stopOpacity="0" />
      </linearGradient>
    </defs>
  </svg>
);

/** 꽃: 줄기 + 잎 + 꽃잎(물감 덩어리) — bloom 은 스프링(살짝 넘침 허용, 동화의 탄성) */
export const Flower: React.FC<{
  x: number;
  y: number;
  size: number;
  color: string;
  seed: number;
  bloom: number;
  sway?: number;
  stemH?: number;
}> = ({ x, y, size, color, seed, bloom, sway = 0, stemH }) => {
  if (bloom <= 0.001) return null;
  const r = rng(seed);
  const h = (stemH ?? size * 2.4) * Math.min(1, bloom * 1.4);
  const tx = x + sway * h * 0.5;
  const ty = y - h;
  const n = 5 + Math.floor(r() * 2);
  const rot0 = r() * 360;
  const pb = Math.max(0, (bloom - 0.25) / 0.75);
  return (
    <g>
      <path d={`M${x},${y} Q${x + sway * h * 0.1},${y - h * 0.55} ${tx},${ty}`} stroke={P.sageDeep} strokeWidth={Math.max(2, size * 0.09)} fill="none" strokeLinecap="round" />
      <Wash d={blob(x + (x < tx ? 1 : -1) * size * 0.35 + sway * h * 0.2, y - h * 0.42, size * 0.42, size * 0.16, seed + 5, 0.2, 7)} fill={P.leaf} opacity={0.8} />
      <g transform={`translate(${tx},${ty}) scale(${pb}) rotate(${rot0 + sway * 30})`}>
        {Array.from({ length: n }, (_, k) => (
          <g key={k} transform={`rotate(${(k * 360) / n})`}>
            <Wash d={blob(size * 0.42, 0, size * 0.44, size * 0.27, seed * 13 + k, 0.16, 8)} fill={color} />
          </g>
        ))}
        <Wash d={blob(0, 0, size * 0.2, size * 0.2, seed + 9, 0.12, 7)} fill={P.butter} opacity={0.95} />
      </g>
    </g>
  );
};

/** 나비: 위아래 날개 한 쌍씩, 날갯짓은 좌우 날개의 가로 비율로 */
export const ButterflyArt: React.FC<{ open: number; hue?: 'rose' | 'lilac' }> = ({ open, hue = 'rose' }) => {
  const up = hue === 'rose' ? P.rose : P.lilac;
  const low = hue === 'rose' ? P.peach : P.lavender;
  const wing = (side: 1 | -1) => (
    <g transform={`scale(${side * Math.max(0.12, open)},1)`}>
      <Wash d={blob(30, -18, 30, 24, 71, 0.12, 8)} fill={up} opacity={0.95} edge={0.6} />
      <Wash d={blob(22, 20, 19, 17, 72, 0.14, 8)} fill={low} opacity={0.95} edge={0.6} />
      <circle cx={34} cy={-20} r={5} fill={P.white} opacity={0.75} />
    </g>
  );
  return (
    <g>
      {wing(1)}
      {wing(-1)}
      <path d="M0,-26 L0,30" stroke={P.ink} strokeWidth={5} strokeLinecap="round" />
      <path d="M0,-26 Q-8,-44 -14,-50 M0,-26 Q8,-44 14,-50" stroke={P.ink} strokeWidth={2} fill="none" strokeLinecap="round" />
    </g>
  );
};
