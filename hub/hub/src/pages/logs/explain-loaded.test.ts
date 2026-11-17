// Vitest: Explain this view hands over only the view's newest entries. The count it names ("the newest N of TOTAL")
// is the number the view holds, not the number handed over.
import { expect, test } from 'vitest';
import * as X from './explain';

const entry = (i: number) => ({ time: '2026-11-11T08:00:00.000Z', level: 'error', source: 'edge', message: 'request failed ' + i });

test('a view of 350 entries, its newest 5 handed over: "of 350", and the panel knows fewer are included', () => {
  const p = X.payload({ subject: 's', entries: Array.from({ length: 5 }, (_, i) => entry(i)), loaded: 350 });
  expect(p.shown).toBe(5);
  expect(p.total).toBe(350);
  expect(p.text).toContain('The newest 5 of 350 log entries, newest first:');
  expect(p.text.split('\n').filter((l) => l.includes('request failed'))).toHaveLength(5);
});

test('everything handed over: no "of", as before; a count below what was handed over is ignored', () => {
  const entries = Array.from({ length: 5 }, (_, i) => entry(i));
  for (const loaded of [undefined, 5, 2, Number.NaN]) {
    const p = X.payload({ subject: 's', entries, ...(loaded === undefined ? {} : { loaded }) });
    expect(p.total).toBe(5);
    expect(p.text).toContain('5 log entries, newest first:');
    expect(p.text).not.toContain(' of ');
  }
});

test('program output is counted by its own lines', () => {
  const p = X.payload({ subject: 's', snapshot: 'a\nb\n', loaded: 900 });
  expect(p.total).toBe(2);
});
