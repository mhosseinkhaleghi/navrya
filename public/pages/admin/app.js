const translations = {
  en: {
    brand: 'Admin',
    loginHint: 'Sign in with your admin account.', emailLabel: 'Email', passwordLabel: 'Password', loginSubmit: 'Log in',
    gateErrorNotAdmin: 'This account does not have admin access.', gateErrorInvalidCredentials: 'Incorrect email or password.',
    enforcementWarning: 'Warning: ADMIN_AUTH_ENFORCED is not set on the server - every account currently has admin access. Set ADMIN_AUTH_ENFORCED=true.',
    tabUsers: 'Users', tabAI: 'AI', tabTechnical: 'Technical', tabXP: 'XP & Segmentation', tabMarketplace: 'Marketplace', tabFinancial: 'Financial', tabCommercial: 'Commercial',
    // Sidebar group labels (English-only for now, same accepted precedent as the Commercial-tab
    // keys further down - t() falls back to this English text for fa/ar/es until a translation
    // pass covers them too).
    navGroupMonitor: 'Monitor', navGroupMonetize: 'Monetize', navGroupConfigure: 'Configure',
    comPageSubtitle: 'Plans, wallet, subscriptions, storage add-ons, transactions and crypto payments - one tab open at a time.',
    comSubPlans: 'Plans', comSubWallet: 'Wallet', comSubHistory: 'Configuration History',
    comUnlimited: 'Unlimited', comStorageBytes: 'Storage (bytes)', comLimitPatterns: 'Patterns', comLimitStrategies: 'Strategies', comLimitAccounts: 'Connected Accounts', comLimitSessions: 'Sessions', comLimitAnalysisSymbols: 'Analysis Symbols',
    comFeatureWallet: 'Wallet enabled', comFeatureAi: 'AI (wallet-based)', comFeatureVoice: 'Voice (wallet-based)', comFeatureAiPanelBuilder: 'AI Panel Builder',
    comFeatureByok: 'Personal API key (BYOK)', comFeaturePremiumModels: 'Premium AI models (GPT-5.6 Sol, Claude Opus 4.1)',
    comPlanDisplayName: 'Display name (blank = default)', comPlanTokenDiscount: 'AI token discount %',
    comSavePlan: 'Save plan', comMarkupPercent: 'Global markup %', comMultiplier: 'Multiplier', comGrossMargin: 'Gross margin', comMinTopUp: 'Minimum top-up (USD)', comSignupPromo: 'Signup promo credit (USD, retail)', comSaveWalletRules: 'Save wallet rules',
    comSimulatorTitle: 'AI Pricing Simulator', comProviderCost: 'Provider cost (USD)', comRetail: 'Retail', comProfit: 'Gross profit',
    comMarkupRulesTitle: 'Markup overrides', comScopeType: 'Scope type', comScopeKey: 'Scope key (feature/provider/model name)', comAddRule: 'Add override', comRemove: 'Remove', comNoRules: 'No overrides - the global markup applies to everything.',
    comProviderPricingTitle: 'Provider model pricing', comModel: 'Model', comPromptPrice: 'Prompt $/1K', comCompletionPrice: 'Completion $/1K', comFlatPrice: 'Flat $/call (non-token, e.g. image generation)', comAddPricing: 'Add model pricing', comNoModelPricing: 'No model-specific pricing - the provider-level rate (AI tab) applies.',
    comBillingReadinessTitle: 'AI billing readiness', comWalletEnforcedOn: 'Wallet enforcement: ON', comWalletEnforcedOff: 'Wallet enforcement: OFF (platform-funded, unbilled)',
    comInternalSecretConfigured: 'Internal billing bridge: secret configured', comInternalSecretMissing: 'Internal billing bridge: secret NOT configured',
    comBillingReadinessEmpty: 'No AI usage recorded yet.', comPriceConfigured: 'Price configured',
    comCreditDebitTitle: 'Grant / debit a user’s wallet', comUserId: 'User ID', comAmountUsd: 'Amount (USD)', comBalanceType: 'Balance', comBalancePaid: 'Paid', comBalancePromo: 'Promo', comReason: 'Reason (internal note)', comCredit: 'Credit', comDebit: 'Debit',
    comLedgerTitle: 'Recent wallet ledger', comLedgerEmpty: 'No wallet activity yet.', comColTime: 'Time', comColUser: 'User', comColType: 'Type', comColCash: 'Cash Δ', comColPromo: 'Promo Δ', comColProviderModel: 'Provider / model', comColFeature: 'Feature',
    comHistoryTitle: 'Published configuration changes', comHistoryEmpty: 'No changes published yet.', comColKey: 'Config key', comColChangedBy: 'Changed by', comColSummary: 'Summary',
    comSubSubscriptions: 'Subscriptions', comSubStorage: 'Storage', comSubTransactions: 'Transactions',
    comPlanPrice: 'Price (USD / month)',
    comStatActivePlus: 'Active Plus', comStatActivePro: 'Active Pro', comStatActivePersonalized: 'Active Personalized', comStatPastDue: 'Past due', comStatCanceling: 'Canceling', comStatExpired: 'Expired', comStatMrr: 'MRR',
    comStorageProductsTitle: 'Storage Add-on Products', comProductName: 'Name', comProductPrice: 'Price (USD)', comCapacityGb: 'Capacity (GB)', comValidityDays: 'Validity (days)', comDisplayOrder: 'Display order', comEnabled: 'Enabled', comAddProduct: 'Add product', comSaveProduct: 'Save',
    comTransactionsTitle: 'Payment Transactions', comColType: 'Type', comColAmount: 'Amount', comColStatus: 'Status', comColProduct: 'Product', comColConfirmed: 'Confirmed', comConfirm: 'Confirm', comFail: 'Fail', comRefund: 'Refund', comNoTransactions: 'No transactions yet.',
    loading: 'Loading…', errorGeneric: 'Something went wrong.', retry: 'Retry',
    usersSearchPlaceholder: 'Search by name…',
    colDisplayName: 'Display name', colJoined: 'Joined', colLastLogin: 'Last login', colOnline: 'Online', colHoursOnline: 'Hours online', colPurchases: 'Purchases', colTokensUsed: 'Tokens used', colRole: 'Role', colActions: 'Actions',
    yes: 'Yes', no: 'No', online: 'Online', offline: 'Offline',
    pageOf: 'Page {page} of {total}', prev: 'Previous', next: 'Next',
    close: 'Close', save: 'Save', cancel: 'Cancel', saved: 'Saved.',
    roleUser: 'User', roleModerator: 'Moderator', roleAdmin: 'Admin', suspend: 'Suspend', unsuspend: 'Unsuspend', suspended: 'Suspended',
    aiKeyStatusSet: 'Key set', aiKeyStatusNotSet: 'No key set', aiKeyInputPlaceholder: 'New API key', saveKey: 'Save key', aiKeyUpdatedAt: 'Updated {date}',
    pricingPromptLabel: 'Prompt price / 1K tokens', pricingCompletionLabel: 'Completion price / 1K tokens', budgetLabel: 'Monthly token budget', savePricing: 'Save pricing',
    usageChartTitle: 'Token usage by provider', usageChartEmpty: 'No usage recorded yet.',
    dbConnectivity: 'Database connectivity', dbOk: 'Connected', dbFail: 'Unreachable', migrationsApplied: 'Migrations applied', migrationsNone: 'None recorded (in-memory backend)', communityApiHealth: 'Community API', aiGatewayHealth: 'AI gateway', errorTrackingLabel: 'Error tracking', errorTrackingValue: 'Not implemented yet',
    technicalPageSubtitle: 'Live health of the database, background services, and downstream APIs the platform depends on.', statSystemsHealthy: 'Systems healthy',
    xpStatTypes: 'XP types', xpStatOverridden: 'Overridden values', xpNoRows: 'Nothing to show.',
    xpPageSubtitle: 'Every XP source, cap, and mastery requirement the engine reads - override any number, the verification logic stays in code.',
    xpColDefault: 'Default', xpColCurrent: 'Current', xpColEdit: 'Edit', xpColType: 'Type', xpColDomain: 'Domain',
    xpColAchievement: 'Achievement', xpColLevel: 'Level', xpColRequirement: 'Requirement',
    xpResetDefault: 'Reset to default', xpPeriodDay: 'per day', xpPeriodWeek: 'per week',
    xpSectionPoints: 'XP points by type', xpSectionDomainCaps: 'Domain daily caps',
    xpSectionRecurringCap: 'Recurring daily cap (all domains combined)', xpRecurringCapLabel: 'Daily cap',
    xpSectionSourceCaps: 'Per-source max count (e.g. max chart entries per Session)',
    xpSectionSourceTotalCaps: 'Per-source total point ceiling (e.g. max total XP per Trade)',
    xpSectionPeriodCaps: 'Per-type period caps', xpSectionAchievements: 'Achievement points',
    xpSectionMastery: 'Mastery-gate requirements by level',
    marketplacePageSubtitle: 'Every pattern-report listing on the marketplace - review evidence, feature, or delist.',
    marketplaceColTitle: 'Title', marketplaceColSeller: 'Seller', marketplaceColPrice: 'Price', marketplaceColEvidence: 'Evidence', marketplaceColStatus: 'Status', marketplaceColFeatured: 'Featured',
    delistAction: 'Delist', publishAction: 'Publish', featureAction: 'Feature', unfeatureAction: 'Unfeature',
    statusFilterAll: 'All', statusFilterDraft: 'Draft', statusFilterPublished: 'Published', statusFilterDelisted: 'Delisted',
    financialPageSubtitle: 'Marketplace revenue, real AI provider cost, and remaining monthly budget at a glance.',
    statMockRevenue: 'Marketplace revenue (mock)', statAiCostThisMonth: 'AI cost this month', statTokensUsedThisMonth: 'Tokens used this month',
    financeMockRevenueTitle: 'Mock marketplace revenue', financeMockRevenueNote: 'Mock — no real payment processor connected.',
    financeAiCostTitle: 'AI cost estimate (this month)', financeBudgetTitle: 'Remaining budget (this month)',
    noPricingSet: 'No pricing set', noBudgetSet: 'No budget set', tokensUsedLabel: 'tokens used', remainingLabel: 'remaining', budgetOfLabel: 'of {budget}',
    gateError: 'Could not continue.', gateErrorOffline: 'Could not reach the server. Is the community backend running? (npm run dev:community-api)',
    backToApp: 'Back to app', sidebarToggleLabel: 'Toggle menu',
    statTotalUsers: 'Total users', statOnlineNow: 'Online now', statProvidersConfigured: 'Providers configured', statTotalListings: 'Total listings', statPublishedListings: 'Published', statFeaturedListings: 'Featured',
    detailLoadFailed: 'Could not load user details.', noEmail: 'No email on file', noPhone: 'No phone on file',
    // Users list -> dedicated profile page (replaces the old inline accordion row).
    usersPageSubtitle: 'Every account on the platform — search, review, and open a profile.', viewProfile: 'View profile',
    usersBackToLibrary: '← All users', joinedOnLabel: 'Joined {date}', levelCardTitle: 'Level & XP', verificationCardTitle: 'Verification',
    kycStatusLabel: 'Verification (KYC) status', kycNotStarted: 'Not started', kycPending: 'Pending review', kycVerified: 'Verified', kycRejected: 'Rejected', saveKyc: 'Save status',
    profileRoleLabel: 'Product role', profileRoleTrader: 'Trader', profileRoleMentor: 'Mentor', profileRoleTeacher: 'Teacher',
    levelXpLabel: 'Level {level} · {xp} XP', achievementsLabel: 'Achievements', noAchievements: 'No achievements unlocked yet.',
    subscriptionsLabel: 'Subscriptions', noSubscriptions: 'No subscriptions.', mockBadge: 'mock', purchasedOnLabel: 'Purchased {date}',
    aiHealthLabel: 'Health', statusHealthy: 'Healthy', statusDegraded: 'Degraded', statusIdle: 'Idle', statusDisconnected: 'Disconnected', statusUnconfigured: 'Not configured', statusUnknown: 'Not tested yet',
    aiTestNow: 'Test now', aiTestingNow: 'Testing…', aiTestOk: 'Connection OK.', aiLastChecked: 'Last checked {date}', aiLastErrorLabel: 'Last error: {error}',
    // AI & Voice tab page header + section head (Chunk 3 restyle).
    aiPageSubtitle: 'Provider keys, pricing, live health, ElevenLabs voice routing, and platform-wide usage.',
    aiProviderKeysTitle: 'Provider keys & pricing', statHealthyProviders: 'Healthy providers',
voiceProvidersTitle: 'Voice Providers (ElevenLabs)', voiceProvidersHint: 'Admin-managed ElevenLabs credentials and per-language voice routing for the live Voice Mode. Changes apply immediately - no redeploy needed.',
    vpCredentialsTitle: 'Credential profiles', vpAddCredential: 'Add credential profile', vpLabelPlaceholder: 'Profile name (e.g. Primary ElevenLabs Account)', vpKeyPlaceholder: 'Paste the ElevenLabs API key', vpReplaceKeyHint: 'Leave blank to keep the current key', vpSaveCredential: 'Save profile', vpNoCredentials: 'No credential profiles yet.',
    vpKeyHint: 'Key ends in {hint}', vpValidate: 'Validate', vpValidating: 'Validating…', vpDelete: 'Delete', vpDeleteConfirm: 'Delete this credential profile? Any language using it will fall back until a new one is selected.', vpDeleted: 'Credential deleted.',
    vpEnabled: 'Enabled', vpDisabled: 'Disabled', vpValidationUnknown: 'Not validated yet', vpValidationValid: 'Valid', vpValidationInvalid: 'Invalid', vpValidationRestricted: 'Restricted (scope/IP)', vpLastValidated: 'Last validated {date}', vpNeverValidated: 'Never validated', vpValidationErrorCode: 'Reason: {code}', vpValidateInconclusive: 'Could not reach ElevenLabs right now ({code}) - this does not mean the key is invalid. Try validating again.',
    vpCharactersTitle: 'Character voice routing', vpCharacterEnable: 'Use ElevenLabs for this character', vpCredentialSelect: 'Credential profile', vpNoCredentialSelected: 'No credential selected',
    vpCharacterHunter: 'Hunter', vpCharacterCommander: 'Commander', vpCharacterEngineer: 'Engineer', vpCharacterSage: 'Sage', vpGenderMale: 'Male', vpGenderFemale: 'Female', vpTestLanguage: 'Test language',
    vpVoiceSearch: 'Search voices…', vpVoiceId: 'Voice ID', vpLoadVoices: 'Load voices', vpModelSelect: 'Model', vpLoadModels: 'Load models', vpFallback: 'OpenAI fallback', vpSaveLanguage: 'Save', vpSaved: 'Saved.',
    vpTestSample: 'Generate test sample', vpTestGenerating: 'Generating…', vpTestCreditsWarning: 'This generates real audio and consumes ElevenLabs credits.', vpTestTextPlaceholder: 'Short sample text',
    vpHealthTitle: 'Health & usage', vpStatusReady: 'Ready', vpStatusDisabled: 'Disabled', vpStatusUnconfigured: 'Not configured', vpStatusInvalidCredential: 'Invalid credential', vpStatusDegraded: 'Degraded',
    vpRequests24h: 'Requests (24h)', vpSuccessRate: 'Success rate', vpAvgLatency: 'Avg latency', vpLastSuccess: 'Last success', vpLastError: 'Last error', vpNoUsageYet: 'No usage yet', vpValidateFirst: 'Select and validate a credential first',
    vpQuotaRefresh: 'Refresh quota', vpQuotaTier: 'Tier {tier}', vpQuotaCharacters: '{used} / {limit} characters used', vpQuotaRemaining: '{count} remaining (nominal)', vpQuotaNextReset: 'Resets {date}', vpQuotaOverage: 'Overage allowed', vpQuotaUnavailable: 'Quota unavailable', vpAnalyticsUnavailable: 'Usage permission unavailable',
    aiTodayTokensLabel: 'Today', aiMonthTokensLabel: 'This month', aiEstCostLabel: 'Est. cost',
    aiTrendTitle: 'Daily usage (last 14 days)', aiTrendEmpty: 'No usage in this window yet.',
    aiRecentEventsTitle: 'Recent AI events', aiRecentEventsEmpty: 'No AI calls recorded yet.',
    aiRecentColTime: 'Time', aiRecentColProvider: 'Provider', aiRecentColSource: 'Source', aiRecentColStatus: 'Status', aiRecentColLatency: 'Latency',
    aiTopUsersTitle: 'Top users by token usage', aiTopUsersEmpty: 'No usage recorded yet.', aiTopUsersColUser: 'User', aiTopUsersColTokens: 'Tokens',
    usageByProviderLabel: 'Token usage by provider', noProviderUsage: 'No AI usage recorded for this user yet.',
    aiCostSectionTitle: 'AI cost & charge (real, per model)', aiCostProviderCost: 'Provider cost', aiCostRetailCharge: 'Retail charge',
    aiCostRateCardHint: 'Calculated from actual token usage x your configured provider pricing (a rate card) - not a reconciled OpenAI invoice.',
    aiCostModel: 'Model', aiCostCalls: 'Calls', aiCostNoData: 'No real per-model AI cost recorded for this user yet.',
    aiCostReconMatches: 'Wallet settlements match usage', aiCostReconMismatch: 'Wallet settlements do not match usage',
    aiCostReconExpected: 'Expected retail charge', aiCostReconSettled: 'Actual wallet movement',
    aiCostReconSampleLimited: '(based on the most recent 100 settlements only)',
    aiCostSettlementsTitle: 'Wallet settlements', aiCostCashDebit: 'Cash debit', aiCostPromoDebit: 'Promo debit',
    aiUsageByModelTitle: 'Real settled cost by model (all users)', aiUsageByModelEmpty: 'No real per-model AI cost recorded yet.',
    aiCostProvider: 'Provider', aiCostPromptTokens: 'Prompt tokens', aiCostCompletionTokens: 'Completion tokens', aiCostTotalTokens: 'Total tokens',
    // Crypto payments (BSC) - admin config sub-tab (admin-config task). Unlike the rest of the
    // Commercial tab (deliberately English-only, see commercialSubNav's own comment), this
    // surface is fully localized in en/fa/ar/es.
    comSubCryptoPayments: 'Crypto payments',
    cryptoPayStatusTitle: 'Provider status', cryptoPayModeBsc: 'BSC Crypto', cryptoPayModeManual: 'Manual',
    cryptoPayConfigComplete: 'Configuration complete', cryptoPayRpcConfigured: 'RPC configured', cryptoPayWebhookConfigured: 'Webhook configured',
    cryptoPayYes: 'Yes', cryptoPayNo: 'No', cryptoPayLastTested: 'Last tested {date}', cryptoPayTestOk: 'succeeded', cryptoPayTestFailed: 'failed',
    cryptoPayDetectedChain: 'chain {chainId}', cryptoPayNeverTested: 'Connection never tested',
    cryptoPayNewInvoicesWarning: 'Changes here only affect invoices created after saving - existing invoices keep their original snapshot.',
    cryptoPayEnable: 'Enable BSC crypto payments', cryptoPayDisable: 'Disable BSC crypto payments',
    cryptoPayPublicTitle: 'Public BSC settings', cryptoPayChainId: 'Chain ID', cryptoPayDepositAddress: 'Deposit wallet address',
    cryptoPayTokenSymbol: 'Token symbol', cryptoPayTokenContract: 'Token contract (BEP-20)', cryptoPayTokenDecimals: 'Token decimals',
    cryptoPayExchangeRate: 'USD per token', cryptoPayConfirmations: 'Confirmations required', cryptoPayExpiryMinutes: 'Invoice expiry (minutes)',
    cryptoPaySavePublic: 'Save public settings',
    cryptoPayRpcTitle: 'RPC connection', cryptoPayRpcConfiguredBadge: 'RPC URL: configured', cryptoPayRpcNotConfiguredBadge: 'RPC URL: not configured',
    cryptoPayRpcUrl: 'BSC RPC URL', cryptoPaySaveRpc: 'Save / rotate RPC URL',
    cryptoPayReplaceRpcHint: 'Enter a new URL to replace the saved one - the current value is never shown here.',
    cryptoPayClearRpc: 'Clear', cryptoPayClearRpcConfirm: 'Clear the saved RPC URL? BSC crypto payments will be disabled if currently enabled.',
    cryptoPayTestButton: 'Test connection', cryptoPayTestSuccess: 'Connected - reported chain {chainId}',
    cryptoPayTestChainMismatch: '(configured chain is {configured})', cryptoPayTestFailedReason: 'Test failed: {reason}',
    cryptoPayWebhookTitle: 'Webhook secret (optional)', cryptoPayWebhookHint: 'Configured (ends in {hint})',
    cryptoPayWebhookNotConfiguredBadge: 'Not configured - the webhook endpoint refuses every request until one is generated',
    cryptoPayGenerateWebhook: 'Generate / rotate secret',
    cryptoPayRotateWebhookConfirm: 'Rotating replaces the current secret - any existing webhook sender must be updated with the new value. Continue?',
    cryptoPayClearWebhook: 'Clear',
    cryptoPayClearWebhookConfirm: 'Clear the webhook secret? The webhook endpoint will refuse every request until a new one is generated.',
    cryptoPayWebhookRevealed: 'New webhook secret: {secret}',
    cryptoPayWebhookNeverShownAgain: 'This value is shown once and cannot be retrieved again - copy it now.',

    // AI Cost Control - admin config sub-tab. Fully localized, same convention as Crypto payments
    // directly above (the two newest, most-scrutinized Commercial additions).
    comSubAiCostControl: 'AI Cost Control',
    aiccStatusOk: 'Reconciled', aiccStatusNoAdapter: 'No official cost reconciliation adapter configured',
    aiccStatusNotConfigured: 'Not configured', aiccStatusNotSynced: 'Never synced for this range',
    aiccStatusNotComparableCurrency: 'Not comparable - provider currency differs from USD',
    aiccRangeLabel: 'Time range', aiccRange24h: 'Last 24 hours', aiccRange7d: 'Last 7 days', aiccRange30d: 'Last 30 days',
    aiccRangeMonth: 'Current month', aiccRangeCustom: 'Custom UTC range',
    aiccCustomStart: 'Start (UTC)', aiccCustomEnd: 'End (UTC)', aiccApplyRange: 'Apply', aiccRangeUtcHint: 'All ranges are UTC. Provider cost data is daily-bucketed by the official API and may be delayed - it is not necessarily real-time.',
    aiccOverviewTitle: 'Overview',
    aiccNotComparable: 'Not comparable',
    aiccOverviewExternalCost: 'External actual provider cost', aiccSourceProviderApi: 'Provider official cost API',
    aiccOverviewInternalEstimate: 'Internal provider-cost estimate', aiccSourceInternalEstimate: 'Internal rate-card estimate',
    aiccOverviewRetailCharge: 'Retail user charges', aiccSourceRetailCharge: 'Retail wallet charge',
    aiccOverviewWalletDebit: 'Actual wallet debits', aiccOverviewMargin: 'Margin (retail - external actual)',
    aiccOverviewReconciliation: 'Reconciliation exceptions', aiccOverviewFreshness: 'Providers with comparable data',
    aiccFreshnessStale: 'stale', aiccFreshnessComparable: 'comparable',
    aiccProvidersTitle: 'Providers',
    aiccColProvider: 'Provider', aiccColStatus: 'Status', aiccColExternalCost: 'External cost', aiccColInternalEstimate: 'Internal estimate',
    aiccColDiff: 'Difference', aiccColRetailCharge: 'Retail charge', aiccColBalance: 'Balance', aiccColLastSync: 'Last successful sync',
    aiccColScope: 'Scope / project', aiccColActions: 'Actions',
    aiccOutOfTolerance: 'Out of tolerance',
    aiccBalanceUnavailable: 'Balance unavailable via official API', aiccBalanceManualLabel: 'Manual, not used for reconciliation',
    aiccRefreshBtn: 'Refresh', aiccRefreshing: 'Refreshing…', aiccRefreshSuccess: 'Refreshed successfully', aiccRefreshFailed: 'Refresh failed',
    aiccRefreshProjectMismatch: 'OpenAI returned {total} real cost line item(s) for your organization, but none were tagged to the configured Project id - double-check it against a real project id at platform.openai.com/settings/organization/projects.',
    aiccConfigureBtn: 'Configure a credential below to enable',
    aiccModelsTitle: 'Models',
    aiccColInputTokens: 'Input tokens', aiccColOutputTokens: 'Output tokens', aiccColCachedTokens: 'Cached input tokens',
    aiccColCacheWriteTokens: 'Cache-write tokens', aiccColReasoningTokens: 'Reasoning tokens (informational)',
    aiccColExternalCostModel: 'External cost',
    aiccModelExternalNotSupported: 'Not supported at model level for this provider',
    aiccReconciliationTitle: 'Reconciliation',
    aiccReconInternalTitle: 'Internal wallet / usage reconciliation (exact)',
    aiccReconMatched: 'Matched', aiccReconMissingSettlement: 'Missing settlement', aiccReconOrphanSettlement: 'Orphan settlement',
    aiccReconAmountMismatch: 'Amount mismatch', aiccReconProviderModelMismatch: 'Provider/model mismatch', aiccReconExcluded: 'Excluded (non-billable)',
    aiccReconTruncated: 'This range has more rows than could be scanned in one pass - counts above reflect only the rows scanned. Narrow the range for an exact total.',
    aiccExceptionsTitle: 'Exceptions',
    aiccColExceptionType: 'Type', aiccColKey: 'Key', aiccColOccurredAt: 'Occurred at',
    aiccReconExternalTitle: 'External provider reconciliation (expected to vary)',
    aiccToleranceLabel: 'Warning tolerance (%)', aiccToleranceSave: 'Save',
    aiccCredentialsTitle: 'Provider cost-reconciliation credentials',
    aiccTestConnection: 'Test connection', aiccTestConnectionSuccess: 'Connection succeeded', aiccTestConnectionFailed: 'Connection failed',
    aiccDeleteCredential: 'Delete', aiccDeleteCredentialConfirm: 'Delete this credential? Reconciliation for this provider will stop working until a new one is added.',
    aiccColLabel: 'Label', aiccApiKey: 'API key (organization admin key)', aiccProjectId: 'Dedicated project id',
    aiccAddCredential: 'Add credential',
    aiccScopeConfigHint: 'For OpenAI, use a dedicated organization ADMIN key (not the normal model API key) and a dedicated NAVRYA project id, so unrelated organization usage is never counted.',
    aiccBalanceManualTitle: 'Manual balance snapshot (optional)',
    aiccBalanceManualAmount: 'Amount (USD)', aiccBalanceManualNote: 'Note', aiccBalanceManualSave: 'Save snapshot',

    tabConversationStudio: 'Conversation Studio',
    convStudioTitle: 'Conversation Studio', convStudioHint: 'Author, test, and publish the deterministic scenarios the Conversation Router matches locally, with zero AI calls.',
    convStudioStatTotal: 'Total scenarios', convStudioStatPublished: 'Published', convStudioStatDraft: 'Draft',
    convStudioCreateTitle: 'Create a scenario', convStudioScenarioKey: 'Scenario key (e.g. session.purpose)', convStudioDomain: 'Domain', convStudioKind: 'Kind',
    convStudioKindFaq: 'FAQ', convStudioKindDataQuery: 'Data query', convStudioKindSurfaceHelp: 'Surface help', convStudioCreate: 'Create', convStudioKeyRequired: 'A scenario key is required.',
    convStudioColKey: 'Key', convStudioColDomain: 'Domain', convStudioColKind: 'Kind', convStudioColStatus: 'Status', convStudioColVersion: 'Version', convStudioColLanguages: 'Languages', convStudioColUpdated: 'Updated', convStudioColPublishedAt: 'Published',
    convStudioStatusPublished: 'Published', convStudioStatusDraft: 'Draft', convStudioStatusArchived: 'Archived',
    convStudioVersionHistory: 'Version history', convStudioRollback: 'Rollback', convStudioRollbackConfirm: 'Roll back to this version? This creates a new, immediately-published version with this version\'s exact content - it never resurrects the old version in place.',
    convStudioTriggerLab: 'Trigger Lab', convStudioTriggerLabHint: 'Runs the exact same matcher production uses, against this draft plus every other published scenario - zero LLM calls.',
    convStudioTestUtterance: 'Test utterance', convStudioRunTest: 'Test', convStudioResolution: 'Resolution', convStudioScore: 'Score', convStudioReasons: 'Reasons',
    convStudioRunBatch: 'Run test corpus', convStudioPositiveRate: 'Positive pass rate', convStudioNegativeRate: 'Negative rejection rate',
    convStudioCheckCollisions: 'Check collisions', convStudioNoCollisions: 'No collisions found against the currently published scenarios.',
    convStudioBackToLibrary: '← Back to library', convStudioUnarchive: 'Unarchive', convStudioArchive: 'Archive', convStudioNewRevision: 'New revision',
    convStudioNoDraft: 'No draft in progress - click "New revision" to start editing the next version.', convStudioEditingDraft: 'Editing draft',
    convStudioCta: 'Suggested action (CTA)', convStudioCtaNone: 'None',
    convStudioCorpusPositive: 'Test corpus - positive examples (one per line)', convStudioCorpusNegative: 'Test corpus - negative examples (one per line)',
    convStudioGroups: 'Concept groups (one group per line, terms separated by |)', convStudioStrong: 'Strong phrases (one per line)', convStudioNegative: 'Negative phrases (one per line)',
    convStudioWrittenResponse: 'Written response', convStudioVoiceResponse: 'Spoken (voice) response',
    convStudioSaveDraft: 'Save draft', convStudioPublish: 'Publish', convStudioPublished: 'Published.', convStudioPublishBlocked: 'Publish blocked',
    convStudioAudioTitle: 'Published audio', convStudioAudioNotEligible: 'Data-query scenarios use live per-user values and can never have static published audio.',
    convStudioAudioNoText: 'No spoken or written response yet - nothing to generate audio from.', convStudioAudioNoneYet: 'No audio generated yet for this language.',
    convStudioAudioApproved: 'Approved - live for Voice users', convStudioAudioStale: 'stale (text changed since this was generated)',
    convStudioAudioStaleBlocked: 'This candidate no longer matches the current text - regenerate before approving.',
    convStudioAudioPreview: 'Preview - not yet live', convStudioAudioUsedWrittenFallback: 'used the written response (no separate voice response was set)',
    convStudioAudioApprove: 'Approve', convStudioAudioArchive: 'Archive', convStudioAudioGenerate: 'Generate', convStudioAudioGenerating: 'Generating…',
    convStudioAudioVoiceProfileKey: 'Voice profile label',
    convStudioExpressiveVoice: 'Expressive Voice', convStudioEnhanceDelivery: 'Enhance Delivery', convStudioEnhancing: 'Enhancing…',
    convStudioDeliveryNote: 'Delivery note (optional)', convStudioDeliveryNotePlaceholder: 'e.g. warm and curious',
    convStudioPerformanceValid: 'Valid - matches the canonical dialogue', convStudioPerformanceInvalid: 'Not used - ',
    convStudioVariants: 'Context variants', convStudioAddVariant: '+ Add context variant',
    convStudioVariantKey: 'Variant key (e.g. FIRST_TIME)', convStudioRemoveVariant: 'Remove variant',
    convStudioContext: 'Context', convStudioExposure: 'Exposure', convStudioExposureAny: 'Any',
    convStudioExposureFirstTime: 'First time', convStudioExposureNthOrLater: 'Nth time or later',
    convStudioExposureThreshold: 'Threshold (N)', convStudioSurface: 'Surface', convStudioSurfaceAny: 'Any'
  },
  fa: {
    brand: 'پنل مدیریت',
    loginHint: 'با حساب مدیریتی خود وارد شوید.', emailLabel: 'ایمیل', passwordLabel: 'رمز عبور', loginSubmit: 'ورود',
    gateErrorNotAdmin: 'این حساب دسترسی مدیریت ندارد.', gateErrorInvalidCredentials: 'ایمیل یا رمز عبور اشتباه است.',
    enforcementWarning: 'هشدار: ADMIN_AUTH_ENFORCED روی سرور تنظیم نشده — فعلاً هر حسابی دسترسی مدیریت داره. مقدار ADMIN_AUTH_ENFORCED=true رو تنظیم کنید.',
    tabUsers: 'کاربران', tabAI: 'هوش مصنوعی', tabTechnical: 'فنی', tabXP: 'XP و بخش‌بندی', tabMarketplace: 'بازار', tabFinancial: 'مالی',
    loading: 'در حال بارگذاری…', errorGeneric: 'خطایی رخ داد.', retry: 'تلاش دوباره',
    usersSearchPlaceholder: 'جست‌وجو بر اساس نام…',
    colDisplayName: 'نام نمایشی', colJoined: 'تاریخ عضویت', colLastLogin: 'آخرین ورود', colOnline: 'وضعیت', colHoursOnline: 'ساعات آنلاین', colPurchases: 'خریدها', colTokensUsed: 'توکن مصرفی', colRole: 'نقش', colActions: 'عملیات',
    yes: 'بله', no: 'خیر', online: 'آنلاین', offline: 'آفلاین',
    pageOf: 'صفحهٔ {page} از {total}', prev: 'قبلی', next: 'بعدی',
    close: 'بستن', save: 'ذخیره', cancel: 'انصراف', saved: 'ذخیره شد.',
    roleUser: 'کاربر', roleModerator: 'ناظر', roleAdmin: 'مدیر', suspend: 'مسدود کردن', unsuspend: 'رفع مسدودی', suspended: 'مسدود',
    aiKeyStatusSet: 'کلید تنظیم شده', aiKeyStatusNotSet: 'کلیدی تنظیم نشده', aiKeyInputPlaceholder: 'کلید API جدید', saveKey: 'ذخیرهٔ کلید', aiKeyUpdatedAt: 'به‌روزرسانی {date}',
    pricingPromptLabel: 'قیمت هر ۱۰۰۰ توکن پرامپت', pricingCompletionLabel: 'قیمت هر ۱۰۰۰ توکن پاسخ', budgetLabel: 'سقف توکن ماهانه', savePricing: 'ذخیرهٔ قیمت‌گذاری',
    usageChartTitle: 'مصرف توکن به تفکیک سرویس‌دهنده', usageChartEmpty: 'هنوز مصرفی ثبت نشده است.',
    dbConnectivity: 'اتصال پایگاه‌داده', dbOk: 'متصل', dbFail: 'در دسترس نیست', migrationsApplied: 'مهاجرت‌های اعمال‌شده', migrationsNone: 'ثبت نشده (بک‌اند حافظه‌ای)', communityApiHealth: 'سرور بخش انجمن', aiGatewayHealth: 'دروازهٔ هوش مصنوعی', errorTrackingLabel: 'ثبت خطا', errorTrackingValue: 'هنوز پیاده‌سازی نشده',
    technicalPageSubtitle: 'سلامت زندهٔ پایگاه‌داده، سرویس‌های پس‌زمینه و APIهای وابسته‌ای که پلتفرم به آن‌ها متکی است.', statSystemsHealthy: 'سیستم‌های سالم',
    xpStatTypes: 'نوع رویداد XP', xpStatOverridden: 'مقادیر تغییریافته', xpNoRows: 'چیزی برای نمایش نیست.',
    xpPageSubtitle: 'همهٔ منابع امتیاز، سقف‌ها و الزامات تسلط که موتور می‌خواند - هر عدد را تغییر بده، منطق اعتبارسنجی همچنان در کد باقی می‌ماند.',
    xpColDefault: 'پیش‌فرض', xpColCurrent: 'فعلی', xpColEdit: 'ویرایش', xpColType: 'نوع', xpColDomain: 'حوزه',
    xpColAchievement: 'دستاورد', xpColLevel: 'سطح', xpColRequirement: 'شرط',
    xpResetDefault: 'بازگشت به پیش‌فرض', xpPeriodDay: 'در روز', xpPeriodWeek: 'در هفته',
    xpSectionPoints: 'امتیاز هر نوع رویداد', xpSectionDomainCaps: 'سقف روزانه هر حوزه',
    xpSectionRecurringCap: 'سقف روزانه کل فعالیت‌های تکرارشونده', xpRecurringCapLabel: 'سقف روزانه',
    xpSectionSourceCaps: 'حداکثر تعداد در هر منبع (مثلاً حداکثر Chart Entry در هر Session)',
    xpSectionSourceTotalCaps: 'سقف کل امتیاز هر منبع (مثلاً حداکثر امتیاز هر Trade)',
    xpSectionPeriodCaps: 'سقف دوره‌ای هر نوع', xpSectionAchievements: 'امتیاز دستاوردها',
    xpSectionMastery: 'شرایط عبور از هر سطح (Mastery Gate)',
    marketplacePageSubtitle: 'همهٔ آگهی‌های گزارش الگو در بازار - شواهد را بررسی کن، ویژه کن یا از فهرست خارج کن.',
    marketplaceColTitle: 'عنوان', marketplaceColSeller: 'فروشنده', marketplaceColPrice: 'قیمت', marketplaceColEvidence: 'شواهد', marketplaceColStatus: 'وضعیت', marketplaceColFeatured: 'ویژه',
    delistAction: 'حذف از بازار', publishAction: 'انتشار', featureAction: 'ویژه کردن', unfeatureAction: 'برداشتن ویژه',
    statusFilterAll: 'همه', statusFilterDraft: 'پیش‌نویس', statusFilterPublished: 'منتشرشده', statusFilterDelisted: 'حذف‌شده',
    financialPageSubtitle: 'درآمد بازار، هزینهٔ واقعی سرویس‌دهنده‌های هوش مصنوعی و بودجهٔ باقی‌ماندهٔ ماهانه، در یک نگاه.',
    statMockRevenue: 'درآمد بازار (آزمایشی)', statAiCostThisMonth: 'هزینهٔ هوش مصنوعی این ماه', statTokensUsedThisMonth: 'توکن مصرف‌شده این ماه',
    financeMockRevenueTitle: 'درآمد آزمایشی بازار', financeMockRevenueNote: 'آزمایشی — به هیچ درگاه پرداخت واقعی متصل نیست.',
    financeAiCostTitle: 'برآورد هزینهٔ هوش مصنوعی (این ماه)', financeBudgetTitle: 'باقی‌ماندهٔ بودجه (این ماه)',
    noPricingSet: 'قیمتی تنظیم نشده', noBudgetSet: 'بودجه‌ای تنظیم نشده', tokensUsedLabel: 'توکن مصرف‌شده', remainingLabel: 'باقی‌مانده', budgetOfLabel: 'از {budget}',
    gateError: 'ادامه ممکن نشد.', gateErrorOffline: 'اتصال به سرور برقرار نشد. سرور بخش انجمن اجرا شده؟ (npm run dev:community-api)',
    backToApp: 'بازگشت به برنامه', sidebarToggleLabel: 'باز/بسته کردن منو',
    statTotalUsers: 'مجموع کاربران', statOnlineNow: 'آنلاین الان', statProvidersConfigured: 'سرویس‌دهنده‌های تنظیم‌شده', statTotalListings: 'مجموع آگهی‌ها', statPublishedListings: 'منتشرشده', statFeaturedListings: 'ویژه',
    detailLoadFailed: 'جزئیات کاربر بارگذاری نشد.', noEmail: 'ایمیلی ثبت نشده', noPhone: 'شماره‌ای ثبت نشده',
    usersPageSubtitle: 'همه‌ی حساب‌های پلتفرم — جست‌وجو، بررسی و باز کردن پروفایل.', viewProfile: 'مشاهده پروفایل',
    usersBackToLibrary: '← همه‌ی کاربران', joinedOnLabel: 'عضویت از {date}', levelCardTitle: 'سطح و امتیاز', verificationCardTitle: 'احراز هویت',
    kycStatusLabel: 'وضعیت احراز هویت (KYC)', kycNotStarted: 'شروع نشده', kycPending: 'در حال بررسی', kycVerified: 'تأیید شده', kycRejected: 'رد شده', saveKyc: 'ذخیرهٔ وضعیت',
    profileRoleLabel: 'نقش محصولی', profileRoleTrader: 'معامله‌گر', profileRoleMentor: 'منتور', profileRoleTeacher: 'مدرس',
    levelXpLabel: 'سطح {level} · {xp} امتیاز', achievementsLabel: 'دستاوردها', noAchievements: 'هنوز دستاوردی باز نشده است.',
    subscriptionsLabel: 'اشتراک‌ها', noSubscriptions: 'اشتراکی وجود ندارد.', mockBadge: 'آزمایشی', purchasedOnLabel: 'خریداری‌شده در {date}',
    aiHealthLabel: 'سلامت', statusHealthy: 'سالم', statusDegraded: 'ناپایدار', statusIdle: 'بی‌فعالیت', statusDisconnected: 'قطع شده', statusUnconfigured: 'پیکربندی نشده', statusUnknown: 'هنوز تست نشده',
    aiTestNow: 'تست همین حالا', aiTestingNow: 'در حال تست…', aiTestOk: 'اتصال برقرار است.', aiLastChecked: 'آخرین بررسی {date}', aiLastErrorLabel: 'آخرین خطا: {error}',
    aiPageSubtitle: 'کلیدهای سرویس‌دهنده، قیمت‌گذاری، سلامت زنده، مسیردهی صدای ElevenLabs و مصرف کل پلتفرم.',
    aiProviderKeysTitle: 'کلیدهای سرویس‌دهنده و قیمت‌گذاری', statHealthyProviders: 'سرویس‌دهنده‌های سالم',
    voiceProvidersTitle: 'ارائه‌دهنده‌های صدا (ElevenLabs)', voiceProvidersHint: 'کلیدهای ElevenLabs و مسیردهی صدا به‌ازای هر زبان، مدیریت‌شده توسط ادمین - برای حالت صوتی زنده. تغییرات بلافاصله اعمال می‌شوند، بدون نیاز به دیپلوی دوباره.',
    vpCredentialsTitle: 'پروفایل‌های کلید', vpAddCredential: 'افزودن پروفایل کلید', vpLabelPlaceholder: 'نام پروفایل (مثلاً حساب اصلی ElevenLabs)', vpKeyPlaceholder: 'کلید API ElevenLabs را وارد کن', vpReplaceKeyHint: 'برای نگه‌داشتن کلید فعلی، خالی بگذار', vpSaveCredential: 'ذخیرهٔ پروفایل', vpNoCredentials: 'هنوز پروفایل کلیدی ثبت نشده است.',
    vpKeyHint: 'کلید با {hint} تمام می‌شود', vpValidate: 'اعتبارسنجی', vpValidating: 'در حال اعتبارسنجی…', vpDelete: 'حذف', vpDeleteConfirm: 'این پروفایل کلید حذف شود؟ هر زبانی که از آن استفاده می‌کند، تا انتخاب یک پروفایل جدید به حالت پیش‌فرض برمی‌گردد.', vpDeleted: 'کلید حذف شد.',
    vpEnabled: 'فعال', vpDisabled: 'غیرفعال', vpValidationUnknown: 'هنوز اعتبارسنجی نشده', vpValidationValid: 'معتبر', vpValidationInvalid: 'نامعتبر', vpValidationRestricted: 'محدودشده (دسترسی/IP)', vpLastValidated: 'آخرین اعتبارسنجی {date}', vpNeverValidated: 'هرگز اعتبارسنجی نشده', vpValidationErrorCode: 'دلیل: {code}', vpValidateInconclusive: 'در حال حاضر امکان اتصال به ElevenLabs نبود ({code}) - این به معنای نامعتبر بودن کلید نیست. دوباره اعتبارسنجی کن.',
    vpCharactersTitle: 'مسیردهی صدای شخصیت‌ها', vpCharacterEnable: 'استفاده از ElevenLabs برای این شخصیت', vpCredentialSelect: 'پروفایل کلید', vpNoCredentialSelected: 'کلیدی انتخاب نشده',
    vpCharacterHunter: 'شکارچی', vpCharacterCommander: 'فرمانده', vpCharacterEngineer: 'مهندس', vpCharacterSage: 'حکیم', vpGenderMale: 'مرد', vpGenderFemale: 'زن', vpTestLanguage: 'زبان آزمایش',
    vpVoiceSearch: 'جست‌وجوی صداها…', vpVoiceId: 'شناسهٔ صدا', vpLoadVoices: 'بارگذاری صداها', vpModelSelect: 'مدل', vpLoadModels: 'بارگذاری مدل‌ها', vpFallback: 'پشتیبان OpenAI', vpSaveLanguage: 'ذخیره', vpSaved: 'ذخیره شد.',
    vpTestSample: 'ساخت نمونهٔ آزمایشی', vpTestGenerating: 'در حال ساخت…', vpTestCreditsWarning: 'این کار صدای واقعی می‌سازد و از اعتبار ElevenLabs کم می‌کند.', vpTestTextPlaceholder: 'متن کوتاه نمونه',
    vpHealthTitle: 'سلامت و مصرف', vpStatusReady: 'آماده', vpStatusDisabled: 'غیرفعال', vpStatusUnconfigured: 'تنظیم نشده', vpStatusInvalidCredential: 'کلید نامعتبر', vpStatusDegraded: 'افت کیفیت',
    vpRequests24h: 'درخواست‌ها (۲۴ ساعت)', vpSuccessRate: 'نرخ موفقیت', vpAvgLatency: 'میانگین تأخیر', vpLastSuccess: 'آخرین موفقیت', vpLastError: 'آخرین خطا', vpNoUsageYet: 'هنوز مصرفی ثبت نشده', vpValidateFirst: 'ابتدا یک کلید را انتخاب و اعتبارسنجی کن',
    vpQuotaRefresh: 'به‌روزرسانی سهمیه', vpQuotaTier: 'سطح {tier}', vpQuotaCharacters: '{used} از {limit} کاراکتر مصرف شده', vpQuotaRemaining: '{count} باقی‌مانده (تخمینی)', vpQuotaNextReset: 'بازنشانی در {date}', vpQuotaOverage: 'مصرف اضافه مجاز است', vpQuotaUnavailable: 'سهمیه در دسترس نیست', vpAnalyticsUnavailable: 'دسترسی به آمار مصرف موجود نیست',
    aiTodayTokensLabel: 'امروز', aiMonthTokensLabel: 'این ماه', aiEstCostLabel: 'هزینهٔ تخمینی',
    aiTrendTitle: 'مصرف روزانه (۱۴ روز اخیر)', aiTrendEmpty: 'در این بازه مصرفی ثبت نشده است.',
    aiRecentEventsTitle: 'رویدادهای اخیر هوش مصنوعی', aiRecentEventsEmpty: 'هنوز هیچ فراخوانی هوش مصنوعی ثبت نشده است.',
    aiRecentColTime: 'زمان', aiRecentColProvider: 'سرویس‌دهنده', aiRecentColSource: 'منبع', aiRecentColStatus: 'وضعیت', aiRecentColLatency: 'تأخیر',
    aiTopUsersTitle: 'پرمصرف‌ترین کاربران (توکن)', aiTopUsersEmpty: 'هنوز مصرفی ثبت نشده است.', aiTopUsersColUser: 'کاربر', aiTopUsersColTokens: 'توکن',
    usageByProviderLabel: 'مصرف توکن به تفکیک سرویس‌دهنده', noProviderUsage: 'هنوز مصرف هوش مصنوعی برای این کاربر ثبت نشده است.',
    aiCostSectionTitle: 'هزینه و مبلغ دریافتی هوش مصنوعی (واقعی، به تفکیک مدل)', aiCostProviderCost: 'هزینه واقعی سرویس‌دهنده', aiCostRetailCharge: 'مبلغ دریافتی از کاربر',
    aiCostRateCardHint: 'محاسبه‌شده از مصرف واقعی توکن ضربدر نرخ پیکربندی‌شده‌ی شما - نه صورت‌حساب تطبیق‌داده‌شده‌ی OpenAI.',
    aiCostModel: 'مدل', aiCostCalls: 'تعداد فراخوانی', aiCostNoData: 'هنوز هزینه واقعی هوش مصنوعی برای این کاربر ثبت نشده است.',
    aiCostReconMatches: 'تسویه‌های کیف پول با مصرف مطابقت دارد', aiCostReconMismatch: 'تسویه‌های کیف پول با مصرف مطابقت ندارد',
    aiCostReconExpected: 'مبلغ مورد انتظار از کاربر', aiCostReconSettled: 'مبلغ واقعی کسر شده از کیف پول',
    aiCostReconSampleLimited: '(فقط بر اساس ۱۰۰ تسویه اخیر)',
    aiCostSettlementsTitle: 'تسویه‌های کیف پول', aiCostCashDebit: 'کسر از موجودی نقدی', aiCostPromoDebit: 'کسر از موجودی هدیه',
    aiUsageByModelTitle: 'هزینه واقعی تسویه‌شده به تفکیک مدل (همه کاربران)', aiUsageByModelEmpty: 'هنوز هزینه واقعی هوش مصنوعی به تفکیک مدل ثبت نشده است.',
    aiCostProvider: 'سرویس‌دهنده', aiCostPromptTokens: 'توکن‌های ورودی', aiCostCompletionTokens: 'توکن‌های خروجی', aiCostTotalTokens: 'مجموع توکن‌ها',
    comSubCryptoPayments: 'پرداخت‌های ارز دیجیتال',
    cryptoPayStatusTitle: 'وضعیت درگاه پرداخت', cryptoPayModeBsc: 'ارز دیجیتال BSC', cryptoPayModeManual: 'دستی',
    cryptoPayConfigComplete: 'پیکربندی کامل است', cryptoPayRpcConfigured: 'آدرس RPC تنظیم شده', cryptoPayWebhookConfigured: 'وب‌هوک تنظیم شده',
    cryptoPayYes: 'بله', cryptoPayNo: 'خیر', cryptoPayLastTested: 'آخرین آزمایش: {date}', cryptoPayTestOk: 'موفق', cryptoPayTestFailed: 'ناموفق',
    cryptoPayDetectedChain: 'زنجیره {chainId}', cryptoPayNeverTested: 'اتصال هنوز آزمایش نشده است',
    cryptoPayNewInvoicesWarning: 'این تغییرات فقط روی فاکتورهای جدید پس از ذخیره اثر می‌گذارد - فاکتورهای موجود مقادیر ثبت‌شده‌ی خود را حفظ می‌کنند.',
    cryptoPayEnable: 'فعال‌سازی پرداخت ارز دیجیتال BSC', cryptoPayDisable: 'غیرفعال‌سازی پرداخت ارز دیجیتال BSC',
    cryptoPayPublicTitle: 'تنظیمات عمومی BSC', cryptoPayChainId: 'شناسه زنجیره', cryptoPayDepositAddress: 'آدرس کیف پول دریافت',
    cryptoPayTokenSymbol: 'نماد توکن', cryptoPayTokenContract: 'قرارداد توکن (BEP-20)', cryptoPayTokenDecimals: 'اعشار توکن',
    cryptoPayExchangeRate: 'دلار به ازای هر توکن', cryptoPayConfirmations: 'تعداد تأییدیه‌های لازم', cryptoPayExpiryMinutes: 'انقضای فاکتور (دقیقه)',
    cryptoPaySavePublic: 'ذخیره تنظیمات عمومی',
    cryptoPayRpcTitle: 'اتصال RPC', cryptoPayRpcConfiguredBadge: 'آدرس RPC: تنظیم شده', cryptoPayRpcNotConfiguredBadge: 'آدرس RPC: تنظیم نشده',
    cryptoPayRpcUrl: 'آدرس RPC شبکه BSC', cryptoPaySaveRpc: 'ذخیره / تعویض آدرس RPC',
    cryptoPayReplaceRpcHint: 'برای جایگزینی مقدار ذخیره‌شده، آدرس جدید را وارد کنید - مقدار فعلی هرگز اینجا نمایش داده نمی‌شود.',
    cryptoPayClearRpc: 'پاک کردن', cryptoPayClearRpcConfirm: 'آدرس RPC ذخیره‌شده پاک شود؟ در صورت فعال بودن، پرداخت ارز دیجیتال BSC غیرفعال خواهد شد.',
    cryptoPayTestButton: 'آزمایش اتصال', cryptoPayTestSuccess: 'متصل شد - زنجیره گزارش‌شده {chainId}',
    cryptoPayTestChainMismatch: '(زنجیره پیکربندی‌شده {configured} است)', cryptoPayTestFailedReason: 'آزمایش ناموفق: {reason}',
    cryptoPayWebhookTitle: 'کلید مخفی وب‌هوک (اختیاری)', cryptoPayWebhookHint: 'تنظیم شده (پایان‌یابنده به {hint})',
    cryptoPayWebhookNotConfiguredBadge: 'تنظیم نشده - تا زمانی که مقداری ساخته نشود، مسیر وب‌هوک همه درخواست‌ها را رد می‌کند',
    cryptoPayGenerateWebhook: 'ساخت / تعویض کلید مخفی',
    cryptoPayRotateWebhookConfirm: 'تعویض کلید، مقدار فعلی را جایگزین می‌کند - هر فرستنده‌ی وب‌هوک موجود باید با مقدار جدید به‌روزرسانی شود. ادامه می‌دهید؟',
    cryptoPayClearWebhook: 'پاک کردن',
    cryptoPayClearWebhookConfirm: 'کلید مخفی وب‌هوک پاک شود؟ تا ساخت مقدار جدید، مسیر وب‌هوک همه درخواست‌ها را رد می‌کند.',
    cryptoPayWebhookRevealed: 'کلید مخفی جدید وب‌هوک: {secret}',
    cryptoPayWebhookNeverShownAgain: 'این مقدار فقط یک‌بار نمایش داده می‌شود و دیگر قابل بازیابی نیست - همین حالا آن را کپی کنید.',

    // کنترل هزینه هوش مصنوعی - زیرتب پیکربندی مدیریتی، کاملاً بومی‌سازی‌شده.
    comSubAiCostControl: 'کنترل هزینه هوش مصنوعی',
    aiccStatusOk: 'تطبیق‌یافته', aiccStatusNoAdapter: 'هیچ رابط تطبیق هزینه رسمی پیکربندی نشده است',
    aiccStatusNotConfigured: 'پیکربندی نشده', aiccStatusNotSynced: 'برای این بازه هرگز همگام‌سازی نشده',
    aiccStatusNotComparableCurrency: 'قابل مقایسه نیست - واحد پول سرویس‌دهنده با دلار متفاوت است',
    aiccRangeLabel: 'بازه زمانی', aiccRange24h: '۲۴ ساعت اخیر', aiccRange7d: '۷ روز اخیر', aiccRange30d: '۳۰ روز اخیر',
    aiccRangeMonth: 'ماه جاری', aiccRangeCustom: 'بازه دلخواه (UTC)',
    aiccCustomStart: 'شروع (UTC)', aiccCustomEnd: 'پایان (UTC)', aiccApplyRange: 'اعمال', aiccRangeUtcHint: 'همه بازه‌ها بر اساس UTC هستند. داده هزینه سرویس‌دهنده به‌صورت روزانه از API رسمی دریافت می‌شود و ممکن است با تأخیر باشد - لزوماً بلادرنگ نیست.',
    aiccOverviewTitle: 'نمای کلی',
    aiccNotComparable: 'قابل مقایسه نیست',
    aiccOverviewExternalCost: 'هزینه واقعی خارجی سرویس‌دهنده', aiccSourceProviderApi: 'API رسمی هزینه سرویس‌دهنده',
    aiccOverviewInternalEstimate: 'برآورد داخلی هزینه سرویس‌دهنده', aiccSourceInternalEstimate: 'برآورد داخلی بر اساس نرخ',
    aiccOverviewRetailCharge: 'مبلغ دریافتی از کاربران', aiccSourceRetailCharge: 'مبلغ دریافتی از کیف پول',
    aiccOverviewWalletDebit: 'کسر واقعی از کیف پول', aiccOverviewMargin: 'حاشیه سود (دریافتی منهای هزینه واقعی خارجی)',
    aiccOverviewReconciliation: 'موارد استثنای تطبیق', aiccOverviewFreshness: 'سرویس‌دهنده‌های دارای داده قابل مقایسه',
    aiccFreshnessStale: 'قدیمی', aiccFreshnessComparable: 'قابل مقایسه',
    aiccProvidersTitle: 'سرویس‌دهنده‌ها',
    aiccColProvider: 'سرویس‌دهنده', aiccColStatus: 'وضعیت', aiccColExternalCost: 'هزینه خارجی', aiccColInternalEstimate: 'برآورد داخلی',
    aiccColDiff: 'اختلاف', aiccColRetailCharge: 'مبلغ دریافتی', aiccColBalance: 'موجودی', aiccColLastSync: 'آخرین همگام‌سازی موفق',
    aiccColScope: 'محدوده / پروژه', aiccColActions: 'عملیات',
    aiccOutOfTolerance: 'خارج از آستانه مجاز',
    aiccBalanceUnavailable: 'موجودی از طریق API رسمی در دسترس نیست', aiccBalanceManualLabel: 'دستی، در تطبیق استفاده نمی‌شود',
    aiccRefreshBtn: 'به‌روزرسانی', aiccRefreshing: 'در حال به‌روزرسانی…', aiccRefreshSuccess: 'با موفقیت به‌روزرسانی شد', aiccRefreshFailed: 'به‌روزرسانی ناموفق بود',
    aiccRefreshProjectMismatch: 'OpenAI تعداد {total} ردیف هزینه‌ی واقعی برای سازمان شما برگرداند، اما هیچ‌کدام با Project id تنظیم‌شده مطابقت نداشت - آن را با یک شناسه‌ی پروژه‌ی واقعی در platform.openai.com/settings/organization/projects دوباره بررسی کن.',
    aiccConfigureBtn: 'برای فعال‌سازی، یک اعتبارنامه در پایین پیکربندی کنید',
    aiccModelsTitle: 'مدل‌ها',
    aiccColInputTokens: 'توکن‌های ورودی', aiccColOutputTokens: 'توکن‌های خروجی', aiccColCachedTokens: 'توکن‌های ورودی کش‌شده',
    aiccColCacheWriteTokens: 'توکن‌های نوشتن کش', aiccColReasoningTokens: 'توکن‌های استدلال (اطلاعاتی)',
    aiccColExternalCostModel: 'هزینه خارجی',
    aiccModelExternalNotSupported: 'برای این سرویس‌دهنده در سطح مدل پشتیبانی نمی‌شود',
    aiccReconciliationTitle: 'تطبیق',
    aiccReconInternalTitle: 'تطبیق دقیق داخلی کیف پول / مصرف',
    aiccReconMatched: 'مطابق', aiccReconMissingSettlement: 'تسویه گمشده', aiccReconOrphanSettlement: 'تسویه بدون مصرف متناظر',
    aiccReconAmountMismatch: 'عدم تطابق مبلغ', aiccReconProviderModelMismatch: 'عدم تطابق سرویس‌دهنده/مدل', aiccReconExcluded: 'حذف‌شده (غیرقابل صورتحساب)',
    aiccReconTruncated: 'این بازه بیش از حد قابل بررسی در یک مرحله ردیف دارد - اعداد بالا فقط بازتاب ردیف‌های بررسی‌شده است. برای عدد دقیق، بازه را کوچک‌تر کنید.',
    aiccExceptionsTitle: 'استثناها',
    aiccColExceptionType: 'نوع', aiccColKey: 'کلید', aiccColOccurredAt: 'زمان وقوع',
    aiccReconExternalTitle: 'تطبیق خارجی سرویس‌دهنده (انتظار تفاوت می‌رود)',
    aiccToleranceLabel: 'آستانه هشدار (٪)', aiccToleranceSave: 'ذخیره',
    aiccCredentialsTitle: 'اعتبارنامه‌های تطبیق هزینه سرویس‌دهنده',
    aiccTestConnection: 'آزمایش اتصال', aiccTestConnectionSuccess: 'اتصال موفق بود', aiccTestConnectionFailed: 'اتصال ناموفق بود',
    aiccDeleteCredential: 'حذف', aiccDeleteCredentialConfirm: 'این اعتبارنامه حذف شود؟ تطبیق این سرویس‌دهنده تا افزودن اعتبارنامه جدید کار نخواهد کرد.',
    aiccColLabel: 'برچسب', aiccApiKey: 'کلید API (کلید مدیریتی سازمان)', aiccProjectId: 'شناسه پروژه اختصاصی',
    aiccAddCredential: 'افزودن اعتبارنامه',
    aiccScopeConfigHint: 'برای OpenAI، از یک کلید مدیریتی (ADMIN) اختصاصی سازمان (نه کلید معمولی API مدل) و یک شناسه پروژه اختصاصی NAVRYA استفاده کنید تا مصرف نامرتبط سازمان هرگز شمارش نشود.',
    aiccBalanceManualTitle: 'ثبت دستی موجودی (اختیاری)',
    aiccBalanceManualAmount: 'مبلغ (دلار)', aiccBalanceManualNote: 'یادداشت', aiccBalanceManualSave: 'ذخیره ثبت',

    tabConversationStudio: 'استودیوی گفتگو',
    convStudioTitle: 'استودیوی گفتگو', convStudioHint: 'سناریوهای قطعی‌ای که روتر گفتگو به‌صورت محلی و بدون فراخوانی هوش مصنوعی تشخیص می‌دهد را اینجا بساز، تست کن و منتشر کن.',
    convStudioStatTotal: 'مجموع سناریوها', convStudioStatPublished: 'منتشرشده', convStudioStatDraft: 'پیش‌نویس',
    convStudioCreateTitle: 'ساخت سناریو', convStudioScenarioKey: 'کلید سناریو (مثل session.purpose)', convStudioDomain: 'حوزه', convStudioKind: 'نوع',
    convStudioKindFaq: 'سوال متداول', convStudioKindDataQuery: 'پرس‌وجوی داده', convStudioKindSurfaceHelp: 'راهنمای صفحه فعال', convStudioCreate: 'ایجاد', convStudioKeyRequired: 'کلید سناریو الزامی است.',
    convStudioColKey: 'کلید', convStudioColDomain: 'حوزه', convStudioColKind: 'نوع', convStudioColStatus: 'وضعیت', convStudioColVersion: 'نسخه', convStudioColLanguages: 'زبان‌ها', convStudioColUpdated: 'به‌روزرسانی', convStudioColPublishedAt: 'انتشار',
    convStudioStatusPublished: 'منتشرشده', convStudioStatusDraft: 'پیش‌نویس', convStudioStatusArchived: 'بایگانی‌شده',
    convStudioVersionHistory: 'تاریخچه نسخه‌ها', convStudioRollback: 'بازگشت', convStudioRollbackConfirm: 'به این نسخه بازگردیم؟ این کار یک نسخه جدید و منتشرشده با محتوای همین نسخه می‌سازد - نسخه قدیمی هیچ‌وقت در جای خودش دوباره فعال نمی‌شود.',
    convStudioTriggerLab: 'آزمایشگاه محرک', convStudioTriggerLabHint: 'دقیقاً همان موتور تطبیقی که در محیط واقعی استفاده می‌شود را، در برابر این پیش‌نویس و بقیه‌ی سناریوهای منتشرشده اجرا می‌کند - بدون هیچ فراخوانی هوش مصنوعی.',
    convStudioTestUtterance: 'جمله تست', convStudioRunTest: 'تست کن', convStudioResolution: 'نتیجه', convStudioScore: 'امتیاز', convStudioReasons: 'دلایل',
    convStudioRunBatch: 'اجرای مجموعه تست', convStudioPositiveRate: 'نرخ موفقیت مثبت‌ها', convStudioNegativeRate: 'نرخ رد منفی‌ها',
    convStudioCheckCollisions: 'بررسی تداخل', convStudioNoCollisions: 'هیچ تداخلی با سناریوهای منتشرشده‌ی فعلی پیدا نشد.',
    convStudioBackToLibrary: '← بازگشت به فهرست', convStudioUnarchive: 'خروج از بایگانی', convStudioArchive: 'بایگانی', convStudioNewRevision: 'نسخه جدید',
    convStudioNoDraft: 'هیچ پیش‌نویسی در جریان نیست - برای ویرایش نسخه بعدی روی «نسخه جدید» بزن.', convStudioEditingDraft: 'در حال ویرایش پیش‌نویس',
    convStudioCta: 'اقدام پیشنهادی (CTA)', convStudioCtaNone: 'هیچ‌کدام',
    convStudioCorpusPositive: 'نمونه‌های تست مثبت (هر خط یک نمونه)', convStudioCorpusNegative: 'نمونه‌های تست منفی (هر خط یک نمونه)',
    convStudioGroups: 'گروه‌های مفهومی (هر خط یک گروه، عبارت‌ها با | جدا شوند)', convStudioStrong: 'عبارت‌های قوی (هر خط یکی)', convStudioNegative: 'عبارت‌های منفی (هر خط یکی)',
    convStudioWrittenResponse: 'پاسخ نوشتاری', convStudioVoiceResponse: 'پاسخ صوتی',
    convStudioSaveDraft: 'ذخیره پیش‌نویس', convStudioPublish: 'انتشار', convStudioPublished: 'منتشر شد.', convStudioPublishBlocked: 'انتشار مسدود شد',
    convStudioAudioTitle: 'صدای منتشرشده', convStudioAudioNotEligible: 'سناریوهای «پرسش داده» از مقادیر زنده و مخصوص هر کاربر استفاده می‌کنند و هرگز نمی‌توانند صدای ثابت منتشرشده داشته باشند.',
    convStudioAudioNoText: 'هنوز پاسخ نوشتاری یا گفتاری وجود ندارد - چیزی برای تولید صدا نیست.', convStudioAudioNoneYet: 'هنوز صدایی برای این زبان تولید نشده است.',
    convStudioAudioApproved: 'تأییدشده - برای کاربران صوتی فعال است', convStudioAudioStale: 'منسوخ (متن پس از تولید این صدا تغییر کرده است)',
    convStudioAudioStaleBlocked: 'این نمونه دیگر با متن فعلی مطابقت ندارد - پیش از تأیید دوباره تولید کنید.',
    convStudioAudioPreview: 'پیش‌نمایش - هنوز فعال نیست', convStudioAudioUsedWrittenFallback: 'از پاسخ نوشتاری استفاده شد (پاسخ گفتاری جداگانه‌ای تنظیم نشده بود)',
    convStudioAudioApprove: 'تأیید', convStudioAudioArchive: 'بایگانی', convStudioAudioGenerate: 'تولید', convStudioAudioGenerating: 'در حال تولید…',
    convStudioAudioVoiceProfileKey: 'برچسب پروفایل صدا',
    convStudioExpressiveVoice: 'صدای بیانی', convStudioEnhanceDelivery: 'بهبود بیان', convStudioEnhancing: 'در حال بهبود…',
    convStudioDeliveryNote: 'یادداشت بیان (اختیاری)', convStudioDeliveryNotePlaceholder: 'مثلاً: گرم و کنجکاو',
    convStudioPerformanceValid: 'معتبر - با گفتگوی اصلی مطابقت دارد', convStudioPerformanceInvalid: 'استفاده نشد - ',
    convStudioVariants: 'حالت‌های زمینه‌ای', convStudioAddVariant: '+ افزودن حالت زمینه‌ای',
    convStudioVariantKey: 'کلید حالت (مثلاً FIRST_TIME)', convStudioRemoveVariant: 'حذف حالت',
    convStudioContext: 'زمینه', convStudioExposure: 'میزان مواجهه', convStudioExposureAny: 'هر مقدار',
    convStudioExposureFirstTime: 'اولین بار', convStudioExposureNthOrLater: 'بار Nام یا بیشتر',
    convStudioExposureThreshold: 'آستانه (N)', convStudioSurface: 'سطح', convStudioSurfaceAny: 'هر سطحی'
  },
  ar: {
    brand: 'لوحة الإدارة',
    loginHint: 'سجّل الدخول بحساب المدير الخاص بك.', emailLabel: 'البريد الإلكتروني', passwordLabel: 'كلمة المرور', loginSubmit: 'تسجيل الدخول',
    gateErrorNotAdmin: 'هذا الحساب لا يملك صلاحية الإدارة.', gateErrorInvalidCredentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    enforcementWarning: 'تحذير: ADMIN_AUTH_ENFORCED غير مضبوط على الخادم - كل حساب لديه صلاحية الإدارة حاليًا. اضبط ADMIN_AUTH_ENFORCED=true.',
    tabUsers: 'المستخدمون', tabAI: 'الذكاء الاصطناعي', tabTechnical: 'تقني', tabXP: 'نقاط الخبرة والتصنيف', tabMarketplace: 'السوق', tabFinancial: 'مالي',
    loading: 'جارٍ التحميل…', errorGeneric: 'حدث خطأ ما.', retry: 'إعادة المحاولة',
    usersSearchPlaceholder: 'البحث بالاسم…',
    colDisplayName: 'الاسم المعروض', colJoined: 'تاريخ الانضمام', colLastLogin: 'آخر دخول', colOnline: 'الحالة', colHoursOnline: 'ساعات الاتصال', colPurchases: 'المشتريات', colTokensUsed: 'الرموز المستخدمة', colRole: 'الدور', colActions: 'إجراءات',
    yes: 'نعم', no: 'لا', online: 'متصل', offline: 'غير متصل',
    pageOf: 'صفحة {page} من {total}', prev: 'السابق', next: 'التالي',
    close: 'إغلاق', save: 'حفظ', cancel: 'إلغاء', saved: 'تم الحفظ.',
    roleUser: 'مستخدم', roleModerator: 'مشرف', roleAdmin: 'مدير', suspend: 'إيقاف', unsuspend: 'إلغاء الإيقاف', suspended: 'موقوف',
    aiKeyStatusSet: 'المفتاح مضبوط', aiKeyStatusNotSet: 'لا يوجد مفتاح', aiKeyInputPlaceholder: 'مفتاح API جديد', saveKey: 'حفظ المفتاح', aiKeyUpdatedAt: 'تحديث {date}',
    pricingPromptLabel: 'سعر كل 1000 رمز إدخال', pricingCompletionLabel: 'سعر كل 1000 رمز إخراج', budgetLabel: 'الميزانية الشهرية للرموز', savePricing: 'حفظ التسعير',
    usageChartTitle: 'استخدام الرموز حسب المزوّد', usageChartEmpty: 'لا يوجد استخدام مسجل بعد.',
    dbConnectivity: 'اتصال قاعدة البيانات', dbOk: 'متصلة', dbFail: 'غير متاحة', migrationsApplied: 'الترحيلات المطبّقة', migrationsNone: 'لا يوجد سجل (خلفية في الذاكرة)', communityApiHealth: 'خادم المجتمع', aiGatewayHealth: 'بوابة الذكاء الاصطناعي', errorTrackingLabel: 'تتبع الأخطاء', errorTrackingValue: 'غير مطبَّق بعد',
    technicalPageSubtitle: 'الحالة الحية لقاعدة البيانات والخدمات الخلفية وواجهات برمجة التطبيقات التي تعتمد عليها المنصة.', statSystemsHealthy: 'الأنظمة السليمة',
    xpStatTypes: 'أنواع نقاط الخبرة', xpStatOverridden: 'قيم مخصّصة', xpNoRows: 'لا يوجد شيء لعرضه.',
    xpPageSubtitle: 'كل مصدر نقاط، وسقف، ومتطلب إتقان يقرأه المحرك - عدّل أي رقم، ويبقى منطق التحقق في الكود.',
    xpColDefault: 'افتراضي', xpColCurrent: 'الحالي', xpColEdit: 'تعديل', xpColType: 'النوع', xpColDomain: 'المجال',
    xpColAchievement: 'الإنجاز', xpColLevel: 'المستوى', xpColRequirement: 'الشرط',
    xpResetDefault: 'إعادة إلى الافتراضي', xpPeriodDay: 'يوميًا', xpPeriodWeek: 'أسبوعيًا',
    xpSectionPoints: 'نقاط الخبرة حسب النوع', xpSectionDomainCaps: 'السقف اليومي لكل مجال',
    xpSectionRecurringCap: 'السقف اليومي الكلي لكل الأنشطة المتكررة', xpRecurringCapLabel: 'السقف اليومي',
    xpSectionSourceCaps: 'الحد الأقصى لكل مصدر (مثلاً أقصى عدد إدخالات رسم بياني لكل جلسة)',
    xpSectionSourceTotalCaps: 'السقف الكلي للنقاط لكل مصدر (مثلاً أقصى نقاط لكل صفقة)',
    xpSectionPeriodCaps: 'السقف الدوري لكل نوع', xpSectionAchievements: 'نقاط الإنجازات',
    xpSectionMastery: 'شروط اجتياز كل مستوى',
    marketplacePageSubtitle: 'كل إعلانات تقارير الأنماط في السوق - راجع الأدلة أو مَيِّز أو ألغِ الإدراج.',
    marketplaceColTitle: 'العنوان', marketplaceColSeller: 'البائع', marketplaceColPrice: 'السعر', marketplaceColEvidence: 'الأدلة', marketplaceColStatus: 'الحالة', marketplaceColFeatured: 'مميّز',
    delistAction: 'إزالة من السوق', publishAction: 'نشر', featureAction: 'تمييز', unfeatureAction: 'إلغاء التمييز',
    statusFilterAll: 'الكل', statusFilterDraft: 'مسودة', statusFilterPublished: 'منشور', statusFilterDelisted: 'مُزال',
    financialPageSubtitle: 'إيرادات السوق، وتكلفة مزوّدي الذكاء الاصطناعي الحقيقية، والميزانية الشهرية المتبقية، في لمحة واحدة.',
    statMockRevenue: 'إيراد السوق (تجريبي)', statAiCostThisMonth: 'تكلفة الذكاء الاصطناعي هذا الشهر', statTokensUsedThisMonth: 'الرموز المستخدمة هذا الشهر',
    financeMockRevenueTitle: 'إيراد السوق التجريبي', financeMockRevenueNote: 'تجريبي — غير متصل بأي معالج دفع حقيقي.',
    financeAiCostTitle: 'تقدير تكلفة الذكاء الاصطناعي (هذا الشهر)', financeBudgetTitle: 'الميزانية المتبقية (هذا الشهر)',
    noPricingSet: 'لا يوجد تسعير', noBudgetSet: 'لا توجد ميزانية', tokensUsedLabel: 'رمز مستخدم', remainingLabel: 'المتبقي', budgetOfLabel: 'من {budget}',
    gateError: 'تعذرت المتابعة.', gateErrorOffline: 'تعذر الوصول إلى الخادم. هل خادم المجتمع يعمل؟ (npm run dev:community-api)',
    backToApp: 'العودة إلى التطبيق', sidebarToggleLabel: 'فتح/إغلاق القائمة',
    statTotalUsers: 'إجمالي المستخدمين', statOnlineNow: 'متصل الآن', statProvidersConfigured: 'مزوّدون مُهيّؤون', statTotalListings: 'إجمالي الإعلانات', statPublishedListings: 'منشور', statFeaturedListings: 'مميّز',
    detailLoadFailed: 'تعذر تحميل تفاصيل المستخدم.', noEmail: 'لا يوجد بريد إلكتروني', noPhone: 'لا يوجد هاتف',
    usersPageSubtitle: 'كل الحسابات في المنصة — ابحث وراجع وافتح ملفًا شخصيًا.', viewProfile: 'عرض الملف الشخصي',
    usersBackToLibrary: '← كل المستخدمين', joinedOnLabel: 'الانضمام في {date}', levelCardTitle: 'المستوى والنقاط', verificationCardTitle: 'التحقق',
    kycStatusLabel: 'حالة التحقق (KYC)', kycNotStarted: 'لم تبدأ', kycPending: 'قيد المراجعة', kycVerified: 'موثّق', kycRejected: 'مرفوض', saveKyc: 'حفظ الحالة',
    profileRoleLabel: 'الدور المنتجي', profileRoleTrader: 'متداول', profileRoleMentor: 'موجّه', profileRoleTeacher: 'مدرّس',
    levelXpLabel: 'المستوى {level} · {xp} نقطة', achievementsLabel: 'الإنجازات', noAchievements: 'لا توجد إنجازات مفتوحة بعد.',
    subscriptionsLabel: 'الاشتراكات', noSubscriptions: 'لا توجد اشتراكات.', mockBadge: 'تجريبي', purchasedOnLabel: 'تم الشراء في {date}',
    aiHealthLabel: 'الحالة', statusHealthy: 'سليم', statusDegraded: 'غير مستقر', statusIdle: 'خامل', statusDisconnected: 'منقطع', statusUnconfigured: 'غير مهيّأ', statusUnknown: 'لم يُختبر بعد',
    aiTestNow: 'اختبار الآن', aiTestingNow: 'جارٍ الاختبار…', aiTestOk: 'الاتصال يعمل.', aiLastChecked: 'آخر فحص {date}', aiLastErrorLabel: 'آخر خطأ: {error}',
    aiPageSubtitle: 'مفاتيح المزوّدين، التسعير، الحالة الحية، توجيه صوت ElevenLabs، والاستخدام على مستوى المنصة.',
    aiProviderKeysTitle: 'مفاتيح المزوّدين والتسعير', statHealthyProviders: 'مزوّدون سليمون',
    voiceProvidersTitle: 'مزوّدو الصوت (ElevenLabs)', voiceProvidersHint: 'مفاتيح ElevenLabs وتوجيه الصوت لكل لغة، تديرها الإدارة - لوضع الصوت المباشر. تُطبَّق التغييرات فورًا دون الحاجة لإعادة النشر.',
    vpCredentialsTitle: 'ملفات المفاتيح', vpAddCredential: 'إضافة ملف مفتاح', vpLabelPlaceholder: 'اسم الملف (مثال: حساب ElevenLabs الرئيسي)', vpKeyPlaceholder: 'أدخل مفتاح API الخاص بـ ElevenLabs', vpReplaceKeyHint: 'اتركه فارغًا للاحتفاظ بالمفتاح الحالي', vpSaveCredential: 'حفظ الملف', vpNoCredentials: 'لا توجد ملفات مفاتيح بعد.',
    vpKeyHint: 'المفتاح ينتهي بـ {hint}', vpValidate: 'تحقّق', vpValidating: 'جارٍ التحقّق…', vpDelete: 'حذف', vpDeleteConfirm: 'هل تريد حذف ملف المفتاح هذا؟ أي لغة تستخدمه ستعود إلى الوضع الافتراضي حتى يتم اختيار ملف جديد.', vpDeleted: 'تم حذف المفتاح.',
    vpEnabled: 'مفعّل', vpDisabled: 'معطّل', vpValidationUnknown: 'لم يتم التحقّق بعد', vpValidationValid: 'صالح', vpValidationInvalid: 'غير صالح', vpValidationRestricted: 'مقيّد (صلاحيات/IP)', vpLastValidated: 'آخر تحقّق {date}', vpNeverValidated: 'لم يتم التحقّق مطلقًا', vpValidationErrorCode: 'السبب: {code}', vpValidateInconclusive: 'تعذّر الوصول إلى ElevenLabs الآن ({code}) - هذا لا يعني أن المفتاح غير صالح. حاول التحقّق مرة أخرى.',
    vpCharactersTitle: 'توجيه صوت الشخصيات', vpCharacterEnable: 'استخدام ElevenLabs لهذه الشخصية', vpCredentialSelect: 'ملف المفتاح', vpNoCredentialSelected: 'لم يتم اختيار مفتاح',
    vpCharacterHunter: 'الصياد', vpCharacterCommander: 'القائد', vpCharacterEngineer: 'المهندس', vpCharacterSage: 'الحكيم', vpGenderMale: 'رجل', vpGenderFemale: 'امرأة', vpTestLanguage: 'لغة الاختبار',
    vpVoiceSearch: 'البحث عن الأصوات…', vpVoiceId: 'معرّف الصوت', vpLoadVoices: 'تحميل الأصوات', vpModelSelect: 'النموذج', vpLoadModels: 'تحميل النماذج', vpFallback: 'الاحتياطي من OpenAI', vpSaveLanguage: 'حفظ', vpSaved: 'تم الحفظ.',
    vpTestSample: 'إنشاء عيّنة اختبار', vpTestGenerating: 'جارٍ الإنشاء…', vpTestCreditsWarning: 'هذا سينشئ صوتًا حقيقيًا ويستهلك من رصيد ElevenLabs.', vpTestTextPlaceholder: 'نص عيّنة قصير',
    vpHealthTitle: 'الحالة والاستخدام', vpStatusReady: 'جاهز', vpStatusDisabled: 'معطّل', vpStatusUnconfigured: 'غير مُهيّأ', vpStatusInvalidCredential: 'مفتاح غير صالح', vpStatusDegraded: 'أداء متدهور',
    vpRequests24h: 'الطلبات (٢٤ ساعة)', vpSuccessRate: 'معدّل النجاح', vpAvgLatency: 'متوسط زمن الاستجابة', vpLastSuccess: 'آخر نجاح', vpLastError: 'آخر خطأ', vpNoUsageYet: 'لا يوجد استخدام بعد', vpValidateFirst: 'اختر مفتاحًا وتحقّق منه أولاً',
    vpQuotaRefresh: 'تحديث الحصة', vpQuotaTier: 'المستوى {tier}', vpQuotaCharacters: 'تم استخدام {used} من {limit} حرفًا', vpQuotaRemaining: '{count} متبقٍ (تقديري)', vpQuotaNextReset: 'إعادة الضبط في {date}', vpQuotaOverage: 'الاستخدام الزائد مسموح', vpQuotaUnavailable: 'الحصة غير متاحة', vpAnalyticsUnavailable: 'صلاحية عرض الاستخدام غير متاحة',
    aiTodayTokensLabel: 'اليوم', aiMonthTokensLabel: 'هذا الشهر', aiEstCostLabel: 'التكلفة التقديرية',
    aiTrendTitle: 'الاستخدام اليومي (آخر 14 يومًا)', aiTrendEmpty: 'لا يوجد استخدام في هذه الفترة بعد.',
    aiRecentEventsTitle: 'أحداث الذكاء الاصطناعي الأخيرة', aiRecentEventsEmpty: 'لا توجد استدعاءات مسجّلة بعد.',
    aiRecentColTime: 'الوقت', aiRecentColProvider: 'المزوّد', aiRecentColSource: 'المصدر', aiRecentColStatus: 'الحالة', aiRecentColLatency: 'زمن الاستجابة',
    aiTopUsersTitle: 'أكثر المستخدمين استهلاكًا للرموز', aiTopUsersEmpty: 'لا يوجد استخدام مسجل بعد.', aiTopUsersColUser: 'المستخدم', aiTopUsersColTokens: 'الرموز',
    usageByProviderLabel: 'استخدام الرموز حسب المزوّد', noProviderUsage: 'لا يوجد استخدام ذكاء اصطناعي مسجّل لهذا المستخدم بعد.',
    aiCostSectionTitle: 'تكلفة واستحقاق الذكاء الاصطناعي (فعلي، حسب النموذج)', aiCostProviderCost: 'تكلفة المزوّد', aiCostRetailCharge: 'المبلغ المحصّل من المستخدم',
    aiCostRateCardHint: 'محسوبة من استخدام الرموز الفعلي × تسعيرة المزوّد التي أعددتها - وليست فاتورة OpenAI مُسوّاة.',
    aiCostModel: 'النموذج', aiCostCalls: 'عدد الاستدعاءات', aiCostNoData: 'لا توجد تكلفة ذكاء اصطناعي فعلية مسجّلة لهذا المستخدم بعد.',
    aiCostReconMatches: 'تسويات المحفظة مطابقة للاستخدام', aiCostReconMismatch: 'تسويات المحفظة غير مطابقة للاستخدام',
    aiCostReconExpected: 'المبلغ المتوقع من المستخدم', aiCostReconSettled: 'الحركة الفعلية في المحفظة',
    aiCostReconSampleLimited: '(استنادًا إلى آخر 100 تسوية فقط)',
    aiCostSettlementsTitle: 'تسويات المحفظة', aiCostCashDebit: 'خصم نقدي', aiCostPromoDebit: 'خصم من رصيد العروض',
    aiUsageByModelTitle: 'التكلفة الفعلية المسوّاة حسب النموذج (كل المستخدمين)', aiUsageByModelEmpty: 'لا توجد تكلفة ذكاء اصطناعي فعلية مسجّلة حسب النموذج بعد.',
    aiCostProvider: 'المزوّد', aiCostPromptTokens: 'رموز الإدخال', aiCostCompletionTokens: 'رموز الإخراج', aiCostTotalTokens: 'إجمالي الرموز',
    comSubCryptoPayments: 'المدفوعات بالعملات الرقمية',
    cryptoPayStatusTitle: 'حالة مزوّد الدفع', cryptoPayModeBsc: 'عملة رقمية BSC', cryptoPayModeManual: 'يدوي',
    cryptoPayConfigComplete: 'الإعداد مكتمل', cryptoPayRpcConfigured: 'تم ضبط RPC', cryptoPayWebhookConfigured: 'تم ضبط الويب هوك',
    cryptoPayYes: 'نعم', cryptoPayNo: 'لا', cryptoPayLastTested: 'آخر اختبار: {date}', cryptoPayTestOk: 'نجح', cryptoPayTestFailed: 'فشل',
    cryptoPayDetectedChain: 'السلسلة {chainId}', cryptoPayNeverTested: 'لم يتم اختبار الاتصال بعد',
    cryptoPayNewInvoicesWarning: 'هذه التغييرات تؤثر فقط على الفواتير الجديدة بعد الحفظ - الفواتير الحالية تحتفظ بقيمها المسجّلة.',
    cryptoPayEnable: 'تفعيل الدفع بعملة BSC الرقمية', cryptoPayDisable: 'تعطيل الدفع بعملة BSC الرقمية',
    cryptoPayPublicTitle: 'إعدادات BSC العامة', cryptoPayChainId: 'معرّف السلسلة', cryptoPayDepositAddress: 'عنوان محفظة الاستلام',
    cryptoPayTokenSymbol: 'رمز العملة', cryptoPayTokenContract: 'عقد العملة (BEP-20)', cryptoPayTokenDecimals: 'خانات عشرية للعملة',
    cryptoPayExchangeRate: 'دولار لكل وحدة عملة', cryptoPayConfirmations: 'عدد التأكيدات المطلوبة', cryptoPayExpiryMinutes: 'انتهاء صلاحية الفاتورة (دقائق)',
    cryptoPaySavePublic: 'حفظ الإعدادات العامة',
    cryptoPayRpcTitle: 'اتصال RPC', cryptoPayRpcConfiguredBadge: 'رابط RPC: مضبوط', cryptoPayRpcNotConfiguredBadge: 'رابط RPC: غير مضبوط',
    cryptoPayRpcUrl: 'رابط RPC لشبكة BSC', cryptoPaySaveRpc: 'حفظ / تدوير رابط RPC',
    cryptoPayReplaceRpcHint: 'أدخل رابطًا جديدًا لاستبدال القيمة المحفوظة - القيمة الحالية لا تُعرض هنا أبدًا.',
    cryptoPayClearRpc: 'مسح', cryptoPayClearRpcConfirm: 'هل تريد مسح رابط RPC المحفوظ؟ سيتم تعطيل الدفع بعملة BSC الرقمية إذا كان مفعّلاً حاليًا.',
    cryptoPayTestButton: 'اختبار الاتصال', cryptoPayTestSuccess: 'تم الاتصال - السلسلة المُبلَّغ عنها {chainId}',
    cryptoPayTestChainMismatch: '(السلسلة المضبوطة هي {configured})', cryptoPayTestFailedReason: 'فشل الاختبار: {reason}',
    cryptoPayWebhookTitle: 'سر الويب هوك (اختياري)', cryptoPayWebhookHint: 'مضبوط (ينتهي بـ {hint})',
    cryptoPayWebhookNotConfiguredBadge: 'غير مضبوط - سيرفض مسار الويب هوك كل طلب حتى يتم توليد سر جديد',
    cryptoPayGenerateWebhook: 'توليد / تدوير السر',
    cryptoPayRotateWebhookConfirm: 'التدوير يستبدل السر الحالي - يجب تحديث أي مرسل ويب هوك حالي بالقيمة الجديدة. المتابعة؟',
    cryptoPayClearWebhook: 'مسح',
    cryptoPayClearWebhookConfirm: 'هل تريد مسح سر الويب هوك؟ سيرفض مسار الويب هوك كل طلب حتى يتم توليد سر جديد.',
    cryptoPayWebhookRevealed: 'سر الويب هوك الجديد: {secret}',
    cryptoPayWebhookNeverShownAgain: 'تُعرض هذه القيمة مرة واحدة فقط ولا يمكن استرجاعها لاحقًا - انسخها الآن.',

    // التحكم في تكلفة الذكاء الاصطناعي - علامة تبويب فرعية إدارية، مترجمة بالكامل.
    comSubAiCostControl: 'التحكم في تكلفة الذكاء الاصطناعي',
    aiccStatusOk: 'مُسوّى', aiccStatusNoAdapter: 'لا يوجد محول تسوية تكلفة رسمي مُهيّأ',
    aiccStatusNotConfigured: 'غير مهيّأ', aiccStatusNotSynced: 'لم تتم المزامنة لهذا النطاق مطلقًا',
    aiccStatusNotComparableCurrency: 'غير قابل للمقارنة - عملة المزوّد مختلفة عن الدولار الأمريكي',
    aiccRangeLabel: 'النطاق الزمني', aiccRange24h: 'آخر 24 ساعة', aiccRange7d: 'آخر 7 أيام', aiccRange30d: 'آخر 30 يومًا',
    aiccRangeMonth: 'الشهر الحالي', aiccRangeCustom: 'نطاق مخصص (UTC)',
    aiccCustomStart: 'البداية (UTC)', aiccCustomEnd: 'النهاية (UTC)', aiccApplyRange: 'تطبيق', aiccRangeUtcHint: 'كل النطاقات بتوقيت UTC. بيانات تكلفة المزوّد مجمّعة يوميًا عبر الواجهة الرسمية وقد تكون متأخرة - ليست بالضرورة فورية.',
    aiccOverviewTitle: 'نظرة عامة',
    aiccNotComparable: 'غير قابل للمقارنة',
    aiccOverviewExternalCost: 'التكلفة الفعلية الخارجية للمزوّد', aiccSourceProviderApi: 'واجهة التكلفة الرسمية للمزوّد',
    aiccOverviewInternalEstimate: 'التقدير الداخلي لتكلفة المزوّد', aiccSourceInternalEstimate: 'تقدير داخلي حسب بطاقة الأسعار',
    aiccOverviewRetailCharge: 'المبالغ المحصّلة من المستخدمين', aiccSourceRetailCharge: 'رسوم المحفظة',
    aiccOverviewWalletDebit: 'الخصومات الفعلية من المحفظة', aiccOverviewMargin: 'الهامش (الرسوم ناقص التكلفة الخارجية الفعلية)',
    aiccOverviewReconciliation: 'استثناءات التسوية', aiccOverviewFreshness: 'المزوّدون ذوو بيانات قابلة للمقارنة',
    aiccFreshnessStale: 'قديمة', aiccFreshnessComparable: 'قابلة للمقارنة',
    aiccProvidersTitle: 'المزوّدون',
    aiccColProvider: 'المزوّد', aiccColStatus: 'الحالة', aiccColExternalCost: 'التكلفة الخارجية', aiccColInternalEstimate: 'التقدير الداخلي',
    aiccColDiff: 'الفرق', aiccColRetailCharge: 'الرسوم المحصّلة', aiccColBalance: 'الرصيد', aiccColLastSync: 'آخر مزامنة ناجحة',
    aiccColScope: 'النطاق / المشروع', aiccColActions: 'الإجراءات',
    aiccOutOfTolerance: 'خارج الحد المسموح',
    aiccBalanceUnavailable: 'الرصيد غير متاح عبر الواجهة الرسمية', aiccBalanceManualLabel: 'يدوي، لا يُستخدم في التسوية',
    aiccRefreshBtn: 'تحديث', aiccRefreshing: 'جارٍ التحديث…', aiccRefreshSuccess: 'تم التحديث بنجاح', aiccRefreshFailed: 'فشل التحديث',
    aiccRefreshProjectMismatch: 'أعادت OpenAI {total} بند تكلفة فعلي لمؤسستك، لكن لم يتطابق أي منها مع Project id المُهيّأ - تحقّق منه مقابل معرّف مشروع حقيقي على platform.openai.com/settings/organization/projects.',
    aiccConfigureBtn: 'قم بتهيئة بيانات اعتماد أدناه للتفعيل',
    aiccModelsTitle: 'النماذج',
    aiccColInputTokens: 'رموز الإدخال', aiccColOutputTokens: 'رموز الإخراج', aiccColCachedTokens: 'رموز الإدخال المخزّنة مؤقتًا',
    aiccColCacheWriteTokens: 'رموز كتابة التخزين المؤقت', aiccColReasoningTokens: 'رموز التفكير (إعلامي فقط)',
    aiccColExternalCostModel: 'التكلفة الخارجية',
    aiccModelExternalNotSupported: 'غير مدعوم على مستوى النموذج لهذا المزوّد',
    aiccReconciliationTitle: 'التسوية',
    aiccReconInternalTitle: 'تسوية دقيقة داخلية للمحفظة والاستخدام',
    aiccReconMatched: 'متطابق', aiccReconMissingSettlement: 'تسوية مفقودة', aiccReconOrphanSettlement: 'تسوية بلا استخدام مرتبط',
    aiccReconAmountMismatch: 'عدم تطابق في المبلغ', aiccReconProviderModelMismatch: 'عدم تطابق في المزوّد/النموذج', aiccReconExcluded: 'مستبعد (غير قابل للفوترة)',
    aiccReconTruncated: 'يحتوي هذا النطاق على صفوف أكثر مما يمكن فحصه في مرور واحد - الأعداد أعلاه تعكس الصفوف التي تم فحصها فقط. ضيّق النطاق للحصول على رقم دقيق.',
    aiccExceptionsTitle: 'الاستثناءات',
    aiccColExceptionType: 'النوع', aiccColKey: 'المفتاح', aiccColOccurredAt: 'وقت الحدوث',
    aiccReconExternalTitle: 'تسوية خارجية مع المزوّد (يُتوقّع أن تختلف)',
    aiccToleranceLabel: 'نسبة التحذير المسموحة (٪)', aiccToleranceSave: 'حفظ',
    aiccCredentialsTitle: 'بيانات اعتماد تسوية تكلفة المزوّد',
    aiccTestConnection: 'اختبار الاتصال', aiccTestConnectionSuccess: 'نجح الاتصال', aiccTestConnectionFailed: 'فشل الاتصال',
    aiccDeleteCredential: 'حذف', aiccDeleteCredentialConfirm: 'حذف بيانات الاعتماد هذه؟ ستتوقف تسوية هذا المزوّد حتى تُضاف بيانات اعتماد جديدة.',
    aiccColLabel: 'التسمية', aiccApiKey: 'مفتاح API (مفتاح إدارة المؤسسة)', aiccProjectId: 'معرّف مشروع مخصّص',
    aiccAddCredential: 'إضافة بيانات اعتماد',
    aiccScopeConfigHint: 'بالنسبة لـ OpenAI، استخدم مفتاح إدارة (ADMIN) مخصّصًا للمؤسسة (وليس مفتاح API العادي للنموذج) ومعرّف مشروع NAVRYA مخصّصًا، حتى لا يُحتسب استخدام المؤسسة غير ذي الصلة أبدًا.',
    aiccBalanceManualTitle: 'لقطة رصيد يدوية (اختياري)',
    aiccBalanceManualAmount: 'المبلغ (دولار)', aiccBalanceManualNote: 'ملاحظة', aiccBalanceManualSave: 'حفظ اللقطة',

    tabConversationStudio: 'استوديو المحادثة',
    convStudioTitle: 'استوديو المحادثة', convStudioHint: 'أنشئ واختبر وانشر السيناريوهات الحتمية التي يطابقها موجّه المحادثة محليًا، بدون أي استدعاء للذكاء الاصطناعي.',
    convStudioStatTotal: 'إجمالي السيناريوهات', convStudioStatPublished: 'منشور', convStudioStatDraft: 'مسودة',
    convStudioCreateTitle: 'إنشاء سيناريو', convStudioScenarioKey: 'مفتاح السيناريو (مثل session.purpose)', convStudioDomain: 'المجال', convStudioKind: 'النوع',
    convStudioKindFaq: 'سؤال شائع', convStudioKindDataQuery: 'استعلام بيانات', convStudioKindSurfaceHelp: 'مساعدة الشاشة الحالية', convStudioCreate: 'إنشاء', convStudioKeyRequired: 'مفتاح السيناريو مطلوب.',
    convStudioColKey: 'المفتاح', convStudioColDomain: 'المجال', convStudioColKind: 'النوع', convStudioColStatus: 'الحالة', convStudioColVersion: 'الإصدار', convStudioColLanguages: 'اللغات', convStudioColUpdated: 'آخر تحديث', convStudioColPublishedAt: 'تاريخ النشر',
    convStudioStatusPublished: 'منشور', convStudioStatusDraft: 'مسودة', convStudioStatusArchived: 'مؤرشف',
    convStudioVersionHistory: 'سجل الإصدارات', convStudioRollback: 'استرجاع', convStudioRollbackConfirm: 'هل تريد الاسترجاع إلى هذا الإصدار؟ سيتم إنشاء إصدار جديد منشور فورًا بنفس محتوى هذا الإصدار - الإصدار القديم لا يُعاد تفعيله في مكانه أبدًا.',
    convStudioTriggerLab: 'مختبر المحفزات', convStudioTriggerLabHint: 'يشغّل نفس محرك المطابقة المستخدم في الإنتاج تمامًا، مقابل هذه المسودة وكل سيناريو آخر منشور - بدون أي استدعاء للذكاء الاصطناعي.',
    convStudioTestUtterance: 'جملة الاختبار', convStudioRunTest: 'اختبار', convStudioResolution: 'النتيجة', convStudioScore: 'النتيجة العددية', convStudioReasons: 'الأسباب',
    convStudioRunBatch: 'تشغيل مجموعة الاختبار', convStudioPositiveRate: 'معدل نجاح الأمثلة الإيجابية', convStudioNegativeRate: 'معدل رفض الأمثلة السلبية',
    convStudioCheckCollisions: 'فحص التعارضات', convStudioNoCollisions: 'لم يتم العثور على أي تعارض مع السيناريوهات المنشورة حاليًا.',
    convStudioBackToLibrary: '← العودة إلى المكتبة', convStudioUnarchive: 'إلغاء الأرشفة', convStudioArchive: 'أرشفة', convStudioNewRevision: 'مراجعة جديدة',
    convStudioNoDraft: 'لا توجد مسودة قيد العمل - اضغط "مراجعة جديدة" لبدء تحرير الإصدار التالي.', convStudioEditingDraft: 'تحرير المسودة',
    convStudioCta: 'الإجراء المقترح (CTA)', convStudioCtaNone: 'لا شيء',
    convStudioCorpusPositive: 'أمثلة اختبار إيجابية (واحد في كل سطر)', convStudioCorpusNegative: 'أمثلة اختبار سلبية (واحد في كل سطر)',
    convStudioGroups: 'مجموعات المفاهيم (مجموعة في كل سطر، افصل الكلمات بـ |)', convStudioStrong: 'العبارات القوية (واحدة في كل سطر)', convStudioNegative: 'العبارات السلبية (واحدة في كل سطر)',
    convStudioWrittenResponse: 'الرد المكتوب', convStudioVoiceResponse: 'الرد الصوتي',
    convStudioSaveDraft: 'حفظ المسودة', convStudioPublish: 'نشر', convStudioPublished: 'تم النشر.', convStudioPublishBlocked: 'تم منع النشر',
    convStudioAudioTitle: 'الصوت المنشور', convStudioAudioNotEligible: 'سيناريوهات "استعلام البيانات" تستخدم قيمًا حية خاصة بكل مستخدم ولا يمكن أن يكون لها صوت ثابت منشور أبدًا.',
    convStudioAudioNoText: 'لا توجد استجابة مكتوبة أو منطوقة بعد - لا يوجد شيء لتوليد الصوت منه.', convStudioAudioNoneYet: 'لم يتم توليد أي صوت لهذه اللغة بعد.',
    convStudioAudioApproved: 'معتمد - مفعّل لمستخدمي الصوت', convStudioAudioStale: 'قديم (تغيّر النص منذ توليد هذا الصوت)',
    convStudioAudioStaleBlocked: 'هذا المرشح لم يعد يطابق النص الحالي - أعد التوليد قبل الاعتماد.',
    convStudioAudioPreview: 'معاينة - غير مفعّلة بعد', convStudioAudioUsedWrittenFallback: 'تم استخدام الاستجابة المكتوبة (لم يتم تعيين استجابة صوتية منفصلة)',
    convStudioAudioApprove: 'اعتماد', convStudioAudioArchive: 'أرشفة', convStudioAudioGenerate: 'توليد', convStudioAudioGenerating: 'جارٍ التوليد…',
    convStudioAudioVoiceProfileKey: 'تسمية ملف الصوت',
    convStudioExpressiveVoice: 'الصوت التعبيري', convStudioEnhanceDelivery: 'تحسين الأداء', convStudioEnhancing: 'جارٍ التحسين…',
    convStudioDeliveryNote: 'ملاحظة الأداء (اختياري)', convStudioDeliveryNotePlaceholder: 'مثال: دافئ وفضولي',
    convStudioPerformanceValid: 'صالح - يطابق الحوار الأصلي', convStudioPerformanceInvalid: 'لم يُستخدم - ',
    convStudioVariants: 'حالات السياق', convStudioAddVariant: '+ إضافة حالة سياق',
    convStudioVariantKey: 'مفتاح الحالة (مثل FIRST_TIME)', convStudioRemoveVariant: 'إزالة الحالة',
    convStudioContext: 'السياق', convStudioExposure: 'التعرّض', convStudioExposureAny: 'أي',
    convStudioExposureFirstTime: 'المرة الأولى', convStudioExposureNthOrLater: 'المرة N أو بعدها',
    convStudioExposureThreshold: 'الحد (N)', convStudioSurface: 'السطح', convStudioSurfaceAny: 'أي سطح'
  },
  es: {
    brand: 'Administración',
    loginHint: 'Inicia sesión con tu cuenta de administrador.', emailLabel: 'Correo electrónico', passwordLabel: 'Contraseña', loginSubmit: 'Iniciar sesión',
    gateErrorNotAdmin: 'Esta cuenta no tiene acceso de administrador.', gateErrorInvalidCredentials: 'Correo o contraseña incorrectos.',
    enforcementWarning: 'Advertencia: ADMIN_AUTH_ENFORCED no está configurado en el servidor - toda cuenta tiene acceso de administrador por ahora. Configura ADMIN_AUTH_ENFORCED=true.',
    tabUsers: 'Usuarios', tabAI: 'IA', tabTechnical: 'Técnico', tabXP: 'XP y segmentación', tabMarketplace: 'Mercado', tabFinancial: 'Finanzas',
    loading: 'Cargando…', errorGeneric: 'Algo salió mal.', retry: 'Reintentar',
    usersSearchPlaceholder: 'Buscar por nombre…',
    colDisplayName: 'Nombre visible', colJoined: 'Fecha de registro', colLastLogin: 'Último acceso', colOnline: 'Estado', colHoursOnline: 'Horas en línea', colPurchases: 'Compras', colTokensUsed: 'Tokens usados', colRole: 'Rol', colActions: 'Acciones',
    yes: 'Sí', no: 'No', online: 'En línea', offline: 'Desconectado',
    pageOf: 'Página {page} de {total}', prev: 'Anterior', next: 'Siguiente',
    close: 'Cerrar', save: 'Guardar', cancel: 'Cancelar', saved: 'Guardado.',
    roleUser: 'Usuario', roleModerator: 'Moderador', roleAdmin: 'Administrador', suspend: 'Suspender', unsuspend: 'Reactivar', suspended: 'Suspendido',
    aiKeyStatusSet: 'Clave configurada', aiKeyStatusNotSet: 'Sin clave', aiKeyInputPlaceholder: 'Nueva clave de API', saveKey: 'Guardar clave', aiKeyUpdatedAt: 'Actualizado {date}',
    pricingPromptLabel: 'Precio por 1K tokens de entrada', pricingCompletionLabel: 'Precio por 1K tokens de salida', budgetLabel: 'Presupuesto mensual de tokens', savePricing: 'Guardar tarifas',
    usageChartTitle: 'Uso de tokens por proveedor', usageChartEmpty: 'Aún no hay uso registrado.',
    dbConnectivity: 'Conectividad de la base de datos', dbOk: 'Conectada', dbFail: 'No disponible', migrationsApplied: 'Migraciones aplicadas', migrationsNone: 'Sin registro (backend en memoria)', communityApiHealth: 'API de comunidad', aiGatewayHealth: 'Pasarela de IA', errorTrackingLabel: 'Seguimiento de errores', errorTrackingValue: 'Aún no implementado',
    technicalPageSubtitle: 'Estado en vivo de la base de datos, los servicios en segundo plano y las APIs externas de las que depende la plataforma.', statSystemsHealthy: 'Sistemas saludables',
    xpStatTypes: 'Tipos de XP', xpStatOverridden: 'Valores personalizados', xpNoRows: 'Nada que mostrar.',
    xpPageSubtitle: 'Cada fuente de XP, límite y requisito de maestría que lee el motor - anula cualquier número, la lógica de verificación permanece en el código.',
    xpColDefault: 'Predeterminado', xpColCurrent: 'Actual', xpColEdit: 'Editar', xpColType: 'Tipo', xpColDomain: 'Dominio',
    xpColAchievement: 'Logro', xpColLevel: 'Nivel', xpColRequirement: 'Requisito',
    xpResetDefault: 'Restablecer predeterminado', xpPeriodDay: 'por día', xpPeriodWeek: 'por semana',
    xpSectionPoints: 'Puntos de XP por tipo', xpSectionDomainCaps: 'Tope diario por dominio',
    xpSectionRecurringCap: 'Tope diario total de actividades recurrentes', xpRecurringCapLabel: 'Tope diario',
    xpSectionSourceCaps: 'Máximo por fuente (p. ej. máx. entradas de gráfico por sesión)',
    xpSectionSourceTotalCaps: 'Tope total de puntos por fuente (p. ej. máx. XP por operación)',
    xpSectionPeriodCaps: 'Tope periódico por tipo', xpSectionAchievements: 'Puntos de logros',
    xpSectionMastery: 'Requisitos de dominio (mastery) por nivel',
    marketplacePageSubtitle: 'Todos los anuncios de informes de patrones del mercado - revisa evidencia, destaca o retira.',
    marketplaceColTitle: 'Título', marketplaceColSeller: 'Vendedor', marketplaceColPrice: 'Precio', marketplaceColEvidence: 'Evidencia', marketplaceColStatus: 'Estado', marketplaceColFeatured: 'Destacado',
    delistAction: 'Retirar', publishAction: 'Publicar', featureAction: 'Destacar', unfeatureAction: 'Quitar destacado',
    statusFilterAll: 'Todos', statusFilterDraft: 'Borrador', statusFilterPublished: 'Publicado', statusFilterDelisted: 'Retirado',
    financialPageSubtitle: 'Ingresos del mercado, costo real de proveedores de IA y presupuesto mensual restante, de un vistazo.',
    statMockRevenue: 'Ingresos del mercado (simulado)', statAiCostThisMonth: 'Costo de IA este mes', statTokensUsedThisMonth: 'Tokens usados este mes',
    financeMockRevenueTitle: 'Ingresos simulados del mercado', financeMockRevenueNote: 'Simulado — sin procesador de pagos real conectado.',
    financeAiCostTitle: 'Costo estimado de IA (este mes)', financeBudgetTitle: 'Presupuesto restante (este mes)',
    noPricingSet: 'Sin tarifas configuradas', noBudgetSet: 'Sin presupuesto configurado', tokensUsedLabel: 'tokens usados', remainingLabel: 'restante', budgetOfLabel: 'de {budget}',
    gateError: 'No se pudo continuar.', gateErrorOffline: 'No se pudo conectar con el servidor. ¿Está corriendo el backend de comunidad? (npm run dev:community-api)',
    backToApp: 'Volver a la app', sidebarToggleLabel: 'Mostrar/ocultar menú',
    statTotalUsers: 'Usuarios totales', statOnlineNow: 'En línea ahora', statProvidersConfigured: 'Proveedores configurados', statTotalListings: 'Anuncios totales', statPublishedListings: 'Publicados', statFeaturedListings: 'Destacados',
    detailLoadFailed: 'No se pudieron cargar los detalles del usuario.', noEmail: 'Sin correo registrado', noPhone: 'Sin teléfono registrado',
    usersPageSubtitle: 'Todas las cuentas de la plataforma — busca, revisa y abre un perfil.', viewProfile: 'Ver perfil',
    usersBackToLibrary: '← Todos los usuarios', joinedOnLabel: 'Se unió el {date}', levelCardTitle: 'Nivel y XP', verificationCardTitle: 'Verificación',
    kycStatusLabel: 'Estado de verificación (KYC)', kycNotStarted: 'No iniciado', kycPending: 'En revisión', kycVerified: 'Verificado', kycRejected: 'Rechazado', saveKyc: 'Guardar estado',
    profileRoleLabel: 'Rol de producto', profileRoleTrader: 'Trader', profileRoleMentor: 'Mentor', profileRoleTeacher: 'Profesor',
    levelXpLabel: 'Nivel {level} · {xp} XP', achievementsLabel: 'Logros', noAchievements: 'Aún no hay logros desbloqueados.',
    subscriptionsLabel: 'Suscripciones', noSubscriptions: 'Sin suscripciones.', mockBadge: 'simulado', purchasedOnLabel: 'Comprado el {date}',
    aiHealthLabel: 'Estado', statusHealthy: 'Saludable', statusDegraded: 'Inestable', statusIdle: 'Inactivo', statusDisconnected: 'Desconectado', statusUnconfigured: 'No configurado', statusUnknown: 'Aún no probado',
    aiTestNow: 'Probar ahora', aiTestingNow: 'Probando…', aiTestOk: 'Conexión correcta.', aiLastChecked: 'Última verificación {date}', aiLastErrorLabel: 'Último error: {error}',
    aiPageSubtitle: 'Claves de proveedores, precios, estado en vivo, enrutamiento de voz ElevenLabs y uso de toda la plataforma.',
    aiProviderKeysTitle: 'Claves de proveedores y precios', statHealthyProviders: 'Proveedores saludables',
    voiceProvidersTitle: 'Proveedores de voz (ElevenLabs)', voiceProvidersHint: 'Credenciales de ElevenLabs y enrutamiento de voz por idioma, gestionados por el administrador, para el Modo de Voz en vivo. Los cambios se aplican de inmediato, sin necesidad de reimplementar.',
    vpCredentialsTitle: 'Perfiles de credenciales', vpAddCredential: 'Añadir perfil de credencial', vpLabelPlaceholder: 'Nombre del perfil (p. ej., Cuenta principal de ElevenLabs)', vpKeyPlaceholder: 'Introduce la clave API de ElevenLabs', vpReplaceKeyHint: 'Déjalo vacío para conservar la clave actual', vpSaveCredential: 'Guardar perfil', vpNoCredentials: 'Aún no hay perfiles de credenciales.',
    vpKeyHint: 'La clave termina en {hint}', vpValidate: 'Validar', vpValidating: 'Validando…', vpDelete: 'Eliminar', vpDeleteConfirm: '¿Eliminar este perfil de credencial? Cualquier idioma que lo use volverá al estado predeterminado hasta que se seleccione un nuevo perfil.', vpDeleted: 'Clave eliminada.',
    vpEnabled: 'Habilitado', vpDisabled: 'Deshabilitado', vpValidationUnknown: 'Aún no validado', vpValidationValid: 'Válido', vpValidationInvalid: 'No válido', vpValidationRestricted: 'Restringido (permisos/IP)', vpLastValidated: 'Última validación {date}', vpNeverValidated: 'Nunca validado', vpValidationErrorCode: 'Motivo: {code}', vpValidateInconclusive: 'No se pudo contactar con ElevenLabs ahora mismo ({code}) - esto no significa que la clave sea inválida. Vuelve a validar.',
    vpCharactersTitle: 'Enrutamiento de voz por personaje', vpCharacterEnable: 'Usar ElevenLabs para este personaje', vpCredentialSelect: 'Perfil de credencial', vpNoCredentialSelected: 'Ninguna credencial seleccionada',
    vpCharacterHunter: 'Cazador', vpCharacterCommander: 'Comandante', vpCharacterEngineer: 'Ingeniero', vpCharacterSage: 'Sabio', vpGenderMale: 'Masculino', vpGenderFemale: 'Femenino', vpTestLanguage: 'Idioma de prueba',
    vpVoiceSearch: 'Buscar voces…', vpVoiceId: 'ID de voz', vpLoadVoices: 'Cargar voces', vpModelSelect: 'Modelo', vpLoadModels: 'Cargar modelos', vpFallback: 'Alternativa de OpenAI', vpSaveLanguage: 'Guardar', vpSaved: 'Guardado.',
    vpTestSample: 'Generar muestra de prueba', vpTestGenerating: 'Generando…', vpTestCreditsWarning: 'Esto generará audio real y consumirá créditos de ElevenLabs.', vpTestTextPlaceholder: 'Texto corto de muestra',
    vpHealthTitle: 'Estado y uso', vpStatusReady: 'Listo', vpStatusDisabled: 'Deshabilitado', vpStatusUnconfigured: 'Sin configurar', vpStatusInvalidCredential: 'Credencial no válida', vpStatusDegraded: 'Degradado',
    vpRequests24h: 'Solicitudes (24 h)', vpSuccessRate: 'Tasa de éxito', vpAvgLatency: 'Latencia media', vpLastSuccess: 'Último éxito', vpLastError: 'Último error', vpNoUsageYet: 'Aún no hay uso registrado', vpValidateFirst: 'Primero selecciona y valida una credencial',
    vpQuotaRefresh: 'Actualizar cuota', vpQuotaTier: 'Nivel {tier}', vpQuotaCharacters: '{used} / {limit} caracteres usados', vpQuotaRemaining: '{count} restantes (nominal)', vpQuotaNextReset: 'Se reinicia el {date}', vpQuotaOverage: 'Excedente permitido', vpQuotaUnavailable: 'Cuota no disponible', vpAnalyticsUnavailable: 'Permiso de uso no disponible',
    aiTodayTokensLabel: 'Hoy', aiMonthTokensLabel: 'Este mes', aiEstCostLabel: 'Costo estimado',
    aiTrendTitle: 'Uso diario (últimos 14 días)', aiTrendEmpty: 'Aún no hay uso en este período.',
    aiRecentEventsTitle: 'Eventos recientes de IA', aiRecentEventsEmpty: 'Aún no hay llamadas registradas.',
    aiRecentColTime: 'Hora', aiRecentColProvider: 'Proveedor', aiRecentColSource: 'Origen', aiRecentColStatus: 'Estado', aiRecentColLatency: 'Latencia',
    aiTopUsersTitle: 'Usuarios con mayor uso de tokens', aiTopUsersEmpty: 'Aún no hay uso registrado.', aiTopUsersColUser: 'Usuario', aiTopUsersColTokens: 'Tokens',
    usageByProviderLabel: 'Uso de tokens por proveedor', noProviderUsage: 'Aún no hay uso de IA registrado para este usuario.',
    aiCostSectionTitle: 'Costo y cargo de IA (real, por modelo)', aiCostProviderCost: 'Costo del proveedor', aiCostRetailCharge: 'Cargo al usuario',
    aiCostRateCardHint: 'Calculado a partir del uso real de tokens x tu tarifa de proveedor configurada - no una factura de OpenAI conciliada.',
    aiCostModel: 'Modelo', aiCostCalls: 'Llamadas', aiCostNoData: 'Aún no hay costo real de IA por modelo registrado para este usuario.',
    aiCostReconMatches: 'Las liquidaciones de la billetera coinciden con el uso', aiCostReconMismatch: 'Las liquidaciones de la billetera no coinciden con el uso',
    aiCostReconExpected: 'Cargo minorista esperado', aiCostReconSettled: 'Movimiento real de la billetera',
    aiCostReconSampleLimited: '(basado solo en las últimas 100 liquidaciones)',
    aiCostSettlementsTitle: 'Liquidaciones de la billetera', aiCostCashDebit: 'Débito en efectivo', aiCostPromoDebit: 'Débito promocional',
    aiUsageByModelTitle: 'Costo real liquidado por modelo (todos los usuarios)', aiUsageByModelEmpty: 'Aún no hay costo real de IA por modelo registrado.',
    aiCostProvider: 'Proveedor', aiCostPromptTokens: 'Tokens de entrada', aiCostCompletionTokens: 'Tokens de salida', aiCostTotalTokens: 'Tokens totales',
    comSubCryptoPayments: 'Pagos con criptomonedas',
    cryptoPayStatusTitle: 'Estado del proveedor', cryptoPayModeBsc: 'Cripto BSC', cryptoPayModeManual: 'Manual',
    cryptoPayConfigComplete: 'Configuración completa', cryptoPayRpcConfigured: 'RPC configurado', cryptoPayWebhookConfigured: 'Webhook configurado',
    cryptoPayYes: 'Sí', cryptoPayNo: 'No', cryptoPayLastTested: 'Última prueba: {date}', cryptoPayTestOk: 'correcta', cryptoPayTestFailed: 'fallida',
    cryptoPayDetectedChain: 'cadena {chainId}', cryptoPayNeverTested: 'La conexión aún no se ha probado',
    cryptoPayNewInvoicesWarning: 'Estos cambios solo afectan a las facturas creadas después de guardarlos - las facturas existentes conservan sus valores originales.',
    cryptoPayEnable: 'Activar pagos con cripto BSC', cryptoPayDisable: 'Desactivar pagos con cripto BSC',
    cryptoPayPublicTitle: 'Ajustes públicos de BSC', cryptoPayChainId: 'ID de cadena', cryptoPayDepositAddress: 'Dirección de la billetera de depósito',
    cryptoPayTokenSymbol: 'Símbolo del token', cryptoPayTokenContract: 'Contrato del token (BEP-20)', cryptoPayTokenDecimals: 'Decimales del token',
    cryptoPayExchangeRate: 'USD por token', cryptoPayConfirmations: 'Confirmaciones requeridas', cryptoPayExpiryMinutes: 'Caducidad de la factura (minutos)',
    cryptoPaySavePublic: 'Guardar ajustes públicos',
    cryptoPayRpcTitle: 'Conexión RPC', cryptoPayRpcConfiguredBadge: 'URL de RPC: configurada', cryptoPayRpcNotConfiguredBadge: 'URL de RPC: no configurada',
    cryptoPayRpcUrl: 'URL de RPC de BSC', cryptoPaySaveRpc: 'Guardar / rotar URL de RPC',
    cryptoPayReplaceRpcHint: 'Introduce una URL nueva para reemplazar la guardada - el valor actual nunca se muestra aquí.',
    cryptoPayClearRpc: 'Borrar', cryptoPayClearRpcConfirm: '¿Borrar la URL de RPC guardada? Los pagos con cripto BSC se desactivarán si estaban activos.',
    cryptoPayTestButton: 'Probar conexión', cryptoPayTestSuccess: 'Conectado - cadena reportada {chainId}',
    cryptoPayTestChainMismatch: '(la cadena configurada es {configured})', cryptoPayTestFailedReason: 'Prueba fallida: {reason}',
    cryptoPayWebhookTitle: 'Secreto del webhook (opcional)', cryptoPayWebhookHint: 'Configurado (termina en {hint})',
    cryptoPayWebhookNotConfiguredBadge: 'No configurado - el endpoint del webhook rechazará toda solicitud hasta que se genere uno',
    cryptoPayGenerateWebhook: 'Generar / rotar secreto',
    cryptoPayRotateWebhookConfirm: 'Rotar reemplaza el secreto actual - cualquier emisor de webhook existente debe actualizarse con el nuevo valor. ¿Continuar?',
    cryptoPayClearWebhook: 'Borrar',
    cryptoPayClearWebhookConfirm: '¿Borrar el secreto del webhook? El endpoint del webhook rechazará toda solicitud hasta que se genere uno nuevo.',
    cryptoPayWebhookRevealed: 'Nuevo secreto del webhook: {secret}',
    cryptoPayWebhookNeverShownAgain: 'Este valor se muestra una sola vez y no se puede recuperar después - cópialo ahora.',

    // Control de costos de IA - subpestaña de configuración de administración, totalmente localizada.
    comSubAiCostControl: 'Control de costos de IA',
    aiccStatusOk: 'Conciliado', aiccStatusNoAdapter: 'No hay un adaptador oficial de conciliación de costos configurado',
    aiccStatusNotConfigured: 'No configurado', aiccStatusNotSynced: 'Nunca sincronizado para este rango',
    aiccStatusNotComparableCurrency: 'No comparable - la moneda del proveedor difiere de USD',
    aiccRangeLabel: 'Rango de tiempo', aiccRange24h: 'Últimas 24 horas', aiccRange7d: 'Últimos 7 días', aiccRange30d: 'Últimos 30 días',
    aiccRangeMonth: 'Mes actual', aiccRangeCustom: 'Rango UTC personalizado',
    aiccCustomStart: 'Inicio (UTC)', aiccCustomEnd: 'Fin (UTC)', aiccApplyRange: 'Aplicar', aiccRangeUtcHint: 'Todos los rangos son UTC. Los datos de costo del proveedor se agrupan diariamente por la API oficial y pueden estar demorados - no son necesariamente en tiempo real.',
    aiccOverviewTitle: 'Resumen',
    aiccNotComparable: 'No comparable',
    aiccOverviewExternalCost: 'Costo real externo del proveedor', aiccSourceProviderApi: 'API oficial de costos del proveedor',
    aiccOverviewInternalEstimate: 'Estimación interna del costo del proveedor', aiccSourceInternalEstimate: 'Estimación interna por tarifa',
    aiccOverviewRetailCharge: 'Cargos minoristas a usuarios', aiccSourceRetailCharge: 'Cargo de la billetera minorista',
    aiccOverviewWalletDebit: 'Débitos reales de la billetera', aiccOverviewMargin: 'Margen (cargo minorista - costo externo real)',
    aiccOverviewReconciliation: 'Excepciones de conciliación', aiccOverviewFreshness: 'Proveedores con datos comparables',
    aiccFreshnessStale: 'desactualizado', aiccFreshnessComparable: 'comparable',
    aiccProvidersTitle: 'Proveedores',
    aiccColProvider: 'Proveedor', aiccColStatus: 'Estado', aiccColExternalCost: 'Costo externo', aiccColInternalEstimate: 'Estimación interna',
    aiccColDiff: 'Diferencia', aiccColRetailCharge: 'Cargo minorista', aiccColBalance: 'Saldo', aiccColLastSync: 'Última sincronización exitosa',
    aiccColScope: 'Alcance / proyecto', aiccColActions: 'Acciones',
    aiccOutOfTolerance: 'Fuera de tolerancia',
    aiccBalanceUnavailable: 'Saldo no disponible mediante la API oficial', aiccBalanceManualLabel: 'Manual, no usado para conciliación',
    aiccRefreshBtn: 'Actualizar', aiccRefreshing: 'Actualizando…', aiccRefreshSuccess: 'Actualizado correctamente', aiccRefreshFailed: 'Error al actualizar',
    aiccRefreshProjectMismatch: 'OpenAI devolvió {total} partida(s) de costo real para tu organización, pero ninguna coincidió con el Project id configurado - verifícalo contra un id de proyecto real en platform.openai.com/settings/organization/projects.',
    aiccConfigureBtn: 'Configura una credencial abajo para habilitar',
    aiccModelsTitle: 'Modelos',
    aiccColInputTokens: 'Tokens de entrada', aiccColOutputTokens: 'Tokens de salida', aiccColCachedTokens: 'Tokens de entrada en caché',
    aiccColCacheWriteTokens: 'Tokens de escritura de caché', aiccColReasoningTokens: 'Tokens de razonamiento (informativo)',
    aiccColExternalCostModel: 'Costo externo',
    aiccModelExternalNotSupported: 'No compatible a nivel de modelo para este proveedor',
    aiccReconciliationTitle: 'Conciliación',
    aiccReconInternalTitle: 'Conciliación interna exacta de billetera / uso',
    aiccReconMatched: 'Coincidente', aiccReconMissingSettlement: 'Liquidación faltante', aiccReconOrphanSettlement: 'Liquidación huérfana',
    aiccReconAmountMismatch: 'Discrepancia de monto', aiccReconProviderModelMismatch: 'Discrepancia de proveedor/modelo', aiccReconExcluded: 'Excluido (no facturable)',
    aiccReconTruncated: 'Este rango tiene más filas de las que se pudieron analizar en una pasada - los conteos anteriores reflejan solo las filas analizadas. Reduce el rango para un total exacto.',
    aiccExceptionsTitle: 'Excepciones',
    aiccColExceptionType: 'Tipo', aiccColKey: 'Clave', aiccColOccurredAt: 'Ocurrió el',
    aiccReconExternalTitle: 'Conciliación externa del proveedor (se espera que varíe)',
    aiccToleranceLabel: 'Tolerancia de advertencia (%)', aiccToleranceSave: 'Guardar',
    aiccCredentialsTitle: 'Credenciales de conciliación de costos del proveedor',
    aiccTestConnection: 'Probar conexión', aiccTestConnectionSuccess: 'Conexión exitosa', aiccTestConnectionFailed: 'Conexión fallida',
    aiccDeleteCredential: 'Eliminar', aiccDeleteCredentialConfirm: '¿Eliminar esta credencial? La conciliación de este proveedor dejará de funcionar hasta que se agregue una nueva.',
    aiccColLabel: 'Etiqueta', aiccApiKey: 'Clave API (clave de administrador de la organización)', aiccProjectId: 'Id. de proyecto dedicado',
    aiccAddCredential: 'Agregar credencial',
    aiccScopeConfigHint: 'Para OpenAI, usa una clave ADMIN dedicada de la organización (no la clave de API normal del modelo) y un id. de proyecto NAVRYA dedicado, para que el uso de la organización no relacionado nunca se cuente.',
    aiccBalanceManualTitle: 'Captura manual de saldo (opcional)',
    aiccBalanceManualAmount: 'Monto (USD)', aiccBalanceManualNote: 'Nota', aiccBalanceManualSave: 'Guardar captura',

    tabConversationStudio: 'Estudio de Conversación',
    convStudioTitle: 'Estudio de Conversación', convStudioHint: 'Crea, prueba y publica los escenarios deterministas que el Router de Conversación resuelve localmente, sin ninguna llamada a la IA.',
    convStudioStatTotal: 'Escenarios totales', convStudioStatPublished: 'Publicados', convStudioStatDraft: 'Borrador',
    convStudioCreateTitle: 'Crear un escenario', convStudioScenarioKey: 'Clave del escenario (p. ej. session.purpose)', convStudioDomain: 'Dominio', convStudioKind: 'Tipo',
    convStudioKindFaq: 'Pregunta frecuente', convStudioKindDataQuery: 'Consulta de datos', convStudioKindSurfaceHelp: 'Ayuda de pantalla activa', convStudioCreate: 'Crear', convStudioKeyRequired: 'La clave del escenario es obligatoria.',
    convStudioColKey: 'Clave', convStudioColDomain: 'Dominio', convStudioColKind: 'Tipo', convStudioColStatus: 'Estado', convStudioColVersion: 'Versión', convStudioColLanguages: 'Idiomas', convStudioColUpdated: 'Actualizado', convStudioColPublishedAt: 'Publicado',
    convStudioStatusPublished: 'Publicado', convStudioStatusDraft: 'Borrador', convStudioStatusArchived: 'Archivado',
    convStudioVersionHistory: 'Historial de versiones', convStudioRollback: 'Revertir', convStudioRollbackConfirm: '¿Revertir a esta versión? Esto crea una nueva versión, publicada de inmediato, con el contenido exacto de esta versión - la versión anterior nunca se reactiva en su lugar.',
    convStudioTriggerLab: 'Laboratorio de Disparadores', convStudioTriggerLabHint: 'Ejecuta exactamente el mismo motor de coincidencia que usa producción, contra este borrador y cada otro escenario publicado - cero llamadas a la IA.',
    convStudioTestUtterance: 'Frase de prueba', convStudioRunTest: 'Probar', convStudioResolution: 'Resolución', convStudioScore: 'Puntuación', convStudioReasons: 'Razones',
    convStudioRunBatch: 'Ejecutar conjunto de pruebas', convStudioPositiveRate: 'Tasa de acierto positivo', convStudioNegativeRate: 'Tasa de rechazo negativo',
    convStudioCheckCollisions: 'Comprobar colisiones', convStudioNoCollisions: 'No se encontraron colisiones con los escenarios actualmente publicados.',
    convStudioBackToLibrary: '← Volver a la biblioteca', convStudioUnarchive: 'Desarchivar', convStudioArchive: 'Archivar', convStudioNewRevision: 'Nueva revisión',
    convStudioNoDraft: 'No hay ningún borrador en curso - haz clic en "Nueva revisión" para editar la siguiente versión.', convStudioEditingDraft: 'Editando borrador',
    convStudioCta: 'Acción sugerida (CTA)', convStudioCtaNone: 'Ninguna',
    convStudioCorpusPositive: 'Ejemplos de prueba positivos (uno por línea)', convStudioCorpusNegative: 'Ejemplos de prueba negativos (uno por línea)',
    convStudioGroups: 'Grupos de conceptos (un grupo por línea, términos separados por |)', convStudioStrong: 'Frases fuertes (una por línea)', convStudioNegative: 'Frases negativas (una por línea)',
    convStudioWrittenResponse: 'Respuesta escrita', convStudioVoiceResponse: 'Respuesta hablada (voz)',
    convStudioSaveDraft: 'Guardar borrador', convStudioPublish: 'Publicar', convStudioPublished: 'Publicado.', convStudioPublishBlocked: 'Publicación bloqueada',
    convStudioAudioTitle: 'Audio publicado', convStudioAudioNotEligible: 'Los escenarios de "consulta de datos" usan valores en vivo específicos de cada usuario y nunca pueden tener audio estático publicado.',
    convStudioAudioNoText: 'Aún no hay respuesta escrita ni hablada - no hay nada de qué generar audio.', convStudioAudioNoneYet: 'Aún no se ha generado audio para este idioma.',
    convStudioAudioApproved: 'Aprobado - activo para usuarios de voz', convStudioAudioStale: 'obsoleto (el texto cambió desde que se generó este audio)',
    convStudioAudioStaleBlocked: 'Este candidato ya no coincide con el texto actual - vuelve a generarlo antes de aprobarlo.',
    convStudioAudioPreview: 'Vista previa - aún no activo', convStudioAudioUsedWrittenFallback: 'se usó la respuesta escrita (no se configuró una respuesta de voz separada)',
    convStudioAudioApprove: 'Aprobar', convStudioAudioArchive: 'Archivar', convStudioAudioGenerate: 'Generar', convStudioAudioGenerating: 'Generando…',
    convStudioAudioVoiceProfileKey: 'Etiqueta del perfil de voz',
    convStudioExpressiveVoice: 'Voz expresiva', convStudioEnhanceDelivery: 'Mejorar la entrega', convStudioEnhancing: 'Mejorando…',
    convStudioDeliveryNote: 'Nota de entrega (opcional)', convStudioDeliveryNotePlaceholder: 'p. ej. cálido y curioso',
    convStudioPerformanceValid: 'Válido - coincide con el diálogo canónico', convStudioPerformanceInvalid: 'No usado - ',
    convStudioVariants: 'Variantes de contexto', convStudioAddVariant: '+ Añadir variante de contexto',
    convStudioVariantKey: 'Clave de variante (p. ej. FIRST_TIME)', convStudioRemoveVariant: 'Eliminar variante',
    convStudioContext: 'Contexto', convStudioExposure: 'Exposición', convStudioExposureAny: 'Cualquiera',
    convStudioExposureFirstTime: 'Primera vez', convStudioExposureNthOrLater: 'N-ésima vez o después',
    convStudioExposureThreshold: 'Umbral (N)', convStudioSurface: 'Superficie', convStudioSurfaceAny: 'Cualquiera'
  }
};

