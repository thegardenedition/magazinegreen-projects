import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { SANS, STORY_HAND, STORY_SERIF, loadFonts } from './fonts';
import { P, ButterflyArt, Defs, Flower, Wash, blob, boil, mixHex, openCurve, rng, wavyBand } from './story/kit';

loadFonts();

/* ---------------------------------------------------------------------------
 * 「왜 거기 있는지」 동화책판 — 매거진그린 브랜드 쇼츠 (1080×1920, 30fps, 39s)
 *
 * 문장은 브랜드 쇼츠와 같고, 그림을 수채 동화책으로 다시 그렸다.
 * 기법(video-motion 스킬, 출처 references/sources.md):
 *  - 멀티플레인 카메라: 하늘 d14 · 먼 언덕 d6 · 가까운 언덕 d3 · 땅 d1 · 전경 d0.62.
 *    화면 = 중심 + a·d/(d−z) − cam/(d−z). 가까운 층일수록 빨리·크게 움직인다(실제 원근).
 *  - 수채: 물감 덩어리(시드 고정 곡선) + 가장자리 진한 물감 + 저주파 변위 필터.
 *  - 선 끓음: 필터 시드를 3프레임마다 바꿔 10fps 로 손그림처럼 떨린다(배경은 30fps 로 부드럽게).
 *  - 이어지는 대상: 나비 한 마리가 모든 장면을 안내한다(컷 없는 시선의 닻).
 *  - 물리: 간판 사슬 진자(감쇠 진동, 중첩 회전), 재귀 성장 나무 + 사계절, 꽃 개화 스프링(ζ≈0.45).
 *  - 마무리: 3D 책장 넘김 → 엔드 페이지에서 제목 획 따라 쓰기.
 * 박자: 90 BPM = 20f/박. 종이 질감은 PaperTex 로 한 번 구운 PNG(매 프레임 재계산하지 않음).
 * 안전 영역: 글 카드는 좌 96 · 폭 820 · 위 288 · 아래 1440 안.
 * ------------------------------------------------------------------------- */

export const T = { meadow: 0, push: 150, lens: 300, under: 420, signs: 660, tree: 840, flip: 1020, end: 1056, total: 1170 };
const BEAT = 20;

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const easeIn = Easing.bezier(0.7, 0, 0.84, 0);
const io = Easing.inOut(Easing.cubic);
const cl = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const prog = (f: number, a: number, d: number, e = ease) => interpolate(f, [a, a + d], [0, 1], { ...cl, easing: e });

/* ---------- 카메라 ---------- */
type Cam = { x: number; y: number; z: number };
const CK: [number, number, number, number][] = [
  [0, 0, 0, 0],
  [150, 30, 0, 0.1],
  [290, 0, -30, 0.42],
  [330, 0, -30, 0.45],
  [440, 0, 300, 0.15],
  [560, 0, 1600, 0],
  [650, 0, 2250, 0],
  [740, 0, 0, 0],
  [840, -20, 0, 0.04],
  [1020, 0, 0, 0.16],
];
const camAt = (f: number): Cam => {
  const t = CK.map((k) => k[0]);
  const g = (i: number) => interpolate(f, t, CK.map((k) => k[i]), { ...cl, easing: io });
  return { x: g(1), y: g(2), z: g(3) };
};

const Layer: React.FC<{ d: number; cam: Cam; filter?: string; children: React.ReactNode }> = ({ d, cam, filter, children }) => {
  const den = d - cam.z;
  const s = d / den;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: 1920, transform: `translate(${-cam.x / den}px, ${-cam.y / den}px) scale(${s})`, transformOrigin: '540px 960px' }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', overflow: 'visible' }}>
        <g filter={filter}>{children}</g>
      </svg>
    </div>
  );
};

/* ---------- 하늘 (d14) ---------- */
const Sky: React.FC<{ f: number }> = ({ f }) => (
  <>
    <defs>
      <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={P.skyTop} />
        <stop offset="0.55" stopColor={P.sky} />
        <stop offset="0.8" stopColor="#F6EBDD" />
      </linearGradient>
    </defs>
    <rect x={-400} y={-900} width={1880} height={3800} fill="url(#skyG)" />
    {/* 해와 빛살 */}
    <g transform={`rotate(${Math.sin(f / 90) * 2.5} 820 330)`} opacity={0.55}>
      {[-58, -38, -18, 2, 22, 42].map((a, i) => (
        <path key={i} d="M820,330 L790,1500 L850,1500 Z" fill="url(#ray)" transform={`rotate(${a + 180} 820 330)`} opacity={0.5 + 0.3 * Math.sin(f / 40 + i)} />
      ))}
    </g>
    <Wash d={blob(820, 330, 150, 150, 3, 0.06, 10)} fill="#FFF3D2" opacity={0.6} edge={0} />
    <Wash d={blob(820, 330, 86, 86, 4, 0.05, 10)} fill={P.butter} opacity={0.95} edge={0.25} />
    {/* 구름: 덩어리 셋을 겹쳐 하나로, 아주 느리게 흐른다 */}
    {[
      [120, 420, 1],
      [640, 640, 0.8],
      [-80, 820, 0.7],
      [900, 900, 0.65],
    ].map(([x, y, s], i) => {
      const dx = ((x + f * (0.25 + i * 0.07)) % 1500) - 200;
      return (
        <g key={i} transform={`translate(${dx},${y}) scale(${s})`} opacity={0.92}>
          <Wash d={blob(0, 0, 120, 52, 20 + i, 0.12)} fill={P.white} edge={0.15} />
          <Wash d={blob(80, -26, 90, 60, 30 + i, 0.12)} fill={P.white} edge={0.15} />
          <Wash d={blob(160, 6, 100, 46, 40 + i, 0.12)} fill={P.white} edge={0.15} />
        </g>
      );
    })}
  </>
);

