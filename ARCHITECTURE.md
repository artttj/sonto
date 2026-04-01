# Sonto Extension Architecture

## Overview

Chrome extension (Manifest V3) providing side-panel based clipboard history and ambient content feed. Stack: TypeScript, esbuild, no UI framework. Fully local — no backend, no analytics, no accounts.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER CONTEXTS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐       │
│  │  Service Worker  │◄──►│   Content Script │    │   Side Panel     │       │
│  │  (background/)   │    │   (content/)     │    │   (sidebar/)     │       │
│  └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘       │
│           │                       │                     │                   │
│           │ chrome.runtime       │ chrome.tabs        │ chrome.runtime    │
│           │ .sendMessage()       │ .sendMessage()      │ .sendMessage()    │
│           │                       │                     │                   │
│  ┌────────▼───────────────────────▼─────────────────────▼─────────┐     │
│  │                     MESSAGE BUS (typed)                         │     │
│  └──────────────────────────────────────────────────────────────────┘     │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              STORAGE LAYER                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   chrome.storage.local          │           IndexedDB (sonto_db_v2)         │
│   ────────────────────          │           ─────────────────────           │
│   Settings, theme               │           SontoItem objects              │
│   UI preferences                │           Text search via in-memory       │
│   Disabled sources              │                                           │
│   Custom feeds                  │                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Runtime Contexts

### 1. Service Worker (`src/background/service-worker.ts`)

Event-driven background context. No DOM access.

**Responsibilities:**
- Message routing between contexts
- Context menu registration
- Command handling (keyboard shortcuts)
- Side panel lifecycle

**Event Listeners:**
```
onInstalled       → Setup context menus, run migrations
onMessage         → Route to handlers
onClicked (menus) → Trigger capture actions
onCommand         → Handle Alt+Shift+C, Alt+Shift+F
onClicked (action)→ Open side panel
```

### 2. Content Script (`src/content/main.ts`)

Injected into web pages. Isolated from page JS via CSP but can access DOM.

**Responsibilities:**
- Clipboard event interception
- Selection capture via keyboard shortcuts
- Page content extraction (markdown conversion)
- Quick search overlay injection
- Input field text insertion

### 3. Side Panel (`src/sidebar/sidebar.ts`)

Primary UI surface using Chrome Side Panel API. Two display modes:

- **Zen mode**: Ambient content feed (art, news, quotes) with two sub-views:
  - **Feed**: Scrolling bubbles with drip-cycle refresh
  - **Cosmos**: Procedural spirograph animations
- **Clipboard mode**: Two tabs:
  - **Browse**: Clipboard history with search, tags, domain filtering
  - **Prompts**: Saved text snippets with color labels

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Alt+Shift+S | Open sidebar |
| Alt+Shift+C | Capture selected text |
| Alt+Shift+F | Quick search snippets |
| / (in clipboard) | Focus search |

---

## Module Structure

