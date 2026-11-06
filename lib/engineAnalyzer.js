const { SCENARIO_ENGINES } = require('./blueprintRules');

const CATEGORY_RULES = {
  relationshipFrames: {
    'wife': [/\bwife\b/i,/married/i,/husband/i],
    'girlfriend': [/\bgirlfriend\b/i,/\bgf\b/i],
    'ex-return': [/\bex[- ]?(girlfriend|wife|lover|partner)\b/i,/shows? up.*after/i,/years? later/i,/comes? back/i],
    'roommate': [/roommate/i,/dorm/i,/live together/i,/shared apartment/i],
    'neighbor': [/neighbou?r/i,/next door/i],
    'best-friend': [/best friend/i,/childhood friend/i],
    'stepfamily': [/stepmom|stepmother|stepsister|step-sister|stepdaughter/i],
    'bully-rival': [/\bbully\b/i,/rival/i,/enemy/i],
    'coworker-boss': [/coworker|co-worker|boss|ceo|office|workplace/i],
    'authority-mentor': [/teacher|professor|instructor|mentor|captain|commander/i],
    'royalty-service': [/princess|queen|royal|butler|maid|knight|guard/i],
    'stranger-first-contact': [/stranger|blind date|first time|just met|encounter/i],
    'caretaker-dependent': [/take care|caretaker|nurse|protect|rescue|injured|sick/i],
    'family-household': [/mother|mom|sister|daughter|family|household/i]
  },
  hookPatterns: {
    'unexpected-return': [/shows? up|comes? back|returns?|years? later|at your door/i],
    'caught-discovery': [/caught|finds? out|discover|stumbles? onto|walks? in|overhear|sees? .* with/i],
    'secret-reveal': [/secret|hiding|never told|confess|truth|mystery|hidden/i],
    'forced-proximity': [/trapped|stuck|assigned.*together|live together|same room|roommate|elevator|only one bed/i],
    'deadline-ultimatum': [/deadline|before .* ends|one last chance|must .* by|within a year|or else|last day/i],
    'jealous-third-party': [/another (man|woman|girl|boy)|rival|jealous|third|someone else|dating|other guy|other girl/i],
    'danger-mission': [/mission|quest|danger|war|hunt|escort|survive|enemy|battle/i],
    'caretaking-crisis': [/sick|injured|hurt|missing|help her|take care|recover|hospital/i],
    'public-social-pressure': [/public|party|wedding|class|friends|crowd|graduation|festival|family dinner/i],
    'confession-invitation': [/asks? you out|confess|invites?|date with|proposal|propose|kiss/i],
    'identity-reversal': [/mistaken|mistake|secret identity|actually|turns out|wrong person|disguise/i],
    'betrayal-threshold': [/cheat|betray|affair|ntr|other man|other woman|caught kissing/i]
  },
  settings: {
    'domestic': [/apartment|home|house|bedroom|kitchen|roommate|couch/i],
    'university': [/college|university|campus|professor|class/i],
    'workplace': [/office|coworker|boss|ceo|workplace|company/i],
    'nightlife-social': [/bar|club|party|karaoke|rave|wedding|festival|concert/i],
    'fantasy': [/fantasy|kingdom|magic|magical|elf|demon|vampire|knight|queen|princess|rpg|isekai|monster|witch/i],
    'adventure': [/mission|quest|adventure|exploration|journey|escort|hunter|guild/i],
    'medical': [/hospital|doctor|nurse|clinic|medical/i],
    'urban-public': [/coffee|cafe|library|park|elevator|street|city|mall/i],
    'historical': [/historical|viking|medieval|ancient|samurai/i]
  },
  archetypes: {
    'Yandere': [/yandere|obsess/i], 'Kuudere': [/kuudere|cold|stoic/i], 'Tsundere': [/tsundere/i],
    'Dandere': [/dandere|shy|quiet/i], 'Brat': [/brat|bratty|teasing/i], 'Bully': [/bully/i],
    'Maid': [/maid/i], 'Royalty': [/queen|princess|royal/i], 'Hero': [/hero|heroine/i],
    'Villain': [/villain|mafia|criminal/i], 'Affectionate': [/affectionate|loving|sweet|caring/i],
    'Stoic': [/stoic|emotionless|reserved/i], 'Seductive': [/seductive|tempt|flirt/i], 'Goth': [/goth/i],
    'Tomboy': [/tomboy/i], 'Bakadere': [/bakadere|clumsy.*cute|lovable chaos/i], 'Bimbo': [/bimbo/i]
  },
  tags: {
    'Drama': [/\bdrama\b|emotionally|heartbreak|conflict/i], 'Romance': [/romance|love|girlfriend|wife|date/i],
    'Fantasy': [/fantasy|kingdom|elf|magic|vampire|demon/i], 'Magic': [/magic|magical|witch|spell/i], 'RPG': [/\brpg\b|quest|guild/i],
    'Isekai': [/isekai|another world|transported/i], 'Monster Girl': [/monster girl/i], 'Kemonomimi': [/cat[- ]?girl|fox[- ]?girl|wolf[- ]?girl|bunny[- ]?girl|kemonomimi/i],
    'Slice of Life': [/slice of life|coffee|roommate|neighbor|daily/i], 'Slow Burn': [/slow burn|slow-burn|gradual/i],
    'Dark Romance': [/dark romance|toxic|dangerous romance/i], 'Comedy': [/comedy|funny|prank|chaos/i],
    'Multiple': [/two (girls|women|friends)|multiple|bestfriends/i], 'Hero': [/hero|heroine/i], 'OC': [/\boc\b/i],
    'Futanari': [/futanari|futa\b/i], 'Bully': [/\bbully\b/i], 'Tomboy': [/tomboy/i], 'Yandere': [/yandere/i]
  }
};

