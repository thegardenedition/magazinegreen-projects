import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAllProjectSlugs, getProjectBySlug } from '@/lib/projects';
import ProjectDetail from '@/components/projects/ProjectDetail';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** 빌드 시 모든 프로젝트 상세 페이지를 정적 생성(SSG) */
export function generateStaticParams() {
  return getAllProjectSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);

  if (!project) {
    return { title: '프로젝트를 찾을 수 없습니다' };
  }

  return {
    title: project.meta.title,
    description: project.meta.subtitle,
    openGraph: {
      title: project.meta.title,
      description: project.meta.subtitle,
      images: [{ url: project.meta.heroImage }],
    },
  };
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);

  if (!project) {
    notFound();
  }

  return <ProjectDetail data={project} />;
}
