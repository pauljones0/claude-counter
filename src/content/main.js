/** App lifecycle, account isolation, and bounded refresh scheduling. */
(() => {
  'use strict';
  const CC = (globalThis.ClaudeCounter = globalThis.ClaudeCounter || {});
  if (CC.__started) return;
  CC.__started = true;
  const POLL_MS = 60000;
  const RETRY_MS = 15000;
  let org = null, conversation = null, route = '', revision = 0, metricRevision = 0;
  let usage = null, usageRequest = null, conversationRequest = null;
  let lastAttempt = -Infinity, streamRevision = 0, accountRevision = 0;
  let disposed = false;
  const cleanup = [];
  const ui = new CC.ui.CounterUI({ onUsageRefresh: () => refreshUsage(true) });
  ui.initialize();
  const ready = CC.injectBridgeOnce();
  function account() {
    try { return decodeURIComponent(document.cookie.split(/;\s*/).find(x => x.startsWith('lastActiveOrg='))?.slice(14) || '') || null; }
    catch { return null; }
  }
  function applyUsage(next, partial = false) {
    if (!next) return false;
    usage = CC.usage.merge(usage, next, partial);
    ui.setStatus('');
    ui.setUsage(usage);
    return true;
  }
  async function refreshUsage(manual = false) {
    if (disposed || !org || usageRequest) return;
    if (!manual && Date.now() - lastAttempt < RETRY_MS) return;
    lastAttempt = Date.now();
    const requestedOrg = org, requestedRevision = accountRevision, streamAtStart = streamRevision;
    const request = {};
    usageRequest = request;
    try {
      if (!(await ready)) throw new Error('Bridge unavailable');
      const raw = await CC.bridge.requestUsage(requestedOrg);
      if (disposed || requestedOrg !== org || requestedRevision !== accountRevision) return;
      // A response requested before a live update must not overwrite fresher data.
      if (streamAtStart !== streamRevision) return;
      if (!applyUsage(CC.usage.fromEndpoint(raw))) throw new Error('Usage unavailable');
    } catch {
      if (!disposed && requestedOrg === org && requestedRevision === accountRevision) ui.setStatus(usage ? 'Usage may be stale · refresh to retry' : 'Usage unavailable · refresh to retry');
    } finally { if (usageRequest === request) usageRequest = null; }
  }
  async function refreshConversation() {
    if (disposed || !org || !conversation || conversationRequest) return;
    const requestedOrg = org, requestedConversation = conversation;
    const request = {};
    conversationRequest = request;
    try {
      if (await ready) await CC.bridge.requestConversation(requestedOrg, requestedConversation);
    } catch { /* Keep unknown metrics unknown; never render an HTTP error as zero. */ }
    finally { if (conversationRequest === request) conversationRequest = null; }
  }
  async function receiveConversation(payload) {
    if (disposed || payload?.orgId !== org || payload?.conversationId !== conversation || !Array.isArray(payload?.data?.chat_messages)) return;
    const version = ++metricRevision, requestedRevision = revision;
    try {
      const metrics = await CC.tokens.computeConversationMetrics(payload.data);
      if (!disposed && version === metricRevision && requestedRevision === revision) ui.setConversationMetrics(metrics);
    } catch { /* Tokenizer failures should not fabricate an empty conversation. */ }
  }
  function syncRoute() {
    const nextOrg = account();
    const nextRoute = location.pathname;
    const nextConversation = nextRoute.match(/^\/chat\/([^/]+)\/?$/)?.[1] || null;
    if (nextOrg === org && nextRoute === route) return;
    const changedOrg = org !== nextOrg;
    org = nextOrg; route = nextRoute; conversation = nextConversation;
    revision++; metricRevision++;
    conversationRequest = null;
    ui.setConversationMetrics();
    if (changedOrg) {
      accountRevision++;
      usage = null; usageRequest = null; lastAttempt = -Infinity;
      ui.setUsage(null);
      ui.setStatus(org ? 'Loading usage…' : 'Sign in to Claude to see usage');
    }
    ui.attach();
    void refreshUsage();
    void refreshConversation();
  }
  cleanup.push(CC.bridge.on('cc:conversation', receiveConversation));
  cleanup.push(CC.bridge.on('cc:message_limit', payload => {
    if (payload?.orgId !== org) return;
    const parsed = CC.usage.fromStream(payload.messageLimit);
    if (parsed) { streamRevision++; applyUsage(parsed, true); }
  }));
  cleanup.push(CC.bridge.on('cc:generation_start', payload => {
    if (payload?.orgId === org && payload?.conversationId === conversation) ui.setPendingCache(true);
  }));
  cleanup.push(CC.bridge.on('cc:generation_end', payload => {
    if (payload?.orgId === org && payload?.conversationId === conversation) void refreshConversation();
  }));
  function listen(target, type, fn) { target.addEventListener(type, fn); cleanup.push(() => target.removeEventListener(type, fn)); }
  function tick() {
    if (disposed || document.hidden) return;
    syncRoute();
    ui.tick();
    const now = Date.now();
    const expired = [usage?.five_hour, usage?.seven_day, ...(usage?.scoped || [])].some(w => w?.resets_at && Date.parse(w.resets_at) <= now);
    if (now - lastAttempt >= (expired ? RETRY_MS : POLL_MS)) void refreshUsage();
  }
  listen(window, 'cc:urlchange', syncRoute);
  listen(window, 'popstate', syncRoute);
  listen(document, 'visibilitychange', tick);
  let branchTimer;
  listen(document, 'click', event => {
    if (event.target instanceof Element && event.target.closest('button[aria-label="Previous"],button[aria-label="Next"]')) {
      clearTimeout(branchTimer);
      branchTimer = setTimeout(refreshConversation, 250);
    }
  });
  const interval = setInterval(tick, 1000);
  CC.destroy = () => {
    disposed = true;
    clearInterval(interval); clearTimeout(branchTimer);
    cleanup.forEach(fn => fn());
    ui.destroy(); CC.bridge.destroy(); CC.__started = false;
  };
  listen(window, 'pagehide', event => { if (!event.persisted) CC.destroy(); });
  syncRoute();
})();
