// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { createIcons, icons } from '../shared/icons';
import { type PromptColor } from '../shared/storage';
import { escapeHtml, formatDate } from '../shared/utils';
import { insertTextToActiveTab } from '../shared/tab-operations';
import { MSG } from '../shared/messages';
import type { SontoItem, SontoItemFilter } from '../shared/types';
import { showToast, renderTags, showTagEditor, loadAllTags } from './utils';
import { PROMPT_COLORS, COLOR_ORDER } from './prompt-colors';
import {
  isPromptLocked,
  setPromptUnlocked,
  verifyPromptPin,
} from '../shared/storage';

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

let editModal: HTMLElement | null = null;

function initEditModal(): void {
  if (editModal) return;

  editModal = document.createElement('div');
  editModal.id = 'prompt-edit-modal';
  editModal.className = 'prompt-modal hidden';
  editModal.innerHTML = `
    <div class="prompt-modal-content">
      <h3 class="prompt-modal-title">Edit Prompt</h3>
      <textarea id="prompt-edit-input" class="prompt-textarea" rows="6"></textarea>
      <input type="text" id="prompt-edit-label" class="prompt-label-input" placeholder="Label (optional)" maxlength="30" />
      <input type="text" id="prompt-edit-tags" class="prompt-tags-input" placeholder="Tags (comma separated)" />
      <div class="prompt-color-picker">
        ${COLOR_ORDER.map(c => `<button type="button" class="color-dot color-dot-${c}" data-color="${c}" title="${c}"></button>`).join('')}
      </div>
      <div class="prompt-modal-actions">
        <button id="prompt-edit-cancel" class="prompt-btn prompt-btn-secondary" type="button">Cancel</button>
        <button id="prompt-edit-save" class="prompt-btn prompt-btn-primary" type="button">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(editModal);
}

function showEditModal(prompt: SontoItem, allTags: string[], onSave: (updates: { content: string; title?: string; metadata?: Record<string, unknown>; tags?: string[] }) => void): void {
  initEditModal();
  if (!editModal) return;

  const input = editModal.querySelector('#prompt-edit-input') as HTMLTextAreaElement;
  const labelInput = editModal.querySelector('#prompt-edit-label') as HTMLInputElement;
  const colorDots = editModal.querySelectorAll('.color-dot');

  input.value = prompt.content;
  labelInput.value = prompt.title ?? '';

  let selectedColor: PromptColor | undefined = prompt.metadata?.color as PromptColor;
  colorDots.forEach(dot => {
    dot.classList.toggle('selected', (dot as HTMLElement).dataset.color === selectedColor);
    dot.addEventListener('click', () => {
      const color = (dot as HTMLElement).dataset.color as PromptColor;
      selectedColor = selectedColor === color ? undefined : color;
      colorDots.forEach(d => d.classList.toggle('selected', (d as HTMLElement).dataset.color === selectedColor));
    });
  });

  const cancelBtn = editModal.querySelector('#prompt-edit-cancel') as HTMLButtonElement;
  const saveBtn = editModal.querySelector('#prompt-edit-save') as HTMLButtonElement;

  const close = () => {
    editModal?.classList.add('hidden');
  };

  cancelBtn.onclick = close;
  editModal.onclick = (e) => { if (e.target === editModal) close(); };

  saveBtn.onclick = () => {
    const tagsInput = (editModal?.querySelector('#prompt-edit-tags') as HTMLInputElement)?.value ?? '';
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 10);

    onSave({
      content: input.value.trim(),
      title: labelInput.value.trim() || undefined,
      metadata: { color: selectedColor },
      tags,
    });
    close();
  };

  editModal.classList.remove('hidden');
  input.focus();
}

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

  constructor(listEl: HTMLElement, searchEl: HTMLInputElement, filtersEl: HTMLElement) {
    this.listEl = listEl;
    this.searchEl = searchEl;
    this.filtersEl = filtersEl;
  }

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

  async filterByTag(tag: string): Promise<void> {
    await this.load(tag);
  }

  private renderFilters(): void {
    const colorCounts = new Map<PromptColor, { count: number; label?: string }>();

    for (const p of this.prompts) {
      const color = p.metadata?.color as PromptColor;
      if (color) {
        const existing = colorCounts.get(color);
        if (existing) {
          existing.count++;
        } else {
          colorCounts.set(color, { count: 1, label: p.title });
        }
      }
    }

    if (colorCounts.size === 0) {
      this.filtersEl.classList.add('hidden');
      return;
    }

    this.filtersEl.classList.remove('hidden');
    this.filtersEl.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'filter-chip' + (this.activeColor === null ? ' active' : '');
    allBtn.textContent = 'All';
    allBtn.addEventListener('click', () => {
      this.activeColor = null;
      this.renderFilters();
      this.render();
    });
    this.filtersEl.appendChild(allBtn);

    for (const color of COLOR_ORDER) {
      const data = colorCounts.get(color);
      if (!data) continue;

      const styles = PROMPT_COLORS[color];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-chip filter-chip-color' + (this.activeColor === color ? ' active' : '');
      btn.style.setProperty('--chip-bg', styles.bg);
      btn.style.setProperty('--chip-border', styles.border);
      btn.innerHTML = `
        <span class="filter-dot" style="background: ${styles.hex}"></span>
        <span class="filter-label">${data.label ? escapeHtml(data.label) : color.charAt(0).toUpperCase() + color.slice(1)}</span>
        <span class="filter-count">${data.count}</span>
      `;
      btn.addEventListener('click', () => {
        this.activeColor = color;
        this.renderFilters();
        this.render();
      });
      this.filtersEl.appendChild(btn);
    }

    createIcons({ icons, attrs: { strokeWidth: 1.5 } });
  }

  async search(query: string): Promise<void> {
    if (!query.trim()) {
      await this.load();
      return;
    }
    this.setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG.SEARCH_SONTO_ITEMS,
        query,
        filter: { types: ['prompt'] },
      });
      this.prompts = response?.ok ? (response.items as SontoItem[]) : [];
    } catch (err) {
      console.error('[Sonto] Search failed:', err);
    } finally {
      this.setLoading(false);
      this.renderFilters();
      this.render();
    }
  }

  render(): void {
    this.listEl.innerHTML = '';

    const filtered = this.activeColor
      ? this.prompts.filter(p => p.metadata?.color === this.activeColor)
      : this.prompts;

    if (this.isLoading) {
      this.renderLoading();
      return;
    }

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'clips-empty';
      const hasSearch = this.searchEl.value.trim().length > 0;
      const hasFilter = this.activeColor !== null;
      empty.innerHTML = `
        <div class="empty-icon"><i data-lucide="sparkles"></i></div>
        <p>${hasFilter ? 'No prompts with this color.' : hasSearch ? 'No prompts found.' : 'No prompts saved yet.'}</p>
        <p class="empty-hint">${hasFilter ? 'Try a different filter.' : hasSearch ? 'Try a different search term.' : 'Right-click selected text on any page to save as a prompt.'}</p>
      `;
      this.listEl.appendChild(empty);
      createIcons({ icons, attrs: { strokeWidth: 1.5 } });
      return;
    }

    for (const prompt of filtered) {
      this.listEl.appendChild(this.buildCard(prompt));
    }

    createIcons({ icons, attrs: { strokeWidth: 1.5 } });
  }

  private addSeparator(label: string, extraClass?: string): void {
    const separator = document.createElement('div');
    separator.className = 'day-separator' + (extraClass ? ' ' + extraClass : '');
    separator.textContent = label;
    this.listEl.appendChild(separator);
  }

  private buildCard(prompt: SontoItem): HTMLElement {
    const card = document.createElement('div');
    card.className = 'clip-card clip-type-prompt';
    card.dataset.id = prompt.id;

    const preview = escapeHtml(prompt.content.slice(0, 280));
    const needsExpand = prompt.content.length > 280;
    const colorStyles = prompt.metadata?.color ? PROMPT_COLORS[prompt.metadata.color as PromptColor] : null;
    const colorDot = colorStyles
      ? `<span class="prompt-color-tag" style="background: ${colorStyles.hex};"></span>`
      : '';

    const tagsHtml = renderTags(prompt.tags);

    card.innerHTML = `
      <div class="clip-header">
        <div class="clip-header-left">
          ${colorDot}
          <span class="clip-type-badge clip-badge-prompt">
            <span class="clip-type-icon">✦</span>
            ${prompt.title ? escapeHtml(prompt.title) : 'Prompt'}
          </span>
        </div>
        <span class="clip-time">${formatDate(prompt.createdAt)}</span>
      </div>
      <div class="clip-body${needsExpand ? ' clip-body-expandable' : ''}" ${needsExpand ? 'title="Click to view full text"' : ''}>
        <p class="clip-text-preview">${preview}${prompt.content.length > 280 ? '…' : ''}</p>
        ${tagsHtml}
      </div>
      <div class="clip-card-actions">
        <button class="clip-btn clip-btn-copy" title="Copy" aria-label="Copy this prompt"><i data-lucide="clipboard"></i></button>
        <button class="clip-btn clip-btn-insert" title="Insert to input" aria-label="Insert text into active input field"><i data-lucide="text-cursor-input"></i></button>
        <button class="clip-btn clip-btn-tags" title="Edit tags" aria-label="Edit tags"><i data-lucide="tag"></i></button>
        ${needsExpand ? `<button class="clip-btn clip-btn-expand" title="View full" aria-label="View full text"><i data-lucide="maximize-2"></i></button>` : ''}
        <button class="clip-btn clip-btn-edit" title="Edit" aria-label="Edit this prompt"><i data-lucide="pencil"></i></button>
        <button class="clip-btn clip-btn-delete" title="Delete" aria-label="Delete this prompt"><i data-lucide="trash-2"></i></button>
      </div>
    `;

    const copyPrompt = () => {
      void navigator.clipboard.writeText(prompt.content).then(() => {
        const btn = card.querySelector<HTMLButtonElement>('.clip-btn-copy');
        btn?.classList.add('copied');
        setTimeout(() => btn?.classList.remove('copied'), COPY_FEEDBACK_MS);
      }).catch(() => {});
    };

    card.querySelector<HTMLButtonElement>('.clip-btn-copy')?.addEventListener('click', copyPrompt);
    card.addEventListener('dblclick', copyPrompt);

    card.querySelector<HTMLButtonElement>('.clip-btn-insert')?.addEventListener('click', () => {
      void this.insertText(prompt.content);
    });

    card.querySelector<HTMLButtonElement>('.clip-btn-tags')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showTagEditor(prompt);
    });

    card.querySelector<HTMLButtonElement>('.clip-btn-edit')?.addEventListener('click', () => {
      showEditModal(prompt, this.allTags, async (updates) => {
        if (updates.content) {
          await chrome.runtime.sendMessage({
            type: MSG.UPDATE_SONTO_ITEM,
            id: prompt.id,
            updates: {
              content: updates.content,
              title: updates.title,
              metadata: updates.metadata,
              tags: updates.tags ?? prompt.tags,
            },
          });
          await this.load();
        }
      });
    });

    card.querySelector<HTMLButtonElement>('.clip-btn-delete')?.addEventListener('click', () => {
      void this.deletePrompt(prompt.id, card);
    });

    if (needsExpand) {
      const bodyEl = card.querySelector('.clip-body');
      const expandBtn = card.querySelector('.clip-btn-expand');
      const clickHandler = () => this.showFullText(prompt.content);
      bodyEl?.addEventListener('click', clickHandler);
      expandBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        clickHandler();
      });
    }

    const tagElements = card.querySelectorAll('.clip-tag');
    tagElements.forEach((tagEl) => {
      tagEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = (e.currentTarget as HTMLElement).dataset.tag;
        if (tag) {
          void this.filterByTag(tag);
        }
      });
    });

    return card;
  }

  private showFullText(text: string): void {
    const modal = document.createElement('div');
    modal.className = 'fulltext-modal open';
    modal.innerHTML = `
      <div class="fulltext-header">
        <span class="fulltext-title">Full Text</span>
        <button class="fulltext-close" aria-label="Close">✕</button>
      </div>
      <div class="fulltext-content"><pre><code>${escapeHtml(text)}</code></pre></div>
      <div class="fulltext-actions">
        <button class="fulltext-insert">Insert</button>
        <button class="fulltext-copy">Copy</button>
      </div>
    `;

    const overlay = document.createElement('div');
    overlay.className = 'fulltext-overlay';
    const close = () => { modal.remove(); overlay.remove(); };

    overlay.addEventListener('click', close);
    modal.querySelector('.fulltext-close')?.addEventListener('click', close);
    modal.querySelector('.fulltext-copy')?.addEventListener('click', () => {
      void navigator.clipboard.writeText(text).then(() => close());
    });
    modal.querySelector('.fulltext-insert')?.addEventListener('click', () => {
      void this.insertText(text);
    });

    document.body.appendChild(overlay);
    document.body.appendChild(modal);
  }

  private async deletePrompt(id: string, card: HTMLElement): Promise<void> {
    card.classList.add('clip-removing');
    await chrome.runtime.sendMessage({ type: MSG.DELETE_SONTO_ITEM, id });
    this.prompts = this.prompts.filter(p => p.id !== id);

    setTimeout(() => {
      card.remove();
      this.renderFilters();
      if (this.prompts.length === 0) this.render();
    }, 200);
  }

  private showTagEditor(prompt: SontoItem): void {
    showTagEditor({
      currentTags: prompt.tags,
      allTags: this.allTags,
      onSave: async (tags) => {
        await chrome.runtime.sendMessage({
          type: MSG.UPDATE_SONTO_ITEM,
          id: prompt.id,
          updates: { tags },
        });
        prompt.tags = tags;
        this.render();
      },
    });
  }

  private setLoading(loading: boolean): void {
    this.isLoading = loading;
  }

  private renderLoading(): void {
    const loading = document.createElement('div');
    loading.className = 'clips-loading';
    loading.innerHTML = '<div class="spinner"></div>';
    this.listEl.appendChild(loading);
  }

  private async insertText(text: string): Promise<void> {
    const result = await insertTextToActiveTab(text);
    if (result.error) {
      showToast(result.error, true);
    }
  }
}