export const SORT_OPTIONS = [
  { value: 'recent', label: 'Most recent' }, { value: 'oldest', label: 'Oldest' },
  { value: 'messages', label: 'Most messages' }, { value: 'title', label: 'Title A–Z' }, { value: 'tool', label: 'Tool' },
];
const SOURCE_LABELS = {
  claude: 'Claude Code', codex: 'Codex', grok: 'Grok', opencode: 'opencode', cursor: 'Cursor', gemini: 'Gemini CLI',
  copilot: 'GitHub Copilot CLI', goose: 'Goose', droid: 'Droid', cline: 'Cline',
};
function toolLabel(c) { const src = c?.source ? String(c.source) : ''; return SOURCE_LABELS[src] || src; }
function activityMs(c) { if (c?.lastActivity) { const t = new Date(c.lastActivity).getTime(); if (!Number.isNaN(t)) return t; } return typeof c?.mtimeMs === 'number' && !Number.isNaN(c.mtimeMs) ? c.mtimeMs : 0; }
function messageCount(c) { const n = typeof c?.messageCount === 'number' ? c.messageCount : 0; return Number.isNaN(n) ? 0 : n; }
function titleKey(c) { return (c?.title ? String(c.title) : '').toLowerCase(); }
function cmpTitle(a, b) { return titleKey(a).localeCompare(titleKey(b), undefined, { sensitivity: 'base', numeric: true }); }
const SORTERS = {
  recent: (a, b) => activityMs(b) - activityMs(a), oldest: (a, b) => activityMs(a) - activityMs(b), messages: (a, b) => messageCount(b) - messageCount(a), title: cmpTitle,
  tool: (a, b) => toolLabel(a).localeCompare(toolLabel(b), undefined, { sensitivity: 'base' }) || activityMs(b) - activityMs(a),
};
export function sortConvos(list, sortKey) { if (!Array.isArray(list)) return []; return list.slice().sort(SORTERS[sortKey] || SORTERS.recent); }
