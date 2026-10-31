import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { exportJpg, FIXTURE_DIR, regionMean, writeFixtures } from './helpers';

const GARDEN = join(FIXTURE_DIR, 'garden.png');
const CENTER = { x: 0.4, y: 0.45, w: 0.2, h: 0.1 };

test.beforeAll(writeFixtures);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__GG__);
  await page.getByTestId('file-input').setInputFiles(GARDEN);
});

async function setGain(page: import('@playwright/test').Page, v: string) {
  const f = page.getByLabel('Gain master');
  await f.fill(v);
  await f.press('Enter');
}

test('창이 켜진 노드는 카드에 표시되고, 보정 탭에 "가장자리에만 적용" 안내가 뜬다', async ({ page }) => {
  await expect(page.getByTestId('mask-notice')).toHaveCount(0);
  await page.getByTestId('builtin-presets-item').filter({ hasText: /^비네트/ }).click();
  await expect(page.getByTestId('node-tag-window')).toHaveText('창 바깥');
  await page.getByTestId('node').first().click();
  await expect(page.getByTestId('mask-notice')).toContainText('창 바깥(가장자리)에만 적용');
  // 마스크를 고치는 탭에서는 안내를 띄우지 않는다
  await page.getByTestId('tab-window').click();
  await expect(page.getByTestId('mask-notice')).toHaveCount(0);
  await page.getByTestId('tab-curves').click();
  await expect(page.getByTestId('mask-notice')).toBeVisible();
});

test('"창 끄기"를 누르면 그 노드의 보정이 사진 전체에 걸린다', async ({ page }) => {
  await page.getByTestId('builtin-presets-item').filter({ hasText: /^비네트/ }).click();
  await page.getByTestId('node').first().click();
  // 창이 켜진 채로는 Gain을 올려도 가운데가 거의 그대로
  const before = await regionMean(page, await exportJpg(page), 'image/jpeg', CENTER);
  await setGain(page, '1.6');
  const masked = await regionMean(page, await exportJpg(page), 'image/jpeg', CENTER);
  expect(Math.abs(masked[1] - before[1])).toBeLessThan(4);

  await page.getByTestId('mask-notice-window-off').click();
  await expect(page.getByTestId('mask-notice')).toHaveCount(0);
  await expect(page.getByTestId('node-tag-window')).toHaveCount(0);
  const full = await regionMean(page, await exportJpg(page), 'image/jpeg', CENTER);
  expect(full[1]).toBeGreaterThan(before[1] + 20);
});

test('"전체용 새 노드"는 창 없는 노드를 만들어 선택한다', async ({ page }) => {
  await page.getByTestId('builtin-presets-item').filter({ hasText: /^비네트/ }).click();
  await page.getByTestId('node').first().click();
  await page.getByTestId('mask-notice-new-node').click();
  await expect(page.getByTestId('node')).toHaveCount(2);
  await expect(page.getByTestId('node').nth(1)).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('mask-notice')).toHaveCount(0);
  // 비네트 노드는 그대로 남는다
  await expect(page.getByTestId('node-tag-window')).toHaveCount(1);
});
