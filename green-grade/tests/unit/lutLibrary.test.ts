import { describe, expect, it } from 'vitest';
import { gradePixel8, linearToSrgb, LUMA, srgbToLinear, toUniforms, defaultPrimary, type Vec3 } from '../../src/engine/color';
import { parseCube, sampleLut, serializeCube } from '../../src/engine/lut';
import { lutChain } from '../../src/engine/lutExport';
import {
  buildLibraryLut,
  cineonToLinear,
  gamutToRec709,
  linearToCineon,
  LOG_CURVES,
  LOG_GREY,
  LUT_CATEGORIES,
  LUT_LIBRARY,
  softShoulder,
} from '../../src/engine/lutLibrary';
import { cubeFileName, libraryCubeText } from '../../src/engine/lutPack';
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
  it('145종: 유틸리티 7 · VFX IO 15 · 로그로 변환 19 · 카메라 로그 41 · 프로 룩 16 · 필름 룩 6 · 룩 16 · 정원 25', () => {
    expect(LUT_LIBRARY).toHaveLength(145);
    const count = (c: string) => LUT_LIBRARY.filter((l) => l.category === c).length;
    expect(LUT_CATEGORIES.map(([c]) => count(c))).toEqual([7, 15, 19, 41, 16, 6, 16, 25]);
  });

  it('id·이름이 겹치지 않고 설명이 있다', () => {
    expect(new Set(LUT_LIBRARY.map((l) => l.id)).size).toBe(145);
    expect(new Set(LUT_LIBRARY.map((l) => l.name)).size).toBe(145);
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
      ['slog2', (0.030001222851889303 * 876 + 64) / 1023],
      ['flog2', 0.100686685370811],
      ['dlog', 0.14],
      ['bmdgen5', 0.005 * 8.283605932 + 0.09246575342],
      ['applelog', 0.08550479 * Math.log2(0.01 + 0.00964052) + 0.69336945],
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

  it('제조사 문서의 18% 회색 값과 맞는다', () => {
    expect(LOG_GREY.logc4).toBeCloseTo(0.278396, 6);
    expect(LOG_GREY.log3g10).toBeCloseTo(1 / 3, 6);
    expect(LOG_GREY.flog2 * 1023).toBeCloseTo(400, 0);
    expect(LOG_GREY.slog2 * 1023).toBeCloseTo(347, 0);
    expect(LOG_CURVES.log3g10(1 / 3)).toBeCloseTo(0.18, 4);
    // PQ: 203 nit = 기준 흰색 = 선형 1
    expect(LOG_CURVES.pq(0.58069)).toBeCloseTo(1, 2);
  });

  it.each(LUT_LIBRARY.filter((l) => l.grey !== undefined).map((l) => [l.name, l] as const))(
    '%s: 18%% 회색 코드값이 무채색 sRGB 118 근처가 된다',
    (_n, l) => {
      const g = l.grey!;
      const lut = buildLibraryLut(l.id, 65);
      const o = sampleLut(lut, [g, g, g]).map((v) => v * 255);
      for (const v of o) expect(Math.abs(v - 118)).toBeLessThanOrEqual(3);
      expect(Math.max(...o) - Math.min(...o)).toBeLessThanOrEqual(1);
    },
  );
});

describe('로그로 변환', () => {
  it.each(['dji', 'sony', 'arri', 'panasonic', 'apple', 'canon', 'fujifilm-flog2', 'red', 'bmd-gen5'])(
    '%s: sRGB → 로그 → (같은 카메라의 로그 → sRGB) 는 원본과 2 LSB 이내',
    (cam) => {
      for (const c of [[118, 118, 118], [30, 30, 30], [220, 220, 220], [90, 140, 70], [200, 150, 120], [60, 90, 160]] as Vec3[]) {
        const log = sampleLut(buildLibraryLut(`tolog-${cam}`), c.map((v) => v / 255) as Vec3);
        const back = sampleLut(buildLibraryLut(`camera-${cam}-clip`, 65), log).map((v) => Math.round(v * 255));
        for (let k = 0; k < 3; k++) expect(Math.abs(back[k] - c[k]), `${c}`).toBeLessThanOrEqual(2);
      }
    },
  );
  it('로그 상태는 평탄하다: 검정은 들리고 흰색은 내려와 대비가 크게 줄어든다', () => {
    const lo = sample8('tolog-dji', [0, 0, 0])[1];
    const hi = sample8('tolog-dji', [255, 255, 255])[1];
    expect(lo).toBeGreaterThan(15);
    expect(hi).toBeLessThan(170);
  });
});

