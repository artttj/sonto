// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG } from '../shared/messages';
import { escapeHtml } from '../shared/utils';

export const MAX_TAGS_DISPLAY = 3;

export function showToast(message: string, isError = false): void {
  const existing = document.getElementById('sonto-sidebar-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'sonto-sidebar-toast';
  toast.className = 'sidebar-toast' + (isError ? ' sidebar-toast-error' : '');
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2500);
}

export function renderTags(tags: string[]): string {
  if (tags.length === 0) return '';
  const displayTags = tags.slice(0, MAX_TAGS_DISPLAY);
  const more = tags.length > MAX_TAGS_DISPLAY ? `<span class="clip-tag-more">+${tags.length - MAX_TAGS_DISPLAY}</span>` : '';
  return `
    <div class="clip-tags">
      ${displayTags.map(tag => `<span class="clip-tag" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`).join('')}
      ${more}
    </div>
  `;
}

export interface TagEditorOptions {
  currentTags: string[];
  allTags: string[];
  onSave: (tags: string[]) => void | Promise<void>;
  title?: string;
}

export function showTagEditor(options: TagEditorOptions): void {
  const { currentTags, allTags, onSave, title = 'Edit Tags' } = options;
  const existing = document.querySelector('.tag-editor-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'tag-editor-overlay';

  const modal = document.createElement('div');
  modal.className = 'tag-editor-modal';

  const tagsValue = currentTags.join(', ');
  const limitedSuggestions = allTags.slice(0, 30);

  modal.innerHTML = `
    <div class="tag-editor-header">
      <span>${escapeHtml(title)}</span>
      <button class="tag-editor-close" aria-label="Close">✕</button>
    </div>
    <div class="tag-editor-body">
      <input type="text" class="tag-editor-input" placeholder="Add tags (comma separated)" value="${escapeHtml(tagsValue)}" />
      <div class="tag-editor-suggestions">${limitedSuggestions.map((t) => `<span class="tag-suggestion" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')}</div>
    </div>
    <div class="tag-editor-actions">
      <button class="tag-editor-save">Save</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const input = modal.querySelector('.tag-editor-input') as HTMLInputElement;
  input.focus();

  const close = () => overlay.remove();

  modal.querySelector('.tag-editor-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  modal.querySelectorAll('.tag-suggestion').forEach((el) => {
    el.addEventListener('click', () => {
      const tag = (el as HTMLElement).dataset.tag;
      if (tag) {
        const current = input.value.split(',').map((t) => t.trim()).filter(Boolean);
        if (!current.includes(tag)) {
          input.value = [...current, tag].join(', ');
        }
      }
    });
  });

  modal.querySelector('.tag-editor-save')?.addEventListener('click', () => {
    const tags = input.value
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 10);
    void Promise.resolve(onSave(tags)).then(close);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      modal.querySelector('.tag-editor-save')?.dispatchEvent(new Event('click'));
    }
    if (e.key === 'Escape') {
      close();
    }
  });
}

export async function loadAllTags(): Promise<string[]> {
  try {
    const response = await chrome.runtime.sendMessage({ type: MSG.GET_ALL_TAGS });
    return response?.ok ? response.tags : [];
  } catch {
    return [];
  }
}

export async function toggleZenify(
  id: string,
  card: HTMLElement,
  items: { id: string; zenified?: boolean }[],
): Promise<boolean | null> {
  try {
    const response = await chrome.runtime.sendMessage({ type: MSG.TOGGLE_ZENIFIED, id });
    if (response?.ok) {
      const item = items.find((c) => c.id === id);
      if (item) {
        item.zenified = response.zenified;
        card.classList.toggle('clip-zenified', response.zenified);
        const btn = card.querySelector<HTMLElement>('.clip-btn-zenify');
        if (btn) {
          btn.classList.toggle('zenified', response.zenified);
          btn.title = response.zenified ? 'Un-zenify' : 'Zenify';
        }
      }
      return response.zenified;
    }
  } catch (err) {
    console.error('[Sonto] Failed to toggle zenify:', err);
  }
  return null;
}

export function moveCardToTop(card: HTMLElement, listEl: HTMLElement): void {
  card.style.transition = 'none';
  const pinnedSep = listEl.querySelector('.pinned-separator');
  const firstPinned = listEl.querySelector('.clip-pinned');
  if (pinnedSep) {
    listEl.insertBefore(card, pinnedSep.nextSibling);
  } else if (firstPinned) {
    listEl.insertBefore(card, firstPinned);
  } else {
    listEl.insertBefore(card, listEl.firstChild);
  }
  requestAnimationFrame(() => {
    card.style.transition = '';
  });
}
