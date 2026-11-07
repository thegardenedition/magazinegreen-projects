'use client';

/**
 * MaskReveal — 제목을 어절 단위로 "아래 마스크에서 밀어 올리는" 등장.
 *
 * 글자가 페이드로 떠오르는 대신, 보이지 않는 선 아래에서 실제로 올라온다. 활판에서 행을
 * 끌어올리는 감각이라 에디토리얼 제목에 맞다. 한글은 어절(띄어쓰기) 단위로 나눠야
 * 줄바꿈(break-keep)과 어긋나지 않는다.
 *
 * 접근성: 화면낭독기는 원문 한 줄(sr-only)만 읽고, 쪼갠 조각은 aria-hidden.
 * 마스크 칸에 하단 여백(pb-[0.12em])을 둬 받침·하강부가 잘리지 않게 한다.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { DUR, EASE } from './tokens';

export default function MaskReveal({
  text,
  delay = 0,
  stagger = 0.055,
}: {
  text: string;
  delay?: number;
  stagger?: number;
}) {
  // 모션 감축이어도 마크업 구조는 같게 둔다(서버 렌더와 어긋나면 하이드레이션 오류). 움직임만 끈다.
  const reduce = useReducedMotion();
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((w, i) => (
          <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
            <motion.span
              className="inline-block will-change-transform"
              initial={reduce ? false : { y: '115%', rotate: 2 }}
              animate={{ y: '0%', rotate: 0 }}
              transition={{ duration: DUR.scene * 0.85, ease: EASE.out, delay: delay + i * stagger }}
            >
              {w}
            </motion.span>
            {i < words.length - 1 && ' '}
          </span>
        ))}
      </span>
    </>
  );
}
