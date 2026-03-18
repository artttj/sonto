// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { escapeHtml } from '../shared/utils';
import {
  getSettings,
  saveSettings,
  getTheme,
  getClipboardMonitoring,
  setClipboardMonitoring,
  getMaxHistorySize,
  setMaxHistorySize,
  getDisabledSources,
  saveDisabledSources,
  getDripInterval,
  saveDripInterval,
  getZenDisplay,
  saveZenDisplay,
  getCustomFeeds,
  saveCustomFeeds,
  getCustomJsonSources,
  saveCustomJsonSources,
  getDailyNotificationEnabled,
  setDailyNotificationEnabled,
  getDailyNotificationTime,
  setDailyNotificationTime,
  getBadgeCounterEnabled,
  setBadgeCounterEnabled,
  getReadingCompanionEnabled,
  setReadingCompanionEnabled,
  getShowFeedToggle,
  setShowFeedToggle,
} from '../shared/storage';
import { parseFeed } from '../shared/rss-parser';
import { clearAllClips, getClipCount } from '../shared/embeddings/vector-store';
import { setLocale, applyI18n } from '../shared/i18n';

const ZEN_SOURCES: Array<{ id: string; label: string }> = [
  { id: 'philosophyEssay', label: '1000-Word Philosophy' },
  { id: 'clevelandArtwork', label: 'Art from Cleveland Museum' },
  { id: 'metArtwork', label: 'Art from The Met (New York)' },
  { id: 'atlasObscura', label: 'Atlas Obscura' },
  { id: 'gettyArtwork', label: 'Getty Museum Art' },
  { id: 'hnStory', label: 'Hacker News Headlines' },
  { id: 'haiku', label: 'Haiku' },
  { id: 'kotowaza', label: 'Japanese Proverbs' },
  { id: 'obliqueStrategies', label: 'Oblique Strategies' },
  { id: 'marsRover', label: 'Perseverance Rover Photos' },
  { id: 'wikimediaPaintings', label: 'Wikimedia Commons Paintings' },
  { id: 'albumOfDay', label: 'Album of a Day' },
  { id: 'reddit', label: 'Reddit (Science, Space, Philosophy)' },
  { id: 'rijksmuseumArtwork', label: 'Rijksmuseum (Amsterdam)' },
  { id: 'smithsonianNews', label: 'Smithsonian Smart News' },
  { id: 'customRss', label: 'Custom RSS Feeds' },
  { id: 'customJson', label: 'Custom JSON API Sources' },
];

function qs<T extends HTMLElement>(selector: string): T {
  return document.querySelector<T>(selector)!;
}

function showStatus(id: string): void {
  const el = document.getElementById(id)!;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2200);
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

async function initFeedTab(): Promise<void> {
  const storedZenDisplay = await getZenDisplay();
  const setZenDisplay = initSegmented('zen-display-segmented', (val) => {
    void saveZenDisplay(val as 'feed' | 'cosmos');
  });
  setZenDisplay(storedZenDisplay);

  const showFeedToggle = document.getElementById('show-feed-toggle') as HTMLInputElement;
  const storedShowFeedToggle = await getShowFeedToggle();
  showFeedToggle.checked = storedShowFeedToggle;
  showFeedToggle.addEventListener('change', () => {
    void setShowFeedToggle(showFeedToggle.checked);
  });

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

  await initRssFeeds();
  await initJsonSources();
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
        <button class="rss-remove" data-i="${i}" title="Remove" aria-label="Remove feed">✕</button>`;
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
        <button class="rss-remove" data-i="${i}" title="Remove" aria-label="Remove source">✕</button>`;
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

async function initClipboardTab(): Promise<void> {
  const monitoringToggle = qs<HTMLInputElement>('#clipboard-monitoring-toggle');
  const maxSizeInput = qs<HTMLInputElement>('#max-history-size');
  const clipCountEl = document.getElementById('clip-count-display');
  const dailyToggle = qs<HTMLInputElement>('#daily-notification-toggle');
  const dailyTimeInput = qs<HTMLInputElement>('#daily-notification-time');
  const badgeToggle = qs<HTMLInputElement>('#badge-counter-toggle');
  const companionToggle = qs<HTMLInputElement>('#reading-companion-toggle');

  const [monitoring, maxSize, count, dailyEnabled, dailyTime, badgeEnabled, companionEnabled] = await Promise.all([
    getClipboardMonitoring(),
    getMaxHistorySize(),
    getClipCount(),
    getDailyNotificationEnabled(),
    getDailyNotificationTime(),
    getBadgeCounterEnabled(),
    getReadingCompanionEnabled(),
  ]);

  monitoringToggle.checked = monitoring;
  maxSizeInput.value = String(maxSize);
  if (clipCountEl) clipCountEl.textContent = String(count);
  dailyToggle.checked = dailyEnabled;
  dailyTimeInput.value = dailyTime;
  badgeToggle.checked = badgeEnabled;
  companionToggle.checked = companionEnabled;

  monitoringToggle.addEventListener('change', async () => {
    await setClipboardMonitoring(monitoringToggle.checked);
    showStatus('status-monitoring');
  });

  maxSizeInput.addEventListener('change', async () => {
    const val = parseInt(maxSizeInput.value, 10);
    if (Number.isFinite(val) && val >= 10 && val <= 5000) {
      await setMaxHistorySize(val);
      showStatus('status-max-size');
    } else {
      maxSizeInput.value = String(maxSize);
    }
  });

  dailyToggle.addEventListener('change', async () => {
    await setDailyNotificationEnabled(dailyToggle.checked);
    await chrome.runtime.sendMessage({ type: 'UPDATE_DAILY_ALARM' });
    showStatus('status-daily');
  });

  dailyTimeInput.addEventListener('change', async () => {
    await setDailyNotificationTime(dailyTimeInput.value);
    await chrome.runtime.sendMessage({ type: 'UPDATE_DAILY_ALARM' });
    showStatus('status-daily');
  });

  badgeToggle.addEventListener('change', async () => {
    await setBadgeCounterEnabled(badgeToggle.checked);
    if (!badgeToggle.checked) {
      await chrome.action.setBadgeText({ text: '' });
    }
  });

  companionToggle.addEventListener('change', async () => {
    await setReadingCompanionEnabled(companionToggle.checked);
  });
}

async function initDataTab(): Promise<void> {
  const countEl = document.getElementById('snippet-count-data')!;
  const count = await getClipCount();
  countEl.textContent = String(count);

  const versionEl = document.getElementById('about-version')!;
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = manifest.version;

  qs<HTMLButtonElement>('#btn-delete-all').addEventListener('click', async () => {
    const current = await getClipCount();
    if (current === 0) return;
    if (!confirm(`Delete all ${current} clipboard entries? This cannot be undone.`)) return;
    await clearAllClips();
    countEl.textContent = '0';
    showStatus('status-delete');
  });
}

async function init(): Promise<void> {
  const [settings, theme] = await Promise.all([getSettings(), getTheme()]);

  setLocale(settings.language);
  applyI18n();

  document.documentElement.dataset.theme = theme;

  initTabs();

  const setLanguage = initSegmented('language-segmented', async (lang) => {
    await saveSettings({ language: lang as 'en' | 'de' });
    setLocale(lang);
    applyI18n();
  });
  setLanguage(settings.language);

  await Promise.all([initFeedTab(), initClipboardTab(), initDataTab()]);
}

void init();
