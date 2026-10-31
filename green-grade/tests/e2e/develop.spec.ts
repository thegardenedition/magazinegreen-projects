import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { defaultPrimary, gradeChain, linearToSrgb, toUniforms, type PrimaryParams, type Vec3 } from '../../src/engine/color';
import {
  applyGrain,
  computeBase,
  defaultDevelop,
  developReference,
  planDevelop,
  updateGeometry,
  type Detail,
  type Develop,
  type Geometry,
  type PixelSource,
} from '../../src/engine/develop';
import { FIXTURE_DIR, jpegSize, regionMean, writeBatchFixtures, writeFixtures } from './helpers';

const GARDEN = join(FIXTURE_DIR, 'garden.png');

test.beforeAll(writeFixtures);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__GG__);
});

/** 결정적인 시험 이미지: 하늘·잎 무늬·경계·잡티·색 얼룩 */
function testImage(w: number, h: number, seed = 1): PixelSource {
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = y / h;
      const n = (rnd() - 0.5) * 18;
      const c = (rnd() - 0.5) * 24;
      let rgb: Vec3;
      if (t < 0.35) rgb = [150 + 40 * t, 180 + 30 * t, 225];
      else if (x % 97 < 50) rgb = [60 + 30 * Math.sin(x * 0.4) * Math.cos(y * 0.3), 120 + 40 * Math.sin(x * 0.4), 50];
      else rgb = [175, 140, 95];
      const i = (y * w + x) * 4;
      data[i] = rgb[0] + n + c;
      data[i + 1] = rgb[1] + n;
      data[i + 2] = rgb[2] + n - c;
      data[i + 3] = 255;
    }
  return { data, width: w, height: h };
}

/** CPU 기준: 현상 → 노드 → sRGB → 그레인 → 8bit */
function cpuRender(src: PixelSource, develop: Develop, primary: PrimaryParams) {
  const plan = planDevelop(develop, src.width, src.height, 1);
  const base = plan.needsBase ? computeBase(src, develop.geometry, src.width, src.height) : null;
  const lin = developReference(src, plan, base);
  const u = toUniforms(primary);
  const { outW: w, outH: h } = plan;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const uv = { u: (x + 0.5) / w, v: (y + 0.5) / h };
      const c = gradeChain([lin[i * 3], lin[i * 3 + 1], lin[i * 3 + 2]], [u], { ...uv, aspect: w / h });
      const s0 = c.map((v) => linearToSrgb(Math.min(1, Math.max(0, v)))) as Vec3;
      const s1 = applyGrain(s0, uv.u, uv.v, plan.grain);
      for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.round(Math.min(1, Math.max(0, s1[k])) * 255);
    }
  return { pixels: out, width: w, height: h };
}

async function gpuRender(page: Page, src: PixelSource, develop: Develop, primary: PrimaryParams) {
  return page.evaluate(
    ({ data, w, h, develop, primary }) => window.__GG__!.developNodes(data, w, h, develop, [{ primary }], false),
    { data: Array.from(src.data), w: src.width, h: src.height, develop, primary },
  );
}

const withGeometry = (patch: Partial<Geometry>, w: number, h: number): Develop => {
  const d = defaultDevelop();
  return { ...d, geometry: updateGeometry(d.geometry, patch, w, h) };
};
const withDetail = (patch: Partial<Detail>): Develop => {
  const d = defaultDevelop();
  return { ...d, detail: { ...d.detail, ...patch } };
};

test('형태·디테일·그레인: GPU 결과가 기준 수식과 1 LSB 이내로 일치', async ({ page }) => {
  const W = 320;
  const H = 200;
  const src = testImage(W, H);
  const graded = defaultPrimary();
  graded.contrast = 1.15;
  graded.saturation = 1.2;
  graded.gain = { x: 0.1, y: -0.2, master: 1.1 };
  const cases: Array<[string, Develop, PrimaryParams]> = [
    ['회전 90° + 좌우 반전', withGeometry({ rotate: 90, flipH: true }, W, H), graded],
    ['수평 7° (자동 크롭)', withGeometry({ straighten: 7 }, W, H), defaultPrimary()],
    ['원근 세로 40 · 가로 −25', withGeometry({ vertical: 40, horizontal: -25 }, W, H), graded],
    ['크롭 4:5', withGeometry({ aspect: '4:5' }, W, H), defaultPrimary()],
    ['샤프닝 + 마스킹', withDetail({ sharpen: 120, sharpenRadius: 1.4, sharpenMasking: 30 }), defaultPrimary()],
    ['노이즈 감소', withDetail({ noiseLuma: 70, noiseColor: 80 }), graded],
    ['텍스처·선명도·디헤이즈 +', withDetail({ texture: 60, clarity: 50, dehaze: 40 }), defaultPrimary()],
    ['선명도·디헤이즈 −', withDetail({ clarity: -60, dehaze: -50 }), defaultPrimary()],
    ['그레인', withDetail({ grain: 60, grainSize: 150 }), graded],
    ['비네트 + / 중심·부드러움', withDetail({ vignette: 70, vignetteMidpoint: 30, vignetteFeather: 40 }), graded],
    ['비네트 −', withDetail({ vignette: -50 }), defaultPrimary()],
    ['글로우 + 할레이션', withDetail({ glow: 70, halation: 80 }), graded],
    [
      '전부 함께',
      {
        geometry: updateGeometry(defaultDevelop().geometry, { straighten: -4, vertical: 20, aspect: '3:2' }, W, H),
        detail: { ...defaultDevelop().detail, sharpen: 80, noiseLuma: 40, noiseColor: 50, texture: 30, clarity: 30, dehaze: 20, grain: 40 },
      },
      graded,
    ],
  ];
  for (const [name, develop, primary] of cases) {
    const gpu = await gpuRender(page, src, develop, primary);
    const cpu = cpuRender(src, develop, primary);
    expect([gpu.width, gpu.height], name).toEqual([cpu.width, cpu.height]);
    let max = 0;
    let at = -1;
    for (let i = 0; i < cpu.pixels.length; i++) {
      if (i % 4 === 3) continue;
      const d = Math.abs(cpu.pixels[i] - gpu.pixels[i]);
      if (d > max) {
        max = d;
        at = i;
      }
    }
    expect(max, `${name} (픽셀 ${Math.floor(at / 4)})`).toBeLessThanOrEqual(1);
  }
});