describe('VFX IO', () => {
  /** 격자점에서는 보간이 없으므로 수식 값이 그대로 들어 있다 */
  const node = (id: string, i: number) => {
    const lut = buildLibraryLut(id);
    const n = lut.size;
    const k = ((i * n + i) * n + i) * 4;
    return { v: i / (n - 1), out: lut.data[k] };
  };
  it.each([
    ['vfx-lin-to-srgb', srgbToLinear],
    ['vfx-lin-to-logc3', LOG_CURVES.logc3],
    ['vfx-lin-to-slog3', LOG_CURVES.slog3],
    ['vfx-lin-to-cineon', cineonToLinear],
  ] as const)('%s: 역변환하면 원래 선형 값', (id, inverse) => {
    for (const i of [1, 5, 16, 40, 64]) {
      const { v, out } = node(id, i);
      expect(inverse(out)).toBeCloseTo(v, 4);
    }
  });
  it('Cineon 흰색(685)은 선형 1, 검정(95)은 0', () => {
    expect(cineonToLinear(685 / 1023)).toBeCloseTo(1, 6);
    expect(cineonToLinear(95 / 1023)).toBeCloseTo(0, 6);
    expect(linearToCineon(0.18) * 1023).toBeCloseTo(470, -1);
  });
  it('가파른 곡선은 65³로 만든다', () => {
    expect(buildLibraryLut('vfx-lin-to-srgb').size).toBe(65);
    expect(buildLibraryLut('camera-sony-clip').size).toBe(33);
  });
});

describe('필름 룩', () => {
  const warmth = (id: string) => {
    const o = sample8(id, [235, 235, 235]);
    return o[0] - o[2];
  };
  it('흰색이 D55 > D60 > D65 순으로 따뜻하다', () => {
    for (const s of ['2383', '3513']) {
      expect(warmth(`film-${s}-d55`)).toBeGreaterThan(warmth(`film-${s}-d60`));
      expect(warmth(`film-${s}-d60`)).toBeGreaterThan(warmth(`film-${s}-d65`));
    }
  });
  it('2383 스타일이 3513DI 스타일보다 중간톤 대비가 크다', () => {
    const spread = (id: string) => lumOf(sample8(id, [190, 190, 190])) - lumOf(sample8(id, [70, 70, 70]));
    expect(spread('film-2383-d65')).toBeGreaterThan(spread('film-3513-d65'));
  });
  it('2383 스타일은 섀도가 청록, 하이라이트가 따뜻하다', () => {
    const sh = sample8('film-2383-d65', [40, 40, 40]);
    const hi = sample8('film-2383-d65', [210, 210, 210]);
    expect(sh[2]).toBeGreaterThan(sh[0]);
    expect(hi[0]).toBeGreaterThan(hi[2]);
  });
});

describe('Sony 스타일', () => {
  it('LC-709 스타일은 블랙을 들어 올리고, Cine+709 스타일보다 대비가 낮다', () => {
    // S-Log3의 블랙(코드 95/1023)
    const black = (95 / 1023) * 255;
    const lc = sample8('camera-sony-lc709', [black, black, black]);
    expect(lc[1]).toBeGreaterThanOrEqual(5);
    const g = LOG_GREY.slog3 * 255;
    const spread = (id: string) => lumOf(sample8(id, [g + 60, g + 60, g + 60])) - lumOf(sample8(id, [g - 60, g - 60, g - 60]));
    expect(spread('camera-sony-cine709')).toBeGreaterThan(spread('camera-sony-lc709'));
  });
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

describe('.cube 묶음', () => {
  it('파일 이름은 겹치지 않고 다른 프로그램이 읽을 수 있는 문자만 쓴다', () => {
    const names = LUT_LIBRARY.map((l) => cubeFileName(l.name));
    expect(new Set(names).size).toBe(LUT_LIBRARY.length);
    for (const n of names) {
      expect(n).toMatch(/\.cube$/);
      expect(n).not.toMatch(/[\\/:*?"<>|→]/);
    }
  });
});

describe('VFX IO를 1D .cube로', () => {
  it('1D로 쓰고 다시 읽으면(앱 안에서는 65³로 바뀜) 격자점에서 수식 값과 같다', () => {
    const lut = parseCube(libraryCubeText('vfx-lin-to-srgb'));
    expect(lut.size).toBe(65);
    for (const k of [1, 3, 12, 40, 64]) {
      const v = k / 64;
      expect(sampleLut(lut, [v, v, v])[0]).toBeCloseTo(linearToSrgb(v), 4);
    }
    expect(libraryCubeText('vfx-lin-to-srgb')).toContain('LUT_1D_SIZE 4096');
    expect(libraryCubeText('camera-sony-clip')).toContain('LUT_3D_SIZE 33');
  });
});
