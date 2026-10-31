import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { exportJpg, FIXTURE_DIR, regionMean, writeBatchFixtures, writeFixtures } from './helpers';

const GARDEN = join(FIXTURE_DIR, 'garden.png');

type Summary = Array<{ name: string; nodes: string[]; gain: number }>;
const summary = (page: Page) =>
  page.evaluate(() => (window as unknown as { __GG_GALLERY__: { summary(): Summary } }).__GG_GALLERY__.summary());

test.beforeAll(writeFixtures);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__GG__);
});

test('프로 워크플로: 로그로 평탄화 → 1차 보정 → 룩 LUT 세 노드가 들어가고 흰색은 잘리지 않는다', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  await page.getByTestId('builtin-presets-cat-pro').click();
  await expect(page.getByTestId('builtin-presets-item')).toHaveCount(23);
  await page.getByTestId('builtin-presets-item').filter({ hasText: '프로 · 무디 포레스트' }).click();
  expect(await page.getByTestId('node').locator('.node-name').allTextContents()).toEqual(['로그 변환', '1차 보정 (Log)', '무디 포레스트']);
  await expect(page.getByTestId('node').nth(0)).toContainText('LUT sRGB → ARRI LogC3');
  await expect(page.getByTestId('node').nth(2)).toContainText('LUT 무디 포레스트 (LogC3)');
  // 룩 프리셋의 질감 효과(비네트)도 함께 들어간다
  await page.getByTestId('tab-detail').click();
  await expect(page.getByRole('textbox', { name: '비네트 value' })).toHaveValue('25');

  // 로그 상태만 보면(룩 노드 끄기) 평탄하다: 하늘·흙의 밝기 차가 줄어든다
  const full = await regionMean(page, await exportJpg(page), 'image/jpeg', { x: 0.1, y: 0.05, w: 0.8, h: 0.2 });
  await page.getByTestId('node').nth(2).getByTestId('node-toggle').click();
  const flatSky = await regionMean(page, await exportJpg(page), 'image/jpeg', { x: 0.1, y: 0.05, w: 0.8, h: 0.2 });
  const flatSoil = await regionMean(page, await exportJpg(page), 'image/jpeg', { x: 0.1, y: 0.85, w: 0.8, h: 0.1 });
  expect(Math.max(...flatSky) - Math.min(...flatSky)).toBeLessThan(Math.max(...full) - Math.min(...full) + 40);
  expect(flatSoil[0]).toBeGreaterThan(40);
});

test('로그 베이스: 마지막 노드의 LUT를 바꿔 쓰는 틀이다', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  await page.getByTestId('builtin-presets-search').fill('D-Log');
  await page.getByTestId('builtin-presets-item').filter({ hasText: '로그 베이스 · DJI D-Log' }).click();
  await expect(page.getByTestId('node').nth(0)).toContainText('LUT sRGB → DJI D-Log');
  await expect(page.getByTestId('node').nth(2)).toContainText('룩 LUT (바꿔 쓰기)');
  await expect(page.getByTestId('node').nth(2)).toContainText('DJI D-Log / D-Gamut → sRGB');
});

test('선택한 사진에도 적용: 프리셋 하나를 여러 장에 한 번에', async ({ page }) => {
  const files = writeBatchFixtures();
  await page.getByTestId('file-input').setInputFiles(files);
  await expect(page.getByTestId('film-item')).toHaveCount(3);
  await expect(page.getByTestId('file-meta')).toContainText('정원-A.png');
  await page.getByTestId('film-item').nth(1).getByRole('checkbox').check();
  await page.getByTestId('film-item').nth(2).getByRole('checkbox').check();
  await page.getByTestId('preset-batch').check();
  await page.getByTestId('builtin-presets-search').fill('시네마 표준');
  await page.getByTestId('builtin-presets-item').first().click();
  await expect(page.getByTestId('preset-msg')).toContainText('3장에 적용');
  const s = await summary(page);
  for (const it of s) expect(it.nodes, it.name).toEqual(['로그 변환', '1차 보정 (Log)', '시네마 표준']);
});
