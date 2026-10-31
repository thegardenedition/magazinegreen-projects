import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { defaultPrimary, gradePixel8, toUniforms, type Vec3 } from '../../src/engine/color';
import { parseCube, sampleLut, serializeCube } from '../../src/engine/lut';
import { buildLibraryLut } from '../../src/engine/lutLibrary';
import { exportJpg, FIXTURE_DIR, readZip, regionMean, writeFixtures } from './helpers';

const GARDEN = join(FIXTURE_DIR, 'garden.png');
const LEAVES = { x: 0.1, y: 0.45, w: 0.8, h: 0.3 };

test.beforeAll(writeFixtures);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__GG__);
});

test('프리셋 라이브러리: 135종, 분류·검색, 흑백 적용', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  const items = page.getByTestId('builtin-presets-item');
  await expect(items).toHaveCount(135);
  await page.getByTestId('builtin-presets-cat-bw').click();
  await expect(items).toHaveCount(15);
  await page.getByTestId('builtin-presets-cat-all').click();
  // 이름·설명에서 찾는다: 아침 안개, 장마(안개 걷기), 미세먼지 걷기(안개를 걷고)
  await page.getByTestId('builtin-presets-search').fill('안개');
  await expect(items).toHaveCount(3);
  await page.getByTestId('builtin-presets-search').fill('');

  await page.getByTestId('builtin-presets-cat-bw').click();
  await items.filter({ hasText: '흑백 · 녹색 필터' }).click();
  expect(await page.getByTestId('node').locator('.node-name').allTextContents()).toEqual(['녹색 필터', '흑백']);
  const leaves = await regionMean(page, await exportJpg(page), 'image/jpeg', LEAVES);
  expect(Math.max(...leaves) - Math.min(...leaves)).toBeLessThan(2);
  await page.screenshot({ path: join('test-results', 'library-presets.png') });
});

test('LUT 라이브러리: 145종, 분류·검색, 적용과 강조 표시', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  await page.getByTestId('tab-lut').click();
  const items = page.getByTestId('lut-library-item');
  await expect(items).toHaveCount(145);
  await page.getByTestId('lut-library-cat-camera').click();
  await expect(items).toHaveCount(41);
  await page.getByTestId('lut-library-cat-all').click();
  await page.getByTestId('lut-library-search').fill('S-Log3');
  // S-Gamut3.Cine·S-Gamut3 × 2, Sony 스타일 3, Linear → S-Log3, sRGB → S-Log3 × 2
  await expect(items).toHaveCount(10);
  await page.getByTestId('lut-library-cat-vfx').click();
  await expect(items).toHaveCount(1);
  await page.getByTestId('lut-library-cat-all').click();
  await page.getByTestId('lut-library-search').fill('흑백 (휘도)');
  await items.first().click();
  await expect(page.getByTestId('lut-info')).toContainText('흑백 (휘도)');
  await expect(page.getByTestId('node').first()).toContainText('LUT 흑백 (휘도)');
  await expect(items.first()).toHaveClass(/active/);

  const leaves = await regionMean(page, await exportJpg(page), 'image/jpeg', LEAVES);
  expect(Math.max(...leaves) - Math.min(...leaves)).toBeLessThan(2);
  await page.screenshot({ path: join('test-results', 'library-luts.png') });
});

