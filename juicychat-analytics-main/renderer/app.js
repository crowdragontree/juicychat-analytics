// JuicyChat Analytics Tool window. Taken from Juicy Blueprint Studio 1.6.0's window (renderer/app.js), with only the analytics tabs.
window.addEventListener('dragover',e=>{if(e.defaultPrevented)return;if([...(e.dataTransfer?.types||[])].includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='none';}});
window.addEventListener('drop',e=>{if(!e.defaultPrevented)e.preventDefault();});
let IS_SHARE=true;      // one account, as in Blueprint Studio's Shareable edition
async function copyText(text){
  const t=String(text??'');
  try{if(window.juicyApp&&window.juicyApp.copyText){await window.juicyApp.copyText(t);return true;}}catch(_){}
  try{await copyText(t);return true;}catch(_){}
  try{const ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();return ok;}catch(_){return false;}
}
window.copyText=copyText;
let state = null;
let authStatus = {signedIn:null,status:'unknown',message:'Session not checked yet.'};
let collectorUi = {active:false,startedAt:0,lastIncreaseAt:0,lastCurrent:0,lastSource:'',lastLogKey:'',timer:null};
const $ = id => document.getElementById(id);
const qsa = sel => [...document.querySelectorAll(sel)];
const viewMeta = {
  dashboard:['Dashboard','Research signals and your bots\' performance in one place.'],
  analysis:['JuicyChat Analysis','Collect Recent + Trending data and turn it into reusable success engines locally.'],
  performance:['Your Performance','How your bots are doing on JuicyChat.'],
  engines:['Engine Library','Inspect the structural patterns measured across Recent and Trending.'],
  settings:['Settings','Your JuicyChat sign-in, the automatic daily pulls, collection targets and blocked tags.']
};
const TIPS={
  summaryHead:"A local summary of what the bots you collected have in common. It is built on your computer from the saved bots: the newest scrape plus your whole scrape history, weighted toward recent scrapes. No AI is used.",
  localChip:"Worked out on your computer from the saved bots. No AI is called, so it costs nothing.",
  dnaRelationship:"The relationship to the player (wife, ex, roommate, rival...) that appears most among the collected bots. Trending bots and higher-ranked bots count for more.",
  dnaHook:"The opening situation (a return, a discovery, a deadline, a confession...) that the collected bots use most to get the first reply.",
  dnaSetting:"The kind of place or world the collected bots are most often set in.",
  dnaArchetype:"The personality archetype (Tsundere, Kuudere...) that shows up most among the collected bots, when one clearly leads.",
  metricRecent:"How many bots were collected from JuicyChat's Recent feed: the newest bots.",
  metricTrending:"How many bots were collected from the Trending feed: the bots people are chatting with right now.",
  metricUnique:"How many different bots there are across both samples. A bot in both lists counts once. A bigger unique sample makes the analysis more reliable.",
  metricEngines:"How many success engines were measured. An engine is a repeatable combination of relationship + opening hook + setting that the collected bots share.",
  metricProgress:"How many of this week's cards are marked Built out of this week's target.",
  metricAvg:"The average Success Estimate of this week's cards. It is an estimate from your collected data, not a result.",
  metricBest:"The week's card with the highest Success Estimate.",
  sourceTop:"The most common relationship + hook + setting combination in this list.",
  sourceMedian:"The middle visible engagement number across this list: half the bots have more, half have less. A few huge bots do not distort it.",
  sourceAvg:"The average visible engagement (the chat and like numbers the page shows) across this list. A few huge bots can pull it up.",
  engineRank:"Rank among the measured engines. #1 is the strongest.",
  engineStrength:"How strong this engine is, from 35 to 99. It combines how often the engine appears with extra weight for Trending bots, high ranks and engagement, plus a small bonus (up to +5) when your own bots on this engine got conversations.",
  engineBots:"How many collected bots use this engine, and what share of the whole sample that is.",
  engineRT:"R = how many of those bots came from Recent, T = from Trending. More T means the engine holds attention, not just newly posted bots.",
  engineTrend:"Where the engine shows up: stronger in Trending (keeps people chatting), stronger in Recent (new and rising), mainly in one list, or stable across both.",
  engineSat:"Saturation is how crowded the engine is. High = more than 18% of the sample uses it, Medium = more than 9%. A crowded engine needs a fresher twist to stand out.",
  engineMomentum:"Whether the engine is gaining or losing share among the newest bots compared with older scrapes (needs scrapes on different days). Rising = 1.3x or more, Fading = 0.75x or less.",
  engineConf:"How much evidence stands behind the engine: High = 12 or more bots, Medium = 6 or more, Low = fewer.",
  enginePct:"The share of the whole collected sample that uses this engine.",
  mechanism:"How the engine works: the emotional stake, the opening hook and the setting that keep the pressure repeating.",
  whyWorks:"Why bots built this way keep people chatting.",
  historyPanel:"Every bot you collect is kept. Engines are measured on the whole history, weighted toward recent scrapes, with extra credit for bots that stay on Trending.",
  botsAnalyzed:"The bots the analysis was built from, with their rank in each feed.",
  successEstimate:"A score out of 100 for how well this idea should do, judged against the bots you collected from Recent and Trending: how well it matches a measured success engine, how the most similar collected bots perform, whether similar bots sit on Trending, how clear the opening and the relationship are, and (when an event is on) event fit and your own past results. It is an estimate from your data, not a guarantee.",
  band:"The Success Estimate in words: Strong = 75 or more, Promising = 60 to 74, Average = 45 to 59, Weak = under 45.",
  confidence:"How much data stands behind the Success Estimate. High = 150 or more collected bots and 6 or more similar bots found. Medium = 60 or more bots and 3 or more similar. Low = less than that, or nothing collected yet.",
  novelty:"How different this card is from the OTHER cards in the same week: 100 = nothing else this week reads like it, a low number = it overlaps heavily with another card. It compares this card's Scene Name and Setup with every other card's. It is not a prediction of success (that is the Success Estimate, which looks at the collected Recent and Trending bots). It only nudges the estimate: a small bonus at 75 or more, a penalty under 45.",
  observedEngine:"The measured success engine this card was built on, or matches best.",
  learned:"Real results from your own bots (Performance tab) showed the estimates running high or low, so this card's estimate was moved by this many points.",
  eventTag:"The event this card is entered in. None means it is not entered in an event.",
  moved:"Each line is something that raised (+) or lowered (-) the estimate, and by how many points.",
  raise:"Changes that would raise the Success Estimate.",
  similarBots:"The collected bots whose idea is closest to this card. Similarity is how much of the story building blocks and wording they share.",
  'Matches a measured success engine':"The card shares the opening hook and/or setting (and the relationship, when the idea has one) of one of the measured engines. A story is never marked down for not having the engine's relationship. The closer the match and the stronger the engine, the more points.",
  'Crowded engine':"The best-matching engine is already very common in the collected bots, so this card needs a fresh angle to stand out. A small penalty.",
  'No measured engine match':"None of the measured engines share a relationship, opening or setting with this idea. A small penalty.",
  'How similar bots perform':"How the most similar collected bots do on engagement compared with the rest of their feed (percentile). Similar bots near the top raise the estimate; ones near the bottom lower it.",
  'Presence on Trending':"Whether similar bots are on Trending more than the sample as a whole. Trending means people keep chatting, so being over-represented there is a good sign.",
  'Similar bots in Trending top 25':"Similar bots sitting in the Trending top 25 prove the idea can reach the top. Up to +6.",
  'Saturation':"Many collected bots are very close to this idea, so it will have to compete with near copies. Up to -10.",
  'Rising in Recent':"Similar brand-new bots are already getting top-quarter engagement in Recent: the idea is catching on. Up to +5.",
  'Nothing similar collected':"No collected bot is close to this idea. That can mean an open niche, but there is no evidence either way, so no points either way.",
  'Clear opening situation':"The idea says what is happening when the chat starts, which gives the player something to react to immediately.",
  'No clear opening situation':"The idea does not yet say what is happening at the first message.",
  'Built-in relationship stakes':"The idea names a relationship to the player (wife, ex, roommate...) or says the two meet for the first time, which gives a reason to care from the first line.",
  'Fits the active event':"The card uses one of the active event's opportunity tags.",
  'Your past results with this engine':"How your own bots on this engine did compared with your average (conversations). Between -5 and +5.",
  tableSource:"Which list the bot was collected from: Recent or Trending.",
  tableRank:"The bot's position in that list when it was collected (1 = top).",
  tableEng:"The engagement number the page showed for the bot (chats and likes), scaled to a comparable estimate.",
  tableCard:"The bot's name and the text of its card as collected."
};
const tip=k=>TIPS[k]?`data-tip="${esc(TIPS[k])}"`:'';
const tipI=k=>TIPS[k]?`<span class="tip-i" tabindex="0" role="note" data-tip="${esc(TIPS[k])}">ⓘ</span>`:'';
(function(){let box=null,cur=null;
  const ensure=()=>{if(!box){box=document.createElement('div');box.id='jbs-tip';box.setAttribute('role','tooltip');document.body.appendChild(box);}return box;};
  const hide=()=>{if(box)box.style.display='none';cur=null;};
  const show=el=>{const t=el.getAttribute('data-tip');if(!t)return;const b=ensure();b.textContent=t;b.style.display='block';const r=el.getBoundingClientRect(),w=b.offsetWidth,h=b.offsetHeight;
    const x=Math.min(Math.max(8,r.left+r.width/2-w/2),Math.max(8,window.innerWidth-w-8));let y=r.top-h-8;if(y<8)y=Math.min(r.bottom+8,window.innerHeight-h-8);b.style.left=x+'px';b.style.top=y+'px';cur=el;};
  document.addEventListener('mouseover',e=>{const el=e.target&&e.target.closest?e.target.closest('[data-tip]'):null;if(el){if(el!==cur)show(el);}else if(cur)hide();});
  document.addEventListener('focusin',e=>{const el=e.target&&e.target.closest?e.target.closest('[data-tip]'):null;if(el)show(el);});
  document.addEventListener('focusout',hide);document.addEventListener('scroll',hide,true);document.addEventListener('mousedown',hide,true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
})();
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtNum(n){if(n==null||n==='')return'–';const x=Number(n);if(!Number.isFinite(x))return String(n);if(x>=1e6)return(x/1e6).toFixed(x>=1e7?0:1)+'M';if(x>=1e3)return(x/1e3).toFixed(x>=1e4?0:1)+'k';return x.toLocaleString();}
function fmtDate(s){if(!s)return'Never';const d=new Date(s);return Number.isNaN(d.getTime())?s:d.toLocaleString();}
function toast(msg,error=false){const el=$('toast');el.textContent=msg;el.className='toast show'+(error?' error':'');clearTimeout(toast.t);toast.t=setTimeout(()=>el.className='toast',4000);}
function fmtElapsedMs(ms){ms=Math.max(0,Number(ms)||0);const sec=Math.floor(ms/1000),m=Math.floor(sec/60),s=sec%60;return `${m}:${String(s).padStart(2,'0')}`;}
function setCollectorStatus(label,cls=''){const el=$('busy-status-pill');if(!el)return;el.textContent=label;el.className='busy-status-pill'+(cls?' '+cls:'');}
function collectorLog(message,kind=''){const box=$('collector-live-log');if(!box||!message)return;const now=new Date(),stamp=now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});const line=document.createElement('div');line.className='collector-log-line'+(kind?' '+kind:'');line.innerHTML=`<span class="collector-log-time">${esc(stamp)}</span>${esc(message)}`;box.appendChild(line);while(box.children.length>500)box.removeChild(box.firstChild);box.scrollTop=box.scrollHeight;}
function startCollectorUiReset(){collectorUi.pull=null;const h=document.getElementById('pull-steps');if(h){h.classList.add('hidden');h.innerHTML='';}const g=document.getElementById('collector-stat-grid');if(g)g.classList.remove('hidden');const l=document.querySelector('.collector-progress-label span');if(l)l.textContent='Current feed';}
function startCollectorUi(){startCollectorUiReset();collectorUi.active=true;collectorUi.startedAt=Date.now();collectorUi.lastIncreaseAt=Date.now();collectorUi.lastCurrent=0;collectorUi.lastSource='';collectorUi.lastLogKey='';$('collector-live')?.classList.remove('hidden');if($('collector-live-log'))$('collector-live-log').innerHTML='';for(const [id,value] of [['collector-live-source','Preparing'],['collector-live-count','0 / 100'],['collector-source-percent','0%'],['collector-pass','0 / 260'],['collector-page-cards','0'],['collector-network','0'],['collector-duplicates','0'],['collector-stagnant','0'],['collector-batch','1 / 1'],['collector-elapsed','0:00'],['collector-stall-label','Starting']])if($(id))$(id).textContent=value;if($('collector-source-bar'))$('collector-source-bar').style.width='0%';if($('collector-overall-bar'))$('collector-overall-bar').style.width='0%';$('collector-overall-block')?.classList.add('hidden');setCollectorStatus('STARTING');collectorLog('Collector started. Waiting for the JuicyChat feed...');clearInterval(collectorUi.timer);collectorUi.timer=setInterval(()=>{if(!collectorUi.active)return;if($('collector-elapsed'))$('collector-elapsed').textContent=fmtElapsedMs(Date.now()-collectorUi.startedAt);const quiet=Date.now()-collectorUi.lastIncreaseAt;if(quiet>12000&&collectorUi.lastCurrent>0){if($('collector-stall-label'))$('collector-stall-label').textContent=`No new bots for ${Math.floor(quiet/1000)}s`;if(quiet>20000)setCollectorStatus('STALLED','stalled');}},1000);}
function stopCollectorUi(){collectorUi.active=false;clearInterval(collectorUi.timer);collectorUi.timer=null;}
const PULL_STEPS=[['Your bots','Reading your bots'],['Feed positions','Checking feed positions'],['Ratings','Reading SFW / NSFW / 18+ ratings']];
function updatePullProgress(p){const u=collectorUi;if(p.message&&p.message!==u.lastPullMsg){u.lastPullMsg=p.message;collectorLog(p.message,p.status==='done'||p.status==='saved'?'good':'');}u.pull=u.pull||{accountIndex:1,accountCount:1,account:'',step:0,steps:PULL_STEPS.map(x=>x[0])};const P=u.pull;
  if(p.pull){P.account=p.account||P.account;P.accountIndex=p.accountIndex||1;P.accountCount=p.accountCount||1;P.step=0;P.extra=null;}
  const ph=p.sortName||'';const i=PULL_STEPS.findIndex(x=>x[0]===ph);
  if(i>=0&&i>=P.step)P.step=i;else if(/Finding bots|Reading bot pages/.test(ph)){P.extra=ph;P.step=0;}
  const done=p.stage==='batch-done'||p.stage==='partial';
  const stepsDone=done?PULL_STEPS.length:P.step+((Number(p.target)>0&&Number(p.current)>=Number(p.target))?1:0);
  const overall=Math.round(((P.accountIndex-1)+Math.min(1,stepsDone/PULL_STEPS.length))/P.accountCount*100);
  const host=$('pull-steps');if(!host)return;host.classList.remove('hidden');
  ['collector-stat-grid'].forEach(id=>{const e=$(id);if(e)e.classList.add('hidden');});
  const lbl=document.querySelector('.collector-progress-label span');if(lbl)lbl.textContent=P.accountCount>1?`${P.account} (${P.accountIndex} of ${P.accountCount}) · overall`:`${P.account||'Your bots'} · overall`;
  if($('collector-source-percent'))$('collector-source-percent').textContent=`${done&&P.accountIndex===P.accountCount?100:overall}%`;if($('collector-source-bar'))$('collector-source-bar').style.width=(done&&P.accountIndex===P.accountCount?100:overall)+'%';
  if($('collector-live-source'))$('collector-live-source').textContent=P.account||'Your bots';
  if(done&&P.accountIndex===P.accountCount){if($('collector-source-percent'))$('collector-source-percent').textContent='100%';if($('collector-source-bar'))$('collector-source-bar').style.width='100%';}
  if($('collector-live-count'))$('collector-live-count').textContent=done?'Done':`Step ${Math.min(P.step+1,PULL_STEPS.length)} of ${PULL_STEPS.length}`;
  host.innerHTML=PULL_STEPS.map(([k,label],j)=>{const st=done||j<P.step?'done':j===P.step?'now':'next';const det=st==='now'&&Number(p.target)>0&&Number(p.current)>0?` <small>${Number(p.current)} / ${Number(p.target)}</small>`:'';
    return `<div class="ps ${st}"><span class="ps-dot">${st==='done'?'✓':st==='now'?'●':''}</span><span>${j===0&&P.extra&&st==='now'?esc(P.extra):label}${det}</span></div>`;}).join('');
}
function updateCollectorLive(p={}){if(!collectorUi.active)startCollectorUi();
  // a line from the collector's own log (a bot name, who made it, a note) is always shown, one line each, and moves no bars
  if(p.stage==='log'&&p.message){if(p.message!==collectorUi.lastPullMsg){collectorUi.lastPullMsg=p.message;collectorLog(p.message);}if(!collectorUi.pull&&$('busy-text'))$('busy-text').textContent=p.message;return;}
  // once a bot pull has started, every message belongs to it (including the final 'done')
  if(p.pull||p.source==='Mine'||collectorUi.pull){updatePullProgress(p);return;}const source=p.stage==='batch-done'?'All feeds':(p.sortName||p.source||collectorUi.lastSource||'Preparing');const current=Number(p.current)||0,known=Number(p.target)>0,target=known?Number(p.target):Math.max(1,current);if(source!==collectorUi.lastSource){collectorUi.lastSource=source;collectorUi.lastCurrent=0;collectorUi.lastIncreaseAt=Date.now();collectorLog(`Now collecting ${source}.`);}const grew=current>collectorUi.lastCurrent;if(grew){collectorUi.lastIncreaseAt=Date.now();collectorUi.lastCurrent=current;}const pct=Math.max(0,Math.min(100,Math.round(current/target*100)));if($('collector-live-source'))$('collector-live-source').textContent=source;if($('collector-live-count'))$('collector-live-count').textContent=known?`${current} / ${target}`:`${current} found`;if($('collector-source-percent'))$('collector-source-percent').textContent=`${pct}%`;if($('collector-source-bar'))$('collector-source-bar').style.width=pct+'%';if($('collector-pass'))$('collector-pass').textContent=`${Number(p.pass)||0} / ${Number(p.maxPasses)||260}`;if($('collector-page-cards'))$('collector-page-cards').textContent=Number(p.pageCards)||0;if($('collector-network'))$('collector-network').textContent=Number(p.networkRecords)||0;if($('collector-duplicates'))$('collector-duplicates').textContent=Number(p.duplicates)||0;if($('collector-stagnant'))$('collector-stagnant').textContent=Number(p.stagnantPasses)||0;if($('collector-batch'))$('collector-batch').textContent=`${Number(p.batchIndex)||1} / ${Number(p.batchCount)||1}`;if($('collector-elapsed'))$('collector-elapsed').textContent=fmtElapsedMs(Date.now()-collectorUi.startedAt);if(Number(p.overallTarget)>target||Number(p.batchCount)>1){$('collector-overall-block')?.classList.remove('hidden');const oc=Number(p.overallCurrent)||0,ot=Math.max(1,Number(p.overallTarget)||target);if($('collector-overall-count'))$('collector-overall-count').textContent=`${oc} / ${ot}`;if($('collector-overall-bar'))$('collector-overall-bar').style.width=Math.max(0,Math.min(100,Math.round(oc/ot*100)))+'%';}else $('collector-overall-block')?.classList.add('hidden');const status=String(p.status||p.stage||'collecting');if(status==='done'||status==='saved')setCollectorStatus(status==='saved'?'SAVED':'DONE','done');else if(status==='error')setCollectorStatus('ERROR','error');else if(status==='cancelled')setCollectorStatus('CANCELLED','stalled');else if(status==='cancelling')setCollectorStatus('CANCELLING','stalled');else if(status==='stalled'||Number(p.stagnantPasses)>=16)setCollectorStatus('STALLED','stalled');else if(status==='waiting'||Number(p.stagnantPasses)>=6)setCollectorStatus('WAITING','stalled');else setCollectorStatus(status==='starting'?'STARTING':'COLLECTING');if($('collector-stall-label'))$('collector-stall-label').textContent=Number(p.stagnantPasses)>=6?`No-new passes: ${Number(p.stagnantPasses)||0}`:'Scanning';if($('busy-text'))$('busy-text').textContent=p.message||`${source}: ${current}/${target}`;const key=`${p.stage}|${source}|${current}|${p.pass}|${p.status}`;if(key!==collectorUi.lastLogKey&&(p.stage!=='collecting'||grew||Number(p.pass)%5===0||Number(p.stagnantPasses)>=6)){collectorUi.lastLogKey=key;collectorLog(p.message||`${source}: ${current}/${target}`,status==='done'||status==='saved'?'good':status==='stalled'||status==='waiting'?'warn':'');}}
