(function () {
  'use strict';
  /**
   * NAVRYA Accounts domain. There is deliberately no equity/balance/todayPL/totalPL/connection
   * field on the Account type itself - this app has no real broker/prop-firm API integration,
   * so any such figure could only ever be fabricated or stale. Every account is manual by
   * construction; every performance number is derived on read from startingBalance plus the
   * account's own trades (accounts-engine.js), never stored. See ACCOUNTS_HANDOFF.md section 9,
   * "what was deliberately not done."
   *
   * dailyResetTimezone/dailyResetHour/dailyLossBasis (defect #4): a real prop-firm daily-loss
   * rule resets on THAT FIRM's own clock, not the trader's browser's UTC midnight - these three
   * fields make that explicit and configurable per account, rather than accounts-engine.js
   * silently assuming UTC. dailyLossBasis is 'realized' (only closed trades count - what NAVRYA
   * can always verify) or 'realized_and_open' (the firm also counts floating P/L on open
   * positions - NAVRYA has no live mark-price feed, so a rule configured this way reports
   * "insufficient data" instead of a false SAFE whenever a position is actually open; see
   * accounts-engine.js's own dailyLossBasisInsufficient).
   *
   * @typedef {{kind:'prop',profitTargetPercent:number|null,dailyLossLimitPercent:number|null,maxDrawdownPercent:number|null,drawdownType:'static'|'trailing',minTradingDays:number|null,consistencyCapPercent:number|null,maxLotSize:number|null,maxOpenPositions:number|null,maxRiskPerTradePercent:number|null,dailyResetTimezone:string|null,dailyResetHour:number|null,dailyLossBasis:'realized'|'realized_and_open'}} PropRules
   * @typedef {{kind:'personal',dailyLossCap:number|null,maxRiskPerTradePercent:number|null,monthlyGoalPercent:number|null,maxOpenPositions:number|null,hardFloor:number|null,dailyResetTimezone:string|null,dailyResetHour:number|null,dailyLossBasis:'realized'|'realized_and_open'}} PersonalRules
   * @typedef {{id:string,kind:'prop'|'personal',firm:string,program:string|null,platform:string|null,numberMasked:string|null,status:'active'|'archived',archivedAt:string|null,currency:'USD'|'EUR'|'GBP'|'AUD',startDate:string,startingBalance:number,rules:PropRules|PersonalRules,createdAt:string,updatedAt:string}} Account
   */

  // Curated, not exhaustive - the common firm/broker server timezones this app's own handoff
  // examples use (New York/London/server-local), plus UTC as the honest default. The manual
  // form's free-choice select still accepts any valid IANA zone via isValidTimezone() below.
  var COMMON_TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Singapore', 'Australia/Sydney'];

  // Shared client+server validity check (Intl is available in both a browser and Node) - used
  // so a malformed/unsupported IANA string is rejected with a real error rather than silently
  // falling back to UTC deep inside the engine with no signal to the person configuring it.
  function isValidTimezone(tz) {
    if (!tz || typeof tz !== 'string') return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (_) { return false; }
  }

  window.TradeJournalAccountsTypes = {
    kinds: ['prop', 'personal'], currencies: ['USD', 'EUR', 'GBP', 'AUD'], drawdownTypes: ['static', 'trailing'],
    dailyLossBases: ['realized', 'realized_and_open'], commonTimezones: COMMON_TIMEZONES, isValidTimezone: isValidTimezone,
    // A4 process-registry allowlist for the manual create/edit form - see trade.types.js's
    // tradeWizardPaths for the identical convention.
    manualAccountPaths: [
      'kind', 'firm', 'program', 'platform', 'numberMasked', 'currency', 'startDate', 'startingBalance',
      'rules.profitTargetPercent', 'rules.dailyLossLimitPercent', 'rules.maxDrawdownPercent', 'rules.drawdownType',
      'rules.minTradingDays', 'rules.consistencyCapPercent', 'rules.maxLotSize', 'rules.maxOpenPositions',
      'rules.maxRiskPerTradePercent', 'rules.dailyLossCap', 'rules.monthlyGoalPercent', 'rules.hardFloor',
      'rules.dailyResetTimezone', 'rules.dailyResetHour', 'rules.dailyLossBasis'
    ],
    defaultPropRules: function () {
      return { kind: 'prop', profitTargetPercent: 10, dailyLossLimitPercent: 5, maxDrawdownPercent: 10, drawdownType: 'static', minTradingDays: 5, consistencyCapPercent: 40, maxLotSize: null, maxOpenPositions: null, maxRiskPerTradePercent: null, dailyResetTimezone: 'UTC', dailyResetHour: 0, dailyLossBasis: 'realized' };
    },
    defaultPersonalRules: function () {
      return { kind: 'personal', dailyLossCap: null, maxRiskPerTradePercent: 1, monthlyGoalPercent: null, maxOpenPositions: null, hardFloor: null, dailyResetTimezone: 'UTC', dailyResetHour: 0, dailyLossBasis: 'realized' };
    }
  };
}());
