'use client';

import Image, { type ImageProps } from 'next/image';
import { useState } from 'react';

/**
 * SafeImage.tsx
 * ------------------------------------------------------------------------
 * next/image 를 그대로 감싸되, 원본이 사라졌을 때 깨진 이미지 아이콘 대신
 * 중립적인 자리를 보여준다.
 *
 * [2026-09-08] 목업 데이터의 Unsplash 사진 12장 중 3장이 이미 404 였다
 * (실측 확인: photo-1601758064980 / 1621525046057 / 1595855759920).
 * 그 결과 라이브에서 핀 썸네일 두 개와 옥상 화단 본문 사진이 깨진 채로
 * 나오고 있었다. next/image 는 원본의 404 를 그대로 통과시킨다.
 *
 * 사진을 실사진으로 갈아끼워도 외부 이미지가 사라지는 일은 또 생기므로,
 * 데이터를 고치는 것과 별개로 이 방어막을 둔다.
 */
export default function SafeImage({ alt, className = '', onError, ...rest }: ImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        role="img"
        aria-label={alt}
        className={`flex items-center justify-center bg-[#F3F2EE] text-[#c2c2b8] ${
          rest.fill ? 'absolute inset-0' : ''
        } ${className}`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-1/4 max-h-8 min-h-4 w-auto"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.4" />
          <path d="M21 16l-5-4.5-4 3.5-2.5-2L3 17" />
        </svg>
      </span>
    );
  }

  return (
    <Image
      alt={alt}
      className={className}
      onError={(e) => {
        setFailed(true);
        onError?.(e);
      }}
      {...rest}
    />
  );
}