test('현상 타일(1024px) 경계에서도 결과가 이어진다', async ({ page }) => {
  const src = testImage(2300, 120, 9);
  const develop = withDetail({ sharpen: 100, noiseLuma: 60, noiseColor: 60, texture: 50 });
  develop.geometry = updateGeometry(develop.geometry, { flipH: true }, 2300, 120);
  const gpu = await gpuRender(page, src, develop, defaultPrimary());
  const cpu = cpuRender(src, develop, defaultPrimary());
  expect(cpu.width).toBeGreaterThan(2048);
  let max = 0;
  for (let i = 0; i < cpu.pixels.length; i++) if (i % 4 !== 3) max = Math.max(max, Math.abs(cpu.pixels[i] - gpu.pixels[i]));
  expect(max).toBeLessThanOrEqual(1);
});

async function exportWith(page: Page, longEdge?: string) {
  await page.getByTestId('export-open').click();
  if (longEdge) await page.getByTestId('long-edge').selectOption(longEdge);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-confirm').click()]);
  const { readFileSync } = await import('node:fs');
  return readFileSync((await download.path())!);
}

test('형태 탭: 90° 회전, 비율 크롭, 긴 변 줄여 내보내기, 되돌리기', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  await page.getByTestId('tab-transform').click();
  await expect(page.getByTestId('editing-node')).toHaveText('사진 전체');
  await expect(page.getByTestId('crop-size')).toHaveText('1600 × 1067 px');

  await page.getByTestId('rotate-right').click();
  await expect(page.getByTestId('crop-size')).toHaveText('1067 × 1600 px');
  const rotated = await exportWith(page, '1080');
  expect(jpegSize(rotated)).toEqual({ width: 720, height: 1080 });
  // 하늘(원래 위쪽)이 오른쪽으로 간다
  const right = await regionMean(page, rotated, 'image/jpeg', { x: 0.85, y: 0.1, w: 0.1, h: 0.8 });
  const left = await regionMean(page, rotated, 'image/jpeg', { x: 0.03, y: 0.1, w: 0.1, h: 0.8 });
  expect(right[2]).toBeGreaterThan(right[0] + 40);
  expect(left[0]).toBeGreaterThan(left[2]);

  await page.getByTestId('aspect-1x1').click();
  await expect(page.getByTestId('crop-size')).toHaveText('1067 × 1067 px');
  await page.getByTestId('tab-primary').click();
  expect(jpegSize(await exportWith(page))).toEqual({ width: 1067, height: 1067 });

  await page.keyboard.press('Control+z');
  await page.getByTestId('tab-transform').click();
  await expect(page.getByTestId('crop-size')).toHaveText('1067 × 1600 px');
});

test('수평: 값을 넣으면 크롭이 줄고, 기준선을 그으면 그 선이 수평이 된다', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  await page.getByTestId('tab-transform').click();
  const field = page.getByRole('textbox', { name: '수평 value' });
  await field.fill('5');
  await field.press('Enter');
  const text = await page.getByTestId('crop-size').textContent();
  const w = Number(text!.split(' ')[0]);
  expect(w).toBeLessThan(1600);
  expect(w).toBeGreaterThan(1200);
  await page.screenshot({ path: join('test-results', 'transform-straighten.png') });

  // 화면에서 시계 방향으로 5° 기울어진 선을 그으면 수평 보정이 그만큼 줄어 0이 된다
  await page.getByTestId('level-tool').click();
  const box = (await page.getByTestId('viewer-canvas').boundingBox())!;
  const x0 = box.x + box.width * 0.25;
  const y0 = box.y + box.height * 0.5;
  const dx = 400;
  const dy = Math.round(dx * Math.tan((5 * Math.PI) / 180));
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + dx / 2, y0 + dy / 2, { steps: 4 });
  await page.mouse.move(x0 + dx, y0 + dy, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('level-tool')).not.toHaveClass(/on/);
  expect(Math.abs(Number(await field.inputValue()))).toBeLessThanOrEqual(0.2);
});

