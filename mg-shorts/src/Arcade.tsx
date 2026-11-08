import React, { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { PIXEL_EN, PIXEL_KR, loadFonts } from './fonts';
import { C, sprite } from './arcade/sprites';
import TL from './arcade/timeline.json';
import { srcFrame, type Holds } from './arcade/engine';

loadFonts();

/* ---------------------------------------------------------------------------
 * 「구근의 모험」 — 아케이드 픽셀 모션 (1080×1920, 30fps, 40s, 8비트 사운드)
 *
 * 튤립 구근 한 알의 한 해를 아케이드 스테이지로:
 *   TITLE(코인 투입) → STAGE 1 가을: 구근 키의 2~3배 깊이로 심기 → STAGE 2 겨울: 추위가 꽃눈을 깨운다
 *   → STAGE 3 봄: 땅을 뚫고 올라와 개화 → BONUS: 꽃이 진 뒤 잎이 빛을 모아 구근을 키우고 새끼 구근(1UP)
 *   → CONTINUE?: 여름엔 땅속에서 쉬고 다음 가을에.
 *
 * 기법(video-motion 스킬)
 *  - 진짜 저해상도: 180×320 논리 캔버스를 정확히 6배로(image-rendering: pixelated). 픽셀 글꼴도 6배수 크기.
 *  - 하나의 타임라인: src/arcade/timeline.json 을 화면과 scripts/chiptune.py(소리)가 같이 읽는다.
 *  - 배경은 픽셀 버퍼(ImageData)에 4×4 베이어 디더링으로, 캐릭터는 스프라이트 캔버스로.
 *  - 아케이드 손맛: 박자 위 점프(120 BPM = 15f/박), 착지 찌그러짐, 맞으면 흰 번쩍임 + 화면 흔들림 + 히트스톱,
 *    점수 롤업, 깜빡이는 INSERT COIN, 픽셀 디졸브 전환, 브라운관 주사선·RGB 마스크·빛 번짐.
 * ------------------------------------------------------------------------- */

const W = 180;
const H = 320;
const S = 6;
const SC = TL.scenes as unknown as Record<string, [number, number]>;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const seg = (f: number, a: number, b: number) => clamp((f - a) / (b - a), 0, 1);
const hash = (n: number) => {
  const h = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return h - Math.floor(h);
};

/* ---------- 픽셀 버퍼 ---------- */
const U = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16)) >>> 0;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dth = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

class FB {
  img: ImageData;
  u: Uint32Array;
  constructor(ctx: CanvasRenderingContext2D) {
    this.img = ctx.createImageData(W, H);
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
  /** 세로 그라디언트를 디더링 띠로(아케이드 하늘) */
  grad(y0: number, y1: number, cols: string[]) {
    const cs = cols.map(U);
    const a = Math.max(0, Math.floor(y0));
    const b = Math.min(H, Math.ceil(y1));
    for (let y = a; y < b; y++) {
      const t = ((y - y0) / Math.max(1, y1 - y0)) * (cs.length - 1);
      const i = Math.min(cs.length - 2, Math.floor(t));
      const fr = t - i;
      for (let x = 0; x < W; x++) this.u[y * W + x] = dth(x, y) < fr ? cs[i + 1] : cs[i];
    }
  }
  /** 두 색을 비율 t 로 섞은 디더 면 */
  mix(x: number, y: number, w: number, h: number, c1: string, c2: string, t: number) {
    const a = U(c1);
    const b2 = U(c2);
    for (let yy = Math.max(0, Math.round(y)); yy < Math.min(H, Math.round(y + h)); yy++)
      for (let xx = Math.max(0, Math.round(x)); xx < Math.min(W, Math.round(x + w)); xx++) this.u[yy * W + xx] = dth(xx, yy) < t ? b2 : a;
  }
  circle(cx: number, cy: number, r: number, c: number) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.px(cx + x, cy + y, c);
  }
  flush(ctx: CanvasRenderingContext2D) {
    ctx.putImageData(this.img, 0, 0);
  }
}

