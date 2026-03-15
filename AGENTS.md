# AGENTS.md

## Project Overview

Sonto is a Chrome browser extension (Manifest V3) that provides a calm sidebar feed of art, quotes, science, and news. Users can save highlights from any webpage and chat with their saved content using RAG (Retrieval-Augmented Generation).

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
│   └── service-worker.ts          # Extension lifecycle, snippet storage,
│                                  # history sync, context menus, alarms,
│                                  # duplicate detection, AI category extraction,
│                                  # weekly digest generation
├── content/
│   └── main.ts                    # Text capture (Alt+Shift+C), context extraction,
│                                  # Shadow DOM toast notifications
├── settings/
│   ├── settings.ts                # Multi-tab settings page controller
│   ├── settings.html              # Settings page markup
│   └── settings.css               # Settings page styles
├── sidebar/
│   ├── sidebar.ts                 # Main sidebar controller, view switching,
│   │                              # theme toggle, reading assistant bar
│   ├── browse-manager.ts          # Snippet library: filtering, pin/delete,
│   │                              # related discovery, export (MD/JSON)
│   ├── chat-manager.ts            # RAG chat: query embedding, context retrieval,
│   │                              # LLM calls, citations, session persistence
│   ├── cosmos-mode.ts             # Procedural spirograph canvas animations
│   │                              # with three generative pattern types
│   ├── sidebar.html               # Sidebar markup
│   ├── sidebar.css                # Sidebar styles with CSS custom properties,
│   │                              # dark/light themes, glass morphism
│   └── zen/
│       ├── zen-feed.ts            # Scrolling feed with timed drip, weighted
│       │                          # source selection, engagement signals
│       ├── zen-fetchers.ts        # 16 content source fetchers (public APIs,
│       │                          # RSS, museums, science, philosophy, art)
│       ├── zen-content.ts         # Content rendering helpers, Oblique Strategies
│       ├── zen-shared.ts          # Shared zen types and utilities
│       ├── translator.ts          # Feed content translation layer
│       ├── album-of-a-day.json    # Curated album list (~700 albums)
│       ├── haiku-data.json        # Haiku poetry dataset
│       └── quotes-data.json       # Quotes dataset
└── shared/
    ├── types.ts                   # Core interfaces: Snippet, ChatMessage,
    │                              # ChatSession, ReadLaterItem, ProviderStrategy
    ├── constants.ts               # Storage keys, model lists, DB config,
    │                              # search parameters
    ├── messages.ts                # Typed message protocol (20 message types)
    │                              # for service worker communication
    ├── storage.ts                 # chrome.storage.local operations for all
    │                              # persisted settings and state
    ├── backup.ts                  # Full data export/import as JSON
    ├── rss-parser.ts              # RSS/Atom feed parser using DOMParser
    ├── markdown.ts                # Markdown-to-HTML renderer (bold, italic,
    │                              # code, lists, tables, headings)
    ├── i18n.ts                    # Internationalization with data-i18n binding
    ├── utils.ts                   # HTML escaping
    ├── locales/
    │   ├── en.ts                  # English locale
    │   └── de.ts                  # German locale
    ├── providers/
    │   ├── index.ts               # Strategy pattern: getProviderStrategy()
    │   ├── openai.ts              # OpenAI Chat Completions API client
    │   ├── gemini.ts              # Google Gemini API client
    │   └── errors.ts              # Provider error classes
    └── embeddings/
        ├── engine.ts              # Embedding generation (OpenAI text-embedding-3-small
        │                          # or Gemini text-embedding-004)
        └── vector-store.ts        # IndexedDB vector store with cosine similarity
```

## Data Layer

**IndexedDB** (`sonto_db`, version 2): Stores snippets with their embedding vectors. Indexed by URL for duplicate detection and domain-based lookups.

**chrome.storage.local**: Settings, API keys, theme preference, chat sessions, read later queue, digest state, custom feed sources, zen source engagement signals.

**chrome.storage.session**: Ephemeral feed caches and extracted interest categories.

No data leaves the device except for direct API calls to OpenAI or Google when the user has configured an API key and uses AI features.

## Key Subsystems

### Zen Feed Engine
Weighted random selection across 16 public API sources. Sources are boosted by user engagement (clicks, copies, pins). New items drip on a configurable timer (default 15 seconds). Every 5th drip resurfaces a saved snippet. AI-generated facts and stats are injected based on interest categories extracted from saved content. All sources filter out AI-related content.

### Vector Search
Snippets are embedded on save using OpenAI `text-embedding-3-small` (1536 dims) or Gemini `text-embedding-004` (768 dims). Queries are embedded at search time and matched via cosine similarity over the full IndexedDB store. Top-K results (default 10) are returned.

### RAG Chat
User questions are embedded, top-K similar snippets retrieved, then sent as context to an LLM (OpenAI or Gemini). Responses include citation chips linking to source snippets, grounding confidence notes, and follow-up suggestions. Sessions are persisted and browsable.

### Browser History Sync
A 30-minute alarm reads `chrome.history`, embeds page titles, and stores them as searchable snippets. Configurable domain allow/block lists. Batch processing (100 items per sync, max 500 total, last 30 days).

### Cosmos Mode
Procedural spirograph canvas animations between content cards. Three pattern generators (dense center, open ring, geometric lobe) with randomized parametric equations, color cycling, and canvas compositing. Adapts to dark/light theme.

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
| `history` | Browser history sync for semantic search |
| `alarms` | Periodic history sync and weekly digest |

Host permissions: `*://*/*` (content script injection), `api.openai.com`, `generativelanguage.googleapis.com`.

## Supported AI Models

| Provider | Chat models | Embedding model |
|---|---|---|
| OpenAI | gpt-4o-mini, gpt-4.1-mini, gpt-4.1 | text-embedding-3-small |
| Gemini | gemini-2.5-flash, gemini-2.5-pro | text-embedding-004 |

## Conventions

- Zero runtime framework dependencies. All DOM manipulation is vanilla JS/TS.
- CSS uses custom properties for theming. Dark is default; light is toggled via `[data-theme="light"]` on `<html>`.
- Self-hosted fonts: DM Sans (body), Playfair Display (serif accents), Space Mono (monospace).
- TypeScript strict mode. Target ES2020.
- No test framework is currently configured.
- The only runtime dependency is `kotowaza` (Japanese proverbs data).
- NEVER add comments to the code unless absolutely necessary to explain complex logic. The code should be self-documenting.
- NEVER add co-authorship tags (e.g., `Co-authored-by:`) to Git commit messages.

## Privacy Model

BYOK (Bring Your Own Key). No accounts, no backend, no analytics, no telemetry. API keys are stored in `chrome.storage.local` and used only for direct calls to the selected provider. Feed content comes from public third-party APIs.
