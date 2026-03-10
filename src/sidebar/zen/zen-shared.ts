// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

export const JUNK_PATTERNS = [
  /\bcookies?\b.*\b(consent|policy|notice|settings|preferences)\b/i,
  /\bprivacy policy\b/i,
  /\bterms (of service|of use|and conditions)\b/i,
  /\baccept all\b.*\bcookies?\b/i,
  /\bwe use cookies?\b/i,
  /^(home|about|contact|menu|navigation|search|log ?in|sign in|sign up|register|subscribe)\s*$/i,
];