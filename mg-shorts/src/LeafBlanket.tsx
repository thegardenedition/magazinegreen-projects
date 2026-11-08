import React, { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { loadFonts } from './fonts';
import { C } from './arcade/sprites';
import { Bubble, CRT, Dialog, EN, FB, H, KR, S, U, W, blinkOn, box, burst, center, clamp, dissolve, hash, lerp, seg, smooth, spr, srcFrame, type Holds } from './arcade/engine';
import TL from './arcade/dec.json';

loadFonts();

/* ---------------------------------------------------------------------------
 * 정원 오락실 STAGE 2 · 12월 「낙엽 이불」 (1080×1320 프레임 = 44s, 120 BPM)
 *
 * 서사: 잠든 구근이 → WARNING 북풍 접근 → 서릿발이 구근을 밀어 올린다(위기, 체력 감소)
 *   → 낙엽 기사단(단풍·은행·참나무) 출격, 찬바람을 막으며 이불을 쌓는다(콤보, 회복)
 *   → BOSS 북풍 장군: 얼음 탄막, 분노 2단계 → 이불과 기사단이 다 받아 낸다 → 북풍 퇴각(봄까지)
 *   → 이불을 들추면 겨울잠 손님들(무당벌레·지렁이) → 낙엽은 천천히 흙이 된다 → MISSION
 * 원칙: 적은 생물이 아니라 날씨. 쓰러뜨리지 않고 막아 내고, 북풍은 '물러간다'.
 * 사실: 얼었다 녹으면 서릿발이 얕은 구근을 들어 올린다 · 낙엽 덮개는 흙이 덜 얼고 덜 마르게 한다
 *       · 낙엽 밑은 곤충의 월동처 · 낙엽은 지렁이와 미생물이 천천히 흙으로 만든다.
 * 하나의 타임라인 src/arcade/dec.json 을 화면과 scripts/chiptune_dec.py 가 같이 읽는다.
 * ------------------------------------------------------------------------- */

const SC = TL.scenes as unknown as Record<string, [number, number]>;
// 무대 전체를 OY 만큼 내려 위쪽 점수판·체력 줄과 겹치지 않게 한다
const OY = 25;
const SURF = 140 + OY;
const BULB_REST = SURF + 36;
const KNIGHTS = ['maple', 'ginkgo', 'oak'] as const;
const HOME: [number, number][] = [
  [56, 112 + OY],
  [90, 104 + OY],
  [124, 112 + OY],
];

/* ---------- 상태(전부 프레임에서 계산) ---------- */
const heaveCount = (f: number) => TL.heave.filter((h) => f >= h).length;
const layerCount = (f: number) => TL.layers.filter((l) => f >= l).length;
const blockCount = (f: number) => TL.blocks.filter((b) => f >= b).length;
const pileH = (f: number) => blockCount(f) * 0.55 + layerCount(f) * 2.5 + seg(f, SC.boss[0], SC.guests[0]) * 2;
const bulbY = (f: number) => {
  const up = Math.min(24, heaveCount(f) * 6) * (1 - smooth(seg(f, TL.layers[0], TL.layers[2])));
  const bump = TL.heave.reduce((a, h) => a + (f >= h && f < h + 6 ? (6 - (f - h)) * 0.6 : 0), 0);
  return BULB_REST - up - bump;
};
const hp = (f: number) => clamp(5 - heaveCount(f) + layerCount(f), 1, 5);
const bossHP = (f: number) => 1 - TL.volleys.filter((v) => f >= v + 24).length / TL.volleys.length;
const POINTS: [number, number][] = [
  ...TL.blocks.map((b) => [b, 100] as [number, number]),
  ...TL.layers.map((l) => [l, 300] as [number, number]),
  ...TL.volleys.map((v) => [v + 24, 200] as [number, number]),
  [TL.clear, 3000],
];
const scoreAt = (f: number) => TL.startScore + Math.round(POINTS.reduce((s, [e, p]) => s + p * seg(f, e, e + 10), 0) / 10) * 10;

/* 흔들림·번쩍임 */
const SHAKES: [number, number, number][] = [
  ...TL.heave.map((h) => [h, 6, 2] as [number, number, number]),
  ...TL.blocks.map((b) => [b, 3, 1] as [number, number, number]),
  [TL.bossIn, 20, 3],
  [TL.rage, 10, 2],
  [TL.retreat, 12, 2],
];
const shakeAt = (f: number): [number, number] => {
  for (const [a, d, amp] of SHAKES) if (f >= a && f < a + d) return [Math.round((hash(f * 3.1) * 2 - 1) * amp), Math.round((hash(f * 7.7) * 2 - 1) * amp)];
  return [0, 0];
};
const flashAt = (f: number) => {
  for (const [a, d] of [
    [TL.rage, 2],
    [TL.clear, 3],
    [TL.mission, 2],
  ] as [number, number][])
    if (f >= a && f < a + d) return 1 - (f - a) / d;
  return 0;
};

/* ---------- 기사단의 막기: 막을 때마다 그 자리로 날아가 2프레임 멈춘다(히트스톱) ---------- */
const blockPt = (i: number): [number, number] => [62 + hash(i + 11) * 58, 100 + OY + hash(i + 23) * 22];
const knightAt = (k: number, f: number): [number, number] => {
  if (f < TL.launch) return [[132, 150, 120][k], [56, 44, 70][k] + OY]; // 나뭇가지에 매달려 있다
  if (f < TL.launch + 30) {
    const t = smooth(seg(f, TL.launch, TL.launch + 30));
    const from: [number, number] = [[132, 150, 120][k], [56, 44, 70][k] + OY];
    return [lerp(from[0], HOME[k][0], t) + Math.sin(t * 9 + k) * 8 * (1 - t), lerp(from[1], HOME[k][1], t)];
  }
  if (f >= SC.boss[0]) {
    // 보스전: 방패 대형으로 이불 위에 선다
    const t = smooth(seg(f, SC.boss[0], SC.boss[0] + 20));
    return [lerp(HOME[k][0], [50, 90, 130][k], t) + Math.sin(f / 9 + k * 2) * 2, lerp(HOME[k][1], 123 + OY, t) + Math.cos(f / 7 + k) * 1.5];
  }
  // 이 기사가 맡은 막기들 사이를 오간다
  const mine = TL.blocks.map((b, i) => ({ b, i })).filter((x) => x.i % 3 === k);
  let prev = { t: TL.launch + 30, p: HOME[k] };
  for (const { b, i } of mine) {
    const p = blockPt(i);
    if (f < b) {
      const t = smooth(seg(f, Math.max(prev.t, b - 26), b));
      return [lerp(prev.p[0], p[0], t), lerp(prev.p[1], p[1], t)];
    }
    if (f < b + 2) return p; // 히트스톱
    prev = { t: b + 2, p };
  }
  const t = smooth(seg(f, prev.t, prev.t + 20));
  return [lerp(prev.p[0], HOME[k][0], t), lerp(prev.p[1], HOME[k][1], t)];
};

/* ---------- 보스 ---------- */
const bossPos = (f: number): [number, number] => {
  if (f < TL.bossIn) return [90, -60];
  const inT = smooth(seg(f, TL.bossIn, TL.bossIn + 24));
  const out = smooth(seg(f, TL.retreat, TL.retreat + 30));
  const sway = Math.sin(f / 20) * 10 * inT;
  return [90 + sway - out * 120, lerp(-50, 83 + OY, inT) - out * 110];
};
const MOUTH = (f: number): [number, number] => {
  const [x, y] = bossPos(f);
  return [x, y + 12];
};
type Bullet = { v: number; a: number; hit: number; hx: number; hy: number; byKnight: boolean };
const BULLETS: Bullet[] = (() => {
  const out: Bullet[] = [];
  TL.volleys.forEach((v, vi) => {
    const rage = v >= TL.rage;
    const n = rage ? 18 : 12;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.18 + (0.64 * i) / (n - 1)) + (rage ? Math.sin(vi) * 0.12 : 0);
      const [mx, my] = MOUTH(v);
      const spd = rage ? 3 : 2.5;
      // 기사 방패(반지름 13)에 먼저 닿는지, 아니면 이불 위에 떨어지는지
      let hit = 0;
      let hx = 0;
      let hy = 0;
      let byKnight = false;
      for (let t = 1; t < 120; t++) {
        const x = mx + Math.cos(a) * spd * t;
        const y = my + Math.sin(a) * spd * t;
        const kn = [0, 1, 2].find((k) => {
          const [kx, ky] = knightAt(k, v + t);
          return Math.hypot(x - kx, y - (ky - 11)) < 13;
        });
        if (kn !== undefined || y >= SURF - pileH(v + t) - 1 || x < -4 || x > W + 4) {
          hit = v + t;
          hx = x;
          hy = y;
          byKnight = kn !== undefined;
          break;
        }
      }
      out.push({ v, a, hit, hx, hy, byKnight });
    }
  });
  return out;
})();

