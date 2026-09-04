(function(){
  'use strict';
  // The market-day routine a trader builds for themselves, and their day-by-day completion of it.
  //
  // Persistence is the same server-authoritative path psychology-store.js already uses - one
  // window.TradeJournalUserPreferences key holding the whole object, written back as an atomic
  // whole-object replace. No localStorage anywhere, and no new server table: the preferences
  // domain (server/community/routes.preferences.mjs, migration 019) is a generic
  // {user_id, pref_key -> value} store, so a routine is just another preference row that
  // replicates and syncs like every other migrated domain.
  //
  // Two separate concerns share the one key deliberately: the ROUTINE DEFINITIONS (rarely
  // written, small) and the DAILY COMPLETIONS (written several times a day, one small map per
  // date). Splitting them into two preference keys would mean two round-trips for the common
  // "tick a step" write and a torn read whenever one landed and the other did not; one key keeps
  // every write a single atomic replace, at the cost of resending the (small) definitions each
  // time. COMPLETION_RETENTION_DAYS bounds the growth so the value cannot creep upward forever.
  var PREF_KEY='tradingRoutines';
  var COMPLETION_RETENTION_DAYS=180;
  var WATCH_KEY='__watch';

  function nowIso(){return new Date().toISOString();}
  function uid(prefix){return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);}
  function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}

  // Local calendar date, not UTC - a routine day is the trader's own day. Matches the dayKey()
  // convention psychology-store.js already uses for streaks, but zero-padded so the string sorts.
  function dayKey(date){
    var d=date||new Date();
    var m=String(d.getMonth()+1),day=String(d.getDate());
    return d.getFullYear()+'-'+(m.length<2?'0'+m:m)+'-'+(day.length<2?'0'+day:day);
  }

  function step(id,label,time,phase,link,note){
    return{id:id,label:label,time:time||'',phase:phase||'pre',link:link||'',note:note||''};
  }

  function defaultRules(){
    return{warn:true,streak:true,remind:false,watch:true,partial:false,carry:true};
  }

  // The five presets the builder offers. `blank` is deliberately empty rather than absent, so
  // "start from scratch" travels the exact same create() path as every other template.
  function templates(){
    return{
      hunter:{name:'روتین شکارچی',minutes:45,steps:[
        step('plan','مرور پلن و قوانین دیروز','07:40','pre','','دو دقیقه، فقط خواندن'),
        step('news','تقویم اقتصادی و اخبار سشن','07:50','pre','app',''),
        step('levels','علامت‌زدن سطوح کلیدی','08:05','pre','','حداکثر سه نماد'),
        step('risk','تعیین سقف ریسک روز','08:15','pre','calculator',''),
        step('breath','چهار دقیقه تنفس','08:25','pre','calm',''),
        step('checkin','چک‌این پیش‌سشن','08:30','pre','tracking','خواب، استرس، چیزی برای اثبات'),
        step('reflect','بازتاب پس از هر معامله','','during','reflection',''),
        step('tilt','چک تیلت پیش از نیویورک','16:00','during','tilt','ساعت اوج تنش تو'),
        step('close','بستن روز و جملهٔ روز','22:30','post','journal','')
      ]},
      scalper:{name:'اسکالپ کوتاه',minutes:25,steps:[
        step('spread','چک اسپرد و نقدشوندگی','09:10','pre','',''),
        step('cap','سقف تعداد معاملهٔ امروز','09:15','pre','','سقف پیش‌فرض: ۵'),
        step('checkin','چک‌این پیش‌سشن','09:20','pre','tracking',''),
        step('stop','توقف اجباری بعد از دو ضرر','','during','cooldown',''),
        step('count','شمردن تخلف‌های امروز','18:00','post','journal','')
      ]},
      swing:{name:'سوئینگ آرام',minutes:35,steps:[
        step('scan','اسکن هفتگی نمادها','','weekly','',''),
        step('look','چک پوزیشن‌های باز، بدون دست‌زدن','08:00','pre','','قانون: فقط نگاه'),
        step('mood','ثبت حال پوزیشن‌های باز','08:10','pre','mood',''),
        step('note','یادداشت یک‌خطی از روز','21:00','post','journal',''),
        step('weekly','چک‌این هفتگی','','weekly','tracking','')
      ]},
      minimal:{name:'حداقلی',minutes:10,steps:[
        step('checkin','چک‌این پیش‌سشن','','pre','tracking',''),
        step('reflect','یک جمله دربارهٔ اجرا','','during','reflection',''),
        step('sentence','جملهٔ روز','','post','journal','')
      ]},
      blank:{name:'روتین من',minutes:0,steps:[]}
    };
  }

  // Grouped catalogue the builder's step library renders. Ids are stable so a step added from
  // the library and the same step inside a template are the same step, never a duplicate.
  function stepLibrary(){
    return[
      {phase:'pre',items:[
        step('plan','مرور پلن و قوانین دیروز','07:40','pre','',''),
        step('news','تقویم اقتصادی و اخبار سشن','07:50','pre','app',''),
        step('levels','علامت‌زدن سطوح کلیدی','08:05','pre','',''),
        step('risk','تعیین سقف ریسک روز','08:15','pre','calculator',''),
        step('spread','چک اسپرد و نقدشوندگی','09:10','pre','',''),
        step('cap','سقف تعداد معاملهٔ امروز','09:15','pre','','')
      ]},
      {phase:'mind',items:[
        step('breath','چهار دقیقه تنفس','08:25','pre','calm',''),
        step('checkin','چک‌این پیش‌سشن','08:30','pre','tracking',''),
        step('card','خواندن یک کارت سوگیری','','pre','library',''),
        step('mute','خاموش‌کردن نوتیفیکیشن‌ها','','pre','','')
      ]},
      {phase:'during',items:[
        step('reflect','بازتاب پس از هر معامله','','during','reflection',''),
        step('tilt','چک تیلت پیش از نیویورک','16:00','during','tilt',''),
        step('stop','توقف اجباری بعد از دو ضرر','','during','cooldown','')
      ]},
      {phase:'post',items:[
        step('close','بستن روز و جملهٔ روز','22:30','post','journal',''),
        step('count','شمردن تخلف‌های امروز','18:00','post','journal',''),
        step('weekly','چک‌این هفتگی','','weekly','tracking',''),
        step('note','یادداشت یک‌خطی از روز','21:00','post','journal','')
      ]}
    ];
  }

  function emptyState(){return{version:1,activeId:null,routines:[],completions:{}};}

  // Normalises whatever came back from the replica, so every reader downstream can assume the
  // full shape. A row written by an older build (or a hand-edited one) can be missing anything.
  function normalize(raw){
    var base=emptyState();
    if(!raw||typeof raw!=='object')return base;
    var routines=Array.isArray(raw.routines)?raw.routines.filter(function(r){return r&&r.id;}).map(function(r){
      return{
        id:String(r.id),
        name:String(r.name||'روتین من'),
        template:r.template||'blank',
        session:r.session||'london',
        days:Array.isArray(r.days)?r.days.slice():['sat','sun','mon','tue','wed'],
        steps:Array.isArray(r.steps)?r.steps.filter(function(s){return s&&s.id;}).map(function(s){
          return step(String(s.id),String(s.label||''),s.time,s.phase,s.link,s.note);
        }):[],
        rules:Object.assign(defaultRules(),r.rules||{}),
        archived:!!r.archived,
        createdAt:r.createdAt||nowIso(),
        updatedAt:r.updatedAt||r.createdAt||nowIso()
      };
    }):[];
    var completions={};
    if(raw.completions&&typeof raw.completions==='object'){
      Object.keys(raw.completions).forEach(function(key){
        var day=raw.completions[key];
        if(day&&typeof day==='object')completions[key]=clone(day);
      });
    }
    var activeId=raw.activeId&&routines.some(function(r){return r.id===raw.activeId&&!r.archived;})?raw.activeId:null;
    if(!activeId){
      var first=routines.filter(function(r){return !r.archived;})[0];
      activeId=first?first.id:null;
    }
    return{version:1,activeId:activeId,routines:routines,completions:completions};
  }

  function load(){
    var prefs=window.TradeJournalUserPreferences;
    return normalize(prefs?prefs.getPref(PREF_KEY,null):null);
  }

  // Drops completion days past the retention window before writing, so the stored value stays
  // bounded however long the account lives.
  function prune(state,now){
    var cutoff=new Date(now||new Date());
    cutoff.setDate(cutoff.getDate()-COMPLETION_RETENTION_DAYS);
    var floor=dayKey(cutoff),kept={};
    Object.keys(state.completions).forEach(function(key){
      if(key>=floor)kept[key]=state.completions[key];
    });
    state.completions=kept;
    return state;
  }

  function save(next,now){
    var state=prune(normalize(next),now);
    var prefs=window.TradeJournalUserPreferences;
    if(prefs)prefs.setPref(PREF_KEY,state);
    window.dispatchEvent(new CustomEvent('tradejournal:routine-changed'));
    return state;
  }

  function list(state){return (state||load()).routines.filter(function(r){return !r.archived;});}
  function active(state){
    var s=state||load();
    return s.routines.filter(function(r){return r.id===s.activeId;})[0]||null;
  }
  function setActive(id){
    var s=load();
    if(!s.routines.some(function(r){return r.id===id;}))return s;
    s.activeId=id;
    return save(s);
  }

  // `draft` is whatever the builder has on screen; everything unset falls back to the chosen
  // template so a half-filled wizard still produces a usable routine.
  function create(draft){
    var d=draft||{};
    var preset=templates()[d.template]||templates().blank;
    var s=load();
    var routine={
      id:uid('routine'),
      name:(d.name||preset.name||'روتین من').trim()||'روتین من',
      template:d.template||'blank',
      session:d.session||'london',
      days:Array.isArray(d.days)&&d.days.length?d.days.slice():['sat','sun','mon','tue','wed'],
      steps:Array.isArray(d.steps)?d.steps.slice():clone(preset.steps),
      rules:Object.assign(defaultRules(),d.rules||{}),
      archived:false,
      createdAt:nowIso(),
      updatedAt:nowIso()
    };
    s.routines.push(routine);
    s.activeId=routine.id;
    save(s);
    return routine;
  }

  function update(id,patch){
    var s=load(),found=null;
    s.routines=s.routines.map(function(r){
      if(r.id!==id)return r;
      found=Object.assign({},r,patch||{},{id:r.id,createdAt:r.createdAt,updatedAt:nowIso()});
      return found;
    });
    if(!found)return s;
    return save(s);
  }

  // Archive rather than delete: the adherence history for past days stays meaningful, and a
  // routine the trader turns off can be turned back on without losing its shape.
  function archive(id){return update(id,{archived:true});}

  function dayMap(state,key){
    var s=state||load();
    return s.completions[key||dayKey()]||{};
  }

  function toggleStep(stepId,date){
    var s=load(),key=dayKey(date),day=Object.assign({},s.completions[key]||{});
    if(day[stepId])delete day[stepId];else day[stepId]=true;
    s.completions[key]=day;
    return save(s);
  }

  // A watch day ("امروز معامله نمی‌کنم") is a deliberate, successful day - not a failed one. It
  // is stored on the day itself so adherence() can score it without needing trade history.
  function setWatchDay(on,date){
    var s=load(),key=dayKey(date),day=Object.assign({},s.completions[key]||{});
    if(on)day[WATCH_KEY]=true;else delete day[WATCH_KEY];
    s.completions[key]=day;
    return save(s);
  }

  function isWatchDay(state,date){return !!dayMap(state,dayKey(date))[WATCH_KEY];}

  function stepsFor(routine){return routine&&Array.isArray(routine.steps)?routine.steps:[];}

  function dayProgress(state,date,routine){
    var s=state||load(),r=routine||active(s),steps=stepsFor(r);
    var key=dayKey(date),day=s.completions[key]||{};
    var done=steps.filter(function(x){return !!day[x.id];}).length;
    return{
      date:key,total:steps.length,done:done,
      pct:steps.length?Math.round(done/steps.length*100):0,
      watch:!!day[WATCH_KEY],
      complete:steps.length>0&&done===steps.length
    };
  }

  // One entry per calendar day for the trailing `days`, oldest first. A day with no routine row
  // at all is 'none' (an honest gap), never a zero - the same convention disciplineWeekly() uses.
  function adherence(days,now,state){
    days=days||28;
    var s=state||load(),r=active(s),total=stepsFor(r).length;
    var end=now||new Date(),out=[];
    for(var i=days-1;i>=0;i--){
      var d=new Date(end.getFullYear(),end.getMonth(),end.getDate()-i);
      var key=dayKey(d),day=s.completions[key];
      if(!day){out.push({date:key,state:'none',pct:0,done:0,total:total});continue;}
      if(day[WATCH_KEY]){out.push({date:key,state:'watch',pct:0,done:0,total:total});continue;}
      var done=Object.keys(day).filter(function(k){return k!==WATCH_KEY&&day[k];}).length;
      out.push({
        date:key,
        state:total&&done>=total?'complete':done>0?'partial':'none',
        pct:total?Math.round(Math.min(done,total)/total*100):0,
        done:done,total:total
      });
    }
    return out;
  }

  // Share of days that counted as a success. A watch day counts when the routine's own `watch`
  // rule is on (its whole point); `partial` credit is opt-in via the routine's `partial` rule.
  function adherenceRate(days,now,state){
    var s=state||load(),r=active(s),rows=adherence(days,now,s);
    var rules=(r&&r.rules)||defaultRules();
    var scored=rows.filter(function(x){return x.state!=='none'||false;});
    if(!scored.length)return null;
    var sum=scored.reduce(function(acc,x){
      if(x.state==='complete')return acc+1;
      if(x.state==='watch')return acc+(rules.watch?1:0);
      if(x.state==='partial')return acc+(rules.partial?x.pct/100:0);
      return acc;
    },0);
    return Math.round(sum/scored.length*100);
  }

  // Consecutive successful days ending today (or the given day). Mirrors disciplineStreak()'s
  // "walk backwards until a day fails" shape, including its "today with nothing logged yet ends
  // the streak" behaviour.
  function streak(now,state){
    var s=state||load(),r=active(s),total=stepsFor(r).length;
    if(!total)return 0;
    var rules=(r&&r.rules)||defaultRules();
    var cursor=new Date(now||new Date()),count=0;
    for(;;){
      var day=s.completions[dayKey(cursor)];
      if(!day)break;
      if(day[WATCH_KEY]){
        if(!rules.watch)break;
      }else{
        var done=Object.keys(day).filter(function(k){return k!==WATCH_KEY&&day[k];}).length;
        if(done<total)break;
      }
      count+=1;
      cursor.setDate(cursor.getDate()-1);
    }
    return count;
  }

  window.TradeJournalRoutineStore={
    PREF_KEY:PREF_KEY,
    dayKey:dayKey,
    templates:templates,
    stepLibrary:stepLibrary,
    defaultRules:defaultRules,
    load:load,
    save:save,
    list:list,
    active:active,
    setActive:setActive,
    create:create,
    update:update,
    archive:archive,
    toggleStep:toggleStep,
    setWatchDay:setWatchDay,
    isWatchDay:isWatchDay,
    dayProgress:dayProgress,
    adherence:adherence,
    adherenceRate:adherenceRate,
    streak:streak
  };
}());
