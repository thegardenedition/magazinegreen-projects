// 정원 프리셋 검증용 측정 도구 (테스트와 조정 스크립트가 함께 쓴다)

import { gradePixel8, srgbToLinear, type Vec3 } from '../../src/engine/color';
import { chainOfPreset } from '../../src/engine/presetChain';
import { GARDEN_SWATCHES, swatch } from '../../src/engine/gardenSwatches';
import { hslOf } from '../../src/engine/mask';
import type { Preset } from '../../src/engine/presets';

export const ASPECT = 1.5;

export const chainOf = chainOfPreset;

/** 프리셋을 적용한 8bit 결과 (견본의 보통 위치 v, 가로 가운데) */
export function apply(p: Preset, rgb: Vec3, v = 0.5): Vec3 {
  return gradePixel8(rgb, chainOf(p), { u: 0.5, v, aspect: ASPECT });
}

export interface Measure {
  rgb: Vec3;
  /** 색상각 (도) */
  hue: number;
  chroma: number;
  luma: number;
}

export function measure(rgb: Vec3): Measure {
  const h = hslOf(rgb.map((c) => srgbToLinear(c / 255)) as Vec3);
  return { rgb, hue: h.h * 360, chroma: h.chroma, luma: h.l };
}

/** 두 색상각의 차이 (−180–180) */
export const hueDiff = (a: number, b: number) => ((a - b + 540) % 360) - 180;

export function before(key: string) {
  return measure(swatch(key).rgb);
}

export function after(p: Preset, key: string, v = swatch(key).v) {
  return measure(apply(p, swatch(key).rgb, v));
}

/** 회색 계단의 루마가 단조 증가하는지 (계조 반전 없음) */
export function monotoneGreyRamp(p: Preset): boolean {
  let prev = -1;
  for (let g = 0; g <= 255; g += 5) {
    const l = measure(apply(p, [g, g, g])).luma;
    if (l < prev - 1e-6) return false;
    prev = l;
  }
  return true;
}

/** 측정 표 (조정할 때 보는 용도) */
export function report(p: Preset) {
  return GARDEN_SWATCHES.map((s) => {
    const b = before(s.key);
    const a = after(p, s.key);
    return {
      swatch: s.label,
      in: s.rgb.join(','),
      out: a.rgb.join(','),
      dHue: +hueDiff(a.hue, b.hue).toFixed(1),
      chroma: +(a.chroma / Math.max(b.chroma, 1e-6)).toFixed(2),
      luma: +(a.luma / Math.max(b.luma, 1e-6)).toFixed(2),
    };
  });
}
