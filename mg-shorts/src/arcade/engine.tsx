import React from 'react';
import { AbsoluteFill } from 'remotion';
import { PIXEL_EN, PIXEL_KR } from '../fonts';
import { C, sprite } from './sprites';

/* ---------------------------------------------------------------------------
 * 정원 오락실 공용 엔진 — 픽셀 버퍼, 스프라이트, 파티클, 픽셀 글자, 브라운관.
 * 회차마다 장면 그리기와 타임라인만 새로 쓴다. (파일럿 Arcade.tsx 는 이 엔진 이전에 만들어 자체 사본을 갖고 있다.)
 * ------------------------------------------------------------------------- */

export const W = 180;
export const H = 320;
export const S = 6;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const seg = (f: number, a: number, b: number) => clamp((f - a) / (b - a), 0, 1);
export const hash = (n: number) => {
  const h = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return h - Math.floor(h);
};

export const U = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16)) >>> 0;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const dth = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

export class FB {
  img: ImageData;
  u: Uint32Array;
  constructor(ctx: CanvasRenderingContext2D, from?: ImageData) {
    this.img = from ?? ctx.createImageData(W, H);
    this.u = new Uint32Array(this.img.data.buffer);
  }
  rect(x: number, y: number, w: number, h: number, c: number) {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(W, Math.round(x + w));
    const y1 = Math.min(H, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) this.u.fill(c, yy * W + x0, yy * W + x1);
  }
  px(x: number, y: number, c: number) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < W && y < H) this.u[y * W + x] = c;
  }
  grad(y0: number, y1: number, cols: string[]) {
    const cs = cols.map(U);
    const a = Math.max(0, Math.floor(y0));
    const b = Math.min(H, Math.ceil(y1));
    for (let y = a; y < b; y++) {
      const t = ((y - y0) / Math.max(1, y1 - y0)) * (cs.length - 1);
      const i = Math.min(cs.length - 2, Math.max(0, Math.floor(t)));
      const fr = t - i;
      for (let x = 0; x < W; x++) this.u[y * W + x] = dth(x, y) < fr ? cs[i + 1] : cs[i];
    }
  }
  mix(x: number, y: number, w: number, h: number, c1: string, c2: string, t: number) {
    const a = U(c1);
    const b2 = U(c2);
    for (let yy = Math.max(0, Math.round(y)); yy < Math.min(H, Math.round(y + h)); yy++)
      for (let xx = Math.max(0, Math.round(x)); xx < Math.min(W, Math.round(x + w)); xx++) this.u[yy * W + xx] = dth(xx, yy) < t ? b2 : a;
  }
  circle(cx: number, cy: number, r: number, c: number) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.px(cx + x, cy + y, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number, w = 1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) this.rect(lerp(x0, x1, i / n) - (w - 1) / 2, lerp(y0, y1, i / n) - (w - 1) / 2, w, w, c);
  }
  flush(ctx: CanvasRenderingContext2D) {
    ctx.putImageData(this.img, 0, 0);
  }
}

export const spr = (ctx: CanvasRenderingContext2D, name: string, x: number, y: number, o: { sx?: number; sy?: number; tint?: string; alpha?: number; rot?: number } = {}) => {
  const im = sprite(name, o.tint);
  const w = Math.round(im.width * Math.abs(o.sx ?? 1));
  const h = Math.round(im.height * (o.sy ?? 1));
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.rot || (o.sx ?? 1) < 0) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y - h / 2));
    if (o.rot) ctx.rotate(o.rot);
    if ((o.sx ?? 1) < 0) ctx.scale(-1, 1);
    ctx.drawImage(im, Math.round(-w / 2), Math.round(-h / 2), w, h);
    ctx.restore();
  } else ctx.drawImage(im, Math.round(x - w / 2), Math.round(y - h), w, h); // x,y = 발밑 가운데
  ctx.globalAlpha = 1;
};
export const box = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) => {
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

/** 결정적 파티클 폭발 */
export const burst = (fb: FB, f: number, t0: number, x: number, y: number, n: number, cols: string[], spd = 1.6, life = 16, grav = 0.12) => {
  const t = f - t0;
  if (t < 0 || t > life) return;
  for (let i = 0; i < n; i++) {
    const a = hash(t0 * 13 + i + x) * Math.PI * 2;
    const v = spd * (0.4 + hash(t0 * 7 + i * 3 + y));
    if (hash(i + t) < t / life) continue;
    fb.px(x + Math.cos(a) * v * t, y + Math.sin(a) * v * t + grav * t * t, U(cols[i % cols.length]));
  }
};

/** 장면 경계 픽셀 디졸브 */
export const dissolve = (ctx: CanvasRenderingContext2D, d: number) => {
  if (d <= 0) return;
  const img = ctx.getImageData(0, 0, W, H);
  const u = new Uint32Array(img.data.buffer);
  const k = U('#05030c');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dth(x, y) < d) u[y * W + x] = k;
  ctx.putImageData(img, 0, 0);
};

