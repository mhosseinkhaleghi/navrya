(function () {
  'use strict';
  var i18n = window.TradeJournalAII18n;
  var settingsStore = window.TradeJournalAISettingsStore;
  var registry = window.TradeJournalAIProcessRegistry;
  if (!i18n || !settingsStore) return;

  // Pure(ish) request/orchestration layer for the global assistant, shared by the NAVRYA
  // ChatDock (navrya-src/chatDockView.jsx) and anything else that needs to talk to the
  // gateway. Deliberately has no DOM-building of its own - every function here returns data
  // (or throws), never appends a node - so it stays testable the same way the rest of this
  // app's stores are (vm.runInNewContext + a fetch stub), independent of whichever UI layer
  // renders the result.

  // Found via real browser testing (Journey C): a registered process's own allowlist mixes two
  // genuinely different kinds of field - ones a human/the model can reasonably supply through
  // conversation (entryPrice, riskPercent, ...), and ones ONLY this orchestrator itself ever sets
  // directly via registry.applyValue() (sourceSessionId/sourceScenarioId - Journey B;
  // pendingEmotionSignal/riskOverride - Journey C). The full allowlist has to stay as one list for
  // TradeJournalAIProcessRegistry.applyValue()'s own gate check (every one of these calls,
  // including this file's own direct ones, needs its path allowed) - but sending the INTERNAL
  // half to the server as part of the model's own field-path enum invites exactly what real
  // testing found: a model reasonably tries to be helpful and fills pendingEmotionSignal with its
  // own fabricated multi-sentence diagnosis text the instant a message sounds emotional, racing
  // (and duplicating, badly) this file's own deterministic ai-signal-router.js classification.
  // Filtering these names out of what the server ever sees is the narrowest fix - it changes
  // nothing about TradeJournalAIProcessRegistry's own contract, only what chat-dock-core.js
  // itself chooses to expose in its own request body.
  var AI_INTERNAL_ONLY_FIELDS = { sourceSessionId: true, sourceScenarioId: true, pendingEmotionSignal: true, riskOverride: true };
  function modelFacingAllowlist(allowlist) {
    return (allowlist || []).filter(function (path) { return !AI_INTERNAL_ONLY_FIELDS[path]; });
  }

  // Production repair pass, section 12: a development-only diagnostic of exactly what the LAST
  // sendChat() turn's own action-discovery/workflow pipeline decided - sanitized metadata only
  // (real ids and field PATHS, never field values, never a message's own text, never an API key).
  // null before the first turn. Overwritten every call, including therapist-mode and
  // pending-confirmation turns (each sets a minimal { path } marker of its own) so this never goes
  // stale/misleading about which kind of turn it's actually describing.
  var lastTurnDebug = null;
  function setLastTurnDebug(patch) { lastTurnDebug = Object.assign({ at: new Date().toISOString() }, patch); }
  function debugLastTurn() { return lastTurnDebug; }

  function providerLabel(id) {
    var suffix = { openai: 'OpenAI', anthropic: 'Anthropic', kimi: 'Kimi', deepseek: 'Deepseek' }[id] || (id.charAt(0).toUpperCase() + id.slice(1));
    return i18n.t('aiProvider' + suffix);
  }

  // A6: OFF builds/appends to the mental-health profile and calls TradeJournalMentalHealthAI.chat()
  // - its checkText() safety gate runs unconditionally first, no new gate built here. ON calls the
  // provider-agnostic gateway with the currently open registered process (if any) and NEVER touches
  // TradeJournalMentalHealthStore. (Naming kept from the retired global-ai-dock.js: therapistMode
  // true = the ON branch below.)
  // A conversation is a real, growing, server-synced thread now (ai-chat-history-store.js), not
  // one disconnected card per question. `options.conversationId` is null for the first message of
  // a fresh session (creates the conversation server-side and returns its new id) or the id of
  // whichever conversation is currently active in the dock (appends to it instead) - the caller
  // (chatDockView.jsx) owns that state and threads it through on every call.
  async function sendChat(options) {
    var text = String((options && options.text) || '').trim();
    var therapistMode = !!(options && options.therapistMode);
    var transcript = (options && options.transcript) || [];
    var conversationId = (options && options.conversationId) || null;
    // Journey E: 'voice' when this turn originated from a finalized Realtime transcript - the
    // written `reply` (transcript/history) is unaffected either way; a voice-sourced turn also
    // asks the server for a separate, concise `voiceReply` for TTS playback (see
    // dockChat()/DOCK_STYLE_INSTRUCTION in server/pattern-ai-server.mjs) so the spoken answer
    // doesn't read back a full written-Q&A-length reply verbatim.
    var source = (options && options.source) === 'voice' ? 'voice' : 'text';
    if (!text) return null;

    if (therapistMode) {
      setLastTurnDebug({ path: 'therapist' });
      var mhStore = window.TradeJournalMentalHealthStore, mhAi = window.TradeJournalMentalHealthAI;
      if (!mhStore || !mhAi) throw new Error('AI_REQUEST_FAILED');
      var profile = mhStore.addMessage(mhStore.load(), 'user', text);
      var mhResult = await mhAi.chat(profile, text);
      if (mhResult.flagged) return { kind: 'safety' };
      mhStore.addMessage(profile, 'assistant', mhResult.reply, mhResult.suggestions);
      return { kind: 'assistant', reply: mhResult.reply, suggestions: [], activeProcess: null };
    }

    // Journey C: resolve a pending Proactive Engine confirmation deterministically, client-side,
    // BEFORE anything else - including the network call. See ai-proactive-engine.js's own comment
    // on why this exact step must never depend on provider uptime (section 37 of the spec: "the
    // critical protection must not depend on provider uptime" - a confirm/reject decision is the
    // one moment that critical protection is actually being acted on). Ambiguous text (neither a
    // clear confirm nor reject) leaves the pending confirmation untouched and falls through to
    // normal handling below - the workflow itself is unaffected either way.
    var workflowEngine = window.TradeJournalAIWorkflowEngine;
    var actionRegistry = window.TradeJournalAIActionRegistry;
    var contextEngine = window.TradeJournalAIContextEngine;
    var proactiveEngine = window.TradeJournalAIProactiveEngine;
    if (proactiveEngine && typeof proactiveEngine.pendingConfirmation === 'function') {
      // Stale-confirmation clearing (section 16): the same "target process no longer reports
      // itself open" check ai-workflow-engine.js's own pruneIfAbandoned() already uses for the
      // workflow itself - a pending confirmation whose calculator the user has since closed by
      // hand must not sit around waiting to catch an unrelated later "no". A confirmation whose
      // process is still open is left alone here, even across an unrelated new workflow starting
      // (the turn-1 branch below clears it explicitly in that specific case instead).
      var staleCheck = proactiveEngine.pendingConfirmation();
      if (staleCheck && registry && typeof registry.query === 'function' && !registry.query(staleCheck.processId).open) {
        proactiveEngine.clearConfirmation();
      }
      var pendingConf = proactiveEngine.pendingConfirmation();
      if (pendingConf) {
        var decision = proactiveEngine.interpretConfirmationText(text);
        if (decision) {
          var resolved = proactiveEngine.resolveConfirmation(decision);
          if (resolved) {
            if (decision === 'confirm' && workflowEngine) {
              // The one, deliberate exception to "every field goes through runProactiveCheck()
              // first": this value has ALREADY been through that check and explicitly confirmed -
              // re-running the same rule against it would just re-block it. Also records the
              // override on the eventual Trade (section 10) via the same applyValue() mechanism
              // trade-calculator's own registration already exposes for exactly this purpose.
              await workflowEngine.applyKnownFields([{ path: resolved.field, value: resolved.proposedValue }], contextEngine ? contextEngine.snapshot() : {});
              if (registry) {
                registry.applyValue(resolved.processId, 'riskOverride', {
                  ruleId: resolved.ruleId, requestedPercent: resolved.proposedValue, strategyLimitPercent: resolved.strategyLimit, confirmedAt: new Date().toISOString()
                }, 'replace');
              }
            }
            setLastTurnDebug({ path: 'proactive-resolved', decision: decision, ruleId: resolved.ruleId, field: resolved.field });
            return {
              kind: 'proactive-resolved', decision: decision, finding: resolved,
              reply: proactiveEngine.confirmationReply(decision, resolved),
              workflow: workflowEngine ? workflowEngine.current() : null,
              activeProcess: registry ? registry.activeOpenProcess() : null, conversationId: conversationId
            };
          }
        }
      }
    }

    var active = settingsStore.settings();
    var activeProcess = registry ? registry.activeOpenProcess() : null;
    // A live-session Scenario card being expanded ('live-session-scenario-' + id - see
    // liveSessionView.jsx's own per-card registration, and ai-context-engine.js's
    // activeScenarioId(), which already reads this exact same id prefix for context) is a
    // passive, expanded read view, not a fillable form the way NewSessionDialog/
    // tradeCalculatorModal/the chart-entry modal are. Treating it as "something is open" here
    // would silently block Journey B's own trade-action discovery below (and the server's own
    // activeProcess/availableActions mutual exclusivity - see dockChatFormatFor() in
    // server/pattern-ai-server.mjs) every time a user has a scenario expanded and asks to start a
    // brand-new trade from it via chat - exactly the "starting a trade FROM a specific Scenario"
    // case Journey B needs to support. Every other registered process is unaffected.
    // Journey F, F19/F20: a live-session Entry's own detail panel ('live-session-entry-' + id)
    // reports itself open for exactly the same passive reason a Scenario card does above -
    // liveSessionView.jsx defaults `selId` to the first entry in the list, so SOME entry is
    // always "open" here for the entire rest of a session the instant it has one, with no
    // deliberate "stay focused here" gesture behind it (unlike a real modal the user must
    // explicitly close). Found via real browser testing: without this, "Create a scenario called
    // X" right after "Add a movement note" was silently mis-routed into the still-registered
    // entry's own note field instead of ever discovering session.scenario.create - the same
    // failure mode the Scenario exclusion below already exists to prevent, just one level up.
    if (activeProcess && String(activeProcess.id).indexOf('live-session-entry-') === 0) activeProcess = null;
    if (activeProcess && String(activeProcess.id).indexOf('live-session-scenario-') === 0) activeProcess = null;
    // Journey F, F33-F36: settings-trading-defaults/settings-region-language/ai-assistant-engine
    // are unconditionally excluded here too (not just via the conditional passiveWorkflowMatch
    // check further below) - unlike pattern-editor-{id} (whose open() must re-resolve a specific
    // Pattern by name, so a later turn genuinely needs continuation to keep targeting the same
    // one), these three need no entity resolution at all (available: () => true, open() only
    // navigates+polls). Found via real browser testing: because their entityAlreadyPersisted
    // workflow never completes on its own (stays 'collecting' for as long as the page is open),
    // `passiveWorkflowMatch` was true from the SECOND turn onward forever, keeping activeProcess
    // non-null and permanently blocking the OTHER half of the discovery condition below even
    // after workflowProcessExcluded (below) was fixed - "Create a Pattern." right after "Set my
    // default risk to 3%." still returned action:null. Fresh re-discovery is exactly as good as
    // continuation for these three (every field applies independently and immediately either
    // way), so there is no downside to excluding them unconditionally.
    if (activeProcess && (activeProcess.id === 'settings-trading-defaults' || activeProcess.id === 'settings-region-language' || activeProcess.id === 'ai-assistant-engine')) activeProcess = null;
    // Production repair pass, section 11: a registration with a deliberately EMPTY allowlist
    // (tradeDetailsModal.jsx's own 'trade-details-{id}', registered purely so ai-context-builder.js
    // can resolve "this trade" - it has no fillable field of its own at all) is, by construction,
    // never something the user could be "actively editing" - there is nothing in it applyValue()
    // could ever legally target. Found via real testing of the full 20-turn required script:
    // completing a Trade via chat auto-opens its own Trade Details view (character-app.jsx's
    // trade.calculator resultContext, unchanged, pre-existing behavior), which then silently
    // blocked every later action-discovery turn (e.g. "take me to Strategies") for the rest of the
    // session, exactly the failure mode this section warns about - a background/context-only
    // registration suppressing unrelated, brand-new action discovery. This is the SAME excluding
    // treatment as live-session-scenario- above, generalized by the actual reason it's safe (empty
    // allowlist = nothing to fill) rather than another one-off hardcoded id prefix - a future
    // context-only registration gets this for free as long as it follows the same real convention.
    if (activeProcess && (!activeProcess.allowlist || !activeProcess.allowlist.length)) activeProcess = null;
    var historyStore = window.TradeJournalAiChatHistoryStore;

    // Action discovery (Journey A: "start a New York session" and similar) - only offered when
    // nothing is already open and no AI-started workflow is already in flight, matching the
    // server's own activeProcess/availableActions contract (see dockChatFormatFor() in
    // server/pattern-ai-server.mjs). Feature-detected end to end so pages/older bundles that
    // don't load ai-context-engine.js/ai-action-registry.js/ai-workflow-engine.js keep today's
    // exact behavior. (workflowEngine/actionRegistry/contextEngine were already resolved above,
    // ahead of the Journey C pending-confirmation check.)
    // Once, at the top of handling this new message (never mid-flight inside this same turn's own
    // start()/applyKnownFields() below - see pruneIfAbandoned()'s own comment for why that
    // distinction matters): a workflow whose target UI the user has since closed by hand, without
    // ever completing or being explicitly cancelled, must not keep occupying the one global
    // workflow slot - otherwise a later, genuinely new request would never be recognized as a
    // fresh intent.
    if (workflowEngine && typeof workflowEngine.pruneIfAbandoned === 'function') workflowEngine.pruneIfAbandoned();
    var currentWorkflow = workflowEngine ? workflowEngine.current() : null;
    // Journey F, F27-31: several real processes are passive "this entity/conversation happens to
    // be visible" signals - open for as long as some unrelated, ordinary page state says so
    // (a Pattern/Strategy tab showing, a comment thread expanded, a message thread open, an
    // eligible listing's rating form rendered) rather than because the user just now took a
    // deliberate "fill this out" gesture. Exactly like 'trade-details-{id}' above, but unlike it,
    // every one of these carries a real, non-empty allowlist (name/description/draft/send/
    // ratingValue/...), so the empty-allowlist rule a few lines up never nulls them out.
    // Found via real browser testing: with a Pattern's Details tab simply open (no pattern-
    // editing workflow actually in flight), "Publish this pattern to Marketplace." fell all the
    // way to the plain activeProcess-suggestions fallback below, scoped to pattern-editor's own
    // name/description/completionThreshold fields - the message never reached action-discovery
    // at all, so marketplace.publish could never be offered no matter how the request was
    // phrased. The identical failure reproduced for message.reply with a thread simply open
    // (messages-thread-reply) and would reproduce identically for community.comment.create
    // (community-comment-{id}) and marketplace.rate (marketplace-rate-{id}) the same way. Null
    // each out here UNLESS a workflow is already genuinely continuing through that exact process
    // (pattern.edit picking up a live field correction, message.reply's own second "send it"
    // turn, ...) - that continuation still reaches the activeProcess-match branch below
    // unaffected, since it is decided from currentWorkflow, not this variable. A plain "change
    // the description to X" (or "reply saying X", with no reply workflow yet in flight) now goes
    // through fresh action-discovery instead of the old raw suggestions[] flow - matching each
    // action's own real resolveActive*()/registry.query()-based design (see character-app.jsx),
    // which already handles exactly this case.
    // Journey F, F33-F36: the Settings page mounts three of these at once (AI panel builder,
    // Region & language, Trading defaults - all real, non-empty allowlists, all open the entire
    // time #settings is showing), and Account Profile's Identity/Role tabs and the AI Assistant
    // engine screen are each open the whole time their own page is simply visible - none of these
    // is a "the user just now opened this to fill it out" gesture either. Without this, "Create a
    // Pattern" while Settings/Profile/AI Assistant happened to be open would never be discovered
    // (F46), and because all three Settings registrations coexist, activeProcess would resolve to
    // whichever registered most recently (Trading defaults, being last in the tree) even for a
    // message actually about Region & language - the exact cross-contamination risk already found
    // and fixed for Pattern/Strategy/thread/comment/rating above, generalized the same way.
    if (activeProcess && /^(pattern-editor-|strategy-editor-|messages-thread-reply|community-comment-|marketplace-rate-|settings-ai-panel-builder|account-profile-identity|account-profile-role)/.test(String(activeProcess.id))) {
      var passiveWorkflowMatch = currentWorkflow && currentWorkflow.processId === activeProcess.id;
      if (!passiveWorkflowMatch) activeProcess = null;
    }
    // Journey F, F21: 'live-session-entry-'/'live-session-scenario-' processIds are
    // unconditionally excluded from activeProcess a few lines up (the exact same "passive/
    // ambient, not a deliberate open gesture" reasoning as the session.movementEntry.create/
    // session.scenario.create/.edit registrations themselves - see character-app.jsx), so the
    // activeProcess-match continuation branch below can structurally never reach a workflow
    // whose process is one of these, in ANY status. Found via real F21 browser testing ("Create
    // a scenario..." then, within ~3-8s, "Create a Strategy..."): with no exception here, every
    // message sent during that workflow's own post-collection grace window (status
    // 'pending-submit'/'submitting' - ai-workflow-engine.js's own SUBMIT_GRACE_MS, deliberately
    // never pruned since it is about to legitimately complete) fell through to neither branch -
    // no availableActions (currentWorkflow was still non-null) and no activeProcess (excluded) -
    // guaranteeing action:null no matter what the user said.
    //
    // Journey F, F22 (trade.cancel): the identical dead-branch also reproduces for a workflow
    // still 'collecting' (not yet pending-submit) whose process is 'trade-details-{id}' - also
    // excluded from activeProcess (its own allowlist is empty, matched by the general
    // empty-allowlist rule below). trade.cancel deliberately requires a `confirm` field that
    // only arrives on a LATER, separate turn ("Cancel this trade." -> "are you sure?" -> "Yes,
    // cancel it.") - exactly the deliberately-multi-turn shape session.scenario.create's own
    // title-then-later-edit already established as safe to handle via fresh re-discovery, not
    // continuation. So the exclusion below applies in EVERY status, not just the grace window:
    // trade.cancel's own open() never mutates anything (only submit(), gated on confirm, does),
    // so re-running open() via a fresh discovery costs nothing; the Scenario/Entry/Trade-details
    // records these three prefixes cover are all either already-created-on-open (Scenario/Entry,
    // documented in the F19-21 report) or never-mutated-until-confirmed (Trade Details) - a
    // fresh re-discovery is never destructive for any of them.
    // Journey F, F33-F36: settings-trading-defaults/settings-region-language/ai-assistant-engine
    // are entityAlreadyPersisted (character-app.jsx) - every field applies+persists immediately,
    // so their workflow NEVER transitions past 'collecting' on its own (no scheduleSubmit ever
    // runs for them, unlike Pattern/Strategy/Trade actions that eventually auto-submit-then-clear
    // - see ai-workflow-engine.js's own applyKnownFields()). Found via real browser testing: once
    // "Set my default risk to 3%." starts one of these, it sits 'collecting' for as long as
    // Settings/AI Assistant stays open - with no exclusion here, EVERY later message (even "Create
    // a Pattern.", entirely unrelated) fell into this exact dead branch (no availableActions,
    // since currentWorkflow was still non-null; no activeProcess, since the line above already
    // excludes these ids) and returned action:null no matter what was said, for the rest of that
    // page visit. Same reasoning as trade-details- below: open() for all three only navigates and
    // polls, never mutates, so a fresh re-discovery costs nothing.
    var workflowProcessId = currentWorkflow ? String(currentWorkflow.processId || '') : '';
    var workflowProcessExcluded = workflowProcessId.indexOf('live-session-entry-') === 0 || workflowProcessId.indexOf('live-session-scenario-') === 0 || workflowProcessId.indexOf('trade-details-') === 0 || workflowProcessId === 'settings-trading-defaults' || workflowProcessId === 'settings-region-language' || workflowProcessId === 'ai-assistant-engine';
    var workflowBlocksDiscovery = currentWorkflow && !workflowProcessExcluded;
    var availableActions = null;
    if (workflowEngine && actionRegistry && !activeProcess && !workflowBlocksDiscovery) {
      var discoveryContext = contextEngine ? contextEngine.snapshot() : {};
      var catalog = actionRegistry.catalogFor(discoveryContext);
      if (catalog.length) availableActions = catalog;
    }

    var requestBody = {
      provider: active.provider, apiKey: settingsStore.getKey(active.provider), model: settingsStore.activeModel(),
      language: i18n.language(), message: text, chatHistory: transcript.slice(-24),
      activeProcess: activeProcess ? { id: activeProcess.id, allowlist: modelFacingAllowlist(activeProcess.allowlist) } : null
    };
    if (availableActions) requestBody.availableActions = availableActions;
    if (source === 'voice') requestBody.source = 'voice';
    // Journey D: the smallest-sufficient-context package for THIS turn (LAYER A product
    // knowledge + LAYER B user memory + LAYER C live state), built fresh every call - never
    // cached, never "all knowledge every turn" (ai-context-builder.js's own deterministic
    // narrowing already scoped it down before it ever gets here). Purely additive and
    // best-effort: a page that hasn't loaded ai-context-builder.js (or a build() that throws)
    // must fall back to exactly today's behavior, never break the actual chat turn.
    var contextBuilder = window.TradeJournalAIContextBuilder;
    if (contextBuilder) {
      try {
        var builtPackage = contextBuilder.build({ message: text, currentContext: contextEngine ? contextEngine.snapshot() : {} });
        var wireProductContext = shapeProductContextForWire(builtPackage);
        if (wireProductContext) requestBody.productContext = wireProductContext;
      } catch (_) { /* no-op - product knowledge is additive, never load-bearing */ }
    }
    var response = await fetch('/api/ai/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    var payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'AI_REQUEST_FAILED');
    if (window.TradeJournalAIUsage) window.TradeJournalAIUsage.record({ provider: payload.provider, usage: payload.usage, source: 'chatDock.chat' });
    var usageValue = payload.usage || {};
    var usedTokens = typeof usageValue.totalTokens === 'number' ? usageValue.totalTokens : (usageValue.promptTokens || 0) + (usageValue.completionTokens || 0);
    var nextConversationId = conversationId;
    if (historyStore) {
      // Best-effort, same as ai-usage-store.js's reportToServer() - a history-sync failure must
      // never break the actual reply the user is waiting on.
      try {
        if (conversationId) {
          await historyStore.appendExchange(conversationId, text, payload.reply, usedTokens);
        } else {
          var created = await historyStore.startConversation(active.provider, text, payload.reply, usedTokens);
          nextConversationId = created ? created.id : null;
        }
      } catch (_) { /* no-op */ }
    }

    // Turn 1: the model matched one of the offered actions - start the workflow (opens the real
    // UI, navigating there if needed) and live-apply any fields it already extracted from this
    // message. Turn 2+: a workflow is already in flight and the process it opened is now the one
    // reporting itself open - auto-apply this turn's allowlist-constrained suggestions instead of
    // surfacing them for the popover's manual Apply/Discard buttons (Section 9's "live sync, not
    // wait until the end of the conversation" requirement).
    var workflowResult = null;
    var tookWorkflowPath = false;
    var proactiveFindings = [];
    if (workflowEngine && availableActions && payload.action && payload.action.id) {
      tookWorkflowPath = true;
      // A genuinely new workflow starting (this branch only ever runs with nothing else open -
      // see availableActions' own gating above) means the user has moved on; any confirmation
      // still pending from an earlier, different interaction is definitely stale now.
      if (proactiveEngine && typeof proactiveEngine.clearConfirmation === 'function') proactiveEngine.clearConfirmation();
      var fields1 = mergedFields(payload.action.fields || [], text, payload.action.id);
      // fields1 is passed straight through as start()'s own third argument too - an action whose
      // open() must first RESOLVE an existing real entity (pattern.edit's patternName) needs this
      // turn's extraction to do that lookup; see ai-workflow-engine.js's start() comment.
      workflowEngine.start(payload.action.id, contextEngine ? contextEngine.snapshot() : {}, fields1);
      var check1 = runProactiveCheck(fields1, payload.action.id, workflowEngine.current());
      proactiveFindings = check1.findings;
      workflowResult = await workflowEngine.applyKnownFields(check1.fieldsToApply, contextEngine ? contextEngine.snapshot() : {});
    } else if (workflowEngine && currentWorkflow && activeProcess && activeProcess.id === currentWorkflow.processId) {
      tookWorkflowPath = true;
      var fields2 = mergedFields(payload.suggestions || [], text, currentWorkflow.actionId);
      var check2 = runProactiveCheck(fields2, currentWorkflow.actionId, currentWorkflow);
      proactiveFindings = check2.findings;
      workflowResult = await workflowEngine.applyKnownFields(check2.fieldsToApply, contextEngine ? contextEngine.snapshot() : {});
    }

    // Journey C signal routing - independent of which workflow branch (if any) ran above; a
    // behavioral/emotional signal can accompany a message whether or not it also happened to
    // extract a trade field this turn. Runs after the workflow branches so
    // hasActiveTradeWorkflow reflects this turn's OWN just-started/just-continued workflow, not
    // a stale snapshot from before start() ran.
    var signalResult = runSignalRouting(text, workflowEngine ? workflowEngine.current() : currentWorkflow, contextEngine ? contextEngine.snapshot() : {});
    if (signalResult && signalResult.flagged) return { kind: 'safety' };

    // Production repair pass, section 12: a dev-only, sanitized snapshot of exactly what this
    // turn's own action-discovery/workflow pipeline decided - which real ids reported themselves
    // open before/after, whether the model's own action.id was actually acted on, which field
    // PATHS (never values - this is a debug aid, not a place to accidentally surface a real risk
    // number or account balance) got live-applied. Exists specifically because "did the model
    // return an action, and did NAVRYA actually act on it" was, in real production use, hard to
    // tell apart from the outside - this makes every turn's own answer to that inspectable without
    // re-reading server logs or re-instrumenting the browser each time.
    setLastTurnDebug({
      activeProcessBefore: activeProcess ? activeProcess.id : null,
      availableActionIds: availableActions ? availableActions.map(function (a) { return a.id; }) : null,
      modelActionId: (payload.action && payload.action.id) || null,
      workflowStarted: tookWorkflowPath && !!(workflowEngine && availableActions && payload.action && payload.action.id),
      workflowContinued: tookWorkflowPath && !(workflowEngine && availableActions && payload.action && payload.action.id),
      workflowId: workflowResult ? workflowResult.workflowId : null,
      workflowStatus: workflowResult ? workflowResult.status : (tookWorkflowPath ? 'completed-and-cleared' : null),
      processAfterOpen: registry ? (registry.activeOpenProcess() && registry.activeOpenProcess().id) : null,
      fieldsAppliedPaths: tookWorkflowPath ? (workflowResult && workflowResult.known ? Object.keys(workflowResult.known) : []) : [],
      proactiveFindingIds: proactiveFindings.map(function (f) { return f.id; }),
      signalRelevant: !!(signalResult && signalResult.relevant),
      signalDestination: signalResult ? signalResult.destination : null
    });

    if (tookWorkflowPath) {
      var result = { kind: 'workflow', reply: payload.reply, voiceReply: payload.voiceReply || null, workflow: workflowResult, activeProcess: activeProcess, conversationId: nextConversationId };
      if (proactiveFindings.length) { result.kind = 'proactive-warning'; result.proactive = proactiveFindings; result.reply = buildProactiveReply(proactiveFindings); result.voiceReply = null; }
      return result;
    }

    return { kind: 'assistant', reply: payload.reply, voiceReply: payload.voiceReply || null, suggestions: payload.suggestions || [], activeProcess: activeProcess, conversationId: nextConversationId };
  }

  // Journey D, step 0: merges this turn's real user text through the deterministic extractor
  // (ai-deterministic-extraction.js) on top of whatever the model itself extracted, before either
  // ever reaches the Proactive Engine or applyKnownFields(). Fixes the exact, documented Journey C
  // reliability gap - a model that intermittently declines to extract an obvious literal value
  // ("increase risk to 4%") no longer matters, since NAVRYA's own deterministic reading of the
  // same words wins regardless. Scoped by the action's own domain (trade.calculator -> 'trade',
  // session.create -> 'session') so this never tries to pull a Session city out of a Trade
  // conversation or vice versa; an action with neither domain is left completely untouched.
  var ACTION_DETERMINISTIC_DOMAIN = { 'trade.calculator': 'trade', 'session.create': 'session' };
  function mergedFields(modelFields, text, actionId) {
    var extraction = window.TradeJournalAIDeterministicExtraction;
    var domain = ACTION_DETERMINISTIC_DOMAIN[actionId];
    if (!extraction || !domain) return modelFields;
    return extraction.mergeWithModelFields(modelFields, text, { domain: domain });
  }

  // Journey D: trims ai-context-builder.js's own full package down to only what's worth the
  // request's own token budget - drops `routes`/`entities`/`terms`/`relatedDomains`/
  // `verifiedAgainst` (internal bookkeeping the model never needs to answer a product question)
  // and the client-only `availableActions`/`proactiveContext` (already sent separately as
  // `requestBody.availableActions`/handled entirely client-side - see runProactiveCheck() below,
  // sending it again here would be redundant, not additive). Returns null (send nothing) when
  // there is genuinely nothing worth sending, rather than an empty-but-present object.
  function shapeProductContextForWire(pkg) {
    if (!pkg) return null;
    var domains = (pkg.productKnowledge || []).map(function (d) {
      return { id: d.id, title: d.title, description: d.description, workflows: d.workflows, capabilities: d.capabilities, relationships: d.relationships, notes: d.notes };
    });
    var userMemory = pkg.userMemory || [];
    if (!domains.length && !userMemory.length) return null;
    return { domains: domains, userMemory: userMemory, liveContext: pkg.liveContext || null };
  }

  // Journey C: runs the deterministic Proactive Engine against this turn's proposed field
  // changes BEFORE they ever reach TradeJournalAIWorkflowEngine.applyKnownFields() - a field a
  // blocking-severity finding targets is filtered OUT of what gets applied (never reaches the
  // real, visible UI - section 18's "do NOT visibly apply the unsafe/conflicting value before
  // confirmation"), and staged as a pending confirmation if it's the confirmable kind. Every
  // other field (the normal, non-conflicting case) is entirely unaffected - this changes nothing
  // about Journey B's own low-risk field application unless a rule actually triggers.
  // Scoped to trade.calculator only in this vertical slice (section 21 - other actions have no
  // comparable rule set yet).
  function runProactiveCheck(fields, actionId, currentWorkflowState) {
    var proactiveEngine = window.TradeJournalAIProactiveEngine;
    if (!proactiveEngine || actionId !== 'trade.calculator') return { fieldsToApply: fields, findings: [] };
    var known = (currentWorkflowState && currentWorkflowState.known) || {};
    var proposed = Object.assign({}, known);
    // Normalize each raw extracted value through the action's own normalizeField() before it
    // ever reaches a rule - `known` (above) is already normalized (ai-workflow-engine.js only
    // ever stores post-normalizeField values there), but `fields` here is this turn's fresh, raw
    // extraction (e.g. a Strategy NAME string, not yet resolved to an id) - without this, Rule A
    // could never resolve context.strategy at all, since buildTradeContext() looks a Strategy up
    // by id. Uses the exact same normalizeField() applyKnownFields() itself will run a moment
    // later - never a second, parallel normalization path.
    var actionForNormalize = window.TradeJournalAIActionRegistry ? window.TradeJournalAIActionRegistry.get(actionId) : null;
    (fields || []).forEach(function (f) {
      if (!f || !f.path) return;
      var value = f.value;
      if (actionForNormalize && typeof actionForNormalize.normalizeField === 'function') {
        try { value = actionForNormalize.normalizeField(f.path, value); } catch (_) { value = f.value; }
      }
      proposed[f.path] = value;
    });
    var context = proactiveEngine.buildTradeContext({ proposedFields: proposed, knownFields: known });
    var evalResult = proactiveEngine.evaluate({ context: context, intendedAction: actionId, proposedFields: proposed });
    var blocking = evalResult.findings.filter(function (f) { return proactiveEngine.BLOCKING_SEVERITIES[f.severity]; });
    var fieldsToApply = fields;
    if (blocking.length) {
      var blockedPaths = {};
      blocking.forEach(function (f) { if (f.field) blockedPaths[f.field] = true; });
      fieldsToApply = (fields || []).filter(function (f) { return !(f && f.path && blockedPaths[f.path]); });
      var confirmable = blocking.filter(function (f) { return f.requiresConfirmation; })[0];
      if (confirmable) {
        var processId = (currentWorkflowState && currentWorkflowState.processId) || String(actionId).replace(/\./g, '-');
        proactiveEngine.stageConfirmation({
          ruleId: confirmable.id, actionId: actionId, processId: processId, field: confirmable.field,
          proposedValue: confirmable.evidence && confirmable.evidence.requestedRiskPercent,
          safeValue: known[confirmable.field] !== undefined ? known[confirmable.field] : null,
          strategyLimit: confirmable.evidence && confirmable.evidence.strategyMaxRiskPercent
        });
      }
    }
    return { fieldsToApply: fieldsToApply, findings: evalResult.findings };
  }

  // Deterministic, local evidence text - never the model's own payload.reply, and never depends
  // on a provider call succeeding (section 37). A finding whose severity blocks the field states
  // the conflict first, followed by any supporting non-blocking evidence (recent losses, stress),
  // matching section 1's own worked example.
  function buildProactiveReply(findings) {
    var proactiveEngine = window.TradeJournalAIProactiveEngine;
    var blocking = findings.filter(function (f) { return proactiveEngine && proactiveEngine.BLOCKING_SEVERITIES[f.severity]; });
    var rest = findings.filter(function (f) { return blocking.indexOf(f) === -1; });
    var lines = blocking.map(function (f) { return f.message; }).concat(rest.map(function (f) { return f.message; }));
    if (blocking.length) lines.push('Do you want to keep the current value, or deliberately override it?');
    return lines.join(' ');
  }

  // Journey C: classifies this message for a trading-relevant behavioral/emotional signal
  // (ai-signal-router.js - deterministic, never invasive-by-default) and, only for the one
  // destination this vertical slice actually persists (TRADE_LOG, and only while a real
  // trade.calculator workflow is in flight to attach it to), pushes it live through the exact
  // same applyValue() mechanism every other field already uses (tradeCalculatorModal.jsx's own
  // pendingEmotionSignal handler carries it onto the real Trade at submit() time). SESSION_CONTEXT
  // is deliberately left un-persisted in this slice (section 10's own "do not silently force a
  // Mental Health record" - the real pre-session check-in flow is not invoked automatically here).
  // Any text about to be routed anywhere runs through the same mental-health-safety.js gate every
  // other psychology-adjacent text in this app already goes through first - flagged text is never
  // routed anywhere, and the caller must treat it as a safety-mode reply.
  function runSignalRouting(text, currentWorkflowState, contextSnapshot) {
    var router = window.TradeJournalAISignalRouter;
    if (!router) return null;
    var hasActiveTradeWorkflow = !!(currentWorkflowState && currentWorkflowState.actionId === 'trade.calculator');
    var activeSessionId = (contextSnapshot && contextSnapshot.activeEntities && contextSnapshot.activeEntities.sessionId) || null;
    var classified = router.classify({ text: text, context: { hasActiveTradeWorkflow: hasActiveTradeWorkflow, activeSessionId: activeSessionId } });
    if (!classified.relevant) return classified;
    var safety = window.TradeJournalMentalHealthSafety;
    if (safety && typeof safety.checkText === 'function') {
      var checked = safety.checkText(text);
      if (checked && checked.flagged) return { relevant: true, flagged: true, secondarySignals: [], destination: 'CHAT_ONLY' };
    }
    if (classified.destination === router.DESTINATION.TRADE_LOG && hasActiveTradeWorkflow) {
      var emotionSignal = classified.secondarySignals.filter(function (s) { return s.type === 'emotion'; })[0];
      if (emotionSignal && registry) {
        registry.applyValue(currentWorkflowState.processId, 'pendingEmotionSignal', { emotion: emotionSignal.value, note: text.slice(0, 240) }, 'replace');
      }
    }
    return classified;
  }

  function applySuggestion(processId, path, value, mode) {
    if (registry) registry.applyValue(processId, path, value, mode);
  }

  // A7: explicit, click-initiated action - never auto-detected - consistent with every other
  // AI trigger in this app being click-initiated.
  async function analyzeScreenshot(dataUrl) {
    var active = settingsStore.settings();
    var response = await fetch('/api/trades/extract-fields', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: active.provider, apiKey: settingsStore.getKey(active.provider), model: settingsStore.activeModel(), language: i18n.language(), images: [dataUrl] })
    });
    var result = await response.json();
    if (!response.ok) throw new Error(result.error || 'AI_REQUEST_FAILED');
    if (window.TradeJournalAIUsage) window.TradeJournalAIUsage.record({ provider: result.provider, usage: result.usage, source: 'chatDock.extractFields' });
    return result;
  }

  function detectEmotionalContent(text) {
    if (!text) return null;
    return { id: 'dock-emotion-' + Date.now().toString(36), timestamp: new Date().toISOString(), stage: 'entry', dominantEmotions: [], emotionDetails: [], stressLevel: 5, focusQuality: 5, planCommitment: 5, wouldTakeIfNotForced: null, note: text };
  }

  // The exact same 3-call sequence openCalculator's existing log.onclick already uses
  // (createDraft -> applyCalculatedToTrade -> openWizard), just fed by extracted values instead
  // of typed ones. Emotional content in the accompanying message is seeded onto
  // trade.emotionLog before the wizard opens.
  function applyExtractionToWizard(extraction, contextMessage) {
    var tradeStore = window.TradeJournalTradeStore, tradeUi = window.TradeJournalTradeUI, calc = window.TradeJournalTradeCalculator;
    if (!tradeStore || !tradeUi || !calc) return false;
    var accountSettings = tradeStore.settings(), manual = new Set();
    var takeProfits = (extraction.takeProfits || []).length
      ? extraction.takeProfits.map(function (tp) { return { price: tp.price, portionPercent: Math.round(100 / extraction.takeProfits.length) }; })
      : [{ price: null, portionPercent: 100 }];
    var source = {
      direction: extraction.direction || 'long', marginMode: 'isolated',
      entryPrice: extraction.entryPrice, stopLoss: extraction.stopLoss, slDistancePercent: null,
      riskPercent: accountSettings.defaultRiskPercent, riskAmount: null, leverage: extraction.leverage, positionSize: null,
      accountBalance: accountSettings.accountBalance, takeProfits: takeProfits,
      feeType: accountSettings.defaultFeeType, feePercent: accountSettings.defaultFeeType === 'maker' ? accountSettings.makerFeePercent : accountSettings.takerFeePercent
    };
    ['entryPrice', 'stopLoss', 'leverage'].forEach(function (k) { if (source[k] !== null && source[k] !== undefined) manual.add(k); });
    if (source.riskPercent !== null && source.riskPercent !== undefined) manual.add('riskPercent');
    if (source.accountBalance !== null && source.accountBalance !== undefined) manual.add('accountBalance');
    var result = calc.solve(source, manual, { feePercent: source.feePercent });
    var trade = tradeUi.applyCalculatedToTrade(tradeStore.createDraft({ status: 'hunting' }), result, source);
    var emotion = detectEmotionalContent(contextMessage);
    if (emotion) trade.emotionLog = (trade.emotionLog || []).concat([emotion]);
    tradeUi.openWizard(trade);
    return true;
  }

  window.TradeJournalChatDockCore = {
    providerLabel: providerLabel,
    sendChat: sendChat,
    applySuggestion: applySuggestion,
    analyzeScreenshot: analyzeScreenshot,
    applyExtractionToWizard: applyExtractionToWizard,
    debugLastTurn: debugLastTurn
  };
}());