/* ---------- 언덕 ---------- */
const FarHills: React.FC = () => (
  <>
    <Wash d={wavyBand(-500, 1580, 1010, 3200, 34, 5, 7)} fill={P.lavender} opacity={0.9} />
    <Wash d={wavyBand(-500, 1580, 1070, 3200, 28, 8, 8)} fill="#C9DAF0" opacity={0.85} />
  </>
);
const NearHills: React.FC = () => {
  const r = rng(77);
  const trees = Array.from({ length: 9 }, (_, i) => [-160 + i * 170 + r() * 60, 1110 + r() * 50, 46 + r() * 30] as const);
  return (
    <>
      <Wash d={wavyBand(-400, 1480, 1120, 3200, 40, 13, 8)} fill={P.mint} opacity={0.95} />
      {trees.map(([x, y, s], i) => (
        <g key={i}>
          <path d={`M${x},${y} L${x},${y + s * 0.9}`} stroke={P.bark} strokeWidth={6} />
          <Wash d={blob(x, y - s * 0.3, s * 0.8, s, 90 + i, 0.14)} fill={i % 3 === 0 ? P.sage : i % 3 === 1 ? '#B9DDB9' : P.leaf} />
        </g>
      ))}
    </>
  );
};

/* ---------- 땅(d1): 초원 + 꽃 + 지층 + 묘목·나무 + 간판 ---------- */
const SURFACE = 1250;
const FLOWER_COLORS = [P.rose, P.peach, P.butter, P.lilac, P.white, P.roseDeep];
const MEADOW = (() => {
  const r = rng(2026);
  return Array.from({ length: 38 }, (_, i) => ({
    x: 40 + r() * 1000,
    y: SURFACE + 8 + r() * 80,
    size: 26 + r() * 26,
    color: FLOWER_COLORS[Math.floor(r() * FLOWER_COLORS.length)],
    seed: 300 + i,
    at: 4 + 128 * Math.pow(i / 38, 0.62), // 점점 빨라지는 개화 = "넘쳐난다"
  })).sort((a, b) => a.y - b.y);
})();

/** 뿌리: 시드 고정 무작위 걷기, 갈래가 진다 */
const ROOTS = (() => {
  const r = rng(808);
  const paths: { d: string; w: number }[] = [];
  const grow = (x: number, y: number, ang: number, len: number, depth: number, w: number) => {
    const pts: [number, number][] = [[x, y]];
    let cx = x;
    let cy = y;
    let a = ang;
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      a += (r() - 0.5) * 0.5;
      cx += Math.cos(a) * (len / steps);
      cy += Math.sin(a) * (len / steps);
      pts.push([cx, cy]);
    }
    paths.push({ d: openCurve(pts), w });
    if (depth < 4) {
      const k = 1 + Math.floor(r() * 2);
      for (let j = 0; j < k; j++) grow(cx, cy, Math.PI / 2 + (r() - 0.5) * 1.3, len * (0.62 + r() * 0.25), depth + 1, w * 0.62);
    }
  };
  grow(560, SURFACE + 10, Math.PI / 2, 520, 0, 7);
  grow(560, SURFACE + 10, Math.PI / 2 + 0.7, 380, 1, 4.5);
  grow(560, SURFACE + 10, Math.PI / 2 - 0.7, 380, 1, 4.5);
  return paths;
})();

const BANDS = [
  { y: SURFACE + 80, fill: P.soil1, label: '조경가의 책임', tagX: 120, tagY: 1600 },
  { y: 1950, fill: P.soil2, label: '공간의 역사성', tagX: 520, tagY: 2120 },
  { y: 2700, fill: P.soil3, label: '땅의 생태적 맥락', tagX: 120, tagY: 3080 },
];
// 꼬리표가 화면 위쪽(1250px)을 처음 지나는 프레임 — 그때 튀어나온다
const TAG_AT = BANDS.map((b) => {
  for (let f = T.under; f < T.signs; f++) if (b.tagY - camAt(f).y < 1250) return f;
  return T.signs;
});

