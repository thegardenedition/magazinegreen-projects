import { expect, type Page } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import type { Vec3 } from '../../src/engine/color';

export const FIXTURE_DIR = join(process.cwd(), 'test-results', 'fixtures');

/** 하늘 → 수목 → 흙 띠가 있는 정원풍 합성 이미지 */
export function writeGardenPng(file: string, width: number, height: number) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const t = y / height;
    for (let x = 0; x < width; x++) {
      const s = x / width;
      let rgb: Vec3;
      if (t < 0.4) rgb = [120 + 60 * t, 165 + 50 * t, 215 - 20 * s];
      else if (t < 0.8) {
        const leaf = Math.sin(x * 0.05) * Math.cos(y * 0.07);
        rgb = [55 + 30 * leaf + 40 * s, 110 + 45 * leaf, 40 + 15 * leaf];
      } else rgb = [120 - 30 * t, 88 - 20 * t, 60 - 15 * t];
      const i = (y * width + x) * 4;
      png.data[i] = rgb[0];
      png.data[i + 1] = rgb[1];
      png.data[i + 2] = rgb[2];
      png.data[i + 3] = 255;
    }
  }
  writeFileSync(file, PNG.sync.write(png));
}

/** JPG의 SOF 마커에서 해상도를 읽는다 */
export function jpegSize(buf: Buffer) {
  expect(buf[0]).toBe(0xff);
  expect(buf[1]).toBe(0xd8);
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error('SOF 마커 없음');
}

export async function meanOf(page: Page, bytes: Buffer, type: string) {
  return page.evaluate(
    async ({ b64, type }) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bin], { type }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k];
      const n = d.length / 4;
      return sum.map((s) => s / n);
    },
    { b64: bytes.toString('base64'), type },
  );
}

export function writeFixtures() {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const small = join(FIXTURE_DIR, 'garden.png');
  const large = join(FIXTURE_DIR, 'garden-large.png');
  if (!existsSync(small)) writeGardenPng(small, 1600, 1067);
  if (!existsSync(large)) writeGardenPng(large, 4500, 3000);
}

export const lum = (m: number[]) => 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];

/** 이미지의 일부 영역(0–1 비율 좌표) 평균 RGB */
export async function regionMean(
  page: Page,
  bytes: Buffer,
  type: string,
  r: { x: number; y: number; w: number; h: number },
) {
  return page.evaluate(
    async ({ b64, type, r }) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bin], { type }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const x = Math.round(r.x * bmp.width);
      const y = Math.round(r.y * bmp.height);
      const d = ctx.getImageData(x, y, Math.round(r.w * bmp.width), Math.round(r.h * bmp.height)).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k];
      return sum.map((s) => s / (d.length / 4));
    },
    { b64: bytes.toString('base64'), type, r },
  );
}

export async function exportJpg(page: Page) {
  await page.getByTestId('export-open').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-confirm').click()]);
  const { readFileSync } = await import('node:fs');
  return readFileSync((await download.path())!);
}

/** 여러 장 작업용 사진 3장 (크기·비율이 다르다) */
export function writeBatchFixtures() {
  writeFixtures();
  const specs: Array<[string, number, number]> = [
    ['정원-A.png', 1200, 800],
    ['정원-B.png', 800, 1000],
    ['정원-C.png', 1000, 667],
  ];
  return specs.map(([name, w, h]) => {
    const file = join(FIXTURE_DIR, name);
    if (!existsSync(file)) writeGardenPng(file, w, h);
    return file;
  });
}

/** STORE 방식 ZIP 읽기 */
export function readZip(buf: Buffer) {
  const out: Array<{ name: string; data: Buffer }> = [];
  let i = 0;
  while (buf.readUInt32LE(i) === 0x04034b50) {
    const size = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString('utf8');
    out.push({ name, data: buf.subarray(i + 30 + nameLen, i + 30 + nameLen + size) });
    i += 30 + nameLen + size;
  }
  return out;
}