let busyHome='';
function busyMiniSize(){const c=document.querySelector('#busy .busy-card');if(c&&document.body.classList.contains('busy-mini'))document.body.style.setProperty('--bm-h',c.offsetHeight+'px');}
function busyMinimize(){const b=$('busy');if(!b||b.classList.contains('hidden')||!b.classList.contains('collect-mode'))return;document.body.classList.add('busy-mini');const m=$('collector-min');if(m)m.textContent='Show details';busyMiniSize();}
function busyRestore(){document.body.classList.remove('busy-mini');const m=$('collector-min');if(m)m.textContent='Minimize';}
if(typeof ResizeObserver!=='undefined')setTimeout(()=>{const c=document.querySelector('#busy .busy-card');if(c)new ResizeObserver(busyMiniSize).observe(c);},0);
document.addEventListener('click',e=>{const t=e.target;if(!t||!t.closest)return;
  if(t.closest('#collector-min')){e.preventDefault();document.body.classList.contains('busy-mini')?busyRestore():busyMinimize();return;}
  if(document.body.classList.contains('busy-mini')&&t.closest('#busy .busy-head'))busyRestore();});
function busy(on,title='Working...',text='Please keep this window open.',mode='default'){ $('busy').classList.toggle('hidden',!on);$('busy').classList.toggle('collect-mode',!!on&&mode==='collector');if(on&&mode==='collector'){const av=document.querySelector('.view.active');busyHome=av?av.id.replace(/^view-/,''):'';}if(!on)busyRestore();if(on&&mode==='collector')text='It keeps running if you go to another tab.';$('busy-title').textContent=title;$('busy-text').textContent=text;if(on&&mode==='collector')startCollectorUi();else if(on)$('collector-live')?.classList.add('hidden');if(!on)stopCollectorUi(); }
async function runBusy(title,fn,mode='default'){try{busy(true,title,'Please keep this window open.',mode);const res=await fn();if(res)state=res;renderAll();return res;}catch(e){console.error(e);if(mode==='collector'){setCollectorStatus('ERROR','error');collectorLog(e.message||String(e),'warn');}toast(e.message||String(e),true);}finally{if(mode==='collector'){if(collectorUi.analysisDone){await holdCollectorResult();}else await new Promise(r=>setTimeout(r,collectorUi.analysisSeen?1800:350));}collectorUi.analysisSeen=false;collectorUi.analysisDone=false;busy(false);}}
function holdCollectorResult(){return new Promise(res=>{const c=$('collector-close'),x=$('cancel-collection');if(!c){setTimeout(res,1800);return;}stopCollectorUi();if(x)x.classList.add('hidden');c.classList.remove('hidden');document.querySelector('#busy .spinner')?.classList.add('hidden');document.querySelector('#busy .busy-head')?.classList.add('no-spin');const done=()=>{c.classList.add('hidden');if(x)x.classList.remove('hidden');document.querySelector('#busy .spinner')?.classList.remove('hidden');document.querySelector('#busy .busy-head')?.classList.remove('no-spin');c.onclick=null;res();};c.onclick=done;try{c.focus();}catch(_){}});}
function askText({title,message='',value='',placeholder='',type='text',okLabel='Save'}){return new Promise(resolve=>{
  const ov=document.createElement('div');ov.className='ask-overlay';
  ov.innerHTML=`<div class="ask-box" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>${message?`<p>${esc(message)}</p>`:''}<input class="ask-input" type="${type}" ${type==='number'?'min="1" step="1"':''} placeholder="${esc(placeholder)}" value="${esc(value)}"><div class="button-row"><button class="primary ask-ok">${esc(okLabel)}</button><button class="ghost ask-cancel">Cancel</button></div></div>`;
  document.body.appendChild(ov);const inp=ov.querySelector('.ask-input');setTimeout(()=>{inp.focus();inp.select();},30);
  const done=v=>{ov.remove();resolve(v);};
  ov.querySelector('.ask-ok').onclick=()=>done(inp.value);ov.querySelector('.ask-cancel').onclick=()=>done(null);
  ov.onclick=e=>{if(e.target===ov)done(null);};inp.onkeydown=e=>{if(e.key==='Enter')done(inp.value);if(e.key==='Escape')done(null);};});}
