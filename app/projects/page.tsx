import type { Metadata } from 'next';
import { getAllProjects } from '@/lib/projects';
import ProjectCard from '@/components/projects/ProjectCard';

export const metadata: Metadata = {
  title: 'Projects',
  description: '매거진그린이 기록한 정원 프로젝트 아카이브.',
};

export default function ProjectsPage() {
  const projects = getAllProjects();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F9F9F7]">
      {/* Ambient depth — subtle radial mesh, keeps the editorial palette intact */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-[-8%] h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(26,77,46,0.07),transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[380px] left-[-12%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(46,79,79,0.05),transparent_70%)] blur-3xl"
      />

      <header className="relative mx-auto max-w-[1180px] px-5 pt-20 pb-14 sm:px-8 sm:pt-28 sm:pb-20">
        <span className="inline-flex items-center rounded-full bg-[#1A4D2E]/[0.08] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-[#1A4D2E]">
          Projects
        </span>
        <h1 className="mt-5 max-w-xl text-balance break-keep font-serif text-[32px] leading-[1.35] text-[#1c1c1a] sm:text-[44px]">
          정원이 완성되는 과정을 기록합니다
        </h1>
        <p className="mt-4 max-w-lg break-keep text-[15px] leading-relaxed text-[#5a5a55] sm:text-[16px]">
          매거진그린이 직접 취재한 정원 프로젝트 아카이브. 각 사진 위 핀을 눌러 사용된
          식물과 자재 정보를 확인할 수 있습니다.
        </p>
      </header>

      <div className="relative mx-auto max-w-[1180px] px-5 pb-24 sm:px-8 sm:pb-32">
        <div className="grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project, index) => (
            <ProjectCard key={project.id} project={project} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
