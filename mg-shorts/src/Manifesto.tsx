import React from 'react';
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { SANS, SERIF, loadFonts } from './fonts';
import { BEAT, C, Fade, HALF, MaskLine, SPR, clamp, easeIn, easeOut, prog, useCreep } from './motion';

loadFonts();

/* ---------------------------------------------------------------------------
 * 「왜 거기 있는지」 — 매거진그린 브랜드 쇼츠 (1080×1920, 30fps, 36s, 내레이션 없음)
 *
 * 서사: 넘쳐나는 정원 사진(피드) → 아무도 묻지 않는 '왜' → 매거진그린은 묻는다
 *       → 정원을 읽는 세 개의 층(생태·역사·책임) → 네 개의 지면 → 여운 → 엔드 카드
 * 사실 주장(구독자 수, 실적, 수치)은 넣지 않는다. 매체의 관점과 섹션 이름만 쓴다.
 *
 * 끊기지 않는 도형: 피드의 사진 한 장이 살아남아 뷰파인더 → 지층 단면 → 섹션 선택 상자
 *   → 엔드 카드의 작은 표식이 된다. 컷이 바뀌어도 시선이 붙잡을 닻.
 * 박자: 100 BPM 반박(9f) 격자. 글자 안전 영역: 좌 96, 우 164, 위 288, 아래 480px.
 * ------------------------------------------------------------------------- */

const L = 96;
const W = 1080 - L - 164; // 820

export const SCENES = {
  feed: { from: 0, dur: 126 },
  why: { from: 126, dur: 144 },
  ask: { from: 270, dur: 135 },
  layers: { from: 405, dur: 225 },
  sections: { from: 630, dur: 180 },
  last: { from: 810, dur: 135 },
  end: { from: 945, dur: 135 },
} as const;
export const TOTAL = SCENES.end.from + SCENES.end.dur; // 1080 = 36s

/* ---------- 바닥 + 그레인 ---------- */
const Ground: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      <AbsoluteFill style={{ background: 'radial-gradient(120% 80% at 50% 38%, rgba(255,255,255,0.05), rgba(0,0,0,0.28) 100%)' }} />
      <svg width="1080" height="1920" style={{ position: 'absolute', inset: 0, opacity: 0.09, mixBlendMode: 'overlay' }}>
        <filter id="g">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={Math.floor(f / 2) % 6} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="1080" height="1920" filter="url(#g)" />
      </svg>
    </AbsoluteFill>
  );
};

/* ---------- 피드 격자: 3열 카드. 가운데 열 6행 카드가 스크롤이 멈출 때 화면 중앙(540, 760)에 온다 ---------- */
const CW = 250;
const CH = 330;
const GAP = 24;
const COLS_X = [L + 45, L + 45 + CW + GAP, L + 45 + 2 * (CW + GAP)]; // 141, 415, 689 → 가운데 열 중심 540
const ROW0 = 300;
const ROWS = 10;
const SURVIVOR = { r: 6, c: 1 };
const SCROLL = ROW0 + SURVIVOR.r * (CH + GAP) + CH / 2 - 760; // 1829

const hash = (n: number) => {
  const h = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return h - Math.floor(h);
};
const BLOOM = ['#E7A1B0', '#C8DB86', '#F1D27A', '#B9A3E3', '#F3F1E8'];

/** 카드 속 "예쁜 정원 사진"을 추상화한 그림: 배경 톤 + 꽃 덩이 몇 개 (결정적) */
const CardArt: React.FC<{ seed: number }> = ({ seed }) => (
  <svg width={CW} height={CH} style={{ position: 'absolute', inset: 0 }}>
    <rect width={CW} height={CH} fill={`hsl(${120 + hash(seed) * 50} 22% ${20 + hash(seed + 1) * 10}%)`} />
    {Array.from({ length: 7 }, (_, k) => (
      <circle
        key={k}
        cx={20 + hash(seed * 7 + k) * (CW - 40)}
        cy={CH * 0.45 + hash(seed * 11 + k) * CH * 0.5}
        r={10 + hash(seed * 13 + k) * 26}
        fill={BLOOM[Math.floor(hash(seed * 17 + k) * BLOOM.length)]}
        opacity={0.85}
      />
    ))}
  </svg>
);

