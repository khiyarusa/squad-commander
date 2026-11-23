#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = __dirname;

function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }
function b64(p) { return fs.readFileSync(path.join(root, p)).toString('base64'); }

const fonts = [
  ['Barlow Condensed', 400, 'assets/fonts/barlow-condensed-400.woff2'],
  ['Barlow Condensed', 600, 'assets/fonts/barlow-condensed-600.woff2'],
  ['Barlow Condensed', 800, 'assets/fonts/barlow-condensed-800.woff2']
];
let fontCss = '';
for (const [family, weight, file] of fonts) {
  fontCss += `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64(file)}) format("woff2")}\n`;
}

const jsDir = path.join(root, 'src/js');
const files = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort();
let js = "'use strict';\n";
for (const f of files) {
  js += `\n/* ===== ${f} ===== */\n` + fs.readFileSync(path.join(jsDir, f), 'utf8') + '\n';
}
if (/<\/script/i.test(js)) throw new Error('JS contains a closing script tag');

const css = fontCss + '\n' + read('src/style.css');
let html = read('src/head.html');
html = html.replace('/*__CSS__*/', () => css);
html = html.replace('/*__JS__*/', () => js);
if (html.includes('__CSS__') || html.includes('__JS__')) throw new Error('placeholder not replaced');
const out = path.join(root, 'SQUAD_COMMANDER.html');
fs.writeFileSync(out, html);
const kb = (fs.statSync(out).size / 1024).toFixed(1);
console.log(`built ${out} (${kb} KB, ${files.length} modules, ${(js.length / 1024).toFixed(1)} KB JS)`);
