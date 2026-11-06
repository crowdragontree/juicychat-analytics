// Runs the success-engine analysis off the main thread, so the window keeps responding while it works.
// analyzeAsync(input) resolves with the same result analyzeEnginesLocal(input) gives. If a worker cannot start
// (or dies), it quietly does the same work in place, so an analysis is never lost.
const path = require('path');
const {analyzeEnginesLocal} = require('./engineAnalyzer');

let Worker = null, isMainThread = true, parentPort = null;
try { ({Worker, isMainThread, parentPort} = require('worker_threads')); } catch {}

if (!isMainThread && parentPort) {
  parentPort.on('message', ({id, input}) => {
    try { parentPort.postMessage({id, result: analyzeEnginesLocal(input)}); }
    catch (e) { parentPort.postMessage({id, error: String(e && e.message || e)}); }
  });
}

function analyzeAsync(input, {timeoutMs = 120000} = {}) {
  return new Promise((resolve, reject) => {
    const inPlace = () => { try { setImmediate(() => { try { resolve(analyzeEnginesLocal(input)); } catch (e) { reject(e); } }); } catch (e) { reject(e); } };
    if (!Worker || process.env.JUICY_NO_WORKER) return inPlace();
    let w, settled = false, timer;
    const finish = fn => v => { if (settled) return; settled = true; clearTimeout(timer); try { w && w.terminate(); } catch {} fn(v); };
    const ok = finish(resolve), fallback = finish(() => inPlace());
    try {
      w = new Worker(__filename);
      timer = setTimeout(fallback, timeoutMs);
      w.once('message', m => { if (m.error) fallback(); else ok(m.result); });
      w.once('error', () => fallback());
      w.once('exit', code => { if (!settled) fallback(); });
      w.postMessage({id: 1, input});
    } catch { fallback(); }
  });
}

module.exports = {analyzeAsync};
