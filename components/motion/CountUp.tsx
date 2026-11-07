'use client';

/**
 * CountUp — 화면에 들어올 때 0에서 실제 값까지 과감쇠 스프링으로 차오르는 숫자.
 *
 * - 과감쇠(SPRING.count, ζ≈1.29): 목표를 넘었다 돌아오면 "64㎡"가 잠깐 "66㎡"로 보인다.
 *   숫자는 정보라서 오버슈트를 허용하지 않는다.
 * - 서버 렌더·JS 없는 환경에서는 처음부터 최종값이 보인다(검색·미리보기 안전).
 *   클라이언트가 붙는 순간 페인트 전에(useLayoutEffect) 0으로 내려 깜빡임이 없다.
 * - 자릿수 폭이 흔들리지 않도록 tabular-nums + 최종 글자 수만큼 min-width.
 * - 소수 자리수·천 단위 쉼표는 원문 표기를 따른다. 숫자가 아니면 그대로 출력.
 */

import { motion, useInView, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { SPRING, springOf } from './tokens';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export default function CountUp({ value, className = '' }: { value: string; className?: string }) {
  const raw = value.replace(/,/g, '').trim();
  const target = Number(raw);
  const numeric = raw !== '' && Number.isFinite(target);
  const decimals = (raw.split('.')[1] ?? '').length;
  const grouped = value.includes(',');

  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const mv = useSpring(numeric ? target : 0, springOf(SPRING.count));
  const text = useTransform(mv, (v) =>
    v.toLocaleString('ko-KR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: grouped,
    }),
  );

  useIsoLayoutEffect(() => {
    if (numeric && !reduce) mv.jump(0);
  }, [numeric, reduce, mv]);

  useEffect(() => {
    if (numeric && inView) mv.set(target);
  }, [numeric, inView, target, mv]);

  // 모션 감축이면 jump(0)을 건너뛰므로 처음부터 최종값이 그대로 보인다. 마크업은 서버와 같다.
  if (!numeric) return <span className={className}>{value}</span>;
  return (
    <motion.span
      ref={ref}
      className={`inline-block tabular-nums ${className}`}
      style={{ minWidth: `${value.length}ch` }}
    >
      {text}
    </motion.span>
  );
}