const Strata: React.FC<{ f: number; fps: number }> = ({ f, fps }) => (
  <>
    <Wash d={wavyBand(-300, 1380, SURFACE, 4400, 14, 21, 10)} fill={P.sage} opacity={1} />
    {BANDS.map((b, i) => (
      <Wash key={i} d={wavyBand(-300, 1380, b.y, 4400, 16, 40 + i, 9)} fill={b.fill} opacity={1} edge={0.3} />
    ))}
    {/* 흙 알갱이 */}
    {Array.from({ length: 140 }, (_, i) => {
      const r = rng(900 + i);
      return <circle key={i} cx={r() * 1080} cy={SURFACE + 120 + r() * 3000} r={2 + r() * 5} fill={P.ink} opacity={0.08 + r() * 0.08} />;
    })}
    {/* 책임: 꽂힌 모종삽 */}
    <g transform="translate(830,1600) rotate(28)">
      <path d="M0,-180 L0,-40" stroke={P.wood} strokeWidth={22} strokeLinecap="round" />
      <Wash d={blob(0, 30, 44, 78, 55, 0.08, 10)} fill={P.stone} />
    </g>
    {/* 역사: 돌담, 토기 조각, 열쇠 */}
    {Array.from({ length: 12 }, (_, i) => {
      const row = Math.floor(i / 4);
      const col = i % 4;
      return <Wash key={i} d={blob(110 + col * 100 + (row % 2) * 50, 2280 + row * 70, 46, 30, 500 + i, 0.1, 8)} fill={i % 3 ? P.stone : '#D9D0DE'} />;
    })}
    <g transform="translate(820,2420) rotate(-18)">
      <Wash d={blob(0, 0, 90, 56, 61, 0.22, 7)} fill={P.peach} />
      <path d="M-60,-8 Q0,-24 60,-6 M-56,14 Q0,0 56,16" stroke={P.ink} strokeWidth={3} fill="none" opacity={0.45} />
    </g>
    <g transform="translate(330,2560) rotate(-12)">
      <circle cx={0} cy={0} r={26} fill="none" stroke={P.ink} strokeWidth={6} opacity={0.75} />
      <path d="M26,0 L130,0 M100,0 L100,22 M120,0 L120,18" stroke={P.ink} strokeWidth={6} strokeLinecap="round" opacity={0.75} />
      <circle cx={0} cy={0} r={20} fill={P.butter} opacity={0.8} />
    </g>
    {/* 생태: 뿌리 + 균사 맥박 + 씨앗 + 지렁이 */}
    {ROOTS.map((p, i) => (
      <path key={i} d={p.d} stroke={P.bark} strokeWidth={p.w} fill="none" strokeLinecap="round" opacity={0.75} />
    ))}
    {ROOTS.slice(3).map((p, i) => (
      <path key={`m${i}`} d={p.d} stroke={P.white} strokeWidth={2} fill="none" strokeDasharray="10 70" strokeDashoffset={-(f * 3 + i * 23)} opacity={0.85} />
    ))}
    {Array.from({ length: 10 }, (_, i) => {
      const r = rng(1200 + i);
      const x = 140 + r() * 800;
      const y = 2850 + r() * 900;
      const sprout = prog(f, TAG_AT[2] + 6 + i * 3, 20);
      return (
        <g key={i}>
          <Wash d={blob(x, y, 15, 10, 1300 + i, 0.1, 7)} fill={P.butter} />
          <path d={`M${x},${y - 8} q6,${-22 * sprout} ${-4},${-34 * sprout}`} stroke={P.sageDeep} strokeWidth={3} fill="none" strokeLinecap="round" />
        </g>
      );
    })}
    <path
      d={openCurve(Array.from({ length: 9 }, (_, i) => [600 + i * 26, 3330 + Math.sin(f / 6 + i * 0.9) * 12] as [number, number]))}
      stroke={P.roseDeep}
      strokeWidth={15}
      strokeLinecap="round"
      fill="none"
      opacity={0.9}
    />
    {/* 꼬리표 */}
    {BANDS.map((b, i) => {
      // 땅속 장면이 끝나면 접어 넣는다(지상 장면 아래쪽에 걸려 보이지 않게)
      const s = spring({ frame: f - TAG_AT[i], fps, config: { damping: 9, stiffness: 140, mass: 0.7 } }) * (1 - prog(f, T.signs + 30, 12, easeIn));
      if (s <= 0.001) return null;
      return (
        <g key={`t${i}`} transform={`translate(${b.tagX},${b.tagY}) rotate(${-3 + i * 2.5}) scale(${s})`}>
          <path d="M0,0 L360,0 L360,92 L0,92 Z" fill={P.white} opacity={0.96} />
          <circle cx={26} cy={46} r={9} fill={P.roseDeep} />
          <text x={52} y={62} style={{ font: `700 46px ${STORY_HAND}` }} fill={P.ink}>
            {b.label}
          </text>
        </g>
      );
    })}
  </>
);

/* 나무: 재귀 성장. 가지마다 시작 프레임·길이를 미리 정해 두고, 매 프레임 바람 흔들림만 더해 다시 계산 */
type Br = { ang: number; len: number; depth: number; t0: number; dur: number; kids: Br[]; leaf: number };
const TREE: Br = (() => {
  const r = rng(42);
  const make = (ang: number, len: number, depth: number, t0: number): Br => {
    const dur = 22 + r() * 8;
    const kids: Br[] = [];
    if (depth < 5) {
      const n = depth < 1 ? 2 : 2 + (r() < 0.35 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * (0.5 + r() * 0.25);
        kids.push(make(ang + spread + (r() - 0.5) * 0.2, len * (0.7 + r() * 0.12), depth + 1, t0 + dur * 0.7));
      }
    }
    return { ang, len, depth, t0, dur, kids, leaf: r() };
  };
  return make(-Math.PI / 2, 230, 0, T.tree + 8);
})();
const SEASON = [P.rose, P.leaf, P.peach, P.white, P.rose]; // 봄 꽃 → 여름 잎 → 가을 → 겨울 → 다시 봄

