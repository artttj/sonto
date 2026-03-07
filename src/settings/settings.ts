import { PROVIDER_MODELS } from '../shared/constants';
import {
  getSettings,
  saveSettings,
  getOpenAIKey,
  saveOpenAIKey,
  getGeminiKey,
  saveGeminiKey,
  getGrokKey,
  saveGrokKey,
} from '../shared/storage';
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
  initTabs();

  const settings = await getSettings();
  const [openaiKey, geminiKey, grokKey] = await Promise.all([getOpenAIKey(), getGeminiKey(), getGrokKey()]);

  let selectedProvider: ProviderName = settings.llmProvider;
  let selectedLanguage = settings.language;

  const setProvider = initSegmented('provider-segmented', (val) => { selectedProvider = val as ProviderName; });
  const setLanguage = initSegmented('language-segmented', (val) => { selectedLanguage = val as typeof settings.language; });

  setProvider(settings.llmProvider);
  setLanguage(settings.language);

  populateModelSelect('openai-model', 'openai', settings.openaiModel);
  populateModelSelect('gemini-model', 'gemini', settings.geminiModel);
  populateModelSelect('grok-model', 'grok', settings.grokModel);

  updateKeyBadge('badge-openai', !!openaiKey);
  updateKeyBadge('badge-gemini', !!geminiKey);
  updateKeyBadge('badge-grok', !!grokKey);

  const openaiInput = qs<HTMLInputElement>('#openai-key');
  const geminiInput = qs<HTMLInputElement>('#gemini-key');
  const grokInput = qs<HTMLInputElement>('#grok-key');

  if (openaiKey) openaiInput.value = openaiKey;
  if (geminiKey) geminiInput.value = geminiKey;
  if (grokKey) grokInput.value = grokKey;

  document.getElementById('btn-save-settings')!.addEventListener('click', async () => {
    const openaiModel = qs<HTMLSelectElement>('#openai-model').value;
    const geminiModel = qs<HTMLSelectElement>('#gemini-model').value;
    const grokModel = qs<HTMLSelectElement>('#grok-model').value;

    await saveSettings({
      llmProvider: selectedProvider,
      openaiModel,
      geminiModel,
      grokModel,
      language: selectedLanguage,
    });
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

  document.getElementById('btn-save-grok')!.addEventListener('click', async () => {
    await saveGrokKey(grokInput.value.trim());
    updateKeyBadge('badge-grok', !!grokInput.value.trim());
    showStatus('keys-status');
  });

  document.getElementById('btn-clear-grok')!.addEventListener('click', async () => {
    await saveGrokKey('');
    grokInput.value = '';
    updateKeyBadge('badge-grok', false);
    showStatus('keys-status');
  });

  const versionEl = document.getElementById('about-version');
  if (versionEl) {
    versionEl.textContent = chrome.runtime.getManifest().version;
  }

  const hasAnyKey = !!openaiKey || !!geminiKey || !!grokKey;
  const navWarning = document.getElementById('nav-ai-warning');
  if (navWarning && !hasAnyKey) navWarning.classList.remove('hidden');
}

void init();
