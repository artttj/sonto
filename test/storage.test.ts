// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSettings,
  saveSettings,
  getTheme,
  saveTheme,
  getReadLater,
  saveReadLater,
  getClipboardMonitoring,
  setClipboardMonitoring,
  getMaxHistorySize,
  setMaxHistorySize,
  getBadgeCounterEnabled,
  setBadgeCounterEnabled,
  getDripInterval,
  saveDripInterval,
  getDisabledSources,
  saveDisabledSources,
  getZenSourceSignals,
  bumpZenSourceSignal,
} from '../src/shared/storage';
import { mockStorage } from './setup';
import { DEFAULT_SETTINGS } from '../src/shared/constants';

describe('Storage Operations', () => {
  beforeEach(() => {
    // Reset storage to empty
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  });

  describe('Settings', () => {
    it('should return default settings when empty', async () => {
      const settings = await getSettings();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should save and retrieve settings', async () => {
      await saveSettings({ language: 'de' });

      const settings = await getSettings();
      expect(settings.language).toBe('de');
    });
  });

  describe('Theme', () => {
    it('should default to dark theme', async () => {
      const theme = await getTheme();
      expect(theme).toBe('dark');
    });

    it('should save and retrieve theme', async () => {
      await saveTheme('light');

      const theme = await getTheme();
      expect(theme).toBe('light');
    });
  });

  describe('Read Later', () => {
    it('should return empty array when no items', async () => {
      const items = await getReadLater();
      expect(items).toEqual([]);
    });

    it('should save and retrieve read later items', async () => {
      const items = [
        { url: 'https://example.com', title: 'Test', addedAt: Date.now() },
      ];
      await saveReadLater(items);

      const retrieved = await getReadLater();
      expect(retrieved).toEqual(items);
    });
  });

  describe('Clipboard Monitoring', () => {
    it('should default to true', async () => {
      const enabled = await getClipboardMonitoring();
      expect(enabled).toBe(true);
    });

    it('should save and retrieve monitoring state', async () => {
      await setClipboardMonitoring(false);

      const enabled = await getClipboardMonitoring();
      expect(enabled).toBe(false);
    });
  });

  describe('Max History Size', () => {
    it('should return default when not set', async () => {
      const size = await getMaxHistorySize();
      expect(size).toBe(500);
    });

    it('should save and retrieve max history size', async () => {
      await setMaxHistorySize(50);

      const size = await getMaxHistorySize();
      expect(size).toBe(50);
    });
  });

  describe('Badge Counter', () => {
    it('should default to enabled', async () => {
      const enabled = await getBadgeCounterEnabled();
      expect(enabled).toBe(true);
    });

    it('should save and retrieve badge counter state', async () => {
      await setBadgeCounterEnabled(false);

      const enabled = await getBadgeCounterEnabled();
      expect(enabled).toBe(false);
    });
  });

  describe('Zen Feed', () => {
    it('should default drip interval to 15000ms', async () => {
      const interval = await getDripInterval();
      expect(interval).toBe(15000);
    });

    it('should save and retrieve drip interval', async () => {
      await saveDripInterval(30000);

      const interval = await getDripInterval();
      expect(interval).toBe(30000);
    });

    it('should return empty array for disabled sources', async () => {
      const sources = await getDisabledSources();
      expect(sources).toEqual([]);
    });

    it('should save and retrieve disabled sources', async () => {
      await saveDisabledSources(['hnStory', 'reddit']);

      const sources = await getDisabledSources();
      expect(sources).toContain('hnStory');
      expect(sources).toContain('reddit');
    });

    it('should return empty object for source signals', async () => {
      const signals = await getZenSourceSignals();
      expect(signals).toEqual({});
    });

    it('should bump source signal', async () => {
      await bumpZenSourceSignal('hnStory', 2);
      await bumpZenSourceSignal('hnStory', 3);

      const signals = await getZenSourceSignals();
      expect(signals['hnStory']).toBe(5);
    });

    it('should cap source signal at 50', async () => {
      await bumpZenSourceSignal('test', 60);

      const signals = await getZenSourceSignals();
      expect(signals['test']).toBe(50);
    });

    it('should not allow negative signals', async () => {
      await bumpZenSourceSignal('test', -10);

      const signals = await getZenSourceSignals();
      expect(signals['test']).toBe(0);
    });
  });
});
