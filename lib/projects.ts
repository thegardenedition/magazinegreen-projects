/**
 * lib/projects.ts
 * ------------------------------------------------------------------------
 * Headless CMS 목업 데이터 접근 레이어.
 *
 * 지금은 로컬 JSON 파일을 정적으로 import하지만, 실제 CMS(Webflow CMS API,
 * Sanity, Contentful 등)로 전환할 때는 이 파일의 두 함수 시그니처만 유지한 채
 * 내부 구현만 fetch 기반으로 바꾸면 됩니다 — 페이지/컴포넌트 코드는 전혀
 * 수정할 필요가 없습니다.
 */

import type { ProjectData } from '@/components/projects/ProjectDetail';

import naturalisticGarden from '@/data/projects/naturalistic-modern-house-garden.json';
import rooftopKitchenGarden from '@/data/projects/rooftop-kitchen-garden-seongsu.json';
import minimalCourtyard from '@/data/projects/minimal-courtyard-pocheon.json';

const ALL_PROJECTS = [
  naturalisticGarden,
  rooftopKitchenGarden,
  minimalCourtyard,
] as unknown as ProjectData[];

/** 발행일 최신순으로 정렬된 전체 프로젝트 목록 */
export function getAllProjects(): ProjectData[] {
  return [...ALL_PROJECTS].sort(
    (a, b) => new Date(b.meta.publishedAt).getTime() - new Date(a.meta.publishedAt).getTime(),
  );
}

/** slug으로 단일 프로젝트 조회. 없으면 undefined. */
export function getProjectBySlug(slug: string): ProjectData | undefined {
  return ALL_PROJECTS.find((p) => p.slug === slug);
}

/** 정적 생성(SSG)용 전체 slug 목록 */
export function getAllProjectSlugs(): string[] {
  return ALL_PROJECTS.map((p) => p.slug);
}

/**
 * 같은 카테고리(예: 주택정원)를 먼저 채우고, 그래도 자리가 남으면 같은 지역(location
 * 문자열 완전 일치)까지 넓혀서 관련 프로젝트를 고른다. 발행일 최신순으로 이미 정렬된
 * getAllProjects()를 그대로 쓴다.
 */
export function getRelatedProjects(slug: string, limit = 3): ProjectData[] {
  const current = getProjectBySlug(slug);
  if (!current) return [];

  const others = getAllProjects().filter((p) => p.slug !== slug);
  const sameCategory = others.filter((p) => p.meta.category === current.meta.category);
  const sameLocationOnly = others.filter(
    (p) => p.meta.category !== current.meta.category && p.meta.location === current.meta.location,
  );

  return [...sameCategory, ...sameLocationOnly].slice(0, limit);
}