/* ======================= 그리기 ======================= */
function drawWorld(ctx: CanvasRenderingContext2D, f: number) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  const fb = new FB(ctx);
  const night = 1 - smooth(seg(f, SC.guests[0], SC.guests[0] + 40)) * 0.6;
  // 하늘: 밤 → 북풍이 오면 더 차갑게 → 물러가면 새벽빛
  const rage = f >= TL.rage && f < TL.retreat;
  fb.grad(0, SURF, rage ? ['#05071c', '#101a44', '#2a3a78'] : night > 0.7 ? ['#0b0d2a', '#1a2456', '#334a86'] : ['#1a2456', '#5a6aa8', '#e8a0a8']);
  for (let i = 0; i < 40; i++) if ((Math.floor(f / 8) + i) % 4) fb.px(hash(i + 3) * W, hash(i + 40) * 90, U(C.cream));
  // 벌거벗은 나무(오른쪽)
  fb.line(156, SURF, 150, 24 + OY, U('#3d2116'), 5);
  fb.line(152, 70 + OY, 118, 52 + OY, U('#3d2116'), 3);
  fb.line(151, 50 + OY, 172, 30 + OY, U('#3d2116'), 2);
  fb.line(150, 40 + OY, 132, 26 + OY, U('#3d2116'), 2);
  fb.line(120, 53 + OY, 108, 44 + OY, U('#3d2116'), 1);
  // 눈
  for (let i = 0; i < 80; i++) {
    const sp = 0.35 + hash(i) * 0.6 + (rage ? 0.8 : 0);
    const y = (hash(i + 5) * 160 + f * sp) % 160 - 10;
    const x = (hash(i * 9) * W + f * (rage ? 1.2 : 0.2) + Math.sin((f + i * 13) / 15) * 4 + W * 4) % W;
    if (y < SURF - pileH(f)) fb.px(x, y, U(i % 4 ? C.cream : C.ice));
  }
  // 땅과 흙 단면
  fb.rect(0, SURF, W, 3, U(C.cream));
  fb.grad(SURF + 3, 236, [C.soil, C.soilD, C.soilDD]);
  fb.rect(0, 236, W, H - 236, U(C.soilDD));
  for (let i = 0; i < 30; i++) fb.rect(hash(i * 3) * W, SURF + 8 + hash(i * 5 + 1) * 80, 2, 1, U(C.soilDD));
  // 서릿발: 얼음 기둥이 흙을 들어 올린다(이불이 덮이면 녹는다)
  const frost = Math.min(1, heaveCount(f) / 4) * (1 - smooth(seg(f, TL.layers[0], TL.layers[2])));
  if (frost > 0)
    for (let i = 0; i < 26; i++) {
      const x = 8 + i * 6.5;
      const h = (8 + hash(i) * 14) * frost;
      fb.rect(x, SURF + 3, 1, h, U(i % 3 ? C.ice : C.white));
    }
  // 낙엽 이불(단풍·은행·참나무 색 점묘). 분해가 진행되면 흙색으로
  const ph = pileH(f);
  const decay = TL.decay.filter((d) => f >= d).length / TL.decay.length;
  const lift = smooth(seg(f, TL.reveal[0], TL.reveal[0] + 12)) * (1 - smooth(seg(f, TL.decay[0] - 10, TL.decay[0])));
  const LEAF = [C.red, C.yellow, '#c97f45', '#ff9a2e', '#d9a21b'].map(U);
  const SOILC = [C.soil, C.soilD].map(U);
  for (let x = 6; x < W - 6; x++) {
    const hx = ph * (0.75 + 0.25 * Math.sin(x * 0.21) + 0.1 * Math.sin(x * 0.7));
    for (let y = 0; y < hx; y++) {
      if (x > 34 && x < 70 && y > 1 && lift > 0 && hash(x * 7 + y) < lift) continue; // 이불 한쪽을 들춘다
      const r = hash(x * 13 + y * 7);
      const col = r < decay * 0.95 ? SOILC[(x + y) & 1] : LEAF[Math.floor(r * 5)];
      fb.px(x, SURF - y, col);
    }
  }
  // 떨어지는 낙엽(기사단 출격 이후)
  if (f >= TL.launch && f < SC.boss[0] + 60)
    for (let i = 0; i < 24; i++) {
      const t = (f - TL.launch) * (0.8 + hash(i) * 0.6) + hash(i + 3) * 120;
      const y = 30 + OY + (t % 120);
      const x = 120 + Math.sin(t / 10 + i) * 30 - (t % 120) * 0.6;
      if (y < SURF - ph) fb.rect(x, y, 2, 2, LEAF[i % 5]);
    }
  // 막기·탄막·축하 파티클
  TL.blocks.forEach((b, i) => {
    const [x, y] = blockPt(i);
    burst(fb, f, b, x + 6, y - 10, 12, [C.white, C.ice, C.yellow], 1.6, 12, 0.02);
  });
  for (const bl of BULLETS) burst(fb, f, bl.hit, bl.hx, bl.hy, bl.byKnight ? 6 : 4, bl.byKnight ? [C.yellow, C.white] : [C.ice, C.white], 1.1, 8, 0.05);
  TL.heave.forEach((h) => burst(fb, f, h, 90, SURF + 2, 10, [C.ice, C.white, C.soil], 1.4, 12, 0.1));
  [0, 7, 14].forEach((dt, i) => burst(fb, f, TL.clear + dt, [44, 136, 90][i], [40, 36, 24][i] + OY, 26, [C.yellow, C.cream, C.rose, C.ice], 1.6, 22, 0.03));
  fb.flush(ctx);

  // 구근이(잠든 채로). 다치면 얼음색으로 번쩍, 떨림
  const hurt = TL.heave.some((h) => f >= h && f < h + 4);
  const cold = hp(f) <= 2 && f < TL.layers[1];
  const by = bulbY(f);
  const jit = cold ? Math.round(Math.sin(f * 2.1)) : 0;
  spr(ctx, f >= TL.clear ? 'bulbHappy' : 'bulbSleep', 90 + jit, by, { sx: 1.5, sy: 1.5, tint: hurt ? C.ice : undefined });
  // 겨울잠 손님: 무당벌레(들춘 이불 아래), 지렁이(흙 속)
  if (f >= TL.reveal[0]) {
    spr(ctx, 'ladybug', 52, SURF, { sx: 1.5, sy: 1.5 });
    for (let k = 0; k < 2; k++) {
      const t = (f + k * 30) % 60;
      box(ctx, 62 + t * 0.2, SURF - 12 - t * 0.3, 2, 1, C.cream);
    }
  }
  if (f >= TL.reveal[1]) {
    const wx = 128;
    const wy = SURF + 28;
    for (let s2 = 0; s2 < 8; s2++) box(ctx, wx + s2 * 3, wy + Math.round(Math.sin(f / 5 + s2 * 0.9) * 2), 3, 3, s2 === 0 ? C.pink : C.rose);
  }
  // 기사단
  KNIGHTS.forEach((name, k) => {
    const [x, y] = knightAt(k, f);
    const flick = TL.blocks.some((b, i) => i % 3 === k && f >= b && f < b + 3);
    const bob = f >= TL.launch ? Math.round(Math.sin(f / 6 + k) * 1) : 0;
    spr(ctx, name, x, y + bob, { sx: flick ? 2.3 : 2, sy: flick ? 1.7 : 2, tint: flick ? C.white : undefined, rot: f >= TL.launch && f < SC.boss[0] ? Math.sin(f / 10 + k) * 0.15 : 0 });
    // 보스전 방패
    if (f >= SC.boss[0] + 10 && f < TL.retreat + 10) {
      ctx.strokeStyle = BULLETS.some((b) => b.byKnight && f >= b.hit && f < b.hit + 3 && Math.abs(b.hx - x) < 14) ? C.yellow : 'rgba(159,232,255,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(Math.round(x) + 0.5, Math.round(y - 11) + 0.5, 13, Math.PI, 2 * Math.PI);
      ctx.stroke();
    }
  });
  // 찬바람(막히기 전까지 오른쪽에서 날아든다)
  TL.blocks.forEach((b, i) => {
    if (f < b - 30 || f >= b) return;
    const [px, py] = blockPt(i);
    const t = seg(f, b - 30, b);
    spr(ctx, 'gust', lerp(196, px + 10, t), lerp(py - 6 + Math.sin(i) * 14, py - 6, t) + Math.sin(f / 3) * 1, { sx: 1.6, sy: 1.6 });
  });
  // 보스: 구름 덩어리 + 화난 얼굴(분노하면 눈이 붉게)
  if (f >= TL.bossIn && f < TL.retreat + 32) {
    const [bx, byy] = bossPos(f);
    const s = 1 - 0.35 * smooth(seg(f, TL.retreat, TL.retreat + 30));
    const rageNow = f >= TL.rage;
    const body = rageNow ? '#b9d4ff' : '#e8f4ff';
    const fbb = new FB(ctx, ctx.getImageData(0, 0, W, H));
    const puff = 1 + 0.08 * Math.sin(f / 4);
    [
      [0, 0, 20],
      [-20, 4, 14],
      [20, 4, 14],
      [-10, -12, 13],
      [12, -11, 12],
    ].forEach(([dx, dy, r]) => fbb.circle(bx + dx * s, byy + dy * s, Math.round(r * s * puff), U(body)));
    fbb.circle(bx - 26 * s, byy + 8 * s, Math.round(8 * s), U(C.ice));
    fbb.circle(bx + 26 * s, byy + 8 * s, Math.round(8 * s), U(C.ice));
    fbb.flush(ctx);
    const eye = rageNow && f % 6 < 3 ? C.red : C.ink;
    box(ctx, bx - 9 * s, byy - 3 * s, 4 * s, 3 * s, eye);
    box(ctx, bx + 5 * s, byy - 3 * s, 4 * s, 3 * s, eye);
    // 눈썹: 가운데로 갈수록 내려가는 계단(화난 얼굴)
    for (let k = 0; k < 3; k++) {
      box(ctx, bx - (12 - k * 2) * s, byy - (9 - k) * s, 2 * s + 1, 1.2 * s, C.ink);
      box(ctx, bx + (10 - k * 2) * s, byy - (9 - k) * s, 2 * s + 1, 1.2 * s, C.ink);
    }
    const blowing = TL.volleys.some((v) => f >= v - 6 && f < v + 4);
    box(ctx, bx - (blowing ? 3 : 2) * s, byy + 6 * s, (blowing ? 6 : 4) * s, (blowing ? 6 : 3) * s, C.ink);
  }
  // 얼음 탄
  for (const bl of BULLETS) {
    if (f < bl.v || f >= bl.hit) continue;
    const t = f - bl.v;
    const [mx, my] = MOUTH(bl.v);
    const spd = bl.v >= TL.rage ? 3 : 2.5;
    spr(ctx, 'shard', mx + Math.cos(bl.a) * spd * t, my + Math.sin(bl.a) * spd * t + 1, { sx: 1.4, sy: 1.4 });
  }
  dissolve(ctx, f >= TL.mission - 10 && f < TL.mission ? (f - (TL.mission - 10)) / 10 : f >= TL.mission ? 0.82 : 0);
}

