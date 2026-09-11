'use client';

import Link from 'next/link';

/**
 * FloatingNav.tsx
 * ------------------------------------------------------------------------
 * Supanova 프리미엄 패스 — 상단에 항상 떠 있는 글래스 필 내비게이션.
 * 목록/상세 페이지 공통으로 루트 레이아웃에서 렌더링됩니다.
 *
 * [정원지도·식물도감 링크] 본 사이트(magazinegreen.co.kr)의 다른 두 콘텐츠 자산으로
 * 나가는 길이 이 프로젝트 아카이브에는 없었다. "MAGAZINE GREEN" 홈 링크와 같은
 * 톤(테두리 없는 텍스트 필)으로 붙이고, 이 사이트 자체를 가리키는 "Projects"만
 * 칠해진 필로 남겨 "지금 있는 곳"과 "나가는 곳"이 한눈에 구분되게 했다.
 */
export default function FloatingNav() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4">
      <nav className="pointer-events-auto mt-4 flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-black/[0.06] bg-white/70 px-1.5 py-1.5 shadow-[0_8px_30px_-12px_rgba(11,83,69,0.18)] backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
        <a
          href="https://magazinegreen.co.kr"
          className="shrink-0 rounded-full px-4 py-2 font-accent text-[12.5px] font-semibold tracking-wide text-[#0B5345] transition-colors duration-300 hover:bg-black/[0.04]"
        >
          MAGAZINE GREEN
        </a>
        <a
          href="https://magazinegreen.co.kr/garden-map"
          className="shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium text-[#5a5a55] transition-colors duration-300 hover:bg-black/[0.04] hover:text-[#0B5345]"
        >
          정원지도
        </a>
        <a
          href="https://magazinegreen.co.kr/plant-guide"
          className="shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium text-[#5a5a55] transition-colors duration-300 hover:bg-black/[0.04] hover:text-[#0B5345]"
        >
          식물도감
        </a>
        <Link
          href="/projects"
          className="shrink-0 rounded-full bg-[#0B5345] px-4 py-2 text-[13px] font-medium text-white transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.03] active:scale-[0.97]"
        >
          Projects
        </Link>
      </nav>
    </div>
  );
}
