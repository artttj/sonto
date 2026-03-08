const en: Record<string, string> = {
  // Sidebar nav
  nav_general: 'General',
  nav_feed: 'Feed',
  nav_ai: 'AI',
  nav_how: 'How It Works',
  nav_privacy: 'Privacy',
  nav_info: 'Privacy & Info',
  nav_about: 'About',
  brand_sub: 'Settings',

  // Feed tab
  feed_heading: 'Feed',

  // General tab
  general_heading: 'General',
  general_desc: 'Configure the AI provider and language for chatting with your saved snippets.',
  general_provider: 'AI Provider',
  general_provider_desc: 'Which service answers your questions',
  general_language: 'Language',
  general_language_desc: 'Preferred response language',
  general_save: 'Save Settings',
  general_saved: 'Saved',

  // Zen display & refresh
  zen_display_title: 'Zen display',
  zen_display_desc: 'Feed scrolls continuously. Cosmos shows one message with spirograph animation in between.',
  zen_refresh_title: 'Speed',
  zen_refresh_desc: 'Seconds between each new item in the feed',
  zen_sources_title: 'Zen Feed Sources',
  zen_sources_desc: 'Choose which sources appear in your Zen feed. All are enabled by default.',

  // AI Connections tab
  ai_heading: 'AI',
  ai_desc: 'API keys are stored locally on your device and never sent anywhere except directly to your chosen provider.',
  ai_notice_title: 'Privacy & Data Notice',
  ai_notice_p1: 'When you ask a question, relevant snippet text is sent to your chosen AI provider for a response. Embeddings are generated via API (OpenAI or Gemini) when saving snippets.',
  ai_notice_no_storage: '<strong>No storage:</strong> This extension stores nothing on any server. API keys and all data stay on your device.',
  ai_notice_transfer: '<strong>Data transfer:</strong> Snippet text leaves your device only when generating embeddings or asking questions. It is processed by your chosen AI provider (OpenAI or Google).',
  ai_notice_personal: '<strong>Personal info:</strong> Avoid saving pages with sensitive health, financial, or private credentials.',
  ai_notice_responsibility: '<strong>Your responsibility:</strong> You are responsible for ensuring compliance with GDPR, CCPA, and other data protection regulations.',
  ai_notice_policies: 'Privacy Policies:',
  ai_sent_only: 'Sent only to',
  ai_save: 'Save',
  ai_clear: 'Clear',

  // How It Works tab
  how_heading: 'How It Works',
  how_desc: 'Sonto uses Retrieval-Augmented Generation (RAG) to answer your questions from saved snippets.',
  how_step1_title: 'Capture',
  how_step1_desc: 'You highlight text on any webpage and save it via keyboard shortcut (<code>Alt+Shift+C</code>) or right-click context menu. Browser history is also synced automatically every 30 minutes.',
  how_step2_title: 'Embed',
  how_step2_desc: 'Each snippet is converted into a vector embedding (a list of numbers representing its meaning). Sonto uses your API key to call one of these models:',
  how_step3_title: 'Store',
  how_step3_desc: 'Embeddings and snippet text are stored locally in your browser\'s IndexedDB. Nothing leaves your device at this point.',
  how_step4_title: 'Search',
  how_step4_desc: 'When you ask a question, your query is embedded with the same model. Sonto finds the most relevant snippets using cosine similarity on the stored vectors.',
  how_step5_title: 'Answer',
  how_step5_desc: 'The relevant snippets are sent as context along with your question to the selected chat model (OpenAI or Gemini). The AI generates an answer grounded in your saved data.',
  how_model_openai_note: 'Used when an OpenAI key is configured. Fast, cheap (~$0.02 per 1M tokens), high quality.',
  how_model_gemini_note: 'Fallback when only a Gemini key is configured. Free tier available.',
  how_shortcuts: 'Keyboard Shortcuts',
  how_shortcut_open: 'Open Sidebar',
  how_shortcut_open_desc: 'Opens the Sonto side panel',
  how_shortcut_capture: 'Capture Selection',
  how_shortcut_capture_desc: 'Saves highlighted text to your memory',

  // Privacy tab
  privacy_heading: 'Privacy',
  privacy_desc: 'How Sonto handles your data.',
  privacy_collection_heading: 'Data Collection',
  privacy_collection: 'Sonto collects no personal data. There are no accounts, no analytics, no telemetry, and no tracking of any kind. The extension is fully open source.',
  privacy_storage_heading: 'Local Storage',
  privacy_storage: 'All saved snippets, their vector embeddings, and your settings are stored locally in your browser using IndexedDB and <code>chrome.storage.local</code>. No data is sent to any Sonto server because there is no Sonto server.',
  privacy_keys_heading: 'API Keys',
  privacy_keys: 'Your API keys are stored locally on your device. They are only transmitted to the corresponding provider\'s API endpoint for authentication. Sonto never reads, logs, or forwards your keys anywhere else.',
  privacy_embeddings_heading: 'Embeddings',
  privacy_embeddings: 'When you save a snippet or sync browser history, the text is sent to your configured embedding provider (OpenAI or Gemini) to generate a vector representation. This is a one-time operation per snippet. The text is not stored by the provider beyond what their API terms specify.',
  privacy_chat_heading: 'AI Chat',
  privacy_chat: 'When you ask a question in the sidebar, the query and relevant snippet context are sent to your selected AI provider. The provider generates a response and returns it. Review their privacy policies:',
  privacy_history_heading: 'Browser History',
  privacy_history: 'Sonto reads your browser history (last 30 days) to automatically save page titles as searchable snippets. This data never leaves your browser except for the embedding API call. You can delete any history snippet from the sidebar at any time.',
  privacy_responsibility_heading: 'Your Responsibility',
  privacy_responsibility: 'You are responsible for the data you save and the API keys you provide. If you save sensitive content and then ask a question about it, that content will be sent to your chosen AI provider. Consider this before saving confidential information.',
  privacy_content_heading: 'Third-Party Content',
  privacy_content: 'The Zen feed displays content from public APIs (museums, news aggregators, quote services, NASA, and others). Sonto does not own, curate, or filter this content. The respective providers are responsible for the accuracy and appropriateness of their data. Use at your own discretion.',
  privacy_source: 'View source code on GitHub',

  // About tab
  about_heading: 'About Sonto',
  about_desc: 'Your local second brain for the browser.',
  about_version: 'Version',
  about_author: 'Author',
  about_license: 'License',
  about_license_text: 'MIT — free to use and modify.',
  about_github: 'View on GitHub',
};

export default en;
