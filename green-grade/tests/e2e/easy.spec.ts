import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { FIXTURE_DIR, writeFixtures } from './helpers';

const GARDEN = join(FIXTURE_DIR, 'garden.png');

// 처음 오는 사람은 쉬운 모드로 시작한다
test.use({ storageState: { cookies: [], origins: [] } });
test.beforeAll(writeFixtures);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__GG__);
});

const summary = (page: Page) =>
  page.evaluate(() => (window as unknown as { __GG_GALLERY__: { summary(): Array<{ nodes: string[] }> } }).__GG_GALLERY__.summary()[0].nodes);

test.describe('PC', () => {
  test('쉬운 모드: 큰 뷰어와 한 칸짜리 도구, 기본 슬라이더는 프리셋을 바꿔도 남는다', async ({ page }) => {
    await expect(page.getByTestId('mode-easy')).toHaveAttribute('aria-pressed', 'true');
    // 노드·스코프·휠은 보이지 않는다
    await expect(page.locator('.panel-nodes')).toHaveCount(0);
    await expect(page.getByTestId('scope-canvas')).toHaveCount(0);
    await page.getByTestId('file-input').setInputFiles(GARDEN);
    await expect(page.getByTestId('file-meta')).toContainText('garden.png');
    const canvas = (await page.getByTestId('viewer-canvas').boundingBox())!;
    expect(canvas.width).toBeGreaterThan(1000);
    expect(canvas.height).toBeGreaterThan(700);

    await page.getByTestId('easy-tab-adjust').click();
    const exposure = page.getByRole('textbox', { name: '밝기 value' });
    await exposure.fill('0.5');
    await exposure.press('Enter');
    await expect.poll(() => summary(page)).toEqual(['Primary', '기본 보정']);

    await page.getByTestId('easy-tab-library').click();
    await page.getByTestId('builtin-presets-item').filter({ hasText: '신록' }).click();
    await expect.poll(async () => (await summary(page)).at(-1)).toBe('기본 보정');
    expect((await summary(page)).length).toBeGreaterThan(2);
    await page.getByTestId('easy-tab-adjust').click();
    await expect(exposure).toHaveValue('0.50');

    // 크게 보기: 도구 칸을 숨기고 사진만
    await page.getByTestId('focus-toggle').click();
    await expect(page.getByTestId('easy-side')).toBeHidden();
    await expect.poll(async () => (await page.getByTestId('viewer-canvas').boundingBox())!.width).toBeGreaterThan(1400);
    await page.keyboard.press('f');
    await expect(page.getByTestId('easy-side')).toBeVisible();
  });

  test('자르기·수평 탭은 원본 전체와 크롭 틀을, 지우개 탭은 붓을 쓴다', async ({ page }) => {
    await page.getByTestId('file-input').setInputFiles(GARDEN);
    await page.getByTestId('easy-tab-crop').click();
    await expect(page.getByTestId('auto-level')).toBeVisible();
    await expect(page.locator('.viewer-transform')).toHaveCount(1);
    await page.getByTestId('easy-tab-heal').click();
    await page.getByTestId('heal-tool').click();
    await expect(page.getByTestId('heal-overlay')).toBeVisible();
    // 다른 탭으로 가면 붓은 꺼진다
    await page.getByTestId('easy-tab-adjust').click();
    await expect(page.getByTestId('heal-overlay')).toHaveCount(0);
  });

  test('전문가 모드로 바꾸면 노드·스코프가 나오고, 다시 와도 기억한다', async ({ page }) => {
    await page.getByTestId('mode-pro').click();
    await expect(page.locator('.panel-nodes')).toBeVisible();
    await expect(page.getByTestId('scope-canvas')).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => !!window.__GG__);
    await expect(page.getByTestId('mode-pro')).toHaveAttribute('aria-pressed', 'true');
    // 전문가 모드에도 크게 보기가 있다
    await page.getByTestId('file-input').setInputFiles(GARDEN);
    await expect(page.getByTestId('file-meta')).toContainText('garden.png');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('f');
    await expect(page.locator('.dock')).toBeHidden();
    await expect(page.locator('.panel-nodes')).toBeHidden();
  });
});

test.describe('휴대폰', () => {
  test.use({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  test('쉬운 모드 아래 탭, 지금 탭을 다시 누르면 도구를 접어 사진이 커진다', async ({ page }) => {
    const labels = await page.locator('.m-nav-btn').allTextContents();
    expect(labels).toEqual(['프리셋', '조정', '자르기', '지우개', '사진']);
    const dims = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(dims[0]).toBeLessThanOrEqual(dims[1]);

    await page.getByTestId('file-input').setInputFiles(GARDEN);
    await page.getByTestId('m-tab-adjust').tap();
    await expect(page.getByTestId('easy-exposure')).toBeVisible();
    const before = (await page.locator('.m-viewer').boundingBox())!.height;
    expect(before).toBeGreaterThan(300);
    await page.getByTestId('m-tab-adjust').tap();
    await expect(page.getByTestId('m-tab-adjust')).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(async () => (await page.locator('.m-viewer').boundingBox())!.height).toBeGreaterThan(before + 100);
    await page.getByTestId('m-tab-adjust').tap();
    await expect(page.getByTestId('easy-exposure')).toBeVisible();

    await page.getByTestId('m-tab-crop').tap();
    await expect(page.getByTestId('auto-level')).toBeVisible();
    await page.screenshot({ path: join('test-results', 'mobile-easy.png') });
  });
});