```
src/
├── background/
│   ├── service-worker.ts      # Entry point, event registration
│   ├── message-router.ts      # Message handler registry
│   ├── handlers.ts            # Handler registration coordinator
│   ├── clip-handler.ts        # Clipboard operations
│   ├── clip-page-handler.ts   # Full-page capture
│   ├── sonto-item-handler.ts  # Unified item CRUD
│   ├── related-clips-handler.ts # Reading Companion (domain-based)
│   ├── badge-handler.ts       # Extension badge counter
│   └── migration.ts           # Legacy data migration
│
├── content/
│   └── main.ts                # Content script entry
│
├── sidebar/
│   ├── sidebar.ts             # Side panel entry
│   ├── clipboard-manager.ts   # Clipboard UI logic
│   ├── prompts-manager.ts     # Prompts UI logic (saved text snippets)
│   ├── cosmos-mode.ts         # Spirograph animation view
│   ├── syntax-highlight.ts    # Code formatting
│   ├── utils.ts               # Sidebar utilities
│   ├── controllers/
│   │   ├── index.ts           # Controller exports
│   │   ├── view-controller.ts      # Zen/Clipboard view switching
│   │   ├── theme-controller.ts     # Dark/light mode
│   │   └── prompt-modal-controller.ts
│   ├── styles/                # CSS modules (concatenated at build)
│   │   ├── 00-variables.css   # CSS custom properties
│   │   ├── 10-base.css        # Reset, typography
│   │   ├── 15-views.css       # View containers
│   │   ├── 20-cosmos.css      # Spirograph canvas
│   │   ├── 30-zen-tabs.css    # Zen feed layout
│   │   ├── 35-nav.css         # Navigation
│   │   ├── 40-browse.css      # Clipboard browse tab
│   │   ├── 60-components.css # Buttons, modals
│   │   └── 70-theme-light.css # Light theme overrides
│   └── zen/
│       ├── zen-feed.ts        # Feed orchestration
│       ├── zen-fetchers.ts    # 18 content sources
│       ├── zen-content.ts     # Content scoring/selection
│       ├── zen-scoring.ts     # User preference tracking
│       ├── zen-shared.ts      # Shared types/helpers
│       └── translator.ts      # Browser Translator API wrapper
│
├── settings/
│   ├── settings.ts            # Options page
│   └── settings.css           # Options page styles
│
└── shared/
    ├── messages.ts            # Typed message protocol
    ├── types.ts               # Core TypeScript interfaces
    ├── constants.ts           # DB names, limits
    ├── storage.ts             # chrome.storage.local wrapper
    ├── storage/items.ts       # IndexedDB operations
    ├── backup.ts              # Export/import JSON backup
    ├── export.ts              # Notion/Obsidian export
    ├── i18n.ts                # Internationalization helper
    ├── content-detector.ts    # Content type classification
    ├── tab-operations.ts      # Tab focus helpers
    ├── embeddings/vector-store.ts # Domain-based clip lookup
    ├── utils.ts               # Common utilities
    ├── rss-parser.ts          # RSS/Atom feed parsing
    └── locales/               # i18n strings (en, de)
```

---

## Message Protocol

Typed message passing via `src/shared/messages.ts`. Pattern: discriminated union with `type` discriminator.

```typescript
// Message registry (const assertion for type safety)
export const MSG = {
  CAPTURE_CLIP: 'CAPTURE_CLIP',
  GET_ALL_CLIPS: 'GET_ALL_CLIPS',
  // ... 40+ message types
} as const;

// Message interfaces with discriminant
type CaptureClipMessage = {
  type: typeof MSG.CAPTURE_CLIP;
  text: string;
  source: SontoSource;
  // ...
};

// Union type for exhaustiveness checking
type RuntimeMessage = CaptureClipMessage | DeleteClipMessage | ...;
```

### Handler Registration Pattern

```typescript
// message-router.ts
const handlers: MessageRegistry = {};

export function registerHandler(type: string, handler: MessageHandler): void {
  handlers[type] = handler;
}

export function handleMessage(msg, sender, sendResponse): boolean {
  const handler = handlers[msg.type];
  if (!handler) return false;  // Message not handled

  Promise.resolve(handler(msg, sender))
    .then(result => sendResponse({ ok: true, ...result }))
    .catch(err => sendResponse({ ok: false, message: err.message }));

  return true;  // Async response expected
}
```

Handlers organized by domain (`clip-handler.ts`, `sonto-item-handler.ts`, etc.) and registered centrally in `handlers.ts`.

---

## Data Model

### Unified Item Schema (`SontoItem`)

Replaced legacy separate Clip/Prompt schemas. Single table design with type discrimination.

```typescript
interface SontoItem {
  id: string;                    // UUID: `${timestamp}-${random}`
  type: 'clip' | 'prompt' | 'zen';
  content: string;               // Primary text content
  contentType: 'text' | 'code' | 'quote' | 'art' | 'link' | 'idea' |
               'haiku' | 'proverb' | 'strategy' | 'email' | 'image';
  source: 'clipboard' | 'manual' | 'shortcut' | 'context-menu' |
          'zen-fetcher' | 'rss' | 'api';
  origin: string;                // Domain or source identifier
  url?: string;                  // Source URL
  title?: string;                // Generated or provided title
  tags: string[];                // Multi-entry indexed
  createdAt: number;             // Timestamp
  lastSeenAt?: number;           // For spaced repetition in zen
  pinned: boolean;               // Indexed for quick access
  zenified: boolean;             // Marked for zen feed inclusion
  metadata?: Record<string, unknown>; // Flexible extension point
}
```

