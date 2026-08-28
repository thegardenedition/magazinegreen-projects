'use client';

/**
 * ProjectDetail.tsx
 * ------------------------------------------------------------------------
 * 매거진그린 · [Projects] 상세페이지 메인 레이아웃
 *
 * 오늘의집 '집들이'의 직관적 정보 구조(브레드크럼 → 스펙 요약 → 이미지
 * 스토리텔링 → 플로팅 목차/액션바)를 매거진그린의 화이트 & 딥그린 에디토리얼
 * 톤앤매너로 재구성했습니다. Supanova 프리미엄 패스에서 스크롤 연동 리딩
 * 프로그레스바(신규 기능), Double-Bezel 히어로/스펙그리드, 썸네일 포함
 * 이전·다음 프로젝트 프리뷰 카드를 더했습니다.
 *
 * 정렬 수정: 브레드크럼/스펙그리드 섹션이 본문(article+TOC) 섹션과 다른
 * max-width 컨테이너를 각자 mx-auto로 가운데 정렬하던 탓에 좌측 기준선이
 * 어긋나 있었습니다. 이제 두 섹션 모두 동일한 max-w-[1180px] 외곽 컨테이너를
 * 공유해 좌측 축이 정확히 일치합니다.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useScroll, useSpring } from 'framer-motion';
import ImageWithPins, { type Pin } from './ImageWithPins';
import { getProjectBySlug } from '@/lib/projects';

/* ------------------------------------------------------------------------ */
/* Types — CMS 데이터 스키마                                                  */
/* ------------------------------------------------------------------------ */

export interface ProjectSpec {
  icon: 'area' | 'duration' | 'style' | 'completed';
  label: string;
  value: string;
  unit: string;
}

export interface ProjectCredit {
  design: string;
  photography: string;
  editor: string;
}

export interface ProjectMeta {
  title: string;
  subtitle: string;
  category: string;
  location: string;
  heroImage: string;
  thumbnail: string;
  publishedAt: string;
  readingTime: number;
  credit: ProjectCredit;
  specs: ProjectSpec[];
}

export interface ProjectNavLink {
  slug: string;
  title: string;
}

export interface ProjectNavigation {
  prev?: ProjectNavLink;
  next?: ProjectNavLink;
}

export type ContentBlock =
  | { type: 'text'; id: string; heading?: string; body: string }
  | {
      type: 'image';
      id: string;
      heading?: string;
      src: string;
      alt: string;
      aspectRatio?: string;
      caption?: string;
      pins?: Pin[];
    }
  | { type: 'quote'; id: string; heading?: string; text: string; author?: string }
  | {
      type: 'video';
      id: string;
      heading?: string;
      provider: 'youtube';
      videoId: string;
      title: string;
      caption?: string;
    };

export interface ProjectData {
  id: string;
  slug: string;
  meta: ProjectMeta;
  navigation: ProjectNavigation;
  contentBlocks: ContentBlock[];
}

interface ProjectDetailProps {
  data: ProjectData;
  /** 핀 CTA 클릭 시 라우팅 등을 상위에서 처리하고 싶을 때 */
  onPinNavigate?: (pin: Pin) => void;
}

/* ------------------------------------------------------------------------ */
/* Small presentational helpers                                             */
/* ------------------------------------------------------------------------ */

const SPEC_ICON: Record<ProjectSpec['icon'], ReactElement> = {
  area: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M3.5 9h17M9 3.5v17" />
    </svg>
  ),
  duration: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" strokeLinecap="round" />
    </svg>
  ),
  style: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path d="M12 3c2 3 6 4.5 6 9a6 6 0 0 1-12 0c0-4.5 4-6 6-9Z" strokeLinejoin="round" />
      <path d="M12 13v8" strokeLinecap="round" />
    </svg>
  ),
  completed: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.5l2.4 2.4L15.5 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

function ReadingProgressBar() {
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 26, mass: 0.3 });

  return (
    <motion.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-40 h-[3px] origin-left bg-[#1A4D2E]"
      style={{ scaleX: progress }}
    />
  );
}

function Breadcrumb({ category }: { category: string }) {
  return (
    <nav aria-label="breadcrumb" className="mb-8 flex items-center gap-1.5 text-[13px] text-[#8a8a84]">
      <Link href="/" className="transition-colors duration-300 hover:text-[#1A4D2E]">
        Home
      </Link>
      <span className="text-[#c9c9c2]">/</span>
      <Link href="/projects" className="transition-colors duration-300 hover:text-[#1A4D2E]">
        Projects
      </Link>
      <span className="text-[#c9c9c2]">/</span>
      <span className="font-medium text-[#1A4D2E]">{category}</span>
    </nav>
  );
}

