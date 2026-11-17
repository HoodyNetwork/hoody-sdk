// In the terminal the Vault subtitle ends on a line of more than one word in the two terminal sizes the goldens record:
// a lone last word ("only.") under a full line reads as a leftover. The terminal has its own, shorter line (termWords).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { TERM_WORDS } from '../../term/app/termWords';
import web from './strings.en.json';

const subtitle = TERM_WORDS['pages/vault/strings.en.json']?.subtitle ?? web.subtitle;

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const lastLine = (frame: string): string => {
  const end = subtitle.split(' ').at(-1)!;
  // Drop the sidebar (everything up to the first │) when there is one; the page area has no border of its own.
  const lines = frame.split('\n').map((l) => l.replace(/^[^│]*│/, '').trim());
  // The subtitle's last line: the line ending with its last word whose own text is a tail of the subtitle.
  const hit = lines.find((l) => l.endsWith(end) && subtitle.endsWith(l));
  expect(hit, `no line ends the subtitle ("${end}")`).toBeDefined();
  return hit!;
};

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`vault ${cols}x${rows}: the subtitle's last line holds more than one word`, async () => {
    s = await renderPage({ page: 'vault', cols, rows });
    const frame = await s.settle();
    expect(lastLine(frame).split(' ').length).toBeGreaterThan(1);
  }, 240_000);
}
