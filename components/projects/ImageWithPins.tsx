'use client';

/**
 * ImageWithPins.tsx
 * ------------------------------------------------------------------------
 * 매거진그린 · 프로젝트 상세페이지 핵심 인터랙션 컴포넌트
 *
 * 오늘의집 '집들이'의 핫스팟 핀 UX를 매거진그린의 에디토리얼 톤으로 재해석한
 * 컴포넌트입니다. 이미지 위에 x/y 퍼센트 좌표로 배치된 핀을 렌더링하고,
 * 클릭/탭 시 썸네일 + 타이틀 + 설명 + CTA가 담긴 툴팁을 띄웁니다.
 *
 * 스와치 스트립: 오늘의집 집들이 상세페이지가 사진 아래 자재 썸네일을
 * 나열해 "이 사진에 뭐가 쓰였는지"를 한눈에 보여주는 패턴을, 우리가 이미
 * 갖고 있던 핀 데이터(식물/자재 큐레이션)로 그대로 구현했습니다. 정사각
 * 스와치 대신 라운드 칩 + 하단 타입 라벨("식물"/"자재")로 톤을 다르게
 * 가져가 매거진그린만의 표현으로 응용했습니다. 칩을 클릭하면 사진 위
 * 해당 핀 툴팁이 함께 열립니다.
 *
 * 설계 원칙
 * 1) 좌표 반응형: 핀은 컨테이너에 대한 상대 좌표(%)로 배치됩니다. 컨테이너가
 * CSS aspect-ratio로 원본 비율을 유지하기 때문에, 창 크기가 바뀌어도
 * 별도의 리사이즈 계산 없이 핀이 이미지 위 정확한 위치에 고정됩니다.
 * 2) 터치 친화성: 핀의 실제 히트박스는 44x44px 이상을 보장합니다(WCAG 2.5.5).
 * 3) 툴팁 오프스크린 보정: 1차로 핀의 % 좌표를 기준으로 좌/우/상/하 배치를
 * 휴리스틱하게 결정하고, 2차로 실제 렌더링된 툴팁의 DOMRect를 컨테이너
 * 영역과 비교해 필요한 만큼 px 단위로 미세 보정합니다.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';

/* ------------------------------------------------------------------------ */
/* Types                                                                     */
/* ------------------------------------------------------------------------ */

export type PinLinkType = 'plant-curation' | 'material-curation' | 'article';

export interface PinLink {
  type: PinLinkType;
  targetSlug: string;
  ctaLabel: string;
}

export interface PinDetail {
  /** 식물 핀 상세 정보 (type: 'plant'일 때) */
  scientificName?: string;
  commonName?: string;
  origin?: string;
  growthStatus?: string;
  sunlight?: string;
  heightRange?: string;
  /** 자재 핀 상세 정보 (type: 'material'일 때) */
  materialName?: string;
  finish?: string;
  thickness?: string;
  note?: string;
}

export interface Pin {
  id: string;
  type: 'plant' | 'material';
  /** 이미지 원본 기준 가로 위치, 0~100 사이의 퍼센트 값 */
  x: number;
  /** 이미지 원본 기준 세로 위치, 0~100 사이의 퍼센트 값 */
  y: number;
  title: string;
  shortDescription: string;
  thumbnail: string;
  link: PinLink;
  detail?: PinDetail;
}

interface ImageWithPinsProps {
  src: string;
  alt: string;
  pins?: Pin[];
  /** 예: "3 / 2" — CSS aspect-ratio 문법을 그대로 따릅니다 */
  aspectRatio?: string;
  caption?: string;
  /** 핀의 CTA를 눌렀을 때 상위 컴포넌트에서 라우팅 등을 처리하고 싶을 때 사용 */
  onPinNavigate?: (pin: Pin) => void;
  priority?: boolean;
  className?: string;
}

type HPlacement = 'left' | 'center' | 'right';
type VPlacement = 'top' | 'bottom';