const languageNames = { en: 'English', fa: 'فارسی', ar: 'العربية', es: 'Español' };
// Phase 8e of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
// Constraints section): this page authenticates separately from the character pages (its own
// admin-role check, Section 7.16) and a language choice here was never meaningfully tied to a
// specific trader's own preference either way - hardcoded to the same default this page already
// used ('en', confirmed from the removed localStorage fallback and from
// <html lang="en" dir="ltr">'s own first-paint default) rather than migrated. The language picker
// still works for the rest of this one page load, it just never persists across a reload any
// more (nothing replaces the old tradejournal-language key on this page).
let activeLanguage = 'en';

function t(key, vars) {
  let value = (translations[activeLanguage] && translations[activeLanguage][key]) || translations.en[key] || key;
  Object.keys(vars || {}).forEach((name) => { value = value.replaceAll('{' + name + '}', vars[name]); });
  return value;
}

function applyLanguage(language) {
  activeLanguage = translations[language] ? language : 'en';
  document.documentElement.lang = activeLanguage;
  document.documentElement.dir = activeLanguage === 'fa' || activeLanguage === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
  document.querySelector('#currentLanguage').textContent = languageNames[activeLanguage];
  document.querySelectorAll('[data-language]').forEach((button) => button.classList.toggle('active', button.dataset.language === activeLanguage));
  const toggle = document.querySelector('#sidebarToggle');
  if (toggle) toggle.setAttribute('aria-label', t('sidebarToggleLabel'));
}

