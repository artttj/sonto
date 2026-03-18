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
} from '../shared/storage';
import { exportBackup, importBackup, downloadBackup } from '../shared/backup';
import { clearAllClips, getClipCount } from '../shared/embeddings/vector-store';
import { setLocale, applyI18n } from '../shared/i18n';

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

async function initClipboardTab(): Promise<void> {
  const monitoringToggle = qs<HTMLInputElement>('#clipboard-monitoring-toggle');
  const maxSizeInput = qs<HTMLInputElement>('#max-history-size');
  const clipCountEl = document.getElementById('clip-count-display');

  const [monitoring, maxSize, count] = await Promise.all([
    getClipboardMonitoring(),
    getMaxHistorySize(),
    getClipCount(),
  ]);

  monitoringToggle.checked = monitoring;
  maxSizeInput.value = String(maxSize);
  if (clipCountEl) clipCountEl.textContent = String(count);

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
}

async function initDataTab(): Promise<void> {
  const countEl = document.getElementById('snippet-count-data')!;
  const count = await getClipCount();
  countEl.textContent = String(count);

  qs<HTMLButtonElement>('#btn-export-backup').addEventListener('click', async () => {
    const json = await exportBackup();
    downloadBackup(json);
  });

  const fileInput = qs<HTMLInputElement>('#import-file');
  const mergeToggle = qs<HTMLInputElement>('#import-merge');

  qs<HTMLButtonElement>('#btn-import-backup').addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const result = await importBackup(text, mergeToggle.checked);
      const newCount = await getClipCount();
      countEl.textContent = String(newCount);
      showStatus('status-import');
      console.info(`[Sonto] Imported ${result.clips} clips`);
    } catch (err) {
      alert('Import failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    fileInput.value = '';
  });

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

  await Promise.all([initClipboardTab(), initDataTab()]);
}

void init();