### IndexedDB Schema

```
Database: sonto_db_v2
Store: sonto_items
KeyPath: id

Indexes:
  - type          (non-unique)
  - contentType   (non-unique)
  - source        (non-unique)
  - tags          (multiEntry)     // For tag-based queries
  - createdAt     (non-unique)     // For sorting
  - pinned        (non-unique)
  - zenified      (non-unique)
  - lastSeenAt    (non-unique)
  - origin        (non-unique)     // For Reading Companion
```

**Query Strategy:**
- Single-field filters use indexes directly
- Compound filters use index for primary filter, then in-memory filtering
- Full-text search: retrieve all, filter in memory (acceptable for <10k items)
- Tag queries use `multiEntry` index for O(log n) lookup

---

## Controllers

### ViewController (`src/sidebar/controllers/view-controller.ts`)

Manages zen/clipboard view state and cosmos/feed display mode.

**State:**
```typescript
private mode: 'zen' | 'clipboard' = 'clipboard';
private zenDisplay: 'feed' | 'cosmos' = 'feed';
```

**Pattern:** Dependency injection via constructor
```typescript
interface ViewControllerDeps {
  viewZen: HTMLElement;
  viewClipboard: HTMLElement;
  feedBtn: HTMLButtonElement;
  backBtn: HTMLButtonElement;
  zenFeedEl: HTMLElement;
  cosmosViewEl: HTMLElement;
  clipManager: ClipboardManager;
  language: string;
  onViewChange?: (mode: ViewMode) => void;
  onZenDisplayChange?: (display: ZenDisplay) => void;
}

constructor(deps: ViewControllerDeps, language: string)
```

**Lifecycle:**
- `init()` → Restore saved mode, attach listeners, conditionally init zen
- `setMode()` → Toggle visibility, start/stop timers, save preference
- `switchZenDisplay()` → Swap feed/cosmos, manage canvas lifecycle

### ThemeController

Manages CSS custom properties for theming. Persists to `chrome.storage.local`.

---

## Zen Feed Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         ZenFeed                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   ┌──────────────┐      ┌──────────────┐      ┌─────────────┐ │
│   │  Drip Cycle  │◄────►│ Content Pool │◄────►│   Sources   │ │
│   │  (30s timer) │      │ (scored)     │      │ (18 fetchers)│ │
│   └──────┬───────┘      └──────────────┘      └─────────────┘ │
│          │                                                     │
│          ▼                                                     │
│   ┌──────────────┐      ┌──────────────┐                      │
│   │   Bubbles    │◄────►│ Session Cache│                      │
│   │   (DOM)      │      │ (last 30 IDs)│                      │
│   └──────────────┘      └──────────────┘                      │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Content Sources (18 total):**
- **Art APIs:** Met Museum, Cleveland Museum, Getty, Rijksmuseum, Wikimedia Commons
- **News/Discussion:** Hacker News, Reddit (r/science, r/space, r/philosophy), Smithsonian Smart News, Atlas Obscura, The Verge
- **Knowledge:** 1000-Word Philosophy, Japanese Proverbs (kotowaza), Haiku, Oblique Strategies
- **Music:** Album of Day (MusicBrainz API)
- **Science:** NASA Perseverance Rover Photos
- **Custom:** User-defined RSS feeds, User-defined JSON API sources

**Drip Cycle:**
- Interval: Configurable (default 30s)
- Initial load: 6 items parallel fetch
- Rotation: Oldest bubble fades out, new enters from bottom
- Max bubbles: 20 (DOM performance threshold)

