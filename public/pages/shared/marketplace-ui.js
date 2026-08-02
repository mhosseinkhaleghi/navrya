(function () {
  'use strict';
  var i18n = window.TradeJournalCommunityI18n;
  var store = window.TradeJournalCommunityStore;
  var switcher = window.TradeJournalDevUserSwitcher;
  if (!i18n || !store) return;

  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function ico(name) { var node = el('i', 'tj-icon'); node.dataset.lucide = name; return node; }
  function button(label, className, iconName) { var b = el('button', className || '', label); b.type = 'button'; if (iconName) b.prepend(ico(iconName)); return b; }
  function icons(root) { if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(root || document); }
  function toast(message, tone) { var node = el('div', 'tj-toast ' + (tone || ''), message); document.body.append(node); setTimeout(function () { node.remove(); }, 2600); }

  // Local modal() copy - per-file convention already used throughout this codebase
  // (trade-ui.js, pattern-registry.js each keep their own), not a shared function.
  function modal(className, title) {
    var back = el('div', 'tj-modal-backdrop'), box = el('section', 'tj-modal ' + (className || '')), head = el('header', 'tj-modal-head'), h = el('h2', '', title), close = button('', 'tj-icon-button', 'x'), closed = false, nativeRemove = back.remove.bind(back);
    back.dir = i18n.direction(); back.setAttribute('role', 'presentation'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    close.dataset.tjClose = ''; close.setAttribute('aria-label', i18n.t('close'));
    function destroy(event) { if (event) { event.preventDefault(); event.stopPropagation(); } if (closed) return; closed = true; document.removeEventListener('keydown', escape, true); nativeRemove(); }
    function escape(event) { if (event.key === 'Escape') destroy(event); }
    back.remove = destroy;
    close.addEventListener('click', destroy, true);
    back.addEventListener('click', function (event) { if (event.target === back) destroy(event); });
    box.addEventListener('click', function (event) { event.stopPropagation(); });
    document.addEventListener('keydown', escape, true);
    head.append(h, close); box.append(head); back.append(box); document.body.append(back);
    window.setTimeout(function () { try { close.focus({ preventScroll: true }); } catch (_) { close.focus(); } }, 0);
    icons(back);
    return { back: back, box: box, close: close, destroy: destroy };
  }

  function field(labelText) { var wrap = el('label', 'tj-field'); wrap.append(el('span', '', labelText)); return wrap; }

  function reportFlow(targetType, targetId) {
    var m = modal('tj-report-modal', i18n.t('reportAction'));
    var reasonInput = document.createElement('textarea'); reasonInput.rows = 3; reasonInput.placeholder = i18n.t('reportReasonPlaceholder');
    var actions = el('footer', 'tj-modal-actions');
    var submit = button(i18n.t('reportSubmit'), 'tj-primary', 'flag');
    submit.onclick = function () {
      var reason = reasonInput.value.trim();
      if (!reason) { reasonInput.focus(); return; }
      store.report(targetType, targetId, reason).then(function () { toast(i18n.t('reportSubmitted'), 'success'); m.back.remove(); }).catch(function (error) { toast(error.code || 'FAILED', 'danger'); });
    };
    actions.append(submit);
    m.box.append(reasonInput, actions);
    icons(m.box);
  }
  function reportButton(targetType, targetId) { var b = button('', 'tj-icon-button', 'flag'); b.title = i18n.t('reportAction'); b.onclick = function () { reportFlow(targetType, targetId); }; return b; }

  // Shared publish/edit modal, invoked both from the Marketplace UI's own "my listings"
  // management and from pattern-registry.js's/strategy-education.js's sharing tabs. Content
  // shaping (what a pattern's/strategy's preview vs. full snapshot looks like) stays owned by
  // the caller via buildContent(previewCount) - this modal only collects generic listing
  // fields (title/description/price/preview depth), it never inspects pattern/strategy shape.
  function openPublishFlow(options) {
    var existing = options.existingListing || null;
    var m = modal('tj-listing-publish-modal', existing ? i18n.t('editListingTitle') : i18n.t('publishListingTitle'));
    var body = el('div', 'tj-modal-body');

    var titleField = field(i18n.t('publishTitleLabel'));
    var titleInput = document.createElement('input'); titleInput.type = 'text'; titleInput.value = (existing && existing.title) || options.suggestedTitle || '';
    titleField.append(titleInput);

    var descField = field(i18n.t('publishDescriptionLabel'));
    var descInput = document.createElement('textarea'); descInput.rows = 3; descInput.value = (existing && existing.description) || '';
    descField.append(descInput);

    var priceGrid = el('div', 'tj-calc-grid');
    var priceField = field(i18n.t('publishPriceLabel'));
    var priceInput = document.createElement('input'); priceInput.type = 'number'; priceInput.min = 0; priceInput.step = 'any'; priceInput.value = (existing && existing.priceAmount) || 0;
    priceField.append(priceInput);
    var currencyField = field(i18n.t('publishCurrencyLabel'));
    var currencySelect = document.createElement('select');
    (window.TradeJournalCommunityTypes ? window.TradeJournalCommunityTypes.priceCurrencies : ['USD', 'EUR']).forEach(function (code) { currencySelect.append(new Option(code, code)); });
    currencySelect.value = (existing && existing.priceCurrency) || 'USD';
    currencyField.append(currencySelect);
    priceGrid.append(priceField, currencyField);

    var previewField = field(i18n.t('publishPreviewCountLabel'));
    var previewInput = document.createElement('input'); previewInput.type = 'number'; previewInput.min = 0;
    var maxPreview = options.maxPreviewItems == null ? 10 : options.maxPreviewItems;
    previewInput.max = maxPreview;
    previewInput.value = existing && existing.previewItemCount != null ? existing.previewItemCount : Math.min(2, maxPreview);
    previewField.append(previewInput);

    body.append(titleField, descField, priceGrid, previewField);

    var actions = el('footer', 'tj-modal-actions');
    var cancel = button(i18n.t('cancel'), 'tj-secondary'); cancel.onclick = function () { m.back.remove(); };
    var submit = button(existing ? i18n.t('save') : i18n.t('publishSubmit'), 'tj-primary', 'upload');
    submit.onclick = function () {
      var title = titleInput.value.trim();
      if (!title) { titleInput.focus(); return; }
      submit.disabled = true;
      var content = options.buildContent(Number(previewInput.value) || 0);
      var payload = {
        type: options.type, sourceId: options.sourceId, title: title, description: descInput.value.trim(),
        priceAmount: Number(priceInput.value) || 0, priceCurrency: currencySelect.value,
        successRatePercent: options.evidence.successRatePercent, sampleSize: options.evidence.sampleSize,
        evidenceAsOf: options.evidence.evidenceAsOf, previewContent: content.previewContent, fullContent: content.fullContent,
        status: 'published'
      };
      var promise = existing ? store.updateListing(existing.id, payload) : store.createListing(payload);
      promise.then(function (listing) {
        toast(i18n.t('publishSuccess'), 'success');
        m.back.remove();
        if (options.onPublished) options.onPublished(listing);
      }).catch(function (error) { submit.disabled = false; toast(error.code || 'FAILED', 'danger'); });
    };
    actions.append(cancel, submit);
    m.box.append(body, actions);
    icons(m.box);
    return m;
  }

  function findListingBySource(sourceId) { return store.findListingBySource(sourceId); }

  // --- Storefront / detail rendering, mounted by community-ui.js's router ---

  function statChip(className, text) { return el('div', className, text); }

  function listingCard(listing) {
    var card = el('article', 'tj-listing-card');
    card.onclick = function () { location.hash = '#community/marketplace/' + encodeURIComponent(listing.id); };
    card.append(el('h4', '', listing.title));
    var hasData = listing.sampleSize > 0 && listing.successRatePercent != null;
    if (hasData) {
      var failure = Math.round((100 - listing.successRatePercent) * 10) / 10;
      card.append(statChip('tj-listing-primary-stat', i18n.number(listing.successRatePercent) + '% · ' + i18n.number(listing.sampleSize) + ' ' + i18n.t('listingSampleSize')));
      card.append(statChip('tj-listing-secondary-stat', i18n.t('listingFailureRate') + ': ' + i18n.number(failure) + '%'));
    } else {
      card.append(statChip('tj-hint', i18n.t('listingInsufficientData')));
    }
    card.append(statChip('tj-listing-price', i18n.number(listing.priceAmount) + ' ' + listing.priceCurrency));
    return card;
  }

  function renderStorefront(container) {
    container.replaceChildren();
    var toolbar = el('div', 'tj-listing-filters');
    var filters = [['', i18n.t('marketplaceFilterAll')], ['pattern', i18n.t('marketplaceFilterPatterns')], ['strategy', i18n.t('marketplaceFilterStrategies')]];
    var active = '';
    var grid = el('div', 'tj-marketplace-grid');
    function load() {
      grid.replaceChildren();
      store.listListings(active ? { type: active } : {}).then(function (listings) {
        if (!listings.length) { grid.append(el('p', 'tj-hint', i18n.t('marketplaceEmpty'))); return; }
        listings.forEach(function (listing) { grid.append(listingCard(listing)); });
        icons(grid);
      });
    }
    filters.forEach(function (item) {
      var b = button(item[1], item[0] === active ? 'tj-secondary active' : 'tj-secondary');
      b.onclick = function () { active = item[0]; toolbar.querySelectorAll('button').forEach(function (btn) { btn.classList.remove('active'); }); b.classList.add('active'); load(); };
      toolbar.append(b);
    });
    toolbar.querySelector('button').classList.add('active');
    container.append(el('h2', '', i18n.t('marketplaceTitle')), toolbar, grid);
    load();
  }

  function renderDetail(container, id) {
    container.replaceChildren();
    Promise.all([store.getListing(id), store.listRatings(id)]).then(function (results) {
      var listing = results[0], ratingsData = results[1];
      return store.getUser(listing.sellerId).then(function (seller) { return { listing: listing, ratingsData: ratingsData, seller: seller }; });
    }).then(function (data) {
      var listing = data.listing, ratingsData = data.ratingsData, seller = data.seller;
      var isSeller = switcher && switcher.currentUserId() === listing.sellerId;
      var unlocked = isSeller || listing.fullContent != null;

      var page = el('div', 'tj-listing-detail');
      var back = button(i18n.t('back'), 'tj-secondary', i18n.direction() === 'rtl' ? 'arrow-right' : 'arrow-left');
      back.onclick = function () { location.hash = '#community/marketplace'; };
      page.append(back, el('h2', '', listing.title));
      if (seller) page.append(el('p', 'tj-listing-creator', i18n.t('listingCreatorLabel') + ' ' + seller.displayName));
      page.append(el('p', '', listing.description));

      var statsRow = el('div', 'tj-listing-stats-row');
      if (listing.sampleSize > 0 && listing.successRatePercent != null) {
        var failure = Math.round((100 - listing.successRatePercent) * 10) / 10;
        statsRow.append(statChip('tj-listing-primary-stat', i18n.number(listing.successRatePercent) + '% · ' + i18n.number(listing.sampleSize) + ' ' + i18n.t('listingSampleSize')));
        statsRow.append(statChip('tj-listing-secondary-stat', i18n.t('listingFailureRate') + ': ' + i18n.number(failure) + '%'));
      } else {
        statsRow.append(statChip('tj-hint', i18n.t('listingInsufficientData')));
      }
      statsRow.append(statChip('tj-hint', i18n.t('listingAsOf', { date: i18n.date(listing.evidenceAsOf) })));
      page.append(statsRow);

      page.append(el('h3', '', i18n.t('listingPreview')));
      page.append(el('pre', 'tj-listing-content', JSON.stringify(listing.previewContent, null, 2)));

      if (unlocked) {
        page.append(el('h3', '', i18n.t('listingFull')));
        page.append(el('pre', 'tj-listing-content', JSON.stringify(listing.fullContent, null, 2)));
      } else {
        page.append(el('p', 'tj-hint', i18n.t('listingLocked')));
      }

      var actionsRow = el('div', 'tj-listing-actions');
      actionsRow.append(el('div', 'tj-listing-price', i18n.number(listing.priceAmount) + ' ' + listing.priceCurrency));
      if (!isSeller) {
        if (unlocked) {
          actionsRow.append(el('span', 'tj-listing-bought-badge', i18n.t('listingBought')));
        } else {
          var buy = button(i18n.t('listingBuy'), 'tj-primary', 'shopping-cart');
          buy.onclick = function () { store.purchaseListing(listing.id).then(function () { renderDetail(container, id); }).catch(function () { toast(i18n.t('listingBuy'), 'danger'); }); };
          actionsRow.append(buy);
        }
        var messageBtn = button(i18n.t('listingMessageSeller'), 'tj-secondary', 'message-circle');
        messageBtn.onclick = function () { store.openThread(listing.id).then(function (thread) { location.hash = '#community/messages/' + encodeURIComponent(thread.id); }); };
        actionsRow.append(messageBtn);
      }
      actionsRow.append(reportButton('listing', listing.id));
      var mockNote = el('small', 'tj-hint', i18n.t('mockBadge'));
      page.append(actionsRow, mockNote);

      page.append(el('h3', '', i18n.t('listingRatingsTitle')));
      var ratingsList = el('div', 'tj-listing-ratings');
      if (!ratingsData.ratings.length) ratingsList.append(el('p', 'tj-hint', i18n.t('listingNoRatings')));
      ratingsData.ratings.forEach(function (rating) {
        var row = el('div', 'tj-listing-rating-row');
        row.append(el('strong', '', String(rating.rating) + '/5'), el('span', '', rating.reviewText || ''));
        ratingsList.append(row);
      });
      page.append(ratingsList);

      if (!isSeller && unlocked) {
        var rateRow = el('div', 'tj-calc-grid');
        var ratingSelect = document.createElement('select');
        [1, 2, 3, 4, 5].forEach(function (n) { ratingSelect.append(new Option(String(n) + '/5', n)); });
        var reviewInput = document.createElement('input'); reviewInput.type = 'text';
        var rateBtn = button(i18n.t('listingRateAction'), 'tj-secondary', 'star');
        rateBtn.onclick = function () {
          store.rateListing(listing.id, Number(ratingSelect.value), reviewInput.value.trim()).then(function () { renderDetail(container, id); }).catch(function (error) { toast(error.code || 'FAILED', 'danger'); });
        };
        rateRow.append(ratingSelect, reviewInput, rateBtn);
        page.append(rateRow);
      }

      container.append(page);
      icons(page);
    });
  }

  window.TradeJournalMarketplace = {
    render: function (container, itemId) { if (itemId) renderDetail(container, itemId); else renderStorefront(container); },
    openPublishFlow: openPublishFlow,
    findListingBySource: findListingBySource
  };
}());
