/** Layout compatibility is isolated here; no page styles or controls are changed. */
(() => {
  'use strict';
  const CC = (globalThis.ClaudeCounter = globalThis.ClaudeCounter || {});
  const inFlow = el => !['absolute', 'fixed'].includes(getComputedStyle(el).position);
  function composerAnchor() {
    const composer = document.querySelector('[data-cds="ChatComposer"]');
    if (composer) {
      // Outside the card: absolute bottom controls remain anchored to its original
      // bottom edge. Adding height INSIDE the card can move those controls again.
      const card = Array.from(composer.children).find(el => !el.classList.contains('cc-usageRow'));
      if (card && inFlow(card)) return card;
    }
    const model = document.querySelector('[data-testid="model-selector-dropdown"]');
    if (!model) return null;
    const grid = model.closest('[data-testid="chat-input-grid-container"]');
    if (grid && inFlow(grid)) return grid;
    for (let el = model.parentElement; el && el !== document.body; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (inFlow(el) && style.display === 'flex' && style.flexDirection === 'column' && el.querySelector('[contenteditable="true"],textarea')) return el;
    }
    return null;
  }
  function headerAnchor() {
    const actions = document.querySelector('#dframe-header-actions-slot');
    if (actions) return { parent: actions };
    const title = document.querySelector('[data-testid="chat-title-split"], [data-testid="chat-menu-trigger"]');
    if (!title) return null;
    return { after: title.matches('[data-testid="chat-title-split"]') ? title : title.closest('.chat-project-wrapper') || title.parentElement };
  }
  CC.anchors = { composerAnchor, headerAnchor };
})();
