import './metrics.css';
import { useMemo } from 'react';

const FALLBACK_COLOR = '#8b949e';
const DAY_MS = 86400000;

function colorFor(meta, source) {
  return (meta && meta[source] && meta[source].color) || FALLBACK_COLOR;
}
function shortFor(meta, source) {
  return (meta && meta[source] && meta[source].short) || source;
}

export default function Metrics({ convos, meta }) {
  const data = useMemo(() => {
    const list = Array.isArray(convos) ? convos : [];
    if (list.length === 0) return null;

    const perTool = new Map();
    let totalMessages = 0;
    for (const c of list) {
      const src = c.source || 'unknown';
      const entry = perTool.get(src) || { source: src, count: 0, messages: 0 };
      entry.count += 1;
      entry.messages += Number(c.messageCount) || 0;
      perTool.set(src, entry);
      totalMessages += Number(c.messageCount) || 0;
    }
    const tools = [...perTool.values()].sort((a, b) => b.count - a.count);
    const maxToolCount = Math.max(1, ...tools.map((t) => t.count));
    const mostActive = tools[0] || null;

    const projMap = new Map();
    for (const c of list) {
      const label = c.projectLabel || c.projectPath || 'unknown';
      const entry = projMap.get(label) || { label, count: 0 };
      entry.count += 1;
      projMap.set(label, entry);
    }
    const projects = [...projMap.values()].sort((a, b) => b.count - a.count).slice(0, 5);
    const maxProjCount = Math.max(1, ...projects.map((p) => p.count));

    const now = Date.now();
    let last7 = 0;
    let prev7 = 0;
    const times = [];
    for (const c of list) {
      const t = c.lastActivity ? Date.parse(c.lastActivity) : NaN;
      if (Number.isNaN(t)) continue;
      times.push(t);
      const age = Math.max(0, now - t);
      if (age <= 7 * DAY_MS) last7 += 1;
      else if (age <= 14 * DAY_MS) prev7 += 1;
    }

    // Always anchor the 30-day chart to today. Anchoring to the newest record
    // made stale histories look current, which is misleading for an ops UI.
    const end = new Date(now);
    end.setHours(0, 0, 0, 0);
    const endDayMs = end.getTime();
    const WINDOW_DAYS = 30;
    const startMs = endDayMs - (WINDOW_DAYS - 1) * DAY_MS;
    const buckets = new Array(WINDOW_DAYS).fill(0);
    for (const t of times) {
      if (t < startMs || t >= endDayMs + DAY_MS) continue;
      const idx = Math.floor((t - startMs) / DAY_MS);
      if (idx >= 0 && idx < WINDOW_DAYS) buckets[idx] += 1;
    }
    const activity = buckets.map((value, i) => ({ ms: startMs + i * DAY_MS, value }));
    const maxActivityRaw = Math.max(0, ...buckets);
    const maxActivityScale = Math.max(1, maxActivityRaw);

    return {
      tools,
      maxToolCount,
      mostActive,
      totalMessages,
      totalConvos: list.length,
      toolCount: tools.length,
      projects,
      maxProjCount,
      projectCount: projMap.size,
      last7,
      prev7,
      activity,
      maxActivityRaw,
      maxActivityScale,
    };
  }, [convos]);

  if (!data) return <div className="mx-empty">No conversation data to chart.</div>;

  const fmtNum = (n) => n.toLocaleString();
  const fmtDay = (ms) => {
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  const SP_W = 600;
  const SP_H = 90;
  const n = data.activity.length;
  const barGap = 2;
  const barW = n > 0 ? (SP_W - barGap * (n - 1)) / n : 0;

  return (
    <div className="mx-wrap">
      <div className="mx-summary">
        <div className="mx-stat"><div className="mx-stat-label">Conversations</div><div className="mx-stat-value">{fmtNum(data.totalConvos)}</div></div>
        <div className="mx-stat"><div className="mx-stat-label">Messages</div><div className="mx-stat-value">{fmtNum(data.totalMessages)}</div></div>
        <div className="mx-stat"><div className="mx-stat-label">Tools</div><div className="mx-stat-value">{fmtNum(data.toolCount)}</div></div>
        <div className="mx-stat">
          <div className="mx-stat-label">Last 7 days</div>
          <div className="mx-stat-value">
            {fmtNum(data.last7)}
            {data.prev7 > 0 && (
              <span className={`mx-stat-sub ${data.last7 >= data.prev7 ? 'mx-up' : 'mx-down'}`}>
                {data.last7 >= data.prev7 ? '▲' : '▼'} {Math.abs(Math.round(((data.last7 - data.prev7) / data.prev7) * 100))}% vs prior wk
              </span>
            )}
          </div>
        </div>
        <div className="mx-stat"><div className="mx-stat-label">Projects</div><div className="mx-stat-value">{fmtNum(data.projectCount)}</div></div>
        <div className="mx-stat">
          <div className="mx-stat-label">Most active</div>
          <div className="mx-stat-value">
            <span style={{ color: colorFor(meta, data.mostActive?.source) }}>{data.mostActive ? shortFor(meta, data.mostActive.source) : '—'}</span>
            {data.mostActive && <span className="mx-stat-sub">{fmtNum(data.mostActive.count)}</span>}
          </div>
        </div>
      </div>

      <div className="mx-grid">
        <div className="mx-card">
          <h3 className="mx-card-title">Conversations per tool</h3>
          <div className="mx-bars">
            {data.tools.map((t) => {
              const color = colorFor(meta, t.source);
              const pct = (t.count / data.maxToolCount) * 100;
              return (
                <div className="mx-bar-row" key={t.source}>
                  <span className="mx-bar-name" title={shortFor(meta, t.source)}><span className="mx-dot" style={{ background: color }} />{shortFor(meta, t.source)}</span>
                  <span className="mx-bar-track" role="progressbar" aria-label={`${shortFor(meta, t.source)} conversations`} aria-valuemin="0" aria-valuemax={data.maxToolCount} aria-valuenow={t.count}>
                    <span className="mx-bar-fill" style={{ width: `${pct}%`, background: color }} />
                  </span>
                  <span className="mx-bar-val" title={`${fmtNum(t.messages)} messages`}>{fmtNum(t.count)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mx-card">
          <h3 className="mx-card-title">Top projects</h3>
          <div className="mx-proj">
            {data.projects.map((p) => {
              const pct = (p.count / data.maxProjCount) * 100;
              return (
                <div className="mx-proj-row" key={p.label}>
                  <span className="mx-proj-name" title={p.label}>{p.label}</span>
                  <span className="mx-proj-meta">{fmtNum(p.count)}<span className="mx-proj-pct"> · {Math.round((p.count / data.totalConvos) * 100)}%</span></span>
                  <span className="mx-proj-bar" style={{ gridColumn: '1 / -1' }} role="progressbar" aria-label={`${p.label} conversations`} aria-valuemin="0" aria-valuemax={data.maxProjCount} aria-valuenow={p.count}>
                    <span className="mx-proj-fill" style={{ width: `${pct}%` }} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mx-card mx-wide">
          <h3 className="mx-card-title">Activity over time <span className="mx-hint">conversations per day · last 30 calendar days</span></h3>
          <svg className="mx-spark" viewBox={`0 0 ${SP_W} ${SP_H}`} preserveAspectRatio="none" role="img" aria-label={`Conversations per day over the last 30 calendar days; peak ${data.maxActivityRaw} per day`}>
            {data.activity.map((a, i) => {
              const h = a.value > 0 ? (a.value / data.maxActivityScale) * (SP_H - 4) : 0;
              const x = i * (barW + barGap);
              return <rect key={a.ms} x={x} y={SP_H - h} width={barW} height={h} rx={1} fill="var(--accent)" opacity={a.value > 0 ? 0.9 : 0}><title>{`${fmtDay(a.ms)}: ${a.value}`}</title></rect>;
            })}
          </svg>
          <div className="mx-axis"><span>{fmtDay(data.activity[0].ms)}</span><span>peak {fmtNum(data.maxActivityRaw)}/day</span><span>{fmtDay(data.activity[n - 1].ms)}</span></div>
        </div>
      </div>
    </div>
  );
}
