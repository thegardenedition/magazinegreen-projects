'use client';

import Link from 'next/link';

/**
 * FloatingNav.tsx
 * ------------------------------------------------------------------------
 * Supanova 프리미엄 패스 — 상단에 항상 떠 있는 글래스 필 내비게이션.
 * 목록/상세 페이지 공통으로 루트 레이아웃에서 렌더링됩니다.
 */
export default function FloatingNav() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center">
      <nav className="pointer-events-auto mt-4 flex items-center gap-1 rounded-full border border-black/[0.06] bg-white/70 px-1.5 py-1.5 shadow-[0_8px_30px_-12px_rgba(26,77,46,0.18)] backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
        <a
          href="https://magazinegreen.co.kr"
          className="rounded-full px-4 py-2 font-accent text-[12.5px] font-semibold tracking-wide text-[#1A4D2E] transition-colors duration-300 hover:bg-black/[0.04]"
        >
          MAGAZINE GREEN
        </a>
        <Link
          href="/projects"
          className="rounded-full bg-[#1A4D2E] px-4 py-2 text-[13px] font-medium text-white transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.03] active:scale-[0.97]"
        >
          Projects
        </Link>
      </nav>
    </div>
  );
}
