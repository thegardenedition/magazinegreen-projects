'use client';

/**
 * components/layout/Header.tsx
 * ------------------------------------------------------------------------
 * 라이브 magazinegreen.co.kr 헤더(.mg-header, sticky)+알림바(.mg-alert, 비sticky)를
 * 이식한 컴포넌트. 정본 시안(design-audit 워크트리, 2026-09-28)이 헤더+알림바를
 * 별개 컴포넌트로 두는 라이브 동작을 이미 확인했으므로 그대로 따른다 —
 * 알림바는 헤더와 달리 스크롤하면 같이 흘러간다.
 *
 * 시안의 메뉴 ▾ 캐럿은 장식일 뿐 드롭다운/메가메뉴 동작이 없다(라이브 메가메뉴는
 * 외부 Webflow 스크립트가 DOM을 만들어 로컬에서 재현 불가 — 프로젝트 아카이브
 * 정책 메모리 참고). 이 컴포넌트는 시안 그대로 단순 링크로 이식하고, 시안에 없던
 * 모바일 전체화면 메뉴와 로그인 상태 조회만 실제로 동작하게 추가했다.
 */

import Image from 'next/image';
import { useEffect, useState } from 'react';

const SITE = 'https://www.magazinegreen.co.kr';

const NAV_LINKS = [
  { label: '홈', href: `${SITE}/` },
  { label: '매거진', href: `${SITE}/blog-pages/blog-v3` },
  { label: '뉴스', href: `${SITE}/blog-pages/blog-v2` },
  { label: '인터뷰', href: `${SITE}/blog-category/interview` },
];

type AuthState = { loggedIn: false } | { loggedIn: true; name: string };

