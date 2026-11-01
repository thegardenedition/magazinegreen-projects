// 지우개: 칠한 곳을 주변 질감으로 메운다 (내용 인식 채우기). 생성형 AI가 아니라 사진 안의 다른 부분을 가져온다.
// Wexler 등의 다단계 PatchMatch 채우기:
//  1) 사진과 구멍을 2배씩 줄인 피라미드를 만든다
//  2) 가장 작은 단계는 둘레 색을 안쪽으로 번지게 해 초기값을 채운다
//  3) 단계마다: 구멍에 걸친 7×7 조각마다 구멍 밖에서 가장 닮은 조각을 찾고(PatchMatch: 전파 + 무작위 탐색),
//     겹치는 조각들이 투표해 구멍 픽셀을 다시 정한다. 몇 번 되풀이한 뒤 한 단계 큰 쪽으로 올린다.
// 결과는 결정적이다 (고정 시드 난수).

const R = 3; // 조각 반지름 (7×7)

interface Level {
  w: number;
  h: number;
  /** RGB 0–1 */
  img: Float32Array;
  /** 1 = 메울 곳 */
  hole: Uint8Array;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function downsample(l: Level): Level {
  const w = Math.max(1, l.w >> 1);
  const h = Math.max(1, l.h >> 1);
  const img = new Float32Array(w * h * 3);
  const hole = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let n = 0;
      const acc = [0, 0, 0];
      let anyHole = 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(l.w - 1, 2 * x + dx);
          const sy = Math.min(l.h - 1, 2 * y + dy);
          const i = sy * l.w + sx;
          if (l.hole[i]) anyHole = 1;
          else {
            for (let c = 0; c < 3; c++) acc[c] += l.img[i * 3 + c];
            n++;
          }
        }
      const o = y * w + x;
      // 자식 중 하나라도 구멍이면 구멍 (구멍이 줄어들며 사라지지 않게)
      hole[o] = anyHole;
      for (let c = 0; c < 3; c++) img[o * 3 + c] = n ? acc[c] / n : 0;
    }
  return { w, h, img, hole };
}

/** 구멍을 둘레의 알려진 색으로 바깥부터 한 겹씩 채운다 (가장 작은 단계의 초기값) */
function diffuseFill(l: Level) {
  const { w, h, img } = l;
  const known = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) known[i] = l.hole[i] ? 0 : 1;
  let remaining = l.hole.reduce((a, b) => a + b, 0);
  if (remaining === w * h) return; // 알려진 곳이 없음
  while (remaining > 0) {
    const next: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (known[i]) continue;
        const acc = [0, 0, 0];
        let n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (!known[j]) continue;
          for (let c = 0; c < 3; c++) acc[c] += img[j * 3 + c];
          n++;
        }
        if (n) {
          for (let c = 0; c < 3; c++) img[i * 3 + c] = acc[c] / n;
          next.push(i);
        }
      }
    if (!next.length) break;
    for (const i of next) known[i] = 1;
    remaining -= next.length;
  }
}

/** 조각 전체가 구멍 밖에 있는 중심인지 */
function validSources(l: Level): Uint8Array {
  const { w, h, hole } = l;
  const ok = new Uint8Array(w * h);
  // 구멍과의 거리가 R보다 먼 곳만 (가로·세로 최소 필터)
  const rowNear = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let near = 0;
      for (let dx = -R; dx <= R && !near; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < w && hole[y * w + xx]) near = 1;
      }
      rowNear[y * w + x] = near;
    }
  for (let y = R; y < h - R; y++)
    for (let x = R; x < w - R; x++) {
      let near = 0;
      for (let dy = -R; dy <= R && !near; dy++) if (rowNear[(y + dy) * w + x]) near = 1;
      ok[y * w + x] = near ? 0 : 1;
    }
  return ok;
}

/** 구멍에서 R 이내(조각이 구멍에 걸치는 중심) */
function targets(l: Level): Int32Array {
  const { w, h, hole } = l;
  const list: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let near = 0;
      for (let dy = -R; dy <= R && !near; dy++)
        for (let dx = -R; dx <= R && !near; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && hole[yy * w + xx]) near = 1;
        }
      if (near) list.push(y * w + x);
    }
  return Int32Array.from(list);
}

