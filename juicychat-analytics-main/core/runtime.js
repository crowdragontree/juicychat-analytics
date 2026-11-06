'use strict';
// The JuicyChat scanner (Python + Playwright + Chromium), the same one Blueprint Studio installs with START_JUICY_BLUEPRINT_STUDIO.bat.
// A portable app cannot carry it, so it is installed once, on this computer, into the Analytics Tool's shared folder (an app update
// never replaces it) and is used by the Analytics Tool and by the Creator Tool's Analytics tab. Steps, as in the .bat file:
// find Python 3.9+ (on Windows, install Python 3.12 with winget when there is none), make a private environment, install the
// packages in scanner/requirements.txt and Playwright's Chromium.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {spawn} = require('child_process');

function create({appRoot, sharedDir}) {
  const dir = path.join(sharedDir, 'scanner-runtime');
  const reqFile = path.join(appRoot, 'scanner', 'requirements.txt');
  const reqHash = () => { try { return crypto.createHash('sha256').update(fs.readFileSync(reqFile)).digest('hex').slice(0, 12); } catch { return 'none'; } };
  const readyFlag = () => path.join(dir, `ready-${reqHash()}.flag`);
  const python = () => process.platform === 'win32' ? path.join(dir, 'Scripts', 'python.exe') : path.join(dir, 'bin', 'python');
  const ready = () => !!process.env.JAT_SCANNER_PYTHON || (fs.existsSync(python()) && fs.existsSync(readyFlag()));
  let installing = null;

  function run(cmd, args, onLine) {
    return new Promise((resolve, reject) => {
      let child;
      try { child = spawn(cmd, args, {cwd: sharedDir, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1'}}); } catch (e) { reject(e); return; }
      let tail = '';
      const take = b => { const t = String(b); tail = (tail + t).slice(-2000); for (const l of t.split(/\r?\n/)) if (l.trim()) onLine(l.trim()); };
      child.stdout.on('data', take); child.stderr.on('data', take);
      child.once('error', reject);
      child.once('close', code => code === 0 ? resolve(tail) : reject(new Error(`${path.basename(cmd)} ${args.slice(0, 3).join(' ')} failed (${code}). ${tail.split('\n').slice(-3).join(' ')}`.trim())));
    });
  }
  async function findPython(log) {
    const tries = process.platform === 'win32'
      ? [['py', ['-3']], ['python', []], ...['Python313', 'Python312', 'Python311', 'Python310'].map(v => [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', v, 'python.exe'), []])]
      : [['python3', []], ['python', []]];
    for (const [cmd, pre] of tries) {
      try { await run(cmd, [...pre, '-c', 'import sys; sys.exit(0 if sys.version_info>=(3,9) else 1)'], () => {}); log(`Using Python: ${cmd} ${pre.join(' ')}`.trim()); return [cmd, pre]; } catch {}
    }
    return null;
  }
  async function install(onProgress = () => {}) {
    if (installing) return installing;
    const step = (n, message) => onProgress({step: n, steps: 4, message});
    installing = (async () => {
      fs.mkdirSync(sharedDir, {recursive: true});
      step(1, 'Looking for Python 3.9 or newer...');
      let py = await findPython(m => step(1, m));
      if (!py && process.platform === 'win32') {
        step(1, 'Python is not installed. Installing Python 3.12 (one time only)...');
        await run('winget', ['install', '-e', '--id', 'Python.Python.3.12', '--scope', 'user', '--accept-package-agreements', '--accept-source-agreements'], l => step(1, l));
        py = await findPython(m => step(1, m));
      }
      if (!py) throw new Error(process.platform === 'win32' ? 'Python could not be installed automatically. Install Python 3.12 or newer, then press Install scanner again.' : 'Python 3.9 or newer is needed. Install it (for example: sudo apt install python3 python3-venv), then press Install scanner again.');
      if (!fs.existsSync(python())) { step(2, 'Making the scanner\'s private Python environment...'); await run(py[0], [...py[1], '-m', 'venv', dir], l => step(2, l)); }
      step(3, 'Installing the scanner\'s Python packages (Playwright)...');
      await run(python(), ['-m', 'pip', 'install', '--upgrade', 'pip', '--quiet'], l => step(3, l));
      await run(python(), ['-m', 'pip', 'install', '-r', reqFile, '--quiet'], l => step(3, l));
      step(4, 'Installing Chromium for the scanner...');
      await run(python(), ['-m', 'playwright', 'install', 'chromium'], l => step(4, l));
      for (const f of fs.readdirSync(dir)) if (/^ready-.*\.flag$/.test(f)) fs.rmSync(path.join(dir, f), {force: true});
      fs.writeFileSync(readyFlag(), new Date().toISOString());
      step(4, 'The scanner is installed.');
      return {ok: true};
    })().finally(() => { installing = null; });
    return installing;
  }
  return {dir, python, ready, readyFlag, install, get installing() { return !!installing; }};
}
module.exports = {create};
