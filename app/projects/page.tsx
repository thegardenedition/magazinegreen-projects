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
    <div className="min-h-screen bg-[#F9F9F7]">
      <header className="mx-auto max-w-[1180px] px-5 pt-20 pb-14 sm:px-8">
        <span className="text-[13px] font-medium tracking-wide text-[#1A4D2E]">Projects</span>
        <h1 className="mt-3 max-w-xl font-serif text-[32px] leading-[1.35] text-[#1c1c1a] sm:text-[40px]">
          정원이 완성되는 과정을 기록합니다
        </h1>
        <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[#5a5a55]">
          매거진그린이 직접 취재한 정원 프로젝트 아카이브. 각 사진 위 핀을 눌러 사용된
          식물과 자재 정보를 확인할 수 있습니다.
        </p>
      </header>

      <div className="mx-auto max-w-[1180px] px-5 pb-24 sm:px-8">
        <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </div>
    </div>
  );
}
