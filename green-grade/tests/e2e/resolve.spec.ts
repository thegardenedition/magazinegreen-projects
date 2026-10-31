import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultPrimary, gradePixel8, toUniforms, type PrimaryParams, type Vec3 } from '../../src/engine/color';
import { bakeCurves, defaultCurves } from '../../src/engine/curves';
import { buildLut, serializeCube } from '../../src/engine/lut';
import { exportJpg, FIXTURE_DIR, regionMean, writeFixtures } from './helpers';

const GARDEN = join(FIXTURE_DIR, 'garden.png');
const LEAVES = { x: 0.1, y: 0.45, w: 0.8, h: 0.3 };
const WARM_CUBE = join(FIXTURE_DIR, '따뜻한 룩.cube');
const COOL_3DL = join(FIXTURE_DIR, 'cool-look.3dl');

/** 파란 쪽으로 미는 5³ LUT를 10bit .3dl로 (B가 가장 빠른 순서) */
function cool3dl() {
  const n = 5;
  const lines = [Array.from({ length: n }, (_, i) => Math.round((i * 1023) / (n - 1))).join(' ')];
  for (let r = 0; r < n; r++)
    for (let g = 0; g < n; g++)
      for (let b = 0; b < n; b++) {
        const [rn, gn, bn] = [r, g, b].map((v) => v / (n - 1));
        lines.push([rn * 0.8, gn * 0.95, Math.min(1, bn + 0.15)].map((v) => Math.round(v * 1023)).join(' '));
      }
  return lines.join('\n');
}

test.beforeAll(() => {
  writeFixtures();
  writeFileSync(WARM_CUBE, serializeCube(buildLut(9, '따뜻한 룩', (r, g, b) => [Math.min(1, r * 1.1 + 0.03), g, b * 0.85])));
  writeFileSync(COOL_3DL, cool3dl());
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__GG__);
});

test('Shadows·Highlights·Color Boost·Log 휠·RGB Mixer·Sat 커브: GPU 결과가 기준 수식과 1 LSB 이내', async ({ page }) => {
  const pixels: number[] = [];
  const colors: Vec3[] = [];
  for (let r = 0; r < 6; r++)
    for (let g = 0; g < 6; g++)
      for (let b = 0; b < 6; b++) {
        const c: Vec3 = [r * 51, g * 51, b * 51];
        colors.push(c);
        pixels.push(...c, 255);
      }
  const curves = { ...defaultCurves(), satSat: [{ x: 0, y: 0.5 }, { x: 0.4, y: 0.6 }, { x: 1, y: 0.3 }], satLum: [{ x: 0.2, y: 0.5 }, { x: 1, y: 0.35 }] };
  const cases: Array<[string, Partial<PrimaryParams>, boolean]> = [
    ['Shadows·Highlights', { shadows: 55, highlights: -45 }, false],
    ['Color Boost +/−', { colorBoost: 70 }, false],
    ['Color Boost −', { colorBoost: -60, saturation: 1.2 }, false],
    ['Log 휠', { shadow: { x: 0.5, y: -0.3, master: 0.04 }, midtone: { x: -0.2, y: 0.4, master: -0.03 }, highlight: { x: -0.4, y: 0.5, master: 0.05 }, lowRange: 0.25, highRange: 0.7 }, false],
    ['RGB Mixer', { mixer: { rows: [[0.8, 0.3, -0.1], [0.1, 0.9, 0], [0, 0.2, 0.8]], mono: false, preserve: false } }, false],
    ['RGB Mixer 흑백 + 휘도 유지', { mixer: { rows: [[0.3, 1.2, 0.2], [0, 1, 0], [0, 0, 1]], mono: true, preserve: true } }, false],
    ['Sat vs Sat · Sat vs Lum', {}, true],
    ['전부 함께', { shadows: 30, colorBoost: 40, shadow: { x: 0.3, y: 0, master: 0 }, hue: 20, mixer: { rows: [[0.9, 0.1, 0], [0, 1, 0], [0.1, 0, 0.9]], mono: false, preserve: true } }, true],
  ];
  for (const [name, patch, withCurves] of cases) {
    const primary = { ...defaultPrimary(), ...patch };
    const gpu = await page.evaluate(
      ({ pixels, n, node }) => window.__GG__!.gradeNodes(pixels, n, 1, [node], false),
      { pixels, n: colors.length, node: { primary, curves: withCurves ? curves : undefined } },
    );
    const u = toUniforms(primary, { curves: withCurves ? bakeCurves(curves) : undefined });
    let max = 0;
    colors.forEach((c, i) => {
      const ref = gradePixel8(c, u);
      for (let k = 0; k < 3; k++) max = Math.max(max, Math.abs(ref[k] - gpu[i * 4 + k]));
    });
    expect(max, name).toBeLessThanOrEqual(1);
  }
});

