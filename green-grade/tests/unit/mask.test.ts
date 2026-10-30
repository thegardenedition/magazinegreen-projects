import { describe, expect, it } from 'vitest';
import { defaultPrimary, gradePixel8, srgbToLinear, toUniforms, type Vec3 } from '../../src/engine/color';
import { SIX_VECTORS } from '../../src/engine/curves';
import {
  defaultQualifier,
  defaultShape,
  defaultWindow,
  hslOf,
  maskBits,
  maskUniform,
  polygonVertices,
  qualifierFromSamples,
  qualifierWeight,
  windowUniform,
  windowWeight,
  type Qualifier,
  type WindowParams,
  type WindowShape,
} from '../../src/engine/mask';
import { BUILTIN_PRESETS, parsePreset, serializePreset } from '../../src/engine/presets';

const lin8 = (c: Vec3) => c.map((v) => srgbToLinear(v / 255)) as Vec3;
const LEAF = lin8([60, 140, 50]);
const SKY = lin8([110, 160, 220]);
const SOIL = lin8([110, 80, 55]);
const GREY = lin8([128, 128, 128]);

const greenQ = (): Qualifier => {
  const q = defaultQualifier();
  q.enabled = true;
  q.hue = { on: true, center: hslOf(LEAF).h, width: 0.05, soft: 0.03 };
  return q;
};

const win = (shape: WindowShape, patch: Partial<WindowParams> = {}): WindowParams => ({
  ...defaultWindow(),
  enabled: true,
  shape,
  ...patch,
});
const ww = (w: WindowParams, u: number, v: number, aspect = 1) => windowWeight(windowUniform(w), w.invert, u, v, aspect);

describe('HSL Qualifier', () => {
  it('잎의 녹색은 고르고 하늘·흙·회색은 고르지 않는다', () => {
    const q = greenQ();
    expect(qualifierWeight(q, LEAF)).toBeCloseTo(1, 6);
    expect(qualifierWeight(q, SKY)).toBe(0);
    expect(qualifierWeight(q, SOIL)).toBe(0);
    expect(qualifierWeight(q, GREY)).toBe(0);
  });

  it('반전하면 정반대', () => {
    const q = { ...greenQ(), invert: true };
    expect(qualifierWeight(q, LEAF)).toBeCloseTo(0, 6);
    expect(qualifierWeight(q, SKY)).toBe(1);
  });

  it('소프트 구간에서 0과 1 사이로 부드럽게 줄어든다', () => {
    const q = greenQ();
    const c = q.hue.center;
    const ws = [0, 0.04, 0.06, 0.07, 0.09].map((d) => {
      // 같은 채도·밝기로 색상만 d만큼 이동한 색
      const shifted = { ...q, hue: { ...q.hue, center: c + d } };
      return qualifierWeight(shifted, LEAF);
    });
    expect(ws[0]).toBeCloseTo(1, 6);
    expect(ws[1]).toBeCloseTo(1, 6);
    expect(ws[2]).toBeGreaterThan(0.3);
    expect(ws[2]).toBeLessThan(1);
    expect(ws[3]).toBeLessThan(ws[2]);
    expect(ws[4]).toBe(0);
  });

  it('밝기 범위: 낮은 끝 0이면 검정까지 포함, 높은 끝 1이면 흰색까지 포함', () => {
    const q = defaultQualifier();
    q.enabled = true;
    q.hue.on = false;
    q.sat.on = false;
    q.lum = { on: true, low: 0, high: 1, soft: 0 };
    expect(qualifierWeight(q, [0, 0, 0])).toBe(1);
    expect(qualifierWeight(q, [1, 1, 1])).toBe(1);
    q.lum = { on: true, low: 0.6, high: 1, soft: 0.05 };
    expect(qualifierWeight(q, lin8([40, 40, 40]))).toBe(0);
    expect(qualifierWeight(q, lin8([230, 230, 230]))).toBe(1);
  });

  it('스포이드: 고른 색의 색상을 중심으로, 더하기는 두 색을 모두 덮는다', () => {
    const q = qualifierFromSamples([LEAF, lin8([70, 150, 55])], defaultQualifier(), false);
    expect(q.enabled).toBe(true);
    expect(qualifierWeight(q, LEAF)).toBeGreaterThan(0.99);
    expect(qualifierWeight(q, SKY)).toBe(0);
    const yellowGreen = lin8([150, 170, 40]);
    expect(qualifierWeight(q, yellowGreen)).toBeLessThan(0.5);
    const both = qualifierFromSamples([yellowGreen], q, true);
    expect(qualifierWeight(both, LEAF)).toBeGreaterThan(0.99);
    expect(qualifierWeight(both, yellowGreen)).toBeGreaterThan(0.99);
    expect(qualifierWeight(both, SKY)).toBe(0);
  });

  it('색상축 0(빨강)을 넘는 범위도 이어진다', () => {
    const q = defaultQualifier();
    q.enabled = true;
    q.sat.on = false;
    q.hue = { on: true, center: 0.98, width: 0.06, soft: 0 };
    // 마젠타 쪽 빨강(색상 ≈ 0.99)과 주황 쪽 빨강(≈ 0.02)이 모두 걸린다
    const magentaRed = lin8([220, 30, 40]);
    const orangeRed = lin8([220, 50, 25]);
    expect(hslOf(magentaRed).h).toBeGreaterThan(0.9);
    expect(hslOf(orangeRed).h).toBeLessThan(0.1);
    expect(qualifierWeight(q, magentaRed)).toBe(1);
    expect(qualifierWeight(q, orangeRed)).toBe(1);
  });
});

