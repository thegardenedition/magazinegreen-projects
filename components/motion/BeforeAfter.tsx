'use client';

/**
 * BeforeAfter — 시공 전·후 비교 슬라이더. 정원 시공 사례에서 가장 설득력 있는 장면.
 *
 * 손맛을 만드는 네 가지:
 *  1) 직접 조작은 지연 0. 드래그하는 동안은 스프링을 끄고 값(pos)을 손가락에 1:1로 붙인다.
 *     따라오는 데 스프링을 쓰면 "고무줄"처럼 느껴진다.
 *  2) 탭하면 그 자리로 SPRING.snap(ζ≈0.92)으로 점프 — 순간이동이 아니라 짧게 미끄러진다.
 *  3) 놓는 순간의 속도를 측정해(최근 이동의 지수 평균) 그 속도를 그대로 이어받은 스프링으로
 *     조금 더 미끄러진 뒤 멈춘다(관성). 끝(0/100%)을 넘지 않게 목표를 자른다.
 *  4) 처음 화면에 들어오면 한 번만 좌우로 살짝 흔들어 "끌 수 있다"를 보여준다(사용자가 먼저
 *     만지면 생략).
 *
 * - clip-path: inset() 로 위 사진을 잘라 그린다(레이아웃 변화 없이 GPU 합성).
 * - touch-action: pan-y — 세로 스크롤은 그대로, 가로 드래그만 가져온다.
 * - 핸들은 role="slider". ←/→ 2%, Shift+←/→ 10%, Home/End.
 * - 모션 감축: 흔들기·관성 없음, 점프는 즉시.
 */

