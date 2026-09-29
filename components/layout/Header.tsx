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
 * 맨 위(80px 이내)에서는 항상 보이고, 아래로 스크롤하면 숨고, 위로
 * 스크롤하면 다시 뜬다. 자잘한 떨림(8px 이하)은 무시해 스크롤 관성
 * 끝에서 깜빡이지 않게 한다.
 */

import { useEffect, useRef, useState } from 'react';

const SITE = 'https://www.magazinegreen.co.kr';

const LINKS = [
  { label: '정원지도', href: `${SITE}/garden-map` },
  { label: '식물도감', href: `${SITE}/plant-guide` },
];

const REVEAL_ZONE_PX = 80;
const DIRECTION_THRESHOLD_PX = 8;

export default function Header() {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    lastScrollY.current = window.scrollY;

    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const delta = currentY - lastScrollY.current;

        if (currentY < REVEAL_ZONE_PX) {
          setHidden(false);
        } else if (delta > DIRECTION_THRESHOLD_PX) {
          setHidden(true);
        } else if (delta < -DIRECTION_THRESHOLD_PX) {
          setHidden(false);
        }

        lastScrollY.current = currentY;
        ticking.current = false;
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none sm:top-5 sm:px-4 ${
        hidden ? '-translate-y-[calc(100%+2rem)]' : 'translate-y-0'
      }`}
    >
      <div className="pointer-events-auto flex max-w-full items-stretch overflow-x-auto border border-[#121212] bg-white shadow-[0_16px_40px_-20px_rgba(11,83,69,0.35)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <a
          href={SITE}
          className="flex items-center whitespace-nowrap border-r border-[#E4E4E0] px-4 text-[12px] font-bold tracking-[0.01em] text-[#121212] transition-colors duration-300 hover:text-brand-green sm:px-5 sm:text-[13px]"
        >
          MAGAZINE GREEN
        </a>
        <nav aria-label="매거진 그린 다른 콘텐츠" className="flex items-stretch">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="flex h-11 items-center whitespace-nowrap border-r border-[#E4E4E0] px-3.5 text-[12px] font-medium text-[#6E6E6E] transition-colors duration-300 hover:bg-[#F3F2EE] hover:text-brand-green sm:h-12 sm:px-[18px] sm:text-[13px]"
            >
              {link.label}
            </a>
          ))}
          <a
            href="/projects"
            aria-current="page"
            className="flex h-11 items-center whitespace-nowrap bg-brand-green px-3.5 text-[12px] font-semibold text-white transition-colors duration-300 hover:bg-brand-green-dark sm:h-12 sm:px-[18px] sm:text-[13px]"
          >
            Projects
          </a>
        </nav>
      </div>
    </header>
  );
}
