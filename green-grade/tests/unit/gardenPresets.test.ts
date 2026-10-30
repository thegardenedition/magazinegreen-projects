// 정원 프리셋 5종이 각자 약속한 효과를 내는지, 그리고 정원 사진의 다른 색을 망치지 않는지 수치로 확인한다.
// 견본은 src/engine/gardenSwatches.ts (실제 사진이 아닌 대표 색).

import { describe, expect, it } from 'vitest';
import { GARDEN_SWATCHES, type SwatchGroup } from '../../src/engine/gardenSwatches';
import { BUILTIN_PRESETS, type Preset } from '../../src/engine/presets';
import { after, apply, before, hueDiff, measure, monotoneGreyRamp } from './presetMetrics';

const preset = (name: string) => BUILTIN_PRESETS.find((p) => p.name === name)!;
const keysOf = (...groups: SwatchGroup[]) => GARDEN_SWATCHES.filter((s) => groups.includes(s.group)).map((s) => s.key);
const chromaRatio = (p: Preset, key: string) => after(p, key).chroma / before(key).chroma;
const lumaRatio = (p: Preset, key: string) => after(p, key).luma / before(key).luma;
const dHue = (p: Preset, key: string) => hueDiff(after(p, key).hue, before(key).hue);
/** 회색 100 → 150 사이 루마 기울기 (원본 대비) */
const midSlope = (p: Preset) =>
  (measure(apply(p, [150, 150, 150])).luma - measure(apply(p, [100, 100, 100])).luma) /
  (measure([150, 150, 150]).luma - measure([100, 100, 100]).luma);

describe.each(BUILTIN_PRESETS.map((p) => [p.name, p] as const))('공통 — %s', (_name, p) => {
  it('회색 계단이 뒤집히지 않는다', () => expect(monotoneGreyRamp(p)).toBe(true));

  it('새 클리핑을 만들지 않는다 (견본의 채널이 0 또는 255로 잘리지 않음)', () => {
    for (const s of GARDEN_SWATCHES) {
      if (s.group === 'neutral') continue;
      const out = after(p, s.key).rgb;
      out.forEach((c, i) => {
        const src = s.rgb[i];
        if (src > 2) expect(c, `${s.label} ${'RGB'[i]}`).toBeGreaterThan(0);
        if (src < 253) expect(c, `${s.label} ${'RGB'[i]}`).toBeLessThan(255);
      });
    }
  });

  it('피부 색상이 크게 돌지 않는다', () => {
    const limit = p.name === '늦가을 정원' ? 6 : 4;
    for (const k of keysOf('skin')) expect(Math.abs(dHue(p, k)), k).toBeLessThanOrEqual(limit);
  });

  it('피부가 붉게 뜨지 않는다 (채도 +12% 이하, 늦가을은 +25%)', () => {
    const limit = p.name === '늦가을 정원' ? 1.25 : 1.12;
    for (const k of keysOf('skin')) expect(chromaRatio(p, k), k).toBeLessThanOrEqual(limit);
  });
});

describe('신록 — 연두와 녹색을 가르고 과포화를 누른다', () => {
  const p = preset('신록');
  it('새순 연두 ↔ 중간 녹색 잎의 색상 간격이 4° 이상 벌어진다', () => {
    const gap0 = Math.abs(hueDiff(before('sprout').hue, before('leaf').hue));
    const gap1 = Math.abs(hueDiff(after(p, 'sprout').hue, after(p, 'leaf').hue));
    expect(gap1 - gap0).toBeGreaterThanOrEqual(4);
  });
  it('녹색 채도는 오르지 않고, 가장 진한 녹색은 5% 이상 내려간다', () => {
    for (const k of ['sunlit', 'leaf', 'lawn', 'sprout']) expect(chromaRatio(p, k), k).toBeLessThanOrEqual(1);
    expect(chromaRatio(p, 'sunlit')).toBeLessThanOrEqual(0.95);
  });
  it('하늘·꽃·흙·피부의 색상은 그대로 (±3°)', () => {
    for (const k of keysOf('sky', 'flower', 'skin', 'autumn').filter((k) => before(k).chroma > 0.05)) {
      expect(Math.abs(dHue(p, k)), k).toBeLessThanOrEqual(3);
    }
  });
  it('그늘 잎이 뭉개지지 않는다', () => expect(lumaRatio(p, 'shade')).toBeGreaterThanOrEqual(0.95));
  it('돌은 무채색으로 남는다', () => {
    for (const k of ['granite', 'darkStone']) expect(after(p, k).chroma - before(k).chroma, k).toBeLessThanOrEqual(0.012);
  });
});

