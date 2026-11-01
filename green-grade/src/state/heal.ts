// 지우개: 칠한 곳을 주변 질감으로 메운 조각을 만들어 사진의 형태·디테일 값(develop.heal)에 쌓는다.
// 미리보기 축소본과 내보내기 원본 모두 같은 조각을 덮어 쓴다.

import { create } from 'zustand';
import type { HealPatch } from '../engine/develop';
import { decodeFull, makeBaseSource, type LoadedImage } from '../engine/image';
import { inpaint } from '../engine/inpaint';
import { useGrade } from './store';

/** 칠한 원 하나 (원본 픽셀 좌표) */
export interface BrushDab {
  x: number;
  y: number;
  r: number;
}

/** 지우개 한 번에 계산하는 영역의 최대 픽셀 수 (넘으면 줄여서 계산하고 키워 덮는다) */
export const HEAL_MAX_PIXELS = 360_000;

export const useHeal = create<{ busy: boolean; error: string | null }>(() => ({ busy: false, error: null }));

/** 비트맵(원본 또는 축소본) 위에 조각들을 덮은 새 비트맵. 조각이 없으면 그대로 돌려준다. */
export async function composeHeal(bmp: ImageBitmap, patches: HealPatch[] | undefined, fullW: number, fullH: number): Promise<ImageBitmap> {
  if (!patches?.length) return bmp;
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  const kx = bmp.width / fullW;
  const ky = bmp.height / fullH;
  for (const p of patches) {
    const pc = new OffscreenCanvas(p.pw, p.ph);
    pc.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.pw, p.ph), 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(pc, p.x * kx, p.y * ky, p.w * kx, p.h * ky);
  }
  return createImageBitmap(c, { premultiplyAlpha: 'none' });
}

let worker: Worker | null = null;

/** 채우기 계산 (가능하면 작업 스레드에서) */
function runInpaint(rgba: Uint8ClampedArray, w: number, h: number, mask: Uint8Array): Promise<Uint8ClampedArray> {
  if (typeof Worker === 'undefined') return Promise.resolve(inpaint(rgba, w, h, mask));
  try {
    worker ??= new Worker(new URL('../engine/inpaintWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return Promise.resolve(inpaint(rgba, w, h, mask));
  }
  const wk = worker;
  return new Promise((resolve, reject) => {
    wk.onmessage = (e) => resolve(e.data as Uint8ClampedArray);
    wk.onerror = (e) => reject(new Error(e.message || '지우개 계산에 실패했습니다.'));
    wk.postMessage({ rgba, w, h, mask }, [rgba.buffer, mask.buffer]);
  });
}

/** 마스크를 살짝 번지게 해 알파로 (경계가 티 나지 않게) */
function featherAlpha(mask: Uint8Array, w: number, h: number): Uint8ClampedArray {
  const a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = mask[i];
  for (let pass = 0; pass < 2; pass++) {
    const t = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            s += a[yy * w + xx];
            n++;
          }
        t[y * w + x] = s / n;
      }
    a.set(t);
  }
  const out = new Uint8ClampedArray(w * h);
  // 칠한 곳은 완전히 덮고, 바깥 두어 픽셀만 부드럽게 줄어든다
  for (let i = 0; i < w * h; i++) out[i] = mask[i] ? 255 : Math.round(Math.min(1, a[i] * 2) * 255);
  return out;
}