const REL_WHY={
  'wife':'The relationship already has commitment, routines, and something real to lose, so the premise starts with emotional investment instead of spending turns establishing it.',
  'girlfriend':'An established romance gives the user immediate personal stakes while still leaving room for boundaries, escalation, jealousy, and future decisions.',
  'ex-return':'History is preloaded. The return creates unresolved questions, changed expectations, and a natural reason to keep testing whether the old claim still means anything.',
  'roommate':'Shared space produces repeatable collisions. The same premise can keep generating privacy, routine, jealousy, and boundary pressure after the opening scene.',
  'neighbor':'Proximity creates easy repeat encounters without forcing commitment, which makes escalation feel natural and keeps future scenes accessible.',
  'best-friend':'Trust and familiarity are already established, so a disruption can immediately challenge the relationship without lengthy setup.',
  'stepfamily':'The household relationship gives the scenario recurring access, social boundaries, and consequences that continue after the initial hook.',
  'bully-rival':'A grievance gives the user a clear reason to engage immediately, while the rivalry naturally supplies recurring conflict and changing power dynamics.',
  'coworker-boss':'A recurring environment and reputation stakes keep the interaction active beyond a single private encounter.',
  'authority-mentor':'Role expectations create built-in pressure and consequences, giving the user something concrete to push against or investigate.',
  'royalty-service':'Status difference creates a readable power structure, while duties and public expectations give the relationship multiple future tests.',
  'stranger-first-contact':'The novelty is immediate and flexible. The hook must do more work, but a strong unusual encounter gives the user a clear reason to stay.',
  'caretaker-dependent':'Care creates repeated actions rather than a one-time conversation, which naturally exposes vulnerability and changing trust.',
  'family-household':'Shared obligations and recurring household contact create consequences that cannot be solved by simply walking away from one scene.',
  'open-relationship-frame':'The relationship is not the primary selling point, so the scenario depends more heavily on the hook and situation to create immediate pressure.'
};
const HOOK_WHY={
  'unexpected-return':'It opens with a changed status quo. The user has to react to someone from the past before either side knows what the new relationship will be.',
  'caught-discovery':'The user begins with evidence instead of exposition. That creates an immediate question, confrontation, or intervention and leaves room for discovery over several replies.',
  'secret-reveal':'A knowledge gap creates a curiosity loop. Each answer can reveal something while opening another question, which supports longer chats.',
  'forced-proximity':'The characters cannot simply separate after the first exchange. Repeated contact keeps producing new pressure and lets the relationship change through behavior.',
  'deadline-ultimatum':'A clock gives every choice consequence and prevents the scene from becoming directionless.',
  'jealous-third-party':'A visible external pressure makes the relationship state matter immediately and creates multiple responses besides simple confession or rejection.',
  'danger-mission':'The user gets a concrete objective and changing circumstances, so the interaction has momentum beyond pure conversation.',
  'caretaking-crisis':'The opening requires practical action. Care, recovery, and trust can then change gradually instead of resolving in one emotional speech.',
  'public-social-pressure':'Private feelings collide with reputation and other people, creating consequences that can continue after the initial encounter.',
  'confession-invitation':'The character puts a relationship question directly into play, which gives the user immediate agency and an obvious reason to answer.',
  'identity-reversal':'The premise changes what the user thought they knew. That surprise creates a reason to investigate and re-evaluate the relationship.',
  'betrayal-threshold':'The situation is unstable and time-sensitive. The user has a reason to act before the relationship state changes irreversibly.',
  'interaction-pressure':'The opening creates a direct reason to respond, but the exact mechanism is not strongly identifiable from the card text.'
};
const SETTING_WHY={
  'domestic':'A shared/private environment supports repeat scenes, routines, accidental proximity, and consequences that follow the characters home.',
  'university':'A recurring social environment supplies schedules, peers, reputation, and repeated contact.',
  'workplace':'The setting naturally repeats and adds public/private contrast, though it can become saturated if too many scenarios use the same authority dynamic.',
  'nightlife-social':'Crowds, social visibility, and temporary intensity make the opening easy to understand and give third parties a reason to matter.',
  'fantasy':'The world itself can create obligations, rules, powers, and stakes that ordinary settings cannot, giving the scenario more than one source of interaction.',
  'adventure':'Movement and objectives keep producing new situations, so long engagement does not depend only on repeating the same emotional argument.',
  'medical':'Care and vulnerability create immediate stakes, but the premise needs strong character agency to avoid becoming passive.',
  'urban-public':'A familiar setting lowers explanation cost and lets the relationship/hook carry the concept.',
  'historical':'Social rules and period expectations add constraints that can keep choices consequential.',
  'flexible-setting':'The card text does not expose a dominant setting signal, so the relationship and hook are doing most of the work.'
};

