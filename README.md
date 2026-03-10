# <img src="icons/icon128.png" width="36" alt="" valign="middle" /> SONTO

A calm Chrome sidebar that surfaces a slow drip of art, quotes, science, and news, so you get interesting things to pause on, without social media noise.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=for-the-badge)](LICENSE) ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) ![Google Chrome](https://img.shields.io/badge/Google%20Chrome-4285F4?style=for-the-badge&logo=GoogleChrome&logoColor=white)

---

## QUICK START

Clone and build the extension:

```bash
git clone https://github.com/artttj/sonto.git
cd sonto
npm install
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, then select the `dist/` folder.

The Zen feed works without an API key.  
For chat and embeddings, add your key in **Settings > AI**.

| Provider | Get a key |
|---|---|
| OpenAI | https://platform.openai.com/api-keys |
| Gemini | https://aistudio.google.com/app/apikey |

---

## FEATURES

- **ZEN FEED**: A slow, thoughtful feed that shows one thing at a time  
- **RICH SOURCES**: Museum art, Mars rover photos, Science news, Atlas Obscura stories, quotes, trivia, and more  
- **TWO MODES**: Scrolling feed or Cosmos mode with procedural spirograph animations  
- **THEMES**: Dark and light themes with WCAG 2.1 AA contrast compliance  
- **SAVE ANYTHING**: Highlight text anywhere and press `Alt+Shift+C` or right-click to save  
- **CHAT WITH YOUR HISTORY**: Ask questions about saved snippets using RAG with OpenAI or Gemini  
- **RELATED PAGES**: Semantic search surfaces related pages from your browsing history  
- **BACKUP & RESTORE**: Export and import all data as JSON  
- **CUSTOM SOURCES**: Add your own RSS feeds or JSON API endpoints  
- **WEEKLY DIGEST**: Optional summary of your saved content  
- **BYOK**: Bring your own API key and pay the provider directly

---

## ZEN FEED SOURCES

| Source | Content |
|---|---|
| The Met Museum | Public domain paintings |
| Cleveland Museum of Art | Artworks and facts |
| NASA Mars / Perseverance | Rover and surface photos |
| Hacker News | Top tech stories |
| Reddit | Science, history, space, technology |
| Getty Museum | Paintings and sculptures |
| Smithsonian | Science and smart news |
| Atlas Obscura | Curious places and stories |
| Trivia | Art, science, and books |
| Quotes | Stoic, design, zen, and daily quotes |
| Japanese Proverbs | With English translation |
| Oblique Strategies | Creative prompts |
| Random Facts | Localized trivia |
| Custom RSS | Your own feeds |
| Custom JSON API | Any endpoint returning items |

Toggle sources in **Settings > Feed > Sources**.

---

## SHORTCUTS

| Action | Keys |
|---|---|
| Open sidebar | `Alt+Shift+S` |
| Save selection | `Alt+Shift+C` |

---

## PRIVACY

All data stays in your browser.

API calls go directly to OpenAI or Google.  
No proxy, no analytics, no tracking.

Feed content comes from public third-party APIs. Sonto does not own or filter it.

OpenAI Privacy: https://openai.com/policies/privacy-policy/  
Google Gemini Terms: https://ai.google.dev/gemini-api/terms

---

## TECH

* TypeScript  
* Chrome Extension Manifest V3  
* Side Panel API  
* IndexedDB with cosine similarity search  
* esbuild bundling

Zero runtime dependencies.

---

## LICENSE

MIT. See [LICENSE](LICENSE).
