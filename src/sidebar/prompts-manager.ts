// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { createIcons, icons } from 'lucide';
import { MSG } from '../shared/messages';
import { getAllPrompts, deletePrompt, type PromptItem } from '../shared/storage';
import { escapeHtml } from '../shared/utils';

const COPY_FEEDBACK_MS = 1500;

export class PromptsManager {
  private prompts: PromptItem[] = [];
  private listEl: HTMLElement;
  private searchEl: HTMLInputElement;
  private isLoading = false;

  constructor(listEl: HTMLElement, searchEl: HTMLInputElement) {
    this.listEl = listEl;
    this.searchEl = searchEl;
  }

  async load(): Promise<void> {
    this.setLoading(true);
    try {
      this.prompts = await getAllPrompts();
    } catch (err) {
      console.error('[Sonto] Failed to load prompts:', err);
    } finally {
      this.setLoading(false);
      this.render();
    }
  }

  async search(query: string): Promise<void> {
    if (!query.trim()) {
      await this.load();
      return;
    }
    this.setLoading(true);
    try {
      const all = await getAllPrompts();
      const q = query.toLowerCase();
      this.prompts = all.filter(p => p.text.toLowerCase().includes(q));
    } catch (err) {
      console.error('[Sonto] Search failed:', err);
    } finally {
      this.setLoading(false);
      this.render();
    }
  }

  render(): void {
    this.listEl.innerHTML = '';

    if (this.isLoading) {
      this.renderLoading();
      return;
    }

    if (this.prompts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'clips-empty';
      const hasSearch = this.searchEl.value.trim().length > 0;
      empty.innerHTML = `
        <div class="empty-icon"><i data-lucide="sparkles"></i></div>
        <p>${hasSearch ? 'No prompts found.' : 'No prompts saved yet.'}</p>
        <p class="empty-hint">${hasSearch ? 'Try a different search term.' : 'Right-click selected text on any page to save as a prompt.'}</p>
      `;
      this.listEl.appendChild(empty);
      createIcons({ icons, attrs: { strokeWidth: 1.5 } });
      return;
    }

    for (const prompt of this.prompts) {
      this.listEl.appendChild(this.buildCard(prompt));
    }

    createIcons({ icons, attrs: { strokeWidth: 1.5 } });
  }

  private buildCard(prompt: PromptItem): HTMLElement {
    const card = document.createElement('div');
    card.className = 'clip-card clip-type-prompt';
    card.dataset.id = prompt.id;

    const preview = escapeHtml(prompt.text.slice(0, 280));
    const needsExpand = prompt.text.length > 280;

    card.innerHTML = `
      <div class="clip-header">
        <span class="clip-type-badge clip-badge-prompt">
          <span class="clip-type-icon">✦</span>
          Prompt
        </span>
        <span class="clip-time">${this.formatDate(prompt.createdAt)}</span>
      </div>
      <div class="clip-body${needsExpand ? ' clip-body-expandable' : ''}" ${needsExpand ? 'title="Click to view full text"' : ''}>
        <p class="clip-text-preview">${preview}${prompt.text.length > 280 ? '…' : ''}</p>
      </div>
      <div class="clip-card-actions">
        <button class="clip-btn clip-btn-copy" title="Copy" aria-label="Copy this prompt"><i data-lucide="clipboard"></i><span class="clip-btn-label">Copy</span></button>
        ${needsExpand ? `<button class="clip-btn clip-btn-expand" title="View full" aria-label="View full text"><i data-lucide="maximize-2"></i></button>` : ''}
        <button class="clip-btn clip-btn-delete" title="Delete" aria-label="Delete this prompt"><i data-lucide="trash-2"></i></button>
      </div>
    `;

    const copyPrompt = () => {
      void navigator.clipboard.writeText(prompt.text).then(() => {
        const btn = card.querySelector<HTMLButtonElement>('.clip-btn-copy');
        const label = btn?.querySelector('.clip-btn-label');
        if (label) {
          label.textContent = 'Copied!';
          setTimeout(() => { label.textContent = 'Copy'; }, COPY_FEEDBACK_MS);
        }
      }).catch(() => {});
    };

    card.querySelector<HTMLButtonElement>('.clip-btn-copy')?.addEventListener('click', copyPrompt);
    card.addEventListener('dblclick', copyPrompt);

    card.querySelector<HTMLButtonElement>('.clip-btn-delete')?.addEventListener('click', () => {
      void this.deletePrompt(prompt.id, card);
    });

    return card;
  }

  private async deletePrompt(id: string, card: HTMLElement): Promise<void> {
    card.classList.add('clip-removing');
    await deletePrompt(id);
    this.prompts = this.prompts.filter(p => p.id !== id);

    setTimeout(() => {
      card.remove();
      if (this.prompts.length === 0) this.render();
    }, 200);
  }

  private formatDate(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
}