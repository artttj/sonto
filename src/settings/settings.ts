// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { createIcons, icons } from '../shared/icons';
import { escapeHtml } from '../shared/utils';
import {
  getSettings,
  saveSettings,
  getTheme,
  getClipboardMonitoring,
  setClipboardMonitoring,
  getMaxHistorySize,
  setMaxHistorySize,
  getBadgeCounterEnabled,
  setBadgeCounterEnabled,
  getReadingCompanionEnabled,
  setReadingCompanionEnabled,
  getPromptLockSettings,
  setPromptLockEnabled,
  setPromptLockDuration,
  setPromptLockPin,
  verifyPromptPin,
  type LockDuration,
} from '../shared/storage';
import {
  getSontoItemCount,
  clearAllSontoItems,
} from '../shared/storage/items';
import { exportBackup, importBackup, downloadBackup } from '../shared/backup';
import { setLocale, applyI18n, t } from '../shared/i18n';

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
  const badgeToggle = qs<HTMLInputElement>('#badge-counter-toggle');
  const companionToggle = qs<HTMLInputElement>('#reading-companion-toggle');

  const [monitoring, maxSize, count, badgeEnabled, companionEnabled] = await Promise.all([
    getClipboardMonitoring(),
    getMaxHistorySize(),
    getSontoItemCount(),
    getBadgeCounterEnabled(),
    getReadingCompanionEnabled(),
  ]);

  monitoringToggle.checked = monitoring;
  maxSizeInput.value = String(maxSize);
  if (clipCountEl) clipCountEl.textContent = String(count);
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
  const count = await getSontoItemCount();
  countEl.textContent = String(count);

  const versionEl = document.getElementById('about-version')!;
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = manifest.version;

  qs<HTMLButtonElement>('#btn-export').addEventListener('click', async () => {
    const json = await exportBackup();
    downloadBackup(json);
    showStatus('status-export');
  });

  const importFile = qs<HTMLInputElement>('#import-file');
  qs<HTMLButtonElement>('#btn-import').addEventListener('click', () => {
    importFile.click();
  });

  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const merge = confirm(
        'Merge with existing data?\n\nClick OK to merge (imported items will be added to existing data).\nClick Cancel to replace all existing data.',
      );

      const result = await importBackup(text, merge);

      const newCount = await getSontoItemCount();
      countEl.textContent = String(newCount);
      showStatus('status-import');
      alert(
        `Import successful!\n${result.items} items imported:\n- ${result.clips} clips\n- ${result.prompts} prompts`,
      );
    } catch (err) {
      alert('Failed to import: invalid file format');
    }

    importFile.value = '';
  });

  qs<HTMLButtonElement>('#btn-delete-all').addEventListener('click', async () => {
    const current = await getSontoItemCount();
    if (current === 0) return;
    if (!confirm(`Delete all ${current} items? This cannot be undone.`)) return;
    await clearAllSontoItems();
    countEl.textContent = '0';
    showStatus('status-delete');
  });
}

async function initLanguageTab(): Promise<void> {
  const settings = await getSettings();
  const setLanguage = initSegmented('language-segmented', async (lang) => {
    await saveSettings({ language: lang as 'en' | 'de' });
    setLocale(lang);
    applyI18n();
  });
  setLanguage(settings.language);
}

/* ═══ PIN MODAL ═════════════════════════════════════════════════════════════ */
type PinMode = 'set' | 'change' | 'disable';

let pinMode: PinMode = 'set';

async function initSecurityTab(): Promise<void> {
  const lockToggle = qs<HTMLInputElement>('#prompt-lock-toggle');
  const durationSelect = qs<HTMLSelectElement>('#lock-duration-select');
  const changePinBtn = qs<HTMLButtonElement>('#btn-change-pin');
  const lockDurationRow = qs<HTMLElement>('#lock-duration-row');
  const changePinRow = qs<HTMLElement>('#change-pin-row');

  const settings = await getPromptLockSettings();

  lockToggle.checked = settings.enabled;
  durationSelect.value = settings.duration;

  // Show/hide rows based on lock state
  const updateRows = () => {
    const isEnabled = lockToggle.checked;
    lockDurationRow.classList.toggle('hidden', !isEnabled);
    changePinRow.classList.toggle('hidden', !isEnabled);
  };
  updateRows();

  lockToggle.addEventListener('change', async () => {
    const enabled = lockToggle.checked;

    if (enabled) {
      // Enable lock - need to set PIN first
      pinMode = 'set';
      showPinModal('set', async (pin) => {
        await setPromptLockPin(pin);
        await setPromptLockEnabled(true);
        showStatus('status-pin-saved');
        updateRows();
      });
    } else {
      // Disable lock - require current PIN for security
      if (!settings.pinHash) {
        // No PIN set, just disable
        await setPromptLockEnabled(false);
        updateRows();
        return;
      }
      pinMode = 'disable';
      showPinModal('disable', async () => {
        await setPromptLockEnabled(false);
        showStatus('status-pin-saved');
        updateRows();
      });
    }
  });

  durationSelect.addEventListener('change', async () => {
    const duration = durationSelect.value as LockDuration;
    await setPromptLockDuration(duration);
  });

  changePinBtn?.addEventListener('click', () => {
    if (!settings.pinHash) {
      // No PIN set yet, show set PIN modal
      pinMode = 'set';
      showPinModal('set', async (pin) => {
        await setPromptLockPin(pin);
        await setPromptLockEnabled(true);
        lockToggle.checked = true;
        showStatus('status-pin-saved');
        updateRows();
      });
      return;
    }
    pinMode = 'change';
    showPinModal('change', async (pin) => {
      showStatus('status-pin-saved');
    });
  });
}