const spr = (ctx: CanvasRenderingContext2D, name: string, x: number, y: number, opts: { sx?: number; sy?: number; tint?: string; alpha?: number } = {}) => {
  const im = sprite(name, opts.tint);
  const w = Math.round(im.width * (opts.sx ?? 1));
  const h = Math.round(im.height * (opts.sy ?? 1));
  ctx.globalAlpha = opts.alpha ?? 1;
  // x,y = 발밑 가운데(바닥 기준) — 찌그러져도 땅에 붙어 있다
  ctx.drawImage(im, Math.round(x - w / 2), Math.round(y - h), w, h);
  ctx.globalAlpha = 1;
};
const box = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) => {
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

/* ---------- 카메라 확대: 스테이지 2~4 는 1.5배(캐릭터가 휴대폰에서 읽히게). 장면 경계의 검은 프레임에서 바뀐다 ---------- */
const ZO = { x: 90, y: 165 };
const zoomAt = (f: number) => (f >= SC.s2[0] && f < SC.end[0] ? 1.5 : 1);
/** 논리 좌표 → 화면 px (확대 반영) */
const toScr = (x: number, y: number, f: number): [number, number] => {
  const z = zoomAt(f);
  return [(ZO.x + (x - ZO.x) * z) * S, (ZO.y + (y - ZO.y) * z) * S];
};

/* ---------- 점수: 이벤트마다 점수가 10프레임 동안 굴러 올라간다 ---------- */
const POINTS: [number, number][] = [
  ...TL.hops.map((h) => [h, 10] as [number, number]),
  [TL.planted, 500],
  ...TL.frost.map((h) => [h, 100] as [number, number]),
  [TL.powerup, 1000],
  ...TL.drops.map((h) => [h, 100] as [number, number]),
  [TL.clear, 2000],
  ...TL.lights.map((h) => [h, 50] as [number, number]),
];
const scoreAt = (f: number) => Math.round(POINTS.reduce((s, [e, p]) => s + p * seg(f, e, e + 10), 0) / 10) * 10;

/* ---------- 흔들림·번쩍임 ---------- */
const SHAKES: [number, number, number][] = [
  [TL.plunge + 16, 6, 2],
  ...TL.frost.map((h) => [h, 4, 1] as [number, number, number]),
  [TL.powerup, 20, 1],
  [TL.burst, 10, 3],
  [TL.clear, 8, 2],
];
const shakeAt = (f: number): [number, number] => {
  for (const [a, d, amp] of SHAKES)
    if (f >= a && f < a + d) {
      const k = f - a;
      return [Math.round((hash(f * 3.1) * 2 - 1) * amp), Math.round((hash(f * 7.7) * 2 - 1) * amp)];
    }
  return [0, 0];
};
const FLASHES: [number, number][] = [
  [TL.start, 4],
  [TL.powerup, 3],
  [TL.burst, 2],
  [TL.clear, 3],
];
const flashAt = (f: number) => {
  for (const [a, d] of FLASHES) if (f >= a && f < a + d) return 1 - (f - a) / d;
  return 0;
};

/* ---------- 파티클(결정적): 시작 프레임·씨앗에서 위치를 계산 ---------- */
const burst = (fb: FB, f: number, t0: number, x: number, y: number, n: number, cols: string[], spd = 1.6, life = 16, grav = 0.12) => {
  const t = f - t0;
  if (t < 0 || t > life) return;
  for (let i = 0; i < n; i++) {
    const a = hash(t0 * 13 + i) * Math.PI * 2;
    const v = spd * (0.4 + hash(t0 * 7 + i * 3));
    const px = x + Math.cos(a) * v * t;
    const py = y + Math.sin(a) * v * t + grav * t * t;
    if (hash(i + t) < t / life) continue; // 수명 끝으로 갈수록 듬성듬성
    fb.px(px, py, U(cols[i % cols.length]));
  }
};

/* ======================= 장면별 그리기 ======================= */

/** 땅속 단면(흙 3층 + 자갈) — oy: 화면 위로 올린 양 */
const soil = (fb: FB, top: number, oy = 0) => {
  const y0 = top - oy;
  fb.rect(0, y0, W, 2, U(C.green));
  fb.rect(0, y0 + 2, W, 2, U(C.greenD));
  fb.grad(y0 + 4, y0 + 260, [C.soil, C.soil, C.soilD, C.soilDD]);
  fb.rect(0, y0 + 260, W, Math.max(0, H - (y0 + 260)), U(C.soilDD));
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(hash(i * 3) * W);
    const y = y0 + 10 + Math.floor(hash(i * 5 + 1) * 240);
    fb.rect(x, y, 2, 1, U(i % 3 ? C.soilDD : C.tanD));
  }
};

function drawTitle(ctx: CanvasRenderingContext2D, fb: FB, f: number) {
  fb.grad(0, 236, ['#0d0b2e', '#1d1648', '#3b2468', '#6a2f7a']);
  for (let i = 0; i < 60; i++) {
    const x = hash(i) * W;
    const y = hash(i + 99) * 200;
    const on = (Math.floor(f / 6) + i) % 5 !== 0;
    if (on) fb.px(x, y, U(i % 7 === 0 ? C.ice : C.cream));
  }
  // 줄무늬 해(레트로 일몰)
  for (let y = -16; y <= 0; y++) {
    if ((y + 16) % 4 === 3 && y > -12) continue;
    const half = Math.floor(Math.sqrt(256 - y * y));
    fb.rect(90 - half, 220 + y, half * 2, 1, U(y < -8 ? C.yellow : C.orange));
  }
  // 언덕 실루엣 두 겹
  for (let x = 0; x < W; x++) {
    const h1 = 214 + Math.round(Math.sin(x * 0.06 + 1) * 6 + Math.sin(x * 0.13) * 3);
    fb.rect(x, h1, 1, 236 - h1, U('#2a1a4a'));
    const h2 = 224 + Math.round(Math.sin(x * 0.09 + 3) * 4);
    fb.rect(x, h2, 1, 236 - h2, U('#1a1033'));
  }
  soil(fb, 236);
  // 줄지어 흘러가는 작은 튤립(어트랙트 모드)
  for (let i = 0; i < 12; i++) {
    const x = ((i * 34 - f * 0.8) % 400 + 400) % 400 - 20;
    fb.rect(x, 230, 1, 6, U(C.greenD));
    fb.rect(x - 1, 227, 3, 3, U([C.red, C.yellow, C.rose, C.ice][i % 4]));
  }
  fb.flush(ctx);
  // 마스코트: 박자에 맞춰 통통(착지 순간 찌그러짐), START 에 크게 점프
  const beat = f % 15;
  let lift = Math.sin((beat / 15) * Math.PI) * 6;
  let sx = beat < 2 ? 1.18 : 1;
  let sy = beat < 2 ? 0.84 : 1;
  if (f >= TL.start) {
    const t = f - TL.start;
    lift = Math.max(0, 24 * Math.sin(Math.min(1, t / 18) * Math.PI));
    sx = t < 3 ? 0.85 : 1;
    sy = t < 3 ? 1.2 : 1;
  }
  const blink = f % 45 > 41;
  spr(ctx, f >= TL.start ? 'bulbHappy' : blink ? 'bulbBlink' : 'bulb', 90, 236 - lift, { sx: sx * 2, sy: sy * 2 });
}

