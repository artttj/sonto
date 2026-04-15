# Prompt Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional PIN-based locking for the Prompts tab to protect sensitive prompts from prying eyes.

**Architecture:** Storage layer (chrome.storage.local/session) manages PIN hash and unlock state. Sidebar checks lock before rendering prompts. Settings page provides PIN management UI.

**Tech Stack:** TypeScript, Chrome Extension APIs (chrome.storage), Web Crypto API (SHA-256), CSS animations

---

## File Structure

| File | Responsibility |
|------|----------------|
| src/shared/constants.ts | Add new storage key constants for lock settings |
| src/shared/types.ts | Add LockDuration type and PromptLockSettings interface |
| src/shared/storage.ts | Add lock-related storage functions (get, set, verify) |
| src/sidebar/prompts-manager.ts | Add lock check and PIN pad rendering logic |
| src/sidebar/styles/60-components.css | Add PIN pad UI styles and shake animation |
| src/settings/settings.html | Add Security tab with PIN management |
| src/settings/settings.ts | Add Security tab event handlers |
| src/shared/locales/en.ts | Add English localization strings |
| src/shared/locales/de.ts | Add German localization strings |

---

## Task 1: Add Storage Constants

**Files:**
- Modify: src/shared/constants.ts:1-17

- [ ] **Step 1: Add prompt lock storage keys to STORAGE_KEYS**

Open src/shared/constants.ts and add the new keys to the STORAGE_KEYS object (after line 15):

```typescript
export const STORAGE_KEYS = {
  SETTINGS: 'sonto_settings',
  THEME: 'sonto_theme',
  CLIPBOARD_MONITORING: 'sonto_clipboard_monitoring',
  MAX_HISTORY_SIZE: 'sonto_max_history_size',
  CUSTOM_JSON_SOURCES: 'sonto_custom_json_sources',
  BADGE_COUNTER_ENABLED: 'sonto_badge_counter_enabled',
  READING_COMPANION_ENABLED: 'sonto_reading_companion_enabled',
  COLLECTIONS: 'sonto_collections',
  MIGRATION_VERSION: 'sonto_migration_version',
  PROMPT_LOCK_ENABLED: 'sonto_prompt_lock_enabled',
  PROMPT_LOCK_PIN: 'sonto_prompt_lock_pin',
  PROMPT_LOCK_DURATION: 'sonto_prompt_lock_duration',
} as const;
```

Also add the session storage key constant (after STORAGE_KEYS, around line 17):

```typescript
export const PROMPT_LOCK_UNLOCKED_AT = 'sonto_prompt_lock_unlocked_at';
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/constants.ts
git commit -m "feat: add prompt lock storage keys"
```

---

## Task 2: Add Types

**Files:**
- Modify: src/shared/types.ts:1-11

- [ ] **Step 1: Add LockDuration and PromptLockSettings types**

Open src/shared/types.ts and add after line 8 (after AppLanguage type):

```typescript
export type AppLanguage = 'en' | 'de';

export type LockDuration = 'sidebar' | '5min' | '15min' | 'browser';

export interface PromptLockSettings {
  enabled: boolean;
  pinHash: string | null;
  duration: LockDuration;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add prompt lock types"
```

---

## Task 3: Implement PIN Hashing Utility

**Files:**
- Modify: src/shared/storage.ts:1-147

- [ ] **Step 1: Add crypto helper function at end of file**

Open src/shared/storage.ts and add at the end of the file (after line 147):

