(function(){
  'use strict';
  var store=window.TradeJournalTradeStore, i18n=window.TradeJournalTradeI18n, layer=window.TradeJournalPanelLayer, psych=window.TradeJournalPsychologyStore, reports=window.TradeJournalTradeReports;
  if(!store||!i18n||!layer||!psych||!reports)return;
  var state={tab:'overview',range:'month',from:'',to:''};

  function el(tag,className,text){var node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function ico(name){var node=el('i');node.dataset.lucide=name;return node;}
  function button(text,className,icon){var b=el('button',className||'',text);b.type='button';if(icon)b.prepend(ico(icon));return b;}
  function icons(root){if(window.TradeJournalIcons)window.TradeJournalIcons.schedule(root||document);}
  function num(v){return i18n.number(v,{maximumFractionDigits:2});}
  function toast(message,tone){var node=el('div','tj-toast '+(tone||''),message);document.body.append(node);setTimeout(function(){node.remove();},2600);}
  function infoIcon(text){var span=el('span','tj-info-icon');span.tabIndex=0;span.setAttribute('role','note');span.setAttribute('aria-label',text);span.dataset.tooltip=text;span.append(ico('info'));return span;}

  function modal(className,title){
    var back=el('div','tj-modal-backdrop'),box=el('section','tj-modal '+(className||'')),head=el('header','tj-modal-head'),h=el('h2','',title),close=button('','tj-icon-button','x'),closed=false,nativeRemove=back.remove.bind(back);
    back.dir=i18n.direction();
    back.setAttribute('role','presentation');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
    close.dataset.tjClose='';close.setAttribute('aria-label',i18n.t('close'));
    function destroy(event){if(event){event.preventDefault();event.stopPropagation();}if(closed)return;closed=true;document.removeEventListener('keydown',escape,true);nativeRemove();}
    function escape(event){if(event.key==='Escape')destroy(event);}
    back.remove=destroy;
    close.addEventListener('click',destroy,true);
    back.addEventListener('click',function(event){if(event.target===back)destroy(event);});
    box.addEventListener('click',function(event){event.stopPropagation();});
    document.addEventListener('keydown',escape,true);
    head.append(h,close);box.append(head);back.append(box);document.body.append(back);
    icons(back);
    return{back:back,box:box,close:close,destroy:destroy};
  }

  function insufficientRow(label){var row=el('div','psy-insufficient-row');row.append(el('span','',label),el('small','',i18n.t('insufficientData')));return row;}

  function emotionalMirrorCard(trades){
    var rows=psych.emotionalMirror(trades,3);
    var chartData=rows.filter(function(r){return !r.insufficient;}).map(function(r){return{label:i18n.t(r.emotion),value:Math.round(r.winRate)};});
    var card=reports.canvasCard(i18n.t('psyEmotionalMirrorTitle'),'bars',chartData);
    card.querySelector('.tj-chart-head').append(infoIcon(i18n.t('psyInfoMirror')));
    var insufficientRows=rows.filter(function(r){return r.insufficient;});
    if(insufficientRows.length){var list=el('div','psy-insufficient-list');insufficientRows.forEach(function(r){list.append(insufficientRow(i18n.t(r.emotion)));});card.append(list);}
    return card;
  }

  function openTradeMoodCard(){
    var openTrades=store.listSync().filter(function(t){return (t.status==='open'||t.status==='hunting')&&(t.emotionLog||[]).length;});
    if(!openTrades.length)return null;
    var card=el('section','psy-open-mood-card'),heading=el('h3','',i18n.t('psyOpenMoodTitle'));
    heading.append(infoIcon(i18n.t('psyInfoOpenMood')));
    card.append(heading,el('p','tj-hint',i18n.t('psyOpenMoodSubtitle')));
    var list=el('div','psy-open-mood-list'),ui=window.TradeJournalTradeUI;
    openTrades.forEach(function(trade){
      var entry=trade.emotionLog[trade.emotionLog.length-1];
      var row=button('','psy-open-mood-row');
      var head=el('div');head.append(el('b','',i18n.t(trade.direction)),el('span','',i18n.t('stressLevel')+': '+entry.stressLevel));
      row.append(head);
      if((entry.dominantEmotions||[]).length)row.append(el('small','',entry.dominantEmotions.map(function(x){return i18n.t(x);}).join(' · ')));
      var tags=[];(entry.emotionDetails||[]).forEach(function(d){(d.tags||[]).forEach(function(t){if(tags.indexOf(t)===-1)tags.push(t);});});
      if(tags.length){var tagsRow=el('div','psy-open-mood-tags');tags.forEach(function(t){tagsRow.append(el('span','mh-chip',t));});row.append(tagsRow);}
      if(ui)row.onclick=function(){ui.viewTrade(trade.id);};
      list.append(row);
    });
    card.append(list);
    return card;
  }

  function tagMirrorCard(trades){
    var rows=psych.tagMirror(trades,3);
    if(!rows.length)return null;
    var chartData=rows.filter(function(r){return !r.insufficient;}).map(function(r){return{label:r.tag,value:Math.round(r.winRate)};});
    var card=reports.canvasCard(i18n.t('psyTagMirrorTitle'),'bars',chartData);
    card.querySelector('.tj-chart-head').append(infoIcon(i18n.t('psyInfoTagMirror')));
    var insufficientRows=rows.filter(function(r){return r.insufficient;});
    if(insufficientRows.length){var list=el('div','psy-insufficient-list');insufficientRows.forEach(function(r){list.append(insufficientRow(r.tag));});card.append(list);}
    return card;
  }

  function disciplineCard(trades){
    var card=reports.canvasCard(i18n.t('psyDisciplineScoreTitle'),'line',psych.disciplineSeries(trades));
    card.querySelector('.tj-chart-head').append(infoIcon(i18n.t('psyInfoDiscipline')));
    return card;
  }

  function metricTile(label,value,icon,tone){
    var card=el('article','tj-metric '+(tone||'')),head=el('div');
    head.append(ico(icon),el('span','',label));
    card.append(head,el('strong','',value));
    return card;
  }

  function streakCard(trades){
    var streak=psych.disciplineStreak(trades),card=metricTile(i18n.t('psyDisciplineStreakTitle'),i18n.t('psyDisciplineStreakDays',{count:i18n.number(streak)}),'flame');
    card.querySelector('div').append(infoIcon(i18n.t('psyInfoStreak')));
    return card;
  }

  function overviewTab(){
    var trades=store.listSync(),closed=trades.filter(function(t){return t.status==='closed';}),wrap=el('div','psy-tab-view');
    var mirrorRows=psych.emotionalMirror(closed,3).filter(function(r){return !r.insufficient;}).sort(function(a,b){return b.winRate-a.winRate;});
    var best=mirrorRows[0],worst=mirrorRows[mirrorRows.length-1];
    var hero=el('section','tj-metrics');
    hero.append(streakCard(trades));
    hero.append(metricTile(i18n.t('totalTrades'),i18n.number(closed.length),'layers'));
    if(best)hero.append(metricTile(i18n.t(best.emotion),num(best.winRate)+'%','trending-up','positive'));
    if(worst&&(!best||worst.emotion!==best.emotion))hero.append(metricTile(i18n.t(worst.emotion),num(worst.winRate)+'%','trending-down','negative'));
    wrap.append(hero);
    var openMood=openTradeMoodCard();
    if(openMood)wrap.append(openMood);
    var charts=el('section','tj-charts');
    charts.append(emotionalMirrorCard(trades),disciplineCard(trades));
    var tagCard=tagMirrorCard(trades);
    if(tagCard)charts.append(tagCard);
    wrap.append(charts);
    return wrap;
  }

  function drawJourney(canvas,entries,tooltip){
    var ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,
        rgb=getComputedStyle(document.documentElement).getPropertyValue('--ps-accent-rgb').trim()||'45,212,191',
        muted='rgba(148,163,184,.25)',text='rgba(226,232,240,.72)';
    ctx.clearRect(0,0,w,h);ctx.font='12px sans-serif';ctx.fillStyle=text;
    if(!entries.length){ctx.textAlign='center';ctx.fillText(i18n.t('noData'),w/2,h/2);canvas.onmousemove=null;canvas.onmouseleave=null;return;}
    var top=18,bottom=h-40,plotH=bottom-top,step=(w-64)/Math.max(1,entries.length-1),barWidth=Math.min(46,step*.55);
    ctx.strokeStyle=muted;ctx.beginPath();ctx.moveTo(38,bottom);ctx.lineTo(w-18,bottom);ctx.stroke();
    var bars=entries.map(function(entry,i){
      var cx=entries.length>1?38+i*step:w/2,value=Number(entry.stressLevel||0),barH=plotH*(value/10),x=cx-barWidth/2,y=bottom-barH;
      ctx.fillStyle='rgba('+rgb+',.8)';ctx.fillRect(x,y,barWidth,barH);
      ctx.fillStyle=text;ctx.textAlign='center';ctx.fillText(i18n.t(entry.stage==='entry'?'entryStage':entry.stage==='exit'?'exitStage':'midTrade'),cx,h-14);
      return{x:x,y:y,w:barWidth,h:barH,cx:cx,entry:entry,value:value};
    });
    canvas.onmousemove=function(event){
      if(!tooltip)return;
      var rect=canvas.getBoundingClientRect(),scaleX=canvas.width/rect.width,scaleY=canvas.height/rect.height;
      var mx=(event.clientX-rect.left)*scaleX;
      var hit=bars.reduce(function(best,bar){var d=Math.abs(mx-bar.cx);return(!best||d<best.d)?{bar:bar,d:d}:best;},null);
      if(hit&&hit.d<=step/2){
        var entry=hit.bar.entry,stageLabel=i18n.t(entry.stage==='entry'?'entryStage':entry.stage==='exit'?'exitStage':'midTrade');
        var emotionsLabel=(entry.dominantEmotions||[]).map(function(x){return i18n.t(x);}).join(' · ')||'—';
        tooltip.textContent=stageLabel+' · '+i18n.t('stressLevel')+': '+hit.bar.value+' · '+emotionsLabel;
        tooltip.style.display='block';
        tooltip.style.left=((event.clientX-rect.left))+'px';
        tooltip.style.top=Math.max(0,(hit.bar.y/scaleY-8))+'px';
      }else tooltip.style.display='none';
    };
    canvas.onmouseleave=function(){if(tooltip)tooltip.style.display='none';};
  }

  function renderJourneyChart(trade){
    var card=el('article','tj-chart-card psy-journey-card'),head=el('div','tj-chart-head');
    head.append(el('h3','',i18n.t('psyJourneyChartTitle')));
    var canvasWrap=el('div','psy-canvas-wrap'),canvas=document.createElement('canvas');canvas.width=720;canvas.height=260;
    var tooltip=el('div','psy-chart-tooltip');tooltip.style.display='none';
    canvasWrap.append(canvas,tooltip);
    card.append(head,canvasWrap);
    setTimeout(function(){drawJourney(canvas,trade.emotionLog||[],tooltip);},0);
    return card;
  }

  function journeysTab(){
    var trades=store.listSync().filter(function(t){return (t.emotionLog||[]).length>1;}),wrap=el('div','psy-tab-view');
    var heading=el('h3','',i18n.t('psyJourneysTitle'));heading.append(infoIcon(i18n.t('psyInfoJourneys')));
    wrap.append(heading,el('p','',i18n.t('psyJourneysSubtitle')));
    if(!trades.length){wrap.append(el('div','psy-empty',i18n.t('psyJourneysEmpty')));return wrap;}
    var list=el('div','psy-journey-list');
    trades.forEach(function(trade){
      var row=button('','psy-journey-row');
      row.append(el('span','',i18n.date(trade.createdAt)),el('b','',i18n.t(trade.direction)),el('small','',i18n.t('tradesCount',{count:i18n.number(trade.emotionLog.length)})));
      row.onclick=function(){var m=modal('psy-journey-modal',i18n.t('psyJourneyChartTitle'));m.box.append(renderJourneyChart(trade));icons(m.back);};
      list.append(row);
    });
    wrap.append(list);
    return wrap;
  }

  function buildTriggerCards(result){
    var triggers=result&&Array.isArray(result.triggers)?result.triggers:null;
    if(triggers&&triggers.length)return triggers.map(function(t){return{title:t.condition,body:t.observation};});
    var correlations=result&&Array.isArray(result.correlations)?result.correlations:[];
    if(correlations.length)return correlations.map(function(c){return{title:c.factor+' → '+c.outcome,body:c.observation};});
    return[];
  }

  function renderInsightResult(container,result){
    container.replaceChildren();
    container.append(el('article','psy-summary-card',result.summary||''));
    (result.insights||[]).forEach(function(x){var card=el('article','tj-psych-insight');card.append(el('strong','',x.title),el('p','',x.evidence),el('p','',x.recommendation));container.append(card);});
    var section=el('section','psy-triggers');
    section.append(el('h4','',i18n.t('psyTriggersTitle')));
    var cards=buildTriggerCards(result);
    if(!cards.length)section.append(el('p','psy-empty',i18n.t('psyNoTrigger')));
    else cards.forEach(function(c){var card=el('article','psy-trigger-card');card.append(el('strong','',c.title),el('p','',c.body));section.append(card);});
    container.append(section);
  }

  function insightsTab(){
    var wrap=el('div','psy-tab-view'),rangeState={range:state.range,from:state.from,to:state.to};
    var filters=el('section','tj-report-filters'),chips=el('div','tj-filter-chips');
    [['week','week'],['month','month'],['quarter','quarter'],['all','allTime'],['custom','custom']].forEach(function(x){
      var b=button(i18n.t(x[1]),state.range===x[0]?'active':'');
      b.onclick=function(){state.range=x[0];renderPage();};
      chips.append(b);
    });
    filters.append(chips);
    if(state.range==='custom'){
      ['from','to'].forEach(function(k){
        var label=el('label');label.append(el('span','',i18n.t(k)));
        var input=document.createElement('input');input.type='date';input.value=state[k];
        input.onchange=function(){state[k]=input.value;renderPage();};
        label.append(input);filters.append(label);
      });
    }
    wrap.append(filters);

    var narrative=el('section','psy-narrative-card'),run=button(i18n.t('psyRunWeeklyAnalysis'),'tj-primary','brain-circuit'),resultArea=el('div','psy-insight-results');
    run.onclick=async function(){
      var dates=reports.rangeDates(rangeState),
          from=dates.from?new Date(dates.from).getTime():-Infinity,
          to=dates.to?new Date(dates.to).getTime()+86400000:Infinity,
          payload=store.psychologyDataset().filter(function(t){return t.emotionLog.length;}).filter(function(t){
            var time=new Date(t.closedAt||t.updatedAt).getTime();
            return time>=from&&time<=to;
          });
      if(!payload.length){resultArea.replaceChildren(el('p','',i18n.t('analysisUnavailable')));return;}
      run.disabled=true;
      var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},20000);
      try{
        var response=await fetch('/api/trades/psychology-analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:i18n.language(),trades:payload}),signal:controller.signal}),
            result=await response.json();
        if(!response.ok)throw new Error(result.error);
        renderInsightResult(resultArea,result);
      }catch(_){
        resultArea.replaceChildren(el('p','',i18n.t('analysisUnavailable')));
      }finally{
        clearTimeout(timer);run.disabled=false;
      }
    };
    var narrativeHeading=el('h3','',i18n.t('psyWeeklyNarrativeTitle'));narrativeHeading.append(infoIcon(i18n.t('psyInfoInsights')));
    narrative.append(narrativeHeading,run,resultArea);
    wrap.append(narrative);
    return wrap;
  }

  function numericField(label,value,onchange){
    var wrap=el('label','tj-field'),span=el('span','',label),input=document.createElement('input');
    input.type='number';input.step='1';input.value=value;
    input.onchange=function(){onchange(Number(input.value));};
    wrap.append(span,input);
    return wrap;
  }
  function toggleField(label,checked,onchange){
    var wrap=el('label','psy-toggle-field'),span=el('span','',label),input=document.createElement('input');
    input.type='checkbox';input.checked=checked;
    input.onchange=function(){onchange(input.checked);};
    wrap.append(span,input,el('span','psy-toggle-switch'));
    return wrap;
  }

  function settingsTab(){
    var current=psych.settings(),wrap=el('div','psy-tab-view');
    wrap.append(el('h3','',i18n.t('psySettingsTitle')));
    var breathing=Object.assign({},current.breathing),postTradeReflection=Object.assign({},current.postTradeReflection);

    var breathingHeading=el('h4','',i18n.t('psyBreathingTitle'));breathingHeading.append(infoIcon(i18n.t('psyInfoBreathing')));
    var breathingCard=el('section','panel-settings-card');
    breathingCard.append(breathingHeading,toggleField(i18n.t('psyBreathingToggle'),breathing.enabled,function(v){breathing.enabled=v;}),numericField(i18n.t('psyStressThreshold'),breathing.stressThreshold,function(v){breathing.stressThreshold=v;}));

    // Reconciled: the earlier standalone revenge-trade warning and cool-down timer are now one toggle,
    // since both are steps inside the single unified post-trade reflection popup (Section 7).
    var reflectionHeading=el('h4','',i18n.t('psyPostTradeReflectionTitle'));reflectionHeading.append(infoIcon(i18n.t('psyInfoPostTradeReflection')));
    var reflectionCard=el('section','panel-settings-card');
    reflectionCard.append(reflectionHeading,toggleField(i18n.t('psyPostTradeReflectionToggle'),postTradeReflection.enabled,function(v){postTradeReflection.enabled=v;}),numericField(i18n.t('psyCooldownMinutes'),postTradeReflection.cooldownMinutes,function(v){postTradeReflection.cooldownMinutes=v;}));

    var save=button(i18n.t('psySaveProtective'),'tj-primary','save');
    save.onclick=function(){psych.saveSettings({breathing:breathing,postTradeReflection:postTradeReflection});toast(i18n.t('psyProtectiveSaved'),'success');};

    wrap.append(breathingCard,reflectionCard,save);
    return wrap;
  }

  function tabsNav(){
    var nav=el('nav','psy-tabs'),mhI18n=window.TradeJournalMentalHealthI18n;
    var items=[['overview','psyTabOverview','layout-dashboard'],['journeys','psyTabJourneys','route'],['insights','psyTabInsights','brain-circuit'],['settings','psyTabSettings','shield']];
    if(window.TradeJournalMentalHealthUI&&mhI18n)items=items.concat([['profile',null,'user-round','mhProfileTab'],['growth',null,'sprout','mhGrowthTab']]);
    items.forEach(function(item){
      var label=item[1]?i18n.t(item[1]):mhI18n.t(item[3]);
      var b=button(label,state.tab===item[0]?'active':'',item[2]);
      b.onclick=function(){state.tab=item[0];renderPage();};
      nav.append(b);
    });
    return nav;
  }

  function pageHeader(){
    var head=el('header','pr-page-header'),left=el('div','pr-title'),mark=el('span','pr-title-icon'),copy=el('div');
    mark.append(ico('brain-circuit'));
    copy.append(el('h2','',i18n.t('psyNavTitle')),el('p','',i18n.t('psyNavSubtitle')));
    left.append(mark,copy);
    head.append(left);
    return head;
  }

  function renderPage(){
    var page=el('section','panel-page psy-page');
    page.dir=i18n.direction();
    page.append(pageHeader(),tabsNav());
    var mhUi=window.TradeJournalMentalHealthUI;
    page.append(state.tab==='overview'?overviewTab():state.tab==='journeys'?journeysTab():state.tab==='insights'?insightsTab():state.tab==='profile'&&mhUi?mhUi.renderProfileTab(renderPage):state.tab==='growth'&&mhUi?mhUi.renderGrowthTab(renderPage):settingsTab());
    layer.show(page,'psychology');
    history.replaceState(null,'','#mindset');
    document.querySelectorAll('.sidebar nav a').forEach(function(a){a.classList.toggle('active',a.getAttribute('href')==='#mindset');});
    icons(page);
  }

  function openPage(event){if(event)event.preventDefault();renderPage();}

  function wireNav(){
    document.querySelectorAll('.sidebar nav a[href="#mindset"]').forEach(function(link){
      if(link.dataset.psychologyWired)return;
      link.dataset.psychologyWired='1';
      link.addEventListener('click',openPage);
    });
  }
  new MutationObserver(wireNav).observe(document.body,{childList:true,subtree:true});
  wireNav();
  window.addEventListener('hashchange',function(){if(location.hash==='#mindset')renderPage();});
  window.addEventListener('tradejournal:trades-changed',function(){if(document.querySelector('.psy-page'))renderPage();});
  setTimeout(function(){if(location.hash==='#mindset')renderPage();},0);

  window.TradeJournalPsychology={open:openPage,render:renderPage,renderJourneyChart:renderJourneyChart,buildTriggerCards:buildTriggerCards};
}());