test('라이브러리 LUT의 GPU 결과가 기준 수식과 1 LSB 이내로 일치 (카메라·룩·정원)', async ({ page }) => {
  const colors: Vec3[] = [];
  const pixels: number[] = [];
  for (let i = 0; i < 150; i++) {
    const c: Vec3 = [(i * 97) % 256, (i * 57 + 30) % 256, (i * 31 + 90) % 256];
    colors.push(c);
    pixels.push(...c, 255);
  }
  for (const id of [
    'camera-sony-soft',
    'camera-arri-clip',
    'camera-bmd-gen5-soft',
    'camera-pq-clip',
    'vfx-lin-to-srgb',
    'film-2383-d55',
    'look-print-warm',
    'look-cross',
    'garden-신록',
    'util-legal-to-full',
    'tolog-dji',
    'pro-teal-orange',
    'pro-silver-bw',
  ]) {
    const lut = buildLibraryLut(id);
    const cube = serializeCube(lut);
    const gpu = await page.evaluate(
      ({ pixels, n, cube, p }) => window.__GG__!.gradeNodes(pixels, n, 1, [{ primary: p, cube, lutIntensity: 1 }], false),
      { pixels, n: colors.length, cube, p: defaultPrimary() },
    );
    const u = toUniforms(defaultPrimary(), { lut: { lut, intensity: 1 } });
    let max = 0;
    colors.forEach((c, i) => {
      const ref = gradePixel8(c, u);
      for (let k = 0; k < 3; k++) max = Math.max(max, Math.abs(ref[k] - gpu[i * 4 + k]));
    });
    expect(max, id).toBeLessThanOrEqual(1);
  }
});

test('라이브러리 전체를 .cube ZIP으로 받는다 (분류별 폴더)', async ({ page }) => {
  await page.getByTestId('tab-lut').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('lut-pack').click()]);
  expect(download.suggestedFilename()).toBe('GREEN GRADE LUT.zip');
  const { readFileSync } = await import('node:fs');
  const files = readZip(readFileSync((await download.path())!));
  expect(files).toHaveLength(146);
  expect(files[0].name).toBe('GREEN GRADE LUT/읽어보기.txt');
  const folders = new Set(files.slice(1).map((f) => f.name.split('/')[1]));
  expect([...folders]).toEqual(['01 유틸리티', '02 VFX IO', '03 로그로 변환', '04 카메라 로그', '05 프로 룩', '06 필름 룩', '07 룩', '08 정원']);
  const bmd = files.find((f) => f.name.endsWith('Blackmagic Film Gen 5 - Wide Gamut to sRGB.cube'))!;
  const lut = parseCube(bmd.data.toString('utf8'));
  expect(lut.size).toBe(33);
  // 18% 회색 → sRGB 118 근처
  const g = sampleLut(lut, [0.383562, 0.383562, 0.383562]).map((v) => v * 255);
  for (const v of g) expect(Math.abs(v - 118)).toBeLessThanOrEqual(3);
});

test('사진을 열면 프리셋마다 지금 사진으로 만든 미리보기가 붙는다', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  const thumbs = page.getByTestId('builtin-presets-thumb');
  await expect(thumbs).toHaveCount(135, { timeout: 90_000 });
  // 흑백 프리셋의 썸네일은 무채색, 원본과는 다르다
  const isGrey = await page.evaluate(async () => {
    const item = [...document.querySelectorAll('[data-testid=builtin-presets-item]')].find((e) => e.textContent?.includes('흑백 · 노랑 필터'))!;
    const img = item.querySelector('img')!;
    const bmp = await createImageBitmap(await (await fetch(img.src)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    let max = 0;
    for (let i = 0; i < d.length; i += 4) max = Math.max(max, Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]));
    return max;
  });
  expect(isGrey).toBeLessThanOrEqual(6);
  await page.screenshot({ path: join('test-results', 'preset-thumbs.png') });
});

test('효과를 담은 필름 프리셋은 디테일 효과도 함께 바꾼다', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  await page.getByTestId('builtin-presets-search').fill('8mm');
  await page.getByTestId('builtin-presets-item').first().click();
  await page.getByTestId('tab-detail').click();
  expect(Number(await page.getByRole('textbox', { name: '비네트 value' }).inputValue())).toBeGreaterThan(30);
  // 다른 필름 룩으로 바꾸면 앞 룩의 비네트가 남지 않는다
  await page.getByTestId('builtin-presets-search').fill('할레이션 필름');
  await page.getByTestId('builtin-presets-item').first().click();
  await expect(page.getByRole('textbox', { name: '비네트 value' })).toHaveValue('0');
  expect(Number(await page.getByRole('textbox', { name: '할레이션 value' }).inputValue())).toBe(50);
});
