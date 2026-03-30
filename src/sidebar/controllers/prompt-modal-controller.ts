// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { savePrompt } from '../../shared/storage';

interface PromptModalDeps {
  modal: HTMLElement;
  input: HTMLTextAreaElement;
  cancelBtn: HTMLButtonElement;
  saveBtn: HTMLButtonElement;
  addBtn: HTMLButtonElement;
  onSaved?: () => void | Promise<void>;
}

export class PromptModalController {
  private deps: PromptModalDeps;

  constructor(deps: PromptModalDeps) {
    this.deps = deps;
  }

  init(): void {
    this.deps.addBtn.addEventListener('click', () => this.show());
    this.deps.cancelBtn.addEventListener('click', () => this.hide());
    this.deps.saveBtn.addEventListener('click', () => void this.save());
    this.deps.modal.addEventListener('click', (e) => {
      if (e.target === this.deps.modal) this.hide();
    });
  }

  show(): void {
    this.deps.modal.classList.remove('hidden');
    this.deps.input.value = '';
    this.deps.input.focus();
  }

  hide(): void {
    this.deps.modal.classList.add('hidden');
    this.deps.input.value = '';
  }

  private async save(): Promise<void> {
    const text = this.deps.input.value.trim();
    if (!text) {
      this.hide();
      return;
    }

    try {
      await savePrompt(text);
      await this.deps.onSaved?.();
      this.hide();
    } catch (err) {
      console.error('[Sonto] Failed to save prompt:', err);
    }
  }
}
