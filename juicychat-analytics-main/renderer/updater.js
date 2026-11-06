// Check for updates and Update & Restart, the same as the JuicyChat Creator Tool (GitHub Releases of crowdragontree/juicychat-analytics).
(()=>{
  'use strict';
  const api=window.jatApp;if(!api)return;          // not shown inside the Creator Tool: there the Analytics Tool updates itself
  const $=id=>document.getElementById(id);
  const check=$('jat-update-check'),install=$('jat-update-install'),state=$('jat-update-status'),version=$('app-version');
  if(!check||!install||!state)return;
  function render(status){
    if(!status)return;
    const p=status.phase||'idle';state.dataset.state=p;state.textContent=status.message||'Check for updates';
    if(status.currentVersion&&version)version.textContent='v'+status.currentVersion;
    check.disabled=['checking','downloading','verifying','staging','restarting'].includes(p);
    install.hidden=p!=='available';
    install.disabled=p!=='available';
  }
  api.onUpdateStatus(render);
  api.updateState().then(render).catch(e=>render({phase:'error',message:e.message}));
  check.addEventListener('click',async()=>{
    check.disabled=true;
    try{render(await api.checkUpdates());}catch(e){render({phase:'error',message:e.message});}
    finally{check.disabled=false;}
  });
  install.addEventListener('click',async()=>{
    install.disabled=true;
    try{await api.installUpdate();}catch(e){render({phase:'error',message:e.message});install.disabled=false;}
  });
})();
