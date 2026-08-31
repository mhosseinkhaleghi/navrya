(function () {
  'use strict';

  /**
   * @typedef {'positionManagement'|'riskManagement'|'overallFramework'} StrategyAttachmentCategory
   * @typedef {'manual'|'ai_from_event'} StrategyOrigin
   * @typedef {'pending'|'confirmed'|'invalidated'} StrategyDetectionStatus
   * @typedef {{id:string,category:StrategyAttachmentCategory,fileName:string,blobId?:string,dataUrl?:string,mimeType:string,size:number,note?:string,uploadedAt:string}} StrategyAttachment
   * @typedef {{id:string,role:'user'|'assistant',content:string,createdAt:string,suggestions?:StrategyFieldSuggestion[]}} StrategyChatMessage
   * @typedef {{id:string,path:string,section:StrategyAttachmentCategory,value:string|number|null,mode:'append'|'replace',status:'pending'|'applied'|'rejected',createdAt:string}} StrategyFieldSuggestion
   * @typedef {{id:string,strategyId:string,detectedAt:string,source:{type:'session'|'trade'|'manual',sessionId?:string,scenarioId?:string,tradeId?:string},predictedOutcome:string,status:StrategyDetectionStatus,resolvedAt:string|null,note?:string}} StrategyDetectionEvent
   * @typedef {{id:string,name:string,active:boolean,isPublic:boolean,origin:StrategyOrigin,positionManagement:{entryRules:string,stopLossRules:string,exitTargetRules:string,positionSizingRules:string,freeNotes:string,attachments:StrategyAttachment[]},riskManagement:{maxRiskPerTradePercent:number|null,dailyDrawdownLimitPercent:number|null,totalDrawdownLimitPercent:number|null,maxConcurrentTrades:number|null,maxProfitCapPerTrade:number|null,freeNotes:string,attachments:StrategyAttachment[]},overallFramework:{description:string,attachments:StrategyAttachment[]},chatHistory:StrategyChatMessage[],aiUnderstandingSummary:{positionManagement:string,riskManagement:string,overallFramework:string,updatedAt:string},detectionEvents:StrategyDetectionEvent[],linkedAnalysisProfileId:string|null,createdAt:string,updatedAt:string}} Strategy
   */
  // linkedAnalysisProfileId (Analysis Profiles domain, ARCHITECTURE.md §7.25): optional, loose
  // reference to an AnalysisProfile id - a Strategy's own "preferred lens", never the reverse
  // (AnalysisProfile never stores or implies a Strategy). Deliberately NOT added to
  // textPaths/numericPaths below - it is set through its own dedicated UI control
  // (strategiesHubView.jsx's setLinkedProfile()), not the generic AI-fillable field allowlist.

  window.TradeJournalStrategyEducationTypes = {
    sections: ['positionManagement', 'riskManagement', 'overallFramework'],
    origins: ['manual', 'ai_from_event'],
    detectionStatuses: ['pending', 'confirmed', 'invalidated'],
    textPaths: [
      'positionManagement.entryRules',
      'positionManagement.stopLossRules',
      'positionManagement.exitTargetRules',
      'positionManagement.positionSizingRules',
      'positionManagement.freeNotes',
      'riskManagement.freeNotes',
      'overallFramework.description'
    ],
    numericPaths: [
      'riskManagement.maxRiskPerTradePercent',
      'riskManagement.dailyDrawdownLimitPercent',
      'riskManagement.totalDrawdownLimitPercent',
      'riskManagement.maxConcurrentTrades',
      'riskManagement.maxProfitCapPerTrade'
    ]
  };
}());
