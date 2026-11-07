// 실감 모션 수치 검증 템플릿 (realistic-motion 스킬 6장)
// 사용: npm run build && npx next start -p 3311  (이전 next-server는 먼저 종료)
//       node .claude/skills/realistic-motion/references/qa-motion.mjs [http://localhost:3311]
// 각 항목이 PASS/FAIL로 찍힌다. 하나라도 FAIL이면 종료 코드 1.
// 프로젝트 의존성에 넣지 않고 전역 설치된 Playwright를 쓴다(CJS 해석은 NODE_PATH를 따른다).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.argv[2] ?? 'http://localhost:3311';
const results = [];
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
const wait = (p, ms) => p.waitForTimeout(ms);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/_next\/image|Failed to load resource/.test(m.text())) errors.push(m.text());
});

await page.goto(`${BASE}/motion-lab`);

// 히어로: 셔터 + 스크롤 시차
const clip = () => page.evaluate(() => getComputedStyle(document.querySelector('.overflow-hidden.bg-\\[\\#1c1c1a\\] > div')).clipPath);
const c0 = await clip();
await wait(page, 1800);
const c1 = await clip();
check('hero shutter', c0.includes('4%') && c1.includes('0%'), `${c0} → ${c1}`);
await page.mouse.wheel(0, 300);
await wait(page, 400);
const m = await page.evaluate(() => getComputedStyle(document.querySelector('.will-change-transform')).transform);
const [sx, , , , , ty] = (m.match(/-?[\d.]+/g) ?? []).map(Number);
check('hero parallax', sx > 1 && ty > 0, m);

// 카운트업: 단조 증가, 오버슈트 없음, 최종값 일치
await page.evaluate(() => window.scrollTo(0, 0));
await (await page.$('span.tabular-nums')).scrollIntoViewIfNeeded();
const seq = [];
for (let i = 0; i < 18; i++) {
  seq.push(await page.evaluate(() => Number(document.querySelector('span.tabular-nums').textContent.replace(/,/g, ''))));
  await wait(page, 100);
}
const final = seq.at(-1);
check('countup monotonic & no overshoot', seq.every((v, i) => i === 0 || v >= seq[i - 1]) && Math.max(...seq) === final, seq.join(' '));

// 비교 슬라이더
const box = await page.$('[style*="pan-y"]');
await box.scrollIntoViewIfNeeded();
await wait(page, 2300);
const bb = await box.boundingBox();
const val = async () => Number(await page.getAttribute('[role=slider]', 'aria-valuenow'));
const midY = bb.y + bb.height / 2;
await page.mouse.move(bb.x + bb.width * 0.5, midY);
await page.mouse.down();
await page.mouse.move(bb.x + bb.width * 0.2, midY, { steps: 6 });
check('compare drag 1:1', (await val()) === 20, `${await val()} (기대 20)`);
await wait(page, 150);
await page.mouse.up();
await page.mouse.down();
for (let i = 1; i <= 5; i++) {
  await page.mouse.move(bb.x + bb.width * (0.2 + i * 0.06), midY);
  await wait(page, 16);
}
const released = await val();
await page.mouse.up();
await wait(page, 900);
const settled = await val();
check('compare inertia within cap', settled > released && settled - released <= 23, `${released} → ${settled}`);
await page.mouse.click(bb.x + bb.width * 0.7, midY);
await wait(page, 600);
const k = await (await page.$('[role=slider]')).boundingBox();
check('compare knob on divider', Math.abs(k.x + k.width / 2 - (bb.x + bb.width * 0.7)) <= 1, `${(k.x + k.width / 2).toFixed(1)} vs ${(bb.x + bb.width * 0.7).toFixed(1)}`);
await page.focus('[role=slider]');
await page.keyboard.press('End');
await wait(page, 500);
const end = await val();
await page.keyboard.press('Shift+ArrowLeft');
await wait(page, 500);
check('compare keyboard', end === 100 && (await val()) === 90, `End=${end}, Shift+←=${await val()}`);

// 깊이 사진
const dp = (await page.$$('div.aspect-\\[4\\/3\\]'))[0];
await dp.scrollIntoViewIfNeeded();
const db = await dp.boundingBox();
await page.mouse.move(db.x + db.width * 0.9, db.y + db.height * 0.1, { steps: 5 });
await wait(page, 500);
const dt = await dp.evaluate((e) => getComputedStyle(e.querySelector('.will-change-transform')).transform);
const [ds, , , , dx, dy] = (dt.match(/-?[\d.]+/g) ?? []).map(Number);
check('depth photo counter-moves', ds > 1.05 && dx < 0 && dy > 0, dt);

// 모션 감축 + 하이드레이션
const rm = await browser.newPage({ viewport: { width: 400, height: 820 }, reducedMotion: 'reduce' });
const rmErr = [];
rm.on('pageerror', (e) => rmErr.push(e.message));
await rm.goto(`${BASE}/motion-lab`);
await wait(rm, 500);
check('reduced motion: no hydration error', rmErr.length === 0, rmErr.join(' | ') || 'ok');

check('console clean', errors.length === 0, errors.join(' | ') || 'ok');
await browser.close();

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  —  ${r.detail}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
