// 기본 프리셋 112종이 이름대로의 효과를 내는지 확인한다.
// (계조 반전·새 클리핑·피부 색상 같은 공통 안전선은 gardenPresets.test.ts가 112종 모두에 적용한다)

import { describe, expect, it } from 'vitest';
import { gradePixel8, srgbToLinear, type Vec3 } from '../../src/engine/color';
import { MAX_NODES } from '../../src/engine/constants';
import { GARDEN_SWATCHES, swatch } from '../../src/engine/gardenSwatches';
import { BUILTIN_PRESETS } from '../../src/engine/presetLibrary';
import { parsePreset, PRESET_CATEGORIES, serializePreset, type Preset } from '../../src/engine/presets';
import { after, apply, ASPECT, before, chainOf, measure } from './presetMetrics';

const preset = (name: string) => {
  const p = BUILTIN_PRESETS.find((x) => x.name === name);
  if (!p) throw new Error(`프리셋 없음: ${name}`);
  return p;
};
const chromaRatio = (p: Preset, key: string) => after(p, key).chroma / before(key).chroma;
const lumaRatio = (p: Preset, key: string) => after(p, key).luma / before(key).luma;
const grey = (p: Preset, g: number) => apply(p, [g, g, g]);
const rb = (c: Vec3) => c[0] - c[2];
const midSlope = (p: Preset) =>
  (measure(grey(p, 150)).luma - measure(grey(p, 100)).luma) / (measure([150, 150, 150]).luma - measure([100, 100, 100]).luma);
const colored = GARDEN_SWATCHES.filter((s) => before(s.key).chroma > 0.05).map((s) => s.key);
const avgChroma = (p: Preset) => colored.reduce((a, k) => a + chromaRatio(p, k), 0) / colored.length;

describe('라이브러리 구성', () => {
  it('112종, 분류별 정원 25 · 계절·날씨 10 · 보정 22 · 흑백 15 · 필름 15 · 시네마틱 15 · 크리에이티브 10', () => {
    expect(BUILTIN_PRESETS).toHaveLength(112);
    const count = (c: string) => BUILTIN_PRESETS.filter((p) => p.category === c).length;
    expect(PRESET_CATEGORIES.map(([c]) => count(c))).toEqual([25, 10, 22, 15, 15, 15, 10]);
  });

  it('효과를 담은 프리셋은 효과 값이 저장 형식으로 왕복한다', () => {
    const withFx = BUILTIN_PRESETS.filter((p) => p.detail);
    expect(withFx.length).toBeGreaterThanOrEqual(15);
    for (const p of withFx) expect(parsePreset(serializePreset(p)).detail, p.name).toEqual(p.detail);
  });

  it('이름이 겹치지 않고, 설명이 있고, 노드 수 제한을 지킨다', () => {
    expect(new Set(BUILTIN_PRESETS.map((p) => p.name)).size).toBe(BUILTIN_PRESETS.length);
    for (const p of BUILTIN_PRESETS) {
      expect(p.description, p.name).toBeTruthy();
      expect(p.nodes.length, p.name).toBeLessThanOrEqual(MAX_NODES);
    }
  });

  it.each(BUILTIN_PRESETS.map((p) => [p.name, p] as const))('%s: 저장 형식으로 왕복하고 실제로 색을 바꾼다', (_n, p) => {
    const back = parsePreset(serializePreset(p));
    expect(back.nodes.map((n) => n.name)).toEqual(p.nodes.map((n) => n.name));
    // 창(비네트 등)이 있는 프리셋은 가장자리에서만 바뀌므로 모서리 위치도 본다
    const chain = chainOf(back);
    const changed = GARDEN_SWATCHES.some((s) =>
      [0.5, 0.03].some((u) => gradePixel8(s.rgb, chain, { u, v: u, aspect: ASPECT }).some((v, i) => v !== s.rgb[i])),
    );
    expect(changed).toBe(true);
  });
});

