/** Page-world read-only adapter. Only Claude API responses are inspected. */
(() => {
  'use strict';
  if (window.__claudeCounterBridge) return;
  window.__claudeCounterBridge = true;
  const marker = 'ClaudeCounter';
  const origin = location.origin;
  const originalFetch = window.fetch.bind(window);
  const post = (type, payload) => window.postMessage({ cc: marker, type, payload }, origin);
  const respond = (requestId, ok, payload, error) => window.postMessage({ cc: marker, type: 'cc:response', requestId, ok, payload, error }, origin);
  function metadata(url) {
    if (url.origin !== origin) return null;
    const match = url.pathname.match(/^\/api\/organizations\/([^/]+)\/chat_conversations\/([^/]+)(?:\/(completion|retry_completion))?$/);
    return match ? { orgId: match[1], conversationId: match[2], completion: !!match[3] } : null;
  }
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name].bind(history);
    history[name] = (...args) => { const result = original(...args); window.dispatchEvent(new CustomEvent('cc:urlchange')); return result; };
  }
  async function conversationResponse(meta, response) {
    try {
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data?.chat_messages)) post('cc:conversation', { ...meta, data });
    } catch { /* An inspection failure must not affect Claude. */ }
  }
  async function streamResponse(meta, response) {
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '', dataLines = [];
    function dispatch() {
      if (!dataLines.length) return;
      try {
        const data = JSON.parse(dataLines.join('\n'));
        if (data?.type === 'message_limit' && data.message_limit) post('cc:message_limit', { ...meta, messageLimit: data.message_limit });
      } catch { /* Other stream events are not usage data. */ }
      dataLines = [];
    }
    function line(text) {
      if (!text) dispatch();
      else if (text.startsWith('data:')) dataLines.push(text.slice(5).replace(/^ /, ''));
    }
    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        // Keep a trailing CR until the next chunk so split CRLF is one newline.
        let match;
        while ((match = /\r\n|\n|\r(?!$)/.exec(buffer))) {
          line(buffer.slice(0, match.index));
          buffer = buffer.slice(match.index + match[0].length);
        }
        if (buffer.length + dataLines.reduce((n, s) => n + s.length, 0) > 1048576) { void reader.cancel().catch(() => {}); break; }
        if (done) { if (buffer) line(buffer.replace(/\r$/, '')); dispatch(); break; }
      }
    } catch { /* Best effort, including user-aborted generation. */ }
    finally { reader.releaseLock(); post('cc:generation_end', meta); }
  }
  window.fetch = async (...args) => {
    let url, meta;
    try { url = new URL(args[0] instanceof Request ? args[0].url : args[0], origin); meta = metadata(url); } catch {}
    const method = String(args[1]?.method || (args[0] instanceof Request ? args[0].method : 'GET')).toUpperCase();
    if (meta?.completion && method === 'POST') post('cc:generation_start', meta);
    const response = await originalFetch(...args);
    try {
      if (meta?.completion && response.ok && response.headers.get('content-type')?.includes('text/event-stream')) void streamResponse(meta, response.clone());
      else if (meta && !meta.completion && url.searchParams.has('tree')) void conversationResponse(meta, response.clone());
    } catch { /* Return the exact original response even if cloning fails. */ }
    return response;
  };
  const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
  const inFlight = new Map();
  async function fetchJson(path) {
    if (!inFlight.has(path)) {
      const promise = originalFetch(origin + path, { method: 'GET', credentials: 'include', signal: AbortSignal.timeout(15000) }).then(response => {
        if (!response.ok) throw new Error(`Claude request failed (${response.status})`);
        return response.json();
      }).finally(() => inFlight.delete(path));
      inFlight.set(path, promise);
    }
    return inFlight.get(path);
  }
  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== origin) return;
    const data = event.data;
    if (data?.cc !== marker || data.type !== 'cc:request' || typeof data.requestId !== 'string' || data.requestId.length > 100) return;
    const { requestId, kind, payload } = data;
    try {
      if (kind === 'ping') { respond(requestId, true, { ready: true }); return; }
      if (!id(payload?.orgId)) throw new Error('Invalid organization');
      if (kind === 'usage') {
        const json = await fetchJson(`/api/organizations/${payload.orgId}/usage`);
        respond(requestId, true, json);
      } else if (kind === 'conversation' && id(payload.conversationId)) {
        const json = await fetchJson(`/api/organizations/${payload.orgId}/chat_conversations/${payload.conversationId}?tree=true&rendering_mode=messages&render_all_tools=true`);
        if (!Array.isArray(json?.chat_messages)) throw new Error('Invalid conversation response');
        post('cc:conversation', { orgId: payload.orgId, conversationId: payload.conversationId, data: json });
        respond(requestId, true, null);
      } else throw new Error('Unsupported request');
    } catch (error) { respond(requestId, false, null, error.message); }
  });
})();
