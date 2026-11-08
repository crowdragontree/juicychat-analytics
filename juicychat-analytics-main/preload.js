'use strict';
const {contextBridge,ipcRenderer}=require('electron');
// What the window can ask the analytics core for (core/analytics.js, methods). Each one goes over the channel 'jat:<name>'.
const METHODS=['getState','saveSettings','tagsList','tagsFetch','openLogin','authStatus','finishLogin','resetLogin','collect','cancelCollect','analyzeEngines','performancePull','performanceEditorGone','perfSetRating','timingPool','successAims','historyClear','copyText','appVersion','hostInfo','runtimeStatus','runtimeInstall'];
const EVENTS={onCollectorProgress:'collector:progress',onAuthStatus:'juicy:authStatus',onAnalysisProgress:'analysis:progress',onAutoRun:'auto:run',onBgStep:'bg:step',onNeedLogin:'auth:needLogin',onRuntimeProgress:'runtime:progress'};
const api={};
for(const m of METHODS)api[m]=(...args)=>ipcRenderer.invoke('jat:'+m,...args);
for(const [k,ch] of Object.entries(EVENTS))api[k]=fn=>ipcRenderer.on(ch,(_e,d)=>fn(d));
// closing the window: Exit or keep running in the tray for the daily pulls
api.onCloseAsk=fn=>ipcRenderer.on('app:closeAsk',(_e,d)=>fn(d||{}));
api.onCloseAskCancel=fn=>ipcRenderer.on('app:closeAskCancel',()=>fn());
api.closeShown=()=>ipcRenderer.invoke('app:closeShown');
api.closeChoice=c=>ipcRenderer.invoke('app:closeChoice',c);
contextBridge.exposeInMainWorld('juicyApp',api);
// the app's own updates (the same updater as the JuicyChat Creator Tool)
contextBridge.exposeInMainWorld('jatApp',{
  updateState:()=>ipcRenderer.invoke('updates:state'),
  checkUpdates:()=>ipcRenderer.invoke('updates:check'),
  installUpdate:()=>ipcRenderer.invoke('updates:install'),
  onUpdateStatus:fn=>ipcRenderer.on('updates:status',(_e,x)=>fn(x))
});
