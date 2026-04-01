// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZEN_FETCHERS, isArtResult, isTextResult } from '../src/sidebar/zen/zen-fetchers';

const mockCtx = {
  language: 'en',
  isValidFact: (text: string) => text.length > 5,
  pickCategory: () => null,
};

describe('Zen Fetchers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('ZEN_FETCHERS structure', () => {
    it('should have all expected fetchers', () => {
      const ids = ZEN_FETCHERS.map((f) => f.id);
      expect(ids).toContain('hnStory');
      expect(ids).toContain('reddit');
      expect(ids).toContain('metArtwork');
      expect(ids).toContain('clevelandArtwork');
      expect(ids).toContain('rijksmuseumArtwork');
      expect(ids).toContain('gettyArtwork');
      expect(ids).toContain('wikimediaPaintings');
      expect(ids).toContain('smithsonianNews');
      expect(ids).toContain('atlasObscura');
      expect(ids).toContain('theVerge');
      expect(ids).toContain('marsRover');
      expect(ids).toContain('haiku');
      expect(ids).toContain('kotowaza');
      expect(ids).toContain('obliqueStrategies');
      expect(ids).toContain('philosophyEssay');
      expect(ids).toContain('albumOfDay');
      expect(ids).toContain('customRss');
      expect(ids).toContain('customJson');
    });

    it('should have valid labels for all fetchers', () => {
      for (const fetcher of ZEN_FETCHERS) {
        expect(fetcher.label).toBeTruthy();
        expect(fetcher.label.length).toBeGreaterThan(3);
      }
    });

    it('should have positive weights for all fetchers', () => {
      for (const fetcher of ZEN_FETCHERS) {
        expect(fetcher.weight).toBeGreaterThan(0);
        expect(fetcher.weight).toBeLessThanOrEqual(20);
      }
    });
  });

  describe('isArtResult', () => {
    it('should return true for art results', () => {
      expect(isArtResult({ imageUrl: 'https://example.com/img.jpg', caption: 'Art' })).toBe(true);
    });

    it('should return false for text results', () => {
      expect(isArtResult({ text: 'Some text' })).toBe(false);
    });

    it('should return false for null', () => {
      expect(isArtResult(null)).toBe(false);
    });
  });

  describe('isTextResult', () => {
    it('should return true for text results', () => {
      expect(isTextResult({ text: 'Some text' })).toBe(true);
    });

    it('should return false for art results', () => {
      expect(isTextResult({ imageUrl: 'https://example.com/img.jpg', caption: 'Art' })).toBe(false);
    });

    it('should return false for null', () => {
      expect(isTextResult(null)).toBe(false);
    });
  });

  describe('Text-based fetchers', () => {
    it('haiku fetcher should return text result', async () => {
      const fetcher = ZEN_FETCHERS.find((f) => f.id === 'haiku');
      expect(fetcher).toBeDefined();
      const result = await fetcher!.fetch(mockCtx);
      if (result) {
        expect(isTextResult(result)).toBe(true);
        expect(result.text).toBeTruthy();
        expect(result.text.length).toBeGreaterThan(10);
      }
    });

    it('kotowaza fetcher should return text result with html', async () => {
      const fetcher = ZEN_FETCHERS.find((f) => f.id === 'kotowaza');
      expect(fetcher).toBeDefined();
      const result = await fetcher!.fetch(mockCtx);
      if (result) {
        expect(isTextResult(result)).toBe(true);
        expect(result.text).toBeTruthy();
        expect(result.html).toBeTruthy();
      }
    });

    it('obliqueStrategies fetcher should return text result', async () => {
      const fetcher = ZEN_FETCHERS.find((f) => f.id === 'obliqueStrategies');
      expect(fetcher).toBeDefined();
      const result = await fetcher!.fetch(mockCtx);
      if (result) {
        expect(isTextResult(result)).toBe(true);
        expect(result.text).toBeTruthy();
      }
    });
  });

  describe('Art fetchers', () => {
    it('wikimediaPaintings fetcher should return art result or null', async () => {
      const fetcher = ZEN_FETCHERS.find((f) => f.id === 'wikimediaPaintings');
      expect(fetcher).toBeDefined();
      const result = await fetcher!.fetch(mockCtx);
      if (result) {
        expect(isArtResult(result)).toBe(true);
        expect(result.imageUrl).toMatch(/^https:\/\//);
        expect(result.caption).toBeTruthy();
      }
    });

    it('metArtwork fetcher should return art result or null', async () => {
      const fetcher = ZEN_FETCHERS.find((f) => f.id === 'metArtwork');
      expect(fetcher).toBeDefined();
      const result = await fetcher!.fetch(mockCtx);
      if (result) {
        expect(isArtResult(result)).toBe(true);
        expect(result.imageUrl).toMatch(/^https:\/\//);
        expect(result.caption).toBeTruthy();
      }
    });

    it('clevelandArtwork fetcher should return art result or null', async () => {
      const fetcher = ZEN_FETCHERS.find((f) => f.id === 'clevelandArtwork');
      expect(fetcher).toBeDefined();
      const result = await fetcher!.fetch(mockCtx);
      if (result) {
        expect(isArtResult(result)).toBe(true);
        expect(result.imageUrl).toMatch(/^https:\/\//);
        expect(result.caption).toBeTruthy();
      }
    });

    it('rijksmuseumArtwork fetcher should return art result or null', async () => {
      const fetcher = ZEN_FETCHERS.find((f) => f.id === 'rijksmuseumArtwork');
      expect(fetcher).toBeDefined();
      const result = await fetcher!.fetch(mockCtx);
      if (result) {
        expect(isArtResult(result)).toBe(true);
        expect(result.imageUrl).toMatch(/^https:\/\//);
        expect(result.caption).toBeTruthy();
      }
    });
  });

  describe('News fetchers', () => {
    it('hnStory fetcher should return text result with link', async () => {
      const fetcher = ZEN_FETCHERS.find((f) => f.id === 'hnStory');
      expect(fetcher).toBeDefined();
      const result = await fetcher!.fetch(mockCtx);
      if (result) {
        expect(isTextResult(result)).toBe(true);
        expect(result.text).toBeTruthy();
        expect(result.link).toMatch(/^https:\/\//);
      }
    });

    it('reddit fetcher should return text result with link', async () => {
      const fetcher = ZEN_FETCHERS.find((f) => f.id === 'reddit');
      expect(fetcher).toBeDefined();
      const result = await fetcher!.fetch(mockCtx);
      if (result) {
        expect(isTextResult(result)).toBe(true);
        expect(result.text).toBeTruthy();
        expect(result.link).toMatch(/^https:\/\//);
      }
    });
  });

  describe('The Verge fetcher', () => {
    it('should return text or art result', async () => {
      const fetcher = ZEN_FETCHERS.find((f) => f.id === 'theVerge');
      expect(fetcher).toBeDefined();
      const result = await fetcher!.fetch(mockCtx);
      if (result) {
        if (isArtResult(result)) {
          expect(result.imageUrl).toMatch(/^https:\/\//);
          expect(result.caption).toBeTruthy();
        } else {
          expect(result.text).toBeTruthy();
          expect(result.link).toMatch(/^https:\/\//);
        }
      }
    });
  });

  describe('Mars Rover fetcher', () => {
    it('should return art result with caption', async () => {
      const fetcher = ZEN_FETCHERS.find((f) => f.id === 'marsRover');
      expect(fetcher).toBeDefined();
      const result = await fetcher!.fetch(mockCtx);
      if (result) {
        expect(isArtResult(result)).toBe(true);
        expect(result.imageUrl).toMatch(/^https:\/\//);
        expect(result.caption).toContain('Mars');
      }
    });
  });
});