function Caret() {
  return (
    <svg
      className="h-3 w-3 text-[#121212]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
      <circle cx="9" cy="9" r="6" />
      <path d="m17 17-3.6-3.6" />
    </svg>
  );
}

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [auth, setAuth] = useState<AuthState>({ loggedIn: false });

  useEffect(() => {
    let cancelled = false;
    fetch('https://social-login-worker.chgreena.workers.dev/api/auth/me', {
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.loggedIn) setAuth({ loggedIn: true, name: data.name || '회원' });
      })
      .catch(() => {
        /* 로그인 상태 조회 실패 시 비로그인으로 둔다 — CORS 미허용 등 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-white shadow-[0_1px_24px_rgba(18,18,18,0.04)]">
        <div className="mx-auto grid max-w-[1286px] grid-cols-[44px_1fr_44px] items-center gap-x-2 px-6 py-8 lg:grid-cols-[auto_1fr_auto] lg:gap-x-10">
          <a
            href={`${SITE}/search`}
            aria-label="검색"
            className="grid h-11 w-11 place-items-center text-[#121212] lg:hidden"
          >
            <SearchIcon />
          </a>

          <a href={SITE} aria-label="매거진 그린 홈" className="block justify-self-center lg:justify-self-start">
            <Image src="/logo.png" alt="매거진 그린 로고" width={892} height={197} className="h-[45px] w-auto lg:h-[63px]" priority />
          </a>

          <nav aria-label="주 메뉴" className="hidden items-center justify-center gap-11 lg:flex">
            {NAV_LINKS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="inline-flex items-center gap-1.5 text-[15px] font-medium leading-4 tracking-[-0.15px] text-[#121212] transition-colors duration-300 hover:text-brand-green"
              >
                {item.label}
                {item.label !== '홈' && <Caret />}
              </a>
            ))}
          </nav>

          <div className="hidden items-center lg:flex">
            <div className="mr-5 flex gap-2.5">
              <a
                href="https://www.youtube.com/@chgreen.official"
                aria-label="유튜브"
                className="grid h-[30px] w-[30px] place-items-center border border-black/[0.12] text-[#121212] transition-colors duration-300 hover:border-brand-green hover:bg-brand-green hover:text-white"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 23 7.2ZM9.7 15.1V8.9l6 3.1-6 3.1Z" />
                </svg>
              </a>
              <a
                href="https://www.instagram.com/magazinegreen.official/"
                aria-label="인스타그램"
                className="grid h-[30px] w-[30px] place-items-center border border-black/[0.12] text-[#121212] transition-colors duration-300 hover:border-brand-green hover:bg-brand-green hover:text-white"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                </svg>
              </a>
            </div>
            <a href={`${SITE}/search`} aria-label="검색" className="grid h-10 w-10 place-items-center text-[#121212]">
              <SearchIcon />
            </a>
            {auth.loggedIn ? (
              <a
                href={`${SITE}/dashboard`}
                className="ml-3.5 inline-flex h-[46px] items-center gap-1.5 pl-3.5 pr-4 text-sm font-medium text-[#1A1A1A]"
              >
                {auth.name}님
              </a>
            ) : (
              <a
                href={`${SITE}/log-in`}
                className="ml-3.5 inline-flex h-[46px] items-center gap-1.5 pl-3.5 pr-4 text-sm font-medium text-[#1A1A1A]"
              >
                로그인
                <Caret />
              </a>
            )}
            <a
              href={`${SITE}/sign-up`}
              className="ml-3.5 inline-flex h-[46px] items-center justify-center rounded-[80px] bg-brand-green px-6 text-sm font-medium leading-4 text-white transition-all duration-300 hover:-translate-y-px hover:bg-brand-green-dark"
            >
              회원가입
            </a>
          </div>

          <button
            type="button"
            aria-label="메뉴"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="grid h-11 w-11 place-items-center justify-self-end lg:hidden"
          >
            <span className="relative block h-[26px] w-[30px]">
              <span
                className={`absolute left-0 right-0 top-[2px] h-0.5 bg-[#121212] transition-transform duration-300 ${mobileOpen ? 'translate-y-[10px] rotate-45' : ''}`}
              />
              <span
                className={`absolute left-0 right-0 top-3 h-0.5 bg-[#121212] transition-opacity duration-200 ${mobileOpen ? 'opacity-0' : ''}`}
              />
              <span
                className={`absolute bottom-[2px] left-0 right-0 h-0.5 bg-[#121212] transition-transform duration-300 ${mobileOpen ? '-translate-y-[10px] -rotate-45' : ''}`}
              />
            </span>
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white lg:hidden">
          <div className="flex items-center justify-between px-6 py-8">
            <a href={SITE} aria-label="매거진 그린 홈">
              <Image src="/logo.png" alt="매거진 그린 로고" width={892} height={197} className="h-[45px] w-auto" />
            </a>
            <button
              type="button"
              aria-label="메뉴 닫기"
              onClick={() => setMobileOpen(false)}
              className="grid h-11 w-11 place-items-center text-[28px] leading-none text-[#121212]"
            >
              &times;
            </button>
          </div>
          <nav aria-label="모바일 메뉴" className="flex flex-1 flex-col gap-1 overflow-y-auto px-6 py-4">
            {NAV_LINKS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="border-b border-black/[0.06] py-4 text-[20px] font-medium text-[#121212]"
              >
                {item.label}
              </a>
            ))}
            <a href={`${SITE}/search`} className="border-b border-black/[0.06] py-4 text-[20px] font-medium text-[#121212]">
              검색
            </a>
            {auth.loggedIn ? (
              <a href={`${SITE}/dashboard`} className="border-b border-black/[0.06] py-4 text-[20px] font-medium text-[#121212]">
                {auth.name}님
              </a>
            ) : (
              <a href={`${SITE}/log-in`} className="border-b border-black/[0.06] py-4 text-[20px] font-medium text-[#121212]">
                로그인
              </a>
            )}
          </nav>
          <div className="px-6 pb-10">
            <a
              href={`${SITE}/sign-up`}
              className="flex h-[52px] items-center justify-center rounded-[80px] bg-brand-green text-[15px] font-medium text-white"
            >
              회원가입
            </a>
          </div>
        </div>
      )}

      <AlertBar />
    </>
  );
}

function AlertBar() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="relative bg-[#1E3428] text-[16px] leading-[1.4] text-white">
      <div className="mx-auto flex min-h-16 max-w-[1286px] items-center justify-center gap-3 px-14 py-0 pl-6 text-center sm:min-h-[79px] sm:gap-6">
        <span className="hidden sm:inline">뉴스레터를 구독하면, 매주 특별한 정원 소식을 받아 볼 수 있습니다.</span>
        <span className="sm:hidden">매주 특별한 정원 소식</span>
        <a
          href={`${SITE}/newsletter`}
          className="inline-flex items-center gap-2 whitespace-nowrap font-bold underline underline-offset-[3px]"
        >
          뉴스레터 구독하기
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </a>
        <button
          type="button"
          aria-label="공지 닫기"
          onClick={() => setDismissed(true)}
          className="absolute right-4 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center text-xl text-white/90"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
