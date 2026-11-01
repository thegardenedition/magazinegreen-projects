import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { defaultPrimary, gradePixel8, toUniforms, type Vec3 } from '../../src/engine/color';
import { bakeCurves, defaultCurves, SIX_VECTORS, type CurvesParams } from '../../src/engine/curves';
import { FIXTURE_DIR, lum, meanOf, writeFixtures } from './helpers';

const GARDEN = join(FIXTURE_DIR, 'garden.png');

test.beforeAll(writeFixtures);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__GG__);
});

/** 스코프 캔버스에서 밝은 픽셀(신호)이 차지하는 비율 */
async function scopeSignal(page: Page) {
  const png = PNG.sync.read(await page.getByTestId('scope-canvas').screenshot());
  let lit = 0;
  for (let i = 0; i < png.data.length; i += 4) if (png.data[i] + png.data[i + 1] + png.data[i + 2] > 150) lit++;
  return lit / (png.width * png.height);
}

async function exportAndMean(page: Page) {
  await page.getByTestId('export-open').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-confirm').click()]);
  return meanOf(page, readFileSync((await download.path())!), 'image/jpeg');
}

test('커브가 들어간 GPU 결과가 기준 수식과 1 LSB 이내로 일치', async ({ page }) => {
  const pixels: number[] = [];
  const colors: Vec3[] = [];
  for (let r = 0; r < 6; r++)
    for (let g = 0; g < 6; g++)
      for (let b = 0; b < 6; b++) {
        const c: Vec3 = [r * 51, g * 51, b * 51];
        colors.push(c);
        pixels.push(...c, 255);
      }
  const green = SIX_VECTORS[2][1];
  const cases: Array<[string, (c: CurvesParams) => void]> = [
    ['Custom Y/R/B', (c) => {
      c.y = [{ x: 0, y: 0.04 }, { x: 0.3, y: 0.22 }, { x: 0.7, y: 0.8 }, { x: 1, y: 0.97 }];
      c.r = [{ x: 0, y: 0 }, { x: 0.5, y: 0.56 }, { x: 1, y: 1 }];
      c.b = [{ x: 0, y: 0.05 }, { x: 1, y: 0.92 }];
    }],
    ['Hue vs Hue/Sat/Lum', (c) => {
      c.hueHue = [{ x: green - 0.08, y: 0.5 }, { x: green, y: 0.3 }, { x: green + 0.08, y: 0.5 }];
      c.hueSat = [{ x: 0.1, y: 0.7 }, { x: 0.5, y: 0.35 }, { x: 0.8, y: 0.6 }];
      c.hueLum = [{ x: 0.6, y: 0.5 }, { x: 0.7, y: 0.25 }, { x: 0.8, y: 0.5 }];
    }],
    ['Lum vs Sat', (c) => {
      c.lumSat = [{ x: 0, y: 0.2 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.15 }];
    }],
  ];

  for (const [name, patch] of cases) {
    const curves = defaultCurves();
    patch(curves);
    const p = defaultPrimary();
    p.contrast = 1.15;
    const gpu = await page.evaluate(
      ({ pixels, n, p, curves }) => window.__GG__!.gradePixels(pixels, n, 1, p, false, curves),
      { pixels, n: colors.length, p, curves },
    );
    const u = toUniforms(p, { curves: bakeCurves(curves) });
    let maxDiff = 0;
    colors.forEach((c, i) => {
      const ref = gradePixel8(c, u);
      for (let k = 0; k < 3; k++) maxDiff = Math.max(maxDiff, Math.abs(ref[k] - gpu[i * 4 + k]));
    });
    expect(maxDiff, name).toBeLessThanOrEqual(1);
  }
});

test('스코프 4종이 실제 신호를 그린다', async ({ page }) => {
  await expect(page.getByTestId('clip-stats')).toHaveText('—');
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  for (const mode of ['waveform', 'parade', 'vectorscope', 'histogram']) {
    await page.getByTestId(`scope-tab-${mode}`).click();
    await expect.poll(() => scopeSignal(page), { message: mode }).toBeGreaterThan(0.005);
  }
});

test('Waveform은 보정에 따라 실시간으로 움직인다', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  await expect.poll(() => scopeSignal(page)).toBeGreaterThan(0.005);
  const before = PNG.sync.read(await page.getByTestId('scope-canvas').screenshot());
  const gain = page.getByLabel('Gain master');
  await gain.fill('0.4');
  await gain.press('Enter');
  await expect
    .poll(async () => {
      const after = PNG.sync.read(await page.getByTestId('scope-canvas').screenshot());
      let diff = 0;
      for (let i = 0; i < after.data.length; i += 4) diff += Math.abs(after.data[i] - before.data[i]);
      return diff / (after.width * after.height);
    })
    .toBeGreaterThan(5);
});

