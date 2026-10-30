import { describe, expect, it } from 'vitest';
import {
  applyGrain,
  computeBase,
  constrainCrop,
  cropValid,
  defaultDevelop,
  defaultGeometry,
  developReference,
  FULL_RECT,
  geometryMatrix,
  grainNoise,
  levelFromLine,
  mapPoint,
  maxCrop,
  outputSize,
  planDevelop,
  updateGeometry,
  type Develop,
  type Geometry,
  type PixelSource,
} from '../../src/engine/develop';

const W = 3000;
const H = 2000;
const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);
const geo = (patch: Partial<Geometry> = {}): Geometry => ({ ...defaultGeometry(), ...patch });
const dev = (detail: Partial<Develop['detail']> = {}, geometry: Partial<Geometry> = {}): Develop => {
  const d = defaultDevelop();
  return { geometry: { ...d.geometry, ...geometry }, detail: { ...d.detail, ...detail } };
};

/** 결정적인 의사 난수 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function image(w: number, h: number, f: (x: number, y: number) => [number, number, number]): PixelSource {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = f(x, y);
      const i = (y * w + x) * 4;
      data.set([c[0], c[1], c[2], 255], i);
    }
  return { data, width: w, height: h };
}

const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
/** 현상 결과(선형)의 휘도를 8bit 코드값으로 */
function luma8(out: Float32Array, i: number) {
  const s = [0, 1, 2].map((c) => toSrgb(Math.min(1, Math.max(0, out[i * 3 + c]))) * 255);
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
}

function std(values: number[]) {
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
}

describe('형태 행렬', () => {
  it('기본값은 좌표를 그대로 둔다', () => {
    const m = geometryMatrix(geo(), W, H);
    for (const [u, v] of [[0, 0], [0.3, 0.7], [1, 1]]) {
      const [x, y] = mapPoint(m, u, v);
      close(x, u);
      close(y, v);
    }
  });

  it('90° 회전·반전은 모서리를 제자리로 옮긴다', () => {
    // 시계 방향 90°: 결과의 좌상단 = 원본의 좌하단
    let [x, y] = mapPoint(geometryMatrix(geo({ rotate: 90 }), W, H), 0, 0);
    close(x, 0);
    close(y, 1);
    [x, y] = mapPoint(geometryMatrix(geo({ rotate: 270 }), W, H), 0, 0);
    close(x, 1);
    close(y, 0);
    [x, y] = mapPoint(geometryMatrix(geo({ rotate: 180 }), W, H), 0.25, 0);
    close(x, 0.75);
    close(y, 1);
    [x, y] = mapPoint(geometryMatrix(geo({ flipH: true }), W, H), 0.2, 0.3);
    close(x, 0.8);
    close(y, 0.3);
    [x, y] = mapPoint(geometryMatrix(geo({ flipV: true }), W, H), 0.2, 0.3);
    close(x, 0.2);
    close(y, 0.7);
    expect(outputSize(geo({ rotate: 90 }), W, H)).toEqual([H, W]);
  });

  it('수평 보정은 중심을 축으로 픽셀 공간에서 회전한다', () => {
    const g = geo({ straighten: 10 });
    const m = geometryMatrix(g, W, H, FULL_RECT);
    const [cx, cy] = mapPoint(m, 0.5, 0.5);
    close(cx, 0.5);
    close(cy, 0.5);
    // 프레임의 수평선 하나를 원본으로 돌려 보면 기울기가 −10°
    const [x0, y0] = mapPoint(m, 0.2, 0.5);
    const [x1, y1] = mapPoint(m, 0.8, 0.5);
    const deg = (Math.atan2((y1 - y0) * H, (x1 - x0) * W) * 180) / Math.PI;
    close(deg, -10, 1e-9);
  });

  it('원근 보정은 직선을 직선으로 두고, +면 위쪽을 넓힌다', () => {
    const m = geometryMatrix(geo({ vertical: 50 }), W, H, FULL_RECT);
    // 위쪽 모서리는 원본 안쪽(좁은 곳)을, 아래쪽 모서리는 원본 밖을 가리킨다
    expect(mapPoint(m, 0, 0)[0]).toBeGreaterThan(0.01);
    expect(mapPoint(m, 0, 1)[0]).toBeLessThan(-0.01);
    // 세 점이 한 직선 위에 남는다
    const pts = [0, 0.4, 1].map((t) => mapPoint(m, 0.1 + 0.8 * t, 0.2 + 0.5 * t));
    const cross = (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[1][1] - pts[0][1]) * (pts[2][0] - pts[0][0]);
    close(cross, 0, 1e-12);
  });
});

