// SessionVault replacement for ai-session-manager/server/search.js
// Persistent full-transcript FTS5 index. Local-only; the source histories are never modified.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { listConversations, getConversation } from './sources/index.js';

const INDEX_DIR = process.env.SESSIONVAULT_INDEX_DIR || path.join(os.homedir(), '.cache', 'sessionvault');
const INDEX_PATH = path.join(INDEX_DIR, 'search.sqlite');
const FULL_DETAIL_LIMIT = Number(process.env.SESSIONVAULT_INDEX_MESSAGE_LIMIT || 1_000_000);
const BUILD_CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.SESSIONVAULT_INDEX_CONCURRENCY || 2)));

fs.mkdirSync(INDEX_DIR, { recursive: true, mode: 0o700 });
try { fs.chmodSync(INDEX_DIR, 0o700); } catch {}
const db = new DatabaseSync(INDEX_PATH);
try { fs.chmodSync(INDEX_PATH, 0o600); } catch {}
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA synchronous=NORMAL;
  CREATE TABLE IF NOT EXISTS sessionvault_state (
    key TEXT PRIMARY KEY,
    mtime_ms REAL NOT NULL,
    source TEXT NOT NULL,
    indexed_at TEXT NOT NULL
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS sessionvault_fts USING fts5(
    key UNINDEXED,
    content,
    tokenize='unicode61'
  );
`);

let building = null;
let lastError = null;
let lastBuildStarted = null;
let lastBuildFinished = null;
let lastIndexed = 0;

const getState = db.prepare('SELECT mtime_ms FROM sessionvault_state WHERE key = ?');
const deleteState = db.prepare('DELETE FROM sessionvault_state WHERE key = ?');
const deleteFts = db.prepare('DELETE FROM sessionvault_fts WHERE key = ?');
const insertFts = db.prepare('INSERT INTO sessionvault_fts(key, content) VALUES (?, ?)');
const upsertState = db.prepare(`
  INSERT INTO sessionvault_state(key, mtime_ms, source, indexed_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    mtime_ms=excluded.mtime_ms,
    source=excluded.source,
    indexed_at=excluded.indexed_at
`);

function normalizedText(detail) {
  const parts = [];
  for (const m of detail?.messages || []) {
    if (!m) continue;
    if (m.role) parts.push(`[${m.role}]`);
    if (typeof m.text === 'string' && m.text) parts.push(m.text);
  }
  return parts.join('\n');
}

function writeOne(c, content) {
  db.exec('BEGIN IMMEDIATE');
  try {
    deleteFts.run(c.key);
    insertFts.run(c.key, content);
    upsertState.run(c.key, Number(c.mtimeMs || 0), c.source, new Date().toISOString());
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

async function indexConversation(c) {
  const existing = getState.get(c.key);
  const mtime = Number(c.mtimeMs || 0);
  if (existing && Number(existing.mtime_ms) === mtime) return false;
  const detail = await getConversation(c.source, c.ref, FULL_DETAIL_LIMIT);
  writeOne(c, normalizedText(detail));
  return true;
}

async function runPool(items, worker, n) {
  let next = 0;
  const runners = Array.from({ length: Math.min(n, items.length || 1) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

async function rebuildChanged() {
  const convos = await listConversations();
  const live = new Set(convos.map((c) => c.key));
  const stale = db.prepare('SELECT key FROM sessionvault_state').all().map((r) => r.key).filter((k) => !live.has(k));
  for (const key of stale) {
    db.exec('BEGIN IMMEDIATE');
    try {
      deleteFts.run(key);
      deleteState.run(key);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  let changed = 0;
  await runPool(convos, async (c) => {
    try {
      if (await indexConversation(c)) changed++;
    } catch (e) {
      // A broken single adapter/session must not make every other history unusable.
      console.warn(`[sessionvault] index failed for ${c.key}:`, e?.message || e);
    }
  }, BUILD_CONCURRENCY);
  return { total: convos.length, changed, staleRemoved: stale.length };
}

async function ensureIndex() {
  if (building) return building;
  lastBuildStarted = new Date().toISOString();
  lastError = null;
  building = rebuildChanged()
    .then((r) => {
      lastIndexed = Number(db.prepare('SELECT count(*) AS n FROM sessionvault_state').get().n || 0);
      lastBuildFinished = new Date().toISOString();
      return r;
    })
    .catch((e) => {
      lastError = String(e?.stack || e);
      lastBuildFinished = new Date().toISOString();
      throw e;
    })
    .finally(() => { building = null; });
  return building;
}

export function warmIndex(delayMs = 1500) {
  setTimeout(() => { ensureIndex().catch(() => {}); }, delayMs);
}

function termsFromQuery(query) {
  return String(query || '')
    .normalize('NFKC')
    .match(/[\p{L}\p{N}_-]+/gu) || [];
}

function ftsQuery(query) {
  const terms = termsFromQuery(query).slice(0, 24);
  if (!terms.length) return '';
  return terms.map((term) => `"${term.replaceAll('"', '""')}"*`).join(' AND ');
}

export async function searchContent(query, { limit = 10000 } = {}) {
  const match = ftsQuery(query);
  if (!match) return { keys: [], snippets: {}, indexed: lastIndexed, tookMs: 0 };
  const t0 = Date.now();
  await ensureIndex();
  let rows;
  try {
    rows = db.prepare(`
      SELECT key, snippet(sessionvault_fts, 1, '', '', ' … ', 18) AS snip
      FROM sessionvault_fts
      WHERE sessionvault_fts MATCH ?
      LIMIT ?
    `).all(match, Number(limit));
  } catch (e) {
    return { keys: [], snippets: {}, indexed: lastIndexed, tookMs: Date.now() - t0, error: String(e) };
  }
  const keys = [];
  const snippets = {};
  for (const row of rows) {
    keys.push(row.key);
    snippets[row.key] = String(row.snip || '').replace(/\s+/g, ' ').trim();
  }
  return { keys, snippets, indexed: lastIndexed, tookMs: Date.now() - t0 };
}

export function getSearchStatus() {
  const count = Number(db.prepare('SELECT count(*) AS n FROM sessionvault_state').get().n || 0);
  lastIndexed = count;
  return {
    indexPath: INDEX_PATH,
    indexed: count,
    building: Boolean(building),
    lastBuildStarted,
    lastBuildFinished,
    lastError,
    messageLimitPerSession: FULL_DETAIL_LIMIT,
  };
}