function drawStage1(ctx: CanvasRenderingContext2D, fb: FB, f: number) {
  const hop = TL.hops;
  const view = smooth(seg(f, 330, 390)) * 70;
  // 노을 하늘(줄무늬 해 포함)
  fb.grad(0 - view, 150 - view, ['#3a2a6e', '#a14a8a', '#ff7a6b', '#ffb35c']);
  for (let y = -14; y <= 0; y++) {
    if ((y + 14) % 3 === 2 && y > -10) continue;
    const half = Math.floor(Math.sqrt(196 - y * y));
    fb.rect(132 - half, 128 + y - view, half * 2, 1, U(y < -6 ? C.yellow : C.orange));
  }
  for (let x = 0; x < W; x++) {
    const h1 = 128 + Math.round(Math.sin(x * 0.05) * 7 + Math.sin(x * 0.17) * 2);
    fb.rect(x, h1 - view, 1, 150 - h1, U('#6b3f7a'));
    const h2 = 138 + Math.round(Math.sin(x * 0.08 + 2) * 4);
    fb.rect(x, h2 - view, 1, 150 - h2, U('#4a2f5e'));
  }
  soil(fb, 150, view);
  // 구멍과 판 자리
  const dug = seg(f, TL.plunge + 16, TL.planted);
  if (f >= TL.plunge + 14) {
    fb.rect(84, 150 - view, 16, 4, U(C.soilDD));
    fb.rect(86, 154 - view, 12, Math.round(54 * dug), U('#4a2a1c'));
  }
  // 낙엽
  for (let i = 0; i < 14; i++) {
    const t = (f * (0.6 + hash(i) * 0.5) + hash(i + 7) * 300) % 300;
    const x = (hash(i * 3) * W + Math.sin((f + i * 20) / 12) * 8 + W) % W;
    fb.rect(x, t - 150 - view, 2, 2, U([C.orange, C.red, C.yellow][i % 3]));
  }
  // 구근 키 자(×1 ×2 ×3) — 구근 키 18px 를 단위로
  if (f >= TL.ruler[0] - 4) {
    fb.rect(118, 150 - view, 1, 56, U(C.cream));
    TL.ruler.forEach((r, k) => {
      if (f >= r) fb.rect(115, 150 + 18 * (k + 1) - view, 7, 1, U(k === 2 ? C.yellow : C.cream));
    });
  }
  burst(fb, f, TL.digs[0], 92, 150 - view, 14, [C.tanD, C.soil, C.root], 1.4, 14);
  burst(fb, f, TL.digs[1], 92, 150 - view, 14, [C.tanD, C.soil, C.root], 1.4, 14);
  burst(fb, f, TL.digs[2], 92, 150 - view, 14, [C.tanD, C.soil, C.root], 1.4, 14);
  burst(fb, f, TL.planted, 92, 204 - view - 10, 18, [C.yellow, C.cream, C.pink], 1.2, 18, 0.02);
  fb.flush(ctx);

  // 구근: 서 있기 → 박자 점프 4번 → 크게 뛰어 구멍으로 → 파고 내려감
  let x = 18;
  let y = 150;
  let sx = 1;
  let sy = 1;
  let name = f % 40 > 36 ? 'bulbBlink' : 'bulb';
  hop.forEach((h, i) => {
    if (f >= h) x = 18 + 16 * Math.min(i + 1, (f - h) / 12 + i);
  });
  x = Math.min(x, 18 + 16 * 4);
  for (const h of hop) {
    const t = f - h;
    if (t >= 0 && t < 12) {
      y = 150 - Math.sin((t / 12) * Math.PI) * 12;
      sx = 0.88;
      sy = 1.14;
      name = 'bulbWalk';
    } else if (t >= 12 && t < 15) {
      sx = 1.2;
      sy = 0.82;
    }
  }
  const p = TL.plunge;
  if (f >= p) {
    const t = f - p;
    x = lerp(82, 92, seg(f, p, p + 12));
    if (t < 16) {
      y = 150 - Math.sin((t / 16) * Math.PI) * 22;
      sx = 0.85;
      sy = 1.18;
    } else {
      y = 150 + 54 * smooth(dug);
      sx = t < 19 ? 1.25 : 1;
      sy = t < 19 ? 0.8 : 1;
      // 파는 동안 좌우로 꿈틀
      if (f < TL.planted) x += Math.round(Math.sin(f * 1.3));
    }
    name = f >= TL.planted ? 'bulbHappy' : 'bulb';
  }
  spr(ctx, name, x, y - view, { sx, sy });
}

