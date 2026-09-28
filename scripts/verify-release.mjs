#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];
let passes = 0;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
function check(label, condition, detail = '') {
  if (condition) { passes += 1; console.log(`PASS: ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failures.push(label); console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`); }
}

const required = [
  'vite.config.js', 'src/App.jsx', 'src/Agents.jsx', 'src/index.css', 'package.json', 'README.md',
  'packaging/sessionvault-control.sh', 'packaging/sessionvault-app.sh', 'packaging/sessionvault-window.py', 'packaging/sessionvault-verify.mjs',
  'server/sources/index.js', 'server/search.js', 'server/session.js', 'scripts/smoke-test.mjs'
];
for (const p of required) check(`required file ${p}`, exists(p));
if (failures.length) {
  console.error(`RESULT: FAIL (${failures.length} missing prerequisite files)`);
  process.exit(1);
}

const vite = read('vite.config.js');
for (const kind of ['server', 'preview']) {
  const match = vite.match(new RegExp(`${kind}\\s*:\\s*\\{([^}]+)\\}`));
  const body = match?.[1] || '';
  check(`${kind} binds exact loopback`, /host\s*:\s*['"]127\.0\.0\.1['"]/.test(body));
  check(`${kind} fixes port 5191`, /port\s*:\s*5191/.test(body));
  check(`${kind} uses strictPort`, /strictPort\s*:\s*true/.test(body));
  check(`${kind} disables browser opening`, /open\s*:\s*false/.test(body));
}
check('session-open endpoint retained', vite.includes("'/api/session-open'"));
check('search-status endpoint retained', vite.includes("'/api/search-status'"));
check('full transcript limit=all retained', vite.includes("rawLimit === 'all'"));

const control = read('packaging/sessionvault-control.sh');
const openCaseAt = control.indexOf('\n  open)');
const beforeOpenCase = openCaseAt >= 0 ? control.slice(0, openCaseAt) : control;
check('control has explicit sessionvault open action', openCaseAt >= 0);
check('no lifecycle browser opener before explicit open action', !/(xdg-open|gio\s+open|sensible-browser|firefox|chromium|google-chrome)/.test(beforeOpenCase));
check('explicit open action contains xdg-open', /open\)[\s\S]*xdg-open/.test(control));

const app = read('packaging/sessionvault-app.sh');
const appExecutable = app.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n');
check('desktop wrapper uses single-instance flock', /flock\s+-n/.test(app));
check('desktop wrapper has EXIT cleanup trap', /trap\s+cleanup\s+EXIT/.test(app));
check('desktop wrapper launches in-process window', /python3\s+"\$ROOT\/sessionvault-window\.py"/.test(app));
check('desktop wrapper does not use URL/browser opener', !/(xdg-open|gio\s+open|webbrowser|firefox|chromium|google-chrome)/.test(appExecutable));

const clientFiles = ['src/App.jsx', 'src/Agents.jsx', 'src/Usage.jsx'];
for (const p of clientFiles) {
  const code = read(p);
  check(`${p} uses same-origin API fetches`, !/fetch\s*\(\s*['"]https?:\/\//.test(code));
}
const appCode = read('src/App.jsx');
check('full transcript UI explicitly requests limit=all', appCode.includes('&limit=all'));
check('full-text search aborts stale requests', /AbortController/.test(appCode) && /controller\.abort/.test(appCode));
check('large transcript rendering is incremental', /TRANSCRIPT_PAGE/.test(appCode) && /visibleMessages/.test(appCode) && /load-earlier/.test(appCode));
check('SessionVault UI exposes loopback privacy marker', appCode.includes('Local only · 127.0.0.1'));

const readme = read('README.md');
check('README does not claim dev auto-opens browser', !/npm run dev[^\n]*(opens|auto-?open)/i.test(readme));
check('README states explicit opener boundary', readme.includes('sessionvault open'));
check('README documents verification', readme.includes('sessionvault verify'));

const pkg = JSON.parse(read('package.json'));
check('package remains private', pkg.private === true);
check('Node 24+ required', String(pkg.engines?.node || '').includes('24'));
check('release verifier npm script wired', pkg.scripts?.['verify:release'] === 'node scripts/verify-release.mjs');
check('project license remains intentionally unresolved', pkg.license === 'UNLICENSED');

console.log(`CHECKS: ${passes} passed, ${failures.length} failed`);
if (failures.length) { console.error('RESULT: FAIL'); process.exit(1); }
console.log('RESULT: PASS');