let toastTimer;
function showToast(message, tone) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.className = 'toast show' + (tone ? ' ' + tone : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.classList.remove('show'); }, 2600);
}

const languageButton = document.querySelector('#languageButton');
const languageMenu = document.querySelector('#languageMenu');
languageButton.addEventListener('click', () => { const open = languageMenu.hidden; languageMenu.hidden = !open; languageButton.setAttribute('aria-expanded', String(open)); });
document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => { applyLanguage(button.dataset.language); languageMenu.hidden = true; languageButton.setAttribute('aria-expanded', 'false'); rerenderCurrentTab(); }));
document.addEventListener('click', (event) => { if (!event.target.closest('.language-picker')) { languageMenu.hidden = true; languageButton.setAttribute('aria-expanded', 'false'); } });

const switcher = window.TradeJournalDevUserSwitcher;
const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
function fmtNumber(value) { return value === null || value === undefined || Number.isNaN(Number(value)) ? '—' : numberFormat.format(Number(value)); }
function fmtDate(value) { if (!value) return '—'; try { return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); } catch (_) { return '—'; } }
// Commercial System Slice 1 - money is integer microUSD everywhere server-side (never a float);
// this is the ONE place it ever becomes a display string.
function fmtMicroUsd(microUsd) { return microUsd === null || microUsd === undefined ? '—' : '$' + (Number(microUsd) / 1000000).toFixed(4); }