const Feed: React.FC<{ base: number }> = ({ base }) => {
  // base: 이 컴포넌트가 놓인 Sequence 의 시작(절대 프레임). 피드와 '왜' 장면이 같은 카드를 공유한다.
  const f = useCurrentFrame() + base;
  const { fps } = useVideoConfig();
  const scroll = interpolate(f, [12, 118], [0, SCROLL], { ...clamp, easing: (t) => t * t * (3 - 2 * t) });
  const fallStart = SCENES.why.from + 6;
  return (
    <AbsoluteFill>
      {Array.from({ length: ROWS * 3 }, (_, i) => {
        const r = Math.floor(i / 3);
        const c = i % 3;
        if (r === SURVIVOR.r && c === SURVIVOR.c && f >= SCENES.why.from) return null; // 이 자리를 끊기지 않는 도형이 이어받는다
        // +10: 첫 프레임(=썸네일)부터 화면이 차 있어야 한다. 빈 첫 프레임은 스크롤을 멈춰 세우지 못한다.
        const pop = spring({ frame: f - r * 2 - c + 10, fps, config: SPR.pop });
        const t = Math.max(0, f - fallStart - ((i * 7) % 11));
        const fall = 0.9 * t * t;
        const op = interpolate(t, [0, 18], [1, 0], clamp);
        const rot = t * (hash(i) - 0.5) * 1.6;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: COLS_X[c],
              top: ROW0 + r * (CH + GAP) - scroll,
              width: CW,
              height: CH,
              overflow: 'hidden',
              transform: `translateY(${fall}px) rotate(${rot}deg) scale(${pop})`,
              opacity: op,
            }}
          >
            <CardArt seed={i + 1} />
          </div>
        );
      })}
      {/* 글 아래 깔리는 그림자: 피드 위에서도 글이 읽히게 */}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(11,63,53,0) 52%, rgba(11,63,53,0.92) 64%, rgba(11,63,53,0.92) 78%, rgba(11,63,53,0) 92%)' }} />
    </AbsoluteFill>
  );
};

/* ---------- 끊기지 않는 도형 (절대 프레임 키프레임) ---------- */
const K = (f: number, keys: number[], vals: number[]) => interpolate(f, keys, vals, { ...clamp, easing: easeOut });

// 섹션 장면에서 상자가 옮겨 갈 행
const SEC_TOP = 600;
const SEC_ROW = 150;
const SEC_STEP = BEAT * 2; // 36f 마다 다음 섹션

const Frame: React.FC = () => {
  const f = useCurrentFrame();
  const s = SCENES;
  const sec = (k: number) => s.sections.from + 18 + k * SEC_STEP;
  const rowCy = (k: number) => SEC_TOP + k * SEC_ROW + SEC_ROW / 2;
  const keys = [
    s.why.from, s.ask.from, s.ask.from + 30, // 사진 한 장 → 뷰파인더
    s.layers.from, s.layers.from + 27, // → 지층 단면
    sec(0) - 12, sec(0), sec(1) - 9, sec(1), sec(2) - 9, sec(2), sec(3) - 9, sec(3), // → 섹션 선택 상자
    s.last.from, s.last.from + 27, // → 크게 물러남
    s.end.from + 9, s.end.from + 36, // → 엔드 카드 표식
  ];
  const w = K(f, keys, [CW, CW, 720, 720, 820, 820, 860, 860, 860, 860, 860, 860, 860, 860, 1600, 1600, 56]);
  const h = K(f, keys, [CH, CH, 860, 860, 560, 560, SEC_ROW, SEC_ROW, SEC_ROW, SEC_ROW, SEC_ROW, SEC_ROW, SEC_ROW, SEC_ROW, 1600, 1600, 56]);
  const cx = K(f, keys, [540, 540, 540, 540, 540, 540, 520, 520, 520, 520, 520, 520, 520, 520, 540, 540, L + 28]);
  const cy = K(f, keys, [760, 760, 660, 660, 700, 700, rowCy(0), rowCy(0), rowCy(1), rowCy(1), rowCy(2), rowCy(2), rowCy(3), rowCy(3), 900, 900, 1360]);
  const op = K(f, keys, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.08, 0.08, 1]);
  if (f < s.why.from) return null;
  // 피드 카드였을 때의 그림을 잠깐 품고 있다가(사진 → 빈 틀) 비운다
  const artOp = 1 - prog(f, s.why.from + 30, 24);
  return (
    <svg width="1080" height="1920" style={{ position: 'absolute', inset: 0 }}>
      {artOp > 0 && (
        <foreignObject x={cx - w / 2} y={cy - h / 2} width={w} height={h} opacity={artOp}>
          <div style={{ width: CW, height: CH, position: 'relative', transform: `scale(${w / CW}, ${h / CH})`, transformOrigin: '0 0' }}>
            <CardArt seed={SURVIVOR.r * 3 + SURVIVOR.c + 1} />
          </div>
        </foreignObject>
      )}
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} fill="none" stroke={C.paper} strokeWidth={3} opacity={op} />
    </svg>
  );
};

