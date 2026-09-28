'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import SafeImage from '@/components/ui/SafeImage';
import Link from 'next/link';
import type { ProjectData } from './ProjectDetail';
import ProjectCard from './ProjectCard';

/**
 * ProjectsExplorer.tsx
 * ------------------------------------------------------------------------
 * /projects 목록의 실제 기능 레이어 — 랜드진 Projects 참고 시안(2026-09-28,
 * 정본: projects-archive-mockup-2026-09-28.html)을 이식. 유형·회사·지역
 * 3축 드롭다운(패싯 카운트 포함) + 아카이브 큐레이션 2건 + 라디우스 0 격자.
 * 데스크톱은 헤더 아래 sticky 도구막대, 640px 미만은 「필터」 막대 + 바텀시트.
 */

type FilterKey = 'type' | 'studio' | 'region';
type Filters = Record<FilterKey, string | null>;

const CATEGORIES = ['주택정원', '옥상정원', '상업공간', '오픈스페이스'];
const REGIONS = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기',
  '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];
const PAGE_SIZE = 6;
const FILTER_META: Record<FilterKey, { ko: string; en: string }> = {
  type: { ko: '유형', en: 'Type' },
  studio: { ko: '회사', en: 'Studio' },
  region: { ko: '지역', en: 'Region' },
};

function accessor(key: FilterKey, p: ProjectData): string {
  if (key === 'type') return p.meta.category;
  if (key === 'studio') return p.meta.credit.design;
  return p.meta.region;
}

function matches(p: ProjectData, filters: Filters, except?: FilterKey): boolean {
  return (Object.keys(filters) as FilterKey[]).every(
    (k) => k === except || !filters[k] || accessor(k, p) === filters[k],
  );
}

