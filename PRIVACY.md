# Privacy

Claude Counter processes visible conversation text and usage information locally in your browser. It does not send data to the developer, analytics services, or other third parties, and it does not store conversation history or usage snapshots.

While you are signed in to claude.ai, it reads the lastActiveOrg cookie and makes authenticated, read-only requests to Claude's own usage and current-conversation endpoints. Those requests send your existing Claude credentials to claude.ai. The extension also observes relevant Claude response streams to update its display. It never sends prompts, alters conversations, or requests your API key.

The content-script access is restricted to https://claude.ai/*. The packaged tokenizer runs locally. No remote executable code is loaded.

Questions: claudecounter@pauljones0.uk.
