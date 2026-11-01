import type { GradeUniforms } from './color';
import { computeBase, planDevelop, type Develop, type PixelSource } from './develop';
import type { DevelopInput, Renderer } from './renderer';

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** 화면 미리보기용 프록시의 긴 변 최대 길이 */
export const PROXY_LONG_EDGE = 3072;
/** 휴대폰·메모리가 작은 기기의 프록시 긴 변 (GPU 메모리가 약 2.3배 덜 든다) */
export const PROXY_LONG_EDGE_SMALL = 2048;

/** 이 기기에서 쓸 프록시 크기 */
export function proxyLongEdge(): number {
  if (typeof window === 'undefined') return PROXY_LONG_EDGE;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  return coarse || (mem !== undefined && mem <= 4) ? PROXY_LONG_EDGE_SMALL : PROXY_LONG_EDGE;
}

/** 원본 해상도로 디코딩 (내보낼 때만, 쓰고 나면 close) */
export function decodeFull(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image', premultiplyAlpha: 'none', colorSpaceConversion: 'default' });
}
/** 선명도·디헤이즈 기준을 만들 작은 사본의 긴 변 */
export const BASE_SOURCE_LONG = 512;

export interface LoadedImage {
  name: string;
  width: number;
  height: number;
  /** 원본 파일. 원본 해상도 픽셀은 메모리에 들고 있지 않고 내보낼 때 다시 디코딩한다 (휴대폰 메모리). */
  file: Blob;
  /** 미리보기용 축소본 */
  proxy: ImageBitmap;
  /** 지우개를 덮기 전 원래 축소본 (지우개 조각이 바뀔 때마다 여기서 다시 합성한다) */
  originalProxy: ImageBitmap;
  /** 선명도·디헤이즈 기준용 작은 사본 (CPU 픽셀) */
  baseSource: PixelSource;
}

/** 비트맵을 긴 변 BASE_SOURCE_LONG으로 줄여 CPU 픽셀로 읽는다 */
export async function makeBaseSource(bmp: ImageBitmap): Promise<PixelSource> {
  const k = Math.min(1, BASE_SOURCE_LONG / Math.max(bmp.width, bmp.height));
  const width = Math.max(1, Math.round(bmp.width * k));
  const height = Math.max(1, Math.round(bmp.height * k));
  const small =
    k < 1
      ? await createImageBitmap(bmp, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high', premultiplyAlpha: 'none' })
      : bmp;
  const c = new OffscreenCanvas(width, height);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(small, 0, 0);
  if (small !== bmp) small.close();
  return { data: ctx.getImageData(0, 0, width, height).data, width, height };
}

/** 내보내기·썸네일용 현상 입력. 원본(fullW×fullH)을 src 해상도로 렌더할 때. */
export function developInput(
  dev: Develop,
  baseSource: PixelSource,
  fullW: number,
  fullH: number,
  srcW: number,
): DevelopInput {
  const plan = planDevelop(dev, fullW, fullH, srcW / fullW);
  return { plan, base: plan.needsBase ? computeBase(baseSource, dev.geometry, fullW, fullH) : null };
}

export async function loadImage(file: File): Promise<LoadedImage> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('JPG, PNG, WebP 파일만 열 수 있습니다.');
  }
  // EXIF 회전을 반영하고, 내장 ICC 프로파일은 브라우저가 sRGB로 변환한다
  const full = await createImageBitmap(file, {
    imageOrientation: 'from-image',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'default',
  });
  const { width, height } = full;
  const k = Math.min(1, proxyLongEdge() / Math.max(width, height));
  const proxy =
    k < 1
      ? await createImageBitmap(full, {
          resizeWidth: Math.round(width * k),
          resizeHeight: Math.round(height * k),
          resizeQuality: 'high',
          premultiplyAlpha: 'none',
        })
      : full;
  if (proxy !== full) full.close();
  return { name: file.name, width, height, file, proxy, originalProxy: proxy, baseSource: await makeBaseSource(proxy) };
}

export function exportFileName(original: string, ext: string) {
  const base = original.replace(/\.[^.]+$/, '');
  return `${base}_GG.${ext}`;
}

export interface ExportOptions {
  quality: number;
  develop: Develop;
  /** 긴 변을 이 크기로 줄인다 (원본보다 크면 그대로) */
  longEdge?: number | null;
  onProgress?: (p: number) => void;
}

/** 긴 변 제한을 적용한 크기 */
export function resizedSize(w: number, h: number, longEdge?: number | null): [number, number] {
  if (!longEdge || Math.max(w, h) <= longEdge) return [w, h];
  const k = longEdge / Math.max(w, h);
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

export async function exportJpeg(
  renderer: Renderer,
  image: Pick<LoadedImage, 'width' | 'height' | 'baseSource'> & { full: ImageBitmap },
  uniforms: GradeUniforms[],
  opts: ExportOptions,
): Promise<Blob> {
  const develop = developInput(opts.develop, image.baseSource, image.width, image.height, image.width);
  const r = renderer.renderFull(image.full, uniforms, { dither: true, onProgress: opts.onProgress, develop });
  const [w, h] = resizedSize(r.width, r.height, opts.longEdge);
  let bitmap: ImageBitmap | null = null;
  const data = new ImageData(r.pixels, r.width, r.height);
  if (w !== r.width || h !== r.height) {
    bitmap = await createImageBitmap(data, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high', premultiplyAlpha: 'none' });
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb' })!;
  if (bitmap) {
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
  } else {
    ctx.putImageData(data, 0, 0);
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', opts.quality));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error('JPG 인코딩에 실패했습니다.');
  return blob;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
