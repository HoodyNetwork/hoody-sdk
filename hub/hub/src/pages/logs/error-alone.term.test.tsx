// Logs when a read fails: the header said "Nothing to show right now." above the page's own error ("These logs could not
// be read." with Try again), two messages for one fact. The error stands alone.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const fx of ['error', 'private']) {
  test(`${fx}: the error shows without "Nothing to show right now." above it`, async () => {
    s = await renderPage({ page: 'logs', fx, cols: 120, rows: 40 });
    let frame = s.frame;
    for (let i = 0; i < 20 && !frame.includes('Try again'); i++) {
      await new Promise((r) => setTimeout(r, 250));
      frame = await s.settle();
    }
    expect(frame).toContain('Try again');
    expect(frame).not.toContain('Nothing to show right now.');
    expect(s.failures).toEqual([]);
  }, 180_000);
}

// Rows kept (Everything: the logs read fails, the changes rows still show): the header says only part could be read,
// because the list itself draws no error line of its own for the rows.
test('error with rows kept: the header says "Only part of these logs could be read."', async () => {
  s = await renderPage({ page: 'logs', fx: 'error', cols: 120, rows: 40 });
  let frame = s.frame;
  for (let i = 0; i < 20 && !frame.includes('Try again'); i++) {
    await new Promise((r) => setTimeout(r, 250));
    frame = await s.settle();
  }
  expect(frame).toContain('Computer started');
  expect(frame).toContain('Only part of these logs could be read.');
  expect(frame).not.toContain('Nothing to show right now.');
  expect(s.failures).toEqual([]);
}, 180_000);