```typescript
// ============================================================================
// PROMPT LOCK
// ============================================================================

const PIN_SALT = 'sonto-pin-salt-v1';

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(PIN_SALT + pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getPromptLockSettings(): Promise<PromptLockSettings> {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.PROMPT_LOCK_ENABLED,
      STORAGE_KEYS.PROMPT_LOCK_PIN,
      STORAGE_KEYS.PROMPT_LOCK_DURATION,
    ]);
    return {
      enabled: (result[STORAGE_KEYS.PROMPT_LOCK_ENABLED] as boolean | undefined) ?? false,
      pinHash: (result[STORAGE_KEYS.PROMPT_LOCK_PIN] as string | undefined) ?? null,
      duration: (result[STORAGE_KEYS.PROMPT_LOCK_DURATION] as LockDuration | undefined) ?? 'sidebar',
    };
  } catch {
    return { enabled: false, pinHash: null, duration: 'sidebar' };
  }
}

export async function setPromptLockPin(pin: string): Promise<void> {
  const pinHash = await hashPin(pin);
  await chrome.storage.local.set({ [STORAGE_KEYS.PROMPT_LOCK_PIN]: pinHash });
}

export async function setPromptLockEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.PROMPT_LOCK_ENABLED]: enabled });
}

export async function setPromptLockDuration(duration: LockDuration): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.PROMPT_LOCK_DURATION]: duration });
}

export async function setPromptUnlocked(): Promise<void> {
  await chrome.storage.session.set({ [PROMPT_LOCK_UNLOCKED_AT]: Date.now() });
}

export async function isPromptLocked(): Promise<boolean> {
  try {
    const settings = await getPromptLockSettings();

    if (!settings.enabled || !settings.pinHash) {
      return false;
    }

    const result = await chrome.storage.session.get(PROMPT_LOCK_UNLOCKED_AT);
    const unlockedAt = result[PROMPT_LOCK_UNLOCKED_AT] as number | undefined;

    if (unlockedAt === undefined) {
      return true;
    }

    const now = Date.now();
    const elapsed = now - unlockedAt;

    switch (settings.duration) {
      case 'sidebar':
        return false;
      case '5min':
        return elapsed >= 5 * 60 * 1000;
      case '15min':
        return elapsed >= 15 * 60 * 1000;
      case 'browser':
        return false;
      default:
        return true;
    }
  } catch {
    return false;
  }
}

export async function verifyPromptPin(pin: string): Promise<boolean> {
  try {
    const settings = await getPromptLockSettings();
    if (!settings.pinHash) return false;

    const inputHash = await hashPin(pin);
    return inputHash === settings.pinHash;
  } catch {
    return false;
  }
}

export async function clearPromptLock(): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.PROMPT_LOCK_ENABLED]: false,
    [STORAGE_KEYS.PROMPT_LOCK_PIN]: null,
  });
  await chrome.storage.session.remove(PROMPT_LOCK_UNLOCKED_AT);
}
```

- [ ] **Step 2: Update imports at top of file**

Add to the import statement at line 4 to include the new types and constants:

```typescript
import { DEFAULT_SETTINGS, STORAGE_KEYS, DEFAULT_MAX_HISTORY_SIZE, PROMPT_LOCK_UNLOCKED_AT } from './constants';
import type { AppLanguage, AppSettings, LockDuration, PromptLockSettings } from './types';
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/storage.ts
git commit -m "feat: add prompt lock storage functions"
```

---

## Task 4: Add PIN Pad HTML Template

**Files:**
- Modify: src/sidebar/prompts-manager.ts:1-439

- [ ] **Step 1: Add PIN pad template constant at top of file**

Open src/sidebar/prompts-manager.ts and add after the COPY_FEEDBACK_MS constant (after line 13):

```typescript
const COPY_FEEDBACK_MS = 1500;

const PIN_PAD_TEMPLATE = `
  <div class="pin-pad-container">
    <div class="pin-pad-header">
      <i data-lucide="lock" class="pin-pad-icon"></i>
      <h2 class="pin-pad-title">Prompts are locked</h2>
      <p class="pin-pad-subtitle">Enter PIN to access your prompts</p>
    </div>
    <div class="pin-display">
      <span class="pin-dot" data-index="0"></span>
      <span class="pin-dot" data-index="1"></span>
      <span class="pin-dot" data-index="2"></span>
      <span class="pin-dot" data-index="3"></span>
    </div>
    <div class="pin-error-message hidden"></div>
    <div class="pin-keypad">
      <button class="pin-key" data-digit="1" type="button">1</button>
      <button class="pin-key" data-digit="2" type="button">2</button>
      <button class="pin-key" data-digit="3" type="button">3</button>
      <button class="pin-key" data-digit="4" type="button">4</button>
      <button class="pin-key" data-digit="5" type="button">5</button>
      <button class="pin-key" data-digit="6" type="button">6</button>
      <button class="pin-key" data-digit="7" type="button">7</button>
      <button class="pin-key" data-digit="8" type="button">8</button>
      <button class="pin-key" data-digit="9" type="button">9</button>
      <button class="pin-key pin-key-backspace" data-action="backspace" type="button">
        <i data-lucide="delete"></i>
      </button>
      <button class="pin-key" data-digit="0" type="button">0</button>
      <button class="pin-key pin-key-submit" data-action="submit" type="button">
        <i data-lucide="check"></i>
      </button>
    </div>
  </div>
`;
```

- [ ] **Step 2: Commit**

```bash
git add src/sidebar/prompts-manager.ts
git commit -m "feat: add PIN pad HTML template"
```

---

## Task 5: Add PIN Pad State to PromptsManager Class

**Files:**
- Modify: src/sidebar/prompts-manager.ts:93-106

- [ ] **Step 1: Add PIN state properties to class**

Add these properties to the PromptsManager class (after line 100, inside the class):

