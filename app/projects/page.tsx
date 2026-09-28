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
    <div className="bg-white">
      <header className="mx-auto max-w-[1280px] px-6 pb-10 pt-14 sm:px-10 sm:pb-14 sm:pt-22 lg:px-12">
        <h1 className="text-[44px] font-bold leading-[1.05] tracking-[-0.03em] text-[#121212] sm:text-[64px] lg:text-[80px]">
          프로젝트
        </h1>
        <p className="mt-4 max-w-[56ch] break-keep text-[16px] leading-relaxed text-[#6E6E6E] sm:text-[17px]">
          매거진 그린이 기록한 정원·조경 프로젝트입니다. 유형·회사·지역으로 찾아보세요.
        </p>
      </header>

      <div className="mx-auto max-w-[1280px] px-6 pb-28 sm:px-10 lg:px-12">
        <ProjectsExplorer projects={projects} />
      </div>
    </div>
  );
}
