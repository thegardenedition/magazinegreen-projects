import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { exportJpg, FIXTURE_DIR, regionMean, writeFixtures } from './helpers';

const TILTED = join(FIXTURE_DIR, 'tilted-horizon.png');
const LITTER = join(FIXTURE_DIR, 'lawn-litter.png');

function hash(x: number, y: number) {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

function writePng(file: string, w: number, h: number, f: (x: number, y: number) => [number, number, number]) {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = f(x, y);
      const i = (y * w + x) * 4;
      png.data[i] = c[0];
      png.data[i + 1] = c[1];
      png.data[i + 2] = c[2];
      png.data[i + 3] = 255;
    }
  writeFileSync(file, PNG.sync.write(png));
}

test.beforeAll(() => {
  writeFixtures();
  // 지평선이 시계 방향으로 4° 기운 사진 (가장자리는 부드럽게)
  const t = Math.tan((4 * Math.PI) / 180);
  writePng(TILTED, 1200, 800, (x, y) => {
    const d = y - (800 * 0.45 + (x - 600) * t);
    const k = Math.min(1, Math.max(0, d / 2 + 0.5));
    const n = (hash(x, y) - 0.5) * 16;
    return [150 + (70 - 150) * k + n, 190 + (110 - 190) * k + n, 230 + (50 - 230) * k + n];
  });
  // 잔디 한가운데 빨간 물체 (반지름 40px)
  writePng(LITTER, 1200, 800, (x, y) => {
    if (Math.hypot(x - 600, y - 400) < 40) return [215, 35, 45];
    const n = (hash(x, y) - 0.5) * 50;
    return [60 + n, 120 + n, 40 + n * 0.5];
  });
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__GG__);
});

test('자동 수평: 4° 기운 지평선을 찾아 수평 값을 −4°로 맞춘다', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(TILTED);
  await page.getByTestId('tab-transform').click();
  await page.getByTestId('auto-level').click();
  await expect(page.getByTestId('level-note')).toContainText('맞춤');
  const v = Number(await page.getByRole('textbox', { name: '수평 value' }).inputValue());
  expect(Math.abs(v + 4)).toBeLessThanOrEqual(0.4);
});

async function centerRed(page: Page) {
  const m = await regionMean(page, await exportJpg(page), 'image/jpeg', { x: 0.47, y: 0.45, w: 0.06, h: 0.1 });
  return m[0] - m[1];
}

test('지우개: 칠한 물체를 주변 잔디로 메우고, 되돌리기로 되살린다', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(LITTER);
  expect(await centerRed(page)).toBeGreaterThan(80);
  await page.getByTestId('tab-heal').click();
  await expect(page.getByTestId('editing-node')).toHaveText('사진 전체');
  const size = page.getByRole('textbox', { name: '붓 크기 value' });
  await size.fill('90');
  await size.press('Enter');
  await page.getByTestId('heal-tool').click();

  // 화면 맞춤이라 사진 한가운데 = 뷰어 한가운데
  const box = (await page.getByTestId('viewer-canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 15, cy - 10);
  await page.mouse.down();
  for (const [dx, dy] of [[15, -10], [15, 10], [-15, 10], [0, 0]]) await page.mouse.move(cx + dx, cy + dy, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByTestId('heal-status')).toHaveText('지운 곳 1개', { timeout: 60_000 });
  await page.screenshot({ path: join('test-results', 'heal.png') });

  // 내보낸 원본 해상도에도 빨강이 남지 않는다
  expect(await centerRed(page)).toBeLessThan(0);

  // 되돌리기 (Ctrl+Z도 같은 기록을 쓴다)
  await page.getByTestId('heal-undo').click();
  await expect(page.getByTestId('heal-status')).toHaveText('아직 지운 곳이 없습니다');
  expect(await centerRed(page)).toBeGreaterThan(80);
});
