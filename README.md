# <img src="icons/icon128.png" width="36" alt="" valign="middle" /> Sonto

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=for-the-badge)](LICENSE) ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) ![Google Chrome](https://img.shields.io/badge/Google%20Chrome-4285F4?style=for-the-badge&logo=GoogleChrome&logoColor=white)

## A calm sidebar for your browser

Sonto turns your Chrome sidebar into a slow, quiet feed of art, quotes, science facts, and news. New items appear at the pace you choose.

You can also save text from any page and ask questions about what you collected.

No accounts. No servers. No tracking. Everything stays on your machine.

---

## What you get

**Zen feed**
A steady stream of content from 15+ sources. Museum art, Mars rover photos, Hacker News, Reddit, trivia, quotes, and more.
New items appear every 10-90 seconds.

Two display modes:

* rolling feed
* single-message "cosmos" view with a spirograph animation

**Save anything**
Highlight text on any page and press `Alt+Shift+C`, or use the right-click menu.
If you want, Sonto can also index your browser history.

**Ask questions**
Chat with your saved snippets in the sidebar. Sonto finds the most relevant pieces and sends them as context to your AI provider.

**Custom RSS**
Add your own feeds. Blogs, newsletters, niche news. They appear directly in the zen stream.

**Your keys, your cost**
Bring your own OpenAI or Gemini API key. You pay the provider directly.

**Local by default**
Snippets and embeddings are stored in IndexedDB. Nothing leaves your browser except the API calls you choose to make.

---

## Quick start

### 1. Clone and build

```bash
git clone https://github.com/artttj/sonto.git
cd sonto
npm install
npm run build
```

### 2. Install

Open `chrome://extensions`

Enable **Developer mode**

Click **Load unpacked**

Select the `dist/` folder

### 3. Add an API key (optional)

You only need a key if you want chat and embeddings.

Open the Sonto sidebar
Click the gear icon, go to **AI**
Add your OpenAI or Gemini key

| Provider | Get a key |
| --- | --- |
| OpenAI | [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Google Gemini | [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |

The zen feed works without any API key.

---

## Sidebar modes

Switch between modes using the tabs at the bottom.

**Zen**
The main feed. Content from all enabled sources appears on a timer. Click any bubble to focus it. Feed interval, layout, and sources can be changed in settings.

**Browse**
View and manage saved snippets and indexed history.

**Chat**
Ask questions about your saved content. Sonto finds the closest matches using vector search and sends them to your AI model as context.

---

## Zen feed sources

| Source | What shows up |
| --- | --- |
| The Met Museum | Public domain paintings |
| Cleveland Museum of Art | Artworks and facts |
| Art Institute of Chicago | Public domain artworks |
| NASA Mars Rover | Curiosity and Perseverance photos |
| NASA Mars Images | Surface photos from the NASA image library |
| Hacker News | Top stories |
| Reddit | Posts from science, history, space and more |
| Trivia | Art, science, and book trivia |
| Random Facts | Short facts in your language |
| Stoic Quotes | Marcus Aurelius, Seneca, Epictetus |
| Design Quotes | Quotes from designers and thinkers |
| Zen Quotes | Quotes from zenquotes.io |
| Fun Quotes | Lighthearted quotes |
| Quote of the Day | Daily quote from FavQs |
| Daily Affirmations | Short affirmations |
| Advice Slip | Random advice |
| Custom RSS | Your own feeds |

You can enable or disable any source in **Settings > Feed > Sources**.

---

## How search works

1. **Capture**
   Save text from any page using the shortcut or context menu.
   Browser history can be indexed every 30 minutes if you enable it.

2. **Embed**
   Each snippet becomes a vector using your AI provider.

3. **Store**
   Vectors and text stay in IndexedDB on your device.

4. **Search**
   Your question is embedded and compared with stored vectors.

5. **Answer**
   The closest matches are sent to the chat model as context.

---

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Open sidebar | `Alt+Shift+S` |
| Save selection | `Alt+Shift+C` |

---

## Languages

English and German.
Change it in **Settings > Feed > Language**.

---

## Privacy

Everything is stored locally.

API keys are saved in `chrome.storage.local`.
Data is stored in IndexedDB.

API calls go directly from your browser to OpenAI or Google. No proxy, no middleman.

No analytics. No tracking. No accounts.

Provider policies:
[OpenAI](https://openai.com/policies/privacy-policy/) |
[Google AI](https://ai.google.dev/gemini-api/terms)

---

## Tech

* TypeScript (strict mode)
* Chrome Extension Manifest V3, Side Panel API
* IndexedDB vector search with cosine similarity
* esbuild
* Zero runtime dependencies

---

## License

MIT. See [LICENSE](LICENSE).
