(function(){
  'use strict';
  var CHARACTERS=['hunter','engineer','commander','sage'];
  function uid(){return 'signature-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);}
  function array(value){return Array.isArray(value)?value:[];}
  function unique(values){return Array.from(new Set(values.filter(Boolean).map(String)));}
  // Phase 8a of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
  // Constraints section) - reads the in-memory server-replica directly, the same infrastructure
  // every other migrated domain uses. There is no localStorage cache, no offline outbox, and no
  // local-first fallback for session signatures any more; see server-replica.js's own file
  // header for the write/rollback contract.
  function replica() { return window.TradeJournalServerReplica && window.TradeJournalServerReplica.domain('session-signatures'); }
  (function () {
    if (!window.TradeJournalServerReplica) return;
    window.TradeJournalServerReplica.registerListDomain('session-signatures', {
      hydrateUrl: '/api/sync/session-signatures',
      writeUrl: '/api/sync/session-signatures',
      deleteUrlFor: function (id) { return '/api/sync/session-signatures/' + encodeURIComponent(id); },
      extractList: function (body) { return (body && body.signatures) || []; }
    });
    replica().hydrate();
  }());
  function listSync(){var domain=replica();return domain?domain.list():[];}
  function notifyChanged(){var domain=replica();window.dispatchEvent(new CustomEvent('tradejournal:session-signatures-changed',{detail:{count:domain?domain.list().length:0}}));}
  function direction(entry){var value=String(entry.direction||entry.movementDirection||entry.priceDirection||(entry.movement&&entry.movement.direction)||'').toLowerCase(),note=String(entry.movementNote||entry.note||'').toLowerCase();if(/up|bull|rise|long|صعود|صاعد|sube|alcista/.test(value+' '+note))return'up';if(/down|bear|fall|short|نزول|هابط|baja|bajista/.test(value+' '+note))return'down';return'sideways';}
  function magnitude(entry){var value=String(entry.magnitude||(entry.movement&&entry.movement.magnitude)||entry.moveStrength||'').toLowerCase();if(/large|strong|high|قوی|كبير|fuerte/.test(value))return'large';if(/medium|moderate|متوسط|medio/.test(value))return'medium';if(/small|weak|low|کم|صغير|débil/.test(value))return'small';return null;}
  function scenarios(session){var rows=[];array(session.entries).forEach(function(entry){array(entry.scenarios).forEach(function(scenario){rows.push(scenario);});});return rows;}
  function fateText(session){var fate=session.fateSummary||session.previousSessionSummary;if(typeof fate==='string')return fate;if(!fate)return'';var analysis=session.aiSessionAnalysisResult||{};return [fate.note,fate.moveStrengthDirection||fate.moveStrength,fate.spikeDirection||fate.spike,analysis.overview,analysis.carryForwardToNextSession,session.aiSessionAnalysis].filter(Boolean).join(' · ');}
  function tradesFor(sessionId){var tradeStore=window.TradeJournalTradeStore,rows=tradeStore&&tradeStore.listSync?tradeStore.listSync():[];return rows.filter(function(trade){return trade.source&&trade.source.sessionId===sessionId;});}
  function buildSignatureFromSession(session,character){
    if(!session)return null;var entries=array(session.entries).slice().sort(function(a,b){return new Date(a.createdAt||0)-new Date(b.createdAt||0);}),scenarioRows=scenarios(session),trades=tradesFor(session.id),pnlRows=trades.filter(function(trade){return Number.isFinite(Number(trade.pnl));});
    return {id:uid(),sessionId:String(session.id),character:String(character||session.character||'unknown'),market:String(session.market||session.tradingSession||(entries[0]&&(entries[0].market||entries[0].tradingSession))||''),timeframe:String(session.timeframe||(entries[0]&&entries[0].timeframe)||''),date:String(session.date||session.gregorianDate||(session.startedAt?new Date(session.startedAt).toISOString().slice(0,10):'')),movementSequence:entries.filter(function(entry){return entry.type==='movement'||entry.type==='chart';}).map(function(entry,index){return{orderIndex:index,direction:direction(entry),magnitude:magnitude(entry)};}),patternIds:unique(scenarioRows.map(function(scenario){return scenario.pattern&&scenario.pattern.patternTagId;})),strategyIds:unique(trades.map(function(trade){return trade.linkedStrategyId;})),scenarioOutcomes:scenarioRows.map(function(scenario){return{patternId:scenario.pattern&&scenario.pattern.patternTagId||null,occurred:scenario.occurred===true};}),tradeSummary:{count:trades.length,wins:trades.filter(function(trade){return trade.outcome==='win';}).length,losses:trades.filter(function(trade){return trade.outcome==='loss';}).length,netPnl:pnlRows.length?pnlRows.reduce(function(sum,trade){return sum+Number(trade.pnl);},0):null},fateSummaryText:fateText(session),createdAt:new Date().toISOString()};
  }
  function buildPartialFromSession(session,character){var value=buildSignatureFromSession(session,character);if(value){value.id='live-'+session.id;value.fateSummaryText='';}return value;}
  // save()/upsert() - optimistic apply via replica().upsert() (server-replica.js's own
  // synchronous-apply contract), .catch()-guarded so a real failure never surfaces as an
  // unhandled rejection, exactly like every other migrated domain's save().
  function upsert(signature){
    if(!signature||!signature.sessionId)return null;
    var existing=listSync().find(function(item){return item.sessionId===signature.sessionId;});
    if(existing)signature.id=existing.id;
    var domain=replica();
    if(domain)domain.upsert(signature).catch(function(){});
    notifyChanged();
    return signature;
  }
  function captureClosedSession(session,character){if(!session||session.status!=='closed'||!session.fateSummary)return null;return upsert(buildSignatureFromSession(session,character));}
  // Sessions migrated onto server-replica.js in Phase 3 (see ARCHITECTURE.md's Global Data Sync
  // section) - the live bucket is scanned through window.TradeJournalWorkspace's own public
  // list() now, not localStorage. The four per-character legacy keys are still scanned directly:
  // genuinely dead in practice today (session-workspace-logic.js's own
  // migrateLegacyPerCharacterSessions() already merges and deletes them on every load), kept only
  // as defensive recovery for a browser that has somehow never run that merge.
  function backfillFromLive(known){
    var workspace=window.TradeJournalWorkspace,sessions=workspace&&typeof workspace.list==='function'?workspace.list():[],added=[];
    sessions.forEach(function(session){if(!session||session.status!=='closed'||!session.fateSummary||known.has(String(session.id)))return;var signature=buildSignatureFromSession(session,session.character);added.push(signature);known.add(String(session.id));});
    return added;
  }
  function backfillFromLegacy(known){
    var added=[];
    CHARACTERS.forEach(function(character){try{var sessions=JSON.parse(localStorage.getItem('tradejournal:sessions:v1:'+character))||[];sessions.forEach(function(session){if(session.status!=='closed'||!session.fateSummary||known.has(String(session.id)))return;var signature=buildSignatureFromSession(session,character);added.push(signature);known.add(String(session.id));});}catch(_){/* Continue with other stores. */}});
    return added;
  }
  function persistNew(newRows){
    var domain=replica();
    if(!domain||!newRows.length)return;
    newRows.forEach(function(row){domain.upsert(row).catch(function(){});});
    notifyChanged();
  }
  // Both the legacy-key scan's persist step and the live-bucket scan depend on this store's own
  // 'session-signatures' domain having actually hydrated first, for two real reasons, not just
  // one: (1) `known` must reflect the server's existing signatures, or a session already synced
  // from a previous session would look "new" again and get re-added; (2) calling upsert() before
  // hydrate() resolves would have its optimistic add silently wiped the moment hydrate()'s own
  // GET later resolves and calls setAllLocal(), which replaces the in-memory list wholesale.
  // Deferred behind TradeJournalServerReplica.allReady() (the same gate character-app.jsx's own
  // boot sequence waits on) rather than this domain's own hydrate() alone, since backfillFromLive
  // also depends on the separate 'sessions' domain having hydrated.
  function backfill(){
    var ready=(window.TradeJournalServerReplica&&typeof window.TradeJournalServerReplica.allReady==='function')?window.TradeJournalServerReplica.allReady():Promise.resolve();
    return ready.catch(function(){}).then(function(){
      var known=new Set(listSync().map(function(item){return item.sessionId;}));
      var legacyNew=backfillFromLegacy(known);
      var liveNew=backfillFromLive(known);
      persistNew(legacyNew.concat(liveNew));
      return legacyNew.length;
    });
  }
  window.TradeJournalSessionSignatureStore={listSync:listSync,save:upsert,captureClosedSession:captureClosedSession,buildSignatureFromSession:buildSignatureFromSession,buildPartialFromSession:buildPartialFromSession,backfill:backfill};
  (window.setTimeout||setTimeout)(backfill,0);
}());
