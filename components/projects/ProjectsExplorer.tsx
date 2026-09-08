'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ProjectData } from './ProjectDetail';
import ProjectCard from './ProjectCard';

/**
 * ProjectsExplorer.tsx
 * ------------------------------------------------------------------------
 * Supanova 프리미엄 패스 — /projects 목록의 실제 기능 레이어.
 * 실데이터 기반 통계 스트립, 카테고리 필터, 비대칭 벤토 그리드를 제공합니다.
 */

/* 정원 유형은 고정 분류다. 데이터에서 뽑아 쓰면 기사가 없는 유형이
   조용히 사라져, 이 아카이브가 무엇을 다루는지가 안 보인다. 네 개를 늘
   띄워 두고, 비어 있는 유형을 고르면 비었다고 알린다. */
const CATEGORIES = ['주택정원', '옥상정원', '상업공간', '오픈스페이스'];

function parseNumeric(value: string): number | null {
  const n = parseFloat(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/* "경기도 포천시" → "경기도", "서울 성동구 성수동" → "서울".
   광역 단위(첫 토막)로 묶어 센다. */
function regionOf(location: string): string {
  return (location || '').trim().split(/\s+/)[0] || '';
}

export default function ProjectsExplorer({ projects }: { projects: ProjectData[] }) {
  const categories = useMemo(() => {
    /* 고정 분류에 없는 값이 데이터에 있으면 뒤에 붙여 둔다 — 빠뜨리면 그
       프로젝트는 '전체'에서만 보이고 유형으로는 영영 찾을 수 없다. */
    const extra = Array.from(new Set(projects.map((p) => p.meta.category))).filter(
      (c) => CATEGORIES.indexOf(c) === -1,
    );
    return ['전체', ...CATEGORIES, ...extra];
  }, [projects]);

  const reduceMotion = useReducedMotion();
  const [activeCategory, setActiveCategory] = useState('전체');

  const stats = useMemo(() => {
    const areas = projects
      .flatMap((p) => p.meta.specs.filter((s) => s.icon === 'area'))
      .map((s) => parseNumeric(s.value))
      .filter((n): n is number => n !== null);
    const avgArea = areas.length
      ? Math.round(areas.reduce((a, b) => a + b, 0) / areas.length)
      : null;
    const regionCount = new Set(
      projects.map((p) => regionOf(p.meta.location)).filter(Boolean),
    ).size;
    const categoryCount = new Set(projects.map((p) => p.meta.category)).size;

    /* '평균 시공 기간'이 있던 자리를 지역 수가 대신한다. 몇 건 안 되는
       표본의 평균 공기는 정보라기보다 빈칸 채우기였다. */
    return [
      { label: '기록된 프로젝트', value: `${projects.length}`, unit: '건' },
      { label: '기록된 지역', value: `${regionCount}`, unit: '곳' },
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
            <span className="font-semibold tracking-[-0.02em] text-[26px] leading-none text-[#0B5345] sm:text-[30px]">
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
                  ? 'bg-[#0B5345] text-white shadow-[0_8px_20px_-8px_rgba(11,83,69,0.5)]'
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
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
          transition={{ duration: reduceMotion ? 0 : 0.4, ease: [0.16, 1, 0.3, 1] }}
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
