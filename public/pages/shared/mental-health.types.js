(function () {
  'use strict';
  /**
   * @typedef {'fomo'|'loss_aversion'|'overconfidence'|'revenge_trading'|'anchoring'|'confirmation_bias'|'gambler_fallacy'|'recency_bias'|'identity_outcome_fusion'} BiasType
   * @typedef {'assessment'|'formulation'|'psychoeducation'|'cognitive'|'behavioral'|'monitoring'|'relapse_prevention'} SupportPhase
   * SupportPhase is internally also referred to as TherapeuticPhase in JSDoc only; that word never reaches a user-facing string (see mental-health-i18n.js).
   * @typedef {{id:string,description:string,triggerType:'loss_streak'|'news_event'|'time_of_day'|'market_condition'|'custom',detectedCount:number,lastTriggeredAt:string,recommendedAction:string,source:'user'|'auto'|'ai_suggested'}} TriggerEntry
   * @typedef {{pattern:string,confidence:number,supportingTradeIds:string[]}} AutoTrigger
   * @typedef {{id:string,tradeId:string|null,timestamp:string,automaticThought:string,emotion:string,evidenceFor:string,evidenceAgainst:string,balancedThought:string,source:'form'|'chat',relatedBiasType:BiasType|null}} ThoughtRecord
   * @typedef {{type:BiasType,firstDetectedAt:string,evidenceTradeIds:string[],status:'active'|'improving'|'resolved',cyclePhase:SupportPhase,phaseHistory:{phase:SupportPhase,enteredAt:string,reason:string}[]}} CognitiveBias
   * @typedef {{weekStart:string,avgStress:number,planCommitmentAvg:number,emotionalTradesCount:number,winRate:number,progressScore:number}} WeeklySnapshot
   * @typedef {{id:string,title:string,achievedAt:string,relatedBiasType:BiasType|null}} Milestone
   * @typedef {{id:string,label:string,active:boolean}} ChecklistItem
   * @typedef {{id:string,metric:string,operator:'gt'|'lt'|'gte'|'lte',value:number,enabled:boolean}} AlertThreshold
   * @typedef {{emotion:string,winRateDelta:number,sampleSize:number}} CorrelationEntry
   * @typedef {{id:string,path:string,section:string,value:*,mode:'append'|'replace',status:'pending'|'applied'|'rejected',createdAt:string}} MentalHealthSuggestion
   * @typedef {{title:string,explanation:string,whyItMattersForYou:string,practicalSteps:string[],imagePrompt:string,generatedAt:string,viewedAt:string|null}} EducationCard
   * @typedef {{id:string,role:'user'|'assistant',content:string,createdAt:string,suggestions:MentalHealthSuggestion[]}} MentalHealthChatMessage
   *
   * --- v2 additions (Therapist-Model Intake & Continuous Assessment) ---
   * @typedef {{administeredAt:string,rawScore:number,interpretation:string,source:string}} StandardizedTestResult
   * @typedef {{scenarioId:'A_stop_loss'|'B_revenge'|'C_fomo'|'D_patience'|'E_identity',choice:string,sliderValue:number|null,freeText:string|null,measuresConstruct:string,respondedAt:string}} ScenarioResponse
   * @typedef {{type:BiasType,selfRating:number,exampleThisMonth:string,computedIndicatorScore:number|null}} BiasSelfRating
   * @typedef {{id:string,sessionId:string,mood:'calm'|'focused'|'hopeful'|'tense'|'flat'|'angry'|null,sleepQuality:number,currentStressLevel:number,somethingToProveToday:boolean,significantPersonalEvent:string|null,createdAt:string}} PreSessionCheckIn
   * @typedef {{id:string,tradeId:string,sleepQuality:number,significantPersonalEvent:string|null,createdAt:string}} PreTradeContext
   * @typedef {{id:string,tradeId:string,emotionThermometer:string[],setupQualityRating:number,planAdherenceRating:number,emotionManagementRating:number,deviatedFromPlan:'none'|'slightly'|'yes',deviationReason:string|null,wouldTakeAgain:'yes'|'no'|'unsure',revengeCheck:{shown:boolean,choice:'rest'|'recover'|'saw_setup'|null,cooldownTimerStartedAt:string|null}|null,sentenceOfTheDay:string|null,createdAt:string}} PostTradeReflection
   * WeeklyCheckIn is the real, answerable counterpart to WeeklySnapshot above (which only ever
   * aggregates numbers already present in trade history) - a short subjective reflection the
   * trader actually writes, stored alongside it, not instead of it.
   * @typedef {{id:string,weekStart:string,disciplineRating:number,biggestWin:string|null,biggestLesson:string|null,moodNextWeek:string|null,createdAt:string}} WeeklyCheckIn
   * @typedef {{month:string,moodPerformanceCorrelation:CorrelationEntry[],cyclicalPatternNote:string|null,planAdherenceScore:number}} MonthlyCorrelationReport
   * @typedef {{id:string,type:'hiding_losses'|'borrowed_money'|'escalating_revenge_trading'|'pervasive_distress_signs'|'identity_outcome_fusion'|'custom',detectedAt:string,evidence:string,status:'active'|'resolved',professionalReferralShown:boolean}} RedFlagEntry
   * @typedef {{completed:boolean,completedAt:string|null,filledVia:'form'|'chat'|'mixed',demographics:object,financialContext:object,tradingHistory:object,motivationForTrading:string|null,firstBigLossReaction:string|null,transparencyMatrix:object,legacyBaselineV1:object|null}} MentalHealthIntake
   *
   * Two fields were added beyond the originally specified v1 interface, both undeclared gaps needed to
   * satisfy explicit sections of that spec: `chatHistory` (Section 3 needed somewhere to store the
   * conversational-assistant messages) and `educationCards` (Section 6 needed a per-bias cache slot).
   * v2 keeps `baseline`/`emotionalProfile` exactly as v1 had them (existing charts and the 7-phase cycle
   * engine both read `baseline.completed`) - `intake` is a new, richer, PARALLEL structure rather than a
   * replacement; the migration maps what it reasonably can from the old `baseline` into `intake` and keeps
   * an unmodified snapshot of the rest under `intake.legacyBaselineV1`. See mental-health-store.js.
   * @typedef {{userId:string,createdAt:string,lastUpdatedAt:string,version:number,baseline:object,emotionalProfile:object,triggerProfile:object,behavioralPatterns:object,cognitiveProfile:object,progressTracking:object,activeInterventions:object,healthReportCache:object,chatHistory:MentalHealthChatMessage[],educationCards:Object.<string,EducationCard>,intake:MentalHealthIntake,psychologicalProfile:object,continuousTracking:object,redFlags:{active:RedFlagEntry[],resolved:RedFlagEntry[]}}} TradingMentalHealthProfile
   */
  window.TradeJournalMentalHealthTypes = {
    biasTypes: ['fomo', 'loss_aversion', 'overconfidence', 'revenge_trading', 'anchoring', 'confirmation_bias', 'gambler_fallacy', 'recency_bias', 'identity_outcome_fusion'],
    biasChecklistTypes: ['loss_aversion', 'confirmation_bias', 'overconfidence', 'gambler_fallacy', 'anchoring', 'fomo', 'identity_outcome_fusion'],
    supportPhases: ['assessment', 'formulation', 'psychoeducation', 'cognitive', 'behavioral', 'monitoring', 'relapse_prevention'],
    triggerTypes: ['loss_streak', 'news_event', 'time_of_day', 'market_condition', 'custom'],
    scenarioIds: ['A_stop_loss', 'B_revenge', 'C_fomo', 'D_patience', 'E_identity'],
    redFlagTypes: ['hiding_losses', 'borrowed_money', 'escalating_revenge_trading', 'pervasive_distress_signs', 'identity_outcome_fusion', 'custom'],
    mandatoryReferralRedFlags: ['borrowed_money', 'escalating_revenge_trading', 'pervasive_distress_signs'],
    numericPaths: [
      'baseline.initialStressLevel', 'baseline.initialEmotionalRegulation', 'baseline.tradingExperienceYears',
      'intake.demographics.age', 'intake.financialContext.capitalAllocationPercent', 'intake.tradingHistory.yearsTrading',
      'intake.tradingHistory.largestWin.amount', 'intake.tradingHistory.largestWin.percent',
      'intake.tradingHistory.largestLoss.amount', 'intake.tradingHistory.largestLoss.percent',
      'intake.tradingHistory.marginCallOrZeroedCount', 'psychologicalProfile.scenarioAssessment.draftResponse.sliderValue'
    ],
    booleanPaths: [
      'intake.demographics.isFullTimeTrader', 'intake.financialContext.borrowedMoneyForTrading',
      'intake.transparencyMatrix.profitKnownToFamily', 'intake.transparencyMatrix.lossKnownToFamily',
      'intake.transparencyMatrix.capitalKnownToFamily', 'intake.transparencyMatrix.tradingActivityKnownToFamily'
    ],
    arrayAppendPaths: ['baseline.selfReportedWeaknesses', 'intake.tradingHistory.marketsTraded'],
    draftThoughtRecordPaths: ['cognitiveProfile.draftThoughtRecord.automaticThought', 'cognitiveProfile.draftThoughtRecord.emotion', 'cognitiveProfile.draftThoughtRecord.evidenceFor', 'cognitiveProfile.draftThoughtRecord.evidenceAgainst', 'cognitiveProfile.draftThoughtRecord.balancedThought'],
    draftTriggerPaths: ['triggerProfile.draftTrigger.description', 'triggerProfile.draftTrigger.triggerType', 'triggerProfile.draftTrigger.recommendedAction'],
    intakePaths: [
      'intake.demographics.maritalStatus', 'intake.demographics.primaryOccupation', 'intake.demographics.isFullTimeTrader', 'intake.demographics.age', 'intake.demographics.gender',
      'intake.financialContext.capitalType', 'intake.financialContext.capitalAllocationPercent', 'intake.financialContext.borrowedMoneyForTrading',
      'intake.tradingHistory.yearsTrading', 'intake.tradingHistory.marketsTraded',
      'intake.motivationForTrading', 'intake.firstBigLossReaction',
      'intake.transparencyMatrix.profitKnownToFamily', 'intake.transparencyMatrix.lossKnownToFamily', 'intake.transparencyMatrix.capitalKnownToFamily', 'intake.transparencyMatrix.tradingActivityKnownToFamily'
    ],
    draftScenarioResponsePaths: ['psychologicalProfile.scenarioAssessment.draftResponse.choice', 'psychologicalProfile.scenarioAssessment.draftResponse.sliderValue', 'psychologicalProfile.scenarioAssessment.draftResponse.freeText']
  };
}());
