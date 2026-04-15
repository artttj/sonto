# Sonto Clip Extension Architecture

## Overview

Chrome extension (Manifest V3) providing side-panel based clipboard history and saved prompts. Stack: TypeScript, esbuild, no UI framework. Fully local — no backend, no analytics, no accounts.

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
│                                                                             │
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

Primary UI surface using Chrome Side Panel API. Two tabs:

- **Browse**: Clipboard history with search, tags, domain filtering
- **Prompts**: Saved text snippets with color labels

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Alt+Shift+S | Open sidebar |
| Alt+Shift+C | Capture selected text |
| Alt+Shift+F | Quick search snippets |
| / (in sidebar) | Focus search |

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
│   ├── related-clips-handler.ts # Related clips (domain-based)
│   ├── badge-handler.ts       # Extension badge counter
│   └── migration.ts           # Legacy data migration
│
├── content/
│   └── main.ts                # Content script entry
│
├── sidebar/
│   ├── sidebar.ts             # Side panel entry
│   ├── clipboard-manager.ts   # Clipboard UI logic
│   ├── prompts-manager.ts     # Prompts UI logic
│   ├── prompt-colors.ts       # Shared color constants
│   ├── syntax-highlight.ts    # Code formatting
│   ├── utils.ts               # Sidebar utilities
│   ├── controllers/
│   │   ├── index.ts           # Controller exports
│   │   ├── theme-controller.ts     # Dark/light mode
│   │   └── prompt-modal-controller.ts
│   └── styles/                # CSS modules (concatenated at build)
│       ├── 00-variables.css   # CSS custom properties
│       ├── 10-base.css        # Reset, typography
│       ├── 15-views.css       # View containers
│       ├── 35-nav.css         # Navigation
│       ├── 40-browse.css      # Clipboard browse tab
│       ├── 50-prompts.css     # Prompts tab
│       ├── 60-components.css  # Buttons, modals
│       └── 70-theme-light.css # Light theme overrides
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
  // ... 30+ message types
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

Single table design with type discrimination.

```typescript
interface SontoItem {
  id: string;                    // UUID: `${timestamp}-${random}`
  type: 'clip' | 'prompt';
  content: string;               // Primary text content
  contentType: 'text' | 'code' | 'link' | 'email' | 'image';
  source: 'clipboard' | 'manual' | 'shortcut' | 'context-menu';
  origin: string;                // Domain or source identifier
  url?: string;                  // Source URL
  title?: string;                // Generated or provided title
  tags: string[];                // Multi-entry indexed
  createdAt: number;             // Timestamp
  pinned: boolean;               // Indexed for quick access
  metadata?: Record<string, unknown>; // Flexible extension point (color, etc.)
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
  - origin        (non-unique)     // For related clips lookup
```

**Query Strategy:**
- Single-field filters use indexes directly
- Compound filters use index for primary filter, then in-memory filtering
- Full-text search: retrieve all, filter in memory (acceptable for <10k items)
- Tag queries use `multiEntry` index for O(log n) lookup

---

## Controllers

### ThemeController

Manages CSS custom properties for theming. Persists to `chrome.storage.local`.

### PromptModalController

Handles the modal for creating/editing prompts with color selection.

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
- DM Sans (sans): base UI
- Playfair Display (serif): headers, accents
- Space Mono (mono): code snippets
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
- All SontoItems (clips, prompts)
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

### Export Integrations

`src/shared/export.ts` provides export options:
- **Obsidian:** Generates Markdown with YAML frontmatter, copies to clipboard

### Related Clips

Domain-based clip suggestions via `src/background/related-clips-handler.ts`:
- Extracts current page domain
- Queries IndexedDB for clips from same origin
- Shows up to 5 related items in sidebar

Toggle in Settings > Clipboard > Related clips popup.

### Badge Counter

Shows daily capture count on extension icon. Updated by `src/background/badge-handler.ts` when clips are added/deleted.

### Color Labels

Clips and prompts support optional color labels (7 colors). Colors rendered as dots in list view, stored in `metadata.color`.

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
2. **Search:** In-memory filtering acceptable for <10k items; no full-text index
3. **Bundle Size:** esbuild tree-shaking, no framework overhead (~50KB total JS)

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