const Tree: React.FC<{ f: number; fps: number }> = ({ f, fps }) => {
  if (f < T.tree) {
    // 묘목: 처음부터 땅 한가운데 서 있다
    return (
      <g>
        <path d={`M560,${SURFACE + 6} q4,-40 0,-70`} stroke={P.bark} strokeWidth={6} fill="none" strokeLinecap="round" />
        <Wash d={blob(578, SURFACE - 60, 20, 11, 7, 0.15, 7)} fill={P.leaf} />
        <Wash d={blob(543, SURFACE - 48, 18, 10, 8, 0.15, 7)} fill={P.leaf} />
      </g>
    );
  }
  const sp = interpolate(f, [T.tree + 40, T.flip - 6], [0, 4], cl);
  const si = Math.min(3, Math.floor(sp));
  const leafCol = mixHex(SEASON[si], SEASON[si + 1], sp - si);
  const leafScale = sp > 2.6 && sp < 3.6 ? 0.45 : 1; // 겨울엔 잎이 줄어든다
  const segs: React.ReactNode[] = [];
  const leaves: React.ReactNode[] = [];
  let k = 0;
  const walk = (b: Br, x: number, y: number) => {
    const g = prog(f, b.t0, b.dur, Easing.out(Easing.quad));
    if (g <= 0) return;
    const wind = Math.sin(f / 26 + b.depth * 0.8) * 0.018 * b.depth;
    const a = b.ang + wind;
    const x2 = x + Math.cos(a) * b.len * g;
    const y2 = y + Math.sin(a) * b.len * g;
    segs.push(<path key={`b${k++}`} d={`M${x.toFixed(1)},${y.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`} stroke={P.bark} strokeWidth={Math.max(2.5, 26 * Math.pow(0.66, b.depth))} strokeLinecap="round" />);
    if (b.depth >= 3 && g >= 1) {
      const s = spring({ frame: f - (b.t0 + b.dur), fps, config: { damping: 10, stiffness: 120, mass: 0.8 } }) * leafScale;
      const r = 26 + b.leaf * 22;
      leaves.push(
        <g key={`l${k++}`} transform={`translate(${x2},${y2}) scale(${s})`}>
          <Wash d={blob(0, 0, r, r * 0.8, 600 + k, 0.18, 8)} fill={leafCol} opacity={0.85} />
          <Wash d={blob(r * 0.5, -r * 0.4, r * 0.6, r * 0.5, 700 + k, 0.18, 7)} fill={mixHex(SEASON[si], P.white, 0.3)} opacity={0.7} />
        </g>,
      );
    }
    for (const c of b.kids) walk(c, x2, y2);
  };
  walk(TREE, 560, SURFACE + 6);
  return (
    <g>
      {segs}
      {leaves}
    </g>
  );
};

/* 간판 사슬: 감쇠 진자. 위 간판이 흔들리면 아래 간판이 같이 돈다(중첩 회전) */
const SIGNS = ['GARDENS', 'LENS', 'JOURNAL', 'BRAND'];
const SIGN_ROPE = 46;
const SIGN_H = 120;
const touchAt = (i: number) => T.signs + 98 + i * 20;
const swing = (f: number, i: number) => {
  const w = 3.4; // rad/s
  const z = 0.13;
  const wd = w * Math.sqrt(1 - z * z);
  const kick = (t0: number, amp: number) => {
    const t = (f - t0) / 30;
    return t <= 0 ? 0 : amp * Math.exp(-z * w * t) * Math.sin(wd * t);
  };
  return Math.sin(f / 23 + i) * 1.2 + kick(T.signs + 75 + i * 3, 7 - i) + kick(touchAt(i), 9);
};
const Signs: React.FC<{ f: number; fps: number }> = ({ f, fps }) => {
  const drop = spring({ frame: f - (T.signs + 68), fps, config: { damping: 9, stiffness: 70, mass: 1 } });
  const lift = prog(f, T.tree - 12, 14, easeIn);
  const dy = -820 * (1 - drop) - 900 * lift;
  if (f < T.signs + 60 || f > T.tree + 4) return null;
  const chain = (i: number): React.ReactNode => {
    if (i >= SIGNS.length) return null;
    const active = f >= touchAt(i) && f < touchAt(i) + 28;
    return (
      <g transform={`rotate(${swing(f, i)})`}>
        <path d={`M-70,0 L-70,${SIGN_ROPE} M70,0 L70,${SIGN_ROPE}`} stroke={P.ink} strokeWidth={3} opacity={0.6} />
        <g transform={`translate(0,${SIGN_ROPE})`}>
          <Wash d={blob(0, SIGN_H / 2, 170, SIGN_H / 2, 1500 + i, 0.05, 12)} fill={active ? P.butter : P.wood} opacity={0.97} />
          <text x={0} y={SIGN_H / 2 + 18} textAnchor="middle" style={{ font: `700 54px ${STORY_SERIF}`, letterSpacing: '0.04em' }} fill={P.ink} opacity={active ? 1 : 0.78}>
            {SIGNS[i]}
          </text>
          <g transform={`translate(0,${SIGN_H})`}>{chain(i + 1)}</g>
        </g>
      </g>
    );
  };
  return <g transform={`translate(480,${300 + dy})`}>{chain(0)}</g>;
};

/* 위쪽 가지: 화면 틀 */
const Bough: React.FC<{ f: number }> = ({ f }) => (
  <g>
    <path d="M-120,250 Q240,330 520,290 Q760,260 1200,320" stroke={P.bark} strokeWidth={22} fill="none" strokeLinecap="round" />
    {Array.from({ length: 14 }, (_, i) => {
      const x = -60 + i * 90;
      const y = 300 + Math.sin(i * 1.7) * 30;
      const a = Math.sin(f / 30 + i) * 6;
      return (
        <g key={i} transform={`rotate(${a} ${x} ${y - 20})`}>
          <Wash d={blob(x, y + 18, 34, 18, 1700 + i, 0.2, 7)} fill={i % 4 === 0 ? P.rose : i % 2 ? P.leaf : P.sage} />
        </g>
      );
    })}
  </g>
);

