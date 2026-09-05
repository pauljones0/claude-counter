/**
 * @file tokens.js — Token counting and conversation metrics for Claude Counter.
 *
 * Walks the conversation tree from the current leaf message back to the root,
 * tokenizes each message's visible content (text, tool_use, tool_result,
 * attachments — excluding thinking blocks and binary content), and computes:
 *
 *   - totalTokens: approximate token count using the o200k_base tokenizer
 *   - cachedUntil: estimated five-minute cache expiry, not a billing guarantee
 *
 * Uses a fingerprint-based TokenCache to avoid re-tokenizing unchanged
 * messages on every conversation update.
 */
(() => {
	'use strict';

	const CC = (globalThis.ClaudeCounter = globalThis.ClaudeCounter || {});

	/** Sentinel UUID representing the root of every conversation tree. */
	const ROOT_MESSAGE_ID = '00000000-0000-4000-8000-000000000000';

	function stableStringify(value) {
		const seen = new WeakSet();

		const normalize = (v) => {
			if (v === null || typeof v !== 'object') return v;
			if (seen.has(v)) return '[Circular]';
			seen.add(v);

			if (Array.isArray(v)) return v.map(normalize);

			const out = {};
			for (const key of Object.keys(v).sort()) {
				out[key] = normalize(v[key]);
			}
			return out;
		};

		try {
			return JSON.stringify(normalize(value));
		} catch {
			return '';
		}
	}

	function getTokenizer() {
		return globalThis.GPTTokenizer_o200k_base || null;
	}

	function countTokens(text) {
		if (!text) return 0;
		const tokenizer = getTokenizer();
		if (!tokenizer?.countTokens) throw new Error('Tokenizer unavailable');
		return tokenizer.countTokens(text, { allowedSpecial: 'all' });
	}

	function buildTrunk(conversation) {
		const messages = Array.isArray(conversation?.chat_messages) ? conversation.chat_messages : [];
		const byId = new Map();
		for (const msg of messages) {
			if (msg?.uuid) byId.set(msg.uuid, msg);
		}

		const leaf = conversation?.current_leaf_message_uuid;
		if (!leaf) return [];

		const trunk = [];
		const visited = new Set();
		let currentId = leaf;
		while (currentId && currentId !== ROOT_MESSAGE_ID) {
			if (visited.has(currentId)) throw new Error('Cyclic conversation tree');
			visited.add(currentId);
			const msg = byId.get(currentId);
			if (!msg) throw new Error('Incomplete conversation tree');
			trunk.push(msg);
			currentId = msg.parent_message_uuid;
		}

		trunk.reverse();
		return trunk;
	}

	function isCountableContentItem(item) {
		if (!item || typeof item !== 'object') return false;
		if (typeof item.type !== 'string') return false;
		if (item.type === 'thinking' || item.type === 'redacted_thinking') return false;
		if (item.type === 'image' || item.type === 'document') return false;
		return true;
	}

	function stringifyCountableContentItem(item) {
		if (!isCountableContentItem(item)) return '';

		// Common fast-path for text blocks.
		if (item.type === 'text' && typeof item.text === 'string') return item.text;

		// Tool blocks: include observable payloads deterministically, but exclude "thinking".
		if (item.type === 'tool_use') {
			const minimal = {
				id: item.id,
				name: item.name,
				input: sanitizeContent(item.input)
			};
			return stableStringify(minimal);
		}

		if (item.type === 'tool_result') {
			const minimal = {
				tool_use_id: item.tool_use_id,
				is_error: item.is_error,
				content: sanitizeContent(item.content)
			};
			return stableStringify(minimal);
		}

		// Fallback: keep only known-ish textual fields to avoid pulling in huge binary-ish blobs.
		const minimal = {};
		if (typeof item.text === 'string') minimal.text = item.text;
		if (typeof item.title === 'string') minimal.title = item.title;
		if (typeof item.url === 'string') minimal.url = item.url;
		if (typeof item.content === 'string') minimal.content = item.content;
		if (Array.isArray(item.content)) minimal.content = sanitizeContent(item.content);
		if (Object.keys(minimal).length === 0) return '';
		return stableStringify(minimal);
	}

	function stringifyMessageCountables(message) {
		const parts = [];

		// Message content blocks (primary source for tools, text, etc).
		const content = Array.isArray(message?.content) ? message.content : [];
		for (const item of content) {
			const s = stringifyCountableContentItem(item);
			if (s) parts.push(s);
		}
		if (!content.length && typeof message?.text === 'string') parts.push(message.text);

		// Attachment extracted content (observable, already text).
		const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
		for (const a of attachments) {
			if (typeof a?.extracted_content === 'string' && a.extracted_content) {
				parts.push(a.extracted_content);
			}
		}

		return parts.join('\n');
	}

	async function hashString(str) {
		try {
			const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
			return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
		} catch {
			// Without hashing, count directly and skip caching.
		}
		return null;
	}

	async function fingerprint(text) {
		if (!text) return null;
		const hash = await hashString(text);
		if (!hash) return null;
		return `${text.length}:${hash}`;
	}

	class TokenCache {
		constructor() {
			this._byMessageId = new Map(); // uuid -> { fp, tokens }
		}

		async getMessageTokens(messageId, messageText) {
			const fp = await fingerprint(messageText);
			if (!fp) return countTokens(messageText);
			const cached = this._byMessageId.get(messageId);
			if (cached && cached.fp === fp) return cached.tokens;

			const tokens = countTokens(messageText);
			this._byMessageId.set(messageId, { fp, tokens });
			return tokens;
		}

		pruneToMessageIds(keepIds) {
			const keep = new Set(keepIds);
			for (const id of this._byMessageId.keys()) {
				if (!keep.has(id)) this._byMessageId.delete(id);
			}
		}
	}

	const tokenCache = new TokenCache();

	// Never serialize binary or private reasoning nested inside tool results.
	function sanitizeContent(value, depth = 0) {
		if (depth > 32) return null;
		if (value === null || typeof value !== 'object') return value;
		if (['image', 'document', 'thinking', 'redacted_thinking'].includes(value.type)) return null;
		if (Array.isArray(value)) return value.map(v => sanitizeContent(v, depth + 1)).filter(v => v !== null);
		const result = {};
		for (const [key, child] of Object.entries(value)) result[key] = sanitizeContent(child, depth + 1);
		return result;
	}

	async function computeConversationMetrics(conversation) {
		if (!Array.isArray(conversation?.chat_messages)) throw new Error('Invalid conversation');
		if (conversation.chat_messages.length && !conversation.current_leaf_message_uuid) throw new Error('Missing active branch');
		const trunk = buildTrunk(conversation);
		const trunkIds = trunk.map((m) => m.uuid).filter(Boolean);
		tokenCache.pruneToMessageIds(trunkIds);

		let totalTokens = 0;
		let lastAssistantMs = null;

		for (const msg of trunk) {
			if (msg?.sender === 'assistant' && (msg?.updated_at || msg?.created_at)) {
				const msgMs = Date.parse(msg.updated_at || msg.created_at);
				if (!lastAssistantMs || msgMs > lastAssistantMs) {
					lastAssistantMs = msgMs;
				}
			}

			const msgText = stringifyMessageCountables(msg);
			const msgTokens = msg?.uuid ? await tokenCache.getMessageTokens(msg.uuid, msgText) : countTokens(msgText);
			totalTokens += msgTokens;
		}
		const cachedUntil = lastAssistantMs ? lastAssistantMs + CC.CONST.CACHE_WINDOW_MS : null;

		return {
			trunkMessageCount: trunk.length,
			totalTokens,
			lastAssistantMs,
			cachedUntil
		};
	}

	CC.tokens = { computeConversationMetrics };
})();
