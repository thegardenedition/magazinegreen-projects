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

/**
 * [JSON-LD] 검색엔진이 이 페이지를 기사(Article)로 이해하도록 구조화 데이터를 심는다.
 * 전부 빌드 시점 정적 JSON(프로젝트 데이터)에서 온 값이라 사용자 입력이 섞일 일이
 * 없지만, 문자열에 우연히 "</script>"가 들어 있어도 태그가 깨지지 않도록 "<"만
 * 이스케이프해 둔다.
 */
function projectJsonLd(project: NonNullable<ReturnType<typeof getProjectBySlug>>) {
  const url = `https://projects.magazinegreen.co.kr/projects/${project.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: project.meta.title,
    description: project.meta.subtitle,
    image: [project.meta.heroImage],
    datePublished: project.meta.publishedAt,
    author: { '@type': 'Person', name: project.meta.credit.editor },
    publisher: { '@type': 'Organization', name: 'MAGAZINE GREEN', url: 'https://magazinegreen.co.kr' },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    articleSection: project.meta.category,
  };
  return JSON.stringify(jsonLd).replace(/</g, '\\u003c');
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);

  if (!project) {
    notFound();
  }

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger -- 빌드 시점 정적 데이터만 들어가는 JSON-LD 스크립트다.
        dangerouslySetInnerHTML={{ __html: projectJsonLd(project) }}
      />
      <ProjectDetail data={project} />
    </>
  );
}
