# Claude Counter

A Firefox and Chromium extension showing approximate conversation tokens, an estimated cache timer, and Claude's session and weekly usage below the composer. Based on [she-llac/claude-counter](https://github.com/she-llac/claude-counter), maintained here for the [Firefox listing](https://addons.mozilla.org/firefox/addon/claude-counter/).

Version 0.5.0 fixes the Chat/Cowork composer overlap and supports current and legacy header anchors. Usage groups wrap at narrow widths. The refresh button works with keyboard and pointer; progress bars expose accessible names and values. Hover a usage group for the exact local reset time.

Usage loads on the home/new-chat screen, refreshes about once a minute while visible, and updates from relevant live response streams. Model-specific weekly caps appear when Claude supplies them. Failed requests retain the last value with a stale notice, and account switches clear prior account data. Hidden tabs pause UI ticking and polling.

## Install

For permanent Firefox installation, use the signed version on [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/claude-counter/). Firefox 142 or later is required.

For development, run `npm ci && npm run build`, then select `dist/firefox/manifest.json` using **about:debugging → This Firefox → Load Temporary Add-on**. The generated Firefox ZIP is an unsigned AMO upload artifact; renaming it to XPI does not sign it.

For Chrome/Edge, use **Extensions → Developer mode → Load unpacked** and select `dist/chrome`. The generated [userscript](userscript/claude-counter.user.js) is an alternative for managers that support execution in the page world; do not run both installations together.

## Build and verify

Use Node.js 22+, npm, and a clean checkout:

```sh
npm ci
npm run build
npm test
npx playwright install --with-deps firefox chromium
npm run test:browser
npm run test:integration
npm run lint:addon
```

`./build.sh firefox` and `./build.sh chrome` remain available. Build outputs are in `dist/`, with SHA-256 checksums. The tokenizer is bundled from pinned `gpt-tokenizer@4.0.0` sources without minification; application modules are copied without transpilation. ZIP ordering and timestamps are fixed. The userscript is generated from the same source modules and CSS.

## Architecture

| Module | Responsibility |
| --- | --- |
| `src/injected/bridge.js` | Early page-world fetch observation, bounded SSE parser, validated read-only RPC |
| `src/content/bridge-client.js` | Isolated-world RPC, readiness handshake, timeouts and disposal |
| `src/content/usage.js` | Pure endpoint/stream normalization and partial snapshot merging |
| `src/content/tokens.js` | Selected-branch traversal, binary exclusion, local hashing and token cache |
| `src/content/anchors.js` | Current and legacy Claude layout compatibility |
| `src/content/ui.js` | Data-driven usage rows, rendering and DOM lifecycle |
| `src/content/main.js` | Account/route state, stale-response guards and bounded scheduling |

Only the bridge runs in the page world. UI and token processing remain in the extension's isolated content-script world. The bridge is registered at document start, so it does not depend on injecting a page script through the site's CSP. All network requests remain read-only and confined to claude.ai.

## Accuracy and privacy

Tokens are an approximation of exposed text, not Claude's internal token count. System prompts, project knowledge, images/PDFs and hidden reasoning are excluded. Compaction can invalidate the estimate. The mini bar uses a 200k reference scale, not a promise about any model's context limit. The five-minute cache timer is an estimate and does not establish billing or subscription discounts. Usage values come from Claude's undocumented API and may change format.

No analytics, developer servers, stored conversation history, API keys or added storage permissions. Authenticated requests go to Claude itself. See [Privacy](PRIVACY.md), [research and decisions](research/REVIEW.md), [fork inventory](research/INVENTORY.md), and [Firefox submission notes](store/firefox/REVIEWER_NOTES.md).

## Credits and license

Original extension: [she_llac](https://github.com/she-llac/claude-counter). Tokenizer: [Bazyli Brzoska / gpt-tokenizer](https://github.com/niieani/gpt-tokenizer). Community findings and competing implementations informed this refactor; source links and adoption decisions are in the research report. MIT; see [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md). Independent project, not affiliated with Anthropic.
