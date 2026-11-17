// Scripts when the only running computer did not answer (live: every read failed): the page said "No computer selected ·
// Pick a computer in the top bar" while a computer was selected. It says the computer didn't answer, with Try again.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: a computer that did not answer is not "No computer selected"`, async () => {
    s = await renderPage({ page: 'scripts', fx: 'noAnswer', cols, rows });
    const frame = await s.settle();
    expect(frame).toContain("atlas didn't answer");
    expect(frame).toContain('Try again');
    expect(frame).not.toContain('No computer selected');
    expect(s.failures).toEqual([]);
  }, 180_000);
}
