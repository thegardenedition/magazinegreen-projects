// 지금의 그레이드를 .cube 3D LUT로 굽기. CPU 기준 구현으로 격자점마다 계산한다.

import { gradeChain, linearToSrgb, srgbToLinear, type GradeUniforms, type Vec3 } from './color';
import type { CubeLut } from './lut';

/**
 * 창(Window)은 위치 정보라 LUT에 담을 수 없다.
 * - exclude: 창이 켜진 노드를 통째로 뺀다 (기본: 전체 인상을 바꾸지 않는다)
 * - ignore:  창만 무시하고 그 노드를 화면 전체에 적용한다
 * Qualifier는 색으로 정해지므로 그대로 LUT에 들어간다.
 */
export type WindowHandling = 'exclude' | 'ignore';

export const LUT_EXPORT_SIZES = [17, 33, 65] as const;

export function lutChain(chain: GradeUniforms[], mode: WindowHandling): GradeUniforms[] {
  return chain
    .filter((u) => u.enabled)
    .filter((u) => mode === 'ignore' || !u.mask?.window)
    .map((u) => (u.mask?.window ? { ...u, mask: u.mask.qualifier ? { ...u.mask, window: null } : null } : u));
}

/** 창이 켜진 노드 수 (LUT에 그대로 담기지 않는 노드) */
export const windowNodeCount = (chain: GradeUniforms[]) => chain.filter((u) => u.enabled && u.mask?.window).length;

/** 동기 버전: 작은 LUT를 바로 만들 때 (라이브러리의 정원 LUT 등) */
export function bakeGradeLutSync(chain: GradeUniforms[], size: number, mode: WindowHandling, name: string): CubeLut {
  const nodes = lutChain(chain, mode);
  const data = new Float32Array(size ** 3 * 4);
  const lin = (i: number) => srgbToLinear(i / (size - 1));
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        const out = gradeChain([lin(r), lin(g), lin(b)] as Vec3, nodes);
        const i = ((b * size + g) * size + r) * 4;
        for (let k = 0; k < 3; k++) data[i + k] = linearToSrgb(Math.min(1, Math.max(0, out[k])));
        data[i + 3] = 1;
      }
  return { name, size, data, domainMin: [0, 0, 0], domainMax: [1, 1, 1] };
}

/**
 * 격자 size³을 계산해 LUT로 만든다. 입력·출력 모두 sRGB 코드값(0–1).
 * onProgress가 있으면 B 평면 하나마다 이벤트 루프에 양보한다.
 */
export async function bakeGradeLut(
  chain: GradeUniforms[],
  size: number,
  mode: WindowHandling,
  name: string,
  onProgress?: (p: number) => void,
): Promise<CubeLut> {
  const nodes = lutChain(chain, mode);
  const data = new Float32Array(size ** 3 * 4);
  const lin = (i: number) => srgbToLinear(i / (size - 1));
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const out = gradeChain([lin(r), lin(g), lin(b)] as Vec3, nodes);
        const i = ((b * size + g) * size + r) * 4;
        for (let k = 0; k < 3; k++) data[i + k] = linearToSrgb(Math.min(1, Math.max(0, out[k])));
        data[i + 3] = 1;
      }
    }
    if (onProgress) {
      onProgress((b + 1) / size);
      await new Promise((res) => setTimeout(res, 0));
    }
  }
  return { name, size, data, domainMin: [0, 0, 0], domainMax: [1, 1, 1] };
}
