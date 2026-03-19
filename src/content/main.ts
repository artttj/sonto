// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG } from '../shared/messages';
import { TRANSFORMS } from '../shared/clip-transforms';

function showToast(message: string, isError = false): void {
  const existing = document.getElementById('sonto-toast');
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = 'sonto-toast';
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      padding: 10px 16px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.4;
      color: #fff;
      background: ${isError ? '#c0392b' : '#1a1a1a'};
      border: 1px solid ${isError ? '#e74c3c' : '#333'};
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      max-width: 320px;
      word-break: break-word;
      animation: slide-in 0.18s ease-out;
    }
    @keyframes slide-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;

  shadow.appendChild(style);
  shadow.appendChild(toast);
  document.body.appendChild(host);

  setTimeout(() => host.remove(), 2500);
}

let monitoringEnabled = true;
let lastKnownClipboard = '';
let pendingPollTimer: ReturnType<typeof setTimeout> | null = null;

void chrome.storage.local.get('sonto_clipboard_monitoring').then((result) => {
  monitoringEnabled = (result['sonto_clipboard_monitoring'] as boolean | undefined) ?? true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'sonto_clipboard_monitoring' in changes) {
    monitoringEnabled = (changes['sonto_clipboard_monitoring'].newValue as boolean | undefined) ?? true;
  }
});

function sendClip(text: string, source: 'clipboard' | 'shortcut'): void {
  chrome.runtime.sendMessage(
    {
      type: MSG.CAPTURE_CLIP,
      text,
      url: location.href,
      title: document.title,
      source,
    },
    (response) => {
      if (chrome.runtime.lastError) return;
      if (source === 'shortcut') {
        if (response?.ok) {
          showToast('Saved to clipboard history.');
        } else {
          showToast(response?.message ?? 'Save failed.', true);
        }
      }
    },
  );
}

function triggerCapture(): void {
  const text = window.getSelection()?.toString().trim() ?? '';

  if (!text) {
    showToast('Select some text first.', true);
    return;
  }

  sendClip(text, 'shortcut');
}

async function pollClipboard(): Promise<void> {
  if (!monitoringEnabled) return;
  if (!document.hasFocus()) return;

  try {
    const text = (await navigator.clipboard.readText()).trim();
    if (!text || text === lastKnownClipboard) return;
    lastKnownClipboard = text;
    sendClip(text, 'clipboard');
  } catch {
    // clipboard read permission denied or not available — ignore
  }
}

function schedulePoll(): void {
  if (pendingPollTimer !== null) return;
  pendingPollTimer = setTimeout(() => {
    pendingPollTimer = null;
    void pollClipboard();
  }, 150);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'SONTO_CAPTURE_SHORTCUT') {
    triggerCapture();
  }
  if (message && message.type === 'SONTO_TOAST') {
    showToast(message.message, !!message.isError);
  }
  if (message && message.type === 'SONTO_QUICK_SEARCH') {
    toggleQuickSearch();
  }
});

let quickSearchOverlay: HTMLElement | null = null;

function toggleQuickSearch(): void {
  if (quickSearchOverlay) {
    quickSearchOverlay.remove();
    quickSearchOverlay = null;
    return;
  }
  createQuickSearchOverlay();
}