describe('크롭 제약', () => {
  it('기울이면 빈 모서리가 생기지 않는 가장 큰 크롭으로 줄어든다', () => {
    const g = geo({ straighten: 5 });
    expect(cropValid(g, W, H, FULL_RECT)).toBe(false);
    const c = maxCrop(g, W, H, W / H);
    expect(cropValid(g, W, H, c)).toBe(true);
    expect(c.w).toBeLessThan(1);
    // 조금만 키워도 원본 밖이 들어온다 (최대인지)
    expect(cropValid(g, W, H, { x: c.x - 0.002, y: c.y - 0.002, w: c.w + 0.004, h: c.h + 0.004 })).toBe(false);
    // 비율 유지
    close((c.w * W) / (c.h * H), W / H, 1e-6);
    expect(maxCrop(geo(), W, H, null)).toEqual(FULL_RECT);
  });

  it('비율을 고르면 그 픽셀 비율의 최대 크롭이 된다', () => {
    const g = updateGeometry(geo(), { aspect: '1:1' }, W, H);
    close((g.crop.w * W) / (g.crop.h * H), 1, 1e-9);
    close(g.crop.h, 1);
    const p = updateGeometry(geo(), { aspect: '4:5' }, W, H);
    close((p.crop.w * W) / (p.crop.h * H), 0.8, 1e-9);
    expect(outputSize(p, W, H)).toEqual([1600, 2000]);
  });

  it('직접 고친 크롭은 형태를 바꿔도 위치를 지키며 원본 안으로만 줄어든다', () => {
    let g = updateGeometry(geo({ aspect: 'free' }), { crop: { x: 0, y: 0, w: 0.4, h: 0.4 } }, W, H);
    expect(g.cropAuto).toBe(false);
    g = updateGeometry(g, { straighten: 3 }, W, H);
    expect(cropValid(g, W, H, g.crop)).toBe(true);
    expect(g.crop.x + g.crop.w / 2).toBeCloseTo(0.2, 6);
    expect(g.crop.w).toBeLessThan(0.4);
    // 프레임 밖으로 끈 크롭은 안으로 들어온다
    const c = constrainCrop(geo(), W, H, { x: 0.8, y: -0.1, w: 0.5, h: 0.5 });
    expect(c).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
  });

  it('90° 회전하면 크롭을 새 방향의 최대로 다시 잡는다', () => {
    const g = updateGeometry(updateGeometry(geo(), { aspect: '3:2' }, W, H), { rotate: 90 }, W, H);
    expect(outputSize(g, W, H)).toEqual([2000, 1333]);
  });

  it('기준선이 수평·수직이 되도록 수평 값을 구한다', () => {
    const t = Math.tan((4 * Math.PI) / 180);
    expect(levelFromLine(0, 100, 100 * t)).toBeCloseTo(-4, 6);
    expect(levelFromLine(0, -100, -100 * t)).toBeCloseTo(-4, 6);
    expect(levelFromLine(2, 100, -100 * t)).toBeCloseTo(6, 6);
    // 거의 수직인 기둥: 오른쪽으로 3° 기울어 내려간 선
    const v = Math.tan((3 * Math.PI) / 180);
    expect(levelFromLine(0, -100 * v, 100)).toBeCloseTo(-3, 6);
  });
});

