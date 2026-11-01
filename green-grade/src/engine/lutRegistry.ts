// 프리셋 노드가 라이브러리 LUT를 이름(id)으로 가리킬 때 쓰는 연결점.
// 프리셋 모듈이 LUT 라이브러리를 직접 불러오면 순환 참조가 생기므로, LUT 라이브러리가 자신을 여기에 등록한다.

import type { CubeLut } from './lut';

let resolver: ((id: string, size?: number) => CubeLut) | null = null;

export function setLutResolver(f: (id: string, size?: number) => CubeLut) {
  resolver = f;
}

/** 라이브러리 LUT id → CubeLut. size를 주면 그 격자 크기로 (썸네일은 작게). LUT 라이브러리 모듈을 먼저 불러와야 한다. */
export function resolveLutRef(id: string, size?: number): CubeLut {
  if (!resolver) throw new Error('LUT 라이브러리가 아직 준비되지 않았습니다.');
  return resolver(id, size);
}
