import { describe, expect, it } from 'vitest';
import {
  channelsToWheel,
  defaultPrimary,
  gradeLinear,
  gradePixel8,
  LUMA,
  MID_GREY_PIVOT,
  toUniforms,
  wheelChannels,
  whiteBalanceGains,
  type PrimaryParams,
  type Vec3,
} from '../../src/engine/color';

const params = (patch: (p: PrimaryParams) => void) => {
  const p = defaultPrimary();
  patch(p);
  return toUniforms(p);
};

describe('기본값은 아무것도 바꾸지 않는다', () => {
  it('8bit 회색 0–255 전 구간이 그대로 나온다', () => {
    const u = toUniforms(defaultPrimary());
    for (let v = 0; v <= 255; v++) expect(gradePixel8([v, v, v], u)).toEqual([v, v, v]);
  });

  it('유채색도 그대로 나온다', () => {
    const u = toUniforms(defaultPrimary());
    const samples: Vec3[] = [[34, 139, 34], [135, 206, 235], [139, 90, 43], [128, 128, 105], [255, 0, 0]];
    for (const s of samples) expect(gradePixel8(s, u)).toEqual(s);
  });

  it('노드를 끄면 보정값이 있어도 원본', () => {
    const p = defaultPrimary();
    p.gain.master = 3;
    expect(gradePixel8([90, 140, 60], toUniforms(p, { enabled: false }))).toEqual([90, 140, 60]);
  });
});

describe('알려진 입력 → 기대 출력', () => {
  it('Gain 2.0: sRGB 118(선형 ≈0.181) → 선형 ≈0.362 → sRGB 162', () => {
    expect(gradePixel8([118, 118, 118], params((p) => (p.gain.master = 2)))).toEqual([162, 162, 162]);
  });

  it('Offset +1EV는 Gain 2.0과 같다', () => {
    expect(gradePixel8([118, 118, 118], params((p) => (p.offset.master = 1)))).toEqual([162, 162, 162]);
  });

  it('Lift 0.1: 검정(0)이 그레이딩 인코딩 0.1 → 선형 0.1^2.4 ≈0.00398 → sRGB 13', () => {
    expect(gradePixel8([0, 0, 0], params((p) => (p.lift.master = 0.1)))).toEqual([13, 13, 13]);
  });

  it('Lift는 흰색을 움직이지 않는다', () => {
    expect(gradePixel8([255, 255, 255], params((p) => (p.lift.master = 0.3)))).toEqual([255, 255, 255]);
  });

  it('Gamma는 검정과 흰색을 고정하고 중간톤만 움직인다', () => {
    const u = params((p) => (p.gamma.master = 0.5));
    expect(gradePixel8([0, 0, 0], u)).toEqual([0, 0, 0]);
    expect(gradePixel8([255, 255, 255], u)).toEqual([255, 255, 255]);
    expect(gradePixel8([118, 118, 118], u)[0]).toBeGreaterThan(118);
  });

  it('Contrast는 pivot 값을 고정한다', () => {
    const u = params((p) => (p.contrast = 1.6));
    const pivotLinear = Math.pow(MID_GREY_PIVOT, 2.4);
    const out = gradeLinear([pivotLinear, pivotLinear, pivotLinear], u);
    for (const c of out) expect(c).toBeCloseTo(pivotLinear, 3);
    expect(gradePixel8([60, 60, 60], u)[0]).toBeLessThan(60);
    expect(gradePixel8([200, 200, 200], u)[0]).toBeGreaterThan(200);
  });

  it('Saturation 0: 결과는 휘도와 같은 무채색', () => {
    const out = gradeLinear([0.6, 0.2, 0.05], params((p) => (p.saturation = 0)));
    const y = LUMA[0] * 0.6 + LUMA[1] * 0.2 + LUMA[2] * 0.05;
    for (const c of out) expect(c).toBeCloseTo(y, 6);
  });

  it('Hue +120°: 순수 빨강 → 순수 초록', () => {
    const out = gradeLinear([1, 0, 0], params((p) => (p.hue = 120)));
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[1]).toBeCloseTo(1, 6);
    expect(out[2]).toBeCloseTo(0, 6);
  });

  it('Hue 회전은 무채색을 바꾸지 않는다', () => {
    expect(gradePixel8([100, 100, 100], params((p) => (p.hue = 73)))).toEqual([100, 100, 100]);
  });
});

describe('화이트밸런스', () => {
  it('중립 회색의 휘도를 유지한다', () => {
    for (const [t, g] of [[100, 0], [-100, 0], [0, 80], [45, -60]]) {
      const w = whiteBalanceGains(t, g);
      expect(LUMA[0] * w[0] + LUMA[1] * w[1] + LUMA[2] * w[2]).toBeCloseTo(1, 10);
    }
  });

  it('Temp +는 따뜻하게(R>B), Tint +는 마젠타(G 감소)', () => {
    const warm = gradePixel8([128, 128, 128], params((p) => (p.temperature = 50)));
    expect(warm[0]).toBeGreaterThan(warm[2]);
    const magenta = gradePixel8([128, 128, 128], params((p) => (p.tint = 50)));
    expect(magenta[1]).toBeLessThan(magenta[0]);
  });
});

describe('컬러 휠', () => {
  it('휠 색 편차는 휘도를 바꾸지 않는다', () => {
    const c = wheelChannels('gain', { x: 0.6, y: -0.7, master: 1 });
    expect(LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2]).toBeCloseTo(1, 10);
  });

  it('R/G/B 직접 입력은 휠 값으로 정확히 되돌아간다', () => {
    const w = { x: 0.3, y: -0.45, master: 0.12 };
    const back = channelsToWheel('lift', wheelChannels('lift', w));
    expect(back.x).toBeCloseTo(w.x, 10);
    expect(back.y).toBeCloseTo(w.y, 10);
    expect(back.master).toBeCloseTo(w.master, 10);
  });

  it('Gain 휠을 빨강 쪽(V+)으로 밀면 R은 오르고 B는 그대로', () => {
    const out = gradePixel8([128, 128, 128], params((p) => (p.gain.y = 1)));
    expect(out[0]).toBeGreaterThan(128);
    expect(out[1]).toBeLessThan(128);
    expect(out[2]).toBe(128);
  });
});