function drawStage2(ctx: CanvasRenderingContext2D, fb: FB, f: number) {
  const surf = 108;
  fb.grad(0, surf, ['#0b0d2a', '#1a2456', '#334a86']);
  for (let i = 0; i < 70; i++) {
    const sp = 0.4 + hash(i) * 0.7;
    const y = (hash(i + 5) * 120 + f * sp) % 120 - 10;
    const x = (hash(i * 9) * W + Math.sin((f + i * 13) / 15) * 5 + W) % W;
    if (y < surf) fb.px(x, y, U(i % 4 ? C.cream : C.ice));
  }
  soil(fb, surf);
  // 눈 덮인 땅 + 위쪽 흙에 스민 냉기(디더)
  fb.rect(0, surf - 3, W, 5, U(C.cream));
  for (let x = 0; x < W; x += 1) if (hash(x) > 0.6) fb.px(x, surf - 4, U(C.cream));
  const cold = TL.frost.filter((h) => f >= h).length / TL.frost.length;
  fb.mix(0, surf + 4, W, 30, C.soil, '#3a4f8a', 0.25 + 0.45 * cold);
  // 냉기 맞을 때 파편
  TL.frost.forEach((h) => burst(fb, f, h, 90, 158, 10, [C.ice, C.white, C.blue], 1.8, 12, 0.05));
  // 파워업 고리
  const pu = f - TL.powerup;
  if (pu >= 0 && pu < 30) {
    for (let r = 0; r < 2; r++) {
      const rad = pu * 2.2 - r * 10;
      if (rad <= 0) continue;
      for (let a = 0; a < 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        fb.px(90 + Math.cos(ang) * rad, 160 + Math.sin(ang) * rad, U(a % 2 ? C.yellow : C.pink));
      }
    }
  }
  fb.flush(ctx);

  // 냉기 적: 하늘에서 내려와 박자마다 구근에 닿는다 — 이 게임에서 추위는 적이 아니라 힘
  TL.frost.forEach((h, i) => {
    const t0 = h - 36;
    if (f < t0 || f >= h) return;
    const u = (f - t0) / 36;
    const x0 = 22 + ((i * 53) % 136);
    const x = lerp(x0, 90, u * u) + Math.sin(u * 9 + i) * 6 * (1 - u);
    const y = lerp(36, 160, u);
    spr(ctx, 'frost', x, y, { sx: f % 4 < 2 ? 1 : -1 });
  });
  // 구근: 잠든 채로, 맞으면 하얗게 번쩍. 파워업이면 색이 돈다
  const hitNow = TL.frost.some((h) => f >= h && f < h + 3);
  let tint: string | undefined = hitNow ? C.white : undefined;
  if (pu >= 0 && pu < 22) tint = [C.white, C.yellow, C.pink, undefined][Math.floor(pu / 2) % 4];
  const name = pu >= 0 ? 'bulbHappy' : 'bulbSleep';
  spr(ctx, name, 90, 172, { tint, sx: hitNow ? 1.12 : 1, sy: hitNow ? 0.9 : 1 });
  if (pu >= 10) spr(ctx, 'tip', 90, 154 - Math.min(6, (pu - 10) / 2));
  // 잠꼬대 z
  if (pu < 0) {
    for (let k = 0; k < 2; k++) {
      const t = (f + k * 30) % 60;
      const zx = 102 + t * 0.25;
      const zy = 150 - t * 0.4;
      box(ctx, zx, zy, 3, 1, C.cream);
      box(ctx, zx + 1, zy + 1, 1, 1, C.cream);
      box(ctx, zx, zy + 2, 3, 1, C.cream);
    }
  }

}

/* 봄: 싹이 돌을 피해 물방울을 모으며 땅을 뚫고 올라간다 */
const PATH: [number, number, number][] = [
  [705, 90, 282],
  [720, 75, 248],
  [735, 95, 225],
  [750, 106, 205],
  [765, 92, 185],
  [780, 82, 165],
  [795, 95, 140],
  [810, 98, 115],
  [825, 90, 85],
  [840, 90, 58],
];
const tipAt = (f: number): [number, number] => {
  if (f <= PATH[0][0]) return [PATH[0][1], PATH[0][2]];
  for (let i = 0; i < PATH.length - 1; i++) {
    const [a, x1, y1] = PATH[i];
    const [b, x2, y2] = PATH[i + 1];
    if (f <= b) {
      const t = smooth((f - a) / (b - a));
      return [lerp(x1, x2, t), lerp(y1, y2, t)];
    }
  }
  const l = PATH[PATH.length - 1];
  return [l[1], l[2]];
};
const STONES: [number, number][] = [
  [112, 252],
  [62, 214],
  [116, 172],
  [66, 132],
];
const DROPS = TL.drops.map((d) => {
  const [x, y] = tipAt(d);
  return { f: d, x, y };
});

