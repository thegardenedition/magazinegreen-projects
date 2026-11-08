import React, { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { PIXEL_EN, SANS, SERIF, loadFonts } from './fonts';
import { C as MG } from './motion';
import { sprite } from './arcade/sprites';

loadFonts();

/* ---------------------------------------------------------------------------
 * 정원 오락실 — 인스타그램 릴스 포장(매거진그린 문법)
 *  - ReelCover: 릴스 커버. 프로필 그리드는 9:16 을 가운데 3:4(1080×1440, y 240~1680)로 잘라 보여 주므로
 *    글자는 전부 그 안에. 딥그린 + 세리프 제목, 픽셀은 작은 표식 하나만(시리즈 연결).
 *  - ReelOutro: 3초 엔드 카드. 아케이드 마지막 화면이 브라운관 꺼지듯 한 줄 → 점으로 접히고,
 *    편집부 카드가 이어진다. 놀이(영상)에서 해설(캡션)로 넘어가는 다리.
 * ------------------------------------------------------------------------- */

export type ReelProps = { ep: 1 | 2 };

// 대상은 아이. 아기 말투·감탄 없이, 과학 그림책처럼 담백하게.
const EP = {
  1: {
    stage: 'STAGE 01', month: '11월', title: '구근의 모험', kicker: '땅속에서 시작하는 한 해', sprites: ['bulb'],
    mission: '튤립 구근 심기', kit: '화분 · 흙 · 구근 · 이름표 · 장갑', next: '다음 미션 · 12월 「낙엽 이불」',
  },
  2: {
    stage: 'STAGE 02', month: '12월', title: '낙엽 이불', kicker: '낙엽으로 덮어 두는 이유', sprites: ['maple', 'ginkgo', 'oak'],
    mission: '화분에 낙엽 덮기', kit: '마른 낙엽 · 장갑', next: '다음 미션 · 1월 「분신술」',
  },
} as const;

/** 픽셀 스프라이트를 정수 배율로(흐림 없이) */
const Pixel: React.FC<{ name: string; scale: number }> = ({ name, scale }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const im = typeof document !== 'undefined' ? sprite(name) : null;
  useLayoutEffect(() => {
    if (!im || !ref.current) return;
    const ctx = ref.current.getContext('2d')!;
    ctx.clearRect(0, 0, im.width, im.height);
    ctx.drawImage(im, 0, 0);
  }, [im]);
  const w = im?.width ?? 16;
  const h = im?.height ?? 16;
  return <canvas ref={ref} width={w} height={h} style={{ width: w * scale, height: h * scale, imageRendering: 'pixelated' }} />;
};

const Lockup: React.FC<{ color?: string }> = ({ color = MG.moss }) => (
  <div style={{ font: `600 30px ${SANS}`, letterSpacing: '0.22em', color }}>MAGAZINE GREEN · 정원 오락실</div>
);

export const ReelCover: React.FC<ReelProps> = ({ ep }) => {
  const e = EP[ep];
  return (
    <AbsoluteFill style={{ background: MG.ground, color: MG.paper, wordBreak: 'keep-all' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(110% 70% at 50% 42%, rgba(255,255,255,0.06), rgba(0,0,0,0.25) 100%)' }} />
      {/* 3:4 안전 영역 y 240~1680 */}
      <div style={{ position: 'absolute', left: 96, right: 96, top: 330 }}>
        <Lockup />
        <div style={{ height: 2, background: MG.line, marginTop: 34 }} />
      </div>
      <div style={{ position: 'absolute', left: 96, right: 96, top: 560, display: 'flex', gap: 36, alignItems: 'flex-end' }}>
        {e.sprites.map((s) => (
          <Pixel key={s} name={s} scale={e.sprites.length > 1 ? 10 : 12} />
        ))}
      </div>
      <div style={{ position: 'absolute', left: 96, right: 96, top: 860 }}>
        <div style={{ font: `500 46px ${SANS}`, color: MG.dim }}>{e.month}</div>
        <div style={{ font: `900 168px/1.12 ${SERIF}`, letterSpacing: '-0.04em', marginTop: 10 }}>{e.title}</div>
        <div style={{ font: `400 54px/1.4 ${SERIF}`, color: MG.paper, opacity: 0.86, marginTop: 30 }}>{e.kicker}</div>
      </div>
      <div style={{ position: 'absolute', left: 96, right: 96, top: 1480, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ font: `400 34px ${PIXEL_EN}`, color: MG.moss }}>{e.stage}</div>
        <div style={{ font: `500 36px ${SANS}`, color: MG.dim }}>{e.month}의 정원 미션</div>
      </div>
    </AbsoluteFill>
  );
};

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const OUTRO_FRAMES = 90;

export const ReelOutro: React.FC<ReelProps> = ({ ep }) => {
  const f = useCurrentFrame();
  const e = EP[ep];
  // 브라운관 꺼짐: 세로로 납작(0~7f) → 가로로 줄어 점(7~12f) → 점이 사라짐(12~16f)
  const sy = interpolate(f, [0, 7], [1, 0.006], { extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  const sx = interpolate(f, [7, 12], [1, 0.004], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  const glow = interpolate(f, [0, 7], [1, 2.4], { extrapolateRight: 'clamp' });
  const dot = interpolate(f, [12, 16], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const card = interpolate(f, [16, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  const line = (at: number) => interpolate(f, [at, at + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  return (
    <AbsoluteFill style={{ background: '#05030c' }}>
      {f < 12 && (
        <AbsoluteFill style={{ transform: `scale(${sx}, ${sy})`, filter: `brightness(${glow})` }}>
          <Img src={staticFile(`reel/last-ep${ep}.png`)} style={{ width: 1080, height: 1920 }} />
        </AbsoluteFill>
      )}
      {f >= 12 && f < 17 && <div style={{ position: 'absolute', left: 534, top: 954, width: 12, height: 12, borderRadius: 6, background: '#fff', opacity: dot, boxShadow: '0 0 30px 12px rgba(255,255,255,0.6)' }} />}
      <AbsoluteFill style={{ background: MG.ground, opacity: card, color: MG.paper, wordBreak: 'keep-all' }}>
        <div style={{ position: 'absolute', left: 96, right: 164, top: 620 }}>
          <div style={{ opacity: line(18), transform: `translateY(${(1 - line(18)) * 16}px)` }}>
            <Lockup />
          </div>
          <div style={{ font: `500 52px ${SANS}`, color: MG.moss, marginTop: 44, opacity: line(22) }}>{e.month} 미션</div>
          <div style={{ font: `900 ${e.mission.length > 7 ? 100 : 120}px/1.18 ${SERIF}`, letterSpacing: '-0.04em', whiteSpace: 'nowrap', marginTop: 12, opacity: line(25), transform: `translateY(${(1 - line(25)) * 24}px)` }}>{e.mission}</div>
          <div style={{ height: 2, background: MG.line, marginTop: 50, transform: `scaleX(${line(30)})`, transformOrigin: '0 50%' }} />
          <div style={{ font: `500 42px/1.5 ${SANS}`, color: MG.paper, marginTop: 36, opacity: line(36) * 0.9 }}>준비물 · {e.kit}</div>
          <div style={{ font: `500 42px/1.5 ${SANS}`, color: MG.paper, marginTop: 6, opacity: line(40) * 0.9 }}>어른과 함께 해요</div>
          <div style={{ font: `500 42px/1.5 ${SANS}`, color: MG.moss, marginTop: 22, opacity: line(46) }}>{e.next}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