```typescript
export class PromptsManager {
  private prompts: SontoItem[] = [];
  private listEl: HTMLElement;
  private filtersEl: HTMLElement;
  private searchEl: HTMLInputElement;
  private isLoading = false;
  private activeColor: PromptColor | null = null;
  private allTags: string[] = [];

  private pinDigits: string[] = [];
  private isPinPadVisible = false;
```

- [ ] **Step 2: Commit**

```bash
git add src/sidebar/prompts-manager.ts
git commit -m "feat: add PIN state to PromptsManager"
```

---

## Task 6: Add Storage Import

**Files:**
- Modify: src/sidebar/prompts-manager.ts:1-12

- [ ] **Step 1: Add prompt lock functions to imports**

Update the imports section. Add to line 9 to include storage functions:

```typescript
import {
  isPromptLocked,
  setPromptUnlocked,
  verifyPromptPin,
} from '../shared/storage';
```

- [ ] **Step 2: Commit**

```bash
git add src/sidebar/prompts-manager.ts
git commit -m "feat: import prompt lock storage functions"
```

---

## Task 7: Modify load() Method to Check Lock

**Files:**
- Modify: src/sidebar/prompts-manager.ts:108-127

- [ ] **Step 1: Update load method to check lock state first**

Replace the entire load method (lines 108-127) with:

```typescript
async load(tagFilter?: string): Promise<void> {
  if (await isPromptLocked()) {
    this.renderPinPad();
    return;
  }

  this.allTags = await loadAllTags();
  this.setLoading(true);
  try {
    const filter: SontoItemFilter = {
      types: ['prompt'],
    };
    if (tagFilter) {
      filter.tags = [tagFilter];
    }
    const response = await chrome.runtime.sendMessage({ type: MSG.GET_SONTO_ITEMS, filter });
    this.prompts = response?.ok ? (response.items as SontoItem[]) : [];
  } catch (err) {
    console.error('[Sonto] Failed to load prompts:', err);
  } finally {
    this.setLoading(false);
    this.renderFilters();
    this.render();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/sidebar/prompts-manager.ts
git commit -m "feat: check lock state before loading prompts"
```

---

## Task 8: Implement renderPinPad() Method

**Files:**
- Modify: src/sidebar/prompts-manager.ts:433-439

- [ ] **Step 1: Add renderPinPad method before setLoading method**

Add this method before the setLoading method (before line 422):

```typescript
private renderPinPad(): void {
  this.isPinPadVisible = true;
  this.pinDigits = [];
  this.listEl.innerHTML = PIN_PAD_TEMPLATE;

  const pinKeys = this.listEl.querySelectorAll<HTMLElement>('.pin-key');
  pinKeys.forEach(key => {
    key.addEventListener('click', (e) => {
      e.preventDefault();
      const digit = (key as HTMLElement).dataset.digit;
      const action = (key as HTMLElement).dataset.action;

      if (digit !== undefined) {
        this.handlePinEntry(digit);
      } else if (action === 'backspace') {
        this.handlePinBackspace();
      } else if (action === 'submit') {
        void this.submitPin();
      }
    });
  });

  createIcons({ icons, attrs: { strokeWidth: 1.5 } });
  this.updatePinDisplay();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/sidebar/prompts-manager.ts
git commit -m "feat: implement renderPinPad method"
```

---

## Task 9: Implement PIN Entry Handlers

**Files:**
- Modify: src/sidebar/prompts-manager.ts:433-439

- [ ] **Step 1: Add handlePinEntry method after renderPinPad**

Add after the renderPinPad method:

```typescript
private handlePinEntry(digit: string): void {
  if (this.pinDigits.length < 4) {
    this.pinDigits.push(digit);
    this.updatePinDisplay();

    if (this.pinDigits.length === 4) {
      void this.submitPin();
    }
  }
}

private handlePinBackspace(): void {
  if (this.pinDigits.length > 0) {
    this.pinDigits.pop();
    this.updatePinDisplay();
  }
}

private updatePinDisplay(): void {
  const dots = this.listEl.querySelectorAll<HTMLElement>('.pin-dot');
  dots.forEach((dot, index) => {
    dot.classList.toggle('filled', index < this.pinDigits.length);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/sidebar/prompts-manager.ts
git commit -m "feat: implement PIN entry handlers"
```

---

## Task 10: Implement submitPin() Method

**Files:**
- Modify: src/sidebar/prompts-manager.ts:433-439

- [ ] **Step 1: Add submitPin method after handlePinBackspace**

