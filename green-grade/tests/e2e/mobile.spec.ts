import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { FIXTURE_DIR, jpegSize, writeFixtures } from './helpers';

const GARDEN = join(FIXTURE_DIR, 'garden.png');

// iPhone 13 크기의 터치 화면 (Chromium의 모바일 에뮬레이션)
test.use({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

test.beforeAll(writeFixtures);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__GG__);
});

const zoomPct = async (page: Page) => Number((await page.locator('.viewer-hud .mono').textContent())!.replace('%', ''));

/** CDP로 두 손가락 터치를 보낸다 (핀치) */
async function pinch(page: Page, cx: number, cy: number, from: number, to: number) {
  const cdp = await page.context().newCDPSession(page);
  const pts = (d: number) => [
    { x: cx - d / 2, y: cy, id: 1 },
    { x: cx + d / 2, y: cy, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from) });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(from + ((to - from) * i) / 6) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('휴대폰 화면: 가로로 넘치지 않고, 페이지가 길게 늘어나지 않으며, 아래 탭으로 도구를 바꾼다', async ({ page }) => {
  const dims = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth, document.documentElement.scrollHeight, innerHeight]);
  expect(dims[0]).toBeLessThanOrEqual(dims[1]);
  expect(dims[2]).toBeLessThanOrEqual(dims[3] + 1);
  await expect(page.locator('.m-nav-btn')).toHaveCount(5);
  // 사진이 없어도 뷰어 자리가 있다
  const viewer = (await page.locator('.m-viewer').boundingBox())!;
  expect(viewer.height).toBeGreaterThanOrEqual(180);

  await page.getByTestId('m-tab-library').tap();
  await expect(page.getByTestId('m-pane-library')).toBeVisible();
  await expect(page.getByTestId('m-pane-adjust')).toBeHidden();
  await page.getByTestId('m-tab-photos').tap();
  await expect(page.getByTestId('m-pane-photos')).toContainText('열어 둔 사진이 없습니다');
});

test('사진 열기 → 화면에 맞춰 보임 → 프리셋 탭 → 아래에서 올라오는 내보내기', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  await expect(page.getByTestId('file-meta')).toContainText('garden.png');
  await expect.poll(() => zoomPct(page)).toBeGreaterThan(30);

  await page.getByTestId('m-tab-library').tap();
  await page.getByTestId('builtin-presets-item').filter({ hasText: '신록' }).tap();
  await page.getByTestId('m-tab-nodes').tap();
  await expect(page.getByTestId('node')).not.toHaveCount(1);

  await page.getByTestId('export-open').tap();
  const modal = (await page.locator('.modal').boundingBox())!;
  // 화면 폭을 꽉 채우고 아래에 붙는다
  expect(modal.width).toBeGreaterThan(380);
  expect(modal.y + modal.height).toBeGreaterThan(660);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-confirm').tap()]);
  const { readFileSync } = await import('node:fs');
  expect(jpegSize(readFileSync((await download.path())!))).toEqual({ width: 1600, height: 1067 });
  await page.screenshot({ path: join('test-results', 'mobile-ui.png') });
});

test('두 손가락으로 벌리면 확대, 두 번 탭하면 맞춤', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  await expect.poll(() => zoomPct(page)).toBeGreaterThan(30);
  const fitted = await zoomPct(page);
  const box = (await page.getByTestId('viewer-canvas').boundingBox())!;
  await pinch(page, box.x + box.width / 2, box.y + box.height / 2, 60, 180);
  await expect.poll(() => zoomPct(page)).toBeGreaterThan(fitted * 2);
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.touchscreen.tap(c.x, c.y);
  await page.touchscreen.tap(c.x, c.y);
  await expect.poll(() => zoomPct(page)).toBe(fitted);
});

test('두 번 탭으로 슬라이더를 기본값으로 되돌린다 (더블클릭 대신)', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  const field = page.getByRole('textbox', { name: 'Temp value' });
  await field.fill('30');
  await field.press('Enter');
  await expect(field).toHaveValue('30');
  const label = page.locator('.scalar-label', { hasText: 'Temp' });
  await label.scrollIntoViewIfNeeded();
  const b = (await label.boundingBox())!;
  await page.touchscreen.tap(b.x + 10, b.y + b.height / 2);
  await page.touchscreen.tap(b.x + 10, b.y + b.height / 2);
  await expect(field).toHaveValue('0');
});

test('가로로 돌리면 뷰어 왼쪽, 도구 오른쪽', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  await page.setViewportSize({ width: 844, height: 390 });
  const v = (await page.locator('.m-viewer').boundingBox())!;
  const sheet = (await page.getByTestId('m-sheet').boundingBox())!;
  expect(sheet.x).toBeGreaterThanOrEqual(v.x + v.width - 1);
  expect(v.height).toBeGreaterThan(250);
  // 회전 뒤에도 사진이 화면에 맞춰진다
  await expect.poll(() => zoomPct(page)).toBeGreaterThan(30);
});
