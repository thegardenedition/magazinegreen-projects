import Link from 'next/link';

export default function ProjectNotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center bg-white px-5 text-center">
      <span className="text-[13px] font-medium tracking-wide text-[#1A4D2E]">404</span>
      <h1 className="mt-3 font-serif text-[26px] text-[#1c1c1a]">해당 프로젝트를 찾을 수 없습니다</h1>
      <p className="mt-3 text-[14px] text-[#8a8a84]">주소가 변경되었거나 삭제된 프로젝트일 수 있어요.</p>
      <Link
        href="/projects"
        className="mt-8 rounded-sm bg-[#1A4D2E] px-6 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
      >
        프로젝트 목록으로
      </Link>
    </div>
  );
}
