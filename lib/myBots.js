// Your JuicyChat bots, per account (Main / NTR). Each account is read from its
// public lounge link, so the tool never needs to sign in as that account.
// Every pull keeps a snapshot per bot and an account total, so growth and
// trends can be shown; bots are linked to scenario cards and those numbers
// become Performance records the engine analysis learns from.

// JuicyChat Analytics Tool: one account, signed in with one magic link (as in Blueprint Studio's Shareable edition)
const ACCOUNTS = {main: 'Your Account'};
const norm = t => String(t || '').toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/["“”'’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const idOf = r => (String(r.url || '').match(/\/chat\/(\d{6,})/) || [, ''])[1] || norm(r.title);
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };
const DAY = 86400000;
// JuicyChat times arrive as epoch ms, epoch seconds, or date strings
const tsIso = v => { if (v == null || v === '') return null; if (typeof v === 'number' || /^\d+$/.test(String(v))) { let t = Number(v); if (t < 1e11) t *= 1000; return new Date(t).toISOString(); } const d = Date.parse(v); return isNaN(d) ? null : new Date(d).toISOString(); };

function blankAccount(key) { return {key, label: ACCOUNTS[key], url: '', pulledAt: null, bots: [], snapshots: {}, links: {}, pulls: []}; }
function ensureAccounts(state) {
  state.accounts = state.accounts || {};
  for (const k of Object.keys(ACCOUNTS)) state.accounts[k] = Object.assign(blankAccount(k), state.accounts[k] || {});
  // older versions kept one account in state.myBots: it becomes the Main account
  const old = state.myBots;
  if (old && (old.bots || []).length && !state.accounts.main.bots.length) {
    Object.assign(state.accounts.main, {bots: old.bots, snapshots: old.snapshots || {}, links: old.links || {}, pulledAt: old.pulledAt, url: state.accounts.main.url || old.profileUrl || ''});
    state.myBots = {migrated: true};
  }
  return state.accounts;
}
function daysLive(bot, snaps) {
  const from = Date.parse(bot.created || '') || (snaps && snaps.length ? Date.parse(snaps[0].at) : null);
  return from ? Math.max(0, Math.round((Date.now() - from) / DAY)) : null;
}

function mergePull(acct, rows, url, opts = {}) {
  const at = new Date().toISOString(), bots = [], prevById = new Map((acct.bots || []).map(b => [b.id, b]));
  for (const r of rows || []) {
    const id = idOf(r); if (!id) continue;
    const h = r.headline || {};
    const b = {id, url: r.url || '', title: r.title || r.name || '', created: r.created || null, published: r.published || null,
      chats: num(h.chats ?? r.engagementEstimate), likes: num(h.likes), favorites: num(h.favorites), views: num(h.views), tags: (r.tags || []).slice(0, 20), statMode: r.statMode || '',
      description: String(r.description || '').slice(0, 1200), extra: r.extra || {}, rating: r.rating == null ? null : String(r.rating), ratingLabel: ['SFW', 'NSFW', '18+'].includes(r.ratingLabel) ? r.ratingLabel : null, raw: r.raw && typeof r.raw === 'object' ? r.raw : undefined};
    const pb = prevById.get(id);
    if (pb) { if (b.rating == null) b.rating = pb.rating ?? null; if (!b.ratingLabel) b.ratingLabel = pb.ratingLabel || null; if (!b.tags.length) b.tags = pb.tags || []; if (!b.description) b.description = pb.description || ''; if (!b.created) b.created = pb.created || null; if (!b.published) b.published = pb.published || null; }
    // comments are archived: JuicyChat only lists recent ones, so keep every one ever seen
    if (Array.isArray(r.comments) && r.comments.length) {
      acct.comments = acct.comments || {};
      const have = acct.comments[id] = acct.comments[id] || [], seen = new Set(have.map(c => c.id || `${c.name}|${c.at}`));
      for (const c of r.comments) { const k = c.id || `${c.name}|${c.at}`; if (!seen.has(k)) { seen.add(k); have.push({id: c.id || '', name: String(c.name || 'Someone').slice(0, 60), at: c.at || null, likes: num(c.likes)}); } }
      have.sort((a, b) => (Date.parse(tsIso(b.at)) || 0) - (Date.parse(tsIso(a.at)) || 0));
      if (have.length > 500) have.length = 500;
    }
    const list = acct.snapshots[id] = acct.snapshots[id] || [];
    b.firstSeen = list.length ? list[0].at : at;
    b.feeds = r.feeds && typeof r.feeds === 'object' ? Object.fromEntries(Object.entries(r.feeds).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)])) : (r.feeds === undefined && pb ? pb.feeds || {} : {});
    // v1.5.3: the Discover tab's rows (#Futanari, #Furry...): {row name: position}, kept from the last pull that read the tab when this pull did not
    b.discover = r.discover && typeof r.discover === 'object' ? Object.fromEntries(Object.entries(r.discover).filter(([k, v]) => k && Number(v) > 0).map(([k, v]) => [String(k).slice(0, 60), Number(v)])) : (r.discover === undefined && pb ? pb.discover || {} : {});
    list.push({at, chats: b.chats, likes: b.likes, favorites: b.favorites, views: b.views, feeds: b.feeds, ...(r.discover !== undefined ? {discover: b.discover} : {})});
    // best position and first appearance in each feed
    if (r.feeds !== undefined) { const fh = (acct.feedHistory = acct.feedHistory || {})[id] = (acct.feedHistory || {})[id] || {};
      // a bot that was in Editor's Choice at the last pull and is not now is listed for you to unpin (only when this pull read Editor's Choice completely)
      if (opts.editorOk) { const ed = (acct.editorGone = acct.editorGone || {}); if (b.feeds.editor) delete ed[id]; else if (fh.editor && fh.editor.last) ed[id] = {title: b.title || (pb && pb.title) || '', url: b.url || '', at, seen: false}; }
      for (const [f, pos] of Object.entries(b.feeds)) { const h = fh[f] = fh[f] || {best: pos, bestAt: at, firstAt: at}; if (pos < h.best) { h.best = pos; h.bestAt = at; } h.lastAt = at; h.last = pos; }
      for (const [f, h] of Object.entries(fh)) if (!b.feeds[f] && !(f === 'editor' && opts.editorOk === false)) h.last = null; }   // an unreliable Editor's Choice read does not count as 'left'
    if (list.length > 90) list.splice(0, list.length - 90);
    bots.push(b);
  }
  const prevIds = new Set((acct.bots || []).map(b => b.id));
  acct.bots = bots; acct.pulledAt = at; if (url) acct.url = url;
  const sum = k => bots.reduce((a, b) => a + (b[k] || 0), 0);
  acct.pulls = [...(acct.pulls || []), {at, bots: bots.length, chats: sum('chats'), likes: sum('likes'), favorites: sum('favorites'), views: sum('views'), newBots: bots.filter(b => prevIds.size && !prevIds.has(b.id)).length}].slice(-120);
  return bots.length;
}