/* ------------------------------------------------------------------------ */
/* Component                                                                 */
/* ------------------------------------------------------------------------ */

export default function ImageWithPins({
  src,
  alt,
  pins = [],
  aspectRatio = '3 / 2',
  caption,
  onPinNavigate,
  priority = false,
  className = '',
}: ImageWithPinsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [tooltipOffset, setTooltipOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const activePin = pins.find((p) => p.id === activePinId) ?? null;

  const closeTooltip = useCallback(() => {
    setActivePinId(null);
    setTooltipOffset({ x: 0, y: 0 });
  }, []);

  const togglePin = useCallback(
    (pinId: string) => {
      setActivePinId((prev) => (prev === pinId ? null : pinId));
      setTooltipOffset({ x: 0, y: 0 });
    },
    [],
  );

  /* 바깥 영역 클릭 / ESC 키로 툴팁 닫기 (모바일 탭 UX 포함) */
  useEffect(() => {
    if (!activePinId) return;

    function handlePointerDown(e: PointerEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        closeTooltip();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeTooltip();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePinId, closeTooltip]);

  /* 1차 배치(휴리스틱): 핀의 % 좌표만으로 좌/우/상/하 기본 정렬을 정한다.
     화면 왼쪽 가장자리 근처 핀은 툴팁을 오른쪽으로, 오른쪽 근처 핀은
     왼쪽으로, 위쪽 근처 핀은 아래로 펼쳐서 대부분의 경우 별도 보정 없이도
     화면 밖으로 나가지 않게 한다. */
  function getBasePlacement(pin: Pin): { h: HPlacement; v: VPlacement } {
    const h: HPlacement = pin.x < 28 ? 'left' : pin.x > 72 ? 'right' : 'center';
    const v: VPlacement = pin.y < 32 ? 'bottom' : 'top';
    return { h, v };
  }

  /* 2차 보정: 실제 렌더링된 툴팁 DOMRect를 컨테이너/뷰포트 경계와 비교해
     px 단위로 미세하게 밀어낸다. 휴리스틱만으로 못 잡는 좁은 컨테이너,
     모바일 가로폭 등의 예외 케이스를 보완한다. */
  useLayoutEffect(() => {
    if (!activePin || !tooltipRef.current || !containerRef.current) return;

    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const viewportPadding = 12;

    let dx = 0;
    let dy = 0;

    const leftBound = Math.max(containerRect.left, 0) + viewportPadding;
    const rightBound = Math.min(containerRect.right, window.innerWidth) - viewportPadding;
    const topBound = viewportPadding;
    const bottomBound = window.innerHeight - viewportPadding;

    if (tooltipRect.left < leftBound) {
      dx = leftBound - tooltipRect.left;
    } else if (tooltipRect.right > rightBound) {
      dx = rightBound - tooltipRect.right;
    }

    if (tooltipRect.top < topBound) {
      dy = topBound - tooltipRect.top;
    } else if (tooltipRect.bottom > bottomBound) {
      dy = bottomBound - tooltipRect.bottom;
    }

    if (dx !== 0 || dy !== 0) {
      setTooltipOffset({ x: dx, y: dy });
    }
  }, [activePin]);

  return (
    <figure className={className}>
      <div
        ref={containerRef}
        className="relative w-full overflow-visible rounded-sm bg-[#F9F9F7]"
        style={{ aspectRatio }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="(min-width: 1024px) 768px, 100vw"
          className="rounded-sm object-cover"
        />

        {pins.map((pin) => {
          const { h, v } = getBasePlacement(pin);
          const isActive = activePinId === pin.id;

          return (
            <div
              key={pin.id}
              className="absolute z-10"
              style={{
                left: `${pin.x}%`,
                top: `${pin.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {/* 핀 히트박스: 최소 44x44px 보장 */}
              <button
                type="button"
                aria-label={`${pin.title} 정보 보기`}
                aria-expanded={isActive}
                onClick={() => togglePin(pin.id)}
                onMouseEnter={() => setActivePinId(pin.id)}
                className="group relative flex h-11 w-11 items-center justify-center focus:outline-none"
              >
                {/* Pulsing ring: Tailwind 기본 ping 애니메이션 활용 (순수 CSS) */}
                <span
                  className={`absolute inline-flex h-6 w-6 rounded-full ${
                    pin.type === 'plant' ? 'bg-[#1A4D2E]/40' : 'bg-[#2E4F4F]/40'
                  } ${isActive ? '' : 'animate-ping'}`}
                />
                {/* 핀 본체 */}
                <span
                  className={`relative inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/70 shadow-md transition-transform duration-200 group-hover:scale-110 ${
                    pin.type === 'plant' ? 'bg-[#1A4D2E]' : 'bg-[#2E4F4F]'
                  } ${isActive ? 'scale-110' : ''}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3 w-3 text-white"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </button>

              {/* 툴팁 */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    ref={tooltipRef}
                    role="dialog"
                    initial={{ opacity: 0, scale: 0.94, y: v === 'top' ? 6 : -6 }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      x: tooltipOffset.x,
                      y: tooltipOffset.y,
                    }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    className={`absolute z-20 w-64 overflow-hidden rounded-md border border-black/5 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] ${
                      v === 'top' ? 'bottom-full mb-3' : 'top-full mt-3'
                    } ${
                      h === 'left'
                        ? 'left-0'
                        : h === 'right'
                          ? 'right-0'
                          : 'left-1/2 -translate-x-1/2'
                    }`}
                  >
                    <div className="relative h-28 w-full bg-[#F9F9F7]">
                      <Image
                        src={pin.thumbnail}
                        alt={pin.title}
                        fill
                        sizes="256px"
                        className="object-cover"
                      />
                      <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium tracking-wide text-[#1A4D2E]">
                        {pin.type === 'plant' ? '식물 큐레이션' : '조경 자재'}
                      </span>
                    </div>

                    <div className="p-3.5">
                      <h4 className="font-serif text-[15px] leading-snug text-[#1c1c1a]">
                        {pin.title}
                      </h4>
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#5a5a55]">
                        {pin.shortDescription}
                      </p>

                      <button
                        type="button"
                        onClick={() => onPinNavigate?.(pin)}
                        className="mt-3 flex w-full items-center justify-between rounded-sm bg-[#F9F9F7] px-3 py-2 text-[12.5px] font-medium text-[#1A4D2E] transition-colors hover:bg-[#1A4D2E] hover:text-white"
                      >
                        {pin.link.ctaLabel}
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {pins.length > 0 && (
        <div
          className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="이 사진에 담긴 식물·자재"
        >
          {pins.map((pin) => {
            const isActive = activePinId === pin.id;
            return (
              <button
                key={`swatch-${pin.id}`}
                type="button"
                onClick={() => togglePin(pin.id)}
                onMouseEnter={() => setActivePinId(pin.id)}
                aria-label={`${pin.title} 정보 보기`}
                aria-pressed={isActive}
                className={`group relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#F9F9F7] ring-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  isActive
                    ? 'ring-2 ring-[#1A4D2E] ring-offset-2 ring-offset-white'
                    : 'ring-black/[0.06] hover:ring-black/[0.16]'
                }`}
              >
                <Image src={pin.thumbnail} alt={pin.title} fill sizes="56px" className="object-cover" />
                <span
                  className={`absolute inset-x-0 bottom-0 py-[3px] text-center text-[8.5px] font-medium tracking-wide text-white ${
                    pin.type === 'plant' ? 'bg-[#1A4D2E]/85' : 'bg-[#2E4F4F]/85'
                  }`}
                >
                  {pin.type === 'plant' ? '식물' : '자재'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {caption && (
        <figcaption className="mt-3 text-center text-[13px] leading-relaxed text-[#8a8a84]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
