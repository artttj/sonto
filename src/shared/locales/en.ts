// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

const en: Record<string, string> = {
  nav_clipboard: 'Clipboard',
  nav_language: 'Language',
  nav_data: 'Data',
  nav_about: 'About',
  brand_sub: 'Settings',

  general_language: 'Language',
  general_language_desc: 'Preferred interface language',
  general_saved: 'Saved',

  clipboard_heading: 'Clipboard',
  clipboard_desc: 'Configure how Sonto Clip captures and stores clipboard history.',
  clipboard_capture: 'Capture',
  clipboard_auto: 'Auto-capture on copy',
  clipboard_auto_desc: 'Automatically save text whenever you copy on any webpage. Disable to capture only via shortcut or right-click.',
  clipboard_max_size: 'Max history size',
  clipboard_max_size_desc: 'Maximum number of entries to keep. Oldest entries are removed when the limit is reached. (10–5000)',
  clipboard_stored: 'Entries stored',

  related_popup: 'Related clips popup',
  related_popup_desc: 'Show a floating card with related clips from your saves when visiting a page',

  badge_counter: 'Badge counter',
  badge_counter_desc: 'Show daily capture count on the extension icon',

  shortcuts: 'Keyboard Shortcuts',

  data_heading: 'Data',
  data_export: 'Export',
  data_import: 'Import',
  data_delete_all: 'Delete all',
  data_snippets: 'Saved snippets',
  data_confirm_delete: 'Delete all entries?',

  about_heading: 'About Sonto Clip',
  about_desc: 'Clipboard manager for Chrome. No accounts, no backend, no tracking.',
  about_version: 'Version',
  about_author: 'Author',
  about_license: 'License',
  about_license_text: 'MIT — free to use and modify.',
  about_github: 'View on GitHub',

  status_saved: 'Saved',
  status_deleted: 'Deleted',

  nav_security: 'Security',
  security_heading: 'Security',
  security_desc: 'Protect your prompts with a PIN code.',

  prompt_lock_enabled: 'Lock Prompts with PIN',
  prompt_lock_enabled_desc: 'Require a PIN to access your prompts',
  prompt_lock_pin: 'PIN',
  prompt_lock_change_pin: 'Change PIN',
  prompt_lock_change_pin_desc: 'Requires current PIN to change',
  prompt_lock_duration: 'Lock duration',
  prompt_lock_duration_sidebar: 'Until sidebar closes',
  prompt_lock_duration_5min: '5 minutes of inactivity',
  prompt_lock_duration_15min: '15 minutes of inactivity',
  prompt_lock_duration_browser: 'Until browser restart',
  prompt_lock_set_title: 'Set PIN',
  prompt_lock_set_desc: 'Enter a 4-digit PIN to protect your prompts',
  prompt_lock_change_title: 'Change PIN',
  prompt_lock_change_desc: 'Enter your current PIN, then a new 4-digit PIN',
  prompt_lock_current_pin: 'Current PIN',
  prompt_lock_new_pin: 'New PIN',
  prompt_lock_confirm_pin: 'Confirm PIN',
  prompt_lock_pin_set: 'PIN set',
  prompt_lock_pin_changed: 'PIN changed',
  prompt_lock_pins_match: 'PINs do not match',
  prompt_lock_invalid_current: 'Invalid current PIN',

  pin_pad_title: 'Prompts are locked',
  pin_pad_subtitle: 'Enter PIN to access your prompts',
  pin_pad_error: 'Invalid PIN - try again',
};

export default en;
