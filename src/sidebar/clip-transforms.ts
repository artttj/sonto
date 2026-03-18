// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

export interface ClipTransform {
  id: string;
  label: string;
  applicable: (text: string) => boolean;
  transform: (text: string) => string;
}

export const TRANSFORMS: ClipTransform[] = [
  {
    id: 'format-json',
    label: 'Format JSON',
    applicable: (t) => {
      const s = t.trim();
      if (!(s.startsWith('{') || s.startsWith('['))) return false;
      try { JSON.parse(s); return true; } catch { return false; }
    },
    transform: (t) => JSON.stringify(JSON.parse(t.trim()), null, 2),
  },
  {
    id: 'extract-urls',
    label: 'Extract URLs',
    applicable: (t) => /https?:\/\/\S+/.test(t),
    transform: (t) => (t.match(/https?:\/\/[^\s<>"']+/g) ?? []).join('\n'),
  },
  {
    id: 'uppercase',
    label: 'UPPERCASE',
    applicable: () => true,
    transform: (t) => t.toUpperCase(),
  },
  {
    id: 'lowercase',
    label: 'lowercase',
    applicable: () => true,
    transform: (t) => t.toLowerCase(),
  },
  {
    id: 'title-case',
    label: 'Title Case',
    applicable: () => true,
    transform: (t) => t.replace(/\b\w/g, (c) => c.toUpperCase()),
  },
  {
    id: 'strip-html',
    label: 'Strip HTML',
    applicable: (t) => /<[^>]+>/.test(t),
    transform: (t) => t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
  },
  {
    id: 'trim',
    label: 'Trim whitespace',
    applicable: (t) => t !== t.replace(/\s+/g, ' ').trim(),
    transform: (t) => t.replace(/\s+/g, ' ').trim(),
  },
];

export function getApplicableTransforms(text: string): ClipTransform[] {
  return TRANSFORMS.filter((t) => t.applicable(text));
}
