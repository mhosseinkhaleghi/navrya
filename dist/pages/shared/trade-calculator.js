(function(){
  'use strict';
  function n(v){if(v===null||v===undefined||v==='')return null;var x=Number(v);return Number.isFinite(x)?x:null;}
  function round(v,p){if(!Number.isFinite(v))return null;var k=Math.pow(10,p||6);return Math.round(v*k)/k;}
  function solve(source,manual,defaults){
    var input=Object.assign({},source||{}),locks=manual instanceof Set?manual:new Set(manual||[]),settings=defaults||{},out={};
    ['entryPrice','stopLoss','slDistancePercent','riskPercent','riskAmount','leverage','positionSize','marginRequired','liquidationPrice','breakevenPercent','totalCommission','rr','accountBalance'].forEach(function(k){out[k]=locks.has(k)?n(input[k]):null;});
    out.direction=input.direction==='short'?'short':'long';out.marginMode=input.marginMode==='cross'?'cross':'isolated';out.feePercent=n(input.feePercent);if(out.feePercent===null)out.feePercent=n(settings.feePercent)||0;out.takeProfits=(input.takeProfits||[]).map(function(x){return{price:n(x.price),portionPercent:n(x.portionPercent)||0};}).filter(function(x){return x.price!==null;});
    function set(k,v){if(!locks.has(k)&&out[k]===null&&Number.isFinite(v)){out[k]=round(v);return true;}return false;}
    for(var pass=0;pass<8;pass+=1){
      var changed=false,e=out.entryPrice,s=out.stopLoss,d=out.slDistancePercent,rp=out.riskPercent,ra=out.riskAmount,b=out.accountBalance,ps=out.positionSize,lev=out.leverage,margin=out.marginRequired;
      if(e&&s)changed=set('slDistancePercent',Math.abs(e-s)/e*100)||changed;
      if(e&&d!==null&&!s)changed=set('stopLoss',out.direction==='long'?e*(1-d/100):e*(1+d/100))||changed;
      if(rp!==null&&b)changed=set('riskAmount',b*rp/100)||changed;
      if(ra!==null&&b)changed=set('riskPercent',ra/b*100)||changed;
      if(ra!==null&&d)changed=set('positionSize',ra/(d/100))||changed;
      if(ps&&d)changed=set('riskAmount',ps*d/100)||changed;
      if(ps&&lev)changed=set('marginRequired',ps/lev)||changed;
      if(ps&&margin)changed=set('leverage',ps/margin)||changed;
      if(!changed)break;
    }
    if(out.positionSize){out.totalCommission=round(out.positionSize*(out.feePercent/100)*2);out.breakevenPercent=round(out.totalCommission/out.positionSize*100);}
    if(out.entryPrice&&out.leverage&&out.marginMode==='isolated'){var buffer=Math.max(0,.004);out.liquidationPrice=round(out.direction==='long'?out.entryPrice*(1-1/out.leverage+buffer):out.entryPrice*(1+1/out.leverage-buffer));}
    var tp=out.takeProfits.length?out.takeProfits.reduce(function(total,x){return total+x.price*(x.portionPercent||100/out.takeProfits.length)/100;},0):null;
    if(out.entryPrice&&out.stopLoss&&tp){var risk=Math.abs(out.entryPrice-out.stopLoss);out.rr=risk?round(Math.abs(tp-out.entryPrice)/risk,3):null;}
    out.potentialProfit=null;out.potentialProfitPercent=null;
    if(out.entryPrice&&out.positionSize&&out.takeProfits.length){var gross=out.takeProfits.reduce(function(total,target){var portion=(target.portionPercent||0)/100,move=out.direction==='long'?(target.price-out.entryPrice)/out.entryPrice:(out.entryPrice-target.price)/out.entryPrice;return total+out.positionSize*move*portion;},0),net=gross-(out.totalCommission||0),profitBase=out.marginRequired||out.positionSize;out.potentialProfit=round(net);out.potentialProfitPercent=profitBase?round(net/profitBase*100):null;}
    if(out.entryPrice&&out.breakevenPercent!==null)out.profitPrice=round(out.direction==='long'?out.entryPrice*(1+out.breakevenPercent/100):out.entryPrice*(1-out.breakevenPercent/100));else out.profitPrice=null;
    return out;
  }
  window.TradeJournalTradeCalculator={solve:solve,number:n,round:round};
}());
