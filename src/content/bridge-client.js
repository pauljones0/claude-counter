/**
 * @file bridge-client.js — Content-script side of the page<->extension bridge.
 *
 * Claude Counter needs to intercept fetch() calls that happen in the PAGE
 * context (not the content-script sandbox). This module provides a
 * request/response RPC layer over window.postMessage so the content script
 * can ask the injected bridge (bridge.js) to fetch usage data, conversation
 * trees using the page's origin cookies. Hashing stays in the isolated world.
 *
 * It also exposes an event emitter (bridge.on) so other modules can react
 * to real-time SSE events like message_limit updates and generation starts.
 */
(() => {
	'use strict';

	const CC = (globalThis.ClaudeCounter = globalThis.ClaudeCounter || {});

	function makeRequestId() {
		return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	}

	class BridgeClient {
		constructor() {
			this._pending = new Map();
			this._listeners = new Map();

			this._handleMessage = (event) => {
				if (event.source !== window || event.origin !== location.origin) return;
				const data = event.data;
				if (!data || data.cc !== 'ClaudeCounter') return;

				if (data.type === 'cc:response') {
					const { requestId, ok, payload, error } = data;
					const pending = this._pending.get(requestId);
					if (!pending) return;
					this._pending.delete(requestId);
					clearTimeout(pending.timeoutId);
					if (ok) pending.resolve(payload);
					else pending.reject(new Error(error || 'Bridge request failed'));
					return;
				}

				// Events
				this._emit(data.type, data.payload);
			};
			window.addEventListener('message', this._handleMessage);
		}

		destroy() {
			window.removeEventListener('message', this._handleMessage);
			for (const pending of this._pending.values()) {
				clearTimeout(pending.timeoutId);
				pending.reject(new Error('Bridge disposed'));
			}
			this._pending.clear();
			this._listeners.clear();
		}

		_emit(type, payload) {
			const listeners = this._listeners.get(type);
			if (!listeners) return;
			for (const fn of listeners) {
				Promise.resolve().then(() => fn(payload)).catch(() => {});
			}
		}

		on(type, fn) {
			if (!this._listeners.has(type)) this._listeners.set(type, new Set());
			this._listeners.get(type).add(fn);
			return () => this._listeners.get(type)?.delete(fn);
		}

		request(kind, payload, { timeoutMs = 10000 } = {}) {
			const requestId = makeRequestId();
			return new Promise((resolve, reject) => {
				const timeoutId = setTimeout(() => {
					this._pending.delete(requestId);
					reject(new Error(`Bridge request timed out (${kind})`));
				}, timeoutMs);

				this._pending.set(requestId, { resolve, reject, timeoutId });
				window.postMessage(
					{
						cc: 'ClaudeCounter',
						type: 'cc:request',
						requestId,
						kind,
						payload
					},
					location.origin
				);
			});
		}

		async requestUsage(orgId) {
			return this.request('usage', { orgId }, { timeoutMs: 15000 });
		}

		async requestConversation(orgId, conversationId) {
			return this.request('conversation', { orgId, conversationId }, { timeoutMs: 20000 });
		}

	}

	// The manifest starts the page adapter before the host app. A ping confirms
	// readiness across the isolated/page worlds without injecting a script tag.
	let bridgeReadyPromise;
	function injectBridgeOnce() {
		return bridgeReadyPromise ??= CC.bridge.request('ping', {}, { timeoutMs: 5000 }).then(() => true, () => false);
	}

	CC.bridge = new BridgeClient();
	CC.injectBridgeOnce = injectBridgeOnce;
})();
