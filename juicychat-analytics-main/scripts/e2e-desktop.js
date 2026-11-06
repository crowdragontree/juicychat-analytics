'use strict';
// Build-time test of the packaged app (GitHub workflow): opens every tab in the real window and checks that it draws.
const fs = require('node:fs');
const TABS = ['dashboard', 'performance', 'analysis', 'engines', 'settings'];
async function run({app, win}) {
  const report = {ok: false, tabs: {}, errors: []};
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) report.errors.push(message); });
  await new Promise(r => win.webContents.isLoading() ? win.webContents.once('did-finish-load', r) : r());
  const js = s => win.webContents.executeJavaScript(s);
  for (let i = 0; i < 100 && !(await js('!!window.__jatReady')); i++) await new Promise(r => setTimeout(r, 200));
  for (const t of TABS) {
    report.tabs[t] = await js(`(()=>{document.querySelector('.nav-btn[data-view="${t}"]').click();const v=document.getElementById('view-${t}');return {active:v.classList.contains('active'),text:v.innerText.length,title:document.getElementById('view-title').textContent};})()`);
    await new Promise(r => setTimeout(r, 300));
  }
  report.ok = TABS.every(t => report.tabs[t].active && report.tabs[t].text > 40) && !report.errors.length;
  if (process.env.JAT_E2E_REPORT) fs.writeFileSync(process.env.JAT_E2E_REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  process.exitCode = report.ok ? 0 : 1;
  app.quit();
}
module.exports = {run};
