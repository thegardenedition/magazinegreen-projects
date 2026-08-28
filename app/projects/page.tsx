import type { Metadata } from 'next';
import { getAllProjects } from '@/lib/projects';
import ProjectsExplorer from '@/components/projects/ProjectsExplorer';

export const metadata: Metadata = {
  title: 'Projects',
  description: '매거진그린이 기록한 정원 프로젝트 아카이브.',
};

export default function ProjectsPage() {
  const projects = getAllProjects();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FDFBF7]">
      {/* 앰비언트 뎁스 — 퍼페추얼 마이크로모션이 더해진 라디얼 메쉬 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-[-8%] h-[480px] w-[480px] animate-float-slow rounded-full bg-[radial-gradient(circle,rgba(26,77,46,0.08),transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[420px] left-[-12%] h-[380px] w-[380px] animate-float rounded-full bg-[radial-gradient(circle,rgba(46,79,79,0.06),transparent_70%)] blur-3xl"
      />

      <header className="relative mx-auto max-w-[1180px] px-5 pt-28 pb-16 sm:px-8 sm:pt-36 sm:pb-20 lg:pt-40">
        <span className="font-accent inline-flex items-center rounded-full bg-[#1A4D2E]/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#1A4D2E]">
          Projects Archive
        </span>
        <h1 className="mt-5 max-w-xl text-balance break-keep font-serif text-[34px] leading-snug text-[#1c1c1a] sm:text-[48px]">
          정원이 완성되는 과정을 기록합니다
        </h1>
        <p className="mt-4 max-w-lg break-keep text-[15px] leading-relaxed text-[#5a5a55] sm:text-[16px]">
          매거진그린이 직접 취재한 정원 프로젝트 아카이브. 각 사진 위 핀을 눌러 사용된
          식물과 자재 정보를 확인할 수 있습니다.
        </p>
      </header>

      <div className="relative mx-auto max-w-[1180px] px-5 pb-28 sm:px-8 sm:pb-36">
        <ProjectsExplorer projects={projects} />
      </div>
    </div>
  );
}
