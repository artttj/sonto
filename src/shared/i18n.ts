// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import en from './locales/en';
import de from './locales/de';

const locales: Record<string, Record<string, string>> = { en, de };
let current: Record<string, string> = en;

export function setLocale(lang: string): void {
  current = locales[lang] ?? en;
}

export function t(key: string): string {
  return current[key] ?? en[key] ?? key;
}

export function applyI18n(root: Document | Element = document): void {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n')!);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.getAttribute('data-i18n-html')!);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    (el as HTMLElement).setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')!));
  });
}