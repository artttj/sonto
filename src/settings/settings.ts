import { PROVIDER_MODELS } from '../shared/constants';
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
} from '../shared/storage';
import { parseFeed } from '../shared/rss-parser';
import { setLocale, applyI18n } from '../shared/i18n';
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

function initSegmented(containerId: string, onSelect: (value: string) => void): (val: string) => void {
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

async function init(): Promise<void> {
  const settings = await getSettings();

  setLocale(settings.language);
  applyI18n();

  initTabs();

  const [openaiKey, geminiKey] = await Promise.all([getOpenAIKey(), getGeminiKey()]);

  let selectedProvider: ProviderName = settings.llmProvider;
  let selectedLanguage = settings.language;

  const setProvider = initSegmented('provider-segmented', (val) => { selectedProvider = val as ProviderName; });
  const setLanguage = initSegmented('language-segmented', (val) => {
    selectedLanguage = val as typeof settings.language;
    setLocale(selectedLanguage);
    applyI18n();
  });

  setProvider(settings.llmProvider);
  setLanguage(settings.language);

  populateModelSelect('openai-model', 'openai', settings.openaiModel);
  populateModelSelect('gemini-model', 'gemini', settings.geminiModel);

  updateKeyBadge('badge-openai', !!openaiKey);
  updateKeyBadge('badge-gemini', !!geminiKey);

  const openaiInput = qs<HTMLInputElement>('#openai-key');
  const geminiInput = qs<HTMLInputElement>('#gemini-key');

  if (openaiKey) openaiInput.value = openaiKey;
  if (geminiKey) geminiInput.value = geminiKey;

  // Zen display (tracked, saved with main Save button)
  const storedZenDisplay = await getZenDisplay();
  let selectedZenDisplay: 'feed' | 'cosmos' = storedZenDisplay;
  const setZenDisplay = initSegmented('zen-display-segmented', (val) => {
    selectedZenDisplay = val as 'feed' | 'cosmos';
  });
  setZenDisplay(storedZenDisplay);

  // Drip interval slider (tracked, saved with main Save button)
  const dripSlider = document.getElementById('drip-interval-slider') as HTMLInputElement;
  const dripValueEl = document.getElementById('drip-interval-value')!;
  const storedInterval = await getDripInterval();
  let selectedDripSeconds = storedInterval / 1000;
  dripSlider.value = String(selectedDripSeconds);
  dripValueEl.textContent = `${selectedDripSeconds}s`;
  dripSlider.addEventListener('input', () => {
    selectedDripSeconds = parseInt(dripSlider.value, 10);
    dripValueEl.textContent = `${selectedDripSeconds}s`;
  });

  document.getElementById('btn-save-settings')!.addEventListener('click', async () => {
    const openaiModel = qs<HTMLSelectElement>('#openai-model').value;
    const geminiModel = qs<HTMLSelectElement>('#gemini-model').value;

    await Promise.all([
      saveSettings({ llmProvider: selectedProvider, openaiModel, geminiModel, language: selectedLanguage }),
      saveZenDisplay(selectedZenDisplay),
      saveDripInterval(selectedDripSeconds * 1000),
    ]);
    showStatus('settings-status');
  });

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

  // Zen Feed Sources
  const ZEN_SOURCES: Array<{ id: string; label: string }> = [
    { id: 'predefined',   label: 'Challenges, Affirmations & Quotes' },
    { id: 'metArtwork',   label: 'Met Museum Artwork' },
    { id: 'marsRover',    label: 'Mars Rover Photos' },
    { id: 'hnStory',      label: 'Hacker News' },
    { id: 'reddit',       label: 'Reddit' },
    { id: 'trivia',       label: 'Trivia (Art, Science, Books)' },
    { id: 'uselessFacts', label: 'Random Facts' },
    { id: 'stoicQuote',   label: 'Stoic Quotes' },
    { id: 'designQuote',  label: 'Design Quotes' },
    { id: 'zenQuote',     label: 'Zen Quotes' },
    { id: 'affirmation',  label: 'Affirmations API' },
    { id: 'adviceSlip',   label: 'Advice Slip' },
    { id: 'funQuote',     label: 'Fun Quotes' },
    { id: 'favqsQotd',    label: 'Quote of the Day (FavQs)' },
    { id: 'customRss',    label: 'Custom RSS Feeds' },
  ];

  const disabledSources = new Set(await getDisabledSources());
  const sourcesList = document.getElementById('zen-sources-list')!;

  for (const source of ZEN_SOURCES) {
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

  const hasAnyKey = !!openaiKey || !!geminiKey;
  const navWarning = document.getElementById('nav-ai-warning');
  if (navWarning && !hasAnyKey) navWarning.classList.remove('hidden');

  await initRssFeeds();
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

void init();
