'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const output = path.join(__dirname, 'artifacts');
const scratch = path.join(output, 'tmp');
fs.mkdirSync(scratch, { recursive: true });
process.env.TEMP = scratch;
process.env.TMP = scratch;
process.env.TMPDIR = scratch;
const { chromium } = require('playwright-core');
const KEY = 'dorm-habits-local-demo-v1';
const TOTAL = 12;
const report = { startedAtUTC: new Date().toISOString(), scope: '真实本地 Edge 浏览器中的单浏览器身份模拟；不是真实四人共享', tool: 'playwright-core + Microsoft Edge + Node.js assert', plannedScenarios: TOTAL, scenarios: [], browserErrors: [], serverLog: [], syntheticFixtures: ['本周日期统计数据', '空习惯集合', '损坏的 localStorage', '模拟存储写入失败'], screenshots: [] };
let browser;
let context;
let page;
let server;
let serverExited = false;
let fatal;
const text = id => page.locator(`#${id}`).textContent();
const readState = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
const installFixture = async value => {
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: KEY, value });
  await page.reload();
};
const add = async name => {
  await page.getByLabel('新增一个每日习惯', { exact: true }).fill(name);
  await page.getByRole('button', { name: '新增习惯', exact: true }).click();
};
const check = async (name, action) => {
  const started = Date.now();
  try {
    await action();
    report.scenarios.push({ name, result: 'passed', durationMs: Date.now() - started });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.scenarios.push({ name, result: error.name === 'AssertionError' ? 'failure' : 'error', detail: error.message, durationMs: Date.now() - started });
    throw error;
  }
};

