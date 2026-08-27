import Image from 'next/image';
import Link from 'next/link';
import type { ProjectData } from './ProjectDetail';

/**
 * ProjectCard.tsx
 * ------------------------------------------------------------------------
 * /projects 목록 그리드에서 쓰이는 카드. 상세 페이지와 톤앤매너를 맞추기 위해
 * 같은 컬러 팔레트(딥그린 #1A4D2E · 오프화이트 #F9F9F7)와 세리프/산세리프
 * 믹스매치를 그대로 사용합니다.
 */
export default function ProjectCard({ project }: { project: ProjectData }) {
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="group block overflow-hidden rounded-md bg-white transition-shadow hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-[#F9F9F7]">
        <Image
          src={project.meta.thumbnail}
          alt={project.meta.title}
          fill
          sizes="(min-width: 1024px) 33vw, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      </div>

      <div className="pt-4">
        <span className="text-[12.5px] font-medium tracking-wide text-[#1A4D2E]">
          {project.meta.category} · {project.meta.location}
        </span>
        <h3 className="mt-2 font-serif text-[18px] leading-snug text-[#1c1c1a]">
          {project.meta.title}
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#8a8a84]">
          {project.meta.subtitle}
        </p>
      </div>
    </Link>
  );
}
