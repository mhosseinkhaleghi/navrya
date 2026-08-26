/**
 * @typedef {'up'|'down'|'sideways'} SessionMovementDirection
 * @typedef {'small'|'medium'|'large'|null} SessionMovementMagnitude
 * @typedef {{orderIndex:number,direction:SessionMovementDirection,magnitude:SessionMovementMagnitude}} SessionMovementPoint
 * @typedef {{id:string,sessionId:string,character:string,market:string,instrument:(string|null),timeframe:string,date:string,movementSequence:SessionMovementPoint[],patternIds:string[],strategyIds:string[],scenarioOutcomes:{patternId:string|null,occurred:boolean}[],tradeSummary:{count:number,wins:number,losses:number,netPnl:number|null},fateSummaryText:string,createdAt:string}} SessionSignature
 * @typedef {{similarity:number,sessionId:string,character:string,market:string,instrument:(string|null),timeframe:string,date:string,fateSummaryText:string,reasons:string[],signature:SessionSignature}} RankedSessionMatch
 */
(function(){ window.TradeJournalSessionSignatureTypes=Object.freeze({SessionSignature:'SessionSignature',RankedSessionMatch:'RankedSessionMatch'}); }());