```typescript
private async submitPin(): Promise<void> {
  const pin = this.pinDigits.join('');
  const isValid = await verifyPromptPin(pin);

  if (isValid) {
    await setPromptUnlocked();
    this.isPinPadVisible = false;
    void this.load();
  } else {
    this.showPinError();
  }
}

private showPinError(): void {
  const errorEl = this.listEl.querySelector<HTMLElement>('.pin-error-message');
  const container = this.listEl.querySelector<HTMLElement>('.pin-pad-container');

  if (errorEl) {
    errorEl.textContent = 'Invalid PIN - try again';
    errorEl.classList.remove('hidden');

    setTimeout(() => {
      errorEl.classList.add('hidden');
    }, 2000);
  }

  if (container) {
    container.classList.add('shake');
    setTimeout(() => {
      container.classList.remove('shake');
    }, 500);
  }

  this.pinDigits = [];
  this.updatePinDisplay();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/sidebar/prompts-manager.ts
git commit -m "feat: implement PIN submission and error handling"
```

---

## Task 11: Add PIN Pad CSS Styles

**Files:**
- Modify: src/sidebar/styles/60-components.css:1370

- [ ] **Step 1: Add PIN pad styles at end of file**

Add at the end of src/sidebar/styles/60-components.css (after line 1370):

```css
/* PIN Pad */
.pin-pad-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  min-height: 320px;
  animation: pin-fade-in 0.3s ease-out;
}

@keyframes pin-fade-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.pin-pad-container.shake {
  animation: pin-shake 0.5s ease-in-out;
}

@keyframes pin-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}

.pin-pad-header {
  text-align: center;
  margin-bottom: 24px;
}

.pin-pad-icon {
  width: 32px;
  height: 32px;
  color: var(--c-text-3);
  opacity: 0.5;
  margin-bottom: 12px;
}

.pin-pad-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--c-text);
  margin: 0 0 8px 0;
}

.pin-pad-subtitle {
  font-size: 13px;
  color: var(--c-text-3);
  margin: 0;
}

.pin-display {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.pin-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--c-border);
  background: transparent;
  transition: background 0.2s, border-color 0.2s;
}

.pin-dot.filled {
  background: var(--c-text);
  border-color: var(--c-text);
}

.pin-error-message {
  font-size: 12px;
  color: #ff7070;
  margin-bottom: 16px;
  min-height: 16px;
}

.pin-error-message.hidden {
  visibility: hidden;
}

.pin-keypad {
  display: grid;
  grid-template-columns: repeat(3, 56px);
  grid-template-rows: repeat(4, 48px);
  gap: 10px;
}

.pin-key {
  width: 56px;
  height: 48px;
  border: 1px solid var(--c-border);
  border-radius: 8px;
  background: var(--c-surface);
  color: var(--c-text);
  font-family: inherit;
  font-size: 18px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pin-key:hover {
  background: var(--c-elevated);
  border-color: var(--c-border-hi);
}

.pin-key:active {
  transform: scale(0.95);
}

.pin-key svg {
  width: 18px;
  height: 18px;
}

.pin-key-submit {
  background: var(--c-accent);
  color: #000;
  border-color: var(--c-accent);
}

.pin-key-submit:hover {
  background: #d4a82c;
  border-color: #d4a82c;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/sidebar/styles/60-components.css
git commit -m "feat: add PIN pad styles"
```

---

## Task 12: Add English Localization

**Files:**
- Modify: src/shared/locales/en.ts:1-52

- [ ] **Step 1: Add security strings to English locale**

Add to the en object (after line 47, before the closing brace):

```typescript
  status_saved: 'Saved',
  status_deleted: 'Deleted',

  nav_security: 'Security',
  security_heading: 'Security',
  security_desc: 'Protect your prompts with a PIN code.',

  prompt_lock_enabled: 'Lock Prompts with PIN',
  prompt_lock_enabled_desc: 'Require a PIN to access your prompts',
  prompt_lock_pin: 'PIN',
  prompt_lock_change_pin: 'Change PIN...',
  prompt_lock_duration: 'Lock duration',
  prompt_lock_duration_sidebar: 'Until sidebar closes',
  prompt_lock_duration_5min: '5 minutes of inactivity',
  prompt_lock_duration_15min: '15 minutes of inactivity',
  prompt_lock_duration_browser: 'Until browser restart',
  prompt_lock_forgot: 'Forgot PIN',
  prompt_lock_forgot_confirm: 'This will remove the PIN lock. Are you sure?',
  prompt_lock_set_title: 'Set PIN',
  prompt_lock_set_desc: 'Enter a 4-digit PIN to protect your prompts',
  prompt_lock_change_title: 'Change PIN',
  prompt_lock_change_desc: 'Enter your current PIN, then a new 4-digit PIN',
  prompt_lock_current_pin: 'Current PIN',
  prompt_lock_new_pin: 'New PIN',
  prompt_lock_confirm_pin: 'Confirm PIN',
  prompt_lock_pin_set: 'PIN set',
  prompt_lock_pin_changed: 'PIN changed',
  prompt_lock_pin_cleared: 'PIN lock cleared',
  prompt_lock_pins_match: 'PINs do not match',
  prompt_lock_invalid_current: 'Invalid current PIN',

  pin_pad_title: 'Prompts are locked',
  pin_pad_subtitle: 'Enter PIN to access your prompts',
  pin_pad_error: 'Invalid PIN - try again',
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/locales/en.ts
git commit -m "feat: add English localization for prompt lock"
```

