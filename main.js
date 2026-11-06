'use strict';
// JuicyChat Analytics Tool: the desktop shell (window, tray, updates). The analytics themselves are in core/analytics.js,
// which the JuicyChat Creator Tool also loads from this app's folder for its Analytics tab.
const path = require('node:path');
const fs = require('node:fs');
const {app, BrowserWindow, ipcMain, dialog, clipboard, shell, Tray, Menu, nativeImage} = require('electron');
const {PortableUpdater, finishUpdate, ASSETS} = require('./lib/portableUpdater');
const closeChoice = require('./lib/closeChoice');

const APP_NAME = 'JuicyChat Analytics Tool';
// Started by the updater from the downloaded copy: install it, then exit.
const FINISH_UPDATE = process.argv.find(a => a.startsWith('--jat-finish-update='));
if (FINISH_UPDATE) {
  finishUpdate(FINISH_UPDATE.slice('--jat-finish-update='.length)).catch(() => {}).finally(() => process.exit(0));
  return;
}
const UPDATE_E2E = process.argv.includes('--analytics-update-e2e');
const E2E = process.argv.includes('--analytics-e2e') || UPDATE_E2E;
app.setName(APP_NAME);
if (process.env.JAT_USER_DATA) app.setPath('userData', process.env.JAT_USER_DATA);      // tests only
const SHARED_DIR = path.join(process.env.JAT_APPDATA || app.getPath('appData'), APP_NAME, 'shared');
process.on('uncaughtException', e => { console.error(e); try { dialog.showErrorBox(`${APP_NAME} hit an error`, String(e && e.stack || e)); } catch {} });

const lock = app.requestSingleInstanceLock();
let win = null, tray = null, core = null, updater = null, quitting = false, closeAsk = null;
if (!lock) app.quit();
else app.on('second-instance', () => showWindow());
const send = (channel, value) => { if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, value); };

// The Creator Tool finds this app (to show its Analytics tab) through this file: where the app is and which version it is.
function registerInstall() {
  try {
    fs.mkdirSync(SHARED_DIR, {recursive: true});
    const info = {app: APP_NAME, version: app.getVersion(), appDir: __dirname, exe: process.execPath, packaged: app.isPackaged, at: new Date().toISOString()};
    const file = path.join(SHARED_DIR, 'installed.json'), tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(info, null, 2)); fs.renameSync(tmp, file);
  } catch (e) { console.error('install record:', e.message); }
}
// after an update: the previous version and the unpacked copies left next to the app folder are removed
function cleanUpdateLeftovers() {
  if (!app.isPackaged || E2E) return;
  const dir = path.dirname(process.execPath), parent = path.dirname(dir);
  let list = []; try { list = fs.readdirSync(parent, {withFileTypes: true}); } catch {}
  for (const d of list) if (d.isDirectory() && /^\.jat-(backup|stage|unpack)-/.test(d.name) && fs.existsSync(path.join(parent, d.name, 'resources', 'app', 'package.json')))
    fs.promises.rm(path.join(parent, d.name), {recursive: true, force: true, maxRetries: 5, retryDelay: 1000}).catch(() => {});
}
// Start with Windows (Settings > Automatic daily pulls): a normal Windows "Run" entry, written with the exact, quoted program path
async function applyLoginItem(on) {
  if (!app.isPackaged || E2E) return;
  if (process.platform !== 'win32') { try { app.setLoginItemSettings({openAtLogin: !!on, path: process.execPath}); } catch (e) { console.error(e); } return; }
  const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  const reg = args => new Promise(res => require('node:child_process').execFile('reg', args, {windowsHide: true}, err => res(!err)));
  if (on) await reg(['add', RUN_KEY, '/v', APP_NAME, '/t', 'REG_SZ', '/d', `"${process.execPath}"`, '/f']); else await reg(['delete', RUN_KEY, '/v', APP_NAME, '/f']);
}

