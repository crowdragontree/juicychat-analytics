'use strict';
// JuicyChat Analytics, main-process part. Taken from Juicy Blueprint Studio 1.6.0's analytics (JuicyChat Analysis, Your Performance,
// Engine Library, the daily pulls, Blocked tags and the magic-link sign-in), with nothing from bot building.
// Two apps run this same code:
//   - the JuicyChat Analytics Tool itself (main.js), with the Analytics Tool's data folder;
//   - the JuicyChat Creator Tool's Analytics tab, which loads this file from the installed Analytics Tool, with its own data folder.
// Each keeps its own sign-in and its own data. A lock file in the Analytics Tool's shared folder makes sure the two never pull at once.
const fs = require('fs');
const path = require('path');
const {JsonStore} = require('../lib/store');
const {PythonCollector} = require('../lib/pythonCollector');
const {analyzeEnginesLocal} = require('../lib/engineAnalyzer');
const {analyzeAsync} = require('../lib/analysisWorker');
const {HistoryStore} = require('../lib/history');
const {TimingStore} = require('../lib/timing');
const SuccessAims = require('../lib/successAims');
const TagBlock = require('../lib/tagBlock');
const {ACCOUNTS, ensureAccounts, mergePull, publicRows} = require('../lib/myBots');
const PullLock = require('./pullLock');
const Runtime = require('./runtime');

const APP_ROOT = path.join(__dirname, '..');
const VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')).version; } catch { return ''; } })();
// the events the window listens to (channel names, as in Blueprint Studio)
const EVENTS = ['collector:progress', 'juicy:authStatus', 'analysis:progress', 'auto:run', 'bg:step', 'auth:needLogin', 'runtime:progress'];

