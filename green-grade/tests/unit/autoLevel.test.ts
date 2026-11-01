import { describe, expect, it } from 'vitest';
import { autoStraighten, detectTilt, MIN_CONFIDENCE } from '../../src/engine/autoLevel';
import { defaultGeometry, type PixelSource } from '../../src/engine/develop';

/** 하늘과 땅을 가르는 지평선이 deg만큼 (시계 방향) 기운 사진, 기둥 몇 개 포함 */
function scene(w: number, h: number, deg: number, posts = true): PixelSource {
  const t = Math.tan((deg * Math.PI) / 180);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const horizon = h * 0.45 + (x - w / 2) * t;
      let c = y < horizon ? [150, 190, 230] : [70, 110, 50];
      // 기둥: 기울어진 좌표계에서 세로선
      const xr = (x - w / 2) * Math.cos((deg * Math.PI) / 180) + (y - h / 2) * Math.sin((deg * Math.PI) / 180);
      if (posts && y > horizon && Math.abs(((xr % 90) + 90) % 90 - 45) < 4) c = [200, 190, 170];
      // 약간의 잡티 (방향이 없는 해시)
      let hsh = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
      hsh = Math.imul(hsh ^ (hsh >>> 13), 0x5bd1e995);
      const n = (((hsh ^ (hsh >>> 15)) >>> 0) % 17) - 8;
      data.set([c[0] + n, c[1] + n, c[2] + n, 255], (y * w + x) * 4);
    }
  return { data, width: w, height: h };
}

describe('자동 수평', () => {
  it.each([3, -4.5, 7, 0])('지평선이 %s° 기운 사진을 0.3° 안으로 찾는다', (deg) => {
    const r = autoStraighten(scene(600, 400, deg), defaultGeometry(), 3000, 2000);
    expect(Math.abs(r.straighten + deg)).toBeLessThanOrEqual(0.3);
    expect(r.confidence).toBeGreaterThan(MIN_CONFIDENCE);
  });
  it('기둥만 있어도 수직선으로 찾는다', () => {
    const w = 400;
    const h = 400;
    const deg = 4;
    const data = new Float32Array(w * h);
    const s = Math.sin((deg * Math.PI) / 180);
    const c = Math.cos((deg * Math.PI) / 180);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const xr = (x - w / 2) * c + (y - h / 2) * s;
        data[y * w + x] = Math.abs(((xr % 60) + 60) % 60 - 30) < 6 ? 0.8 : 0.3;
      }
    expect(Math.abs(detectTilt(data, w, h).tilt - deg)).toBeLessThanOrEqual(0.3);
  });
  it('직선이 없는 사진은 확신이 낮다', () => {
    const w = 300;
    const h = 200;
    const g = new Float32Array(w * h);
    let s = 1;
    for (let i = 0; i < g.length; i++) {
      s = (s * 16807) % 2147483647;
      g[i] = (s % 1000) / 1000;
    }
    expect(detectTilt(g, w, h).confidence).toBeLessThan(MIN_CONFIDENCE);
  });
});