/* ======================= 글자 ======================= */
const CAPTIONS: { a: number; b: number; lines: [string, string] }[] = [
  { a: 26, b: 116, lines: ['12월, 땅이 얼기 시작해요', '구근이는 땅속에서 자요'] },
  { a: 192, b: 414, lines: ['얼었다 녹았다 하면', '서릿발이 구근을 밀어 올려요'] },
  { a: 450, b: 714, lines: ['낙엽을 덮어 주면', '흙이 덜 얼고 덜 말라요'] },
  { a: 790, b: 986, lines: ['낙엽 이불을 덮으면', '찬 기운이 덜 닿아요'] },
  { a: 1030, b: 1104, lines: ['이불 아래는', '벌레들의 겨울 집'] },
  { a: 1110, b: 1196, lines: ['낙엽은 천천히', '흙이 돼요'] },
];
const BUBBLES: { a: number; b: number; who: () => [number, number]; text: string; color?: string }[] = [
  { a: 352, b: 418, who: () => [90, bulbY(352) - 30], text: '추워…!', color: C.ice },
  { a: TL.launch + 14, b: TL.launch + 104, who: () => [70, 92 + OY], text: '구근이를 지켜라!', color: C.red },
  { a: TL.bossIn + 26, b: TL.bossIn + 98, who: () => [148, 70 + OY], text: '후우우—!', color: C.ice },
  { a: TL.rage + 2, b: TL.rage + 74, who: () => [148, 70 + OY], text: '더 차갑게!', color: C.ice },
  { a: TL.retreat + 2, b: TL.retreat + 40, who: () => [92, 70 + OY], text: '봄에 다시 보자…', color: C.ice },
  { a: TL.reveal[0] + 8, b: TL.reveal[0] + 60, who: () => [52, SURF - 16], text: '쉿, 겨울잠 중', color: C.rose },
  { a: TL.reveal[1] + 6, b: TL.reveal[1] + 60, who: () => [134, SURF + 20], text: '이 잎은 내가 흙으로!', color: C.pink },
];
// 낙엽이 흙이 되기까지는 1년 안팎이 걸린다(감수: 몇 달 만에 흙이 되는 것처럼 보이지 않게)
const MONTHS = ['봄', '여름', '가을', '겨울', '1년 뒤'];