function patchDist(l: Level, tx: number, ty: number, sx: number, sy: number, limit: number): number {
  const { w, h, img } = l;
  let d = 0;
  for (let dy = -R; dy <= R; dy++) {
    const ay = Math.min(h - 1, Math.max(0, ty + dy));
    const by = sy + dy;
    for (let dx = -R; dx <= R; dx++) {
      const ax = Math.min(w - 1, Math.max(0, tx + dx));
      const a = (ay * w + ax) * 3;
      const b = (by * w + sx + dx) * 3;
      const e0 = img[a] - img[b];
      const e1 = img[a + 1] - img[b + 1];
      const e2 = img[a + 2] - img[b + 2];
      d += e0 * e0 + e1 * e1 + e2 * e2;
    }
    if (d > limit) return d;
  }
  return d;
}

/** 한 단계에서 PatchMatch + 투표를 iters번 */
function solveLevel(l: Level, nnfIn: Int32Array | null, iters: number, rand: () => number): Int32Array {
  const { w, h, img, hole } = l;
  const valid = validSources(l);
  const validList: number[] = [];
  for (let i = 0; i < w * h; i++) if (valid[i]) validList.push(i);
  const tg = targets(l);
  // nnf[i] = 원천 중심의 인덱스 (대상 i마다), -1이면 없음
  const nnf = nnfIn ?? new Int32Array(w * h).fill(-1);
  const dist = new Float32Array(w * h).fill(Infinity);
  if (!validList.length) return nnf;
  const randomValid = () => validList[Math.floor(rand() * validList.length)];
  for (const t of tg) {
    if (nnf[t] < 0 || !valid[nnf[t]]) nnf[t] = randomValid();
  }
  const isTarget = new Uint8Array(w * h);
  for (const t of tg) isTarget[t] = 1;

  for (let it = 0; it < iters; it++) {
    for (const t of tg) dist[t] = patchDist(l, t % w, (t / w) | 0, nnf[t] % w, (nnf[t] / w) | 0, Infinity);
    // PatchMatch: 홀수 회차는 거꾸로 돌며 전파
    const order = it % 2 === 0 ? tg : Int32Array.from(tg).reverse();
    const step = it % 2 === 0 ? -1 : 1;
    for (const t of order) {
      const tx = t % w;
      const ty = (t / w) | 0;
      const tryCand = (s: number) => {
        if (s < 0 || s >= w * h || !valid[s] || s === nnf[t]) return;
        const d = patchDist(l, tx, ty, s % w, (s / w) | 0, dist[t]);
        if (d < dist[t]) {
          dist[t] = d;
          nnf[t] = s;
        }
      };
      // 전파: 이웃 대상의 짝을 한 칸 옮겨 본다
      const nx = tx + step;
      if (nx >= 0 && nx < w && isTarget[ty * w + nx]) {
        const s = nnf[ty * w + nx];
        if (s >= 0) tryCand(s - step);
      }
      const ny = ty + step;
      if (ny >= 0 && ny < h && isTarget[ny * w + tx]) {
        const s = nnf[ny * w + tx];
        if (s >= 0) tryCand(s - step * w);
      }
      // 무작위 탐색: 지금 짝 둘레를 반경을 반씩 줄이며
      let rad = Math.max(w, h);
      const cx = nnf[t] % w;
      const cy = (nnf[t] / w) | 0;
      while (rad >= 1) {
        const sx = Math.round(cx + (rand() * 2 - 1) * rad);
        const sy = Math.round(cy + (rand() * 2 - 1) * rad);
        if (sx >= 0 && sy >= 0 && sx < w && sy < h) tryCand(sy * w + sx);
        rad >>= 1;
      }
    }
    // 투표: 구멍 픽셀을, 그 픽셀을 덮는 조각들의 짝이 말하는 색의 가중 평균으로
    const acc = new Float32Array(w * h * 4);
    let sigma = 0;
    let ns = 0;
    for (const t of tg) {
      if (Number.isFinite(dist[t])) {
        sigma += dist[t];
        ns++;
      }
    }
    sigma = Math.max(1e-4, ns ? sigma / ns : 1);
    for (const t of tg) {
      const s = nnf[t];
      if (s < 0) continue;
      const tx = t % w;
      const ty = (t / w) | 0;
      const sx = s % w;
      const sy = (s / w) | 0;
      const wt = Math.exp(-dist[t] / (2 * sigma));
      for (let dy = -R; dy <= R; dy++) {
        const py = ty + dy;
        if (py < 0 || py >= h) continue;
        for (let dx = -R; dx <= R; dx++) {
          const px = tx + dx;
          if (px < 0 || px >= w) continue;
          const p = py * w + px;
          if (!hole[p]) continue;
          const q = ((sy + dy) * w + sx + dx) * 3;
          acc[p * 4] += wt * img[q];
          acc[p * 4 + 1] += wt * img[q + 1];
          acc[p * 4 + 2] += wt * img[q + 2];
          acc[p * 4 + 3] += wt;
        }
      }
    }
    for (let p = 0; p < w * h; p++) {
      if (!hole[p] || acc[p * 4 + 3] <= 0) continue;
      for (let c = 0; c < 3; c++) img[p * 3 + c] = acc[p * 4 + c] / acc[p * 4 + 3];
    }
  }
  return nnf;
}

