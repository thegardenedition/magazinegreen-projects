import { describe, expect, it } from 'vitest';
import { gradePixel8, linearToSrgb, LUMA, srgbToLinear, toUniforms, defaultPrimary, type Vec3 } from '../../src/engine/color';
import { parseCube, sampleLut, serializeCube } from '../../src/engine/lut';
import { lutChain } from '../../src/engine/lutExport';
import {
  buildLibraryLut,
  gamutToRec709,
  LOG_CURVES,
  LOG_GREY,
  LUT_CATEGORIES,
  LUT_LIBRARY,
  softShoulder,
} from '../../src/engine/lutLibrary';
import { chainOfPreset } from '../../src/engine/presetChain';
import { BUILTIN_PRESETS } from '../../src/engine/presetLibrary';

/** 8bit 입력 → LUT → 8bit (최종 출력처럼 0–255로 자른다) */
const sample8 = (id: string, c: Vec3, size = 33) =>
  sampleLut(buildLibraryLut(id, size), c.map((v) => v / 255) as Vec3).map((v) =>
    Math.min(255, Math.max(0, Math.round(v * 255))),
  ) as Vec3;
/** 선형 휘도. 입력은 sRGB 코드값 0–1 */
const lum01 = (c: Vec3) => LUMA[0] * srgbToLinear(c[0]) + LUMA[1] * srgbToLinear(c[1]) + LUMA[2] * srgbToLinear(c[2]);
/** 선형 휘도. 입력은 8bit 0–255 */
const lumOf = (c: Vec3) => lum01(c.map((v) => v / 255) as Vec3);

describe('라이브러리 구성', () => {
  it('50종: 유틸리티 7 · 카메라 로그 14 · 룩 16 · 정원 13', () => {
    expect(LUT_LIBRARY).toHaveLength(50);
    const count = (c: string) => LUT_LIBRARY.filter((l) => l.category === c).length;
    expect(LUT_CATEGORIES.map(([c]) => count(c))).toEqual([7, 14, 16, 13]);
  });

  it('id·이름이 겹치지 않고 설명이 있다', () => {
    expect(new Set(LUT_LIBRARY.map((l) => l.id)).size).toBe(50);
    expect(new Set(LUT_LIBRARY.map((l) => l.name)).size).toBe(50);
    for (const l of LUT_LIBRARY) expect(l.description, l.id).toBeTruthy();
  });
});

describe.each(LUT_LIBRARY.map((l) => [l.name, l] as const))('%s', (_n, l) => {
  const lut = l.build(17);

  it('17³로 만들어지고 모든 값이 0–1 사이(직선 변환은 −0.1–1.2)의 유한한 수', () => {
    expect(lut.size).toBe(17);
    const [lo, hi] = l.extendedRange ? [-0.1, 1.2] : [-1e-6, 1 + 1e-6];
    for (const v of lut.data) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(lo);
      expect(v).toBeLessThanOrEqual(hi);
    }
  });

  it.skipIf(!!l.nonMonotone)('회색 축에서 밝기가 거꾸로 가지 않는다', () => {
    let prev = -1;
    for (let i = 0; i < 17; i++) {
      const k = ((i * 17 + i) * 17 + i) * 4;
      const y = lum01([lut.data[k], lut.data[k + 1], lut.data[k + 2]]);
      expect(y, `회색 ${i}/16`).toBeGreaterThanOrEqual(prev - 1e-4);
      prev = y;
    }
  });

  it('.cube로 쓰고 다시 읽어도 같다', () => {
    const back = parseCube(serializeCube(lut));
    expect(back.size).toBe(17);
    for (let i = 0; i < lut.data.length; i += 97) expect(back.data[i]).toBeCloseTo(lut.data[i], 5);
  });
});

describe('유틸리티', () => {
  it('항등과 반전은 정확하다', () => {
    for (const c of [[0, 0, 0], [12, 130, 250], [255, 255, 255]] as Vec3[]) {
      expect(sample8('util-identity', c)).toEqual(c);
      expect(sample8('util-invert', c)).toEqual(c.map((v) => 255 - v));
    }
  });
  it('흑백 LUT는 무채색이고 휘도를 지킨다', () => {
    const o = sample8('util-mono', [60, 140, 50]);
    expect(o[0]).toBe(o[1]);
    expect(o[1]).toBe(o[2]);
    expect(Math.abs(lumOf(o) - lumOf([60, 140, 50]))).toBeLessThan(0.01);
  });
  it('비디오 ↔ 풀 레벨은 서로 되돌린다 (8bit 반올림 두 번 → 2 LSB 이내)', () => {
    for (const v of [16, 60, 128, 200, 235]) {
      const full = sample8('util-legal-to-full', [v, v, v]);
      const back = sample8('util-full-to-legal', full);
      expect(Math.abs(back[0] - v)).toBeLessThanOrEqual(2);
    }
    expect(sample8('util-legal-to-full', [16, 16, 16])).toEqual([0, 0, 0]);
    expect(sample8('util-legal-to-full', [235, 235, 235])).toEqual([255, 255, 255]);
  });
  it('폴스 컬러: 18% 회색은 초록, 흰색은 빨강, 검정은 보라', () => {
    const g = sample8('util-false-color', [118, 118, 118], 65);
    expect(g[1]).toBeGreaterThan(g[0] + 80);
    const w = sample8('util-false-color', [255, 255, 255], 65);
    expect(w[0]).toBeGreaterThan(w[1] + 150);
    const k = sample8('util-false-color', [0, 0, 0], 65);
    expect(k[2]).toBeGreaterThan(k[1] + 100);
  });
});

