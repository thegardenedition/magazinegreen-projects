'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { ProjectData } from './ProjectDetail';

/**
 * ProjectCard.tsx
 * ------------------------------------------------------------------------
 * /projects 목록 그리드에서 쓰이는 카드. 상세 페이지와 톤앤매너를 맞추기 위해
 * 같은 컬러 팔레트(딥그린 #1A4D2E · 오프화이트 #F9F9F7)와 세리프/산세리프
 * 믹스매치를 그대로 사용합니다. Double-bezel 카드 구조와 스프링 호버로
 * 프리미엄 감도를 더했습니다.
 */
export default function ProjectCard({
  project,
  index = 0,
}: {
  project: ProjectData;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay: (index % 3) * 0.08, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        href={`/projects/${project.slug}`}
        className="group block active:scale-[0.99]"
        style={{ transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <div className="overflow-hidden rounded-2xl bg-white p-1.5 ring-1 ring-black/[0.04] transition-shadow duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:shadow-[0_24px_48px_-20px_rgba(26,77,46,0.18)]">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#F9F9F7]">
            <Image
              src={project.meta.thumbnail}
              alt={project.meta.title}
              fill
              sizes="(min-width: 1024px) 33vw, 100vw"
              className="object-cover transition-transform duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
            />
          </div>

          <div className="px-3 pb-4 pt-4">
            <span className="text-[12.5px] font-medium tracking-wide text-[#1A4D2E] transition-colors group-hover:text-[#123a22]">
              {project.meta.category} · {project.meta.location}
            </span>
            <h3 className="mt-2 break-keep font-serif text-[18px] leading-snug text-[#1c1c1a]">
              {project.meta.title}
            </h3>
            <p className="mt-1.5 break-keep text-[13.5px] leading-relaxed text-[#8a8a84]">
              {project.meta.subtitle}
            </p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