describe('현상 기준 구현', () => {
  const noise = rng(7);
  const flatNoisy = image(48, 32, () => {
    const n = (noise() - 0.5) * 40;
    return [120 + n, 128 + n, 110 + n];
  });
  const edge = image(48, 32, (x) => (x < 24 ? [60, 70, 60] : [180, 190, 170]));

  it('형태·디테일이 없으면 원본을 그대로 낸다', () => {
    const out = developReference(edge, planDevelop(defaultDevelop(), 48, 32, 1), null);
    expect(luma8(out, 3)).toBeCloseTo(0.2126 * 60 + 0.7152 * 70 + 0.0722 * 60, 3);
    expect(luma8(out, 40)).toBeCloseTo(0.2126 * 180 + 0.7152 * 190 + 0.0722 * 170, 3);
  });

  it('좌우 반전은 픽셀 순서를 정확히 뒤집는다', () => {
    const plan = planDevelop(dev({}, { flipH: true }), 48, 32, 1);
    const a = developReference(edge, planDevelop(defaultDevelop(), 48, 32, 1), null);
    const b = developReference(edge, plan, null);
    for (const x of [0, 10, 30, 47]) expect(b[(5 * 48 + x) * 3]).toBeCloseTo(a[(5 * 48 + 47 - x) * 3], 6);
  });

  it('샤프닝은 경계의 대비만 키우고 평평한 곳은 그대로 둔다', () => {
    const base = developReference(edge, planDevelop(defaultDevelop(), 48, 32, 1), null);
    const sharp = developReference(edge, planDevelop(dev({ sharpen: 100, sharpenRadius: 1 }), 48, 32, 1), null);
    const row = 16 * 48;
    expect(luma8(sharp, row + 23)).toBeLessThan(luma8(base, row + 23) - 3);
    expect(luma8(sharp, row + 24)).toBeGreaterThan(luma8(base, row + 24) + 3);
    expect(Math.abs(luma8(sharp, row + 5) - luma8(base, row + 5))).toBeLessThan(0.01);
  });

  it('샤프닝 마스킹은 작은 굴곡(노이즈)은 덜 날카롭게 하고 경계는 그대로 날카롭게 한다', () => {
    const r = rng(5);
    const grainy = image(48, 32, () => {
      const n = (r() - 0.5) * 12;
      return [120 + n, 128 + n, 110 + n];
    });
    const lum = (out: Float32Array) => Array.from({ length: 48 * 32 }, (_, i) => luma8(out, i));
    const plain = std(lum(developReference(grainy, planDevelop(dev({ sharpen: 120 }), 48, 32, 1), null)));
    const masked = std(lum(developReference(grainy, planDevelop(dev({ sharpen: 120, sharpenMasking: 100 }), 48, 32, 1), null)));
    expect(masked).toBeLessThan(plain * 0.85);
    const a = developReference(edge, planDevelop(dev({ sharpen: 120 }), 48, 32, 1), null);
    const b = developReference(edge, planDevelop(dev({ sharpen: 120, sharpenMasking: 100 }), 48, 32, 1), null);
    expect(Math.abs(luma8(a, 16 * 48 + 24) - luma8(b, 16 * 48 + 24))).toBeLessThan(2);
  });

  it('휘도 노이즈 감소는 평평한 곳의 잡티를 줄이고 경계는 지킨다', () => {
    const lum = (out: Float32Array) => Array.from({ length: 48 * 32 }, (_, i) => luma8(out, i));
    const before = std(lum(developReference(flatNoisy, planDevelop(defaultDevelop(), 48, 32, 1), null)));
    const after = std(lum(developReference(flatNoisy, planDevelop(dev({ noiseLuma: 100 }), 48, 32, 1), null)));
    expect(after).toBeLessThan(before * 0.6);
    const e = developReference(edge, planDevelop(dev({ noiseLuma: 100 }), 48, 32, 1), null);
    expect(luma8(e, 16 * 48 + 24) - luma8(e, 16 * 48 + 23)).toBeGreaterThan(100);
  });

  it('색상 노이즈 감소는 색 얼룩을 줄이고 밝기는 거의 그대로 둔다', () => {
    const r = rng(3);
    const blotchy = image(48, 32, () => {
      const a = (r() - 0.5) * 50;
      return [128 + a, 128, 128 - a];
    });
    const chroma = (out: Float32Array) => Array.from({ length: 48 * 32 }, (_, i) => out[i * 3] - out[i * 3 + 2]);
    const before = developReference(blotchy, planDevelop(defaultDevelop(), 48, 32, 1), null);
    const after = developReference(blotchy, planDevelop(dev({ noiseColor: 100 }), 48, 32, 1), null);
    expect(std(chroma(after))).toBeLessThan(std(chroma(before)) * 0.5);
    const meanL = (o: Float32Array) => Array.from({ length: 48 * 32 }, (_, i) => luma8(o, i)).reduce((a, b) => a + b) / (48 * 32);
    expect(Math.abs(meanL(after) - meanL(before))).toBeLessThan(1);
  });

  it('선명도 +는 중간톤의 국소 대비를, −는 반대로 줄인다', () => {
    // 선명도 반경은 긴 변의 약 1.2% → 200px에서 σ ≈ 2.4px. 그보다 조금 큰 무늬를 쓴다.
    const blobs = image(200, 130, (x, y) => {
      const v = 128 + 50 * Math.sin(x / 2.5) * Math.cos(y / 3);
      return [v, v, v];
    });
    const lum = (out: Float32Array) => Array.from({ length: 200 * 130 }, (_, i) => luma8(out, i));
    const run = (clarity: number) => {
      const d = dev({ clarity });
      const p = planDevelop(d, 200, 130, 1);
      return std(lum(developReference(blobs, p, computeBase(blobs, d.geometry, 200, 130))));
    };
    const s0 = run(0);
    expect(run(60)).toBeGreaterThan(s0 * 1.05);
    expect(run(-60)).toBeLessThan(s0 * 0.95);
  });

  it('텍스처 +는 중간 크기 굴곡을 키운다', () => {
    const r = rng(11);
    const leaves = image(96, 64, (x, y) => {
      const v = 120 + 25 * Math.sin(x * 0.9 + r()) * Math.sin(y * 0.8);
      return [v * 0.7, v, v * 0.6];
    });
    const lum = (out: Float32Array) => Array.from({ length: 96 * 64 }, (_, i) => luma8(out, i));
    const plan = (texture: number) => planDevelop(dev({ texture }), 96, 64, 1);
    // 이 크기에서는 σ가 너무 작으므로 원본이 크다고 가정한 계획을 쓴다
    const big = (texture: number) => ({ ...plan(texture), du: { ...plan(texture).du, texture: [texture / 100, 2, 6] as [number, number, number] } });
    expect(std(lum(developReference(leaves, big(80), null)))).toBeGreaterThan(std(lum(developReference(leaves, big(0), null))) * 1.05);
  });

  it('디헤이즈 +는 뿌연 사진의 대비를 키우고 검은 바닥을 내린다', () => {
    const hazy = image(96, 64, (x, y) => {
      const v = 150 + 40 * Math.sin(x / 6) * Math.sin(y / 5);
      return [v + 10, v + 15, v + 25];
    });
    const lum = (out: Float32Array) => Array.from({ length: 96 * 64 }, (_, i) => luma8(out, i));
    const run = (dehaze: number) => {
      const d = dev({ dehaze });
      return lum(developReference(hazy, planDevelop(d, 96, 64, 1), computeBase(hazy, d.geometry, 96, 64)));
    };
    const a = run(0);
    const b = run(80);
    expect(std(b)).toBeGreaterThan(std(a) * 1.2);
    expect(Math.min(...b)).toBeLessThan(Math.min(...a) - 10);
    expect(std(run(-60))).toBeLessThan(std(a));
  });

  it('기준 격자는 보이는 영역의 비율을 따른다', () => {
    const src = image(64, 32, () => [100, 120, 90]);
    const g = updateGeometry(geo(), { aspect: '1:1' }, 64, 32);
    const b = computeBase(src, g, 64, 32);
    expect(b.width).toBe(b.height);
    expect(b.airlight.every((v) => v >= 0.2 && v <= 1)).toBe(true);
  });
});

