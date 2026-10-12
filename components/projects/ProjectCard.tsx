'use client';

import { useState } from 'react';
import SafeImage from '@/components/ui/SafeImage';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import type { ProjectData } from './ProjectDetail';
import { buildMapLink } from '@/lib/mapLink';
import { openSavedView, toggleScrap, useScrapped } from '@/lib/scraps';
import { showToast } from '@/components/ui/Toast';

/**
 * ProjectCard.tsx
 * ------------------------------------------------------------------------
 * /projects 목록 그리드 및 상세 페이지 "같은 회사 다른 프로젝트"에서 쓰이는
 * 카드. 랜드진 Projects 참고 시안(2026-09-28)을 그대로 이식 — 라디우스 0,
 * 사진 → 태그 줄(위치—유형—연도) → 제목 → 회사명 순.
 *
 * 2026-10-12 랜딩 업그레이드 1단계: 사진 아래쪽에 「지도에서 보기 · 저장」 막대를 올렸다.
 * 마우스가 있는 기기에서는 카드에 올렸을 때(또는 키보드로 들어왔을 때) 아래서 올라오고,
 * 터치 기기에서는 호버가 없으므로 항상 보인다. 막대는 링크 바깥에 둔다(링크 안에
 * 버튼·링크를 넣으면 안 되기 때문).
 */

function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] flex-none" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z" />
      <circle cx="12" cy="11" r="2.2" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-[17px] w-[17px] flex-none ${filled ? 'fill-current' : 'fill-none'}`} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20.5s-7.5-4.6-7.5-10.2a4.6 4.6 0 0 1 7.5-3.6 4.6 4.6 0 0 1 7.5 3.6c0 5.6-7.5 10.2-7.5 10.2Z" />
    </svg>
  );
}

export default function ProjectCard({
  project,
  index = 0,
}: {
  project: ProjectData;
  index?: number;
}) {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const { has } = useScrapped();
  const [popping, setPopping] = useState(false);
  const year = new Date(project.meta.publishedAt).getFullYear();
  const saved = has(project.slug);
  const { lat, lng } = project.meta;
  const hasCoords = typeof lat === 'number' && typeof lng === 'number';

  function onSave() {
    const on = toggleScrap(project.slug);
    if (on) {
      setPopping(true);
      showToast('저장했어요', { label: '저장한 프로젝트 보기', onClick: () => openSavedView((url) => router.push(url)) });
    } else {
      showToast('저장을 취소했어요');
    }
  }

  const actionBase =
    'flex h-11 flex-1 items-center justify-center gap-2 text-[13px] font-semibold text-[#121212] transition-colors duration-300 hover:bg-brand-green hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-green';

  return (
    <motion.div
      layout={reduceMotion ? false : 'position'}
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={
        reduceMotion ? { duration: 0 } : { duration: 0.8, delay: (index % 6) * 0.07, ease: [0.16, 1, 0.3, 1] }
      }
      className="group relative h-full"
    >
      <Link href={`/projects/${project.slug}`} className="block h-full">
        <div className="relative aspect-[4/3] overflow-hidden bg-[#F3F2EE]">
          <SafeImage
            src={project.meta.thumbnail}
            alt={project.meta.title}
            fill
            sizes="(min-width: 1024px) 32vw, (min-width: 640px) 46vw, 100vw"
            className="object-cover transition-transform duration-[1000ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
          />
          {project.meta.pick && (
            <span className="absolute left-0 top-0 bg-brand-green px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-white">
              편집부 선정
            </span>
          )}
        </div>
        <div className="mt-4 text-[14px] leading-relaxed text-brand-green">
          {project.meta.location}
          <span className="px-1.5 text-[#ABABAB]">&mdash;</span>
          {project.meta.category}
          <span className="px-1.5 text-[#ABABAB]">&mdash;</span>
          {year}
        </div>
        <h3 className="mt-1.5 break-keep text-[19px] font-semibold leading-[1.35] tracking-[-0.015em] text-[#1c1c1a] transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:text-brand-green lg:text-[21px]">
          {project.meta.title}
        </h3>
        <div className="mt-1.5 text-[14px] text-[#787878]">
          by <b className="font-medium text-[#6E6E6E]">{project.meta.credit.design}</b>
        </div>
      </Link>

      {/* 행동 막대: 사진 영역(4:3)과 같은 크기의 투명 덮개 안에서만 클릭을 받는다. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[4/3] overflow-hidden">
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex bg-white/[0.97] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-focus-within:translate-y-0 group-hover:translate-y-0 [@media(hover:hover)_and_(pointer:fine)]:translate-y-[101%]">
          {hasCoords && (
            <a href={buildMapLink(lat, lng, 'list')} className={actionBase} aria-label={`${project.meta.title} 지도에서 보기`}>
              <MapPinIcon />
              지도에서 보기
            </a>
          )}
          <button
            type="button"
            onClick={onSave}
            aria-pressed={saved}
            aria-label={saved ? `${project.meta.title} 저장 취소` : `${project.meta.title} 저장`}
            className={`${actionBase} ${hasCoords ? 'border-l border-[#E4E4E0]' : ''} ${saved ? 'text-brand-green' : ''}`}
          >
            <span className={popping ? 'animate-heart-pop' : ''} onAnimationEnd={() => setPopping(false)}>
              <HeartIcon filled={saved} />
            </span>
            {saved ? '저장됨' : '저장'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