/* ---------- 전경(d0.62): 화면 모서리의 큰 꽃·풀 — 밀고 들어가면 양옆으로 지나간다 ---------- */
const Foreground: React.FC<{ f: number; fps: number }> = ({ f, fps }) => {
  const sway = Math.sin(f / 22) * 0.08;
  const b = (at: number) => spring({ frame: f - at, fps, config: { damping: 8, stiffness: 90, mass: 0.9 } });
  return (
    <>
      <Wash d={wavyBand(-400, 1480, 1800, 2600, 30, 61, 12)} fill={P.sageDeep} opacity={0.95} />
      {Array.from({ length: 18 }, (_, i) => {
        const x = -40 + i * 66;
        const h = 90 + ((i * 37) % 70);
        return <path key={i} d={`M${x},1830 q${10 + sway * 80},${-h * 0.6} ${18 + sway * 160},${-h}`} stroke={P.sageDeep} strokeWidth={9} fill="none" strokeLinecap="round" />;
      })}
      <Flower x={70} y={1880} size={120} color={P.rose} seed={11} bloom={b(18)} sway={sway} stemH={330} />
      <Flower x={1000} y={1880} size={140} color={P.peach} seed={12} bloom={b(34)} sway={-sway} stemH={380} />
      <Flower x={880} y={1900} size={90} color={P.lilac} seed={13} bloom={b(52)} sway={sway} stemH={230} />
      <Flower x={210} y={1900} size={80} color={P.butter} seed={14} bloom={b(66)} sway={-sway} stemH={200} />
    </>
  );
};

/* ---------- 화면 공간: 폴라로이드, 렌즈, 꽃가루, 나비, 글 카드 ---------- */
const Polaroids: React.FC<{ f: number }> = ({ f }) => {
  if (f > T.lens + 10) return null;
  return (
    <>
      {Array.from({ length: 9 }, (_, i) => {
        const r = rng(4000 + i);
        const at = 20 + i * 11;
        const t = f - at;
        if (t < 0) return null;
        const x0 = 80 + r() * 860;
        const fall = Math.min(t * 7, 260 + r() * 520);
        const blow = Math.max(0, f - (T.push + 10 + i * 4));
        const x = x0 + Math.sin(t / 9 + i) * 40 + blow * blow * 0.35;
        const y = -220 + fall - blow * blow * 0.12;
        const rot = Math.sin(t / 14 + i) * 18 + blow * 2;
        const flip = Math.cos(t / 11 + i * 2);
        const col = FLOWER_COLORS[i % FLOWER_COLORS.length];
        return (
          <g key={i} transform={`translate(${x},${y}) rotate(${rot}) scale(${0.35 + 0.65 * Math.abs(flip)},1)`} opacity={interpolate(blow, [0, 30], [1, 0], cl)}>
            <rect x={-75} y={-88} width={150} height={176} fill={P.white} style={{ filter: 'drop-shadow(0 8px 10px rgba(94,75,87,0.18))' }} />
            {flip > 0 ? (
              <>
                <rect x={-63} y={-76} width={126} height={120} fill={P.sky} />
                <Wash d={blob(0, 30, 70, 22, 4100 + i, 0.2)} fill={P.sage} edge={0.2} />
                <Wash d={blob(0, -4, 22, 22, 4200 + i, 0.18, 7)} fill={col} />
              </>
            ) : (
              <rect x={-63} y={-76} width={126} height={120} fill={P.paperShade} />
            )}
          </g>
        );
      })}
    </>
  );
};

const Lens: React.FC<{ f: number; fps: number }> = ({ f, fps }) => {
  if (f < T.lens || f > T.under + 30) return null;
  const s = spring({ frame: f - (T.lens + 4), fps, config: { damping: 11, stiffness: 110, mass: 0.9 } });
  const dive = prog(f, T.under - 18, 34, easeIn);
  const scale = s * (1 + dive * 7);
  const cx = 540;
  const cy = 860;
  const R = 210;
  return (
    <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <clipPath id="lensClip">
          <circle cx={cx} cy={cy} r={R} />
        </clipPath>
      </defs>
      <g transform={`translate(${cx},${cy}) scale(${scale}) translate(${-cx},${-cy})`} opacity={1 - prog(f, T.under + 8, 14)}>
        <g clipPath="url(#lensClip)" filter={`url(#wc${boil(f)})`}>
          <rect x={cx - R} y={cy - R} width={2 * R} height={2 * R} fill={P.soil1} />
          <Wash d={wavyBand(cx - R, cx + R, cy - R + 60, cy + R, 10, 3)} fill={P.soil2} opacity={1} />
          <Wash d={wavyBand(cx - R, cx + R, cy + 60, cy + R, 10, 4)} fill={P.soil3} opacity={1} />
          <path d={openCurve([[cx, cy - R], [cx - 20, cy - 80], [cx + 30, cy + 10], [cx - 10, cy + 120], [cx + 20, cy + R]])} stroke={P.bark} strokeWidth={8} fill="none" />
          <path d={openCurve([[cx - 20, cy - 80], [cx - 110, cy - 10], [cx - 150, cy + 90]])} stroke={P.bark} strokeWidth={4} fill="none" />
          <Wash d={blob(cx + 90, cy + 110, 16, 11, 9, 0.1, 7)} fill={P.butter} />
          <circle cx={cx - 70} cy={cy - 120} r={10} fill={P.white} opacity={0.6 + 0.4 * Math.sin(f / 5)} />
        </g>
        <g opacity={1 - dive * 1.4}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke={P.wood} strokeWidth={26} />
          <circle cx={cx} cy={cy} r={R + 13} fill="none" stroke={P.ink} strokeWidth={3} opacity={0.5} />
          <path d={`M${cx + R * 0.72},${cy + R * 0.72} L${cx + R * 1.45},${cy + R * 1.45}`} stroke={P.wood} strokeWidth={40} strokeLinecap="round" />
          <path d={`M${cx - R * 0.55},${cy - R * 0.35} A${R * 0.7},${R * 0.7} 0 0 1 ${cx - R * 0.2},${cy - R * 0.62}`} stroke={P.white} strokeWidth={10} fill="none" opacity={0.7} strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
};

const Pollen: React.FC<{ f: number }> = ({ f }) => (
  <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0, mixBlendMode: 'screen' }}>
    {Array.from({ length: 22 }, (_, i) => {
      const r = rng(5000 + i);
      const size = 6 + r() * 18;
      const x = ((r() * 1180 + f * (0.3 + r() * 0.6)) % 1200) - 60;
      const y = ((r() * 2000 - f * (0.4 + r() * 0.9)) % 2000 + 2000) % 2000 - 40;
      const tw = 0.22 + 0.22 * Math.sin(f / (10 + r() * 14) + i);
      return <circle key={i} cx={x} cy={y} r={size} fill="url(#bokeh)" opacity={tw} />;
    })}
  </svg>
);