describe('정원', () => {
  it('봄꽃 파스텔: 블랙이 들리고 대비가 낮아진다', () => {
    const p = preset('봄꽃 파스텔');
    expect(grey(p, 0)[1]).toBeGreaterThan(0);
    expect(midSlope(p)).toBeLessThan(1);
  });
  it('한여름 정오: 구름은 눌리고 18% 회색은 그대로', () => {
    const p = preset('한여름 정오');
    expect(lumaRatio(p, 'cloud')).toBeLessThanOrEqual(0.97);
    expect(Math.abs(lumaRatio(p, 'grey18') - 1)).toBeLessThan(0.02);
    expect(chromaRatio(p, 'sunlit')).toBeLessThan(0.97);
  });
  it('아침 안개: 대비·채도가 내려가고 그늘이 푸르게', () => {
    const p = preset('아침 안개');
    expect(midSlope(p)).toBeLessThan(0.95);
    expect(avgChroma(p)).toBeLessThan(0.92);
    const s = grey(p, 30);
    expect(s[2]).toBeGreaterThan(s[0]);
  });
  it('골든아워: 흰 꽃이 따뜻해진다', () => {
    const p = preset('골든아워');
    expect(rb(after(p, 'whiteFlower').rgb) - rb(swatch('whiteFlower').rgb)).toBeGreaterThanOrEqual(10);
  });
  it('비 온 뒤: 중간톤 대비가 선다', () => expect(midSlope(preset('비 온 뒤'))).toBeGreaterThanOrEqual(1.04));
  it('겨울 정원: 회색이 차가워지고 채도가 내려간다', () => {
    const p = preset('겨울 정원');
    const g = grey(p, 128);
    expect(g[2] - g[0]).toBeGreaterThanOrEqual(6);
    expect(avgChroma(p)).toBeLessThan(0.9);
  });
  it('수국 블루: 보라 꽃은 짙게, 잎·하늘·피부는 그대로', () => {
    const p = preset('수국 블루');
    expect(chromaRatio(p, 'purpleFlower')).toBeGreaterThanOrEqual(1.08);
    for (const k of ['leaf', 'skyClear', 'skinMid']) {
      after(p, k).rgb.forEach((c, i) => expect(Math.abs(c - swatch(k).rgb[i]), k).toBeLessThanOrEqual(1));
    }
  });
  it('단풍 강조: 단풍은 깊어지고 피부는 그대로 (채도로 구분)', () => {
    const p = preset('단풍 강조');
    expect(lumaRatio(p, 'mapleOrange')).toBeLessThanOrEqual(0.98);
    expect(chromaRatio(p, 'mapleRed')).toBeGreaterThanOrEqual(1.0);
    for (const k of ['skinLight', 'skinMid']) {
      after(p, k).rgb.forEach((c, i) => expect(Math.abs(c - swatch(k).rgb[i]), k).toBeLessThanOrEqual(1));
    }
  });
});

describe('보정', () => {
  const linGrey = (p: Preset) => srgbToLinear(grey(p, 118)[1] / 255);
  it('노출 ±½: 18% 회색의 빛의 양이 ×1.41 / ×0.71', () => {
    expect(linGrey(preset('노출 +½')) / srgbToLinear(118 / 255)).toBeCloseTo(Math.SQRT2, 1);
    expect(linGrey(preset('노출 −½')) / srgbToLinear(118 / 255)).toBeCloseTo(Math.SQRT1_2, 1);
  });
  it('따뜻하게 / 차갑게 / 그늘 색 보정: 회색의 색만 바뀌고 밝기는 그대로', () => {
    const w = grey(preset('따뜻하게'), 128);
    const c = grey(preset('차갑게'), 128);
    const s = grey(preset('그늘 색 보정'), 128);
    expect(rb(w)).toBeGreaterThanOrEqual(8);
    expect(rb(c)).toBeLessThanOrEqual(-8);
    expect(rb(s)).toBeGreaterThanOrEqual(8);
    for (const g of [w, c, s]) expect(Math.abs(measure(g).luma - measure([128, 128, 128]).luma)).toBeLessThan(0.01);
  });
  it('녹색 반사광 제거: 회색에서 초록이 빠진다', () => {
    const g = grey(preset('녹색 반사광 제거'), 128);
    expect(g[1]).toBeLessThan(Math.min(g[0], g[2]));
  });
  it('하이라이트 복구: 구름은 눌리고 18% 회색은 그대로', () => {
    const p = preset('하이라이트 복구');
    expect(lumaRatio(p, 'cloud')).toBeLessThanOrEqual(0.96);
    expect(Math.abs(lumaRatio(p, 'grey18') - 1)).toBeLessThan(0.02);
  });
  it('섀도 들기: 그늘 잎은 10% 이상 밝게, 흰색은 그대로', () => {
    const p = preset('섀도 들기');
    expect(lumaRatio(p, 'shade')).toBeGreaterThanOrEqual(1.1);
    expect(grey(p, 255)).toEqual([255, 255, 255]);
  });
  it('대비 강하게 / 부드럽게', () => {
    expect(midSlope(preset('대비 강하게'))).toBeGreaterThanOrEqual(1.05);
    expect(midSlope(preset('대비 부드럽게'))).toBeLessThanOrEqual(0.92);
  });
  it('채도 올리기(바이브런스): 옅은 색은 오르고 진한 꽃색은 거의 그대로', () => {
    const p = preset('채도 올리기');
    expect(chromaRatio(p, 'skyHorizon')).toBeGreaterThanOrEqual(1.08);
    expect(chromaRatio(p, 'redFlower')).toBeLessThanOrEqual(1.03);
  });
  it('채도 내리기: 평균 채도 약 −20%', () => {
    expect(avgChroma(preset('채도 내리기'))).toBeGreaterThan(0.72);
    expect(avgChroma(preset('채도 내리기'))).toBeLessThan(0.86);
  });
});