function drawStage3(ctx: CanvasRenderingContext2D, fb: FB, f: number) {
  const [tx, ty] = tipAt(f);
  const vt = clamp(ty - 150, -80, 140); // 화면 위쪽이 가리키는 세계 y
  const sy = (wy: number) => wy - vt;
  fb.grad(sy(-60), sy(60), ['#3f7fe0', '#5ab0ff', '#9fe8ff', '#e8fbff']);
  // 구름
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 60 + f * 0.3) % 240) - 30;
    fb.circle(cx, sy(-10 + i * 12), 5, U(C.white));
    fb.circle(cx + 6, sy(-12 + i * 12), 6, U(C.white));
    fb.circle(cx + 13, sy(-10 + i * 12), 4, U(C.white));
  }
  soil(fb, 60, vt);
  // 지나온 줄기(2px) + 잎
  const steps = 60;
  for (let k = 0; k <= steps; k++) {
    const ff = PATH[0][0] + ((Math.min(f, TL.burst) - PATH[0][0]) * k) / steps;
    const [x, y] = tipAt(ff);
    fb.rect(x, sy(y), 2, 2, U(C.green));
    fb.px(x + 2, sy(y), U(C.greenD));
  }
  STONES.forEach(([x, y]) => 0);
  fb.flush(ctx);
  STONES.forEach(([x, y]) => spr(ctx, 'stone', x, sy(y) + 3, { sx: 1.4, sy: 1.4 }));
  DROPS.forEach((d) => {
    if (f < d.f) spr(ctx, 'drop', d.x, sy(d.y) + 3 + Math.round(Math.sin(f / 5 + d.x) * 1));
  });
  // 물방울 모을 때 반짝임
  const fb2 = new FB(ctx);
  fb2.img = ctx.getImageData(0, 0, W, H);
  fb2.u = new Uint32Array(fb2.img.data.buffer);
  DROPS.forEach((d) => burst(fb2, f, d.f, d.x, sy(d.y), 12, [C.ice, C.white, C.blue], 1.2, 14, 0));
  burst(fb2, f, TL.burst, 90, sy(60), 26, [C.tanD, C.soil, C.green, C.root], 2.2, 20, 0.15);
  // 축포 세 발
  [0, 6, 12].forEach((dt, i) => burst(fb2, f, TL.clear + dt, [50, 130, 90][i], sy([-20, -30, -40][i]), 30, [[C.pink, C.yellow], [C.ice, C.white], [C.rose, C.orange]][i], 1.6, 22, 0.04));
  fb2.flush(ctx);
  // 구근(맨 아래)과 싹 끝
  spr(ctx, 'bulbHappy', 90, sy(300));
  if (f < TL.burst) spr(ctx, 'tip', tx + 1, sy(ty) + 3);
  else {
    const g = seg(f, TL.burst, TL.burst + 10);
    const top = 58 - 26 * g;
    box(ctx, 90, sy(top), 2, sy(60) - sy(top), C.green);
    spr(ctx, 'leafL', 85, sy(60), { sx: 1.5, sy: 1.5 });
    spr(ctx, 'leafR', 98, sy(60), { sx: 1.5, sy: 1.5 });
    const name = f < TL.burst + 12 ? 'bud' : f < TL.burst + 22 ? 'budPink' : 'tulip';
    const pop = name === 'tulip' && f < TL.clear + 4 ? 1.25 : 1;
    spr(ctx, name, 91, sy(top) + 2, { sx: pop, sy: pop });
  }
}

function drawStage4(ctx: CanvasRenderingContext2D, fb: FB, f: number) {
  const surf = 122;
  const bulbY = surf + 54;
  fb.grad(0, surf, ['#5ab0ff', '#8fd3ff', '#d6f6ff']);
  // 해와 도는 빛살
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + f * 0.03;
    for (let r = 12; r < 18; r++) fb.px(62 + Math.cos(a) * r, 78 + Math.sin(a) * r, U(C.yellow));
  }
  fb.circle(62, 78, 9, U(C.orange));
  fb.circle(62, 78, 7, U(C.yellow));
  soil(fb, surf);
  // 땅속 줄기(구근과 잎이 이어져 있다)
  for (let y = surf + 4; y < bulbY - 18; y += 2) fb.rect(90, y, 2, 1, U(C.greenD));
  // 빛 → 잎 → 줄기 타고 구근으로 내려가는 양분
  TL.lights.forEach((L) => {
    const t = f - L;
    if (t >= 0 && t < 18) fb.rect(90, lerp(surf - 30, bulbY - 18, t / 18), 2, 2, U(C.yellow));
  });
  TL.lights.forEach((L, i) => burst(fb, f, L, i % 2 ? 100 : 80, surf - 22, 8, [C.yellow, C.pale], 1, 10, 0));
  TL.oneups.forEach((o, i) => burst(fb, f, o, i ? 118 : 62, bulbY - 6, 14, [C.pink, C.cream, C.yellow], 1.3, 14, 0.05));
  fb.flush(ctx);

  // 꽃잎이 떨어진다(꽃이 진다) — 잎은 남는다
  const fall = seg(f, 930, 965);
  box(ctx, 90, surf - 34, 2, 34, C.green);
  spr(ctx, 'leafL', 82, surf - 14, { sx: 2, sy: 2 });
  spr(ctx, 'leafR', 101, surf - 14, { sx: 2, sy: 2 });
  if (f < 930) spr(ctx, 'tulip', 91, surf - 32);
  else
    for (let k = 0; k < 6; k++) {
      const px = 86 + (k % 3) * 4 + Math.sin(f / 6 + k) * 4 * fall;
      const py = surf - 40 + fall * (36 + k * 3);
      if (py < surf) box(ctx, px, py, 2, 3, k % 2 ? C.red : C.rose);
    }
  // 빛 코인: 해에서 출발해 잎에 닿는다
  TL.lights.forEach((L, i) => {
    const t0 = L - 20;
    if (f < t0 || f >= L) return;
    const u = (f - t0) / 20;
    const tx = i % 2 ? 102 : 78;
    spr(ctx, 'light', lerp(62, tx, u), lerp(84, surf - 20, u * u) + 3);
  });
  // 구근이 자란다(에너지만큼), 새끼 구근 둘
  const energy = TL.lights.filter((L) => f >= L + 18).length / TL.lights.length;
  const s = 1 + 0.3 * energy;
  spr(ctx, energy > 0.99 ? 'bulbHappy' : 'bulb', 90, bulbY, { sx: s, sy: s });
  TL.oneups.forEach((o, i) => {
    const t = f - o;
    if (t < 0) return;
    const j = Math.max(0, Math.sin(Math.min(1, t / 12) * Math.PI) * 8);
    spr(ctx, 'mini', i ? 118 : 62, bulbY - j);
  });

}