---

## Task 13: Add German Localization

**Files:**
- Modify: src/shared/locales/de.ts

- [ ] **Step 1: Add security strings to German locale**

Read the German locale file structure, then add these translations:

```typescript
  nav_security: 'Sicherheit',
  security_heading: 'Sicherheit',
  security_desc: 'Schützen Sie Ihre Prompts mit einer PIN.',

  prompt_lock_enabled: 'Prompts mit PIN sperren',
  prompt_lock_enabled_desc: 'PIN erforderlich, um auf Ihre Prompts zuzugreifen',
  prompt_lock_pin: 'PIN',
  prompt_lock_change_pin: 'PIN ändern...',
  prompt_lock_duration: 'Sperrdauer',
  prompt_lock_duration_sidebar: 'Bis Sidebar geschlossen wird',
  prompt_lock_duration_5min: '5 Minuten Inaktivität',
  prompt_lock_duration_15min: '15 Minuten Inaktivität',
  prompt_lock_duration_browser: 'Bis Browser-Neustart',
  prompt_lock_forgot: 'PIN vergessen',
  prompt_lock_forgot_confirm: 'Dies wird die PIN-Sperre entfernen. Sind Sie sicher?',
  prompt_lock_set_title: 'PIN festlegen',
  prompt_lock_set_desc: 'Geben Sie eine 4-stellige PIN ein, um Ihre Prompts zu schützen',
  prompt_lock_change_title: 'PIN ändern',
  prompt_lock_change_desc: 'Geben Sie Ihre aktuelle und dann eine neue 4-stellige PIN ein',
  prompt_lock_current_pin: 'Aktuelle PIN',
  prompt_lock_new_pin: 'Neue PIN',
  prompt_lock_confirm_pin: 'PIN bestätigen',
  prompt_lock_pin_set: 'PIN festgelegt',
  prompt_lock_pin_changed: 'PIN geändert',
  prompt_lock_pin_cleared: 'PIN-Sperre aufgehoben',
  prompt_lock_pins_match: 'PINs stimmen nicht überein',
  prompt_lock_invalid_current: 'Ungültige aktuelle PIN',

  pin_pad_title: 'Prompts sind gesperrt',
  pin_pad_subtitle: 'Geben Sie Ihre PIN ein, um auf Ihre Prompts zuzugreifen',
  pin_pad_error: 'Ungültige PIN - versuchen Sie es erneut',
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/locales/de.ts
git commit -m "feat: add German localization for prompt lock"
```

---

## Task 14: Add Security Tab to Settings HTML

**Files:**
- Modify: src/settings/settings.html:10-41

- [ ] **Step 1: Add Security nav item**

Add the Security navigation button (after the Language nav item, before Data nav item, around line 30):

```html
        <button class="nav-item" data-tab="security" type="button">
          <i data-lucide="shield"></i>
          <span data-i18n="nav_security">Security</span>
        </button>
```

- [ ] **Step 2: Add Security tab section**

Add the Security tab section (after the Language tab section, before the Data tab section, around line 63):

```html
      <!-- SECURITY -->
      <section id="tab-security" class="tab-panel hidden">
        <div class="panel-header">
          <h1 data-i18n="security_heading">Security</h1>
          <p data-i18n="security_desc">Protect your prompts with a PIN code.</p>
        </div>

        <div class="setting-group">
          <div class="setting-group-header" data-i18n="prompt_lock_enabled">Prompt Lock</div>

          <div class="setting-row">
            <div class="setting-label">
              <div class="setting-title" data-i18n="prompt_lock_enabled">Lock Prompts with PIN</div>
              <div class="setting-desc" data-i18n="prompt_lock_enabled_desc">Require a PIN to access your prompts</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="prompt-lock-toggle" />
              <span class="toggle-track"></span>
            </label>
            <span id="status-prompt-lock" class="saved-msg hidden" data-i18n="status_saved">Saved</span>
          </div>

          <div class="setting-row" id="prompt-lock-pin-row">
            <div class="setting-label">
              <div class="setting-title" data-i18n="prompt_lock_pin">PIN</div>
            </div>
            <div class="setting-value-inline">
              <span id="prompt-lock-pin-display">••••</span>
              <button id="btn-change-pin" class="btn btn-secondary-sm" type="button" data-i18n="prompt_lock_change_pin">Change PIN...</button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <div class="setting-title" data-i18n="prompt_lock_duration">Lock duration</div>
            </div>
            <select id="prompt-lock-duration" class="setting-select">
              <option value="sidebar" data-i18n="prompt_lock_duration_sidebar">Until sidebar closes</option>
              <option value="5min" data-i18n="prompt_lock_duration_5min">5 minutes of inactivity</option>
              <option value="15min" data-i18n="prompt_lock_duration_15min">15 minutes of inactivity</option>
              <option value="browser" data-i18n="prompt_lock_duration_browser">Until browser restart</option>
            </select>
            <span id="status-prompt-duration" class="saved-msg hidden" data-i18n="status_saved">Saved</span>
          </div>

          <div class="setting-row">
            <div class="setting-label"></div>
            <button id="btn-forgot-pin" class="btn btn-secondary-sm btn-danger-text" type="button" data-i18n="prompt_lock_forgot">Forgot PIN</button>
            <span id="status-forgot-pin" class="saved-msg hidden" data-i18n="status_saved">Cleared</span>
          </div>
        </div>
      </section>
```

