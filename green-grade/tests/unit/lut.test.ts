import { describe, expect, it } from 'vitest';
import { applyLut, defaultPrimary, gradePixel8, linearToSrgb, srgbToLinear, toUniforms, type Vec3 } from '../../src/engine/color';
import { buildLut, identityLut, parseCube, sampleLut, serializeCube, serializeCube1D } from '../../src/engine/lut';

const withLut = (cube: string, intensity = 1) =>
  toUniforms(defaultPrimary(), { lut: { lut: parseCube(cube), intensity } });

const invert = buildLut(17, 'Invert', (r, g, b) => [1 - r, 1 - g, 1 - b]);

describe('.cube 읽기', () => {
  it('주석·TITLE·DOMAIN을 읽고 R이 가장 빠른 순서로 담는다', () => {
    const cube = `# 테스트
TITLE "Two"
LUT_3D_SIZE 2
DOMAIN_MIN 0 0 0
DOMAIN_MAX 1 1 1
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`;
    const l = parseCube(cube, 'file.cube');
    expect(l.name).toBe('Two');
    expect(l.size).toBe(2);
    // (r=1, g=0, b=0)은 두 번째 줄
    expect(Array.from(l.data.slice(4, 7))).toEqual([1, 0, 0]);
    // (r=0, g=0, b=1)은 다섯 번째 줄
    expect(Array.from(l.data.slice(16, 19))).toEqual([0, 0, 1]);
  });

  it('TITLE이 없으면 파일 이름을 쓴다', () => {
    expect(parseCube(serializeCube(identityLut(2)).replace(/TITLE.*\n/, ''), 'Warm Film.cube').name).toBe('Warm Film');
  });

  it('잘못된 파일은 이유와 함께 거절한다', () => {
    expect(() => parseCube('0 0 0\n')).toThrow('LUT_3D_SIZE');
    expect(() => parseCube('LUT_3D_SIZE 2\n0 0 0\n')).toThrow('8개');
    expect(() => parseCube('LUT_1D_SIZE 1024\n')).toThrow('1D');
    expect(() => parseCube('LUT_1D_SIZE 1\n0 0 0\n')).toThrow('범위');
    expect(() => parseCube('LUT_3D_SIZE 99\n')).toThrow('지원 범위');
    expect(() => parseCube('LUT_3D_SIZE 2\n0 0 x\n')).toThrow('읽을 수 없습니다');
  });

  it('쓰기 → 읽기 왕복이 같다', () => {
    const back = parseCube(serializeCube(invert));
    expect(back.size).toBe(17);
    for (let i = 0; i < invert.data.length; i++) expect(back.data[i]).toBeCloseTo(invert.data[i], 6);
  });
});

describe('LUT 적용', () => {
  it('항등 LUT는 아무것도 바꾸지 않는다', () => {
    const u = withLut(serializeCube(identityLut(33)));
    for (let v = 0; v <= 255; v += 5) {
      expect(gradePixel8([v, 255 - v, (v * 7) % 256], u)).toEqual([v, 255 - v, (v * 7) % 256]);
    }
  });

  it('반전 LUT: sRGB 코드값 x → 255−x', () => {
    const u = withLut(serializeCube(invert));
    expect(gradePixel8([0, 128, 255], u)).toEqual([255, 127, 0]);
    expect(gradePixel8([30, 200, 90], u)).toEqual([225, 55, 165]);
  });

  it('격자 사이 값은 3선형 보간', () => {
    const l = buildLut(2, 'sq', (r, g, b) => [r * r, g, b]);
    // 크기 2이면 꼭짓점만 있으므로 0.5 → 0.5 (r² 곡선이 아니라 직선)
    expect(sampleLut(l, [0.5, 0.25, 0.75])).toEqual([0.5, 0.25, 0.75]);
  });

  it('강도는 선형 공간에서 원본과 섞는다', () => {
    const l = { lut: invert, intensity: 0.5 };
    const lin: Vec3 = [0.2, 0.2, 0.2];
    const full = srgbToLinear(1 - linearToSrgb(0.2));
    expect(applyLut(lin, l)[0]).toBeCloseTo((0.2 + full) / 2, 5);
  });

  it('DOMAIN이 0–1이 아니면 입력을 그 범위로 맞춘다', () => {
    const l = { ...identityLut(2), domainMin: [0, 0, 0] as Vec3, domainMax: [2, 2, 2] as Vec3 };
    expect(sampleLut(l, [1, 1, 1])).toEqual([0.5, 0.5, 0.5]);
  });
});

describe('1D LUT', () => {
  it('채널별 곡선을 65³ 3D LUT로 바꿔 읽는다', () => {
    const text = serializeCube1D('Square', 256, (x) => x * x);
    const lut = parseCube(text);
    expect(lut.size).toBe(65);
    expect(lut.name).toBe('Square');
    const o = sampleLut(lut, [0.5, 0.25, 1]);
    expect(o[0]).toBeCloseTo(0.25, 3);
    expect(o[1]).toBeCloseTo(0.0625, 3);
    expect(o[2]).toBeCloseTo(1, 6);
  });
  it('LUT_1D_INPUT_RANGE를 따른다', () => {
    const lut = parseCube('LUT_1D_SIZE 2\nLUT_1D_INPUT_RANGE 0 2\n0 0 0\n1 1 1\n');
    expect(sampleLut(lut, [1, 1, 1])[0]).toBeCloseTo(0.5, 6);
  });
});
