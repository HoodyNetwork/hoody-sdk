// These bodies keep each sentence short. And they never say
// closing does anything: closing the send-again confirm only cancels (Send again sends), and closing the run
// toast frees nothing (its action does, or opens the runs when nothing is held).
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';

const KEYS = ['test.sendAgainBody', 'run.checkingBody'] as const;
const sentences = (s: string): string[] => s.split(/(?<=[.!?])\s+/).filter(Boolean);
const words = (s: string): number => s.split(/\s+/).filter(Boolean).length;

describe('closing bodies use short sentences', () => {
  for (const k of KEYS) {
    it(`${k}: no sentence over 10 words, and closing is never said to do anything`, () => {
      const s = (strings as Record<string, string | undefined>)[k] ?? '';
      expect(s).not.toBe('');
      expect(s).not.toMatch(/\bclos(e|ing) this\b/i);
      expect(sentences(s).filter((x) => words(x) > 10)).toEqual([]);
    });
  }
});