test('크롭 핸들을 끌면 크롭이 줄고, 내보낸 크기와 같다', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  await page.getByTestId('tab-transform').click();
  await page.getByTestId('aspect-free').click();
  const h = (await page.getByTestId('crop-handle-se').boundingBox())!;
  await page.mouse.move(h.x + 6, h.y + 6);
  await page.mouse.down();
  await page.mouse.move(h.x - 120, h.y - 80, { steps: 5 });
  await page.mouse.up();
  const text = (await page.getByTestId('crop-size').textContent())!;
  const [cw, ch] = text.replace(' px', '').split(' × ').map(Number);
  expect(cw).toBeLessThan(1600);
  expect(ch).toBeLessThan(1067);
  // 크롭을 옮겨도 크기는 그대로
  const r = (await page.getByTestId('crop-rect').boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + 60, r.y + r.height / 2 + 40, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('crop-size')).toHaveText(text);
  await page.getByTestId('tab-primary').click();
  expect(jpegSize(await exportWith(page))).toEqual({ width: cw, height: ch });
});

/** 내보낸 JPG 두 장의 평균 절대 차이 */
async function meanAbsDiff(page: Page, a: Buffer, b: Buffer) {
  return page.evaluate(
    async ({ a, b }) => {
      const read = async (b64: string) => {
        const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bmp = await createImageBitmap(new Blob([bin], { type: 'image/jpeg' }));
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = c.getContext('2d')!;
        ctx.drawImage(bmp, 0, 0);
        return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      };
      const [x, y] = await Promise.all([read(a), read(b)]);
      let s = 0;
      for (let i = 0; i < x.length; i++) if (i % 4 !== 3) s += Math.abs(x[i] - y[i]);
      return s / ((x.length / 4) * 3);
    },
    { a: a.toString('base64'), b: b.toString('base64') },
  );
}

test('디테일 탭: 샤프닝·디헤이즈·그레인이 내보낸 사진에 반영되고, 리셋하면 돌아온다', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(GARDEN);
  const before = await exportWith(page);
  await page.getByTestId('tab-detail').click();
  await expect(page.getByTestId('editing-node')).toHaveText('사진 전체');
  const set = async (label: string, v: string) => {
    const f = page.getByRole('textbox', { name: `${label} value` }).first();
    await f.fill(v);
    await f.press('Enter');
  };
  await set('양', '150');
  const sharp = await exportWith(page);
  // 합성 정원 사진은 매끈해서 샤프닝은 띠 경계에만 걸린다
  expect(await meanAbsDiff(page, before, sharp)).toBeGreaterThan(0.15);
  await set('디헤이즈', '60');
  await page.getByRole('textbox', { name: '양 value' }).nth(1).fill('70');
  await page.getByRole('textbox', { name: '양 value' }).nth(1).press('Enter');
  await page.screenshot({ path: join('test-results', 'detail-panel.png') });
  const all = await exportWith(page);
  expect(await meanAbsDiff(page, sharp, all)).toBeGreaterThan(1);
  await page.getByTestId('reset-detail').click();
  expect(await meanAbsDiff(page, before, await exportWith(page))).toBeLessThan(0.3);
});

test('그레이드 복사·붙여넣기는 디테일을 함께 옮기고 크롭은 옮기지 않는다', async ({ page }) => {
  const files = writeBatchFixtures();
  await page.getByTestId('file-input').setInputFiles(files.slice(0, 2));
  await expect(page.getByTestId('film-item')).toHaveCount(2);
  await expect(page.getByTestId('file-meta')).toContainText('정원-A.png');
  await page.getByTestId('tab-detail').click();
  const f = page.getByRole('textbox', { name: '선명도 value' });
  await f.fill('40');
  await f.press('Enter');
  await page.getByTestId('tab-transform').click();
  await page.getByTestId('aspect-1x1').click();
  await expect(page.getByTestId('crop-size')).toHaveText('800 × 800 px');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+c');

  const second = page.getByTestId('film-item').nth(1);
  await second.getByRole('checkbox').check();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+v');
  await second.locator('.film-thumb').click();
  await expect(page.getByTestId('file-meta')).toContainText('정원-B.png');
  await expect(page.getByTestId('crop-size')).toHaveText('800 × 1000 px');
  await page.getByTestId('tab-detail').click();
  await expect(page.getByRole('textbox', { name: '선명도 value' })).toHaveValue('40');
});