(async () => {
  try {
    server = spawn(process.execPath, [path.join(__dirname, 'server.cjs')], { cwd: __dirname, env: { ...process.env, DORM_DEMO_PORT: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    server.on('exit', () => { serverExited = true; });
    server.stderr.on('data', chunk => report.serverLog.push(chunk.toString()));
    const url = await new Promise((resolve, reject) => {
      let stdout = '';
      const timer = setTimeout(() => reject(new Error('Local server did not start in 10 seconds')), 10000);
      server.stdout.on('data', chunk => {
        stdout += chunk.toString();
        report.serverLog.push(chunk.toString());
        const match = stdout.match(/READY (http:\/\/127\.0\.0\.1:\d+\/)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', code => { if (!stdout.includes('READY ')) { clearTimeout(timer); reject(new Error(`Server exited ${code}`)); } });
    });
    report.testOrigin = url;
    report.serverPid = server.pid;
    browser = await chromium.launch({ channel: 'msedge', headless: true, downloadsPath: path.join(output, 'downloads'), tracesDir: path.join(output, 'traces') });
    report.browserVersion = browser.version();
    report.playwrightVersion = require('playwright-core/package.json').version;
    context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, timezoneId: 'Asia/Shanghai', locale: 'zh-CN' });
    page = await context.newPage();
    page.on('pageerror', error => report.browserErrors.push(error.message));
    await page.goto(url);
    await page.locator('#room-summary').waitFor();
    const initial = await readState();
    report.productToday = initial.habits[0].createdOn;

    await check('初次加载：四个不同示例习惯，完成记录为空，演示边界可见', async () => {
      assert.equal(await page.locator('#member-select option').count(), 4);
      assert.equal(new Set(initial.habits.map(h => h.name)).size, 4);
      assert.equal(await text('room-summary'), '全宿舍今日已完成 0 / 4 个习惯');
      assert.equal(await text('room-percent'), '0%');
      assert.match(await page.locator('.demo-note').textContent(), /没有独立账户或跨设备同步/);
      assert.equal((await fetch(new URL('server.cjs', url))).status, 404);
    });
    await check('新增个人习惯：去除空白；拒绝空名称及同人重复；失败不新增', async () => {
      await add('  复习 Java 20 分钟  ');
      assert.equal(await page.getByRole('heading', { name: '复习 Java 20 分钟', exact: true }).count(), 1);
      assert.equal((await readState()).habits.length, 5);
      await add('复习 Java 20 分钟');
      assert.match(await text('status'), /同名习惯/);
      await add('   ');
      assert.match(await text('status'), /1—40/);
      assert.equal((await readState()).habits.length, 5);
    });
    await check('打卡与撤销：个人、共同进度和本周统计同步；撤销刷新后保留', async () => {
      await page.getByRole('button', { name: '打卡：复习 Java 20 分钟', exact: true }).click();
      assert.equal(await text('room-percent'), '20%');
      assert.equal(await text('personal-summary'), '1 / 2 已完成');
      assert.equal(await text('week-summary'), '截至今天已完成 1 / 2 次');
      await page.getByRole('button', { name: '撤销：复习 Java 20 分钟', exact: true }).click();
      await page.reload();
      assert.equal(await text('room-percent'), '0%');
      assert.equal(await text('week-summary'), '截至今天已完成 0 / 2 次');
      assert.equal(await page.getByRole('button', { name: '打卡：复习 Java 20 分钟', exact: true }).count(), 1);
    });
    await check('刷新保存：习惯、打卡记录和选中演示身份均恢复', async () => {
      await page.getByRole('button', { name: '打卡：复习 Java 20 分钟', exact: true }).click();
      await page.reload();
      assert.equal(await page.getByRole('button', { name: '撤销：复习 Java 20 分钟', exact: true }).count(), 1);
      assert.equal((await readState()).habits.length, 5);
      await page.getByLabel('当前演示身份', { exact: true }).selectOption('m2');
      await page.reload();
      assert.equal(await page.locator('#member-select').inputValue(), 'm2');
    });
    await check('四人身份模拟：各自习惯独立，共同进度汇总不同目标；无排名惩罚', async () => {
      assert.equal(await page.locator('#habit-list .habit-row').count(), 1);
      assert.equal(await page.locator('#habit-list').getByText('复习 Java 20 分钟', { exact: true }).count(), 0);
      await add('拉伸 10 分钟');
      await page.getByRole('button', { name: '打卡：拉伸 10 分钟', exact: true }).click();
      assert.equal(await text('room-summary'), '全宿舍今日已完成 2 / 6 个习惯');
      assert.equal(await text('room-percent'), '33%');
      for (const id of ['m1', 'm2', 'm3', 'm4']) {
        await page.getByLabel('当前演示身份', { exact: true }).selectOption(id);
        assert.equal(await page.locator('#habit-list .habit-row').count(), id === 'm1' || id === 'm2' ? 2 : 1);
      }
      assert.deepEqual(await page.locator('.member-card').evaluateAll(cards => cards.map(card => card.dataset.member)), ['m1', 'm2', 'm3', 'm4']);
      assert.equal(/排行榜|惩罚|扣分/.test(await page.locator('body').textContent()), false);
      await page.getByLabel('当前演示身份', { exact: true }).selectOption('m1');
      await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
      report.screenshots.push('artifacts/desktop.png');
    });
    await check('手机宽度实际渲染：可切身份和打卡，无页面横向溢出', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByLabel('当前演示身份', { exact: true }).selectOption('m4');
      await page.getByRole('button', { name: '打卡：整理桌面', exact: true }).click();
      assert.equal(await text('room-percent'), '50%');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      assert.equal(await page.locator('.swipe-hint').isVisible(), true);
      await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
      report.screenshots.push('artifacts/mobile.png');
      await page.getByRole('button', { name: '撤销：整理桌面', exact: true }).click();
      await page.setViewportSize({ width: 1440, height: 1040 });
      await page.getByLabel('当前演示身份', { exact: true }).selectOption('m1');
    });
    await check('存储范围：另一个隔离浏览器会话不会收到当前演示数据', async () => {
      const isolated = await browser.newContext({ timezoneId: 'Asia/Shanghai' });
      try {
        const isolatedPage = await isolated.newPage();
        await isolatedPage.goto(url);
        assert.equal(await isolatedPage.locator('#room-summary').textContent(), '全宿舍今日已完成 0 / 4 个习惯');
        assert.equal(await isolatedPage.locator('#habit-list').getByText('复习 Java 20 分钟', { exact: true }).count(), 0);
      } finally { await isolated.close(); }
    });
    await check('本周统计：合成历史夹具验证新增前和未来日期不计入', async () => {
      const data = await readState();
      const info = await page.evaluate(() => {
        const now = new Date();
        const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const elapsed = (now.getDay() + 6) % 7 + 1;
        const monday = new Date(now);
        monday.setDate(now.getDate() - elapsed + 1);
        return { today: key(now), monday: key(monday), elapsed };
      });
      data.habits = data.habits.filter(h => h.ownerId !== 'm1');
      data.habits.push({ id: 'week-old', ownerId: 'm1', name: '本周旧习惯', createdOn: info.monday }, { id: 'week-new', ownerId: 'm1', name: '今天新习惯', createdOn: info.today });
      data.checks = { [info.monday]: ['week-old'] };
      data.checks[info.today] = [...(data.checks[info.today] || []), 'week-new'];
      data.selectedMemberId = 'm1';
      await installFixture(data);
      assert.equal(await text('week-summary'), `截至今天已完成 2 / ${info.elapsed + 1} 次`);
      assert.equal(await page.locator('#week-table tbody tr').nth(1).locator('td.not-created').count(), info.elapsed - 1);
      assert.equal(await page.locator('#week-table tbody tr').nth(0).locator('td.future').count(), 7 - info.elapsed);
      assert.equal(await page.locator('#week-table tbody td.complete').count(), 2);
    });
    await check('名称作为文字显示：包含 HTML 字符不会创建元素或执行脚本', async () => {
      const name = '<img src=x onerror=alert(1)>';
      await add(name);
      assert.equal(await page.getByRole('heading', { name, exact: true }).count(), 1);
      assert.equal(await page.locator('img').count(), 0);
    });
    await check('零习惯边界：展示起步提示；新增并打卡后可达到100%', async () => {
      await installFixture({ version: 1, selectedMemberId: 'm1', habits: [], checks: {} });
      assert.equal(await text('room-percent'), '0%');
      assert.match(await text('room-summary'), /还没有每日习惯/);
      assert.equal(await text('week-summary'), '截至今天已完成 0 / 0 次');
      await add('今天走十分钟');
      await page.getByRole('button', { name: '打卡：今天走十分钟', exact: true }).click();
      assert.equal(await text('room-percent'), '100%');
      assert.match(await text('room-summary'), /今日全部完成/);
    });
    await check('损坏记录边界：显示错误并停写，原始存储没有覆盖', async () => {
      await page.evaluate(key => localStorage.setItem(key, '{broken-json'), KEY);
      await page.reload();
      assert.match(await page.locator('#storage-error').textContent(), /原始存储没有被覆盖/);
      assert.equal(await page.locator('#add-habit').isDisabled(), true);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), '{broken-json');
      await page.evaluate(key => localStorage.removeItem(key), KEY);
      await page.reload();
    });
    await check('保存失败边界：操作不生效，明确提示；真实浏览器无未处理脚本异常', async () => {
      const before = await readState();
      await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); }; });
      await add('写入失败时不能出现');
      assert.match(await text('status'), /保存失败，操作未生效/);
      assert.equal(await page.locator('#habit-list .habit-row').count(), 1);
      await page.reload();
      assert.deepEqual(await readState(), before);
      assert.deepEqual(report.browserErrors, []);
    });
  } catch (error) {
    fatal = error;
    report.fatal = error.stack || error.message;
    console.error(error.stack || error.message);
  } finally {
    if (context) await context.close().catch(error => { report.cleanupError = error.message; });
    if (browser) await browser.close().catch(error => { report.cleanupError = error.message; });
    if (server && !serverExited) {
      const exited = new Promise(resolve => server.once('exit', resolve));
      server.kill();
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
    }
    report.serverClosed = serverExited;
    report.browserClosed = !browser || !browser.isConnected();
    report.testsRun = report.scenarios.length;
    report.passed = report.scenarios.filter(item => item.result === 'passed').length;
    report.failures = report.scenarios.filter(item => item.result === 'failure').length;
    report.errors = report.scenarios.filter(item => item.result === 'error').length + (fatal && report.scenarios.every(item => item.result === 'passed') ? 1 : 0);
    report.skipped = TOTAL - report.testsRun;
    report.result = !fatal && report.passed === TOTAL && report.serverClosed && report.browserClosed && !report.cleanupError ? 'VERIFICATION SUCCESS' : 'VERIFICATION FAILURE';
    report.completedAtUTC = new Date().toISOString();
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report, null, 2), 'utf8');
    console.log(`Tests run: ${report.testsRun}, Passed: ${report.passed}, Failures: ${report.failures}, Errors: ${report.errors}, Skipped: ${report.skipped}`);
    console.log(report.result);
    console.log(`Server closed: ${report.serverClosed}; Browser closed: ${report.browserClosed}`);
    if (report.result !== 'VERIFICATION SUCCESS') process.exitCode = 1;
  }
})();
