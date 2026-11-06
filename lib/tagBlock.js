// Blocked tags: bots that carry any of these JuicyChat tags are never pulled, never kept, and never counted in the analysis.
// A tag matches when it is the same tag ignoring case, a leading #, and punctuation/spacing ("Slow-Burn" = "slow burn" = "#Slow Burn").
const norm = t => String(t == null ? '' : t).toLowerCase().replace(/^#+/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const clean = list => {
  const seen = new Set(), out = [];
  for (const x of Array.isArray(list) ? list : []) { const label = String(x == null ? '' : x).replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, 60), k = norm(label); if (k && !seen.has(k)) { seen.add(k); out.push(label); } }
  return out.slice(0, 300);
};
const setOf = list => new Set(clean(list).map(norm));
const rowTags = r => (r && Array.isArray(r.tags) ? r.tags : []).map(t => typeof t === 'string' ? t : (t && (t.name || t.title || t.label)) || '');
const hits = (r, blocked) => { const s = blocked instanceof Set ? blocked : setOf(blocked); return s.size ? rowTags(r).filter(t => s.has(norm(t))) : []; };
const isBlocked = (r, blocked) => hits(r, blocked).length > 0;
// rows without a blocked tag, plus how many were dropped and which tags caused it
function filterRows(rows, blocked) {
  const s = setOf(blocked), list = Array.isArray(rows) ? rows : [];
  if (!s.size) return {rows: list, dropped: 0, byTag: {}, items: []};
  const byTag = {}, items = []; let dropped = 0; const kept = [];
  for (const r of list) { const h = hits(r, s); if (h.length) { dropped++; items.push(r); for (const t of h) byTag[t] = (byTag[t] || 0) + 1; } else kept.push(r); }
  return {rows: kept, dropped, byTag, items};
}
// what the app lists for a bot that was left out: its name, link, every tag it has, and which of them are blocked
const discardRecord = (r, section, blocked) => ({id: String(r.id || ''), name: String(r.name || r.title || 'A bot').trim().slice(0, 80), url: r.url || '', section,
  tags: rowTags(r).map(t => String(t).replace(/^#+/, '').trim()).filter(Boolean).slice(0, 30), blocked: hits(r, blocked).map(t => String(t).replace(/^#+/, '').trim())});
// every tag seen on collected bots, most used first: [{name, count}]
function seen(rowSets) {
  const m = new Map();
  for (const rows of rowSets) for (const r of rows || []) for (const t of rowTags(r)) { const k = norm(t); if (!k) continue; const e = m.get(k); if (e) e.count++; else m.set(k, {name: String(t).replace(/^#+/, '').trim(), count: 1}); }
  return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
module.exports = {norm, clean, setOf, isBlocked, hits, filterRows, discardRecord, seen};
