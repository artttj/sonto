// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { MSG } from '../../shared/messages';
import type { PromptColor } from '../../shared/types';

const COLOR_ORDER: PromptColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray'];

interface PromptModalDeps {
  modal: HTMLElement;
  input: HTMLTextAreaElement;
  labelInput: HTMLInputElement;
  cancelBtn: HTMLButtonElement;
  saveBtn: HTMLButtonElement;
  addBtn: HTMLButtonElement;
  onSaved?: () => void | Promise<void>;
}

export class PromptModalController {
  private deps: PromptModalDeps;
  private selectedColor: PromptColor | undefined;
  private colorDots: NodeListOf<HTMLButtonElement>;

  constructor(deps: PromptModalDeps) {
    this.deps = deps;
    this.colorDots = deps.modal.querySelectorAll('.color-dot');
  }

  init(): void {
    this.deps.addBtn.addEventListener('click', () => this.show());
    this.deps.cancelBtn.addEventListener('click', () => this.hide());
    this.deps.saveBtn.addEventListener('click', () => void this.save());
    this.deps.modal.addEventListener('click', (e) => {
      if (e.target === this.deps.modal) this.hide();
    });

    this.colorDots.forEach(dot => {
      dot.addEventListener('click', () => {
        const color = dot.dataset.color as PromptColor;
        this.selectedColor = this.selectedColor === color ? undefined : color;
        this.updateColorSelection();
      });
    });
  }

  show(): void {
    this.deps.modal.classList.remove('hidden');
    this.deps.input.value = '';
    this.deps.labelInput.value = '';
    this.selectedColor = undefined;
    this.updateColorSelection();
    this.deps.input.focus();
  }

  hide(): void {
    this.deps.modal.classList.add('hidden');
    this.deps.input.value = '';
    this.deps.labelInput.value = '';
    this.selectedColor = undefined;
    this.updateColorSelection();
  }

  private updateColorSelection(): void {
    this.colorDots.forEach(dot => {
      dot.classList.toggle('selected', dot.dataset.color === this.selectedColor);
    });
  }

  private async save(): Promise<void> {
    const text = this.deps.input.value.trim();
    if (!text) {
      this.hide();
      return;
    }

    const label = this.deps.labelInput.value.trim() || undefined;

    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG.SAVE_SONTO_ITEM,
        item: {
          content: text,
          type: 'prompt',
          source: 'manual',
          contentType: 'text',
          title: label,
          tags: [],
          pinned: false,
          zenified: false,
          metadata: { color: this.selectedColor },
        },
      });
      if (response?.ok) {
        await this.deps.onSaved?.();
      }
      this.hide();
    } catch {
      this.hide();
    }
  }
}