describe('늦가을 정원 — 앰버 하이라이트, 차분한 섀도, 바랜 녹색', () => {
  const p = preset('늦가을 정원');
  it('밝은 곳이 따뜻해진다 (R−B가 10 이상 커짐)', () => {
    for (const k of ['whiteFlower', 'cloud']) {
      const [r0, , b0] = before(k).rgb;
      const [r1, , b1] = after(p, k).rgb;
      expect(r1 - b1 - (r0 - b0), k).toBeGreaterThanOrEqual(10);
    }
  });
  it('녹색은 바래고(채도 −10% 이상) 노란 쪽으로 돈다', () => {
    for (const k of ['sunlit', 'leaf', 'lawn']) {
      expect(chromaRatio(p, k), k).toBeLessThanOrEqual(0.9);
      expect(dHue(p, k), k).toBeLessThanOrEqual(-2);
    }
  });
  it('어두운 곳은 채도가 가라앉되 뭉개지지 않는다', () => {
    for (const k of ['shade', 'wetSoil']) {
      expect(chromaRatio(p, k), k).toBeLessThanOrEqual(0.95);
      expect(lumaRatio(p, k), k).toBeGreaterThanOrEqual(0.85);
    }
  });
});

describe('흐린 날 구제 — 미드톤 대비, 하늘만 짙게', () => {
  const p = preset('흐린 날 구제');
  it('미드톤 대비가 8–25% 선다', () => {
    expect(midSlope(p)).toBeGreaterThanOrEqual(1.08);
    expect(midSlope(p)).toBeLessThanOrEqual(1.25);
  });
  it('위쪽의 흐린 하늘은 조금 짙고 푸르게', () => {
    const top = after(p, 'skyOvercast', 0.1);
    expect(top.luma / before('skyOvercast').luma).toBeLessThanOrEqual(0.97);
    expect(top.chroma / before('skyOvercast').chroma).toBeGreaterThanOrEqual(1.1);
  });
  it('같은 색이라도 아래쪽(그라디언트 창 밖)은 하늘 보정을 받지 않는다', () => {
    expect(after(p, 'skyOvercast', 0.9).luma - after(p, 'skyOvercast', 0.1).luma).toBeGreaterThanOrEqual(0.02);
  });
  it('맑은 하늘도 과하게 짙어지지 않는다 (채도 +35% 이하, 클리핑 없음)', () => {
    expect(after(p, 'skyClear', 0.08).chroma / before('skyClear').chroma).toBeLessThanOrEqual(1.35);
  });
  it('잎이 형광처럼 뜨지 않는다 (채도 +20% 이하)', () => {
    for (const k of keysOf('foliage')) expect(chromaRatio(p, k), k).toBeLessThanOrEqual(1.2);
  });
});

describe('매거진 내추럴 — 낮은 채도, 들린 블랙, 꺾이는 하이라이트', () => {
  const p = preset('매거진 내추럴');
  it('유채색 평균 채도가 10–22% 낮아진다', () => {
    const keys = GARDEN_SWATCHES.filter((s) => before(s.key).chroma > 0.05).map((s) => s.key);
    const avg = keys.reduce((a, k) => a + chromaRatio(p, k), 0) / keys.length;
    expect(avg).toBeGreaterThanOrEqual(0.78);
    expect(avg).toBeLessThanOrEqual(0.9);
  });
  it('검정은 6–14로 들리고, 흰색은 236–248로 눌린다', () => {
    const k = apply(p, [0, 0, 0])[1];
    const w = apply(p, [255, 255, 255])[1];
    expect(k).toBeGreaterThanOrEqual(6);
    expect(k).toBeLessThanOrEqual(14);
    expect(w).toBeGreaterThanOrEqual(236);
    expect(w).toBeLessThanOrEqual(248);
  });
  it('구름 밝은 곳은 부드럽게 눌리지만 회색으로 죽지 않는다', () => {
    const c = after(p, 'cloud').rgb[1];
    expect(c).toBeLessThanOrEqual(240);
    expect(c).toBeGreaterThan(222);
  });
});

describe('석재·목재 질감 — 중간톤 대비, 깊은 나무색', () => {
  const p = preset('석재·목재 질감');
  it('미드톤 대비가 8–20% 선다', () => {
    expect(midSlope(p)).toBeGreaterThanOrEqual(1.08);
    expect(midSlope(p)).toBeLessThanOrEqual(1.2);
  });
  it('나무·벽돌은 채도가 8% 이상 오르고 밝아지지 않는다', () => {
    for (const k of ['deck', 'brick']) {
      expect(chromaRatio(p, k), k).toBeGreaterThanOrEqual(1.08);
      expect(lumaRatio(p, k), k).toBeLessThanOrEqual(1);
    }
  });
  it('돌은 무채색으로 남는다', () => {
    for (const k of ['granite', 'darkStone']) expect(after(p, k).chroma - before(k).chroma, k).toBeLessThanOrEqual(0.01);
  });
  it('그늘은 뭉개지지 않는다 (루마 −12% 이내)', () => {
    for (const k of ['shade', 'wetSoil', 'darkStone']) expect(lumaRatio(p, k), k).toBeGreaterThanOrEqual(0.88);
  });
  it('녹색은 거의 그대로 (채도 +5% 이하)', () => {
    for (const k of keysOf('foliage')) expect(chromaRatio(p, k), k).toBeLessThanOrEqual(1.05);
  });
});
