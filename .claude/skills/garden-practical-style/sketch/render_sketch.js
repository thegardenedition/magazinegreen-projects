const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const svg = fs.readFileSync(process.argv[2], 'utf8').replace('<svg ', '<svg width="900" height="413" ');
  const fdir = path.join(__dirname, 'fonts');
  const ff = (fam, file, w) => `@font-face{font-family:'${fam}';font-weight:${w};src:url('file://${fdir}/${file}')}`;
  const html = `<html><head><style>${ff('Gaegu','Gaegu-Regular.ttf',400)}${ff('Gaegu','Gaegu-Bold.ttf',700)}${ff('Nanum Pen Script','NanumPenScript-Regular.ttf',400)} body{margin:0}</style></head><body>${svg}</body></html>`;
  const tmp = path.join(__dirname, '_sketch.html'); fs.writeFileSync(tmp, html);
  const b = await chromium.launch(); const p = await b.newPage({ deviceScaleFactor: 2.5, viewport: { width: 900, height: 413 } });
  await p.goto('file://' + tmp); await p.evaluate(() => document.fonts.ready);
  await p.locator('svg').screenshot({ path: process.argv[3] }); await b.close();
})();
