import type { Metadata } from 'next';
import MotionLab from './MotionLab';

/**
 * /motion-lab — components/motion 프리미티브를 한 화면에서 만져 보고 점검하는 작업대.
 * 내비게이션에 연결하지 않는 내부 페이지. 공개 여부와 상관없이 색인 금지.
 */
export const metadata: Metadata = {
  title: 'Motion Lab',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <MotionLab />;
}