**Scoring Algorithm:**
```typescript
// Factors
+2  // User copied content
+1  // User clicked content
× weight  // Source preference (adjusted by dismissals)
15%  // Random injection (diversity)
30%  // Spaced repetition (zenified items)
```

---

## Build System

**Tool:** esbuild (native Go, fast)

**Config:**
```javascript
{
  bundle: true,
  minify: true,
  target: 'es2020',
  format: 'esm',    // Service worker
  format: 'iife',   // Content script, sidebar, settings
}
```

**Outputs:**
```
dist/
├── manifest.json
├── background/service-worker.js      (ESM)
├── content/content.js                (IIFE)
├── sidebar/
│   ├── sidebar.js                    (IIFE)
│   └── sidebar.css                   (minified)
├── settings/
│   ├── settings.js                   (IIFE)
│   └── settings.css                  (minified)
├── fonts/                            (woff2)
└── icons/                            (png)
```

**CSS Build:**
- Sidebar: Concatenates all `src/sidebar/styles/*.css` files in sort order
- Minified via esbuild CSS loader
- No CSS-in-JS, no utility classes

**Font System:**
- Playfair Display (serif): zen bubble body, cosmos text, cosmos art titles
- DM Sans (sans): base UI, news/reddit/HN bubbles, source labels, settings
- Space Mono (mono): oblique strategies
- All fonts bundled as woff2 in `src/fonts/`, copied to `dist/fonts/` by build
- CSS vars: `--font`, `--font-serif`, `--font-mono`

---

## Testing

**Framework:** Vitest

**Configuration:**
```
vitest.unit.config.ts    # Unit tests (jsdom environment)
vitest.e2e.config.ts     # E2E tests (node + puppeteer)
```

### Unit Tests (`test/*.test.ts`)

Environment: jsdom (for DOM APIs)
Setup: `test/setup.ts` (mocks chrome APIs)

```typescript
// Example: message-routing.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleMessage, registerHandler } from '../src/background/message-router';

describe('Message Routing', () => {
  it('should route CAPTURE_CLIP to registered handler', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    registerHandler(MSG.CAPTURE_CLIP, handler);

    const message = { type: MSG.CAPTURE_CLIP, text: 'Test', source: 'manual' };
    const sendResponse = vi.fn();

    handleMessage(message, sender, sendResponse);
    await new Promise(r => setTimeout(r, 0));

    expect(handler).toHaveBeenCalledWith(message, sender);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });
});
```

**Chrome API Mocking:**
```typescript
// test/setup.ts
global.chrome = {
  runtime: { sendMessage: vi.fn(), onMessage: { addListener: vi.fn() } },
  storage: { local: { get: vi.fn(), set: vi.fn() } },
  // ... minimal viable chrome object
};
```

### E2E Tests (`test/e2e/*.test.ts`)

Environment: Node + Puppeteer (headless Chrome)
Timeout: 60s per test
Retries: 2 (for flaky DOM interactions)

**Pattern:**
```typescript
describe('Extension E2E', () => {
  let browser: Browser;
  let extensionId: string;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    // Extract extension ID from chrome-extension:// URL
  });

  it('should capture clipboard', async () => {
    const page = await browser.newPage();
    await page.goto('https://example.com');
    // Simulate copy event
    // Verify via chrome.runtime.sendMessage to background
  });
});
```

### Test Commands

```bash
npm test              # Unit tests (watch mode)
npm run test:ui       # Unit tests with browser UI
npm run test:e2e      # E2E tests
npm run test:e2e:ui   # E2E tests with browser UI
```

---

## Architecture Decisions

### 1. No Framework

**Decision:** Vanilla TypeScript, no React/Vue/Angular.

**Rationale:**
- Extension context constraints (CSP, isolated worlds)
- Bundle size critical for extension startup
- DOM manipulation is localized (no reactive state complexity)
- Controller pattern sufficient for view management

**Trade-off:** Manual DOM updates vs framework's VDOM diffing. Acceptable for this complexity level.

### 2. Single SontoItem Schema

**Decision:** Unified `SontoItem` replacing separate Clip/Prompt tables.

