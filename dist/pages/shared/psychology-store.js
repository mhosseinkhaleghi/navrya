(function(){
  'use strict';
  var SETTINGS_KEY='tradejournal:psychology-settings:v1';
  function n(value,fallback){var out=Number(value);return Number.isFinite(out)?out:fallback;}
  // `revenge`/`cooldown` (v1) are retired: the wizard-time revenge warning and the passive open-positions
  // cool-down card are unified into the post-trade reflection popup (mental-health-continuous.js), which
  // has its own single `postTradeReflection` toggle instead of two separate settings.
  function defaults(){return{breathing:{enabled:true,stressThreshold:8},postTradeReflection:{enabled:true,cooldownMinutes:15}};}
  function settings(){
    var base=defaults();
    try{
      var stored=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');
      return{
        breathing:Object.assign({},base.breathing,stored.breathing||{},{stressThreshold:n((stored.breathing||{}).stressThreshold,base.breathing.stressThreshold)}),
        postTradeReflection:Object.assign({},base.postTradeReflection,stored.postTradeReflection||{},{cooldownMinutes:n((stored.postTradeReflection||{}).cooldownMinutes,base.postTradeReflection.cooldownMinutes)})
      };
    }catch(_){return base;}
  }
  function saveSettings(value){
    var next=Object.assign({},settings(),value||{});
    localStorage.setItem(SETTINGS_KEY,JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('tradejournal:psychology-settings-changed'));
    return next;
  }
  function closedTrades(trades){return (trades||[]).filter(function(t){return t&&t.status==='closed';});}
  function lastEmotion(trade){var log=trade.emotionLog||[];return log.length?log[log.length-1]:null;}
  function lastClosedTrade(trades){
    return closedTrades(trades).filter(function(t){return t.closedAt;}).sort(function(a,b){return new Date(b.closedAt)-new Date(a.closedAt);})[0]||null;
  }
  function summarize(rows,minSamples){
    var sampleSize=rows.length, wins=rows.filter(function(r){return r.outcome==='win';}).length;
    var insufficient=sampleSize<minSamples;
    var rrRows=rows.filter(function(r){return Number.isFinite(Number(r.rr));});
    var pnlRows=rows.filter(function(r){return Number.isFinite(Number(r.pnl));});
    return{
      sampleSize:sampleSize,
      insufficient:insufficient,
      winRate:insufficient||!sampleSize?null:wins/sampleSize*100,
      avgRR:insufficient||!rrRows.length?null:rrRows.reduce(function(s,r){return s+Number(r.rr);},0)/rrRows.length,
      avgPnl:insufficient||!pnlRows.length?null:pnlRows.reduce(function(s,r){return s+Number(r.pnl);},0)/pnlRows.length
    };
  }
  function emotionalMirror(trades,minSamples){
    minSamples=minSamples||3;
    var buckets={};
    closedTrades(trades).forEach(function(trade){
      var entry=lastEmotion(trade);
      if(!entry)return;
      (entry.dominantEmotions||[]).forEach(function(name){
        (buckets[name]=buckets[name]||[]).push(trade);
      });
    });
    return Object.keys(buckets).map(function(name){
      return Object.assign({emotion:name},summarize(buckets[name],minSamples));
    });
  }
  function tagMirror(trades,minSamples){
    minSamples=minSamples||3;
    var buckets={};
    closedTrades(trades).forEach(function(trade){
      var seenOnTrade={};
      (trade.emotionLog||[]).forEach(function(entry){
        (entry.emotionDetails||[]).forEach(function(detail){
          (detail.tags||[]).forEach(function(tag){
            var key=String(tag||'').trim();
            if(!key||seenOnTrade[key])return;
            seenOnTrade[key]=true;
            (buckets[key]=buckets[key]||[]).push(trade);
          });
        });
      });
    });
    return Object.keys(buckets).map(function(tag){
      return Object.assign({tag:tag},summarize(buckets[tag],minSamples));
    });
  }
  function disciplineSeries(trades){
    var sum=0;
    return (trades||[]).slice().sort(function(a,b){return new Date(a.createdAt)-new Date(b.createdAt);}).map(function(trade){
      sum+=Number(trade.disciplineImpact||0);
      return{label:trade.createdAt?String(trade.createdAt).slice(0,10):'',value:sum};
    });
  }
  function dayKey(date){return date.getFullYear()+'-'+(date.getMonth()+1)+'-'+date.getDate();}
  function disciplineStreak(trades,now){
    now=now||new Date();
    var byDay={};
    (trades||[]).forEach(function(trade){
      if(!trade||!trade.createdAt)return;
      var key=dayKey(new Date(trade.createdAt));
      (byDay[key]=byDay[key]||[]).push(trade);
    });
    var streak=0, cursor=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    for(;;){
      var dayTrades=byDay[dayKey(cursor)];
      if(!dayTrades||!dayTrades.length)break;
      if(!dayTrades.every(function(t){return t.entryMode==='full';}))break;
      streak+=1;
      cursor.setDate(cursor.getDate()-1);
    }
    return streak;
  }
  window.TradeJournalPsychologyStore={
    key:SETTINGS_KEY,
    settings:settings,
    saveSettings:saveSettings,
    emotionalMirror:emotionalMirror,
    tagMirror:tagMirror,
    disciplineSeries:disciplineSeries,
    disciplineStreak:disciplineStreak,
    lastClosedTrade:lastClosedTrade
  };
}());
