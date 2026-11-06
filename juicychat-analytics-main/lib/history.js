// Keeps every bot ever collected, instead of only the latest 200.
// Each scrape adds a "sighting" (when, which list, rank, engagement) to the bots
// it saw, so the app can tell what is rising, what stays on Trending, and what
// faded. Stored in its own file so the main state file stays small and fast.
const fs = require('fs');
const path = require('path');

const MAX_BOTS = 8000;           // oldest-seen bots are dropped past this
const MAX_SIGHTINGS = 40;        // per bot
const MAX_SCRAPES = 400;
const DAY = 86400000;

const keyOf = r => String(r.url || '').replace(/[?#].*$/, '') || (r.id ? `id:${r.id}` : `t:${String(r.title || r.name || '').toLowerCase()}`);
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

class HistoryStore {
  constructor(dir) {
    this.file = path.join(dir, 'juicy-bot-history.json');
    this.data = {version: 1, bots: {}, scrapes: []};
    try { if (fs.existsSync(this.file)) this.data = {...this.data, ...JSON.parse(fs.readFileSync(this.file, 'utf8'))}; } catch (e) { console.error('Could not read bot history:', e); }
  }
  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
  isEmpty() { return !Object.keys(this.data.bots).length; }

  // First run after updating: seed the history with the bots already in the app.
  seed(datasets) {
    if (!this.isEmpty()) return false;
    const at = datasets?.lastCollectedAt || new Date().toISOString(), id = `seed-${Date.parse(at) || Date.now()}`;
    let n = 0;
    for (const src of ['Recent', 'Trending']) { const rows = datasets?.[src.toLowerCase()] || []; if (rows.length) { this.ingest(rows, src, id, at, false); n += rows.length; } }
    if (n) { this.endScrape(id, at); return true; }
    return false;
  }

  // Merge one list from one scrape. New bots are added; known bots get a new sighting.
  ingest(rows, source, scrapeId, at = new Date().toISOString(), persist = true) {
    let added = 0, updated = 0;
    const scrape = this.data.scrapes.find(s => s.id === scrapeId) || (this.data.scrapes.push({id: scrapeId, at, counts: {}, added: 0}), this.data.scrapes[this.data.scrapes.length - 1]);
    for (const r of rows) {
      const k = keyOf(r); if (!k) continue;
      let b = this.data.bots[k];
      if (!b) { b = this.data.bots[k] = {key: k, firstSeen: at, sightings: []}; added++; } else updated++;
      Object.assign(b, {title: r.title || r.name || b.title || '', url: r.url || b.url || '', creator: r.creator || b.creator || '',
        description: String(r.description || r.rawText || b.description || '').slice(0, 700), tags: (r.tags && r.tags.length ? r.tags : b.tags) || [],
        created: r.created || b.created || null, lastSeen: at});
      b.sightings = b.sightings.filter(s => !(s.scrape === scrapeId && s.source === source));
      b.sightings.push({scrape: scrapeId, at, source, rank: num(r.rank), engagement: num(r.engagementEstimate)});
      if (b.sightings.length > MAX_SIGHTINGS) b.sightings = b.sightings.slice(-MAX_SIGHTINGS);
    }
    scrape.counts[source] = rows.length; scrape.added += added;
    if (persist) this.save();
    return {added, updated};
  }
  endScrape(scrapeId, at) {
    const s = this.data.scrapes.find(x => x.id === scrapeId); if (s) s.finishedAt = at || new Date().toISOString();
    if (this.data.scrapes.length > MAX_SCRAPES) this.data.scrapes = this.data.scrapes.slice(-MAX_SCRAPES);
    const bots = Object.values(this.data.bots);
    if (bots.length > MAX_BOTS) {
      bots.sort((a, b) => Date.parse(a.lastSeen) - Date.parse(b.lastSeen));
      for (const b of bots.slice(0, bots.length - MAX_BOTS)) delete this.data.bots[b.key];
    }
    this.save();
  }
  clear() { this.data = {version: 1, bots: {}, scrapes: []}; this.save(); }

  // Rows for analysis: one per bot per list, with a weight that favours recent
  // scrapes (half-life) and rewards bots that keep reappearing on Trending.
  analysisRows({halfLifeDays = 21, maxAgeDays = 180, now = Date.now()} = {}) {
    const out = {recent: [], trending: []};
    const latest = this.latestScrapeIds();
    for (const b of Object.values(this.data.bots)) {
      for (const source of ['Recent', 'Trending']) {
        const ss = b.sightings.filter(s => s.source === source); if (!ss.length) continue;
        const last = ss[ss.length - 1], age = (now - Date.parse(last.at)) / DAY;
        if (age > maxAgeDays) continue;
        const recency = Math.pow(0.5, age / halfLifeDays);
        const staying = source === 'Trending' ? 1 + 0.12 * Math.min(5, new Set(ss.map(s => s.scrape)).size - 1) : 1;
        const eng = ss.map(s => s.engagement).filter(x => x != null);
        const growth = eng.length >= 2 && eng[0] > 0 ? (eng[eng.length - 1] - eng[0]) / eng[0] : null;
        const rising = source === 'Recent' && growth != null && growth > 1 ? 1.15 : 1;
        out[source.toLowerCase()].push({title: b.title, name: b.title, url: b.url, creator: b.creator, description: b.description, rawText: `${b.title} ${b.description} ${(b.tags || []).join(' ')}`,
          tags: b.tags, source, rank: last.rank, engagementEstimate: last.engagement, created: b.created,
          weight: Math.max(0.05, recency * staying * rising), sightings: ss.length, inLatest: latest.has(last.scrape), firstSeen: b.firstSeen, lastSeen: b.lastSeen});
      }
    }
    return out;
  }
  latestScrapeIds() {
    const done = this.data.scrapes.filter(s => s.finishedAt || s.counts);
    const last = done[done.length - 1];
    return new Set(last ? [last.id] : []);
  }
  stats() {
    const bots = Object.values(this.data.bots), scrapes = this.data.scrapes.filter(s => Object.keys(s.counts || {}).length);
    const trendRepeat = bots.filter(b => new Set(b.sightings.filter(s => s.source === 'Trending').map(s => s.scrape)).size >= 2).length;
    const bothLists = bots.filter(b => new Set(b.sightings.map(s => s.source)).size === 2).length;
    const risers = bots.map(b => {
      const t = b.sightings.filter(s => s.source === 'Trending' && s.rank != null);
      return t.length >= 2 ? {title: b.title, url: b.url, creator: b.creator, from: t[0].rank, to: t[t.length - 1].rank, times: t.length} : null;
    }).filter(Boolean).filter(x => x.to < x.from).sort((a, b) => (b.from - b.to) - (a.from - a.to)).slice(0, 8);
    const graduated = bots.filter(b => { const s = b.sightings; const r = s.findIndex(x => x.source === 'Recent'), t = s.findIndex(x => x.source === 'Trending'); return r >= 0 && t > r; })
      .map(b => ({title: b.title, url: b.url, creator: b.creator})).slice(0, 8);
    return {bots: bots.length, scrapes: scrapes.length, since: scrapes[0]?.at || null, lastAt: scrapes[scrapes.length - 1]?.at || null,
      lastAdded: scrapes[scrapes.length - 1]?.added || 0, trendingRepeat: trendRepeat, bothLists, risers, graduated,
      perScrape: scrapes.slice(-12).map(s => ({at: s.at, recent: s.counts.Recent || 0, trending: s.counts.Trending || 0, added: s.added || 0}))};
  }
}

module.exports = {HistoryStore, keyOf};
