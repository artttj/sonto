# <img src="icons/icon128.png" width="36" alt="" valign="middle" /> Sonto

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=for-the-badge)](LICENSE) ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) ![Google Chrome](https://img.shields.io/badge/Google%20Chrome-4285F4?style=for-the-badge&logo=GoogleChrome&logoColor=white)

## Your local second brain.

Sonto is a Chrome extension that captures highlighted text from any webpage, stores it locally with vector embeddings, and lets you chat with your browsing history using your own API key. No accounts, no servers, no telemetry.

- **Save anything.** Highlight text on any page, press `Alt+Shift+C` or right-click to save it. Browser history syncs automatically.
- **Ask questions.** Chat with your saved snippets in the sidebar. Sonto finds the most relevant context and sends it to your AI provider.
- **Your keys, your cost.** Connect your own OpenAI or Gemini API key. You pay the provider directly.
- **Fully local.** Snippets and embeddings live in IndexedDB on your machine. Nothing leaves your browser except API calls you initiate.
- **Privacy by design.** No backend, no analytics, no tracking. Open source.

---

## Quick Start

1. **Clone & build:**
   ```bash
   git clone https://github.com/artttj/sonto.git && cd sonto
   npm install && npm run build
   ```

2. **Install:**
   - Open `chrome://extensions`
   - Turn on **Developer mode** (top right)
   - Click **Load unpacked**
   - Select the `dist/` folder

3. **Connect an API key:**
   - Click the Sonto icon to open the sidebar
   - Click the gear icon → **AI Connections**
   - Add your OpenAI or Gemini API key

| Provider | Get a key |
| --- | --- |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Google Gemini | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |

---

## How It Works

Sonto uses Retrieval-Augmented Generation (RAG):

1. **Capture**:Save text from any page via shortcut or context menu. Browser history (last 30 days) syncs automatically every 30 minutes.
2. **Embed**:Each snippet is converted to a vector embedding via API (`text-embedding-3-small` for OpenAI, `text-embedding-004` for Gemini).
3. **Store**:Embeddings and text are stored locally in IndexedDB. Nothing leaves your device at this point.
4. **Search**:When you ask a question, your query is embedded and compared against stored vectors using cosine similarity.
5. **Answer**:The top 10 matching snippets are sent as context to your chat model. The AI generates a grounded response.

---

## Keyboard Shortcuts

| Action | Shortcut |
| --- | --- |
| **Open sidebar** | `Alt+Shift+S` |
| **Save selection** | `Alt+Shift+C` |

---

## Languages

The settings interface supports:

- **English**
- **Deutsch** (German)

Switch in Settings → General → Language.

---

## Privacy & Security

- **Local storage only.** API keys in `chrome.storage.local`. Snippets and embeddings in IndexedDB. Never synced.
- **Direct API calls.** Your text goes straight from your browser to OpenAI or Google. Sonto has no backend.
- **No telemetry.** No analytics, no tracking, no accounts. The extension is fully open source.

Provider privacy: [OpenAI](https://openai.com/policies/privacy-policy/) · [Google AI](https://ai.google.dev/gemini-api/terms)

---

## Tech Stack

- TypeScript (strict mode)
- Chrome Extension Manifest V3 with Side Panel API
- IndexedDB vector store with cosine similarity search
- esbuild for builds

---

## License

MIT. See [LICENSE](LICENSE).
