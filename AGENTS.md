# AGENTS.md

## Project Overview

Sonto is a Chrome browser extension (Manifest V3) that provides a calm sidebar feed of art, quotes, science, and news, paired with a clipboard history manager. Users can save text snippets from any webpage and browse their history in the sidebar.

**License:** MIT
**Runtime dependencies:** 1 (`kotowaza` — Japanese proverbs dataset)
**UI framework:** None. Vanilla TypeScript with direct DOM manipulation.
**Bundler:** esbuild
**Target:** ES2020, strict TypeScript

## Architecture

Sonto runs entirely in the browser with no backend. Four separate bundles serve four Chrome extension contexts:

| Entry point | Format | Chrome context |
|---|---|---|
| `src/background/service-worker.ts` | ESM | Service worker (Manifest V3) |
| `src/content/main.ts` | IIFE | Content script (injected into web pages) |
| `src/sidebar/sidebar.ts` | IIFE | Side panel UI |
| `src/settings/settings.ts` | IIFE | Options page (opens in a tab) |

Communication between contexts uses `chrome.runtime.sendMessage` with typed message objects defined in `src/shared/messages.ts`.

## Source Structure

```
src/
├── background/
│   ├── service-worker.ts          # Extension lifecycle, context menus,
│   │                              # keyboard shortcuts, badge management
│   ├── message-router.ts          # Message routing dispatcher
│   ├── handlers.ts                # Aggregates all message handlers
│   ├── clip-handler.ts            # Text capture and storage logic
│   ├── read-later-handler.ts      # Read Later queue management
│   ├── related-clips-handler.ts   # Domain-based clip lookup
│   └── badge-handler.ts           # Extension badge counter
├── content/
│   └── main.ts                    # Text capture (Alt+Shift+C), Shadow DOM
│                                  # toast notifications, quick search overlay
├── settings/
│   ├── settings.ts                # Multi-tab settings page controller
│   ├── settings.html              # Settings page markup
│   └── settings.css               # Settings page styles
├── sidebar/
│   ├── sidebar.ts                 # Main sidebar controller, view switching,
│   │                              # theme toggle, reading companion bar
│   ├── clipboard-manager.ts       # Snippet library: filtering, pin/delete,
│   │                              # export (MD/JSON), domain grouping
│   ├── prompts-manager.ts         # Saved prompts with color labels
│   ├── cosmos-mode.ts             # Procedural spirograph canvas animations
│   │                              # with three generative pattern types
│   ├── sidebar.html               # Sidebar markup
│   ├── sidebar.css                # Sidebar styles with CSS custom properties,
│   │                              # dark/light themes, glass morphism
│   └── zen/
│       ├── zen-feed.ts            # Scrolling feed with timed drip, weighted
│       │                          # source selection, engagement signals
│       ├── zen-fetchers.ts        # 15 content source fetchers (public APIs,
│       │                          # RSS, museums, science, philosophy, art)
│       ├── zen-content.ts         # Content rendering helpers, Oblique Strategies
│       ├── translator.ts          # Feed content translation layer
│       ├── album-of-a-day.json    # Curated album list (~700 albums)
│       ├── haiku-data.json        # Haiku poetry dataset
│       └── quotes-data.json       # Quotes dataset
└── shared/
    ├── types.ts                   # Core interfaces: ClipItem, ReadLaterItem,
    │                              # Collection, PromptItem
    ├── constants.ts               # Storage keys, DB config
    ├── messages.ts                # Typed message protocol for service worker
    │                              # communication
    ├── storage.ts                 # chrome.storage.local operations for all
    │                              # persisted settings and state
    ├── backup.ts                  # Full data export/import as JSON
    ├── rss-parser.ts              # RSS/Atom feed parser using DOMParser
    ├── markdown.ts                # Markdown-to-HTML renderer
    ├── i18n.ts                    # Internationalization with data-i18n binding
    ├── utils.ts                   # HTML escaping
    ├── locales/
    │   ├── en.ts                  # English locale
    │   └── de.ts                  # German locale
    └── embeddings/
        └── vector-store.ts        # IndexedDB store for clips (text search only)
```