describe('흑백', () => {
  const plainBw = preset('흑백');
  it.each(['흑백', '고대비 흑백', '흑백 · 녹색 필터', '흑백 · 빨강 필터'])('%s: 모든 견본이 무채색', (name) => {
    for (const s of GARDEN_SWATCHES) expect(after(preset(name), s.key).chroma, s.label).toBeLessThan(0.006);
  });
  it('녹색 필터: 잎은 기본 흑백보다 밝고, 붉은 꽃은 어둡다', () => {
    const p = preset('흑백 · 녹색 필터');
    expect(after(p, 'leaf').luma).toBeGreaterThan(after(plainBw, 'leaf').luma * 1.05);
    expect(after(p, 'redFlower').luma).toBeLessThan(after(plainBw, 'redFlower').luma);
  });
  it('빨강 필터: 하늘은 기본 흑백보다 10% 이상 어둡고, 붉은 꽃은 밝다', () => {
    const p = preset('흑백 · 빨강 필터');
    expect(after(p, 'skyClear').luma).toBeLessThan(after(plainBw, 'skyClear').luma * 0.9);
    expect(after(p, 'redFlower').luma).toBeGreaterThan(after(plainBw, 'redFlower').luma);
  });
  it('고대비 흑백: 대비가 선다', () => expect(midSlope(preset('고대비 흑백'))).toBeGreaterThanOrEqual(1.08));
  it('세피아: 섀도·하이라이트 모두 따뜻한 갈색', () => {
    const p = preset('세피아');
    expect(rb(grey(p, 60))).toBeGreaterThanOrEqual(6);
    expect(rb(grey(p, 220))).toBeGreaterThanOrEqual(6);
  });
  it('셀레늄 톤: 섀도가 보랏빛(파랑 > 빨강 > 초록)', () => {
    const g = grey(preset('셀레늄 톤'), 50);
    expect(g[2]).toBeGreaterThan(g[0]);
    expect(g[0]).toBeGreaterThan(g[1]);
  });
});

describe('필름', () => {
  it('바랜 필름·매트: 블랙이 들린다', () => {
    expect(grey(preset('바랜 필름'), 0)[1]).toBeGreaterThanOrEqual(10);
    expect(grey(preset('매트'), 0)[1]).toBeGreaterThanOrEqual(8);
  });
  it('블리치 바이패스: 평균 채도 −30% 이상, 대비는 선다', () => {
    const p = preset('블리치 바이패스');
    expect(avgChroma(p)).toBeLessThan(0.7);
    expect(midSlope(p)).toBeGreaterThan(1.04);
  });
  it('크로스 프로세스: 하이라이트는 노랗고 섀도는 푸르다', () => {
    const p = preset('크로스 프로세스');
    const hi = grey(p, 220);
    const lo = grey(p, 30);
    expect(hi[0] + hi[1] - 2 * hi[2]).toBeGreaterThanOrEqual(20);
    expect(lo[2]).toBeGreaterThan(lo[0]);
  });
  it('따뜻한 프린트: 하이라이트는 따뜻하고 섀도는 청록', () => {
    const p = preset('따뜻한 프린트 필름');
    expect(rb(grey(p, 220))).toBeGreaterThan(3);
    expect(rb(grey(p, 40))).toBeLessThan(0);
  });
  it('차가운 슬라이드: 회색이 차갑고 대비가 선다', () => {
    const p = preset('차가운 슬라이드 필름');
    expect(rb(grey(p, 128))).toBeLessThan(-3);
    expect(midSlope(p)).toBeGreaterThan(1.05);
  });
});

