// The dock's first-use suggestions by page: only the page's own entries count, never inherited object keys.
import { describe, expect, it } from 'vitest';
import { suggestionsFor } from './suggest';

describe('suggestionsFor', () => {
  it('a known page gets its own suggestions', () => {
    expect(suggestionsFor('/logs').icon).toBe('logs');
  });
  it('an unknown page, or a name an object inherits (#/constructor, #/__proto__), falls back to home', () => {
    for (const p of ['/nope', '/constructor', '/__proto__', '/toString', '/hasOwnProperty', '']) {
      const s = suggestionsFor(p);
      expect(s.icon).toBe('computer');
      expect(Array.isArray(s.list)).toBe(true);
    }
  });
});
