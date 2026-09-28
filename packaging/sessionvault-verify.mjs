#!/usr/bin/env node
const BASE = process.env.SESSIONVAULT_URL || 'http://127.0.0.1:5191';
const expectedMin = Number(process.env.SESSIONVAULT_EXPECT_MIN_CONVOS || 0);
const failures = [];
let passed = 0;
let skipped = 0;

function pass(label, detail = '') { passed += 1; console.log(`PASS: ${label}${detail ? ` — ${detail}` : ''}`); }
function fail(label, detail = '') { failures.push(`${label}${detail ? `: ${detail}` : ''}`); console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`); }
function skip(label, detail = '') { skipped += 1; console.log(`SKIP: ${label}${detail ? ` — ${detail}` : ''}`); }
function assert(label, condition, detail = '') { condition ? pass(label, detail) : fail(label, detail); }

async function getJson(path) {
  const response = await fetch(BASE + path, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

function tokenFrom(text) {
  const words = String(text || '').match(/[A-Za-z0-9_./:-]{6,}/g) || [];
  return words.find((w) => !/^https?:/i.test(w) && !/^\/api\//.test(w)) || null;
}

async function main() {
  const url = new URL(BASE);
  assert('loopback verification URL', url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === '5191', BASE);
  if (failures.length) return;

  let sources, convos;
  try { sources = await getJson('/api/sources'); pass('GET /api/sources'); } catch (e) { fail('GET /api/sources', e.message); return; }
  assert('sources object', sources && typeof sources === 'object' && !Array.isArray(sources));

  try { convos = await getJson('/api/conversations'); pass('GET /api/conversations'); } catch (e) { fail('GET /api/conversations', e.message); return; }
  assert('conversations array', Array.isArray(convos), `type=${typeof convos}`);
  if (!Array.isArray(convos)) return;
  if (expectedMin > 0) assert('minimum conversation count', convos.length >= expectedMin, `${convos.length} >= ${expectedMin}`);
  else pass('conversation count observed', String(convos.length));

  const keys = new Set();
  let duplicate = null;
  for (const c of convos) {
    if (!c || typeof c.key !== 'string' || !c.key) { duplicate = 'missing key'; break; }
    if (keys.has(c.key)) { duplicate = c.key; break; }
    keys.add(c.key);
  }
  assert('conversation keys unique and present', !duplicate, duplicate || `${keys.size} keys`);

  for (const endpoint of ['/api/search-status', '/api/usage', '/api/agents']) {
    try { await getJson(endpoint); pass(`GET ${endpoint}`); } catch (e) { fail(`GET ${endpoint}`, e.message); }
  }

  if (convos.length) {
    const c = convos[0];
    try {
      const detail = await getJson(`/api/conversation?source=${encodeURIComponent(c.source)}&ref=${encodeURIComponent(c.ref)}&limit=all`);
      assert('full transcript detail shape', detail && Array.isArray(detail.messages), `${detail?.messages?.length ?? 0} messages`);
    } catch (e) { fail('full transcript detail', e.message); }

    const witness = convos.find((x) => tokenFrom(x.firstUserText));
    if (witness) {
      const token = tokenFrom(witness.firstUserText);
      let found = false;
      let last = '';
      for (let i = 0; i < 30 && !found; i += 1) {
        try {
          const result = await getJson(`/api/search?q=${encodeURIComponent(token)}`);
          last = JSON.stringify({ keys: Array.isArray(result?.keys) ? result.keys.length : null, token });
          found = Array.isArray(result?.keys) && result.keys.includes(witness.key);
        } catch (e) { last = e.message; }
        if (!found) await new Promise((resolve) => setTimeout(resolve, 250));
      }
      assert('full-text search witness', found, found ? `${token} -> ${witness.key}` : last);
    } else skip('full-text search witness', 'no conversation exposes a usable firstUserText token');
  } else skip('detail/search witness', 'no local conversations');
}

await main().catch((e) => fail('unexpected verifier error', e.stack || e.message));
console.log(`CHECKS: ${passed} passed, ${skipped} skipped, ${failures.length} failed`);
if (failures.length) {
  console.error('RESULT: FAIL');
  process.exit(1);
}
console.log('RESULT: PASS');