function createQuickSearchOverlay(): void {
  const host = document.createElement('div');
  host.id = 'sonto-quick-search';
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .overlay-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
    }
    .search-container {
      position: absolute;
      top: 15%;
      left: 50%;
      transform: translateX(-50%);
      width: min(560px, 90vw);
      max-height: 60vh;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 12px;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .search-input-wrap {
      display: flex;
      align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid #333;
    }
    .search-icon {
      width: 18px;
      height: 18px;
      color: #666;
      margin-right: 10px;
      flex-shrink: 0;
    }
    .search-input {
      flex: 1;
      background: none;
      border: none;
      outline: none;
      font-size: 16px;
      color: #eee;
      font-family: inherit;
    }
    .search-input::placeholder {
      color: #666;
    }
    .close-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      color: #666;
      cursor: pointer;
      border-radius: 4px;
      font-size: 18px;
    }
    .close-btn:hover {
      background: #333;
      color: #999;
    }
    .results {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    .result-item {
      display: block;
      width: 100%;
      padding: 10px 12px;
      background: none;
      border: none;
      text-align: left;
      cursor: pointer;
      border-radius: 8px;
      color: #ccc;
      font-size: 13px;
      line-height: 1.5;
    }
    .result-item:hover, .result-item.selected {
      background: #2a2a2a;
    }
    .result-item .preview {
      color: #eee;
      margin-bottom: 4px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .result-item .meta {
      font-size: 11px;
      color: #666;
    }
    .empty-state {
      padding: 32px;
      text-align: center;
      color: #666;
      font-size: 14px;
    }
    .loading {
      padding: 24px;
      text-align: center;
      color: #666;
    }
    .result-item.command .preview {
      color: #e8b931;
    }
    .cmd-prefix {
      color: #666;
      margin-right: 4px;
    }
  `;

  const container = document.createElement('div');
  container.innerHTML = `
    <div class="overlay-backdrop"></div>
    <div class="search-container">
      <div class="search-input-wrap">
        <svg class="search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="9" cy="9" r="5"/>
          <path d="M12.5 12.5L16 16"/>
        </svg>
        <input type="text" class="search-input" placeholder="Search snippets or type > for commands..." autofocus />
        <button class="close-btn">×</button>
      </div>
      <div class="results">
        <div class="empty-state">Start typing to search your snippets</div>
      </div>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(container);
  document.body.appendChild(host);
  quickSearchOverlay = host;

  const backdrop = shadow.querySelector('.overlay-backdrop') as HTMLElement;
  const input = shadow.querySelector('.search-input') as HTMLInputElement;
  const closeBtn = shadow.querySelector('.close-btn') as HTMLButtonElement;
  const results = shadow.querySelector('.results') as HTMLElement;

  const close = () => {
    host.remove();
    quickSearchOverlay = null;
  };

  backdrop.addEventListener('click', close);
  closeBtn.addEventListener('click', close);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
    }
  });

  const COMMANDS = TRANSFORMS.map((t) => ({
    id: t.id,
    label: t.label,
    keywords: t.id.replace(/-/g, ' ').split(' '),
    transform: t.transform,
  }));

  let selectedIdx = -1;

  function updateSelected(): void {
    const items = results.querySelectorAll('.result-item');
    items.forEach((el, i) => el.classList.toggle('selected', i === selectedIdx));
    if (selectedIdx >= 0 && selectedIdx < items.length) {
      items[selectedIdx].scrollIntoView({ block: 'nearest' });
    }
  }

  function activateSelected(): void {
    const items = results.querySelectorAll<HTMLElement>('.result-item');
    if (selectedIdx >= 0 && selectedIdx < items.length) {
      items[selectedIdx].click();
    }
  }

  function renderCommands(cmdQuery: string): void {
    const q = cmdQuery.toLowerCase();
    const filtered = q
      ? COMMANDS.filter((c) => c.label.toLowerCase().includes(q) || c.keywords.some((k) => k.includes(q)))
      : COMMANDS;

    if (filtered.length === 0) {
      results.innerHTML = '<div class="empty-state">No matching commands</div>';
      return;
    }

    results.innerHTML = filtered.map((c) =>
      `<button class="result-item command" data-cmd="${c.id}"><div class="preview"><span class="cmd-prefix">&gt;</span>${escapeHtml(c.label)}</div><div class="meta">Transforms clipboard text</div></button>`
    ).join('');

    selectedIdx = -1;

    results.querySelectorAll<HTMLElement>('.result-item').forEach((item) => {
      item.addEventListener('click', async () => {
        const cmdId = item.dataset.cmd;
        const cmd = COMMANDS.find((c) => c.id === cmdId);
        if (!cmd) return;
        try {
          const text = await navigator.clipboard.readText();
          if (!text.trim()) { showToast('Clipboard is empty', true); return; }
          const result = cmd.transform(text);
          await navigator.clipboard.writeText(result);
          showToast(`Applied: ${cmd.label}`);
          close();
        } catch {
          showToast('Could not read clipboard', true);
        }
      });
    });
  }

  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  input.addEventListener('input', () => {
    const query = input.value.trim();
    selectedIdx = -1;

    if (searchTimeout) clearTimeout(searchTimeout);

    if (!query) {
      results.innerHTML = '<div class="empty-state">Start typing to search your snippets</div>';
      return;
    }

    if (query.startsWith('>')) {
      renderCommands(query.slice(1).trim());
      return;
    }

    results.innerHTML = '<div class="loading">Searching...</div>';

    searchTimeout = setTimeout(async () => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'SEARCH_CLIPS', query });

        if (response?.ok && response.clips?.length > 0) {
          results.innerHTML = response.clips.slice(0, 10).map((clip: { id: string; text: string; timestamp: number; url?: string }) => `
            <button class="result-item" data-id="${clip.id}" data-text="${escapeHtml(clip.text.slice(0, 200))}">
              <div class="preview">${escapeHtml(clip.text.slice(0, 150))}${clip.text.length > 150 ? '...' : ''}</div>
              <div class="meta">${formatTime(clip.timestamp)}${clip.url ? ' · ' + new URL(clip.url).hostname : ''}</div>
            </button>
          `).join('');

          selectedIdx = -1;

          results.querySelectorAll('.result-item').forEach((item) => {
            item.addEventListener('click', async () => {
              const text = (item as HTMLElement).dataset.text || '';
              await navigator.clipboard.writeText(text);
              showToast('Copied to clipboard!');
              close();
            });
          });
        } else {
          results.innerHTML = '<div class="empty-state">No snippets found</div>';
        }
      } catch {
        results.innerHTML = '<div class="empty-state">Search error</div>';
      }
    }, 300);
  });

  input.addEventListener('keydown', (e) => {
    const items = results.querySelectorAll('.result-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
      updateSelected();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIdx = Math.max(selectedIdx - 1, -1);
      updateSelected();
    } else if (e.key === 'Enter' && selectedIdx >= 0) {
      e.preventDefault();
      activateSelected();
    }
  });

  input.focus();
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString();
}