describe('그레인', () => {
  it('좌표로 정해지는 노이즈라 같은 위치는 항상 같은 값이고, 평균은 0 근처', () => {
    expect(grainNoise(12.3, 45.6)).toBe(grainNoise(12.3, 45.6));
    const vals: number[] = [];
    for (let i = 0; i < 4000; i++) vals.push(grainNoise((i % 80) * 0.73, Math.floor(i / 80) * 0.61));
    const mean = vals.reduce((a, b) => a + b) / vals.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(std(vals)).toBeGreaterThan(0.2);
    expect(Math.max(...vals.map(Math.abs))).toBeLessThan(1.7);
  });

  it('양이 0이면 그대로, 크면 중간톤에 가장 세게', () => {
    const g = { amount: 0, scale: [500, 300] as [number, number] };
    expect(applyGrain([0.5, 0.5, 0.5], 0.3, 0.4, g)).toEqual([0.5, 0.5, 0.5]);
    const on = { amount: 1, scale: [500, 300] as [number, number] };
    let mid = 0;
    let dark = 0;
    for (let i = 0; i < 500; i++) {
      const u = (i * 0.137) % 1;
      const v = (i * 0.291) % 1;
      mid += Math.abs(applyGrain([0.5, 0.5, 0.5], u, v, on)[0] - 0.5);
      dark += Math.abs(applyGrain([0.02, 0.02, 0.02], u, v, on)[0] - 0.02);
    }
    expect(mid).toBeGreaterThan(dark * 2);
  });

  it('알갱이 크기는 원본 해상도 기준이라 크롭해도 같은 크기', () => {
    const d = dev({ grain: 50, grainSize: 100 }, { aspect: '1:1' });
    const g = updateGeometry(d.geometry, { aspect: '1:1' }, W, H);
    const full = planDevelop(dev({ grain: 50 }), W, H, 1).grain;
    const crop = planDevelop({ ...d, geometry: g }, W, H, 1).grain;
    // 한 칸의 픽셀 크기 = 출력 픽셀 / 배율
    close(W / full.scale[0], (g.crop.w * W) / crop.scale[0], 1e-9);
  });
});
