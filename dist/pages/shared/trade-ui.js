(function(){
  'use strict';
  var store=window.TradeJournalTradeStore,calc=window.TradeJournalTradeCalculator,i18n=window.TradeJournalTradeI18n,types=window.TradeJournalTradeTypes;
  if(!store||!calc||!i18n)return;
  window.TradeJournalTrendAnalysisProvider=window.TradeJournalTrendAnalysisProvider||{analyze:async function(){return[];}};
  function el(tag,className,text){var node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function ico(name){var node=el('i','tj-icon');node.dataset.lucide=name;return node;}
  function button(label,className,iconName){var b=el('button',className||'',label);b.type='button';if(iconName)b.prepend(ico(iconName));return b;}
  function refreshIcons(root){if(window.TradeJournalIcons)window.TradeJournalIcons.schedule(root||document);else if(window.lucide)window.lucide.createIcons({attrs:{'stroke-width':1.8}});}
  function modal(className,title){var back=el('div','tj-modal-backdrop'),box=el('section','tj-modal '+(className||'')),head=el('header','tj-modal-head'),h=el('h2','',title),close=button('','tj-icon-button','x'),closed=false,nativeRemove=back.remove.bind(back);back.dir=i18n.direction();back.setAttribute('role','presentation');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');close.dataset.tjClose='';close.setAttribute('aria-label',i18n.t('close'));function destroy(event){if(event){event.preventDefault();event.stopPropagation();}if(closed)return;closed=true;document.removeEventListener('keydown',escape,true);nativeRemove();}function escape(event){if(event.key==='Escape')destroy(event);}back.remove=destroy;close.addEventListener('click',destroy,true);close.addEventListener('pointerup',function(event){if(event.pointerType==='touch')destroy(event);},true);back.addEventListener('click',function(event){if(event.target===back)destroy(event);});box.addEventListener('click',function(event){event.stopPropagation();});document.addEventListener('keydown',escape,true);head.append(h,close);box.append(head);back.append(box);document.body.append(back);window.setTimeout(function(){try{close.focus({preventScroll:true});}catch(_){close.focus();}},0);refreshIcons(back);return{back:back,box:box,close:close,destroy:destroy};}
  function toast(message,tone){var node=el('div','tj-toast '+(tone||''),message);document.body.append(node);setTimeout(function(){node.remove();},2600);}
  function num(value){return i18n.number(value,{maximumFractionDigits:4});}
  function numeric(label,key,value,unit){var wrap=el('label','tj-field'),span=el('span','',label),control=el('div','tj-input-unit'),input=document.createElement('input');input.type='number';input.step='any';input.dataset.key=key;input.value=value==null?'':value;control.append(input,el('small','',unit||''));wrap.append(span,control);return{wrap:wrap,input:input};}
  function selectField(label,key,items,value){var wrap=el('label','tj-field'),input=document.createElement('select');input.dataset.key=key;items.forEach(function(item){input.append(new Option(item[1],item[0],false,item[0]===value));});wrap.append(el('span','',label),input);return{wrap:wrap,input:input};}
  function fieldValue(root,key){var input=root.querySelector('[data-key="'+key+'"]');return input?input.value:'';}
  function sessionName(value){return{tokyo:'Tokyo',london:'London',newyork:'New York',sydney:'Sydney'}[value]||value;}
  function statusLabel(value){return i18n.t({open:'openStatus',closed:'closedStatus',hunting:'huntingStatus',cancelled:'cancelled'}[value]||value);}
  function outcomeLabel(value){return value?i18n.t({win:'win',loss:'loss',breakeven:'breakevenOutcome'}[value]):'—';}
  function applyCalculatedToTrade(trade,result,input){
    ['entryPrice','stopLoss','slDistancePercent','riskPercent','riskAmount','leverage','positionSize','marginRequired','liquidationPrice','rr','breakevenPercent'].forEach(function(k){trade[k]=result[k];});
    trade.direction=result.direction;trade.marginMode=result.marginMode;trade.takeProfits=result.takeProfits;trade.commission={feeType:input.feeType,feePercent:result.feePercent,totalCommission:result.totalCommission||0};return trade;
  }
  function solveTrade(trade){var settings=store.settings(),source={direction:trade.direction,marginMode:trade.marginMode,entryPrice:trade.entryPrice,stopLoss:trade.stopLoss,slDistancePercent:trade.slDistancePercent,riskPercent:trade.riskPercent,riskAmount:trade.riskAmount,leverage:trade.leverage,positionSize:trade.positionSize,marginRequired:trade.marginRequired,accountBalance:settings.accountBalance,takeProfits:trade.takeProfits,feeType:trade.commission.feeType,feePercent:trade.commission.feePercent},manual=new Set();['entryPrice','stopLoss','riskPercent','riskAmount','leverage','positionSize','marginRequired'].forEach(function(k){if(source[k]!==null&&source[k]!==undefined)manual.add(k);});return applyCalculatedToTrade(trade,calc.solve(source,manual,{feePercent:source.feePercent}),source);}
  function urlData(url){if(!url)return Promise.resolve('');if(url.indexOf('data:')===0)return Promise.resolve(url);return fetch(url).then(function(response){return response.blob();}).then(function(blob){return new Promise(function(resolve){var reader=new FileReader();reader.onload=function(){resolve(String(reader.result||''));};reader.readAsDataURL(blob);});});}
  async function initialAnalysis(trade){if(!trade.screenshots.length)return trade;var images=[];for(var item of trade.screenshots.slice(0,4)){var url=await store.screenshotUrl(item);if(url)images.push(await urlData(url));}var context={direction:trade.direction,entryPrice:trade.entryPrice,stopLoss:trade.stopLoss,takeProfits:trade.takeProfits,riskPercent:trade.riskPercent,rr:trade.rr,primaryTimeframe:trade.primaryTimeframe,timeframeTrends:trade.timeframeTrends,conceptTags:trade.conceptTags,linkedPatternIds:trade.linkedPatternIds,linkedStrategyId:trade.linkedStrategyId,chartNote:trade.chartNote};var response=await fetch('/api/trades/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:i18n.language(),trade:context,images:images})});if(!response.ok)return trade;var result=await response.json();trade.aiInitialAnalysis=result;return store.save(trade);}
  function openCalculator(seed){
    var settings=store.settings(),m=modal('tj-calculator',i18n.t('tradeCalculator')),body=el('div','tj-calculator-body'),manual=new Set(),source=Object.assign({direction:'long',marginMode:'isolated',entryPrice:null,stopLoss:null,slDistancePercent:null,riskPercent:settings.defaultRiskPercent,riskAmount:null,leverage:null,positionSize:null,accountBalance:settings.accountBalance,feeType:settings.defaultFeeType,feePercent:settings.defaultFeeType==='maker'?settings.makerFeePercent:settings.takerFeePercent,takeProfits:[{price:null,portionPercent:100}],linkedStrategyId:null},seed||{});
    Object.keys(seed||{}).forEach(function(k){if(source[k]!==null&&k!=='takeProfits')manual.add(k);});
    if(source.riskPercent!==null&&source.riskPercent!==undefined)manual.add('riskPercent');
    if(source.accountBalance!==null&&source.accountBalance!==undefined)manual.add('accountBalance');
    var top=el('div','tj-calc-grid'),direction=selectField(i18n.t('direction'),'direction',[['long',i18n.t('long')],['short',i18n.t('short')]],source.direction),marginMode=selectField(i18n.t('marginMode'),'marginMode',[['isolated',i18n.t('isolated')],['cross',i18n.t('cross')]],source.marginMode);
    top.append(direction.wrap,marginMode.wrap);var strategyStore=window.TradeJournalStrategyEducationStore,activeStrategies=strategyStore?strategyStore.listActive():[],strategySelect=selectField(i18n.t('strategy'),'linkedStrategyId',[['',i18n.t('noStrategy')]].concat(activeStrategies.map(function(item){return[item.id,item.name];})),source.linkedStrategyId||'');body.append(strategySelect.wrap);strategySelect.input.onchange=function(){source.linkedStrategyId=strategySelect.input.value||null;if(source.linkedStrategyId){var defaults=strategyStore.getRiskDefaults(source.linkedStrategyId);if(defaults.maxRiskPerTradePercent!==null){source.riskPercent=defaults.maxRiskPerTradePercent;manual.add('riskPercent');var riskInput=top.querySelector('[data-key="riskPercent"]');if(riskInput)riskInput.value=source.riskPercent;}toast(i18n.t('strategyRiskLoaded'),'success');}update();};var defs=[['entryPrice','entryPrice','USD'],['stopLoss','stopLoss','USD'],['slDistance','slDistancePercent','%'],['riskPercent','riskPercent','%'],['riskAmount','riskAmount','USD'],['leverage','leverage','×'],['positionSize','positionSize','USD'],['accountBalance','accountBalance','USD']];
    defs.forEach(function(d){top.append(numeric(i18n.t(d[0]),d[1],source[d[1]],d[2]).wrap);});body.append(top);
    var tpBlock=el('section','tj-tp-block'),tpHead=el('div','tj-section-head');tpHead.append(el('strong','',i18n.t('takeProfit')),button(i18n.t('addTakeProfit'),'tj-secondary','plus'));tpBlock.append(tpHead,el('div','tj-tp-list'));body.append(tpBlock);
    function drawTps(){var list=tpBlock.querySelector('.tj-tp-list');list.replaceChildren();source.takeProfits.forEach(function(tp,index){var row=el('div','tj-tp-row'),price=numeric(i18n.t('takeProfit')+' '+(index+1),'tp-'+index,tp.price,'USD'),portion=numeric(i18n.t('portion'),'portion-'+index,tp.portionPercent,'%'),remove=button('','tj-icon-button','trash-2');price.input.oninput=function(){tp.price=Number(price.input.value)||null;update();};portion.input.oninput=function(){tp.portionPercent=Number(portion.input.value)||0;update();};remove.onclick=function(){source.takeProfits.splice(index,1);drawTps();update();};row.append(price.wrap,portion.wrap,remove);list.append(row);});refreshIcons(list);}
    tpHead.querySelector('button').onclick=function(){source.takeProfits.push({price:null,portionPercent:0});var equal=100/source.takeProfits.length;source.takeProfits.forEach(function(item){item.portionPercent=equal;});drawTps();update();};drawTps();
    var commission=el('section','tj-commission'),chead=el('h3');chead.append(ico('zap'),document.createTextNode(i18n.t('commission')));var cgrid=el('div','tj-calc-grid'),feeType=selectField(i18n.t('feeType'),'feeType',[['taker',i18n.t('taker')],['maker',i18n.t('maker')]],source.feeType),fee=numeric(i18n.t('feePercent'),'feePercent',source.feePercent,'%');cgrid.append(feeType.wrap,fee.wrap);commission.append(chead,cgrid);body.append(commission);
    var resultSection=el('section','tj-results'),rtitle=el('h3','',i18n.t('calculatedResults')),rgrid=el('div','tj-result-grid');resultSection.append(rtitle,rgrid);body.append(resultSection);var actions=el('footer','tj-modal-actions'),log=button(i18n.t('registerTrade'),'tj-primary','notebook-pen'),close=button(i18n.t('close'),'tj-secondary','x');close.onclick=function(){m.back.remove();};actions.append(close,log);m.box.append(body,actions);
    var result=null;
    function readInputs(event){Array.from(top.querySelectorAll('input,select')).forEach(function(input){var key=input.dataset.key;if(!key)return;if(event&&input===event.target)manual.add(key);source[key]=input.tagName==='SELECT'?input.value:(input.value===''?null:Number(input.value));});source.direction=direction.input.value;source.marginMode=marginMode.input.value;source.feeType=feeType.input.value;source.feePercent=fee.input.value===''?0:Number(fee.input.value);if(event&&fee.input===event.target)manual.add('feePercent');}
    function update(event){readInputs(event);result=calc.solve(source,manual,{feePercent:source.feePercent});Object.keys(result).forEach(function(key){var input=top.querySelector('[data-key="'+key+'"]');if(!input||document.activeElement===input)return;if(result[key]!==null&&result[key]!==undefined){input.value=result[key];input.classList.toggle('computed',!manual.has(key));source[key]=result[key];}else if(!manual.has(key)){input.value='';input.classList.add('computed');}});var cards=[['positionSize',i18n.t('positionSize'),'USD'],['riskAmount',i18n.t('riskAmount'),'USD'],['potentialProfit',i18n.t('potentialProfit'),'USD'],['potentialProfitPercent',i18n.t('potentialProfit')+' %','%'],['leverage',i18n.t('leverage'),'×'],['marginRequired',i18n.t('marginRequired'),'USD'],['liquidationPrice',i18n.t('liquidation'),'USD'],['slDistancePercent',i18n.t('slDistance'),'%'],['breakevenPercent',i18n.t('breakeven'),'%'],['totalCommission',i18n.t('totalCommission'),'USD']];rgrid.replaceChildren();cards.forEach(function(c){var card=el('article','tj-result-card '+c[0]);card.append(el('small','',c[1]),el('strong','',result[c[0]]===null||result[c[0]]===undefined?'—':num(result[c[0]])+(c[2]==='$'?'':c[2]==='USD'?' USD':' '+c[2])));rgrid.append(card);});var profit=el('article','tj-profit-result');profit.append(el('small','',i18n.t('inProfitWhen')),el('strong','',result.profitPrice===null?'—':num(result.profitPrice)+' USD'));resultSection.querySelector('.tj-profit-result')?.remove();resultSection.append(profit);}
    top.oninput=update;direction.input.onchange=update;marginMode.input.onchange=update;feeType.input.onchange=function(){source.feeType=feeType.input.value;fee.input.value=source.feeType==='maker'?settings.makerFeePercent:settings.takerFeePercent;source.feePercent=Number(fee.input.value);update();};fee.input.oninput=update;log.onclick=function(){var trade=applyCalculatedToTrade(store.createDraft({status:'hunting',linkedStrategyId:source.linkedStrategyId}),result,source);trade.linkedStrategyId=source.linkedStrategyId||null;m.back.remove();openWizard(trade);};update();refreshIcons(m.back);return m.back;
  }
  var tagPresets={
    excited:['tagOpportunity','tagBreakout','tagConfidenceHigh'],
    anxious:['tagVolatility','tagNews','tagEntryFear'],
    calm:['tagOnPlan','tagRelaxed','tagPatient'],
    revenge:['tagWantRecover','tagAngryLoss','tagMustWin'],
    angry:['tagAngryMarket','tagAngrySelf','tagFrustrated'],
    afraid:['tagFearLoss','tagFearLiquidation','tagFearMissing'],
    confident:['tagTrustAnalysis','tagStrongSetup','tagFollowedRules'],
    fatigued:['tagTired','tagLossFocus','tagOvertraded'],
    restless:['tagImpatient','tagBored','tagCantWait'],
    overconfident:['tagSureThing','tagIgnoredRisk','tagWinStreak']
  };
  function severityLabel(value){
    if(value<=2)return i18n.t('severityVeryWeak');
    if(value<=4)return i18n.t('severityWeak');
    if(value<=6)return i18n.t('severityModerate');
    if(value<=8)return i18n.t('severityStrong');
    return i18n.t('severityDominant');
  }
  function emotionEditor(value){
    var state=Object.assign({dominantEmotions:[],emotionDetails:[],stressLevel:5,focusQuality:5,planCommitment:5,wouldTakeIfNotForced:null,note:''},value||{});
    state.emotionDetails=(state.emotionDetails||[]).slice();
    var wrap=el('div','tj-emotion-editor'),grid=el('div','tj-emotion-grid'),emoji={excited:'⚡',anxious:'◉',calm:'☘',revenge:'↻',angry:'◆',afraid:'!',confident:'✓',fatigued:'◷',restless:'≈',overconfident:'▲'};
    var detailsWrap=el('div','tj-emotion-details');
    function detailFor(name){return state.emotionDetails.find(function(d){return d.emotion===name;});}
    function renderDetailCard(name){
      var entry=detailFor(name);
      if(!entry){entry={emotion:name,intensity:5,tags:[]};state.emotionDetails.push(entry);}
      if(!Array.isArray(entry.tags))entry.tags=entry.tag?[entry.tag]:[];
      var card=el('div','tj-emotion-detail-card');
      card.append(el('strong','',emoji[name]+' '+i18n.t(name)));
      var head=el('span');head.append(document.createTextNode(i18n.t('emotionIntensityLabel')),el('b','',String(entry.intensity)));
      var slider=document.createElement('input');slider.type='range';slider.min=1;slider.max=10;slider.value=entry.intensity;
      var severity=el('small','tj-severity',severityLabel(entry.intensity));
      slider.oninput=function(){entry.intensity=Number(slider.value);head.querySelector('b').textContent=slider.value;severity.textContent=severityLabel(entry.intensity);};
      var sliderLabel=el('label','tj-range');sliderLabel.append(head,slider,severity);
      var presetRow=el('div','tj-tag-row');
      function syncPresetSelected(){presetRow.querySelectorAll('button').forEach(function(b){b.classList.toggle('selected',entry.tags.indexOf(b.dataset.tagText)>-1);});}
      var chosenWrap=el('div','tj-chosen-tags');
      function renderChosenTags(){
        chosenWrap.replaceChildren();
        entry.tags.forEach(function(tagText){
          var chip=el('span','tj-chip tj-chosen-chip');chip.append(document.createTextNode(tagText));
          var remove=button('','tj-icon-button','x');
          remove.onclick=function(){var i=entry.tags.indexOf(tagText);if(i>-1)entry.tags.splice(i,1);syncPresetSelected();renderChosenTags();};
          chip.append(remove);chosenWrap.append(chip);
        });
      }
      (tagPresets[name]||[]).forEach(function(key){
        var text=i18n.t(key),chip=button(text,'');
        chip.dataset.tagText=text;
        chip.onclick=function(){var i=entry.tags.indexOf(text);if(i>-1)entry.tags.splice(i,1);else entry.tags.push(text);syncPresetSelected();renderChosenTags();};
        presetRow.append(chip);
      });
      syncPresetSelected();renderChosenTags();
      var custom=document.createElement('input');custom.type='text';custom.dir='auto';custom.placeholder=i18n.t('emotionTagCustomPlaceholder');
      function addCustomTag(){var value=custom.value.trim();if(!value)return;if(entry.tags.indexOf(value)===-1)entry.tags.push(value);custom.value='';syncPresetSelected();renderChosenTags();}
      custom.onkeydown=function(event){if(event.key==='Enter'){event.preventDefault();addCustomTag();}};
      var addBtn=button('','tj-icon-button','plus');addBtn.onclick=addCustomTag;
      var customRow=el('div','tj-tag-custom-row');customRow.append(custom,addBtn);
      card.append(sliderLabel,el('small','',i18n.t('emotionTagLabel')),presetRow,chosenWrap,customRow);
      detailsWrap.append(card);
    }
    function renderDetails(){detailsWrap.replaceChildren();state.dominantEmotions.forEach(renderDetailCard);}
    (types.emotions||[]).forEach(function(name){var b=button(emoji[name]+' '+i18n.t(name),state.dominantEmotions.indexOf(name)>-1?'selected':'');b.onclick=function(){var index=state.dominantEmotions.indexOf(name);if(index>-1){state.dominantEmotions.splice(index,1);state.emotionDetails=state.emotionDetails.filter(function(d){return d.emotion!==name;});}else if(state.dominantEmotions.length<3){state.dominantEmotions.push(name);}else{toast(i18n.t('maxThree'),'warning');return;}b.classList.toggle('selected');renderDetails();};grid.append(b);});
    wrap.append(el('h3','',i18n.t('dominantEmotion')),grid,detailsWrap);
    renderDetails();
    var label=el('label','tj-range'),head=el('span');head.append(document.createTextNode(i18n.t('stressLevel')),el('b','',String(state.stressLevel)));
    var input=document.createElement('input');input.type='range';input.min=1;input.max=10;input.value=state.stressLevel;
    var breathing=el('div','tj-breathing-card');breathing.hidden=true;
    var breathHead=el('div','tj-breathing-head');breathHead.append(el('strong','',i18n.t('psyBreathingTitle')));
    var breathClose=button('','tj-icon-button','x'),dismissed=false;breathClose.onclick=function(){dismissed=true;breathing.hidden=true;};
    breathHead.append(breathClose);breathing.append(breathHead,el('div','tj-breathing-circle'),el('p','',i18n.t('psyBreathingHint')));
    var syncBreathing=function(){var psych=window.TradeJournalPsychologyStore,rule=psych&&psych.settings().breathing;breathing.hidden=!(rule&&rule.enabled&&!dismissed&&Number(input.value)>=rule.stressThreshold);};
    input.addEventListener('input',syncBreathing);syncBreathing();
    input.oninput=function(){state.stressLevel=Number(input.value);head.querySelector('b').textContent=input.value;};
    label.append(head,input);wrap.append(label,breathing);
    var note=document.createElement('textarea');note.rows=3;note.dir='auto';note.placeholder=i18n.t('emotionNotePlaceholder');note.value=state.note;note.oninput=function(){state.note=note.value;};wrap.append(note);
    return{node:wrap,value:function(){return state;}};
  }
  function thoughtRecordBlock(trade,biasType){
    var mh=window.TradeJournalMentalHealthStore,mhi18n=window.TradeJournalMentalHealthI18n,mhSafety=window.TradeJournalMentalHealthSafety;
    var details=document.createElement('details');details.className='tj-thought-block';
    var summary=document.createElement('summary');summary.textContent=mhi18n.t('mhThoughtRecordTitle');details.append(summary);
    details.append(el('p','tj-hint',mhi18n.t('mhOptionalReflection')));
    var automatic=document.createElement('textarea');automatic.rows=2;automatic.dir='auto';automatic.placeholder=mhi18n.t('mhAutomaticThought');
    var forE=document.createElement('textarea');forE.rows=2;forE.dir='auto';forE.placeholder=mhi18n.t('mhEvidenceFor');
    var against=document.createElement('textarea');against.rows=2;against.dir='auto';against.placeholder=mhi18n.t('mhEvidenceAgainst');
    var balanced=document.createElement('textarea');balanced.rows=2;balanced.dir='auto';balanced.placeholder=mhi18n.t('mhBalancedThought');
    var safetyArea=el('div'),save=button(mhi18n.t('mhSaveThoughtRecord'),'tj-secondary','check');
    save.onclick=function(){
      var combined=[automatic.value,forE.value,against.value,balanced.value].join(' ');
      var proceed=function(){
        var record=mh.load();
        record.cognitiveProfile.draftThoughtRecord={automaticThought:automatic.value.trim(),emotion:'',evidenceFor:forE.value.trim(),evidenceAgainst:against.value.trim(),balancedThought:balanced.value.trim()};
        record=mh.save(record);
        mh.commitDraftThoughtRecord(record,trade.id,biasType);
        toast(mhi18n.t('mhThoughtRecordSaved'),'success');
        details.open=false;
      };
      if(mhSafety&&mhSafety.checkText(combined).flagged){safetyArea.replaceChildren(mhSafety.renderSafetyCard(function(){safetyArea.replaceChildren();}));return;}
      proceed();
    };
    details.append(automatic,forE,against,balanced,safetyArea,save);
    return details;
  }
  function openEmotion(tradeId,stage,seed){var trade=store.find(tradeId);if(!trade)return;var m=modal('tj-emotion-modal',i18n.t('emotionTitle')),editor=emotionEditor(Object.assign({stage:stage||'mid_trade'},seed||{})),intro=el('p','tj-modal-subtitle',i18n.t('emotionSubtitle')),actions=el('footer','tj-modal-actions'),cancel=button(i18n.t('cancel'),'tj-secondary'),save=button(i18n.t('logEmotion'),'tj-primary','check-circle');
    var registry=window.TradeJournalAIProcessRegistry;
    if(registry)registry.register('trade-emotion-log',{
      allowlist:(types.emotionLogPaths||[]).filter(function(p){return p==='note';}),
      isOpen:function(){return document.body.contains(m.back);},
      activeStep:function(){return stage||'mid_trade';},
      applyValue:function(path,value){if(path!=='note')return;var textarea=m.box.querySelector('textarea');if(!textarea)return;textarea.value=value;textarea.dispatchEvent(new Event('input',{bubbles:true}));}
    });
    save.onclick=function(){var value=editor.value();store.addEmotion(trade.id,Object.assign(value,{stage:stage||'mid_trade'}));var mhSafety=window.TradeJournalMentalHealthSafety;if(mhSafety&&mhSafety.checkText(value.note).flagged){m.box.append(mhSafety.renderSafetyCard());return;}toast(i18n.t('emotionSaved'),'success');m.back.remove();};actions.append(cancel,save);cancel.onclick=function(){m.back.remove();};m.box.append(intro,editor.node,actions);refreshIcons(m.back);}
  function priceEditor(trade){var grid=el('div','tj-calc-grid tj-wizard-prices'),direction=selectField(i18n.t('direction'),'direction',[['long',i18n.t('long')],['short',i18n.t('short')]],trade.direction),margin=selectField(i18n.t('marginMode'),'marginMode',[['isolated',i18n.t('isolated')],['cross',i18n.t('cross')]],trade.marginMode);direction.input.onchange=function(){trade.direction=direction.input.value;};margin.input.onchange=function(){trade.marginMode=margin.input.value;};grid.append(direction.wrap,margin.wrap);[['entryPrice','entryPrice','USD'],['stopLoss','stopLoss','USD'],['takeProfit','takeProfit','USD'],['riskPercent','riskPercent','%'],['riskAmount','riskAmount','USD'],['leverage','leverage','×'],['positionSize','positionSize','USD']].forEach(function(d){var current=d[1]==='takeProfit'?(trade.takeProfits[0]&&trade.takeProfits[0].price):trade[d[1]],f=numeric(i18n.t(d[0]),d[1],current,d[2]);f.input.oninput=function(){var value=f.input.value===''?null:Number(f.input.value);if(d[1]==='takeProfit')trade.takeProfits=value===null?[]:[{price:value,portionPercent:100}];else trade[d[1]]=value;};grid.append(f.wrap);});return grid;}
  function openWizard(seed,options){
    var existing=seed&&seed.id?store.find(seed.id):null,trade=existing?store.normalize(existing):store.createDraft(seed||{}),step=1,selectedStatus=trade.status,files=[],trendRequested=false,m=modal('tj-wizard',i18n.t('logTrade')),content=el('div','tj-wizard-content'),steps=el('nav','tj-wizard-steps'),actions=el('footer','tj-modal-actions');
    var registry=window.TradeJournalAIProcessRegistry;
    if(registry)registry.register('trade-wizard',{
      allowlist:(types.tradeWizardPaths||[]).slice(),
      isOpen:function(){return document.body.contains(m.back);},
      activeStep:function(){return step;},
      applyValue:function(path,value){
        if((types.tradeWizardPaths||[]).indexOf(path)===-1)return;
        if(path==='conceptTags'){if(trade.conceptTags.indexOf(value)===-1)trade.conceptTags.push(value);}
        else if(['entryPrice','stopLoss','riskPercent','riskAmount','leverage','positionSize'].indexOf(path)>-1)trade[path]=value===''||value==null?null:Number(value);
        else trade[path]=value;
        render();
      }
    });
    function stepNav(){steps.replaceChildren();[['stepStatus',1],['stepTimeframe',2],['stepSeen',3],['stepEmotions',4],['stepScreenshot',5]].forEach(function(item){var span=el('span',step===item[1]?'active':step>item[1]?'done':'',i18n.t(item[0]));span.prepend(el('b','',step>item[1]?'✓':String(item[1])));steps.append(span);});}
    function sessionBar(){var bar=el('div','tj-session-bar');bar.append(ico('clock-3'),el('span','',i18n.t('currentSession')+': '),el('b','',sessionName(trade.session)),el('small','',i18n.t('autoDetected')));var strategies=window.TradeJournalStrategyEducationStore,values=strategies?strategies.listActive():[],select=document.createElement('select');select.className='tj-strategy-select';select.setAttribute('aria-label',i18n.t('tradeStrategy'));select.append(new Option(i18n.t('noStrategy'),''));values.forEach(function(item){select.append(new Option(item.name,item.id,false,item.id===trade.linkedStrategyId));});select.value=trade.linkedStrategyId||'';select.onchange=function(){trade.linkedStrategyId=select.value||null;if(trade.linkedStrategyId){var defaults=strategies.getRiskDefaults(trade.linkedStrategyId);if(defaults.maxRiskPerTradePercent!==null)trade.riskPercent=defaults.maxRiskPerTradePercent;toast(i18n.t('strategyRiskLoaded'),'success');}render();};bar.append(select);return bar;}
    function quick(status){trade.status=status;trade.entryMode='quick';trade.disciplineImpact=-1;trade=store.save(solveTrade(trade));toast(i18n.t('saved'),'success');m.back.remove();if(options&&options.onSave)options.onSave(trade);}
    function finish(){trade.status=selectedStatus;trade.entryMode='full';trade=store.save(solveTrade(trade));var mh=window.TradeJournalMentalHealthStore;if(mh&&(preTradeContext.sleepQuality!==5||preTradeContext.significantPersonalEvent))mh.addPreTradeContext(mh.load(),trade.id,{sleepQuality:preTradeContext.sleepQuality,significantPersonalEvent:preTradeContext.significantPersonalEvent||null});var promise=files.length?store.addScreenshots(trade.id,files):Promise.resolve(trade);promise.then(function(value){return initialAnalysis(value).catch(function(){return value;});}).then(function(value){trade=value;toast(existing?i18n.t('updated'):i18n.t('saved'),'success');m.back.remove();if(options&&options.onSave)options.onSave(trade);}).catch(function(){toast(i18n.t('uploadError'),'danger');});}
    function statusView(){var view=el('div','tj-wizard-pane');view.append(sessionBar(),el('h3','',i18n.t('chooseStatus')));var choices=el('div','tj-status-choices');[['open','tradeOpened','target'],['hunting','hunting','crosshair']].forEach(function(c){var b=button(i18n.t(c[1]),selectedStatus===c[0]?'selected':'',c[2]);b.append(el('small','',i18n.t(c[0]==='open'?'openStatus':'waitingPrice')));b.onclick=function(){selectedStatus=c[0];render();};choices.append(b);});view.append(choices,priceEditor(trade));var summary=el('div','tj-risk-summary');summary.append(el('span','',i18n.t('riskPercent')+' '+num(trade.riskPercent)+'%'),el('span','',i18n.t('potentialProfit')+' '+(trade.rr&&trade.riskPercent?num(trade.rr*trade.riskPercent)+'%':'—')),el('span','','RR '+(trade.rr?'1:'+num(trade.rr):'—')));view.append(summary);var quicks=el('div','tj-quick-actions'),qOpen=button(i18n.t('quickOpen'),'tj-danger','zap'),qHunt=button(i18n.t('quickHunt'),'tj-warning','zap');qOpen.onclick=function(){quick('open');};qHunt.onclick=function(){quick('hunting');};quicks.append(qOpen,qHunt);view.append(quicks,el('small','tj-hint',i18n.t('quickPenalty')));return view;}
    function timeframeView(){var view=el('div','tj-wizard-pane');view.append(sessionBar(),el('h3','',i18n.t('primaryTimeframe')));var tfgrid=el('div','tj-tf-grid');(types.timeframes||[]).forEach(function(tf){var b=button(tf,trade.primaryTimeframe===tf?'selected':'');b.onclick=function(){trade.primaryTimeframe=tf;render();};tfgrid.append(b);});view.append(tfgrid,el('h3','',i18n.t('trendQuestion')));var rows=el('div','tj-trends');trade.timeframeTrends.forEach(function(item){var row=el('div','tj-trend-row');row.append(el('b','',item.timeframe));['bullish','bearish'].forEach(function(value){var b=button(i18n.t(value),item.direction===value?'selected':'');b.onclick=function(){item.direction=value;item.source='user';render();};row.append(b);});var strength=document.createElement('input');strength.type='range';strength.min=1;strength.max=5;strength.value=item.momentumStrength||3;strength.oninput=function(){item.momentumStrength=Number(strength.value);item.source='user';};row.append(strength);rows.append(row);});view.append(rows,el('small','tj-hint',i18n.t('trendManual')));if(!trendRequested){trendRequested=true;Promise.resolve(window.TradeJournalTrendAnalysisProvider.analyze(trade)).then(function(values){if(!Array.isArray(values)||!values.length)return;values.forEach(function(value){var target=trade.timeframeTrends.find(function(x){return x.timeframe===value.timeframe;});if(target&&target.direction===null){target.direction=value.direction;target.momentumStrength=value.momentumStrength;target.source='ai';}});if(step===2)render();}).catch(function(){});}return view;}
    function seenView(){var view=el('div','tj-wizard-pane');view.append(sessionBar(),el('h3','',i18n.t('whatDidYouSee')));var tags=el('div','tj-tag-grid');(types.concepts||[]).forEach(function(tag){var b=button(tag,trade.conceptTags.indexOf(tag)>-1?'selected':'');b.onclick=function(){var i=trade.conceptTags.indexOf(tag);if(i>-1)trade.conceptTags.splice(i,1);else trade.conceptTags.push(tag);render();};tags.append(b);});view.append(el('h4','',i18n.t('conceptTags')),tags);var patterns=el('div','tj-tag-grid');((window.TradeJournalPatternStore&&window.TradeJournalPatternStore.listForScenarios())||[]).forEach(function(pattern){var b=button(pattern.name,trade.linkedPatternIds.indexOf(pattern.id)>-1?'selected':'target');b.onclick=function(){var i=trade.linkedPatternIds.indexOf(pattern.id);if(i>-1)trade.linkedPatternIds.splice(i,1);else trade.linkedPatternIds.push(pattern.id);render();};patterns.append(b);});view.append(el('h4','',i18n.t('registeredPatterns')),patterns);var note=document.createElement('textarea');note.rows=4;note.dir='auto';note.placeholder=i18n.t('chartNotePlaceholder');note.value=trade.chartNote;note.oninput=function(){trade.chartNote=note.value;};view.append(note);return view;}
    var emotion=null;
    var preTradeContext={sleepQuality:5,significantPersonalEvent:''};
    function preTradeContextBlock(){
      var mhi18n=window.TradeJournalMentalHealthI18n;
      if(!mhi18n)return null;
      var wrap=el('div','tj-pretrade-context');
      var head=el('span');head.append(document.createTextNode(mhi18n.t('mhSleepQuality')),el('b','',String(preTradeContext.sleepQuality)));
      var slider=document.createElement('input');slider.type='range';slider.min=1;slider.max=10;slider.value=preTradeContext.sleepQuality;
      slider.oninput=function(){preTradeContext.sleepQuality=Number(slider.value);head.querySelector('b').textContent=slider.value;};
      var sliderLabel=el('label','tj-range');sliderLabel.append(head,slider);
      var note=document.createElement('input');note.type='text';note.dir='auto';note.placeholder=mhi18n.t('mhSignificantEventPlaceholder');note.value=preTradeContext.significantPersonalEvent;
      note.oninput=function(){preTradeContext.significantPersonalEvent=note.value;};
      wrap.append(el('small','',mhi18n.t('mhPreTradeContextLabel')),sliderLabel,note);
      return wrap;
    }
    function emotionView(){var view=el('div','tj-wizard-pane');view.append(sessionBar());emotion=emotionEditor(trade.emotionLog.length?trade.emotionLog[trade.emotionLog.length-1]:null);view.append(emotion.node);var contextBlock=preTradeContextBlock();if(contextBlock)view.append(contextBlock);var mh=window.TradeJournalMentalHealthStore;if(mh&&window.TradeJournalMentalHealthI18n){var profile=mh.load(),cognitiveBias=(profile.cognitiveProfile.identifiedBiases||[]).find(function(b){return b.cyclePhase==='cognitive';});if(cognitiveBias)view.append(thoughtRecordBlock(trade,cognitiveBias.type));}return view;}
    function screenshotView(){var view=el('div','tj-wizard-pane');view.append(sessionBar());if(trade.screenshots.length){var existingList=el('div','tj-existing-files');trade.screenshots.forEach(function(item){var row=el('div');row.append(ico('image'),el('span','',item.fileName||i18n.t('tradeScreenshot')));var remove=button('','tj-icon-button','x');remove.onclick=function(){trade.screenshots=trade.screenshots.filter(function(x){return x.id!==item.id;});render();};row.append(remove);existingList.append(row);});view.append(existingList);}var upload=el('label','tj-upload');upload.append(ico('image-up'),el('strong','',i18n.t('tradeScreenshot')),el('small','',i18n.t('uploadScreenshot')));var input=document.createElement('input');input.type='file';input.accept='image/*';input.multiple=true;input.hidden=true;input.onchange=function(){files=Array.from(input.files||[]);upload.classList.toggle('has-files',files.length>0);upload.querySelector('small').textContent=files.length?files.map(function(x){return x.name;}).join(', '):i18n.t('uploadScreenshot');};upload.append(input);view.append(upload);return view;}
    function render(){content.replaceChildren(step===1?statusView():step===2?timeframeView():step===3?seenView():step===4?emotionView():screenshotView());stepNav();actions.replaceChildren();var cancel=button(i18n.t(step===1?'cancel':'previous'),'tj-secondary',step===1?'x':'arrow-left');cancel.onclick=function(){if(step===1)m.back.remove();else{step-=1;render();}};var next=button(i18n.t(step===5?'registerWithAnalysis':'next'),'tj-primary',step===5?'check-circle':'arrow-right');function proceed(){if(step<5){step+=1;render();}else finish();}next.onclick=function(){if(step===4&&emotion){var value=emotion.value(),has=value.dominantEmotions.length||value.note;if(has){if(existing&&trade.emotionLog.length){var last=trade.emotionLog.length-1;trade.emotionLog[last]=Object.assign({},trade.emotionLog[last],value);}else if(!trade.emotionLog.length)trade.emotionLog.push(Object.assign({id:store.uid('emotion'),timestamp:store.now(),stage:'entry'},value));var mhSafety=window.TradeJournalMentalHealthSafety;if(mhSafety&&mhSafety.checkText(value.note).flagged)m.box.append(mhSafety.renderSafetyCard());}}proceed();};actions.append(cancel,next);refreshIcons(m.back);}
    m.box.append(steps,content,actions);render();return m.back;
  }
  function closeTrade(id,callback){var trade=store.find(id);if(!trade)return;var m=modal('tj-small-modal',i18n.t('closeTradeTitle')),f=numeric(i18n.t('exitPrice'),'exitPrice',trade.exitPrice,'USD'),actions=el('footer','tj-modal-actions'),cancel=button(i18n.t('cancel'),'tj-secondary'),save=button(i18n.t('closeAndCalculate'),'tj-primary','calculator');cancel.onclick=function(){m.back.remove();};save.onclick=function(){var exit=Number(f.input.value);if(!exit){toast(i18n.t('invalidExit'),'danger');return;}var quantity=trade.positionSize&&trade.entryPrice?trade.positionSize/trade.entryPrice:null,gross=quantity?(exit-trade.entryPrice)*quantity*(trade.direction==='long'?1:-1):null,pnl=gross===null?null:gross-(trade.commission.totalCommission||0),base=trade.marginRequired||trade.positionSize;trade.exitPrice=exit;trade.pnl=pnl;trade.pnlPercent=pnl!==null&&base?pnl/base*100:null;trade.outcome=pnl===null?null:Math.abs(pnl)<.000001?'breakeven':pnl>0?'win':'loss';trade.status='closed';trade.closedAt=store.now();trade=store.save(trade);m.back.remove();if(window.TradeJournalMentalHealthContinuous)window.TradeJournalMentalHealthContinuous.onTradeClosed(trade);if(callback)callback(trade);};actions.append(cancel,save);m.box.append(f.wrap,actions);refreshIcons(m.back);}
  function details(id){var trade=store.find(id);if(!trade)return;var m=modal('tj-trade-details',i18n.t('tradeDetails')),body=el('div','tj-details-body'),patterns=((window.TradeJournalPatternStore&&window.TradeJournalPatternStore.listSync())||[]).filter(function(p){return trade.linkedPatternIds.indexOf(p.id)>-1;}).map(function(p){return p.name;});var stats=el('div','tj-detail-stats');[['status',statusLabel(trade.status)],['direction',i18n.t(trade.direction)],['entryPrice',num(trade.entryPrice)],['stopLoss',num(trade.stopLoss)],['rr',trade.rr?'1:'+num(trade.rr):'—'],['pnl',i18n.money(trade.pnl)]].forEach(function(x){var card=el('article');card.append(el('small','',i18n.t(x[0])),el('strong','',x[1]));stats.append(card);});body.append(stats);var context=el('section','tj-detail-section');context.append(el('h3','',i18n.t('context')),el('p','',patterns.join(', ')||'—'),el('p','',trade.conceptTags.join(', ')||'—'),el('p','',trade.chartNote||'—'));body.append(context);var history=el('section','tj-detail-section');history.append(el('h3','',i18n.t('emotionHistory')));if(!trade.emotionLog.length)history.append(el('p','',i18n.t('noEmotionLogs')));trade.emotionLog.forEach(function(item){var row=el('article','tj-emotion-log');row.append(el('time','',i18n.date(item.timestamp,{dateStyle:'medium',timeStyle:'short'})),el('strong','',item.dominantEmotions.map(function(x){return i18n.t(x);}).join(' · ')||'—'),el('span','',i18n.t('stressLevel')+': '+item.stressLevel));if((item.emotionDetails||[]).length){var tagsLine=el('div','tj-emotion-log-tags');item.emotionDetails.forEach(function(d){tagsLine.append(el('span','tj-chip',i18n.t(d.emotion)+' '+d.intensity+((d.tags||[]).length?' · '+d.tags.join('، '):'')));});row.append(tagsLine);}row.append(el('p','',item.note||''));history.append(row);});body.append(history);var actions=el('footer','tj-modal-actions'),edit=button(i18n.t('edit'),'tj-primary','pencil'),del=button(i18n.t('deleteTrade'),'tj-danger','trash-2');edit.onclick=function(){m.back.remove();openWizard(trade);};del.onclick=function(){if(confirm(i18n.t('deleteConfirm'))){store.remove(trade.id);m.back.remove();}};actions.append(del,edit);m.box.append(body,actions);refreshIcons(m.back);}
  var baseDetails=details;
  details=function(id){baseDetails(id);var trade=store.find(id),body=document.querySelector('.tj-trade-details .tj-details-body');if(!trade||!body||!trade.screenshots.length)return;var shots=el('section','tj-detail-section'),gallery=el('div','tj-detail-gallery');shots.append(el('h3','',i18n.t('screenshots')),gallery);body.append(shots);trade.screenshots.forEach(async function(item){var url=await store.screenshotUrl(item);if(!url)return;var image=document.createElement('img');image.src=url;image.alt=item.fileName||'';image.onclick=function(){window.open(url,'_blank','noopener');};gallery.append(image);});};
  var withScreenshots=details;
  details=function(id){withScreenshots(id);var trade=store.find(id),body=document.querySelector('.tj-trade-details .tj-details-body');if(!trade||!body||!trade.emotionLog.length||!window.TradeJournalPsychology)return;body.append(window.TradeJournalPsychology.renderJourneyChart(trade));refreshIcons(body);};
  function enhanceSessionPositions(ctx){var page=ctx.page,session=ctx.session,scenarios=ctx.scenarios(session).filter(function(s){return s.executionPlan.positionType||s.executionPlan.stopLoss||s.executionPlan.takeProfit;});Array.from(page.querySelectorAll('.sw-position')).forEach(function(row,index){var scenario=scenarios[index];if(!scenario)return;var old=row.querySelector('.sw-position-actions');if(!old)return;old.replaceChildren();var trade=store.findBySource(session.id,scenario.id),locked=!!row.querySelector('.sw-protocol.locked');function saved(value){scenario.executionPlan.tradeId=value.id;scenario.executionPlan.positionStatus=value.status;scenario.executionPlan.entryPrices=value.entryPrice?[value.entryPrice]:scenario.executionPlan.entryPrices;scenario.executionPlan.stopLoss=value.stopLoss;scenario.executionPlan.takeProfit=value.takeProfits[0]?value.takeProfits[0].price:scenario.executionPlan.takeProfit;ctx.log(session,'trade_'+value.status,'Trade '+value.status,scenario.id,true);ctx.save(session);ctx.open(session.id);}if(!trade){var launch=button(i18n.t('registerTrade'),'tj-session-primary','notebook-pen');launch.disabled=locked||session.status==='closed';launch.onclick=function(){var plan=scenario.executionPlan,patternId=scenario.pattern&&scenario.pattern.patternTagId;openWizard({status:'hunting',direction:String(plan.positionType||'long').toLowerCase()==='short'?'short':'long',entryPrice:(plan.entryPrices||[])[0]||null,stopLoss:plan.stopLoss||null,takeProfits:plan.takeProfit?[{price:plan.takeProfit,portionPercent:100}]:[],linkedPatternIds:patternId?[patternId]:[],source:{character:document.body.dataset.character||'hunter',sessionId:session.id,scenarioId:scenario.id}}, {onSave:saved});};old.append(launch);return;}var badge=el('span','tj-position-status '+trade.status,statusLabel(trade.status));old.append(badge);if(trade.status==='hunting'){var opened=button(i18n.t('markOpen'),'tj-session-primary','target');opened.onclick=function(){saved(store.updateStatus(trade.id,'open'));};var cancel=button(i18n.t('cancelTrade'),'tj-session-danger','ban');cancel.onclick=function(){saved(store.updateStatus(trade.id,'cancelled'));};old.append(opened,cancel);}if(trade.status==='open'){var emotion=button(i18n.t('logEmotionAction'),'tj-session-warning','heart-pulse');emotion.onclick=function(){openEmotion(trade.id,'mid_trade');};var close=button(i18n.t('closePosition'),'tj-session-primary','circle-stop');close.onclick=function(){closeTrade(trade.id,saved);};old.append(emotion,close);}var detail=button(i18n.t('viewDetails'),'tj-session-ghost','eye');detail.onclick=function(){details(trade.id);};old.append(detail);});refreshIcons(page);}
  function enhanceSessionPositionsV2(ctx){
    var page=ctx.page,session=ctx.session;
    if(!page||!session)return;
    var candidates=ctx.scenarios(session).filter(function(s){var plan=s.executionPlan||{};return plan.positionType||plan.stopLoss||plan.takeProfit;});
    Array.from(page.querySelectorAll('.sw-position')).forEach(function(row,index){
      var titleNode=row.querySelector('.sw-row-head b'),title=titleNode?titleNode.textContent.trim():'';
      var scenario=candidates.find(function(item){return item.id===row.dataset.scenarioId;})||candidates.find(function(item){return String(item.title||'').trim()===title;})||candidates[index];
      if(!scenario)return;
      row.dataset.scenarioId=scenario.id;
      var actions=row.querySelector('.sw-position-actions');if(!actions)return;actions.replaceChildren();
      var trade=store.findBySource(session.id,scenario.id),locked=!!row.querySelector('.sw-protocol.locked');
      function saved(value){
        if(!value)return;
        var plan=scenario.executionPlan||{};scenario.executionPlan=plan;plan.tradeId=value.id;plan.positionStatus=value.status;
        plan.entryPrices=value.entryPrice?[value.entryPrice]:(plan.entryPrices||[]);plan.stopLoss=value.stopLoss;plan.takeProfit=value.takeProfits&&value.takeProfits[0]?value.takeProfits[0].price:plan.takeProfit;plan.linkedStrategyId=value.linkedStrategyId||null;
        ctx.log(session,'trade_'+value.status,'Trade '+value.status,scenario.id,true);ctx.save(session);ctx.open(session.id);
      }
      if(!trade){
        var launch=button(i18n.t('registerTrade'),'tj-session-primary','notebook-pen');
        launch.disabled=session.status==='closed';
        if(locked)launch.title=i18n.t('registerTrade');
        launch.onclick=function(){var plan=scenario.executionPlan||{},patternId=scenario.pattern&&scenario.pattern.patternTagId;openWizard({status:'hunting',direction:String(plan.positionType||'long').toLowerCase()==='short'?'short':'long',entryPrice:(plan.entryPrices||[])[0]||null,stopLoss:plan.stopLoss||null,takeProfits:plan.takeProfit?[{price:plan.takeProfit,portionPercent:100}]:[],linkedPatternIds:patternId?[patternId]:[],linkedStrategyId:plan.linkedStrategyId||null,source:{character:(window.TradeJournalPanelLayer&&window.TradeJournalPanelLayer.character)||'hunter',sessionId:session.id,scenarioId:scenario.id}},{onSave:saved});};
        actions.append(launch);return;
      }
      actions.append(el('span','tj-position-status '+trade.status,statusLabel(trade.status)));if(trade.linkedStrategyId&&window.TradeJournalStrategyEducation){var detection=button(i18n.t('logDetection'),'tj-session-ghost','radar');detection.onclick=function(){window.TradeJournalStrategyEducation.openDetection(trade.linkedStrategyId,{type:'session',sessionId:session.id,scenarioId:scenario.id,tradeId:trade.id});};actions.append(detection);}
      if(trade.status==='hunting'){
        var opened=button(i18n.t('markOpen'),'tj-session-primary','target');opened.onclick=function(){saved(store.updateStatus(trade.id,'open'));};
        var cancel=button(i18n.t('cancelTrade'),'tj-session-danger','ban');cancel.onclick=function(){saved(store.updateStatus(trade.id,'cancelled'));};actions.append(opened,cancel);
      }else if(trade.status==='open'){
        var emotion=button(i18n.t('logEmotionAction'),'tj-session-warning','heart-pulse');emotion.onclick=function(){openEmotion(trade.id,'mid_trade');};
        var close=button(i18n.t('closePosition'),'tj-session-primary','circle-stop');close.onclick=function(){closeTrade(trade.id,saved);};actions.append(emotion,close);
      }
      var detail=button(i18n.t('viewDetails'),'tj-session-ghost','eye');detail.onclick=function(){details(trade.id);};actions.append(detail);
    });
    var previous=page.querySelector('[data-session-open-positions]');if(previous)previous.remove();
    if(window.TradeJournalOpenPositionsModule){var active=window.TradeJournalOpenPositionsModule.listActive({sessionId:session.id});if(active.length){var module=window.TradeJournalOpenPositionsModule.render({sessionId:session.id,compact:false,location:'session'});module.dataset.sessionOpenPositions='';var dashboard=page.querySelector('.sw-dashboard');if(dashboard)dashboard.insertAdjacentElement('afterend',module);}}
    refreshIcons(page);
  }
  function settingsCard(){var settings=store.settings(),card=el('section','panel-settings-card tj-settings-card');card.dataset.tradeSettings='';card.append(el('h3','',i18n.t('feeSettings')),el('p','',i18n.t('feeSettingsHelp')));var grid=el('div','tj-calc-grid'),balance=numeric(i18n.t('accountBalance'),'accountBalance',settings.accountBalance,'USD'),type=selectField(i18n.t('defaultFeeType'),'defaultFeeType',[['taker',i18n.t('taker')],['maker',i18n.t('maker')]],settings.defaultFeeType),taker=numeric(i18n.t('takerFee'),'takerFeePercent',settings.takerFeePercent,'%'),maker=numeric(i18n.t('makerFee'),'makerFeePercent',settings.makerFeePercent,'%');grid.append(balance.wrap,type.wrap,taker.wrap,maker.wrap);var save=button(i18n.t('saveSettings'),'tj-primary','save');save.onclick=function(){store.saveSettings({accountBalance:balance.input.value,defaultFeeType:type.input.value,takerFeePercent:taker.input.value,makerFeePercent:maker.input.value});toast(i18n.t('settingsSaved'),'success');};card.append(grid,save);return card;}
  function ensureGlobalUi(){var chat=document.querySelector('[data-navrya-chat-dock]');if(chat&&!document.querySelector('[data-trade-calculator-fab]')){var fab=button('','tj-calculator-fab','calculator');fab.dataset.tradeCalculatorFab='';fab.dataset.character=(window.TradeJournalPanelCharacter==='sage'?'master':(window.TradeJournalPanelCharacter||'hunter'));fab.title=i18n.t('tradeCalculator');fab.onclick=function(){openCalculator();};document.body.append(fab);refreshIcons(fab);}var settings=document.querySelector('.panel-settings');if(settings&&!settings.querySelector('[data-trade-settings]')){settings.append(settingsCard());refreshIcons(settings);}}
  var observer=new MutationObserver(ensureGlobalUi);observer.observe(document.body,{subtree:true,childList:true});new MutationObserver(ensureGlobalUi).observe(document.documentElement,{attributes:true,attributeFilter:['lang','dir']});setTimeout(ensureGlobalUi,0);
  window.addEventListener('tradejournal:trades-changed',function(){var page=document.querySelector('.sw-workspace');if(page&&window.TradeJournalWorkspace){/* session save callback owns refresh */}});
  document.addEventListener('click',function(event){var close=event.target.closest&&event.target.closest('[data-tj-close],.tj-modal-head>.tj-icon-button,.pr-modal-close,.sw-modal-close,.swe-close');if(!close)return;var overlay=close.closest('.tj-modal-backdrop,.pr-modal-backdrop,.sw-modal,.swe-modal-backdrop');if(overlay&&document.body.contains(overlay))overlay.remove();});
  window.TradeJournalTradeUI={openCalculator:openCalculator,openWizard:openWizard,openEmotion:openEmotion,closeTrade:closeTrade,viewTrade:details,editTrade:function(id){var trade=store.find(id);if(trade)openWizard(trade);},enhanceSessionPositions:enhanceSessionPositionsV2,toast:toast,statusLabel:statusLabel,outcomeLabel:outcomeLabel,applyCalculatedToTrade:applyCalculatedToTrade};
  setTimeout(function(){if(window.TradeJournalWorkspace&&window.TradeJournalWorkspace.refresh)window.TradeJournalWorkspace.refresh();},0);
}());
