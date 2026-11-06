'use strict';
// One JuicyChat pull at a time across the JuicyChat Analytics Tool and the Creator Tool's Analytics tab.
// The lock is a small file in the Analytics Tool's shared folder. It names the app holding it and is refreshed every
// few seconds; a lock whose app has closed (or stopped refreshing for 2 minutes) is taken over. The same app can take it
// again while it already holds it (a collection that reads Recent and then Trending), counted so it is let go only once.
const fs = require('fs');
const path = require('path');

const STALE_MS = 120000, BEAT_MS = 10000, POLL_MS = 1500;
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

function create({dir, appName, onWait = () => {}}) {
  const file = path.join(dir, 'pull.lock');
  let held = 0, beat = null, label = '';
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
  const mine = info => info && info.pid === process.pid && info.app === appName;
  const stale = info => {
    if (!info) { try { return Date.now() - fs.statSync(file).mtimeMs > 5000; } catch { return true; } }   // half-written file: give the writer a moment
    if (!Number.isInteger(info.pid) || !alive(info.pid)) return true;
    return Date.now() - (Date.parse(info.beat || info.at) || 0) > STALE_MS;
  };
  const write = flag => fs.writeFileSync(file, JSON.stringify({app: appName, pid: process.pid, label, at: new Date().toISOString(), beat: new Date().toISOString()}), flag ? {flag} : undefined);
  function tryTake() {
    fs.mkdirSync(dir, {recursive: true});
    try { write('wx'); return true; } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const info = read();
    if (mine(info)) return true;
    if (stale(info)) { try { fs.rmSync(file, {force: true}); } catch {} try { write('wx'); return true; } catch (e) { if (e.code !== 'EEXIST') throw e; } }
    return false;
  }
  function holder() { const info = read(); return info && !mine(info) && !stale(info) ? info : null; }
  // waits until this app holds the lock; cancelled() stops the wait (the run is then not started)
  async function acquire(what, {cancelled = () => false} = {}) {
    if (held > 0) { held++; return release; }
    let told = false;
    for (;;) {
      if (tryTake()) break;
      if (cancelled()) throw Object.assign(new Error('Cancelled while waiting for the other app to finish its JuicyChat pull.'), {cancelled: true});
      const other = holder();
      if (other && !told) { told = true; onWait({app: other.app, what: other.label || 'a JuicyChat pull'}); }
      await new Promise(r => setTimeout(r, POLL_MS));
    }
    held = 1; label = String(what || ''); write();
    beat = setInterval(() => { try { if (mine(read())) write(); } catch {} }, BEAT_MS); if (beat.unref) beat.unref();
    if (told) onWait(null);
    return release;
  }
  function release() {
    if (held <= 0) return;
    if (--held > 0) return;
    clearInterval(beat); beat = null;
    try { if (mine(read())) fs.rmSync(file, {force: true}); } catch {}
  }
  // run fn while holding the lock
  async function run(what, fn, opts) { await acquire(what, opts); try { return await fn(); } finally { release(); } }
  function dispose() { held = Math.min(held, 1); release(); }
  return {acquire, release, run, holder, dispose, file, get held() { return held; }};
}
module.exports = {create};
