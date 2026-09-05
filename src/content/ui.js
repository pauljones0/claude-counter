/** Rendering and lifecycle; data adapters and host anchors live separately. */
(() => {
  'use strict';
  const CC = (globalThis.ClaudeCounter = globalThis.ClaudeCounter || {});
  function element(tag, className, text) {
    const el = document.createElement(tag);
    el.className = className;
    if (text) el.textContent = text;
    return el;
  }
  function countdown(ms, now = Date.now()) {
    const seconds = Math.max(0, Math.ceil((ms - now) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  }
  function bar(label) {
    const root = element('span', 'cc-bar');
    root.setAttribute('role', 'progressbar');
    root.setAttribute('aria-label', label);
    root.setAttribute('aria-valuemin', '0');
    root.setAttribute('aria-valuemax', '100');
    const fill = element('span', 'cc-bar__fill');
    const marker = element('span', 'cc-bar__marker');
    root.append(fill, marker);
    return { root, fill, marker };
  }
  function updateBar(view, value, reset, hours) {
    const pct = Math.max(0, Math.min(100, value));
    view.fill.style.width = `${pct}%`;
    view.root.setAttribute('aria-valuenow', String(Math.round(pct * 10) / 10));
    view.root.classList.toggle('cc-warn', pct >= 90);
    view.marker.hidden = !Number.isFinite(reset);
    if (Number.isFinite(reset)) view.marker.style.left = `${Math.max(0, Math.min(100, 100 * (1 - (reset - Date.now()) / (hours * 3600000))))}%`;
  }
  class CounterUI {
    constructor({ onUsageRefresh } = {}) {
      this.onUsageRefresh = onUsageRefresh;
      this.usage = null;
      this.metrics = null;
      this.groups = new Map();
      this.pendingCache = false;
      this.refreshing = false;
      this.frame = null;
    }
    initialize() {
      this.headerContainer = element('div', 'cc-header');
      this.lengthDisplay = element('span', 'cc-tokenText');
      this.contextBar = bar('Approximate context usage');
      this.contextBar.root.classList.add('cc-bar--mini');
      this.cacheDisplay = element('span', 'cc-cacheText');
      this.headerContainer.append(this.lengthDisplay, this.contextBar.root, this.cacheDisplay);
      this.headerContainer.title = 'Approximate visible text tokens using a generic tokenizer. Excludes system prompts, project knowledge, images and PDFs. Unreliable after compaction. Bar reference: 200k tokens, not a model-specific limit. Cache time is an estimate, not a billing guarantee.';
      this.headerContainer.tabIndex = 0;
      this.usageLine = element('div', 'cc-usageRow');
      this.usageLine.setAttribute('role', 'group');
      this.usageLine.setAttribute('aria-label', 'Claude usage');
      this.windows = element('div', 'cc-windows');
      this.refreshButton = element('button', 'cc-refresh', '↻');
      this.refreshButton.type = 'button';
      this.refreshButton.setAttribute('aria-label', 'Refresh usage');
      this.refreshButton.title = 'Refresh usage';
      this.status = element('span', 'cc-status');
      this.status.setAttribute('role', 'status');
      this.usageLine.append(this.windows, this.refreshButton, this.status);
      this.refreshButton.addEventListener('click', () => this.refresh());
      this.observer = new MutationObserver(records => {
        if (records.every(record => this.usageLine.contains(record.target) || this.headerContainer.contains(record.target))) return;
        if (this.frame !== null) return;
        this.frame = requestAnimationFrame(() => { this.frame = null; this.attach(); });
      });
      this.observer.observe(document.body, { childList: true, subtree: true });
      this.render();
      this.attach();
    }
    async refresh() {
      if (this.refreshing || !this.onUsageRefresh) return;
      this.refreshing = true;
      this.refreshButton.disabled = true;
      this.usageLine.setAttribute('aria-busy', 'true');
      try { await this.onUsageRefresh(); }
      catch { this.setStatus('Unable to refresh'); }
      finally { this.refreshing = false; this.refreshButton.disabled = false; this.usageLine.removeAttribute('aria-busy'); }
    }
    attach() { this.attachHeader(); this.attachUsageLine(); }
    attachHeader() {
      const anchor = CC.anchors.headerAnchor();
      if (anchor?.parent && this.headerContainer.parentElement !== anchor.parent) anchor.parent.prepend(this.headerContainer);
      else if (anchor?.after && anchor.after.nextElementSibling !== this.headerContainer) anchor.after.after(this.headerContainer);
      else if (!anchor) this.headerContainer.remove();
    }
    attachUsageLine() {
      const anchor = CC.anchors.composerAnchor();
      if (anchor && anchor.nextElementSibling !== this.usageLine) anchor.after(this.usageLine);
      else if (!anchor) this.usageLine.remove();
    }
    setStatus(message = '') { if (this.status.textContent !== message) this.status.textContent = message; this.status.hidden = !message; }
    setPendingCache(value) { this.pendingCache = value; this.renderHeader(); }
    setConversationMetrics(metrics) { this.metrics = metrics || null; this.pendingCache = false; this.renderHeader(); }
    setUsage(usage) { this.usage = usage; this.renderUsage(); }
    renderHeader() {
      const tokens = this.metrics?.totalTokens;
      this.headerContainer.hidden = !Number.isFinite(tokens);
      if (!Number.isFinite(tokens)) return;
      const text = `~${tokens.toLocaleString()} tokens`;
      if (this.lengthDisplay.textContent !== text) this.lengthDisplay.textContent = text;
      updateBar(this.contextBar, tokens / CC.CONST.CONTEXT_LIMIT_TOKENS * 100, NaN, 0);
      this.contextBar.root.hidden = tokens >= CC.CONST.CONTEXT_LIMIT_TOKENS;
      const until = this.metrics.cachedUntil;
      const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      const cache = this.pendingCache ? 'Generating…' : seconds > 0 ? `cache estimate ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '';
      if (this.cacheDisplay.textContent !== cache) this.cacheDisplay.textContent = cache;
      this.cacheDisplay.hidden = !cache;
    }
    renderUsage() {
      const entries = [['session', 'Session', this.usage?.five_hour], ['weekly', 'Weekly', this.usage?.seven_day], ...(this.usage?.scoped || []).map((w, i) => [`scoped-${i}`, w.label, w])].filter(([, , w]) => Number.isFinite(w?.utilization));
      for (const [key, view] of this.groups) if (!entries.some(([id]) => id === key)) { view.root.remove(); this.groups.delete(key); }
      for (const [key, label, data] of entries) {
        let view = this.groups.get(key);
        if (!view) {
          view = { root: element('div', 'cc-usageGroup'), text: element('span', 'cc-usageText'), bar: bar(`${label} usage`) };
          view.root.tabIndex = 0;
          view.root.append(view.text, view.bar.root);
          this.groups.set(key, view);
          this.windows.append(view.root);
        }
        const reset = data.resets_at ? Date.parse(data.resets_at) : NaN;
        const expired = Number.isFinite(reset) && reset <= Date.now();
        const suffix = expired ? ' · awaiting reset' : Number.isFinite(reset) ? ` · ${countdown(reset)}` : '';
        const text = `${label}: ${Math.round(data.utilization * 10) / 10}%${suffix}`;
        if (view.text.textContent !== text) view.text.textContent = text;
        view.root.title = `${label} usage${Number.isFinite(reset) ? `; resets ${new Date(reset).toLocaleString()}` : ''}. The marker shows elapsed time in the window.`;
        updateBar(view.bar, data.utilization, reset, data.window_hours);
      }
      this.windows.hidden = entries.length === 0;
      if (!entries.length && !this.status.textContent) this.setStatus('Usage unavailable');
    }
    render() { this.renderHeader(); this.renderUsage(); }
    tick() { this.render(); }
    destroy() { this.observer.disconnect(); if (this.frame !== null) cancelAnimationFrame(this.frame); this.headerContainer.remove(); this.usageLine.remove(); }
  }
  CC.ui = { CounterUI, countdown };
})();
