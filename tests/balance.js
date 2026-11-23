const { chromium } = require('/home/ubuntu/opencode project/LIMINAL/node_modules/playwright');
const FILE = 'file:///home/ubuntu/opencode project/squad commander/SQUAD_COMMANDER.html';
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGE ERR:', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('CONSOLE ERR:', m.text()); } });
  await page.goto(FILE);
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__SC.newCampaign('veteran'));

  for (const id of ['m01', 'm03', 'm05', 'm08']) {
    await page.evaluate((mid) => { window.__SC.startMission(mid, 6); UI.battle.paused = false; }, id);
    let out = null;
    for (let round = 0; round < 24 && !(out && out.done); round++) {
      out = await page.evaluate(() => {
        const b = UI.battle;
        if (!b || b.result) return { done: true, r: b.result };
        const known = b.enemies.filter(e => !e.dead && (e.aiState !== 'patrol' || Math.abs(e.x - (b.aliveAllies[0] ? b.aliveAllies[0].x : 0)) < 260));
        const front = Math.max(...b.aliveAllies.map(a => a.x));
        const contact = known.length > 0;
        if (!contact) {
          b.selectAll();
          b.issueOrder('sprint', Math.min(b.level.width - 240, front + 380), 0);
        } else {
          // hold ground, overwatch toward nearest contact
          const tx = known.reduce((s, e) => s + e.x, 0) / known.length;
          b.selectAll();
          b.issueOrder('hold', 0, 0);
          // medics auto-heal; snipers already overwatching
        }
        window.__SC.step(10);
        const b2 = UI.battle;
        return {
          done: !!b2.result, r: b2.result,
          enemies: b2.enemies.filter(e => !e.dead).length,
          hp: b2.allies.map(a => Math.round(a.hp)).join('/'),
          kills: b2.stats.kills, shots: b2.stats.shots, hits: b2.stats.hits, down: b2.stats.alliesDowned,
          sup: Math.round(b2.allies.reduce((s, a) => s + a.suppression, 0) / Math.max(1, b2.allies.length))
        };
      });
    }
    const fin = await page.evaluate(() => {
      const b = UI.battle;
      if (!b.result) b.succeedMission();
      return { id: b.mission.id, time: Math.round(b.time), kills: b.stats.kills, shots: b.stats.shots, hits: b.stats.hits, acc: Math.round(100 * b.stats.hits / Math.max(1, b.stats.shots)), down: b.stats.alliesDowned, dead: b.stats.alliesKilled, success: b.result.success };
    });
    console.log(JSON.stringify(fin));
    await page.evaluate(() => { UI.battle.resultShown = true; UI.battle.ended = true; UI.showResults(UI.battle); UI.leaveBattleToHub(); });
  }
  console.log('errors:', errors.length);
  await browser.close();
})();
