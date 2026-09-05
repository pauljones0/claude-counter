# Firefox 0.5.0 resubmission

Upload `dist/claude-counter-0.5.0-firefox.zip` as a new version of the existing Claude Counter listing. Keep the existing add-on ID `{cf7799c8-d878-41ff-8005-167bee7ab3d6}`. This is an unsigned upload package, not a permanently installable XPI.

## Build

Source package: `dist/claude-counter-0.5.0-source.zip`. Requires Node.js 22+ and npm. From its root run `npm ci` then `npm run build`. Compare `dist/SHA256SUMS`. The build uses pinned esbuild 0.28.2 and gpt-tokenizer 4.0.0. Application scripts are not minified; the bundled tokenizer is readable and its MIT notice is included.

## Behavior and permission explanation

Access remains limited to `https://claude.ai/*`. No storage, notification, background, cookie-API, or additional host permissions are added. A page-world script runs at document_start to observe Claude response streams and answer validated read-only usage/conversation requests. Isolated content scripts render the UI and count tokens. PostMessage uses the page origin and source checks; the page-world bridge is not an authentication boundary against claude.ai itself.

The extension reads the lastActiveOrg cookie via the existing page access and uses Claude's session cookies only for read-only requests back to claude.ai. No information is sent to the developer or analytics services and no remote executable code is loaded. The existing `data_collection_permissions.required: ["none"]` declaration is retained. See PRIVACY.md.

## Changes

- Usage bars sit below the composer card, avoiding overlap with absolute Chat/Cowork controls and the moved model selector.
- Current/legacy header compatibility, responsive wrapping, keyboard refresh and accessible progress values.
- Home/new-chat usage loading, scoped weekly limits, visible-tab polling and clear stale/unavailable status.
- Request timeouts, HTTP checks, account isolation, asynchronous response guards, robust chunked SSE handling.
- Token counting handles special-token strings, excludes nested binary/reasoning data, detects invalid conversation trees and hashes locally.
- Reproducible build, generated userscript, behavioral and browser tests.

## Reviewer test steps

1. Temporarily load `dist/firefox/manifest.json` in Firefox 142+; sign in to claude.ai using a test account.
2. Open `/new`: session/weekly usage should appear below the composer without covering Chat/Cowork, model, microphone or send controls.
3. Open an existing conversation: approximate tokens appear in the header; usage stays near the composer even when the model selector moves to the footer.
4. Resize the window, increase zoom, toggle dark mode, switch conversations, and open/close an artifact panel. Rows should wrap and remain unique.
5. Activate Refresh usage with Enter. After a response finishes, token metrics and streamed usage should update. Hidden tabs should pause periodic work and recover when visible.
6. Disconnect network and refresh: last known usage remains marked stale. Switching organizations must clear the previous account's figures.

Automated fixtures model the reported layout but do not replace a signed-in test of Claude's changing production DOM. No signed-in Claude browser session was available during preparation; complete the steps above before publishing. AMO upload, signing and publication have not been performed.

## Development dependency audit

The installed web-ext 10.6.0 toolchain currently depends on image-size 2.0.2, flagged for malformed-image denial-of-service advisories GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq. Registry inspection found no newer image-size release. This dependency is used only by the development linter and is not shipped in the extension. Do not downgrade web-ext to an obsolete major to silence the audit. Runtime archives contain no node_modules.
