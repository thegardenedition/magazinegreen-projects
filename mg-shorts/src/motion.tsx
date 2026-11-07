import React from 'react';
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/* ---------------------------------------------------------------------------
 * 매거진그린 쇼츠 모션 토큰과 텍스트 프리미티브.
 * 웹(components/motion/tokens.ts)과 같은 물리 기준을 프레임 단위로 옮긴 것.
 * 박자 격자: 100 BPM = 1박 0.6s = 18프레임(30fps). 장면·단어 진입은 반박(9f) 격자에 맞춘다.
 * 나중에 100 BPM 음악을 깔면 컷과 단어가 박에 떨어진다.
 * ------------------------------------------------------------------------- */

export const FPS = 30;
export const BEAT = 18; // 100 BPM
export const HALF = 9;

export const C = {
  ground: '#0B3F35', // 매거진그린 딥그린보다 한 단계 어두운 바닥 — 흰 글자 대비 11:1
  deep: '#0B5345',
  paper: '#F3F1E8',
  dim: 'rgba(243,241,232,0.56)',
  line: 'rgba(243,241,232,0.22)',
  moss: '#C8DB86', // 강조 한 색만
};

/** 감속(들어올 때) — 웹 EASE.out 과 동일 */
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
/** 가속(나갈 때) */
export const easeIn = Easing.bezier(0.7, 0, 0.84, 0);

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** start 프레임부터 dur 동안 0→1 (감속) */
export const prog = (f: number, start: number, dur: number, easing = easeOut) =>
  interpolate(f, [start, start + dur], [0, 1], { ...clamp, easing });

/** 스프링(ζ 기준). 무거운 글자는 critically damped, 가벼운 칩은 살짝 튕김 */
export const SPR = {
  heavy: { damping: 200, stiffness: 120, mass: 1 }, // 오버슈트 없음
  settle: { damping: 18, stiffness: 140, mass: 1 }, // ζ≈0.76 — 한 번 살짝 넘침
  pop: { damping: 11, stiffness: 180, mass: 0.7 }, // ζ≈0.49 — 가벼운 것
};

export const useSpring = (start: number, cfg: keyof typeof SPR = 'heavy') => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - start, fps, config: SPR[cfg] });
};

/**
 * MaskLine — 어절 단위로 보이지 않는 선 아래에서 밀어 올리는 등장, 위로 빠지는 퇴장.
 * 한글은 어절(띄어쓰기) 단위로만 쪼갠다. 글자 단위로 쪼개면 받침 리듬이 깨지고 읽기 속도가 떨어진다.
 */
export const MaskLine: React.FC<{
  text: string;
  at: number;
  out?: number;
  stagger?: number;
  dur?: number;
  style?: React.CSSProperties;
  accent?: string[];
  accentColor?: string;
}> = ({ text, at, out, stagger = 3, dur = 16, style, accent = [], accentColor = C.moss }) => {
  const f = useCurrentFrame();
  const words = text.split(' ');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: '0.28em', ...style }}>
      {words.map((w, i) => {
        const p = prog(f, at + i * stagger, dur);
        const q = out === undefined ? 0 : prog(f, out + i * 2, 10, easeIn);
        const y = (1 - p) * 112 - q * 112;
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', paddingBottom: '0.14em', marginBottom: '-0.14em' }}>
            <span
              style={{
                display: 'inline-block',
                transform: `translateY(${y}%) rotate(${(1 - p) * 4}deg)`,
                transformOrigin: '0% 100%',
                color: accent.includes(w) ? accentColor : undefined,
              }}
            >
              {w}
            </span>
          </span>
        );
      })}
    </div>
  );
};

/** Fade — 보조 정보(크레딧, 라벨)용. 이동 거리 작게, 시간은 짧게. */
export const Fade: React.FC<{ at: number; out?: number; dy?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  at,
  out,
  dy = 14,
  children,
  style,
}) => {
  const f = useCurrentFrame();
  const p = prog(f, at, 14);
  const q = out === undefined ? 0 : prog(f, out, 9, easeIn);
  return <div style={{ opacity: p * (1 - q), transform: `translateY(${(1 - p) * dy}px)`, ...style }}>{children}</div>;
};

/**
 * useCreep — 멈춰 있는 글줄에 '살아 있는 것 하나'를 남기는 아주 느린 확대(카메라 크리프).
 * 장면 길이 동안 1.00 → 1+amt. 장면이 바뀌면 글자도 같이 바뀌므로 되감김이 보이지 않는다.
 * 정보는 다 읽힐 만큼 멈추되, 화면이 2.5초 넘게 얼어 있지 않게 한다(video-motion 6·7장).
 */
export const useCreep = (dur: number, amt = 0.035): React.CSSProperties => {
  const f = useCurrentFrame();
  const k = interpolate(f, [0, dur], [0, 1], clamp);
  return { transform: `scale(${1 + amt * k})`, transformOrigin: '0% 50%' };
};
