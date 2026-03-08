const de: Record<string, string> = {
  // Sidebar nav
  nav_general: 'Allgemein',
  nav_feed: 'Feed',
  nav_ai: 'KI',
  nav_how: 'So funktioniert\u2019s',
  nav_privacy: 'Datenschutz',
  nav_info: 'Datenschutz & Info',
  nav_about: '\u00dcber',
  brand_sub: 'Einstellungen',

  // Feed tab
  feed_heading: 'Feed',

  // General tab
  general_heading: 'Allgemein',
  general_desc: 'KI-Anbieter und Sprache f\u00fcr den Chat mit deinen gespeicherten Snippets konfigurieren.',
  general_provider: 'KI-Anbieter',
  general_provider_desc: 'Welcher Dienst deine Fragen beantwortet',
  general_language: 'Sprache',
  general_language_desc: 'Bevorzugte Antwortsprache',
  general_save: 'Einstellungen speichern',
  general_saved: 'Gespeichert',

  // Zen display & refresh
  zen_display_title: 'Zen-Ansicht',
  zen_display_desc: 'Feed scrollt kontinuierlich. Cosmos zeigt eine Nachricht mit Spirograph-Animation dazwischen.',
  zen_refresh_title: 'Geschwindigkeit',
  zen_refresh_desc: 'Sekunden zwischen jedem neuen Beitrag im Feed',
  zen_sources_title: 'Zen-Feed-Quellen',
  zen_sources_desc: 'Wähle welche Quellen im Zen-Feed erscheinen. Alle sind standardmäßig aktiviert.',

  // AI Connections tab
  ai_heading: 'KI',
  ai_desc: 'API-Schl\u00fcssel werden lokal auf deinem Ger\u00e4t gespeichert und nur direkt an den gew\u00e4hlten Anbieter gesendet.',
  ai_notice_title: 'Datenschutz- & Datenhinweis',
  ai_notice_p1: 'Wenn du eine Frage stellst, wird relevanter Snippet-Text an deinen gew\u00e4hlten KI-Anbieter gesendet. Embeddings werden beim Speichern von Snippets per API (OpenAI oder Gemini) erzeugt.',
  ai_notice_no_storage: '<strong>Keine Speicherung:</strong> Diese Erweiterung speichert nichts auf einem Server. API-Schl\u00fcssel und alle Daten bleiben auf deinem Ger\u00e4t.',
  ai_notice_transfer: '<strong>Daten\u00fcbertragung:</strong> Snippet-Text verl\u00e4sst dein Ger\u00e4t nur beim Erzeugen von Embeddings oder beim Stellen von Fragen. Die Verarbeitung erfolgt durch deinen gew\u00e4hlten KI-Anbieter (OpenAI oder Google).',
  ai_notice_personal: '<strong>Pers\u00f6nliche Daten:</strong> Vermeide das Speichern von Seiten mit sensiblen Gesundheits-, Finanz- oder privaten Zugangsdaten.',
  ai_notice_responsibility: '<strong>Deine Verantwortung:</strong> Du bist daf\u00fcr verantwortlich, die Einhaltung der DSGVO und anderer Datenschutzbestimmungen sicherzustellen.',
  ai_notice_policies: 'Datenschutzrichtlinien:',
  ai_sent_only: 'Gesendet nur an',
  ai_save: 'Speichern',
  ai_clear: 'L\u00f6schen',

  // How It Works tab
  how_heading: 'So funktioniert\u2019s',
  how_desc: 'Sonto nutzt Retrieval-Augmented Generation (RAG), um deine Fragen aus gespeicherten Snippets zu beantworten.',
  how_step1_title: 'Erfassen',
  how_step1_desc: 'Du markierst Text auf einer Webseite und speicherst ihn per Tastenkombination (<code>Alt+Shift+C</code>) oder Rechtsklick-Kontextmen\u00fc. Der Browserverlauf wird auch automatisch alle 30 Minuten synchronisiert.',
  how_step2_title: 'Einbetten',
  how_step2_desc: 'Jedes Snippet wird in ein Vektor-Embedding umgewandelt (eine Liste von Zahlen, die seine Bedeutung repr\u00e4sentieren). Sonto nutzt deinen API-Schl\u00fcssel, um eines dieser Modelle aufzurufen:',
  how_step3_title: 'Speichern',
  how_step3_desc: 'Embeddings und Snippet-Text werden lokal in der IndexedDB deines Browsers gespeichert. An diesem Punkt verl\u00e4sst nichts dein Ger\u00e4t.',
  how_step4_title: 'Suchen',
  how_step4_desc: 'Wenn du eine Frage stellst, wird deine Anfrage mit dem gleichen Modell eingebettet. Sonto findet die relevantesten Snippets mittels Kosinusähnlichkeit der gespeicherten Vektoren.',
  how_step5_title: 'Antworten',
  how_step5_desc: 'Die relevanten Snippets werden als Kontext zusammen mit deiner Frage an das gew\u00e4hlte Chat-Modell (OpenAI oder Gemini) gesendet. Die KI generiert eine Antwort basierend auf deinen gespeicherten Daten.',
  how_model_openai_note: 'Wird verwendet, wenn ein OpenAI-Schl\u00fcssel konfiguriert ist. Schnell, g\u00fcnstig (~$0,02 pro 1M Tokens), hohe Qualit\u00e4t.',
  how_model_gemini_note: 'Fallback, wenn nur ein Gemini-Schl\u00fcssel konfiguriert ist. Kostenloses Kontingent verf\u00fcgbar.',
  how_shortcuts: 'Tastenkombinationen',
  how_shortcut_open: 'Seitenleiste \u00f6ffnen',
  how_shortcut_open_desc: '\u00d6ffnet das Sonto-Seitenpanel',
  how_shortcut_capture: 'Auswahl speichern',
  how_shortcut_capture_desc: 'Speichert markierten Text in deinem Ged\u00e4chtnis',

  // Privacy tab
  privacy_heading: 'Datenschutz',
  privacy_desc: 'Wie Sonto mit deinen Daten umgeht.',
  privacy_collection_heading: 'Datenerhebung',
  privacy_collection: 'Sonto erhebt keine personenbezogenen Daten. Es gibt keine Konten, keine Analytik, keine Telemetrie und kein Tracking jeglicher Art. Die Erweiterung ist vollst\u00e4ndig quelloffen.',
  privacy_storage_heading: 'Lokale Speicherung',
  privacy_storage: 'Alle gespeicherten Snippets, ihre Vektor-Embeddings und deine Einstellungen werden lokal in deinem Browser mit IndexedDB und <code>chrome.storage.local</code> gespeichert. Es werden keine Daten an einen Sonto-Server gesendet, weil es keinen Sonto-Server gibt.',
  privacy_keys_heading: 'API-Schl\u00fcssel',
  privacy_keys: 'Deine API-Schl\u00fcssel werden lokal auf deinem Ger\u00e4t gespeichert. Sie werden nur an den jeweiligen API-Endpunkt des Anbieters zur Authentifizierung \u00fcbertragen. Sonto liest, protokolliert oder leitet deine Schl\u00fcssel niemals anderweitig weiter.',
  privacy_embeddings_heading: 'Embeddings',
  privacy_embeddings: 'Wenn du ein Snippet speicherst oder den Browserverlauf synchronisierst, wird der Text an deinen konfigurierten Embedding-Anbieter (OpenAI oder Gemini) gesendet, um eine Vektordarstellung zu erzeugen. Dies ist ein einmaliger Vorgang pro Snippet. Der Text wird vom Anbieter nicht \u00fcber das hinaus gespeichert, was seine API-Bedingungen vorsehen.',
  privacy_chat_heading: 'KI-Chat',
  privacy_chat: 'Wenn du eine Frage in der Seitenleiste stellst, werden die Anfrage und der relevante Snippet-Kontext an deinen gew\u00e4hlten KI-Anbieter gesendet. Der Anbieter generiert eine Antwort und gibt sie zur\u00fcck. Pr\u00fcfe die Datenschutzrichtlinien:',
  privacy_history_heading: 'Browserverlauf',
  privacy_history: 'Sonto liest deinen Browserverlauf (letzte 30 Tage), um Seitentitel automatisch als durchsuchbare Snippets zu speichern. Diese Daten verlassen deinen Browser nur f\u00fcr den Embedding-API-Aufruf. Du kannst jedes Verlaufs-Snippet jederzeit aus der Seitenleiste l\u00f6schen.',
  privacy_responsibility_heading: 'Deine Verantwortung',
  privacy_responsibility: 'Du bist f\u00fcr die Daten verantwortlich, die du speicherst, und f\u00fcr die API-Schl\u00fcssel, die du angibst. Wenn du sensible Inhalte speicherst und dann eine Frage dazu stellst, werden diese Inhalte an deinen gew\u00e4hlten KI-Anbieter gesendet. Ber\u00fccksichtige dies, bevor du vertrauliche Informationen speicherst.',
  privacy_source: 'Quellcode auf GitHub ansehen',

  // About tab
  about_heading: '\u00dcber Sonto',
  about_desc: 'Dein lokales zweites Gehirn f\u00fcr den Browser.',
  about_version: 'Version',
  about_author: 'Autor',
  about_license: 'Lizenz',
  about_license_text: 'MIT \u2014 frei nutzbar und ver\u00e4nderbar.',
  about_github: 'Auf GitHub ansehen',
};

export default de;