function compactValue(v){
  if(v==null)return null; if(typeof v==='number')return Number.isFinite(v)?v:null;
  const s=String(v).trim().toLowerCase().replace(/,/g,''); const m=s.match(/(\d+(?:\.\d+)?)\s*([km])?/); if(!m)return null;
  let n=Number(m[1]); if(m[2]==='k')n*=1e3; if(m[2]==='m')n*=1e6; return Math.round(n);
}
function textOf(row){return [row.title,row.name,row.rawText,row.anchorText,(row.tags||[]).join(' '),row.description,row.greeting,row.creator].filter(Boolean).join(' ');}
function classifyOne(text,rules){const out=[];for(const [label,patterns] of Object.entries(rules))if(patterns.some(re=>re.test(text)))out.push(label);return out;}
function classifyRow(row){const text=textOf(row);const c={};for(const [cat,rules] of Object.entries(CATEGORY_RULES))c[cat]=classifyOne(text,rules);return c;}
function addCount(map,key,weight,row){
  if(!key)return; if(!map[key])map[key]={weighted:0,count:0,trending:0,recent:0,engagementSum:0,engagementN:0,top25:0,rows:[]};
  const x=map[key];x.weighted+=weight;x.count++;if(row?.source==='Trending')x.trending++;else if(row?.source==='Recent')x.recent++;if((Number(row?.rank)||999)<=25)x.top25++;
  const e=compactValue(row?.engagementEstimate);if(e!=null&&e>0){x.engagementSum+=e;x.engagementN++;}
  if(row&&x.rows.length<1000)x.rows.push({title:row.title||row.anchorText||'',creator:row.creator||'',url:row.url||'',source:row.source,rank:row.rank,engagement:e,earlier:row.inLatest===false,lastSeen:row.lastSeen||null});
}
function rankMap(map,limit=14){return Object.entries(map).map(([name,v])=>({name,...v,avgEngagement:v.engagementN?Math.round(v.engagementSum/v.engagementN):null,score:v.weighted+(v.trending*0.9)+(v.top25*0.5)+(v.engagementN?Math.log10(10+v.engagementSum/v.engagementN)*0.15:0)})).sort((a,b)=>b.score-a.score).slice(0,limit);}
function normalizeStrength(item,maxScore){return Math.max(35,Math.min(99,Math.round(43+(item.score/Math.max(maxScore,1))*44+(item.trending/(item.count||1))*7+(item.top25/(item.count||1))*5)));}
function mapToScenarioEngine(features){
  const blob=features.join(' ').toLowerCase();let id='01';
  if(/return|ex-return|unexpected-return/.test(blob))id='22';
  else if(/roommate|forced-proximity|domestic/.test(blob))id='17';
  else if(/yandere|obsess/.test(blob))id='18';
  else if(/caretaking|healing|injured|sick/.test(blob))id='10';
  else if(/caught|revenge|bully|discovery/.test(blob))id='13';
  else if(/deadline|clock/.test(blob))id='14';
  else if(/secret|dual|identity/.test(blob))id='16';
  else if(/family|stepfamily|household/.test(blob))id='25';
  else if(/date|invitation|confession/.test(blob))id='26';
  else if(/betrayal|third-party|ntr|jealous/.test(blob))id='08';
  else if(/comedy|brat|chaos/.test(blob))id='03';
  else if(/danger|mission|adventure/.test(blob))id='12';
  return SCENARIO_ENGINES.find(x=>x.number===id)||SCENARIO_ENGINES[0];
}
function median(nums){const a=nums.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:Math.round((a[m-1]+a[m])/2);}
function sourceStats(rows){
  const classified=rows.map(r=>({...r,classification:r.classification||classifyRow(r)}));
  const maps={relationshipFrames:{},hookPatterns:{},settings:{},archetypes:{},tags:{},combinations:{}};
  for(const row of classified){const rank=Number(row.rank)||100;const weight=1+Math.max(0,(101-rank))/120;for(const cat of ['relationshipFrames','hookPatterns','settings','archetypes','tags'])for(const v of row.classification[cat])addCount(maps[cat],v,weight,row);const rel=row.classification.relationshipFrames[0]||'open-relationship-frame',hook=row.classification.hookPatterns[0]||'interaction-pressure',setting=row.classification.settings[0]||'flexible-setting';addCount(maps.combinations,`${rel} + ${hook} + ${setting}`,weight*1.1,row);}
  const dist={};for(const cat of Object.keys(maps))dist[cat]=rankMap(maps[cat],cat==='combinations'?10:8);
  const engagements=classified.map(r=>compactValue(r.engagementEstimate)).filter(x=>x!=null&&x>0);
  return {count:rows.length,averageEngagement:engagements.length?Math.round(engagements.reduce((a,b)=>a+b,0)/engagements.length):null,medianEngagement:median(engagements),distributions:dist,topRelationship:dist.relationshipFrames[0]||null,topHook:dist.hookPatterns[0]||null,topSetting:dist.settings[0]||null,topCombination:dist.combinations[0]||null};
}
function trendLabel(c,recentTotal,trendingTotal){
  const rr=c.recent/Math.max(1,recentTotal),tr=c.trending/Math.max(1,trendingTotal);if(!c.recent&&c.trending)return'Appearing mainly in Trending';if(c.recent&&!c.trending)return'Appearing mainly in Recent';const ratio=tr/Math.max(rr,0.0001);if(ratio>=1.35)return'Stronger in Trending';if(ratio<=0.74)return'Stronger in Recent';return'Stable across both lists';
}
function titleCase(s){return String(s||'').replace(/-/g,' ').replace(/\b\w/g,m=>m.toUpperCase());}
function engineWhy(rel,hook,setting){return `${REL_WHY[rel]||REL_WHY['open-relationship-frame']} ${HOOK_WHY[hook]||HOOK_WHY['interaction-pressure']} ${SETTING_WHY[setting]||SETTING_WHY['flexible-setting']}`;}
function sourceNarrative(label,stats){
  if(!stats.count)return`${label}: no records collected.`;
  const rel=stats.topRelationship?.name||'no dominant relationship frame',hook=stats.topHook?.name||'no dominant hook',setting=stats.topSetting?.name||'no dominant setting';
  return `${label} is currently leaning toward ${titleCase(rel)} relationship frames, ${titleCase(hook)} openings, and ${titleCase(setting)} settings. ${HOOK_WHY[hook]||''}`.trim();
}