/* 나비 경로: [프레임, x, y] — 같은 점이 이어지면 앉아 있다 */
const BK: [number, number, number][] = [
  [130, 1180, 640],
  [200, 820, 520],
  [255, 640, 700],
  [300, 560, 610],
  [318, 540, 648],
  [395, 540, 648],
  [430, 540, 900],
  [470, 300, 700],
  [530, 760, 820],
  [600, 380, 700],
  [650, 560, 520],
  [720, 760, 360],
  [touchAt(0), 652, 400],
  [touchAt(1), 656, 566],
  [touchAt(2), 652, 732],
  [touchAt(3), 656, 898],
  [870, 840, 700],
  [930, 360, 640],
  [990, 600, 560],
  [1010, 600, 560],
  [1050, 760, 420],
  [1104, 868, 806],
  [1170, 868, 806],
];
const bAt = (f: number): [number, number] => {
  if (f <= BK[0][0]) return [BK[0][1], BK[0][2]];
  for (let i = 0; i < BK.length - 1; i++) {
    const [t1, x1, y1] = BK[i];
    const [t2, x2, y2] = BK[i + 1];
    if (f <= t2) {
      if (x1 === x2 && y1 === y2) return [x1, y1];
      const u = (f - t1) / (t2 - t1);
      const p0 = BK[Math.max(0, i - 1)];
      const p3 = BK[Math.min(BK.length - 1, i + 2)];
      const cr = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
      return [cr(p0[1], x1, x2, p3[1]), cr(p0[2], y1, y2, p3[2])];
    }
  }
  const l = BK[BK.length - 1];
  return [l[1], l[2]];
};
const Butterfly: React.FC<{ f: number }> = ({ f }) => {
  if (f < BK[0][0]) return null;
  const [x, y] = bAt(f);
  const [px] = bAt(f - 1);
  const [nx, ny] = bAt(f + 1);
  const speed = Math.hypot(nx - x, ny - y);
  const fk = Math.floor(f / 2) * 2; // 날갯짓은 15fps(2프레임 단위)로 — 손그림 리듬
  const open = speed > 1.2 ? Math.abs(Math.cos(fk * 0.75)) : 0.62 + 0.38 * Math.cos(fk * 0.11);
  const bank = Math.max(-24, Math.min(24, (nx - px) * 2.2));
  const dive = 1 - 0.5 * prog(f, 395, 30) + 0.5 * prog(f, 430, 30);
  return (
    <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0, filter: 'drop-shadow(0 10px 8px rgba(94,75,87,0.18))' }}>
      <g transform={`translate(${x},${y}) rotate(${bank}) scale(${0.95 * dive})`} filter={`url(#ink${boil(f)})`}>
        <ButterflyArt open={open} />
      </g>
    </svg>
  );
};

