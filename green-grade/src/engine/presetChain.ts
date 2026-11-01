import { toUniforms, type GradeUniforms } from './color';
import { bakeCurves } from './curves';
import { resolveLutRef } from './lutRegistry';
import { maskUniform } from './mask';
import type { Preset } from './presets';

/** 프리셋의 노드들을 셰이더·CPU 기준 구현이 쓰는 값으로. lutSize: 이름으로 가리킨 LUT를 만들 격자 크기 (썸네일용) */
export function chainOfPreset(p: Preset, lutSize?: number): GradeUniforms[] {
  return p.nodes.map((n) =>
    toUniforms(n.primary, {
      enabled: n.enabled,
      curves: bakeCurves(n.curves),
      lut: n.lut || n.lutRef ? { lut: n.lut ?? resolveLutRef(n.lutRef!, lutSize), intensity: n.lutIntensity } : null,
      mask: maskUniform(n.qualifier, n.window),
    }),
  );
}