describe('Window', () => {
  it('원: 중심 1, 멀리 0, 경계에서 0.5 (페더 중앙)', () => {
    const w = win(defaultShape('circle'), { feather: 0.1 });
    expect(ww(w, 0.5, 0.5)).toBe(1);
    expect(ww(w, 0.95, 0.95)).toBe(0);
    expect(ww(w, 0.75, 0.5)).toBeCloseTo(0.5, 6);
  });

  it('원은 가로로 긴 사진에서도 원이다 (반경은 높이 기준)', () => {
    const w = win({ type: 'circle', cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.2, angle: 0 }, { feather: 0 });
    const aspect = 2;
    // 높이 0.19 아래 → 안, 가로로 0.19·높이 = 0.095 (가로 좌표) → 안
    expect(ww(w, 0.5, 0.69, aspect)).toBe(1);
    expect(ww(w, 0.5 + 0.19 / aspect, 0.5, aspect)).toBe(1);
    expect(ww(w, 0.5 + 0.21 / aspect, 0.5, aspect)).toBe(0);
  });

  it('회전한 사각형', () => {
    const w = win({ type: 'rect', cx: 0.5, cy: 0.5, w: 0.6, h: 0.1, angle: 90 }, { feather: 0 });
    // 90° 돌리면 세로로 긴 막대
    expect(ww(w, 0.5, 0.75)).toBe(1);
    expect(ww(w, 0.75, 0.5)).toBe(0);
  });

  it('그라디언트: 시작점 1, 끝점 0, 그 사이는 부드럽게', () => {
    const w = win(defaultShape('gradient'));
    expect(ww(w, 0.3, 0)).toBe(1);
    expect(ww(w, 0.3, 0.25)).toBeCloseTo(0.5, 6);
    expect(ww(w, 0.3, 0.6)).toBe(0);
  });

  it('폴리곤: 안 1, 밖 0, 점이 3개 미만이면 창이 꺼진 것과 같다', () => {
    const pts = [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }];
    const w = win({ type: 'polygon', points: pts, smooth: false }, { feather: 0.02 });
    expect(ww(w, 0.5, 0.5)).toBe(1);
    expect(ww(w, 0.05, 0.5)).toBe(0);
    expect(maskUniform(defaultQualifier(), win({ type: 'polygon', points: pts.slice(0, 2), smooth: false }))).toBeNull();
  });

  it('부드러운 곡선 폴리곤은 꼭짓점을 지나며 64개 이하로 펼쳐진다', () => {
    const pts = [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.3 }, { x: 0.6, y: 0.8 }];
    const v = polygonVertices(pts, true);
    expect(v.length).toBeLessThanOrEqual(64);
    expect(v.length).toBeGreaterThan(pts.length);
    for (const p of pts) expect(v.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-9)).toBe(true);
  });

  it('반전', () => {
    const w = win(defaultShape('circle'), { invert: true, feather: 0 });
    expect(ww(w, 0.5, 0.5)).toBe(0);
    expect(ww(w, 0.02, 0.02)).toBe(1);
  });
});