import {
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import SafeImage from '@/components/ui/SafeImage';
import { EASE, INERTIA, SPRING } from './tokens';

export interface CompareImage {
  src: string;
  alt: string;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export default function BeforeAfter({
  before,
  after,
  caption,
  aspectRatio = '4 / 3',
  initial = 50,
  labels = ['시공 전', '시공 후'],
}: {
  before: CompareImage;
  after: CompareImage;
  caption?: string;
  aspectRatio?: string;
  initial?: number;
  labels?: [string, string];
}) {
  const box = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const pos = useMotionValue(initial);
  const [aria, setAria] = useState(initial);
  const [dragging, setDragging] = useState(false);
  const touched = useRef(false);
  const ctrl = useRef<AnimationPlaybackControls | null>(null);
  const drag = useRef({ on: false, x: 0, t: 0, v: 0 });

  useMotionValueEvent(pos, 'change', (v) => setAria(Math.round(v)));
  const rightInset = useTransform(pos, (v) => 100 - v);
  const clip = useMotionTemplate`inset(0 ${rightInset}% 0 0)`;
  const left = useMotionTemplate`${pos}%`;
  const beforeLabel = useTransform(pos, [6, 20], [0, 1]);
  const afterLabel = useTransform(pos, [80, 94], [1, 0]);

  const inView = useInView(box, { once: true, amount: 0.6 });
  useEffect(() => {
    if (!inView || reduce || touched.current) return;
    ctrl.current = animate(pos, [initial, initial + 9, initial - 6, initial], {
      duration: 1.5,
      times: [0, 0.35, 0.72, 1],
      ease: EASE.inOut,
      delay: 0.25,
    });
  }, [inView, reduce, initial, pos]);

  const toPct = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    return clamp(((clientX - r.left) / r.width) * 100, 0, 100);
  };
  const go = (to: number) => {
    ctrl.current?.stop();
    if (reduce) pos.set(to);
    else ctrl.current = animate(pos, to, SPRING.snap);
  };

  return (
    <figure className="m-0">
      <div
        ref={box}
        className="relative cursor-ew-resize select-none overflow-hidden bg-[#F3F2EE]"
        style={{ aspectRatio, touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          touched.current = true;
          box.current!.setPointerCapture(e.pointerId);
          const p = toPct(e.clientX);
          drag.current = { on: true, x: p, t: e.timeStamp, v: 0 };
          setDragging(true);
          go(p);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d.on) return;
          const p = toPct(e.clientX);
          const dt = (e.timeStamp - d.t) / 1000;
          if (dt > 0) d.v = d.v * 0.6 + ((p - d.x) / dt) * 0.4;
          d.x = p;
          d.t = e.timeStamp;
          ctrl.current?.stop();
          pos.set(p);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          if (!d.on) return;
          d.on = false;
          setDragging(false);
          // 멈췄다가 놓았으면(80ms 이상 정지) 던진 게 아니다.
          const v = e.timeStamp - d.t > 80 ? 0 : d.v;
          if (reduce || Math.abs(v) < 25) return;
          // 세게 던져도 한 번에 끝까지 날아가지 않게 이동량을 maxTravel(%)로 자른다.
          const travel = clamp(v * INERTIA.power, -INERTIA.maxTravel, INERTIA.maxTravel);
          const to = clamp(pos.get() + travel, 0, 100);
          ctrl.current?.stop();
          ctrl.current = animate(pos, to, { ...SPRING.soft, velocity: v });
        }}
        onPointerCancel={() => {
          drag.current.on = false;
          setDragging(false);
        }}
      >
        <SafeImage src={after.src} alt={after.alt} fill draggable={false} sizes="(min-width: 1024px) 880px, 100vw" className="object-cover" />
        <motion.div className="absolute inset-0" style={{ clipPath: clip }}>
          <SafeImage src={before.src} alt={before.alt} fill draggable={false} sizes="(min-width: 1024px) 880px, 100vw" className="object-cover" />
        </motion.div>

        <motion.span
          className="pointer-events-none absolute left-3 top-3 bg-[#1c1c1a]/75 px-2.5 py-1.5 text-[12px] font-semibold tracking-[0.04em] text-white"
          style={{ opacity: beforeLabel }}
        >
          {labels[0]}
        </motion.span>
        <motion.span
          className="pointer-events-none absolute right-3 top-3 bg-[#0B5345]/90 px-2.5 py-1.5 text-[12px] font-semibold tracking-[0.04em] text-white"
          style={{ opacity: afterLabel }}
        >
          {labels[1]}
        </motion.span>

        <motion.div className="pointer-events-none absolute inset-y-0 w-0" style={{ left }}>
          <span className="absolute inset-y-0 left-0 w-[2px] -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.12),0_0_18px_rgba(0,0,0,0.25)]" />
          {/* 위치(translate)는 바깥 칸이, 눌림(scale)은 안쪽 motion 이 맡는다. 한 요소에 두면
              motion 의 transform 이 Tailwind translate 를 덮어써 핸들이 선에서 22px 어긋난다. */}
          <span className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <motion.div
            role="slider"
            tabIndex={0}
            aria-label={`${labels[0]}·${labels[1]} 비교 위치`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={aria}
            aria-valuetext={`${labels[0]} ${aria}% · ${labels[1]} ${100 - aria}%`}
            className="pointer-events-auto flex h-11 w-11 cursor-ew-resize items-center justify-center rounded-full bg-white text-[#0B5345] shadow-[0_6px_20px_-6px_rgba(0,0,0,0.45)] outline-none focus-visible:ring-2 focus-visible:ring-[#0B5345] focus-visible:ring-offset-2"
            animate={{ scale: dragging ? 1.12 : 1 }}
            transition={SPRING.leaf}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 10 : 2;
              const cur = pos.get();
              let to: number | null = null;
              if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') to = cur - step;
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') to = cur + step;
              if (e.key === 'Home') to = 0;
              if (e.key === 'End') to = 100;
              if (to === null) return;
              e.preventDefault();
              touched.current = true;
              go(clamp(to, 0, 100));
            }}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />
            </svg>
          </motion.div>
          </span>
        </motion.div>
      </div>
      {caption && <figcaption className="mt-3 text-center text-[13px] leading-relaxed text-[#8a8a84]">{caption}</figcaption>}
    </figure>
  );
}
