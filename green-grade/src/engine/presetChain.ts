import { toUniforms, type GradeUniforms } from './color';
import { bakeCurves } from './curves';
import { maskUniform } from './mask';
import type { Preset } from './presets';

/** 프리셋의 노드들을 셰이더·CPU 기준 구현이 쓰는 값으로 */
export function chainOfPreset(p: Preset): GradeUniforms[] {
  return p.nodes.map((n) =>
    toUniforms(n.primary, {
      enabled: n.enabled,
      curves: bakeCurves(n.curves),
      lut: n.lut ? { lut: n.lut, intensity: n.lutIntensity } : null,
      mask: maskUniform(n.qualifier, n.window),
    }),
  );
}
