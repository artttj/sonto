# Sonto Agents

Agent patterns for working with the Sonto Chrome extension codebase.

## Project Structure

```
sonto/
├── src/
│   ├── background/        # Service worker, message routing, item handling
│   ├── content/           # Content scripts for page interaction
│   ├── sidebar/           # Side panel UI (browse, clipboard, zen feed)
│   ├── settings/          # Settings page
│   └── shared/            # Shared utilities, storage, types
├── dist/                  # Built extension (load in Chrome)
├── test/
│   ├── e2e/               # Puppeteer-based end-to-end tests
│   └── *.test.ts          # Vitest unit tests
└── docs/screenshots/      # Generated screenshots
```

## Key Concepts

- **Unified Storage**: All items (clips, prompts, zen items) stored in IndexedDB `sonto_db_v2` v3
- **Message Router**: Background service worker routes messages between content scripts and sidebar
- **Shadow DOM**: Content scripts inject UI into shadow DOM for isolation
- **Zen Feed**: Drip-fed content from 15 sources (HN, Reddit, museums, RSS, etc.)
- **Clipboard Manager**: Chronological history with tag filtering

## Available Agent Patterns

### Code Explorer Agent

Use for understanding code structure and finding relevant files.

```
Explore the Sonto Chrome extension codebase to find:
- Message routing between background and content scripts
- IndexedDB schema and storage operations
- Zen feed source fetchers
```

### Bug Investigation Agent

Use for debugging issues.

```
Investigate a bug where [describe symptom]. Check:
- Message flow from content script → background → sidebar
- IndexedDB queries in shared/storage/items.ts
- Event listener cleanup in content modules
```

### Feature Implementation Agent

Use for implementing new features.

```
Implement [feature] for Sonto:
1. Add message type to shared/messages.ts
2. Add handler in background/{handler}.ts
3. Register in message-router.ts
4. Update sidebar UI if needed
5. Add unit tests
6. Run e2e tests
```

## Common Tasks

### Add New Message Type

1. Add type to `src/shared/messages.ts`
2. Add handler in `src/background/` 
3. Register in `src/background/message-router.ts`
4. Call from content/sidebar using `chrome.runtime.sendMessage()`

### Add New Zen Feed Source

1. Add fetcher to `src/sidebar/zen/zen-fetchers.ts`
2. Add to `ZEN_SOURCES` array in `src/settings/settings.ts`
3. Handle content parsing with HTML entity decoding if needed

### Modify IndexedDB Schema

1. Increment `DB_VERSION` in `src/shared/constants.ts`
2. Add migration logic in `src/shared/storage/items.ts` `openDb()`
3. Update e2e test DB version in `test/e2e/setup.ts`

## Testing

### Unit Tests

```bash
npm test                 # Run unit tests
npm run test:ui          # Run with UI
```

### E2E Tests

```bash
npm run test:e2e         # Run Puppeteer tests (requires Chrome load)
npm run screenshots      # Generate screenshots
```

**Important**: E2E tests require extension loaded in Chrome manually first.

### Build

```bash
npm run build            # Build to dist/
# Load dist/ in Chrome: Extensions → Developer mode → Load unpacked
```

## Key Files to Understand

| File | Purpose |
|------|---------|
| `src/background/message-router.ts` | Central message routing |
| `src/shared/storage/items.ts` | IndexedDB CRUD operations |
| `src/shared/messages.ts` | Message type definitions |
| `src/sidebar/sidebar.ts` | Main sidebar UI controller |
| `src/content/main.ts` | Content script entry point |
| `src/sidebar/zen/zen-fetchers.ts` | All zen feed sources |

## Common Gotchas

- **Message Type Mismatches**: Always verify message type string matches in both sender and receiver
- **DB Version Mismatches**: E2E tests must match production DB version
- **Event Listener Leaks**: Content script modules must clean up listeners
- **HTML Entity Encoding**: Use `decodeHtmlEntities()` when rendering user content
- **URL Validation**: Always validate URLs with `isValidUrl()` before rendering

## Extension Loading for Development

1. Run `npm run build`
2. Chrome → Extensions → Developer mode
3. "Load unpacked" → select `dist/` folder
4. Click reload icon on extension card after rebuilding
