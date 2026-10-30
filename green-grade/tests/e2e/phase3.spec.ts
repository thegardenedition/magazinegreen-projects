import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultPrimary, gradePixel8, toUniforms, type Vec3 } from '../../src/engine/color';
import { bakeCurves, defaultCurves } from '../../src/engine/curves';
import { buildLut, parseCube, serializeCube } from '../../src/engine/lut';
import { FIXTURE_DIR, lum, meanOf, writeFixtures } from './helpers';

const GARDEN = join(FIXTURE_DIR, 'garden.png');
const INVERT_CUBE = join(FIXTURE_DIR, 'invert.cube');

test.beforeAll(() => {
  writeFixtures();
  writeFileSync(INVERT_CUBE, serializeCube(buildLut(17, 'Invert', (r, g, b) => [1 - r, 1 - g, 1 - b])));
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__GG__);
});

async function exportMean(page: Page) {
  await page.getByTestId('export-open').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-confirm').click()]);
  return meanOf(page, readFileSync((await download.path())!), 'image/jpeg');
}

const nodeNames = (page: Page) => page.getByTestId('node').locator('.node-name').allTextContents();

test('노드 체인 + LUT: GPU 결과가 기준 수식과 1 LSB 이내로 일치', async ({ page }) => {
  const pixels: number[] = [];
  const colors: Vec3[] = [];
  for (let r = 0; r < 6; r++)
    for (let g = 0; g < 6; g++)
      for (let b = 0; b < 6; b++) {
        const c: Vec3 = [r * 51, g * 51, b * 51];
        colors.push(c);
        pixels.push(...c, 255);
      }
  // 비선형 LUT: 필름풍 S커브 + 섀도 청록, 하이라이트 앰버
  const cube = serializeCube(
    buildLut(25, 'Film', (r, g, b) => {
      const s = (x: number) => x * x * (3 - 2 * x);
      return [s(r) * 0.95 + 0.03, s(g) * 0.97 + 0.02, s(b) * 0.9 + 0.06 * (1 - b)];
    }),
  );
  const n1 = { primary: { ...defaultPrimary(), gain: { x: 0.2, y: 0.3, master: 1.3 } } };
  const curves2 = defaultCurves();
  curves2.y = [{ x: 0, y: 0 }, { x: 0.4, y: 0.33 }, { x: 1, y: 1 }];
  const n2 = { primary: { ...defaultPrimary(), saturation: 1.4 }, curves: curves2, enabled: false };
  const n3 = { primary: { ...defaultPrimary(), lift: { x: -0.3, y: 0.1, master: 0.03 } }, cube, lutIntensity: 0.65 };

  const gpu = await page.evaluate(
    ({ pixels, n, nodes }) => window.__GG__!.gradeNodes(pixels, n, 1, nodes, false),
    { pixels, n: colors.length, nodes: [n1, n2, n3] },
  );
  const chain = [
    toUniforms(n1.primary),
    toUniforms(n2.primary, { enabled: false, curves: bakeCurves(curves2) }),
    toUniforms(n3.primary, { lut: { lut: parseCube(cube), intensity: 0.65 } }),
  ];
  let maxDiff = 0;
  colors.forEach((c, i) => {
    const ref = gradePixel8(c, chain);
    for (let k = 0; k < 3; k++) maxDiff = Math.max(maxDiff, Math.abs(ref[k] - gpu[i * 4 + k]));
  });
  expect(maxDiff).toBeLessThanOrEqual(1);
});

test('노드 8개를 모두 채워도 셰이더가 동작한다', async ({ page }) => {
  const nodes = Array.from({ length: 8 }, (_, i) => ({
    primary: { ...defaultPrimary(), gain: { x: 0, y: 0, master: i % 2 ? 1.1 : 0.92 } },
  }));
  const gpu = await page.evaluate(
    ({ nodes }) => window.__GG__!.gradeNodes([90, 150, 60, 255], 1, 1, nodes, false),
    { nodes },
  );
  const ref = gradePixel8([90, 150, 60], nodes.map((n) => toUniforms(n.primary)));
  for (let k = 0; k < 3; k++) expect(Math.abs(gpu[k] - ref[k])).toBeLessThanOrEqual(1);
});

test('노드 추가·선택·이름·순서·삭제', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  await page.getByTestId('node-add').click();
  await page.keyboard.press('Alt+s');
  expect(await nodeNames(page)).toEqual(['Primary', '노드 1', '노드 2']);
  await expect(page.getByTestId('editing-node')).toHaveText('노드 2');

  // 두 번째 노드를 골라 Gain 조정 → 그 노드에만 들어간다
  await page.getByTestId('node').nth(1).click();
  await expect(page.getByTestId('editing-node')).toHaveText('노드 1');
  const gain = page.getByLabel('Gain master');
  await gain.fill('1.8');
  await gain.press('Enter');
  await page.getByTestId('node').nth(0).click();
  await expect(gain).toHaveValue('1.000');
  await page.getByTestId('node').nth(1).click();
  await expect(gain).toHaveValue('1.800');

  // 이름 바꾸기
  await page.getByTestId('node').nth(1).locator('.node-name').dblclick();
  await page.getByLabel('노드 이름').fill('잎 밝기');
  await page.getByLabel('노드 이름').press('Enter');
  expect(await nodeNames(page)).toEqual(['Primary', '잎 밝기', '노드 2']);

  // 순서 바꾸기, 삭제
  await page.getByTestId('node-up').click();
  expect(await nodeNames(page)).toEqual(['잎 밝기', 'Primary', '노드 2']);
  await page.getByTestId('node-delete').click();
  expect(await nodeNames(page)).toEqual(['Primary', '노드 2']);
  await expect(gain).toHaveValue('1.000');
});

