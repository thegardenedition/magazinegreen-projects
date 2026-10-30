import { describe, expect, it } from 'vitest';
import { defaultPrimary, gradeLinear, gradePixel8, LUMA, toUniforms, type Vec3 } from '../../src/engine/color';
import {
  bakeCurves,
  customEvaluator,
  defaultCurves,
  hueOf,
  lookupCustom,
  periodicEvaluator,
  SIX_VECTORS,
  type CurvesParams,
} from '../../src/engine/curves';

const withCurves = (patch: (c: CurvesParams) => void) => {
  const c = defaultCurves();
  patch(c);
  return toUniforms(defaultPrimary(), { curves: bakeCurves(c) });
};
const flat = (y: number) => [
  { x: 0, y },
  { x: 0.5, y },
];
const enc = (lin: Vec3) => lin.map((v) => Math.sign(v) * Math.pow(Math.abs(v), 1 / 2.4)) as Vec3;

describe('커브 보간', () => {
  it('기본 커브 표는 항등이며 0–1 밖(슈퍼화이트)도 보존한다', () => {
    const { data } = bakeCurves(defaultCurves());
    for (const p of [-0.2, 0, 0.123, 0.5, 0.987, 1, 1.3]) {
      for (let ch = 0; ch < 4; ch++) expect(lookupCustom(data, ch, p)).toBeCloseTo(p, 6);
    }
  });

  it('조절점을 정확히 지나간다', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0.3, y: 0.18 },
      { x: 0.7, y: 0.82 },
      { x: 1, y: 1 },
    ];
    const f = customEvaluator(pts);
    for (const p of pts) expect(f(p.x)).toBeCloseTo(p.y, 10);
  });

  it('단조 보간: 점 사이에서 튀어 오르지 않는다', () => {
    const f = customEvaluator([
      { x: 0, y: 0 },
      { x: 0.2, y: 0.8 },
      { x: 0.25, y: 0.82 },
      { x: 1, y: 1 },
    ]);
    let prev = -Infinity;
    for (let i = 0; i <= 1000; i++) {
      const v = f(i / 1000);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(v).toBeLessThanOrEqual(1 + 1e-12);
      prev = v;
    }
  });

  it('주기 커브는 색상축 0과 1이 이어진다', () => {
    const f = periodicEvaluator([
      { x: 0.05, y: 0.9 },
      { x: 0.5, y: 0.2 },
      { x: 0.95, y: 0.7 },
    ]);
    expect(f(0)).toBeCloseTo(f(1 - 1e-9), 6);
    expect(f(0.05)).toBeCloseTo(0.9, 10);
  });

  it('색상축 순서: 빨강 0 → 노랑 → 초록 → 청록 → 파랑 → 마젠타', () => {
    const xs = SIX_VECTORS.map(([, x]) => x);
    expect(xs[0]).toBeCloseTo(0, 10);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });
});

describe('Custom 커브 적용', () => {
  it('Y 커브로 중간톤을 내리면 검정·흰색은 그대로, 회색은 어두워진다', () => {
    const u = withCurves((c) => (c.y = [{ x: 0, y: 0 }, { x: 0.5, y: 0.35 }, { x: 1, y: 1 }]));
    expect(gradePixel8([0, 0, 0], u)).toEqual([0, 0, 0]);
    expect(gradePixel8([255, 255, 255], u)).toEqual([255, 255, 255]);
    expect(gradePixel8([128, 128, 128], u)[0]).toBeLessThan(110);
  });

  it('R 커브는 빨강 채널만 바꾼다', () => {
    const u = withCurves((c) => (c.r = [{ x: 0, y: 0 }, { x: 0.5, y: 0.7 }, { x: 1, y: 1 }]));
    const out = gradePixel8([128, 128, 128], u);
    expect(out[0]).toBeGreaterThan(128);
    expect(out[1]).toBe(128);
    expect(out[2]).toBe(128);
  });
});

describe('색상 커브', () => {
  it('Hue vs Sat 전체 0: 모든 색이 같은 루마의 무채색이 된다', () => {
    const u = withCurves((c) => (c.hueSat = flat(0)));
    const out = gradeLinear([0.6, 0.2, 0.05], u);
    const p = enc(out);
    expect(p[0]).toBeCloseTo(p[1], 6);
    expect(p[1]).toBeCloseTo(p[2], 6);
    const pin = enc([0.6, 0.2, 0.05]);
    expect(p[0]).toBeCloseTo(LUMA[0] * pin[0] + LUMA[1] * pin[1] + LUMA[2] * pin[2], 6);
  });

  it('Hue vs Hue 전체 최대(+60°): 빨강이 노랑 쪽으로 정확히 60° 이동', () => {
    const u = withCurves((c) => (c.hueHue = flat(1)));
    const out = gradeLinear([0.5, 0.02, 0.02], u);
    const before = hueOf(enc([0.5, 0.02, 0.02]));
    expect(hueOf(enc(out)) - before).toBeCloseTo(60 / 360, 4);
  });

  it('Hue vs Lum 전체 최대: 유채색 루마 +50%, 무채색은 그대로', () => {
    const u = withCurves((c) => (c.hueLum = flat(1)));
    const pin = enc([0.3, 0.05, 0.02]);
    const yIn = LUMA[0] * pin[0] + LUMA[1] * pin[1] + LUMA[2] * pin[2];
    const p = enc(gradeLinear([0.3, 0.05, 0.02], u));
    expect(LUMA[0] * p[0] + LUMA[1] * p[1] + LUMA[2] * p[2]).toBeCloseTo(yIn * 1.5, 5);
    expect(gradePixel8([90, 90, 90], u)).toEqual([90, 90, 90]);
  });

  it('Lum vs Sat 전체 0: 무채색으로', () => {
    const u = withCurves((c) => (c.lumSat = [{ x: 0, y: 0 }, { x: 1, y: 0 }]));
    const out = gradePixel8([200, 80, 40], u);
    expect(out[0]).toBe(out[1]);
    expect(out[1]).toBe(out[2]);
  });

  it('초록 주변만 고른 Hue vs Sat: 초록은 빠지고 빨강·파랑은 그대로', () => {
    const green = SIX_VECTORS[2][1];
    const u = withCurves(
      (c) =>
        (c.hueSat = [
          { x: green - 0.08, y: 0.5 },
          { x: green, y: 0 },
          { x: green + 0.08, y: 0.5 },
        ]),
    );
    const leaf = gradePixel8([40, 140, 40], u);
    expect(Math.abs(leaf[0] - leaf[1])).toBeLessThan(6);
    expect(gradePixel8([200, 40, 40], u)).toEqual([200, 40, 40]);
    expect(gradePixel8([40, 60, 200], u)).toEqual([40, 60, 200]);
  });

  it('색상 커브가 모두 평평하면 처리를 건너뛴다', () => {
    expect(bakeCurves(defaultCurves()).hueActive).toBe(false);
    const c = defaultCurves();
    c.hueSat = flat(0.5);
    expect(bakeCurves(c).hueActive).toBe(false);
    c.hueSat = flat(0.6);
    expect(bakeCurves(c).hueActive).toBe(true);
  });
});
