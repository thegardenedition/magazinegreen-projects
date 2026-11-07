'use client';

/**
 * DepthPhoto — 사진 액자 안쪽에 "깊이"를 주는 포인터 시차 + 반사광.
 *
 * 카드 전체를 3D 로 기울이면 글자까지 기울어 읽기 나빠지고, 카드 위에 겹친 버튼 막대와
 * 사진 가장자리가 어긋난다. 그래서 액자(overflow-hidden)는 고정하고 안쪽 사진만 움직인다.
 * 창문 너머 풍경처럼, 포인터 반대쪽으로 사진이 최대 ±range% 밀리고(1.06배 확대로 여백 확보),
 * 포인터 위치에 부드러운 반사광이 맺힌다.
 *
 * - 정밀 포인터(마우스·트랙패드)에서만 켠다. 터치에서는 손가락이 사진을 가리고, 스크롤과
 *   충돌한다.
 * - 포인터 추적은 SPRING.follow(ζ≈1.04): 손보다 ~60ms 늦게 따라와 무게가 느껴지되 떨리지 않는다.
 * - 포인터가 나가면 같은 스프링으로 중심 복귀.
 */

import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SPRING, springOf } from './tokens';

export default function DepthPhoto({
  children,
  overlay,
  className = '',
  range = 2.2,
}: {
  children: ReactNode;
  /** 사진과 함께 움직이면 안 되는 것(배지·라벨). 액자에 고정된다. */
  overlay?: ReactNode;
  className?: string;
  /** 사진이 움직이는 최대 폭(%) */
  range?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const on = () => setFine(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const px = useSpring(0.5, springOf(SPRING.follow));
  const py = useSpring(0.5, springOf(SPRING.follow));
  const light = useMotionValue(0);
  const glow = useSpring(light, springOf(SPRING.settle));
  const x = useTransform(px, [0, 1], [`${range}%`, `${-range}%`]);
  const y = useTransform(py, [0, 1], [`${range}%`, `${-range}%`]);
  const gx = useTransform(px, (v) => v * 100);
  const gy = useTransform(py, (v) => v * 100);
  const glare = useMotionTemplate`radial-gradient(120% 90% at ${gx}% ${gy}%, rgba(255,255,255,0.26), rgba(255,255,255,0) 55%)`;

  const active = fine && !reduce;

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden ${className}`}
      onPointerMove={
        active
          ? (e) => {
              const r = ref.current!.getBoundingClientRect();
              px.set((e.clientX - r.left) / r.width);
              py.set((e.clientY - r.top) / r.height);
              light.set(1);
            }
          : undefined
      }
      onPointerLeave={
        active
          ? () => {
              px.set(0.5);
              py.set(0.5);
              light.set(0);
            }
          : undefined
      }
    >
      <motion.div className="absolute inset-0 will-change-transform" style={active ? { x, y, scale: 1.06 } : undefined}>
        {children}
      </motion.div>
      {active && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-soft-light"
          style={{ background: glare, opacity: glow }}
        />
      )}
      {overlay}
    </div>
  );
}
