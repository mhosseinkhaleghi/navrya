(function(){
  'use strict';
  var SETTINGS_KEY='tradejournal:trade-settings:v1', MAX_IMAGE_BYTES=15*1024*1024; // settings stays localStorage-backed - a Group B preference, out of scope for this domain's own Phase 2 migration (see the Phase 2 report)
  var types=window.TradeJournalTradeTypes||{};
  var DOMAIN='trades';
  function replica(){return window.TradeJournalServerReplica&&window.TradeJournalServerReplica.domain(DOMAIN);}
  function uid(prefix){return (prefix||'trade')+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);}
  function now(){return new Date().toISOString();}
  function n(value){if(value===null||value===undefined||value==='')return null;var out=Number(value);return Number.isFinite(out)?out:null;}
  function clamp(value,min,max){value=n(value);return value===null?null:Math.min(max,Math.max(min,value));}
  function array(value){return Array.isArray(value)?value:[];}
  function statusHistory(item,status,timestamp){var values=array(item);if(!values.length||values[values.length-1].status!==status)values.push({status:status,timestamp:timestamp||now()});return values;}
  function detectSession(date){
    var d=date||new Date(),hour=d.getUTCHours()+d.getUTCMinutes()/60;
    function inRange(start,end){return start<end?hour>=start&&hour<end:hour>=start||hour<end;}
    if(inRange(7,16))return'london'; if(inRange(13,22))return'newyork'; if(inRange(0,9))return'tokyo'; return'sydney';
  }
  function empty(seed){
    var stamp=now(),value=seed||{},status=value.status||'hunting';
    return {id:value.id||uid('trade'),status:status,direction:value.direction||'long',entryMode:value.entryMode||'full',entryPrice:null,stopLoss:null,takeProfits:[],slDistancePercent:null,riskPercent:null,riskAmount:null,leverage:null,positionSize:null,marginRequired:null,liquidationPrice:null,rr:null,marginMode:'isolated',commission:{feeType:'taker',feePercent:.06,totalCommission:0},breakevenPercent:null,exitPrice:null,outcome:null,pnl:null,pnlPercent:null,session:detectSession(),primaryTimeframe:null,timeframeTrends:(types.timeframes||['1m','5m','15m','1h','4h','1D']).map(function(tf){return{timeframe:tf,direction:null,momentumStrength:null,source:'user'};}),conceptTags:[],linkedPatternIds:[],linkedStrategyId:null,accountId:null,instrument:null,chartNote:'',emotionLog:[],screenshots:[],createdAt:stamp,updatedAt:stamp,openedAt:status==='open'?stamp:null,closedAt:null,statusHistory:[{status:status,timestamp:stamp}],source:{character:(window.TradeJournalPanelLayer&&window.TradeJournalPanelLayer.character)||(document.body&&document.body.dataset&&document.body.dataset.character)||'hunter',sessionId:null,scenarioId:null},aiPredictionLinks:[],disciplineImpact:0};
  }
  function normalize(value){
    var src=value&&typeof value==='object'?value:{},base=empty(src),stamp=src.updatedAt||base.updatedAt;
    Object.assign(base,src); base.status=['hunting','open','closed','cancelled'].indexOf(base.status)>-1?base.status:'hunting'; base.direction=base.direction==='short'?'short':'long'; base.entryMode=base.entryMode==='quick'?'quick':'full'; base.marginMode=base.marginMode==='cross'?'cross':'isolated';
    ['entryPrice','stopLoss','slDistancePercent','riskPercent','riskAmount','leverage','positionSize','marginRequired','liquidationPrice','rr','exitPrice','pnl','pnlPercent','breakevenPercent'].forEach(function(k){base[k]=n(base[k]);});
    base.takeProfits=array(base.takeProfits).map(function(x){return{price:n(x.price),portionPercent:clamp(x.portionPercent,0,100)||0};}).filter(function(x){return x.price!==null;});
    base.commission=Object.assign({feeType:'taker',feePercent:.06,totalCommission:0},src.commission||{}); base.commission.feeType=base.commission.feeType==='maker'?'maker':'taker'; base.commission.feePercent=n(base.commission.feePercent)||0; base.commission.totalCommission=n(base.commission.totalCommission)||0;
    base.timeframeTrends=array(base.timeframeTrends).map(function(x){return{timeframe:String(x.timeframe||''),direction:x.direction==='bullish'||x.direction==='bearish'?x.direction:null,momentumStrength:clamp(x.momentumStrength,1,5),source:x.source==='ai'?'ai':'user'};});
    base.conceptTags=array(base.conceptTags).map(String); base.linkedPatternIds=array(base.linkedPatternIds).map(String); base.linkedStrategyId=typeof base.linkedStrategyId==='string'&&base.linkedStrategyId?base.linkedStrategyId:null; base.accountId=typeof base.accountId==='string'&&base.accountId?base.accountId:null; base.instrument=typeof base.instrument==='string'&&base.instrument.trim()?base.instrument.trim():null; base.aiPredictionLinks=array(base.aiPredictionLinks); base.screenshots=array(base.screenshots); base.emotionLog=array(base.emotionLog).map(function(x){return Object.assign({id:uid('emotion'),timestamp:stamp,stage:'entry',dominantEmotions:[],emotionDetails:[],stressLevel:5,focusQuality:5,planCommitment:5,wouldTakeIfNotForced:null,note:''},x,{dominantEmotions:array(x.dominantEmotions).slice(0,3),emotionDetails:array(x.emotionDetails).slice(0,3).map(function(d){d=d||{};var tags=Array.isArray(d.tags)?d.tags:(d.tag?[d.tag]:[]);return{emotion:String(d.emotion||''),intensity:clamp(d.intensity,1,10)||5,tags:tags.map(String).slice(0,8)};}),stressLevel:clamp(x.stressLevel,1,10)||5,focusQuality:clamp(x.focusQuality,1,10)||5,planCommitment:clamp(x.planCommitment,1,10)||5});});
    base.statusHistory=statusHistory(src.statusHistory,base.status,stamp); base.source=Object.assign({character:'hunter',sessionId:null,scenarioId:null},src.source||{}); base.createdAt=src.createdAt||stamp; base.updatedAt=stamp; return base;
  }
  // Phase 2 of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Global
  // Data Sync section): reads the in-memory server-replica directly - server-replica.js is
  // loaded before this file in every character page's script order. There is no localStorage
  // cache, no offline outbox, and no local-first fallback for the Trade Store any more.
  function read(){var domain=replica();return domain?domain.list().map(normalize):[];}

  (function () {
    if (!window.TradeJournalServerReplica) return;
    window.TradeJournalServerReplica.registerListDomain(DOMAIN, {
      hydrateUrl: '/api/sync/trades',
      writeUrl: '/api/sync/trades',
      deleteUrlFor: function (id) { return '/api/sync/trades/' + encodeURIComponent(id); },
      extractList: function (body) { return body.trades || []; }
    });
    replica().hydrate();
  }());

  function listSync(){return read().sort(function(a,b){return new Date(b.updatedAt)-new Date(a.updatedAt);});}
  function find(id){return listSync().find(function(item){return item.id===id;})||null;}
  function recordPatternDelta(before,after){var oldIds=before?before.linkedPatternIds||[]:[],newIds=after.linkedPatternIds||[];newIds.forEach(function(id){if(oldIds.indexOf(id)<0&&window.TradeJournalPatternStore)window.TradeJournalPatternStore.recordUsage(id,1);});oldIds.forEach(function(id){if(newIds.indexOf(id)<0&&window.TradeJournalPatternStore)window.TradeJournalPatternStore.recordUsage(id,-1);});}
  // Apply optimistically and return synchronously (unchanged contract) - the write's own Promise
  // is .catch()-guarded since neither function ever gave its caller a Promise to observe.
  function save(value){var existing=find(value.id)||null,trade=normalize(value);trade.updatedAt=now();trade.statusHistory=statusHistory(trade.statusHistory,trade.status,trade.updatedAt);if(trade.status==='open'&&!trade.openedAt)trade.openedAt=trade.updatedAt;if((trade.status==='closed'||trade.status==='cancelled')&&!trade.closedAt)trade.closedAt=trade.updatedAt;recordPatternDelta(existing,trade);if(replica())replica().upsert(trade).catch(function(){});return trade;}
  function remove(id){var trade=find(id);if(trade&&window.TradeJournalImageStore)(trade.screenshots||[]).forEach(function(x){if(x.blobId)window.TradeJournalImageStore.deleteImage(x.blobId);});if(replica())replica().remove(id).catch(function(){});}
  function updateStatus(id,status,extra){var trade=find(id);if(!trade)return null;Object.assign(trade,extra||{});trade.status=status;return save(trade);}
  function addEmotion(id,value){var trade=find(id);if(!trade)return null;trade.emotionLog.push(Object.assign({id:uid('emotion'),timestamp:now(),stage:trade.status==='closed'?'exit':trade.status==='open'?'mid_trade':'entry',dominantEmotions:[],emotionDetails:[],stressLevel:5,focusQuality:5,planCommitment:5,wouldTakeIfNotForced:null,note:''},value||{}));return save(trade);}
  function findBySource(sessionId,scenarioId){return listSync().find(function(x){return x.source&&x.source.sessionId===sessionId&&x.source.scenarioId===scenarioId;})||null;}
  function fileDataUrl(file){return new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(String(reader.result||''));};reader.onerror=function(){reject(reader.error);};reader.readAsDataURL(file);});}
  // Phase 2 image pipeline: upload first, reference by the server's own /uploads/... url
  // (imageUrl) - no IndexedDB, no blobId for a screenshot added after this migration. A failed
  // upload falls back to embedding the dataUrl directly on the record, which still reaches the
  // server via the trade's own save() below. Every trade screenshot is already image-only by
  // validation (unlike Strategy Education's mixed attachments), so there is no per-file branching.
  async function uploadScreenshot(encodedDataUrl){var switcher=window.TradeJournalDevUserSwitcher;var uid2=switcher&&switcher.currentUserId();if(!uid2)throw new Error('NO_CURRENT_USER');var response=await fetch('/api/sync/trades/images',{method:'POST',headers:{'Content-Type':'application/json','x-dev-user-id':uid2},body:JSON.stringify({dataUrl:encodedDataUrl})});if(!response.ok)throw new Error('UPLOAD_FAILED');var result=await response.json();return result.url;}
  async function addScreenshots(id,files){var trade=find(id);if(!trade)throw new Error('TRADE_NOT_FOUND');for(var file of Array.from(files||[])){if(!/^image\//.test(file.type))throw new Error('INVALID_IMAGE_TYPE');if(file.size>MAX_IMAGE_BYTES)throw new Error('IMAGE_TOO_LARGE');var item={id:uid('trade-image'),fileName:file.name,uploadedAt:now(),mimeType:file.type};var encoded=await fileDataUrl(file);try{item.imageUrl=await uploadScreenshot(encoded);}catch(_){item.dataUrl=encoded;}trade.screenshots.push(item);}return save(trade);}
  async function screenshotUrl(item){if(!item)return'';if(item.imageUrl)return item.imageUrl;if(item.dataUrl)return item.dataUrl;if(item.blobId&&window.TradeJournalImageStore)return await window.TradeJournalImageStore.loadImageUrl(item.blobId)||'';return'';}
  // leverageCap/maxTradesPerSession (Settings' "Trading defaults" panel) join the same real,
  // persisted settings object the Calculator/Trade Log already read defaultRiskPercent from -
  // pre-fill defaults, same as every other field here, never an enforced ceiling (nothing in
  // this file blocks a trade that exceeds them).
  function settings(){try{return Object.assign({defaultFeeType:'taker',takerFeePercent:.06,makerFeePercent:.02,accountBalance:null,defaultRiskPercent:1,leverageCap:10,maxTradesPerSession:5},JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'));}catch(_){return{defaultFeeType:'taker',takerFeePercent:.06,makerFeePercent:.02,accountBalance:null,defaultRiskPercent:1,leverageCap:10,maxTradesPerSession:5};}}
  function saveSettings(value){var next=Object.assign(settings(),value||{});['takerFeePercent','makerFeePercent','accountBalance','defaultRiskPercent','leverageCap','maxTradesPerSession'].forEach(function(k){next[k]=n(next[k]);});localStorage.setItem(SETTINGS_KEY,JSON.stringify(next));window.dispatchEvent(new CustomEvent('tradejournal:trade-settings-changed'));return next;}
  function filter(values,options){var o=options||{},from=o.from?new Date(o.from).getTime():-Infinity,to=o.to?new Date(o.to).getTime()+86400000:Infinity,q=String(o.query||'').toLowerCase();return (values||listSync()).filter(function(x){var time=new Date(x.createdAt).getTime();return time>=from&&time<=to&&(!o.status||x.status===o.status)&&(!o.direction||x.direction===o.direction)&&(!o.patternId||x.linkedPatternIds.indexOf(o.patternId)>-1)&&(!o.strategyId||x.linkedStrategyId===o.strategyId)&&(o.accountId===undefined||x.accountId===o.accountId)&&(!q||JSON.stringify([x.session,x.status,x.direction,x.chartNote,x.conceptTags,x.linkedStrategyId]).toLowerCase().indexOf(q)>-1);});}
  function analytics(values){var list=values||listSync(),closed=list.filter(function(x){return x.status==='closed';}),opened=list.filter(function(x){return x.statusHistory.some(function(s){return s.status==='open';});}),tagged=list.filter(function(x){return x.linkedPatternIds.length;});var ai=[];list.forEach(function(x){(x.aiPredictionLinks||[]).forEach(function(p){if(typeof p.correct==='boolean')ai.push(p.correct);});});return{total:list.length,statuses:{hunting:list.filter(function(x){return x.status==='hunting';}).length,open:list.filter(function(x){return x.status==='open';}).length,closed:closed.length,cancelled:list.filter(function(x){return x.status==='cancelled';}).length},funnel:{detected:list.length,opened:opened.length,closed:closed.length,wins:closed.filter(function(x){return x.outcome==='win';}).length},tagged:tagged.length,untagged:list.length-tagged.length,aiAccuracy:ai.length?Math.round(ai.filter(Boolean).length/ai.length*100):null,aiSamples:ai.length};}
  window.TradeJournalTradeStore={settingsKey:SETTINGS_KEY,uid:uid,now:now,createDraft:function(seed){return normalize(Object.assign(empty(seed),seed||{}));},normalize:normalize,listSync:listSync,find:find,save:save,remove:remove,updateStatus:updateStatus,addEmotion:addEmotion,findBySource:findBySource,addScreenshots:addScreenshots,screenshotUrl:screenshotUrl,settings:settings,saveSettings:saveSettings,detectSession:detectSession,filter:filter,analytics:analytics,maxImageBytes:MAX_IMAGE_BYTES,psychologyDataset:function(){return listSync().filter(function(x){return x.status==='closed';});}};
}());
