'use strict';
// Success aims (v1.3.1): what the analysis says about which tags make bots succeed, turned into something the week builder can use.
// A bot's score is likes + 1.5 x favorites, the same score the whole Analysis tab uses. For every tag two ratios are worked out, each against the
// all-bots average of its own group: your own bots with the tag, and the bots seen on JuicyChat with the tag. The two are blended (the more of your own
// bots carry the tag, the more your own result counts), and a tag with only a few bots is pulled toward 1.0 so one lucky bot cannot win.
// Main and NTR are always worked out on their own: they are two calls to compute() with that account's bots.
const {PRIMARY_ARCHETYPES} = require('./blueprintRules');

const FAV = 1.5, HOUR = 3600000, DAY = 86400000;
const K_SHRINK = 4;            // a tag with few bots counts as if this many average bots were added to it
const OWN_WEIGHT_K = 6;        // your own result gets weight n / (n + 6) against the JuicyChat-wide result
const MIN_AGE_H = 48, MAX_AGE_D = 400;
const GOOD = 1.15, POOR = 0.85;

// "Brat (Playfully defiant or teasing)", "#Brat " and "brat" are the same tag
const keyOf = t => String(t == null ? '' : t).replace(/^#/, '').replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
const num = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
const toMs = v => {
  if (v == null || v === '') return null;
  if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v))) { const n = Number(v); if (!Number.isFinite(n) || n <= 0) return null; return n > 1e12 ? n : n > 1e9 ? n * 1000 : null; }
  const t = Date.parse(String(v)); return Number.isFinite(t) ? t : null;
};
const ARCH_BY_KEY = new Map(PRIMARY_ARCHETYPES.map(a => [keyOf(a), a]));

// one list of {keys, score} for a group of bots; bots too young to have collected likes are left out, and a bot that went viral is capped so it cannot decide a tag on its own
function cap(list) {
  if (list.length >= 50) { const s = list.map(b => b.score).sort((a, b) => a - b), c = s[Math.floor((s.length - 1) * 0.995)]; for (const b of list) if (b.score > c) b.score = c; }
  return list;
}
function ownList(bots, now) {
  const out = [];
  for (const b of Array.isArray(bots) ? bots : []) {
    const keys = [...new Set((Array.isArray(b.tags) ? b.tags : []).map(keyOf).filter(Boolean))]; if (!keys.length) continue;
    const rel = toMs(b.published) || toMs(b.created); if (rel && (now - rel < MIN_AGE_H * HOUR)) continue;
    out.push({keys, names: b.tags, score: num(b.likes) + FAV * num(b.favorites)});
  }
  return cap(out);
}
function marketList(pool, now) {
  const out = [], tags = (pool && pool.tags) || [];
  for (const r of (pool && pool.bots) || []) {
    const rel = r[0], age = now - rel; if (!(rel > 0) || age < MIN_AGE_H * HOUR || age > MAX_AGE_D * DAY) continue;
    const ix = r[4] || [], names = ix.map(i => tags[i]).filter(Boolean), keys = [...new Set(names.map(keyOf).filter(Boolean))]; if (!keys.length) continue;
    out.push({keys, names, score: num(r[1]) + FAV * num(r[2])});
  }
  return cap(out);
}
function tally(list) {
  const m = new Map(); let sum = 0;
  for (const b of list) { sum += b.score; b.keys.forEach((k, i) => { let r = m.get(k); if (!r) m.set(k, r = {n: 0, sum: 0, name: ''}); r.n++; r.sum += b.score; if (!r.name) r.name = String((b.names || [])[i] || k); }); }
  return {n: list.length, mean: list.length ? sum / list.length : 0, tags: m};
}
const shrunkLift = (r, mean) => (!r || !r.n || !mean) ? 1 : ((r.sum + K_SHRINK * mean) / (r.n + K_SHRINK)) / mean;

// -> {own:{n,mean}, market:{n,mean}, tags:[{tag,key,persona,own:{n,mean},market:{n,mean},ownLift,marketLift,lift,support,confidence}]}, best lift first
function compute({own = [], pool = null, now = Date.now()} = {}) {
  const O = tally(ownList(own, now)), M = tally(marketList(pool, now)), keys = new Set([...O.tags.keys(), ...M.tags.keys()]), tags = [];
  const haveOwn = O.n >= 10, haveMarket = M.n >= 50;
  for (const k of keys) {
    const o = O.tags.get(k) || {n: 0, sum: 0}, m = M.tags.get(k) || {n: 0, sum: 0};
    if (o.n < 3 && m.n < 10) continue;                                        // too few bots anywhere to say anything
    const ol = haveOwn ? shrunkLift(o, O.mean) : 1, ml = haveMarket ? shrunkLift(m, M.mean) : 1;
    const w = haveOwn ? o.n / (o.n + OWN_WEIGHT_K) : 0, lift = haveMarket ? w * ol + (1 - w) * ml : ol;
    const agree = o.n >= 5 && ol >= GOOD && ml >= 1.05;
    const confidence = lift < GOOD ? 'low' : (agree || (o.n >= 12 && ol >= 1.2)) ? 'high' : (o.n >= 3 || m.n >= 25) ? 'medium' : 'low';
    tags.push({tag: (O.tags.get(k) || M.tags.get(k)).name, key: k, persona: ARCH_BY_KEY.get(k) || '',
      own: {n: o.n, mean: o.n ? o.sum / o.n : 0}, market: {n: m.n, mean: m.n ? m.sum / m.n : 0}, ownLift: ol, marketLift: ml, lift, support: o.n + m.n, confidence});
  }
  tags.sort((a, b) => b.lift - a.lift || b.support - a.support);
  return {own: {n: O.n, mean: O.mean}, market: {n: M.n, mean: M.mean}, tags, at: now};
}

