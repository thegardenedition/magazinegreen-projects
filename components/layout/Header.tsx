'use client';

/**
 * components/layout/Header.tsx
 * ------------------------------------------------------------------------
 * 대표 결정(2026-09-28, 디자인 세션 재설계): 라이브 매거진 그린 헤더를
 * 정지 화면처럼 베낀 이전 버전(메가메뉴·로그인 드롭다운 등 실제 동작이
 * 없어 "어설프다"는 지적을 받음)을 되돌리고, 예전 FloatingNav 구성
 * (홈·정원지도·식물도감·Projects)을 브랜드 라디우스 0 원칙에 맞춰
 * 각진 모양으로 다시 그렸다. 라이브 헤더·알림바·로그인 영역은 흉내내지
 * 않는다 — 이 사이트는 매거진그린 안의 별개 콘텐츠 자산임을 가벼운
 * 링크 묶음으로만 알린다(시안: projects-header-redesign-2026-09-28.html).
 *
 * 대표 결정(2026-09-29): 상세 페이지처럼 긴 페이지에서 헤더가 계속
 * 떠 있으면 본문을 가린다는 지적 — 스크롤 방향에 따라 숨김/노출한다.
 * 맨 위(80px 이내)에서는 항상 보이고, 아래로 스크롤하면 숨는다. 다시 나오는
 * 규칙은 lib/headerScroll.ts 에 있다 — 읽다가 조금 올린 것만으로는 나오지
 * 않고, 위로 길게 올릴 때만 나온다.
 */

import { useEffect, useRef, useState } from 'react';
import { INITIAL_HEADER_STATE, nextHeaderState, type HeaderScrollState } from '@/lib/headerScroll';

const SITE = 'https://www.magazinegreen.co.kr';

const LINKS = [
  { label: '정원지도', href: `${SITE}/garden-map` },
  { label: '식물도감', href: `${SITE}/plant-guide` },
];

export default function Header() {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const stateRef = useRef<HeaderScrollState>(INITIAL_HEADER_STATE);
  const ticking = useRef(false);

  useEffect(() => {
    lastScrollY.current = window.scrollY;

    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const next = nextHeaderState(stateRef.current, currentY, lastScrollY.current);
        stateRef.current = next;
        setHidden(next.hidden);

        lastScrollY.current = currentY;
        ticking.current = false;
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      onFocusCapture={() => {
        // 키보드 Tab 으로 숨은 헤더에 포커스가 들어오면 보이게 한다(안 보이는 링크에 포커스가 머물지 않게)
        stateRef.current = INITIAL_HEADER_STATE;
        setHidden(false);
      }}
      className={`pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none sm:top-5 sm:px-4 ${
        hidden ? '-translate-y-[calc(100%+2rem)]' : 'translate-y-0'
      }`}
    >
      <div className="pointer-events-auto flex max-w-full items-center overflow-x-auto border border-[#D2D2CC] bg-white shadow-[0_18px_40px_-26px_rgba(11,83,69,0.45)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <a
          href={SITE}
          className="focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-green flex h-[46px] items-center whitespace-nowrap border-r border-[#E4E4E0] px-3 text-[12px] font-bold tracking-[0.01em] text-[#121212] transition-colors duration-300 hover:text-brand-green sm:pl-4 sm:pr-[18px] sm:text-[13px]"
        >
          MAGAZINE GREEN
        </a>
        <nav aria-label="매거진 그린 다른 콘텐츠" className="flex items-center px-1.5">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-green flex h-[46px] items-center whitespace-nowrap px-[9px] text-[12px] font-medium text-[#6E6E6E] transition-colors duration-300 hover:text-[#121212] sm:px-3 sm:text-[13px]"
            >
              {link.label}
            </a>
          ))}
          <a
            href="/projects"
            aria-current="page"
            className="focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-green relative flex h-[46px] items-center whitespace-nowrap px-[9px] text-[12px] font-medium text-[#121212] after:absolute after:inset-x-[9px] after:bottom-0 after:h-0.5 after:bg-brand-green sm:px-3 sm:text-[13px] sm:after:inset-x-3"
          >
            Projects
          </a>
        </nav>
      </div>
    </header>
  );
}
