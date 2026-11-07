'use client';

import CinematicHero from '@/components/motion/CinematicHero';
import MaskReveal from '@/components/motion/MaskReveal';
import CountUp from '@/components/motion/CountUp';
import DepthPhoto from '@/components/motion/DepthPhoto';
import BeforeAfter from '@/components/motion/BeforeAfter';
import SafeImage from '@/components/ui/SafeImage';
import { SPRING } from '@/components/motion/tokens';
import { getAllProjects } from '@/lib/projects';

const zeta = (s: { stiffness: number; damping: number; mass: number }) =>
  (s.damping / (2 * Math.sqrt(s.stiffness * s.mass))).toFixed(2);

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B5345]">{children}</p>;
}

export default function MotionLab() {
  const projects = getAllProjects();
  const hero = projects[0]?.meta.heroImage ?? '';
  const imgs = projects.map((p) => p.meta.thumbnail);

  return (
    <div className="bg-white pb-28">
      <CinematicHero src={hero} alt="히어로 예시 사진" />

      <div className="mx-auto max-w-[960px] px-5 sm:px-8">
        <section className="relative z-10 -mt-24 border border-black/[0.06] bg-white px-6 py-8 shadow-[0_28px_70px_-32px_rgba(11,83,69,0.28)] sm:px-10">
          <Label>01 · CinematicHero + MaskReveal</Label>
          <h1 className="break-keep text-[30px] font-semibold leading-[1.35] tracking-[-0.02em] text-[#1c1c1a] sm:text-[38px]">
            <MaskReveal text="사진은 초점을 맞추듯 내려앉고, 제목은 행을 끌어올리듯 올라온다" delay={0.35} />
          </h1>
          <p className="mt-4 break-keep text-[15px] leading-relaxed text-[#5a5a55]">
            새로고침하면 셔터(clip-path)와 렌즈 정착(1.14→1배)이 다시 재생됩니다. 아래로 스크롤하면 사진이 화면보다 늦게 내려가며 어두워집니다.
          </p>
        </section>

        <section className="mt-20">
          <Label>02 · CountUp — 과감쇠 스프링(ζ {zeta(SPRING.count)}), 오버슈트 없음</Label>
          <div className="grid grid-cols-2 gap-px border border-black/[0.06] bg-black/[0.06] sm:grid-cols-4">
            {[
              ['부지 면적', '64', '㎡'],
              ['식재 수량', '1,280', '주'],
              ['시공 기간', '30', '일'],
              ['배수 구배', '2.5', '%'],
            ].map(([k, v, u]) => (
              <div key={k} className="flex flex-col items-center gap-2 bg-white px-4 py-7 text-center">
                <span className="text-[13px] text-[#8a8a84]">{k}</span>
                <span className="font-mono text-[22px] font-semibold tracking-[-0.02em] text-[#1c1c1a]">
                  <CountUp value={v} />
                  <span className="ml-0.5 font-sans text-[13px] text-[#8a8a84]">{u}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20">
          <Label>03 · BeforeAfter — 직접 조작 1:1 · 탭 점프 · 던지면 관성</Label>
          <BeforeAfter
            before={{ src: imgs[1] ?? hero, alt: '비교 예시 왼쪽 사진' }}
            after={{ src: imgs[2] ?? hero, alt: '비교 예시 오른쪽 사진' }}
            labels={['예시 A', '예시 B']}
            caption="작동 확인용 예시입니다. 서로 다른 프로젝트 사진이며 실제 시공 전후가 아닙니다. 실제 기사에는 같은 자리·같은 화각의 전후 사진만 씁니다."
          />
        </section>

        <section className="mt-20">
          <Label>04 · DepthPhoto — 액자는 고정, 사진만 포인터 반대로 · 반사광 (마우스 기기 전용)</Label>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {projects.map((p) => (
              <DepthPhoto
                key={p.slug}
                className="aspect-[4/3] bg-[#F3F2EE]"
                overlay={
                  <span className="absolute bottom-0 left-0 bg-white/95 px-3 py-2 text-[13px] font-semibold text-[#1c1c1a]">
                    {p.meta.location}
                  </span>
                }
              >
                <SafeImage src={p.meta.thumbnail} alt={p.meta.title} fill sizes="33vw" className="object-cover" />
              </DepthPhoto>
            ))}
          </div>
        </section>

        <section className="mt-20">
          <Label>스프링 토큰 — components/motion/tokens.ts</Label>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-black/10 text-[#8a8a84]">
                  <th className="py-2 pr-4 font-medium">이름</th>
                  <th className="py-2 pr-4 font-medium">k</th>
                  <th className="py-2 pr-4 font-medium">c</th>
                  <th className="py-2 pr-4 font-medium">m</th>
                  <th className="py-2 font-medium">ζ</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {Object.entries(SPRING).map(([name, s]) => (
                  <tr key={name} className="border-b border-black/[0.06]">
                    <td className="py-2 pr-4 font-sans font-semibold text-[#1c1c1a]">{name}</td>
                    <td className="py-2 pr-4">{s.stiffness}</td>
                    <td className="py-2 pr-4">{s.damping}</td>
                    <td className="py-2 pr-4">{s.mass}</td>
                    <td className="py-2">{zeta(s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
