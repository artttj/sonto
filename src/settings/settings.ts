// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { PROVIDER_MODELS } from '../shared/constants';
import { escapeHtml } from '../shared/utils';
import {
  getSettings,
  saveSettings,
  getOpenAIKey,
  saveOpenAIKey,
  getGeminiKey,
  saveGeminiKey,
  getDisabledSources,
  saveDisabledSources,
  getDripInterval,
  saveDripInterval,
  getZenDisplay,
  saveZenDisplay,
  getCustomFeeds,
  saveCustomFeeds,
  isHistoryEnabled,
  setHistoryEnabled,
  getHistoryDomainRules,
  saveHistoryDomainRules,
  getCustomJsonSources,
  saveCustomJsonSources,
  getTheme,
  getHistorySyncState,
  hasApiKey,
} from '../shared/storage';
import { parseFeed } from '../shared/rss-parser';
import { exportBackup, importBackup, downloadBackup } from '../shared/backup';
import { clearAllSnippets, getSnippetCount } from '../shared/embeddings/vector-store';
import { setLocale, applyI18n } from '../shared/i18n';
import { MSG } from '../shared/messages';
import type { ProviderName } from '../shared/types';

function qs<T extends HTMLElement>(selector: string): T {
  return document.querySelector<T>(selector)!;
}

function showStatus(id: string): void {
  const el = document.getElementById(id)!;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2200);
}

function populateModelSelect(selectId: string, provider: string, current: string): void {
  const select = qs<HTMLSelectElement>(`#${selectId}`);
  select.innerHTML = '';
  for (const model of PROVIDER_MODELS[provider] ?? []) {
    const opt = document.createElement('option');
    opt.value = model;
    opt.textContent = model;
    opt.selected = model === current;
    select.appendChild(opt);
  }
}

function updateKeyBadge(badgeId: string, hasKey: boolean): void {
  const badge = document.getElementById(badgeId)!;
  badge.textContent = hasKey ? 'Configured' : 'Not Configured';
  badge.className = `status-badge ${hasKey ? 'connected' : 'unconfigured'}`;
}

function initTabs(): void {
  const items = document.querySelectorAll<HTMLButtonElement>('.nav-item');
  const panels = document.querySelectorAll<HTMLElement>('.tab-panel');

  items.forEach((item) => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab!;
      items.forEach((i) => i.classList.remove('active'));
      panels.forEach((p) => p.classList.add('hidden'));
      item.classList.add('active');
      document.getElementById(`tab-${tab}`)?.classList.remove('hidden');
    });
  });
}

function initSegmented(
  containerId: string,
  onSelect: (value: string) => void,
): (val: string) => void {
  const container = document.getElementById(containerId)!;
  const buttons = container.querySelectorAll<HTMLButtonElement>('.seg-btn');

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onSelect(btn.dataset.value!);
    });
  });

  return (val: string) => {
    buttons.forEach((b) => b.classList.toggle('active', b.dataset.value === val));
  };
}


const ZEN_SOURCES: Array<{ id: string; label: string }> = [
  { id: 'philosophyEssay',     label: '1000-Word Philosophy' },
  { id: 'clevelandArtwork',    label: 'Art from Cleveland Museum' },
  { id: 'metArtwork',          label: 'Art from The Met (New York)' },
  { id: 'atlasObscura',        label: 'Atlas Obscura' },
  { id: 'gettyArtwork',        label: 'Getty Museum Art' },
  { id: 'hnStory',             label: 'Hacker News Headlines' },
  { id: 'haiku',               label: 'Haiku' },
  { id: 'kotowaza',            label: 'Japanese Proverbs' },
  { id: 'obliqueStrategies',   label: 'Oblique Strategies' },
  { id: 'marsRover',           label: 'Perseverance Rover Photos' },
  { id: 'wikimediaPaintings',  label: 'Wikimedia Commons Paintings' },
  { id: 'albumOfDay',          label: 'Album of a Day' },
  { id: 'reddit',              label: 'Reddit (Science, Space, Philosophy)' },
  { id: 'rijksmuseumArtwork',  label: 'Rijksmuseum (Amsterdam)' },
  { id: 'smithsonianNews',     label: 'Smithsonian Smart News' },
];

const ZEN_CUSTOM_SOURCES: Array<{ id: string; label: string }> = [
  { id: 'customRss',           label: 'Custom RSS Feeds' },
  { id: 'customJson',          label: 'Custom JSON API Sources' },
];