describe('시네마틱', () => {
  it('틸 & 오렌지: 섀도는 청록, 하이라이트는 주황', () => {
    const p = preset('틸 & 오렌지');
    const lo = grey(p, 40);
    const hi = grey(p, 210);
    expect(lo[1] + lo[2] - 2 * lo[0]).toBeGreaterThan(4);
    expect(rb(hi)).toBeGreaterThan(6);
  });
  it('무디 다크·로우키는 어둡고, 하이키는 밝되 흰색이 잘리지 않는다', () => {
    expect(lumaRatioGrey('무디 다크')).toBeLessThan(0.88);
    expect(lumaRatioGrey('로우키')).toBeLessThan(0.93);
    expect(lumaRatioGrey('하이키 에어리')).toBeGreaterThan(1.04);
    expect(grey(preset('하이키 에어리'), 240)[1]).toBeLessThan(255);
  });
  it('비네트: 가운데는 그대로, 모서리만 어둡게', () => {
    const chain = chainOf(preset('비네트'));
    const at = (u: number, v: number) => gradePixel8([150, 150, 150], chain, { u, v, aspect: ASPECT });
    expect(at(0.5, 0.5)).toEqual([150, 150, 150]);
    expect(at(0.02, 0.03)[1]).toBeLessThan(140);
  });
});

function lumaRatioGrey(name: string) {
  return measure(grey(preset(name), 118)).luma / measure([118, 118, 118]).luma;
}

describe('확장 프리셋', () => {
  it('노출 ±1: 18% 회색의 빛의 양이 ×2 / ×0.5', () => {
    const lin = (p: Preset) => srgbToLinear(grey(p, 118)[1] / 255) / srgbToLinear(118 / 255);
    expect(lin(preset('노출 +1'))).toBeCloseTo(2, 1);
    expect(lin(preset('노출 −1'))).toBeCloseTo(0.5, 1);
  });
  it('밝은 곳·어두운 곳 균형: 구름은 눌리고 그늘은 들린다', () => {
    const p = preset('밝은 곳·어두운 곳 균형');
    expect(lumaRatio(p, 'cloud')).toBeLessThan(0.95);
    expect(lumaRatio(p, 'shade')).toBeGreaterThan(1.1);
  });
  it('진한 색 누르기: 진한 꽃은 채도가 내려가고 옅은 색은 그대로', () => {
    const p = preset('진한 색 누르기');
    const vivid = GARDEN_SWATCHES.filter((s) => before(s.key).chroma > 0.3).map((s) => s.key);
    expect(vivid.length).toBeGreaterThan(0);
    for (const k of vivid) expect(chromaRatio(p, k), k).toBeLessThan(0.95);
    expect(Math.abs(chromaRatio(p, 'skinLight') - 1)).toBeLessThan(0.04);
  });
  it('흑백 필터: 파랑 필터는 하늘이 밝고, 주황 필터는 하늘이 어둡다', () => {
    const sky = (name: string) => after(preset(name), 'skyClear').luma;
    expect(sky('흑백 · 파랑 필터')).toBeGreaterThan(sky('흑백 · 주황 필터') * 1.2);
    for (const name of ['흑백 · 파랑 필터', '흑백 · 노랑 필터', '흑백 · 주황 필터', '흑백 필름 그레인']) {
      const c = after(preset(name), 'leaf').rgb;
      expect(Math.max(...c) - Math.min(...c), name).toBeLessThanOrEqual(1);
    }
  });
  it('초록만 남기기: 잎은 색이 남고 붉은 꽃·하늘은 흑백', () => {
    const p = preset('초록만 남기기');
    expect(chromaRatio(p, 'leaf')).toBeGreaterThan(0.9);
    expect(after(p, 'skyClear').chroma).toBeLessThan(0.03);
  });
  it('듀오톤: 그림자와 하이라이트가 서로 다른 색', () => {
    const p = preset('듀오톤 · 남색과 주황');
    expect(rb(grey(p, 40))).toBeLessThan(0);
    expect(rb(grey(p, 215))).toBeGreaterThan(0);
  });
  it('미세먼지 걷기·온실은 디헤이즈를, 필름 룩은 그레인·할레이션을 함께 담는다', () => {
    expect(preset('미세먼지 걷기').detail?.dehaze).toBeGreaterThan(20);
    expect(preset('8mm 홈무비').detail?.grain).toBeGreaterThan(40);
    expect(preset('시네마 네거티브').detail?.halation).toBeGreaterThan(20);
    // 필름 룩끼리 바꿔도 앞 룩의 효과가 남지 않도록 효과 값을 모두 적는다
    expect(Object.keys(preset('할레이션 필름').detail!)).toEqual(
      expect.arrayContaining(['grain', 'vignette', 'glow', 'halation']),
    );
  });
});
