import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { defaultPrimary, gradePixel8, toUniforms, type PrimaryParams, type Vec3 } from '../../src/engine/color';

const FIXTURE_DIR = join(process.cwd(), 'test-results', 'fixtures');

/** 하늘 → 수목 → 흙 띠가 있는 정원풍 합성 이미지 */
function writeGardenPng(file: string, width: number, height: number) {
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
function jpegSize(buf: Buffer) {
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

async function meanOf(page: Page, bytes: Buffer, type: string) {
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

test.beforeAll(() => {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeGardenPng(join(FIXTURE_DIR, 'garden.png'), 1600, 1067);
  writeGardenPng(join(FIXTURE_DIR, 'garden-large.png'), 4500, 3000);
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__GG__);
});

test('GPU 셰이더 결과가 기준 수식(CPU)과 1 LSB 이내로 일치', async ({ page }) => {
  // 6×6×6 색 격자
  const pixels: number[] = [];
  const colors: Vec3[] = [];
  for (let r = 0; r < 6; r++)
    for (let g = 0; g < 6; g++)
      for (let b = 0; b < 6; b++) {
        const c: Vec3 = [r * 51, g * 51, b * 51];
        colors.push(c);
        pixels.push(...c, 255);
      }

  const cases: Array<[string, (p: PrimaryParams) => void]> = [
    ['기본값', () => {}],
    ['Gain·Lift·Gamma 휠', (p) => {
      p.gain = { x: 0.3, y: 0.5, master: 1.4 };
      p.lift = { x: -0.4, y: 0.2, master: 0.05 };
      p.gamma = { x: 0.1, y: -0.6, master: 0.3 };
    }],
    ['Offset·WB', (p) => {
      p.offset = { x: -0.2, y: 0.3, master: -0.7 };
      p.temperature = 40;
      p.tint = -25;
    }],
    ['Contrast·Sat·Hue', (p) => {
      p.contrast = 1.35;
      p.pivot = 0.42;
      p.saturation = 1.6;
      p.hue = -35;
    }],
  ];

  for (const [name, patch] of cases) {
    const p = defaultPrimary();
    patch(p);
    const gpu = await page.evaluate(
      ({ pixels, n, p }) => window.__GG__!.gradePixels(pixels, n, 1, p, false),
      { pixels, n: colors.length, p },
    );
    const u = toUniforms(p);
    let maxDiff = 0;
    colors.forEach((c, i) => {
      const ref = gradePixel8(c, u);
      for (let k = 0; k < 3; k++) maxDiff = Math.max(maxDiff, Math.abs(ref[k] - gpu[i * 4 + k]));
    });
    expect(maxDiff, name).toBeLessThanOrEqual(1);
  }
});

test('타일 경계(2048px)를 넘는 렌더에서도 픽셀 위치가 정확', async ({ page }) => {
  const maxDiff = await page.evaluate(() => {
    const w = 2100;
    const h = 2090;
    const data = new Array<number>(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        data[i] = x & 255;
        data[i + 1] = y & 255;
        data[i + 2] = ((x >> 8) + (y >> 8) * 16) & 255;
        data[i + 3] = 255;
      }
    const p = {
      lift: { x: 0, y: 0, master: 0 },
      gamma: { x: 0, y: 0, master: 0 },
      gain: { x: 0, y: 0, master: 1 },
      offset: { x: 0, y: 0, master: 0 },
      temperature: 0, tint: 0, contrast: 1, pivot: 0.49, saturation: 1, hue: 0,
    };
    const out = window.__GG__!.gradePixels(data, w, h, p, false);
    let m = 0;
    for (let i = 0; i < data.length; i++) if (i % 4 !== 3) m = Math.max(m, Math.abs(out[i] - data[i]));
    return m;
  });
  expect(maxDiff).toBeLessThanOrEqual(1);
});

test('디더링은 결정적이다: 같은 입력 → 같은 출력', async ({ page }) => {
  const same = await page.evaluate(() => {
    const data = Array.from({ length: 256 * 4 }, (_, i) => (i % 4 === 3 ? 255 : (i >> 2)));
    const p = {
      lift: { x: 0, y: 0, master: 0 }, gamma: { x: 0, y: 0, master: 0.2 },
      gain: { x: 0, y: 0, master: 1 }, offset: { x: 0, y: 0, master: 0 },
      temperature: 0, tint: 0, contrast: 1.2, pivot: 0.49, saturation: 1, hue: 0,
    };
    const a = window.__GG__!.gradePixels(data, 256, 1, p, true);
    const b = window.__GG__!.gradePixels(data, 256, 1, p, true);
    return a.every((v, i) => v === b[i]);
  });
  expect(same).toBe(true);
});

test('업로드 → 보정 → JPG 내보내기 흐름', async ({ page }) => {
  const src = join(FIXTURE_DIR, 'garden.png');
  await page.getByTestId('file-input').setInputFiles(src);
  await expect(page.getByTestId('file-meta')).toContainText('1600×1067');

  // Gain 다이얼에 수치 직접 입력, 휠 드래그, 슬라이더 조절
  const gain = page.getByLabel('Gain master');
  await gain.fill('1.5');
  await gain.press('Enter');
  await expect(gain).toHaveValue('1.500');

  const disc = page.getByTestId('wheel-gamma-disc');
  const box = (await disc.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 - 20, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel('Gamma B')).not.toHaveValue('0.000');

  await page.getByTestId('scalar-saturation').fill('1.2');
  await expect(page.getByLabel('Sat value')).toHaveValue('1.20');

  // Before/After 분할 켜기
  await page.keyboard.press('s');
  await expect(page.locator('.split-line')).toBeVisible();
  await page.screenshot({ path: join('test-results', 'phase1-ui.png') });

  await page.getByTestId('export-open').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-confirm').click()]);
  expect(download.suggestedFilename()).toBe('garden_GG.jpg');
  const jpg = readFileSync((await download.path())!);
  expect(jpegSize(jpg)).toEqual({ width: 1600, height: 1067 });

  // Gain 1.5 → 결과는 원본보다 확실히 밝아야 한다
  const before = await meanOf(page, readFileSync(src), 'image/png');
  const after = await meanOf(page, jpg, 'image/jpeg');
  const lum = (m: number[]) => 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
  expect(lum(after)).toBeGreaterThan(lum(before) + 15);
});

test('보정 없이 내보내면 원본과 같은 색 (JPG 압축 오차 이내)', async ({ page }) => {
  const src = join(FIXTURE_DIR, 'garden.png');
  await page.getByTestId('file-input').setInputFiles(src);
  await page.getByTestId('export-open').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-confirm').click()]);
  const jpg = readFileSync((await download.path())!);
  const before = await meanOf(page, readFileSync(src), 'image/png');
  const after = await meanOf(page, jpg, 'image/jpeg');
  for (let k = 0; k < 3; k++) expect(Math.abs(after[k] - before[k])).toBeLessThan(1.5);
});

test('13.5MP 이미지: 프록시 미리보기 + 원본 해상도 내보내기', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(join(FIXTURE_DIR, 'garden-large.png'));
  await expect(page.getByTestId('file-meta')).toContainText('4500×3000');
  await page.getByTestId('export-open').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-confirm').click()]);
  const jpg = readFileSync((await download.path())!);
  expect(jpegSize(jpg)).toEqual({ width: 4500, height: 3000 });
});

test('단축키: B 원본 보기, Ctrl+D 노드 끄기', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(join(FIXTURE_DIR, 'garden.png'));
  await page.keyboard.press('b');
  await expect(page.locator('.viewer-badge')).toBeVisible();
  await page.keyboard.press('b');
  await expect(page.locator('.viewer-badge')).toHaveCount(0);
  await page.keyboard.press('Control+d');
  await expect(page.getByTestId('node-01')).toHaveClass(/node-off/);
});