async function init(): Promise<void> {
  const settings = await getSettings();

  const theme = await getTheme();
  document.documentElement.dataset.theme = theme;

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.sonto_theme) {
      document.documentElement.dataset.theme = changes.sonto_theme.newValue as string;
    }
  });

  setLocale(settings.language);
  applyI18n();
  initTabs();

  const [openaiKey, geminiKey] = await Promise.all([getOpenAIKey(), getGeminiKey()]);

  const setProvider = initSegmented('provider-segmented', (val) => {
    void saveSettings({ llmProvider: val as ProviderName });
  });

  const setLanguage = initSegmented('language-segmented', (val) => {
    setLocale(val);
    applyI18n();
    void saveSettings({ language: val as typeof settings.language });
  });

  setProvider(settings.llmProvider);
  setLanguage(settings.language);

  populateModelSelect('openai-model', 'openai', settings.openaiModel);
  populateModelSelect('gemini-model', 'gemini', settings.geminiModel);

  qs<HTMLSelectElement>('#openai-model').addEventListener('change', (e) => {
    void saveSettings({ openaiModel: (e.target as HTMLSelectElement).value });
  });
  qs<HTMLSelectElement>('#gemini-model').addEventListener('change', (e) => {
    void saveSettings({ geminiModel: (e.target as HTMLSelectElement).value });
  });

  updateKeyBadge('badge-openai', !!openaiKey);
  updateKeyBadge('badge-gemini', !!geminiKey);

  const openaiInput = qs<HTMLInputElement>('#openai-key');
  const geminiInput = qs<HTMLInputElement>('#gemini-key');

  if (openaiKey) openaiInput.value = openaiKey;
  if (geminiKey) geminiInput.value = geminiKey;

  const storedZenDisplay = await getZenDisplay();
  const setZenDisplay = initSegmented('zen-display-segmented', (val) => {
    void saveZenDisplay(val as 'feed' | 'cosmos');
  });
  setZenDisplay(storedZenDisplay);

  const dripSlider = document.getElementById('drip-interval-slider') as HTMLInputElement;
  const dripCurrentValue = document.getElementById('drip-current-value')!;
  const storedInterval = await getDripInterval();
  dripSlider.value = String(storedInterval / 1000);
  dripCurrentValue.textContent = `${dripSlider.value}s`;
  dripSlider.addEventListener('input', () => {
    dripCurrentValue.textContent = `${dripSlider.value}s`;
  });
  dripSlider.addEventListener('change', () => {
    void saveDripInterval(parseInt(dripSlider.value, 10) * 1000);
  });

  await initHistoryToggle();

  document.getElementById('btn-save-openai')!.addEventListener('click', async () => {
    await saveOpenAIKey(openaiInput.value.trim());
    updateKeyBadge('badge-openai', !!openaiInput.value.trim());
    showStatus('keys-status');
  });

  document.getElementById('btn-clear-openai')!.addEventListener('click', async () => {
    await saveOpenAIKey('');
    openaiInput.value = '';
    updateKeyBadge('badge-openai', false);
    showStatus('keys-status');
  });

  document.getElementById('btn-save-gemini')!.addEventListener('click', async () => {
    await saveGeminiKey(geminiInput.value.trim());
    updateKeyBadge('badge-gemini', !!geminiInput.value.trim());
    showStatus('keys-status');
  });

  document.getElementById('btn-clear-gemini')!.addEventListener('click', async () => {
    await saveGeminiKey('');
    geminiInput.value = '';
    updateKeyBadge('badge-gemini', false);
    showStatus('keys-status');
  });

  const versionEl = document.getElementById('about-version');
  if (versionEl) {
    versionEl.textContent = chrome.runtime.getManifest().version;
  }

  const disabledSources = new Set(await getDisabledSources());
  const sourcesList = document.getElementById('zen-sources-list')!;

  const addSourceRows = (sources: Array<{ id: string; label: string }>) => {
    for (const source of sources) {
      const row = document.createElement('div');
      row.className = 'zen-source-row';

      const label = document.createElement('span');
      label.className = 'zen-source-label';
      label.textContent = source.label;

      const toggleLabel = document.createElement('label');
      toggleLabel.className = 'toggle-switch';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !disabledSources.has(source.id);
      input.addEventListener('change', async () => {
        if (input.checked) {
          disabledSources.delete(source.id);
        } else {
          disabledSources.add(source.id);
        }
        await saveDisabledSources([...disabledSources]);
      });

      const track = document.createElement('span');
      track.className = 'toggle-track';

      toggleLabel.appendChild(input);
      toggleLabel.appendChild(track);
      row.appendChild(label);
      row.appendChild(toggleLabel);
      sourcesList.appendChild(row);
    }
  };

  addSourceRows(ZEN_SOURCES);

  addSourceRows(ZEN_CUSTOM_SOURCES);

  const hasAnyKey = !!openaiKey || !!geminiKey;
  const navWarning = document.getElementById('nav-ai-warning');
  if (navWarning && !hasAnyKey) navWarning.classList.remove('hidden');

  await initRssFeeds();
  await initJsonSources();
  initDataTab();
}

