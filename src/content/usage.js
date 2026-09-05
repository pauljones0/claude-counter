/** Pure adapters for Claude's two usage protocols. Never turn unknown data into 0%. */
(() => {
  'use strict';
  const CC = (globalThis.ClaudeCounter = globalThis.ClaudeCounter || {});
  const clamp = value => Math.max(0, Math.min(100, value));
  function resetDate(value) {
    const ms = typeof value === 'number' ? value * 1000 : typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? new Date(ms).toISOString() : null;
  }
  function windowData(raw, hours, scale = 1, field = 'utilization') {
    if (!raw || !Number.isFinite(raw[field])) return null;
    return { utilization: clamp(raw[field] * scale), resets_at: resetDate(raw.resets_at), window_hours: hours };
  }
  function fromEndpoint(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const result = { five_hour: windowData(raw.five_hour, 5), seven_day: windowData(raw.seven_day, 168), scoped: [] };
    for (const entry of Array.isArray(raw.limits) ? raw.limits : []) {
      const value = windowData(entry, entry?.kind === 'session' ? 5 : 168, 1, 'percent');
      if (!value) continue;
      if (entry.kind === 'session') result.five_hour ??= value;
      if (entry.kind === 'weekly_all') result.seven_day ??= value;
      if (entry.kind === 'weekly_scoped') result.scoped.push({ ...value, label: String(entry.scope?.model?.display_name || entry.scope?.surface || 'Model').slice(0,80) });
    }
    return result.five_hour || result.seven_day || result.scoped.length ? result : null;
  }
  function fromStream(raw) {
    const result = { five_hour: windowData(raw?.windows?.['5h'], 5, 100), seven_day: windowData(raw?.windows?.['7d'], 168, 100) };
    return result.five_hour || result.seven_day ? result : null;
  }
  function merge(previous, next, partial = false) {
    if (!partial) return next;
    return { five_hour: next.five_hour ?? previous?.five_hour ?? null, seven_day: next.seven_day ?? previous?.seven_day ?? null, scoped: previous?.scoped ?? [] };
  }
  CC.usage = { fromEndpoint, fromStream, merge };
})();
