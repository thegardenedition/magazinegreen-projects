'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ProjectData } from './ProjectDetail';
import ProjectCard from './ProjectCard';

/**
 * ProjectsExplorer.tsx
 * ------------------------------------------------------------------------
 * Supanova 프리미엄 패스 — /projects 목록의 실제 기능 레이어.
 * 실데이터 기반 통계 스트립, 카테고리 필터, 비대칭 벤토 그리드를 제공합니다.
 */

function parseNumeric(value: string): number | null {
  const n = parseFloat(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export default function ProjectsExplorer({ projects }: { projects: ProjectData[] }) {
  const categories = useMemo(() => {
    const set = new Set(projects.map((p) => p.meta.category));
    return ['전체', ...Array.from(set)];
  }, [projects]);

  const [activeCategory, setActiveCategory] = useState('전체');

  const stats = useMemo(() => {
    const durations = projects
      .flatMap((p) => p.meta.specs.filter((s) => s.icon === 'duration'))
      .map((s) => parseNumeric(s.value))
      .filter((n): n is number => n !== null);
    const areas = projects
      .flatMap((p) => p.meta.specs.filter((s) => s.icon === 'area'))
      .map((s) => parseNumeric(s.value))
      .filter((n): n is number => n !== null);
    const avgDuration = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;
    const avgArea = areas.length
      ? Math.round(areas.reduce((a, b) => a + b, 0) / areas.length)
      : null;
    const categoryCount = new Set(projects.map((p) => p.meta.category)).size;

    return [
      { label: '기록된 프로젝트', value: `${projects.length}`, unit: '건' },
      { label: '평균 시공 기간', value: avgDuration ? `${avgDuration}` : '—', unit: '일' },
      { label: '평균 부지 면적', value: avgArea ? `${avgArea}` : '—', unit: '㎡' },
      { label: '기록된 정원 유형', value: `${categoryCount}`, unit: '종' },
    ];
  }, [projects]);

  const filtered = useMemo(
    () =>
      activeCategory === '전체' ? projects : projects.filter((p) => p.meta.category === activeCategory),
    [projects, activeCategory],
  );

  const showBento = activeCategory === '전체' && filtered.length >= 3;
  const [featured, ...rest] = filtered;

  return (
    <>
      {/* 통계 스트립 — 실데이터 기반 */}
      <div className="mb-14 grid grid-cols-2 gap-px overflow-hidden rounded-[1.5rem] border border-black/[0.06] bg-black/[0.06] sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col items-start gap-1 bg-[#FDFBF7] px-5 py-6 sm:px-6">
            <span className="font-serif text-[26px] leading-none text-[#1A4D2E] sm:text-[30px]">
              {stat.value}
              <span className="ml-1 text-[13px] font-sans text-[#8a8a84]">{stat.unit}</span>
            </span>
            <span className="font-accent text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a8a84]">
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      {/* 카테고리 필터 */}
      <div className="mb-10 flex flex-wrap items-center gap-2">
        {categories.map((category) => {
          const isActive = category === activeCategory;
          return (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={`rounded-full px-4 py-2 text-[13px] font-medium transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isActive
                  ? 'bg-[#1A4D2E] text-white shadow-[0_8px_20px_-8px_rgba(26,77,46,0.5)]'
                  : 'bg-black/[0.04] text-[#5a5a55] hover:bg-black/[0.07]'
              }`}
            >
              {category}
            </button>
          );
        })}
      </div>

      {/* 벤토 그리드 / 필터 결과 그리드 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeCategory}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          {filtered.length === 0 ? (
            <p className="py-20 text-center text-[14px] text-[#8a8a84]">
              해당 카테고리의 프로젝트가 아직 없습니다.
            </p>
          ) : showBento ? (
            <div className="flex flex-col gap-5 md:flex-row md:gap-6">
              <div className="md:w-[58%]">
                <ProjectCard project={featured} index={0} size="lg" />
              </div>
              <div className="flex flex-col gap-5 md:w-[42%] md:gap-6">
                {rest.map((project, i) => (
                  <ProjectCard key={project.id} project={project} index={i + 1} size="sm" />
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2">
              {filtered.map((project, i) => (
                <ProjectCard key={project.id} project={project} index={i} size="sm" />
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