/**
 * RGBA 8bit 이미지의 구멍(mask = 1)을 메운다. 구멍 밖 픽셀은 그대로 둔다.
 * 수십만 픽셀 크기를 전제로 한다 (더 큰 영역은 줄여서 부른다).
 */
export function inpaint(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, mask: Uint8Array, seed = 1): Uint8ClampedArray {
  const base: Level = { w, h, img: new Float32Array(w * h * 3), hole: new Uint8Array(mask) };
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) base.img[i * 3 + c] = rgba[i * 4 + c] / 255;
  const out = new Uint8ClampedArray(rgba);
  if (!mask.some((v) => v)) return out;

  // 피라미드: 가장 작은 단계의 짧은 변이 조각 몇 개 크기쯤이 될 때까지
  const levels: Level[] = [base];
  while (Math.min(levels[levels.length - 1].w, levels[levels.length - 1].h) > 4 * (2 * R + 1) && levels.length < 8) {
    levels.push(downsample(levels[levels.length - 1]));
  }
  const rand = rng(seed);
  let nnf: Int32Array | null = null;
  for (let li = levels.length - 1; li >= 0; li--) {
    const l = levels[li];
    if (li === levels.length - 1) {
      diffuseFill(l);
    } else {
      // 한 단계 작은 결과를 키워 구멍의 초기값으로, 짝(NNF)도 두 배 좌표로 옮긴다
      const c = levels[li + 1];
      for (let y = 0; y < l.h; y++)
        for (let x = 0; x < l.w; x++) {
          const i = y * l.w + x;
          if (!l.hole[i]) continue;
          const j = Math.min(c.h - 1, y >> 1) * c.w + Math.min(c.w - 1, x >> 1);
          for (let k = 0; k < 3; k++) l.img[i * 3 + k] = c.img[j * 3 + k];
        }
      if (nnf) {
        const up = new Int32Array(l.w * l.h).fill(-1);
        for (let y = 0; y < l.h; y++)
          for (let x = 0; x < l.w; x++) {
            const j = Math.min(c.h - 1, y >> 1) * c.w + Math.min(c.w - 1, x >> 1);
            const s = nnf[j];
            if (s < 0) continue;
            const sx = Math.min(l.w - 1, (s % c.w) * 2 + (x & 1));
            const sy = Math.min(l.h - 1, ((s / c.w) | 0) * 2 + (y & 1));
            up[y * l.w + x] = sy * l.w + sx;
          }
        nnf = up;
      }
    }
    const iters = li === 0 ? 3 : li === levels.length - 1 ? 8 : 5;
    nnf = solveLevel(l, nnf, iters, rand);
  }
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(Math.min(1, Math.max(0, base.img[i * 3 + c])) * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}
