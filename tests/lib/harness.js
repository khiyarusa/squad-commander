'use strict';
/**
 * Shared Playwright harness.
 * Resolves Playwright from (in order): PLAYWRIGHT_MODULE, local node_modules,
 * ../LIMINAL/node_modules, ../../LIMINAL/node_modules. Fails fast with instructions.
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE = path.join(ROOT, 'SQUAD_COMMANDER.html');
const ART = path.join(ROOT, 'tests', 'artifacts');

function resolvePlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    path.join(ROOT, 'node_modules', 'playwright'),
    path.join(ROOT, '..', 'LIMINAL', 'node_modules', 'playwright'),
    path.join(ROOT, '..', '..', 'LIMINAL', 'node_modules', 'playwright'),
    'playwright'
  ].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* next */ }
  }
  console.error('Playwright not found. Set PLAYWRIGHT_MODULE=/abs/path/to/playwright or install it locally.');
  process.exit(2);
}

const pw = resolvePlaywright();

function setup() {
  if (!fs.existsSync(FILE)) {
    console.error('Missing build. Run `npm run build` first.');
    process.exit(2);
  }
  fs.mkdirSync(ART, { recursive: true });
}

async function launch(opts = {}) {
  setup();
  const browser = await pw.chromium.launch({
    args: ['--no-sandbox', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required']
  });
  const viewport = opts.viewport || { width: 1280, height: 720 };
  const page = await browser.newPage({ viewport, deviceScaleFactor: opts.dpr || 1, hasTouch: !!opts.touch });
  const ctx = { page, browser, errors: [], requests: [], consoleErrors: [] };
  page.on('pageerror', (e) => { ctx.errors.push(e.message); console.log('PAGE ERROR:', e.message); });
  page.on('console', (m) => {
    if (m.type() === 'error') { ctx.consoleErrors.push(m.text()); console.log('CONSOLE ERROR:', m.text()); }
  });
  page.on('request', (r) => { if (!r.url().startsWith('file:')) ctx.requests.push(r.url()); });
  await page.goto(pathToFileURL(FILE).href);
  await page.waitForFunction(() => window.__SC && window.__SC.screen, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  ctx.close = async () => { await browser.close(); };
  return ctx;
}

function assert(cond, msg) {
  if (!cond) { const e = new Error('ASSERT: ' + msg); e.assertion = true; throw e; }
  assert.count++;
  console.log(`ok ${assert.count} - ${msg}`);
}
assert.count = 0;

function ok(name, detail = '') { assert(true, name + (detail ? ' :: ' + detail : '')); }
ok.count = 0;

let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (e) {
    failed++;
    console.log(`not ok - ${name}\n  ${e.assertion ? e.message : (e.stack || e)}`);
  }
}

function summary(title) {
  const total = assert.count + failed;
  console.log(`\n${title}: ${assert.count}/${total} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

async function shot(page, name) {
  setup();
  await page.screenshot({ path: path.join(ART, name + '.png') });
}

async function state(page) { return page.evaluate(() => window.__SC.state()); }
async function newGame(page, diff = 'veteran') {
  await page.evaluate((d) => window.__SC.newCampaign(d), diff);
  await page.waitForTimeout(120);
}
async function start(page, id, count = 6) {
  await page.evaluate(([i, c]) => window.__SC.startMission(i, c), [id, count]);
  await page.waitForTimeout(250);
}
async function step(page, sec) { return page.evaluate((s) => window.__SC.step(s), sec); }
async function boot(page) {
  await page.evaluate(() => window.__SC.show('menu'));
}

function assertClean(ctx) {
  assert(ctx.errors.length === 0, 'no page errors (' + ctx.errors.join(' | ') + ')');
  assert(ctx.consoleErrors.length === 0, 'no console errors (' + ctx.consoleErrors.join(' | ') + ')');
}

module.exports = {
  pw, ROOT, FILE, ART, launch, assert, ok, test, summary, shot, state, newGame, start, step, boot, assertClean
};
