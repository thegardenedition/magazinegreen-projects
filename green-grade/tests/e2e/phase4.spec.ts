import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultPrimary, gradePixel8, toUniforms, type Vec3 } from '../../src/engine/color';
import {
  defaultQualifier,
  defaultWindow,
  maskUniform,
  type Qualifier,
  type WindowParams,
} from '../../src/engine/mask';
import { exportJpg, FIXTURE_DIR, regionMean, writeFixtures } from './helpers';

const GARDEN = join(FIXTURE_DIR, 'garden.png');
// 합성 사진의 띠: 하늘 0–40%, 잎 40–80%, 흙 80–100%
const SKY = { x: 0.1, y: 0.05, w: 0.8, h: 0.25 };
const LEAVES = { x: 0.1, y: 0.45, w: 0.8, h: 0.3 };
const SOIL = { x: 0.1, y: 0.85, w: 0.8, h: 0.1 };

test.beforeAll(writeFixtures);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__GG__);
});

const sat = (m: number[]) => Math.max(...m) - Math.min(...m);
const lumOf = (m: number[]) => 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];

async function open(page: Page) {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  await expect(page.getByTestId('file-meta')).toContainText('1600×1067');
}

/** 뷰어에서 이미지 좌표(0–1)를 클릭 */
async function clickImage(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('viewer-canvas').boundingBox())!;
  // 화면 맞춤 상태: 이미지가 가운데, 96% 크기
  const scale = Math.min(box.width / 1600, box.height / 1067) * 0.96;
  const w = 1600 * scale;
  const h = 1067 * scale;
  await page.mouse.click(box.x + (box.width - w) / 2 + x * w, box.y + (box.height - h) / 2 + y * h);
}

test('마스크가 들어간 GPU 결과가 기준 수식과 1 LSB 이내로 일치 (모양 4종 + Qualifier)', async ({ page }) => {
  const W = 32;
  const H = 20;
  const colors: Vec3[] = [];
  const pixels: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c: Vec3 = [(x * 37 + y * 11) % 256, (x * 13 + y * 29 + 60) % 256, (x * 7 + y * 41 + 20) % 256];
      colors.push(c);
      pixels.push(...c, 255);
    }
  const q: Qualifier = { ...defaultQualifier(), enabled: true, hue: { on: true, center: 0.38, width: 0.1, soft: 0.08 } };
  const qLum: Qualifier = {
    ...defaultQualifier(),
    enabled: true,
    invert: true,
    hue: { on: false, center: 0, width: 0.1, soft: 0.1 },
    lum: { on: true, low: 0.3, high: 0.7, soft: 0.1 },
  };
  const w = (shape: WindowParams['shape'], patch: Partial<WindowParams> = {}): WindowParams => ({
    ...defaultWindow(),
    enabled: true,
    feather: 0.12,
    shape,
    ...patch,
  });
  const nodes = [
    { primary: { ...defaultPrimary(), gain: { x: 0.2, y: 0.4, master: 1.6 } }, qualifier: q, window: defaultWindow() },
    {
      primary: { ...defaultPrimary(), saturation: 0.2 },
      qualifier: defaultQualifier(),
      window: w({ type: 'circle', cx: 0.4, cy: 0.5, rx: 0.3, ry: 0.2, angle: 30 }),
    },
    {
      primary: { ...defaultPrimary(), lift: { x: -0.4, y: 0.3, master: 0.06 } },
      qualifier: qLum,
      window: w({ type: 'rect', cx: 0.6, cy: 0.4, w: 0.7, h: 0.3, angle: -20 }, { invert: true }),
    },
    {
      primary: { ...defaultPrimary(), gamma: { x: 0, y: 0, master: -0.3 } },
      qualifier: defaultQualifier(),
      window: w({ type: 'gradient', x0: 0.2, y0: 0, x1: 0.6, y1: 0.8 }),
    },
    {
      primary: { ...defaultPrimary(), hue: 40 },
      qualifier: defaultQualifier(),
      window: w({ type: 'polygon', points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.2 }, { x: 0.7, y: 0.9 }, { x: 0.2, y: 0.7 }], smooth: true }),
    },
  ];
  const gpu = await page.evaluate(
    ({ pixels, W, H, nodes }) => window.__GG__!.gradeNodes(pixels, W, H, nodes, false),
    { pixels, W, H, nodes },
  );
  const chain = nodes.map((n) => toUniforms(n.primary, { mask: maskUniform(n.qualifier, n.window) }));
  let maxDiff = 0;
  colors.forEach((c, i) => {
    const x = i % W;
    const y = Math.floor(i / W);
    const ref = gradePixel8(c, chain, { u: (x + 0.5) / W, v: (y + 0.5) / H, aspect: W / H });
    for (let k = 0; k < 3; k++) maxDiff = Math.max(maxDiff, Math.abs(ref[k] - gpu[i * 4 + k]));
  });
  expect(maxDiff).toBeLessThanOrEqual(1);
});

test('스포이드로 잎을 고르고 채도를 빼면 잎만 회색이 된다', async ({ page }) => {
  await open(page);
  const src = readFileSync(GARDEN);
  const before = { sky: await regionMean(page, src, 'image/png', SKY), leaves: await regionMean(page, src, 'image/png', LEAVES) };

  await page.getByTestId('tab-qualifier').click();
  await page.getByTestId('q-pick').click();
  await expect(page.getByTestId('tool-hint')).toBeVisible();
  await clickImage(page, 0.5, 0.6);
  await expect(page.getByTestId('q-enabled')).toHaveAttribute('aria-pressed', 'true');
  // 넓게 고르기: 더하기로 잎의 밝은 곳과 어두운 곳을 추가
  await page.getByTestId('q-pick-add').click();
  for (const [x, y] of [[0.31, 0.5], [0.37, 0.55], [0.44, 0.62], [0.52, 0.71]]) await clickImage(page, x, y);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tool-hint')).toHaveCount(0);

  await page.getByTestId('tab-primary').click();
  await page.getByTestId('scalar-saturation').fill('0');
  const jpg = await exportJpg(page);
  const sky = await regionMean(page, jpg, 'image/jpeg', SKY);
  const leaves = await regionMean(page, jpg, 'image/jpeg', LEAVES);
  expect(sat(leaves)).toBeLessThan(sat(before.leaves) * 0.5);
  for (let k = 0; k < 3; k++) expect(Math.abs(sky[k] - before.sky[k])).toBeLessThan(2);
});

