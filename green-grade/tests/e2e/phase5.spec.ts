import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gradePixel8, toUniforms, defaultPrimary, type Vec3 } from '../../src/engine/color';
import { parseCube, sampleLut } from '../../src/engine/lut';
import { jpegSize, meanOf, readZip, writeBatchFixtures, lum } from './helpers';

let FILES: string[] = [];

test.beforeAll(() => {
  FILES = writeBatchFixtures();
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__GG__);
});

type Summary = Array<{ name: string; nodes: string[]; gain: number }>;
const summary = (page: Page) =>
  page.evaluate(() => (window as unknown as { __GG_GALLERY__: { summary(): Summary } }).__GG_GALLERY__.summary());

async function openAll(page: Page) {
  await page.getByTestId('file-input').setInputFiles(FILES);
  await expect(page.getByTestId('film-item')).toHaveCount(3);
  await expect(page.getByTestId('file-meta')).toContainText('정원-A.png');
  // 썸네일이 모두 만들어질 때까지
  await expect(page.locator('.film-thumb img')).toHaveCount(3);
}

async function setGain(page: Page, v: string) {
  const g = page.getByLabel('Gain master');
  await g.fill(v);
  await g.press('Enter');
}

const item = (page: Page, i: number) => page.getByTestId('film-item').nth(i);

test('여러 장 열기: 사진마다 자기 그레이드를 기억한다', async ({ page }) => {
  await openAll(page);
  await expect(page.getByTestId('film-count')).toContainText('3장');
  await setGain(page, '1.5');

  await item(page, 1).locator('.film-thumb').click();
  await expect(page.getByTestId('file-meta')).toContainText('정원-B.png · 800×1000');
  await expect(page.getByLabel('Gain master')).toHaveValue('1.000');
  await expect(page.getByTestId('undo')).toBeDisabled();
  await setGain(page, '0.6');

  await item(page, 0).locator('.film-thumb').click();
  await expect(page.getByTestId('file-meta')).toContainText('정원-A.png');
  await expect(page.getByLabel('Gain master')).toHaveValue('1.500');
  expect((await summary(page)).map((s) => s.gain)).toEqual([1.5, 0.6, 1]);
});

test('그레이드 복사 → 여러 장 선택 → 붙여넣기 (Ctrl+C / Ctrl+V)', async ({ page }) => {
  await openAll(page);
  await page.getByTestId('builtin-presets').getByText('신록').click();
  await setGain(page, '1.3');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+c');
  await expect(page.getByTestId('film-note')).toContainText('정원-A.png');

  // B를 체크박스로, C를 Ctrl+클릭으로 선택
  await item(page, 1).getByRole('checkbox').check();
  await item(page, 2).locator('.film-thumb').click({ modifiers: ['Control'] });
  await expect(page.getByTestId('film-count')).toContainText('선택 2');
  const thumbBefore = await item(page, 2).locator('img').getAttribute('src');
  await page.keyboard.press('Control+v');

  const s = await summary(page);
  expect(s[1].nodes).toEqual(['톤', '녹색 분리']);
  expect(s[2].nodes).toEqual(['톤', '녹색 분리']);
  expect(s[1].gain).toBe(1.3);
  // 붙여 넣은 사진의 썸네일이 새 그레이드로 바뀐다
  await expect.poll(() => item(page, 2).locator('img').getAttribute('src')).not.toBe(thumbBefore);

  // 붙여 넣은 사진을 열면 그 그레이드가 그대로
  await item(page, 2).locator('.film-thumb').click();
  await expect(page.getByTestId('file-meta')).toContainText('정원-C.png');
  expect(await page.getByTestId('node').locator('.node-name').allTextContents()).toEqual(['톤', '녹색 분리']);
});

test('선택한 사진을 각자의 그레이드로 ZIP 하나에 내보낸다', async ({ page }) => {
  await openAll(page);
  await setGain(page, '1.6'); // A: 밝게
  await item(page, 2).locator('.film-thumb').click();
  await expect(page.getByTestId('file-meta')).toContainText('정원-C.png');
  await setGain(page, '0.5'); // C: 어둡게
  await page.getByTestId('film-select-all').click();
  await expect(page.getByTestId('film-count')).toContainText('선택 3');

  await page.getByTestId('batch-open').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('batch-confirm').click()]);
  expect(download.suggestedFilename()).toBe('GREEN_GRADE_3장.zip');
  const files = readZip(readFileSync((await download.path())!));
  expect(files.map((f) => f.name)).toEqual(['정원-A_GG.jpg', '정원-B_GG.jpg', '정원-C_GG.jpg']);
  expect(jpegSize(files[0].data)).toEqual({ width: 1200, height: 800 });
  expect(jpegSize(files[1].data)).toEqual({ width: 800, height: 1000 });
  expect(jpegSize(files[2].data)).toEqual({ width: 1000, height: 667 });

  const orig = await Promise.all(FILES.map((f) => meanOf(page, readFileSync(f), 'image/png')));
  const out = await Promise.all(files.map((f) => meanOf(page, f.data, 'image/jpeg')));
  expect(lum(out[0])).toBeGreaterThan(lum(orig[0]) + 15);
  expect(Math.abs(lum(out[1]) - lum(orig[1]))).toBeLessThan(1.5);
  expect(lum(out[2])).toBeLessThan(lum(orig[2]) - 15);
});

test('그레이드를 .cube로 내보내면 같은 결과를 내는 LUT가 된다', async ({ page }) => {
  await openAll(page);
  await setGain(page, '1.2');
  await page.getByTestId('scalar-saturation').fill('0.7');
  await page.getByTestId('tab-lut').click();
  await page.getByTestId('lut-size-33').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('lut-export').click()]);
  expect(download.suggestedFilename()).toBe('GREEN_GRADE_33.cube');
  const lut = parseCube(readFileSync((await download.path())!, 'utf8'));
  expect(lut.size).toBe(33);
  const chain = [toUniforms({ ...defaultPrimary(), gain: { x: 0, y: 0, master: 1.2 }, saturation: 0.7 })];
  let max = 0;
  for (let i = 0; i < 200; i++) {
    const c: Vec3 = [(i * 97) % 256, (i * 57 + 30) % 256, (i * 31 + 90) % 256];
    const direct = gradePixel8(c, chain);
    const viaLut = sampleLut(lut, c.map((v) => v / 255) as Vec3).map((v) => Math.round(v * 255));
    for (let k = 0; k < 3; k++) max = Math.max(max, Math.abs(direct[k] - viaLut[k]));
  }
  expect(max).toBeLessThanOrEqual(3);
});

test('창이 켜진 노드가 있으면 LUT 굽는 방식을 고를 수 있다', async ({ page }) => {
  await openAll(page);
  await page.getByTestId('builtin-presets').getByText('흐린 날 구제').click();
  await page.getByTestId('tab-lut').click();
  await expect(page.getByText('창(Window)이 켜진 노드 1개')).toBeVisible();
  await expect(page.getByTestId('lut-window-exclude')).toBeChecked();
  await page.getByTestId('lut-window-ignore').check();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('lut-export').click()]);
  expect(parseCube(readFileSync((await download.path())!, 'utf8')).size).toBe(33);
  await page.screenshot({ path: join('test-results', 'phase5-ui.png') });
});
