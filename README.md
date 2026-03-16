# Claude Counter

**Stop guessing how much Claude you have left.**

A minimal browser extension that adds real-time token counting, cache timing, and full-precision usage bars directly into [claude.ai](https://claude.ai). No extra tabs, no guesswork — everything lives right in the composer.

![Claude Counter screenshot](./screenshot.png)

## Features

### Token Counter
Approximate token count for your current conversation, with a mini progress bar against Claude's 200k context limit. Know when you're running long *before* Claude starts compacting your context.

### Cache Timer
Live countdown showing how long your conversation stays cached. This matters because **cache reads are free on subscription plans** — if you send a message while cached (within 5 minutes of the last response), your entire conversation history costs zero credits. The timer tells you the optimal window to keep chatting.

### Usage Bars
Session (5-hour) and weekly (7-day) usage bars with percentage and reset countdowns. These are **more accurate than Claude's own /usage page** because they use the unrounded utilization fractions from Claude's live SSE stream rather than the rounded percentages.

- Bars turn red at 90% utilization as a warning
- A vertical marker shows your current position in the time window
- Click to manually refresh usage data

## Why This Matters

Claude subscriptions use an internal credit system. Your plan has both a 5-hour session limit and a 7-day weekly limit — and the actual economics are surprising:

- **Max 5x plan** overdelivers significantly: ~6x session limit and 8x+ weekly limits
- **Cache reads are entirely free** on subscriptions (vs. 10% cost on the API)
- A warm-cache message can be **36x cheaper** than equivalent API pricing

Without visibility into these limits, you hit walls unexpectedly. Claude Counter makes both limits visible at a glance and helps you take advantage of the cache window for maximum value.

*For the full analysis of Claude's credit system, see [Suspiciously Precise Floats](https://she-llac.com/claude-limits) by she_llac.*

## Installation

### Chrome Web Store
*(Coming soon — see manual install below)*

### Firefox Add-ons
*(Coming soon — see manual install below)*

### Manual Install

**Chrome / Edge / Chromium**
1. Download [`claude-counter-0.4.2-chrome.zip`](../../releases/download/v0.4.2/claude-counter-0.4.2-chrome.zip)
2. Go to `chrome://extensions` and enable **Developer mode**
3. Drag and drop the zip onto the page

**Firefox**
1. Download [`claude-counter-0.4.2-firefox.xpi`](../../releases/download/v0.4.2/claude-counter-0.4.2-firefox.xpi)
2. Drag it into any Firefox window and click **Add**

**Userscript**
1. Install the userscript from [`claude-counter.user.js`](./userscript/claude-counter.user.js)

## Building from Source

```bash
# Package for both stores
./build.sh

# Or individually
./build.sh chrome    # -> dist/claude-counter-0.4.2-chrome.zip
./build.sh firefox   # -> dist/claude-counter-0.4.2-firefox.xpi
```

## How It Works

The extension intercepts Claude's own API traffic (read-only) to extract the data it displays:

1. **Fetch interception** — Wraps `window.fetch` in the page context to read SSE streams and conversation tree responses without breaking claude.ai
2. **SSE parsing** — Extracts `message_limit` events from completion streams for real-time, full-precision usage data
3. **Token counting** — Walks the conversation tree from leaf to root, tokenizes visible content blocks (text, tool_use, tool_result) using a vendored o200k_base tokenizer, and caches results by content fingerprint
4. **DOM injection** — Uses MutationObserver to attach UI elements and re-attach them when claude.ai's SPA navigation replaces DOM nodes
5. **Bridge architecture** — A content script <-> page script bridge over `window.postMessage` allows the content script to request data that requires page-origin cookies

## Architecture

```
src/
  content/
    constants.js      # DOM selectors, timing constants, color tokens
    bridge-client.js   # Content-script RPC client (postMessage)
    tokens.js          # Token counting, conversation tree walking, caching
    ui.js              # All DOM creation, rendering, tooltips, theme support
    main.js            # Orchestrator: URL changes, SSE events, refresh logic
  injected/
    bridge.js          # Page-context fetch wrapper, SSE parser, RPC server
  styles.css           # cc-prefixed styles with CSS custom properties
  vendor/
    o200k_base.js      # Vendored tokenizer (MIT, gpt-tokenizer)
```

## Privacy

- **All processing happens locally** — zero external servers, zero tracking
- Reads only the `lastActiveOrg` cookie to query Claude's own `/usage` endpoint
- Makes requests only to `claude.ai` — never to any third-party server
- No data collection whatsoever
- Open source — inspect every line

## Credits

- Original extension by [she_llac](https://github.com/she-llac/claude-counter)
- Token counting via [gpt-tokenizer](https://github.com/niieani/gpt-tokenizer) (MIT)
- Inspired by [Claude Usage Tracker](https://github.com/lugia19/Claude-Usage-Extension) by lugia19

## License

MIT
