(function () {
  'use strict';
  var i18n = window.TradeJournalAccountProfileI18n;
  var store = window.TradeJournalAccountProfileStore;
  var rules = window.TradeJournalProfileXPRules;
  var layer = window.TradeJournalPanelLayer;
  if (!i18n || !store || !rules || !layer) return;

  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function ico(name) { var node = el('i', 'tj-icon'); node.dataset.lucide = name; return node; }
  function button(text, className, icon) { var b = el('button', className || '', text); b.type = 'button'; if (icon) b.prepend(ico(icon)); return b; }
  function icons(root) { if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(root || document); }
  function toast(message, tone) { var node = el('div', 'tj-toast ' + (tone || ''), message); document.body.append(node); setTimeout(function () { node.remove(); }, 2600); }
  function field(label, value) {
    var wrap = el('label', 'field');
    wrap.append(el('span', '', label));
    var input = document.createElement('input');
    input.type = 'text'; input.value = value || '';
    wrap.append(input);
    return { wrap: wrap, input: input };
  }

  var KYC_LABEL_SUFFIX = { not_started: 'NotStarted', pending: 'Pending', verified: 'Verified', rejected: 'Rejected' };
  // ACH_LABEL_KEYS is derived from profile-achievements.js's own definitions (each carries its
  // own labelKey) rather than duplicated here - single source of truth.
  var ACH_LABEL_KEYS = {};
  ((window.TradeJournalProfileAchievements && window.TradeJournalProfileAchievements.definitions) || []).forEach(function (def) { ACH_LABEL_KEYS[def.key] = def.labelKey; });
  var XP_TYPE_LABEL_KEYS = { trade_closed: 'xpTypeTradeClosed', session_closed: 'xpTypeSessionClosed', listing_published: 'xpTypeListingPublished', intake_completed: 'xpTypeIntakeCompleted' };
  // Every new event type added by the XP engine rewrite (ARCHITECTURE.md Section 11) falls back
  // to a humanized version of its own key (e.g. "session_closed_with_summary" -> "Session closed
  // with summary") rather than a per-language translation - i18n.t() already returns the raw key
  // untranslated when no message exists, so this only makes that fallback readable instead of a
  // literal snake_case string. Real per-language labels for the full new catalog are a follow-up.
  function humanize(key) {
    return key.replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); });
  }
  function xpTypeLabel(type) {
    if (type.indexOf('achievement:') === 0) return i18n.t('xpTypeAchievement');
    if (type.indexOf('streak_') === 0) return i18n.t('xpTypeStreak', { detail: humanize(type) });
    var key = XP_TYPE_LABEL_KEYS[type];
    return key ? i18n.t(key) : humanize(type);
  }
  function blockerLabel(requirement) {
    var parts = String(requirement).split(':');
    return parts.length > 1 ? humanize(parts[0]) + ': ' + humanize(parts[1]) : humanize(parts[0]);
  }

  // ---------------------------------------------------------------------
  // Identity tab
  // ---------------------------------------------------------------------
  function identityTab(profile) {
    var wrap = el('div', 'account-profile-tab');
    var form = el('div', 'account-profile-form');

    var avatarField = el('div', 'account-profile-avatar-field');
    var avatarImg = document.createElement('img');
    avatarImg.className = 'account-profile-avatar-preview';
    avatarImg.src = profile.avatarDataUrl || '';
    avatarImg.hidden = !profile.avatarDataUrl;
    var avatarInput = document.createElement('input');
    avatarInput.type = 'file'; avatarInput.accept = 'image/*';
    var avatarDataUrl = profile.avatarDataUrl || null;
    avatarInput.onchange = function () {
      var file = avatarInput.files && avatarInput.files[0];
      if (!file || !/^image\//.test(file.type)) return;
      var reader = new FileReader();
      reader.onload = function () { avatarDataUrl = String(reader.result || ''); avatarImg.src = avatarDataUrl; avatarImg.hidden = false; };
      reader.readAsDataURL(file);
    };
    avatarField.append(el('span', 'field-label', i18n.t('avatarLabel')), avatarImg, avatarInput);

    var nameField = field(i18n.t('displayNameLabel'), profile.displayName);
    var emailField = field(i18n.t('emailLabel'), profile.email || '');
    var phoneField = field(i18n.t('phoneLabel'), profile.phone || '');

    var kycRow = el('div', 'account-profile-kyc-row');
    kycRow.append(el('span', 'field-label', i18n.t('kycStatusLabel')), el('span', 'badge kyc-' + profile.kycStatus, i18n.t('kyc' + (KYC_LABEL_SUFFIX[profile.kycStatus] || 'NotStarted'))));

    var errorNode = el('p', 'error-text', '');
    var saveBtn = button(i18n.t('save'), 'tj-primary', 'save');
    saveBtn.onclick = function () {
      saveBtn.disabled = true;
      errorNode.textContent = '';
      store.updateProfile({ displayName: nameField.input.value.trim(), email: emailField.input.value.trim() || null, phone: phoneField.input.value.trim() || null, avatarDataUrl: avatarDataUrl })
        .then(function () { toast(i18n.t('saved'), 'success'); populateUserChip(); })
        .catch(function (error) { errorNode.textContent = error && error.code === 'EMAIL_TAKEN' ? i18n.t('emailTaken') : i18n.t('validationFailed'); })
        .finally(function () { saveBtn.disabled = false; });
    };

    form.append(avatarField, nameField.wrap, emailField.wrap, phoneField.wrap, kycRow, el('p', 'tj-hint', i18n.t('kycEditHint')), errorNode, saveBtn);
    wrap.append(form);
    return wrap;
  }

  // ---------------------------------------------------------------------
  // Level tab
  // ---------------------------------------------------------------------
  function levelTab(profile) {
    var wrap = el('div', 'account-profile-tab');
    var level = rules.levelForXp(profile.xpTotal);
    var nextThreshold = rules.xpForNextLevel(profile.xpTotal);
    var currentThreshold = rules.LEVEL_THRESHOLDS[level - 1];

    var card = el('div', 'account-profile-level-card');
    card.append(el('h3', '', i18n.t('levelLabel', { level: level })));
    card.append(el('p', 'account-profile-xp-total', i18n.t('xpLabel', { xp: i18n.number(profile.xpTotal) })));

    var track = el('div', 'account-profile-progress-track');
    var span = nextThreshold != null ? nextThreshold - currentThreshold : 1;
    var progressed = nextThreshold != null ? Math.min(100, Math.max(0, ((profile.xpTotal - currentThreshold) / span) * 100)) : 100;
    var fill = el('div', 'account-profile-progress-fill');
    fill.style.width = progressed + '%';
    track.append(fill);
    card.append(track, el('p', 'tj-hint', nextThreshold != null ? i18n.t('xpToNextLabel', { xp: i18n.number(nextThreshold - profile.xpTotal) }) : i18n.t('maxLevelReached')));

    // "N XP pending sync" - TradeJournalSyncQueue.pendingCount('xp-events') already exists
    // (Section 7.18's sync-queue infrastructure); an offline-earned award used to be silently
    // lost (a raw fetch with .catch(()=>{})) - now it's queued and this makes that visible.
    var queue = window.TradeJournalSyncQueue;
    var pending = queue ? queue.pendingCount('xp-events') : 0;
    if (pending > 0) card.append(el('p', 'tj-hint account-profile-xp-pending', i18n.t('xpPendingSync', { count: pending })));
    wrap.append(card);

    // Mastery gate (ARCHITECTURE.md Section 11.13/11.18) - XP alone is never sufficient to level
    // up; gatedLevel/blockers are always computed server-side (GET /api/users/me/mastery), never
    // recomputed here. Only rendered when the gate is actually behind the raw XP level, matching
    // the exact UX line the spec calls for.
    (store.getMastery ? store.getMastery() : Promise.resolve(null)).then(function (mastery) {
      if (!mastery || mastery.gatedLevel >= mastery.xpLevel || !mastery.blockers.length) return;
      var gateCard = el('div', 'account-profile-card account-profile-mastery-card');
      gateCard.append(el('h3', '', i18n.t('masteryGateTitle', { level: mastery.gatedLevel + 1 })));
      gateCard.append(el('p', 'tj-hint', i18n.t('masteryGateHint')));
      var list = el('ul', 'account-profile-mastery-list');
      mastery.blockers.forEach(function (blocker) {
        list.append(el('li', '', i18n.t('masteryBlockerLine', { requirement: blockerLabel(blocker.requirement), have: i18n.number(blocker.have), need: i18n.number(blocker.need) })));
      });
      gateCard.append(list);
      wrap.insertBefore(gateCard, wrap.children[1] || null);
    }).catch(function () { /* mastery is purely informational - never block the rest of the tab on it */ });

    var recentCard = el('div', 'account-profile-card');
    recentCard.append(el('h3', '', i18n.t('recentXpEvents')));
    var list = el('div', 'account-profile-xp-list');
    recentCard.append(list);
    wrap.append(recentCard);
    store.getXpEvents().then(function (events) {
      if (!events.length) { list.append(el('p', 'tj-hint', i18n.t('noXpEvents'))); return; }
      events.slice(0, 10).forEach(function (item) {
        var row = el('div', 'account-profile-xp-row');
        row.append(el('span', '', xpTypeLabel(item.type)), el('span', 'account-profile-xp-points', '+' + i18n.number(item.points)), el('small', '', i18n.date(item.occurredAt)));
        list.append(row);
      });
      icons(list);
    });
    return wrap;
  }

  // ---------------------------------------------------------------------
  // Achievements tab
  // ---------------------------------------------------------------------
  function achievementsTab() {
    var wrap = el('div', 'account-profile-tab');
    var grid = el('div', 'account-profile-achievements-grid');
    wrap.append(grid);
    store.getAchievements().then(function (unlocked) {
      var unlockedByKey = {};
      unlocked.forEach(function (a) { unlockedByKey[a.achievementKey] = a; });
      var defs = (window.TradeJournalProfileAchievements && window.TradeJournalProfileAchievements.definitions) || [];
      if (!defs.length) { grid.append(el('p', 'tj-hint', i18n.t('achievementsEmpty'))); return; }
      defs.forEach(function (def) {
        var earned = unlockedByKey[def.key];
        var card = el('div', 'account-profile-achievement-card' + (earned ? ' unlocked' : ' locked'));
        var labelKey = ACH_LABEL_KEYS[def.key] || def.key;
        card.append(ico(earned ? 'trophy' : 'lock'));
        card.append(el('strong', '', i18n.t('ach' + labelKey + 'Title')));
        card.append(el('p', '', i18n.t('ach' + labelKey + 'Desc')));
        card.append(el('small', '', earned ? i18n.t('unlockedOn', { date: i18n.date(earned.unlockedAt) }) : i18n.t('locked')));
        grid.append(card);
      });
      icons(grid);
    });
    return wrap;
  }

  // ---------------------------------------------------------------------
  // Subscriptions tab
  // ---------------------------------------------------------------------
  function subscriptionsTab() {
    var wrap = el('div', 'account-profile-tab');
    var list = el('div', 'account-profile-subscriptions-list');
    wrap.append(list);
    store.getSubscriptions().then(function (subs) {
      if (!subs.length) { list.append(el('p', 'tj-hint', i18n.t('subscriptionsEmpty'))); return; }
      subs.forEach(function (sub) {
        var row = el('div', 'account-profile-subscription-row');
        row.append(el('strong', '', sub.listing.title), el('span', 'badge mock', i18n.t('mockBadge')), el('small', '', i18n.t('purchasedOn', { date: i18n.date(sub.purchasedAt) })));
        list.append(row);
      });
    });
    return wrap;
  }

  // ---------------------------------------------------------------------
  // Role tab
  // ---------------------------------------------------------------------
  function roleTab(profile) {
    var wrap = el('div', 'account-profile-tab');
    var roleField = el('label', 'field');
    roleField.append(el('span', '', i18n.t('roleLabel')));
    var select = document.createElement('select');
    ['trader', 'mentor', 'teacher'].forEach(function (role) {
      select.append(new Option(i18n.t('role' + role.charAt(0).toUpperCase() + role.slice(1)), role, false, profile.profileRole === role));
    });
    roleField.append(select);
    var saveBtn = button(i18n.t('save'), 'tj-primary', 'save');
    saveBtn.onclick = function () {
      saveBtn.disabled = true;
      store.updateProfile({ profileRole: select.value })
        .then(function () { toast(i18n.t('roleSaved'), 'success'); populateUserChip(); })
        .catch(function () { toast(i18n.t('validationFailed'), 'danger'); })
        .finally(function () { saveBtn.disabled = false; });
    };
    wrap.append(roleField, el('p', 'tj-hint', i18n.t('roleHint')), saveBtn);
    return wrap;
  }

  // ---------------------------------------------------------------------
  // Page shell - a real route (#account/profile[/tab]), mirrors
  // mental-health-profile-page.js's route()/render()/open() shape exactly.
  // ---------------------------------------------------------------------
  var TABS = ['identity', 'level', 'achievements', 'subscriptions', 'role'];
  var state = { tab: 'identity' };

  function renderPage() {
    // navrya-src/accountProfileView.jsx's React redesign defers here, same hook pattern as every
    // other NAVRYA screen (character-app.jsx registers it) - falls through to the vanilla DOM
    // page below untouched when the hook isn't present (e.g. a page that hasn't loaded the
    // NAVRYA bundle).
    //
    // Reported bug: entering this page sometimes showed a completely black/empty content area
    // with nothing visible - no error text, nothing in the DOM. React's own AccountProfileView
    // has a ProfileBoundary error boundary (accountProfileView.jsx) that DOES render a readable
    // stack trace on a render-time crash, so a truly blank screen means the failure happened
    // BEFORE React ever got to run - i.e. right here, in this un-guarded call (or in
    // layer.show()'s own DOM swap) - which had no try/catch at all, so any throw here was
    // silently swallowed by the browser's own event-loop error handling with nothing ever shown.
    // This guard can never hide a REAL React render error (ProfileBoundary still owns that) - it
    // only catches a failure in getting the page mounted/shown in the first place, and now shows
    // a real, readable message instead of nothing.
    if (window.TradeJournalNavryaAccountProfile && window.TradeJournalNavryaAccountProfile.render) {
      try {
        var reactPage = window.TradeJournalNavryaAccountProfile.render(state.tab);
        layer.show(reactPage, 'account-profile');
      } catch (error) {
        var errorPage = el('section', 'panel-page account-profile-page');
        errorPage.append(el('p', 'error-text', i18n.t('validationFailed') + (error && error.message ? ' (' + error.message + ')' : '')));
        layer.show(errorPage, 'account-profile');
      }
      return;
    }
    var page = el('section', 'panel-page account-profile-page');
    page.dir = i18n.direction();

    var head = el('header', 'pr-page-header'), left = el('div', 'pr-title'), mark = el('span', 'account-profile-mark'), copy = el('div');
    mark.append(ico('user-round'));
    copy.append(el('h2', '', i18n.t('profileTitle')), el('p', '', i18n.t('profileHint')));
    left.append(mark, copy);
    head.append(left);

    var nav = el('nav', 'psy-tabs account-profile-tabs');
    [['identity', 'tabIdentity', 'id-card'], ['level', 'tabLevel', 'trending-up'], ['achievements', 'tabAchievements', 'trophy'], ['subscriptions', 'tabSubscriptions', 'crown'], ['role', 'tabRole', 'user-cog']].forEach(function (item) {
      var b = button(i18n.t(item[1]), state.tab === item[0] ? 'active' : '', item[2]);
      b.onclick = function () { history.replaceState(null, '', '#account/profile/' + item[0]); state.tab = item[0]; renderPage(); };
      nav.append(b);
    });

    var body = el('div', 'account-profile-body');
    body.append(el('p', 'hint', i18n.t('profileTitle')));
    page.append(head, nav, body);
    layer.show(page, 'account-profile');
    icons(page);

    store.getProfile().then(function (profile) {
      body.replaceChildren(
        state.tab === 'identity' ? identityTab(profile) :
        state.tab === 'level' ? levelTab(profile) :
        state.tab === 'achievements' ? achievementsTab() :
        state.tab === 'subscriptions' ? (window.TradeJournalNavryaSubscriptions ? window.TradeJournalNavryaSubscriptions.render() : subscriptionsTab()) : roleTab(profile)
      );
      icons(body);
    }).catch(function (error) {
      body.replaceChildren(el('p', 'error-text', i18n.t('validationFailed') + (error && error.code ? ' (' + error.code + ')' : '')));
    });
  }

  function route() {
    var match = location.hash.match(/^#account\/profile(?:\/(identity|level|achievements|subscriptions|role))?$/);
    return match ? (match[1] || 'identity') : null;
  }
  function render() {
    var tab = route();
    if (!tab) return;
    state.tab = tab;
    renderPage();
  }
  function open(tab) {
    var initial = TABS.indexOf(tab) > -1 ? tab : 'identity';
    history.replaceState(null, '', '#account/profile/' + initial);
    state.tab = initial;
    render();
  }

  window.addEventListener('hashchange', function () { if (location.hash.indexOf('#account/profile') === 0) render(); });
  window.setTimeout(function () { if (location.hash.indexOf('#account/profile') === 0) render(); }, 0);

  // ---------------------------------------------------------------------
  // Sidebar integration: repopulates the EXISTING #userChip button (previously static
  // per-character flavor text - "شکارچی"/"Hunter") with the real signed-in user's avatar,
  // name, and level, and makes it open this page. Not a new sidebar item.
  // ---------------------------------------------------------------------
  function populateUserChip() {
    var chip = document.querySelector('#userChip');
    if (!chip) return Promise.resolve();
    chip.onclick = function (event) { event.preventDefault(); open(); };
    return store.getProfile().then(function (profile) {
      var nameNode = chip.querySelector('b');
      var subNode = chip.querySelector('small');
      var imgNode = chip.querySelector('img');
      if (nameNode) nameNode.textContent = profile.displayName;
      if (subNode) subNode.textContent = i18n.t('levelLabel', { level: rules.levelForXp(profile.xpTotal) });
      if (imgNode && profile.avatarDataUrl) imgNode.src = profile.avatarDataUrl;
    }).catch(function () { /* leave the existing static chip content in place on failure */ });
  }
  window.setTimeout(populateUserChip, 0);

  window.TradeJournalAccountProfilePage = { open: open, render: render, route: route, populateUserChip: populateUserChip };
}());
