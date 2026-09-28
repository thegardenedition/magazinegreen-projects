/**
 * components/layout/Footer.tsx
 * ------------------------------------------------------------------------
 * 시안(projects-archive-mockup-2026-09-28.html)의 최소 푸터를 그대로 이식.
 */

const SITE = 'https://www.magazinegreen.co.kr';

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-[#E4E4E0] py-8 pb-12 text-[13px] text-[#787878]">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-7 gap-y-3 px-6 sm:px-10 lg:px-12">
        <div>© 2026 매거진 그린 · 프로젝트 등재 문의 projects@magazinegreen.co.kr</div>
        <nav aria-label="법적 고지" className="flex flex-wrap gap-5">
          <a href={`${SITE}/privacy-policy`} className="transition-colors duration-300 hover:text-brand-green">
            개인정보처리방침
          </a>
          <a href={`${SITE}/terms-of-service`} className="transition-colors duration-300 hover:text-brand-green">
            이용약관
          </a>
          <a href={`${SITE}/projects-submit`} className="transition-colors duration-300 hover:text-brand-green">
            프로젝트 등재 안내
          </a>
        </nav>
      </div>
    </footer>
  );
}