// the part the generator reads: a weight for each character type (1 = no change) and the order of the generic story tags
function aimsFor(res) {
  const persona = {}, info = {}, rank = [];
  for (const t of (res && res.tags) || []) {
    if (t.persona) {
      const w = t.lift >= GOOD && t.confidence !== 'low' ? Math.min(4, 1 + (t.lift - 1) * 3) : t.lift <= POOR ? 0.6 : 1;
      if (w !== 1) { persona[t.persona] = Math.round(w * 100) / 100; info[t.persona] = {lift: Math.round(t.lift * 100) / 100, own: t.own, market: t.market, confidence: t.confidence}; }
    }
    if (t.lift >= 1.1) rank.push(t.key);
  }
  return {persona, info, tagRank: rank, own: res ? res.own.n : 0, market: res ? res.market.n : 0};
}

// what the panel shows: character types, other tags, and the ones that do poorly
function summary(res, {top = 8, low = 5} = {}) {
  const t = (res && res.tags) || [], good = x => x.lift >= GOOD && x.confidence !== 'low', bad = x => x.lift <= POOR && x.support >= 8;
  const pick = a => a.map(x => ({tag: x.tag, key: x.key, persona: x.persona, lift: Math.round(x.lift * 100) / 100, ownN: x.own.n, ownMean: Math.round(x.own.mean), marketN: x.market.n, marketMean: Math.round(x.market.mean), confidence: x.confidence}));
  return {
    own: res ? res.own : {n: 0, mean: 0}, market: res ? res.market : {n: 0, mean: 0},
    personas: pick(t.filter(x => x.persona && good(x)).slice(0, top)),
    others: pick(t.filter(x => !x.persona && good(x)).slice(0, top)),
    poor: pick(t.filter(bad).slice(-low).reverse()),
  };
}
// v1.3.7: where every tag lands, for the Analysis tab's tag table: its multiplier, the list it is in (or none) and ONE sentence that says why.
const x1 = n => '×' + (Math.round(n * 10) / 10).toFixed(1), n0 = n => Math.round(n).toLocaleString('en-US');
function ratings(res) {
  const out = {}, w = res && res.own && res.own.n >= 10 ? res.own : null;
  for (const t of (res && res.tags) || []) {
    const hi = t.lift >= GOOD, lo = t.lift <= POOR, sure = t.confidence !== 'low', L = x1(t.lift);
    const have = `${t.own.n ? `your ${t.own.n} bot${t.own.n === 1 ? '' : 's'} average ${n0(t.own.mean)}` : 'none of your bots carry it'}${t.market.n ? `, ${n0(t.market.n)} JuicyChat bot${t.market.n === 1 ? '' : 's'} average ${n0(t.market.mean)}` : ''}`;
    const ownPct = w && t.own.n ? Math.round(100 * t.own.n / (t.own.n + OWN_WEIGHT_K)) : 0, mix = ownPct >= 50 ? `, and your own bots count ${ownPct}% of the result` : '';
    let cat, why;
    if (hi && sure && t.persona) { cat = 'aim'; why = `${t.tag} is a character type that scores ${L} the average bot (${have}), so it is in "Character types to aim for".`; }
    else if (hi && sure) { cat = 'good'; why = `${t.tag} scores ${L} the average bot (${have}), so it is in "Other tags that do well" (a suggestion, not added for you).`; }
    else if (lo && t.support >= 8) { cat = 'worse'; why = `${t.tag} scores ${L} the average bot (${have}), so it is in "Doing worse than average".`; }
    else if (hi) { cat = 'unsure'; why = `${t.tag} looks above average at ${L} (${have}) but rests on too few bots to trust yet, so it is in no list.`; }
    else if (lo) { cat = 'unsure'; why = `${t.tag} looks below average at ${L} (${have}) but only ${t.support} bot${t.support === 1 ? '' : 's'} carry it, too few to call it worse, so it is in no list.`; }
    else { cat = 'average'; why = `${t.tag} scores ${L}, about average (${have}${mix}), so it is not far enough above or below the average bot to land in any list.`; }
    out[t.key] = {lift: Math.round(t.lift * 100) / 100, cat, why};
  }
  return out;
}
const unrated = tag => ({lift: null, cat: 'none', why: `${tag} has too few bots to rate yet (it needs 3 of yours or 10 on JuicyChat), so it is in no list.`});
module.exports = {compute, aimsFor, summary, ratings, unrated, keyOf, GOOD, POOR};
