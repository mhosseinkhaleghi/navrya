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

  // Emotion-name categorisation, mirrored from psychologyView.jsx's own NEGATIVE/POSITIVE arrays
  // (kept duplicated rather than imported - the store must not depend on the view module).
  var TONE_POSITIVE=['calm','confident','excited'];
  var TONE_NEGATIVE=['revenge','angry','afraid','anxious','fatigued','restless','overconfident'];
  function toneOf(name){
    if(TONE_POSITIVE.indexOf(name)>-1)return'positive';
    if(TONE_NEGATIVE.indexOf(name)>-1)return'negative';
    return'neutral';
  }

  // Classifies the stress arc of every multi-log CLOSED trade (entry -> ... -> exit) into one of
  // four real shapes, and reports each shape's real win rate - the same minSamples threshold
  // every other mirror in this file already uses, so a thin shape reads as insufficient, never a
  // fabricated rate.
  function journeyArcShapes(trades,minSamples){
    minSamples=minSamples||3;
    var buckets={rising:[],falling:[],steady:[],bowl:[]};
    closedTrades(trades).forEach(function(trade){
      var log=(trade.emotionLog||[]).filter(function(e){return Number.isFinite(Number(e.stressLevel));});
      if(log.length<2)return;
      var first=Number(log[0].stressLevel),last=Number(log[log.length-1].stressLevel);
      var peak=Math.max.apply(null,log.map(function(e){return Number(e.stressLevel);}));
      var peakIsMiddle=log.length>2&&peak>first+1&&peak>last+1;
      var shape=peakIsMiddle?'bowl':(last-first>=2?'rising':(first-last>=2?'falling':'steady'));
      buckets[shape].push(trade);
    });
    return Object.keys(buckets).map(function(shape){
      var rows=buckets[shape],example=rows[0]?rows[0].emotionLog.filter(function(e){return Number.isFinite(Number(e.stressLevel));}).map(function(e){return{stage:e.stage,value:Number(e.stressLevel)};}):null;
      return Object.assign({shape:shape,example:example},summarize(rows,minSamples));
    });
  }

  // Average hold time in minutes, bucketed by outcome and the TONE of the emotion logged at
  // exit. A trade missing createdAt/closedAt or any exit log entry is skipped entirely rather
  // than counted at a fabricated duration.
  function holdTimeByExitTone(trades){
    var buckets={};
    closedTrades(trades).forEach(function(trade){
      var log=trade.emotionLog||[];
      if(!log.length||!trade.createdAt||!trade.closedAt)return;
      var exit=log[log.length-1],dominant=(exit.dominantEmotions||[])[0];
      if(!dominant)return;
      var minutes=(new Date(trade.closedAt)-new Date(trade.createdAt))/60000;
      if(!Number.isFinite(minutes)||minutes<0)return;
      var key=(trade.outcome||'unknown')+':'+toneOf(dominant)+':'+dominant;
      (buckets[key]=buckets[key]||[]).push(minutes);
    });
    return Object.keys(buckets).map(function(key){
      var parts=key.split(':'),values=buckets[key];
      return{
        outcome:parts[0],tone:parts[1],emotion:parts[2],
        avgMinutes:Math.round(values.reduce(function(s,v){return s+v;},0)/values.length),
        sampleSize:values.length
      };
    });
  }

  // Open (or hunting) positions carrying at least one logged emotion entry - the real data
  // mental-health-collector.js's legacy openTradeMoodCard() (public/pages/shared/psychology-ui.js)
  // already reads, never surfaced in the React rebuild. No live P&L is computed here - that needs
  // a current market price this store does not have, so it is never fabricated.
  function openPositionMoods(trades){
    return (trades||[]).filter(function(t){return t&&(t.status==='open'||t.status==='hunting')&&(t.emotionLog||[]).length;})
      .map(function(trade){
        var entry=trade.emotionLog[trade.emotionLog.length-1],tags=[];
        (entry.emotionDetails||[]).forEach(function(d){(d.tags||[]).forEach(function(tag){if(tags.indexOf(tag)===-1)tags.push(tag);});});
        return{
          tradeId:trade.id,direction:trade.direction,instrument:trade.instrument||null,
          stressLevel:Number.isFinite(Number(entry.stressLevel))?Number(entry.stressLevel):null,
          dominantEmotions:entry.dominantEmotions||[],tags:tags
        };
      });
  }

  // ---------------------------------------------------------------------
  // AI Insights tab: local, computed-not-generated pattern cards.
  //
  // The design artboard (Insights.dc.html) shows AI-authored prose with specific fabricated
  // numbers ("8 of the last losing trades", "62 check-ins"). None of that copy is replicated
  // verbatim - instead this reruns the SAME kind of pattern search the mock illustrates, but for
  // real, against data this app actually has: trade-store's pnl/instrument/closedAt/emotionLog,
  // and the two v2 continuous-tracking records that already carry exactly the fields the mock's
  // correlation cards imply (mental-health.types.js PreSessionCheckIn: sleepQuality,
  // somethingToProveToday, significantPersonalEvent) plus routine-store's per-day adherence.
  // Every candidate is symmetrically sample-gated - BOTH sides of a comparison must clear
  // minSamples, or the candidate is dropped rather than shown thin. Nothing here calls an LLM;
  // it is a deterministic reducer over real rows, so it is fully covered by
  // tests/psychology-regression.test.mjs the same way every other function in this file is.
  function tradesByDayClosed(trades){
    var map={};
    closedTrades(trades).filter(function(t){return t.closedAt;}).forEach(function(t){
      var d=new Date(t.closedAt);
      if(isNaN(d.getTime()))return;
      var key=dayKey(d);
      (map[key]=map[key]||[]).push(t);
    });
    return map;
  }
  function keyOfIso(iso){
    var d=iso?new Date(iso):null;
    return d&&!isNaN(d.getTime())?dayKey(d):null;
  }
  function nextDayKeyOf(key){
    var parts=String(key).split('-');
    var d=new Date(Number(parts[0]),Number(parts[1])-1,Number(parts[2]));
    d.setDate(d.getDate()+1);
    return dayKey(d);
  }
  function winRateOf(rows){
    if(!rows.length)return null;
    var wins=rows.filter(function(r){return r.outcome==='win';}).length;
    return wins/rows.length*100;
  }
  function avgOf(rows,pick){
    var vals=rows.map(pick).filter(function(v){return Number.isFinite(v);});
    if(!vals.length)return null;
    return vals.reduce(function(s,v){return s+v;},0)/vals.length;
  }
  function lastStressOf(trade){var e=lastEmotion(trade);return e?Number(e.stressLevel):NaN;}
  function lastCommitmentOf(trade){var e=lastEmotion(trade);return e?Number(e.planCommitment):NaN;}

  function emotionSpreadCard(trades,minSamples){
    var mirror=emotionalMirror(trades,minSamples).filter(function(m){return !m.insufficient&&m.avgPnl!=null;});
    if(mirror.length<2)return null;
    var sorted=mirror.slice().sort(function(a,b){return b.avgPnl-a.avgPnl;});
    var best=sorted[0],worst=sorted[sorted.length-1];
    if(!(best.avgPnl>worst.avgPnl))return null;
    return{
      kind:'emotionSpread',
      best:{emotion:best.emotion,avgPnl:best.avgPnl,sampleSize:best.sampleSize},
      worst:{emotion:worst.emotion,avgPnl:worst.avgPnl,sampleSize:worst.sampleSize},
      spread:sorted.map(function(m){return{emotion:m.emotion,avgPnl:m.avgPnl,sampleSize:m.sampleSize};}),
      sampleSize:best.sampleSize+worst.sampleSize
    };
  }
  function hourWindowCard(trades,minSamples){
    var closed=closedTrades(trades).filter(function(t){return t.closedAt;});
    if(closed.length<minSamples*2)return null;
    var buckets=[];
    for(var h=0;h<24;h+=2){
      buckets.push({startHour:h,rows:closed.filter(function(t){
        var hh=new Date(t.closedAt).getHours();
        return hh===h||hh===h+1;
      })});
    }
    var eligible=buckets.filter(function(b){return b.rows.length>=minSamples;});
    if(!eligible.length)return null;
    eligible.forEach(function(b){b.winRate=winRateOf(b.rows);b.avgStress=avgOf(b.rows,lastStressOf);});
    var worst=eligible.slice().sort(function(a,b){return a.winRate-b.winRate;})[0];
    var restRows=closed.filter(function(t){
      var hh=new Date(t.closedAt).getHours();
      return hh!==worst.startHour&&hh!==worst.startHour+1;
    });
    if(restRows.length<minSamples)return null;
    var restWinRate=winRateOf(restRows);
    if(restWinRate==null||!(worst.winRate<restWinRate))return null;
    return{
      kind:'hourWindow',startHour:worst.startHour,endHour:worst.startHour+2,
      winRate:worst.winRate,avgStress:worst.avgStress,sampleSize:worst.rows.length,
      restWinRate:restWinRate,restAvgStress:avgOf(restRows,lastStressOf),restSampleSize:restRows.length
    };
  }
  function symbolStressCard(trades,minSamples){
    var closed=closedTrades(trades).filter(function(t){return t.instrument&&(t.emotionLog||[]).length;});
    var buckets={};
    closed.forEach(function(t){(buckets[t.instrument]=buckets[t.instrument]||[]).push(t);});
    var candidates=Object.keys(buckets)
      .filter(function(s){return buckets[s].length>=minSamples;})
      .map(function(s){return{instrument:s,rows:buckets[s],avgStress:avgOf(buckets[s],lastStressOf)};})
      .filter(function(x){return x.avgStress!=null;});
    if(!candidates.length)return null;
    var worst=candidates.slice().sort(function(a,b){return b.avgStress-a.avgStress;})[0];
    var rest=closed.filter(function(t){return t.instrument!==worst.instrument;});
    if(rest.length<minSamples)return null;
    var restAvgStress=avgOf(rest,lastStressOf);
    if(restAvgStress==null||!(worst.avgStress>restAvgStress))return null;
    return{
      kind:'symbolStress',instrument:worst.instrument,avgStress:worst.avgStress,sampleSize:worst.rows.length,
      restAvgStress:restAvgStress,restSampleSize:rest.length
    };
  }
  function sleepNextDayCorrelation(trades,checkins,minSamples){
    var byDay=tradesByDayClosed(trades),bucketOf={};
    (checkins||[]).forEach(function(c){
      var key=keyOfIso(c.createdAt);
      var quality=Number(c.sleepQuality);
      if(!key||!Number.isFinite(quality))return;
      var nk=nextDayKeyOf(key),bucket=quality<=4?'low':(quality>=7?'high':null);
      if(!bucket)return;
      bucketOf[nk]=(bucketOf[nk]&&bucketOf[nk]!==bucket)?'mixed':bucket;
    });
    var lowRows=[],highRows=[];
    Object.keys(bucketOf).forEach(function(nk){
      var bucket=bucketOf[nk],rows=byDay[nk]||[];
      if(!rows.length||bucket==='mixed')return;
      if(bucket==='low')lowRows=lowRows.concat(rows);else highRows=highRows.concat(rows);
    });
    if(lowRows.length<minSamples||highRows.length<minSamples)return null;
    return{
      lowWinRate:winRateOf(lowRows),lowSampleSize:lowRows.length,
      highWinRate:winRateOf(highRows),highSampleSize:highRows.length
    };
  }
  function proveTodayCorrelation(trades,checkins,minSamples){
    var byDay=tradesByDayClosed(trades),bucketOf={};
    (checkins||[]).forEach(function(c){
      var key=keyOfIso(c.createdAt);
      if(!key)return;
      var val=!!c.somethingToProveToday;
      bucketOf[key]=(bucketOf[key]!==undefined&&bucketOf[key]!==val)?'mixed':val;
    });
    var yesRows=[],noRows=[];
    Object.keys(bucketOf).forEach(function(key){
      var val=bucketOf[key],rows=byDay[key]||[];
      if(!rows.length||val==='mixed')return;
      if(val)yesRows=yesRows.concat(rows);else noRows=noRows.concat(rows);
    });
    if(yesRows.length<minSamples||noRows.length<minSamples)return null;
    return{
      yesAvgPnl:avgOf(yesRows,function(t){return Number(t.pnl);}),yesSampleSize:yesRows.length,
      noAvgPnl:avgOf(noRows,function(t){return Number(t.pnl);}),noSampleSize:noRows.length
    };
  }
  function personalEventCorrelation(trades,checkins,minSamples){
    var byDay=tradesByDayClosed(trades),bucketOf={};
    (checkins||[]).forEach(function(c){
      var key=keyOfIso(c.createdAt);
      if(!key)return;
      var val=!!(c.significantPersonalEvent&&String(c.significantPersonalEvent).trim());
      bucketOf[key]=(bucketOf[key]!==undefined&&bucketOf[key]!==val)?'mixed':val;
    });
    var withRows=[],withoutRows=[];
    Object.keys(bucketOf).forEach(function(key){
      var val=bucketOf[key],rows=(byDay[key]||[]).filter(function(t){return(t.emotionLog||[]).length;});
      if(!rows.length||val==='mixed')return;
      if(val)withRows=withRows.concat(rows);else withoutRows=withoutRows.concat(rows);
    });
    if(withRows.length<minSamples||withoutRows.length<minSamples)return null;
    return{
      withAvgCommitment:avgOf(withRows,lastCommitmentOf),withSampleSize:withRows.length,
      withoutAvgCommitment:avgOf(withoutRows,lastCommitmentOf),withoutSampleSize:withoutRows.length
    };
  }
  function routineCompletionCorrelation(trades,routineDays,minSamples){
    var byDay=tradesByDayClosed(trades),fullRows=[],partialRows=[];
    Object.keys(routineDays||{}).forEach(function(key){
      var info=routineDays[key],rows=(byDay[key]||[]).filter(function(t){return(t.emotionLog||[]).length;});
      if(!rows.length||!info||!info.total)return;
      if(info.complete)fullRows=fullRows.concat(rows);else partialRows=partialRows.concat(rows);
    });
    if(fullRows.length<minSamples||partialRows.length<minSamples)return null;
    return{
      fullAvgStress:avgOf(fullRows,lastStressOf),fullSampleSize:fullRows.length,
      partialAvgStress:avgOf(partialRows,lastStressOf),partialSampleSize:partialRows.length
    };
  }
  // routineDays: plain {dayKey:{total,complete}} map - the view builds it from
  // window.TradeJournalRoutineStore (kept out of this file so it stays a pure trades-in reducer,
  // and so the sandboxed test harness never needs to load routine-store.js to exercise this).
  function aiInsightCards(trades,checkins,routineDays,minSamples){
    minSamples=minSamples||8;
    var cards=[];
    var emotionSpread=emotionSpreadCard(trades,minSamples);
    if(emotionSpread)cards.push(emotionSpread);
    var hourWindow=hourWindowCard(trades,minSamples);
    if(hourWindow)cards.push(hourWindow);
    var symbolStress=symbolStressCard(trades,minSamples);
    if(symbolStress)cards.push(symbolStress);

    var correlations=[];
    var sleepNextDay=sleepNextDayCorrelation(trades,checkins,minSamples);
    if(sleepNextDay)correlations.push(Object.assign({kind:'sleepNextDay'},sleepNextDay));
    var proveToday=proveTodayCorrelation(trades,checkins,minSamples);
    if(proveToday)correlations.push(Object.assign({kind:'proveToday'},proveToday));
    var personalEvent=personalEventCorrelation(trades,checkins,minSamples);
    if(personalEvent)correlations.push(Object.assign({kind:'personalEvent'},personalEvent));
    var routineCompletion=routineCompletionCorrelation(trades,routineDays,minSamples);
    if(routineCompletion)correlations.push(Object.assign({kind:'routineCompletion'},routineCompletion));

    return{cards:cards,correlations:correlations,minSamples:minSamples};
  }

  // ---------------------------------------------------------------------
  // Protective tab: real cooldown-guard firing history.
  //
  // A "fire" is a PostTradeReflection whose revengeCheck.choice was 'recover' ("yes, to make up
  // for it") - postTradeReflectionModal.jsx only starts revengeCheck.cooldownTimerStartedAt for
  // that choice, never for 'rest' or 'saw_setup'. Whether the trader actually held the cooldown
  // is not self-reported (nothing asks them afterward) - it is read back objectively from trade
  // history: any OTHER trade opened inside [start, start+cooldownMinutes] means it broke.
  function cooldownHistory(trades,reflections,cooldownMinutes){
    cooldownMinutes=cooldownMinutes||15;
    var byId={};
    (trades||[]).forEach(function(t){byId[t.id]=t;});
    return (reflections||[])
      .filter(function(r){return r.revengeCheck&&r.revengeCheck.shown&&r.revengeCheck.choice==='recover'&&r.revengeCheck.cooldownTimerStartedAt;})
      .map(function(r){
        var start=new Date(r.revengeCheck.cooldownTimerStartedAt).getTime();
        var end=start+cooldownMinutes*60000;
        var source=byId[r.tradeId]||null;
        var broke=(trades||[]).some(function(t){
          if(t.id===r.tradeId)return false;
          var opened=t.openedAt||t.createdAt;
          if(!opened)return false;
          var ts=new Date(opened).getTime();
          return ts>start&&ts<=end;
        });
        return{
          tradeId:r.tradeId,instrument:source?source.instrument:null,direction:source?source.direction:null,
          startedAt:r.revengeCheck.cooldownTimerStartedAt,held:!broke
        };
      })
      .sort(function(a,b){return new Date(b.startedAt)-new Date(a.startedAt);});
  }
  function cooldownHistorySummary(rows){
    var total=(rows||[]).length,held=(rows||[]).filter(function(r){return r.held;}).length;
    return{total:total,held:held,broke:total-held};
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
    worstRevengeTrade:worstRevengeTrade,
    journeyArcShapes:journeyArcShapes,
    holdTimeByExitTone:holdTimeByExitTone,
    openPositionMoods:openPositionMoods,
    aiInsightCards:aiInsightCards,
    cooldownHistory:cooldownHistory,
    cooldownHistorySummary:cooldownHistorySummary
  };
}());