- [ ] **Step 3: Commit**

```bash
git add src/settings/settings.html
git commit -m "feat: add Security tab to settings page"
```

---

## Task 15: Add Security Tab CSS

**Files:**
- Modify: src/settings/settings.css

- [ ] **Step 1: Add Security tab specific styles**

Add to the settings CSS file:

```css
.btn-secondary-sm {
  padding: 6px 12px;
  font-size: 12px;
  background: var(--c-toggle-bg, #2a2a2a);
  color: var(--c-text-2, #ccc);
  border: 1px solid var(--c-border, #444);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.btn-secondary-sm:hover {
  background: var(--c-border, #444);
  color: var(--c-text, #fff);
}

.btn-danger-text {
  color: #ff7070;
  background: none;
  border: 1px solid transparent;
}

.btn-danger-text:hover {
  background: rgba(255, 96, 96, 0.12);
  border-color: rgba(255, 96, 96, 0.3);
}

.setting-value-inline {
  display: flex;
  align-items: center;
  gap: 12px;
}

#prompt-lock-pin-display {
  font-family: 'Space Mono', monospace;
  font-size: 14px;
  color: var(--c-text-2, #999);
  letter-spacing: 2px;
}

.setting-select {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--c-border, #444);
  background: var(--c-surface, #1a1a1a);
  color: var(--c-text, #fff);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/settings/settings.css
git commit -m "feat: add Security tab styles"
```

---

## Task 16: Add PIN Modal HTML

**Files:**
- Modify: src/settings/settings.html:231-238

- [ ] **Step 1: Add PIN modal before closing body tag**

Add before the </body> tag (around line 235):

```html
    <div id="pin-modal" class="pin-modal hidden">
      <div class="pin-modal-content">
        <h3 id="pin-modal-title" class="pin-modal-title">Set PIN</h3>
        <p id="pin-modal-desc" class="pin-modal-desc">Enter a 4-digit PIN</p>

        <div id="pin-modal-current-group" class="pin-modal-group hidden">
          <label for="pin-current-input" class="pin-modal-label">Current PIN</label>
          <input type="password" id="pin-current-input" class="pin-modal-input" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" />
        </div>

        <div class="pin-modal-group">
          <label for="pin-new-input" class="pin-modal-label">New PIN</label>
          <input type="password" id="pin-new-input" class="pin-modal-input" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" />
        </div>

        <div class="pin-modal-group">
          <label for="pin-confirm-input" class="pin-modal-label">Confirm PIN</label>
          <input type="password" id="pin-confirm-input" class="pin-modal-input" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" />
        </div>

        <div id="pin-modal-error" class="pin-modal-error hidden"></div>

        <div class="pin-modal-actions">
          <button id="pin-modal-cancel" class="btn btn-secondary" type="button">Cancel</button>
          <button id="pin-modal-save" class="btn btn-primary" type="button">Save</button>
        </div>
      </div>
    </div>
```

- [ ] **Step 2: Commit**

```bash
git add src/settings/settings.html
git commit -m "feat: add PIN modal HTML"
```

---

## Task 17: Add PIN Modal CSS

**Files:**
- Modify: src/settings/settings.css

- [ ] **Step 1: Add PIN modal styles**