describe('노드 마스크', () => {
  const gain2 = { ...defaultPrimary(), gain: { x: 0, y: 0, master: 2 } };

  it('Qualifier: 녹색만 밝아지고 하늘은 그대로', () => {
    const u = toUniforms(gain2, { mask: maskUniform(greenQ(), defaultWindow()) });
    expect(gradePixel8([60, 140, 50], u)[1]).toBeGreaterThan(170);
    expect(gradePixel8([110, 160, 220], u)).toEqual([110, 160, 220]);
  });

  it('Window: 창 안만 보정, 밖은 그대로', () => {
    const u = toUniforms(gain2, { mask: maskUniform(defaultQualifier(), win(defaultShape('circle'), { feather: 0 })) });
    expect(gradePixel8([100, 100, 100], u, { u: 0.5, v: 0.5, aspect: 1.5 })[0]).toBeGreaterThan(130);
    expect(gradePixel8([100, 100, 100], u, { u: 0.02, v: 0.02, aspect: 1.5 })).toEqual([100, 100, 100]);
  });

  it('Qualifier와 Window를 함께 켜면 교집합', () => {
    const m = maskUniform(greenQ(), win(defaultShape('circle'), { feather: 0 }))!;
    const u = toUniforms(gain2, { mask: m });
    const leafIn = gradePixel8([60, 140, 50], u, { u: 0.5, v: 0.5, aspect: 1 });
    const leafOut = gradePixel8([60, 140, 50], u, { u: 0.02, v: 0.02, aspect: 1 });
    const skyIn = gradePixel8([110, 160, 220], u, { u: 0.5, v: 0.5, aspect: 1 });
    expect(leafIn[1]).toBeGreaterThan(170);
    expect(leafOut).toEqual([60, 140, 50]);
    expect(skyIn).toEqual([110, 160, 220]);
    expect(maskBits(m) & 0b100001).toBe(0b100001);
  });

  it('Qualifier는 노드에 들어오는 색으로 판정한다 (앞 노드의 영향을 받는다)', () => {
    // 앞 노드가 색상을 크게 돌려 녹색을 다른 색으로 바꾸면, 뒤 노드의 녹색 선택에 걸리지 않는다
    const rotate = toUniforms({ ...defaultPrimary(), hue: 120 });
    const masked = toUniforms(gain2, { mask: maskUniform(greenQ(), defaultWindow()) });
    const alone = gradePixel8([60, 140, 50], [rotate]);
    expect(gradePixel8([60, 140, 50], [rotate, masked])).toEqual(alone);
  });
});

describe('프리셋', () => {
  it('Qualifier·Window가 저장되고 다시 읽힌다', () => {
    const p = parsePreset(serializePreset(BUILTIN_PRESETS[2]));
    const sky = p.nodes.find((n) => n.name === '하늘')!;
    expect(sky.window.enabled).toBe(true);
    expect(sky.window.shape.type).toBe('gradient');
  });

  it('예전(Phase 3) 프리셋도 기본 마스크로 열린다', () => {
    const p = parsePreset('{"format":"green-grade-preset","version":1,"nodes":[{"name":"A"}]}');
    expect(p.nodes[0].qualifier.enabled).toBe(false);
    expect(p.nodes[0].window.enabled).toBe(false);
  });

  it('녹색 위치 상수와 Qualifier 색상축이 같은 기준이다', () => {
    expect(hslOf(lin8([0, 255, 0])).h).toBeCloseTo(SIX_VECTORS[2][1], 6);
  });
});