function showPinModal(
  mode: PinMode,
  onSave: (pin: string) => Promise<void>,
): void {
  const modal = qs<HTMLElement>('#pin-modal');
  const titleEl = qs<HTMLElement>('#pin-modal-title');
  const descEl = qs<HTMLElement>('#pin-modal-desc');
  const currentField = qs<HTMLElement>('#pin-current-field');
  const newField = qs<HTMLElement>('#pin-new-field');
  const confirmField = qs<HTMLElement>('#pin-confirm-field');
  const currentInput = qs<HTMLInputElement>('#pin-current-input');
  const newInput = qs<HTMLInputElement>('#pin-new-input');
  const confirmInput = qs<HTMLInputElement>('#pin-confirm-input');
  const cancelBtn = qs<HTMLButtonElement>('#pin-modal-cancel');
  const saveBtn = qs<HTMLButtonElement>('#pin-modal-save');
  const errorEl = qs<HTMLElement>('#pin-error');

  // Reset state
  modal.classList.remove('hidden');
  currentInput.value = '';
  newInput.value = '';
  confirmInput.value = '';
  errorEl.classList.add('hidden');

  if (mode === 'set') {
    titleEl.textContent = t('prompt_lock_set_title');
    descEl.textContent = t('prompt_lock_set_desc');
    currentField.classList.add('hidden');
    newField.classList.remove('hidden');
    confirmField.classList.remove('hidden');
    saveBtn.textContent = 'Save';
  } else if (mode === 'change') {
    titleEl.textContent = t('prompt_lock_change_title');
    descEl.textContent = t('prompt_lock_change_desc');
    currentField.classList.remove('hidden');
    newField.classList.remove('hidden');
    confirmField.classList.remove('hidden');
    saveBtn.textContent = 'Save';
  } else if (mode === 'disable') {
    titleEl.textContent = 'Disable Prompt Lock';
    descEl.textContent = 'Enter your current PIN to disable the prompt lock. Your prompts will remain protected until you disable it.';
    currentField.classList.remove('hidden');
    newField.classList.add('hidden');
    confirmField.classList.add('hidden');
    saveBtn.textContent = 'Disable';
  }

  const close = () => {
    modal.classList.add('hidden');
  };

  const showError = (msg: string) => {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  };

  cancelBtn.onclick = close;

  saveBtn.onclick = async () => {
    const current = currentInput.value;
    const newPin = newInput.value;
    const confirm = confirmInput.value;

    // For change and disable modes, verify current PIN
    if (mode === 'change' || mode === 'disable') {
      if (!/^\d{4}$/.test(current)) {
        showError('Enter your 4-digit PIN');
        return;
      }
      const isValid = await verifyPromptPin(current);
      if (!isValid) {
        showError(t('prompt_lock_invalid_current'));
        return;
      }
    }

    // For set and change modes, validate new PIN
    if (mode === 'set' || mode === 'change') {
      if (!/^\d{4}$/.test(newPin)) {
        showError('Enter a 4-digit PIN');
        return;
      }

      if (newPin !== confirm) {
        showError(t('prompt_lock_pins_match'));
        return;
      }

      // Save new PIN
      await setPromptLockPin(newPin);
    }

    close();
    await onSave(newPin);
  };

  if (mode === 'disable') {
    currentInput.focus();
  } else {
    newInput.focus();
  }
}

async function init(): Promise<void> {
  const [settings, theme] = await Promise.all([getSettings(), getTheme()]);

  setLocale(settings.language);
  applyI18n();

  document.documentElement.dataset.theme = theme;

  chrome.storage.local.onChanged.addListener((changes) => {
    if (changes.sonto_theme) {
      document.documentElement.dataset.theme = changes.sonto_theme.newValue as string;
    }
  });

  initTabs();

  await Promise.all([initLanguageTab(), initClipboardTab(), initDataTab(), initSecurityTab()]);

  createIcons({ icons, attrs: { strokeWidth: 1.5 } });
}

void init();
