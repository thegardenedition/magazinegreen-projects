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
