import { describe, expect, it } from 'vitest';
import { inpaint } from '../../src/engine/inpaint';

function img(w: number, h: number, f: (x: number, y: number) => [number, number, number]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) d.set([...f(x, y), 255], (y * w + x) * 4);
  return d;
}
function rect(w: number, h: number, x0: number, y0: number, x1: number, y1: number) {
  const m = new Uint8Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * w + x] = 1;
  return m;
}
function hash(x: number, y: number) {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

describe('지우개 (내용 인식 채우기)', () => {
  it('한 가지 색 바탕의 구멍은 그 색으로 정확히 메운다', () => {
    const w = 80;
    const h = 60;
    const src = img(w, h, () => [90, 140, 60]);
    const mask = rect(w, h, 30, 20, 50, 40);
    const o = inpaint(src, w, h, mask);
    for (let i = 0; i < w * h; i++) {
      expect(o[i * 4]).toBe(90);
      expect(o[i * 4 + 1]).toBe(140);
    }
  });

  it('줄무늬는 번지지 않고 무늬를 이어 그린다', () => {
    const w = 120;
    const h = 90;
    const stripe = (x: number): [number, number, number] => (Math.floor(x / 6) % 2 ? [200, 200, 200] : [40, 40, 40]);
    const truth = img(w, h, (x) => stripe(x));
    const src = img(w, h, (x, y) => (x >= 50 && x < 74 && y >= 30 && y < 60 ? [255, 0, 0] : stripe(x)));
    const mask = rect(w, h, 50, 30, 74, 60);
    const o = inpaint(src, w, h, mask);
    let err = 0;
    let n = 0;
    let contrast = 0;
    for (let y = 30; y < 60; y++)
      for (let x = 50; x < 74; x++) {
        const i = (y * w + x) * 4;
        err += Math.abs(o[i] - truth[i]);
        n++;
        contrast = Math.max(contrast, o[i]);
      }
    // 평균 오차가 무늬 대비(160)의 15% 이하, 그리고 회색으로 뭉개지지 않는다
    expect(err / n).toBeLessThan(24);
    expect(contrast).toBeGreaterThan(170);
  });

  it('잔디 위 빨간 물체를 지우면 빨강이 남지 않고 잔디 질감이 남는다', () => {
    const w = 160;
    const h = 120;
    const grass = (x: number, y: number): [number, number, number] => {
      const n = hash(x, y) * 50 - 25;
      return [60 + n, 120 + n, 40 + n * 0.5];
    };
    const src = img(w, h, (x, y) => (Math.hypot(x - 80, y - 60) < 14 ? [220, 30, 40] : grass(x, y)));
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - 80, y - 60) < 17) mask[y * w + x] = 1;
    const t0 = performance.now();
    const o = inpaint(src, w, h, mask);
    const ms = performance.now() - t0;
    let red = 0;
    const g: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        const i = (y * w + x) * 4;
        if (o[i] > o[i + 1]) red++;
        g.push(o[i + 1]);
      }
    expect(red).toBe(0);
    const mean = g.reduce((a, b) => a + b) / g.length;
    const sd = Math.sqrt(g.reduce((a, b) => a + (b - mean) ** 2, 0) / g.length);
    expect(Math.abs(mean - 120)).toBeLessThan(10);
    // 평평하게 번지지 않고 잡티(질감)가 남는다 (원래 잔디 표준편차 ≈ 14)
    expect(sd).toBeGreaterThan(6);
    expect(ms).toBeLessThan(5000);
  });

  it('구멍 밖 픽셀은 바꾸지 않고, 같은 입력이면 같은 결과', () => {
    const w = 64;
    const h = 48;
    const src = img(w, h, (x, y) => [x * 3, y * 4, 100]);
    const mask = rect(w, h, 20, 15, 34, 30);
    const a = inpaint(src, w, h, mask);
    const b = inpaint(src, w, h, mask);
    expect(Array.from(a)).toEqual(Array.from(b));
    for (let i = 0; i < w * h; i++) if (!mask[i]) expect(a[i * 4]).toBe(src[i * 4]);
  });
});