const { isShare, NTR_TAG } = require('./edition');
function analyzeEnginesLocal({recent=[],trending=[],performance=[],historyStats=null}={}){
  // rows may come from the scrape history: each carries a weight (recency x staying power)
  // and inLatest (seen in the newest scrape). Plain rows count as latest with weight 1.
  const all=[...recent,...trending].map(r=>isShare?{...r,tags:(r.tags||[]).filter(t=>!NTR_TAG.test(String(t)))}:r).map(r=>({...r,classification:classifyRow(r)}));
  const latestOnly=all.filter(r=>r.inLatest!==false);
  if(!all.length)return{generatedAt:new Date().toISOString(),mode:'Local statistical engine analysis',summary:'No collected bots are available yet.',sample:{recent:0,trending:0,unique:0},topSignals:[],engines:[],distributions:{},sourceSummaries:{}};
  const maps={relationshipFrames:{},hookPatterns:{},settings:{},archetypes:{},tags:{},combinations:{}};
  for(const row of all){
    const rank=Number(row.rank)||100,sourceWeight=row.source==='Trending'?1.55:1,rankWeight=1+Math.max(0,(101-rank))/180,eng=compactValue(row.engagementEstimate),engWeight=eng?1+Math.min(0.45,Math.log10(eng+10)/25):1,weight=sourceWeight*rankWeight*engWeight*(Number(row.weight)>0?Number(row.weight):1);
    for(const cat of ['relationshipFrames','hookPatterns','settings','archetypes','tags'])for(const v of row.classification[cat])addCount(maps[cat],v,weight,row);
    const rel=row.classification.relationshipFrames[0]||'open-relationship-frame',hook=row.classification.hookPatterns[0]||'interaction-pressure',setting=row.classification.settings[0]||'flexible-setting';row.comboKey=`${rel} + ${hook} + ${setting}`;addCount(maps.combinations,row.comboKey,weight*1.15,row);
  }
  const distributions={};for(const cat of Object.keys(maps))distributions[cat]=rankMap(maps[cat],cat==='combinations'?20:14);
  const combos=distributions.combinations,max=combos[0]?.score||1,total=all.length;
  const engines=combos.slice(0,12).map((c,i)=>{
    const [rel='open-relationship-frame',hook='interaction-pressure',setting='flexible-setting']=c.name.split(' + '),official=mapToScenarioEngine([rel,hook,setting]),saturation=c.count/Math.max(total,1),prevalence=Math.round(c.count/Math.max(total,1)*1000)/10;
    return {
      id:`observed-${String(i+1).padStart(2,'0')}`,name:`${titleCase(rel)} + ${titleCase(hook)}`,mechanism:`Use a ${titleCase(rel)} relationship as the emotional stake, trigger the first reply with a ${TitleSafe(hook)} hook, and keep the pressure repeatable through a ${TitleSafe(setting)} environment.`,
      description:`A repeatable ${titleCase(hook)} hook inside a ${titleCase(rel)} relationship frame, usually staged in a ${titleCase(setting)} setting.`,
      whyItWorks:engineWhy(rel,hook,setting),hookPattern:`${titleCase(hook)}: ${HOOK_WHY[hook]||HOOK_WHY['interaction-pressure']}`,setupPattern:`${titleCase(rel)} relationship + ${titleCase(setting)} setting. ${REL_WHY[rel]||REL_WHY['open-relationship-frame']}`,
      strength:normalizeStrength(c,max),confidence:c.count>=12?'High':c.count>=6?'Medium':'Low',saturationRisk:saturation>.18?'High':saturation>.09?'Medium':'Low',prevalencePercent:prevalence,trend:trendLabel(c,recent.length,trending.length),averageEngagement:c.avgEngagement,
      evidence:{recentCount:c.recent,trendingCount:c.trending,totalCount:c.count,top25Count:c.top25,examples:c.rows},relationshipFrames:[rel],hookPatterns:[hook],settingPatterns:[setting],tagPatterns:distributions.tags.slice(0,5).map(x=>x.name),recommendedScenarioEngine:official.id,recommendedScenarioEngineDescription:official.description
    };
  });
  // the 10 strongest signals across relationship, hook, setting and tag: each category's best five, ranked by their score against that category's leader
  const sigList=[];for(const [label,cat] of [['Relationship','relationshipFrames'],['Hook','hookPatterns'],['Setting','settings'],['Tag','tags']]){const list=(distributions[cat]||[]).slice(0,5),top=(list[0]&&list[0].score)||1;for(const item of list)sigList.push({label,cat,name:item.name,rel:item.score/top});}
  sigList.sort((a,b)=>b.rel-a.rel);const sigTop=sigList.slice(0,10);
  const stamped=all.filter(r=>r.lastSeen),signalTrends={};
  if(stamped.length){
    const newest=Math.max(...stamped.map(r=>Date.parse(r.lastSeen)||0)),cut=newest-10*86400000;
    const nowRows=stamped.filter(r=>Date.parse(r.lastSeen)>=cut),thenRows=stamped.filter(r=>Date.parse(r.lastSeen)<cut);
    if(thenRows.length>=40&&nowRows.length>=40)for(const e of engines){
      const key=combos.find(c=>`${titleCase(c.name.split(' + ')[0])} + ${titleCase(c.name.split(' + ')[1])}`===e.name)?.name;if(!key)continue;
      const a=nowRows.filter(r=>r.comboKey===key).length/nowRows.length,b=thenRows.filter(r=>r.comboKey===key).length/thenRows.length;
      e.momentum=b===0?(a>0?'New this week':'Steady'):a/b>=1.3?'Rising':a/b<=0.75?'Fading':'Steady';
      e.momentumDetail=`${Math.round(a*1000)/10}% of bots in the last 10 days vs ${Math.round(b*1000)/10}% before`;
    }
    // the same ups and downs for each top signal (relationship, hook, setting, tag): its share of the bots seen in the last 10 days vs before
    if(thenRows.length>=40&&nowRows.length>=40)for(const {label,cat,name} of sigTop){
      const has=r=>((r.classification||{})[cat]||[]).includes(name),a=nowRows.filter(has).length/nowRows.length,b=thenRows.filter(has).length/thenRows.length;
      signalTrends[`${label}: ${name}`]={momentum:b===0?(a>0?'New this week':'Steady'):a/b>=1.3?'Rising':a/b<=0.75?'Fading':'Steady',detail:`${Math.round(a*1000)/10}% of bots in the last 10 days vs ${Math.round(b*1000)/10}% before`};
    }
    for(const e of engines){const ex=e.evidence.examples;e.evidence.latestCount=all.filter(r=>r.inLatest!==false&&r.comboKey&&ex.some(x=>x.url&&x.url===r.url)).length;e.evidence.staying=all.filter(r=>r.source==='Trending'&&Number(r.sightings)>=2&&ex.some(x=>x.url&&x.url===r.url)).length;}
  }
  if(performance?.length){const perf=performance.filter(x=>Number(x.conversations)>0);if(perf.length)engines.forEach(e=>{const bonus=Math.min(5,perf.filter(p=>String(p.engineId||'')===e.id).length);e.strength=Math.min(99,e.strength+bonus);});}
  const unique=new Set(all.map(x=>x.url||`${x.source}:${x.rank}:${x.title}`)).size,topSignals=[];
  for(const s of sigTop)topSignals.push(`${s.label}: ${s.name}`);
  const recentStats=sourceStats(latestOnly.filter(x=>x.source==='Recent')),trendingStats=sourceStats(latestOnly.filter(x=>x.source==='Trending'));
  const top=engines[0];
  const summary=top?`Across ${total} collected records (${unique} unique), the strongest measured engine is ${top.name}. It appears in ${top.evidence.totalCount} records (${top.prevalencePercent}% of the sample) and scores ${top.strength}/100 after weighting Trending placement, rank, and visible engagement. The main reason it works is not a single tag: it combines a relationship with existing stakes, an opening that makes the user respond immediately, and a setting or structure that keeps producing new interaction after the first reply.`:`Analyzed ${total} collected records (${unique} unique).`;
  return {
    generatedAt:new Date().toISOString(),mode:'Local statistical engine analysis',summary,
    methodology:'The app classifies each collected card into relationship frame, opening hook, setting, archetype, and tag signals. Trending records are weighted more heavily, high positions receive a rank boost, and visible engagement adds a smaller boost. Repeated relationship + hook + setting combinations become observed success engines. No AI model is used.',
    sample:{recent:latestOnly.filter(x=>x.source==='Recent').length,trending:latestOnly.filter(x=>x.source==='Trending').length,unique,total,historical:all.length-latestOnly.length},history:historyStats,signalTrends,topSignals:topSignals.slice(0,10),engines,distributions,
    sourceSummaries:{Recent:{...recentStats,narrative:sourceNarrative('Recent',recentStats)},Trending:{...trendingStats,narrative:sourceNarrative('Trending',trendingStats)}},
    winnerDNA:{relationship:distributions.relationshipFrames[0]?.name||null,hook:distributions.hookPatterns[0]?.name||null,setting:distributions.settings[0]?.name||null,archetype:distributions.archetypes[0]?.name||null,tags:distributions.tags.slice(0,5).map(x=>x.name)},
    classifiedRecords:all.map(r=>({url:r.url,source:r.source,rank:r.rank,classification:r.classification}))
  };
}
function TitleSafe(s){return titleCase(s);}

module.exports={analyzeEnginesLocal,classifyRow,CATEGORY_RULES,compactValue,REL_WHY,HOOK_WHY,SETTING_WHY};