/* ---------- 1. 피드 ---------- */
const FeedText: React.FC = () => {
  const { dur } = SCENES.feed;
  const creep = useCreep(dur);
  return (
    <AbsoluteFill style={{ left: L, width: W, top: 1150, ...creep }}>
      <MaskLine text="예쁜 정원 사진은" at={4} out={dur - 10} style={{ font: `500 58px/1.3 ${SANS}`, color: C.paper }} />
      <MaskLine text="넘쳐난다." at={4 + HALF * 2} out={dur - 8} style={{ font: `900 132px/1.18 ${SERIF}`, color: C.paper, marginTop: 12, letterSpacing: '-0.03em' }} />
    </AbsoluteFill>
  );
};

/* ---------- 2. 왜 ---------- */
const Why: React.FC = () => {
  const { dur } = SCENES.why;
  const big = { font: `900 108px/1.2 ${SERIF}`, color: C.paper, letterSpacing: '-0.03em' } as const;
  const creep = useCreep(dur);
  return (
    <AbsoluteFill style={{ left: L, width: W, top: 1060, ...creep }}>
      <MaskLine text="그 정원이 왜" at={HALF * 3} out={dur - 12} accent={['왜']} style={{ font: `500 58px/1.3 ${SANS}`, color: C.paper }} />
      <MaskLine text="거기 있는지는" at={HALF * 5} out={dur - 11} style={{ ...big, marginTop: 12 }} />
      <MaskLine text="잘 묻지 않는다." at={HALF * 7} out={dur - 10} style={big} />
    </AbsoluteFill>
  );
};

