/* Analysis tab > "4. When to release" (v1.3.0): the Activity heatmap, Best times by tag and the release-time suggestions.
   The statistics are in timing.js; this file draws them. */
(function () {
  const T = window.ReleaseTiming;
  const $$ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const fmt = n => Number(n || 0).toLocaleString();
  const short = n => n >= 10000 ? (n / 1000).toFixed(0) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));
  const view = {tag: '', metric: 'avg', all: false, pool: null, bots: [], loading: false, builtAt: 0, sortKey: 'events', sortDir: 'desc', usedOnly: false, acct: 'main'};
  // v1.3.1: the tag table can be sorted by Tag, Bots or Events (click a heading again to reverse it) and limited to the tags on the bots of one of your accounts (Main or NTR, never mixed); these choices are remembered
  try { const s = JSON.parse(localStorage.getItem('jbs.tagTable') || '{}'); if (['tag', 'n', 'events'].includes(s.k)) view.sortKey = s.k; if (s.d === 'asc' || s.d === 'desc') view.sortDir = s.d; view.usedOnly = !!s.u; if (s.a === 'ntr') view.acct = 'ntr'; } catch (e) { /* defaults */ }
  // v1.3.1: the release window (only judge the hours you are willing to release in); remembered
  view.win = {on: false, from: 8, to: 20}; view.find = '';
  try { const w = JSON.parse(localStorage.getItem('jbs.relWindow') || '{}'); if (Number.isInteger(w.from) && w.from >= 0 && w.from <= 23) view.win.from = w.from; if (Number.isInteger(w.to) && w.to >= 1 && w.to <= 24) view.win.to = w.to; view.win.on = !!w.on; } catch (e) { /* defaults */ }
  const saveWin = () => { try { localStorage.setItem('jbs.relWindow', JSON.stringify(view.win)); } catch (e) { /* not saved */ } };
  const winArg = () => view.win.on && (view.win.from % 24) !== (view.win.to % 24) ? {from: view.win.from, to: view.win.to} : null;
  const winLabel = () => `${T.fmtHour(view.win.from)} to ${T.fmtHour(view.win.to)}`;
  const priorFor = all => { const w = winArg(); return w ? (T.meanIn(all, w) || all.mean) : all.mean; };
  const saveTagPrefs = () => { try { localStorage.setItem('jbs.tagTable', JSON.stringify({k: view.sortKey, d: view.sortDir, u: view.usedOnly, a: view.acct})); } catch (e) { /* not saved */ } };
  const TICKS = [0, 3, 6, 9, 12, 15, 18, 21];
  const eventTag = () => { try { const e = typeof state !== 'undefined' && state.event && state.event.active && state.event.parsed; return e ? String(e.eventTag || e.name || '').trim().toLowerCase() : ''; } catch (x) { return ''; } };
  const eventBadge = tag => { const t = eventTag(); return t && String(tag).toLowerCase() === t ? ' <em class="rt-event" title="The event running now">Event</em>' : ''; };
  const WEEKDAYS = T.DAY_FULL;

  // ---------------------------------------------------------------- data
  async function load(force) {
    if (view.loading || (!force && view.pool && Date.now() - view.builtAt < 20000)) return;
    view.loading = true;
    try {
      view.pool = await Promise.race([window.juicyApp.timingPool(), new Promise((_, no) => setTimeout(() => no(new Error('The app did not answer within 20 seconds')), 20000))]); view.bots = T.prepare(view.pool, {now: Date.now()}); view.builtAt = Date.now(); view.error = '';
    } catch (e) { view.pool = view.pool || {tags: [], bots: []}; view.bots = view.bots || []; view.error = String((e && e.message) || e); console.error('release timing:', e); }
    view.loading = false; draw(); loadAims();
  }
  const edition = () => typeof IS_SHARE !== 'undefined' && !!IS_SHARE;

  // v1.3.7: what the "aim for" panel (Weekly Blueprint) says about each tag: its multiplier and one sentence on where it landed. Read from the same numbers the panel uses.
  const aimKey = s => String(s == null ? '' : s).replace(/^#/, '').replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
  async function loadAims() {
    try { if (window.juicyApp && window.juicyApp.successAims) { view.aims = await window.juicyApp.successAims(); draw(); } } catch (e) { view.aims = view.aims || null; }
  }
  const aimOf = tag => {
    const R = view.aims && view.aims.rates; if (!R) return null;
    const m = (view.usedOnly && view.acct === 'ntr' && !edition() ? R.ntr : R.main) || {}, hit = m[aimKey(tag)];
    return hit || (view.aims ? {lift: null, cat: 'none', why: `${tag} has too few bots to rate yet (it needs 3 of yours or 10 on JuicyChat), so it is in no list.`} : null);
  };

  const STOPS = [[0, [42, 33, 64]], [0.5, [122, 74, 166]], [1, [255, 95, 168]]];
  function heat(v) {
    if (v == null) return null; for (let i = 1; i < STOPS.length; i++) { if (v <= STOPS[i][0]) { const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i], t = (v - a) / (b - a || 1); return `rgb(${ca.map((x, k) => Math.round(x + (cb[k] - x) * t)).join(',')})`; } }
    return 'rgb(255,95,168)';
  }
  const niceMax = v => { if (v <= 0) return 4; const raw = v / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p, n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10; return n * p * 4; };
  const metricLabel = () => view.metric === 'total' ? 'Total likes + favorites' : 'Average score per bot';
  const tip = text => `data-tip="${esc(text)}"`;

  function heatmapHtml(all) {
    const hm = T.heatmap(all, view.metric), zone = T.zoneName(''), hrs = T.hoursOf(winArg());
    const head = `<div class="rt-hm-hours"><span></span>${Array.from({length: 24}, (_, h) => `<span>${TICKS.includes(h) ? String(h).padStart(2, '0') : ''}</span>`).join('')}</div>`;
    const rows = T.DAYS.map((d, di) => `<div class="rt-hm-row"><b>${d}</b>${hm.level[di].map((v, h) => { const c = all.cells[di][h], t = c.n ? `${T.DAYS[di]} ${T.hh(h)}: ${c.n} bot${c.n === 1 ? '' : 's'} released · average ${Math.round(c.score / c.n)} per bot · ${fmt(c.likes)} likes · ${fmt(c.favs)} favorites` : `${T.DAYS[di]} ${T.hh(h)}: no bots released`; return `<i class="rt-cell${v == null ? ' empty' : ''}${hrs && !hrs[h] ? ' out' : ''}" style="${v == null ? '' : 'background:' + heat(v)}" title="${esc(t)}"></i>`; }).join('')}</div>`).join('');
    const legend = `<div class="rt-legend"><small>Low</small><span>${Array.from({length: 10}, (_, i) => `<i style="background:${heat(i / 9)}"></i>`).join('')}</span><small>High</small></div>`;
    return `<div class="rt-card"><div class="rt-card-h"><div><h4>Activity heatmap</h4><p class="micro">Day × hour of release in ${esc(zone)} (your computer's time zone). Brighter = ${view.metric === 'total' ? 'more likes + favorites in total' : 'more likes + favorites per bot'}.${hrs ? ` Hours outside your release window (${esc(winLabel())}) are dimmed.` : ''}</p></div>${legend}</div>
      <div class="rt-hm"><div class="rt-hm-in">${head}${rows}</div></div></div>`;
  }

  function chartHtml(agg) {
    const vals = T.hourSeries(agg, view.metric), W = 900, H = 230, L = 46, B = 26, Tp = 10, R = 8, pw = W - L - R, ph = H - B - Tp, max = niceMax(Math.max(...vals, 0)), bw = pw / 24, hrs = T.hoursOf(winArg()), inV = vals.map((v, h) => !hrs || hrs[h] ? v : -1), best = inV.indexOf(Math.max(...inV));
    let g = ''; for (let i = 0; i <= 4; i++) { const v = max * i / 4, y = Tp + ph - ph * i / 4; g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="rt-grid${i ? ' dash' : ''}"/><text x="${L - 6}" y="${y + 4}" class="rt-ax" text-anchor="end">${short(v)}</text>`; }
    let bars = '';
    vals.forEach((v, h) => { const bh = max ? ph * v / max : 0, x = L + h * bw + bw * 0.11, c = agg.hours[h]; bars += `<rect x="${x.toFixed(1)}" y="${(Tp + ph - bh).toFixed(1)}" width="${(bw * 0.78).toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}" rx="3" class="rt-bar${h === best && v > 0 ? ' best' : ''}${hrs && !hrs[h] ? ' out' : ''}"><title>${esc(`${T.hh(h)}–${String(h).padStart(2, '0')}:59 · ${c.n} bot${c.n === 1 ? '' : 's'} · average ${c.n ? Math.round(c.score / c.n) : 0} per bot · ${fmt(c.likes)} likes · ${fmt(c.favs)} favorites`)}</title></rect>`; if (TICKS.includes(h)) bars += `<text x="${(L + h * bw + bw / 2).toFixed(1)}" y="${H - 8}" class="rt-ax" text-anchor="middle">${String(h).padStart(2, '0')}</text>`; });
    return `<svg class="rt-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(metricLabel())} by hour of release">${g}<line x1="${L}" x2="${W - R}" y1="${Tp + ph}" y2="${Tp + ph}" class="rt-grid"/>${bars}</svg>`;
  }

  // v1.3.1: the tags on your own bots (every account), compared without # or capital letters
  const tagKey = t => String(t == null ? '' : t).replace(/^#/, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const acctName = () => view.acct === 'ntr' ? 'NTR account' : 'Main account';
  // tag -> {n: how many of that account's bots carry it, titles: the first few of them}
  function usedTags() {
    const map = new Map(), st = typeof state !== 'undefined' ? state : null, a = ((st && st.accounts) || {})[edition() ? 'main' : view.acct];
    for (const b of ((a && a.bots) || [])) for (const k of new Set((Array.isArray(b.tags) ? b.tags : []).map(tagKey).filter(Boolean))) { let r = map.get(k); if (!r) map.set(k, r = {n: 0, titles: []}); r.n++; if (r.titles.length < 6) r.titles.push(String(b.title || b.name || b.id || 'a bot')); }
    return map;
  }
  // the rows of the tag table, filtered and sorted the way the buttons say (the same rows feed the table and the tag picker)
  function tagRows(bots) {
    const q = tagKey(view.find);
    let rows = T.tagTable(bots, {minBots: view.usedOnly || q ? 1 : 5});          // a search can find a tag with only a few bots (marked as thin data)
    if (view.usedOnly) { const used = usedTags(); rows = rows.filter(r => used.has(tagKey(r.tag))); }
    if (q) rows = rows.filter(r => tagKey(r.tag).includes(q));
    const dir = view.sortDir === 'asc' ? 1 : -1, k = view.sortKey;
    return rows.sort((a, b) => {
      const c = k === 'tag' ? String(a.tag).localeCompare(String(b.tag), undefined, {sensitivity: 'base'}) : k === 'n' ? a.n - b.n : a.events - b.events;
      return c * dir || b.events - a.events || b.n - a.n || String(a.tag).localeCompare(String(b.tag));
    });
  }
  const sortTh = (key, label, text) => {
    const on = view.sortKey === key, arrow = on ? (view.sortDir === 'asc' ? '▲' : '▼') : '↕';
    return `<th aria-sort="${on ? (view.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}" ${tip(text)}><button type="button" class="rt-sort${on ? ' on' : ''}" data-sort="${key}">${label} <i>${arrow}</i></button></th>`;
  };

  function overviewHtml(bots) {
    const groups = T.groupByTag(bots), table = tagRows(bots), shown = view.all || view.usedOnly || tagKey(view.find) ? table : table.slice(0, 12), all = T.aggregate(bots);
    if (!table.length) {
      if (tagKey(view.find)) return `<p class="micro">No tag matches "${esc(view.find.trim())}"${view.usedOnly ? ` among the tags on your ${edition() ? '' : esc(acctName()) + ' '}bots (untick "Only tags I've used" to search every tag)` : ' in the release data'}.</p>`;
      if (!view.usedOnly) return '<p class="micro">No tag has 5 or more bots in the data yet.</p>';
      return usedTags().size ? `<p class="micro">None of the tags on your ${edition() ? '' : esc(acctName()) + ' '}bots are in the release data yet.</p>` : `<p class="micro">The app has not read any tags from your ${edition() ? '' : esc(acctName()) + ' '}bots yet. Run a pull in Performance, then come back.</p>`;
    }
    const wa = winArg(), used = view.usedOnly ? usedTags() : null, prior = priorFor(all);
    const rows = shown.map(r => { const aim = aimOf(r.tag), agg = T.aggregate(groups.get(r.tag) || []), top = T.topSlots(agg, {count: 2, prior, win: wa}), y = used ? used.get(tagKey(r.tag)) : null; return `<tr${r.n < 5 ? ' class="rt-lowdata" title="Fewer than 5 bots with this tag: the times are only a hint"' : ''}><td><button type="button" class="rt-tagbtn" data-tag="${esc(r.tag)}"${aim ? ' ' + tip(aim.why) : ''}>${esc(r.tag)}</button> ${aim ? `<span class="rt-aimchip ${esc(aim.cat)}" ${tip(aim.why)}>${aim.lift == null ? '\u2013' : '\u00d7' + aim.lift.toFixed(1)}</span>` : ''}${eventBadge(r.tag)}</td><td>${fmt(r.n)}</td>${used ? `<td ${tip(y ? 'Your ' + acctName() + ' bots with this tag: ' + y.titles.join(', ') + (y.n > y.titles.length ? ' and ' + (y.n - y.titles.length) + ' more' : '') : '')}><b>${y ? fmt(y.n) : 0}</b></td>` : ''}<td><b>${short(r.events)}</b> <small>(${fmt(r.likes)}L / ${fmt(r.favs)}F)</small></td><td class="rt-slots">${top.length ? top.map(s => `<span${s.thin ? ' class="thin" title="Only ' + s.n + ' bot' + (s.n === 1 ? '' : 's') + ' released in this hour: thin data"' : ''}>${esc(T.slotLabel(s))}</span>`).join('') : '–'}</td></tr>`; }).join('');
    return `<div class="rt-tablewrap"><table class="rt-table"><thead><tr>${sortTh('tag', 'Tag', 'Sort by tag name (A to Z). Click again to reverse. The \u00d7 number beside a tag is how well its bots score compared with the average bot (\u00d71.0 = average, \u00d72.0 = twice as well). Hover it to see why.')}${sortTh('n', 'Bots', 'How many bots with this tag are in the data (released more than 2 days ago). Click to sort; click again to reverse.')}${view.usedOnly ? `<th ${tip('How many of the bots on your ' + (edition() ? '' : acctName() + ' ') + 'account carry this tag (hover a number to see which). Bots and Events count every bot on JuicyChat with the tag, not only yours.')}>Yours</th>` : ''}${sortTh('events', 'Events', 'Likes + favorites on those bots. L = likes, F = favorites. Click to sort; click again to reverse.')}<th ${tip('The two release hours where bots with this tag did best, adjusted so an hour with only one or two bots cannot win on luck.')}>Top slots</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="micro rt-count">${tagKey(view.find) ? `${table.length} tag${table.length === 1 ? '' : 's'} matching "${esc(view.find.trim())}"${view.usedOnly ? ' on your ' + (edition() ? '' : acctName() + ' ') + 'bots' : ''}` : view.usedOnly ? `${table.length} tag${table.length === 1 ? '' : 's'} from your ${edition() ? '' : acctName() + ' '}bots` : `Showing ${shown.length} of ${table.length} tags`} · sorted by ${view.sortKey === 'tag' ? 'tag name' : view.sortKey === 'n' ? 'number of bots' : 'events'}, ${view.sortDir === 'asc' ? (view.sortKey === 'tag' ? 'A to Z' : 'lowest first') : (view.sortKey === 'tag' ? 'Z to A' : 'highest first')}</p>
      ${table.length > 12 && !view.usedOnly && !tagKey(view.find) ? `<button type="button" class="ghost sm rt-more" id="rt-more">${view.all ? 'Show fewer tags' : `Show all ${table.length} tags`}</button>` : ''}`;
  }

  function detailHtml(bots, tag) {
    const all = T.aggregate(bots), agg = T.aggregate(bots, tag), wa = winArg(), top = T.topSlots(agg, {count: 3, prior: priorFor(all), win: wa});
    if (!agg.n) return '<p class="micro">No bots with this tag in the data.</p>';
    if (wa && !top.length) return `<p class="micro">No bot with this tag was released between ${esc(winLabel())}, so there is nothing to judge in your release window. Widen the window above, or untick it.</p>`;
    return `<div class="rt-sum"><b>${fmt(agg.n)}</b> bots <span>♡ ${short(agg.likes)} likes</span> <span>☆ ${short(agg.favs)} favs</span></div>
      <div class="rt-top">${top.map((s, i) => `<div class="rt-slot"><span class="rt-rank">${i + 1}</span><div><b>${esc(T.slotLabel(s))}</b><small>${fmt(s.n)} bot${s.n === 1 ? '' : 's'} · average ${Math.round(s.avg)} per bot · ${fmt(s.likes)} likes · ${fmt(s.favs)} favs${s.thin ? ' · <em>thin data</em>' : ''}</small></div><strong ${tip('Expected score per bot if you release in this hour (likes + 1.5 × favorites), adjusted so an hour with only one or two bots cannot win on luck.')}>${Math.round(s.expected)}</strong></div>`).join('')}</div>
      <div class="rt-chart-h"><span>${esc(metricLabel())} by release hour</span></div>${chartHtml(agg)}`;
  }

  // v1.3.1: the release window sits above all the cards, so it stays visible when they are folded and covers the heatmap, the tag table and the series suggestions
  function winBarHtml() {
    const hrOpt = (from, sel) => Array.from({length: 24}, (_, i) => from ? i : i + 1).map(h => `<option value="${h}"${h === sel ? ' selected' : ''}>${esc(T.fmtHour(h))}</option>`).join('');
    return `<div class="rt-winbar${view.win.on ? ' on' : ''}"><b>Release window</b><div class="rt-win"><label class="rt-used"><input type="checkbox" id="rt-win-on"${view.win.on ? ' checked' : ''}> Only release between</label><select id="rt-win-from" class="rt-select sm" aria-label="From hour">${hrOpt(true, view.win.from)}</select><span>and</span><select id="rt-win-to" class="rt-select sm" aria-label="To hour">${hrOpt(false, view.win.to)}</select><small ${tip('Hours are in your computer\'s time zone. A window that runs past midnight (for example 8 PM to 6 AM) works too.')}>?</small>${view.win.on && (view.win.from % 24) === (view.win.to % 24) ? '<em class="rt-win-warn">From and to are the same hour, so the whole day is used.</em>' : ''}</div><span class="micro">The hours you are willing to release in. When ticked, everything below (the heatmap and Best times by tag) only looks at bots released inside them.</span></div>`;
  }

  function tagCardHtml(bots) {
    const table = tagRows(bots), opts = `<option value="">${view.usedOnly ? 'All my tags (overview)' : 'All tags (overview)'}</option>` + table.slice(0, 200).map(r => `<option value="${esc(r.tag)}"${r.tag === view.tag ? ' selected' : ''}>${esc(r.tag)} (${fmt(r.n)})</option>`).join('');
    return `<div class="rt-card"><div class="rt-card-h"><div><h4>Best times by tag</h4><p class="micro">When bots with a tag were released and how many likes and favorites they got. Click a tag, or pick one here. Click Tag, Bots or Events to sort; tick the box to see only the tags on your own bots${edition() ? "" : " (Main and NTR accounts are shown separately)"}.</p></div><select id="rt-tag" class="rt-select" aria-label="Tag">${opts}</select></div>
      <div class="rt-ctl"><input type="search" id="rt-find" class="rt-find" placeholder="Find a tag…" value="${esc(view.find)}" autocomplete="off" spellcheck="false" aria-label="Find a tag"><label class="rt-used"><input type="checkbox" id="rt-used"${view.usedOnly ? ' checked' : ''}> Only tags I've used</label>${view.usedOnly && !edition() ? `<div class="rt-seg" role="group" aria-label="Account">${[['main', 'Main'], ['ntr', 'NTR']].map(([k, l]) => `<button type="button" data-rt-acct="${k}" class="${view.acct === k ? 'on' : ''}" ${tip('Show only the tags on the bots of your ' + (k === 'ntr' ? 'NTR' : 'Main') + ' account')}>${l}</button>`).join('')}</div>` : ''}</div>
      ${view.tag && table.some(r => r.tag === view.tag) ? detailHtml(bots, view.tag) : overviewHtml(bots)}</div>`;
  }

  // ---------------------------------------------------------------- suggestions
  const CONF = {high: 'High', medium: 'Medium', low: 'Low', none: 'Not enough data'};
  function draw() {
    try { drawPanel(); } catch (e) {
      console.error('release timing:', e); const host = $$('timing-body');
      if (host) host.innerHTML = `<div class="rt-empty"><b>The release panel could not be drawn.</b><p class="micro">${esc(String((e && e.message) || e))}. Press the refresh button above to try again.</p></div>`;
    }
  }
  function drawPanel() {
    const host = $$('timing-body'); if (!host) return;
    const sub = $$('timing-sub'), bots = view.pool ? (view.bots || []) : localList();
    if (!view.pool && bots.length < 50) { host.innerHTML = '<p class="micro">Loading…</p>'; return; }   // below 50 bots wait for the full list; from 50 up the bots already in this window are shown at once
    const upd = view.pool && view.pool.updatedAt ? new Date(view.pool.updatedAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : '';
    if (sub) sub.textContent = bots.length ? `${fmt(bots.length)} bots seen on JuicyChat${upd ? ` (last added ${upd})` : ''}. Times are in your computer's time zone (${T.zoneName('')}). Score = likes + 1.5 × favorites.` : 'Release times and likes of the bots the app has seen.';
    const mt = $$('timing-metric'); if (mt) mt.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === view.metric));
    if (view.error && !bots.length) { host.innerHTML = `<div class="rt-empty"><b>The release data could not be read.</b><p class="micro">${esc(view.error)}. Press the refresh button above to try again.</p></div>`; return; }
    if (bots.length < 50) {
      host.innerHTML = `<div class="rt-empty"><b>Not enough bots yet.</b><p class="micro">${bots.length ? `${bots.length} bots so far; this needs about 50 more to show anything reliable.` : 'Nothing collected yet.'} Every Performance pull reads up to 3,000 bots from JuicyChat's feeds, and every Recent + Trending collection adds more. Run one of them and this fills in. Bots younger than 2 days are left out because they have not had time to collect likes.</p></div>`;
      return;
    }
    const all = T.aggregate(bots);
    // each card is drawn on its own: if one cannot be drawn, the others still show and the reason is written in its place
    const part = (name, fn) => { try { return fn(); } catch (e) { console.error('release timing (' + name + '):', e); return `<div class="rt-card"><div class="rt-card-h"><div><h4>${esc(name)}</h4></div></div><p class="micro">This part could not be drawn (${esc(String((e && e.message) || e))}). Press the refresh button above to try again.</p></div>`; } };
    host.innerHTML = winBarHtml() + part('Activity heatmap', () => heatmapHtml(all)) + part('Best times by tag', () => tagCardHtml(bots));
    const sel = $$('rt-tag'); if (sel) sel.onchange = () => { view.tag = sel.value; draw(); };
    host.querySelectorAll('.rt-tagbtn').forEach(b => b.onclick = () => { view.tag = b.dataset.tag; draw(); });
    const more = $$('rt-more'); if (more) more.onclick = () => { view.all = !view.all; draw(); };
    host.querySelectorAll('.rt-sort').forEach(b => b.onclick = () => { const k = b.dataset.sort; if (view.sortKey === k) view.sortDir = view.sortDir === 'asc' ? 'desc' : 'asc'; else { view.sortKey = k; view.sortDir = k === 'tag' ? 'asc' : 'desc'; } saveTagPrefs(); draw(); });
    host.querySelectorAll('[data-rt-acct]').forEach(b => b.onclick = () => { view.acct = b.dataset.rtAcct === 'ntr' ? 'ntr' : 'main'; view.tag = ''; saveTagPrefs(); draw(); });
    const fi = $$('rt-find');
    if (fi) {
      fi.oninput = () => { const pos = fi.selectionStart; view.find = fi.value; draw(); const n = $$('rt-find'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* no caret */ } } };
      fi.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const rs = tagRows(bots); if (rs.length === 1) { view.tag = rs[0].tag; draw(); } } };
    }
    const wOn = $$('rt-win-on'), wFrom = $$('rt-win-from'), wTo = $$('rt-win-to');
    if (wOn) wOn.onchange = () => { view.win.on = wOn.checked; saveWin(); draw(); };
    if (wFrom) wFrom.onchange = () => { view.win.from = Number(wFrom.value); view.win.on = true; saveWin(); draw(); };
    if (wTo) wTo.onchange = () => { view.win.to = Number(wTo.value); view.win.on = true; saveWin(); draw(); };
    const used = $$('rt-used'); if (used) used.onchange = () => { view.usedOnly = used.checked; saveTagPrefs(); draw(); };
    if (window.Collapse) window.Collapse.apply(host, 'an');
  }
  // the two parts of the Analysis tab: the research set (sign in, collect, engines) and When to release
  function showPart(which, remember) {
    const r = $$('an-research'), l = $$('an-release'); if (!r || !l) return;
    r.hidden = which !== 'research'; l.hidden = which !== 'release';
    document.querySelectorAll('.an-tabs button').forEach(b => { const on = b.dataset.an === which; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    if (remember) { try { localStorage.setItem('jbs.analysisTab', which); } catch (e) { /* not saved */ } }
    if (which === 'release') { draw(); load(false); }
  }
  function init() {
    const tabs = document.querySelector('.an-tabs');
    // v1.3.1: When to release is the first tab and opens by default (an old remembered choice is ignored)
    if (tabs && !tabs.dataset.bound) { tabs.dataset.bound = '1'; let w = 'release'; try { w = localStorage.getItem('jbs.analysisTab') === 'research' ? 'research' : 'release'; } catch (e) { /* default */ } showPart(w, false); }
    const mt = $$('timing-metric'); if (mt && !mt.dataset.bound) { mt.dataset.bound = '1'; mt.querySelectorAll('button').forEach(b => b.onclick = () => { view.metric = b.dataset.m; draw(); }); }
    const rf = $$('timing-refresh'); if (rf && !rf.dataset.bound) { rf.dataset.bound = '1'; rf.onclick = () => load(true); }
  }

  // ---------------------------------------------------------------- the small heatmap on the Dashboard
  // The Dashboard cards do not wait for the main program: until its list arrives they are drawn from the bots this window already holds (the collected and pulled ones).
  const msOf = v => { if (v == null || v === '') return 0; if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v))) { const n = Number(v); return n > 1e12 ? n : n > 1e9 ? n * 1000 : 0; } const d = Date.parse(String(v)); return Number.isFinite(d) ? d : 0; };
  let localKey = '', localBots = [];
  function localList() {
    const st = typeof state !== 'undefined' ? state : null; if (!st) return [];
    const ds = st.datasets || {}, accs = Object.values(st.accounts || {}).map(a => (a && a.bots) || []);
    const key = [(ds.recent || []).length, (ds.trending || []).length, ds.lastCollectedAt || '', ...accs.map(a => a.length)].join('|');
    if (key === localKey) return localBots;
    const tags = [], tix = new Map(), seen = new Map();
    for (const r of [].concat(ds.recent || [], ds.trending || [], ...accs)) {
      if (!r || typeof r !== 'object') continue;
      const h = r.headline || r, ms = msOf(r.published) || msOf(r.created); if (!ms) continue;
      const id = String(r.id || (String(r.url || '').match(/\/chat\/(\d{5,})/) || [])[1] || r.url || r.name || ms), old = seen.get(id);
      const ix = [...new Set((Array.isArray(r.tags) ? r.tags : []).map(x => String(x == null ? '' : x).replace(/^#/, '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean).map(x => { let i = tix.get(x); if (i === undefined) { i = tags.length; tags.push(x); tix.set(x, i); } return i; }))];
      const n = x => { x = Number(x); return Number.isFinite(x) && x >= 0 ? Math.round(x) : 0; };
      seen.set(id, [ms, Math.max(n(h.likes), old ? old[1] : 0), Math.max(n(h.favorites), old ? old[2] : 0), Math.max(n(h.chats), old ? old[3] : 0), ix.length ? ix : (old ? old[4] : [])]);
    }
    localKey = key; localBots = T.prepare({tags, bots: [...seen.values()]}, {now: Date.now()}); return localBots;
  }
  function mini(host) {
    if (!host) return;
    const paint = () => {
      try { paintCards(); } catch (e) {
        console.error('dashboard cards:', e);
        for (const id of ['dash-heat-body']) { const x = $$(id); if (x) x.innerHTML = `<p class="micro dash-empty">Could not be drawn (${esc(String((e && e.message) || e))}).</p>`; }
      }
    };
    const paintCards = () => {
      const h = $$('dash-heat-body'); if (!h) return;
      const bots = view.pool ? (view.bots || []) : localList();
      if (bots.length < 50) { h.innerHTML = `<p class="micro dash-empty">${bots.length ? 'Not enough bots yet.' : 'Nothing collected yet.'} Every Performance pull and every Recent + Trending collection adds more.</p>`; return; }
      const all = T.aggregate(bots), hm = T.heatmap(all, view.metric), top = T.topSlots(all, {count: 1, prior: priorFor(all), win: winArg()})[0];
      const rows = T.DAYS.map((d, di) => `<div class="dh-row"><b>${d.slice(0, 1)}</b>${hm.level[di].map((v, hr) => { const c = all.cells[di][hr]; return `<i style="background:${v == null ? 'rgba(255,255,255,.05)' : heat(v)}" data-tip="${esc(c.n ? `${T.DAYS[di]} ${T.hh(hr)}: ${c.n} bot${c.n === 1 ? '' : 's'} released, average ${Math.round(c.score / c.n)} per bot` : `${T.DAYS[di]} ${T.hh(hr)}: no bots released`)}"></i>`; }).join('')}</div>`).join('');
      h.innerHTML = `<div class="dh-grid">${rows}<div class="dh-ticks"><b></b>${Array.from({length: 24}, (_, hr) => `<span>${hr % 6 === 0 ? String(hr).padStart(2, '0') : ''}</span>`).join('')}</div></div>
        <p class="micro dh-cap" data-tip="The slot where bots released in the past did best, with a pull toward the overall average so one lucky bot cannot win. Click When to release for the full picture.">${top ? `Best slot: <b>${esc(T.slotLabel(top))}</b> · ` : ''}${esc(T.zoneName(''))} time · <button type="button" class="linkish" id="dash-heat-open">When to release</button></p>`;
    };
    paint();
    load(false).then(paint, paint);
  }
  // clicks are caught on the document, so they keep working however often the screen is redrawn
  document.addEventListener('click', e => {
    const tab = e.target.closest && e.target.closest('.an-tabs button[data-an]');
    if (tab) { e.preventDefault(); showPart(tab.dataset.an, true); return; }
    if (e.target.closest && e.target.closest('#dash-heat-open')) { e.preventDefault(); if (typeof switchView === 'function') switchView('analysis'); showPart('release', true); }
  }, true);
  window.TimingView = {mini, show: w => showPart(w, true), render() { init(); draw(); load(false); }, _view: view, _draw: draw, _load: load};
  // v1.3.1: this file loads after the main program has already drawn the Dashboard (the app's data arrives faster than the last scripts load), so the Dashboard card was left on "Loading…" until something redrew the page. Draw it now.
  try { const h = $$('dash-heat-body'); if (h && typeof state !== 'undefined' && state) mini(h); } catch (e) { console.error('dashboard heatmap:', e); }
})();

