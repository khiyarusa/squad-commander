const { chromium } = require('/home/ubuntu/opencode project/LIMINAL/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGE ERROR:', e.message); });
  page.on('requestfailed', (r) => console.log('REQ FAILED:', r.url()));
  await page.goto('file:///home/ubuntu/opencode project/squad commander/SQUAD_COMMANDER.html');
  await page.waitForTimeout(1600);
  const info = await page.evaluate(() => ({
    hasSC: !!window.__SC,
    title: document.title,
    menuActive: document.querySelector('#screen-menu').classList.contains('is-active'),
    canvas: [document.querySelector('#stage').width, document.querySelector('#stage').height],
    state: window.__SC ? window.__SC.state() : null
  }));
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: '/tmp/opencode/menu.png' });
  console.log('errors:', errors.length);
  await browser.close();
})();