function create({userData, sharedDir, appName, host = 'analytics', send = () => {}, scanBounds = () => null, copyText = () => true, applyLoginItem = null, scheduler = true}) {
  fs.mkdirSync(userData, {recursive: true});
  const store = new JsonStore(userData);
  const history = new HistoryStore(userData);
  let timing = null;
  try { timing = new TimingStore(userData); const st0 = store.state; timing.ingestRecords([...(st0.datasets.recent || []), ...(st0.datasets.trending || [])].concat(...Object.values(st0.accounts || {}).map(a => a.bots || []))); } catch (e) { console.error('release timing:', e); timing = null; }
  try { history.seed(store.state.datasets); store.update(s => { s.historyStats = history.stats(); }); } catch (e) { console.error('history seed failed', e); }
  store.update(s => { ensureAccounts(s); });

  const runtime = Runtime.create({appRoot: APP_ROOT, sharedDir});
  let waitingFor = null;
  const lock = PullLock.create({dir: sharedDir, appName, onWait: info => {
    waitingFor = info;
    const message = info ? `Waiting for the ${info.app} to finish ${info.what}. This starts by itself as soon as it is done.` : 'The other app is done. Starting now...';
    send('collector:progress', {stage: 'log', status: info ? 'waiting' : 'collecting', message});
    bgStep(message, {indeterminate: true});
  }});
  let cancelWait = false;
  const locked = (what, fn) => { cancelWait = false; return lock.run(what, fn, {cancelled: () => cancelWait}); };

  const collector = new PythonCollector(APP_ROOT, path.join(userData, 'juicy-browser-profile'), p => send('collector:progress', p), a => send('juicy:authStatus', a), {runtimeDir: runtime.dir});
  collector.readyFlag = runtime.readyFlag();
  collector.windowBounds = scanBounds;
  collector.blockedTags = () => (store.state.settings.blockedTags || []);
  const needRuntime = () => { if (!runtime.ready()) throw new Error('The JuicyChat scanner is not installed yet. Go to Settings > JuicyChat sign-in and press Install scanner (one time only).'); };

  // Everything that learns reads the full scrape history, weighted toward recent scrapes, instead of only the newest 200 bots.
  function learningData(st) {
    const blocked = (st.settings && st.settings.blockedTags) || [], keep = rows => TagBlock.filterRows(rows, blocked).rows;
    const h = history.analysisRows();
    if (!h.recent.length && !h.trending.length) return {recent: keep(st.datasets.recent || []), trending: keep(st.datasets.trending || [])};
    return {...h, recent: keep(h.recent), trending: keep(h.trending)};      // bots with a blocked tag never reach the analysis
  }
  const runAnalysis = st => { const d = learningData(st); return analyzeEnginesLocal({recent: d.recent, trending: d.trending, performance: st.performance || [], historyStats: history.stats()}); };
  const runAnalysisAsync = st => { const d = learningData(st); return analyzeAsync({recent: d.recent, trending: d.trending, performance: st.performance || [], historyStats: history.stats()}); };
  const tick = () => new Promise(r => setImmediate(r));
  let bgRun = null;
  function bgStep(message, extra = {}) { if (bgRun) send('bg:step', {kind: bgRun.kind, title: bgRun.title, message, ...extra}); }
  const askLogin = message => { try { send('auth:needLogin', {account: 'tool', label: 'Your JuicyChat account', message}); } catch (_) {} };

  function cleanSettings(input) {
    const s = {...store.state.settings};
    for (const k of ['gender', 'juicyHomeUrl']) if (input[k] !== undefined) s[k] = String(input[k]).trim();
    for (const k of ['targetRecent', 'targetTrending']) if (input[k] !== undefined) s[k] = Math.max(1, Math.min(500, Number(input[k]) || 100));
    for (const k of ['autoCollect', 'autoPerformance', 'openAtLogin']) if (input[k] !== undefined) s[k] = !!input[k];
    if (Array.isArray(input.blockedTags)) s.blockedTags = TagBlock.clean(input.blockedTags);
    if (input.ratingRules !== undefined && typeof input.ratingRules === 'object') { const r = {}; const x = input.ratingRules && input.ratingRules.main; if (x && typeof x.field === 'string' && x.field.length < 60) r.main = {field: x.field, value: String(x.value).slice(0, 40)}; s.ratingRules = r; }
    const hm = v => { const m = String(v || '').match(/^(\d{1,2}):(\d{2})$/); if (!m) return null; const h = Math.min(23, Math.max(0, +m[1])), min = Math.min(59, Math.max(0, +m[2])); return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`; };
    if (input.collectTime !== undefined) s.collectTime = hm(input.collectTime) || s.collectTime || '20:00';
    if (input.perfTime !== undefined) s.perfTime = hm(input.perfTime) || s.perfTime || '20:00';
    if (input.morningTime !== undefined) s.morningTime = hm(input.morningTime) || s.morningTime || '08:00';
    if (input.autoMorning !== undefined) s.autoMorning = !!input.autoMorning;
    if (input.pullTimeZone !== undefined) s.pullTimeZone = input.pullTimeZone === 'computer' ? 'computer' : 'est';
    return s;
  }

  // ---- JuicyChat Analysis: collect Recent + Trending, then measure the success engines
  async function collectRaw(kind, quiet = false) {
    needRuntime();
    const upd = fn => quiet ? (store.updateQuiet(fn), null) : store.update(fn);
    const s = store.state.settings, col = collector;
    const kinds = kind === 'both' ? ['Recent', 'Trending'] : [kind];
    const overallTarget = kinds.reduce((sum, k) => sum + (k === 'Recent' ? s.targetRecent : s.targetTrending), 0);
    let completedBefore = 0, cancelled = false;
    const discarded = new Map();      // bots left out because of a blocked tag, across Recent and Trending in this run
    col.beginCollectionBatch();
    const scrapeAt = new Date().toISOString(), scrapeId = `scrape-${Date.parse(scrapeAt)}`;
    send('collector:progress', {stage: 'batch-start', message: `Starting ${kinds.join(' + ')} collection...`, current: 0, target: overallTarget, overallCurrent: 0, overallTarget, batchIndex: 1, batchCount: kinds.length, status: 'starting'});
    try {
      for (let index = 0; index < kinds.length; index++) {
        if (col.isCancelRequested()) { cancelled = true; break; }
        const k = kinds[index];
        const target = k === 'Recent' ? s.targetRecent : s.targetTrending;
        let result;
        try { result = await col.collect(k, target, s.juicyHomeUrl, s.gender, {batchIndex: index + 1, batchCount: kinds.length, completedBefore, overallTarget}); }
        catch (e) { if (/logged out|isn.t signed in|not signed in|log back in/i.test(String(e.message || e))) askLogin(String(e.message || e)); throw e; }
        const gate = TagBlock.filterRows(result.rows || [], s.blockedTags, true);      // the scan already skips these; this keeps any that slipped through out of the data
        const rows = gate.rows;
        for (const x of [...(result.skipped || []), ...gate.items.map(r => TagBlock.discardRecord(r, k, s.blockedTags))]) { const key = x.url || x.id || x.name; const had = discarded.get(key); if (had) { if (!had.sections.includes(x.section)) had.sections.push(x.section); } else discarded.set(key, {id: x.id || '', name: x.name || 'A bot', url: x.url || '', sections: [x.section || k], tags: x.tags || [], blocked: x.blocked || []}); }
        if (gate.dropped) send('collector:progress', {stage: 'log', status: 'collecting', message: `${k}: left out ${gate.dropped} bots with a blocked tag (${Object.entries(gate.byTag).map(([t, n]) => `${t} ${n}`).join(', ')}).`});
        if (rows.length) {
          completedBefore += rows.length;
          bgStep(`Saving ${rows.length} ${k} bots...`, {current: completedBefore, target: overallTarget});
          await tick();
          try { history.ingest(rows, k, scrapeId, scrapeAt); } catch (e) { console.error('history ingest failed', e); }
          try { if (timing) timing.ingestRecords(rows); } catch (e) { console.error('release timing ingest failed', e); }
          upd(state => { state.datasets[k.toLowerCase()] = rows; state.datasets.lastCollectedAt = new Date().toISOString(); state.historyStats = history.stats(); });
          await tick();
          send('collector:progress', {stage: 'source-saved', message: `Saved ${rows.length} ${k} bots locally.`, sortName: k, source: k, current: rows.length, target, overallCurrent: completedBefore, overallTarget, batchIndex: index + 1, batchCount: kinds.length, status: 'saved'});
        }
        if (result.cancelled || col.isCancelRequested()) { cancelled = true; break; }
      }
      if (cancelled) send('collector:progress', {stage: 'batch-cancelled', message: `Collection cancelled. ${completedBefore} bot records from this run were saved locally.`, current: completedBefore, target: overallTarget, overallCurrent: completedBefore, overallTarget, batchIndex: 1, batchCount: kinds.length, status: 'cancelled'});
      else send('collector:progress', {stage: 'batch-done', message: `Collection finished. ${completedBefore}/${overallTarget} bot records saved locally.`, current: completedBefore, target: overallTarget, overallCurrent: completedBefore, overallTarget, batchIndex: kinds.length, batchCount: kinds.length, status: 'done'});
      try { history.endScrape(scrapeId); } catch (e) { console.error(e); }
      upd(st => { st.discardedBots = {at: new Date().toISOString(), blockedTags: TagBlock.clean(s.blockedTags), items: [...discarded.values()]}; });
      if (discarded.size) send('collector:progress', {stage: 'log', status: 'collecting', message: `${discarded.size} bots were discarded because of blocked tags. See the list under the progress bar.`});
      const collected = store.state;
      const sampleSize = (collected.datasets.recent?.length || 0) + (collected.datasets.trending?.length || 0);
      if (sampleSize >= 5) {
        send('analysis:progress', {message: `Analyzing ${sampleSize} newly collected bots together with your saved history to find the success engines...`});
        bgStep(`Analyzing ${sampleSize} bots to find the success engines...`, {indeterminate: true});
        await new Promise(r => setTimeout(r, 400));
        const analysis = await runAnalysisAsync(collected);      // on its own thread: the window stays responsive
        upd(st => { st.engineAnalysis = analysis; st.historyStats = history.stats(); });
        const top = (analysis.engines || [])[0];
        send('analysis:progress', {message: `Engine summary updated from the collected bots: ${(analysis.engines || []).length} success engine${(analysis.engines || []).length === 1 ? '' : 's'} found${top ? `, strongest: ${top.name}${top.strength != null ? ` (strength ${top.strength}/100)` : ''}` : ''}.`, done: true});
      } else if (!cancelled) {
        send('analysis:progress', {message: `The success-engine analysis was not run: only ${sampleSize} bots are saved (it needs at least 5).`, done: true, skipped: true});
      }
      return quiet ? null : store.get();
    } finally { col.endCollectionBatch(); }
  }

  // ---- Your Performance: read your own bots from the signed-in account (one account)
  const mergeEvents = (a, evs) => { a.events = a.events || []; const seen = new Set(a.events.map(e => e.id)); let added = 0;
    for (const e of evs) { if (!e.id || seen.has(e.id)) continue; seen.add(e.id); a.events.push(e); added++; }
    a.events.sort((x, y) => (Number(y.at) || Date.parse(y.at) || 0) - (Number(x.at) || Date.parse(x.at) || 0)); if (a.events.length > 8000) a.events.length = 8000; return added; };
  async function pullRaw(quiet = false) {
    needRuntime();
    const upd = fn => quiet ? (store.updateQuiet(fn), null) : store.update(fn);
    const st = quiet ? store.state : store.get();
    if (!collector.hasLoginMarker()) throw new Error('Sign in first (Settings > JuicyChat sign-in: paste your magic link there). Performance reads your bots from that account.');
    const k = 'main', done = [], failed = [];
    send('collector:progress', {stage: 'batch-start', status: 'starting', pull: true, account: ACCOUNTS[k], accountIndex: 1, accountCount: 1, sortName: ACCOUNTS[k], message: `Reading the ${ACCOUNTS[k]} (signed in) in the background...`, current: 0, target: 0});
    try {
      bgStep(`Reading your bots on the ${ACCOUNTS[k]}...`, {current: 0, account: ACCOUNTS[k], target: 1, indeterminate: true});
      const r = await collector.collectMyBots('', 'own');
      if (!r.cancelled) {
        // only public bots: private, unlisted, unreleased and under-review bots are left out of Performance and release timing
        const live = publicRows(r.rows, st.accounts?.[k]?.publicCodes), held = live.held.length; r.rows = live.rows;
        if (!r.rows.length) throw new Error('the account has no bots listed');
        let n = 0, events = 0;
        bgStep(`Saving ${r.rows.length} bots from the ${ACCOUNTS[k]}...`, {current: 0, account: ACCOUNTS[k], target: 1, indeterminate: true});
        await tick();
        upd(s => { const a = ensureAccounts(s)[k];
          n = mergePull(a, r.rows, r.profileUrl || a.url);
          const d = r.diag || {};
          if (Array.isArray(d.events) && d.events.length) events = mergeEvents(a, d.events);
          if (d.me) { a.signedIn = {...(a.signedIn || {}), ok: true, userId: d.me.userId, userName: d.me.userName, checkedAt: new Date().toISOString()}; delete a.loggedOut; }
          if (d.feedsScanned && Object.keys(d.feedsScanned).length) a.feedScan = {at: new Date().toISOString(), scanned: d.feedsScanned, totals: d.feedTotals || {}};
          if (Array.isArray(d.discoverRows) && d.discoverRows.length) a.discoverScan = {at: new Date().toISOString(), rows: d.discoverRows.slice(0, 200), depth: d.discoverDepth || 100, shown: d.discoverShown || 10};
          if (live.learned) a.publicCodes = live.codes;
          a.notPublic = live.held.map(x => ({title: String(x.title || ''), url: x.url || ''}));
          a.lastPull = {notPublic: held, publicSure: live.sure, at: new Date().toISOString(), url: `signed in as ${d.me?.userName || 'this account'}`, bots: n, withNumbers: (a.bots || []).filter(b => b.chats || b.likes || b.favorites).length, modes: [...new Set((a.bots || []).map(b => b.statMode || 'none'))], cardsOnPage: d.cardsOnPage ?? n, jsonResponses: d.jsonResponses ?? null, sample: d.sample || [], warnings: d.warnings || [], ratingSource: d.ratingSource || '', ratingRule: d.ratingRule || null, loungeUrl: d.loungeUrl || '', ratingsRead: d.ratingsRead ?? null, ratingsTotal: d.ratingsTotal ?? null}; });
        try { if (timing) { timing.ingestRecords(r.rows); if (r.diag && Array.isArray(r.diag.market)) timing.ingestMarket(r.diag.market); } } catch (e) { console.error('release timing ingest failed', e); }
        done.push(`${ACCOUNTS[k]}: ${n} public bots${held ? ` (${held} private, unlisted, unreleased or under review left out)` : ''}${live.sure ? '' : ' (JuicyChat did not say which bots are public this time: only unreleased ones could be left out)'}${events ? `, ${events} new likes/stars/comments` : ''}`);
      }
    } catch (e) { const m = String(e.message || e), out = /isn.t signed in|not signed in|signed out|logged out|log back in|magic link/i.test(m);
      if (out) askLogin(m);
      failed.push(out ? 'You need to log back in to scrape. Paste your magic link in Settings > JuicyChat sign-in to log back in, then pull again.' : m); }
    send('collector:progress', {stage: failed.length ? 'partial' : 'batch-done', status: failed.length ? 'partial' : 'done', message: [...done, ...failed].join(' · ')});
    if (store.state.engineAnalysis) {
      bgStep('Refreshing the success-engine analysis...', {indeterminate: true});
      try { const a = await runAnalysisAsync(store.state); upd(s => { if (s.engineAnalysis) s.engineAnalysis = a; }); } catch (e) { console.error('analysis refresh:', e.message); }
    }
    if (!done.length && failed.length) throw new Error(failed.join(' · '));
    return quiet ? null : store.get();
  }
  let scrapes = 0;
  const collectNow = async (kind, quiet = false) => { scrapes++; try { return await locked(kind === 'both' ? 'collecting Recent + Trending' : `collecting ${kind}`, () => collectRaw(kind, quiet)); } finally { scrapes--; } };
  const pullMyBotsNow = async (quiet = false) => { scrapes++; try { return await locked('pulling its bot stats', () => pullRaw(quiet)); } finally { scrapes--; } };

  // ---- the daily pulls: separate times, computer timezone or fixed EST (UTC-05:00)
  const RETRY_MS = 45 * 60000;
  let autoBusy = false, timers = [];
  const parseHm = v => { const m = String(v || '20:00').match(/^(\d{1,2}):(\d{2})$/); const h = m ? Math.min(23, Math.max(0, +m[1])) : 20, min = m ? Math.min(59, Math.max(0, +m[2])) : 0; return {h, min}; };
  const pullTz = () => store.state.settings.pullTimeZone === 'computer' ? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') : 'Etc/GMT+5';
  const pullClock = (d = new Date()) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: pullTz(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(d).map(x => [x.type, x.value]));
    return {day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute)};
  };
  const reached = (now, t) => now.hour > t.h || (now.hour === t.h && now.minute >= t.min);
  const timeFor = (st, kind) => parseHm(st.settings[kind === 'collect' ? 'collectTime' : kind === 'am' ? 'morningTime' : 'perfTime'] || (kind === 'am' ? '08:00' : '20:00'));
  const logRun = (s, kind, ok, message) => { s.schedule = s.schedule || {log: []}; s.schedule.log = [{at: new Date().toISOString(), kind, ok, message}, ...(s.schedule.log || [])].slice(0, 25); };
  async function autoTick() {
    if (autoBusy || disposed) return;
    const st = store.state, sch = st.schedule || {}, now = pullClock();
    const yesterday = pullClock(new Date(Date.now() - 24 * 3600000)).day;
    const owedFor = kind => reached(now, timeFor(st, kind)) ? now.day : yesterday;
    const firstEver = !sch.collectDay && !sch.perfDay;
    const holdFirst = firstEver && !reached(now, timeFor(st, 'collect')) && !reached(now, timeFor(st, 'perf'));
    if (collector.loginProc || collector.scanProc || scrapes > 0 || !runtime.ready()) return;
    const retryOk = kind => Date.now() - Date.parse(sch.lastAttempt?.[kind] || 0) > RETRY_MS;
    const dueAm = st.settings.autoMorning === true && reached(now, timeFor(st, 'am')) && String(sch.amDay || '') < now.day && retryOk('am');
    const due = kind => kind === 'am' ? dueAm
      : !holdFirst && st.settings[kind === 'collect' ? 'autoCollect' : 'autoPerformance'] !== false && String(sch[kind === 'collect' ? 'collectDay' : 'perfDay'] || '') < owedFor(kind) && retryOk(kind);
    if (!due('collect') && !due('perf') && !due('am')) return;
    autoBusy = true;
    try {
      for (const kind of ['collect', 'perf', 'am']) {
        if (!due(kind) || disposed) continue;
        const owedDay = kind === 'am' ? now.day : owedFor(kind);
        store.updateQuiet(s => { s.schedule = s.schedule || {}; s.schedule.lastAttempt = {...(s.schedule.lastAttempt || {}), [kind]: new Date().toISOString()}; });
        const title = kind === 'collect' ? 'Automatic collection: Recent + Trending' : kind === 'am' ? 'Automatic morning pull: your bot stats' : 'Automatic pull: your bot stats';
        bgRun = {kind, title};
        send('auto:run', {kind, stage: 'start', title});
        try {
          if (kind === 'collect') await collectNow('both', true); else await pullMyBotsNow(true);
          store.updateQuiet(s => { s.schedule[kind === 'collect' ? 'collectDay' : kind === 'am' ? 'amDay' : 'perfDay'] = owedDay; logRun(s, kind, true, kind === 'collect' ? `Collected Recent + Trending (${(s.datasets.recent || []).length} + ${(s.datasets.trending || []).length}) and updated the analysis.` : `Pulled ${Object.values(s.accounts || {}).map(a => `${a.label}: ${(a.bots || []).length} bots`).join(', ')}.`); });
          bgStep('Finishing up...', {indeterminate: true});
          await tick();
          send('auto:run', {kind, stage: 'done', title, state: store.get()});
        } catch (e) {
          store.updateQuiet(s => logRun(s, kind, false, e.message || String(e)));
          send('auto:run', {kind, stage: 'error', title, message: e.message || String(e), state: store.get()});
        }
        bgRun = null;
        await tick();
      }
    } finally { autoBusy = false; bgRun = null; }
  }
  let disposed = false;
  if (scheduler) { timers.push(setTimeout(autoTick, 20000), setInterval(autoTick, 60000)); for (const t of timers) if (t.unref) t.unref(); }

  // ---- what the window can ask for (the same names as Blueprint Studio's window uses)
  const methods = {
    getState: () => store.get(),
    saveSettings: input => {
      const blockedBefore = JSON.stringify(TagBlock.clean(store.state.settings.blockedTags || []));
      let out = store.update(s => { s.settings = cleanSettings(input || {}); });
      if (JSON.stringify(out.settings.blockedTags || []) !== blockedBefore) {
        // newly blocked tags: take those bots out of the collected lists and redo the analysis without them
        try {
          out = store.update(s => { for (const k of ['recent', 'trending']) s.datasets[k] = TagBlock.filterRows(s.datasets[k] || [], s.settings.blockedTags).rows; });
          const d = learningData(out);
          if ((d.recent.length + d.trending.length) >= 5) { const analysis = runAnalysis(out); out = store.update(s => { s.engineAnalysis = analysis; }); }
        } catch (e) { console.error('blocked tags re-analysis:', e.message); }
      }
      if (applyLoginItem && input && input.openAtLogin !== undefined) applyLoginItem(out.settings.openAtLogin);
      return out;
    },
    // tags to choose from: every tag on the bots collected so far, plus (tagsFetch) JuicyChat's own list read with the saved sign-in
    tagsList: () => {
      const st = store.get(), h = history.analysisRows({maxAgeDays: 3650});
      const fromSite = new Set((st.juicyTags || []).map(TagBlock.norm));
      const once = new Map();
      for (const r of [...(st.datasets.recent || []), ...(st.datasets.trending || []), ...(h.recent || []), ...(h.trending || [])]) { const k = String(r.url || r.id || r.title || r.name || ''); if (k && !once.has(k)) once.set(k, r); }
      const seen = TagBlock.seen([[...once.values()]]);
      const titles = new Set([...once.values()].flatMap(r => [r.title, r.name, r.creator]).map(x => TagBlock.norm(x || '')).filter(Boolean));
      const realTag = x => { const k = TagBlock.norm(x.name); if (fromSite.size) return fromSite.has(k); return !/^\s*@/.test(x.name) && !titles.has(k); };
      const names = new Map(seen.filter(realTag).map(x => [TagBlock.norm(x.name), {name: x.name, count: x.count, site: fromSite.has(TagBlock.norm(x.name))}]));
      for (const t of st.juicyTags || []) { const k = TagBlock.norm(t); if (k && !names.has(k)) names.set(k, {name: t, count: 0, site: true}); }
      return {tags: [...names.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)), fetchedAt: st.juicyTagsAt || null};
    },
    tagsFetch: async () => {
      needRuntime();
      const found = TagBlock.clean(await locked('reading the JuicyChat tag list', () => collector.collectTags()));
      if (!found.length) throw new Error('JuicyChat did not show any tags to the saved sign-in. Check that you are signed in (Settings > JuicyChat sign-in), then try again.');
      store.update(s => { s.juicyTags = TagBlock.clean(found); s.juicyTagsAt = new Date().toISOString(); });
      return {count: found.length};
    },
    openLogin: async magicLink => {
      const link = String(magicLink || '').trim();
      if (link && !/^https:\/\//i.test(link)) throw new Error('Paste the full https:// magic link.');
      needRuntime();
      const auth = await locked('signing in', () => collector.signIn(link || 'https://www.juicychat.ai/discover'));
      if (auth?.signedIn === true) store.update(s => { const a = ensureAccounts(s).main; a.signedIn = {...(a.signedIn || {}), ok: true, at: new Date().toISOString()}; delete a.loggedOut; });
      return {ok: auth?.signedIn === true, auth};
    },
    authStatus: () => collector.checkAuth(),
    finishLogin: () => collector.finishLogin(),
    resetLogin: async () => { const r = await collector.resetLogin(); store.update(s => { const a = ensureAccounts(s).main; a.signedIn = null; }); return r; },
    collect: kind => collectNow(['Recent', 'Trending', 'both'].includes(kind) ? kind : 'both'),
    cancelCollect: async () => { cancelWait = true; try { collector.cancelCollection(); } catch {} return true; },
    analyzeEngines: async () => {
      const state = store.get();
      const sampleSize = (state.datasets.recent?.length || 0) + (state.datasets.trending?.length || 0);
      if (sampleSize < 5) throw new Error('Collect at least 5 Recent or Trending bots first. A full 100 + 100 sample gives the strongest summary, but either list can be analyzed on its own.');
      send('analysis:progress', {message: `Analyzing ${sampleSize} collected bot records locally...`});
      const analysis = await runAnalysisAsync(state);
      store.update(s => { s.engineAnalysis = analysis; s.historyStats = history.stats(); });
      send('analysis:progress', {message: 'Local success-engine analysis complete.'});
      return store.get();
    },
    performancePull: () => pullMyBotsNow(false),
    // a rating chosen by hand for one bot (SFW / NSFW / 18+), or null to go back to what was detected
    perfSetRating: (account, url, label) => store.update(s => {
      const a = s.accounts && s.accounts[account]; if (!a) return;
      a.ratingOverrides = a.ratingOverrides || {};
      if (['SFW', 'NSFW', '18+'].includes(label)) a.ratingOverrides[String(url)] = label; else delete a.ratingOverrides[String(url)];
    }),
    timingPool: () => timing ? timing.pool() : {tags: [], bots: [], updatedAt: null, scans: 0},
    // the multiplier of each tag in When to release > Best times by tag (from your bots and the bots seen on JuicyChat)
    successAims: () => {
      const pool = timing ? timing.pool() : null, r = SuccessAims.compute({own: ((store.state.accounts || {}).main || {}).bots || [], pool, now: Date.now()});
      return {on: true, edition: 'share', main: SuccessAims.summary(r), ntr: null, rates: {main: SuccessAims.ratings(r), ntr: {}}};
    },
    historyClear: () => { history.clear(); return store.update(s => { s.historyStats = history.stats(); }); },
    copyText: text => copyText(String(text ?? '')),
    appVersion: () => VERSION,
    hostInfo: () => ({host, version: VERSION, appName}),
    runtimeStatus: () => ({ready: runtime.ready(), installing: runtime.installing, dir: runtime.dir, waitingFor}),
    runtimeInstall: async () => {
      if (runtime.ready()) return {ok: true, ready: true};
      await locked('installing the JuicyChat scanner', () => runtime.install(p => send('runtime:progress', p)));
      collector.readyFlag = runtime.readyFlag();
      return {ok: true, ready: runtime.ready()};
    }
  };
  function dispose() {
    disposed = true;
    for (const t of timers) { clearTimeout(t); clearInterval(t); }
    try { collector.cancelCollection(); } catch {}
    try { store.flush(); } catch {}
    lock.dispose();
  }
  return {methods, events: EVENTS, store, dispose, flush: () => store.flush(), busy: () => scrapes > 0 || autoBusy || !!collector.loginProc || !!collector.scanProc || runtime.installing, version: VERSION};
}
module.exports = {create, EVENTS, VERSION};
