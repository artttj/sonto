// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { getAllClips, addClip, clearAllClips } from './embeddings/vector-store';
import { getSettings, saveSettings, getTheme, saveTheme } from './storage';
import type { ClipItem } from './types';

interface BackupPayload {
  version: number;
  createdAt: number;
  clips: ClipItem[];
  settings: {
    app: Awaited<ReturnType<typeof getSettings>>;
    theme: string;
  };
}

export async function exportBackup(): Promise<string> {
  const [clips, app, theme] = await Promise.all([getAllClips(), getSettings(), getTheme()]);

  const payload: BackupPayload = {
    version: 2,
    createdAt: Date.now(),
    clips,
    settings: { app, theme },
  };

  return JSON.stringify(payload);
}

export async function importBackup(json: string, merge: boolean): Promise<{ clips: number }> {
  const data = JSON.parse(json) as BackupPayload;
  if (!data.version || !Array.isArray(data.clips)) {
    throw new Error('Invalid backup file');
  }

  if (!merge) {
    await clearAllClips();
  }

  let importedClips = 0;
  for (const clip of data.clips) {
    await addClip(clip);
    importedClips++;
  }

  if (data.settings) {
    if (data.settings.app) await saveSettings(data.settings.app);
    if (data.settings.theme) await saveTheme(data.settings.theme as 'dark' | 'light');
  }

  return { clips: importedClips };
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