function SpecGrid({ specs }: { specs: ProjectSpec[] }) {
  return (
    <div className="rounded-[1.5rem] bg-black/[0.04] p-1.5 ring-1 ring-black/[0.05]">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[calc(1.5rem-0.375rem)] bg-black/[0.06] sm:grid-cols-4">
        {specs.map((spec) => (
          <div
            key={spec.label}
            className="group flex flex-col items-center gap-2 bg-white px-4 py-6 text-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:z-10 hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),0_16px_40px_-16px_rgba(26,77,46,0.18)]"
          >
            <span className="text-[#1A4D2E] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110">
              {SPEC_ICON[spec.icon]}
            </span>
            <span className="text-[13px] text-[#8a8a84]">{spec.label}</span>
            <span className="font-serif text-[17px] text-[#1c1c1a]">
              {spec.value}
              {spec.unit && <span className="ml-0.5 text-[13px] text-[#8a8a84]">{spec.unit}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Intersection Observer 기반 활성 섹션 추적 훅 */
function useActiveSection(ids: string[]) {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    if (ids.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        // 뷰포트 상단 20%~하단 55% 사이에 걸린 섹션을 '현재 읽는 중'으로 간주
        rootMargin: '-20% 0px -55% 0px',
        threshold: 0,
      },
    );

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [ids]);

  return activeId;
}

function DesktopToc({
  items,
  activeId,
}: {
  items: { id: string; heading: string }[];
  activeId: string | null;
}) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="table of contents"
      className="sticky top-28 hidden max-w-[200px] flex-col gap-3 border-l border-black/[0.06] pl-5 lg:flex"
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={`relative text-[13px] leading-snug transition-colors duration-300 ${
              isActive ? 'font-medium text-[#1A4D2E]' : 'text-[#a3a39c] hover:text-[#5a5a55]'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="toc-indicator"
                className="absolute -left-[21px] top-0.5 h-4 w-[2px] bg-[#1A4D2E]"
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
            {item.heading}
          </a>
        );
      })}
    </nav>
  );
}

function MobileActionBar({
  isSaved,
  onToggleSave,
  onShare,
}: {
  isSaved: boolean;
  onToggleSave: () => void;
  onShare: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 rounded-t-2xl border-t border-black/[0.06] bg-white/90 shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.1)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-[520px] items-center justify-between gap-2 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onToggleSave}
          aria-pressed={isSaved}
          className="flex flex-1 flex-col items-center gap-1 text-[11px] text-[#5a5a55] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-90"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-5 w-5 transition-colors duration-300 ${isSaved ? 'fill-[#1A4D2E] text-[#1A4D2E]' : 'fill-none text-[#5a5a55]'}`}
            stroke="currentColor"
            strokeWidth={1.6}
          >
            <path d="M12 20.5s-7.5-4.6-7.5-10.2a4.6 4.6 0 0 1 7.5-3.6 4.6 4.6 0 0 1 7.5 3.6c0 5.6-7.5 10.2-7.5 10.2Z" />
          </svg>
          {isSaved ? '스크랩됨' : '스크랩'}
        </button>

        <span className="h-6 w-px bg-black/[0.06]" />

        <button
          type="button"
          onClick={onShare}
          className="flex flex-1 flex-col items-center gap-1 text-[11px] text-[#5a5a55] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-90"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <circle cx="18" cy="5" r="2.5" />
            <circle cx="6" cy="12" r="2.5" />
            <circle cx="18" cy="19" r="2.5" />
            <path d="M8.2 10.7l7.6-4.4M8.2 13.3l7.6 4.4" />
          </svg>
          공유하기
        </button>

        <span className="h-6 w-px bg-black/[0.06]" />

        <Link
          href="/projects"
          className="flex flex-1 flex-col items-center gap-1 text-[11px] text-[#5a5a55] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-90"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
          목록으로
        </Link>
      </div>
    </div>
  );
}

function NavPreviewCard({
  direction,
  project,
  fallbackTitle,
}: {
  direction: 'prev' | 'next';
  project?: ProjectData;
  fallbackTitle?: string;
}) {
  if (!project && !fallbackTitle) return <div className="hidden sm:block" />;

  const title = project?.meta.title ?? fallbackTitle ?? '';
  const slug = project?.slug;
  const isPrev = direction === 'prev';

  const content = (
    <div className="group flex h-full flex-col overflow-hidden rounded-[1.5rem] bg-black/[0.04] p-1.5 ring-1 ring-black/[0.05] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:shadow-[0_24px_50px_-24px_rgba(26,77,46,0.22)]">
      <div className="flex h-full flex-col overflow-hidden rounded-[calc(1.5rem-0.375rem)] bg-white">
        {project && (
          <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#F3F2EE]">
            <Image
              src={project.meta.thumbnail}
              alt={title}
              fill
              sizes="(min-width: 640px) 50vw, 100vw"
              loading="lazy"
              className="object-cover transition-transform duration-[700ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
            />
          </div>
        )}
        <div className={`flex flex-1 flex-col gap-1.5 px-5 py-5 ${isPrev ? '' : 'sm:items-end sm:text-right'}`}>
          <span className="text-[11px] uppercase tracking-[0.12em] text-[#8a8a84]">
            {isPrev ? '이전 프로젝트' : '다음 프로젝트'}
          </span>
          <span
            className={`flex items-center gap-1.5 break-keep font-serif text-[16px] leading-snug text-[#1c1c1a] transition-colors duration-300 group-hover:text-[#1A4D2E] ${
              isPrev ? '' : 'sm:flex-row-reverse'
            }`}
          >
            <span
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1A4D2E]/[0.08] text-[#1A4D2E] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isPrev ? 'group-hover:-translate-x-0.5' : 'group-hover:translate-x-0.5'
              }`}
            >
              {isPrev ? '←' : '→'}
            </span>
            {title}
          </span>
        </div>
      </div>
    </div>
  );

  return slug ? (
    <Link href={`/projects/${slug}`} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}

/* ------------------------------------------------------------------------ */
/* Content block renderer                                                    */
/* ------------------------------------------------------------------------ */

const revealTransition = { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const };
const revealInitial = { opacity: 0, y: 24, filter: 'blur(4px)' };
const revealAnimate = { opacity: 1, y: 0, filter: 'blur(0px)' };

function ContentBlockRenderer({
  block,
  onPinNavigate,
}: {
  block: ContentBlock;
  onPinNavigate?: (pin: Pin) => void;
}) {
  switch (block.type) {
    case 'text':
      return (
        <motion.section
          id={block.id}
          className="scroll-mt-28 py-6"
          initial={revealInitial}
          whileInView={revealAnimate}
          viewport={{ once: true, margin: '-100px' }}
          transition={revealTransition}
        >
          {block.heading && (
            <h2 className="mb-5 text-balance break-keep font-serif text-[22px] leading-snug text-[#1c1c1a] sm:text-[26px]">
              {block.heading}
            </h2>
          )}
          <div
            className="space-y-5 break-keep text-[16px] leading-[1.75] text-[#3a3a37] [&_p]:leading-[1.75]"
            dangerouslySetInnerHTML={{ __html: block.body }}
          />
        </motion.section>
      );

    case 'image':
      return (
        <motion.section
          id={block.id}
          className="scroll-mt-28 py-6"
          initial={revealInitial}
          whileInView={revealAnimate}
          viewport={{ once: true, margin: '-100px' }}
          transition={revealTransition}
        >
          {block.heading && (
            <h2 className="mb-5 text-balance break-keep font-serif text-[22px] leading-snug text-[#1c1c1a] sm:text-[26px]">
              {block.heading}
            </h2>
          )}
          <ImageWithPins
            src={block.src}
            alt={block.alt}
            aspectRatio={block.aspectRatio}
            caption={block.caption}
            pins={block.pins}
            onPinNavigate={onPinNavigate}
          />
        </motion.section>
      );

    case 'quote':
      return (
        <motion.section
          id={block.id}
          className="scroll-mt-28 py-10"
          initial={revealInitial}
          whileInView={revealAnimate}
          viewport={{ once: true, margin: '-100px' }}
          transition={revealTransition}
        >
          <blockquote className="border-l-2 border-[#1A4D2E] pl-6">
            <p className="break-keep font-serif text-[20px] italic leading-[1.7] text-[#1c1c1a] sm:text-[23px]">
              “{block.text}”
            </p>
            {block.author && (
              <cite className="mt-4 block text-[13px] not-italic text-[#8a8a84]">— {block.author}</cite>
            )}
          </blockquote>
        </motion.section>
      );

    case 'video':
      return (
        <motion.section
          id={block.id}
          className="scroll-mt-28 py-6"
          initial={revealInitial}
          whileInView={revealAnimate}
          viewport={{ once: true, margin: '-100px' }}
          transition={revealTransition}
        >
          {block.heading && (
            <h2 className="mb-5 text-balance break-keep font-serif text-[22px] leading-snug text-[#1c1c1a] sm:text-[26px]">
              {block.heading}
            </h2>
          )}
          <div className="relative w-full overflow-hidden rounded-sm bg-black" style={{ aspectRatio: '16 / 9' }}>
            <iframe
              src={`https://www.youtube.com/embed/${block.videoId}`}
              title={block.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          </div>
          {block.caption && (
            <p className="mt-3 text-center text-[13px] leading-relaxed text-[#8a8a84]">{block.caption}</p>
          )}
        </motion.section>
      );

    default:
      return null;
  }
}

/* ------------------------------------------------------------------------ */
/* Main component                                                            */
/* ------------------------------------------------------------------------ */

export default function ProjectDetail({ data, onPinNavigate }: ProjectDetailProps) {
  const { meta, navigation, contentBlocks } = data;
  const [isSaved, setIsSaved] = useState(false);
  const shareUrlRef = useRef<string>('');

  const tocItems = useMemo(
    () =>
      contentBlocks
        .filter((b): b is Extract<ContentBlock, { heading?: string }> => Boolean(b.heading))
        .map((b) => ({ id: b.id, heading: b.heading as string })),
    [contentBlocks],
  );
  const sectionIds = useMemo(() => contentBlocks.map((b) => b.id), [contentBlocks]);
  const activeSectionId = useActiveSection(sectionIds);

  const prevProject = navigation.prev ? getProjectBySlug(navigation.prev.slug) : undefined;
  const nextProject = navigation.next ? getProjectBySlug(navigation.next.slug) : undefined;

  useEffect(() => {
    shareUrlRef.current = window.location.href;
  }, []);

  async function handleShare() {
    const shareData = { title: meta.title, url: shareUrlRef.current };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        /* 사용자가 공유를 취소한 경우 조용히 무시 */
      }
    } else {
      await navigator.clipboard.writeText(shareUrlRef.current);
      alert('링크가 복사되었습니다.');
    }
  }

  return (
    <div className="bg-white pb-24 lg:pb-0">
      <ReadingProgressBar />

      {/* Hero */}
      <header className="relative">
        <div className="relative h-[52vh] min-h-[380px] w-full sm:h-[64vh]">
          <Image src={meta.heroImage} alt={meta.title} fill priority className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        </div>

        <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
          <div className="max-w-[880px]">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 -mt-24 rounded-[1.75rem] bg-black/[0.04] p-1.5 shadow-[0_28px_70px_-32px_rgba(26,77,46,0.28)] ring-1 ring-black/[0.05] sm:-mt-28"
            >
              <div className="rounded-[calc(1.75rem-0.375rem)] bg-white px-6 py-8 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] sm:px-10 sm:py-10">
                <span className="inline-flex items-center rounded-full bg-[#1A4D2E]/[0.08] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-[#1A4D2E]">
                  {meta.category}
                </span>
                <span className="ml-2 text-[13px] text-[#8a8a84]">{meta.location}</span>
                <h1 className="mt-3 text-balance break-keep font-serif text-[30px] leading-[1.35] text-[#1c1c1a] sm:text-[38px]">
                  {meta.title}
                </h1>
                <p className="mt-3 break-keep text-[15px] leading-relaxed text-[#5a5a55] sm:text-[17px]">
                  {meta.subtitle}
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-black/[0.06] pt-5 text-[13px] text-[#8a8a84]">
                  <span>디자인 {meta.credit.design}</span>
                  <span>사진 {meta.credit.photography}</span>
                  <span>글 {meta.credit.editor}</span>
                  <span className="ml-auto">
                    {meta.publishedAt} · {meta.readingTime}분 소요
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto max-w-[1180px] px-5 pt-10 sm:px-8">
        <div className="max-w-[880px]">
          <Breadcrumb category={meta.category} />
          <SpecGrid specs={meta.specs} />
        </div>
      </div>

      <div className="mx-auto flex max-w-[1180px] items-start gap-16 px-5 py-14 sm:px-8 sm:py-20">
        <article className="min-w-0 flex-1 max-w-[720px]">
          {contentBlocks.map((block) => (
            <ContentBlockRenderer key={block.id} block={block} onPinNavigate={onPinNavigate} />
          ))}

          {/* 이전/다음 프로젝트 프리뷰 카드 */}
          <nav className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <NavPreviewCard direction="prev" project={prevProject} fallbackTitle={navigation.prev?.title} />
            <NavPreviewCard direction="next" project={nextProject} fallbackTitle={navigation.next?.title} />
          </nav>
        </article>

        {/* Desktop 우측 플로팅 TOC */}
        <aside className="w-[200px] shrink-0">
          <DesktopToc items={tocItems} activeId={activeSectionId} />
        </aside>
      </div>

      {/* Mobile 하단 플로팅 액션바 */}
      <MobileActionBar isSaved={isSaved} onToggleSave={() => setIsSaved((v) => !v)} onShare={handleShare} />
    </div>
  );
}