// v1.3.3: only PUBLIC bots count. Signed in, JuicyChat lists every bot on the account: private, unlisted, pending release, under review.
// The worker also reads the lounge the way a visitor sees it (not signed in) and marks each bot publicListed. A bot on that list is public.
// A bot not on it is kept only when it is released and its visibility/review settings are the same as the bots on the list (that covers a
// public bot a visitor isn't shown, such as an 18+ one). Those settings are remembered, so they still work if the visitor list can't be read
// on a later pull. With neither, only bots that are not released yet can be told apart, and the pull says so.
function publicRows(rows, priorCodes) {
  const list = Array.isArray(rows) ? rows : [];
  const vis = r => r.visibility == null ? null : String(r.visibility), aud = r => r.extra && r.extra.auditType != null ? String(r.extra.auditType) : null;
  const listed = list.filter(r => r.publicListed === true), checked = list.some(r => r.publicListed === true || r.publicListed === false);
  let codes = null, learned = false;
  if (listed.length) { codes = {vis: [...new Set(listed.map(vis).filter(x => x != null))], audit: [...new Set(listed.map(aud).filter(x => x != null))], at: new Date().toISOString()}; learned = true; }
  else if (priorCodes && ((priorCodes.vis || []).length || (priorCodes.audit || []).length)) codes = priorCodes;
  const times = list.some(r => r.published), released = r => !!r.published && Date.parse(r.published) <= Date.now() + 60000;
  const isPublic = r => {
    if (r.publicListed === true) return true;
    if (times && !released(r)) return false;                                                   // not released yet, or scheduled
    if (codes && ((codes.vis || []).length || (codes.audit || []).length)) {
      const v = vis(r), a = aud(r);
      if ((codes.vis || []).length && v != null && !codes.vis.includes(v)) return false;          // private or unlisted
      if ((codes.audit || []).length && a != null && !codes.audit.includes(a)) return false;      // under review
      if (v == null && a == null) return !checked;
      return true;
    }
    return !checked;                                                                             // the visitor list was read and this bot isn't on it
  };
  const keep = [], held = [];
  for (const r of list) (isPublic(r) ? keep : held).push(r);
  return {rows: keep, held, codes, learned, sure: checked || !!codes};
}
module.exports = {publicRows, tsIso, ACCOUNTS, ensureAccounts, mergePull, idOf, daysLive};