**Rationale:**
- Eliminates migration complexity between types
- Enables polymorphic queries (e.g., "all items tagged 'work'")
- Simplifies UI (single list with type badges)
- `metadata` field allows type-specific extensions without schema changes

**Trade-off:** Sparse columns for type-specific fields (mitigated by `metadata` JSON).

### 3. IndexedDB for Content, chrome.storage for Settings

**Decision:** Dual storage strategy.

**Rationale:**
- IndexedDB: Large data (clips), structured queries, indexes
- chrome.storage: Small config (<1KB), syncs across devices (if sync enabled), synchronous-ish API

### 4. Message Passing over Shared State

**Decision:** Strict message passing between contexts, no shared memory.

**Rationale:**
- Chrome extension security model requires it
- Service worker is ephemeral (cannot hold state)
- Content script isolation from page
- Forces explicit interfaces

### 5. Controller Pattern for UI

**Decision:** Controllers manage view state, not components.

**Rationale:**
- Clear separation between view logic and DOM manipulation
- Testable without rendering
- Lifecycle management explicit (start/stop methods)
- No framework lock-in

---

## Key Features

### Backup & Restore

Full data export/import via `src/shared/backup.ts`. JSON payload includes:
- All SontoItems (clips, prompts, zen items)
- Tags index
- Settings and theme preference
- Versioned format (current: v3) for forward compatibility

**Export:** Downloads as `sonto-backup-{timestamp}.json`
**Import:** Validates schema before writing, rejects malformed payloads

### Internationalization

Simple string-based i18n via `src/shared/i18n.ts`:
- Locales stored in `src/shared/locales/` (en.ts, de.ts)
- `data-i18n` attributes for static text
- `setLocale()` switches at runtime

Browser Translator API (`src/sidebar/zen/translator.ts`) provides on-device translation for zen content using the built-in `window.Translator` API.

### Export Integrations

`src/shared/export.ts` provides one-click export:
- **Notion:** Opens new page with title and content
- **Obsidian:** Generates Markdown with YAML frontmatter

### Reading Companion

Domain-based clip suggestions via `src/background/related-clips-handler.ts`:
- Extracts current page domain
- Queries IndexedDB for clips from same origin
- Shows up to 5 related items in sidebar

Toggle in Settings > Clipboard > Reading Companion.

### Badge Counter

Shows unread clip count on extension icon. Updated by `src/background/badge-handler.ts` when clips are added/deleted.

### Color Labels

Clips and prompts support optional color labels (6 colors). Colors rendered as dots in list view, stored in `metadata.color`.

---

## Extension Permissions

```json
{
  "permissions": [
    "storage",           // chrome.storage.local
    "sidePanel",         // Side Panel API
    "activeTab",         // Current tab access
    "tabs",              // Tab query/manipulation
    "contextMenus",      // Right-click menus
    "clipboardRead",     // Copy detection
    "scripting"          // Content script injection
  ],
  "host_permissions": [
    "*://*/*"            // Content script injection on http/https
  ]
}
```

---

## Performance Considerations

1. **IDB Connection Pooling:** Single cached connection in `items.ts`, cleared on version change
2. **Drip Cycle Throttling:** Pauses when tab hidden (visibilitychange) or user idle
3. **Bubble Limit:** Max 20 DOM nodes, removes oldest before adding new
4. **Image Loading:** Lazy load with intersection observer (if implemented)
5. **Search:** In-memory filtering acceptable for <10k items; no full-text index
6. **Bundle Size:** esbuild tree-shaking, no framework overhead (~50KB total JS)

---

## Error Handling Pattern

```typescript
// Async handlers wrap in { ok, result } or { ok, message }
async function handler(msg): Promise<HandlerResult> {
  try {
    const result = await operation();
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Unknown' };
  }
}

// Caller checks ok before using result
const response = await chrome.runtime.sendMessage(msg);
if (response.ok) {
  // use response.data
} else {
  // show toast: response.message
}
```

All async message handlers return this shape. No exceptions propagate across context boundaries.