async function initHistoryToggle(): Promise<void> {
  const toggle = document.getElementById('toggle-history-enabled') as HTMLInputElement;
  if (!toggle) return;
  toggle.checked = await isHistoryEnabled();
  toggle.addEventListener('change', () => {
    void setHistoryEnabled(toggle.checked);
    void updateHistorySyncStatus();
  });

  await initHistoryDomainRules();
  initHistorySyncStatus();
}

let historySyncInterval: ReturnType<typeof setInterval> | null = null;

async function updateHistorySyncStatus(): Promise<void> {
  const statusEl = document.getElementById('history-sync-status-text');
  const syncBtn = document.getElementById('btn-sync-history-now') as HTMLButtonElement | null;
  if (!statusEl || !syncBtn) return;

  const isEnabled = await isHistoryEnabled();
  if (!isEnabled) {
    statusEl.textContent = 'History sync is disabled.';
    syncBtn.disabled = true;
    syncBtn.textContent = 'Sync Now';
    return;
  }

  const state = await getHistorySyncState();
  
  if (state.status === 'syncing') {
    syncBtn.disabled = true;
    syncBtn.textContent = 'Syncing...';
    if (state.progress && state.progress.total > 0) {
      const left = state.progress.total - state.progress.current;
      statusEl.textContent = `Syncing... ${left} item${left === 1 ? '' : 's'} left`;
    } else {
      statusEl.textContent = 'Syncing in progress...';
    }
  } else {
    syncBtn.disabled = false;
    syncBtn.textContent = 'Sync Now';
    
    if (state.status === 'error') {
      statusEl.innerHTML = `<span style="color:var(--c-error)">Error: ${escapeHtml(state.error || 'Unknown error')}</span>`;
    } else if (state.lastSyncedAt) {
      const mins = Math.floor((Date.now() - state.lastSyncedAt) / 60000);
      statusEl.textContent = `Last synced: ${mins === 0 ? 'just now' : `${mins} min${mins === 1 ? '' : 's'} ago`}`;
    } else {
      statusEl.textContent = 'Never synced.';
    }
  }
}

function initHistorySyncStatus(): void {
  const syncBtn = document.getElementById('btn-sync-history-now') as HTMLButtonElement | null;
  const statusEl = document.getElementById('history-sync-status-text');
  if (!syncBtn || !statusEl) return;

  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncBtn.textContent = 'Starting...';
    
    if (!await hasApiKey()) {
      statusEl.innerHTML = `<span style="color:var(--c-error)">Error: No API key configured. Required for embeddings.</span>`;
      syncBtn.disabled = false;
      syncBtn.textContent = 'Sync Now';
      return;
    }
    
    await chrome.runtime.sendMessage({ type: MSG.SYNC_HISTORY });
    void updateHistorySyncStatus();
  });

  void updateHistorySyncStatus();
  if (historySyncInterval) clearInterval(historySyncInterval);
  historySyncInterval = setInterval(() => void updateHistorySyncStatus(), 2000);
}

