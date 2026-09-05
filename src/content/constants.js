/** Shared reference values, not model-specific limits or billing promises. */
(() => {
  'use strict';
  const CC = (globalThis.ClaudeCounter = globalThis.ClaudeCounter || {});
  CC.CONST = Object.freeze({ CACHE_WINDOW_MS: 5 * 60 * 1000, CONTEXT_LIMIT_TOKENS: 200000 });
})();
