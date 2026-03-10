// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { getAllSnippets, addSnippet, clearAllSnippets } from './embeddings/vector-store';
import {
  getSettings,
  saveSettings,
  getCustomFeeds,
  saveCustomFeeds,
  getCustomJsonSources,
  saveCustomJsonSources,
  getDisabledSources,
  saveDisabledSources,
  getDripInterval,
  saveDripInterval,
  getZenDisplay,
  saveZenDisplay,
  getTheme,
  saveTheme,
  getChatSessions,
  saveChatSessions,
  isHistoryEnabled,
  setHistoryEnabled,
} from './storage';
import type { Snippet } from './types';

interface BackupPayload {
  version: number;
  createdAt: number;
  snippets: Snippet[];
  settings: {
    app: Awaited<ReturnType<typeof getSettings>>;
    disabledSources: string[];
    dripInterval: number;
    zenDisplay: string;
    theme: string;
    historyEnabled: boolean;
    customFeeds: Awaited<ReturnType<typeof getCustomFeeds>>;
    customJsonSources: Awaited<ReturnType<typeof getCustomJsonSources>>;
  };
  chatSessions: Awaited<ReturnType<typeof getChatSessions>>;
}

export async function exportBackup(): Promise<string> {
  const [
    snippets, app, disabledSources, dripInterval,
    zenDisplay, theme, historyEnabled, customFeeds,
    customJsonSources, chatSessions,
  ] = await Promise.all([
    getAllSnippets(),
    getSettings(),
    getDisabledSources(),
    getDripInterval(),
    getZenDisplay(),
    getTheme(),
    isHistoryEnabled(),
    getCustomFeeds(),
    getCustomJsonSources(),
    getChatSessions(),
  ]);

  const payload: BackupPayload = {
    version: 1,
    createdAt: Date.now(),
    snippets,
    settings: {
      app,
      disabledSources,
      dripInterval,
      zenDisplay,
      theme,
      historyEnabled,
      customFeeds,
      customJsonSources,
    },
    chatSessions,
  };

  return JSON.stringify(payload);
}

export async function importBackup(json: string, merge: boolean): Promise<{ snippets: number; sessions: number }> {
  const data = JSON.parse(json) as BackupPayload;
  if (!data.version || !Array.isArray(data.snippets)) {
    throw new Error('Invalid backup file');
  }

  if (!merge) {
    await clearAllSnippets();
  }

  let importedSnippets = 0;
  for (const snippet of data.snippets) {
    await addSnippet(snippet);
    importedSnippets++;
  }

  if (data.settings) {
    const s = data.settings;
    if (s.app) await saveSettings(s.app);
    if (s.disabledSources) await saveDisabledSources(s.disabledSources);
    if (s.dripInterval) await saveDripInterval(s.dripInterval);
    if (s.zenDisplay) await saveZenDisplay(s.zenDisplay as 'feed' | 'cosmos');
    if (s.theme) await saveTheme(s.theme as 'dark' | 'light');
    if (s.historyEnabled !== undefined) await setHistoryEnabled(s.historyEnabled);
    if (s.customFeeds) await saveCustomFeeds(s.customFeeds);
    if (s.customJsonSources) await saveCustomJsonSources(s.customJsonSources);
  }

  let importedSessions = 0;
  if (data.chatSessions?.length) {
    await saveChatSessions(data.chatSessions);
    importedSessions = data.chatSessions.length;
  }

  return { snippets: importedSnippets, sessions: importedSessions };
}

export function downloadBackup(json: string): void {
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sonto-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}