// Every fetch below attaches x-dev-user-id (bootstrapped once via switcher.ensureUser() in
// boot()) since /api/admin/* sits behind the same devUserAuth as the rest of Community -
// requireAdmin only adds a role check on top, it does not replace this identity step.
function api(path, options) {
  options = options || {};
  const id = switcher && switcher.currentUserId();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, id ? { 'x-dev-user-id': id } : {}, options.headers || {});
  return fetch('/api/admin' + path, Object.assign({}, options, { headers })).then((response) => response.json().catch(() => ({})).then((body) => {
    if (!response.ok) { const error = new Error((body && body.error) || 'REQUEST_FAILED'); error.status = response.status; error.body = body; throw error; }
    return body;
  }));
}

function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function icons(root) { if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(root || document); }
// Gentelella-style "tile" stat cards - every value passed in must already be real, computed
// from the same response the table/cards below it render from. Never call this with an
// invented number.
function statCard(iconName, value, label) {
  const card = el('div', 'admin-stat-card');
  const iconWrap = el('div', 'admin-stat-icon');
  if (window.TradeJournalIcons) iconWrap.append(window.TradeJournalIcons.icon(iconName));
  const text = el('div');
  text.append(el('p', 'admin-stat-value', String(value)), el('p', 'admin-stat-label', label));
  card.append(iconWrap, text);
  return card;
}
function statRow(cards) { const row = el('div', 'admin-stat-row'); row.append(...cards); return row; }
// Per-tab page header (icon + title + one-line subtitle), prepended inside a tab's own body -
// #pageTitle in the topbar is untouched (renderTab() still sets it via textContent, unchanged).
// subtitleKey is optional; omit it for a header with no subtitle line.
function pageHeader(iconName, titleKey, subtitleKey) {
  const wrap = el('div', 'admin-page-header');
  const iconWrap = el('div', 'admin-page-header-icon');
  if (window.TradeJournalIcons) iconWrap.append(window.TradeJournalIcons.icon(iconName));
  const text = el('div');
  // h2, not h1 - the topbar's own #pageTitle (index.html) is already a real <h1> for this page;
  // this is a secondary, in-body restatement, so it nests under that instead of duplicating it.
  text.append(el('h2', 'admin-page-header-title', t(titleKey)));
  if (subtitleKey) text.append(el('p', 'admin-page-header-subtitle', t(subtitleKey)));
  wrap.append(iconWrap, text);
  return wrap;
}
// A section head (label + optional right-aligned hint) introducing one group of cards within a
// tab body, without a full page header - e.g. "Provider keys & pricing" above a card grid.
function sectionHead(titleKey, hintText) {
  const wrap = el('div', 'admin-section-head');
  wrap.append(el('h3', '', t(titleKey)));
  if (hintText) wrap.append(el('p', 'hint', hintText));
  return wrap;
}
function errorNode(error, onRetry) {
  const wrap = el('div', 'admin-card');
  wrap.append(el('p', 'error-text', t('errorGeneric') + (error && error.code ? ' (' + error.code + ')' : '')));
  const retry = el('button', 'btn btn-secondary', t('retry'));
  retry.type = 'button';
  retry.onclick = onRetry;
  wrap.append(retry);
  return wrap;
}

// --- Users tab ---
// Split into a library (list) and a dedicated profile page, the same list->detail shape
// Conversation Studio already uses (conversationStudioSelectedId / conversationStudioTab()) -
// mirrored here rather than inventing a second mechanism.

let usersState = { search: '', sort: 'createdAt', dir: 'desc', page: 1 };
let usersSelectedId = null;

function usersTab() {
  return usersSelectedId ? userProfilePage(usersSelectedId) : usersLibrary();
}
function openUserProfile(id) { usersSelectedId = id; renderTab(); }

function usersLibrary() {
  return api('/users?search=' + encodeURIComponent(usersState.search) + '&sort=' + usersState.sort + '&dir=' + usersState.dir + '&page=' + usersState.page).then(buildUsersLibraryBody);
}
function buildUsersLibraryBody(data) {
    const wrap = el('div');
    wrap.append(pageHeader('users', 'tabUsers', 'usersPageSubtitle'));
    wrap.append(statRow([
      statCard('users', fmtNumber(data.total), t('statTotalUsers')),
      statCard('wifi', fmtNumber(data.onlineCount || 0), t('statOnlineNow'))
    ]));
    const toolbar = el('div', 'admin-toolbar');
    const search = document.createElement('input');
    search.type = 'text'; search.placeholder = t('usersSearchPlaceholder'); search.value = usersState.search;
    search.oninput = () => { usersState.search = search.value; usersState.page = 1; renderTab(); };
    toolbar.append(search);
    wrap.append(toolbar);

    const tableWrap = el('div', 'admin-table-wrap');
    const table = document.createElement('table');
    table.className = 'admin-table';
    const columns = [
      ['displayName', 'colDisplayName'], ['createdAt', 'colJoined'], ['lastLoginAt', 'colLastLogin'],
      ['isOnline', 'colOnline'], ['hoursOnline', 'colHoursOnline'], ['purchaseCount', 'colPurchases'],
      ['totalTokensUsed', 'colTokensUsed'], [null, 'colRole'], [null, 'colActions']
    ];
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    columns.forEach(([sortKey, labelKey]) => {
      const th = document.createElement('th');
      th.textContent = t(labelKey);
      if (sortKey) {
        th.classList.toggle('sorted', usersState.sort === sortKey);
        th.onclick = () => { usersState.dir = usersState.sort === sortKey && usersState.dir === 'desc' ? 'asc' : 'desc'; usersState.sort = sortKey; renderTab(); };
      }
      headRow.append(th);
    });
    thead.append(headRow);
    table.append(thead);

    const tbody = document.createElement('tbody');
    data.users.forEach((user) => {
      const row = document.createElement('tr');
      row.classList.add('admin-row-clickable');
      row.onclick = () => openUserProfile(user.id);
      row.append(
        cell(user.displayName), cell(fmtDate(user.createdAt)), cell(fmtDate(user.lastLoginAt)),
        onlineCell(user.isOnline), cell(fmtNumber(user.hoursOnline)),
        cell(user.purchaseCount + ' · ' + fmtNumber(user.totalMockSpent)), cell(fmtNumber(user.totalTokensUsed)),
        cell(t('role' + user.role.charAt(0).toUpperCase() + user.role.slice(1)))
      );
      const actionsCell = document.createElement('td');
      const viewBtn = el('button', 'btn btn-secondary btn-sm', t('viewProfile'));
      viewBtn.type = 'button';
      viewBtn.onclick = (event) => { event.stopPropagation(); openUserProfile(user.id); };
      actionsCell.append(viewBtn);
      row.append(actionsCell);
      tbody.append(row);
    });
    table.append(tbody);
    tableWrap.append(table);
    wrap.append(tableWrap);

    const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
    const pagination = el('div', 'admin-pagination');
    const prev = el('button', 'btn btn-secondary', t('prev'));
    prev.type = 'button'; prev.disabled = usersState.page <= 1;
    prev.onclick = () => { usersState.page -= 1; renderTab(); };
    const next = el('button', 'btn btn-secondary', t('next'));
    next.type = 'button'; next.disabled = usersState.page >= totalPages;
    next.onclick = () => { usersState.page += 1; renderTab(); };
    pagination.append(prev, el('span', '', t('pageOf', { page: usersState.page, total: totalPages })), next);
    wrap.append(pagination);
    return wrap;
}
function cell(text) { const td = document.createElement('td'); td.textContent = text; return td; }
function onlineCell(isOnline) {
  const td = document.createElement('td');
  const dot = el('span', 'online-dot' + (isOnline ? ' online' : ''));
  td.append(dot, document.createTextNode(' ' + (isOnline ? t('online') : t('offline'))));
  return td;
}
function humanizeAchievementKey(key) { return String(key || '').split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' '); }
function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
function kvRow(labelText, valueNode) {
  const row = el('div', 'admin-kv-row');
  row.append(el('span', '', labelText));
  const value = el('span', '');
  if (typeof valueNode === 'string') value.textContent = valueNode; else value.append(valueNode);
  row.append(value);
  return row;
}

