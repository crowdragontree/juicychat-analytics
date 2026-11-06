const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class PythonCollector {
  // runtimeDir: the scanner's private Python environment (JuicyChat Analytics Tool: installed on first use into a shared folder that app updates never replace)
  constructor(appRoot, profileDir, progressCb=()=>{}, authCb=()=>{}, {runtimeDir=null}={}) {
    this.appRoot = appRoot;
    this.runtimeDir = runtimeDir || path.join(appRoot,'.scanner-venv');
    this.profileDir = profileDir;
    this.progress = progressCb;
    this.authChanged = authCb;
    this.loginProc = null;
    this.scanProc = null;
    this.cancelRequested = false;
    this.batchActive = false;
    this.blockedTags = () => [];   // main.js sets this to the tags blocked in Settings; the scan worker skips bots that carry one
    this.loginMarkerPath = path.join(profileDir, 'python-market-scan-login.json');
    fs.mkdirSync(profileDir, {recursive:true});
  }
  pythonExe(){ if(process.env.JAT_SCANNER_PYTHON)return process.env.JAT_SCANNER_PYTHON; return process.platform==='win32'?path.join(this.runtimeDir,'Scripts','python.exe'):path.join(this.runtimeDir,'bin','python'); }
  worker(){ return path.join(this.appRoot,'scanner','worker.py'); }
  hasRuntime(){ return fs.existsSync(this.pythonExe()) && fs.existsSync(this.worker()) && (!this.readyFlag || !!process.env.JAT_SCANNER_PYTHON || fs.existsSync(this.readyFlag)); }
  ensureRuntime(){
    if(!this.hasRuntime()) throw new Error('The JuicyChat scanner is not installed yet. Go to Settings > JuicyChat sign-in and press Install scanner (one time only).');
  }
  emitAuth(status){ this.lastAuth=status; try{this.authChanged(status);}catch(_){} return status; }
  hasLoginMarker(){ return fs.existsSync(this.loginMarkerPath); }
  writeLoginMarker(result={}){
    try{fs.mkdirSync(this.profileDir,{recursive:true});fs.writeFileSync(this.loginMarkerPath,JSON.stringify({savedAt:new Date().toISOString(),...result},null,2));}catch(_){}
  }
  removeLoginMarker(){ try{fs.unlinkSync(this.loginMarkerPath);}catch(_){} }
  stopFile(name){ return path.join(this.profileDir,`.${name}-stop.flag`); }
  touch(p){ try{fs.writeFileSync(p,String(Date.now()));}catch(_){} }
  remove(p){ try{fs.unlinkSync(p);}catch(_){} }
  parseLines(child, handlers={}){
    let stdout=''; let stderr='';
    child.stdout.on('data', buf=>{
      stdout += buf.toString('utf8');
      let idx;
      while((idx=stdout.indexOf('\n'))>=0){
        const line=stdout.slice(0,idx).trim(); stdout=stdout.slice(idx+1);
        if(!line)continue;
        let msg; try{msg=JSON.parse(line);}catch(_){ continue; }
        if(msg.type==='log') this.progress({stage:'log',status:'collecting',message:msg.message});
        if(msg.type==='progress') handlers.progress?.(msg);
        if(msg.type==='auth') handlers.auth?.(msg);
        if(msg.type==='result') handlers.result?.(msg);
        if(msg.type==='diag') handlers.diag?.(msg);
        if(msg.type==='error') handlers.error?.(msg);
      }
    });
    child.stderr.on('data', b=>{ stderr += b.toString('utf8'); });
    return ()=>stderr.trim();
  }
  spawnWorker(args, handlers={}){
    this.ensureRuntime();
    const child=spawn(this.pythonExe(),[this.worker(),...args],{cwd:this.profileDir,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,JBS_EXPECT_SIGNED_IN:(this.hasLoginMarker()?'1':'0'),PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1',JBS_BLOCKED_TAGS:(()=>{try{return JSON.stringify(this.blockedTags()||[]);}catch(_){return '[]';}})(),JBS_SCAN_BOUNDS:(()=>{try{const b=this.windowBounds&&this.windowBounds();return Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)?b.map(Math.round).join(','):'';}catch(_){return '';}})()}});
    const getErr=this.parseLines(child,handlers);
    const done=new Promise((resolve,reject)=>{
      child.on('error',reject);
      child.on('exit',code=>{
        if(code===0)resolve();
        else reject(new Error(getErr()||`Market Scan worker exited with code ${code}.`));
      });
    });
    return {child,done};
  }
  async openLogin(magicLink){
    if(this.scanProc) throw new Error('A collection is currently running. Cancel it before opening sign-in.');
    if(this.loginProc) return this.emitAuth({signedIn:null,status:'checking',message:'A sign-in is already running in the background. Wait for it to finish.',checkedAt:new Date().toISOString()});
    const stop=this.stopFile('login'); this.remove(stop);
    const auth={signedIn:null,status:'checking',message:'Signing in with the magic link in the background...',checkedAt:new Date().toISOString()};
    this.emitAuth(auth);
    let result=null, workerError=null;
    const proc=this.spawnWorker(['login',this.profileDir,stop,String(magicLink||'https://juicychat.ai')],{
      auth:m=>this.emitAuth({...m,checkedAt:new Date().toISOString()}),
      result:m=>{ result=m.result||{}; },
      error:m=>{ workerError=new Error(m.message||'Market Scan login failed.'); }
    });
    this.loginProc={...proc,stop,result:null};
    const chain=proc.done.then(()=>{
      this.loginProc=null;
      if(result){this.writeLoginMarker(result);this.emitAuth({signedIn:true,status:'signed-in',message:'Signed in. The JuicyChat session is saved.',checkedAt:new Date().toISOString()});}
    }).catch(err=>{
      this.loginProc=null;
      this.emitAuth({signedIn:false,status:'signed-out',message:(workerError||err).message,checkedAt:new Date().toISOString()});
    });
    this.loginProc.chain=chain;
    return auth;
  }
  // Signs in with a magic link with no window: waits until the background sign-in is done and returns the final status.
  async signIn(magicLink){
    const first=await this.openLogin(magicLink);
    const p=this.loginProc;
    if(!p) return first;
    try{await p.chain;}catch(_){}
    return this.lastAuth||first;
  }
  async finishLogin(){
    if(!this.loginProc){
      if(this.hasLoginMarker()) return this.emitAuth({signedIn:true,status:'signed-in',message:'A saved Market Scan JuicyChat profile is available.',checkedAt:new Date().toISOString()});
      return this.emitAuth({signedIn:false,status:'signed-out',message:'No Market Scan sign-in is currently open.',checkedAt:new Date().toISOString()});
    }
    const p=this.loginProc; this.touch(p.stop);
    try{await p.done;}catch(err){return this.emitAuth({signedIn:false,status:'signed-out',message:err.message,checkedAt:new Date().toISOString()});}
    this.writeLoginMarker();
    return this.emitAuth({signedIn:true,status:'signed-in',message:'JuicyChat session saved. Collection will use the exact same persistent Chromium profile as the supplied Market Scan.',checkedAt:new Date().toISOString()});
  }
  async checkAuth(){
    if(this.loginProc)return this.emitAuth({signedIn:null,status:'checking',message:'A sign-in is still running in the background.',checkedAt:new Date().toISOString()});
    if(this.hasLoginMarker())return this.emitAuth({signedIn:true,status:'signed-in',message:'A saved JuicyChat Market Scan browser profile is available.',checkedAt:new Date().toISOString()});
    return this.emitAuth({signedIn:false,status:'signed-out',message:'No saved JuicyChat Market Scan login exists yet. Paste a fresh magic link and click Sign in.',checkedAt:new Date().toISOString()});
  }
  async resetLogin(){
    if(this.loginProc){this.touch(this.loginProc.stop);try{await this.loginProc.done;}catch(_){}this.loginProc=null;}
    if(this.scanProc){this.touch(this.scanProc.stop);try{await this.scanProc.done;}catch(_){}this.scanProc=null;}
    this.removeLoginMarker();
    try{fs.rmSync(this.profileDir,{recursive:true,force:true});}catch(_){}
    fs.mkdirSync(this.profileDir,{recursive:true});
    return this.emitAuth({signedIn:false,status:'signed-out',message:'Saved Market Scan JuicyChat profile cleared.',checkedAt:new Date().toISOString()});
  }
  beginCollectionBatch(){ this.cancelRequested=false; this.batchActive=true; }
  endCollectionBatch(){ this.batchActive=false; this.cancelRequested=false; }
  isCancelRequested(){ return !!this.cancelRequested; }
  async cancelCollection(){
    this.cancelRequested=true;
    this.progress({stage:'cancelling',status:'cancelling',message:'Cancelling the transplanted Market Scan and keeping anything it has already captured...'});
    if(this.scanProc)this.touch(this.scanProc.stop);
    return {ok:true};
  }
  async collect(section,target,homeUrl,gender='Female',context={}){
    if(this.loginProc)throw new Error('A sign-in is still running in the background. Wait for it to finish before collecting.');
    if(this.scanProc)throw new Error('The Market Scan is already running.');
    this.cancelRequested=false;
    target=Math.max(1,Math.min(500,Number(target)||100));
    const batchIndex=Number(context.batchIndex)||1,batchCount=Number(context.batchCount)||1,completedBefore=Number(context.completedBefore)||0,overallTarget=Number(context.overallTarget)||target;
    const started=Date.now();
    let result=null,workerError=null;
    const stop=this.stopFile('scan'); this.remove(stop);
    const proc=this.spawnWorker(['scan',this.profileDir,stop,String(section),String(target)],{
      progress:m=>{
        const current=Number(m.current)||0;
        this.progress({
          sortName:section,source:section,target,current,batchIndex,batchCount,
          overallCurrent:Math.min(overallTarget,completedBefore+current),overallTarget,
          elapsedMs:Date.now()-started,pass:Number(m.passNo)||0,maxPasses:Number(m.maxPasses)||0,
          pageCards:Number(m.pageCards)||0,networkRecords:Number(m.networkResponses)||0,
          stagnantPasses:Number(m.stagnantPasses)||0,status:m.status||'collecting',stage:m.stage||'collecting',
          clickedSection:m.clickedSection,message:m.message||`${section}: ${current}/${target}`
        });
      },
      result:m=>{result=m;},
      error:m=>{workerError=new Error(m.message||'Market Scan failed.');}
    });
    this.scanProc={...proc,stop};
    try{await proc.done;}catch(err){ if(!this.cancelRequested)throw(workerError||err); }
    finally{this.scanProc=null;}
    const rows=(result?.rows||[]).slice(0,target);
    const cancelled=!!(result?.cancelled||this.cancelRequested);
    if(cancelled){this.progress({stage:'cancelled',status:'cancelled',sortName:section,source:section,current:rows.length,target,overallCurrent:Math.min(overallTarget,completedBefore+rows.length),overallTarget,batchIndex,batchCount,message:`Collection cancelled. Keeping ${rows.length} ${section} bot records captured so far.`});return{rows,cancelled:true,skipped:result?.skipped||[]};}
    if(!rows.length)throw new Error(`The transplanted Market Scan returned zero ${section} bot records. The Python scanner itself ran, but JuicyChat did not expose any bot records to that session.`);
    this.progress({stage:rows.length>=target?'done':'partial',status:rows.length>=target?'done':'partial',sortName:section,source:section,current:rows.length,target,overallCurrent:Math.min(overallTarget,completedBefore+rows.length),overallTarget,batchIndex,batchCount,message:rows.length>=target?`Collected ${rows.length}/${target} ${section} bots with the transplanted Market Scan.`:`Captured ${rows.length}/${target} ${section} bots before JuicyChat stopped yielding new records.`});
    return{rows,cancelled:false,skipped:result?.skipped||[]};
  }
  // Reads JuicyChat's own tag list (the filter tags it loads, plus the tags on the bots on its front page) with the saved sign-in.
  async collectTags(){
    if(this.loginProc)throw new Error('A sign-in is still running in the background. Wait for it to finish first.');
    if(this.scanProc)throw new Error('A collection is running. Try again when it finishes.');
    let result=null,workerError=null;
    const stop=this.stopFile('tags'); this.remove(stop);
    const proc=this.spawnWorker(['tags',this.profileDir,stop],{
      progress:()=>{},   // the Settings panel shows the result; the collection progress box is left alone
      result:m=>{result=m;},
      error:m=>{workerError=new Error(m.message||'Reading the tags failed.');}
    });
    this.scanProc={...proc,stop};
    try{await proc.done;}catch(err){throw(workerError||err);}
    finally{this.scanProc=null;}
    return (result&&result.tags)||[];
  }
  // Reads the signed-in user's own bots from their JuicyChat profile (Performance tab).
  async collectMyBots(profileUrl='',mode='lounge'){
    if(this.loginProc)throw new Error('A sign-in is still running in the background. Wait for it to finish first.');
    if(this.scanProc)throw new Error('A collection is already running. Try again when it finishes.');
    this.cancelRequested=false;
    let result=null,workerError=null,diag=null;
    const stop=this.stopFile('mybots'); this.remove(stop);
    const proc=this.spawnWorker(['mybots',this.profileDir,stop,String(profileUrl||'-'),mode==='own'?'own':'lounge'],{
      progress:m=>this.progress({sortName:m.phase||'Your bots',source:'Mine',target:Number(m.target)||0,current:Number(m.current)||0,overallCurrent:Number(m.current)||0,overallTarget:Number(m.target)||0,status:m.status||'collecting',stage:m.stage||'collecting',message:m.message||'Reading your bots...'}),
      result:m=>{result=m;},
      diag:m=>{diag={...(diag||{}),...m};},
      error:m=>{workerError=new Error(m.message||'Reading your bots failed.');}
    });
    this.scanProc={...proc,stop};
    try{await proc.done;}catch(err){ if(!this.cancelRequested)throw(workerError||err); }
    finally{this.scanProc=null;}
    if(workerError&&!(result?.rows||[]).length)throw workerError;
    return{rows:result?.rows||[],profileUrl:result?.profileUrl||profileUrl||'',diag,cancelled:!!(result?.cancelled||this.cancelRequested)};
  }
}

module.exports={PythonCollector};
