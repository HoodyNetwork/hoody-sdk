// Bots cards in the terminal are drawn as list rows. The web card's foot (its chat apps and public link) and the model
// must still be read there: they wrap onto the row's meta lines instead of being dropped by the three-field cap.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

// The lines from a Bot's name line up to the next Bot's name line.
function rowOf(text: string, name: string, next: string): string {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => new RegExp(`\\b${name}\\b`).test(l) && !l.includes('│  Bots'));
  const end = lines.findIndex((l, i) => i > at && new RegExp(`\\b${next}\\b`).test(l));
  return at < 0 ? '' : lines.slice(at, end < 0 ? at + 5 : end).join('\n');
}

test('a card row names how to reach the Bot and its model', async () => {
  s = await renderPage({ page: 'bots', cols: 120, rows: 40 });
  const text = await s.settle();
  const support = rowOf(text, 'Support', 'Digest');
  expect(support).toContain('Discord');
  const chief = rowOf(text, 'Chief', 'Ledger');
  expect(chief).toContain('Public link');
  expect(chief).toContain('Model Hoody Free');
  expect(support).toContain('Model Hoody Free');
  // Once each: the reach words are the card's foot, not also a field of the meta line.
  const times = (text: string, word: string): number => text.split(word).length - 1;
  expect(times(support, 'Discord')).toBe(1);
  expect(times(chief, 'Public link')).toBe(1);
  expect(times(rowOf(text, 'Ledger', 'Support'), 'Only here in the Hub')).toBe(1);
  expect(s.failures).toEqual([]);
}, 180_000);
