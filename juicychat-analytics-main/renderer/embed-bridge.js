// Inside the JuicyChat Creator Tool's Analytics tab this page runs in a frame with no desktop bridge of its own.
// It then talks to the Creator Tool, which runs this same Analytics Tool code with the Creator Tool's own sign-in and data.
// In the Analytics Tool itself (window.juicyApp comes from preload.js) this file does nothing.
(function(){
  if(window.juicyApp||window.parent===window)return;
  const EVENT_CHANNELS={onCollectorProgress:'collector:progress',onAuthStatus:'juicy:authStatus',onAnalysisProgress:'analysis:progress',onAutoRun:'auto:run',onBgStep:'bg:step',onNeedLogin:'auth:needLogin',onRuntimeProgress:'runtime:progress'};
  let seq=0;const waiting=new Map(),listeners={};
  window.addEventListener('message',e=>{
    if(e.source!==window.parent)return;const m=e.data;if(!m||typeof m!=='object')return;
    if(m.type==='jat:response'&&waiting.has(m.id)){const w=waiting.get(m.id);waiting.delete(m.id);if(m.ok)w.resolve(m.value);else w.reject(new Error(m.error||'The Creator Tool did not answer.'));}
    else if(m.type==='jat:event'&&listeners[m.channel])for(const fn of listeners[m.channel])try{fn(m.payload);}catch(err){console.error(err);}
  });
  const call=(method,args)=>new Promise((resolve,reject)=>{const id=++seq;waiting.set(id,{resolve,reject});window.parent.postMessage({type:'jat:request',id,method,args:JSON.parse(JSON.stringify(args))},'*');});
  window.juicyApp=new Proxy({},{get(_,name){
    if(typeof name!=='string')return undefined;
    if(EVENT_CHANNELS[name])return fn=>{(listeners[EVENT_CHANNELS[name]]=listeners[EVENT_CHANNELS[name]]||[]).push(fn);};
    if(/^on[A-Z]/.test(name))return undefined;            // the Analytics Tool's own window events (closing to the tray) do not exist in the Creator Tool
    return (...args)=>call(name,args);
  }});
})();
