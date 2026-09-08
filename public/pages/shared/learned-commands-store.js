(function () {
  'use strict';
  // Voice Command Learning Profile addendum, section 10 (AI Dashboard "Learned Commands" section).
  // Same generic list-domain wiring as instrument-catalog-store.js (registerListDomain(), server-
  // replica.js's own optimistic-apply/hydrate/upsert/remove) - a learned command is exactly this
  // kind of small, per-user, list-shaped record. setEnabled() is the one addition: the dashboard's
  // manual on/off toggle must go through the narrower POST .../:id/enabled route, never the
  // generic upsert() (which redefines WHAT a mapping does and, by 055_learned_commands.sql's own
  // design, resets its trust counters - a plain on/off toggle must never do that).
  var DOMAIN = 'learned-commands';
  function replica() { return window.TradeJournalServerReplica && window.TradeJournalServerReplica.domain(DOMAIN); }

  function listSync() { var domain = replica(); return domain ? domain.list().sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); }) : []; }
  function isHydrated() { var domain = replica(); return !!domain && domain.isHydrated(); }

  (function () {
    if (!window.TradeJournalServerReplica) return;
    window.TradeJournalServerReplica.registerListDomain(DOMAIN, {
      hydrateUrl: '/api/sync/learned-commands',
      writeUrl: '/api/sync/learned-commands',
      deleteUrlFor: function (id) { return '/api/sync/learned-commands/' + encodeURIComponent(id); },
      extractList: function (body) { return body.learnedCommands || []; }
    });
    replica().hydrate();
  }());

  function remove(id) {
    var domain = replica();
    if (!domain) return Promise.reject(new Error('NO_REPLICA'));
    return domain.remove(id);
  }

  function setEnabled(id, enabled) {
    return fetch('/api/sync/learned-commands/' + encodeURIComponent(id) + '/enabled', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !!enabled })
    }).then(function (res) {
      if (!res.ok) throw new Error('LEARNED_COMMAND_ENABLE_FAILED');
      return res.json();
    }).then(function (updated) {
      var domain = replica();
      if (domain) {
        var current = domain.list();
        var idx = current.findIndex(function (item) { return item.id === id; });
        if (idx > -1) { current[idx] = updated; domain.setAllLocal(current); }
      }
      return updated;
    });
  }

  // Section 7 (dashboard edit): a genuine redefinition of WHAT the mapping does - phrase/action/
  // targetStrategy - so this goes through the real, generic upsert() (server/db/repo.*.mjs's own
  // upsert() already resets confidence/successCount/correctionCount on any redefinition; a plain
  // enable/disable toggle deliberately does NOT go through here, see setEnabled() above). fieldMappings
  // is preserved from the existing record - Phase A of the dashboard does not yet expose a
  // per-field mapping editor of its own (see the final report's own honest scope note).
  function update(id, patch) {
    var domain = replica();
    var existing = domain && domain.find(id);
    if (!existing) return Promise.reject(new Error('LEARNED_COMMAND_NOT_FOUND'));
    var merged = Object.assign({}, existing, patch, { id: id });
    if (!domain) return Promise.reject(new Error('NO_REPLICA'));
    return domain.upsert(merged);
  }

  // Section 7: the real, currently-learnable action catalog + the fixed target-strategy enum,
  // straight from the server's own generated manifest (GET /actions) - so the dashboard's action
  // selector can never offer something the server would then reject. Not cached across calls -
  // this is the dashboard's own one-time-per-tab-open read, not a per-turn hot path.
  function fetchLearnableActions() {
    return fetch('/api/sync/learned-commands/actions').then(function (res) {
      if (!res.ok) throw new Error('LEARNABLE_ACTIONS_FETCH_FAILED');
      return res.json();
    });
  }

  // Section 7 ("Reset all") - deletes every one of the authenticated user's own mappings
  // server-side, then clears the local replica so the dashboard reflects it immediately without
  // waiting for a fresh hydrate(). The dashboard's own confirmation prompt happens before this is
  // ever called.
  function resetAll() {
    return fetch('/api/sync/learned-commands', { method: 'DELETE' }).then(function (res) {
      if (!res.ok) throw new Error('LEARNED_COMMANDS_RESET_FAILED');
      return res.json();
    }).then(function (result) {
      var domain = replica();
      if (domain) domain.setAllLocal([]);
      return result;
    });
  }

  // Mechanical, always-in-sync display transform (never a second, hand-typed id->label map):
  // "trade.wizard" -> "Trade Wizard". Good enough for a technical action id shown in a dashboard
  // list - a genuinely localized per-action label would require extending the Action Registry
  // itself with a display-name field, out of this pass's scope (see the final report).
  function friendlyActionName(actionId) {
    return String(actionId || '').split('.').map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2');
    }).join(' ');
  }

  window.TradeJournalLearnedCommandsStore = {
    listSync: listSync, isHydrated: isHydrated, remove: remove, setEnabled: setEnabled,
    update: update, fetchLearnableActions: fetchLearnableActions, resetAll: resetAll, friendlyActionName: friendlyActionName
  };
}());
