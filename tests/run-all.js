'use strict';
/* Runs every suite in tests/ with real exit codes. A failed suite fails the run. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const suites = fs.readdirSync(ROOT)
  .filter((f) => f.endsWith('.js') && f !== 'run-all.js' && f !== 'lib')
  .sort();

let failed = [];
const results = [];
for (const f of suites) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, f)], {
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
    env: process.env
  });
  const pass = r.status === 0;
  const tail = (r.stdout || '').trim().split('\n').filter(Boolean).slice(-1)[0] || '';
  results.push({ suite: f, pass, ms: Date.now() - t0, tail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${f}  (${((Date.now() - t0) / 1000).toFixed(1)}s)  ${tail}`);
  if (!pass) {
    failed.push(f);
    const out = (r.stdout || '') + (r.stderr || '');
    const lines = out.split('\n').filter((l) => /not ok|ASSERT|ERROR|Error/i.test(l));
    for (const l of lines.slice(0, 12)) console.log('      ' + l.trim());
  }
}

console.log('\n=== ' + (results.length - failed.length) + '/' + results.length + ' suites passed ===');
if (failed.length) {
  console.log('failed suites: ' + failed.join(', '));
  process.exit(1);
}