```css
/* PIN Modal */
.pin-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.pin-modal.hidden {
  display: none;
}

.pin-modal-content {
  background: var(--c-bg, #1a1a1a);
  border: 1px solid var(--c-border, #444);
  border-radius: 12px;
  padding: 24px;
  width: min(320px, 90vw);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.pin-modal-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--c-text, #fff);
  margin: 0 0 8px 0;
}

.pin-modal-desc {
  font-size: 13px;
  color: var(--c-text-3, #888);
  margin: 0 0 20px 0;
}

.pin-modal-group {
  margin-bottom: 16px;
}

.pin-modal-group.hidden {
  display: none;
}

.pin-modal-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--c-text-2, #ccc);
  margin-bottom: 6px;
}

.pin-modal-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--c-border, #444);
  border-radius: 6px;
  background: var(--c-elevated, #252525);
  color: var(--c-text, #fff);
  font-family: 'Space Mono', monospace;
  font-size: 16px;
  letter-spacing: 4px;
  text-align: center;
  box-sizing: border-box;
}

.pin-modal-input:focus {
  outline: none;
  border-color: var(--c-accent, #e8b931);
}

.pin-modal-error {
  font-size: 12px;
  color: #ff7070;
  margin-bottom: 16px;
  min-height: 16px;
}

.pin-modal-error.hidden {
  visibility: hidden;
}

.pin-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/settings/settings.css
git commit -m "feat: add PIN modal styles"
```

---

## Task 18: Implement Security Tab Logic in Settings

**Files:**
- Modify: src/settings/settings.ts:1-206

- [ ] **Step 1: Add prompt lock imports**

Update imports at the top of the file (around line 18):

```typescript
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
  clearPromptLock,
} from '../shared/storage';
```

Also add LockDuration to the types import (around line 6):

```typescript
import type { AppSettings, LockDuration } from '../shared/types';
```

- [ ] **Step 2: Add initSecurityTab function**

Add this new function after initLanguageTab (around line 183):

```typescript
async function initSecurityTab(): Promise<void> {
  const lockToggle = qs<HTMLInputElement>('#prompt-lock-toggle');
  const pinRow = qs('#prompt-lock-pin-row');
  const changePinBtn = qs('#btn-change-pin');
  const durationSelect = qs<HTMLSelectElement>('#prompt-lock-duration');
  const forgotPinBtn = qs('#btn-forgot-pin');

  const settings = await getPromptLockSettings();

  lockToggle.checked = settings.enabled;
  durationSelect.value = settings.duration;

  if (settings.pinHash) {
    pinRow?.classList.remove('hidden');
  } else {
    pinRow?.classList.add('hidden');
  }

  lockToggle.addEventListener('change', async () => {
    await setPromptLockEnabled(lockToggle.checked);

    if (lockToggle.checked && !settings.pinHash) {
      showPinModal('set');
    }

    showStatus('status-prompt-lock');
  });

  durationSelect.addEventListener('change', async () => {
    await setPromptLockDuration(durationSelect.value as LockDuration);
    showStatus('status-prompt-duration');
  });

  changePinBtn.addEventListener('click', () => {
    showPinModal(settings.pinHash ? 'change' : 'set');
  });

  forgotPinBtn.addEventListener('click', async () => {
    const confirmed = confirm('This will remove the PIN lock. Are you sure?');
    if (confirmed) {
      await clearPromptLock();
      lockToggle.checked = false;
      pinRow?.classList.add('hidden');
      showStatus('status-forgot-pin');
    }
  });
}
```

- [ ] **Step 3: Update init function to call initSecurityTab**

Update the init function (around line 200):

```typescript
  await Promise.all([initLanguageTab(), initClipboardTab(), initDataTab(), initSecurityTab()]);
```

- [ ] **Step 4: Commit**

```bash
git add src/settings/settings.ts
git commit -m "feat: add Security tab initialization"
```

---

## Task 19: Implement PIN Modal Logic

**Files:**
- Modify: src/settings/settings.ts:183-206

- [ ] **Step 1: Add PIN modal variables and functions**

Add after the initSegmented function (around line 70):

