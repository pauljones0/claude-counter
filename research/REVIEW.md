# Upstream and ecosystem review — 2026-09-05

The starting fork was pauljones0/claude-counter v0.4.3. Its runtime changes from she-llac/main were primarily documentation; upstream's last pushed commit was March 21, 2026. The modern-layout fixes are in community forks and unmerged PRs, rather than upstream main.

The paginated forks API returned 275 entries; metadata reported 276. Every listed default branch was compared against upstream, then all accessible branch heads were enumerated and distinct non-default heads compared. Twenty-three default branches had ahead commits. See [the complete inventory](INVENTORY.md). One listed repository, SalwynC, was unavailable on repeat repository/branch/compare requests. The unrelated-history da1g settings branch was inspected through its tree and source after compare failed. This does not claim access to private, deleted, unlisted, or future forks.

## Adopted findings and ideas

| Source | Finding | Implementation decision |
| --- | --- | --- |
| [khalidhasananik PR #50](https://github.com/she-llac/claude-counter/pull/50), [ashishahir1 PR #46](https://github.com/she-llac/claude-counter/pull/46), [ben-hotelminder](https://github.com/ben-hotelminder/claude-counter) | Absolute composer controls overlap the old insertion point; model selector moves to the footer | Anchor the usage row after the composer card, outside its absolute controls. Keep a bounded legacy fallback. Do not append into a card whose absolute bottom controls may shift with its height. |
| [RautTushar PR #49](https://github.com/she-llac/claude-counter/pull/49), [m-blank](https://github.com/m-blank/claude-counter), johncroc, ahmedzukhrufrao, Lalithjithan, Arif-2747 | Removed chat-menu selector | Dedicated header compatibility adapter supporting actions slot, current title, and legacy wrapper. |
| [DizzyFop](https://github.com/DizzyFop/claude-counter), [gustavomoura628](https://github.com/gustavomoura628/claude-counter), [Kachroo-cheena PR #15](https://github.com/she-llac/claude-counter/pull/15) | Other-device activity is stale for an hour; hidden tabs waste work | Poll visible tabs every minute; skip hidden ticks; refresh after visibility returns; bound failure retries. |
| [DizzyFop](https://github.com/DizzyFop/claude-counter) | HTTP error bodies became zero counts; binary tool results inflated counts; special-token strings zeroed messages | Check HTTP and payload shape, sanitize nested binary/reasoning, allow literal special tokens, preserve stale usage visibly. |
| [UltraSunDK](https://github.com/UltraSunDK/claude-counter), [ashishahir1](https://github.com/ashishahir1/claude-counter), DizzyFop | New limits array and model-scoped weekly caps | Normalize limits generically and render separate labeled groups. Preserve scoped caps across partial SSE updates. Do not hard-code Fable as the only model. |
| [danparshall PR #42](https://github.com/she-llac/claude-counter/pull/42) | Testable parsers, cyclic parent chains, asynchronous token work | Extract pure usage adapters, fail explicitly on malformed trees, test branch selection/cache invalidation, guard obsolete async metrics. |
| [Sriram-ai-prog PR #34](https://github.com/she-llac/claude-counter/pull/34), [dedust1](https://github.com/dedust1/claude-counter) | Origin checks, path validation, keyboard/ARIA support | Validate bridge requests and sources; confine read-only fetches; accessible native refresh button/progress values. Hash text locally rather than exposing a hash RPC. |
| [XeCipher PR #14](https://github.com/she-llac/claude-counter/pull/14), DizzyFop | Exact local reset times | Native hover descriptions retain exact returned timestamps without artificial five-minute rounding. |
| [joker47man](https://github.com/joker47man/claude-counter-fork), [MarkusSela](https://github.com/MarkusSela/claude-tracker-safari) | Userscript drift and confusing unsigned XPI releases | Generate userscript from the same source; build deterministic ZIPs and source archive; label unsigned Firefox uploads accurately. |

The code was independently refactored around these findings; no fork's release binary, identity, signing metadata, or wholesale implementation was imported. Existing upstream MIT attribution is retained. The tokenizer is rebuilt from an explicitly pinned MIT package with readable output and its full notice.

## Other changed forks / ideas not selected

- hey-naf, Rohx24 and VarunAgnihotri: layout fixes overlap the adopted work; their stored snapshots add account/expiry complexity. Use fresh in-memory state and explicit unavailable values instead of a 0% fallback. Fix paths by manifest registration, rather than copying their packaging assumptions.
- RahulBiju-dev: per-model comparisons informed generic rendering. Gemini support and removal of Claude's own overuse UI would expand this extension's purpose and access.
- thisisjoyjacob and OmkarPujeri: chimes and desktop threshold/reset alerts require additional permissions/background behavior. Keep as optional future work.
- hamedrajhi: arbitrary-text popup and worker are useful but separate from repairing the in-chat counter. Worker offloading remains a profiling-driven follow-up.
- Blackspirits, havylliard, henrique-carvalho-dev and r00kieL: localization and settings are useful future work; don't copy single-language replacements or stale economic claims. Responsive wrapping already handles the French UI shown in the bug report.
- FarGin13: traffic-light warnings are already represented by warning colors and numeric accessible values. Its handoff modal and automatic prompt insertion would change the user's chat workflow; not imported.
- GirishMahabir, KarthikeyaGSI, deadbranch-forks, WPCodeLab, md-shoaib-alam: predominantly packaging, identity, documentation or image changes; keep this listing's own ID/icons and clean build outputs. Never import another fork's signed META-INF data.
- da1g feature-settings: reviewed popup source after discovering unrelated history. Per-bar settings/history introduce persistence; defer to a deliberate settings feature.
- usrr720 curfew: fixed peak-hour countdown depends on temporary service policy and cannot be treated as universal.
- AsimGraphicx: plan-only branch, no code diff to adopt.
- danparshall web-context-estimate and Sriram model tables: model-name-to-context mappings include provisional assumptions. Keep an explicitly labeled reference bar rather than promise model-specific limits we cannot verify from the payload.
- joker47man /code marker: separate DOM surface with its own native popover. Defer until production /code markup can be tested; do not guess its layout from chat fixtures.

## Competing / independently maintained repositories

| Repository | What was checked | Useful takeaway |
| --- | --- | --- |
| [lugia19/Claude-Usage-Extension](https://github.com/lugia19/Claude-Usage-Extension) | README, data sources and privacy model | Thorough accounting explicitly acknowledges hidden data. Adopt honest estimate limitations; do not add Firebase synchronization or API-key handling. |
| [claude-monitor/claude-monitor-browser-extension](https://github.com/claude-monitor/claude-monitor-browser-extension) | README and background.js usage mapper/fetch error handling | Unknown data must remain unknown, exact reset timestamps and scoped caps help users. Adopt these behaviors. History, badge, spending and alerts are larger optional features. |
| [cfranci/claude-usage-extension](https://github.com/cfranci/claude-usage-extension) | README and background.js OAuth fetch/poll logic | Configurable polling and a toolbar view are useful options. Avoid manual credential collection and broader API hosts for this release. |
| [MarkusSela/claude-tracker-safari](https://github.com/MarkusSela/claude-tracker-safari) | README, source tree and bridge-client implementation | One source for multiple targets and stacked layout. Adopt shared generation and responsive rows; not desktop patching, Safari packaging or remotely fetched author cards. |
| [ashishahir1/claude-counter](https://github.com/ashishahir1/claude-counter) | main.js limits parser and layout PR | Generic per-model limits and explicit missing-anchor handling are useful; implemented with separate adapters. |
| [kr1shnasomani/claude-token-counter](https://github.com/kr1shnasomani/claude-token-counter) | Repository metadata and README | Early MAIN-world bridge, unknown free-plan states and shared build ideas align with this refactor. Export and toolbar settings are substantial optional features, deferred to avoid changing the in-chat workflow and adding persistence. |
| [amanji0/Claude-token-counter](https://github.com/amanji0/Claude-token-counter) | Discovery and repository metadata | Glass-style presentation is a design alternative, not an improvement to the minimal Firefox counter's reliability. |

## Validation and boundaries

The original private emailed screenshot was inspected locally. It shows the usage row running across Chat/Cowork and the model/microphone toolbar. No sender details or private screenshot are included in this repository or release.

Local browser fixtures recreate the documented absolute-control layout, moved selector and legacy grid, in Firefox and Chromium. They test 320/620/900/1512 widths, both themes, DOM replacement, refresh keyboard operation, overflow and control separation. Full Firefox app tests cover home startup, failed HTTP responses, bounded retries, account switching, metrics and streamed usage. A byte-chunked stream test verifies multiline CRLF events and preservation of Claude's original response.

Production signed-in Claude testing remains a prepublication check: this environment had no connected browser session. No emails, GitHub comments, release publication or AMO submission were sent. Preparation does not imply Mozilla approval.