function userProfilePage(id) {
  return api('/users/' + id).then(buildUserProfilePage).catch((error) => {
    const wrap = el('div');
    wrap.append(usersBackButton());
    wrap.append(errorNode(error, () => renderTab()));
    return wrap;
  });
}
function usersBackButton() {
  const btn = el('button', 'btn btn-secondary btn-sm', t('usersBackToLibrary'));
  btn.type = 'button';
  btn.onclick = () => { usersSelectedId = null; renderTab(); };
  return btn;
}
// `user` here is the fully-enriched GET /api/admin/users/:id response (identity, kyc,
// profileRole, xpTotal, achievements, subscriptions, usageByProvider, aiCost).
function buildUserProfilePage(user) {
  const wrap = el('div');
  wrap.append(usersBackButton());

  const header = el('div', 'admin-profile-header');
  const avatar = el('div', 'admin-profile-avatar');
  if (user.avatarDataUrl) { const img = document.createElement('img'); img.src = user.avatarDataUrl; img.alt = ''; avatar.append(img); }
  else avatar.textContent = initialsOf(user.displayName);
  const idBlock = el('div', 'admin-profile-id');
  const nameLine = el('h2', 'admin-profile-name', user.displayName + ' ');
  nameLine.append(el('span', 'badge', t('role' + user.role.charAt(0).toUpperCase() + user.role.slice(1))));
  const metaLine = el('div', 'admin-profile-meta');
  metaLine.append(el('span', '', user.email || t('noEmail')), el('span', '', user.phone || t('noPhone')), el('span', '', t('joinedOnLabel', { date: fmtDate(user.createdAt) })));
  idBlock.append(nameLine, metaLine);

  const actions = el('div', 'admin-profile-actions');
  const roleSelect = document.createElement('select');
  ['user', 'moderator', 'admin'].forEach((role) => roleSelect.append(new Option(t('role' + role.charAt(0).toUpperCase() + role.slice(1)), role, false, user.role === role)));
  roleSelect.onchange = () => {
    api('/users/' + user.id, { method: 'PATCH', body: JSON.stringify({ role: roleSelect.value }) })
      .then(() => showToast(t('saved'))).catch((error) => showToast(error.message, 'danger'));
  };
  const suspendBtn = el('button', 'btn btn-sm ' + (user.suspendedAt ? 'btn-secondary' : 'btn-danger'), user.suspendedAt ? t('unsuspend') : t('suspend'));
  suspendBtn.type = 'button';
  suspendBtn.onclick = () => {
    api('/users/' + user.id, { method: 'PATCH', body: JSON.stringify({ suspendedAt: user.suspendedAt ? null : new Date().toISOString() }) })
      .then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
  };
  actions.append(roleSelect, suspendBtn);
  header.append(avatar, idBlock, actions);
  wrap.append(header);

  const columns = el('div', 'admin-profile-columns');
  const left = el('div');
  const right = el('div');

  // --- Left: verification, level/XP, achievements, subscriptions ---
  const verifyCard = el('div', 'admin-card');
  verifyCard.append(el('h3', '', t('verificationCardTitle')));
  verifyCard.append(kvRow(t('kycStatusLabel'), el('span', 'badge', t('kyc' + user.kycStatus.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')))));
  verifyCard.append(kvRow(t('profileRoleLabel'), t('profileRole' + user.profileRole.charAt(0).toUpperCase() + user.profileRole.slice(1))));
  const kycField = el('label', 'field');
  kycField.append(el('span', '', t('kycStatusLabel')));
  const kycSelect = document.createElement('select');
  ['not_started', 'pending', 'verified', 'rejected'].forEach((status) => kycSelect.append(new Option(t('kyc' + status.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')), status, false, user.kycStatus === status)));
  kycField.append(kycSelect);
  const saveKycBtn = el('button', 'btn btn-secondary', t('saveKyc'));
  saveKycBtn.type = 'button';
  saveKycBtn.onclick = () => {
    api('/users/' + user.id + '/kyc', { method: 'PATCH', body: JSON.stringify({ kycStatus: kycSelect.value }) })
      .then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
  };
  verifyCard.append(kycField, saveKycBtn);
  left.append(verifyCard);

  const xpCard = el('div', 'admin-card');
  xpCard.append(el('h3', '', t('levelCardTitle')));
  const rules = window.TradeJournalProfileXPRules;
  const level = rules ? rules.levelForXp(user.xpTotal) : user.level;
  xpCard.append(el('p', '', t('levelXpLabel', { level: level, xp: fmtNumber(user.xpTotal) })));
  // Real progress within the current level, from the same thresholds/formula the NAVRYA header
  // ring already uses (ARCHITECTURE.md 11.17) - never shown when the rules script failed to
  // load, or at the final level (xpForNextLevel returns null, nothing to progress toward).
  if (rules) {
    const nextThreshold = rules.xpForNextLevel(user.xpTotal);
    if (nextThreshold != null) {
      const currentThreshold = rules.LEVEL_THRESHOLDS[level - 1] || 0;
      const pct = Math.max(0, Math.min(100, ((user.xpTotal - currentThreshold) / (nextThreshold - currentThreshold)) * 100));
      const track = el('div', 'admin-xp-progress-track');
      const fill = el('div', 'admin-xp-progress-fill');
      fill.style.width = pct + '%';
      track.append(fill);
      xpCard.append(track);
    }
  }
  left.append(xpCard);

  const achCard = el('div', 'admin-card');
  achCard.append(el('h3', '', t('achievementsLabel')));
  if (!user.achievements || !user.achievements.length) {
    achCard.append(el('p', 'hint', t('noAchievements')));
  } else {
    const achList = document.createElement('ul');
    user.achievements.forEach((achievement) => { const li = document.createElement('li'); li.textContent = humanizeAchievementKey(achievement.achievementKey) + ' — ' + fmtDate(achievement.unlockedAt); achList.append(li); });
    achCard.append(achList);
  }
  left.append(achCard);

  const subCard = el('div', 'admin-card');
  subCard.append(el('h3', '', t('subscriptionsLabel')));
  if (!user.subscriptions || !user.subscriptions.length) {
    subCard.append(el('p', 'hint', t('noSubscriptions')));
  } else {
    const subList = document.createElement('ul');
    user.subscriptions.forEach((sub) => {
      const li = document.createElement('li');
      li.textContent = (sub.listing ? sub.listing.title : sub.listingId) + ' — ' + t('purchasedOnLabel', { date: fmtDate(sub.purchasedAt) }) + ' (' + t('mockBadge') + ')';
      subList.append(li);
    });
    subCard.append(subList);
  }
  left.append(subCard);

  // --- Right: token usage by provider, real per-model AI cost ---
  const usageCard = el('div', 'admin-card');
  usageCard.append(el('h3', '', t('usageByProviderLabel')));
  if (!user.usageByProvider || !user.usageByProvider.length) {
    usageCard.append(el('p', 'hint', t('noProviderUsage')));
  } else {
    const usageList = document.createElement('ul');
    user.usageByProvider.forEach((row) => { const li = document.createElement('li'); li.textContent = row.provider + ': ' + fmtNumber(row.totalTokens) + ' ' + t('tokensUsedLabel'); usageList.append(li); });
    usageCard.append(usageList);
  }
  right.append(usageCard);

  const aiCostCard = el('div', 'admin-card');
  aiCostCard.append(el('h3', '', t('aiCostSectionTitle')));
  aiCostCard.append(el('p', 'hint', t('aiCostRateCardHint')));
  if (!user.aiCost || !user.aiCost.byModel || !user.aiCost.byModel.length) {
    aiCostCard.append(el('p', 'hint', t('aiCostNoData')));
  } else {
    const aiCostList = document.createElement('ul');
    user.aiCost.byModel.forEach((row) => {
      const li = document.createElement('li');
      li.textContent = (row.provider + '/' + (row.model || '—')) + ' — ' + t('aiCostCalls') + ': ' + fmtNumber(row.calls)
        + ' · ' + t('aiCostProviderCost') + ': ' + fmtMicroUsd(row.providerCostMicroUsd)
        + ' · ' + t('aiCostRetailCharge') + ': ' + fmtMicroUsd(row.retailChargeMicroUsd);
      aiCostList.append(li);
    });
    aiCostCard.append(aiCostList);
  }
  // AI Cost Control per-user drill-down: real wallet settlement links (cash vs promo debit) and a
  // cheap reconciliation signal - never organization-level external provider cost allocated to
  // this one user, since no provider's cost API supports that attribution (see
  // Admin > Commercial > AI Cost Control's own provider table for the real, aggregate comparison).
  if (user.aiCost && user.aiCost.reconciliation) {
    const recon = user.aiCost.reconciliation;
    const badge = el('span', 'badge status-' + (recon.matches ? 'valid' : 'invalid'), recon.matches ? t('aiCostReconMatches') : t('aiCostReconMismatch'));
    aiCostCard.append(el('p', 'hint', t('aiCostReconExpected') + ': ' + fmtMicroUsd(recon.expectedRetailChargeMicroUsd) + ' · ' + t('aiCostReconSettled') + ': ' + fmtMicroUsd(recon.settledRetailChargeMicroUsd)));
    const reconLine = el('p', 'hint');
    reconLine.append(badge);
    if (recon.sampleLimited) reconLine.append(document.createTextNode(' ' + t('aiCostReconSampleLimited')));
    aiCostCard.append(reconLine);
  }
  if (user.aiCost && user.aiCost.walletSettlements && user.aiCost.walletSettlements.length) {
    aiCostCard.append(el('h4', '', t('aiCostSettlementsTitle')));
    const settlementList = document.createElement('ul');
    user.aiCost.walletSettlements.slice(0, 20).forEach((entry) => {
      const li = document.createElement('li');
      li.textContent = fmtDate(entry.createdAt) + ' — ' + entry.provider + '/' + (entry.model || '—')
        + ' · ' + t('aiCostCashDebit') + ': ' + fmtMicroUsd(Math.abs(entry.cashDeltaMicroUsd))
        + ' · ' + t('aiCostPromoDebit') + ': ' + fmtMicroUsd(Math.abs(entry.promoDeltaMicroUsd));
      settlementList.append(li);
    });
    aiCostCard.append(settlementList);
  }
  right.append(aiCostCard);

  columns.append(left, right);
  wrap.append(columns);
  return wrap;
}

// --- AI tab ---

const KNOWN_PROVIDERS = ['openai', 'anthropic', 'gemini', 'kimi', 'deepseek'];

// Section 7.16 follow-up: the AI tab now also surfaces per-provider health (is it actually
// working right now, or did it just disconnect - GET /ai/health, Part 1), this-month cost
// (reusing /finance/overview's real cost math instead of duplicating it), a 14-day usage trend,
// a recent-events feed, and a top-users-by-tokens table (GET /users sorted server-side, the
// exact same endpoint/sort the Users tab already offers - no new join logic needed here).
function aiTab() {
  // Keys/pricing are the tab's original, load-bearing functionality - a failure there still
  // shows the generic error card (errorNode()), same as before. The four newer sections
  // (usage/health/finance/topUsers) are each independently allowed to fail - e.g. the DB
  // migration for ai_provider_health_events not having run yet on this environment - without
  // taking down key/pricing management, which an operator may urgently need regardless.
  return Promise.all([
    api('/ai/keys'), api('/ai/pricing'),
    api('/ai/usage?days=14').catch(() => ({ byProviderAndDay: [], byUser: {}, days: 14 })),
    api('/ai/health').catch(() => ({ providers: [], recent: [] })),
    api('/finance/overview').catch(() => ({ mockRevenue: { total: 0, mock: true }, aiCostByProvider: [], remainingBudgetByProvider: [] })),
    api('/users?sort=totalTokensUsed&dir=desc&pageSize=10&page=1').catch(() => ({ users: [] })),
    // Real, settled per-model $ cost/charge (task D.3) - independently allowed to fail, same
    // posture as the four sections above it.
    api('/ai/usage-by-model?days=30').catch(() => ({ byModel: [], days: 30 })),
    // Voice Providers (ElevenLabs) - independently allowed to fail, same posture as the four
    // sections above: an operator managing LLM keys must not be blocked by a voice-provider
    // migration not having run yet on this environment.
    api('/voice-providers/credentials').catch(() => []),
    api('/voice-providers/characters').catch(() => []),
    api('/voice-providers/health').catch(() => ({ characters: [] }))
  ]).then(([keys, pricing, usage, health, finance, topUsers, usageByModel, vpCredentials, vpCharacters, vpHealth]) => {
    const wrap = el('div');
    wrap.append(pageHeader('brain-circuit', 'tabAI', 'aiPageSubtitle'));
    const grid = el('div', 'admin-grid');
    const keyByProvider = {}; keys.forEach((k) => { keyByProvider[k.provider] = k; });
    const pricingByProvider = {}; pricing.forEach((p) => { pricingByProvider[p.provider] = p; });
    const healthByProvider = {}; (health.providers || []).forEach((p) => { healthByProvider[p.provider] = p; });
    const costByProvider = {}; (finance.aiCostByProvider || []).forEach((p) => { costByProvider[p.provider] = p; });
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayTokensByProvider = {};
    (usage.byProviderAndDay || []).forEach((row) => {
      const dayKey = new Date(row.day).toISOString().slice(0, 10);
      todayTokensByProvider[row.provider] = (todayTokensByProvider[row.provider] || 0) + (dayKey === todayKey ? row.totalTokens : 0);
    });
    // Second real stat, computed from the same /ai/health response the provider cards below
    // already read - counts providers whose live health check is currently 'healthy', not just
    // "has a key saved" (that's what the first stat already covers).
    const healthyProviderCount = KNOWN_PROVIDERS.filter((provider) => healthByProvider[provider] && healthByProvider[provider].status === 'healthy').length;
    wrap.append(statRow([
      statCard('key-round', keys.filter((k) => k.isSet).length + ' / ' + KNOWN_PROVIDERS.length, t('statProvidersConfigured')),
      statCard('heart-pulse', healthyProviderCount + ' / ' + KNOWN_PROVIDERS.length, t('statHealthyProviders'))
    ]));
    wrap.append(sectionHead('aiProviderKeysTitle'));

    KNOWN_PROVIDERS.forEach((provider) => {
      const card = el('div', 'admin-card');
      const headRow = el('div', 'admin-ai-card-head');
      headRow.append(el('h3', '', provider));
      const healthRow = healthByProvider[provider] || { status: 'unconfigured', lastEventAt: null, lastErrorCode: null };
      const statusKey = 'status' + healthRow.status.charAt(0).toUpperCase() + healthRow.status.slice(1);
      headRow.append(el('span', 'badge status-' + healthRow.status, t(statusKey)));
      card.append(headRow);

      if (healthRow.lastEventAt) card.append(el('p', 'hint', t('aiLastChecked', { date: fmtDate(healthRow.lastEventAt) })));
      if (healthRow.status === 'disconnected' && healthRow.lastErrorCode) card.append(el('p', 'error-text', t('aiLastErrorLabel', { error: healthRow.lastErrorCode })));

      const testBtn = el('button', 'btn btn-secondary btn-sm', t('aiTestNow'));
      testBtn.type = 'button';
      testBtn.onclick = () => {
        testBtn.disabled = true; testBtn.textContent = t('aiTestingNow');
        // No apiKey override sent - resolves through the same admin-configured/env tier a real
        // trader call would use, so this is a genuine end-to-end check, not just a UI ping.
        fetch('/api/ai/test-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, apiKey: '', model: '' }) })
          .then((response) => response.json().catch(() => ({})).then((body) => { if (!response.ok || !body.ok) throw new Error(body.error || 'FAILED'); }))
          .then(() => showToast(t('aiTestOk')))
          .catch((error) => showToast(error.message, 'danger'))
          .finally(() => renderTab());
      };
      card.append(testBtn);

      const keyInfo = keyByProvider[provider];
      card.append(el('p', 'hint', keyInfo && keyInfo.isSet ? t('aiKeyStatusSet') + (keyInfo.updatedAt ? ' · ' + t('aiKeyUpdatedAt', { date: fmtDate(keyInfo.updatedAt) }) : '') : t('aiKeyStatusNotSet')));
      const keyField = el('label', 'field');
      const keyInput = document.createElement('input');
      keyInput.type = 'password'; keyInput.placeholder = t('aiKeyInputPlaceholder');
      keyField.append(keyInput);
      const saveKeyBtn = el('button', 'btn btn-primary', t('saveKey'));
      saveKeyBtn.type = 'button';
      saveKeyBtn.onclick = () => {
        if (!keyInput.value.trim()) return;
        api('/ai/keys', { method: 'POST', body: JSON.stringify({ provider, apiKey: keyInput.value.trim() }) })
          .then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
      };
      card.append(keyField, saveKeyBtn);

      const costRow = costByProvider[provider] || { tokensUsed: 0, cost: null };
      const usageLine = el('p', 'hint');
      usageLine.textContent = t('aiTodayTokensLabel') + ': ' + fmtNumber(todayTokensByProvider[provider] || 0)
        + ' · ' + t('aiMonthTokensLabel') + ': ' + fmtNumber(costRow.tokensUsed)
        + ' · ' + t('aiEstCostLabel') + ': ' + (costRow.cost === null ? t('noPricingSet') : fmtNumber(costRow.cost));
      card.append(usageLine);

      const pricingRow = pricingByProvider[provider] || {};
      const promptField = field(t('pricingPromptLabel'), 'number', pricingRow.promptPricePer1k);
      const completionField = field(t('pricingCompletionLabel'), 'number', pricingRow.completionPricePer1k);
      const budgetField = field(t('budgetLabel'), 'number', pricingRow.monthlyTokenBudget);
      const savePricingBtn = el('button', 'btn btn-secondary', t('savePricing'));
      savePricingBtn.type = 'button';
      savePricingBtn.onclick = () => {
        api('/ai/pricing', { method: 'POST', body: JSON.stringify({
          provider, promptPricePer1k: promptField.input.value, completionPricePer1k: completionField.input.value, monthlyTokenBudget: budgetField.input.value
        }) }).then(() => showToast(t('saved'))).catch((error) => showToast(error.message, 'danger'));
      };
      const pricingRowWrap = el('div', 'admin-pricing-row');
      pricingRowWrap.append(promptField.wrap, completionField.wrap);
      card.append(pricingRowWrap, budgetField.wrap, savePricingBtn);
      grid.append(card);
    });
    wrap.append(grid);

    wrap.append(voiceProvidersSection({ credentials: vpCredentials, characters: vpCharacters, health: vpHealth }));

    const chartCard = el('div', 'admin-card');
    chartCard.append(el('h3', '', t('aiTrendTitle')));
    // One bar per day (last 14 days), summed across every provider - a single trend line the
    // reader can scan for "did usage fall off a cliff", not a per-provider breakdown (that's
    // already the all-time-by-provider chart below).
    const totalsByDay = {};
    (usage.byProviderAndDay || []).forEach((row) => {
      const dayKey = new Date(row.day).toISOString().slice(0, 10);
      totalsByDay[dayKey] = (totalsByDay[dayKey] || 0) + row.totalTokens;
    });
    const trendBars = Object.keys(totalsByDay).sort().map((day) => ({ label: day.slice(5), value: totalsByDay[day] }));
    if (!trendBars.length) {
      chartCard.append(el('p', 'hint', t('aiTrendEmpty')));
    } else {
      const trendCanvas = document.createElement('canvas');
      trendCanvas.width = 720; trendCanvas.height = 260;
      chartCard.append(trendCanvas);
      setTimeout(() => drawBarChart(trendCanvas, trendBars), 0);
    }
    wrap.append(chartCard);

    const allTimeCard = el('div', 'admin-card');
    allTimeCard.append(el('h3', '', t('usageChartTitle')));
    const totalsByProvider = {};
    (usage.byProviderAndDay || []).forEach((row) => { totalsByProvider[row.provider] = (totalsByProvider[row.provider] || 0) + row.totalTokens; });
    const bars = KNOWN_PROVIDERS.map((provider) => ({ label: provider, value: totalsByProvider[provider] || 0 }));
    if (!bars.some((b) => b.value > 0)) {
      allTimeCard.append(el('p', 'hint', t('usageChartEmpty')));
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = 720; canvas.height = 260;
      allTimeCard.append(canvas);
      setTimeout(() => drawBarChart(canvas, bars), 0);
    }
    wrap.append(allTimeCard);

    // Real, settled per-model $ cost/charge across every user (task D.3) - distinct from and
    // additive to the token-count/estimate reporting above (allTimeCard/costByProvider both come
    // from ai_usage_events' untrusted client-reported tokens times provider_pricing - an
    // ESTIMATE). This table is gateway-origin only (server default), i.e. real settled cost - the
    // two are never summed or presented as the same number.
    const modelCostCard = el('div', 'admin-card');
    modelCostCard.append(el('h3', '', t('aiUsageByModelTitle')));
    modelCostCard.append(el('p', 'hint', t('aiCostRateCardHint')));
    if (!usageByModel.byModel || !usageByModel.byModel.length) {
      modelCostCard.append(el('p', 'hint', t('aiUsageByModelEmpty')));
    } else {
      const table = document.createElement('table');
      table.className = 'admin-table';
      const thead = document.createElement('tr');
      [t('aiCostProvider'), t('aiCostModel'), t('aiCostCalls'), t('aiCostPromptTokens'), t('aiCostCompletionTokens'), t('aiCostTotalTokens'), t('aiCostProviderCost'), t('aiCostRetailCharge')]
        .forEach((label) => thead.append(el('th', '', label)));
      const theadWrap = document.createElement('thead'); theadWrap.append(thead); table.append(theadWrap);
      const tbody = document.createElement('tbody');
      usageByModel.byModel.forEach((row) => {
        const tr = document.createElement('tr');
        tr.append(
          cell(row.provider), cell(row.model || '—'), cell(fmtNumber(row.calls)),
          cell(fmtNumber(row.promptTokens)), cell(fmtNumber(row.completionTokens)), cell(fmtNumber(row.totalTokens)),
          cell(fmtMicroUsd(row.providerCostMicroUsd)), cell(fmtMicroUsd(row.retailChargeMicroUsd))
        );
        tbody.append(tr);
      });
      table.append(tbody);
      const tableWrap = el('div', 'admin-table-wrap');
      tableWrap.append(table);
      modelCostCard.append(tableWrap);
    }
    wrap.append(modelCostCard);

    const recentCard = el('div', 'admin-card');
    recentCard.append(el('h3', '', t('aiRecentEventsTitle')));
    if (!health.recent || !health.recent.length) {
      recentCard.append(el('p', 'hint', t('aiRecentEventsEmpty')));
    } else {
      const table = document.createElement('table');
      table.className = 'admin-table';
      const thead = document.createElement('tr');
      [t('aiRecentColTime'), t('aiRecentColProvider'), t('aiRecentColSource'), t('aiRecentColStatus'), t('aiRecentColLatency')]
        .forEach((label) => thead.append(el('th', '', label)));
      const theadWrap = document.createElement('thead'); theadWrap.append(thead); table.append(theadWrap);
      const tbody = document.createElement('tbody');
      health.recent.forEach((event) => {
        const row = document.createElement('tr');
        row.append(cell(fmtDate(event.createdAt)), cell(event.provider), cell(event.source || '—'));
        const statusTd = document.createElement('td');
        statusTd.append(el('span', 'badge status-' + (event.ok ? 'healthy' : 'disconnected'), event.ok ? t('statusHealthy') : (event.errorCode || t('statusDisconnected'))));
        row.append(statusTd);
        row.append(cell(event.latencyMs == null ? '—' : fmtNumber(event.latencyMs) + ' ms'));
        tbody.append(row);
      });
      table.append(tbody);
      const tableWrap = el('div', 'admin-table-wrap');
      tableWrap.append(table);
      recentCard.append(tableWrap);
    }
    wrap.append(recentCard);

    const topUsersCard = el('div', 'admin-card');
    topUsersCard.append(el('h3', '', t('aiTopUsersTitle')));
    const topUserRows = (topUsers.users || []).filter((row) => row.totalTokensUsed > 0);
    if (!topUserRows.length) {
      topUsersCard.append(el('p', 'hint', t('aiTopUsersEmpty')));
    } else {
      const table = document.createElement('table');
      table.className = 'admin-table';
      const thead = document.createElement('tr');
      [t('aiTopUsersColUser'), t('aiTopUsersColTokens')].forEach((label) => thead.append(el('th', '', label)));
      const theadWrap = document.createElement('thead'); theadWrap.append(thead); table.append(theadWrap);
      const tbody = document.createElement('tbody');
      topUserRows.forEach((row) => { const tr = document.createElement('tr'); tr.append(cell(row.displayName), cell(fmtNumber(row.totalTokensUsed))); tbody.append(tr); });
      table.append(tbody);
      const tableWrap = el('div', 'admin-table-wrap');
      tableWrap.append(table);
      topUsersCard.append(tableWrap);
    }
    wrap.append(topUsersCard);

    return wrap;
  });
}

// --- Voice Providers (ElevenLabs) admin section ---
// Admin-managed credentials + per-language voice routing for the live Voice Mode (see
// server/admin/routes.voice-providers.mjs). Every save here takes effect in the live Voice Mode
// without a redeploy - server/community/routes.internal.mjs's /internal/voice-provider-config
// bridge picks up the change via a Redis-backed version bump on every write. This section is
// independent of KNOWN_PROVIDERS (never one of the LLM token/pricing providers above) and never
// re-displays a stored key - only a masked last-4-characters hint (keyHint) ever comes back.
function voiceProvidersSection(data) {
  const credentials = data.credentials || [];
  const characters = data.characters || [];
  const healthByKey = {};
  (data.health.characters || []).forEach((row) => { healthByKey[row.character + ':' + row.gender] = row; });

  const section = el('div');
  section.append(sectionHead('voiceProvidersTitle'));
  section.append(el('p', 'hint', t('voiceProvidersHint')));

  const credCard = el('div', 'admin-card');
  credCard.append(el('h3', '', t('vpCredentialsTitle')));
  if (!credentials.length) credCard.append(el('p', 'hint', t('vpNoCredentials')));
  const credGrid = el('div', 'admin-grid-3');
  credentials.forEach((cred) => credGrid.append(voiceCredentialCard(cred)));
  credCard.append(credGrid);

  const labelField = field(t('vpLabelPlaceholder'), 'text', '');
  const keyField = field(t('vpKeyPlaceholder'), 'password', '');
  const saveCredBtn = el('button', 'btn btn-primary btn-sm', t('vpSaveCredential'));
  saveCredBtn.type = 'button';
  saveCredBtn.onclick = () => {
    const label = labelField.input.value.trim();
    const apiKey = keyField.input.value.trim();
    if (!label || !apiKey) return;
    keyField.input.value = ''; // clear immediately - never let the raw key linger in the DOM
    saveCredBtn.disabled = true;
    api('/voice-providers/credentials', { method: 'POST', body: JSON.stringify({ label, apiKey }) })
      .then(() => renderTab())
      .catch((error) => showToast(error.message, 'danger'))
      .finally(() => { saveCredBtn.disabled = false; });
  };
  const credAddRow = el('div', 'admin-cred-add-row');
  credAddRow.append(labelField.wrap, keyField.wrap, saveCredBtn);
  credCard.append(credAddRow, el('p', 'hint', t('vpReplaceKeyHint')));
  section.append(credCard);

  const charCard = el('div', 'admin-card');
  charCard.append(el('h3', '', t('vpCharactersTitle')));
  const charGrid = el('div', 'admin-grid-3');
  characters.forEach((config) => charGrid.append(voiceCharacterCard(config, credentials, healthByKey[config.character + ':' + config.gender])));
  charCard.append(charGrid);
  section.append(charCard);

  // Real usage is recorded per language (voice_tts_usage_events - which language was actually
  // spoken), not per character+gender, so this is shown once, combined across every character,
  // rather than duplicated identically on all 8 cards above.
  const usage = data.health.overallUsage24h;
  if (usage) {
    const usageCard = el('div', 'admin-card');
    usageCard.append(el('h3', '', t('vpHealthTitle')));
    usageCard.append(el('p', 'hint',
      t('vpRequests24h') + ': ' + fmtNumber(usage.requestCount)
      + (usage.requestCount > 0
        ? ' · ' + t('vpSuccessRate') + ': ' + (usage.successRatePercent == null ? '—' : usage.successRatePercent + '%')
          + ' · ' + t('vpAvgLatency') + ': ' + fmtNumber(usage.avgLatencyMs) + ' ms'
        : ' (' + t('vpNoUsageYet') + ')')));
    if (usage.lastSuccessAt) usageCard.append(el('p', 'hint', t('vpLastSuccess') + ': ' + fmtDate(usage.lastSuccessAt)));
    if (usage.lastErrorCode) usageCard.append(el('p', 'hint', t('vpLastError') + ': ' + usage.lastErrorCode));
    section.append(usageCard);
  }

  return section;
}

function voiceCredentialCard(cred) {
  const card = el('div', 'admin-card admin-card-nested');
  const head = el('div', 'admin-ai-card-head');
  head.append(el('h3', '', cred.label));
  const validationKey = 'vpValidation' + cred.validationStatus.charAt(0).toUpperCase() + cred.validationStatus.slice(1);
  head.append(el('span', 'badge status-' + cred.validationStatus, t(validationKey)));
  card.append(head);
  card.append(el('p', 'hint', t('vpKeyHint', { hint: cred.keyHint })));
  card.append(el('p', 'hint', cred.validatedAt ? t('vpLastValidated', { date: fmtDate(cred.validatedAt) }) : t('vpNeverValidated')));
  if (cred.validationError && (cred.validationStatus === 'invalid' || cred.validationStatus === 'restricted')) {
    card.append(el('p', 'error-text', t('vpValidationErrorCode', { code: cred.validationError })));
  }

  const quotaLine = el('p', 'hint');
  quotaLine.hidden = true;
  card.append(quotaLine);

  const btnRow = el('div', 'admin-btn-row');
  const validateBtn = el('button', 'btn btn-secondary btn-sm', t('vpValidate'));
  validateBtn.type = 'button';
  validateBtn.onclick = () => {
    validateBtn.disabled = true; validateBtn.textContent = t('vpValidating');
    api('/voice-providers/credentials/' + cred.id + '/validate', { method: 'POST' })
      .then(() => renderTab())
      // A real invalid/restricted result is never thrown here (the route answers 200 either way -
      // see routes.voice-providers.mjs's own comment) - reaching this catch always means the
      // upstream call itself couldn't complete (network/timeout/rate-limit/5xx), which says nothing
      // about whether the key is actually good. Never shown as if it were a definitive "Invalid".
      .catch((error) => showToast(t('vpValidateInconclusive', { code: error.message }), 'danger'))
      .finally(() => { validateBtn.disabled = false; validateBtn.textContent = t('vpValidate'); });
  };
  // Lazy, click-triggered only - never fetched eagerly for every credential on tab load, since
  // that would spend an upstream call the admin never asked for on every page view.
  const quotaBtn = el('button', 'btn btn-secondary btn-sm', t('vpQuotaRefresh'));
  quotaBtn.type = 'button';
  quotaBtn.onclick = () => {
    quotaBtn.disabled = true;
    api('/voice-providers/credentials/' + cred.id + '/subscription')
      .then((sub) => {
        quotaLine.hidden = false;
        quotaLine.textContent = [
          sub.tier ? t('vpQuotaTier', { tier: sub.tier }) : null,
          sub.characterLimit != null ? t('vpQuotaCharacters', { used: fmtNumber(sub.characterCount), limit: fmtNumber(sub.characterLimit) }) : null,
          sub.nominalRemainingAllowance != null ? t('vpQuotaRemaining', { count: fmtNumber(sub.nominalRemainingAllowance) }) : null,
          sub.nextResetUnix ? t('vpQuotaNextReset', { date: fmtDate(new Date(sub.nextResetUnix * 1000).toISOString()) }) : null,
          sub.overageEnabled ? t('vpQuotaOverage') : null
        ].filter(Boolean).join(' · ') || t('vpQuotaUnavailable');
      })
      .catch((error) => {
        quotaLine.hidden = false;
        quotaLine.textContent = error && error.message === 'RESTRICTED_SCOPE' ? t('vpAnalyticsUnavailable') : t('vpQuotaUnavailable');
      })
      .finally(() => { quotaBtn.disabled = false; });
  };
  const deleteBtn = el('button', 'btn btn-danger btn-sm', t('vpDelete'));
  deleteBtn.type = 'button';
  deleteBtn.onclick = () => {
    if (!window.confirm(t('vpDeleteConfirm'))) return;
    api('/voice-providers/credentials/' + cred.id, { method: 'DELETE' })
      .then(() => { showToast(t('vpDeleted')); renderTab(); })
      .catch((error) => showToast(error.message, 'danger'));
  };
  btnRow.append(validateBtn, quotaBtn, deleteBtn);
  card.append(btnRow);
  return card;
}

const VP_CHARACTER_NAME_KEY = { hunter: 'vpCharacterHunter', commander: 'vpCharacterCommander', engineer: 'vpCharacterEngineer', sage: 'vpCharacterSage' };
const VP_GENDER_KEY = { male: 'vpGenderMale', female: 'vpGenderFemale' };

function voiceCharacterCard(config, credentials, healthRow) {
  const card = el('div', 'admin-card admin-card-nested');
  const head = el('div', 'admin-ai-card-head');
  head.append(el('h3', '', t(VP_CHARACTER_NAME_KEY[config.character] || config.character) + ' · ' + t(VP_GENDER_KEY[config.gender] || config.gender)));
  const status = (healthRow && healthRow.status) || (config.enabled ? 'unconfigured' : 'disabled');
  const statusKey = 'vpStatus' + status.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  head.append(el('span', 'badge status-' + status, t(statusKey)));
  card.append(head);

  const enableLabel = el('label', 'field-check');
  const enableCheckbox = document.createElement('input');
  enableCheckbox.type = 'checkbox'; enableCheckbox.checked = Boolean(config.enabled);
  enableLabel.append(enableCheckbox, document.createTextNode(t('vpCharacterEnable')));
  card.append(enableLabel);

  const credentialSelect = selectField(t('vpCredentialSelect'),
    [{ value: '', text: t('vpNoCredentialSelected') }].concat(credentials.map((c) => ({ value: c.id, text: c.label }))),
    config.credentialId || '');
  card.append(credentialSelect.wrap);

  const voiceIdField = field(t('vpVoiceId'), 'text', config.voiceId || '');
  const voiceDatalist = document.createElement('datalist');
  const voiceDatalistId = 'vp-voices-' + config.character + '-' + config.gender;
  voiceDatalist.id = voiceDatalistId;
  voiceIdField.input.setAttribute('list', voiceDatalistId);
  voiceIdField.input.placeholder = t('vpVoiceSearch');
  voiceIdField.wrap.append(voiceDatalist);
  // Search-and-select via the native datalist (populated below) that still allows free-text
  // manual entry in the same input - satisfies both "searchable voice selector" and "manual
  // voice ID entry" without two fields that could drift out of sync with each other.
  const loadVoicesBtn = el('button', 'btn btn-secondary btn-sm', t('vpLoadVoices'));
  loadVoicesBtn.type = 'button';
  loadVoicesBtn.onclick = () => {
    if (!credentialSelect.select.value) { showToast(t('vpNoCredentialSelected'), 'danger'); return; }
    loadVoicesBtn.disabled = true;
    api('/voice-providers/voices?credentialId=' + encodeURIComponent(credentialSelect.select.value))
      .then((voices) => {
        voiceDatalist.innerHTML = '';
        voices.forEach((voice) => {
          const opt = document.createElement('option');
          opt.value = voice.voiceId; opt.label = voice.name;
          voiceDatalist.append(opt);
        });
      })
      .catch((error) => showToast(error.message, 'danger'))
      .finally(() => { loadVoicesBtn.disabled = false; });
  };
  card.append(voiceIdField.wrap, loadVoicesBtn);

  const modelSelect = selectField(t('vpModelSelect'),
    config.modelId ? [{ value: config.modelId, text: config.modelId }] : [{ value: '', text: '—' }], config.modelId || '');
  const loadModelsBtn = el('button', 'btn btn-secondary btn-sm', t('vpLoadModels'));
  loadModelsBtn.type = 'button';
  loadModelsBtn.onclick = () => {
    if (!credentialSelect.select.value) { showToast(t('vpNoCredentialSelected'), 'danger'); return; }
    loadModelsBtn.disabled = true;
    api('/voice-providers/models?credentialId=' + encodeURIComponent(credentialSelect.select.value))
      .then((models) => {
        const current = modelSelect.select.value;
        modelSelect.select.innerHTML = '';
        models.forEach((model) => {
          const opt = document.createElement('option');
          opt.value = model.modelId; opt.textContent = model.name;
          modelSelect.select.append(opt);
        });
        if (models.some((m) => m.modelId === current)) modelSelect.select.value = current;
      })
      .catch((error) => showToast(error.message, 'danger'))
      .finally(() => { loadModelsBtn.disabled = false; });
  };
  card.append(modelSelect.wrap, loadModelsBtn);

  card.append(el('p', 'hint', t('vpFallback') + ': ' + (config.fallbackProvider || 'openai') + (config.fallbackVoice ? ' (' + config.fallbackVoice + ')' : '')));

  const saveBtn = el('button', 'btn btn-primary btn-sm', t('vpSaveLanguage'));
  saveBtn.type = 'button';
  saveBtn.onclick = () => {
    saveBtn.disabled = true;
    api('/voice-providers/characters/' + config.character + '/' + config.gender, { method: 'PUT', body: JSON.stringify({
      enabled: enableCheckbox.checked,
      credentialId: credentialSelect.select.value || null,
      voiceId: voiceIdField.input.value.trim() || null,
      modelId: modelSelect.select.value || null
    }) })
      .then(() => { showToast(t('vpSaved')); renderTab(); })
      .catch((error) => showToast(error.message, 'danger'))
      .finally(() => { saveBtn.disabled = false; });
  };
  card.append(saveBtn);

  // Short paid test sample - a fresh explicit click every time, never triggered just by loading
  // this card or by saving the config above (mission: never spend credits without an explicit
  // admin action, and always show the credits warning right next to the trigger). A character's
  // voice is no longer tied to one language (a single multilingual-capable voice/model pair is
  // expected to serve every language), so the admin picks which language to test pronunciation in.
  const testLanguageSelect = selectField(t('vpTestLanguage'), Object.keys(languageNames).map((code) => ({ value: code, text: languageNames[code] })), activeLanguage in languageNames ? activeLanguage : 'en');
  const testTextField = field(t('vpTestTextPlaceholder'), 'text', '');
  testTextField.input.dir = (activeLanguage === 'fa' || activeLanguage === 'ar') ? 'rtl' : 'ltr';
  card.append(testLanguageSelect.wrap, el('p', 'hint', t('vpTestCreditsWarning')), testTextField.wrap);
  const testBtn = el('button', 'btn btn-secondary btn-sm', t('vpTestSample'));
  testBtn.type = 'button';
  const testAudio = document.createElement('audio');
  testAudio.controls = true; testAudio.className = 'admin-voice-test-audio'; testAudio.hidden = true;
  testBtn.onclick = () => {
    const text = testTextField.input.value.trim();
    const credentialId = credentialSelect.select.value;
    const voiceId = voiceIdField.input.value.trim();
    const modelId = modelSelect.select.value;
    if (!text || !credentialId || !voiceId || !modelId) { showToast(t('vpValidateFirst'), 'danger'); return; }
    testBtn.disabled = true; testBtn.textContent = t('vpTestGenerating');
    api('/voice-providers/test-sample', { method: 'POST', body: JSON.stringify({ languageCode: testLanguageSelect.select.value, credentialId, voiceId, modelId, text }) })
      .then((body) => {
        testAudio.src = 'data:' + body.mimeType + ';base64,' + body.audioBase64;
        testAudio.hidden = false;
        if (typeof testAudio.play === 'function') testAudio.play().catch(() => {});
      })
      .catch((error) => showToast(error.message, 'danger'))
      .finally(() => { testBtn.disabled = false; testBtn.textContent = t('vpTestSample'); });
  };
  card.append(testBtn, testAudio);

  if (healthRow && healthRow.credentialLabel) card.append(el('p', 'hint', healthRow.credentialLabel + ' · ' + t('vpValidation' + (healthRow.credentialValidationStatus || 'unknown').charAt(0).toUpperCase() + (healthRow.credentialValidationStatus || 'unknown').slice(1))));

  return card;
}

function selectField(label, options, value) {
  const wrap = el('label', 'field');
  wrap.append(el('span', '', label));
  const select = document.createElement('select');
  options.forEach((opt) => {
    const node = document.createElement('option');
    node.value = opt.value; node.textContent = opt.text;
    select.append(node);
  });
  select.value = value || '';
  wrap.append(select);
  return { wrap, select };
}

function field(label, type, value) {
  const wrap = el('label', 'field');
  wrap.append(el('span', '', label));
  const input = document.createElement('input');
  input.type = type; input.step = 'any';
  if (value !== null && value !== undefined) input.value = value;
  wrap.append(input);
  return { wrap, input };
}
// Mirrors trade-reports.js's raw-canvas bar-chart style (no charting library), but reads this
// page's own --violet token instead of --ps-accent, which does not exist on a non-character page.
function drawBarChart(canvas, data) {
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--violet').trim() || '#a566ff';
  const track = 'rgba(148,163,184,.25)', text = 'rgba(226,232,240,.72)';
  ctx.clearRect(0, 0, w, h);
  ctx.font = '12px sans-serif';
  const max = Math.max(1, ...data.map((d) => d.value));
  data.forEach((d, i) => {
    const y = 18 + i * (h - 28) / data.length, bh = Math.max(14, (h - 40) / data.length - 10);
    ctx.fillStyle = track; ctx.fillRect(112, y, w - 150, bh);
    ctx.fillStyle = accent; ctx.fillRect(112, y, (w - 150) * (d.value / max), bh);
    ctx.fillStyle = text;
    ctx.textAlign = 'end'; ctx.fillText(d.label, 104, y + bh - 3);
    ctx.textAlign = 'start'; ctx.fillText(fmtNumber(d.value), 120 + (w - 150) * (d.value / max), y + bh - 3);
  });
}

// --- Technical tab ---

function technicalTab() {
  return api('/technical').then((data) => {
    const wrap = el('div');
    wrap.append(pageHeader('server-cog', 'tabTechnical', 'technicalPageSubtitle'));
    const healthyCount = [data.db.ok, data.communityApi.ok, data.aiGateway.ok].filter(Boolean).length;
    wrap.append(statRow([statCard('shield-check', healthyCount + ' / 3', t('statSystemsHealthy'))]));

    const grid = el('div', 'admin-grid');
    const dbCard = el('div', 'admin-card');
    dbCard.append(el('h3', '', t('dbConnectivity')), el('p', '', (data.db.ok ? t('dbOk') : t('dbFail')) + ' (' + data.db.backend + ')'));
    const migrations = el('div', 'admin-card');
    migrations.append(el('h3', '', t('migrationsApplied')));
    if (!data.migrations || !data.migrations.length) migrations.append(el('p', 'hint', t('migrationsNone')));
    else { const list = document.createElement('ul'); data.migrations.forEach((m) => { const li = document.createElement('li'); li.textContent = m.id; list.append(li); }); migrations.append(list); }
    const communityCard = el('div', 'admin-card');
    communityCard.append(el('h3', '', t('communityApiHealth')), el('p', '', data.communityApi.ok ? t('dbOk') : t('dbFail')));
    const gatewayCard = el('div', 'admin-card');
    gatewayCard.append(el('h3', '', t('aiGatewayHealth')), el('p', '', data.aiGateway.ok ? t('dbOk') : t('dbFail')));
    const errorCard = el('div', 'admin-card');
    errorCard.append(el('h3', '', t('errorTrackingLabel')), el('p', 'hint', t('errorTrackingValue')));
    grid.append(dbCard, migrations, communityCard, gatewayCard, errorCard);
    wrap.append(grid);
    return wrap;
  });
}

// --- XP & Segmentation tab ---
// Real, DB-backed rule editing (Section 11's XP engine) - every number the engine reads
// (POST /me/xp-events, GET /me/mastery, achievement unlock) is listed here alongside its code
// default and whether it's currently overridden. Only the NUMBER is ever editable per row - the
// verification logic behind each type/achievement/requirement stays in code (see
// server/community/xp-config.mjs's header comment on that boundary), so this tab can never let
// an admin invent a brand-new, unverified XP source.

// Builds one editable table: `leadColumns` render the identifying cells (type/domain, etc.),
// then Default | Current | an editable input (+ a period selector when isPeriod) | Save | Reset.
// Reset is disabled once a row is no longer overridden - nothing to reset back to.
function xpConfigTable(title, rows, leadColumns, category, keyFor, opts) {
  opts = opts || {};
  const card = el('div', 'admin-card admin-xp-section');
  card.append(el('h3', '', title));
  if (!rows.length) { card.append(el('p', 'hint', t('xpNoRows'))); return card; }
  const table = document.createElement('table');
  table.className = 'admin-table';
  const thead = document.createElement('tr');
  leadColumns.forEach((col) => thead.append(el('th', '', col.label)));
  [t('xpColDefault'), t('xpColCurrent'), t('xpColEdit'), ''].forEach((label) => thead.append(el('th', '', label)));
  const theadWrap = document.createElement('thead'); theadWrap.append(thead);
  table.append(theadWrap);
  const tbody = document.createElement('tbody');
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    if (row.overridden) tr.className = 'admin-xp-overridden';
    leadColumns.forEach((col) => tr.append(el('td', '', col.render(row))));
    tr.append(el('td', 'navrya-tabular', opts.formatValue ? opts.formatValue(row.default) : fmtNumber(row.default)));
    tr.append(el('td', 'navrya-tabular', opts.formatValue ? opts.formatValue(row.current) : fmtNumber(row.current)));

    const editTd = document.createElement('td');
    const controls = el('div', 'admin-xp-controls');
    const numberInput = document.createElement('input');
    numberInput.type = 'number'; numberInput.min = '0'; numberInput.step = '1';
    numberInput.value = opts.isPeriod ? (row.current && row.current.max) : row.current;
    numberInput.className = 'admin-xp-input';
    controls.append(numberInput);
    let periodSelect = null;
    if (opts.isPeriod) {
      periodSelect = document.createElement('select');
      ['day', 'week'].forEach((p) => periodSelect.append(new Option(t(p === 'day' ? 'xpPeriodDay' : 'xpPeriodWeek'), p, false, row.current && row.current.period === p)));
      controls.append(periodSelect);
    }
    editTd.append(controls);
    tr.append(editTd);

    const actionsTd = document.createElement('td');
    const actions = el('div', 'admin-xp-controls');
    const saveBtn = el('button', 'btn btn-primary btn-sm', t('save'));
    saveBtn.type = 'button';
    saveBtn.onclick = () => {
      const value = opts.isPeriod ? { maxCount: numberInput.value, period: periodSelect.value } : numberInput.value;
      api('/xp/config', { method: 'POST', body: JSON.stringify({ category, key: keyFor(row), value }) })
        .then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
    };
    const resetBtn = el('button', 'btn btn-secondary btn-sm', t('xpResetDefault'));
    resetBtn.type = 'button';
    resetBtn.disabled = !row.overridden;
    resetBtn.onclick = () => {
      api('/xp/config?category=' + encodeURIComponent(category) + '&key=' + encodeURIComponent(keyFor(row)), { method: 'DELETE' })
        .then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
    };
    actions.append(saveBtn, resetBtn);
    actionsTd.append(actions);
    tr.append(actionsTd);
    tbody.append(tr);
  });
  table.append(tbody);
  const tableWrap = el('div', 'admin-table-wrap');
  tableWrap.append(table);
  card.append(tableWrap);
  return card;
}

function xpTab() {
  return api('/xp/config').then((cfg) => {
    const wrap = el('div');
    wrap.append(pageHeader('award', 'tabXP', 'xpPageSubtitle'));
    const overriddenCount = ['points', 'domainCaps', 'sourceCaps', 'periodCaps', 'sourceTotalCaps', 'achievementPoints', 'masteryRequirements']
      .reduce((sum, key) => sum + cfg[key].filter((r) => r.overridden).length, 0) + (cfg.recurringCap.overridden ? 1 : 0);
    wrap.append(statRow([statCard('award', String(cfg.points.length), t('xpStatTypes')), statCard('sliders-horizontal', String(overriddenCount), t('xpStatOverridden'))]));

    wrap.append(xpConfigTable(t('xpSectionPoints'), cfg.points,
      [{ label: t('xpColType'), render: (r) => r.type }, { label: t('xpColDomain'), render: (r) => r.domain || '—' }],
      'points', (r) => r.type));

    wrap.append(xpConfigTable(t('xpSectionDomainCaps'), cfg.domainCaps,
      [{ label: t('xpColDomain'), render: (r) => r.domain }], 'domainCap', (r) => r.domain));

    wrap.append(xpConfigTable(t('xpSectionRecurringCap'), [Object.assign({ label: t('xpRecurringCapLabel') }, cfg.recurringCap)],
      [{ label: '', render: (r) => r.label }], 'recurringCap', () => ''));

    wrap.append(xpConfigTable(t('xpSectionSourceCaps'), cfg.sourceCaps,
      [{ label: t('xpColType'), render: (r) => r.type }], 'sourceCap', (r) => r.type));

    wrap.append(xpConfigTable(t('xpSectionSourceTotalCaps'), cfg.sourceTotalCaps,
      [{ label: t('xpColDomain'), render: (r) => r.sourceType }], 'sourceTotalCap', (r) => r.sourceType));

    wrap.append(xpConfigTable(t('xpSectionPeriodCaps'), cfg.periodCaps,
      [{ label: t('xpColType'), render: (r) => r.type }], 'periodCap', (r) => r.type,
      { isPeriod: true, formatValue: (v) => (v ? v.max + ' / ' + t(v.period === 'week' ? 'xpPeriodWeek' : 'xpPeriodDay') : '—') }));

    wrap.append(xpConfigTable(t('xpSectionAchievements'), cfg.achievementPoints,
      [{ label: t('xpColAchievement'), render: (r) => r.key }], 'achievementPoints', (r) => r.key));

    wrap.append(xpConfigTable(t('xpSectionMastery'), cfg.masteryRequirements,
      [{ label: t('xpColLevel'), render: (r) => String(r.level) }, { label: t('xpColRequirement'), render: (r) => r.requirementKey }],
      'mastery', (r) => r.level + ':' + r.requirementKey));

    return wrap;
  });
}

// --- Marketplace tab ---

let marketplaceStatusFilter = 'all';

function marketplaceTab() {
  return api('/marketplace/listings?status=' + marketplaceStatusFilter).then((listings) => {
    const wrap = el('div');
    wrap.append(pageHeader('store', 'tabMarketplace', 'marketplacePageSubtitle'));
    wrap.append(statRow([
      statCard('store', fmtNumber(listings.length), t('statTotalListings')),
      statCard('badge-check', fmtNumber(listings.filter((l) => l.status === 'published').length), t('statPublishedListings')),
      statCard('star', fmtNumber(listings.filter((l) => l.featured).length), t('statFeaturedListings'))
    ]));
    const toolbar = el('div', 'admin-toolbar');
    const select = document.createElement('select');
    [['all', 'statusFilterAll'], ['draft', 'statusFilterDraft'], ['published', 'statusFilterPublished'], ['delisted', 'statusFilterDelisted']]
      .forEach(([value, labelKey]) => select.append(new Option(t(labelKey), value, false, marketplaceStatusFilter === value)));
    select.onchange = () => { marketplaceStatusFilter = select.value; renderTab(); };
    toolbar.append(select);
    wrap.append(toolbar);

    const tableWrap = el('div', 'admin-table-wrap');
    const table = document.createElement('table');
    table.className = 'admin-table';
    const thead = document.createElement('tr');
    ['marketplaceColTitle', 'marketplaceColSeller', 'marketplaceColPrice', 'marketplaceColEvidence', 'marketplaceColStatus', 'marketplaceColFeatured', 'colActions']
      .forEach((key) => { const th = document.createElement('th'); th.textContent = t(key); thead.append(th); });
    const theadWrap = document.createElement('thead'); theadWrap.append(thead); table.append(theadWrap);
    const tbody = document.createElement('tbody');
    listings.forEach((listing) => {
      const row = document.createElement('tr');
      row.append(cell(listing.title), cell(listing.sellerName || '—'), cell(fmtNumber(listing.priceAmount) + ' ' + listing.priceCurrency));
      row.append(cell(listing.sampleSize > 0 && listing.successRatePercent != null ? fmtNumber(listing.successRatePercent) + '% · ' + fmtNumber(listing.sampleSize) : '—'));
      const statusTd = document.createElement('td');
      statusTd.append(el('span', 'badge status-' + listing.status, t('statusFilter' + listing.status.charAt(0).toUpperCase() + listing.status.slice(1))));
      row.append(statusTd);
      const featuredTd = document.createElement('td');
      featuredTd.textContent = listing.featured ? t('yes') : t('no');
      row.append(featuredTd);

      const actionsTd = document.createElement('td');
      const featureBtn = el('button', 'btn btn-secondary', listing.featured ? t('unfeatureAction') : t('featureAction'));
      featureBtn.type = 'button';
      featureBtn.onclick = () => api('/marketplace/listings/' + listing.id, { method: 'PATCH', body: JSON.stringify({ featured: !listing.featured }) })
        .then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
      actionsTd.append(featureBtn);
      if (listing.status !== 'delisted') {
        const delistBtn = el('button', 'btn btn-danger', t('delistAction'));
        delistBtn.type = 'button';
        delistBtn.onclick = () => api('/marketplace/listings/' + listing.id, { method: 'PATCH', body: JSON.stringify({ status: 'delisted' }) })
          .then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
        actionsTd.append(delistBtn);
      }
      row.append(actionsTd);
      tbody.append(row);
    });
    table.append(tbody);
    tableWrap.append(table);
    wrap.append(tableWrap);
    return wrap;
  });
}

// --- Financial tab ---

function financialTab() {
  return api('/finance/overview').then((data) => {
    const wrap = el('div');
    wrap.append(pageHeader('banknote', 'tabFinancial', 'financialPageSubtitle'));

    // Real stat row - the mock-revenue total is exactly that (mock, no payment processor
    // connected - see financeMockRevenueNote), but the AI cost/token sums are real, computed
    // from the exact same per-provider rows the cards below already render from.
    const totalAiCost = data.aiCostByProvider.reduce((sum, row) => sum + (row.cost || 0), 0);
    const totalTokensUsed = data.aiCostByProvider.reduce((sum, row) => sum + (row.tokensUsed || 0), 0);
    wrap.append(statRow([
      statCard('landmark', fmtNumber(data.mockRevenue.total), t('statMockRevenue')),
      statCard('banknote', fmtNumber(totalAiCost), t('statAiCostThisMonth')),
      statCard('activity', fmtNumber(totalTokensUsed), t('statTokensUsedThisMonth'))
    ]));

    const grid = el('div', 'admin-grid');
    const revenueCard = el('div', 'admin-card');
    revenueCard.append(el('h3', '', t('financeMockRevenueTitle')));
    revenueCard.append(el('p', '', fmtNumber(data.mockRevenue.total)));
    revenueCard.append(el('p', 'hint', t('financeMockRevenueNote')));
    grid.append(revenueCard);

    const costCard = el('div', 'admin-card');
    costCard.append(el('h3', '', t('financeAiCostTitle')));
    data.aiCostByProvider.forEach((row) => {
      const line = el('p', '');
      line.textContent = row.provider + ': ' + (row.cost === null ? t('noPricingSet') : fmtNumber(row.cost)) + ' (' + fmtNumber(row.tokensUsed) + ' ' + t('tokensUsedLabel') + ')';
      costCard.append(line);
    });
    grid.append(costCard);

    const budgetCard = el('div', 'admin-card');
    budgetCard.append(el('h3', '', t('financeBudgetTitle')));
    data.remainingBudgetByProvider.forEach((row) => {
      const line = el('p', '');
      line.textContent = row.provider + ': ' + (row.remaining === null ? t('noBudgetSet') : fmtNumber(row.remaining) + ' ' + t('remainingLabel') + ' (' + t('budgetOfLabel', { budget: fmtNumber(row.budget) }) + ')');
      budgetCard.append(line);
    });
    grid.append(budgetCard);
    wrap.append(grid);
    return wrap;
  });
}

// --- Routing / boot ---

// --- Commercial tab (Slice 1: Plans / Wallet / Configuration History) ---
// Deliberately English-only for now (t() falls back to the English string on any other active
// language, per its own definition above) - a full four-language pass for this brand-new admin
// surface is out of scope for this slice; every OTHER tab's existing translations are untouched.
let commercialSubTab = 'plans';
function commercialSubNav(active) {
  const nav = el('div', 'admin-seg-nav');
  [
    ['plans', t('comSubPlans')], ['wallet', t('comSubWallet')], ['subscriptions', t('comSubSubscriptions')],
    ['storage', t('comSubStorage')], ['transactions', t('comSubTransactions')], ['history', t('comSubHistory')],
    ['cryptoPayments', t('comSubCryptoPayments')], ['aiCostControl', t('comSubAiCostControl')]
  ].forEach(([id, label]) => {
    const btn = el('button', 'admin-seg-btn' + (id === active ? ' active' : ''), label);
    btn.type = 'button';
    btn.onclick = () => { commercialSubTab = id; renderTab(); };
    nav.append(btn);
  });
  return nav;
}

const RESOURCE_LIMIT_KEYS = ['patterns', 'strategies', 'accounts', 'sessions', 'analysisSymbols'];
const RESOURCE_LIMIT_LABELS = { patterns: 'comLimitPatterns', strategies: 'comLimitStrategies', accounts: 'comLimitAccounts', sessions: 'comLimitSessions', analysisSymbols: 'comLimitAnalysisSymbols' };
// byok/premiumModels (real-money subscription rollout): gate the AI Assistant's "use your own API
// key" section and the specific real premium model ids (ai-settings-store.js's
// PROVIDER_CATALOG[*].premiumModels) respectively - read by resolveUserEntitlements() the exact
// same way wallet/ai/voice/aiPanelBuilder already are, no new mechanism.
const PLAN_FEATURE_KEYS = ['wallet', 'ai', 'voice', 'aiPanelBuilder', 'byok', 'premiumModels'];
const PLAN_FEATURE_LABELS = { wallet: 'comFeatureWallet', ai: 'comFeatureAi', voice: 'comFeatureVoice', aiPanelBuilder: 'comFeatureAiPanelBuilder', byok: 'comFeatureByok', premiumModels: 'comFeaturePremiumModels' };

function commercialPlansSubTab() {
  return api('/commercial/plans').then((data) => {
    const wrap = el('div', 'admin-grid');
    ['free', 'plus', 'pro', 'personalized'].forEach((plan) => {
      const planConfig = data.plans[plan];
      const card = el('div', 'admin-card');
      card.append(el('h3', '', plan.charAt(0).toUpperCase() + plan.slice(1)));

      // Admin-set display name (real-money subscription rollout) - overrides the client's
      // localized default label when non-empty; left blank means "use the default name".
      const displayNameField = field(t('comPlanDisplayName'), 'text', planConfig.displayName || '');
      card.append(displayNameField.wrap);

      const limitInputs = {};
      RESOURCE_LIMIT_KEYS.forEach((key) => {
        const row = el('div', 'admin-limit-row');
        const numberField = field(t(RESOURCE_LIMIT_LABELS[key]), 'number', planConfig.limits[key]);
        const unlimitedCheckbox = document.createElement('input');
        unlimitedCheckbox.type = 'checkbox';
        unlimitedCheckbox.checked = planConfig.limits[key] === null;
        numberField.input.disabled = unlimitedCheckbox.checked;
        unlimitedCheckbox.onchange = () => { numberField.input.disabled = unlimitedCheckbox.checked; };
        const unlimitedLabel = el('label', 'field-check');
        unlimitedLabel.append(unlimitedCheckbox, el('span', '', t('comUnlimited')));
        row.append(numberField.wrap, unlimitedLabel);
        limitInputs[key] = { input: numberField.input, unlimitedCheckbox };
        card.append(row);
      });

      const storageField = field(t('comStorageBytes'), 'number', planConfig.storageBytes);
      card.append(storageField.wrap);

      // Free has no price to edit - it's fixed at $0 (spec section 1).
      const priceField = plan !== 'free' ? field(t('comPlanPrice'), 'number', planConfig.price.amountUsd) : null;
      if (priceField) card.append(priceField.wrap);

      // Same "Free is fixed, nothing to discount" rule as price.
      const discountField = plan !== 'free' ? field(t('comPlanTokenDiscount'), 'number', planConfig.tokenDiscountPercent || 0) : null;
      if (discountField) card.append(discountField.wrap);

      const featureInputs = {};
      PLAN_FEATURE_KEYS.forEach((key) => {
        const featureLabel = el('label', 'field-check');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(planConfig.features[key]);
        featureLabel.append(checkbox, el('span', '', t(PLAN_FEATURE_LABELS[key])));
        featureInputs[key] = checkbox;
        card.append(featureLabel);
      });

      const saveBtn = el('button', 'btn btn-primary', t('comSavePlan'));
      saveBtn.type = 'button';
      saveBtn.onclick = () => {
        const limits = {};
        RESOURCE_LIMIT_KEYS.forEach((key) => { limits[key] = limitInputs[key].unlimitedCheckbox.checked ? null : Number(limitInputs[key].input.value); });
        const features = {};
        PLAN_FEATURE_KEYS.forEach((key) => { features[key] = featureInputs[key].checked; });
        const payload = { limits, storageBytes: Number(storageField.input.value), features, displayName: displayNameField.input.value };
        if (priceField) payload.price = { amountUsd: Number(priceField.input.value), billingInterval: 'month' };
        if (discountField) payload.tokenDiscountPercent = Number(discountField.input.value);
        api('/commercial/plans/' + plan, { method: 'PATCH', body: JSON.stringify(payload) })
          .then(() => showToast(t('saved'))).catch((error) => showToast(error.message, 'danger'));
      };
      card.append(saveBtn);
      wrap.append(card);
    });
    return wrap;
  });
}

function commercialWalletSubTab() {
  return Promise.all([
    api('/commercial/wallet-rules'), api('/commercial/markup-rules'), api('/commercial/provider-pricing'), api('/commercial/ledger'),
    api('/commercial/billing-readiness')
  ]).then(([walletRules, markupRulesData, pricingData, ledgerData, readiness]) => {
    const wrap = el('div', 'admin-grid');

    // AI billing readiness (production diagnosis: real usage recorded, cost stuck at $0.00000 -
    // traced to missing provider pricing, not a settlement bug) - a concise read-only status so
    // an admin can see WHY cost is $0 without reading the database directly. Built from the exact
    // same aggregation/pricing-resolution the real billing path itself uses (server/admin/
    // routes.commercial.mjs's GET /billing-readiness) - never a second cost concept.
    const readinessCard = el('div', 'admin-card admin-card-wide');
    readinessCard.append(el('h3', '', t('comBillingReadinessTitle')));
    const readinessHead = el('div', 'admin-btn-row');
    readinessHead.append(el('span', 'badge status-' + (readiness.walletEnforced ? 'valid' : 'unknown'), readiness.walletEnforced ? t('comWalletEnforcedOn') : t('comWalletEnforcedOff')));
    readinessHead.append(el('span', 'badge status-' + (readiness.internalApiSecretConfigured ? 'valid' : 'invalid'), readiness.internalApiSecretConfigured ? t('comInternalSecretConfigured') : t('comInternalSecretMissing')));
    readinessCard.append(readinessHead);
    if (!readiness.pricing.length) {
      readinessCard.append(el('p', 'hint', t('comBillingReadinessEmpty')));
    } else {
      const table = document.createElement('table');
      table.className = 'admin-table';
      const thead = document.createElement('tr');
      [t('comColProviderModel'), t('aiCostCalls'), t('comPriceConfigured'), t('aiCostProviderCost')].forEach((label) => thead.append(el('th', '', label)));
      const theadWrap = document.createElement('thead'); theadWrap.append(thead);
      table.append(theadWrap);
      const tbody = document.createElement('tbody');
      readiness.pricing.forEach((row) => {
        const tr = document.createElement('tr');
        tr.append(
          el('td', '', row.provider + ' / ' + (row.model || '—')), el('td', '', fmtNumber(row.calls)),
          el('td', '', row.priceConfigured ? '✓' : '✗'), el('td', '', fmtMicroUsd(row.providerCostMicroUsd))
        );
        tbody.append(tr);
      });
      table.append(tbody);
      readinessCard.append(table);
    }
    wrap.append(readinessCard);

    const rulesCard = el('div', 'admin-card');
    rulesCard.append(el('h3', '', t('comSubWallet')));
    const markupField = field(t('comMarkupPercent'), 'number', walletRules.markupPercent);
    const minTopUpField = field(t('comMinTopUp'), 'number', walletRules.minimumTopUpUsd);
    const signupPromoField = field(t('comSignupPromo'), 'number', walletRules.signupPromoRetailUsd);
    const preview = el('p', 'hint');
    function updatePreview() {
      const percent = Number(markupField.input.value) || 0;
      const multiplier = 1 + percent / 100;
      const margin = multiplier > 0 ? (multiplier - 1) / multiplier * 100 : 0;
      preview.textContent = t('comMultiplier') + ': ' + multiplier.toFixed(2) + '× · ' + t('comGrossMargin') + ': ' + margin.toFixed(2) + '%';
    }
    markupField.input.oninput = updatePreview;
    updatePreview();
    const saveRulesBtn = el('button', 'btn btn-primary', t('comSaveWalletRules'));
    saveRulesBtn.type = 'button';
    saveRulesBtn.onclick = () => {
      api('/commercial/wallet-rules', { method: 'PATCH', body: JSON.stringify({
        markupPercent: Number(markupField.input.value), minimumTopUpUsd: Number(minTopUpField.input.value), signupPromoRetailUsd: Number(signupPromoField.input.value)
      }) }).then(() => showToast(t('saved'))).catch((error) => showToast(error.message, 'danger'));
    };
    rulesCard.append(markupField.wrap, preview, minTopUpField.wrap, signupPromoField.wrap, saveRulesBtn);
    wrap.append(rulesCard);

    // AI Pricing Simulator (spec section 45) - purely client-side against the CURRENT (unsaved)
    // markup field value, so an admin can explore before publishing.
    const simCard = el('div', 'admin-card');
    simCard.append(el('h3', '', t('comSimulatorTitle')));
    const simCostField = field(t('comProviderCost'), 'number', 0.10);
    const simResult = el('p', 'hint');
    function updateSim() {
      const cost = Number(simCostField.input.value) || 0;
      const percent = Number(markupField.input.value) || 0;
      const multiplier = 1 + percent / 100;
      const retail = cost * multiplier;
      simResult.textContent = t('comRetail') + ': $' + retail.toFixed(4) + ' · ' + t('comProfit') + ': $' + (retail - cost).toFixed(4);
    }
    simCostField.input.oninput = updateSim;
    markupField.input.addEventListener('input', updateSim);
    updateSim();
    simCard.append(simCostField.wrap, simResult);
    wrap.append(simCard);

    const markupCard = el('div', 'admin-card');
    markupCard.append(el('h3', '', t('comMarkupRulesTitle')));
    if (!markupRulesData.rules.length) markupCard.append(el('p', 'hint', t('comNoRules')));
    markupRulesData.rules.forEach((rule) => {
      const row = el('div', 'admin-btn-row');
      row.append(el('span', '', rule.scopeType + ': ' + rule.scopeKey + ' → ' + rule.markupPercent + '%'));
      const removeBtn = el('button', 'btn btn-secondary btn-sm', t('comRemove'));
      removeBtn.type = 'button';
      removeBtn.onclick = () => api('/commercial/markup-rules/' + rule.id, { method: 'DELETE' }).then(() => renderTab()).catch((error) => showToast(error.message, 'danger'));
      row.append(removeBtn);
      markupCard.append(row);
    });
    const scopeTypeSelect = document.createElement('select');
    ['feature', 'provider', 'model', 'feature_model'].forEach((value) => { const opt = document.createElement('option'); opt.value = value; opt.textContent = value; scopeTypeSelect.append(opt); });
    const scopeKeyField = field(t('comScopeKey'), 'text', '');
    const rulePercentField = field(t('comMarkupPercent'), 'number', 200);
    const addRuleBtn = el('button', 'btn btn-secondary', t('comAddRule'));
    addRuleBtn.type = 'button';
    addRuleBtn.onclick = () => {
      api('/commercial/markup-rules', { method: 'POST', body: JSON.stringify({ scopeType: scopeTypeSelect.value, scopeKey: scopeKeyField.input.value, markupPercent: Number(rulePercentField.input.value), enabled: true }) })
        .then(() => renderTab()).catch((error) => showToast(error.message, 'danger'));
    };
    const addRuleRow = el('div', 'admin-form-row admin-form-row-submit');
    addRuleRow.append(scopeTypeSelect, scopeKeyField.wrap, rulePercentField.wrap, addRuleBtn);
    markupCard.append(addRuleRow);
    wrap.append(markupCard);

    const pricingCard = el('div', 'admin-card');
    pricingCard.append(el('h3', '', t('comProviderPricingTitle')));
    if (!pricingData.rows.length) pricingCard.append(el('p', 'hint', t('comNoModelPricing')));
    pricingData.rows.forEach((row) => {
      const line = el('div', 'admin-btn-row');
      const flatLabel = row.flatPricePerCallMicroUsd != null ? ', ' + t('comFlatPrice') + ': ' + fmtMicroUsd(row.flatPricePerCallMicroUsd) : '';
      line.append(el('span', '', row.provider + ' / ' + row.model + ' — ' + t('comPromptPrice') + ': ' + (row.promptPricePer1k ?? '—') + ', ' + t('comCompletionPrice') + ': ' + (row.completionPricePer1k ?? '—') + flatLabel));
      const removeBtn = el('button', 'btn btn-secondary btn-sm', t('comRemove'));
      removeBtn.type = 'button';
      removeBtn.onclick = () => api('/commercial/provider-pricing/' + row.provider + '/' + row.model, { method: 'DELETE' }).then(() => renderTab()).catch((error) => showToast(error.message, 'danger'));
      line.append(removeBtn);
      pricingCard.append(line);
    });
    const providerSelect = document.createElement('select');
    KNOWN_PROVIDERS.forEach((provider) => { const opt = document.createElement('option'); opt.value = provider; opt.textContent = provider; providerSelect.append(opt); });
    const modelField = field(t('comModel'), 'text', '');
    const promptPriceField = field(t('comPromptPrice'), 'number', '');
    const completionPriceField = field(t('comCompletionPrice'), 'number', '');
    const flatPriceField = field(t('comFlatPrice'), 'number', '');
    const addPricingBtn = el('button', 'btn btn-secondary', t('comAddPricing'));
    addPricingBtn.type = 'button';
    addPricingBtn.onclick = () => {
      api('/commercial/provider-pricing', { method: 'POST', body: JSON.stringify({
        provider: providerSelect.value, model: modelField.input.value, promptPricePer1k: promptPriceField.input.value || null, completionPricePer1k: completionPriceField.input.value || null,
        flatPricePerCallUsd: flatPriceField.input.value || null
      }) }).then(() => renderTab()).catch((error) => showToast(error.message, 'danger'));
    };
    const addPricingRow = el('div', 'admin-form-row admin-form-row-submit');
    addPricingRow.append(providerSelect, modelField.wrap, promptPriceField.wrap, completionPriceField.wrap, flatPriceField.wrap, addPricingBtn);
    pricingCard.append(addPricingRow);
    wrap.append(pricingCard);

    // Admin credit/debit (spec section 50) - no user search/autocomplete in this slice, an admin
    // pastes a known user id directly (visible in the Users tab's own row detail).
    const creditCard = el('div', 'admin-card');
    creditCard.append(el('h3', '', t('comCreditDebitTitle')));
    const userIdField = field(t('comUserId'), 'text', '');
    const amountField = field(t('comAmountUsd'), 'number', '');
    const balanceSelect = document.createElement('select');
    [['paid', t('comBalancePaid')], ['promo', t('comBalancePromo')]].forEach(([value, label]) => { const opt = document.createElement('option'); opt.value = value; opt.textContent = label; balanceSelect.append(opt); });
    const reasonField = field(t('comReason'), 'text', '');
    function submitCreditDebit(action) {
      const userId = userIdField.input.value.trim();
      if (!userId) return;
      api('/commercial/users/' + userId + '/' + action, { method: 'POST', body: JSON.stringify({ amountUsd: Number(amountField.input.value), balanceType: balanceSelect.value, reason: reasonField.input.value }) })
        .then(() => renderTab()).catch((error) => showToast(error.message, 'danger'));
    }
    const creditBtn = el('button', 'btn btn-primary', t('comCredit'));
    creditBtn.type = 'button';
    creditBtn.onclick = () => submitCreditDebit('credit');
    const debitBtn = el('button', 'btn btn-secondary', t('comDebit'));
    debitBtn.type = 'button';
    debitBtn.onclick = () => submitCreditDebit('debit');
    const creditDebitFields = el('div', 'admin-form-row');
    creditDebitFields.append(userIdField.wrap, amountField.wrap, balanceSelect, reasonField.wrap);
    const creditDebitBtns = el('div', 'admin-btn-row');
    creditDebitBtns.append(creditBtn, debitBtn);
    creditCard.append(creditDebitFields, creditDebitBtns);
    wrap.append(creditCard);

    const ledgerCard = el('div', 'admin-card admin-card-wide');
    ledgerCard.append(el('h3', '', t('comLedgerTitle')));
    if (!ledgerData.entries.length) {
      ledgerCard.append(el('p', 'hint', t('comLedgerEmpty')));
    } else {
      const table = document.createElement('table');
      table.className = 'admin-table';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      [t('comColTime'), t('comColUser'), t('comColType'), t('comColCash'), t('comColPromo'), t('comColProviderModel'), t('comColFeature')].forEach((label) => headRow.append(el('th', '', label)));
      thead.append(headRow);
      table.append(thead);
      const tbody = document.createElement('tbody');
      ledgerData.entries.forEach((entry) => {
        const row = document.createElement('tr');
        [
          fmtDate(entry.createdAt), entry.userId, entry.type, fmtMicroUsd(entry.cashDeltaMicroUsd), fmtMicroUsd(entry.promoDeltaMicroUsd),
          [entry.provider, entry.model].filter(Boolean).join(' / ') || '—', entry.feature || '—'
        ].forEach((value) => row.append(el('td', '', String(value))));
        tbody.append(row);
      });
      table.append(tbody);
      // Consistency fix (CSS restyle, no logic change): matches commercialTransactionsSubTab()'s
      // already-correct .admin-table-wrap - this ledger table has 7 columns and was missing the
      // horizontal-scroll wrapper every other wide admin table in this file already gets.
      const tableWrap = el('div', 'admin-table-wrap');
      tableWrap.append(table);
      ledgerCard.append(tableWrap);
    }
    wrap.append(ledgerCard);

    return wrap;
  });
}

function commercialHistorySubTab() {
  return api('/commercial/versions').then((data) => {
    const wrap = el('div', 'admin-card');
    wrap.append(el('h3', '', t('comHistoryTitle')));
    if (!data.versions.length) {
      wrap.append(el('p', 'hint', t('comHistoryEmpty')));
      return wrap;
    }
    const table = document.createElement('table');
    table.className = 'admin-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    [t('comColTime'), t('comColKey'), t('comColChangedBy'), t('comColSummary')].forEach((label) => headRow.append(el('th', '', label)));
    thead.append(headRow);
    table.append(thead);
    const tbody = document.createElement('tbody');
    data.versions.forEach((version) => {
      const row = document.createElement('tr');
      [fmtDate(version.changedAt), version.configKey, version.changedBy || '—', version.changeSummary || '—'].forEach((value) => row.append(el('td', '', String(value))));
      tbody.append(row);
    });
    table.append(tbody);
    // Consistency fix (CSS restyle, no logic change): matches commercialTransactionsSubTab()'s
    // already-correct .admin-table-wrap - was missing the horizontal-scroll wrapper.
    const tableWrap = el('div', 'admin-table-wrap');
    tableWrap.append(table);
    wrap.append(tableWrap);
    return wrap;
  });
}

// Slice 2 - Subscription stats (spec section 18). Real rows only, same statCard() tile helper
// already used by usersTab/aiTab (see its own comment: "every value passed in must already be
// real, computed from the same response the table/cards below it render from").
function commercialSubscriptionsSubTab() {
  return api('/commercial/subscriptions').then((data) => {
    const wrap = el('div', 'admin-stat-row');
    const s = data.stats;
    wrap.append(
      statCard('crown', fmtNumber(s.activePlus), t('comStatActivePlus')),
      statCard('star', fmtNumber(s.activePro), t('comStatActivePro')),
      statCard('sparkles', fmtNumber(s.activePersonalized), t('comStatActivePersonalized')),
      statCard('alert-triangle', fmtNumber(s.pastDue), t('comStatPastDue')),
      statCard('clock', fmtNumber(s.canceling), t('comStatCanceling')),
      statCard('x-circle', fmtNumber(s.expired), t('comStatExpired')),
      statCard('banknote', fmtMicroUsd(s.mrrMicroUsd), t('comStatMrr'))
    );
    return wrap;
  });
}

// Slice 2 - Storage Add-on product catalog (spec section 6/19). Capacity is shown/edited in GB
// for readability, converted to/from bytes only at the API boundary. displayOrder is a plain
// numeric field - no drag-to-reorder pattern exists anywhere else in this admin panel to imitate
// (confirmed before building this), so this is the simplest fit consistent with every other
// numeric admin field.
const GB_BYTES = 1073741824;
function commercialStorageSubTab() {
  return api('/commercial/storage-products').then((products) => {
    const wrap = el('div', 'admin-grid');
    products.products.sort((a, b) => a.displayOrder - b.displayOrder).forEach((product) => {
      const card = el('div', 'admin-card');
      card.append(el('h3', '', product.name));
      const nameField = field(t('comProductName'), 'text', product.name);
      const capacityField = field(t('comCapacityGb'), 'number', product.capacityBytes / GB_BYTES);
      const priceField = field(t('comProductPrice'), 'number', product.priceAmountMicroUsd / 1000000);
      const validityField = field(t('comValidityDays'), 'number', product.validityDays);
      const orderField = field(t('comDisplayOrder'), 'number', product.displayOrder);
      const enabledLabel = el('label', 'field-check');
      const enabledCheckbox = document.createElement('input');
      enabledCheckbox.type = 'checkbox';
      enabledCheckbox.checked = product.enabled;
      enabledLabel.append(enabledCheckbox, el('span', '', t('comEnabled')));
      const saveBtn = el('button', 'btn btn-primary', t('comSaveProduct'));
      saveBtn.type = 'button';
      saveBtn.onclick = () => {
        api('/commercial/storage-products/' + product.id, { method: 'PATCH', body: JSON.stringify({
          name: nameField.input.value, capacityBytes: Number(capacityField.input.value) * GB_BYTES,
          priceAmountUsd: Number(priceField.input.value), validityDays: Number(validityField.input.value),
          displayOrder: Number(orderField.input.value), enabled: enabledCheckbox.checked
        }) }).then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
      };
      card.append(nameField.wrap, capacityField.wrap, priceField.wrap, validityField.wrap, orderField.wrap, enabledLabel, saveBtn);
      wrap.append(card);
    });

    const addCard = el('div', 'admin-card');
    addCard.append(el('h3', '', t('comAddProduct')));
    const newName = field(t('comProductName'), 'text', '');
    const newCapacity = field(t('comCapacityGb'), 'number', 25);
    const newPrice = field(t('comProductPrice'), 'number', 4.99);
    const newValidity = field(t('comValidityDays'), 'number', 90);
    const newOrder = field(t('comDisplayOrder'), 'number', products.products.length + 1);
    const addBtn = el('button', 'btn btn-secondary', t('comAddProduct'));
    addBtn.type = 'button';
    addBtn.onclick = () => {
      api('/commercial/storage-products', { method: 'POST', body: JSON.stringify({
        name: newName.input.value, capacityBytes: Number(newCapacity.input.value) * GB_BYTES,
        priceAmountUsd: Number(newPrice.input.value), validityDays: Number(newValidity.input.value), displayOrder: Number(newOrder.input.value)
      }) }).then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
    };
    addCard.append(newName.wrap, newCapacity.wrap, newPrice.wrap, newValidity.wrap, newOrder.wrap, addBtn);
    wrap.append(addCard);

    return wrap;
  });
}

// Slice 2 - Transactions (spec section 20). Confirm/Fail are the ONLY way a
// pending Manual/Test transaction ever resolves in this slice - no real payment gateway exists
// yet, so this table IS the admin console for it.
function commercialTransactionsSubTab() {
  return api('/commercial/transactions').then((data) => {
    const wrap = el('div', 'admin-card');
    wrap.append(el('h3', '', t('comTransactionsTitle')));
    if (!data.transactions.length) {
      wrap.append(el('p', 'hint', t('comNoTransactions')));
      return wrap;
    }
    const tableWrap = el('div', 'admin-table-wrap');
    const table = document.createElement('table');
    table.className = 'admin-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    [t('comColUser'), t('comColType'), t('comColAmount'), t('comColStatus'), t('comColProduct'), t('comColTime'), t('comColConfirmed'), t('colActions')]
      .forEach((label) => headRow.append(el('th', '', label)));
    thead.append(headRow);
    table.append(thead);
    const tbody = document.createElement('tbody');
    data.transactions.forEach((transaction) => {
      const row = document.createElement('tr');
      [transaction.userId, transaction.type, fmtMicroUsd(transaction.amountMicroUsd), transaction.status, transaction.productId || '—', fmtDate(transaction.createdAt), fmtDate(transaction.confirmedAt)]
        .forEach((value) => row.append(el('td', '', String(value))));
      const actionsTd = document.createElement('td');
      if (transaction.status === 'pending') {
        const confirmBtn = el('button', 'btn btn-primary btn-sm', t('comConfirm'));
        confirmBtn.type = 'button';
        confirmBtn.onclick = () => api('/commercial/transactions/' + transaction.id + '/confirm', { method: 'POST' })
          .then(() => renderTab()).catch((error) => showToast(error.message, 'danger'));
        const failBtn = el('button', 'btn btn-secondary btn-sm', t('comFail'));
        failBtn.type = 'button';
        failBtn.onclick = () => api('/commercial/transactions/' + transaction.id + '/fail', { method: 'POST' })
          .then(() => renderTab()).catch((error) => showToast(error.message, 'danger'));
        actionsTd.append(confirmBtn, failBtn);
      } else if (transaction.status === 'confirmed') {
        // Validation Gate finding: the backend refund route/reversal logic (spec section 19/20)
        // existed with automated coverage but no admin UI button to trigger it - closed here.
        const refundBtn = el('button', 'btn btn-secondary btn-sm', t('comRefund'));
        refundBtn.type = 'button';
        refundBtn.onclick = () => api('/commercial/transactions/' + transaction.id + '/refund', { method: 'POST' })
          .then(() => renderTab()).catch((error) => showToast(error.message, 'danger'));
        actionsTd.append(refundBtn);
      }
      row.append(actionsTd);
      tbody.append(row);
    });
    table.append(tbody);
    tableWrap.append(table);
    wrap.append(tableWrap);
    return wrap;
  });
}

// Crypto payments (BSC) - admin config sub-tab (admin-config task). Unlike every OTHER Commercial
// sub-tab (deliberately English-only for now, per commercialSubNav's own comment above), this one
// is fully localized in en/fa/ar/es - a new requirement specific to this task, not a retroactive
// fix to its siblings.
function commercialCryptoPaymentsSubTab() {
  return api('/commercial/crypto-payments/status').then((status) => {
    const wrap = el('div', 'admin-grid');

    // --- Provider status ---
    const statusCard = el('div', 'admin-card');
    const statusHead = el('div', 'admin-ai-card-head');
    statusHead.append(el('h3', '', t('cryptoPayStatusTitle')));
    statusHead.append(el('span', 'badge status-' + (status.enabled ? 'valid' : 'unknown'), status.enabled ? t('cryptoPayModeBsc') : t('cryptoPayModeManual')));
    statusCard.append(statusHead);
    statusCard.append(el('p', 'hint', t('cryptoPayConfigComplete') + ': ' + (status.configComplete ? t('cryptoPayYes') : t('cryptoPayNo'))));
    statusCard.append(el('p', 'hint', t('cryptoPayRpcConfigured') + ': ' + (status.rpcConfigured ? t('cryptoPayYes') : t('cryptoPayNo'))));
    statusCard.append(el('p', 'hint', t('cryptoPayWebhookConfigured') + ': ' + (status.webhookConfigured ? t('cryptoPayYes') : t('cryptoPayNo'))));
    statusCard.append(el('p', 'hint', status.lastTestedAt
      ? t('cryptoPayLastTested', { date: fmtDate(status.lastTestedAt) }) + ' — ' + (status.lastTestOk ? t('cryptoPayTestOk') : t('cryptoPayTestFailed'))
        + (status.lastDetectedChainId != null ? ' (' + t('cryptoPayDetectedChain', { chainId: status.lastDetectedChainId }) + ')' : '')
      : t('cryptoPayNeverTested')));
    statusCard.append(el('p', 'hint', t('cryptoPayNewInvoicesWarning')));
    const toggleBtn = el('button', 'btn ' + (status.enabled ? 'btn-danger' : 'btn-primary') + ' btn-sm', status.enabled ? t('cryptoPayDisable') : t('cryptoPayEnable'));
    toggleBtn.type = 'button';
    toggleBtn.onclick = () => {
      toggleBtn.disabled = true;
      api('/commercial/crypto-payments/status', { method: 'PATCH', body: JSON.stringify({ enabled: !status.enabled }) })
        .then(() => { showToast(t('saved')); renderTab(); })
        .catch((error) => showToast(error.message, 'danger'))
        .finally(() => { toggleBtn.disabled = false; });
    };
    statusCard.append(toggleBtn);
    wrap.append(statusCard);

    // --- Public BSC settings (versioned, non-secret) ---
    const publicCard = el('div', 'admin-card');
    publicCard.append(el('h3', '', t('cryptoPayPublicTitle')));
    const chainIdField = field(t('cryptoPayChainId'), 'number', status.chainId);
    const depositAddressField = field(t('cryptoPayDepositAddress'), 'text', status.depositAddress);
    const tokenSymbolField = field(t('cryptoPayTokenSymbol'), 'text', status.tokenSymbol);
    const tokenContractField = field(t('cryptoPayTokenContract'), 'text', status.tokenContract);
    const tokenDecimalsField = field(t('cryptoPayTokenDecimals'), 'number', status.tokenDecimals);
    const exchangeRateField = field(t('cryptoPayExchangeRate'), 'number', status.exchangeRateUsdPerToken);
    const confirmationsField = field(t('cryptoPayConfirmations'), 'number', status.confirmationsRequired);
    const expiryField = field(t('cryptoPayExpiryMinutes'), 'number', status.invoiceExpiryMinutes);
    // Addresses stay left-to-right even under an RTL (fa/ar) page - same convention this app
    // already uses for wallet addresses/tx hashes elsewhere.
    depositAddressField.input.dir = 'ltr';
    tokenContractField.input.dir = 'ltr';
    const savePublicBtn = el('button', 'btn btn-primary', t('cryptoPaySavePublic'));
    savePublicBtn.type = 'button';
    savePublicBtn.onclick = () => {
      savePublicBtn.disabled = true;
      api('/commercial/crypto-payments/public-settings', { method: 'PATCH', body: JSON.stringify({
        chainId: Number(chainIdField.input.value), depositAddress: depositAddressField.input.value.trim(),
        tokenSymbol: tokenSymbolField.input.value.trim(), tokenContract: tokenContractField.input.value.trim(),
        tokenDecimals: Number(tokenDecimalsField.input.value), exchangeRateUsdPerToken: Number(exchangeRateField.input.value),
        confirmationsRequired: Number(confirmationsField.input.value), invoiceExpiryMinutes: Number(expiryField.input.value)
      }) }).then(() => { showToast(t('saved')); renderTab(); })
        .catch((error) => showToast(error.message, 'danger'))
        .finally(() => { savePublicBtn.disabled = false; });
    };
    publicCard.append(
      chainIdField.wrap, depositAddressField.wrap, tokenSymbolField.wrap, tokenContractField.wrap,
      tokenDecimalsField.wrap, exchangeRateField.wrap, confirmationsField.wrap, expiryField.wrap, savePublicBtn
    );
    wrap.append(publicCard);

    // --- RPC connection (secret - password field, never prefilled, "configured" badge only) ---
    const rpcCard = el('div', 'admin-card');
    rpcCard.append(el('h3', '', t('cryptoPayRpcTitle')));
    rpcCard.append(el('p', 'hint', status.rpcConfigured ? t('cryptoPayRpcConfiguredBadge') : t('cryptoPayRpcNotConfiguredBadge')));
    const rpcUrlField = field(t('cryptoPayRpcUrl'), 'password', '');
    const saveRpcBtn = el('button', 'btn btn-primary btn-sm', t('cryptoPaySaveRpc'));
    saveRpcBtn.type = 'button';
    saveRpcBtn.onclick = () => {
      const rpcUrl = rpcUrlField.input.value.trim();
      if (!rpcUrl) return;
      rpcUrlField.input.value = ''; // clear immediately - never let the raw URL linger in the DOM
      saveRpcBtn.disabled = true;
      api('/commercial/crypto-payments/rpc-secret', { method: 'POST', body: JSON.stringify({ rpcUrl }) })
        .then(() => { showToast(t('saved')); renderTab(); })
        .catch((error) => showToast(error.message, 'danger'))
        .finally(() => { saveRpcBtn.disabled = false; });
    };
    const clearRpcBtn = el('button', 'btn btn-secondary btn-sm', t('cryptoPayClearRpc'));
    clearRpcBtn.type = 'button';
    clearRpcBtn.onclick = () => {
      if (!window.confirm(t('cryptoPayClearRpcConfirm'))) return;
      api('/commercial/crypto-payments/rpc-secret', { method: 'DELETE' })
        .then(() => { showToast(t('saved')); renderTab(); })
        .catch((error) => showToast(error.message, 'danger'));
    };
    const testResultLine = el('p', 'hint');
    const testBtn = el('button', 'btn btn-secondary btn-sm', t('cryptoPayTestButton'));
    testBtn.type = 'button';
    testBtn.onclick = () => {
      testBtn.disabled = true;
      api('/commercial/crypto-payments/test-connection', { method: 'POST', body: JSON.stringify({}) })
        .then((result) => {
          testResultLine.textContent = result.ok
            ? t('cryptoPayTestSuccess', { chainId: result.detectedChainId }) + (result.matches ? '' : ' — ' + t('cryptoPayTestChainMismatch', { configured: result.configuredChainId }))
            : t('cryptoPayTestFailedReason', { reason: result.reason });
        })
        .catch((error) => showToast(error.message, 'danger'))
        .finally(() => { testBtn.disabled = false; });
    };
    rpcCard.append(rpcUrlField.wrap, el('p', 'hint', t('cryptoPayReplaceRpcHint')), saveRpcBtn, clearRpcBtn, testBtn, testResultLine);
    wrap.append(rpcCard);

    // --- Webhook secret (optional - generated server-side, shown once) ---
    const webhookCard = el('div', 'admin-card');
    webhookCard.append(el('h3', '', t('cryptoPayWebhookTitle')));
    webhookCard.append(el('p', 'hint', status.webhookConfigured ? t('cryptoPayWebhookHint', { hint: status.webhookSecretHint }) : t('cryptoPayWebhookNotConfiguredBadge')));
    const webhookRevealBox = el('p', 'hint');
    webhookRevealBox.hidden = true;
    const generateWebhookBtn = el('button', 'btn btn-primary btn-sm', t('cryptoPayGenerateWebhook'));
    generateWebhookBtn.type = 'button';
    generateWebhookBtn.onclick = () => {
      if (status.webhookConfigured && !window.confirm(t('cryptoPayRotateWebhookConfirm'))) return;
      generateWebhookBtn.disabled = true;
      api('/commercial/crypto-payments/webhook-secret', { method: 'POST' })
        .then((result) => {
          webhookRevealBox.hidden = false;
          webhookRevealBox.dir = 'ltr';
          webhookRevealBox.textContent = t('cryptoPayWebhookRevealed', { secret: result.webhookSecret });
          showToast(t('saved'));
        })
        .catch((error) => showToast(error.message, 'danger'))
        .finally(() => { generateWebhookBtn.disabled = false; });
    };
    const clearWebhookBtn = el('button', 'btn btn-secondary btn-sm', t('cryptoPayClearWebhook'));
    clearWebhookBtn.type = 'button';
    clearWebhookBtn.onclick = () => {
      if (!window.confirm(t('cryptoPayClearWebhookConfirm'))) return;
      api('/commercial/crypto-payments/webhook-secret', { method: 'DELETE' })
        .then(() => { showToast(t('saved')); renderTab(); })
        .catch((error) => showToast(error.message, 'danger'));
    };
    webhookCard.append(generateWebhookBtn, clearWebhookBtn, webhookRevealBox, el('p', 'hint', t('cryptoPayWebhookNeverShownAgain')));
    wrap.append(webhookCard);

    return wrap;
  });
}

// --- AI Cost Control subtab (fully localized fa/ar/en/es, unlike most of this Commercial tab -
// matches the crypto-payments subtab's own precedent as the newest, most-scrutinized addition) ---
let aiCostControlState = { range: '30d', customStart: '', customEnd: '', modelsPage: 1, reconPage: 1 };

function aiccRangeQueryParams() {
  const params = 'range=' + encodeURIComponent(aiCostControlState.range)
    + (aiCostControlState.range === 'custom' ? '&start=' + encodeURIComponent(aiCostControlState.customStart) + '&end=' + encodeURIComponent(aiCostControlState.customEnd) : '');
  return params;
}

function aiccStatusBadge(status) {
  const label = {
    ok: t('aiccStatusOk'), no_adapter: t('aiccStatusNoAdapter'), not_configured: t('aiccStatusNotConfigured'),
    not_synced: t('aiccStatusNotSynced'), not_comparable_currency: t('aiccStatusNotComparableCurrency')
  }[status] || status;
  const tone = status === 'ok' ? 'valid' : status === 'no_adapter' ? 'unknown' : 'invalid';
  return el('span', 'badge status-' + tone, label);
}

function commercialAiCostControlSubTab() {
  const query = aiccRangeQueryParams();
  return Promise.all([
    api('/commercial/ai-cost-control/overview?' + query),
    api('/commercial/ai-cost-control/providers?' + query),
    api('/commercial/ai-cost-control/models?' + query + '&page=' + aiCostControlState.modelsPage + '&pageSize=25'),
    api('/commercial/ai-cost-control/reconciliation/internal?' + query + '&page=' + aiCostControlState.reconPage + '&pageSize=25'),
    api('/commercial/ai-cost-control/reconciliation/external?' + query),
    api('/commercial/ai-cost-control/credentials')
  ]).then(([overview, providers, models, reconInternal, reconExternal, credentialsData]) => {
    const wrap = el('div', 'admin-grid');

    // --- Range selector ---
    const rangeCard = el('div', 'admin-card admin-card-wide');
    rangeCard.append(el('h3', '', t('aiccRangeLabel')));
    const rangeSelect = document.createElement('select');
    [['24h', t('aiccRange24h')], ['7d', t('aiccRange7d')], ['30d', t('aiccRange30d')], ['month', t('aiccRangeMonth')], ['custom', t('aiccRangeCustom')]]
      .forEach(([value, label]) => { const opt = document.createElement('option'); opt.value = value; opt.textContent = label; opt.selected = value === aiCostControlState.range; rangeSelect.append(opt); });
    const rangeRow = el('div', 'admin-form-row');
    rangeRow.append(rangeSelect);
    const startField = field(t('aiccCustomStart'), 'datetime-local', aiCostControlState.customStart);
    const endField = field(t('aiccCustomEnd'), 'datetime-local', aiCostControlState.customEnd);
    startField.wrap.hidden = aiCostControlState.range !== 'custom';
    endField.wrap.hidden = aiCostControlState.range !== 'custom';
    rangeSelect.onchange = () => { startField.wrap.hidden = rangeSelect.value !== 'custom'; endField.wrap.hidden = rangeSelect.value !== 'custom'; };
    const applyBtn = el('button', 'btn btn-primary btn-sm', t('aiccApplyRange'));
    applyBtn.type = 'button';
    applyBtn.onclick = () => {
      aiCostControlState.range = rangeSelect.value;
      if (rangeSelect.value === 'custom') {
        aiCostControlState.customStart = startField.input.value ? new Date(startField.input.value).toISOString() : '';
        aiCostControlState.customEnd = endField.input.value ? new Date(endField.input.value).toISOString() : '';
      }
      aiCostControlState.modelsPage = 1; aiCostControlState.reconPage = 1;
      renderTab();
    };
    rangeRow.append(startField.wrap, endField.wrap, applyBtn);
    rangeCard.append(rangeRow);
    rangeCard.append(el('p', 'hint', t('aiccRangeUtcHint')));
    wrap.append(rangeCard);

    // --- Overview cards ---
    const overviewCard = el('div', 'admin-card admin-card-wide');
    overviewCard.append(el('h3', '', t('aiccOverviewTitle')));
    overviewCard.append(statRow([
      statCard('landmark', overview.externalCostComparable ? fmtMicroUsd(overview.externalActualCostMicroUsd) : t('aiccNotComparable'), t('aiccOverviewExternalCost') + ' · ' + t('aiccSourceProviderApi')),
      statCard('calculator', fmtMicroUsd(overview.internalEstimateMicroUsd), t('aiccOverviewInternalEstimate') + ' · ' + t('aiccSourceInternalEstimate')),
      statCard('receipt', fmtMicroUsd(overview.retailChargeMicroUsd), t('aiccOverviewRetailCharge') + ' · ' + t('aiccSourceRetailCharge')),
      statCard('wallet', fmtMicroUsd(overview.actualWalletDebitMicroUsd), t('aiccOverviewWalletDebit')),
      statCard('trending-up', overview.marginMicroUsd == null ? t('aiccNotComparable') : fmtMicroUsd(overview.marginMicroUsd), t('aiccOverviewMargin')),
      statCard('alert-triangle', fmtNumber(overview.reconciliation.totalExceptions), t('aiccOverviewReconciliation')),
      statCard('refresh-cw', overview.freshness.comparableProviderCount + (overview.freshness.staleProviderCount ? ' (' + overview.freshness.staleProviderCount + ' ' + t('aiccFreshnessStale') + ')' : ''), t('aiccOverviewFreshness'))
    ]));
    wrap.append(overviewCard);

    // --- Provider table ---
    const providersCard = el('div', 'admin-card admin-card-wide');
    providersCard.append(el('h3', '', t('aiccProvidersTitle')));
    const providersTableWrap = el('div', 'admin-table-wrap');
    const providersTable = document.createElement('table');
    providersTable.className = 'admin-table';
    const providersThead = document.createElement('thead');
    const providersHeadRow = document.createElement('tr');
    [t('aiccColProvider'), t('aiccColStatus'), t('aiccColExternalCost'), t('aiccColInternalEstimate'), t('aiccColDiff'), t('aiccColRetailCharge'), t('aiccColBalance'), t('aiccColLastSync'), t('aiccColScope'), t('aiccColActions')]
      .forEach((label) => providersHeadRow.append(el('th', '', label)));
    providersThead.append(providersHeadRow);
    providersTable.append(providersThead);
    const providersTbody = document.createElement('tbody');
    providers.providers.forEach((row) => {
      const tr = document.createElement('tr');
      tr.append(el('td', '', row.displayName));
      const statusTd = document.createElement('td');
      statusTd.append(aiccStatusBadge(row.external.status));
      tr.append(statusTd);
      tr.append(el('td', '', row.external.comparable ? fmtMicroUsd(row.external.externalActualCostMicroUsd) : t('aiccNotComparable')));
      tr.append(el('td', '', fmtMicroUsd(row.external.internalEstimateMicroUsd)));
      const diffTd = document.createElement('td');
      if (row.external.comparable && row.external.diffPercent != null) {
        diffTd.textContent = fmtMicroUsd(row.external.diffMicroUsd) + ' (' + row.external.diffPercent.toFixed(1) + '%)';
        if (row.external.outOfTolerance) diffTd.append(' ', el('span', 'badge status-invalid', t('aiccOutOfTolerance')));
      } else {
        diffTd.textContent = '—';
      }
      tr.append(diffTd);
      tr.append(el('td', '', fmtMicroUsd(row.external.retailChargeMicroUsd)));
      const balanceTd = document.createElement('td');
      if (row.balance.supported) balanceTd.textContent = fmtMicroUsd(row.balance.amountMicroUsd);
      else {
        balanceTd.append(el('span', 'hint', t('aiccBalanceUnavailable')));
        if (row.manualBalance) balanceTd.append(el('span', 'hint', t('aiccBalanceManualLabel') + ': ' + fmtMicroUsd(row.manualBalance.amountMicroUsd) + ' (' + fmtDate(row.manualBalance.createdAt) + ')'));
      }
      tr.append(balanceTd);
      tr.append(el('td', '', row.external.freshness ? fmtDate(row.external.freshness.lastSuccessfulSyncAt) : t('aiccStatusNotSynced')));
      tr.append(el('td', '', row.scopeConfig && row.scopeConfig.projectId ? row.scopeConfig.projectId : '—'));
      const actionsTd = document.createElement('td');
      if (row.supportsActualCosts && row.credentialConfigured) {
        const refreshBtn = el('button', 'btn btn-secondary btn-sm', t('aiccRefreshBtn'));
        refreshBtn.type = 'button';
        refreshBtn.onclick = () => {
          refreshBtn.disabled = true; refreshBtn.textContent = t('aiccRefreshing');
          api('/commercial/ai-cost-control/refresh', { method: 'POST', body: JSON.stringify({ provider: row.provider, range: aiCostControlState.range, start: aiCostControlState.customStart, end: aiCostControlState.customEnd }) })
            .then((result) => {
              if (result.ok === false) { showToast(t('aiccRefreshFailed') + ': ' + result.reason, 'danger'); }
              else if (result.projectIdMismatch) {
                showToast(t('aiccRefreshProjectMismatch', { total: result.diagnostics.totalResultsSeen }), 'danger');
              } else { showToast(t('aiccRefreshSuccess')); }
              renderTab();
            })
            .catch((error) => showToast(error.message, 'danger'))
            .finally(() => { refreshBtn.disabled = false; refreshBtn.textContent = t('aiccRefreshBtn'); });
        };
        actionsTd.append(refreshBtn);
      } else if (row.adapterRegistered) {
        actionsTd.append(el('span', 'hint', t('aiccConfigureBtn')));
      }
      tr.append(actionsTd);
      providersTbody.append(tr);
    });
    providersTable.append(providersTbody);
    providersTableWrap.append(providersTable);
    providersCard.append(providersTableWrap);
    wrap.append(providersCard);

    // --- Model table (paginated) ---
    const modelsCard = el('div', 'admin-card admin-card-wide');
    modelsCard.append(el('h3', '', t('aiccModelsTitle')));
    if (!models.models.length) {
      modelsCard.append(el('p', 'hint', t('comNoModelPricing')));
    } else {
      const modelsTableWrap = el('div', 'admin-table-wrap');
      const modelsTable = document.createElement('table');
      modelsTable.className = 'admin-table';
      const modelsThead = document.createElement('thead');
      const modelsHeadRow = document.createElement('tr');
      [t('comColProviderModel'), t('aiCostCalls'), t('aiccColInputTokens'), t('aiccColOutputTokens'), t('aiccColCachedTokens'), t('aiccColCacheWriteTokens'), t('aiccColReasoningTokens'), t('aiccColInternalEstimate'), t('aiccColRetailCharge'), t('comPriceConfigured'), t('aiccColExternalCostModel')]
        .forEach((label) => modelsHeadRow.append(el('th', '', label)));
      modelsThead.append(modelsHeadRow);
      modelsTable.append(modelsThead);
      const modelsTbody = document.createElement('tbody');
      models.models.forEach((row) => {
        const tr = document.createElement('tr');
        tr.append(
          el('td', '', row.provider + ' / ' + (row.model || '—')), el('td', '', fmtNumber(row.calls)),
          el('td', '', fmtNumber(row.promptTokens)), el('td', '', fmtNumber(row.completionTokens)),
          el('td', '', fmtNumber(row.cachedInputTokens)), el('td', '', fmtNumber(row.cacheWriteInputTokens)), el('td', '', fmtNumber(row.reasoningTokens)),
          el('td', '', fmtMicroUsd(row.providerCostMicroUsd)), el('td', '', fmtMicroUsd(row.retailChargeMicroUsd)),
          el('td', '', row.priceConfigured ? '✓' : '✗'),
          el('td', 'hint', row.externalCostSupported ? fmtMicroUsd(row.externalCostMicroUsd) : t('aiccModelExternalNotSupported'))
        );
        modelsTbody.append(tr);
      });
      modelsTable.append(modelsTbody);
      modelsTableWrap.append(modelsTable);
      modelsCard.append(modelsTableWrap);
      const modelsTotalPages = Math.max(1, Math.ceil(models.total / models.pageSize));
      const modelsPagination = el('div', 'admin-pagination');
      const modelsPrev = el('button', 'btn btn-secondary', t('prev'));
      modelsPrev.type = 'button'; modelsPrev.disabled = aiCostControlState.modelsPage <= 1;
      modelsPrev.onclick = () => { aiCostControlState.modelsPage -= 1; renderTab(); };
      const modelsNext = el('button', 'btn btn-secondary', t('next'));
      modelsNext.type = 'button'; modelsNext.disabled = aiCostControlState.modelsPage >= modelsTotalPages;
      modelsNext.onclick = () => { aiCostControlState.modelsPage += 1; renderTab(); };
      modelsPagination.append(modelsPrev, el('span', '', t('pageOf', { page: aiCostControlState.modelsPage, total: modelsTotalPages })), modelsNext);
      modelsCard.append(modelsPagination);
    }
    wrap.append(modelsCard);

    // --- Reconciliation panel ---
    const reconCard = el('div', 'admin-card admin-card-wide');
    reconCard.append(el('h3', '', t('aiccReconciliationTitle')));

    reconCard.append(el('h4', '', t('aiccReconInternalTitle')));
    reconCard.append(statRow([
      statCard('check-circle', fmtNumber(reconInternal.matched), t('aiccReconMatched')),
      statCard('help-circle', fmtNumber(reconInternal.exceptionCounts.MISSING_SETTLEMENT), t('aiccReconMissingSettlement')),
      statCard('help-circle', fmtNumber(reconInternal.exceptionCounts.ORPHAN_SETTLEMENT), t('aiccReconOrphanSettlement')),
      statCard('alert-triangle', fmtNumber(reconInternal.exceptionCounts.AMOUNT_MISMATCH), t('aiccReconAmountMismatch')),
      statCard('alert-triangle', fmtNumber(reconInternal.exceptionCounts.PROVIDER_MODEL_MISMATCH), t('aiccReconProviderModelMismatch')),
      statCard('minus-circle', fmtNumber(reconInternal.excludedCount), t('aiccReconExcluded'))
    ]));
    if (reconInternal.truncated) reconCard.append(el('p', 'hint', t('aiccReconTruncated')));

    if (reconInternal.exceptions.items.length) {
      reconCard.append(el('h4', '', t('aiccExceptionsTitle')));
      const excTableWrap = el('div', 'admin-table-wrap');
      const excTable = document.createElement('table');
      excTable.className = 'admin-table';
      const excThead = document.createElement('thead');
      const excHeadRow = document.createElement('tr');
      [t('aiccColExceptionType'), t('comColProviderModel'), t('aiccColKey'), t('aiccColOccurredAt')].forEach((label) => excHeadRow.append(el('th', '', label)));
      excThead.append(excHeadRow);
      excTable.append(excThead);
      const excTbody = document.createElement('tbody');
      reconInternal.exceptions.items.forEach((item) => {
        const tr = document.createElement('tr');
        tr.append(
          el('td', '', item.type), el('td', '', (item.provider || (item.usageProviderModel || {}).provider || '—') + ' / ' + (item.model || (item.usageProviderModel || {}).model || '—')),
          el('td', 'hint', item.key || '—'), el('td', '', fmtDate(item.occurredAt))
        );
        excTbody.append(tr);
      });
      excTable.append(excTbody);
      excTableWrap.append(excTable);
      reconCard.append(excTableWrap);
      const excTotalPages = reconInternal.exceptions.totalPages;
      const excPagination = el('div', 'admin-pagination');
      const excPrev = el('button', 'btn btn-secondary', t('prev'));
      excPrev.type = 'button'; excPrev.disabled = aiCostControlState.reconPage <= 1;
      excPrev.onclick = () => { aiCostControlState.reconPage -= 1; renderTab(); };
      const excNext = el('button', 'btn btn-secondary', t('next'));
      excNext.type = 'button'; excNext.disabled = aiCostControlState.reconPage >= excTotalPages;
      excNext.onclick = () => { aiCostControlState.reconPage += 1; renderTab(); };
      excPagination.append(excPrev, el('span', '', t('pageOf', { page: aiCostControlState.reconPage, total: excTotalPages })), excNext);
      reconCard.append(excPagination);
    }

    reconCard.append(el('h4', '', t('aiccReconExternalTitle')));
    const toleranceField = field(t('aiccToleranceLabel'), 'number', reconExternal.tolerancePercent);
    const toleranceBtn = el('button', 'btn btn-secondary btn-sm', t('aiccToleranceSave'));
    toleranceBtn.type = 'button';
    toleranceBtn.onclick = () => {
      api('/commercial/ai-cost-control/variance-tolerance', { method: 'PATCH', body: JSON.stringify({ percent: Number(toleranceField.input.value) }) })
        .then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
    };
    const toleranceRow = el('div', 'admin-form-row');
    toleranceRow.append(toleranceField.wrap, toleranceBtn);
    reconCard.append(toleranceRow);
    const externalList = document.createElement('ul');
    reconExternal.providers.forEach((row) => {
      const li = document.createElement('li');
      const label = row.provider + ': ';
      if (row.status !== 'ok') { li.textContent = label + t('aiccStatus' + row.status.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')); }
      else {
        li.textContent = label + t('aiccOverviewExternalCost') + ' ' + fmtMicroUsd(row.externalActualCostMicroUsd) + ' vs ' + t('aiccOverviewInternalEstimate') + ' ' + fmtMicroUsd(row.internalEstimateMicroUsd)
          + ' (' + (row.diffPercent == null ? '—' : row.diffPercent.toFixed(1) + '%') + ')' + (row.outOfTolerance ? ' ⚠ ' + t('aiccOutOfTolerance') : '');
      }
      externalList.append(li);
    });
    reconCard.append(externalList);
    wrap.append(reconCard);

    // --- Credentials (encrypted, admin-managed) ---
    const credCard = el('div', 'admin-card admin-card-wide');
    credCard.append(el('h3', '', t('aiccCredentialsTitle')));
    if (!credentialsData.credentials.length) credCard.append(el('p', 'hint', t('comNoRules')));
    credentialsData.credentials.forEach((credential) => {
      const row = el('div', 'admin-btn-row');
      row.append(el('span', '', credential.provider + ' — ' + credential.label + ' (' + credential.keyHint + ')' + (credential.scopeConfig.projectId ? ' · ' + credential.scopeConfig.projectId : '')));
      row.append(el('span', 'badge status-' + (credential.validationStatus === 'valid' ? 'valid' : credential.validationStatus === 'invalid' ? 'invalid' : 'unknown'), credential.validationStatus));
      const testBtn = el('button', 'btn btn-secondary btn-sm', t('aiccTestConnection'));
      testBtn.type = 'button';
      testBtn.onclick = () => {
        testBtn.disabled = true;
        api('/commercial/ai-cost-control/credentials/' + credential.id + '/test-connection', { method: 'POST', body: JSON.stringify({}) })
          .then((result) => showToast(result.ok ? t('aiccTestConnectionSuccess') : t('aiccTestConnectionFailed') + ': ' + result.reason, result.ok ? undefined : 'danger'))
          .catch((error) => showToast(error.message, 'danger'))
          .finally(() => { testBtn.disabled = false; renderTab(); });
      };
      const deleteBtn = el('button', 'btn btn-danger btn-sm', t('aiccDeleteCredential'));
      deleteBtn.type = 'button';
      deleteBtn.onclick = () => {
        if (!window.confirm(t('aiccDeleteCredentialConfirm'))) return;
        api('/commercial/ai-cost-control/credentials/' + credential.id, { method: 'DELETE' }).then(() => renderTab()).catch((error) => showToast(error.message, 'danger'));
      };
      row.append(testBtn, deleteBtn);
      credCard.append(row);
    });
    const addProviderSelect = document.createElement('select');
    listAdaptersProvidersForSelect().forEach((provider) => { const opt = document.createElement('option'); opt.value = provider; opt.textContent = provider; addProviderSelect.append(opt); });
    const addLabelField = field(t('aiccColLabel'), 'text', '');
    const addKeyField = field(t('aiccApiKey'), 'password', '');
    const addProjectField = field(t('aiccProjectId'), 'text', '');
    addKeyField.input.dir = 'ltr';
    addProjectField.input.dir = 'ltr';
    const addCredBtn = el('button', 'btn btn-primary', t('aiccAddCredential'));
    addCredBtn.type = 'button';
    addCredBtn.onclick = () => {
      const apiKey = addKeyField.input.value.trim();
      if (!apiKey) return;
      addKeyField.input.value = ''; // never let the raw key linger in the DOM
      api('/commercial/ai-cost-control/credentials', { method: 'POST', body: JSON.stringify({
        provider: addProviderSelect.value, label: addLabelField.input.value.trim() || undefined,
        apiKey, scopeConfig: { projectId: addProjectField.input.value.trim() }
      }) }).then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
    };
    const addRow = el('div', 'admin-form-row admin-form-row-submit');
    addRow.append(addProviderSelect, addLabelField.wrap, addKeyField.wrap, addProjectField.wrap, addCredBtn);
    credCard.append(el('p', 'hint', t('aiccScopeConfigHint')));
    credCard.append(addRow);
    wrap.append(credCard);

    // --- Manual balance snapshot (explicitly labeled, never used for reconciliation) ---
    const balanceCard = el('div', 'admin-card');
    balanceCard.append(el('h3', '', t('aiccBalanceManualTitle')));
    balanceCard.append(el('p', 'hint', t('aiccBalanceManualLabel')));
    const balProviderSelect = document.createElement('select');
    listAdaptersProvidersForSelect().forEach((provider) => { const opt = document.createElement('option'); opt.value = provider; opt.textContent = provider; balProviderSelect.append(opt); });
    const balAmountField = field(t('aiccBalanceManualAmount'), 'number', '');
    const balNoteField = field(t('aiccBalanceManualNote'), 'text', '');
    const balSaveBtn = el('button', 'btn btn-secondary', t('aiccBalanceManualSave'));
    balSaveBtn.type = 'button';
    balSaveBtn.onclick = () => {
      api('/commercial/ai-cost-control/balance/' + balProviderSelect.value + '/manual-snapshot', { method: 'POST', body: JSON.stringify({ amountUsd: Number(balAmountField.input.value), note: balNoteField.input.value.trim() }) })
        .then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
    };
    const balRow = el('div', 'admin-form-row admin-form-row-submit');
    balRow.append(balProviderSelect, balAmountField.wrap, balNoteField.wrap, balSaveBtn);
    balanceCard.append(balRow);
    wrap.append(balanceCard);

    return wrap;
  });
}

function listAdaptersProvidersForSelect() { return ['openai', 'anthropic', 'gemini', 'kimi', 'deepseek']; }

const COMMERCIAL_SUB_TAB_BUILDERS = {
  plans: commercialPlansSubTab, wallet: commercialWalletSubTab, subscriptions: commercialSubscriptionsSubTab,
  storage: commercialStorageSubTab, transactions: commercialTransactionsSubTab, history: commercialHistorySubTab,
  cryptoPayments: commercialCryptoPaymentsSubTab, aiCostControl: commercialAiCostControlSubTab
};
function commercialTab() {
  const builder = COMMERCIAL_SUB_TAB_BUILDERS[commercialSubTab] || commercialPlansSubTab;
  return builder().then((body) => {
    const wrap = el('div');
    wrap.append(pageHeader('credit-card', 'tabCommercial', 'comPageSubtitle'));
    wrap.append(commercialSubNav(commercialSubTab), body);
    return wrap;
  });
}

// --- Conversation Studio (Journey H2, Gate 2) ---
// Library (list) -> Editor (metadata + per-language trigger/response authoring + version
// history + Trigger Lab) - the commercialTab() list/sub-view precedent above, specialized to one
// level of drill-down (library -> one scenario) rather than a flat set of sibling sub-tabs.

const CONV_STUDIO_LANGUAGES = ['fa', 'en', 'ar', 'es'];
// Mirrors server/admin/routes.conversation-scenarios.mjs's own SAFE_CTA_ACTION_IDS exactly - a
// second, independent declaration (this app has no browser/server shared-module bundling, the
// same "kept in sync by inspection, not a shared module" precedent as SUPPORTED_LANGUAGES in
// routes.voice-providers.mjs) - the real enforcement is server-side either way, this is only
// what populates the dropdown.
const CONV_STUDIO_SAFE_CTA_IDS = ['session.create', 'trade.calculator', 'pattern.create', 'strategy.create', 'navigate.to'];

let conversationStudioSelectedId = null;

function textareaField(label, value, rows) {
  const wrap = el('label', 'field');
  wrap.append(el('span', '', label));
  const textarea = document.createElement('textarea');
  textarea.rows = rows || 3;
  textarea.value = value || '';
  wrap.append(textarea);
  return { wrap, textarea };
}
function linesToList(text) { return String(text || '').split('\n').map((s) => s.trim()).filter(Boolean); }
function linesToGroups(text) { return linesToList(text).map((line) => line.split('|').map((s) => s.trim()).filter(Boolean)).filter((g) => g.length); }
function groupsToLines(groups) { return (groups || []).map((g) => g.join(' | ')).join('\n'); }

// Reuses the existing .badge.status-* convention - .status-published/.status-draft already exist
// (the marketplace listing lifecycle uses the identical three-state shape); archived reuses the
// muted .status-disabled tier rather than inventing a fourth color.
function conversationStudioStatusBadge(status) {
  const tier = status === 'archived' ? 'disabled' : status;
  return el('span', 'badge status-' + tier, t('convStudioStatus' + status.charAt(0).toUpperCase() + status.slice(1)));
}

function conversationStudioLibrary() {
  return api('/conversation-scenarios').then((data) => {
    const wrap = el('div');
    wrap.append(pageHeader('message-square-text', 'convStudioTitle', 'convStudioHint'));
    const scenarios = data.scenarios || [];
    wrap.append(statRow([
      statCard('layers', String(scenarios.length), t('convStudioStatTotal')),
      statCard('badge-check', String(scenarios.filter((s) => s.status === 'published').length), t('convStudioStatPublished')),
      statCard('pencil', String(scenarios.filter((s) => s.status === 'draft').length), t('convStudioStatDraft'))
    ]));

    const createCard = el('div', 'admin-card');
    createCard.append(el('h3', '', t('convStudioCreateTitle')));
    const keyField = field(t('convStudioScenarioKey'), 'text', '');
    const domainField = field(t('convStudioDomain'), 'text', '');
    const kindField = selectField(t('convStudioKind'), [
      { value: 'faq', text: t('convStudioKindFaq') }, { value: 'data_query', text: t('convStudioKindDataQuery') }, { value: 'surface_help', text: t('convStudioKindSurfaceHelp') }
    ], 'faq');
    const createBtn = el('button', 'btn btn-primary', t('convStudioCreate'));
    createBtn.type = 'button';
    createBtn.onclick = () => {
      const scenarioKey = keyField.input.value.trim();
      if (!scenarioKey) { showToast(t('convStudioKeyRequired'), 'danger'); return; }
      api('/conversation-scenarios', {
        method: 'POST',
        body: JSON.stringify({ scenarioKey, domain: domainField.input.value.trim() || null, kind: kindField.select.value, definition: { languages: {}, responses: {} } })
      }).then((scenario) => { conversationStudioSelectedId = scenario.id; renderTab(); })
        .catch((error) => showToast(error.message, 'danger'));
    };
    createCard.append(keyField.wrap, domainField.wrap, kindField.wrap, createBtn);
    wrap.append(createCard);

    const tableWrap = el('div', 'admin-table-wrap');
    const table = el('table', 'admin-table');
    const head = el('tr');
    [t('convStudioColKey'), t('convStudioColDomain'), t('convStudioColKind'), t('convStudioColStatus'), t('convStudioColVersion'), t('convStudioColLanguages'), t('convStudioColUpdated')].forEach((label) => head.append(el('th', '', label)));
    table.append(head);
    scenarios.forEach((scenario) => {
      const row = el('tr');
      row.style.cursor = 'pointer';
      row.onclick = () => { conversationStudioSelectedId = scenario.id; renderTab(); };
      row.append(el('td', '', scenario.scenarioKey), el('td', '', scenario.domain || '—'), el('td', '', scenario.kind));
      const statusCell = el('td'); statusCell.append(conversationStudioStatusBadge(scenario.status));
      row.append(statusCell);
      row.append(el('td', '', scenario.publishedVersion ? 'v' + scenario.publishedVersion : '—'));
      // Plain text coverage summary ("FA ✓ · EN ✓ · AR – · ES –") rather than a
      // new colored-dot component - this is the one place in the whole tab that would have
      // needed genuinely new CSS just for this, and a professional-but-plain admin table row is
      // a reasonable trade against that for this gate.
      const coverageText = CONV_STUDIO_LANGUAGES.map((lang) => {
        const state = (scenario.languages || {})[lang] || 'none';
        return lang.toUpperCase() + ' ' + (state === 'complete' ? '✓' : state === 'partial' ? '±' : '–');
      }).join(' · ');
      row.append(el('td', '', coverageText));
      row.append(el('td', '', fmtDate(scenario.updatedAt)));
      table.append(row);
    });
    tableWrap.append(table);
    wrap.append(tableWrap);
    return wrap;
  });
}

// Journey H2 expressive-dialogue/context follow-up: a small, curated "known surface" list for the
// Context section's Surface selector - the same free-text convention `surfaceBoost` already uses
// elsewhere in this file, just offered as a picklist here since the UI asks for "choose supported
// page/process" (spec section 19), not a free-text field.
const CONV_STUDIO_KNOWN_SURFACES = ['sessions', 'strategies', 'dashboard', 'psychology', 'ai-assistant', 'community', 'account', 'settings'];

// One response block - used for both the STANDARD response and each authored context variant, so
// there is exactly one implementation of "written / spoken / expressive voice + Enhance Delivery"
// rather than two near-duplicates. `variantKey` is 'standard' for the STANDARD block (matching the
// server's own default), or the variant's own admin-chosen key otherwise - both are passed through
// unchanged to the Enhance Delivery call so the server resolves the exact right stored dialogue.
function conversationStudioResponseFields(scenarioId, versionId, lang, variantKey, response) {
  const writtenField = textareaField(t('convStudioWrittenResponse'), response.written, 3);
  const voiceField = textareaField(t('convStudioVoiceResponse'), response.voiceReply, 2);
  const performanceField = textareaField(t('convStudioExpressiveVoice'), response.performanceText || '', 2);
  const deliveryNoteField = field(t('convStudioDeliveryNote'), 'text', '');
  deliveryNoteField.input.placeholder = t('convStudioDeliveryNotePlaceholder');
  const statusLine = el('p', 'hint', '');
  const enhanceBtn = el('button', 'btn btn-secondary btn-sm', t('convStudioEnhanceDelivery'));
  enhanceBtn.type = 'button';
  enhanceBtn.onclick = () => {
    enhanceBtn.disabled = true;
    const originalLabel = enhanceBtn.textContent;
    enhanceBtn.textContent = t('convStudioEnhancing');
    api('/conversation-scenarios/' + scenarioId + '/versions/' + versionId + '/enhance-delivery', {
      method: 'POST',
      body: JSON.stringify({ language: lang, variantKey, deliveryNote: deliveryNoteField.input.value.trim() || null })
    }).then((result) => {
      performanceField.textarea.value = result.performanceText;
      statusLine.textContent = result.valid ? t('convStudioPerformanceValid') : t('convStudioPerformanceInvalid') + result.reason;
      statusLine.className = result.valid ? 'hint' : 'hint error-text';
    }).catch((error) => showToast(error.message, 'danger'))
      .finally(() => { enhanceBtn.disabled = false; enhanceBtn.textContent = originalLabel; });
  };
  const wrap = el('div');
  wrap.append(writtenField.wrap, voiceField.wrap, performanceField.wrap, deliveryNoteField.wrap, enhanceBtn, statusLine);
  return {
    wrap,
    read: () => ({
      written: writtenField.textarea.value.trim(),
      voiceReply: voiceField.textarea.value.trim() || writtenField.textarea.value.trim(),
      performanceText: performanceField.textarea.value.trim() || null
    })
  };
}

// Compact Context controls (spec section 19) - Exposure (Any/First time/Nth time or later
// [threshold]) and Surface (Any/<known page>). Deliberately the only two axes exposed in the UI -
// the schema also supports processId/step, left schema-only this pass (no rule builder).
function conversationStudioContextFields(context) {
  const exposure = (context && context.exposure) || { type: 'ANY' };
  const surface = (context && context.surface) || {};
  const wrap = el('div', 'admin-card');
  wrap.append(el('h5', '', t('convStudioContext')));
  const exposureSelect = selectField(t('convStudioExposure'), [
    { value: 'ANY', text: t('convStudioExposureAny') },
    { value: 'FIRST_TIME', text: t('convStudioExposureFirstTime') },
    { value: 'NTH_OR_LATER', text: t('convStudioExposureNthOrLater') }
  ], exposure.type || 'ANY');
  const thresholdField = field(t('convStudioExposureThreshold'), 'number', exposure.threshold || 3);
  thresholdField.wrap.hidden = exposureSelect.select.value !== 'NTH_OR_LATER';
  exposureSelect.select.onchange = () => { thresholdField.wrap.hidden = exposureSelect.select.value !== 'NTH_OR_LATER'; };
  const surfaceSelect = selectField(t('convStudioSurface'),
    [{ value: '', text: t('convStudioSurfaceAny') }].concat(CONV_STUDIO_KNOWN_SURFACES.map((page) => ({ value: page, text: page }))),
    surface.page || '');
  wrap.append(exposureSelect.wrap, thresholdField.wrap, surfaceSelect.wrap);
  return {
    wrap,
    read: () => {
      const result = { exposure: { type: exposureSelect.select.value } };
      if (exposureSelect.select.value === 'NTH_OR_LATER') result.exposure.threshold = Number(thresholdField.input.value) || 3;
      if (surfaceSelect.select.value) result.surface = { page: surfaceSelect.select.value };
      return result;
    }
  };
}

function conversationStudioLanguageSection(lang, definition, scenarioId, versionId) {
  const section = el('div', 'admin-card');
  section.append(el('h4', '', lang.toUpperCase()));
  const rule = (definition.languages && definition.languages[lang]) || { groups: [], strong: [], negative: [] };
  const response = (definition.responses && definition.responses[lang]) || { written: '', voiceReply: '' };
  const groupsField = textareaField(t('convStudioGroups'), groupsToLines(rule.groups), 3);
  const strongField = textareaField(t('convStudioStrong'), (rule.strong || []).join('\n'), 2);
  const negativeField = textareaField(t('convStudioNegative'), (rule.negative || []).join('\n'), 2);
  section.append(groupsField.wrap, strongField.wrap, negativeField.wrap);
  const standardFields = conversationStudioResponseFields(scenarioId, versionId, lang, 'standard', response);
  section.append(standardFields.wrap);

  // Journey H2 expressive/context follow-up: a small, repeatable list of context variants for
  // this language - each is its own independent response block (never copied from STANDARD or
  // from each other) plus a compact Context section. Absent/empty = today's exact behavior.
  section.append(el('h5', '', t('convStudioVariants')));
  const variantsContainer = el('div');
  section.append(variantsContainer);
  const variantRows = [];
  function addVariantRow(initial) {
    const data = initial || { key: '', context: {}, written: '', voiceReply: '', performanceText: '' };
    const row = el('div', 'admin-card');
    const keyField = field(t('convStudioVariantKey'), 'text', data.key || '');
    row.append(keyField.wrap);
    const fields = conversationStudioResponseFields(scenarioId, versionId, lang, data.key || 'draft-variant', data);
    row.append(fields.wrap);
    const contextFields = conversationStudioContextFields(data.context);
    row.append(contextFields.wrap);
    const removeBtn = el('button', 'btn btn-secondary btn-sm', t('convStudioRemoveVariant'));
    removeBtn.type = 'button';
    removeBtn.onclick = () => { variantsContainer.removeChild(row); variantRows.splice(variantRows.indexOf(entry), 1); };
    row.append(removeBtn);
    variantsContainer.append(row);
    const entry = { keyField, read: () => Object.assign({ key: keyField.input.value.trim() }, fields.read(), { context: contextFields.read() }) };
    variantRows.push(entry);
  }
  ((definition.variants && definition.variants[lang]) || []).forEach((variant) => addVariantRow(variant));
  const addVariantBtn = el('button', 'btn btn-secondary btn-sm', t('convStudioAddVariant'));
  addVariantBtn.type = 'button';
  addVariantBtn.onclick = () => addVariantRow(null);
  section.append(addVariantBtn);

  return {
    node: section,
    read: () => ({
      rule: { groups: linesToGroups(groupsField.textarea.value), strong: linesToList(strongField.textarea.value), negative: linesToList(negativeField.textarea.value) },
      response: standardFields.read(),
      variants: variantRows.map((v) => v.read()).filter((v) => v.key && v.written)
    })
  };
}

function conversationStudioVersionHistory(scenario) {
  const card = el('div', 'admin-card');
  card.append(el('h3', '', t('convStudioVersionHistory')));
  const tableWrap = el('div', 'admin-table-wrap');
  const table = el('table', 'admin-table');
  const head = el('tr');
  [t('convStudioColVersion'), t('convStudioColStatus'), t('convStudioColPublishedAt'), ''].forEach((label) => head.append(el('th', '', label)));
  table.append(head);
  (scenario.versions || []).sort((a, b) => b.versionNumber - a.versionNumber).forEach((version) => {
    const row = el('tr');
    row.append(el('td', '', 'v' + version.versionNumber));
    const statusCell = el('td'); statusCell.append(conversationStudioStatusBadge(version.status));
    row.append(statusCell);
    row.append(el('td', '', fmtDate(version.publishedAt)));
    const actionsCell = el('td');
    if (version.status === 'archived' || (version.status === 'published' && scenario.publishedVersionId !== version.id)) {
      const rollbackBtn = el('button', 'btn btn-secondary btn-sm', t('convStudioRollback'));
      rollbackBtn.type = 'button';
      rollbackBtn.onclick = () => {
        if (!window.confirm(t('convStudioRollbackConfirm'))) return;
        api('/conversation-scenarios/' + scenario.id + '/rollback', { method: 'POST', body: JSON.stringify({ targetVersionId: version.id }) })
          .then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
      };
      actionsCell.append(rollbackBtn);
    }
    row.append(actionsCell);
    table.append(row);
  });
  tableWrap.append(table);
  card.append(tableWrap);
  return card;
}

// --- Journey H2, Gate 3: Conversation Studio voice asset pipeline (per-language Generate/Play/
// Approve/Archive UI for pre-generated, admin-approved audio). Reuses the exact same voice-
// provider credential/voice/model selection endpoints the Voice Providers tab's own character
// cards already use (api('/voice-providers/voices|models?credentialId=...')) - no new selection
// mechanism is invented here.

// One language's row: shows the spoken text this audio would be generated from (the exact same
// voiceReply-falls-back-to-written rule the server's own spokenTextFor() uses - see
// server/community/conversation-audio-identity.mjs; this is a display-only echo of that rule, the
// server always recomputes it independently and never trusts anything this panel sends as text),
// the current approved asset (if any, with its own stale flag - spec section 20/51/52) and the
// latest not-yet-approved preview (if any), plus the Generate form.
// Journey H2 expressive/context follow-up: `response` is already the resolved response set for
// this exact (language, variantKey) - the STANDARD responses[lang] object, or one authored
// variant - never re-derived from the whole definition here, so this function stays agnostic to
// where the caller (conversationStudioAudioPanel) got it from.
function conversationStudioAudioLanguageRow(scenarioId, versionId, lang, variantKey, response, assets, credentials) {
  const spokenText = String(response.voiceReply || response.written || '').trim();
  const row = el('div', 'admin-card');
  row.append(el('h4', '', lang.toUpperCase() + (variantKey !== 'standard' ? ' · ' + variantKey : '')));
  if (!spokenText) { row.append(el('p', 'hint', t('convStudioAudioNoText'))); return row; }
  row.append(el('p', 'hint', spokenText));
  if (response.performanceText) row.append(el('p', 'hint', t('convStudioExpressiveVoice') + ': ' + response.performanceText));

  const languageAssets = assets.filter((a) => a.language === lang && a.variantKey === variantKey);
  const approved = languageAssets.find((a) => a.status === 'approved');
  const latestPreview = languageAssets
    .filter((a) => a.status === 'preview')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  if (!approved && !latestPreview) row.append(el('p', 'hint', t('convStudioAudioNoneYet')));

  if (approved) {
    const statusText = t('convStudioAudioApproved') + (approved.isStale ? ' · ' + t('convStudioAudioStale') : '');
    row.append(el('p', approved.isStale ? 'error-text' : '', statusText));
    const audio = document.createElement('audio');
    audio.controls = true; audio.src = approved.fileUrl; audio.className = 'admin-voice-test-audio';
    row.append(audio);
    const archiveBtn = el('button', 'btn btn-secondary btn-sm', t('convStudioAudioArchive'));
    archiveBtn.type = 'button';
    archiveBtn.onclick = () => {
      archiveBtn.disabled = true;
      api('/conversation-scenarios/' + scenarioId + '/audio/' + approved.id + '/archive', { method: 'POST' })
        .then(() => { showToast(t('saved')); renderTab(); })
        .catch((error) => { showToast(error.message, 'danger'); archiveBtn.disabled = false; });
    };
    row.append(archiveBtn);
  }

  if (latestPreview) {
    row.append(el('p', '', t('convStudioAudioPreview')));
    const audio = document.createElement('audio');
    audio.controls = true; audio.src = latestPreview.fileUrl; audio.className = 'admin-voice-test-audio';
    row.append(audio);
    const previewBtnRow = el('div', 'admin-btn-row');
    const approveBtn = el('button', 'btn btn-primary btn-sm', t('convStudioAudioApprove'));
    approveBtn.type = 'button';
    approveBtn.onclick = () => {
      approveBtn.disabled = true;
      api('/conversation-scenarios/' + scenarioId + '/audio/' + latestPreview.id + '/approve', { method: 'POST' })
        .then(() => { showToast(t('saved')); renderTab(); })
        .catch((error) => {
          showToast(error.status === 409 ? t('convStudioAudioStaleBlocked') : error.message, 'danger');
          approveBtn.disabled = false;
        });
    };
    const discardBtn = el('button', 'btn btn-secondary btn-sm', t('convStudioAudioArchive'));
    discardBtn.type = 'button';
    discardBtn.onclick = () => {
      discardBtn.disabled = true;
      api('/conversation-scenarios/' + scenarioId + '/audio/' + latestPreview.id + '/archive', { method: 'POST' })
        .then(() => { showToast(t('saved')); renderTab(); })
        .catch((error) => { showToast(error.message, 'danger'); discardBtn.disabled = false; });
    };
    previewBtnRow.append(approveBtn, discardBtn);
    row.append(previewBtnRow);
  }

  // Generate form - credential/voiceId/modelId selection mirrors the Voice Providers tab's own
  // character card (conversationStudioLanguageSection's sibling in that tab) exactly: a searchable
  // datalist populated via an explicit "Load voices" click (never fetched automatically), plus a
  // free-text voiceId input so a known id can always be typed directly.
  const credentialSelect = selectField(t('vpCredentialSelect'),
    [{ value: '', text: t('vpNoCredentialSelected') }].concat(credentials.map((c) => ({ value: c.id, text: c.label }))), '');
  const voiceIdField = field(t('vpVoiceId'), 'text', '');
  const voiceDatalist = document.createElement('datalist');
  const datalistId = 'conv-audio-voices-' + scenarioId + '-' + versionId + '-' + lang + '-' + variantKey;
  voiceDatalist.id = datalistId;
  voiceIdField.input.setAttribute('list', datalistId);
  voiceIdField.wrap.append(voiceDatalist);
  const loadVoicesBtn = el('button', 'btn btn-secondary btn-sm', t('vpLoadVoices'));
  loadVoicesBtn.type = 'button';
  loadVoicesBtn.onclick = () => {
    if (!credentialSelect.select.value) { showToast(t('vpNoCredentialSelected'), 'danger'); return; }
    loadVoicesBtn.disabled = true;
    api('/voice-providers/voices?credentialId=' + encodeURIComponent(credentialSelect.select.value))
      .then((voices) => {
        voiceDatalist.innerHTML = '';
        voices.forEach((voice) => {
          const opt = document.createElement('option');
          opt.value = voice.voiceId; opt.label = voice.name;
          voiceDatalist.append(opt);
        });
      })
      .catch((error) => showToast(error.message, 'danger'))
      .finally(() => { loadVoicesBtn.disabled = false; });
  };
  const modelSelect = selectField(t('vpModelSelect'), [{ value: '', text: '—' }], '');
  const loadModelsBtn = el('button', 'btn btn-secondary btn-sm', t('vpLoadModels'));
  loadModelsBtn.type = 'button';
  loadModelsBtn.onclick = () => {
    if (!credentialSelect.select.value) { showToast(t('vpNoCredentialSelected'), 'danger'); return; }
    loadModelsBtn.disabled = true;
    api('/voice-providers/models?credentialId=' + encodeURIComponent(credentialSelect.select.value))
      .then((models) => {
        modelSelect.select.innerHTML = '';
        models.forEach((model) => {
          const opt = document.createElement('option');
          opt.value = model.modelId; opt.textContent = model.name;
          modelSelect.select.append(opt);
        });
      })
      .catch((error) => showToast(error.message, 'danger'))
      .finally(() => { loadModelsBtn.disabled = false; });
  };
  // Organizational/diagnostic label only (spec section 41's lighter-weight posture - see the
  // Gate 3 plan's own "no Voice Profile registry table this gate" note); the real provider call
  // always takes the explicit credentialId/voiceId/modelId above, never this label.
  const voiceProfileKeyField = field(t('convStudioAudioVoiceProfileKey'), 'text', lang + (variantKey !== 'standard' ? '_' + variantKey : '') + '_default');
  const generateBtn = el('button', 'btn btn-primary btn-sm', t('convStudioAudioGenerate'));
  generateBtn.type = 'button';
  generateBtn.onclick = () => {
    const credentialId = credentialSelect.select.value;
    const voiceId = voiceIdField.input.value.trim();
    if (!credentialId || !voiceId) { showToast(t('vpValidateFirst'), 'danger'); return; }
    generateBtn.disabled = true;
    const originalLabel = generateBtn.textContent;
    generateBtn.textContent = t('convStudioAudioGenerating');
    api('/conversation-scenarios/' + scenarioId + '/versions/' + versionId + '/audio', {
      method: 'POST',
      body: JSON.stringify({
        language: lang, variantKey, credentialId, voiceId, modelId: modelSelect.select.value || null,
        voiceProfileKey: voiceProfileKeyField.input.value.trim() || (lang + '_default')
      })
    }).then((asset) => {
      showToast(asset.usedFallbackText ? t('saved') + ' · ' + t('convStudioAudioUsedWrittenFallback') : t('saved'));
      renderTab();
    })
      .catch((error) => showToast(error.message, 'danger'))
      .finally(() => { generateBtn.disabled = false; generateBtn.textContent = originalLabel; });
  };
  const generateRow = el('div', 'admin-btn-row');
  generateRow.append(credentialSelect.wrap, voiceIdField.wrap, loadVoicesBtn, modelSelect.wrap, loadModelsBtn, voiceProfileKeyField.wrap, generateBtn);
  row.append(generateRow);

  return row;
}

// One version's whole audio panel (called once for the published version and, separately, once
// for the draft, when each exists - see conversationStudioEditor). `data_query` scenarios are
// structurally never audio-eligible (spec section 4/37/38, enforced server-side too at the
// generation endpoint itself) - this renders a plain explanation and makes zero network calls
// rather than a panel full of buttons that would only ever 400.
function conversationStudioAudioPanel(scenario, version, label) {
  const card = el('div', 'admin-card');
  card.append(el('h3', '', t('convStudioAudioTitle') + ' - ' + label));
  if (scenario.kind === 'data_query') {
    card.append(el('p', 'hint', t('convStudioAudioNotEligible')));
    return Promise.resolve(card);
  }
  return Promise.all([
    api('/conversation-scenarios/' + scenario.id + '/versions/' + version.id + '/audio'),
    api('/voice-providers/credentials').catch(() => [])
  ]).then(([audioData, credentials]) => {
    CONV_STUDIO_LANGUAGES.forEach((lang) => {
      const response = (version.definition.responses && version.definition.responses[lang]) || {};
      card.append(conversationStudioAudioLanguageRow(scenario.id, version.id, lang, 'standard', response, audioData.assets || [], credentials));
      // Journey H2 expressive/context follow-up: one more row per authored context variant for
      // this language - each is its own independent (scenario_version_id, language, variantKey)
      // audio identity, never conflated with STANDARD's.
      ((version.definition.variants && version.definition.variants[lang]) || []).forEach((variant) => {
        if (!variant || !variant.key) return;
        card.append(conversationStudioAudioLanguageRow(scenario.id, version.id, lang, variant.key, variant, audioData.assets || [], credentials));
      });
    });
    return card;
  });
}

function conversationStudioTriggerLab(scenarioId) {
  const card = el('div', 'admin-card');
  card.append(el('h3', '', t('convStudioTriggerLab')), el('p', 'hint', t('convStudioTriggerLabHint')));
  const textField = field(t('convStudioTestUtterance'), 'text', '');
  const runBtn = el('button', 'btn btn-secondary', t('convStudioRunTest'));
  runBtn.type = 'button';
  const resultBox = el('div');
  runBtn.onclick = () => {
    api('/conversation-scenarios/' + scenarioId + '/test', { method: 'POST', body: JSON.stringify({ text: textField.input.value }) })
      .then((result) => {
        resultBox.replaceChildren();
        resultBox.append(el('p', '', t('convStudioResolution') + ': ' + result.resolution + ' (' + result.confidenceBand + ', margin ' + result.scoreMargin + ')'));
        const tableWrap = el('div', 'admin-table-wrap');
        const table = el('table', 'admin-table');
        const head = el('tr'); [t('convStudioColKey'), t('convStudioScore'), t('convStudioReasons')].forEach((label) => head.append(el('th', '', label)));
        table.append(head);
        result.candidates.forEach((c) => {
          const row = el('tr');
          row.append(el('td', '', c.scenarioKey), el('td', '', String(c.score)), el('td', '', (c.reasons || []).join(', ')));
          table.append(row);
        });
        tableWrap.append(table);
        resultBox.append(tableWrap);
      }).catch((error) => showToast(error.message, 'danger'));
  };
  const batchBtn = el('button', 'btn btn-secondary', t('convStudioRunBatch'));
  batchBtn.type = 'button';
  const batchResultBox = el('div');
  batchBtn.onclick = () => {
    api('/conversation-scenarios/' + scenarioId + '/test-batch', { method: 'POST' }).then((result) => {
      batchResultBox.replaceChildren(el('p', '', t('convStudioPositiveRate') + ': ' + (result.positivePassRate === null ? '—' : Math.round(result.positivePassRate * 100) + '%') +
        ' · ' + t('convStudioNegativeRate') + ': ' + (result.negativeRejectionRate === null ? '—' : Math.round(result.negativeRejectionRate * 100) + '%')));
    }).catch((error) => showToast(error.message, 'danger'));
  };
  const collisionBtn = el('button', 'btn btn-secondary', t('convStudioCheckCollisions'));
  collisionBtn.type = 'button';
  const collisionBox = el('div');
  collisionBtn.onclick = () => {
    api('/conversation-scenarios/' + scenarioId + '/collisions').then((result) => {
      collisionBox.replaceChildren();
      if (!result.collisions.length) { collisionBox.append(el('p', 'hint', t('convStudioNoCollisions'))); return; }
      result.collisions.forEach((collision) => {
        collisionBox.append(el('p', 'error-text', '"' + collision.text + '" -> ' + collision.otherScenarioKey + ' (' + collision.severity + ', ' + collision.myScore + ' vs ' + collision.otherScore + ')'));
      });
    }).catch((error) => showToast(error.message, 'danger'));
  };
  const btnRow = el('div', 'admin-btn-row');
  btnRow.append(runBtn, batchBtn, collisionBtn);
  card.append(textField.wrap, btnRow, resultBox, batchResultBox, collisionBox);
  return card;
}

function conversationStudioEditor(id) {
  return api('/conversation-scenarios/' + id).then((scenario) => {
    const wrap = el('div');
    const backBtn = el('button', 'btn btn-secondary btn-sm', t('convStudioBackToLibrary'));
    backBtn.type = 'button';
    backBtn.onclick = () => { conversationStudioSelectedId = null; renderTab(); };
    wrap.append(backBtn);

    const header = el('div', 'admin-card');
    header.append(el('h2', '', scenario.scenarioKey));
    const metaLine = el('p', 'hint', scenario.domain + ' · ' + scenario.kind + (scenario.dataQueryRef ? ' · ' + scenario.dataQueryRef : ''));
    header.append(metaLine);
    const statusRow = el('div', 'admin-btn-row');
    statusRow.append(conversationStudioStatusBadge(scenario.archivedAt ? 'archived' : scenario.publishedVersionId ? 'published' : 'draft'));
    const archiveBtn = el('button', 'btn btn-secondary btn-sm', scenario.archivedAt ? t('convStudioUnarchive') : t('convStudioArchive'));
    archiveBtn.type = 'button';
    archiveBtn.onclick = () => {
      api('/conversation-scenarios/' + id + '/' + (scenario.archivedAt ? 'unarchive' : 'archive'), { method: 'POST' })
        .then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
    };
    statusRow.append(archiveBtn);
    if (scenario.publishedVersionId && !scenario.draftVersionId) {
      const revisionBtn = el('button', 'btn btn-secondary btn-sm', t('convStudioNewRevision'));
      revisionBtn.type = 'button';
      revisionBtn.onclick = () => api('/conversation-scenarios/' + id + '/revision', { method: 'POST' }).then(() => renderTab()).catch((error) => showToast(error.message, 'danger'));
      statusRow.append(revisionBtn);
    }
    header.append(statusRow);
    wrap.append(header);

    if (!scenario.draftVersion) {
      wrap.append(el('p', 'hint', t('convStudioNoDraft')));
      if (!scenario.publishedVersion) { wrap.append(conversationStudioVersionHistory(scenario)); return wrap; }
      return conversationStudioAudioPanel(scenario, scenario.publishedVersion, 'v' + scenario.publishedVersion.versionNumber + ' (' + t('convStudioStatusPublished') + ')')
        .then((panel) => { wrap.append(panel); wrap.append(conversationStudioVersionHistory(scenario)); return wrap; });
    }

    const editorCard = el('div', 'admin-card');
    editorCard.append(el('h3', '', t('convStudioEditingDraft') + ' v' + scenario.draftVersion.versionNumber));
    const ctaOptions = [{ value: '', text: t('convStudioCtaNone') }].concat(CONV_STUDIO_SAFE_CTA_IDS.map((id2) => ({ value: id2, text: id2 })));
    const ctaField = selectField(t('convStudioCta'), ctaOptions, scenario.ctaActionId || '');
    editorCard.append(ctaField.wrap);
    const corpusPositiveField = textareaField(t('convStudioCorpusPositive'), ((scenario.draftVersion.definition.testCorpus || {}).positive || []).join('\n'), 2);
    const corpusNegativeField = textareaField(t('convStudioCorpusNegative'), ((scenario.draftVersion.definition.testCorpus || {}).negative || []).join('\n'), 2);
    editorCard.append(corpusPositiveField.wrap, corpusNegativeField.wrap);

    const languageSections = {};
    CONV_STUDIO_LANGUAGES.forEach((lang) => {
      const section = conversationStudioLanguageSection(lang, scenario.draftVersion.definition, id, scenario.draftVersionId);
      languageSections[lang] = section;
      editorCard.append(section.node);
    });

    const saveBtn = el('button', 'btn btn-primary', t('convStudioSaveDraft'));
    saveBtn.type = 'button';
    saveBtn.onclick = () => {
      const languages = {}; const responses = {}; const variants = {};
      CONV_STUDIO_LANGUAGES.forEach((lang) => {
        const read = languageSections[lang].read();
        languages[lang] = read.rule; responses[lang] = read.response;
        if (read.variants.length) variants[lang] = read.variants;
      });
      const patch = {
        languages, responses, variants,
        testCorpus: { positive: linesToList(corpusPositiveField.textarea.value), negative: linesToList(corpusNegativeField.textarea.value) }
      };
      Promise.all([
        api('/conversation-scenarios/' + id + '/draft', { method: 'PATCH', body: JSON.stringify(patch) }),
        ctaField.select.value !== (scenario.ctaActionId || '') ? api('/conversation-scenarios/' + id, { method: 'PATCH', body: JSON.stringify({ ctaActionId: ctaField.select.value || null }) }).catch(() => {}) : Promise.resolve()
      ]).then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
    };
    const publishBtn = el('button', 'btn btn-primary', t('convStudioPublish'));
    publishBtn.type = 'button';
    publishBtn.onclick = () => {
      api('/conversation-scenarios/' + id + '/publish', { method: 'POST', body: JSON.stringify({ versionId: scenario.draftVersionId }) })
        .then(() => { showToast(t('convStudioPublished')); renderTab(); })
        .catch((error) => {
          if (error.status === 422) { showToast(t('convStudioPublishBlocked') + ': ' + JSON.stringify(error.body && error.body.errors), 'danger'); }
          else showToast(error.message, 'danger');
        });
    };
    const editorBtnRow = el('div', 'admin-btn-row');
    editorBtnRow.append(saveBtn, publishBtn);
    editorCard.append(editorBtnRow);
    wrap.append(editorCard);

    wrap.append(conversationStudioTriggerLab(id));

    // Journey H2, Gate 3: audio for the PUBLISHED version (what real Voice users actually hear
    // today, when one exists) and for the DRAFT version (so an admin can prepare ahead of the
    // next publish) are shown as two separate panels - never conflated, since they are two
    // different scenario_version_id rows with independent content hashes/staleness.
    const audioPanels = [];
    if (scenario.publishedVersion) {
      audioPanels.push(conversationStudioAudioPanel(scenario, scenario.publishedVersion, 'v' + scenario.publishedVersion.versionNumber + ' (' + t('convStudioStatusPublished') + ')'));
    }
    audioPanels.push(conversationStudioAudioPanel(scenario, scenario.draftVersion, 'v' + scenario.draftVersion.versionNumber + ' (' + t('convStudioStatusDraft') + ')'));
    return Promise.all(audioPanels).then((panels) => {
      panels.forEach((panel) => wrap.append(panel));
      wrap.append(conversationStudioVersionHistory(scenario));
      return wrap;
    });
  });
}

function conversationStudioTab() {
  return conversationStudioSelectedId ? conversationStudioEditor(conversationStudioSelectedId) : conversationStudioLibrary();
}

const tabBuilders = { users: usersTab, ai: aiTab, technical: technicalTab, xp: xpTab, marketplace: marketplaceTab, financial: financialTab, commercial: commercialTab, conversationStudio: conversationStudioTab };

function route() {
  const match = location.hash.match(/^#\/admin\/(users|ai|technical|xp|marketplace|financial|commercial|conversationStudio)$/);
  return match ? match[1] : 'users';
}

function renderTab() {
  const tab = route();
  document.querySelectorAll('#adminTabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelector('#pageTitle').textContent = t('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
  const body = document.querySelector('#adminBody');
  body.replaceChildren(el('p', 'hint', t('loading')));
  tabBuilders[tab]().then((node) => { body.replaceChildren(node); icons(body); }).catch((error) => { body.replaceChildren(errorNode(error, renderTab)); });
}
function rerenderCurrentTab() { if (!document.querySelector('#adminLayout').hidden) renderTab(); }

document.querySelectorAll('#adminTabs button').forEach((button) => button.addEventListener('click', () => {
  location.hash = '#/admin/' + button.dataset.tab;
  // On the mobile overlay drawer, picking a tab should close the sidebar back down.
  document.querySelector('#adminLayout').classList.remove('sidebar-open');
}));
window.addEventListener('hashchange', () => { if (location.hash.indexOf('#/admin') === 0) renderTab(); });

const SIDEBAR_COLLAPSE_KEY = 'tradejournal:admin-sidebar-collapsed';
const sidebarToggle = document.querySelector('#sidebarToggle');
sidebarToggle.addEventListener('click', () => {
  const layout = document.querySelector('#adminLayout');
  if (window.innerWidth <= 880) { layout.classList.toggle('sidebar-open'); return; }
  const collapsed = layout.classList.toggle('collapsed');
  try { localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0'); } catch (_) { /* no-op if storage is unavailable */ }
});
document.addEventListener('click', (event) => {
  const layout = document.querySelector('#adminLayout');
  if (window.innerWidth <= 880 && layout.classList.contains('sidebar-open') && !event.target.closest('#adminSidebar') && !event.target.closest('#sidebarToggle')) layout.classList.remove('sidebar-open');
});

function loadCurrentUserLabel() {
  fetch('/api/users/me', { headers: switcher && switcher.currentUserId() ? { 'x-dev-user-id': switcher.currentUserId() } : {} })
    .then((r) => (r.ok ? r.json() : null))
    .then((user) => {
      if (!user) return;
      const label = document.querySelector('#currentUserLabel');
      document.querySelector('#currentUserName').textContent = user.displayName;
      label.hidden = false;
    })
    .catch(() => {}); // best-effort - the topbar label is a courtesy, never blocks the panel
}

function startApp() {
  document.querySelector('#adminGate').hidden = true;
  const layout = document.querySelector('#adminLayout');
  layout.hidden = false;
  try { if (localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1') layout.classList.add('collapsed'); } catch (_) { /* no-op */ }
  loadCurrentUserLabel();
  icons(document);
  if (!/^#\/admin\/(users|ai|technical|xp|marketplace|financial|commercial|conversationStudio)$/.test(location.hash)) location.hash = '#/admin/users';
  else renderTab();
}

// Real email/password login only - the old "TEST MODE: continue as any dev-user" bypass is
// gone entirely, not just hidden behind a flag. Every visitor must authenticate with real
// credentials, and only an account with role='admin' is let past the gate; the server's own
// requireAdmin (server/admin/auth-admin.mjs) is the actual security boundary this defends
// nothing without - see the ADMIN_AUTH_ENFORCED warning below, which exists specifically to
// catch the case where this client-side check is the only thing stopping a non-admin, because
// the server hasn't been told to enforce roles yet.
let adminAuthEnforced = null;

function gateElements() {
  return {
    email: document.querySelector('#gateEmail'), password: document.querySelector('#gatePassword'),
    error: document.querySelector('#gateError'), submit: document.querySelector('#gateSubmit')
  };
}

function submitGateLogin() {
  const { email, password, error, submit } = gateElements();
  error.hidden = true;
  submit.disabled = true;
  (switcher ? switcher.login({ email: email.value.trim(), password: password.value }) : Promise.reject(new Error('NO_SWITCHER')))
    .then((user) => {
      if (user.role !== 'admin') {
        switcher.logout();
        const notAdmin = new Error('NOT_ADMIN'); notAdmin.code = 'NOT_ADMIN';
        throw notAdmin;
      }
      startApp();
      if (adminAuthEnforced === false) showToast(t('enforcementWarning'), 'danger');
    })
    .catch((err) => { error.textContent = describeGateError(err); error.hidden = false; })
    .finally(() => { submit.disabled = false; });
}

function boot() {
  applyLanguage(activeLanguage);
  icons(document);
  const gate = document.querySelector('#adminGate');
  gate.hidden = false;

  fetch('/api/admin/config').then((r) => r.json()).then((config) => { adminAuthEnforced = !!config.authEnforced; }).catch(() => { adminAuthEnforced = null; });

  const { email, password, submit } = gateElements();
  submit.addEventListener('click', submitGateLogin);
  [email, password].forEach((input) => input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); submitGateLogin(); } }));

  // A returning admin whose browser already holds a valid session token skips straight past
  // the form, same as the main app's own isLoggedIn() check - only fast-forwards if that token
  // really does belong to an admin account, never just "any known token".
  if (switcher && switcher.currentUserId()) {
    fetch('/api/users/me', { headers: { 'x-dev-user-id': switcher.currentUserId() } })
      .then((r) => (r.ok ? r.json() : null))
      .then((user) => { if (user && user.role === 'admin') startApp(); })
      .catch(() => {});
  }
}

function describeGateError(error) {
  if (error instanceof TypeError) return t('gateErrorOffline');
  if (error && error.code === 'NOT_ADMIN') return t('gateErrorNotAdmin');
  if (error && (error.code === 'INVALID_CREDENTIALS' || error.status === 401)) return t('gateErrorInvalidCredentials');
  const base = t('gateError');
  return error && error.message ? base + ' (' + error.message + ')' : base;
}

// Minimal testability surface (this page otherwise has no window export, matching
// select/app.js's own standalone-script style) - route() and the XP placeholder tab are pure
// enough to unit-test directly rather than only indirectly through hash/DOM interaction.
window.TradeJournalAdminApp = { route: route, xpTab: xpTab, usersTab: usersTab, aiTab: aiTab, commercialAiCostControlSubTab: commercialAiCostControlSubTab };

boot();