## Data Layer

**IndexedDB** (`sonto_db`, version 2): Stores clips with metadata. Indexed by timestamp, content type, and pinned status. Supports text search via `toLowerCase().includes()`.

**chrome.storage.local**: Settings, theme preference, read later queue, custom feed sources, zen source engagement signals, prompts.

**chrome.storage.session**: Ephemeral feed caches and seen item tracking.

No data leaves the device. All processing happens locally.

## Key Subsystems

### Zen Feed Engine
Weighted random selection across 15 public API sources. Sources are boosted by user engagement (clicks, copies, pins). New items drip on a configurable timer (default 30 seconds). All sources filter out AI-related and inappropriate content.

### Cosmos Mode
Procedural spirograph canvas animations between content cards. Three pattern generators (dense center, open ring, geometric lobe) with randomized parametric equations, color cycling, and canvas compositing. Adapts to dark/light theme.

### Clipboard Manager
Captures text via hotkey (Alt+Shift+C), context menu, or clipboard monitoring. Stores up to 500 items with pinning, domain grouping, and full-text search. Export to Markdown or JSON.

### Read Later
Quick-save URLs for later reading. Auto-captures the page when visited if it was saved to Read Later.

### Prompts
Save and organize frequently used text snippets as prompts with color-coded labels for quick access.

## Build

```bash
npm install
npm run build       # esbuild bundles to dist/
npm run typecheck   # tsc --noEmit
```

The build script (`scripts/build.js`) runs four parallel esbuild bundles, minifies CSS, strips `type="module"` from HTML, and copies static assets (icons, fonts, manifest) to `dist/`.

Load the `dist/` folder as an unpacked extension in `chrome://extensions` with Developer mode enabled.

## Chrome Permissions

| Permission | Used for |
|---|---|
| `storage` | Local data persistence |
| `activeTab` | Reading selected text from the active tab |
| `tabs` | Tab URL/title for snippet context |
| `sidePanel` | Chrome Side Panel API |
| `contextMenus` | "Save to Sonto" and "Read Later" right-click menus |
| `clipboardRead` | Monitor clipboard for new content |

Host permissions: `*://*/*` (content script injection)

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Alt+Shift+S | Open Sonto sidebar |
| Alt+Shift+C | Save selected text to clipboard history |
| Alt+Shift+F | Quick search your snippets |

## Conventions

- Zero runtime framework dependencies. All DOM manipulation is vanilla JS/TS.
- CSS uses custom properties for theming. Dark is default; light is toggled via `[data-theme="light"]` on `<html>`.
- Self-hosted fonts: DM Sans (body), Playfair Display (serif accents), Space Mono (monospace).
- TypeScript strict mode. Target ES2020.
- No test framework is currently configured.
- The only runtime dependency is `kotowaza` (Japanese proverbs data).
- NEVER add comments to the code unless absolutely necessary to explain complex logic. The code should be self-documenting.
- NEVER add co-authorship tags (e.g., `Co-authored-by:`) to Git commit messages.

## Adding Styles

Styles are modular in `src/sidebar/styles/`. Files are combined in numeric order during build.

| File | Purpose |
|------|---------|
| `00-variables.css` | CSS custom properties (colors, fonts, spacing) |
| `10-base.css` | Base styles, resets, typography |
| `15-views.css` | View container layouts |
| `20-cosmos.css` | Cosmos mode (visualization) styles |
| `30-zen-tabs.css` | Zen feed and tab styles |
| `35-nav.css` | Navigation (header, bottom nav) |
| `40-browse.css` | Browse/clipboard view styles |
| `60-components.css` | Reusable components (cards, buttons, toasts, chips) |
| `70-theme-light.css` | Light theme overrides |

**Rule:** Add component styles to `60-components.css`. Add light theme overrides to `70-theme-light.css`. Never edit `src/sidebar/sidebar.css` directly - it is rebuilt from the modular files.

## Privacy Model

No accounts, no backend, no analytics, no telemetry. All data stays in browser storage. Feed content comes from public third-party APIs.