function showWindow() {
  if (!win || win.isDestroyed()) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
function askClose(trayOk) {
  // the question is drawn inside the window; if the page cannot draw it, a plain system box is used
  return new Promise(resolve => {
    let shown = false;
    const finish = c => { if (!closeAsk) return; clearTimeout(closeAsk.timer); closeAsk = null; resolve(c); };
    closeAsk = {finish, ack: () => { shown = true; }, timer: setTimeout(() => { if (!shown) { send('app:closeAskCancel'); closeAsk = null; closeChoice.nativeAsk(dialog, win, trayOk).then(resolve); } }, 1500)};
    send('app:closeAsk', {tray: trayOk});
  });
}
function createWindow() {
  win = new BrowserWindow({width: 1500, height: 1000, minWidth: 1000, minHeight: 680, show: false, title: APP_NAME, backgroundColor: '#0e0b12', autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, webviewTag: false}});
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (!process.argv.includes('--hidden')) win.show(); });
  win.webContents.setWindowOpenHandler(({url}) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return {action: 'deny'}; });
  const page = new URL('file://' + path.join(__dirname, 'renderer', 'index.html')).href;
  win.webContents.on('will-navigate', (e, url) => { if (url !== page) { e.preventDefault(); if (/^https:\/\//i.test(url)) shell.openExternal(url); } });
  win.on('close', closeChoice.make({
    ask: askClose, isQuitting: () => quitting || E2E, hasTray: () => !!tray,
    onExit: () => { quitting = true; app.quit(); },
    onTray: () => { if (win && !win.isDestroyed()) win.hide(); }
  }));
  win.on('closed', () => { win = null; });
}
function makeTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')));
    tray.setToolTip(APP_NAME);
    tray.setContextMenu(Menu.buildFromTemplate([{label: `Open ${APP_NAME}`, click: showWindow}, {type: 'separator'}, {label: 'Quit', click: () => { quitting = true; app.quit(); }}]));
    tray.on('double-click', showWindow);
  } catch (e) { console.error('tray:', e.message); tray = null; }
}

app.whenReady().then(async () => {
  if (!lock) return;
  registerInstall();
  core = require('./core/analytics').create({
    userData: app.getPath('userData'), sharedDir: SHARED_DIR, appName: APP_NAME, host: 'analytics', send, scheduler: !E2E,
    copyText: t => { clipboard.writeText(String(t).slice(0, 2000000)); return true; },
    applyLoginItem,
    scanBounds: () => { try { const {screen} = require('electron'); const vis = win && !win.isDestroyed() && win.isVisible() && !win.isMinimized(); const d = vis ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay(), w = d.workArea; return [w.x, w.y, w.width, w.height]; } catch { return null; } }
  });
  const verify = event => { if (!win || win.isDestroyed() || event.sender !== win.webContents) throw Error(`Action requires the ${APP_NAME} window.`); };
  for (const [name, fn] of Object.entries(core.methods)) ipcMain.handle('jat:' + name, (event, ...args) => { verify(event); return fn(...args); });
  ipcMain.handle('app:closeShown', () => { if (closeAsk) closeAsk.ack(); return true; });
  ipcMain.handle('app:closeChoice', (_e, c) => { if (!closeAsk || !['exit', 'tray', 'cancel'].includes(c)) return false; closeAsk.finish(c); return true; });
  // ---- updates: GitHub Releases of crowdragontree/juicychat-analytics, the same updater as the Creator Tool
  let testRelease;
  if (UPDATE_E2E) {
    const zip = process.env.JAT_UPDATE_ZIP, next = process.env.JAT_UPDATE_VERSION, name = ASSETS[process.platform];
    const bytes = fs.readFileSync(zip), digest = 'sha256:' + require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    testRelease = {fetchRelease: async () => ({tag_name: next, assets: [{name, digest, size: bytes.length, browser_download_url: `https://github.com/crowdragontree/juicychat-analytics/releases/download/${next}/${name}`}]}),
      downloader: async (asset, file) => fs.promises.copyFile(zip, file)};
  }
  updater = new PortableUpdater({version: app.getVersion(), platform: process.platform, appRoot: __dirname, packaged: app.isPackaged,
    installDir: path.dirname(app.getPath('exe')), userData: app.getPath('userData'), busy: () => core.busy(), onStatus: status => send('updates:status', status), ...testRelease});
  ipcMain.handle('updates:state', event => { verify(event); return updater.state; });
  ipcMain.handle('updates:check', event => { verify(event); return updater.check(); });
  ipcMain.handle('updates:install', async event => {
    verify(event);
    if (core.busy()) throw Error('Finish or cancel the current JuicyChat pull before updating.');
    if (!updater.available) throw Error('Check for updates first.');
    const choice = await dialog.showMessageBox(win, {type: 'question', title: 'Install update?', message: `Update the ${APP_NAME} to v${updater.available.version}?`,
      detail: 'A verified ZIP from GitHub will replace the portable app after it closes, then restart it. Your sign-in and your collected data stay on your computer.',
      buttons: ['Update & Restart', 'Not now'], defaultId: 0, cancelId: 1});
    if (choice.response !== 0) return {cancelled: true};
    const stage = await updater.prepare(); await updater.launchInstaller(stage);
    quitting = true; app.quit(); return {restarting: true};
  });
  createWindow();
  if (!E2E) makeTray();
  if (!E2E) { setTimeout(cleanUpdateLeftovers, 3000).unref(); setTimeout(() => updater.check({silent: true}).catch(() => {}), 4500).unref(); setInterval(() => updater.check({silent: true}), 6 * 60 * 60 * 1000).unref(); }
  if (!E2E && core.store.state.settings.openAtLogin) setTimeout(() => applyLoginItem(true), 5000).unref();
  if (UPDATE_E2E) (async () => {
    await updater.check(); if (!updater.available) throw Error('Update test: no update offered. ' + updater.state.message);
    const stage = await updater.prepare(); await updater.launchInstaller(stage);
    quitting = true; app.quit();
  })().catch(e => { console.error('UPDATE E2E FAILED:', e); process.exitCode = 1; quitting = true; app.quit(); });
  else if (E2E) require('./scripts/e2e-desktop').run({app, win, root: __dirname}).catch(e => { console.error('E2E FAILED:', e); process.exitCode = 1; quitting = true; app.quit(); });
}).catch(e => { console.error(e); app.quit(); });
app.on('window-all-closed', () => { if (!tray || E2E) app.quit(); });
app.on('before-quit', () => { quitting = true; try { if (core) core.dispose(); } catch {} });
