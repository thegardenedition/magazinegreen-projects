import type { GradeUniforms } from './color';
import type { Renderer } from './renderer';

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** 화면 미리보기용 프록시의 긴 변 최대 길이 */
export const PROXY_LONG_EDGE = 3072;

export interface LoadedImage {
  name: string;
  width: number;
  height: number;
  /** 원본 해상도. 내보낼 때만 GPU에 올린다. */
  full: ImageBitmap;
  /** 미리보기용 축소본 */
  proxy: ImageBitmap;
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
  const k = Math.min(1, PROXY_LONG_EDGE / Math.max(width, height));
  const proxy =
    k < 1
      ? await createImageBitmap(full, {
          resizeWidth: Math.round(width * k),
          resizeHeight: Math.round(height * k),
          resizeQuality: 'high',
          premultiplyAlpha: 'none',
        })
      : full;
  return { name: file.name, width, height, full, proxy };
}

export function exportFileName(original: string, ext: string) {
  const base = original.replace(/\.[^.]+$/, '');
  return `${base}_GG.${ext}`;
}

export async function exportJpeg(
  renderer: Renderer,
  image: LoadedImage,
  uniforms: GradeUniforms[],
  quality: number,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  const pixels = renderer.renderFull(image.full, uniforms, { dither: true, onProgress });
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb' })!;
  ctx.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
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
