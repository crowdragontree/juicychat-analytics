'use strict';
// Source checks run by the GitHub workflow before packaging: every file loads, the core answers, the lock lets one app pull at a time.
const assert = require('node:assert');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const C = require('../core/analytics'), L = require('../core/pullLock');
(async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'jat-'));
  const c = C.create({userData: path.join(d, 'u'), sharedDir: path.join(d, 's'), appName: 'Test', scheduler: false});
  assert.ok(c.methods.getState().settings.targetRecent === 100);
  assert.deepStrictEqual(c.methods.tagsList().tags, []);
  const s = c.methods.saveSettings({blockedTags: ['Furry', 'furry', 'NTR']});
  assert.deepStrictEqual(s.settings.blockedTags.length, 2);
  await assert.rejects(c.methods.collect('both'), /scanner is not installed/);
  c.dispose();
  const a = L.create({dir: d, appName: 'A'}), b = L.create({dir: d, appName: 'B'});
  await a.acquire('x'); let got = false; const p = b.acquire('y').then(() => { got = true; });
  await new Promise(r => setTimeout(r, 2000)); assert.strictEqual(got, false); a.release(); await p; assert.strictEqual(got, true); b.release();
  console.log('PASS: analytics core and pull lock');
})().catch(e => { console.error(e); process.exit(1); });
