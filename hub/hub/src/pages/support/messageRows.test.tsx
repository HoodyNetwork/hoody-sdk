// Vitest: New ticket's Message box is taller where the screen has room under the fields (14 rows from 820 px tall, 18
// from 1000 px), a phone keeps a modest box (10 rows, 8 when short) and a short screen keeps the old eight. The rows
// come from the kit TextField's own `rows`; the page adds no CSS of its own.
import { renderPage, screen } from '@app/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { messageRows } from './logic';
import page from './page';
import strings from './strings.en.json';

/** A screen of `width` × `height` as matchMedia answers the queries New ticket asks. */
function screenOf(width: number, height: number): typeof window.matchMedia {
  const matches = (q: string): boolean => {
    const m = /^\((width|height) (<|>=) (\d+)px\)$/.exec(q);
    if (!m) return false;
    const v = m[1] === 'width' ? width : height;
    return m[2] === '<' ? v < Number(m[3]) : v >= Number(m[3]);
  };
  return ((q: string) => ({ matches: matches(q), media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;
}

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

describe('messageRows', () => {
  it.each<[string, { tall: boolean; roomy: boolean; phone: boolean }, number]>([
    ['short laptop', { tall: false, roomy: false, phone: false }, 8],
    ['laptop', { tall: true, roomy: false, phone: false }, 14],
    ['large screen', { tall: true, roomy: true, phone: false }, 18],
    ['phone', { tall: true, roomy: false, phone: true }, 10],
    ['short phone', { tall: false, roomy: false, phone: true }, 8],
  ])('%s', (_n, room, rows) => {
    expect(messageRows(room)).toBe(rows);
  });
});

describe('New ticket Message box', () => {
  it.each<[string, number, number, number]>([
    ['1350 × 900 laptop', 1350, 900, 14],
    ['1920 × 1080 screen', 1920, 1080, 18],
    ['390 × 844 phone', 390, 844, 10],
    ['1280 × 700 short laptop', 1280, 700, 8],
  ])('%s: %i × %i gets %i rows', async (_n, width, height, rows) => {
    window.matchMedia = screenOf(width, height);
    await renderPage(page, { path: '/support?new=1' });
    const box = await screen.findByRole('textbox', { name: strings['new.message'] }, { timeout: 10000 });
    expect(box.tagName).toBe('TEXTAREA');
    expect(box.getAttribute('rows')).toBe(String(rows));
  });
});
