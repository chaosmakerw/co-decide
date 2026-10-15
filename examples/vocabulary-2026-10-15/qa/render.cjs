const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const products = process.argv.length > 2 ? process.argv.slice(2) : ['baseline', 'focus', 'island'];
const sizes = { desktop: { width: 1440, height: 1000 }, medium: { width: 768, height: 1024 }, mobile: { width: 390, height: 844 } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, headless: true });
  const rows = [];
  try {
    for (const name of products) for (const [size, viewport] of Object.entries(sizes)) {
      const context = await browser.newContext({ viewport, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
      const page = await context.newPage();
      const errors = [], remote = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('request', req => { if (/^https?:/.test(req.url())) remote.push(req.url()); });
      await page.goto(pathToFileURL(path.join(root, name, 'index.html')).href);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(document.getAnimations().filter(a => Number.isFinite(a.effect.getComputedTiming().endTime)).map(a => a.finished.catch(() => {})));
      });
      const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, text: document.body.innerText.length }));
      await page.screenshot({ path: path.join(__dirname, `${name}-${size}.png`), fullPage: true });
      rows.push({ product: name, viewport, layout, errors, remote, passed: layout.scroll <= layout.width + 1 && layout.text > 80 && errors.length === 0 && remote.length === 0 });
      await context.close();
    }
  } finally { await browser.close(); }
  const reportPath = path.join(__dirname, 'render.json');
  const previous = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')).rows.filter(x => !products.includes(x.product)) : [];
  rows.push(...previous);
  const out = { scope: '本轮实测：首次打开、三视口排版、运行异常、外部请求；不代替视觉评价或业务验证', tests: rows.length, passed: rows.filter(x => x.passed).length, rows };
  fs.writeFileSync(path.join(__dirname, 'render.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  if (out.passed !== out.tests) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