test('Log 휠로 바꿔 보고, RGB Mixer 흑백은 내보낸 사진을 무채색으로 만든다', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  await page.getByTestId('wheels-log').click();
  await expect(page.getByTestId('wheel-shadow')).toBeVisible();
  await expect(page.getByTestId('wheel-highlight')).toBeVisible();
  await expect(page.getByTestId('wheel-lift')).toHaveCount(0);
  await page.getByTestId('tab-mixer').click();
  await page.getByTestId('mixer-mono').check();
  const leaves = await regionMean(page, await exportJpg(page), 'image/jpeg', LEAVES);
  expect(Math.max(...leaves) - Math.min(...leaves)).toBeLessThan(2);
  await page.screenshot({ path: join('test-results', 'resolve-mixer.png') });
});

async function lutTab(page: Page) {
  await page.getByTestId('tab-lut').click();
}

test('.cube·.3dl 여러 개를 불러오면 내 LUT에 보관되고 첫 번째가 적용되며, 새로고침 뒤에도 남는다', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  await lutTab(page);
  await page.getByTestId('lut-file').setInputFiles([WARM_CUBE, COOL_3DL]);
  await expect(page.getByTestId('user-lut-item')).toHaveCount(2);
  await expect(page.getByTestId('preset-msg')).toContainText('따뜻한 룩');
  await expect(page.getByTestId('preset-msg')).toContainText('외 1개');
  await expect(page.getByTestId('node').first()).toContainText('LUT 따뜻한 룩');

  // .3dl을 눌러 바꿔 적용: 파란 쪽으로
  await page.getByTestId('user-lut-item').filter({ hasText: 'cool-look' }).click();
  await expect(page.getByTestId('node').first()).toContainText('LUT cool-look');
  const sky = await regionMean(page, await exportJpg(page), 'image/jpeg', { x: 0.1, y: 0.05, w: 0.8, h: 0.2 });
  expect(sky[2]).toBeGreaterThan(sky[0] + 60);

  await page.reload();
  await page.waitForFunction(() => !!window.__GG__);
  await lutTab(page);
  await expect(page.getByTestId('user-lut-item')).toHaveCount(2);
  await page.getByTestId('user-lut-remove').first().click();
  await expect(page.getByTestId('user-lut-item')).toHaveCount(1);
  await page.reload();
  await page.waitForFunction(() => !!window.__GG__);
  await lutTab(page);
  await expect(page.getByTestId('user-lut-item')).toHaveCount(1);
});

test('LUT 파일을 화면에 끌어다 놓으면 선택 노드에 적용된다', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  const text = serializeCube(buildLut(5, 'Drop 룩', (r, g, b) => [g, r, b]));
  await page.evaluate((text) => {
    const dt = new DataTransfer();
    dt.items.add(new File([text], 'drop.cube', { type: '' }));
    const app = document.querySelector('.app')!;
    app.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, text);
  await expect(page.getByTestId('node').first()).toContainText('LUT Drop 룩');
  await expect(page.getByTestId('user-lut-item')).toHaveCount(1);
});