test('클리핑 경고: Gain을 크게 올리면 하이라이트 클리핑이 표시된다', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  await expect(page.getByTestId('clip-high')).toContainText('0.00%');
  await expect(page.getByTestId('clip-high')).not.toHaveClass(/clip-warn/);
  const gain = page.getByLabel('Gain master');
  await gain.fill('3');
  await gain.press('Enter');
  await expect(page.getByTestId('clip-high')).toHaveClass(/clip-warn/);
  const lift = page.getByLabel('Lift master');
  await lift.fill('-0.5');
  await lift.press('Enter');
  await expect(page.getByTestId('clip-low')).toHaveClass(/clip-warn/);
});

test('Curves 탭: Y 커브를 끌어내리면 결과가 어두워진다', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  const before = await meanOf(page, readFileSync(GARDEN), 'image/png');
  await page.getByTestId('tab-curves').click();
  const box = (await page.getByTestId('curve-custom').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.75, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('curve-custom-point')).toHaveCount(3);
  await page.screenshot({ path: join('test-results', 'phase2-ui.png') });
  const after = await exportAndMean(page);
  expect(lum(after)).toBeLessThan(lum(before) - 10);
});

test('Hue vs Sat: 점을 추가하면 양옆 고정점이 함께 생기고, 더블클릭으로 지운다', async ({ page }) => {
  await page.getByTestId('tab-curves').click();
  await page.getByTestId('curve-tab-hueSat').click();
  const box = (await page.getByTestId('curve-hue').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await expect(page.getByTestId('curve-hue-point')).toHaveCount(3);
  await page.getByTestId('curve-hue-point').nth(1).dblclick();
  await expect(page.getByTestId('curve-hue-point')).toHaveCount(2);
});

test('되돌리기·다시 실행: 단축키와 버튼', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  const gain = page.getByLabel('Gain master');
  await expect(page.getByTestId('undo')).toBeDisabled();
  await gain.fill('1.5');
  await gain.press('Enter');
  await expect(page.getByTestId('undo')).toBeEnabled();
  await page.getByTestId('scalar-saturation').fill('1.4');
  await expect(page.getByLabel('Sat value')).toHaveValue('1.40');
  await page.locator('body').click({ position: { x: 5, y: 5 } });

  await page.keyboard.press('Control+z');
  await expect(page.getByLabel('Sat value')).toHaveValue('1.00');
  await expect(gain).toHaveValue('1.500');
  await page.keyboard.press('Control+z');
  await expect(gain).toHaveValue('1.000');
  await page.keyboard.press('Control+Shift+z');
  await expect(gain).toHaveValue('1.500');
  await page.getByTestId('redo').click();
  await expect(page.getByLabel('Sat value')).toHaveValue('1.40');
  await expect(page.getByTestId('redo')).toBeDisabled();
});

test('초기화: 노드·형태·디테일을 한 번에 처음 상태로, 알림의 취소나 되돌리기로 되살린다', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  await expect(page.getByTestId('reset-all')).toBeEnabled();
  // 상단 버튼은 글자와 아이콘을 함께 보여 준다
  await expect(page.getByTestId('undo')).toContainText('되돌리기');
  await expect(page.getByTestId('reset-all')).toContainText('초기화');

  const gain = page.getByLabel('Gain master');
  await gain.fill('1.5');
  await gain.press('Enter');
  await page.getByTestId('node-add').click();
  await expect(page.getByTestId('node')).toHaveCount(2);
  await page.getByTestId('tab-detail').click();
  const sharpen = page.getByRole('textbox', { name: '양 value' }).first();
  await sharpen.fill('60');
  await sharpen.press('Enter');
  await expect(sharpen).toHaveValue('60');

  await page.getByTestId('reset-all').click();
  await expect(page.getByTestId('reset-toast')).toBeVisible();
  await expect(page.getByTestId('node')).toHaveCount(1);
  await expect(sharpen).not.toHaveValue('60');

  // 알림의 취소: 한 번에 모두 돌아온다
  await page.getByTestId('reset-undo').click();
  await expect(page.getByTestId('reset-toast')).toHaveCount(0);
  await expect(page.getByTestId('node')).toHaveCount(2);
  await expect(sharpen).toHaveValue('60');

  // 다시 초기화 → 상단 되돌리기 버튼으로도 되살린다
  await page.getByTestId('reset-all').click();
  await expect(page.getByTestId('node')).toHaveCount(1);
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('node')).toHaveCount(2);
  await expect(sharpen).toHaveValue('60');
});
