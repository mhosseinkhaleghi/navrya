(function () {
  'use strict';
  /**
   * @typedef {'hunting'|'open'|'closed'|'cancelled'} TradeStatus
   * @typedef {'long'|'short'} TradeDirection
   * @typedef {'quick'|'full'} TradeEntryMode
   * @typedef {{price:number,portionPercent:number}} TradeTakeProfit
   * @typedef {{emotion:string,intensity:number,tags:string[]}} TradeEmotionDetail
   * @typedef {{id:string,timestamp:string,stage:'entry'|'mid_trade'|'exit',dominantEmotions:string[],emotionDetails:TradeEmotionDetail[],stressLevel:number,focusQuality:number,planCommitment:number,wouldTakeIfNotForced:boolean|null,note:string}} TradeEmotionLog
   * @typedef {{id:string,blobId?:string,dataUrl?:string,fileName?:string,mimeType?:string,uploadedAt:string}} TradeScreenshot
   * @typedef {{timeframe:string,direction:'bullish'|'bearish'|null,momentumStrength:number|null,source:'ai'|'user'}} TradeTimeframeTrend
   * @typedef {{id:string,status:TradeStatus,direction:TradeDirection,entryMode:TradeEntryMode,entryPrice:number|null,stopLoss:number|null,takeProfits:TradeTakeProfit[],slDistancePercent:number|null,riskPercent:number|null,riskAmount:number|null,leverage:number|null,positionSize:number|null,marginRequired:number|null,liquidationPrice:number|null,rr:number|null,marginMode:'isolated'|'cross',commission:{feeType:'taker'|'maker',feePercent:number,totalCommission:number},breakevenPercent:number|null,exitPrice:number|null,outcome:'win'|'loss'|'breakeven'|null,pnl:number|null,pnlPercent:number|null,session:'tokyo'|'london'|'newyork'|'sydney',primaryTimeframe:string|null,timeframeTrends:TradeTimeframeTrend[],conceptTags:string[],linkedPatternIds:string[],linkedStrategyId:string|null,chartNote:string,emotionLog:TradeEmotionLog[],screenshots:TradeScreenshot[],createdAt:string,updatedAt:string,openedAt:string|null,closedAt:string|null,statusHistory:{status:TradeStatus,timestamp:string}[],source?:{character?:string,sessionId?:string,scenarioId?:string},aiPredictionLinks?:{id:string,patternId?:string,matched:boolean|null}[],aiInitialAnalysis?:{summary:string,observations:string[],warnings:string[]}}} Trade
   */
  window.TradeJournalTradeTypes = {
    statuses:['hunting','open','closed','cancelled'], directions:['long','short'], timeframes:['1m','5m','15m','1h','4h','1D'],
    concepts:['Liquidity','HTF Alignment','Displacement','Sweep Liquidity','FVG','MSS','Price Action Candle','Confirmation','Order Block','S/R Area','SMT Divergence','Breaker Block'],
    emotions:['excited','anxious','calm','revenge','angry','afraid','confident','fatigued','restless','overconfident'],
    // A4 process-registry allowlist: field paths the global AI dock may suggest into while
    // the Trade Wizard or the emotion-log popup is open. Applied via a live closure over
    // the wizard's in-memory trade/state (not yet persisted, so there is no store.applySuggestion
    // to route through the way patterns/strategies/mental-health already do).
    tradeWizardPaths: ['direction','marginMode','entryPrice','stopLoss','riskPercent','riskAmount','leverage','positionSize','primaryTimeframe','chartNote','conceptTags'],
    emotionLogPaths: ['dominantEmotions','stressLevel','note']
  };
}());