/* ---------- 3. 매거진그린은 묻는다 (뷰파인더 모서리 표시) ---------- */
const Ask: React.FC = () => {
  const f = useCurrentFrame();
  const { dur } = SCENES.ask;
  const k = prog(f, 24, 14);
  const out = prog(f, dur - 12, 10, easeIn);
  // 뷰파인더(720×860, 중심 540,660) 안쪽 모서리 ㄱ자 표시
  const x0 = 540 - 360 + 28, y0 = 660 - 430 + 28, x1 = 540 + 360 - 28, y1 = 660 + 430 - 28;
  const arm = 54 * k;
  const corner = (x: number, y: number, dx: number, dy: number) => `M${x + dx * arm},${y} L${x},${y} L${x},${y + dy * arm}`;
  const recBlink = Math.floor(f / 15) % 2 === 0 ? 1 : 0.25;
  const creep = useCreep(dur);
  return (
    <AbsoluteFill>
      <svg width="1080" height="1920" style={{ position: 'absolute', inset: 0, opacity: 1 - out }}>
        <path d={[corner(x0, y0, 1, 1), corner(x1, y0, -1, 1), corner(x0, y1, 1, -1), corner(x1, y1, -1, -1)].join(' ')} stroke={C.moss} strokeWidth={4} fill="none" />
        <line x1={540 - 26 * k} y1={660} x2={540 + 26 * k} y2={660} stroke={C.paper} strokeWidth={2} opacity={0.7} />
        <line x1={540} y1={660 - 26 * k} x2={540} y2={660 + 26 * k} stroke={C.paper} strokeWidth={2} opacity={0.7} />
        <circle cx={x0 + 18} cy={y0 + 78} r={9} fill="#E5584F" opacity={k * recBlink} />
        <text x={x0 + 36} y={y0 + 87} fill={C.paper} opacity={k} style={{ font: `600 26px ${SANS}`, letterSpacing: '0.16em' }}>
          LENS
        </text>
      </svg>
      <AbsoluteFill style={{ left: L, width: W, top: 1150, ...creep }}>
        <MaskLine text="매거진그린은" at={HALF} out={dur - 12} style={{ font: `600 58px/1.3 ${SANS}`, color: C.moss }} />
        <MaskLine text="그 이유를 묻는다." at={HALF * 3} out={dur - 10} style={{ font: `900 112px/1.2 ${SERIF}`, color: C.paper, marginTop: 12, letterSpacing: '-0.03em' }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ---------- 4. 정원을 읽는 세 개의 층 (단면, 아래에서부터 쌓인다) ---------- */
const STRATA: [string, string][] = [
  ['땅의 생태적 맥락', '#2C3A2C'],
  ['공간의 역사성', '#3A4C3B'],
  ['조경가의 책임', '#4E6A50'],
];
const Layers: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { dur } = SCENES.layers;
  const out = prog(f, dur - 12, 10, easeIn);
  const box = { x: 130, y: 420, w: 820, h: 560 };
  const bandH = 150;
  const grass = prog(f, 30 + 3 * BEAT * 2, 20);
  const creep = useCreep(dur);
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      {STRATA.map(([label, color], i) => {
        const at = 30 + i * BEAT * 2; // 아래 층부터 2박 간격
        const s = spring({ frame: f - at, fps, config: SPR.heavy });
        const top = box.y + box.h - (i + 1) * bandH;
        return (
          <div
            key={label}
            style={{
              position: 'absolute',
              left: box.x + 3,
              top,
              width: box.w - 6,
              height: bandH,
              background: color,
              transform: `scaleY(${s})`,
              transformOrigin: '50% 100%',
              borderTop: `2px solid rgba(243,241,232,${0.25 * s})`,
            }}
          >
            {/* 층마다 다른 결: 생태=흩어진 알갱이, 역사=수평 퇴적선, 책임=수직 말뚝 */}
            <svg width={box.w - 6} height={bandH} style={{ position: 'absolute', inset: 0, opacity: 0.35 }}>
              {i === 0 &&
                Array.from({ length: 70 }, (_, k) => <circle key={k} cx={hash(k + 3) * (box.w - 6)} cy={hash(k + 91) * bandH} r={2 + hash(k + 7) * 3} fill={C.paper} />)}
              {i === 1 && [0.25, 0.45, 0.62, 0.8].map((y, k) => <line key={k} x1={0} x2={box.w} y1={y * bandH} y2={y * bandH + (k % 2 ? 6 : -4)} stroke={C.paper} strokeWidth={2} />)}
              {i === 2 && Array.from({ length: 9 }, (_, k) => <line key={k} x1={460 + k * 36} x2={460 + k * 36} y1={bandH * 0.2} y2={bandH} stroke={C.paper} strokeWidth={3} />)}
            </svg>
            <div style={{ position: 'absolute', left: 32, top: 0, height: bandH, display: 'flex', alignItems: 'center' }}>
              <MaskLine text={label} at={at + 8} style={{ font: `700 54px/1.2 ${SERIF}`, color: C.paper }} />
            </div>
          </div>
        );
      })}
      {/* 맨 위 지표면에 돋는 풀 */}
      <svg width="1080" height="1920" style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: 26 }, (_, k) => {
          const x = box.x + 20 + k * 30 + hash(k) * 10;
          const base = box.y + box.h - 3 * bandH;
          const hgt = (18 + hash(k + 40) * 34) * interpolate(grass, [k / 40, k / 40 + 0.4], [0, 1], clamp);
          if (hgt < 1) return null; // 높이 0 인 획도 둥근 끝(cap) 때문에 점으로 찍힌다
          return <path key={k} d={`M${x},${base} q${4 + hash(k) * 6},${-hgt * 0.6} ${2 + hash(k + 9) * 10},${-hgt}`} stroke={C.moss} strokeWidth={3} fill="none" strokeLinecap="round" />;
        })}
      </svg>
      <AbsoluteFill style={{ left: L, width: W, top: 1060, ...creep }}>
        <MaskLine text="정원을 읽는" at={6} style={{ font: `500 58px/1.3 ${SANS}`, color: C.paper }} />
        <MaskLine text="세 개의 층." at={6 + HALF * 2} accent={['층.']} style={{ font: `900 120px/1.2 ${SERIF}`, color: C.paper, marginTop: 12, letterSpacing: '-0.03em' }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ---------- 5. 네 개의 지면: 상자가 박마다 한 섹션씩 옮겨 간다 ---------- */
const SECTIONS = ['GARDENS', 'LENS', 'JOURNAL', 'BRAND'];
const Sections: React.FC = () => {
  const f = useCurrentFrame();
  const { dur } = SCENES.sections;
  const out = dur - 12;
  const active = Math.max(-1, Math.min(3, Math.floor((f - 18) / SEC_STEP)));
  return (
    <AbsoluteFill style={{ left: L + 16, width: W, top: SEC_TOP - 120 }}>
      <Fade at={0} out={out}>
        <div style={{ font: `600 30px/1 ${SANS}`, letterSpacing: '0.18em', color: C.moss, height: 120 }}>네 개의 지면</div>
      </Fade>
      {SECTIONS.map((w, i) => (
        <div key={w} style={{ height: SEC_ROW, display: 'flex', alignItems: 'center' }}>
          <MaskLine
            text={w}
            at={HALF + i * 3}
            out={out + i * 2}
            style={{ font: `700 104px/1 ${SERIF}`, letterSpacing: '0.02em', color: i === active ? C.paper : 'rgba(243,241,232,0.32)' }}
          />
        </div>
      ))}
    </AbsoluteFill>
  );
};

/* ---------- 6. 여운 ---------- */
const Last: React.FC = () => {
  const { dur } = SCENES.last;
  const creep = useCreep(dur, 0.045);
  return (
    <AbsoluteFill style={{ left: L, width: W, top: 760, ...creep }}>
      <MaskLine text="보기 좋은 정원보다" at={HALF} out={dur - 12} style={{ font: `500 60px/1.3 ${SANS}`, color: C.dim }} />
      <MaskLine text="오래 남을 정원을." at={HALF * 3} out={dur - 10} accent={['오래']} style={{ font: `900 116px/1.2 ${SERIF}`, color: C.paper, marginTop: 14, letterSpacing: '-0.03em' }} />
    </AbsoluteFill>
  );
};

/* ---------- 7. 엔드 카드 ---------- */
const End: React.FC = () => {
  const f = useCurrentFrame();
  const rule = prog(f, HALF * 3, 18);
  const creep = useCreep(SCENES.end.dur, 0.025);
  return (
    <AbsoluteFill style={{ left: L, width: W, top: 760, ...creep }}>
      <Fade at={0}>
        <div style={{ font: `600 32px/1 ${SANS}`, letterSpacing: '0.14em', color: C.moss }}>조경 · 도시 · 식물 · 정책</div>
      </Fade>
      <div style={{ height: 30 }} />
      <MaskLine text="매거진그린" at={HALF} style={{ font: `900 156px/1.15 ${SERIF}`, color: C.paper, letterSpacing: '-0.04em' }} />
      <div style={{ height: 3, width: W, background: C.line, marginTop: 36, transform: `scaleX(${rule})`, transformOrigin: '0 50%' }} />
      <Fade at={HALF * 4}>
        <div style={{ marginTop: 26, font: `500 38px/1.4 ${SANS}`, color: C.dim }}>정원 라이프스타일 저널</div>
      </Fade>
      <Fade at={HALF * 4 + 4} style={{ position: 'absolute', top: 1360 - 760 - 20, left: 82 }}>
        <div style={{ font: `700 34px/40px ${SANS}`, letterSpacing: '0.2em', color: C.paper }}>MAGAZINE GREEN</div>
      </Fade>
    </AbsoluteFill>
  );
};

export const Manifesto: React.FC = () => {
  const s = SCENES;
  return (
    <AbsoluteFill style={{ wordBreak: 'keep-all' }}>
      <Ground />
      <Sequence from={0} durationInFrames={s.why.from + s.why.dur} name="피드 카드">
        <Feed base={0} />
      </Sequence>
      <Frame />
      <Sequence from={s.feed.from} durationInFrames={s.feed.dur} name="1 넘쳐난다">
        <FeedText />
      </Sequence>
      <Sequence from={s.why.from} durationInFrames={s.why.dur} name="2 왜">
        <Why />
      </Sequence>
      <Sequence from={s.ask.from} durationInFrames={s.ask.dur} name="3 묻는다">
        <Ask />
      </Sequence>
      <Sequence from={s.layers.from} durationInFrames={s.layers.dur} name="4 세 개의 층">
        <Layers />
      </Sequence>
      <Sequence from={s.sections.from} durationInFrames={s.sections.dur} name="5 네 개의 지면">
        <Sections />
      </Sequence>
      <Sequence from={s.last.from} durationInFrames={s.last.dur} name="6 여운">
        <Last />
      </Sequence>
      <Sequence from={s.end.from} durationInFrames={s.end.dur} name="7 엔드 카드">
        <End />
      </Sequence>
    </AbsoluteFill>
  );
};