async function initHistoryDomainRules(): Promise<void> {
  const modeStatusEl = document.getElementById('history-domain-status');
  const errorEl = document.getElementById('history-domain-error') as HTMLElement | null;
  const blockedList = document.getElementById('history-blocked-list');
  const allowedList = document.getElementById('history-allowed-list');
  const blockedInput = document.getElementById('history-blocked-input') as HTMLInputElement | null;
  const allowedInput = document.getElementById('history-allowed-input') as HTMLInputElement | null;
  const blockedAddBtn = document.getElementById('history-blocked-add-btn');
  const allowedAddBtn = document.getElementById('history-allowed-add-btn');
  const blockedCol = document.getElementById('history-blocked-col');
  const allowedCol = document.getElementById('history-allowed-col');
  if (!modeStatusEl || !blockedList || !allowedList || !blockedInput || !allowedInput || !blockedAddBtn || !allowedAddBtn || !blockedCol || !allowedCol) return;

  let rules = await getHistoryDomainRules();

  const setMode = initSegmented('history-domain-mode-segmented', (value) => {
    rules.mode = value === 'allowlist' ? 'allowlist' : 'all';
    void saveHistoryDomainRules(rules).then(render);
  });

  const renderDomainList = (
    container: HTMLElement,
    domains: string[],
    emptyLabel: string,
    badgeLabel: string,
    remove: (domain: string) => Promise<void>,
  ) => {
    container.innerHTML = '';
    if (domains.length === 0) {
      container.innerHTML = `<div class="history-domain-empty">${emptyLabel}</div>`;
      return;
    }

    domains.forEach((domain) => {
      const row = document.createElement('div');
      row.className = 'history-domain-row';
      row.innerHTML = `
        <span class="history-domain-name">${escapeHtml(domain)}</span>
        <div class="history-domain-meta">
          <span class="history-domain-badge">${escapeHtml(badgeLabel)}</span>
          <button class="history-domain-remove" type="button" aria-label="Remove ${escapeHtml(domain)}">✕</button>
        </div>
      `;
      row.querySelector('button')!.addEventListener('click', () => void remove(domain));
      container.appendChild(row);
    });
  };

  const render = () => {
    setMode(rules.mode);
    
    // Toggle column visibility
    if (rules.mode === 'allowlist') {
      blockedCol.style.display = 'none';
      allowedCol.style.display = 'block';
    } else {
      blockedCol.style.display = 'block';
      allowedCol.style.display = 'none';
    }

    renderDomainList(blockedList, rules.blocked, 'No blocked domains yet.', 'Excluded', async (domain) => {
      rules = { ...rules, blocked: rules.blocked.filter((entry) => entry !== domain) };
      await saveHistoryDomainRules(rules);
      render();
    });
    renderDomainList(allowedList, rules.allowed, 'No allowed domains yet.', 'Included', async (domain) => {
      rules = { ...rules, allowed: rules.allowed.filter((entry) => entry !== domain) };
      await saveHistoryDomainRules(rules);
      render();
    });

    modeStatusEl.textContent = rules.mode === 'allowlist'
      ? `Status: only ${rules.allowed.length} allowed domain${rules.allowed.length === 1 ? '' : 's'} sync into memory.`
      : `Status: all domains sync except ${rules.blocked.length} blocked domain${rules.blocked.length === 1 ? '' : 's'}.`;
  };

  const addDomain = async (kind: 'blocked' | 'allowed', input: HTMLInputElement) => {
    const normalized = normalizeDomain(input.value);
    if (errorEl) errorEl.style.display = 'none';
    if (!normalized) {
      if (errorEl) {
        errorEl.textContent = 'Enter a valid domain like example.com';
        errorEl.style.display = '';
      }
      return;
    }

    const values = new Set(rules[kind]);
    values.add(normalized);
    rules = { ...rules, [kind]: [...values].sort() };
    await saveHistoryDomainRules(rules);
    input.value = '';
    render();
  };

  blockedAddBtn.addEventListener('click', () => void addDomain('blocked', blockedInput));
  allowedAddBtn.addEventListener('click', () => void addDomain('allowed', allowedInput));
  blockedInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void addDomain('blocked', blockedInput);
    }
  });
  allowedInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void addDomain('allowed', allowedInput);
    }
  });

  render();
}

function normalizeDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  const withoutProtocol = trimmed.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(withoutProtocol) ? withoutProtocol : '';
}