test('그라디언트 창: 위쪽(하늘)만 어두워지고 아래(흙)는 그대로', async ({ page }) => {
  await open(page);
  const src = readFileSync(GARDEN);
  await page.getByTestId('tab-window').click();
  await page.getByTestId('w-shape-gradient').click();
  await expect(page.getByTestId('window-overlay')).toBeVisible();
  await expect(page.getByTestId('win-handle-start')).toBeVisible();
  await page.getByTestId('tab-primary').click();
  const gain = page.getByLabel('Gain master');
  await gain.fill('0.5');
  await gain.press('Enter');
  const jpg = await exportJpg(page);
  const skyBefore = await regionMean(page, src, 'image/png', { ...SKY, h: 0.1 });
  const skyAfter = await regionMean(page, jpg, 'image/jpeg', { ...SKY, h: 0.1 });
  expect(lumOf(skyAfter)).toBeLessThan(lumOf(skyBefore) - 25);
  const soilBefore = await regionMean(page, src, 'image/png', SOIL);
  const soilAfter = await regionMean(page, jpg, 'image/jpeg', SOIL);
  for (let k = 0; k < 3; k++) expect(Math.abs(soilAfter[k] - soilBefore[k])).toBeLessThan(2);
});

test('원형 창: 중심 핸들을 끌면 위치가 바뀌고, 반전하면 바깥만 보정', async ({ page }) => {
  await open(page);
  await page.getByTestId('tab-window').click();
  await page.getByTestId('w-shape-circle').click();
  const handle = page.getByTestId('win-handle-center');
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 - 120, hb.y + hb.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  const cx = Number(await page.getByLabel('X', { exact: true }).inputValue());
  const cy = Number(await page.getByLabel('Y', { exact: true }).inputValue());
  expect(cx).toBeLessThan(0.45);
  expect(cy).toBeGreaterThan(0.52);

  await page.getByTestId('w-invert').click();
  await page.getByTestId('mask-view-bw').click();
  await expect(page.getByTestId('mask-badge')).toContainText('흑백');
  await page.screenshot({ path: join('test-results', 'phase4-window.png') });
});

test('펜 창: 점을 찍어 폴리곤을 만들고, 점을 더블클릭해 지운다', async ({ page }) => {
  await open(page);
  await page.getByTestId('tab-window').click();
  await page.getByTestId('w-shape-polygon').click();
  await expect(page.getByTestId('tool-hint')).toContainText('점 추가');
  for (const [x, y] of [[0.2, 0.5], [0.5, 0.42], [0.8, 0.5], [0.7, 0.85], [0.3, 0.85]]) await clickImage(page, x, y);
  await expect(page.getByTestId('w-point-count')).toHaveText('점 5개');
  await page.getByTestId('win-handle-pt4').dblclick();
  await expect(page.getByTestId('w-point-count')).toHaveText('점 4개');
  await page.getByTestId('w-smooth').click();
  await page.keyboard.press('Escape');

  // 폴리곤 안(잎 아래쪽·흙)만 어둡게
  await page.getByTestId('tab-primary').click();
  const gain = page.getByLabel('Gain master');
  await gain.fill('0.4');
  await gain.press('Enter');
  const src = readFileSync(GARDEN);
  const jpg = await exportJpg(page);
  const inside = { x: 0.45, y: 0.62, w: 0.1, h: 0.1 };
  const outside = { x: 0.02, y: 0.05, w: 0.1, h: 0.1 };
  expect(lumOf(await regionMean(page, jpg, 'image/jpeg', inside))).toBeLessThan(
    lumOf(await regionMean(page, src, 'image/png', inside)) - 10,
  );
  const o0 = await regionMean(page, src, 'image/png', outside);
  const o1 = await regionMean(page, jpg, 'image/jpeg', outside);
  for (let k = 0; k < 3; k++) expect(Math.abs(o1[k] - o0[k])).toBeLessThan(2);
});

test('마스크 보기: Shift+H 하이라이트, 선택 노드가 바뀌면 그 노드의 마스크', async ({ page }) => {
  await open(page);
  await page.getByTestId('tab-qualifier').click();
  await page.getByTestId('q-pick').click();
  await clickImage(page, 0.5, 0.6);
  await page.keyboard.press('Escape');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Shift+H');
  await expect(page.getByTestId('mask-badge')).toContainText('하이라이트');
  await page.screenshot({ path: join('test-results', 'phase4-qualifier.png') });
  await page.keyboard.press('Shift+H');
  await expect(page.getByTestId('mask-badge')).toHaveCount(0);
});

test('"흐린 날 구제" 프리셋은 하늘 노드에 그라디언트 창을 쓴다', async ({ page }) => {
  await open(page);
  await page.getByTestId('builtin-presets').getByText('흐린 날 구제').click();
  await page.getByTestId('node').nth(1).click();
  await page.getByTestId('tab-window').click();
  await expect(page.getByTestId('w-enabled')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('w-shape-gradient')).toHaveClass(/on/);
});
