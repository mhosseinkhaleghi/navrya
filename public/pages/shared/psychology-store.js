(function(){
  'use strict';
  // Phase 8b of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
  // Constraints section): reads/writes through window.TradeJournalUserPreferences (the generic
  // {user_id, pref_key -> value} replica-backed store built in Phase 8a), one preference key
  // ('psychologySettings') holding the whole {breathing, postTradeReflection} object - the same
  // atomic whole-object merge shape saveSettings() already had, just server-backed now instead of
  // localStorage-backed. No localStorage anywhere in this file any more.
  var PREF_KEY='psychologySettings';
  function n(value,fallback){var out=Number(value);return Number.isFinite(out)?out:fallback;}
  // `revenge`/`cooldown` (v1) are retired: the wizard-time revenge warning and the passive open-positions
  // cool-down card are unified into the post-trade reflection popup (mental-health-continuous.js), which
  // has its own single `postTradeReflection` toggle instead of two separate settings.
  function defaults(){return{breathing:{enabled:true,stressThreshold:8},postTradeReflection:{enabled:true,cooldownMinutes:15}};}
  function settings(){
    var base=defaults();
    var prefs=window.TradeJournalUserPreferences;
    var stored=(prefs?prefs.getPref(PREF_KEY,null):null)||{};
    return{
      breathing:Object.assign({},base.breathing,stored.breathing||{},{stressThreshold:n((stored.breathing||{}).stressThreshold,base.breathing.stressThreshold)}),
      postTradeReflection:Object.assign({},base.postTradeReflection,stored.postTradeReflection||{},{cooldownMinutes:n((stored.postTradeReflection||{}).cooldownMinutes,base.postTradeReflection.cooldownMinutes)})
    };
  }
  function saveSettings(value){
    var next=Object.assign({},settings(),value||{});
    var prefs=window.TradeJournalUserPreferences;
    if(prefs)prefs.setPref(PREF_KEY,next);
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
  function weekStart(date){var d=new Date(date.getFullYear(),date.getMonth(),date.getDate());var day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return d;}
  function weekKey(date){var w=weekStart(date);return w.getFullYear()+'-'+(w.getMonth()+1)+'-'+w.getDate();}

  // Weekly discipline score (0-100), last `weeks` calendar weeks ending with the current week -
  // the same real per-trade fields disciplineStreak()/disciplineSeries() already use
  // (entryMode/disciplineImpact), just bucketed and normalised instead of a running total. A week
  // with no trades logged is scored null (rendered as an honest gap, never a fabricated number).
  function disciplineWeekly(trades,weeks,now){
    weeks=weeks||12;now=now||new Date();
    var buckets={};
    (trades||[]).forEach(function(trade){
      if(!trade||!trade.createdAt)return;
      var key=weekKey(new Date(trade.createdAt));
      (buckets[key]=buckets[key]||[]).push(trade);
    });
    var out=[],cursor=weekStart(now);
    for(var i=weeks-1;i>=0;i--){
      var d=new Date(cursor);d.setDate(d.getDate()-i*7);
      var key=weekKey(d),list=buckets[key]||[];
      var score=null;
      if(list.length){
        var full=list.filter(function(t){return t.entryMode==='full';}).length;
        score=Math.round(full/list.length*100);
      }
      out.push({weekStart:key,score:score,tradeCount:list.length});
    }
    return out;
  }

  // Frequency distribution of dominant emotions logged over the trailing `days`, across every
  // emotionLog entry (not just closed trades' last entry, unlike emotionalMirror() above, which
  // is win-rate not frequency) - real counts, never fabricated percentages.
  function emotionFrequency(trades,days,now){
    days=days||30;now=now||new Date();
    var since=now.getTime()-days*86400000;
    var counts={},total=0;
    (trades||[]).forEach(function(trade){
      (trade.emotionLog||[]).forEach(function(entry){
        if(new Date(entry.timestamp).getTime()<since)return;
        (entry.dominantEmotions||[]).forEach(function(name){
          counts[name]=(counts[name]||0)+1;total+=1;
        });
      });
    });
    return Object.keys(counts).map(function(name){
      return{emotion:name,count:counts[name],pct:total?Math.round(counts[name]/total*1000)/10:0};
    }).sort(function(a,b){return b.count-a.count;});
  }

  // Average stress per calendar day for the trailing `days` (default 7) - real emotionLog data,
  // grouped by day rather than mental-health-collector.js's flat 30-day average, since the
  // "emotional weather" panel needs one point per day, not one overall number.
  function emotionalWeatherDaily(trades,days,now){
    days=days||7;now=now||new Date();
    var byDay={},order=[];
    for(var i=days-1;i>=0;i--){
      var d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);
      var key=dayKey(d);
      byDay[key]={date:d,values:[]};order.push(key);
    }
    (trades||[]).forEach(function(trade){
      (trade.emotionLog||[]).forEach(function(entry){
        var key=dayKey(new Date(entry.timestamp));
        if(byDay[key]&&Number.isFinite(Number(entry.stressLevel)))byDay[key].values.push(Number(entry.stressLevel));
      });
    });
    return order.map(function(key){
      var bucket=byDay[key],values=bucket.values;
      return{date:bucket.date,avgStress:values.length?Math.round(values.reduce(function(s,v){return s+v;},0)/values.length*10)/10:null,sampleSize:values.length};
    });
  }

  // A live read of how close the trader is to the state their own history says they trade worst
  // in. Three real signals off real fields, and deliberately NOT a score out of 100: a band is
  // honest about its own precision in a way a number never is.
  //
  // The thresholds are the ones the revenge guard already acts on elsewhere (two losses in a row,
  // or one inside the last half hour) rather than a new model invented here.
  function tiltReading(trades,now){
    now=now||new Date();
    var closed=closedTrades(trades).filter(function(t){return t.closedAt;})
      .sort(function(a,b){return new Date(b.closedAt)-new Date(a.closedAt);});
    var lossStreak=0;
    for(var i=0;i<closed.length;i++){ if(closed[i].outcome==='loss')lossStreak+=1; else break; }
    var lastLoss=closed.filter(function(t){return t.outcome==='loss';})[0]||null;
    var minutesSinceLoss=lastLoss?Math.max(0,Math.round((now-new Date(lastLoss.closedAt))/60000)):null;
    var openCount=(trades||[]).filter(function(t){return t&&(t.status==='open'||t.status==='hunting');}).length;
    var level='calm';
    if(lossStreak>=2||(lossStreak>=1&&minutesSinceLoss!=null&&minutesSinceLoss<=30))level='high';
    else if(lossStreak>=1)level='watch';
    return{level:level,lossStreak:lossStreak,minutesSinceLoss:minutesSinceLoss,openCount:openCount};
  }

  // The three numbers a trader is asked for on every emotion log, averaged over the trailing
  // `days`. Each is null (an honest gap, never a default 5) when nothing was logged - the same
  // rule disciplineWeekly()/emotionalWeatherDaily() already follow for an empty bucket.
  function selfRatings(trades,days,now){
    days=days||30;now=now||new Date();
    var since=now.getTime()-days*86400000;
    var stress=[],focus=[],plan=[];
    (trades||[]).forEach(function(trade){
      (trade.emotionLog||[]).forEach(function(entry){
        if(new Date(entry.timestamp).getTime()<since)return;
        if(Number.isFinite(Number(entry.stressLevel)))stress.push(Number(entry.stressLevel));
        if(Number.isFinite(Number(entry.focusQuality)))focus.push(Number(entry.focusQuality));
        if(Number.isFinite(Number(entry.planCommitment)))plan.push(Number(entry.planCommitment));
      });
    });
    function mean(list){return list.length?Math.round(list.reduce(function(s,v){return s+v;},0)/list.length*10)/10:null;}
    return{stress:mean(stress),focus:mean(focus),planCommitment:mean(plan),sampleSize:stress.length};
  }

  // The single worst trade the calm room's deterrent card can point at: a closed loss that
  // followed another closed loss within half an hour - the same window tiltReading() already
  // treats as "still hot" - picked by the biggest pnl loss among those candidates. Returns null
  // (never a fabricated example) when no such pair exists in the trader's history yet.
  //
  // sizeRatio is real when riskPercent was logged on enough trades to have a median to compare
  // against; otherwise it stays null rather than inventing a multiplier.
  function worstRevengeTrade(trades){
    var closed=closedTrades(trades).filter(function(t){return t.closedAt;})
      .sort(function(a,b){return new Date(a.closedAt)-new Date(b.closedAt);});
    var riskSamples=closed.map(function(t){return Number(t.riskPercent);}).filter(function(v){return Number.isFinite(v);});
    var medianRisk=null;
    if(riskSamples.length){
      var sorted=riskSamples.slice().sort(function(a,b){return a-b;}),mid=Math.floor(sorted.length/2);
      medianRisk=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
    }
    var worst=null;
    for(var i=1;i<closed.length;i++){
      var cur=closed[i],prev=closed[i-1];
      if(cur.outcome!=='loss'||prev.outcome!=='loss')continue;
      var gapMin=Math.round((new Date(cur.closedAt)-new Date(prev.closedAt))/60000);
      if(gapMin<0||gapMin>30)continue;
      var pnl=Number(cur.pnl);
      if(!Number.isFinite(pnl))continue;
      if(!worst||pnl<worst.pnl){
        var risk=Number(cur.riskPercent);
        var sizeRatio=(Number.isFinite(risk)&&medianRisk)?Math.round(risk/medianRisk*10)/10:null;
        worst={tradeId:cur.id,pnl:pnl,minutesSinceLoss:gapMin,sizeRatio:sizeRatio,closedAt:cur.closedAt};
      }
    }
    return worst;
  }

  window.TradeJournalPsychologyStore={
    settings:settings,
    saveSettings:saveSettings,
    emotionalMirror:emotionalMirror,
    tagMirror:tagMirror,
    disciplineSeries:disciplineSeries,
    disciplineStreak:disciplineStreak,
    disciplineWeekly:disciplineWeekly,
    emotionFrequency:emotionFrequency,
    emotionalWeatherDaily:emotionalWeatherDaily,
    lastClosedTrade:lastClosedTrade,
    tiltReading:tiltReading,
    selfRatings:selfRatings,
    worstRevengeTrade:worstRevengeTrade
  };
}());