function CaretIcon({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export default function ProjectsExplorer({ projects }: { projects: ProjectData[] }) {
  const typeOptions = useMemo(() => {
    const extra = Array.from(new Set(projects.map((p) => p.meta.category))).filter(
      (c) => CATEGORIES.indexOf(c) === -1,
    );
    return [...CATEGORIES, ...extra];
  }, [projects]);

  const studioOptions = useMemo(
    () => Array.from(new Set(projects.map((p) => p.meta.credit.design))).sort((a, b) => a.localeCompare(b, 'ko')),
    [projects],
  );

  const optionsFor = (key: FilterKey) => (key === 'type' ? typeOptions : key === 'studio' ? studioOptions : REGIONS);

  const [filters, setFilters] = useState<Filters>({ type: null, studio: null, region: null });
  const [studioQuery, setStudioQuery] = useState('');
  const [openDropdown, setOpenDropdown] = useState<FilterKey | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const barRef = useRef<HTMLDivElement>(null);

  const picks = useMemo(() => {
    const picked = projects.filter((p) => p.meta.pick);
    const rest = projects.filter((p) => !p.meta.pick);
    return [...picked, ...rest].slice(0, 2);
  }, [projects]);

  const filtered = useMemo(() => projects.filter((p) => matches(p, filters)), [projects, filters]);
  const activeFilters = (Object.entries(filters) as [FilterKey, string | null][]).filter(([, v]) => v);

  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [filters]);

  useEffect(() => {
    if (!openDropdown) return;
    const close = () => setOpenDropdown(null);
    document.addEventListener('click', close);
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpenDropdown(null);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onEsc);
    };
  }, [openDropdown]);

  useEffect(() => {
    if (!sheetOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sheetOpen]);

  function select(key: FilterKey, value: string | null) {
    setFilters((prev) => ({ ...prev, [key]: prev[key] === value ? null : value }));
    setOpenDropdown(null);
  }

  function reset() {
    setFilters({ type: null, studio: null, region: null });
    setStudioQuery('');
  }

  function OptionList({ filterKey }: { filterKey: FilterKey }) {
    const options = optionsFor(filterKey);
    const visible = filterKey === 'studio' && studioQuery ? options.filter((v) => v.includes(studioQuery)) : options;
    const totalForAll = projects.filter((p) => matches(p, filters, filterKey)).length;
    const list = (
      <>
        <button
          type="button"
          role="option"
          aria-selected={!filters[filterKey]}
          onClick={() => select(filterKey, null)}
          className="flex min-h-[46px] w-full items-center justify-between gap-4 border-b border-[#E4E4E0] px-4 text-left text-[15px] transition-colors duration-300 hover:bg-[#F3F2EE]"
        >
          <span>전체</span>
          <span className="text-[12px] tabular-nums text-[#ABABAB]">{totalForAll}</span>
        </button>
        {visible.length === 0 ? (
          <div className="px-4 py-5 text-[14px] text-[#787878]">검색 결과가 없습니다</div>
        ) : (
          <div className={filterKey === 'region' ? 'grid grid-cols-2' : ''}>
            {visible.map((value) => {
              const count = projects.filter((p) => matches(p, filters, filterKey) && accessor(filterKey, p) === value).length;
              const selected = filters[filterKey] === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={count === 0 && !selected}
                  onClick={() => select(filterKey, value)}
                  className={`flex min-h-[46px] w-full items-center justify-between gap-4 px-4 text-left text-[15px] transition-colors duration-300 ${
                    selected ? 'font-semibold text-brand-green' : count === 0 ? 'cursor-default text-[#ABABAB]' : 'hover:bg-[#F3F2EE]'
                  }`}
                >
                  <span>{value}</span>
                  <span className={`text-[12px] tabular-nums ${selected ? 'text-brand-green' : 'text-[#ABABAB]'}`}>{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </>
    );
    return (
      <>
        {filterKey === 'studio' && (
          <div className="sticky top-0 flex items-center gap-2.5 border-b border-[#E4E4E0] bg-white px-3.5 py-2 text-[#ABABAB]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={studioQuery}
              onChange={(e) => setStudioQuery(e.target.value)}
              placeholder="회사 이름 검색"
              aria-label="회사 검색"
              className="h-10 flex-1 bg-transparent text-[16px] text-[#121212] outline-none placeholder:text-[#ABABAB]"
            />
          </div>
        )}
        {list}
      </>
    );
  }

  function FilterButton({ filterKey }: { filterKey: FilterKey }) {
    const meta = FILTER_META[filterKey];
    const isOpen = openDropdown === filterKey;
    const value = filters[filterKey] || '전체';
    return (
      <div className="relative border-b border-[#E4E4E0] sm:border-b-0 sm:border-r sm:border-[#E4E4E0]" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setOpenDropdown((k) => (k === filterKey ? null : filterKey))}
          className="flex h-[60px] w-full items-center justify-between gap-3 px-0 text-left sm:h-[68px] sm:px-5"
        >
          <span>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#787878]">
              {meta.ko} <i className="font-normal not-italic normal-case tracking-normal text-[#ABABAB]">{meta.en}</i>
            </span>
            <span className={`mt-0.5 block max-w-[220px] truncate text-[17px] font-semibold tracking-[-0.01em] ${filters[filterKey] ? 'text-brand-green' : 'text-[#121212]'}`}>
              {value}
            </span>
          </span>
          <CaretIcon className={`h-[18px] w-[18px] flex-none text-[#ABABAB] transition-transform duration-500 ${isOpen ? 'rotate-180 text-brand-green' : ''}`} />
        </button>
        {isOpen && (
          <div role="listbox" aria-label={meta.ko} className="absolute left-0 top-full z-10 max-h-[min(60vh,440px)] min-w-full overflow-auto border border-[#121212] bg-white shadow-[0_28px_56px_-28px_rgba(11,83,69,0.22)] sm:min-w-[300px]">
            <OptionList filterKey={filterKey} />
          </div>
        )}
      </div>
    );
  }

  const visibleProjects = filtered.slice(0, shown);

  return (
    <>
      {/* 아카이브에서 고른 프로젝트 */}
      <div className="mb-14 grid gap-4 sm:grid-cols-2 sm:gap-6">
        {picks.map((p) => (
          <Link
            key={p.slug}
            href={`/projects/${p.slug}`}
            className="group relative isolate block aspect-video overflow-hidden bg-brand-green text-white"
          >
            <SafeImage
              src={p.meta.thumbnail}
              alt={p.meta.title}
              fill
              sizes="(min-width: 640px) 48vw, 100vw"
              className="scale-[1.02] object-cover opacity-55 mix-blend-luminosity transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06] group-hover:opacity-70"
            />
            <div className="absolute inset-0 z-[1] bg-gradient-to-b from-[rgba(11,83,69,0.35)] to-[rgba(11,83,69,0.85)]" />
            <div className="relative z-[2] flex h-full flex-col justify-between p-5 sm:p-7">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-85">아카이브에서 고른 프로젝트</span>
              <div>
                <div className="max-w-[24ch] break-keep text-[20px] font-semibold leading-snug tracking-[-0.01em] sm:text-[24px]">{p.meta.title}</div>
                <div className="mt-2 text-[13px] opacity-80">
                  {p.meta.location} &mdash; {p.meta.category} &mdash; {p.meta.credit.design}
                </div>
              </div>
            </div>
            <span className="absolute bottom-5 right-5 grid h-10 w-10 place-items-center border border-white/50 text-[20px] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-0 group-hover:translate-x-1 group-hover:border-white group-hover:bg-white group-hover:text-brand-green">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
            </span>
          </Link>
        ))}
      </div>

      {/* 분류: 유형 · 회사 · 지역 */}
      <section aria-label="분류" className="sticky top-[110px] z-30 mb-12 border-t border-[#121212] border-b border-[#E4E4E0] bg-white/95 backdrop-blur-md lg:top-[128px]">
        <div ref={barRef} className="hidden sm:grid sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-stretch">
          <FilterButton filterKey="type" />
          <FilterButton filterKey="studio" />
          <FilterButton filterKey="region" />
          <div className="flex items-center gap-4 whitespace-nowrap py-0 pl-6 text-[14px] text-[#6E6E6E]">
            <span>
              <b className="font-semibold tabular-nums text-[#121212]">{filtered.length}</b>건
            </span>
            {activeFilters.length > 0 && (
              <button type="button" onClick={reset} className="text-[#787878] underline underline-offset-[3px] transition-colors duration-300 hover:text-brand-green">
                초기화
              </button>
            )}
          </div>
        </div>

        {activeFilters.length > 0 && (
          <div className="hidden flex-wrap items-center gap-2.5 border-t border-[#E4E4E0] py-2.5 text-[14px] text-[#6E6E6E] sm:flex">
            {activeFilters.map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-2 bg-brand-green/[0.08] px-2.5 py-1.5 font-medium text-brand-green">
                <i className="font-normal not-italic text-[#787878]">{FILTER_META[k].ko}</i>
                {v}
                <button type="button" aria-label={`${v} 해제`} onClick={() => select(k, null)} className="text-[16px] leading-none">
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}

        {/* 모바일 압축 바 */}
        <div className="flex h-14 items-center justify-between sm:hidden">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="inline-flex h-10 items-center gap-2.5 border border-[#121212] pl-3 pr-3.5 text-[14px] font-semibold"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="10" cy="17" r="2" />
            </svg>
            필터
            {activeFilters.length > 0 && (
              <span className="grid h-5 min-w-[20px] place-items-center bg-brand-green px-1.5 text-[12px] font-semibold text-white">
                {activeFilters.length}
              </span>
            )}
          </button>
          <span className="text-[14px] text-[#6E6E6E]">
            <b className="font-semibold tabular-nums text-[#121212]">{filtered.length}</b>건
          </span>
        </div>
      </section>

      {/* 모바일 필터 시트 */}
      <AnimatePresence>
        {sheetOpen && (
          <div className="fixed inset-0 z-[70] sm:hidden" role="dialog" aria-modal="true" aria-label="필터">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#121212]/45"
              onClick={() => setSheetOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col bg-white"
            >
              <div className="flex h-14 items-center justify-between border-b border-[#E4E4E0] pl-5 pr-2 text-[16px] font-semibold">
                <span>필터</span>
                <button type="button" aria-label="닫기" onClick={() => setSheetOpen(false)} className="grid h-11 w-11 place-items-center text-[22px]">
                  &times;
                </button>
              </div>
              <div className="flex-1 overflow-auto px-5 pb-2">
                {(['type', 'studio', 'region'] as FilterKey[]).map((key) => (
                  <div key={key} className="border-b border-[#E4E4E0] py-3.5">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#787878]">
                      {FILTER_META[key].ko} <i className="font-normal not-italic normal-case tracking-normal text-[#ABABAB]">{FILTER_META[key].en}</i>
                    </span>
                    <div className="mt-1.5">
                      <OptionList filterKey={key} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 border-t border-[#E4E4E0] px-5 py-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
                <button type="button" onClick={reset} className="h-[52px] border border-[#121212] px-[18px] text-[15px] font-semibold">
                  초기화
                </button>
                <button type="button" onClick={() => setSheetOpen(false)} className="h-[52px] flex-1 bg-brand-green text-[15px] font-semibold text-white">
                  {filtered.length}건 보기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 격자 */}
      {filtered.length === 0 ? (
        <p className="py-20 text-center text-[16px] text-[#787878]">조건에 맞는 프로젝트가 아직 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 sm:gap-x-7 sm:gap-y-12 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-16">
          {visibleProjects.map((project, i) => (
            <ProjectCard key={project.slug} project={project} index={i} />
          ))}
        </div>
      )}

      {shown < filtered.length && (
        <div className="flex justify-center pb-6 pt-16">
          <button
            type="button"
            onClick={() => setShown((s) => s + PAGE_SIZE)}
            className="inline-flex h-14 items-center gap-3 border border-[#121212] px-7 text-[15px] font-semibold transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.02] hover:bg-[#121212] hover:text-white active:scale-[0.98]"
          >
            더 보기
            <CaretIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
