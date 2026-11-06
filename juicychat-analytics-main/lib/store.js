// The Analytics Tool's saved data (one JSON file in its data folder). Taken from Blueprint Studio's store, with only the analytics parts.
const fs = require('fs');
const path = require('path');

function clone(v) { return JSON.parse(JSON.stringify(v)); }

const DEFAULT_STATE = {
  settings: {
    targetRecent: 100,
    targetTrending: 100,
    autoCollect: true,
    autoPerformance: true,
    collectTime: '20:00',
    perfTime: '20:00',
    autoMorning: false,
    morningTime: '08:00',
    pullTimeZone: 'est',
    openAtLogin: false,
    blockedTags: [],                     // JuicyChat tags whose bots are never pulled (Settings > Blocked tags)
    gender: 'Female',
    juicyHomeUrl: 'https://www.juicychat.ai'
  },
  datasets: {recent: [], trending: [], lastCollectedAt: null},
  engineAnalysis: null,
  performance: [],
  accounts: {},
  schedule: {collectDay: '', perfDay: '', lastAttempt: {}, log: []}
};

class JsonStore {
  constructor(dir) {
    this.file = path.join(dir, 'juicychat-analytics-state.json');
    this.state = clone(DEFAULT_STATE);
    try { if (fs.existsSync(this.file)) this.state = this.merge(DEFAULT_STATE, JSON.parse(fs.readFileSync(this.file, 'utf8'))); }
    catch (err) { console.error('Could not load state:', err); this.state = clone(DEFAULT_STATE); }
  }
  merge(base, saved) {
    if (Array.isArray(base)) return Array.isArray(saved) ? saved : clone(base);
    if (!base || typeof base !== 'object') return saved === undefined ? base : saved;
    const out = {...base};
    if (!saved || typeof saved !== 'object') return out;
    for (const [k, v] of Object.entries(saved)) out[k] = k in base && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? this.merge(base[k], v) : v;
    return out;
  }
  save() { this._write(JSON.stringify(this.state)); }
  _write(json) {
    clearTimeout(this._timer); this._timer = null; this._dirty = false;
    fs.mkdirSync(path.dirname(this.file), {recursive: true});
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, this.file);
  }
  get() { return clone(this.state); }
  update(mutator) { mutator(this.state); const json = JSON.stringify(this.state); this._write(json); return JSON.parse(json); }
  // automatic runs: change in memory now, write the file a moment later (once for a burst of changes)
  updateQuiet(mutator, delayMs = 2500) {
    mutator(this.state); this._dirty = true;
    if (!this._timer) { this._timer = setTimeout(() => { this._timer = null; try { this.save(); } catch (e) { console.error('Could not save state:', e.message); } }, delayMs); if (this._timer.unref) this._timer.unref(); }
  }
  flush() { if (this._dirty) this.save(); }
}
module.exports = {JsonStore, DEFAULT_STATE};