function drawEnd(ctx: CanvasRenderingContext2D, fb: FB, f: number) {
  fb.grad(0, H, ['#05030c', '#0d0b2e', '#1d1648']);
  for (let i = 0; i < 50; i++) if ((Math.floor(f / 8) + i) % 4) fb.px(hash(i + 3) * W, hash(i + 40) * 300, U(i % 5 ? C.cream : C.ice));
  if (f >= TL.farewell) {
    soil(fb, 176);
    fb.rect(0, 172, W, 4, U(C.green));
  }
  fb.flush(ctx);
  if (f >= TL.farewell) {
    spr(ctx, 'bulbSleep', 90, 214);
    for (let k = 0; k < 2; k++) {
      const t = (f + k * 30) % 60;
      box(ctx, 102 + t * 0.25, 196 - t * 0.4, 3, 1, C.cream);
      box(ctx, 103 + t * 0.25, 197 - t * 0.4, 1, 1, C.cream);
      box(ctx, 102 + t * 0.25, 198 - t * 0.4, 3, 1, C.cream);
    }
  }
}

/** 장면 경계의 픽셀 디졸브(베이어 문턱): 끝 10f 는 검게, 시작 8f 는 검정에서 */
const BOUNDS = [SC.s1[0], SC.s2[0], SC.s3[0], SC.s4[0], SC.end[0]];
const dissolveAt = (f: number) => {
  for (const b of BOUNDS) {
    if (f >= b - 10 && f < b) return (f - (b - 10)) / 10;
    if (f >= b && f < b + 8) return 1 - (f - b) / 8;
  }
  return 0;
};

function drawFrame(ctx: CanvasRenderingContext2D, f: number) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  const fb = new FB(ctx);
  if (f < SC.s1[0]) drawTitle(ctx, fb, f);
  else if (f < SC.s2[0]) drawStage1(ctx, fb, f);
  else if (f < SC.s3[0]) drawStage2(ctx, fb, f);
  else if (f < SC.s4[0]) drawStage3(ctx, fb, f);
  else if (f < SC.end[0]) drawStage4(ctx, fb, f);
  else drawEnd(ctx, fb, f);
  const d = dissolveAt(f);
  if (d > 0) {
    const img = ctx.getImageData(0, 0, W, H);
    const u = new Uint32Array(img.data.buffer);
    const k = U('#05030c');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dth(x, y) < d) u[y * W + x] = k;
    ctx.putImageData(img, 0, 0);
  }
}

/* ======================= 글자(DOM, 픽셀 글꼴 6배수) ======================= */
const outline = (c: string, d = 6) =>
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
const EN = (size: number, color = C.cream): React.CSSProperties => ({ font: `400 ${size}px ${PIXEL_EN}`, color, textShadow: outline(C.ink), whiteSpace: 'nowrap', lineHeight: 1.25 });
const KR = (size: number, color = C.cream): React.CSSProperties => ({ font: `700 ${size}px ${PIXEL_KR}`, color, textShadow: outline(C.ink), whiteSpace: 'nowrap', lineHeight: 1.3 });
const at = (x: number, y: number, align: 'left' | 'center' | 'right' = 'left'): React.CSSProperties => ({
  position: 'absolute',
  top: y,
  ...(align === 'left' ? { left: x } : align === 'right' ? { right: 1080 - x } : { left: 0, width: 1080, textAlign: 'center' as const }),
});
const blinkOn = (f: number, period = 15) => Math.floor(f / period) % 2 === 0;

const STAGES: Record<string, { n: string; kr: string }> = {
  s1: { n: 'STAGE 1', kr: '가을 · 심기' },
  s2: { n: 'STAGE 2', kr: '겨울 · 추위' },
  s3: { n: 'STAGE 3', kr: '봄 · 싹과 꽃' },
  s4: { n: 'BONUS', kr: '꽃이 진 뒤' },
};
const CAPTIONS: { a: number; b: number; lines: [string, string] }[] = [
  { a: 318, b: 414, lines: ['구근 키의 2~3배', '깊이로 심어요'] },
  { a: 470, b: 654, lines: ['겨울 추위가', '꽃눈을 깨워요'] },
  { a: 712, b: 836, lines: ['봄이 오면', '땅을 뚫고 올라와요'] },
  { a: 944, b: 1074, lines: ['꽃이 져도 잎은 남겨요', '잎이 내년 구근을 키워요'] },
];
const POPS: { f: number; x: number; y: number; t: string; c: string }[] = [
  { f: TL.planted, x: 92, y: 120, t: '+500', c: C.yellow },
  ...TL.frost.map((h) => ({ f: h, x: 108, y: 136, t: '+100', c: C.ice })),
  ...DROPS.map((d) => ({ f: d.f, x: d.x + 10, y: 150 - 12, t: '+100', c: C.ice })),
  ...TL.lights.map((L, i) => ({ f: L, x: i % 2 ? 112 : 66, y: 112, t: '+50', c: C.yellow })),
];

