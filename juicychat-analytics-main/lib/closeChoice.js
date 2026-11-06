'use strict';
// What the window's close button (the X) does: ask once, then do what the person picks.
//   Exit                                       closes the whole app (nothing keeps running)
//   Close to System Tray (run in background)   hides the window; the app keeps running for the scheduled pulls and backups
//   Cancel                                     nothing happens, the window stays open
// The question is shown INSIDE the app window, in the tool's own style (the renderer draws it). `ask(trayOk)` returns a promise of
// 'exit' | 'tray' | 'cancel'. Everything it needs is passed in, so it can be tested without Electron.
const BUTTONS = ['Exit', 'Close to System Tray (run in background)', 'Cancel'];

function make({ask, isQuitting, hasTray, onExit, onTray, log = () => {}}) {
  let asking = false;
  return function onClose(event) {
    if (isQuitting()) return;                       // the app is already quitting (tray "Quit", an update, a restore): let the window close
    event.preventDefault();
    if (asking) return;                             // a second click on X while the question is open
    asking = true;
    Promise.resolve().then(() => ask(!!hasTray())).then(c => {
      asking = false;
      if (c === 'exit') { log('close: exit'); onExit(); }
      else if (c === 'tray') { log('close: to tray'); onTray(); }
      else log('close: cancelled');
    }).catch(err => { asking = false; log('close question failed: ' + (err && err.message)); });   // if the question cannot be shown nothing is closed
  };
}

// Last resort only: the page is not there to draw the question (still loading, crashed or not answering). A plain system box, so the X never does nothing.
function nativeAsk(dialog, win, trayOk) {
  const opts = trayOk
    ? {type: 'question', buttons: BUTTONS, defaultId: 2, cancelId: 2, noLink: true, title: 'Juicy Blueprint Studio', message: 'Close Juicy Blueprint Studio?', detail: 'Exit closes the app completely. Close to System Tray hides the window and keeps the app running in the background; open it again from the tray icon.'}
    : {type: 'question', buttons: [BUTTONS[0], BUTTONS[2]], defaultId: 1, cancelId: 1, noLink: true, title: 'Juicy Blueprint Studio', message: 'Close Juicy Blueprint Studio?', detail: 'The system tray is not available on this computer, so the app cannot keep running in the background.'};
  return Promise.resolve(dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, opts)).then(r => {
    const i = r && typeof r === 'object' ? r.response : r;
    return i === 0 ? 'exit' : (trayOk && i === 1 ? 'tray' : 'cancel');
  });
}
module.exports = {make, nativeAsk, BUTTONS};