/** f: 원본 프레임(멈춤 동안 고정), t: 출력 프레임(깜박임은 멈춤 중에도 계속) */
const Overlay: React.FC<{ f: number; t: number }> = ({ f, t }) => {
  const els: React.ReactNode[] = [];
  const play = f < TL.mission;
  if (play) {
    els.push(
      <div key="hud" style={{ position: 'absolute', top: 300, left: 96, right: 164, display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <div style={EN(36, C.pink)}>1UP</div>
          <div style={EN(36)}>{String(scoreAt(f)).padStart(6, '0')}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={EN(36, C.ice)}>HI</div>
          <div style={EN(36)}>050000</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={EN(36, C.yellow)}>STAGE</div>
          <div style={EN(36)}>2</div>
        </div>
      </div>,
    );
    // 체력 줄: 구근이 하트 + (보스전) 북풍 냉기 바
    const hearts = hp(f);
    const danger = hearts <= 2 && blinkOn(t, 4);
    els.push(
      <div key="hp" style={{ position: 'absolute', top: 400, left: 96, right: 164, display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={KR(40, C.cream)}>구근이</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} style={{ width: 30, height: 30, background: i < hearts ? (danger ? C.white : C.pink) : '#3a2a3e', border: `6px solid ${C.ink}` }} />
          ))}
        </div>
        {f >= TL.bossIn + 10 && f < TL.retreat + 20 && (
          <>
            <div style={{ ...KR(40, C.ice), marginLeft: 'auto' }}>북풍</div>
            <div style={{ width: 230, height: 36, background: C.ink, border: `6px solid ${C.cream}`, padding: 4 }}>
              <div style={{ width: `${bossHP(f) * 100}%`, height: '100%', background: f >= TL.rage && f % 4 < 2 ? C.red : C.ice }} />
            </div>
          </>
        )}
      </div>,
    );
  }
  // 이어하기 → 제목 카드
  if (f < 22) els.push(<div key="cont" style={{ ...EN(60, C.pink), ...center(820) }}>CONTINUE? {blinkOn(t, 5) ? '▶YES' : ' YES'}</div>);
  else if (f < 104) {
    const pop = Math.min(1, (f - 22) / 6);
    els.push(
      <div key="card" style={{ position: 'absolute', left: 90, right: 90, top: 640, padding: '44px 0', background: 'rgba(5,3,12,0.86)', border: `6px solid ${C.cream}`, outline: `6px solid ${C.ink}`, textAlign: 'center', transform: `scaleY(${pop})` }}>
        <div style={EN(60, C.yellow)}>STAGE 2</div>
        <div style={{ ...KR(84), marginTop: 22 }}>12월 · 낙엽 이불</div>
      </div>,
    );
  }
  // WARNING 띠
  if (f >= TL.warning[0] && f < SC.heave[0]) {
    const on = blinkOn(t, 8);
    const stripe = `repeating-linear-gradient(135deg, ${C.red} 0 36px, ${C.ink} 36px 72px)`;
    els.push(
      <div key="warn" style={{ position: 'absolute', left: 0, right: 0, top: 640, opacity: on ? 1 : 0.55 }}>
        <div style={{ height: 30, background: stripe, backgroundPositionX: -f * 6 }} />
        <div style={{ background: 'rgba(60,6,16,0.9)', padding: '26px 0', textAlign: 'center' }}>
          <div style={EN(84, C.red)}>WARNING!</div>
          <div style={{ ...KR(60, C.cream), marginTop: 12 }}>북풍 장군이 다가온다</div>
        </div>
        <div style={{ height: 30, background: stripe, backgroundPositionX: f * 6 }} />
      </div>,
    );
  }
  if (f >= TL.bossIn + 6 && f < TL.bossIn + 80) els.push(<div key="bn" style={{ ...KR(66, C.ice), ...center(760) }}>BOSS · 북풍 장군</div>);
  // 콤보·막기 팝업
  TL.blocks.forEach((b, i) => {
    if (f >= b && f < b + 16) {
      const [x, y] = blockPt(i);
      els.push(<div key={`bk${i}`} style={{ ...EN(30, C.yellow), position: 'absolute', left: x * S - 50, top: (y - 30 - (f - b) * 0.6) * S }}>BLOCK!</div>);
    }
  });
  const lastB = [...TL.blocks].reverse().find((b) => f >= b);
  if (lastB !== undefined && f < lastB + 24 && f < SC.boss[0]) els.push(<div key="combo" style={{ ...EN(48, C.yellow), position: 'absolute', right: 180, top: 560 }}>COMBO ×{blockCount(f)}</div>);
  TL.layers.forEach((l, i) => {
    if (f >= l && f < l + 30) els.push(<div key={`ly${i}`} style={{ ...KR(54, C.yellow), ...center((SURF - 30 - (f - l) * 0.5) * S) }}>이불 +1 · 구근이 회복</div>);
  });
  if (f >= TL.clear && f < TL.clear + 26)
    els.push(
      <div key="clr" style={{ ...center(560) }}>
        <div style={KR(84, [C.yellow, C.cream, C.ice][Math.floor(f / 3) % 3])}>북풍 퇴각!</div>
        <div style={{ ...EN(54, C.pink), marginTop: 16 }}>STAGE CLEAR</div>
      </div>,
    );
  // 분해 시간 흐름
  if (f >= TL.decay[0] && f < TL.mission) {
    const k = TL.decay.filter((d) => f >= d).length;
    els.push(<div key="time" style={{ ...EN(36, C.cream), position: 'absolute', right: 180, top: 560 }}>TIME ▶ {MONTHS[k - 1]}</div>);
  }
  // 말풍선
  for (const b of BUBBLES) if (f >= b.a && f < b.b) {
    const [x, y] = b.who();
    els.push(<Bubble key={`b${b.a}`} x={x * S} y={y * S} text={b.text} color={b.color} />);
  }
  for (const c of CAPTIONS) if (f >= c.a && f < c.b) els.push(<Dialog key={`c${c.a}`} f={f} a={c.a} lines={c.lines} y={1236} size={58} t={t} />);
  // 미션 카드
  if (f >= TL.mission) {
    const pop = Math.min(1, (f - TL.mission) / 6);
    els.push(
      <div key="mission" style={{ position: 'absolute', left: 84, right: 84, top: 520, padding: '48px 40px', background: C.ink, border: `6px solid ${C.yellow}`, outline: `6px solid ${C.ink}`, transform: `scale(${0.9 + 0.1 * pop})`, opacity: pop }}>
        <div style={{ ...EN(60, C.pink), textAlign: 'center' }}>MISSION</div>
        <div style={{ ...KR(66, C.cream), textAlign: 'center', marginTop: 30, textShadow: 'none' }}>화분과 화단에</div>
        <div style={{ ...KR(66, C.yellow), textAlign: 'center', textShadow: 'none' }}>낙엽 이불 덮어 주기</div>
        <div style={{ ...KR(44, C.cream), textAlign: 'center', marginTop: 26, textShadow: 'none', opacity: 0.85 }}>병든 잎은 빼고 덮어요</div>
        <div style={{ ...KR(44, C.ice), textAlign: 'center', marginTop: 40, textShadow: 'none', opacity: f >= TL.mission + 30 ? 1 : 0 }}>CLEAR 조건 · 낙엽 이불 사진</div>
      </div>,
    );
    if (f >= TL.mission + 50) els.push(<div key="next" style={{ ...KR(54, C.cream), ...center(1260) }}>NEXT ▶ 1월 「분신술」</div>);
    if (f >= TL.mission + 64) els.push(<div key="mg" style={{ ...EN(42, C.green), ...center(1400), letterSpacing: 4 }}>MAGAZINE GREEN</div>);
  }
  return <>{els}</>;
};

export const LeafBlanket: React.FC = () => {
  const t = useCurrentFrame();
  const f = srcFrame(t, TL.holds as Holds);
  const main = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    drawWorld(main.current!.getContext('2d')!, f);
    const g = glow.current!.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    g.drawImage(main.current!, 0, 0);
  }, [f]);
  const [dx, dy] = shakeAt(f);
  return (
    <>
      <Audio src={staticFile('leaf-blanket.wav')} />
      <CRT dx={dx} dy={dy} f={t} flash={flashAt(f)} main={main} glow={glow}>
        <Overlay f={f} t={t} />
      </CRT>
      {f >= TL.warning[0] && f < SC.heave[0] && <AbsoluteFill style={{ background: C.red, opacity: blinkOn(t, 8) ? 0.12 : 0, mixBlendMode: 'screen' }} />}
    </>
  );
};
