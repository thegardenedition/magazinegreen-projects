'use client';

import SafeImage from '@/components/ui/SafeImage';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import type { ProjectData } from './ProjectDetail';

/**
 * ProjectCard.tsx
 * ------------------------------------------------------------------------
 * /projects 목록 그리드 및 상세 페이지 "같은 회사 다른 프로젝트"에서 쓰이는
 * 카드. 랜드진 Projects 참고 시안(2026-09-28)을 그대로 이식 — 라디우스 0,
 * 사진 → 태그 줄(위치—유형—연도) → 제목 → 회사명 순.
 */

export default function ProjectCard({
  project,
  index = 0,
}: {
  project: ProjectData;
  index?: number;
}) {
  const reduceMotion = useReducedMotion();
  const year = new Date(project.meta.publishedAt).getFullYear();

  return (
    <motion.div
      layout={reduceMotion ? false : 'position'}
      initial={reduceMotion ? false : { opacity: 0, y: 24, filter: 'blur(4px)' }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={
        reduceMotion ? { duration: 0 } : { duration: 0.8, delay: (index % 6) * 0.07, ease: [0.16, 1, 0.3, 1] }
      }
      className="h-full"
    >
      <Link href={`/projects/${project.slug}`} className="group block h-full">
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
    </motion.div>
  );
}
