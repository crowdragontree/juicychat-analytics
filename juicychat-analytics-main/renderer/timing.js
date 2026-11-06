/* Release timing (v1.3.0): when bots were released and how they did, and what that says about when to release yours.
   Pure functions, no screen code. A bot's "score" is likes + 1.5 x favorites (a favorite means more than a like).
   Times are read in the computer's own time zone unless a zone is passed in (the tests do that). */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.ReleaseTiming = api; })(typeof window !== 'undefined' ? window : globalThis, function () {
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const HOUR = 3600000, DAY = 86400000;
  const FAV_WEIGHT = 1.5, MIN_SLOT = 3;
  const scoreOf = (likes, favs) => (likes || 0) + FAV_WEIGHT * (favs || 0);
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const pad = n => String(n).padStart(2, '0');
  const hh = h => `${pad(h)}:00`;

  // day (0 = Monday ... 6 = Sunday) and hour (0-23) of a moment, in a time zone (default: this computer's)
  function slotOf(ms, tz) {
    if (!tz) { const d = new Date(ms); return {dow: (d.getDay() + 6) % 7, hour: d.getHours()}; }
    const f = slotOf.fmt[tz] || (slotOf.fmt[tz] = new Intl.DateTimeFormat('en-US', {timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23'}));
    let dow = 0, hour = 0; for (const p of f.formatToParts(new Date(ms))) { if (p.type === 'weekday') dow = DAYS.indexOf(p.value.slice(0, 3)); else if (p.type === 'hour') hour = Number(p.value) % 24; }
    return {dow: dow < 0 ? 0 : dow, hour};
  }
  slotOf.fmt = {};
  const zoneName = tz => tz || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '') || 'this computer';

  // the pool from the main process -> bots ready to count. Bots younger than minAgeHours have had no time to collect likes, and bots older than maxAgeDays are left out
  function prepare(pool, {now = Date.now(), tz = '', minAgeHours = 48, maxAgeDays = 180} = {}) {
    const tags = (pool && pool.tags) || [], out = [];
    for (const b of (pool && pool.bots) || []) {
      const age = now - b[0]; if (!(b[0] > 0) || age < minAgeHours * HOUR || age > maxAgeDays * DAY) continue;
      const s = slotOf(b[0], tz), raw = scoreOf(b[1], b[2]);
      out.push({t: b[0], dow: s.dow, hour: s.hour, likes: b[1] || 0, favs: b[2] || 0, chats: b[3] || 0, raw, score: raw, tags: (b[4] || []).map(i => tags[i]).filter(Boolean)});
    }
    // a bot that went viral is real, but it must not decide the best hour on its own: scores are capped at the 99.5th percentile when comparing slots (the likes and favorites shown stay exact)
    if (out.length >= 50) { const sorted = out.map(b => b.raw).sort((x, y) => x - y), cap = sorted[Math.floor((sorted.length - 1) * 0.995)]; for (const b of out) if (b.score > cap) b.score = cap; }
    return out;
  }
  const emptyAgg = () => ({n: 0, likes: 0, favs: 0, score: 0, hours: Array.from({length: 24}, () => ({n: 0, likes: 0, favs: 0, score: 0})), days: Array.from({length: 7}, () => ({n: 0, likes: 0, favs: 0, score: 0})), cells: Array.from({length: 7}, () => Array.from({length: 24}, () => ({n: 0, likes: 0, favs: 0, score: 0})))});
  function add(a, b) { a.n++; a.likes += b.likes; a.favs += b.favs; a.score += b.score; }
  function groupByTag(bots) { const m = new Map(); for (const b of bots) for (const t of new Set(b.tags)) { let l = m.get(t); if (!l) m.set(t, l = []); l.push(b); } return m; }
  function aggregate(bots, tag) {
    const a = emptyAgg(), want = tag ? String(tag).toLowerCase() : '';
    for (const b of bots) {
      if (want && !b.tags.some(t => t.toLowerCase() === want)) continue;
      add(a, b); add(a.hours[b.hour], b); add(a.days[b.dow], b); add(a.cells[b.dow][b.hour], b);
    }
    a.mean = a.n ? a.score / a.n : 0;
    return a;
  }
  // every tag with its totals, most likes + favorites first (the "All tags" overview)
  function tagTable(bots, {minBots = 5} = {}) {
    const m = new Map();
    for (const b of bots) for (const t of new Set(b.tags)) { let r = m.get(t); if (!r) m.set(t, r = {tag: t, n: 0, likes: 0, favs: 0, score: 0}); r.n++; r.likes += b.likes; r.favs += b.favs; r.score += b.score; }
    return [...m.values()].filter(r => r.n >= minBots).map(r => ({...r, events: r.likes + r.favs})).sort((a, b) => b.events - a.events || b.n - a.n);
  }
  // expected score per bot for a slot, pulled toward the overall average when few bots back it ("shrinkage"): one lucky bot must not rank first
  const shrunk = (cell, prior, k) => (cell.score + k * prior) / (cell.n + k);
  // v1.3.1: a release window ("only between 8 AM and 8 PM"): {from, to} with to not included, wrapping past midnight when to < from. Returns 24 true/false flags, or null for the whole day
  function hoursOf(win) {
    if (!win || win.from == null || win.to == null) return null;
    const f = ((Math.round(Number(win.from)) % 24) + 24) % 24, t = ((Math.round(Number(win.to)) % 24) + 24) % 24; if (!Number.isFinite(f) || !Number.isFinite(t) || f === t) return null;
    const m = new Array(24).fill(false); for (let h = f; h !== t; h = (h + 1) % 24) m[h] = true; return m;
  }
  // the average score of the bots released inside the window (the fair yardstick for a slot inside it)
  function meanIn(agg, win) { const m = hoursOf(win); if (!m) return agg.mean; let n = 0, sc = 0; for (let h = 0; h < 24; h++) if (m[h]) { n += agg.hours[h].n; sc += agg.hours[h].score; } return n ? sc / n : agg.mean; }
  function countIn(agg, win) { const m = hoursOf(win); if (!m) return agg.n; let n = 0; for (let h = 0; h < 24; h++) if (m[h]) n += agg.hours[h].n; return n; }
  // each weekday's totals using only the hours inside the window
  function daysIn(agg, win) {
    const m = hoursOf(win); if (!m) return agg.days;
    return agg.cells.map(row => { const o = {n: 0, likes: 0, favs: 0, score: 0}; for (let h = 0; h < 24; h++) if (m[h]) { o.n += row[h].n; o.likes += row[h].likes; o.favs += row[h].favs; o.score += row[h].score; } return o; });
  }
  function topSlots(agg, {count = 3, k = 4, prior = null, win = null} = {}) {
    const pr = prior == null ? agg.mean : prior, rows = [], m = hoursOf(win);
    for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) { if (m && !m[h]) continue; const c = agg.cells[d][h]; if (c.n) rows.push({dow: d, hour: h, n: c.n, likes: c.likes, favs: c.favs, score: c.score, expected: shrunk(c, pr, k), avg: c.score / c.n, thin: c.n < MIN_SLOT}); }
    // a slot with 3 or more bots is ranked first; thinner slots only fill the list when there are not enough of those (and are marked as such)
    const rank = (a, b) => b.expected - a.expected || b.n - a.n, solid = rows.filter(r => !r.thin).sort(rank), thin = rows.filter(r => r.thin).sort(rank);
    return [...solid, ...thin].slice(0, count);
  }
  const slotLabel = s => `${DAYS[s.dow]} ${hh(s.hour)}–${pad(s.hour)}:59`;
  // the chart: one value per hour of the day
  function hourSeries(agg, mode) { return agg.hours.map(c => mode === 'total' ? c.likes + c.favs : c.n ? c.score / c.n : 0); }
  // the heatmap: value 0..1 per cell (null = nobody released then)
  function heatmap(agg, mode) {
    const raw = agg.cells.map(r => r.map(c => !c.n ? null : mode === 'total' ? c.likes + c.favs : c.score / c.n)), flat = raw.flat().filter(v => v != null).sort((a, b) => a - b);
    const lo = flat.length ? flat[0] : 0, hi = flat.length ? flat[Math.floor((flat.length - 1) * 0.98)] : 1;      // the top 2% share the brightest colour, so one huge bot does not dim the rest
    return {raw, level: raw.map(r => r.map(v => v == null ? null : hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0.5)), lo, hi};
  }

  // ---------------------------------------------------------------- when to release a series
  const GENERIC_WORDS = new Set(['friday', 'series', 'true', 'standalone', 'pilot', 'high', 'reaction']);
  // the JuicyChat tags that mean this series: tags named like it, and tags nearly every one of your bots in the series carries that few other bots do
  function seriesTags(series, ownBots, tagCounts, poolSize) {
    const key = String(series || '').replace(/ series$/i, ''), nk = norm(key), found = [];
    const names = Object.keys(tagCounts);
    for (const t of names) { const nt = norm(t); if (nt && (nt === nk || (nk.length >= 4 && nt.includes(nk)))) found.push(t); }
    if (!found.length) for (const w of key.split(/\s+/).filter(x => x.length >= 4 && !GENERIC_WORDS.has(x.toLowerCase()))) { for (const t of names) if (norm(t) === norm(w) || norm(t).includes(norm(w))) found.push(t); if (found.length) break; }
    const mine = ownBots || [];
    if (mine.length >= 4 && poolSize) {
      const cnt = {}; for (const b of mine) for (const t of new Set((b.tags || []).map(String))) cnt[t] = (cnt[t] || 0) + 1;
      const lift = Object.entries(cnt).map(([t, c]) => ({t, share: c / mine.length, lift: (c / mine.length) / Math.max(1e-6, (tagCounts[t] || 1) / poolSize), seen: tagCounts[t] || 0})).filter(x => x.share >= 0.5 && x.lift >= 3 && x.seen >= 10).sort((a, b) => b.lift - a.lift).slice(0, 2);
      for (const x of lift) if (!found.includes(x.t)) found.push(x.t);
    }
    return [...new Set(found)].slice(0, 3);
  }
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  // three-hour windows around the clock: the window with the best expected score per bot
  function bestWindow(agg, {k = 6, prior, width = 3, win = null} = {}) {
    const pr = prior == null ? agg.mean : prior, m = hoursOf(win); let best = null;
    if (m) width = Math.min(width, m.filter(Boolean).length);       // a release window shorter than 3 hours is judged on its own length
    for (let h = 0; h < 24; h++) {
      let n = 0, score = 0, ok = true; for (let i = 0; i < width; i++) { const x = (h + i) % 24; if (m && !m[x]) { ok = false; break; } const c = agg.hours[x]; n += c.n; score += c.score; }
      if (!ok) continue;
      const e = (score + k * pr) / (n + k); if (n && (!best || e > best.expected)) best = {start: h, end: (h + width - 1) % 24, n, expected: e, avg: score / n, lift: pr ? e / pr : 1};
    }
    return best;
  }
  // ownBots: [{series, released (ms), chats, tags}] (your own bots, NTR left out by the caller). pool: the prepared market bots. avoidDays: days a series must not be placed on.
  function seriesInsights({ownBots = [], bots = [], series = [], now = Date.now(), tz = '', avoid = {}, win = null} = {}) {
    const all = aggregate(bots), winM = hoursOf(win), allMean = winM ? meanIn(all, win) : all.mean, tagCounts = {}; for (const b of bots) for (const t of new Set(b.tags)) tagCounts[t] = (tagCounts[t] || 0) + 1;
    const results = [];
    for (const name of series) {
      const mine = ownBots.filter(b => b.series === name && b.released).map(b => { const s = slotOf(b.released, tz), age = Math.max(3, (now - b.released) / DAY); return {...b, dow: s.dow, hour: s.hour, perDay: (b.chats || 0) / age, ageDays: (now - b.released) / DAY}; }).filter(b => b.ageDays >= 3);
      const tags = seriesTags(name, mine, tagCounts, bots.length);
      const want = new Set(tags.map(t => t.toLowerCase())), pool = want.size ? bots.filter(b => b.tags.some(t => want.has(t.toLowerCase()))) : [];
      const tagAgg = aggregate(pool), r = {series: name, tags, own: {n: mine.length}, market: {n: pool.length}, day: null, time: null, confidence: 'none', notes: []};
      const banned = new Set(avoid[name] || []);
      // day: your own bots first when there are enough of them, the tag's bots across JuicyChat otherwise
      let dayPick = null;
      if (mine.length >= 8) {
        const mu = mean(mine.map(b => b.perDay)), byDay = Array.from({length: 7}, () => []); for (const b of mine) byDay[b.dow].push(b.perDay);
        const sh = byDay.map(a => (a.reduce((x, y) => x + y, 0) + 2 * mu) / (a.length + 2));
        const order = sh.map((v, i) => ({i, v, n: byDay[i].length, raw: byDay[i].length ? mean(byDay[i]) : 0})).filter(x => !banned.has(DAY_FULL[x.i])).sort((a, b) => b.v - a.v);
        const top = order[0];
        r.own.byDay = byDay.map((a, i) => ({n: a.length, avg: a.length ? mean(a) : 0})); r.own.mean = mu;
        if (top && top.n >= 2 && top.v / mu >= 1.15) { dayPick = {dow: top.i, lift: top.v / mu, source: 'own', n: top.n, avg: top.raw, base: mu}; r.dayRank = order.filter(x => x.n >= 2 && x.v / mu >= 1.05).map(x => ({dow: x.i, lift: x.v / mu, n: x.n})); r.dayLifts = sh.map((v, i) => banned.has(DAY_FULL[i]) ? null : v / mu); }
      }
      const dayCells = daysIn(tagAgg, win);                         // with a release window, only the bots released inside it are compared
      if (!dayPick && pool.length >= 25) {
        const mu = winM ? (meanIn(tagAgg, win) || tagAgg.mean) : tagAgg.mean, sh = dayCells.map(c => (c.score + 4 * mu) / (c.n + 4));
        const order = sh.map((v, i) => ({i, v, n: dayCells[i].n})).filter(x => !banned.has(DAY_FULL[x.i])).sort((a, b) => b.v - a.v), top = order[0];
        r.market.byDay = dayCells.map(c => ({n: c.n, avg: c.n ? c.score / c.n : 0}));
        if (top && top.n >= 4 && top.v / mu >= 1.1) { dayPick = {dow: top.i, lift: top.v / mu, source: 'market', n: top.n, avg: dayCells[top.i].score / Math.max(1, dayCells[top.i].n), base: mu}; r.dayRank = order.filter(x => x.n >= 4 && x.v / mu >= 1.05).map(x => ({dow: x.i, lift: x.v / mu, n: x.n})); r.dayLifts = sh.map((v, i) => banned.has(DAY_FULL[i]) ? null : v / mu); }
      }
      if (dayPick) r.day = dayPick;
      // time of day: the tag's bots (pulled toward the all-bots average), or all bots when the series has no tag of its own
      const src = pool.length >= 25 ? tagAgg : all, best = countIn(src, win) >= 25 ? bestWindow(src, {prior: allMean, win}) : null;
      if (best) r.time = {...best, source: pool.length >= 25 ? 'tag' : 'all', inWindow: !!winM, good: best.lift >= 1.08};
      if (winM) { const overall = src.n >= 25 ? bestWindow(src, {prior: all.mean}) : null; if (overall && (!best || overall.start !== best.start)) r.timeOverall = overall; if (!best) r.notes.push('Not enough bots were released inside your release hours to say when to release.'); }
      const agree = dayPick && dayPick.source === 'own' && pool.length >= 25 && dayCells[dayPick.dow].n >= 3 && dayCells[dayPick.dow].score / dayCells[dayPick.dow].n > (winM ? meanIn(tagAgg, win) : tagAgg.mean);
      r.confidence = !dayPick ? (best ? 'low' : 'none') : agree || (dayPick.source === 'own' && mine.length >= 20) ? 'high' : dayPick.n >= 6 ? 'medium' : 'low';
      if (!dayPick) r.notes.push(mine.length < 8 ? (mine.length ? `Only ${mine.length} of your bots in this series ${mine.length === 1 ? 'has' : 'have'} been live 3 days or more: too few to compare days.` : 'None of your bots in this series have been live 3 days yet, so there is nothing to compare.') : 'No day clearly beats the others yet.');
      if (!pool.length) r.notes.push(tags.length ? 'Not enough bots with this tag collected yet.' : 'No JuicyChat tag matches this series, so the time is from all bots.');
      results.push(r);
    }
    return results;
  }
  const fmtHour = h => { const x = h % 24; return `${x % 12 || 12} ${x < 12 ? 'AM' : 'PM'}`; };
  return {DAYS, DAY_FULL, scoreOf, slotOf, zoneName, prepare, aggregate, groupByTag, tagTable, topSlots, slotLabel, hourSeries, heatmap, seriesTags, bestWindow, seriesInsights, fmtHour, hh, FAV_WEIGHT, hoursOf, meanIn, countIn, daysIn};
});