async function initRssFeeds(): Promise<void> {
  const list = document.getElementById('rss-feeds-list')!;
  const input = document.getElementById('rss-url-input') as HTMLInputElement;
  const addBtn = document.getElementById('rss-add-btn')!;
  const errorEl = document.getElementById('rss-feed-error')!;

  const render = async () => {
    const feeds = await getCustomFeeds();
    list.innerHTML = '';
    if (feeds.length === 0) {
      list.innerHTML = '<p class="setting-hint">No feeds added yet.</p>';
      return;
    }
    feeds.forEach((feed, i) => {
      const row = document.createElement('div');
      row.className = 'rss-feed-row';
      row.innerHTML = `<span class="rss-feed-url">${escapeHtml(feed.label || feed.url)}</span>
        <button class="rss-remove" data-i="${i}" title="Remove">✕</button>`;
      row.querySelector('.rss-remove')!.addEventListener('click', async () => {
        const current = await getCustomFeeds();
        await saveCustomFeeds(current.filter((_, j) => j !== i));
        await render();
      });
      list.appendChild(row);
    });
  };

  addBtn.addEventListener('click', async () => {
    const url = input.value.trim();
    errorEl.style.display = 'none';
    if (!url.startsWith('http')) {
      errorEl.textContent = 'Enter a valid http/https URL';
      errorEl.style.display = '';
      return;
    }
    const feeds = await getCustomFeeds();
    if (feeds.some((f) => f.url === url)) {
      errorEl.textContent = 'Feed already added';
      errorEl.style.display = '';
      return;
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
      if (!res.ok) throw new Error('bad response');
      const xml = await res.text();
      const items = parseFeed(xml);
      if (items.length === 0) throw new Error('no items');
    } catch {
      errorEl.textContent = 'Could not load or parse feed. Check the URL.';
      errorEl.style.display = '';
      return;
    }
    const label = new URL(url).hostname;
    await saveCustomFeeds([...feeds, { url, label }]);
    input.value = '';
    await render();
  });

  await render();
}

async function initJsonSources(): Promise<void> {
  const list = document.getElementById('json-sources-list')!;
  const urlInput = document.getElementById('json-source-url-input') as HTMLInputElement;
  const labelInput = document.getElementById('json-source-label-input') as HTMLInputElement;
  const addBtn = document.getElementById('json-source-add-btn')!;
  const errorEl = document.getElementById('json-source-error')!;

  const render = async () => {
    const sources = await getCustomJsonSources();
    list.innerHTML = '';
    if (sources.length === 0) {
      list.innerHTML = '<p class="setting-hint">No sources added yet.</p>';
      return;
    }
    sources.forEach((source, i) => {
      const row = document.createElement('div');
      row.className = 'rss-feed-row';
      row.innerHTML = `<span class="rss-feed-url">${escapeHtml(source.label || source.url)}</span>
        <button class="rss-remove" data-i="${i}" title="Remove">✕</button>`;
      row.querySelector('.rss-remove')!.addEventListener('click', async () => {
        const current = await getCustomJsonSources();
        await saveCustomJsonSources(current.filter((_, j) => j !== i));
        await render();
      });
      list.appendChild(row);
    });
  };

  addBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    errorEl.style.display = 'none';
    if (!url.startsWith('http')) {
      errorEl.textContent = 'Enter a valid http/https URL';
      errorEl.style.display = '';
      return;
    }
    const sources = await getCustomJsonSources();
    if (sources.some((s) => s.url === url)) {
      errorEl.textContent = 'Source already added';
      errorEl.style.display = '';
      return;
    }
    const label = labelInput.value.trim() || new URL(url).hostname;
    await saveCustomJsonSources([...sources, { url, label }]);
    urlInput.value = '';
    labelInput.value = '';
    await render();
  });

  await render();
}

function initDataTab(): void {
  document.getElementById('btn-export')!.addEventListener('click', async () => {
    const json = await exportBackup();
    downloadBackup(json);
    showStatus('export-status');
  });

  const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
  const mergeToggle = document.getElementById('import-merge-toggle') as HTMLInputElement;
  const importError = document.getElementById('import-error')!;
  const importStatus = document.getElementById('import-status')!;

  document.getElementById('btn-import')!.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    importError.style.display = 'none';
    try {
      const text = await file.text();
      const result = await importBackup(text, mergeToggle.checked);
      importStatus.textContent = `Imported ${result.snippets} snippets, ${result.sessions} sessions`;
      importStatus.classList.remove('hidden');
      setTimeout(() => importStatus.classList.add('hidden'), 4000);
    } catch (err: unknown) {
      importError.textContent = err instanceof Error ? err.message : 'Import failed';
      importError.style.display = '';
    }
    fileInput.value = '';
  });

  document.getElementById('btn-clear-all')!.addEventListener('click', async () => {
    const count = await getSnippetCount();
    if (count === 0) return;
    const confirmed = confirm(`Delete all ${count} snippets? This cannot be undone.`);
    if (!confirmed) return;
    await clearAllSnippets();
    importStatus.textContent = 'All snippets deleted';
    importStatus.classList.remove('hidden');
    setTimeout(() => importStatus.classList.add('hidden'), 3000);
  });
}

void init();
