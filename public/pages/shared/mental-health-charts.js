(function () {
  'use strict';
  var i18n = window.TradeJournalMentalHealthI18n;
  if (!i18n) return;

  function accentColor() { return getComputedStyle(document.documentElement).getPropertyValue('--ps-accent').trim() || '#2dd4bf'; }
  function accentRgb() { return getComputedStyle(document.documentElement).getPropertyValue('--ps-accent-rgb').trim() || '45,212,191'; }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function emptyState(ctx, w, h, text) { ctx.fillStyle = 'rgba(226,232,240,.72)'; ctx.textAlign = 'center'; ctx.font = '13px sans-serif'; ctx.fillText(text, w / 2, h / 2); }

  function setupCanvas(canvas) { canvas.width = 720; canvas.height = 260; return canvas.getContext('2d'); }

  /** entries: [{label, stress, stage, dominantEmotions}] chronological, one per logged emotion entry
   * (every stage of every trade, not one point per trade). Rendered as a single calm band whose
   * height/opacity reflects how calm that moment was - deliberately not a red/green traffic-light chart. */
  function drawEmotionalWeather(canvas, entries, tooltip) {
    var ctx = setupCanvas(canvas), w = canvas.width, h = canvas.height, rgb = accentRgb();
    ctx.clearRect(0, 0, w, h);
    if (!entries.length) { emptyState(ctx, w, h, i18n.t('mhNoData')); canvas.onmousemove = null; canvas.onmouseleave = null; return; }
    var top = 30, bottom = h - 34, bandHeight = bottom - top;
    var step = (w - 40) / Math.max(1, entries.length - 1);
    ctx.strokeStyle = 'rgba(148,163,184,.25)'; ctx.beginPath(); ctx.moveTo(20, bottom); ctx.lineTo(w - 20, bottom); ctx.stroke();
    var bars = entries.map(function (entry, i) {
      var x = entries.length > 1 ? 20 + i * step : w / 2;
      var composite = clamp01((10 - Number(entry.stress || 0)) / 10);
      var barHeight = bandHeight * (0.25 + 0.7 * composite);
      var bw = Math.max(2, step - 1);
      ctx.fillStyle = 'rgba(' + rgb + ',' + (0.22 + 0.55 * composite) + ')';
      ctx.fillRect(x - bw / 2, bottom - barHeight, bw, barHeight);
      return { x: x, y: bottom - barHeight, entry: entry };
    });
    ctx.fillStyle = 'rgba(226,232,240,.6)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(entries[0].label || '', 24, h - 12);
    ctx.fillText(entries[entries.length - 1].label || '', w - 24, h - 12);
    canvas.onmousemove = function (event) {
      if (!tooltip) return;
      var rect = canvas.getBoundingClientRect(), scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
      var mx = (event.clientX - rect.left) * scaleX;
      var hit = bars.reduce(function (best, bar) { var d = Math.abs(mx - bar.x); return (!best || d < best.d) ? { bar: bar, d: d } : best; }, null);
      if (hit && hit.d <= step / 2) {
        var tradeI18n = window.TradeJournalTradeI18n;
        var entry = hit.bar.entry, emotions = (entry.dominantEmotions || []).map(function (name) { return tradeI18n ? tradeI18n.t(name) : name; }).join(' · ');
        tooltip.textContent = (entry.label || '') + ' · ' + i18n.t('mhStressLabel') + ': ' + entry.stress + (emotions ? ' · ' + emotions : '');
        tooltip.style.display = 'block';
        tooltip.style.left = (event.clientX - rect.left) + 'px';
        tooltip.style.top = Math.max(0, (hit.bar.y / scaleY - 8)) + 'px';
      } else tooltip.style.display = 'none';
    };
    canvas.onmouseleave = function () { if (tooltip) tooltip.style.display = 'none'; };
  }

  /** triggers: AutoTrigger[]|TriggerEntry[] with {description|pattern, detectedCount}. Nodes sized by
   * detectedCount around a center "you" node; clicking a node calls onNodeClick(trigger) with its evidence. */
  function drawTriggerConstellation(canvas, triggers, onNodeClick) {
    var ctx = setupCanvas(canvas), w = canvas.width, h = canvas.height, accent = accentColor(), text = 'rgba(226,232,240,.78)';
    ctx.clearRect(0, 0, w, h);
    if (!triggers.length) { emptyState(ctx, w, h, i18n.t('mhNoTriggers')); canvas.onclick = null; return; }
    var maxCount = Math.max.apply(null, triggers.map(function (t) { return t.detectedCount || t.supportingTradeIds && t.supportingTradeIds.length || 1; }));
    var cx = w / 2, cy = h / 2;
    var nodes = triggers.map(function (t, i) {
      var angle = (i / triggers.length) * Math.PI * 2 - Math.PI / 2, radius = Math.min(100, 60 + triggers.length * 4);
      var count = t.detectedCount || (t.supportingTradeIds ? t.supportingTradeIds.length : 1);
      return { trigger: t, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius * 0.72, r: 12 + 20 * (count / maxCount) };
    });
    ctx.fillStyle = 'rgba(148,163,184,.35)'; ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.fill();
    nodes.forEach(function (n) {
      ctx.strokeStyle = 'rgba(148,163,184,.25)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(n.x, n.y); ctx.stroke();
      ctx.globalAlpha = .78; ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = text; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(String(n.trigger.description || n.trigger.pattern || '').slice(0, 18), n.x, Math.min(h - 6, n.y + n.r + 13));
    });
    canvas.onclick = function (event) {
      var rect = canvas.getBoundingClientRect(), scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
      var x = (event.clientX - rect.left) * scaleX, y = (event.clientY - rect.top) * scaleY;
      var hit = nodes.find(function (n) { return Math.hypot(x - n.x, y - n.y) <= n.r; });
      if (hit && onNodeClick) onNodeClick(hit.trigger);
    };
  }

  /** biases: CognitiveBias[]; one horizontal 7-step row per bias, filled up to its current phase. */
  function drawPhaseJourney(canvas, biases, phaseOrder) {
    var ctx = setupCanvas(canvas), w = canvas.width, h = canvas.height, accent = accentColor(), muted = 'rgba(148,163,184,.35)', text = 'rgba(226,232,240,.78)';
    ctx.clearRect(0, 0, w, h);
    if (!biases.length) return emptyState(ctx, w, h, i18n.t('mhNoPatternsYet'));
    var rowH = Math.min(50, (h - 20) / biases.length), stepGap = (w - 180) / (phaseOrder.length - 1);
    biases.forEach(function (bias, rowIndex) {
      var y = 26 + rowIndex * rowH, currentIdx = phaseOrder.indexOf(bias.cyclePhase);
      ctx.fillStyle = text; ctx.font = '12px sans-serif'; ctx.textAlign = 'start';
      ctx.fillText(String(i18n.t('mhBias_' + bias.type)).slice(0, 20), 4, y + 4);
      for (var i = 0; i < phaseOrder.length; i++) {
        var x = 160 + i * stepGap;
        if (i > 0) { ctx.strokeStyle = i <= currentIdx ? accent : muted; ctx.beginPath(); ctx.moveTo(x - stepGap + 7, y); ctx.lineTo(x - 7, y); ctx.stroke(); }
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = i <= currentIdx ? accent : muted;
        ctx.globalAlpha = i === currentIdx ? 1 : i < currentIdx ? 0.7 : 0.4;
        ctx.fill(); ctx.globalAlpha = 1;
      }
    });
  }

  /** biases: BiasSelfRating[] {type,selfRating(1-5),...}; biasTypes: the 7 curated checklist axes.
   * One polygon from the 1-5 self-ratings; the axis furthest from center (the one most worth attention,
   * per spec) is highlighted in accent + bold rather than singled out with alarm styling. */
  function drawBiasRadar(canvas, biases, biasTypes) {
    var ctx = setupCanvas(canvas), w = canvas.width, h = canvas.height, accent = accentColor(), rgb = accentRgb(), muted = 'rgba(148,163,184,.35)', text = 'rgba(226,232,240,.78)';
    ctx.clearRect(0, 0, w, h);
    if (!biases || !biases.length) return emptyState(ctx, w, h, i18n.t('mhNoBiasChecklistYet'));
    var cx = w / 2, cy = h / 2 + 4, radius = Math.min(w, h) / 2 - 48, n = biasTypes.length;
    var axes = biasTypes.map(function (type) {
      var entry = biases.find(function (b) { return b.type === type; });
      return { type: type, value: entry ? clamp01(entry.selfRating / 5) : 0 };
    });
    [0.25, 0.5, 0.75, 1].forEach(function (fraction) {
      ctx.strokeStyle = muted; ctx.beginPath();
      axes.forEach(function (axis, i) {
        var angle = (i / n) * Math.PI * 2 - Math.PI / 2, x = cx + Math.cos(angle) * radius * fraction, y = cy + Math.sin(angle) * radius * fraction;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath(); ctx.stroke();
    });
    var furthest = axes.reduce(function (best, axis) { return (!best || axis.value > best.value) ? axis : best; }, null);
    axes.forEach(function (axis, i) {
      var angle = (i / n) * Math.PI * 2 - Math.PI / 2, x = cx + Math.cos(angle) * radius, y = cy + Math.sin(angle) * radius;
      ctx.strokeStyle = muted; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
      var lx = cx + Math.cos(angle) * (radius + 28), ly = cy + Math.sin(angle) * (radius + 28);
      ctx.fillStyle = furthest === axis && axis.value > 0 ? accent : text;
      ctx.font = furthest === axis && axis.value > 0 ? 'bold 11px sans-serif' : '11px sans-serif';
      ctx.textAlign = Math.cos(angle) > 0.2 ? 'start' : Math.cos(angle) < -0.2 ? 'end' : 'center';
      ctx.fillText(String(i18n.t('mhBias_' + axis.type)).slice(0, 16), lx, ly);
    });
    ctx.strokeStyle = accent; ctx.fillStyle = 'rgba(' + rgb + ',.22)'; ctx.lineWidth = 2; ctx.beginPath();
    axes.forEach(function (axis, i) {
      var angle = (i / n) * Math.PI * 2 - Math.PI / 2, x = cx + Math.cos(angle) * radius * axis.value, y = cy + Math.sin(angle) * radius * axis.value;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.lineWidth = 1;
    axes.forEach(function (axis, i) {
      var angle = (i / n) * Math.PI * 2 - Math.PI / 2, x = cx + Math.cos(angle) * radius * axis.value, y = cy + Math.sin(angle) * radius * axis.value;
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    });
  }

  /** DOM stat tile (not canvas): big score + trend arrow + one plain-language sentence built from real deltas. */
  function buildHealthScoreTile(score, explanation) {
    var tile = el('article', 'mh-score-tile');
    if (score === null || score === undefined) { tile.append(el('p', 'mh-empty', i18n.t('mhHealthScoreNoData'))); return tile; }
    var head = el('div', 'mh-score-head');
    head.append(el('strong', '', i18n.number(score)), el('small', '', '/100'));
    if (explanation && typeof explanation.delta === 'number' && explanation.delta !== 0) {
      head.append(el('span', 'mh-score-trend ' + (explanation.delta > 0 ? 'up' : 'down'), (explanation.delta > 0 ? '↑ ' : '↓ ') + i18n.number(Math.abs(explanation.delta))));
    }
    tile.append(head);
    if (explanation) {
      var sentence = i18n.language() === 'fa'
        ? 'میانگین تعهد به پلن ' + i18n.number(explanation.avgCommitment, { maximumFractionDigits: 1 }) + ' از ۱۰ و استرس ' + i18n.number(explanation.avgStress, { maximumFractionDigits: 1 }) + ' از ۱۰ بود.'
        : i18n.language() === 'ar' ? 'كان متوسط الالتزام بالخطة ' + i18n.number(explanation.avgCommitment, { maximumFractionDigits: 1 }) + ' من 10 والتوتر ' + i18n.number(explanation.avgStress, { maximumFractionDigits: 1 }) + ' من 10.'
        : i18n.language() === 'es' ? 'El compromiso promedio con el plan fue ' + i18n.number(explanation.avgCommitment, { maximumFractionDigits: 1 }) + ' de 10 y el estrés ' + i18n.number(explanation.avgStress, { maximumFractionDigits: 1 }) + ' de 10.'
        : 'Average plan commitment was ' + i18n.number(explanation.avgCommitment, { maximumFractionDigits: 1 }) + '/10 and stress was ' + i18n.number(explanation.avgStress, { maximumFractionDigits: 1 }) + '/10 this week.';
      tile.append(el('p', '', sentence));
    }
    return tile;
  }

  window.TradeJournalMentalHealthCharts = {
    drawEmotionalWeather: drawEmotionalWeather,
    drawTriggerConstellation: drawTriggerConstellation, drawPhaseJourney: drawPhaseJourney,
    drawBiasRadar: drawBiasRadar, buildHealthScoreTile: buildHealthScoreTile
  };
}());