window.askText=askText;
let loginPopupOpen=false;
function askMagicLink({account='tool',label='This account',message=''}={}){
  if(loginPopupOpen)return;loginPopupOpen=true;
  const ov=document.createElement('div');ov.className='ask-overlay';
  ov.innerHTML=`<div class="ask-box" role="dialog" aria-modal="true"><h3>${esc(label)} is logged out</h3><p>You need to log back in to scrape. Paste a fresh magic link from the account's email. The app signs in by itself in the background; no browser opens.</p><input class="ask-input" type="password" placeholder="https://... magic link"><p class="ask-msg" style="margin:10px 0 0"></p><div class="button-row"><button class="primary ask-ok">Sign in</button><button class="ghost ask-cancel">Not now</button></div></div>`;
  document.body.appendChild(ov);const inp=ov.querySelector('.ask-input'),msg=ov.querySelector('.ask-msg'),ok=ov.querySelector('.ask-ok');setTimeout(()=>inp.focus(),30);
  const close=()=>{loginPopupOpen=false;ov.remove();};
  const go=async()=>{const link=inp.value.trim();if(!/^https:\/\//i.test(link)){msg.textContent='Paste the full https:// magic link.';return;}
    ok.disabled=true;inp.disabled=true;msg.textContent='Signing in in the background...';
    try{
      let signed;
      if(account==='tool'){const r=await window.juicyApp.openLogin(link);signed=!!r?.ok;if(!signed)msg.textContent=r?.auth?.message||'The sign-in was not confirmed.';}
      else{state=await window.juicyApp.accountOpenLogin(account,link);signed=!!(state.accounts||{})[account]?.signedIn?.ok;if(!signed)msg.textContent='The sign-in was not confirmed. The magic link may be expired or already used.';renderAll();}
      if(signed){close();toast(`${label} is signed in. Start the collection again.`);return;}
    }catch(e){msg.textContent=e.message||String(e);}
    ok.disabled=false;inp.disabled=false;inp.focus();};
  ok.onclick=go;ov.querySelector('.ask-cancel').onclick=close;inp.onkeydown=e=>{if(e.key==='Enter')go();if(e.key==='Escape')close();};}
window.askMagicLink=askMagicLink;
const METRIC_TIP={'Recent':'metricRecent','Trending':'metricTrending','Unique URLs':'metricUnique','Recent sample':'metricRecent','Trending sample':'metricTrending','Success engines':'metricEngines','Week progress':'metricProgress','Built':'metricProgress','Avg prediction':'metricAvg','Best candidate':'metricBest'};
function metric(label,value,detail=''){return`<div class="metric"><div class="label" ${tip(METRIC_TIP[label])}>${esc(label)}</div><div class="value">${esc(value)}</div><div class="detail">${esc(detail)}</div></div>`;}
function renderAuthStatus(status=authStatus){authStatus=status||authStatus;const el=$('session-status');if(!el)return;const cls=authStatus.status==='signed-in'?'signed-in':authStatus.status==='signed-out'?'signed-out':authStatus.status==='checking'?'checking':'unknown';const title=authStatus.status==='signed-in'?'Signed in':authStatus.status==='signed-out'?'Not signed in':authStatus.status==='checking'?'Checking session':'Session not confirmed';el.className=`session-status ${cls}`;el.innerHTML=`<span class="session-dot"></span><div><strong>${esc(title)}</strong><small>${esc(authStatus.message||'')}</small></div>`;}
async function checkSession(showToast=false){renderAuthStatus({signedIn:null,status:'checking',message:'Checking the saved JuicyChat session...'});try{const status=await window.juicyApp.authStatus();renderAuthStatus(status);if(showToast)toast(status.signedIn===true?'JuicyChat session confirmed.':status.signedIn===false?'JuicyChat is not signed in.':'Session could not be confirmed.',status.signedIn===false);return status;}catch(e){const status={signedIn:null,status:'unknown',message:e.message||String(e)};renderAuthStatus(status);if(showToast)toast(status.message,true);return status;}}
function dashHeatCard(){return `<div class="metric dash-card dash-heat"><div class="label" data-tip="When bots were released and how many likes and favorites they got, in your computer's time zone. Click to open When to release.">Activity heatmap</div><div id="dash-heat-body" class="dash-heat-body"><span class="micro">Loading…</span></div></div>`;}
function dashTagsCard(){
  const accts=IS_SHARE?{main:'Your bots'}:PERF_ACCTS_ALL,keys=Object.keys(accts),k=keys.includes(dashPlaceAcct)?dashPlaceAcct:keys[0],acc=((state.accounts||{})[k])||{},bots=acc.bots||[];
  const who=IS_SHARE?(acc.signedIn&&acc.signedIn.userName?`Your bots from ${acc.signedIn.userName}`:'Your bots'):accts[k];
  const head=`<div class="label" data-tip="Which tags do best on ${IS_SHARE?'your':'this account\'s'} own bots: the average likes + 1.5 x favorites per bot, for tags used on at least 3 bots. Pull your bots in Performance to refresh it.">Best tags on ${IS_SHARE?'your bots':esc(accts[k])}</div>`;
  const num=v=>{v=Number(v);return Number.isFinite(v)&&v>0?v:0;},m=new Map();
  for(const b of bots){const sc=num(b.likes)+1.5*num(b.favorites);for(const tg of new Set((Array.isArray(b.tags)?b.tags:[]).map(x=>String(x==null?'':x).replace(/^#/,'').trim()).filter(Boolean))){const r=m.get(tg)||{tag:tg,n:0,sc:0,likes:0,favs:0};r.n++;r.sc+=sc;r.likes+=num(b.likes);r.favs+=num(b.favorites);m.set(tg,r);}}
  const rows=[...m.values()].filter(r=>r.n>=3).map(r=>({...r,avg:r.sc/r.n})).sort((a,b)=>b.avg-a.avg||b.n-a.n).slice(0,6),mx=Math.max(1,...rows.map(r=>r.avg));
  if(!bots.length)return `<div class="metric dash-card dash-tags">${head}<p class="micro dash-empty">${IS_SHARE?'Pull your bots in Performance':'Pull the '+esc(accts[k])+' in Performance'} to see which of your tags do best.</p></div>`;
  if(!rows.length)return `<div class="metric dash-card dash-tags">${head}<p class="micro dash-empty">No tag is used on 3 or more of your bots yet, or the bots have no likes read yet. Pull your bots in Performance.</p></div>`;
  return `<div class="metric dash-card dash-tags">${head}<div class="dp-rows">${rows.map(r=>`<div class="dp-row tg"><span class="dp-l" data-tip="${esc(r.tag)}: used on ${r.n} of your bots, ${r.likes.toLocaleString()} likes and ${r.favs.toLocaleString()} favorites in total, average ${Math.round(r.avg).toLocaleString()} per bot">${esc(r.tag)}</span><div class="dp-bars"><div class="dp-bar s${IS_SHARE?0:keys.indexOf(k)}" data-tip="${esc(r.tag)}: ${r.n} bots, average ${Math.round(r.avg).toLocaleString()} likes + favorites per bot"><i style="width:${Math.round(r.avg/mx*100)}%"></i><b>${Math.round(r.avg).toLocaleString()}</b></div></div></div>`).join('')}</div><div class="dp-legend"><span>Average likes + favorites per bot · ${esc(who)} · ${bots.length} bots</span></div></div>`;
}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('.dp-seg button[data-dp]');if(!b)return;dashPlaceAcct=b.dataset.dp==='ntr'?'ntr':'main';try{localStorage.setItem('jbs.dashPlace',dashPlaceAcct);}catch{}renderDashboard();});
let dashPlaceAcct='main';
try{dashPlaceAcct=localStorage.getItem('jbs.dashPlace')==='ntr'?'ntr':'main';}catch{}
function dashPlaceCard(){
  const accts=IS_SHARE?{main:'Your bots'}:PERF_ACCTS_ALL,keys=Object.keys(accts),k=keys.includes(dashPlaceAcct)?dashPlaceAcct:keys[0];
  const acc=((state.accounts||{})[k])||{},bots=acc.bots||[],who=IS_SHARE&&acc.signedIn&&acc.signedIn.userName?`Your bots from ${acc.signedIn.userName}`:accts[k];
  const counts=FEED_NAMES.map(([fk])=>bots.filter(b=>b.feeds&&b.feeds[fk]).length);
  const sw=IS_SHARE?'':`<div class="rt-seg dp-seg" role="group" aria-label="Account">${keys.map(x=>`<button type="button" data-dp="${x}" class="${x===k?'on':''}" data-tip="Show how many ${esc(accts[x])} bots are in each feed">${x==='ntr'?'NTR':'Main'}</button>`).join('')}</div>`;
  const head=`<div class="dp-head"><div class="label" data-tip="How many of ${IS_SHARE?'your':'this account\'s'} bots are in each of JuicyChat's discovery feeds (the top 500 of each). Pull your bots in Performance to refresh it.">Discovery by placement</div>${sw}</div>`;
  if(!bots.length)return `<div class="metric dash-card dash-place">${head}<p class="micro dash-empty">${IS_SHARE?'Pull your bots in Performance':'Pull the '+esc(accts[k])+' in Performance'} to see how many are in each feed.</p></div>`;
  const max=Math.max(1,...counts),j=keys.indexOf(k);
  const rows=FEED_NAMES.map(([fk,l],i)=>`<div class="dp-row"><span class="dp-l" data-tip="${esc(l)}: how many of ${IS_SHARE?'your':'this account\'s'} bots are in this feed (JuicyChat's top 500 of it)">${esc(l)}</span><div class="dp-bars"><div class="dp-bar s${IS_SHARE?0:j}" data-tip="${esc(who)}: ${counts[i]} bot${counts[i]===1?'':'s'} in the ${esc(l)} feed (of ${bots.length} bots)"><i style="width:${Math.round(counts[i]/max*100)}%"></i><b>${counts[i]}</b></div></div></div>`).join('');
  return `<div class="metric dash-card dash-place">${head}<div class="dp-rows">${rows}</div><div class="dp-legend"><span>${esc(who)} · ${bots.length} bots</span></div></div>`;
}
function botLabel(x){const t=String(x.title||x.name||'').trim();if(t)return t;const id=String(x.url||'').match(/(\d{6,})/);return id?`Bot ${id[1]}`:'Untitled bot';}
function botChip(x){const name=esc(botLabel(x)),meta=`<small>${esc(x.source||'')} #${esc(x.rank??'–')}${x.creator?` · by ${esc(x.creator)}`:''}</small>`;return x.url?`<a class="bot-chip" href="${esc(x.url)}" target="_blank" rel="noopener" title="Open on JuicyChat">${name} ${meta}</a>`:`<span class="bot-chip">${name} ${meta}</span>`;}
function sortBots(xs){return [...xs].sort((a,b)=>(a.source===b.source?0:a.source==='Trending'?-1:1)||((Number(a.rank)||999)-(Number(b.rank)||999)));}
function engineExampleLinks(e){const xs=sortBots(e?.evidence?.examples||[]);if(!xs.length)return'';const first=xs.slice(0,10),rest=xs.slice(10);return `<div class="engine-examples"><div class="bots-heading">🤖 Bots using this engine <span>${xs.length}</span></div>${first.map(botChip).join('')}${rest.length?`<details class="bot-more"><summary>Show all ${xs.length} bot names</summary><div class="bot-chip-wrap">${rest.map(botChip).join('')}</div></details>`:''}</div>`;}
function renderAnalyzedBots(){const rec=state.datasets?.recent||[],tr=state.datasets?.trending||[];if(!rec.length&&!tr.length)return'';const col=(label,xs)=>`<div class="analyzed-col"><h5>${esc(label)} <span>${xs.length}</span></h5><ol>${sortBots(xs).map(x=>`<li><span class="bot-rank">#${esc(x.rank??'–')}</span>${x.url?`<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(botLabel(x))}</a>`:esc(botLabel(x))}${x.creator?`<span class="bot-by">by ${esc(x.creator)}</span>`:''}</li>`).join('')}</ol></div>`;return `<details class="analyzed-bots" open><summary ${tip('botsAnalyzed')}><span class="bots-big-title">🤖 Bots analyzed</span><span class="bots-count">${rec.length} Recent · ${tr.length} Trending</span></summary><div class="analyzed-grid">${col('Recent',rec)}${col('Trending',tr)}</div></details>`;}
function renderSourceSummary(label,src){if(!src||!src.count)return`<article class="source-summary"><h4>${esc(label)}</h4><p>No records collected.</p></article>`;const top=src.topCombination?.name||'No dominant combination';return`<article class="source-summary"><div class="source-summary-head"><h4>${esc(label)}</h4><span>${esc(src.count)} bots</span></div><p>${esc(src.narrative||'')}</p><div class="source-stat-row"><span ${tip('sourceTop')}>Top combination <strong>${esc(top.replace(/ \+ /g,' → '))}</strong></span><span ${tip('sourceMedian')}>Median visible engagement <strong>${fmtNum(src.medianEngagement)}</strong></span><span ${tip('sourceAvg')}>Average visible engagement <strong>${fmtNum(src.averageEngagement)}</strong></span></div></article>`;}
function historyPanel(){const h=state.historyStats;if(!h||!h.bots)return'';const d=x=>x?new Date(x).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'';
  const list=(xs,f)=>xs.map(x=>`${x.url?`<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title||'Untitled')}</a>`:esc(x.title||'Untitled')}<small>${f(x)}</small>`).join('');
  const rising=(state.engineAnalysis?.engines||[]).filter(e=>e.momentum==='Rising'||e.momentum==='New this week'),fading=(state.engineAnalysis?.engines||[]).filter(e=>e.momentum==='Fading');
  return `<details class="history-panel" ${h.scrapes>1?'open':''}><summary ${tip('historyPanel')}><span class="hp-title">📚 Learning from ${Number(h.bots).toLocaleString()} bots across ${h.scrapes} scrape${h.scrapes>1?'s':''}</span><span class="hp-sub">since ${esc(d(h.since))} · last ${esc(d(h.lastAt))}${h.lastAdded?` · ${h.lastAdded} new last time`:''}</span></summary>
  <p class="hp-note">Every collected bot is kept. Engines are measured on the whole history, weighted toward recent scrapes, with extra credit for bots that stay on Trending. ${h.scrapes<2?'Collect again on another day to start seeing what is rising and fading.':''}</p>
  <div class="hp-grid">
    <div><h5>Engines gaining ground</h5>${rising.length?rising.map(e=>`<div class="hp-row up">▲ ${esc(e.name)}<small>${esc(e.momentumDetail||'')}</small></div>`).join(''):'<p class="hp-empty">Needs a few scrapes on different days.</p>'}</div>
    <div><h5>Engines losing ground</h5>${fading.length?fading.map(e=>`<div class="hp-row down">▼ ${esc(e.name)}<small>${esc(e.momentumDetail||'')}</small></div>`).join(''):'<p class="hp-empty">Nothing fading yet.</p>'}</div>
    <div><h5>Staying on Trending</h5>${h.risers?.length?list(h.risers,x=>` · #${x.from} → #${x.to} over ${x.times} scrapes`):`<p class="hp-empty">${h.trendingRepeat?`${h.trendingRepeat} bots have been on Trending more than once.`:'Nothing has repeated on Trending yet.'}</p>`}</div>
    <div><h5>Climbed from Recent to Trending</h5>${h.graduated?.length?list(h.graduated,()=>''):'<p class="hp-empty">None spotted yet.</p>'}</div>
  </div>
  <div class="hp-actions"><button class="ghost" id="history-clear">Clear history</button></div></details>`;}
function renderAnalysis(){
  if(window.TimingView)window.TimingView.render();
  if(window.Collapse)window.Collapse.apply($('view-analysis'),'an');
  $('analysis-target-label').textContent=`${state.settings.targetRecent} Recent + ${state.settings.targetTrending} Trending`;$('analysis-last-run').textContent=state.datasets.lastCollectedAt?`Last collected ${fmtDate(state.datasets.lastCollectedAt)}`:'';
  $('dataset-metrics').innerHTML=[metric('Recent',state.datasets.recent.length,`Target ${state.settings.targetRecent}`),metric('Trending',state.datasets.trending.length,`Target ${state.settings.targetTrending}`),metric('Unique URLs',new Set([...state.datasets.recent,...state.datasets.trending].map(x=>x.url)).size,'Across both samples')].join('');
  const a=state.engineAnalysis;
  if(!a){$('analysis-summary').innerHTML='No analysis yet. Collection automatically builds this summary, or click Analyze Success Engines.';}
  else{
    const dna=a.winnerDNA||{};
    const topEngines=(a.engines||[]).slice(0,8);
    $('analysis-summary').innerHTML=`
      <div class="analysis-report">
        <div class="analysis-report-head"><div><div class="eyebrow" ${tip('summaryHead')}>WHY THE COLLECTED BOTS ARE WORKING</div><h3>${esc(a.sample?.total??((a.sample?.recent||0)+(a.sample?.trending||0)))}-bot engine summary</h3></div><span class="local-chip" ${tip('localChip')}>LOCAL · NO AI</span></div>
        <p class="analysis-lead">${esc(a.summary||'')}</p>
        ${historyPanel()}
        ${renderAnalyzedBots()}
        <div class="winner-dna-grid">
          <div><span ${tip('dnaRelationship')}>Dominant relationship</span><strong>${esc((dna.relationship||'Not detected').replace(/-/g,' '))}</strong></div>
          <div><span ${tip('dnaHook')}>Dominant opening hook</span><strong>${esc((dna.hook||'Not detected').replace(/-/g,' '))}</strong></div>
          <div><span ${tip('dnaSetting')}>Dominant setting</span><strong>${esc((dna.setting||'Not detected').replace(/-/g,' '))}</strong></div>
          <div><span ${tip('dnaArchetype')}>Archetype signal</span><strong>${esc(dna.archetype||'No dominant archetype')}</strong></div>
        </div>
        <div class="source-summary-grid">${renderSourceSummary('Recent',a.sourceSummaries?.Recent)}${renderSourceSummary('Trending',a.sourceSummaries?.Trending)}</div>
        <p class="micro engines-note">The measured engines, with the bots behind each one, are in the <button type="button" class="linkish" data-goto="engines">Engine Library</button>. What is rising and fading is on the Dashboard.</p>
        <details class="methodology"><summary>How the app reached this conclusion</summary><p>${esc(a.methodology||'')}</p></details>
      </div>`;
  }
  const rows=[...state.datasets.recent,...state.datasets.trending];$('bot-table').innerHTML=rows.slice(0,240).map(r=>`<tr><td><span class="source-badge ${String(r.source).toLowerCase()}">${esc(r.source)}</span></td><td>${r.rank}</td><td>${fmtNum(r.engagementEstimate)}</td><td class="cardtext"><strong>${esc(r.title||'')}</strong><br>${esc(String(r.rawText||r.description||r.anchorText||'').slice(0,700))}</td></tr>`).join('')||'<tr><td colspan="4">No bots collected.</td></tr>';
}
document.addEventListener('click',async e=>{if(e.target&&e.target.id==='history-clear'){if(!confirm('Delete the whole scrape history? The latest Recent and Trending lists stay.'))return;state=await window.juicyApp.historyClear();renderAll();toast('Scrape history cleared.');}});
document.addEventListener('click',e=>{const g=e.target&&e.target.closest&&e.target.closest('[data-goto]');if(g&&g.dataset.goto&&$('view-'+g.dataset.goto))switchView(g.dataset.goto);});
function renderEngines(){
  const a=state.engineAnalysis;if(!a?.engines?.length){$('engine-library').innerHTML='No engine analysis yet.';return;}
  $('engine-library').innerHTML=`<div class="local-note">Local statistical analysis. These are measured combinations from the collected bots, not AI-written guesses.</div><div class="engine-grid">${a.engines.map(e=>`<article class="engine-card"><div class="engine-strength" ${tip('engineStrength')}>${esc(e.strength??'–')}</div><h4>${esc(e.name||e.id)}</h4><p><b ${tip('mechanism')}>Mechanism:</b> ${esc(e.mechanism||e.description||'')}</p><p><b ${tip('whyWorks')}>Why it works:</b> ${esc(e.whyItWorks||'')}</p><div class="engine-meta"><span class="badge" ${tip('engineConf')}>${esc(e.confidence||'')} confidence</span>${e.momentum&&e.momentum!=='Steady'?`<span class="badge momentum ${e.momentum.toLowerCase().replace(/\s+/g,'-')}" data-tip="${esc((e.momentumDetail?e.momentumDetail+'. ':'')+TIPS.engineMomentum)}">${e.momentum==='Rising'?'▲ ':e.momentum==='Fading'?'▼ ':''}${esc(e.momentum)}</span>`:''}<span class="badge" ${tip('enginePct')}>${esc(e.prevalencePercent??0)}% of sample</span><span class="badge" ${tip('engineTrend')}>${esc(e.trend||'')}</span><span class="badge" ${tip('engineSat')}>Saturation ${esc(e.saturationRisk||'')}</span><span class="badge" ${tip('engineRT')}>R ${esc(e.evidence?.recentCount??'–')} / T ${esc(e.evidence?.trendingCount??'–')}</span></div><details><summary>Measured pattern and evidence</summary><p><strong>Hook:</strong> ${esc(e.hookPattern||'')}<br><strong>Setup:</strong> ${esc(e.setupPattern||'')}<br><strong>Tags:</strong> ${esc((e.tagPatterns||[]).join(', '))}<br><strong>Mapped Blueprint engine:</strong> ${esc(e.recommendedScenarioEngine||'')} · ${esc(e.recommendedScenarioEngineDescription||'')}</p></details>${engineExampleLinks(e)}</article>`).join('')}</div>`;
}
let perfAccount='main',perfSort='placed',perfCol=null,perfFeed='all';
const PERF_ACCTS_ALL={main:'Main Account',ntr:'NTR Account'};
let PERF_ACCTS=PERF_ACCTS_ALL;
function spark(pulls,key){const pts=(pulls||[]).slice(-30);if(pts.length<2)return'<div class="perf-chart-empty">The growth chart appears after the second pull.</div>';
  const W=560,H=120,P=8,vals=pts.map(p=>p[key]||0),min=Math.min(...vals),max=Math.max(...vals),sx=i=>P+i*(W-2*P)/(pts.length-1),sy=v=>H-P-(max===min?0.5:(v-min)/(max-min))*(H-2*P);
  const d=vals.map((v,i)=>`${i?'L':'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
  const lbl=x=>new Date(x).toLocaleDateString(undefined,{month:'short',day:'numeric'});
  return `<svg viewBox="0 0 ${W} ${H}" class="perf-spark" preserveAspectRatio="none"><path d="${d} L${sx(vals.length-1)},${H-P} L${sx(0)},${H-P} Z" class="area"/><path d="${d}" class="line"/>${vals.map((v,i)=>`<circle cx="${sx(i)}" cy="${sy(v)}" r="2.6"><title>${lbl(pts[i].at)}: ${v.toLocaleString()} ${key}</title></circle>`).join('')}</svg><div class="perf-axis"><span>${lbl(pts[0].at)}</span><span>${lbl(pts[pts.length-1].at)}</span></div>`;}
function ratingOf(b,key,detectedOnly){
  // a rating you set by hand for this bot always wins
  const ov=!detectedOnly&&(state.accounts?.[key]?.ratingOverrides||{})[b.url];if(ov)return {SFW:'0',NSFW:'1','18+':'2'}[ov];
  // then the badge read from the lounge page
  if(b.ratingLabel)return {SFW:'0',NSFW:'1','18+':'2'}[b.ratingLabel];
  const rule=(state.settings.ratingRules||{})[key];
  if(rule&&b.raw&&String(b.raw[rule.field])===String(rule.value))return '2';
  if(b.raw)for(const [k,v] of Object.entries(b.raw))if(/r18|18plus|adult|mature|over18/i.test(k)&&(v===true||v===1||v==='1'||v==='true'))return '2';
  return b.rating;
}
function ratingCheck(bots,key){
  const fields={};for(const b of bots)for(const [k,v] of Object.entries(b.raw||{})){(fields[k]=fields[k]||{})[String(v)]=((fields[k]||{})[String(v)]||0)+1;}
  const cand=Object.entries(fields).filter(([,vals])=>{const n=Object.keys(vals).length;return n>=2&&n<=6;}).sort((a,b)=>(/rat|nsfw|adult|18|level|grade|mature|content|audit/i.test(b[0])-/rat|nsfw|adult|18|level|grade|mature|content|audit/i.test(a[0])));
  if(!bots.some(b=>b.raw))return '<p class="micro">Pull again with this version to see which fields JuicyChat sends for each bot.</p>';
  if(!cand.length)return '<p class="micro">JuicyChat sent no field that splits these bots into groups.</p>';
  const rule=(state.settings.ratingRules||{})[key];
  return `<p class="micro">Every field JuicyChat sent that splits these bots into a few groups, with how many bots have each value. If one of these matches your 18+ count, mark it and the split above will use it.</p><div class="rc-list">${cand.slice(0,14).map(([f,vals])=>`<div class="rc-row"><b>${esc(f)}</b>${Object.entries(vals).sort((a,b)=>b[1]-a[1]).map(([v,n])=>`<span class="rc-val ${rule&&rule.field===f&&String(rule.value)===v?'on':''}">${esc(v)} <i>${n}</i><button class="rc-mark" data-field="${esc(f)}" data-value="${esc(v)}" title="Count bots with ${esc(f)} = ${esc(v)} as 18+">${rule&&rule.field===f&&String(rule.value)===v?'✓ 18+':'mark 18+'}</button></span>`).join('')}</div>`).join('')}</div>${rule?`<button class="ghost rc-clear">Stop using ${esc(rule.field)} = ${esc(rule.value)}</button>`:''}`;
}
let perfChartMetric='chats';
function niceTicks(min,max,n=4){if(max===min){max=min+1;}const span=max-min,step0=span/n,mag=Math.pow(10,Math.floor(Math.log10(step0))),step=[1,2,2.5,5,10].map(m=>m*mag).find(x=>x>=step0)||10*mag;const lo=Math.floor(min/step)*step,hi=Math.ceil(max/step)*step,out=[];for(let v=lo;v<=hi+step/2;v+=step)out.push(v);return out;}
const fmtK=n=>Math.abs(n)>=1e6?(n/1e6).toFixed(n%1e6?1:0)+'M':Math.abs(n)>=1e4?(n/1e3).toFixed(n%1e3?1:0)+'k':Math.round(n).toLocaleString();
function fmtTick(v,step){const a=Math.abs(v);if(step<1000&&a<1e5)return Math.round(v).toLocaleString();
  const [div,suf]=a>=1e6?[1e6,'M']:a>=1e3?[1e3,'k']:[1,''];const dec=Math.max(0,Math.min(3,Math.ceil(-Math.log10(step/div)+1e-9)));return (v/div).toFixed(dec).replace(/\.0+$/,'')+suf;}
function lineChart(pts,{label='chats',height=190}={}){
  pts=pts.filter(p=>p&&isFinite(p.t)&&isFinite(p.v)).sort((a,b)=>a.t-b.t);
  if(pts.length<2)return `<div class="perf-chart-empty">The chart fills in after the next pull${pts.length?` (1 point so far: ${pts[0].v.toLocaleString()} ${label})`:''}.</div>`;
  const W=760,H=height,L=58,R=14,T=12,B=34,t0=pts[0].t,t1=pts[pts.length-1].t,vs=pts.map(p=>p.v);
  const ticks=niceTicks(Math.min(...vs),Math.max(...vs)),y0=ticks[0],y1=ticks[ticks.length-1];
  const sx=t=>L+(t1===t0?0.5:(t-t0)/(t1-t0))*(W-L-R),sy=v=>T+(1-(v-y0)/Math.max(1e-9,y1-y0))*(H-T-B);
  const span=t1-t0,sameDay=new Date(t0).toDateString()===new Date(t1).toDateString();
  const xl=t=>new Date(t).toLocaleString(undefined,span<2*864e5?{hour:'numeric',minute:'2-digit',...(sameDay?{}:{month:'short',day:'numeric'})}:{month:'short',day:'numeric'});
  const xt=[...Array(5).keys()].map(i=>t0+span*i/4);
  const d=pts.map((p,i)=>`${i?'L':'M'}${sx(p.t).toFixed(1)},${sy(p.v).toFixed(1)}`).join(' ');
  const data=JSON.stringify(pts.map(p=>[p.t,p.v]));
  return `<div class="lc" data-pts='${esc(data)}' data-label="${esc(label)}" data-l="${L}" data-r="${R}" data-w="${W}" data-t0="${t0}" data-t1="${t1}"><svg viewBox="0 0 ${W} ${H}" class="lc-svg" preserveAspectRatio="none">
    ${ticks.map(v=>`<line x1="${L}" x2="${W-R}" y1="${sy(v)}" y2="${sy(v)}" class="lc-grid"/><text x="${L-8}" y="${sy(v)+4}" class="lc-y">${fmtTick(v,ticks[1]-ticks[0])}</text>`).join('')}
    ${xt.map((t,i)=>`<text x="${sx(t)}" y="${H-12}" class="lc-x" text-anchor="${i===0?'start':i===4?'end':'middle'}">${esc(xl(t))}</text>`).join('')}
    <path d="${d} L${sx(t1)},${sy(y0)} L${sx(t0)},${sy(y0)} Z" class="lc-area"/><path d="${d}" class="lc-line"/>
    ${pts.map(p=>`<circle cx="${sx(p.t)}" cy="${sy(p.v)}" r="3.4" class="lc-dot"/>`).join('')}
    <line class="lc-cross" x1="0" x2="0" y1="${T}" y2="${H-B}" style="display:none"/><circle class="lc-hot" r="6" style="display:none"/></svg><div class="lc-tip" style="display:none"></div></div>`;
}
const FEED_HIT_COLORS={popular:'#e0b8ef',trending:'#ff9cc0',recent:'#9cc7f0',new:'#9ae0b7',immersive:'#7fe0dd',editor:'#f0cf8a'};
function feedHitData(acc,days=30,now=Date.now()){
  const pulls=new Map();
  for(const list of Object.values((acc&&acc.snapshots)||{}))for(const sn of list||[]){if(!sn||!sn.at||!sn.feeds||typeof sn.feeds!=='object')continue;
    const p=pulls.get(sn.at)||{at:sn.at,t:Date.parse(sn.at),n:{}};for(const [k,v] of Object.entries(sn.feeds))if(Number(v)>0)p.n[k]=(p.n[k]||0)+1;pulls.set(sn.at,p);}
  const list=[...pulls.values()].filter(p=>isFinite(p.t)).sort((a,b)=>a.t-b.t);
  const key=t=>{const d=new Date(t);return d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate();},byDay=new Map();for(const p of list)byDay.set(key(p.t),p);   // the last pull of a day wins
  const out=[];let last=null;const first=new Date(now);first.setHours(12,0,0,0);
  // the last known pull from before the window carries into it
  const before=list.filter(p=>{const d=new Date(p.t);d.setHours(12,0,0,0);return d<new Date(first.getTime()-(days-1)*864e5-1e3);});if(before.length)last=before[before.length-1];
  for(let i=days-1;i>=0;i--){const d=new Date(first);d.setDate(d.getDate()-i);const p=byDay.get(key(d.getTime()));if(p)last=p;
    out.push({t:d.getTime(),n:last?last.n:null,pulled:!!p});}
  return {days:out,pulls:list.length,firstAt:list.length?list[0].t:null};
}
function feedHitChart(acc,days=30){
  const D=feedHitData(acc,days);
  if(!D.pulls)return `<p class="micro">The graph fills in after a pull that reads the feeds (Pull above).</p>`;
  const W=1000,H=180,L=34,R=14,T=12,B=26,ds=D.days,known=ds.filter(x=>x.n);
  const max=Math.max(1,...known.flatMap(x=>FEED_NAMES.map(([k])=>x.n[k]||0))),step=Math.max(1,Math.ceil(max/4)),top=step*Math.ceil(max/step),ticks=[];for(let v=0;v<=top;v+=step)ticks.push(v);
  const sx=i=>L+(ds.length<2?0.5:i/(ds.length-1))*(W-L-R),sy=v=>T+(1-v/Math.max(1,top))*(H-T-B),lbl=t=>new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'});
  const lines=FEED_NAMES.map(([k,l])=>{let d='',on=false;ds.forEach((x,i)=>{if(!x.n){on=false;return;}d+=`${on?'L':'M'}${sx(i).toFixed(1)},${sy(x.n[k]||0).toFixed(1)} `;on=true;});
    const dots=ds.map((x,i)=>x.pulled?`<circle cx="${sx(i).toFixed(1)}" cy="${sy(x.n[k]||0).toFixed(1)}" r="2.6" fill="${FEED_HIT_COLORS[k]}"/>`:'').join('');
    return `<path d="${d.trim()}" fill="none" stroke="${FEED_HIT_COLORS[k]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" class="fh-line f-${k}"/>${dots}`;}).join('');
  const hit=ds.map((x,i)=>{const w=(W-L-R)/Math.max(1,ds.length-1);return `<rect x="${(sx(i)-w/2).toFixed(1)}" y="${T}" width="${w.toFixed(1)}" height="${H-T-B}" fill="transparent" class="fh-hit"><title>${esc(lbl(x.t))}${x.n?(x.pulled?'':' (last pull carried forward)')+'\n'+FEED_NAMES.map(([k,l])=>`${l}: ${x.n[k]||0} bot${(x.n[k]||0)===1?'':'s'}`).join('\n'):': no pull yet'}</title></rect>`;}).join('');
  const xs=[0,Math.round((ds.length-1)/3),Math.round(2*(ds.length-1)/3),ds.length-1];
  const nowN=(known[known.length-1]||{}).n||{},startN=(known[0]||{}).n||{};
  const legend=FEED_NAMES.map(([k,l])=>{const c=nowN[k]||0,dlt=known.length>1?c-(startN[k]||0):0;return `<span class="fh-key"><i style="background:${FEED_HIT_COLORS[k]}"></i>${esc(l)} <b>${c}</b>${dlt?`<small class="${dlt>0?'up':'down'}">${dlt>0?'+':''}${dlt}</small>`:''}</span>`;}).join('');
  const since=known.length&&known[0].t>ds[0].t?`<p class="micro">History starts ${esc(lbl(known[0].t))}: that is the first pull that read the feeds. It grows with every pull.</p>`:'';
  return `<div class="fh"><div class="fh-head"><b>30-day hit</b><span>Bots of this account in each feed, per day</span></div><div class="fh-legend">${legend}</div>
    <svg viewBox="0 0 ${W} ${H}" class="fh-svg">${ticks.map(v=>`<line x1="${L}" x2="${W-R}" y1="${sy(v)}" y2="${sy(v)}" class="lc-grid"/><text x="${L-6}" y="${sy(v)+4}" class="lc-y">${v}</text>`).join('')}${xs.map((i,j)=>`<text x="${sx(i)}" y="${H-8}" class="lc-x" text-anchor="${j===0?'start':j===xs.length-1?'end':'middle'}">${esc(lbl(ds[i].t))}</text>`).join('')}${lines}${hit}</svg>${since}</div>`;
}
function fitPerfChart(){
  const g=document.querySelector('#performance-content .perf-grid');if(!g||g.children.length<2)return;
  const L=g.children[0];let box=L.querySelector('.lc');if(!box)return;
  if(getComputedStyle(g).gridTemplateColumns.trim().split(/\s+/).length<2)return;           // stacked on a narrow window: nothing to match
  let pts;try{pts=JSON.parse(box.dataset.pts).map(([t,v])=>({t,v}));}catch{return;}
  const label=box.dataset.label,draw=h=>{box.outerHTML=lineChart(pts,{label,height:h});box=L.querySelector('.lc');return box.querySelector('.lc-svg');};
  let svg=draw(190);const w=svg.getBoundingClientRect().width;if(!w){bindCharts();return;}   // start from the normal height, then use up whatever room the card beside it leaves
  const cs=getComputedStyle(L),free=L.getBoundingClientRect().bottom-box.getBoundingClientRect().bottom-parseFloat(cs.paddingBottom||0)-parseFloat(cs.borderBottomWidth||0);
  if(free>4)svg=draw(Math.max(190,Math.min(760,Math.round((svg.getBoundingClientRect().height+free)*760/w))));
  bindCharts();
}
(function(){let tm=0;const start=()=>{const c=document.getElementById('performance-content');if(!c||typeof ResizeObserver==='undefined')return;new ResizeObserver(()=>{clearTimeout(tm);tm=setTimeout(()=>{try{fitPerfChart();}catch(e){console.error('chart fit:',e);}},60);}).observe(c);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();})();
function bindCharts(){qsa('.lc').forEach(box=>{if(box.__bound)return;box.__bound=true;const pts=JSON.parse(box.dataset.pts),svg=box.querySelector('svg'),tip=box.querySelector('.lc-tip'),cross=box.querySelector('.lc-cross'),hot=box.querySelector('.lc-hot'),circles=[...box.querySelectorAll('.lc-dot')];
  const W=+box.dataset.w,L=+box.dataset.l,R=+box.dataset.r,t0=+box.dataset.t0,t1=+box.dataset.t1,label=box.dataset.label;
  const move=e=>{const r=svg.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*W,t=t0+(Math.min(W-R,Math.max(L,x))-L)/(W-L-R)*(t1-t0);
    let i=0;for(let k=1;k<pts.length;k++)if(Math.abs(pts[k][0]-t)<Math.abs(pts[i][0]-t))i=k;
    const c=circles[i],cx=+c.getAttribute('cx'),cy=+c.getAttribute('cy');cross.setAttribute('x1',cx);cross.setAttribute('x2',cx);cross.style.display='';hot.setAttribute('cx',cx);hot.setAttribute('cy',cy);hot.style.display='';
    const [tt,v]=pts[i],prev=i?pts[i-1][1]:null,dv=prev==null?null:v-prev;
    tip.innerHTML=`<b>${v.toLocaleString()} ${esc(label)}</b>${dv!=null?`<span class="${dv>0?'up':dv<0?'down':''}">${dv>0?'+':''}${dv.toLocaleString()} since previous pull</span>`:'<span>first pull shown</span>'}<small>${esc(new Date(tt).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</small>`;
    tip.style.display='';const px=cx/W*r.width,left=Math.min(Math.max(px-80,0),r.width-170);tip.style.left=left+'px';};
  svg.addEventListener('mousemove',move);svg.addEventListener('mouseleave',()=>{tip.style.display='none';cross.style.display='none';hot.style.display='none';});});}
function chartSummary(pts,label){if(pts.length<2)return'';pts=[...pts].sort((x,y)=>x.t-y.t);const a=pts[0],z=pts[pts.length-1],days=(z.t-a.t)/864e5;
  const num=(n,l)=>`<b class="${n>0?'up':n<0?'down':''}">${n>0?'+':''}${n.toLocaleString()} ${esc(l)}</b>`;
  // two stacked lines with the same layout: the last day, then everything since the first pull the chart holds
  let yb=null;for(const p of pts){if(p.t<=z.t-864e5)yb=p;else break;}
  const ytip=yb?`Compared with the pull from ${new Date(yb.t).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}, the last one at least 24 hours before the newest`:'';
  const first=new Date(a.t).toLocaleDateString(undefined,{month:'short',day:'numeric'});
  return (yb?`<span class="lc-k">Since yesterday:</span><span class="lc-v" title="${esc(ytip)}">${num(z.v-yb.v,label)}</span>`:'')
    +`<span class="lc-k">Since ${esc(first)} (first pull):</span><span class="lc-v">${num(z.v-a.v,label)} <small>${pts.length} pulls${days>=1?` \u00B7 ${fmtK(Math.round((z.v-a.v)/days))}/day`:''}</small></span>`;}
let perfBot=null,perfQuery='',perfWorkView='series';
const FEED_NAMES=[['popular','Popular'],['trending','Trending'],['recent','Recent'],['new','New'],['immersive','Immersive'],['editor',"Editor's Choice"]];
const feedChips=f=>FEED_NAMES.filter(([k])=>f&&f[k]).map(([k,l])=>`<span class="feed-chip f-${k}">${l} <b>#${f[k]}</b></span>`).join('');
const RATING_LABEL={'0':'SFW','1':'NSFW','2':'18+'};
const TZ='America/Toronto';
const tsMs=v=>{if(v==null||v==='')return null;if(typeof v==='number'||/^\d+$/.test(String(v))){let t=Number(v);if(t<1e11)t*=1000;return t;}const d=Date.parse(v);return isNaN(d)?null:d;};
const median=a=>{const x=a.filter(v=>v!=null&&isFinite(v)).sort((p,q)=>p-q);if(!x.length)return null;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2;};
function fansBlock(acc,b){
  const ev=(acc.events||[]).filter(e=>e.characterId===b.id&&(e.kind==='like'||e.kind==='favorite'));
  if(!acc.signedIn?.ok&&!ev.length)return `<div class="fx-note"><b>Who liked / starred</b><p class="micro">JuicyChat only shows this in the account's own notifications. Sign in to this account with its magic link (top of this tab) and the next pull fills it in.</p></div>`;
  if(!ev.length)return `<div class="fx-note"><b>Who liked / starred</b><p class="micro">No likes or stars for this bot in the notifications read so far. New ones are added on every pull.</p></div>`;
  const per=new Map();for(const e of ev){const k=e.userId||e.name;const p=per.get(k)||{name:e.name,likes:0,stars:0};if(e.kind==='like')p.likes++;else p.stars++;per.set(k,p);}
  const people=[...per.values()],allEv=(acc.events||[]).filter(e=>e.kind==='like'||e.kind==='favorite');
  const botsOf=new Map();for(const e of allEv){const k=e.userId||e.name;if(!botsOf.has(k))botsOf.set(k,new Set());botsOf.get(k).add(e.characterId);}
  const returned=[...per.keys()].filter(k=>(botsOf.get(k)||new Set()).size>1).length;
  const shared=new Map();for(const k of per.keys())for(const cid of botsOf.get(k)||[])if(cid!==b.id)shared.set(cid,(shared.get(cid)||0)+1);
  const names=new Map((acc.bots||[]).map(x=>[x.id,x.title]));const top=[...shared.entries()].sort((p,q)=>q[1]-p[1]).slice(0,3).filter(([id])=>names.has(id));
  const list=(xs,f)=>xs.slice(0,60).map(p=>`<div><span>${esc(p.name)}</span><small>${f(p)}</small></div>`).join('');
  const likers=people.filter(p=>p.likes).sort((p,q)=>q.likes-p.likes),stars=people.filter(p=>p.stars).sort((p,q)=>q.stars-p.stars);
  return `<div class="fx-note"><b>👥 Who liked / starred</b><div class="fx-pred fans"><div><span>People</span><b>${people.length}</b></div><div><span>Likers</span><b>${likers.length}</b></div><div><span>Stars</span><b>${stars.reduce((a,p)=>a+p.stars,0)}</b></div><div><span>Also on your other bots</span><b>${returned}</b></div></div>
    ${top.length?`<p class="micro">Shared crowd with ${top.map(([id,n])=>`<b>${esc(names.get(id))}</b> (${n})`).join(' · ')}</p>`:''}
    <div class="fx-two fans-lists"><div><h5>♡ Likes</h5><div class="fx-comments">${list(likers,p=>`${p.likes}×${p.stars?` · ${p.stars}★`:''}`)||'<p class="micro">None yet</p>'}</div></div><div><h5>☆ Stars</h5><div class="fx-comments">${list(stars,p=>`${p.stars}★${p.likes?` · ${p.likes} like${p.likes>1?'s':''}`:''}`)||'<p class="micro">None yet</p>'}</div></div></div></div>`;
}
function botForensics(acc,b,cards){
  const fmt=n=>n==null?'–':Number(n).toLocaleString(),snaps=(acc.snapshots||{})[b.id]||[],comments=(acc.comments||{})[b.id]||[];
  const pub=tsMs(b.created)||(snaps[0]?Date.parse(snaps[0].at):null),ageD=pub?Math.max(1/24,(Date.now()-pub)/864e5):null,perDay=ageD?b.chats/ageD:null;
  const perDayOf=x=>{const p=tsMs(x.created)||(((acc.snapshots||{})[x.id]||[])[0]?Date.parse(acc.snapshots[x.id][0].at):null);return p?(x.chats||0)/Math.max(1/24,(Date.now()-p)/864e5):null;};
  const all=(acc.bots||[]).map(x=>({x,pd:perDayOf(x)})),medAll=median(all.map(a=>a.pd));
  const prev=snaps.length>1?snaps[snaps.length-2]:null,delta=prev?b.chats-prev.chats:null;
  const deltas=(acc.bots||[]).map(x=>{const s=(acc.snapshots||{})[x.id]||[];return s.length>1?x.chats-s[s.length-2].chats:null;}).filter(v=>v!=null&&v>0),medDelta=median(deltas);
  // why it performed
  const why=[];
  if(delta!=null)why.push({hot:true,title:`${delta>=0?'+':''}${fmt(delta)} chats vs the previous pull`,sub:`Change since ${new Date(prev.at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}${medDelta?` · a typical bot on this account gained ${fmt(Math.round(medDelta))}`:''}`,x:medDelta&&delta>0?delta/medDelta:null});
  const lifts=(b.tags||[]).map(t=>{const w=all.filter(a=>(a.x.tags||[]).includes(t));const m=median(w.map(a=>a.pd));return{t,n:w.length,lift:m&&medAll?m/medAll:null};}).filter(l=>l.lift!=null).sort((p,q)=>q.lift-p.lift);
  for(const l of lifts)why.push({title:l.t,sub:`${l.n} of your bots · ${l.lift.toFixed(2)}× chats/day vs this account's median`,x:l.lift});
  if(perDay!=null&&medAll)why.push({title:'This bot overall',sub:`${fmt(Math.round(perDay))} chats/day · ${(perDay/medAll).toFixed(2)}× this account's median`,x:perDay/medAll});
  // when it performed
  const series=[...(pub?[{t:pub,c:0}]:[]),...snaps.map(s=>({t:Date.parse(s.at),c:s.chats}))].filter(p=>p.t).sort((p,q)=>p.t-q.t);
  const at=t=>{for(let i=1;i<series.length;i++)if(series[i].t>=t){const a=series[i-1],z=series[i];return a.c+(z.c-a.c)*(t-a.t)/Math.max(1,z.t-a.t);}return null;};
  let firstWeek=null,fwNote='';
  if(pub){const t7=pub+7*864e5;if(Date.now()<t7){firstWeek=b.chats;fwNote='so far (still in its first week)';}else{const v=at(t7);if(v!=null&&snaps.length&&Date.parse(snaps[0].at)<=t7+2*864e5){firstWeek=Math.round(v);fwNote='';}else fwNote='not tracked: this bot was already past its first week when tracking began';}}
  let spike=null;for(let i=1;i<series.length;i++){const d=series[i].c-series[i-1].c;if(!spike||d>spike.d)spike={d,t:series[i].t,span:(series[i].t-series[i-1].t)/864e5};}
  const hours=Array(24).fill(0),wd=Array(7).fill(0);
  const timed=[...comments,...(acc.events||[]).filter(e=>e.characterId===b.id)];
  for(const c of timed){const t=tsMs(c.at);if(!t)continue;const parts=new Intl.DateTimeFormat('en-US',{timeZone:TZ,hour:'numeric',hourCycle:'h23',weekday:'short'}).formatToParts(new Date(t));const h=+parts.find(p=>p.type==='hour').value,w=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.find(p=>p.type==='weekday').value);hours[h%24]++;if(w>=0)wd[w]++;}
  const nC=hours.reduce((a,v)=>a+v,0),bestH=nC?hours.indexOf(Math.max(...hours)):null,bestW=nC?['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][wd.indexOf(Math.max(...wd))]:null;
  const dstr=t=>new Date(t).toLocaleString(undefined,{timeZone:TZ,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const bseries=series.filter((p,i)=>!(i&&p.c===0&&series.slice(i+1).some(q=>q.c>0))).map(p=>({t:p.t,v:p.c}));
  const chart=`<p class="lc-sum">${chartSummary(bseries,'chats')}</p>${lineChart(bseries,{label:'chats',height:170})}`;
  const bars=(arr,labels,cls)=>{const m=Math.max(...arr,1);return `<div class="fx-bars ${cls}">${arr.map((v,i)=>`<div class="fx-bar" title="${esc(labels[i])}: ${v} comment${v===1?'':'s'}"><i style="height:${Math.round(v/m*100)}%"></i><span>${labels[i]}</span></div>`).join('')}</div>`;};
  // prediction
  const uniq=new Set(comments.map(c=>c.name)).size;
  return `<div class="fx" id="fx"><div class="fx-head"><div><h3>${esc(b.title)}</h3><div class="fx-sub">${fmt(b.chats)} chats · ${fmt(b.likes)} likes · ${fmt(b.favorites)} favourites${ageD?` · ${ageD<1?'under a day':Math.round(ageD)+'d'} old · ${fmt(Math.round(perDay))} chats/day`:''}</div><div class="fx-tags">${(r=>{const ov=(state.accounts?.[perfAccount]?.ratingOverrides||{})[b.url],det=RATING_LABEL[ratingOf(b,perfAccount,true)]||'not read';return `<select class="rt rt-pick rt-${r==='2'?'adult':(RATING_LABEL[r]||'unknown').toLowerCase()}" data-url="${esc(b.url)}" title="Rating: click to set it yourself if it's wrong"><option value="" ${ov?'':'selected'}>${ov?`Auto (${det})`:(RATING_LABEL[r]||'Rating?')}</option>${['SFW','NSFW','18+'].map(x=>`<option value="${x}" ${ov===x?'selected':''}>${x}${ov===x?' ✎':''}</option>`).join('')}</select>`;})(ratingOf(b,perfAccount))}${(b.tags||[]).map(t=>`<span>${esc(t)}</span>`).join('')}</div>${b.description?`<p class="fx-desc">${esc(b.description.slice(0,420))}${b.description.length>420?'…':''}</p>`:''}</div><div class="fx-actions"><a href="${esc(b.url)}" target="_blank" rel="noopener" class="ghost fx-open">Open on JuicyChat ↗</a><button class="ghost" id="fx-close">Close</button></div></div>
  <div class="fx-grid"><div class="perf-card"><div class="perf-card-head"><h4>📈 Why it performed</h4></div>${why.length?why.map(w=>`<div class="fx-why ${w.hot?'hot':''}"><div><b>${esc(w.title)}</b><small>${esc(w.sub)}</small></div>${w.x!=null?`<span>${w.x.toFixed(2)}×</span>`:''}</div>`).join(''):'<p class="micro">Needs tags from the lounge data or a second pull.</p>'}</div>
  <div class="perf-card"><div class="perf-card-head"><h4>🕒 When it performed</h4><small>times in Toronto (Eastern)</small></div>
    <div class="fx-kv"><span>First published</span><b>${pub?esc(dstr(pub)):'–'}</b></div>
    <div class="fx-kv"><span>First-week chats</span><b>${firstWeek!=null?`+${fmt(firstWeek)} ${fwNote}`:esc(fwNote||'–')}</b></div>
    <div class="fx-kv"><span>Biggest jump</span><b>${spike&&spike.d>0?`+${fmt(spike.d)} chats · ${esc(new Date(spike.t).toLocaleDateString(undefined,{month:'short',day:'numeric'}))}${spike.span>1.5?` (over ${Math.round(spike.span)} days)`:''}`:'–'}</b></div>
    <div class="fx-kv"><span>Best hour</span><b>${bestH!=null?`${String(bestH).padStart(2,'0')}:00 · from ${nC} ${(acc.events||[]).some(e=>e.characterId===b.id)?'likes, stars and comments':'comment'+(nC===1?'':'s')}`:'– (no comments with times yet)'}</b></div>
    <div class="fx-kv"><span>Best weekday</span><b>${bestW||'–'}</b></div>
    <div class="fx-kv"><span>Latest pull</span><b>${snaps.length?esc(new Date(snaps[snaps.length-1].at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})):'–'}${delta!=null?` · ${delta>=0?'+':''}${fmt(delta)}`:''}</b></div>
    ${chart}${nC?`<div class="fx-two"><div><h5>Activity by hour (Toronto)</h5>${bars(hours,[...Array(24).keys()].map(h=>String(h).padStart(2,'0')),'hours')}</div><div><h5>Activity by weekday</h5>${bars(wd,['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],'days')}</div></div>`:''}</div></div>
  <div class="perf-card fx-placed"><div class="perf-card-head"><h4>📍 Where it's placed</h4><small>JuicyChat feeds, top 500 of each, as seen by the account that pulled it</small></div>${(()=>{const fh=(acc.feedHistory||{})[b.id]||{},now=b.feeds||{};const dd=t=>t?new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'–';
    return `<div class="fx-feeds">${FEED_NAMES.map(([k,l])=>{const h=fh[k];return `<div class="fx-feed ${now[k]?'on':''}"><span>${l}</span><b>${now[k]?'#'+now[k]:'not in top 500'}</b><small>${h?`best #${h.best} (${dd(h.bestAt)}) · first seen ${dd(h.firstAt)}`:'never seen in this feed yet'}</small></div>`;}).join('')}</div>${(()=>{const dv=b.discover||{},ks=Object.keys(dv).sort((x,y)=>dv[x]-dv[y]);return acc.discoverScan?`<div class="fx-disc"><span class="micro">Discover tab rows:</span> ${ks.length?ks.map(k=>`<span class="feed-chip">#${esc(k)} <b>#${dv[k]}</b></span>`).join(' '):'<span class="micro">not in the first '+((acc.discoverScan.depth)||100)+' of any row</span>'}</div>`:'';})()}`;})()}</div>
  <div class="fx-grid"><div class="perf-card"><div class="perf-card-head"><h4>💬 Archived commenters</h4><small>${comments.length} comment${comments.length===1?'':'s'} from ${uniq} ${uniq===1?'person':'people'}, kept even after JuicyChat stops listing them</small></div>${comments.length?`<div class="fx-comments">${comments.slice(0,40).map(c=>`<div><span>${esc(c.name)}</span><small>${tsMs(c.at)?esc(dstr(tsMs(c.at))):''}</small></div>`).join('')}</div>`:'<p class="micro">No comments read yet. They are collected with every pull.</p>'}</div>
  <div class="perf-card"><div class="perf-card-head"><h4>💛 Fans</h4></div>${fansBlock(acc,b)}</div></div></div>`;
}
const perfGrp=(title,html)=>html&&String(html).trim()?`<div class="perf-card perf-grp"><div class="perf-card-head"><h4>${title}</h4></div>${html}</div>`:'';
function perfFold(){if(window.Collapse)window.Collapse.apply($('performance-content'),'perf');}
function renderPerformance(){if(IS_SHARE){PERF_ACCTS={main:'Your Account'};perfAccount='main';}
  const acc=(state.accounts||{})[perfAccount]||{bots:[],pulls:[],links:{},snapshots:{}},bots=acc.bots||[],pulls=acc.pulls||[],links=acc.links||{};
  const lounge=state.settings[perfAccount==='ntr'?'loungeNtr':'loungeMain']||'',cards=[],fmt=n=>n==null?'–':Number(n).toLocaleString();
  const last=pulls[pulls.length-1],prev=pulls[pulls.length-2],delta=k=>last&&prev?last[k]-prev[k]:null;
  const chg=n=>n==null||n===0?'':`<small class="${n>0?'up':'down'}">${n>0?'+':''}${Number(n).toLocaleString()}</small>`;
  const days=last&&prev?Math.max(1/24,(Date.parse(last.at)-Date.parse(prev.at))/864e5):null;
  const snap=b=>(acc.snapshots||{})[b.id]||[],bprev=b=>{const s=snap(b);return s.length>1?s[s.length-2]:null;};
  const live=b=>{const f=Date.parse(b.created||'')||Date.parse(b.firstSeen||'')||null;return f?Math.max(1,Math.round((Date.now()-f)/864e5)):null;};
  const rows=bots.map(b=>{const p=bprev(b),d=live(b);return{...b,dc:p?b.chats-p.chats:null,dl:p?b.likes-p.likes:null,days:d,perDay:d?Math.round(b.chats/d):null};});
  const feedRank=r=>{const f=r.feeds||{};if(perfFeed==='all'){const v=Object.values(f);return v.length?Math.min(...v):null;}return f[perfFeed]??null;};
  const feedCount=k=>rows.filter(r=>k==='all'||(r.feeds||{})[k]).length;
  const sorters={chats:(a,b)=>b.chats-a.chats,growth:(a,b)=>(b.dc??-1)-(a.dc??-1),perDay:(a,b)=>(b.perDay??-1)-(a.perDay??-1),likes:(a,b)=>b.likes-a.likes,newest:(a,b)=>(a.days??1e9)-(b.days??1e9),placed:(a,b)=>((feedRank(a)??1e9)-(feedRank(b)??1e9))||((b.chats||0)-(a.chats||0))};
  if(perfCol){const best=feedRank,rel=r=>Date.parse(r.published||r.created||'')||null;
    const val={bot:r=>String(r.title||'').toLowerCase(),chats:r=>r.chats??null,likes:r=>r.likes??null,favorites:r=>r.favorites??null,release:rel,days:r=>r.days??null,perDay:r=>r.perDay??null,placed:r=>{const n=Object.keys(r.feeds||{}).length;return n||null;}}[perfCol.key];      // Placement sorts by how many feeds the bot is in (most first when descending); bots in no feed go last
    // the first click is ascending (A to Z, lowest first); Release Date's first click is newest first. Missing values always go last.
    const asc=perfCol.key==='release'?perfCol.dir==='desc':perfCol.dir==='asc';
    if(val)rows.sort((a,b)=>{const x=val(a),y=val(b);if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;const c=typeof x==='string'?x.localeCompare(y):x-y;if(c===0&&perfCol.key==='placed')return ((feedRank(a)??1e9)-(feedRank(b)??1e9))||((b.chats||0)-(a.chats||0));return asc?c:-c;});}
  else rows.sort(sorters[perfSort]||sorters.chats);
    const tabs=IS_SHARE?'':`<div class="perf-tabs">${Object.entries(PERF_ACCTS).map(([k,l])=>{const a=(state.accounts||{})[k]||{};return`<button class="perf-tab ${k===perfAccount?'active':''}" data-acct="${k}">${l}<span>${(a.bots||[]).length?`${(a.bots||[]).length} bots`:'not set up'}</span></button>`;}).join('')}</div>`;
  const si=acc.signedIn;
  const signBox=IS_SHARE?'':`<div class="acct-sign ${si?.ok?'on':''}"><div><b>${si?.ok?`✓ Signed in${si.userName?` as ${esc(si.userName)}`:''}`:acc.loggedOut?`${esc(PERF_ACCTS[perfAccount]||'This account')} is logged out`:'Not signed in'}</b><span class="micro">${si?.ok?"Pulls read this account's own bots directly, plus who liked, starred, commented and followed. No lounge link needed.":acc.loggedOut?'You need to log back in to scrape.':'Signing in is optional: it adds who liked / starred and lets this account be pulled without a lounge link.'} Sign-in is in Settings.</span></div><button class="ghost" data-jump-settings>Open Settings</button></div>`;
  const setup=IS_SHARE?`<div class="perf-lounge share-own"><div><b>${acc.signedIn?.userName?`Your bots from ${esc(acc.signedIn.userName)}`:'Your bots'}</b><span class="micro">Read straight from the account you signed in with in Settings: every bot you own, SFW, NSFW and 18+. No lounge link needed.</span></div><button class="primary" id="perf-pull-one">↻ Pull my bots</button></div>
    <p class="micro perf-when">${acc.pulledAt?`Last pulled ${esc(new Date(acc.pulledAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))} · ${pulls.length} pull${pulls.length===1?'':'s'} recorded · pulled automatically every day (Settings > Automatic daily pulls)`:'Not pulled yet. Sign in in Settings, then click Pull my bots.'}</p>`:`<div class="perf-lounge"><div><b>${esc(PERF_ACCTS[perfAccount])}</b><span class="micro">${lounge||acc.signedIn?.ok?'Read with '+(acc.signedIn?.ok?'its sign-in':'its lounge link')+' from Settings.':'No sign-in or lounge link yet. Add one in Settings.'}</span></div>${lounge||acc.signedIn?.ok?'':'<button class="ghost" data-jump-settings>Open Settings</button>'}<button class="primary" id="perf-pull-one" ${lounge||acc.signedIn?.ok?'':'disabled'}>↻ Pull ${esc(PERF_ACCTS[perfAccount])}</button></div>
    <p class="micro perf-when">${acc.pulledAt?`Last pulled ${esc(new Date(acc.pulledAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))} · ${pulls.length} pull${pulls.length===1?'':'s'} recorded · pulled automatically every day at 8:00 PM Eastern`:lounge||acc.signedIn?.ok?'Not pulled yet. Click Pull, or wait for the 8:00 PM Eastern run.':'Add this account\'s lounge link or sign it in, in Settings.'}</p>`;
  const lp=acc.lastPull,noNums=lp&&lp.bots&&!lp.withNumbers;
  const details=lp?`<details class="pull-details ${noNums?'bad':''}" ${noNums?'open':''}><summary>${noNums?`⚠ Found ${lp.bots} bots but couldn't read their chat, like or favourite numbers`:`Pull details · ${lp.bots} bots, numbers read for ${lp.withNumbers}`}</summary>
    <p class="micro">Read from ${esc(lp.url||'')} · ${esc(new Date(lp.at).toLocaleString())} · numbers read ${esc((lp.modes||[]).map(m=>({labeled:'from words on the card',icons:'from the icons beside them',position:'by position (chats, likes, favourites)',data:"from JuicyChat's data",'bot page':"from each bot's own page",api:"from JuicyChat's data service",account:"from the signed-in account",none:'not found'})[m]||m).join(', '))}${lp.jsonResponses!=null?` · ${lp.jsonResponses} data responses seen`:''}${lp.ratingSource==='field'?` · ratings from your lounge's SFW / NSFW / 18+ badges (they match JuicyChat's "${esc(lp.ratingRule?.field||'')}" field)`:lp.ratingSource==='badges'?` · ratings read from the SFW / NSFW / 18+ badges on your lounge page${lp.ratingsTotal?` (${lp.ratingsRead} of ${lp.ratingsTotal} bots)`:''}`:lp.ratingsTotal!=null&&!lp.loungeUrl?' · <b>your lounge page couldn\'t be found, so ratings come from JuicyChat\'s data (18+ bots can show as NSFW): open a bot to set its rating</b>':''}</p>
    ${noNums?'<p class="micro">The page layout is different from what the tool expects. Send me a screenshot of one bot card on the lounge page plus the sample below, and I can adjust the reader to it.</p>':''}
    ${(lp.sample||[]).length?`<pre class="pull-sample">${esc(lp.sample.map(x=>`${x.title}\n  text: ${String(x.text||'').replace(/\n/g,' | ').slice(0,200)}\n  numbers: ${(x.stats||[]).map(st=>st.value).join(', ')||'none'}`).join('\n\n'))}</pre>`:''}</details>`:'';
  if(!bots.length){$('performance-content').innerHTML=tabs+signBox+perfGrp('Pull your bots',setup)+(lp?`<div class="pull-details bad"><b>The last pull found no bots on this lounge link.</b> <span class="micro">Check the link opens the account's lounge with its bots listed. If it does, send me a screenshot of that page.</span></div>`:'');bindPerf();perfFold();return;}
  const kpi=(l,v,c,sub='')=>`<div class="perf-kpi"><span>${l}</span><b>${v}</b>${c||''}${sub?`<small class="sub">${sub}</small>`:''}</div>`;
  const tot=k=>bots.reduce((a,b)=>a+(b[k]||0),0);
  const rc={};for(const b of bots){const r=RATING_LABEL[ratingOf(b,perfAccount)]||'Unknown';rc[r]=(rc[r]||0)+1;}
  const ratingLine=`<div class="rating-split">${['SFW','NSFW','18+'].map(r=>`<span class="rt rt-${r==='18+'?'adult':r.toLowerCase()}">${r} <b>${rc[r]||0}</b></span>`).join('')}<button class="ghost sm rt-copy" title="Copy what JuicyChat reported for each bot's rating, to send for checking">Copy rating details</button>${rc.Unknown?`<span class="rt">Rating not read <b>${rc.Unknown}</b></span>`:''}</div><details class="rating-check" ${!rc['18+']?'open':''}><summary>${rc['18+']?'Rating check':'⚠ 18+ bots showing as 0? Check which field holds the rating'}</summary>${IS_SHARE?'<p class="micro">Your own bots are read from your signed-in account, so every rating is included. If 18+ still shows 0, pull again: pulls from before this version used the public lounge list.</p>':''}${!IS_SHARE&&!acc.signedIn?.ok?'<p class="micro"><b>Most reliable fix:</b> sign this account in with its magic link (box above). A creator\'s own bot list always carries the true rating. Viewed through a lounge link by an account without 18+ access, JuicyChat may report 18+ bots as NSFW.</p>':''}${ratingCheck(bots,perfAccount)}</details>`;
  const kpis=`<div class="perf-kpis">${kpi('Bots',fmt(bots.length),last?.newBots?`<small class="up">+${last.newBots} new</small>`:'')}${kpi('Total chats',fmt(tot('chats')),chg(delta('chats')),days&&delta('chats')!=null?`${fmt(Math.round(delta('chats')/days))} per day since last pull`:'')}${kpi('Total likes',fmt(tot('likes')),chg(delta('likes')))}${kpi('Favourites',fmt(tot('favorites')),chg(delta('favorites')))}${tot('views')?kpi('Views',fmt(tot('views')),chg(delta('views'))):''}${kpi('In a feed now',fmt(bots.filter(b=>Object.keys(b.feeds||{}).length).length),'',FEED_NAMES.map(([k,l])=>{const n=bots.filter(b=>(b.feeds||{})[k]).length;return n?`${l} ${n}`:'';}).filter(Boolean).join(' · '))}${kpi('Avg chats per bot',fmt(Math.round(tot('chats')/Math.max(1,bots.length))))}${kpi('Likes per 100 chats',tot('chats')?(tot('likes')/tot('chats')*100).toFixed(1):'–')}</div>`;
  const M={chats:'chats',likes:'likes',favorites:'favourites',bots:'bots'},mk=perfChartMetric;
  const firstReal=pulls.findIndex(p=>(p.chats||0)+(p.likes||0)+(p.favorites||0)>0),usable=firstReal<0?pulls:pulls.slice(firstReal),hidden=firstReal>0?firstReal:0;
  const cpts=usable.map(p=>({t:Date.parse(p.at),v:Number(p[mk])||0}));
  const chart=`<div class="perf-card"><div class="perf-card-head"><h4>Total ${M[mk]} over time</h4><div class="perf-sorts">${Object.entries(M).map(([k,l])=>`<button class="perf-sort chart-metric ${k===mk?'on':''}" data-metric="${k}">${l[0].toUpperCase()+l.slice(1)}</button>`).join('')}</div></div>
    <p class="lc-sum">${chartSummary(cpts,M[mk])}</p>${lineChart(cpts,{label:M[mk]})}</div>`;
  // what's working: every bot, grouped by series (card, description prefix or title) or by tag
  const SER=['Bully','Dommy Mommy','Stepmom','Stepsister','Gentle Giant','Tomboy','Yandere','Bakadere','Futa Friday'];
  // Keep NTR and ANTI-NTR separate. They are opposite story types.
  // The NTR account must never gain an ANTI-NTR series from a generic /ntr/ match.
  function perfSeriesName(raw){
    const n=String(raw||'').trim().replace(/^["“”]+|["“”]+$/g,'').trim();
    if(/^(?:ANTI[\s_-]*NTR|NTR\?)(?:\s+Series)?$/i.test(n))
      return perfAccount==='ntr'?'NTR (no series)':'ANTI-NTR Series';
    if(/^(?:NTR|Netorare)(?:\s+Series)?$/i.test(n))return 'NTR (no series)';
    if(/^Likeable[\s_-]*NTR(?:\s+Series)?$/i.test(n))return 'Likeable NTR';
    if(/^Post[\s_-]*NTR(?:\s+Series)?$/i.test(n))return 'Post-NTR';
    if(/^Preventable[\s_-]*NTR(?:\s+Series)?$/i.test(n))return 'Preventable NTR';
    return n;
  }
  const seriesOf=r=>{
    const t=String(r.title||'').trim();
    // This particular NTR bot was incorrectly displayed under ANTI-NTR.
    if(perfAccount==='ntr'&&/^his mug in the sink(?:\s*[\[(].*)?$/i.test(t))
      return {name:'NTR (no series)',from:'none'};
        const d=String(r.description||'').trim();
    const m=d.match(/^\[\s*["“]?([^\]"”]*?)["”]?\s*Series\s*\d*\s*\]/i)||
      d.match(/^\[\s*["“]?(Preventable NTR)["”]?\s*\d*\s*\]/i);
    if(m){
      const n=m[1].trim(),parsed=perfSeriesName(n);
      // The series name is read from the actual prefix; not every NTR label is ANTI-NTR.
      if(/ntr|netorare/i.test(n)||parsed!==n)return {name:parsed,from:'description'};
      if(IS_SHARE)return {name:n+' Series',from:'description'};
      const hit=SER.find(x=>x.toLowerCase()===n.toLowerCase());
      return {name:(hit||n)+' Series',from:'description'};
    }
    if(!IS_SHARE&&/^your bully\b/i.test(t))return {name:'Bully Series',from:'title'};
    if(/^your step-?mom\b/i.test(t))return {name:'Stepmom Series',from:'title'};
    if(/^(your )?step-?sister/i.test(t))return {name:'Stepsister Series',from:'title'};
    return {name:perfAccount==='ntr'?'NTR (no series)':'Standalone (no series)',from:'none'};
  };
  const group=keyOf=>{const g={};for(const r of rows){for(const k of [].concat(keyOf(r)).filter(Boolean)){const x=g[k]=g[k]||{n:0,chats:0,likes:0,pd:[],best:null};x.n++;x.chats+=r.chats||0;x.likes+=r.likes||0;if(r.perDay!=null)x.pd.push(r.perDay);if(!x.best||(r.chats||0)>(x.best.chats||0))x.best=r;}}
    const med=a=>{const z=[...a].sort((p,q)=>p-q);return z.length?(z.length%2?z[(z.length-1)/2]:(z[z.length/2-1]+z[z.length/2])/2):null;};
    return Object.entries(g).map(([k,x])=>({k,...x,med:med(x.pd)}));};
  const allMed=(()=>{const z=rows.map(r=>r.perDay).filter(v=>v!=null).sort((p,q)=>p-q);return z.length?z[Math.floor(z.length/2)]:null;})();
  const bySeries=group(r=>seriesOf(r).name).sort((a,b)=>(b.med??-1)-(a.med??-1));
  const byTag=group(r=>(r.tags||[]).filter(t=>perfAccount!=='ntr'||!/^anti[\s_-]*ntr(?:\s+series)?$/i.test(String(t).trim()))).filter(x=>x.n>=3).sort((a,b)=>(b.med??-1)-(a.med??-1));
  const from={description:0,title:0,none:0};for(const r of rows)from[seriesOf(r).from]++;
  const view=perfWorkView==='tags'?byTag:bySeries;
  const workRows=view.slice(0,perfWorkView==='tags'?14:12).map(x=>`<tr><td>${esc(x.k)}</td><td>${x.n}</td><td>${x.med!=null?`${fmt(Math.round(x.med))}${allMed?` <small class="${x.med>=allMed?'up':'down'}">${(x.med/allMed).toFixed(1)}×</small>`:''}`:'–'}</td><td>${fmt(Math.round(x.chats/x.n))}</td><td>${fmt(Math.round(x.likes/x.n))}</td><td>${esc(x.best?.title||'')}</td></tr>`).join('');
  const working=`<div class="perf-card"><div class="perf-card-head"><h4>What's working on this account</h4><div class="perf-sorts"><button class="perf-sort work-view ${perfWorkView!=='tags'?'on':''}" data-view="series">By series</button><button class="perf-sort work-view ${perfWorkView==='tags'?'on':''}" data-view="tags">By tag</button></div></div>
    <p class="micro work-note">All ${rows.length} bots${perfWorkView==='tags'?`, tags used by 3 or more bots`:``}, ranked by median chats per day${allMed?` (this account's median: ${fmt(Math.round(allMed))}/day; ×1.0 = typical)`:''}.${perfWorkView!=='tags'?` Series from ${[from.description?`${from.description} description prefix${from.description>1?'es':''}`:'',from.title?`${from.title} title${from.title>1?'s':''}`:''].filter(Boolean).join(', ')||'no series markers'}${from.none?`; ${from.none} with no series`:''}.`:''}</p>
    ${workRows?`<div class="perf-table-wrap work-wrap"><table class="perf-table"><tr><th>${perfWorkView==='tags'?'Tag':'Series'}</th><th>Bots</th><th title="Median chats per day, and how that compares with this account's median">Chats/day</th><th>Avg chats</th><th>Avg likes</th><th>Best bot</th></tr>${workRows}</table></div>`:`<p class="micro">${perfWorkView==='tags'?'No tag is used by 3 or more bots yet.':'No bots yet.'}</p>`}</div>`;
  const kc=n=>n==null?'':n>=1e6?(n/1e6).toFixed(1)+'m':n>=1e4?Math.round(n/1e3)+'k':n>=1e3?(n/1e3).toFixed(1)+'k':String(n),fs=acc.feedScan||null;
  const discovery=(()=>{const per=FEED_NAMES.map(([k,l])=>({k,l,list:rows.filter(r=>(r.feeds||{})[k]).sort((x,y)=>x.feeds[k]-y.feeds[k]),scanned:fs&&fs.scanned?fs.scanned[k]:null,total:fs&&fs.totals?fs.totals[k]:null}));
    const depth=f=>f.scanned!=null?` · scanned ${kc(f.scanned)}${f.total?' / '+kc(f.total):''}`:'';
    const chips=per.map(f=>`<button type="button" class="disc-chip feed-flt ${perfFeed===f.k?'on':''} f-${f.k}" data-feed="${perfFeed===f.k?'all':f.k}" title="${perfFeed===f.k?'Show every bot again in the table below':'Show only these bots in the All bots table below'}">${esc(f.l)}: <b>${f.list.length}</b><small>${esc(depth(f).replace(/^ · /,''))}</small></button>`).join('');
    const cards=per.map(f=>`<div class="disc-card ${f.list.length?'':'empty'}"><div class="disc-head"><b>${esc(f.l)}</b><span>${f.list.length?`${f.list.length} of yours`:'none of yours'}</span></div>${f.list.length?`<ol class="disc-list">${f.list.map(r=>`<li><span class="disc-rank">#${r.feeds[f.k]}</span><button type="button" class="disc-bot fx-pick" data-bot="${esc(r.id)}" title="${esc(r.title||'')}">${esc(r.title||'(untitled)')}</button><span class="disc-chats" title="${fmt(r.chats)} chats">${kc(r.chats)}c</span></li>`).join('')}</ol>`:`<p class="micro">Not in the top ${f.scanned!=null?fmt(f.scanned):'500'} yet.</p>`}</div>`).join('');
    return `<div class="perf-card disc"><div class="perf-card-head"><h4>Discovery by Placement</h4><small>${fs?`Where your bots sit in JuicyChat's discovery feeds, read ${esc((d=>isNaN(d)?'':d.toLocaleDateString(undefined,{month:'short',day:'numeric'}))(new Date(fs.at)))}`:`Where your bots sit in JuicyChat's discovery feeds`}. Click a feed to filter the table below, or a bot to open it.</small></div><div class="disc-chips">${chips}</div>${feedHitChart(acc)}<div class="disc-grid">${cards}</div>${fs?'':'<p class="micro">Pull this account to read the feeds and fill this in.</p>'}</div>`;})();
  // v1.5.3: the Discover tab (juicychat.ai/discover) is a list of rows, one per tag (#Futanari, #Furry, #Juicy Royalty...), and it is not one of the six feeds above
  const discoverTab=(()=>{const ds=acc.discoverScan||null,shown=(ds&&ds.shown)||10,depth=(ds&&ds.depth)||100,placed=rows.filter(r=>r.discover&&Object.keys(r.discover).length);
    const byRow=new Map();for(const r of placed)for(const [lab,pos] of Object.entries(r.discover)){if(!byRow.has(lab))byRow.set(lab,[]);byRow.get(lab).push({r,pos});}
    const order=ds&&Array.isArray(ds.rows)?ds.rows:[],labels=[...byRow.keys()].sort((a,z)=>{const ia=order.indexOf(a),iz=order.indexOf(z);return Math.min(...byRow.get(a).map(x=>x.pos))-Math.min(...byRow.get(z).map(x=>x.pos))||((ia<0?999:ia)-(iz<0?999:iz));});
    const onPage=placed.filter(r=>Object.values(r.discover).some(v=>v<=shown)).length;
    const when=ds&&ds.at?(d=>isNaN(d)?'':d.toLocaleDateString(undefined,{month:'short',day:'numeric'}))(new Date(ds.at)):'';
    const head=`<div class="perf-card-head"><h4>Discover Tab</h4><small>${ds?`Where your bots sit in the rows of juicychat.ai/discover, read ${esc(when)}. The page lists the first ${shown} of every row; this reads the first ${depth}.`:`Where your bots sit in the rows of juicychat.ai/discover (#Futanari, #Furry, #Juicy Royalty...).`}</small></div>`;
    if(!ds)return `<div class="perf-card disc">${head}<p class="micro">Pull this account to read the Discover tab and fill this in.</p></div>`;
    const sum=`<div class="disc-chips"><span class="disc-chip"><b>${placed.length}</b>&nbsp;of ${rows.length} bots in a Discover row</span><span class="disc-chip"><b>${onPage}</b>&nbsp;on the page itself (first ${shown})</span><span class="disc-chip"><b>${ds.rows.length}</b>&nbsp;rows read</span></div>`;
    const cards=labels.map(lab=>{const list=byRow.get(lab).sort((x,y)=>x.pos-y.pos);return `<div class="disc-card"><div class="disc-head"><b>#${esc(lab)}</b><span>${list.length} of yours</span></div><ol class="disc-list">${list.map(({r,pos})=>`<li><span class="disc-rank" ${pos<=shown?'style="color:#7be0a5"':''} title="${pos<=shown?'Shown on the Discover page':'Past the first '+shown+': found by opening the row'}">#${pos}</span><button type="button" class="disc-bot fx-pick" data-bot="${esc(r.id)}" title="${esc(r.title||'')}">${esc(r.title||'(untitled)')}</button><span class="disc-chats" title="${fmt(r.chats)} chats">${kc(r.chats)}c</span></li>`).join('')}</ol></div>`;}).join('');
    return `<div class="perf-card disc">${head}${sum}${labels.length?`<div class="disc-grid">${cards}</div>`:`<p class="micro">None of your bots is in the first ${depth} of any of the ${ds.rows.length} Discover rows yet.</p>`}<details class="bot-more"><summary>All ${ds.rows.length} rows that were read</summary><p class="micro">${ds.rows.map(x=>'#'+esc(x)).join(' · ')}</p></details></div>`;})();
  const sortBtn=(k,l)=>`<button class="perf-sort ${!perfCol&&perfSort===k?'on':''}" data-sort="${k}">${l}</button>`;
  const table=`<div class="perf-card"><div class="perf-card-head"><h4>All bots</h4><div class="perf-sorts">${sortBtn('placed','Best placed')}${sortBtn('chats','Most chats')}${sortBtn('likes','Most likes')}${sortBtn('growth','Fastest growing')}${sortBtn('perDay','Chats per day')}${sortBtn('newest','Newest')}<span class="perf-sort-sep"></span><button class="perf-sort perf-clear" title="Clear any filter and column sort, and go back to Fastest growing">✕ Clear filter</button></div></div>
    <div class="bots-search"><input id="bots-search" type="search" placeholder="Search bot names... (use #tag to search tags, e.g. #hero)" value="${esc(perfQuery)}" autocomplete="off"><span id="bots-search-count" class="micro"></span></div>${perfFeed!=='all'?`<p class="micro feed-note">Showing only the bots in the ${esc((FEED_NAMES.find(f=>f[0]===perfFeed)||[0,perfFeed])[1])} feed. <button type="button" class="linkish feed-clear">Show all bots</button></p>`:''}<div class="perf-table-wrap"><table class="perf-table bots"><tr>${[['bot','Bot',''],['chats','Chats',''],['likes','Likes',''],['favorites','Favourites',''],['release','Release Date',"The bot's Publish date on JuicyChat"],['days','Days live*',"Counted from the bot's Publish date when JuicyChat shows it; otherwise from the first pull, so older bots may show fewer days at first."],['perDay','Chats/day',''],['placed','Placement',"Where the bot sits in JuicyChat's feeds right now, as seen by the account that pulled it. Sorting puts the bots in the most feeds first (descending), and the best position first among bots in the same number of feeds"]].map(([k,l,t])=>{const on=perfCol&&perfCol.key===k,arrow=on?(k==='release'?(perfCol.dir==='asc'?' ↓ newest':' ↑ oldest'):(perfCol.dir==='asc'?' ▲':' ▼')):'';return `<th class="sortable${on?' on':''}" data-col="${k}" title="${esc((t?t+' · ':'')+(k==='release'?'Click: newest first, click again: oldest first':'Click: ascending, click again: descending'))}">${l}<span class="sort-arrow">${arrow}</span></th>`;}).join('')}</tr>${(perfFeed==='all'?rows:rows.filter(r=>(r.feeds||{})[perfFeed])).map(r=>{return `<tr class="${perfBot===r.id?'sel':''}" data-search="${esc(String(r.title||'').toLowerCase())}" data-tags="${esc((r.tags||[]).join('|').toLowerCase())}"><td><button class="fx-pick" data-bot="${esc(r.id)}" title="Show this bot's forensics">${esc(r.title||r.id)}</button> <a href="${esc(r.url)}" target="_blank" rel="noopener" class="fx-ext" title="Open on JuicyChat">↗</a></td><td>${fmt(r.chats)} ${chg(r.dc)}</td><td>${fmt(r.likes)} ${chg(r.dl)}</td><td>${fmt(r.favorites)}</td><td>${(d=>d?`<span title="${esc(new Date(d).toLocaleString())}">${new Date(d).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span>`:'<span class="micro" title="Not in JuicyChat\'s data yet: pull again">–</span>')(Date.parse(r.published||r.created||'')||null)}</td><td>${fmt(r.days)}</td><td>${fmt(r.perDay)}</td><td class="feed-cell">${feedChips(r.feeds)||'<span class="micro">–</span>'}</td></tr>`;}).join('')}</table></div><p class="micro">*Days live uses the bot's creation date when JuicyChat shows it, otherwise the date of its first pull.</p></div>`;
  const selBot=perfBot&&bots.find(x=>x.id===perfBot);
  $('performance-content').innerHTML=tabs+signBox+perfGrp('Pull your bots',setup+details)+perfGrp('Overview',ratingLine+kpis)+(selBot?botForensics(acc,selBot,cards):'<p class="micro fx-hint">Click any bot in the table below to see its forensics: why it performed, when it performed, where it is placed and its commenters.</p>')+`<div class="perf-grid">${chart}${working}</div>`+discovery+discoverTab+table;bindPerf();perfFold();try{fitPerfChart();}catch(e){console.error('chart fit:',e);}
  qsa('.rt-pick').forEach(el=>el.onchange=async()=>{try{state=await window.juicyApp.perfSetRating(perfAccount,el.dataset.url,el.value||null);renderPerformance();toast(el.value?`Rating set to ${el.value}. Your choice is kept on every pull.`:'Back to the detected rating.');}catch(e){toast(e.message,true);}});
  {const cp=document.querySelector('.rt-copy');if(cp)cp.onclick=async()=>{const acc=state.accounts?.[perfAccount]||{},list=acc.bots||[];
    const lines=list.map(b=>{const raw=b.raw||{},keys=Object.keys(raw).filter(k=>k!=='rating'&&/rat|nsfw|adult|18|level|grade|mature|content|audit|visib/i.test(k));
      return [b.title,`rating=${b.rating??'-'}`,...keys.map(k=>`${k}=${raw[k]}`),`badge=${b.ratingLabel||'none'}`,`shown=${RATING_LABEL[ratingOf(b,perfAccount)]||'?'}`,(acc.ratingOverrides||{})[b.url]?'set by hand':''].filter(Boolean).join(' | ');});
    await window.copyText(`JuicyChat Analytics Tool rating details (${list.length} bots, ${IS_SHARE?'shareable':'personal'} edition)\n`+lines.join('\n'));toast('Rating details copied. Paste them into a message to send for checking.');};}
}
function bindPerf(){
  const applyBotSearch=()=>{const q=perfQuery.trim().toLowerCase(),rows=qsa('.perf-table.bots tr[data-search]');let shown=0;
    // plain words search bot names only; words starting with # search tags ("#hero")
    const words=q.split(/\s+/).filter(Boolean);
    for(const tr of rows){const name=tr.dataset.search,tags=(tr.dataset.tags||'').split('|');
      const hit=!words.length||words.every(w=>w.startsWith('#')?(w.length<2||tags.some(t=>t.includes(w.slice(1)))):name.includes(w));
      tr.style.display=hit?'':'none';if(hit)shown++;}
    const c=$('bots-search-count');if(c)c.textContent=q?`${shown} of ${rows.length} bots`:`${rows.length} bots`;};
  const sb=$('bots-search');if(sb){sb.oninput=()=>{perfQuery=sb.value;applyBotSearch();};sb.onkeydown=e=>{if(e.key==='Escape'){sb.value='';perfQuery='';applyBotSearch();}};}
  applyBotSearch();
  qsa('.perf-tab').forEach(b=>b.onclick=()=>{perfAccount=b.dataset.acct;perfBot=null;perfQuery='';renderPerformance();});
  bindCharts();qsa('.chart-metric').forEach(b=>b.onclick=()=>{perfChartMetric=b.dataset.metric;renderPerformance();});
  qsa('.feed-flt').forEach(b=>b.onclick=()=>{perfFeed=b.dataset.feed;renderPerformance();});
  qsa('.feed-clear').forEach(b=>b.onclick=()=>{perfFeed='all';renderPerformance();});
  qsa('.fx-pick').forEach(b=>b.onclick=()=>{perfBot=b.dataset.bot;renderPerformance();const f=$('fx');if(f)f.scrollIntoView({block:'start'});});
  const fc=$('fx-close');if(fc)fc.onclick=()=>{perfBot=null;renderPerformance();};
  qsa('.work-view').forEach(b=>b.onclick=()=>{perfWorkView=b.dataset.view;renderPerformance();});
  qsa('.perf-sort[data-sort]:not(.chart-metric):not(.work-view)').forEach(b=>b.onclick=()=>{perfSort=b.dataset.sort;perfCol=null;renderPerformance();});
  qsa('.perf-table.bots th[data-col]').forEach(th=>th.onclick=()=>{const k=th.dataset.col;perfCol=perfCol&&perfCol.key===k?{key:k,dir:perfCol.dir==='asc'?'desc':'asc'}:{key:k,dir:'asc'};renderPerformance();});
  {const c=document.querySelector('.perf-clear');if(c)c.onclick=()=>{perfCol=null;perfSort='growth';perfQuery='';perfFeed='all';renderPerformance();};}
  {;}
  qsa('.rc-mark').forEach(btn=>btn.onclick=async()=>{const rules={...(state.settings.ratingRules||{}),[perfAccount]:{field:btn.dataset.field,value:btn.dataset.value}};state=await window.juicyApp.saveSettings({ratingRules:rules});renderAll();toast(`Bots with ${btn.dataset.field} = ${btn.dataset.value} now count as 18+.`);});
  const rcc=document.querySelector('.rc-clear');if(rcc)rcc.onclick=async()=>{const rules={...(state.settings.ratingRules||{})};delete rules[perfAccount];state=await window.juicyApp.saveSettings({ratingRules:rules});renderAll();};
  const one=$('perf-pull-one');if(one)one.onclick=()=>runBusy('Reading your bots from JuicyChat...',async()=>window.juicyApp.performancePull(),'collector');
}
function closeAskHide(){for(const id of ['close-ask','webp-abort-ask']){const m=document.getElementById(id);if(m)m.remove();}}
function closeAskShow(d){closeAskHide();const tray=!(d&&d.tray===false);
  const m=document.createElement('div');m.className='upd-modal';m.id='close-ask';m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-labelledby','close-ask-h');
  m.innerHTML=`<div class="upd-box close-ask-box"><div class="close-ask-head"><div class="brand-mark">JA</div><h3 id="close-ask-h">Close the JuicyChat Analytics Tool?</h3></div><p>${tray?'<b>Exit</b> closes the app completely. <b>Close to System Tray</b> hides the window and keeps the app running in the background for the automatic daily pulls; open it again from the tray icon.':'The system tray is not available on this computer, so the app cannot keep running in the background.'}</p><div class="button-row close-ask-row"><button type="button" class="danger" id="close-ask-exit">Exit</button>${tray?'<button type="button" class="primary" id="close-ask-tray">Close to System Tray (run in background)</button>':''}<button type="button" class="ghost" id="close-ask-cancel">Cancel</button></div></div>`;
  document.body.appendChild(m);
  const answer=c=>{closeAskHide();try{window.juicyApp.closeChoice(c);}catch{}};
  m.querySelector('#close-ask-exit').onclick=()=>answer('exit');const t=m.querySelector('#close-ask-tray');if(t)t.onclick=()=>answer('tray');
  const cn=m.querySelector('#close-ask-cancel');cn.onclick=()=>answer('cancel');cn.focus();
  m.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();answer('cancel');}});
  try{window.juicyApp.closeShown();}catch{}}
function pullMode(){return ($('pull-timezone')&&$('pull-timezone').value)||(state.settings.pullTimeZone==='computer'?'computer':'est');}
function pullTzName(mode){return mode==='computer'?(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'):'Etc/GMT+5';}
const pullFmtCache={};
function pullFmts(tz){return pullFmtCache[tz]||(pullFmtCache[tz]={
  wall:new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}),
  name:new Intl.DateTimeFormat('en-US',{timeZone:tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short'}),
  when:new Intl.DateTimeFormat('en-US',{timeZone:tz,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})});}
function nextPullText(hhmm,mode,nowMs){
  const tz=pullTzName(mode), parts=hhmm&&String(hhmm).match(/^(\d{1,2}):(\d{2})$/), h=parts?+parts[1]:20, m=parts?+parts[2]:0;
  if(h>23||m>59)return 'Next: —';          // not a real clock time (the old way never found a match either)
  const now=nowMs==null?Date.now():nowMs, F=pullFmts(tz), MIN=60000, DAY=86400000;
  // the wall-clock time in the zone at instant t, written as if it were UTC (so two of them can be subtracted)
  const wall=t=>{const o={};for(const x of F.wall.formatToParts(new Date(t)))o[x.type]=x.value;return Date.UTC(+o.year,+o.month-1,+o.day,+o.hour%24,+o.minute,+o.second);};
  const w0=wall(now), midnight=w0-((w0%DAY)+DAY)%DAY;
  let best=null;
  for(let day=-1;day<=3;day++){
    const target=midnight+day*DAY+(h*60+m)*MIN;
    const guess=target-(wall(now)-Math.floor(now/1000)*1000), t0=target-(wall(guess)-Math.floor(guess/1000)*1000);
    for(let k=-2;k<=2;k++){                         // the zone's offset can change in between (daylight saving), so a few nearby instants are checked
      const c=t0+k*1800000; if(wall(c)!==target)continue;
      if(c+MIN>now&&c-now<=2880*MIN&&(best===null||c<best))best=c;
    }
  }
  if(best===null)return 'Next: —';
  const d=new Date(best), p=Object.fromEntries(F.name.formatToParts(d).map(x=>[x.type,x.value]));
  return `Next: ${F.when.format(d)} ${p.timeZoneName} (${mode==='computer'?'computer time':'EST, fixed UTC-05:00'}).`;
}
function refreshPullNotes(){
  const mode=pullMode(), zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
  const note=$('pull-zone-note'), follow=$('pull-zone-follow');
  if(note)note.textContent=`Detected computer timezone: ${zone}. Ordinary timestamps use your computer's clock.`;
  if(follow)follow.textContent=mode==='computer'?'These times follow the computer timezone, including daylight-saving and timezone changes.':'These times stay on fixed UTC-05:00, with no daylight-saving shift.';
  const cn=$('collect-next'), pn=$('perf-next');
  if(cn)$('collect-next').textContent=nextPullText(($('collect-time')||{}).value||state.settings.collectTime||'20:00', mode);
  if(pn)$('perf-next').textContent=nextPullText(($('perf-time')||{}).value||state.settings.perfTime||'20:00', mode);
  const mn=$('morning-next');if(mn)mn.textContent=($('auto-morning')||{}).checked?nextPullText(($('morning-time')||{}).value||state.settings.morningTime||'08:00',mode).replace('Next:','Next morning pull:'):'Optional. Off by default.';
  const perf=$('auto-performance');
  if(perf&&perf.parentElement)perf.parentElement.lastChild.textContent=IS_SHARE?' Pull your bots for the Performance tab every day':' Pull the Main and NTR lounges for the Performance tab every day';
}
function renderAutoStatus(){const el=$('auto-status');if(!el)return;const S=state.settings,sch=state.schedule||{},log=(sch.log||[])[0];
  // v1.3.4: an automatic run that could not collect stays the "Last" line until the next automatic run. When Recent + Trending were collected by hand
  // after it, the data is up to date, so the line says that instead of still showing the old error in red.
  const handAt=state.datasets&&state.datasets.lastCollectedAt, fixedByHand=!!(log&&!log.ok&&log.kind!=='perf'&&handAt&&new Date(handAt)>new Date(log.at));
  const fmtWhen=d=>new Date(d).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const on=S.autoCollect!==false||S.autoPerformance!==false||S.autoMorning===true;
  const mode=S.pullTimeZone==='computer'?'computer':'est', ct=S.collectTime||'20:00', pt=S.perfTime||'20:00';
  const mt=S.morningTime||'08:00',am=S.autoMorning===true;const when=(ct===pt?`at ${ct}`:`analysis at ${ct}, performance at ${pt}`)+(am?` · morning pull at ${mt}`:'');
  const where=mode==='computer'?'computer time':'EST (fixed UTC-05:00)';
  el.innerHTML=on?`<span class="auto-dot ${log&&!log.ok&&!fixedByHand?'bad':'ok'}"></span><b>Automatic:</b> every day ${when} ${where}${S.autoCollect!==false?' · collects Recent + Trending':''}${S.autoPerformance!==false?(IS_SHARE?' · pulls your bots':' · pulls your Main and NTR lounges'):''}. ${nextPullText(ct,mode).replace('Next: ','Next analysis: ')}${ct!==pt?` ${nextPullText(pt,mode).replace('Next: ','Next performance: ')}`:''}${fixedByHand?` <span class="auto-last">Last: collected by hand ${esc(fmtWhen(handAt))}, so Recent + Trending are up to date (the automatic run at ${esc(fmtWhen(log.at))} could not collect).</span>`:log?` <span class="auto-last ${log.ok?'':'bad'}">Last: ${esc(fmtWhen(log.at))} · ${esc(log.message)}</span>`:''} <a href="#" data-jump-settings>Change</a>`:`<b>Automatic daily pulls are off.</b> <a href="#" data-jump-settings>Turn them on in Settings</a>`;
  qsa('[data-jump-settings]').forEach(a=>a.onclick=e=>{e.preventDefault();switchView('settings');});}
let blockedDraft=null,blockTagCache={key:'',tags:[]};
const blockNorm=t=>String(t==null?'':t).toLowerCase().replace(/^#+/,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function blockedNow(){return blockedDraft||((state&&state.settings&&state.settings.blockedTags)||[]);}
const blockOdd=n=>/[\p{Extended_Pictographic}\p{So}‍️]/u.test(n)||n.length>60||n.trim().split(/\s+/).length>8;
function setBlockTags(tags){blockTagCache.tags=(tags||[]).filter(t=>t&&t.name&&!blockOdd(t.name)).map(t=>({name:t.name,count:t.count||0,n:blockNorm(t.name)}));}
async function loadBlockTags(force){
  const st=state||{},key=(st.datasets&&st.datasets.lastCollectedAt||'')+'|'+(st.juicyTagsAt||'');
  if(!force&&blockTagCache.key===key&&blockTagCache.tags.length)return;
  try{const r=await window.juicyApp.tagsList();blockTagCache.key=key;setBlockTags(r.tags||[]);}catch(e){blockTagCache.key=key;blockTagCache.tags=[];}
  renderBlockPick();
}
function renderBlockChips(){
  const box=$('block-chips');if(!box)return;
  const list=blockedNow();
  box.innerHTML=list.length?list.map(t=>`<span class="block-chip">${esc(t)}<button type="button" class="block-x" data-tag="${esc(t)}" title="Unblock ${esc(t)}">×</button></span>`).join(''):'<span class="micro">No tags blocked.</span>';
}
function renderBlockPick(){
  const pick=$('block-pick');if(!pick)return;
  const have=new Set(blockedNow().map(blockNorm)),q=blockNorm(($('block-input')||{}).value||'');
  const all=blockTagCache.tags,shown=[];
  if(q){
    for(const t of all){if(t.n.startsWith(q)&&!have.has(t.n))shown.push(t);}
    for(const t of all){if(!t.n.startsWith(q)&&t.n.includes(q)&&!have.has(t.n))shown.push(t);}
  }else for(const t of all){if(!have.has(t.n))shown.push(t);}
  pick.innerHTML=shown.map(t=>`<button type="button" class="block-pick-b" data-tag="${esc(t.name)}">${esc(t.name)}${t.count?`<em>${t.count}</em>`:''}</button>`).join('')||(all.length?'<span class="micro">No other tag matches. Press Block to block what you typed.</span>':'<span class="micro">No tags yet. Collect Recent + Trending, or press Read tags from JuicyChat.</span>');
}
function renderBlocked(skipLoad){
  renderBlockChips();renderBlockPick();
  if(!skipLoad)loadBlockTags(false);
}
function blockTag(name){
  const label=String(name||'').replace(/^[^\p{L}\p{N}]+/u,'').replace(/\s+/g,' ').trim().slice(0,60);if(!label)return;
  const cur=[...blockedNow()];if(cur.some(x=>blockNorm(x)===blockNorm(label)))return;
  blockedDraft=[...cur,label];if(window.__settingsDirty)window.__settingsDirty(true);$('block-input').value='';renderBlocked(true);
}
let blockBound=false;
function bindBlocked(){
  const panel=$('block-panel');if(!panel||blockBound)return;blockBound=true;
  // v1.3.4: clicks are caught on the page, not on the Blocked tags card. Since v1.3.2 the card is folded into a new box (Collapse) after it is set up,
  // so a listener on the card itself was left behind on the old box and clicking a tag (to block it) or its × (to unblock it) did nothing.
  document.addEventListener('click',e=>{
    if(!e.target||!e.target.closest||!e.target.closest('#block-panel'))return;
    const x=e.target.closest('.block-x'),b=e.target.closest('.block-pick-b');
    if(x){blockedDraft=blockedNow().filter(t=>t!==x.dataset.tag);if(window.__settingsDirty)window.__settingsDirty(true);renderBlocked(true);}
    else if(b)blockTag(b.dataset.tag);
  });
  $('block-add').onclick=()=>blockTag($('block-input').value);
  $('block-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();blockTag($('block-input').value);}});
  let bt=null;$('block-input').addEventListener('input',()=>{clearTimeout(bt);bt=setTimeout(renderBlockPick,120);});
  $('block-fetch').onclick=async()=>{const btn=$('block-fetch');btn.disabled=true;$('block-note').textContent='Reading tags from JuicyChat...';
    try{const r=await window.juicyApp.tagsFetch();$('block-note').textContent=`Read ${r.count} tags from JuicyChat.`;await loadBlockTags(true);}
    catch(e){$('block-note').textContent=e.message;}finally{btn.disabled=false;}};
}
let siSig='';
function renderSignIns(){
  const t=$('signin-title'),sub=$('signin-sub'),h=$('si-tool-h'),box=$('set-accounts');if(!box||!state)return;
  if(IS_SHARE){if(t)t.textContent='Your JuicyChat account';if(h)h.style.display='none';if(sub)sub.textContent='Paste a magic link from your JuicyChat account email and press Sign in. The app signs in by itself in the background (no browser window) and keeps the session. JuicyChat Analysis and Performance both use it.';box.innerHTML='';return;}
  const rows=Object.entries(PERF_ACCTS_ALL).map(([k,l])=>{const a=(state.accounts||{})[k]||{},si=a.signedIn;return {k,l,ok:!!(si&&si.ok),name:si&&si.userName||'',out:!!a.loggedOut,lounge:state.settings[k==='ntr'?'loungeNtr':'loungeMain']||''};});
  const sig=JSON.stringify(rows);if(sig===siSig&&box.children.length)return;siSig=sig;
  box.innerHTML=rows.map(r=>`<div class="si-block" data-acct="${r.k}"><h4 class="si-h">${esc(r.l)} <small>used by Performance: reads its own bots, plus who liked, starred, commented and followed</small></h4>${r.ok?`<div class="si-on"><span class="session-dot on"></span><div><b>Signed in${r.name?` as ${esc(r.name)}`:''}</b><span class="micro">Pulls read this account's own bots directly. No lounge link needed.</span></div><button type="button" class="ghost danger-ghost si-out" data-acct="${r.k}">Sign out</button></div>`:`${r.out?`<div class="bd-warn acct-lo"><b>${esc(r.l)} is logged out.</b> You need to log back in to scrape. Paste a magic link here.</div>`:''}<div class="input-row"><input id="si-link-${r.k}" class="si-link" type="password" placeholder="https://... magic link from this account's email" autocomplete="off"><button type="button" class="primary si-open" data-acct="${r.k}">Sign in</button></div><p class="micro">Optional: without it the account is read from its lounge link, without who liked / starred.</p>`}<div class="si-lounge"><label class="stack">${esc(r.l)} lounge link<input id="si-lounge-${r.k}" type="url" value="${esc(r.lounge)}" placeholder="https://www.juicychat.ai/... (the public lounge page of this account)"></label><button type="button" class="secondary si-lounge-save" data-acct="${r.k}">Save link</button></div></div>`).join('');
  box.querySelectorAll('.si-lounge-save').forEach(b=>b.onclick=async()=>{const k=b.dataset.acct,inp=$('si-lounge-'+k);try{state=await window.juicyApp.performanceSetLounge(k,inp?inp.value.trim():'');siSig='';renderAll();toast(`${PERF_ACCTS_ALL[k]} lounge link saved.`);}catch(e){toast(e.message,true);}});
  box.querySelectorAll('.si-open').forEach(b=>b.onclick=async()=>{const k=b.dataset.acct,inp=$('si-link-'+k),link=inp?inp.value.trim():'';if(!link)return toast('Paste a fresh JuicyChat magic link first.',true);
    try{b.disabled=true;b.textContent='Signing in...';state=await window.juicyApp.accountOpenLogin(k,link);const ok=(state.accounts||{})[k]?.signedIn?.ok;siSig='';renderAll();toast(ok?`${PERF_ACCTS_ALL[k]} signed in. Click Pull in Performance to read its bots and notifications.`:'The sign-in was not confirmed. The magic link may be expired or already used.',!ok);}catch(e){siSig='';renderAll();toast(e.message,true);}});
  box.querySelectorAll('.si-out').forEach(b=>b.onclick=async()=>{const k=b.dataset.acct;if(!confirm(`Sign the tool out of the ${PERF_ACCTS_ALL[k]}? Its data stays.`))return;try{state=await window.juicyApp.accountSignOut(k);siSig='';renderAll();toast('Signed out.');}catch(e){toast(e.message,true);}});
}
function renderDiscarded(){
  const el=$('block-discarded');if(!el)return;
  const d=state&&state.discardedBots;
  if(!d||!(d.items||[]).length){el.innerHTML=d?'<p class="micro">No bots were discarded in the last collection because of blocked tags.</p>':'';return;}
  const tagsHit=[...new Set(d.items.flatMap(x=>x.blocked||[]).map(t=>t))];
  const when=d.at?new Date(d.at).toLocaleString():'';
  el.innerHTML=`<div class="bd-box"><h4>These bots were discarded from your data because of the following blocked tags</h4>
    <p class="bd-sub">${d.items.length} bot${d.items.length===1?'':'s'} left out of the last collection${when?` (${esc(when)})`:''}. They did not count toward the pull, so the scan kept going to reach your target. Blocked: ${tagsHit.map(t=>esc(t)).join(', ')||'-'}.</p>
    <div class="bd-list">${d.items.map(x=>{const hit=new Set((x.blocked||[]).map(blockNorm));const tags=[...(x.blocked||[]),...(x.tags||[]).filter(t=>!hit.has(blockNorm(t)))];
      return `<div class="bd-row"><span class="bd-name">${x.url?`<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a>`:esc(x.name)}</span><span class="bd-sec">${esc((x.sections||[]).join(' + '))}</span><span class="bd-tags">${tags.map(t=>`<span class="bd-tag${hit.has(blockNorm(t))?' hit':''}">${esc(t)}</span>`).join('')}</span></div>`;}).join('')}</div></div>`;
}
function renderBlockReminder(){
  const el=$('block-reminder');if(!el)return;
  const list=(state&&state.settings&&state.settings.blockedTags)||[];
  el.innerHTML=list.length
    ?`<span class="br-label">Blocked tags (${list.length}), skipped when collecting:</span>${list.map(t=>`<span class="block-chip">${esc(t)}</span>`).join('')}<a class="br-change">Change</a>`
    :`<span class="br-label">Blocked tags: none.</span><a class="br-change">Block tags</a>`;
  const a=el.querySelector('.br-change');if(a)a.onclick=()=>{const b=document.querySelector('.nav-btn[data-view="settings"]');if(b)b.click();setTimeout(()=>{const p=$('block-panel');if(p)p.scrollIntoView({block:'center'});},120);};
}
const bgPull={on:false,t0:0,tick:null,hide:null,hidden:false,title:'',account:''};
function bgShow(patch){const el=$('bg-pull');if(!el)return;
  if(bgPull.hidden&&!patch.force)return;
  el.classList.remove('hidden');document.body.classList.add('bg-on');
  if(patch.title!=null)$('bg-pull-title').textContent=patch.title;
  if(patch.what!=null)$('bg-pull-what').textContent=patch.what;
  if(patch.msg!=null)$('bg-pull-msg').textContent=patch.msg;
  if(patch.pct!=null){el.classList.remove('indet');$('bg-pull-fill').style.width=Math.max(0,Math.min(100,patch.pct))+'%';}
  else if(patch.indet){el.classList.add('indet');}
  el.classList.toggle('done',!!patch.done);el.classList.toggle('err',!!patch.err);}
function bgClose(ms){clearTimeout(bgPull.hide);bgPull.hide=setTimeout(()=>{const el=$('bg-pull');if(el)el.classList.add('hidden');document.body.classList.remove('bg-on');bgPull.hidden=false;},ms);}
function bgOnAuto(r){const el=$('bg-pull');if(!el)return;
  if(!el.dataset.bound){el.dataset.bound='1';$('bg-pull-x').onclick=()=>{bgPull.hidden=true;el.classList.add('hidden');document.body.classList.remove('bg-on');};}
  if(r.stage==='start'){clearTimeout(bgPull.hide);bgPull.on=true;bgPull.hidden=false;bgPull.t0=Date.now();bgPull.title=r.title||'Automatic run';bgPull.account='';
    el.classList.remove('done','err');$('bg-pull-fill').style.width='0%';
    bgShow({title:bgPull.title,what:'Starting...',msg:'This runs in the background. You can keep using the app.',indet:true,force:true});
    clearInterval(bgPull.tick);bgPull.tick=setInterval(()=>{const t=$('bg-pull-time');if(t){const s=Math.round((Date.now()-bgPull.t0)/1000);t.textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}},1000);}
  else if(r.stage==='done'||r.stage==='error'){bgPull.on=false;clearInterval(bgPull.tick);
    if(r.stage==='done'){bgShow({what:'Finished',msg:'Everything is saved.',pct:100,done:true});bgClose(6000);}
    else{bgShow({what:'Could not finish',msg:r.message||'',pct:100,err:true});bgClose(15000);}}}
function bgAccount(name){if(name&&name!==bgPull.account){bgPull.account=name;bgShow({title:`${bgPull.title} · ${name}`});}}
function bgOnStep(p){if(!bgPull.on)return;bgAccount(p.account);
  const hasPct=!p.indeterminate&&p.current!=null&&p.target;
  bgShow({what:p.message||'Working...',msg:'',...(hasPct?{pct:Math.round(p.current/p.target*100)}:{indet:true})});}
function bgOnCollect(p){if(!bgPull.on||!p)return;if(p.pull&&p.account)bgAccount(p.account);
  const label=p.pull?(p.account||p.sortName):(p.sortName||p.source||'');
  const cur=Number(p.overallCurrent??p.current),tg=Number(p.overallTarget??p.target);
  const counted=Number.isFinite(cur)&&Number.isFinite(tg)&&tg>0;
  const what=p.pull?(p.message||`Reading ${label}...`):(label?`${label}${p.current!=null&&p.target!=null?` · ${p.current} of ${p.target} bots`:''}`:(p.message||'Collecting...'));
  bgShow({what,msg:p.pull?'':(p.message||''),...(counted&&!p.pull?{pct:Math.round(cur/tg*100)}:{indet:true})});}
function bgOnAnalysis(p){if(!bgPull.on||!p)return;bgShow({what:p.message||'Analyzing...',msg:'',indet:true});}
// ---- JuicyChat Analytics Tool: the five tabs (Dashboard, Your Performance, JuicyChat Analysis, Engine Library, Settings)
function switchView(name){if(!$('view-'+name))return;   // a tab that does not exist never hides the current one
qsa('.view').forEach(v=>v.classList.remove('active'));qsa('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$('view-'+name).classList.add('active');$('view-title').textContent=(viewMeta[name]||[name])[0];$('view-subtitle').textContent=(viewMeta[name]||['',''])[1]||'';try{localStorage.setItem('jat.view',name);}catch{}}
{const _switchView=switchView;switchView=function(name){if(busyHome&&name===busyHome)busyRestore();else busyMinimize();return _switchView.apply(this,arguments);};}
function renderDashboard(){
  $('dashboard-metrics').innerHTML=[dashHeatCard(),dashPlaceCard(),dashTagsCard()].join('');
  if(window.TimingView&&window.TimingView.mini)window.TimingView.mini($('dash-heat-body'));
  {const ea=state.engineAnalysis||{},signals=(ea.topSignals||[]).slice(0,10),trends=ea.signalTrends||{},engs=ea.engines||[];
    const mv=m=>m==='Rising'||m==='New this week'?`<em class="mv up">▲ ${m==='Rising'?'Rising':'New'}</em>`:m==='Fading'?'<em class="mv down">▼ Fading</em>':'';
    const up=engs.filter(e=>e.momentum==='Rising'||e.momentum==='New this week'),down=engs.filter(e=>e.momentum==='Fading'),known=engs.some(e=>e.momentum);
    const mover=(e,c)=>`<div class="sig-mv ${c}" title="${esc(e.momentumDetail||'')}"><b>${c==='up'?'▲':'▼'} ${esc(e.name)}</b><small>${esc(e.momentumDetail||'')}</small></div>`;
    $('dashboard-signals').innerHTML=signals.length?signals.map((x,i)=>{const t=trends[x];return `<div class="signal"><strong>${esc(x)}</strong>${mv(t&&t.momentum)}<span>#${i+1}</span></div>`;}).join('')
      +`<div class="sig-movers"><div><h5>▲ Engines gaining ground</h5>${up.length?up.map(e=>mover(e,'up')).join(''):`<p class="micro">${known?'None gaining right now.':'Needs scrapes on different days (about 10) to show what is rising.'}</p>`}</div><div><h5>▼ Engines losing ground</h5>${down.length?down.map(e=>mover(e,'down')).join(''):`<p class="micro">${known?'None fading right now.':'Needs scrapes on different days (about 10) to show what is fading.'}</p>`}</div></div>`
      :'Run JuicyChat Analysis to populate this section.';}
}
// the JuicyChat scanner (Python + Playwright), installed once on this computer before the first sign-in
let RT={ready:null,installing:false,msg:'',err:''};
async function renderRuntime(refresh){const host=$('runtime-box');if(!host)return;
  if(refresh!==false){try{const s=await window.juicyApp.runtimeStatus();RT.ready=!!s.ready;RT.installing=!!s.installing;}catch(e){RT.err=e.message||String(e);}}
  if(RT.ready){host.innerHTML='';host.hidden=true;return;}
  host.hidden=false;
  host.innerHTML=`<div class="bd-warn rt-install"><b>Install the JuicyChat scanner first (one time only)</b><p class="micro">Signing in, collecting and pulling your bots use the same JuicyChat scanner as Blueprint Studio: Python with Playwright and Chromium. It is installed once on this computer (about 200 MB) and kept when the app updates.</p><div class="button-row"><button type="button" class="primary" id="runtime-install" ${RT.installing?'disabled':''}>${RT.installing?'Installing...':'Install scanner'}</button></div><p class="micro" id="runtime-msg">${esc(RT.err||RT.msg||'')}</p></div>`;
  $('runtime-install').onclick=async()=>{RT.installing=true;RT.err='';renderRuntime(false);try{const r=await window.juicyApp.runtimeInstall();RT.ready=!!r.ready;RT.installing=false;toast('The JuicyChat scanner is installed. Paste your magic link and press Sign in.');}catch(e){RT.installing=false;RT.err=e.message||String(e);toast(RT.err,true);}renderRuntime(false);};
}
function renderSettings(){renderSignIns();bindBlocked();renderBlocked();renderRuntime();const s=state.settings;$('auto-collect').checked=s.autoCollect!==false;$('auto-performance').checked=s.autoPerformance!==false;{const ol=$('open-at-login');if(ol)ol.checked=!!s.openAtLogin;}$('pull-timezone').value=s.pullTimeZone==='computer'?'computer':'est';$('collect-time').value=s.collectTime||'20:00';$('perf-time').value=s.perfTime||'20:00';$('auto-morning').checked=s.autoMorning===true;$('morning-time').value=s.morningTime||'08:00';$('target-recent').value=s.targetRecent;$('target-trending').value=s.targetTrending;$('gender-filter').value=s.gender||'Female';$('juicy-home-url').value=s.juicyHomeUrl||'https://www.juicychat.ai';refreshPullNotes();if(window.Collapse)window.Collapse.apply($('view-settings'),'set');}
function renderAll(){if(!state)return;renderDashboard();renderAnalysis();renderEngines();renderPerformance();renderAutoStatus();renderBlockReminder();renderDiscarded();renderSettings();}
function bindStatic(){
  qsa('.nav-btn').forEach(b=>b.onclick=()=>switchView(b.dataset.view));qsa('[data-jump]').forEach(b=>b.onclick=()=>switchView(b.dataset.jump));
  $('open-login').onclick=async()=>{try{const link=$('magic-link').value.trim();if(!link)return toast('Paste a fresh JuicyChat magic link first.',true);renderAuthStatus({signedIn:null,status:'checking',message:'Signing in in the background...'});const r=await window.juicyApp.openLogin(link);renderAuthStatus(r.auth);if(r.ok){$('magic-link').value='';toast('Signed in. The session is saved and ready for collection.');}else toast(r.auth?.message||'The sign-in was not confirmed. Use a fresh magic link.',true);}catch(e){renderAuthStatus({signedIn:false,status:'signed-out',message:e.message||String(e)});toast(e.message,true);}};
  $('check-session').onclick=()=>checkSession(true);
  $('reset-session').onclick=async()=>{if(!confirm('Clear the saved JuicyChat login from this app? You will need a fresh magic link to sign in again.'))return;try{const status=await window.juicyApp.resetLogin();renderAuthStatus(status);$('magic-link').value='';toast('Saved JuicyChat login cleared.');}catch(e){toast(e.message,true);}};
  $('collect-recent').onclick=()=>runBusy('Collecting Recent bots...',async()=>window.juicyApp.collect('Recent'),'collector');
  $('collect-trending').onclick=()=>runBusy('Collecting Trending bots...',async()=>window.juicyApp.collect('Trending'),'collector');
  $('collect-both').onclick=()=>runBusy('Collecting Recent + Trending bots...',async()=>window.juicyApp.collect('both'),'collector');
  $('perf-pull').onclick=()=>runBusy('Reading your bots from JuicyChat...',async()=>window.juicyApp.performancePull(),'collector');
  window.juicyApp.onAutoRun&&window.juicyApp.onAutoRun(r=>{bgOnAuto(r);if(r.state){state=r.state;setTimeout(renderAll,60);}
    if(r.stage==='start')toast(r.kind==='am'?'Morning pull: pulling your bot stats...':r.kind==='collect'?'Daily run: collecting Recent + Trending...':'Daily run: pulling your bot stats...');
    else if(r.stage==='done')toast(r.kind==='am'?'Morning pull: your bot stats are updated.':r.kind==='collect'?'Daily run: collection and analysis updated.':'Daily run: your bot stats are updated.');
    else if(r.stage==='error')toast(`${r.kind==='am'?'Morning pull':'Daily run'} could not finish: ${r.message}. It will try again in 45 minutes.`,true);});
  const cancelBtn=$('cancel-collection');
  if(cancelBtn)cancelBtn.onclick=async()=>{if(!collectorUi.active)return;cancelBtn.disabled=true;cancelBtn.textContent='Cancelling...';setCollectorStatus('CANCELLING','stalled');collectorLog('Cancel requested. Stopping the JuicyChat scanner and keeping captured records...','warn');try{await window.juicyApp.cancelCollect();}catch(e){collectorLog(e.message||String(e),'warn');}};
  $('analyze-engines').onclick=()=>runBusy('Measuring success engines locally...',async()=>window.juicyApp.analyzeEngines());
  ['pull-timezone','collect-time','perf-time','morning-time','auto-morning'].forEach(id=>{const el=$(id);if(el&&!el.dataset.bound){el.dataset.bound='1';el.addEventListener('input',refreshPullNotes);el.addEventListener('change',refreshPullNotes);}});{const dirty=on=>{const n=$('save-note');if(!n)return;n.textContent=on?'\u25CF You have unsaved changes':'These settings are saved when you press Save Settings';n.classList.toggle('dirty',on);};window.__settingsDirty=dirty;['target-recent','target-trending','gender-filter','juicy-home-url','auto-collect','auto-performance','open-at-login','pull-timezone','collect-time','perf-time','auto-morning','morning-time'].forEach(id=>{const el=$(id);if(el&&!el.dataset.dirty){el.dataset.dirty='1';el.addEventListener('input',()=>dirty(true));el.addEventListener('change',()=>dirty(true));}});}
  $('save-settings').onclick=async()=>{try{const ol=$('open-at-login');state=await window.juicyApp.saveSettings({targetRecent:$('target-recent').value,targetTrending:$('target-trending').value,gender:$('gender-filter').value,juicyHomeUrl:$('juicy-home-url').value,autoCollect:$('auto-collect').checked,autoPerformance:$('auto-performance').checked,...(ol&&!EMBEDDED?{openAtLogin:ol.checked}:{}),pullTimeZone:$('pull-timezone').value,collectTime:$('collect-time').value,perfTime:$('perf-time').value,autoMorning:$('auto-morning').checked,morningTime:$('morning-time').value,blockedTags:blockedNow()});blockedDraft=null;renderAll();window.__settingsDirty&&window.__settingsDirty(false);toast('Settings saved.');}catch(e){toast(e.message,true);}};
  window.juicyApp.onBgStep&&window.juicyApp.onBgStep(bgOnStep);
  window.juicyApp.onCloseAsk&&window.juicyApp.onCloseAsk(closeAskShow);window.juicyApp.onCloseAskCancel&&window.juicyApp.onCloseAskCancel(closeAskHide);
  window.juicyApp.onCollectorProgress(p=>{bgOnCollect(p);const current=Number(p.overallCurrent??p.current)||0,target=Math.max(1,Number(p.overallTarget??p.target)||1),pct=Math.round(current/target*100);const detail=[p.sortName||p.source,p.current!=null&&p.target!=null?`${p.current}/${p.target}`:'',p.pass?`scan ${p.pass}`:'',p.pageCards!=null?`${p.pageCards} page cards`:'',p.networkRecords!=null?`${p.networkRecords} API records`:''].filter(Boolean).join(' · ');$('collector-message').textContent=p.message||detail||'Collecting...';$('collector-progress').style.width=Math.max(0,Math.min(100,pct))+'%';updateCollectorLive(p);});
  window.juicyApp.onNeedLogin&&window.juicyApp.onNeedLogin(d=>askMagicLink(d||{}));
  window.juicyApp.onRuntimeProgress&&window.juicyApp.onRuntimeProgress(p=>{RT.msg=`Step ${p.step} of ${p.steps}: ${p.message||''}`;const m=$('runtime-msg');if(m)m.textContent=RT.msg;});
  window.juicyApp.onAuthStatus(status=>renderAuthStatus(status));window.juicyApp.onAnalysisProgress(p=>{bgOnAnalysis(p);const m=p.message||'Analyzing...',fin=!!p.done||/updated|complete/i.test(m);$('busy-text').textContent=m;
    if(collectorUi.active&&!collectorUi.pull){ // analysis is the last step of a collection: show it in the window, not only in the caption
      $('busy-title').textContent=p.skipped?'Collection finished':fin?'Collection and analysis finished':'Analyzing the collected bots...';
      setCollectorStatus(fin?'DONE':'ANALYZING',fin?'done':'');
      if($('collector-live-source'))$('collector-live-source').textContent='Engine analysis';
      if($('collector-live-count'))$('collector-live-count').textContent=fin?'Done':'Analyzing';
      if($('collector-source-bar'))$('collector-source-bar').style.width='100%';if($('collector-source-percent'))$('collector-source-percent').textContent='100%';
      if($('collector-stall-label'))$('collector-stall-label').textContent=fin?'Finished':'Analyzing';
      collectorLog(m,fin?'good':'');collectorUi.analysisSeen=true;if(fin)collectorUi.analysisDone=true;}
  });
}
// Inside the Creator Tool (its Analytics tab) the window shows only the five tabs: the app's own name, version, updates and Start with Windows belong to the Analytics Tool itself.
let EMBEDDED=false;
(async function init(){try{const h=await window.juicyApp.hostInfo();EMBEDDED=!!h&&h.host==='creator';}catch{}document.body.classList.toggle('embedded',EMBEDDED);window.IS_SHARE=IS_SHARE;
  bindStatic();state=await window.juicyApp.getState();renderAll();renderAuthStatus(authStatus);checkSession(false);
  let v='dashboard';try{const s=localStorage.getItem('jat.view');if(s&&$('view-'+s))v=s;}catch{}switchView(v);
  window.__jatReady=true;})();