/** 글 카드: 찢은 종이 + 잉크가 번져 스며드는 어절 */
const tornRect = (w: number, h: number, seed: number) => {
  const r = rng(seed);
  const pts: [number, number][] = [];
  const n = 14;
  for (let i = 0; i < n; i++) pts.push([(w * i) / n, (r() - 0.5) * 7]);
  for (let i = 0; i < 4; i++) pts.push([w + (r() - 0.5) * 6, (h * i) / 4]);
  for (let i = n; i > 0; i--) pts.push([(w * i) / n, h + (r() - 0.5) * 7]);
  for (let i = 4; i > 0; i--) pts.push([(r() - 0.5) * 6, (h * i) / 4]);
  return 'M' + pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' L') + 'Z';
};
type Line = { text: string; size: number; weight?: number; hand?: boolean; dim?: boolean; accent?: string[] };
const Card: React.FC<{ f: number; fps: number; at: number; out: number; y: number; lines: Line[]; seed: number; tilt?: number; h: number }> = ({
  f,
  fps,
  at,
  out,
  y,
  lines,
  seed,
  tilt = -1.2,
  h,
}) => {
  if (f < at || f > out + 14) return null;
  const s = spring({ frame: f - at, fps, config: { damping: 11, stiffness: 120, mass: 0.9 } });
  const q = prog(f, out, 12, easeIn);
  let wi = 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: 96,
        top: y,
        width: 820,
        height: h,
        transform: `translateY(${(1 - s) * 40 - q * 30}px) rotate(${tilt + (1 - s) * 4 - q * 3}deg) scale(${0.92 + 0.08 * s})`,
        opacity: Math.min(1, s * 1.4) * (1 - q),
        transformOrigin: '50% 100%',
        filter: 'drop-shadow(0 14px 18px rgba(94,75,87,0.20))',
      }}
    >
      <svg width={820} height={h} style={{ position: 'absolute', inset: 0 }}>
        <path d={tornRect(820, h, seed)} fill={P.paper} />
        <path d={tornRect(820, h, seed)} fill="none" stroke={P.paperShade} strokeWidth={3} />
      </svg>
      <div style={{ position: 'relative', padding: '34px 44px', display: 'flex', flexDirection: 'column', gap: 6, wordBreak: 'keep-all' }}>
        {lines.map((ln, li) => (
          <div key={li} style={{ display: 'flex', flexWrap: 'wrap', columnGap: ln.size * 0.27 }}>
            {ln.text.split(' ').map((w, k) => {
              const t0 = at + 8 + wi++ * 4;
              const p = prog(f, t0, 16);
              const col = ln.accent?.includes(w) ? P.roseDeep : ln.dim ? P.inkSoft : P.ink;
              return (
                <span
                  key={k}
                  style={{
                    font: `${ln.weight ?? 700} ${ln.size}px/1.28 ${ln.hand ? STORY_HAND : STORY_SERIF}`,
                    letterSpacing: ln.size > 70 ? '-0.02em' : '0',
                    color: col,
                    opacity: p,
                    filter: `blur(${(1 - p) * 7}px)`,
                    transform: `translateY(${(1 - p) * 10}px) scale(${1 + (1 - p) * 0.05})`,
                    display: 'inline-block',
                  }}
                >
                  {w}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ---------- 엔드 페이지 ---------- */
const EndPage: React.FC<{ f: number; fps: number }> = ({ f, fps }) => {
  const write = prog(f, T.end + 4, 50, Easing.inOut(Easing.quad));
  const fill = prog(f, T.end + 40, 22);
  const wreath = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return { x: 540 + Math.cos(a) * 430, y: 860 + Math.sin(a) * 330, c: FLOWER_COLORS[i % FLOWER_COLORS.length], at: T.end + 10 + ((i * 5) % 40) };
  });
  return (
    <AbsoluteFill style={{ background: P.paper }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <g filter={`url(#wc${boil(f)})`}>
          {wreath.map((w, i) => {
            const b = spring({ frame: f - w.at, fps, config: { damping: 8, stiffness: 120, mass: 0.7 } });
            return (
              <g key={i} transform={`translate(${w.x},${w.y}) scale(${b})`}>
                <Wash d={blob(-22, 10, 30, 14, 2100 + i, 0.2, 7)} fill={P.leaf} opacity={0.8} />
                {Array.from({ length: 5 }, (_, k) => (
                  <g key={k} transform={`rotate(${k * 72 + i * 20})`}>
                    <Wash d={blob(16, 0, 17, 11, 2200 + i * 5 + k, 0.15, 7)} fill={w.c} />
                  </g>
                ))}
                <circle r={8} fill={P.butter} />
              </g>
            );
          })}
        </g>
        <text x={540} y={700} textAnchor="middle" style={{ font: `700 42px ${STORY_HAND}`, letterSpacing: '0.06em' }} fill={P.inkSoft} opacity={prog(f, T.end + 2, 14)}>
          조경 · 도시 · 식물 · 정책
        </text>
        {/* 제목: 획을 따라 잉크로 쓰고(stroke-dashoffset) 다 쓴 뒤 면을 채운다 */}
        <text
          x={540}
          y={910}
          textAnchor="middle"
          style={{ font: `700 156px ${STORY_SERIF}`, letterSpacing: '-0.03em' }}
          fill={P.ink}
          fillOpacity={fill}
          stroke={P.ink}
          strokeWidth={2.5}
          strokeDasharray={1400}
          strokeDashoffset={1400 * (1 - write)}
        >
          매거진그린
        </text>
        <path
          d="M250,960 Q540,990 830,950"
          stroke={P.rose}
          strokeWidth={14}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={620}
          strokeDashoffset={620 * (1 - prog(f, T.end + 56, 18))}
          opacity={0.85}
        />
        <text x={540} y={1060} textAnchor="middle" style={{ font: `400 46px ${STORY_SERIF}` }} fill={P.ink} opacity={prog(f, T.end + 66, 16)}>
          정원 라이프스타일 저널
        </text>
        <text x={540} y={1330} textAnchor="middle" style={{ font: `700 30px ${SANS}`, letterSpacing: '0.28em' }} fill={P.inkSoft} opacity={prog(f, T.end + 76, 16)}>
          MAGAZINE GREEN
        </text>
      </svg>
    </AbsoluteFill>
  );
};

/* ---------- 조립 ---------- */
export const Storybook: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cam = camAt(f);
  const wc = `url(#wc${boil(f)})`;
  const flip = interpolate(f, [T.flip, T.end], [0, -180], { ...cl, easing: Easing.inOut(Easing.cubic) });
  const shade = Math.sin((-flip * Math.PI) / 180);

  const page = (
    <AbsoluteFill style={{ background: P.paper, overflow: 'hidden' }}>
      <Layer d={14} cam={cam} filter={wc}>
        <Sky f={f} />
      </Layer>
      <Layer d={6} cam={cam} filter={wc}>
        <FarHills />
      </Layer>
      <Layer d={3} cam={cam} filter={wc}>
        <NearHills />
      </Layer>
      <Layer d={1} cam={cam} filter={wc}>
        <Strata f={f} fps={fps} />
        <Bough f={f} />
        <Tree f={f} fps={fps} />
        {MEADOW.map((m, i) => (
          <Flower
            key={i}
            x={m.x}
            y={m.y}
            size={m.size}
            color={m.color}
            seed={m.seed}
            bloom={spring({ frame: f - m.at, fps, config: { damping: 7, stiffness: 120, mass: 0.7 } })}
            sway={Math.sin(f / 18 + m.x * 0.01) * 0.12}
          />
        ))}
        <Signs f={f} fps={fps} />
      </Layer>
      <Layer d={0.62} cam={cam} filter={wc}>
        <Foreground f={f} fps={fps} />
      </Layer>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <g filter={wc}>
          <Polaroids f={f} />
        </g>
      </svg>
      <Lens f={f} fps={fps} />
      <Pollen f={f} />
      <Card f={f} fps={fps} at={30} out={T.push - 12} y={1110} h={300} seed={1} lines={[{ text: '예쁜 정원 사진은', size: 50, weight: 400, dim: true }, { text: '넘쳐난다.', size: 104 }]} />
      <Card
        f={f}
        fps={fps}
        at={T.push + 20}
        out={T.lens - 12}
        y={1010}
        h={400}
        seed={2}
        tilt={1}
        lines={[{ text: '그 정원이 왜', size: 50, weight: 400, dim: true, accent: ['왜'] }, { text: '거기 있는지는', size: 96 }, { text: '잘 묻지 않는다.', size: 96 }]}
      />
      <Card f={f} fps={fps} at={T.lens + 24} out={T.under - 20} y={1130} h={300} seed={3} lines={[{ text: '매거진그린은', size: 50, weight: 400, dim: true }, { text: '그 이유를 묻는다.', size: 92, accent: ['이유를'] }]} />
      <Card f={f} fps={fps} at={T.signs - 70} out={T.signs - 6} y={1120} h={300} seed={4} tilt={1.4} lines={[{ text: '정원을 읽는', size: 50, weight: 400, dim: true }, { text: '세 개의 층.', size: 104, accent: ['층.'] }]} />
      <Card f={f} fps={fps} at={T.signs + 70} out={T.tree - 14} y={1250} h={150} seed={5} lines={[{ text: '매거진그린의 네 개의 지면', size: 52, hand: true }]} />
      <Card f={f} fps={fps} at={T.tree + 30} out={T.flip - 4} y={1130} h={300} seed={6} tilt={-1.6} lines={[{ text: '보기 좋은 정원보다', size: 50, weight: 400, dim: true }, { text: '오래 남을 정원을.', size: 96, accent: ['오래'] }]} />
    </AbsoluteFill>
  );

  return (
    <AbsoluteFill style={{ background: P.paperShade }}>
      <Defs />
      {f >= T.flip && <EndPage f={f} fps={fps} />}
      {/* 넘어가는 책장이 엔드 페이지에 드리우는 그림자 */}
      {f >= T.flip && f < T.end && <AbsoluteFill style={{ background: `linear-gradient(90deg, rgba(94,75,87,${0.35 * shade}) 0%, rgba(94,75,87,0) ${30 + 50 * shade}%)` }} />}
      {f < T.end && (
        <AbsoluteFill style={{ perspective: 2600, perspectiveOrigin: '0% 50%' }}>
          <AbsoluteFill style={{ transformStyle: 'preserve-3d', transform: `rotateY(${flip}deg)`, transformOrigin: '0% 50%' }}>
            <AbsoluteFill style={{ backfaceVisibility: 'hidden' }}>
              {page}
              <AbsoluteFill style={{ background: `linear-gradient(90deg, rgba(94,75,87,0) 40%, rgba(94,75,87,${0.4 * shade}) 100%)` }} />
            </AbsoluteFill>
            <AbsoluteFill style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', background: P.paperShade }} />
          </AbsoluteFill>
        </AbsoluteFill>
      )}
      <Butterfly f={f} />
      <Img src={staticFile('paper.png')} style={{ position: 'absolute', inset: 0, width: 1080, height: 1920, mixBlendMode: 'multiply' }} />
    </AbsoluteFill>
  );
};

/* ---------- 종이 질감(한 번만 구워 public/paper.png 로) ---------- */
export const PaperTex: React.FC = () => (
  <svg width={1080} height={1920}>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={3} seed={9} />
      <feColorMatrix type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.45  0 0 0 0 0.40  1.1 0 0 0 -0.52" />
    </filter>
    <filter id="mottle" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.004" numOctaves={4} seed={4} />
      <feColorMatrix type="matrix" values="0 0 0 0 0.85  0 0 0 0 0.72  0 0 0 0 0.62  0.7 0 0 0 -0.25" />
    </filter>
    <radialGradient id="vig" cx="50%" cy="48%" r="75%">
      <stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0" />
      <stop offset="1" stopColor="#C9A894" stopOpacity="0.45" />
    </radialGradient>
    <rect width={1080} height={1920} fill="#FFFFFF" />
    <rect width={1080} height={1920} filter="url(#mottle)" opacity={0.5} />
    <rect width={1080} height={1920} filter="url(#grain)" opacity={0.55} />
    <rect width={1080} height={1920} fill="url(#vig)" />
  </svg>
);