/** f: 원본 프레임(멈춤 동안 고정), t: 출력 프레임(깜박임은 멈춤 중에도 계속) */
const Overlay: React.FC<{ f: number; t: number }> = ({ f, t }) => {
  const els: React.ReactNode[] = [];
  const inStage = f >= SC.s1[0] && f < SC.end[0];
  if (inStage) {
    const sc = String(scoreAt(f)).padStart(6, '0');
    const st = f < SC.s2[0] ? '1' : f < SC.s3[0] ? '2' : f < SC.s4[0] ? '3' : 'B';
    els.push(
      <div key="hud" style={{ position: 'absolute', top: 300, left: 96, right: 164, display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <div style={EN(36, C.pink)}>1UP</div>
          <div style={EN(36)}>{sc}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={EN(36, C.ice)}>HI</div>
          <div style={EN(36)}>050000</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={EN(36, C.yellow)}>STAGE</div>
          <div style={EN(36)}>{st}</div>
        </div>
      </div>,
    );
  }
  // 스테이지 카드 + READY? GO!
  for (const k of Object.keys(STAGES)) {
    const [a] = SC[k];
    const [r, g] = (TL.ready as unknown as Record<string, [number, number]>)[k];
    if (f >= a + 4 && f < g + 12) {
      const pop = Math.min(1, (f - a - 4) / 6);
      els.push(
        <div key={`card${k}`} style={{ position: 'absolute', left: 90, right: 90, top: 640, padding: '48px 0', background: 'rgba(5,3,12,0.86)', border: `6px solid ${C.cream}`, outline: `6px solid ${C.ink}`, textAlign: 'center', transform: `scaleY(${pop})` }}>
          <div style={EN(72, C.yellow)}>{STAGES[k].n}</div>
          <div style={{ ...KR(72), marginTop: 24 }}>{STAGES[k].kr}</div>
          <div style={{ ...EN(60, f >= g ? C.pink : C.ice), marginTop: 36, visibility: f >= r && (f >= g || blinkOn(t, 4)) ? 'visible' : 'hidden' }}>{f >= g ? 'GO!' : 'READY?'}</div>
        </div>,
      );
    }
  }
  // 설명 자막(대화 상자)
  for (const c of CAPTIONS)
    if (f >= c.a && f < c.b) {
      const typed = Math.floor((f - c.a) * 1.2); // 글자가 한 자씩 찍힌다(아케이드 대화 상자)
      let left = typed;
      els.push(
        <div key={`cap${c.a}`} style={{ position: 'absolute', left: 84, right: 84, top: 1170, padding: '30px 36px', background: C.ink, border: `6px solid ${C.cream}`, boxShadow: `0 0 0 6px ${C.ink}, 0 18px 0 6px rgba(0,0,0,0.4)` }}>
          {c.lines.map((ln, i) => {
            const shown = ln.slice(0, Math.max(0, left));
            left -= ln.length;
            return (
              <div key={i} style={{ ...KR(66, i === 1 ? C.yellow : C.cream), textShadow: 'none', minHeight: 86 }}>
                {shown}
                {left <= 0 && left > -ln.length - 1 && blinkOn(t, 6) ? '▌' : ''}
              </div>
            );
          })}
        </div>,
      );
    }
  // 점수 팝업
  for (const p of POPS)
    if (f >= p.f && f < p.f + 18) {
      const t = (f - p.f) / 18;
      els.push(
        <div key={`p${p.f}${p.x}`} style={{ ...EN(36, p.c), position: 'absolute', left: toScr(p.x, 0, p.f)[0] - 60, top: toScr(0, p.y - t * 12, p.f)[1], opacity: t > 0.75 ? 0 : 1 }}>
          {p.t}
        </div>,
      );
    }
  // 특수 문구
  if (f >= TL.powerup && f < TL.powerup + 34)
    els.push(
      <div key="pu" style={{ ...EN(84, [C.yellow, C.pink, C.ice, C.cream][Math.floor(f / 2) % 4]), ...at(0, 520, 'center') }}>
        POWER UP!
      </div>,
    );
  if (f >= TL.clear && f < SC.s4[0] - 10)
    els.push(
      <div key="clr" style={{ ...at(0, 1180, 'center') }}>
        <div style={EN(84, [C.yellow, C.pink, C.cream][Math.floor(f / 3) % 3])}>STAGE</div>
        <div style={EN(84, [C.pink, C.yellow, C.cream][Math.floor(f / 3) % 3])}>CLEAR!</div>
      </div>,
    );
  TL.oneups.forEach((o, i) => {
    if (f >= o && f < o + 28) els.push(<div key={`1up${i}`} style={{ ...EN(48, C.pink), position: 'absolute', left: toScr(i ? 118 : 62, 0, o)[0] - 72, top: toScr(0, 150 - (f - o) * 0.5, o)[1] }}>1UP</div>);
  });
  // 게이지(화면 고정 줄, 자막 상자 바로 위): 추위는 9칸, 에너지는 연속
  const gauge = (key: string, label: string, col: string, frac: number, segs = 0, hot = false) => (
    <div key={key} style={{ position: 'absolute', left: 96, right: 164, top: 1092, display: 'flex', alignItems: 'center', gap: 24 }}>
      <div style={EN(36, col)}>{label}</div>
      <div style={{ flex: 1, height: 42, background: C.ink, border: `6px solid ${C.cream}`, boxShadow: `0 0 0 6px ${C.ink}`, display: 'flex', gap: 6, padding: 6 }}>
        {segs
          ? Array.from({ length: segs }, (_, k) => <div key={k} style={{ flex: 1, background: k < Math.round(frac * segs) ? (hot && f % 4 < 2 ? C.yellow : k > 5 ? C.white : C.ice) : 'transparent' }} />)
          : <div style={{ width: `${frac * 100}%`, background: hot && f % 4 < 2 ? C.white : C.yellow }} />}
      </div>
    </div>
  );
  if (f >= SC.s2[0] + 50 && f < SC.s3[0] - 10) els.push(gauge('chill', 'CHILL', C.ice, TL.frost.filter((h) => f >= h).length / TL.frost.length, 9, f >= TL.powerup));
  if (f >= SC.s4[0] + 40 && f < SC.end[0] - 10) {
    const e = TL.lights.filter((L) => f >= L + 18).length / TL.lights.length;
    els.push(gauge('en', 'ENERGY', C.yellow, e, 0, e > 0.99));
  }
  if (f >= TL.ruler[0] && f < SC.s2[0] - 10) {
    const view = 70;
    TL.ruler.forEach((r, k) => {
      if (f >= r) els.push(<div key={`r${k}`} style={{ ...EN(36, k === 2 ? C.yellow : C.cream), position: 'absolute', left: 126 * S, top: (150 + 18 * (k + 1) - view) * S - 20 }}>×{k + 1}</div>);
    });
  }
  // 타이틀
  if (f < SC.s1[0]) {
    const bob = Math.round(Math.sin((f / 15) * Math.PI) * 2) * 6;
    els.push(
      <div key="logo" style={{ ...at(0, 470 + bob, 'center') }}>
        <div style={{ font: `700 144px ${PIXEL_KR}`, color: C.yellow, textShadow: `0 12px 0 ${C.orange}, 0 24px 0 ${C.red}, 0 36px 0 #6a2f7a, ${outline(C.ink, 6)}` }}>구근의 모험</div>
        <div style={{ ...EN(36, C.ice), marginTop: 70, letterSpacing: 6 }}>THE BULB QUEST</div>
      </div>,
    );
    els.push(<div key="hi" style={{ ...EN(36, C.ice), ...at(0, 300, 'center') }}>HI-SCORE 050000</div>);
    if (f < TL.coin) {
      if (blinkOn(t)) els.push(<div key="ic" style={{ ...EN(48, C.cream), ...at(0, 1060, 'center') }}>INSERT COIN</div>);
    } else if (f < TL.start) {
      if (blinkOn(t, 5)) els.push(<div key="ps" style={{ ...EN(48, C.yellow), ...at(0, 1060, 'center') }}>PRESS START</div>);
    } else els.push(<div key="ps2" style={{ ...EN(48, f % 4 < 2 ? C.white : C.pink), ...at(0, 1060, 'center') }}>PRESS START</div>);
    els.push(<div key="cr" style={{ ...EN(36, C.cream), ...at(0, 1720, 'center') }}>CREDIT {f >= TL.coin ? '01' : '00'}</div>);
    els.push(<div key="by" style={{ ...KR(48, C.cream), ...at(0, 860, 'center') }}>튤립 구근의 한 해</div>);
  }
  // 엔딩
  if (f >= SC.end[0]) {
    if (f < TL.farewell) {
      const n = 9 - TL.count.filter((c) => f >= c).length + 1;
      els.push(<div key="cont" style={{ ...EN(72, C.pink), ...at(0, 520, 'center') }}>CONTINUE?</div>);
      els.push(<div key="num" style={{ ...EN(240, C.yellow), ...at(0, 700, 'center') }}>{n}</div>);
    } else {
      els.push(
        <div key="bye" style={{ ...at(0, 470, 'center') }}>
          <div style={KR(72, C.cream)}>여름엔 땅속에서 쉬고</div>
          <div style={{ ...KR(72, C.yellow), marginTop: 20 }}>다음 가을에 또 만나요</div>
        </div>,
      );
      els.push(<div key="mg" style={{ ...EN(48, C.green), ...at(0, 1440, 'center'), letterSpacing: 4 }}>MAGAZINE GREEN</div>);
      if (blinkOn(t)) els.push(<div key="ic2" style={{ ...EN(48, C.cream), ...at(0, 1560, 'center') }}>INSERT COIN</div>);
    }
  }
  return <>{els}</>;
};

/* ======================= 조립 + 브라운관 ======================= */
export const Arcade: React.FC = () => {
  const t = useCurrentFrame();
  const f = srcFrame(t, TL.holds as Holds);
  const main = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = main.current!.getContext('2d')!;
    drawFrame(ctx, f);
    const g = glow.current!.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    g.drawImage(main.current!, 0, 0);
  }, [f]);
  const [dx, dy] = shakeAt(f);
  const flash = flashAt(f);
  const flicker = 1 + 0.025 * Math.sin(t * 1.9) + 0.015 * Math.sin(t * 0.37);
  const px: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: W * S, height: H * S, imageRendering: 'pixelated' };
  return (
    <AbsoluteFill style={{ background: '#05030c', overflow: 'hidden' }}>
      <Audio src={staticFile('arcade.wav')} />
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${dx * S}px, ${dy * S}px)`, filter: `brightness(${flicker}) saturate(1.12)` }}>
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoomAt(f)})`, transformOrigin: `${ZO.x * S}px ${ZO.y * S}px` }}>
          <canvas ref={main} width={W} height={H} style={px} />
          <canvas ref={glow} width={W} height={H} style={{ ...px, filter: 'blur(16px) brightness(1.4)', mixBlendMode: 'screen', opacity: 0.42 }} />
        </div>
        <Overlay f={f} t={t} />
      </div>
      {flash > 0 && <AbsoluteFill style={{ background: '#fff', opacity: flash * 0.85 }} />}
      {/* 브라운관: 주사선(논리 픽셀 한 줄마다) · RGB 세로 마스크 · 비네팅 · 유리 반사 */}
      <AbsoluteFill style={{ background: 'repeating-linear-gradient(180deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 3px, rgba(0,0,0,0.28) 3px, rgba(0,0,0,0.28) 6px)', pointerEvents: 'none' }} />
      <AbsoluteFill style={{ background: 'repeating-linear-gradient(90deg, rgba(255,40,60,0.05) 0px, rgba(255,40,60,0.05) 2px, rgba(40,255,90,0.05) 2px, rgba(40,255,90,0.05) 4px, rgba(60,90,255,0.05) 4px, rgba(60,90,255,0.05) 6px)', mixBlendMode: 'screen' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(120% 90% at 50% 50%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.55) 100%)' }} />
      <AbsoluteFill style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 30%)' }} />
    </AbsoluteFill>
  );
};
