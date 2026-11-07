'use client';

/**
 * CinematicHero — 상세 페이지 히어로 사진의 "렌즈 정착 + 스크롤 시차".
 *
 * 세 겹으로 나눈 이유: 한 요소에 load 애니메이션과 scroll 연동을 같이 걸면 transform 이
 * 서로 덮어쓴다. 겹마다 하나의 책임만 진다.
 *   1) frame  : 처음 열릴 때 clip-path 로 사방 4% 안쪽에서 바깥으로 열린다(셔터).
 *   2) lens   : 같은 순간 1.14배에서 1배로 내려앉는다(초점이 맞는 느낌). 1.6s 감속.
 *   3) scroll : 스크롤하면 사진은 화면보다 느리게(22%) 내려가고 살짝 확대되며 어두워진다.
 *               배경이 전경보다 늦게 움직이는 실제 시차.
 * transform·opacity·clip-path 만 쓴다(레이아웃 재계산 없음).
 * 모션 감축 사용자에게는 정지 사진 그대로.
 */

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import SafeImage from '@/components/ui/SafeImage';
import { DUR, EASE } from './tokens';

export default function CinematicHero({
  src,
  alt,
  className = 'h-[52vh] min-h-[380px] sm:h-[64vh]',
  children,
}: {
  src: string;
  alt: string;
  className?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '22%']);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);
  const shade = useTransform(scrollYProgress, [0, 1], [0, 0.5]);

  return (
    <div ref={ref} className={`relative w-full overflow-hidden bg-[#1c1c1a] ${className}`}>
      <motion.div
        className="absolute inset-0"
        initial={reduce ? false : { clipPath: 'inset(4% 4% 4% 4%)' }}
        animate={reduce ? undefined : { clipPath: 'inset(0% 0% 0% 0%)' }}
        transition={{ duration: DUR.scene, ease: EASE.out }}
      >
        <motion.div
          className="absolute inset-0"
          initial={reduce ? false : { scale: 1.14 }}
          animate={reduce ? undefined : { scale: 1 }}
          transition={{ duration: DUR.lens, ease: EASE.out }}
        >
          <motion.div
            className="absolute inset-0 will-change-transform"
            style={reduce ? undefined : { y, scale }}
          >
            <SafeImage src={src} alt={alt} fill priority sizes="100vw" className="object-cover" />
          </motion.div>
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        <motion.div aria-hidden className="absolute inset-0 bg-black" style={{ opacity: reduce ? 0 : shade }} />
      </motion.div>
      {children}
    </div>
  );
}
