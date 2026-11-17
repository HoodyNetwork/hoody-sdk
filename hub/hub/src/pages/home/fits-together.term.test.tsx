// The Welcome and "How Hoody fits together" in a terminal. The Welcome (?intro=1) is the value line, Open and the tour
// as a hand-off line: the tour is an animated web page, so the terminal draws ⇗, why, the keys and the address in
// place of "Take the tour", and never routes into it. "How Hoody fits together" is no longer part of the Welcome.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const flat = (frame: string) => frame.split('\n').map((l) => l.replace(/[│█▀▄ ]+$/u, '').replace(/^[^│]*│\s*/u, '').trim()).join(' ').replace(/\s+/g, ' ');

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: the Welcome hands the tour to the web`, async () => {
    s = await renderPage({ page: 'home', fx: 'newAccount', path: '/home?intro=1', cols, rows, openExternal: () => {} });
    const frame = await s.settle();
    const f = flat(frame);
    // The lead shares its rows with [× Hide]: its first words are enough.
    expect(f).toContain(strings['intro.lead'].split(',')[0]!);
    expect(f).toContain(`⇗ ${strings['intro.tourReason']}`);
    for (const key of ['[o Open]', '[c Copy link]', '[r QR code]']) expect(f).toContain(key);
    expect(f.replace(/\s+/g, '')).toContain('#/onboarding');
    expect(f).not.toContain(strings['intro.tour']);
    expect(f).not.toMatch(/1\. Realms/);
    expect(s.failures).toEqual([]);
  }, 120_000);
}