/** 칠한 원들을 메운다. 영역을 원본 해상도에서 잘라(크면 줄여) 계산하고 조각으로 쌓는다. */
export async function erase(dabs: BrushDab[]) {
  const s = useGrade.getState();
  const img = s.image;
  if (!img || !dabs.length || useHeal.getState().busy) return;
  useHeal.setState({ busy: true, error: null });
  let full: ImageBitmap | null = null;
  let composed: ImageBitmap | null = null;
  let cropped: ImageBitmap | null = null;
  try {
    const maxR = Math.max(...dabs.map((d) => d.r));
    const margin = Math.max(24, maxR * 2.5);
    const x0 = Math.max(0, Math.floor(Math.min(...dabs.map((d) => d.x - d.r)) - margin));
    const y0 = Math.max(0, Math.floor(Math.min(...dabs.map((d) => d.y - d.r)) - margin));
    const x1 = Math.min(img.width, Math.ceil(Math.max(...dabs.map((d) => d.x + d.r)) + margin));
    const y1 = Math.min(img.height, Math.ceil(Math.max(...dabs.map((d) => d.y + d.r)) + margin));
    const rw = x1 - x0;
    const rh = y1 - y0;
    if (rw < 4 || rh < 4) return;
    const k = Math.min(1, Math.sqrt(HEAL_MAX_PIXELS / (rw * rh)));
    const pw = Math.max(8, Math.round(rw * k));
    const ph = Math.max(8, Math.round(rh * k));

    // 원본(앞서 지운 조각 포함)에서 영역을 잘라 온다
    full = await decodeFull(img.file);
    const heal = useGrade.getState().develop.heal;
    composed = await composeHeal(full, heal, img.width, img.height);
    cropped = await createImageBitmap(composed, x0, y0, rw, rh, { resizeWidth: pw, resizeHeight: ph, resizeQuality: 'high', premultiplyAlpha: 'none' });
    const c = new OffscreenCanvas(pw, ph);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(cropped, 0, 0);
    const rgba = ctx.getImageData(0, 0, pw, ph).data;

    const mask = new Uint8Array(pw * ph);
    const sx = pw / rw;
    const sy = ph / rh;
    for (const d of dabs) {
      const cx = (d.x - x0) * sx;
      const cy = (d.y - y0) * sy;
      const r = d.r * sx + 1; // 칠한 곳보다 한 픽셀 넉넉히
      for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(ph, Math.ceil(cy + r)); y++)
        for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(pw, Math.ceil(cx + r)); x++) {
          if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) mask[y * pw + x] = 1;
        }
    }
    const alpha = featherAlpha(mask, pw, ph);
    const filled = await runInpaint(new Uint8ClampedArray(rgba), pw, ph, mask);
    for (let i = 0; i < pw * ph; i++) filled[i * 4 + 3] = alpha[i];
    const patch: HealPatch = { x: x0, y: y0, w: rw, h: rh, pw, ph, data: filled };
    // 계산하는 동안 사진이 바뀌었으면 버린다
    if (useGrade.getState().image !== img && useGrade.getState().image?.file !== img.file) return;
    useGrade.setState((st) => ({ develop: { ...st.develop, heal: [...(st.develop.heal ?? []), patch] } }));
  } catch (e) {
    useHeal.setState({ error: (e as Error).message });
  } finally {
    cropped?.close();
    if (composed && composed !== full) composed.close();
    full?.close();
    useHeal.setState({ busy: false });
  }
}

export function undoLastHeal() {
  useGrade.setState((st) => ({ develop: { ...st.develop, heal: (st.develop.heal ?? []).slice(0, -1) } }));
}

export function clearHeal() {
  useGrade.setState((st) => ({ develop: { ...st.develop, heal: [] } }));
}

// 지우개 조각이 바뀌면 미리보기 축소본(과 선명도·디헤이즈 기준)을 다시 합성한다
let seq = 0;
async function recompose(img: LoadedImage, patches: HealPatch[] | undefined) {
  const my = ++seq;
  const proxy = await composeHeal(img.originalProxy, patches, img.width, img.height);
  const baseSource = proxy === img.proxy ? img.baseSource : await makeBaseSource(proxy);
  const cur = useGrade.getState().image;
  if (my !== seq || !cur || cur.file !== img.file) {
    if (proxy !== img.originalProxy) proxy.close();
    return;
  }
  if (cur.proxy !== cur.originalProxy && cur.proxy !== proxy) cur.proxy.close();
  useGrade.setState({ image: { ...cur, proxy, baseSource } });
}

useGrade.subscribe((s, p) => {
  const img = s.image;
  if (!img) return;
  const changedHeal = s.develop.heal !== p.develop.heal;
  const newImage = img.file !== p.image?.file;
  if (changedHeal || (newImage && s.develop.heal?.length)) recompose(img, s.develop.heal);
});
