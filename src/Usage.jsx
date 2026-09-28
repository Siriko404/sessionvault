import { useCallback, useEffect, useState } from 'react';
import './usage.css';

const DEFAULT_META = {
  claude: { label: 'Claude Code', short: 'Claude', color: '#d97757' }, codex: { label: 'Codex', short: 'Codex', color: '#10a37f' },
  grok: { label: 'Grok', short: 'Grok', color: '#9b87f5' }, opencode: { label: 'opencode', short: 'opencode', color: '#f0883e' },
  cursor: { label: 'Cursor', short: 'Cursor', color: '#4d9fff' }, gemini: { label: 'Gemini CLI', short: 'Gemini', color: '#e6477f' },
  copilot: { label: 'GitHub Copilot CLI', short: 'Copilot', color: '#3fb950' }, goose: { label: 'Goose', short: 'Goose', color: '#e3b341' },
  droid: { label: 'Droid', short: 'Droid', color: '#ff7b72' }, cline: { label: 'Cline', short: 'Cline', color: '#a371f7' },
};
const KIND_TAG = { quota: 'quota left', consumed: 'used', activity: 'activity' };
function isPercent(m) { return /^(limit_|quota)/.test(m.key) || (typeof m.value === 'number' && /%$/.test(m.display || '')); }

function Metric({ m, accent }) {
  const pct = typeof m.value === 'number' ? Math.max(0, Math.min(100, m.value)) : null;
  return <div className="usg-metric">
    <div className="usg-metric-row"><span className="usg-metric-label">{m.label}</span><span className="usg-metric-value">{m.display ?? '—'}</span></div>
    {isPercent(m) && pct != null && <div className="usg-bar" role="progressbar" aria-label={`${m.label}: ${m.display ?? `${pct}%`}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}><div className="usg-bar-fill" style={{ width: `${pct}%`, background: accent }} /></div>}
    {m.detail && <span className="usg-metric-detail">{m.detail}</span>}
  </div>;
}

function Card({ entry, meta }) {
  const m = meta[entry.source] || {};
  const accent = m.color || 'var(--accent)';
  const name = m.label || entry.label || entry.source;
  const style = { '--usg-accent': accent };
  if (!entry.available) return <div className="usg-card usg-off" style={style}><div className="usg-card-head"><span className="usg-dot" /><span className="usg-name">{name}</span><span className="usg-tag">n/a</span></div><div className="usg-na"><span className="usg-na-dash">—</span></div><div className="usg-note">{entry.note || 'No local usage data'}</div></div>;
  const tag = KIND_TAG[entry.kind] || 'used';
  return <div className="usg-card" style={style}><div className="usg-card-head"><span className="usg-dot" /><span className="usg-name">{name}</span><span className={`usg-tag ${entry.kind === 'quota' ? 'usg-tag-quota' : ''}`}>{tag}</span></div><div className="usg-metrics">{(entry.metrics || []).map((metric) => <Metric key={metric.key} m={metric} accent={accent} />)}</div>{entry.note && <div className="usg-note">{entry.note}</div>}</div>;
}

export default function Usage() {
  const [data, setData] = useState(null), [meta, setMeta] = useState(DEFAULT_META), [error, setError] = useState(null), [loading, setLoading] = useState(true);
  const load = useCallback(async (signal) => {
    setLoading(true); setError(null);
    try {
      const [usageResponse, sourceResponse] = await Promise.all([fetch('/api/usage', { signal }), fetch('/api/sources', { signal }).catch(() => null)]);
      if (!usageResponse.ok) throw new Error(`HTTP ${usageResponse.status}`);
      const usage = await usageResponse.json();
      const sources = sourceResponse?.ok ? await sourceResponse.json() : null;
      setData(Array.isArray(usage) ? usage : []);
      if (sources && typeof sources === 'object') setMeta(sources);
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'failed to load');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);
  const available = (data || []).filter((d) => d.available).length;
  return <section className="usg-wrap" aria-labelledby="usage-title"><div className="usg-head"><span className="usg-title" id="usage-title">Usage &amp; quota</span>{data && <span className="usg-sub">{available} of {data.length} tools expose local data</span>}</div>{loading && <div className="usg-state" role="status">Loading usage…</div>}{!loading && error && <div className="usg-state usg-error" role="alert">Usage unavailable ({error}) <button className="retry-btn" onClick={() => load()}>Retry</button></div>}{!loading && !error && data?.length === 0 && <div className="usg-state">No local usage data is available.</div>}{!loading && !error && data?.length > 0 && <div className="usg-grid">{data.map((entry) => <Card key={entry.source} entry={entry} meta={meta} />)}</div>}</section>;
}
