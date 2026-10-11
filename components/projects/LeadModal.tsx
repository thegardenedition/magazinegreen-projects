'use client';

/**
 * components/projects/LeadModal.tsx
 * ------------------------------------------------------------------------
 * 프로젝트 상세의 「무료 견적 상담 신청」이 여는 모달. 폼 자체는 mg-biz 가 내려주는 한 벌을
 * iframe 으로 보여 준다(동의 문안·필드 계약을 복사하지 않기 위해). 폼은 높이와 완료를
 * parent.postMessage({ mgLeadForm: true, height, ok }) 로 알려 주므로, 보낸 곳이 mg-biz
 * 주소일 때만 받아 iframe 높이를 맞춘다.
 *
 * 입력 중 실수로 바깥을 눌러 긴 신청서를 날리지 않도록, 바깥 클릭으로는 닫히지 않는다
 * (닫기 버튼과 ESC 만).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LEAD_FORM_ORIGIN, buildLeadFormUrl } from '@/lib/leadForm';

const MIN_HEIGHT = 360;
const MAX_HEIGHT = 2400;

export default function LeadModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [height, setHeight] = useState(640);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const src = useMemo(
    () => (mounted ? buildLeadFormUrl(slug, window.location.pathname, window.location.search) : ''),
    [mounted, slug],
  );

  useEffect(() => {
    setMounted(true);
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, []);

  // 포털 내용은 mounted 가 true 가 된 다음 렌더에서야 생기므로, 초점은 그 뒤에 옮긴다.
  useEffect(() => {
    if (mounted) closeRef.current?.focus();
  }, [mounted]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== LEAD_FORM_ORIGIN) return;
      const data = e.data as { mgLeadForm?: boolean; height?: unknown } | null;
      if (!data || data.mgLeadForm !== true) return;
      if (typeof data.height === 'number' && Number.isFinite(data.height)) {
        setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(data.height))));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="정원 견적·상담 신청"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center sm:p-6"
    >
      <div className="relative flex max-h-[94dvh] w-full max-w-[560px] flex-col bg-white shadow-[0_28px_70px_-24px_rgba(0,0,0,0.45)] sm:max-h-[90dvh]">
        <div className="flex shrink-0 justify-end border-b border-black/[0.08]">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid h-12 w-12 place-items-center text-[#1c1c1a] transition-colors duration-300 hover:bg-black/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0B5345]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <iframe
            src={src}
            title="정원 견적·상담 신청"
            style={{ width: '100%', height, border: 0, display: 'block' }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