/* ---------- 픽셀 글자 ---------- */
export const outline = (c: string, d = 6) =>
  [
    [d, 0],
    [-d, 0],
    [0, d],
    [0, -d],
    [d, d],
    [-d, d],
    [d, -d],
    [-d, -d],
  ]
    .map(([x, y]) => `${x}px ${y}px 0 ${c}`)
    .join(',') + `, 0 ${d * 2}px 0 ${c}`;
export const EN = (size: number, color = C.cream): React.CSSProperties => ({ font: `400 ${size}px ${PIXEL_EN}`, color, textShadow: outline(C.ink), whiteSpace: 'nowrap', lineHeight: 1.25 });
export const KR = (size: number, color = C.cream): React.CSSProperties => ({ font: `700 ${size}px ${PIXEL_KR}`, color, textShadow: outline(C.ink), whiteSpace: 'nowrap', lineHeight: 1.3 });
export const center = (y: number): React.CSSProperties => ({ position: 'absolute', top: y, left: 0, width: 1080, textAlign: 'center' });
export const blinkOn = (f: number, period = 15) => Math.floor(f / period) % 2 === 0;

/** 대화 상자: 한 글자씩 찍힌다 */
export const Dialog: React.FC<{ f: number; a: number; lines: [string, string]; y?: number; size?: number }> = ({ f, a, lines, y = 1170, size = 66 }) => {
  let left = Math.floor((f - a) * 1.2);
  return (
    <div style={{ position: 'absolute', left: 84, right: 84, top: y, padding: size < 66 ? '22px 32px' : '30px 36px', background: C.ink, border: `6px solid ${C.cream}`, boxShadow: `0 0 0 6px ${C.ink}, 0 18px 0 6px rgba(0,0,0,0.4)` }}>
      {lines.map((ln, i) => {
        const shown = ln.slice(0, Math.max(0, left));
        left -= ln.length;
        return (
          <div key={i} style={{ ...KR(size, i === 1 ? C.yellow : C.cream), textShadow: 'none', minHeight: Math.round(size * 1.3) }}>
            {shown}
            {left <= 0 && left > -ln.length - 1 && blinkOn(f, 6) ? '▌' : ''}
          </div>
        );
      })}
    </div>
  );
};

/** 말풍선(캐릭터 대사) — x,y 는 화면 px, 꼬리는 아래 가운데 */
export const Bubble: React.FC<{ x: number; y: number; text: string; color?: string }> = ({ x, y, text, color = C.cream }) => (
  <div style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -100%)', background: C.ink, border: `6px solid ${color}`, padding: '14px 22px', ...KR(48, color), textShadow: 'none' }}>
    {text}
    <div style={{ position: 'absolute', left: '50%', bottom: -24, width: 18, height: 18, marginLeft: -9, background: color }} />
  </div>
);

/** 브라운관 껍데기: 흔들림·밝기 떨림·빛 번짐 캔버스 + 주사선·RGB 마스크·비네팅 */
export const CRT: React.FC<{ dx: number; dy: number; f: number; flash: number; zoom?: number; zo?: [number, number]; main: React.RefObject<HTMLCanvasElement | null>; glow: React.RefObject<HTMLCanvasElement | null>; children?: React.ReactNode }> = ({
  dx,
  dy,
  f,
  flash,
  zoom = 1,
  zo = [90, 160],
  main,
  glow,
  children,
}) => {
  const flicker = 1 + 0.025 * Math.sin(f * 1.9) + 0.015 * Math.sin(f * 0.37);
  const px: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: W * S, height: H * S, imageRendering: 'pixelated' };
  return (
    <AbsoluteFill style={{ background: '#05030c', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${dx * S}px, ${dy * S}px)`, filter: `brightness(${flicker}) saturate(1.12)` }}>
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: `${zo[0] * S}px ${zo[1] * S}px` }}>
          <canvas ref={main} width={W} height={H} style={px} />
          <canvas ref={glow} width={W} height={H} style={{ ...px, filter: 'blur(16px) brightness(1.4)', mixBlendMode: 'screen', opacity: 0.42 }} />
        </div>
        {children}
      </div>
      {flash > 0 && <AbsoluteFill style={{ background: '#fff', opacity: flash * 0.85 }} />}
      <AbsoluteFill style={{ background: 'repeating-linear-gradient(180deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 3px, rgba(0,0,0,0.28) 3px, rgba(0,0,0,0.28) 6px)' }} />
      <AbsoluteFill style={{ background: 'repeating-linear-gradient(90deg, rgba(255,40,60,0.05) 0px, rgba(255,40,60,0.05) 2px, rgba(40,255,90,0.05) 2px, rgba(40,255,90,0.05) 4px, rgba(60,90,255,0.05) 4px, rgba(60,90,255,0.05) 6px)', mixBlendMode: 'screen' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(120% 90% at 50% 50%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.55) 100%)' }} />
      <AbsoluteFill style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 30%)' }} />
    </AbsoluteFill>
  );
};
