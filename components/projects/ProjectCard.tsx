'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { ReactElement } from 'react';
import type { ProjectData, ProjectSpec } from './ProjectDetail';

/**
 * ProjectCard.tsx
 * ------------------------------------------------------------------------
 * /projects 목록 그리드에서 쓰이는 카드. 상세 페이지와 톤앤매너를 맞추기 위해
 * 같은 컬러 팔레트(딥그린 #1A4D2E · 오프화이트 #F9F9F7)와 세리프/산세리프
 * 믹스매치를 그대로 사용합니다. size="lg"는 비대칭 벤토 그리드의 피처드
 * 카드용 변형으로, Double-Bezel 카드 구조와 실데이터 스펙 프리뷰를 더했습니다.
 *
 * 참고 응용: 집닥 시공사례 카드의 "여러 장 촬영" 인디케이터와 오늘의집
 * 집들이 카드의 작업자 크레딧 라인을, 매거진그린 톤(사각 배지 대신 캡슐,
 * 사진 대신 이니셜 배지)으로 바꿔 적용했습니다. 컷수는 실제 contentBlocks의
 * 이미지 블록 수(+히어로 1장)를 그대로 세어 보여주므로 데이터가 늘 정확합니다.
 */

const MINI_ICON: Partial<Record<ProjectSpec['icon'], ReactElement>> = {
  area: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M3.5 9h17M9 3.5v17" />
    </svg>
  ),
  duration: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" strokeLinecap="round" />
    </svg>
  ),
};

function PhotoCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-[10.5px] font-medium text-white backdrop-blur-sm">
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
        <circle cx="8.5" cy="10.5" r="1.5" />
        <path d="M20.5 15l-5-4.5-4 3.5-2.5-2L3.5 16" />
      </svg>
      {count}
    </span>
  );
}

export default function ProjectCard({
  project,
  index = 0,
  size = 'sm',
}: {
  project: ProjectData;
  index?: number;
  size?: 'lg' | 'sm';
}) {
  const isLg = size === 'lg';
  const previewSpecs = project.meta.specs.filter((s) => s.icon === 'area' || s.icon === 'duration');
  const photoCount = 1 + project.contentBlocks.filter((b) => b.type === 'image').length;
  const creditInitial = project.meta.credit.design.charAt(0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay: (index % 3) * 0.08, ease: [0.16, 1, 0.3, 1] }}
      className="h-full"
    >
      <Link
        href={`/projects/${project.slug}`}
        className="group block h-full active:scale-[0.99]"
        style={{ transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Double-bezel 외곽 셸 */}
        <div className="flex h-full flex-col overflow-hidden rounded-[1.75rem] bg-black/[0.04] p-1.5 ring-1 ring-black/[0.05] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1 group-hover:bg-black/[0.02] group-hover:shadow-[0_28px_60px_-24px_rgba(26,77,46,0.22)]">
          {/* Double-bezel 이너 코어 */}
          <div className="flex h-full flex-col overflow-hidden rounded-[calc(1.75rem-0.375rem)] bg-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)]">
            <div
              className={`relative w-full overflow-hidden bg-[#F3F2EE] ${isLg ? 'aspect-[16/11]' : 'aspect-[4/3]'}`}
            >
              <Image
                src={project.meta.thumbnail}
                alt={project.meta.title}
                fill
                sizes={isLg ? '(min-width: 768px) 58vw, 100vw' : '(min-width: 768px) 28vw, 100vw'}
                className="object-cover transition-transform duration-[700ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                priority={isLg && index === 0}
              />
              <div className="absolute left-4 top-4">
                <span className="inline-flex items-center rounded-full bg-white/85 px-3 py-1 text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#1A4D2E] backdrop-blur-sm">
                  {project.meta.category}
                </span>
              </div>
              <div className="absolute bottom-4 right-4">
                <PhotoCountBadge count={photoCount} />
              </div>
              {isLg && (
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/35 to-transparent" />
              )}
            </div>

            <div className={`flex flex-1 flex-col ${isLg ? 'px-6 pb-6 pt-5 sm:px-7 sm:pb-7' : 'px-4 pb-5 pt-4'}`}>
              <span className="text-[12px] text-[#8a8a84]">{project.meta.location}</span>
              <h3
                className={`mt-1.5 break-keep font-serif leading-snug text-[#1c1c1a] ${
                  isLg ? 'text-[24px] sm:text-[28px]' : 'text-[17px]'
                }`}
              >
                {project.meta.title}
              </h3>
              <p
                className={`mt-2 break-keep leading-relaxed text-[#8a8a84] ${
                  isLg ? 'text-[14.5px]' : 'text-[13px]'
                }`}
              >
                {project.meta.subtitle}
              </p>

              <span className="mt-3 flex items-center gap-1.5 text-[11px] text-[#a3a39c]">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#1A4D2E]/[0.08] text-[8.5px] font-medium text-[#1A4D2E]">
                  {creditInitial}
                </span>
                {project.meta.credit.design}
              </span>

              {isLg && previewSpecs.length > 0 && (
                <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-black/[0.06] pt-4 text-[12.5px] text-[#5a5a55]">
                  {previewSpecs.map((spec) => (
                    <span key={spec.label} className="flex items-center gap-1.5">
                      <span className="text-[#1A4D2E]">{MINI_ICON[spec.icon]}</span>
                      {spec.value}
                      {spec.unit}
                    </span>
                  ))}
                  <span className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#1A4D2E]/[0.08] text-[#1A4D2E] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5">
                    →
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
