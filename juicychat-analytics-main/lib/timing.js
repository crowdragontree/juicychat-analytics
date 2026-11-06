'use strict';
// Release-timing data (v1.3.0): a small record of every JuicyChat bot the app has seen, so the Analysis tab can show when bots were released
// and how many likes and favorites they got (Best times by tag, the Activity heatmap and the release-time suggestions).
// Sources: the feed scan that runs with every Performance pull (up to 4,000 bots), every Recent / Trending collection, and your own bots.
// One record per bot: [released (ms), likes, favorites, chats, [tag numbers], last seen (ms)]. Stored in its own file so the main state file stays small.
const fs = require('fs');
const path = require('path');

const MAX_BOTS = 60000, MAX_AGE_DAYS = 400, DAY = 86400000;
const idOf = u => { const m = String(u || '').match(/\/chat\/(\d{5,})/); return m ? m[1] : ''; };
const num = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0; };
// JuicyChat's times arrive as milliseconds, seconds or an ISO date
function toMs(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v))) { const n = Number(v); if (!Number.isFinite(n) || n <= 0) return null; return n > 1e12 ? Math.round(n) : n > 1e9 ? Math.round(n * 1000) : null; }
  const t = Date.parse(String(v)); return Number.isFinite(t) ? t : null;
}
const cleanTag = t => String(t == null ? '' : t).replace(/^#/, '').replace(/\s+/g, ' ').trim().slice(0, 40);

class TimingStore {
  constructor(dir) {
    this.file = path.join(dir, 'juicy-release-timing.json');
    this.data = {v: 1, tags: [], bots: {}, scans: []};
    try { if (fs.existsSync(this.file)) { const d = JSON.parse(fs.readFileSync(this.file, 'utf8')); if (d && d.bots) this.data = {v: 1, tags: d.tags || [], bots: d.bots, scans: d.scans || []}; } } catch (e) { console.error('Could not read release timing:', e); }
    this.tagIx = new Map(this.data.tags.map((t, i) => [t, i]));
  }
  save() { const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.data)); fs.renameSync(tmp, this.file); }
  size() { return Object.keys(this.data.bots).length; }
  _tag(t) { t = cleanTag(t); if (!t) return -1; let i = this.tagIx.get(t); if (i === undefined) { i = this.data.tags.length; this.data.tags.push(t); this.tagIx.set(t, i); } return i; }
  _put(id, released, likes, favs, chats, tags, at) {
    if (!id || !released) return false;
    const old = this.data.bots[id], ix = [...new Set((tags || []).map(t => this._tag(t)).filter(i => i >= 0))];
    this.data.bots[id] = [released, Math.max(likes, old ? old[1] : 0), Math.max(favs, old ? old[2] : 0), Math.max(chats, old ? old[3] : 0), ix.length ? ix : (old ? old[4] : []), at];
    return !old;
  }
  // rows from the feed scan: [id, released, likes, favorites, chats, [tags]]
  ingestMarket(rows, at = Date.now()) {
    let added = 0;
    for (const r of Array.isArray(rows) ? rows : []) { if (Array.isArray(r) && this._put(String(r[0] || ''), toMs(r[1]), num(r[2]), num(r[3]), num(r[4]), r[5], at)) added++; }
    this.data.scans.push({at, bots: Array.isArray(rows) ? rows.length : 0, added}); if (this.data.scans.length > 200) this.data.scans.splice(0, this.data.scans.length - 200);
    this._prune(); this.save(); return added;
  }
  // collected or pulled records ({url, headline:{likes,favorites,chats}, published/created, tags}) and your own bots ({id, url, likes, favorites, chats, ...})
  ingestRecords(rows, at = Date.now()) {
    let added = 0;
    for (const r of Array.isArray(rows) ? rows : []) {
      const h = r.headline || r, id = String(r.id && /^\d{5,}$/.test(String(r.id)) ? r.id : idOf(r.url));
      if (this._put(id, toMs(r.published) || toMs(r.created), num(h.likes), num(h.favorites), num(h.chats), r.tags, at)) added++;
    }
    this._prune(); this.save(); return added;
  }
  _prune() {
    const ids = Object.keys(this.data.bots), now = Date.now();
    for (const id of ids) if (now - this.data.bots[id][0] > MAX_AGE_DAYS * DAY) delete this.data.bots[id];
    const left = Object.keys(this.data.bots);
    if (left.length > MAX_BOTS) { left.sort((a, b) => this.data.bots[a][5] - this.data.bots[b][5]); for (const id of left.slice(0, left.length - MAX_BOTS)) delete this.data.bots[id]; }
  }
  // the compact list the window works from: {tags:[...], bots:[[released, likes, favorites, chats, [tag numbers]], ...]}
  pool() { return {tags: this.data.tags, bots: Object.values(this.data.bots).map(b => b.slice(0, 5)), updatedAt: this.data.scans.length ? this.data.scans[this.data.scans.length - 1].at : null, scans: this.data.scans.length}; }
  clear() { this.data = {v: 1, tags: [], bots: {}, scans: []}; this.tagIx = new Map(); this.save(); }
}
module.exports = {TimingStore, toMs, idOf};