```typescript
let pinModalMode: 'set' | 'change' = 'set';

function showPinModal(mode: 'set' | 'change'): void {
  pinModalMode = mode;
  const modal = qs('#pin-modal');
  const title = qs('#pin-modal-title');
  const desc = qs('#pin-modal-desc');
  const currentGroup = qs('#pin-modal-current-group');
  const newInput = qs('#pin-new-input') as HTMLInputElement;
  const errorEl = qs('#pin-modal-error');

  if (mode === 'change') {
    if (title) title.textContent = 'Change PIN';
    if (desc) desc.textContent = 'Enter your current PIN, then a new 4-digit PIN';
    currentGroup?.classList.remove('hidden');
  } else {
    if (title) title.textContent = 'Set PIN';
    if (desc) desc.textContent = 'Enter a 4-digit PIN to protect your prompts';
    currentGroup?.classList.add('hidden');
  }

  if (newInput) newInput.value = '';
  const confirmInput = qs('#pin-confirm-input') as HTMLInputElement;
  if (confirmInput) confirmInput.value = '';
  const currentInput = qs('#pin-current-input') as HTMLInputElement;
  if (currentInput) currentInput.value = '';
  if (errorEl) errorEl.classList.add('hidden');

  modal?.classList.remove('hidden');
  if (newInput) newInput.focus();
}

function hidePinModal(): void {
  qs('#pin-modal')?.classList.add('hidden');
}

async function savePin(): Promise<boolean> {
  const currentInput = qs('#pin-current-input') as HTMLInputElement;
  const newInput = qs('#pin-new-input') as HTMLInputElement;
  const confirmInput = qs('#pin-confirm-input') as HTMLInputElement;
  const errorEl = qs('#pin-modal-error');
  const pinRow = qs('#prompt-lock-pin-row');

  const currentPin = currentInput.value;
  const newPin = newInput.value;
  const confirmPin = confirmInput.value;

  if (!/^\d{4}$/.test(newPin)) {
    if (errorEl) {
      errorEl.textContent = 'PIN must be 4 digits';
      errorEl.classList.remove('hidden');
    }
    return false;
  }

  if (pinModalMode === 'change') {
    const isValid = await verifyPromptPin(currentPin);
    if (!isValid) {
      if (errorEl) {
        errorEl.textContent = 'Invalid current PIN';
        errorEl.classList.remove('hidden');
      }
      return false;
    }
  }

  if (newPin !== confirmPin) {
    if (errorEl) {
      errorEl.textContent = 'PINs do not match';
      errorEl.classList.remove('hidden');
    }
    return false;
  }

  await setPromptLockPin(newPin);

  if (pinModalMode === 'set') {
    const lockToggle = qs<HTMLInputElement>('#prompt-lock-toggle');
    await setPromptLockEnabled(true);
    if (lockToggle) lockToggle.checked = true;
  }

  pinRow?.classList.remove('hidden');
  hidePinModal();
  showStatus('status-prompt-lock');
  return true;
}
```

- [ ] **Step 2: Add PIN modal event listeners**

Add to the init function (before the final void init();):

```typescript
  // PIN Modal event listeners
  qs('#pin-modal-cancel')?.addEventListener('click', hidePinModal);
  qs('#pin-modal-save')?.addEventListener('click', () => { void savePin(); });
  qs('#pin-modal')?.addEventListener('click', (e) => {
    if (e.target === qs('#pin-modal')) hidePinModal();
  });
```

- [ ] **Step 3: Commit**

```bash
git add src/settings/settings.ts
git commit -m "feat: implement PIN modal logic"
```

---

## Task 20: Update Lock Duration Type Import

**Files:**
- Modify: src/settings/settings.ts:1-27

- [ ] **Step 1: Verify LockDuration import**

Ensure the types import includes LockDuration (around line 6):

```typescript
import type { AppSettings, LockDuration } from '../shared/types';
```

- [ ] **Step 2: Commit if changes were needed**

```bash
git add src/settings/settings.ts
git commit -m "fix: add LockDuration type import"
```

---

## Task 21: Handle Sidebar Re-open Lock Check

**Files:**
- Modify: src/sidebar/sidebar.ts:69-81

- [ ] **Step 1: Verify visibilitychange handler re-checks lock**

The PromptsManager.load() method already handles the lock check, so the visibilitychange handler (around line 70-81) ensures it's re-evaluated when sidebar regains visibility:

```typescript
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        void (async () => {
          await this.refreshDomain();
          if (this.currentTab === 'browse') {
            await this.clipManager.load(this.currentDomain);
          } else if (this.currentTab === 'prompts') {
            await this.promptsManager.load();
          }
        })();
      }
    });
```

- [ ] **Step 2: Commit if changes were needed**

```bash
git add src/sidebar/sidebar.ts
git commit -m "fix: re-check prompt lock on sidebar visibility change"
```

---

## Verification Steps

After all tasks are complete, manually verify:

- [ ] Settings → Security tab exists and displays correctly
- [ ] Enable lock toggle without PIN set → prompts PIN modal appears
- [ ] Set a 4-digit PIN → confirmation appears, lock enabled
- [ ] Switch to Prompts tab → PIN pad is shown (no prompts in DOM)
- [ ] Enter correct PIN → prompts load
- [ ] Enter wrong PIN → shake animation, error message
- [ ] Change PIN in Settings → requires current PIN, then new PIN
- [ ] Test each duration option works correctly
- [ ] Close/reopen sidebar → behavior matches duration setting
- [ ] Disable lock → prompts immediately accessible
- [ ] Forgot PIN clears lock after confirmation
- [ ] Restart browser → session cleared, must re-enter PIN