test('노드를 끄면 그 노드의 보정만 빠진다', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  const before = await meanOf(page, readFileSync(GARDEN), 'image/png');
  const gain = page.getByLabel('Gain master');
  await gain.fill('1.6');
  await gain.press('Enter');
  await page.getByTestId('node-add').click();
  await page.getByTestId('scalar-saturation').fill('0');
  const bright = await exportMean(page);
  expect(lum(bright)).toBeGreaterThan(lum(before) + 15);
  // 채도 0 → R·G·B 평균이 거의 같다
  expect(Math.abs(bright[0] - bright[1])).toBeLessThan(3);

  await page.getByTestId('node-toggle').nth(1).click();
  const colored = await exportMean(page);
  expect(Math.abs(colored[1] - colored[0])).toBeGreaterThan(10);
  expect(lum(colored)).toBeGreaterThan(lum(before) + 15);
});

test('.cube LUT 불러오기 → 강도 조절 → 제거', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  const before = await meanOf(page, readFileSync(GARDEN), 'image/png');
  await page.getByTestId('tab-lut').click();
  await page.getByTestId('lut-file').setInputFiles(INVERT_CUBE);
  await expect(page.getByTestId('lut-info')).toContainText('Invert');
  await expect(page.getByTestId('node').first()).toContainText('LUT Invert');

  const inverted = await exportMean(page);
  for (let k = 0; k < 3; k++) expect(Math.abs(inverted[k] - (255 - before[k]))).toBeLessThan(2);

  await page.getByTestId('lut-intensity').fill('0');
  const none = await exportMean(page);
  for (let k = 0; k < 3; k++) expect(Math.abs(none[k] - before[k])).toBeLessThan(1.5);

  await page.getByTestId('lut-remove').click();
  await expect(page.getByTestId('node').first()).not.toContainText('LUT');
});

test('잘못된 .cube는 오류를 알려 준다', async ({ page }) => {
  const bad = join(FIXTURE_DIR, 'bad.cube');
  writeFileSync(bad, 'LUT_3D_SIZE 2\n0 0 0\n');
  await page.getByTestId('tab-lut').click();
  await page.getByTestId('lut-file').setInputFiles(bad);
  await expect(page.getByTestId('preset-msg')).toContainText('8개');
});

test('정원 프리셋 적용, 되돌리기', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  await page.getByTestId('builtin-presets').getByText('신록').click();
  expect(await nodeNames(page)).toEqual(['톤', '녹색 분리']);
  await page.getByTestId('builtin-presets').getByText('늦가을 정원').click();
  expect(await nodeNames(page)).toEqual(['가을빛']);
  await page.screenshot({ path: join('test-results', 'phase3-ui.png') });
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  expect(await nodeNames(page)).toEqual(['톤', '녹색 분리']);
  await page.keyboard.press('Control+z');
  expect(await nodeNames(page)).toEqual(['Primary']);
});

test('내 프리셋 저장은 새로고침 후에도 남고, JSON 내보내기·불러오기가 왕복된다', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  const gain = page.getByLabel('Gain master');
  await gain.fill('1.25');
  await gain.press('Enter');
  await page.getByTestId('node-add').click();
  await page.getByTestId('tab-lut').click();
  await page.getByTestId('lut-file').setInputFiles(INVERT_CUBE);
  await page.getByTestId('lut-intensity').fill('0.3');
  await page.getByRole('button', { name: 'Presets' }).click();

  await page.getByTestId('preset-save').click();
  await page.getByLabel('프리셋 이름').fill('우리 정원');
  await page.getByTestId('preset-save-confirm').click();
  await expect(page.getByTestId('user-presets')).toContainText('우리 정원');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('preset-export').click()]);
  const json = readFileSync((await download.path())!, 'utf8');
  expect(JSON.parse(json).format).toBe('green-grade-preset');
  const saved = join(FIXTURE_DIR, 'saved-preset.json');
  writeFileSync(saved, json);

  await page.reload();
  await page.waitForFunction(() => !!window.__GG__);
  await expect(page.getByTestId('user-presets')).toContainText('우리 정원');
  expect(await nodeNames(page)).toEqual(['Primary']);

  await page.getByTestId('preset-file').setInputFiles(saved);
  expect(await nodeNames(page)).toEqual(['Primary', '노드 1']);
  await expect(page.getByTestId('node').nth(1)).toContainText('LUT Invert · 30%');
  await page.getByTestId('node').first().click();
  await expect(page.getByLabel('Gain master')).toHaveValue('1.250');
});