// Ctrl+C / keyboard copy — most reliable path
document.addEventListener('copy', (e) => {
  if (!monitoringEnabled) return;

  const text =
    (e.clipboardData?.getData('text/plain') ?? '').trim() ||
    window.getSelection()?.toString().trim() ||
    '';

  if (!text) return;

  lastKnownClipboard = text;
  sendClip(text, 'clipboard');
});

// Right-click context menu "Copy" does not fire the copy event.
// Track selection text and poll the clipboard briefly after mouseup/keyup
// so we catch context menu copies without polling constantly.
document.addEventListener('mouseup', () => {
  const selected = window.getSelection()?.toString().trim() ?? '';
  if (selected) schedulePoll();
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'c' && (e.ctrlKey || e.metaKey)) return; // handled by copy event
  const selected = window.getSelection()?.toString().trim() ?? '';
  if (selected) schedulePoll();
});

// Reading Companion - show related snippets when visiting pages
async function initReadingCompanion(): Promise<void> {
  try {
    const domain = window.location.hostname.replace(/^www\./, '');
    if (!domain) return;
    
    const response = await chrome.runtime.sendMessage({ 
      type: MSG.GET_RELATED_CLIPS, 
      domain 
    });
    
    if (response?.ok && response.clips?.length > 0) {
      createReadingCompanionBanner(response.clips);
    }
  } catch {
    // silently fail
  }
}