describe('카메라 로그', () => {
  it.each(Object.entries(LOG_GREY))('%s: 18%% 회색 코드값 → 선형 0.18', (curve, code) => {
    expect(LOG_CURVES[curve as keyof typeof LOG_CURVES](code)).toBeCloseTo(0.18, 3);
  });

  it('로그 곡선은 구간 경계에서 끊기지 않는다', () => {
    const joins: Array<[keyof typeof LOG_CURVES, number]> = [
      ['slog3', 171.2102946929 / 1023],
      ['logc3', 5.367655 * 0.010591 + 0.092809],
      ['vlog', 0.181],
      ['flog', 0.100537775223865],
      ['nlog', 452 / 1023],
      ['hlg', 0.5],
    ];
    for (const [c, x] of joins) {
      // N-Log는 공개 상수가 반올림돼 경계에서 3×10⁻⁴만큼 어긋난다 (0.1% 미만)
      const tol = c === 'nlog' ? 5e-4 : 1e-4;
      expect(Math.abs(LOG_CURVES[c](x - 1e-7) - LOG_CURVES[c](x + 1e-7)), c).toBeLessThan(tol);
    }
  });

  it('색역 변환은 흰색을 흰색으로 둔다 (D65 → D65)', () => {
    const m = gamutToRec709([0.766, 0.275], [0.225, 0.8], [0.089, -0.087]);
    for (const row of m) expect(row[0] + row[1] + row[2]).toBeCloseTo(1, 6);
  });

  it('부드러운 하이라이트는 0.55 아래를 그대로 두고 1을 넘지 않는다', () => {
    expect(softShoulder(0.18)).toBe(0.18);
    expect(softShoulder(0.55)).toBe(0.55);
    expect(softShoulder(4)).toBeLessThan(1);
    expect(softShoulder(0.8)).toBeLessThan(0.8);
  });

  it.each(LUT_LIBRARY.filter((l) => l.category === 'camera').map((l) => [l.name, l] as const))(
    '%s: 18%% 회색 코드값이 무채색 sRGB 118 근처가 된다',
    (_n, l) => {
      const curve = Object.keys(LOG_CURVES).find((k) => l.id.includes(
        { slog3: 'sony', logc3: 'arri', clog3: 'canon', vlog: 'panasonic', flog: 'fujifilm', nlog: 'nikon', hlg: 'hlg' }[k as keyof typeof LOG_CURVES],
      )) as keyof typeof LOG_GREY;
      const g = LOG_GREY[curve];
      const lut = buildLibraryLut(l.id, 65);
      const o = sampleLut(lut, [g, g, g]).map((v) => v * 255);
      for (const v of o) expect(Math.abs(v - 118)).toBeLessThanOrEqual(3);
      expect(Math.max(...o) - Math.min(...o)).toBeLessThanOrEqual(1);
    },
  );
});

describe('룩', () => {
  it('세피아는 갈색, 셀레늄은 보랏빛 섀도', () => {
    const s = sample8('look-sepia', [128, 128, 128]);
    expect(s[0]).toBeGreaterThan(s[2] + 10);
    const sel = sample8('look-selenium', [60, 60, 60]);
    expect(sel[2]).toBeGreaterThan(sel[1]);
  });
  it('데이 포 나이트는 어둡고 푸르다', () => {
    const o = sample8('look-day-for-night', [160, 170, 150]);
    expect(lumOf(o)).toBeLessThan(lumOf([160, 170, 150]) * 0.4);
    expect(o[2]).toBeGreaterThan(o[0]);
  });
  it('매트 블랙은 블랙을 들어 올린다', () => expect(sample8('look-matte', [0, 0, 0])[1]).toBeGreaterThanOrEqual(12));
});

describe('정원 LUT', () => {
  it.each(BUILTIN_PRESETS.filter((p) => p.category === 'garden').map((p) => [p.name, p] as const))(
    '%s: 같은 이름의 프리셋(창 제외)과 33³ 기준 평균 1 LSB 이하',
    (name, p) => {
      const chain = lutChain(chainOfPreset(p), 'exclude');
      let sum = 0;
      let n = 0;
      for (let i = 0; i < 120; i++) {
        const c: Vec3 = [(i * 97) % 256, (i * 57 + 30) % 256, (i * 31 + 90) % 256];
        const direct = gradePixel8(c, chain);
        const via = sample8(`garden-${name}`, c);
        for (let k = 0; k < 3; k++) {
          sum += Math.abs(direct[k] - via[k]);
          n++;
        }
      }
      expect(sum / n).toBeLessThanOrEqual(1);
    },
  );
});

describe('노드에 넣으면 셰이더 경로로 그대로 쓰인다', () => {
  it('라이브러리 LUT를 노드 LUT로 적용한 결과 = LUT 직접 샘플', () => {
    const lut = buildLibraryLut('look-bleach');
    const u = toUniforms(defaultPrimary(), { lut: { lut, intensity: 1 } });
    const c: Vec3 = [90, 150, 70];
    const via = gradePixel8(c, u);
    const direct = sampleLut(lut, c.map((v) => v / 255) as Vec3).map((v) => linearToSrgb(srgbToLinear(v)) * 255);
    via.forEach((v, i) => expect(Math.abs(v - direct[i])).toBeLessThanOrEqual(1));
  });
});
