# Prompt Lock Feature Design

**Date:** 2026-04-15
**Status:** Approved
**Type:** Feature

## Overview

Add optional PIN-based locking for the Prompts tab to protect sensitive prompts from prying eyes. When enabled, users must enter a 4-digit PIN before accessing any prompts. The lock state persists based on a configurable duration.

## Requirements

### Functional Requirements
- FR1: Users can enable/disable a PIN lock for the Prompts tab via Settings
- FR2: PIN is a 4-digit numeric code stored as a SHA-256 hash
- FR3: When locked, prompts are NOT rendered to DOM until PIN is verified
- FR4: Lock duration is configurable (until sidebar closes, 5min, 15min, until browser restart)
- FR5: Users can change their PIN after entering the current PIN
- FR6: Users can disable the lock at any time from Settings
- FR7: Forgot PIN option clears lock after confirmation

### Non-Functional Requirements
- NFR1: PIN pad UI follows existing design patterns (modals, toggles)
- NFR2: Lock check completes before any prompt content is rendered
- NFR3: Storage failures fall back to unlocked state
- NFR4: No rate limiting on PIN attempts (local-only security)

## Architecture

### Storage Layer (`src/shared/storage.ts`)

New storage keys in `chrome.storage.local`:
- `promptLockEnabled`: boolean — whether lock is active
- `promptLockPin`: string — SHA-256 hash of the 4-digit PIN
- `promptLockDuration`: LockDuration enum value

New storage key in `chrome.storage.session`:
- `promptLockUnlockedAt`: number — timestamp when PIN was last entered

New functions:
```typescript
type LockDuration = 'sidebar' | '5min' | '15min' | 'browser';

interface PromptLockSettings {
  enabled: boolean;
  pinHash: string | null;
  duration: LockDuration;
}

async function getPromptLockSettings(): Promise<PromptLockSettings>
async function setPromptLockPin(pin: string): Promise<void>
async function setPromptLockEnabled(enabled: boolean): Promise<void>
async function setPromptLockDuration(duration: LockDuration): Promise<void>
async function setPromptUnlocked(): Promise<void>
async function isPromptLocked(): Promise<boolean>
async function verifyPromptPin(pin: string): Promise<boolean>
async function clearPromptLock(): Promise<void>
```

### Sidebar Layer (`src/sidebar/prompts-manager.ts`)

Modified `load()` method:
```typescript
async load(tagFilter?: string): Promise<void> {
  // NEW: Check lock state first
  if (await isPromptLocked()) {
    this.renderPinPad();
    return;
  }

  // Existing load logic...
}
```

New methods:
- `renderPinPad()` — renders PIN pad UI
- `handlePinEntry(digit: string)` — accumulates PIN digits
- `submitPin()` — validates PIN and unlocks if correct
- `clearPin()` — resets PIN entry

### Settings Layer (`src/settings/`)

New "Security" tab with:
- Toggle to enable/disable lock
- PIN display (masked) with "Change PIN" button
- Duration dropdown
- "Forgot PIN" button

## UI Design

### PIN Pad Layout

Displayed in the prompts list area when locked:
- Lock icon + "Prompts are locked" heading
- "Enter PIN to access your prompts" subtitle
- 4x3 numeric keypad (1-9, 0, backspace, submit)
- PIN display shows dots (•••) for entered digits
- Shake animation on invalid PIN
- Error message fades after 2 seconds

### Security Tab Settings

```
Security
├── Prompt Lock
│   ├── [toggle] Lock Prompts with PIN
│   ├── PIN: [••••] [Change PIN...]
│   ├── Lock duration: [dropdown]
│   └── [Forgot PIN] button
```

Duration dropdown options:
- Until sidebar closes
- 5 minutes of inactivity
- 15 minutes of inactivity
- Until browser restart

## Data Flow

### Lock Check Flow

```
User clicks Prompts tab
  ↓
isPromptLocked() checks:
  - Is lock enabled in settings?
  - Does session have valid unlock timestamp?
  ↓
  ┌─────┴─────┐
locked          unlocked
  │               │
  ↓               ↓
Render PIN pad   Load prompts
  │
  ↓
User enters PIN
  ↓
verifyPromptPin() compares hash
  ↓
  ┌─────┴─────┐
match          mismatch
  │               │
  ↓               ↓
setPromptUnlocked()  Shake + error
  ↓
Load prompts
```

### Duration Logic

| Duration | Check Implementation |
|----------|---------------------|
| `sidebar` | No timestamp check — just presence in session |
| `5min` | `(Date.now() - unlockedAt) < 5 * 60 * 1000` |
| `15min` | `(Date.now() - unlockedAt) < 15 * 60 * 1000` |
| `browser` | Always return true if timestamp exists in session |

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Storage unavailable | Fallback to unlocked |
| No PIN set but lock enabled | Treat as disabled (fail open) |
| Invalid PIN | Shake animation, clear input, show error |
| PIN forgotten | "Forgot PIN" requires confirmation, then clears lock |
| Change PIN | Requires entering current PIN first |

## Implementation Checklist

### Storage
- [ ] Add `LockDuration` type
- [ ] Add `PromptLockSettings` interface
- [ ] Implement `getPromptLockSettings()`
- [ ] Implement `setPromptLockPin()` with SHA-256 hashing
- [ ] Implement `setPromptLockEnabled()`
- [ ] Implement `setPromptLockDuration()`
- [ ] Implement `setPromptUnlocked()`
- [ ] Implement `isPromptLocked()` with duration logic
- [ ] Implement `verifyPromptPin()`
- [ ] Implement `clearPromptLock()`

### Sidebar
- [ ] Add PIN pad HTML template
- [ ] Add PIN pad CSS styles
- [ ] Modify `PromptsManager.load()` to check lock
- [ ] Implement `renderPinPad()`
- [ ] Implement `handlePinEntry()`
- [ ] Implement `submitPin()`
- [ ] Implement `clearPin()`
- [ ] Add shake animation for invalid PIN

### Settings
- [ ] Add Security tab to settings.html
- [ ] Add Security tab initialization in settings.ts
- [ ] Implement toggle handler
- [ ] Implement PIN change modal
- [ ] Implement duration dropdown handler
- [ ] Implement "Forgot PIN" handler

### Localization
- [ ] Add English strings to `locales/en.ts`
- [ ] Add German strings to `locales/de.ts`

## Testing Checklist

- [ ] Enable lock without PIN → blocked or prompted to set PIN
- [ ] Set PIN, enable lock, switch to Prompts → PIN pad shown
- [ ] Enter correct PIN → prompts load
- [ ] Enter wrong PIN → error, can try again
- [ ] Change PIN → requires old PIN confirmation
- [ ] Disable lock → prompts immediately accessible
- [ ] Test each duration option
- [ ] Close/reopen sidebar → behavior matches duration
- [ ] Restart browser → session cleared, must re-enter PIN
- [ ] Verify prompts NOT in DOM when locked
- [ ] Forgot PIN clears lock after confirmation

## Security Considerations

1. **PIN Storage:** SHA-256 hash stored in chrome.storage.local — not plain text
2. **DOM Isolation:** Prompt cards never rendered when locked — can't inspect to find content
3. **Session Storage:** Unlocked timestamp in chrome.storage.session (cleared on browser close)
4. **No Rate Limiting:** Local-only security, so no need for attempt throttling
5. **Hash Salt:** Use a simple salt (constant string) to prevent rainbow table attacks

## Migration Notes

- No IndexedDB migration required — uses chrome.storage
- Existing users: lock disabled by default, no PIN set
- Backup export will include PIN hash (but PIN is never stored in plain text)