function createReadingCompanionBanner(clips: Array<{ id: string; text: string; timestamp: number; url?: string }>): void {
  const existing = document.getElementById('sonto-reading-companion');
  if (existing) return;

  const host = document.createElement('div');
  host.id = 'sonto-reading-companion';
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483646;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      animation: fade-in 0.25s ease-out;
    }
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .companion-card {
      background: rgba(38, 38, 38, 0.88);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      max-width: 256px;
      overflow: hidden;
      transition: border-color 0.25s, box-shadow 0.25s;
    }
    .companion-card:hover {
      border-color: rgba(255, 255, 255, 0.1);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    }
    .companion-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      cursor: pointer;
      user-select: none;
      gap: 8px;
    }
    .companion-title {
      font-size: 10px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.5);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .companion-chevron {
      width: 14px;
      height: 14px;
      color: rgba(255, 255, 255, 0.35);
      transition: transform 0.25s ease-out;
      flex-shrink: 0;
    }
    .companion-card.expanded .companion-chevron {
      transform: rotate(180deg);
      color: rgba(255, 255, 255, 0.5);
    }
    .companion-badge {
      font-size: 9px;
      font-weight: 600;
      color: #e8b931;
      padding: 2px 5px;
      background: rgba(232, 185, 49, 0.12);
      border-radius: 4px;
      margin-left: auto;
      margin-right: 4px;
    }
    .companion-list {
      max-height: 0;
      overflow: hidden;
      opacity: 0;
      transition: max-height 0.28s ease-out, opacity 0.2s ease-out;
    }
    .companion-card.expanded .companion-list {
      max-height: 180px;
      opacity: 1;
      overflow-y: auto;
    }
    .companion-list::-webkit-scrollbar {
      width: 4px;
    }
    .companion-list::-webkit-scrollbar-track {
      background: transparent;
    }
    .companion-list::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2px;
    }
    .companion-item {
      display: block;
      width: 100%;
      padding: 8px;
      background: none;
      border: none;
      text-align: left;
      cursor: pointer;
      border-radius: 6px;
      color: rgba(255, 255, 255, 0.75);
      font-size: 11px;
      line-height: 1.45;
      transition: background 0.15s;
    }
    .companion-item:hover {
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.95);
    }
    .companion-item .preview {
      margin-bottom: 4px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
    }
    .companion-item .meta {
      font-size: 9px;
      color: rgba(255, 255, 255, 0.35);
    }
  `;

  const headerInner = document.createElement('div');
  headerInner.className = 'companion-header';
  headerInner.innerHTML = `
    <span class="companion-title">Related</span>
    <span class="companion-badge">${clips.length}</span>
    <svg class="companion-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M4 6l4 4 4-4"/>
    </svg>
  `;

  const list = document.createElement('div');
  list.className = 'companion-list';
  list.innerHTML = clips.slice(0, 3).map(clip => `
    <button class="companion-item" data-text="${escapeHtml(clip.text.slice(0, 200))}">
      <div class="preview">${escapeHtml(clip.text.slice(0, 85))}${clip.text.length > 85 ? '...' : ''}</div>
      <div class="meta">${formatTime(clip.timestamp)}</div>
    </button>
  `).join('');

  const card = document.createElement('div');
  card.className = 'companion-card';
  card.appendChild(headerInner);
  card.appendChild(list);

  shadow.appendChild(style);
  shadow.appendChild(card);
  document.body.appendChild(host);

  const close = () => host.remove();

  let isExpanded = false;

  headerInner.addEventListener('click', (e) => {
    if (isExpanded) {
      close();
    } else {
      isExpanded = true;
      card.classList.add('expanded');
    }
  });

  card.addEventListener('click', (e) => e.stopPropagation());

  const handleClickOutside = (e: Event) => {
    if (!host.contains(e.target as Node)) {
      close();
    }
  };
  document.addEventListener('click', handleClickOutside, { once: true });

  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', handleEscape, { once: true });

  list.querySelectorAll('.companion-item').forEach(item => {
    item.addEventListener('click', async () => {
      const text = (item as HTMLElement).dataset.text || '';
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard!');
    });
  });
}

void chrome.storage.local.get('sonto_reading_companion_enabled').then((result) => {
  if (result.sonto_reading_companion_enabled !== false) {
    initReadingCompanion();
  }
});
