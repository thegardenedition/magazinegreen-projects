'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * components/ui/Toast.tsx
 * ------------------------------------------------------------------------
 * 화면 아래에 잠깐 뜨는 알림. 공유 링크 복사를 alert() 창으로 알리던 것을 대체하고,
 * 저장했을 때 「저장한 프로젝트 보기」 같은 바로가기도 같이 쓴다.
 * layout.tsx 에 ToastHost 를 한 번만 두고, 어디서든 showToast() 로 띄운다.
 * 움직임은 위치·투명도만 쓰고, 「동작 줄이기」 설정은 globals.css 의 공통 규칙이 따른다.
 */

const TOAST_EVENT = 'mg:toast';

export type ToastAction = { label: string; onClick: () => void };

export function showToast(message: string, action?: ToastAction) {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, action } }));
}

export default function ToastHost() {
  const [toast, setToast] = useState<{ message: string; action?: ToastAction } | null>(null);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<{ message: string; action?: ToastAction }>).detail;
      window.clearTimeout(hideTimer.current);
      setVisible(false);
      setToast(detail);
      // 새로 그려진 다음 프레임에 보이게 해야 아래서 올라오는 전환이 걸린다.
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => setVisible(true)));
      hideTimer.current = window.setTimeout(() => setVisible(false), 4500);
    }
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      window.clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    // 모바일 상세의 하단 고정 막대(z-30) 위에 뜨도록 아래 여백을 둔다. 견적 모달(z-100)보다는 아래.
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[90] flex justify-center px-4 lg:bottom-8"
    >
      {toast && (
        <div
          aria-hidden={!visible}
          className={`flex max-w-full items-center gap-5 bg-[#121212] px-5 py-3.5 text-[14px] font-medium text-white shadow-[0_18px_40px_-20px_rgba(11,83,69,0.55)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            visible ? 'pointer-events-auto translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
        >
          <span className="break-keep">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                setVisible(false);
              }}
              className="whitespace-nowrap font-semibold underline underline-offset-4"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
