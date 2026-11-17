// The account shots that open on the sessions section wait for words the sessions section draws. The page gate checks a
// shot's waitForText in the frame at 120x40 (scripts/term/wait-text.ts); a ?section= link opens at its section, so words
// from another section (the profile's support note) are scrolled away and the shot never comes.
import { afterEach, expect, test } from 'bun:test';
import { casesOf } from '../../../scripts/term/goldens';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { WAIT_SIZE, awaitText, frameShows } from '../../../scripts/term/wait-text';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const name of ['shot-sessions-active', 'shot-sessions-search']) {
  test(`${name} draws its wait text at ${WAIT_SIZE.join('x')}`, async () => {
    const c = (await casesOf('account')).find((x) => x.name === name)!;
    expect(c.waitForText).toBeDefined();
    const [cols, rows] = WAIT_SIZE;
    s = await renderPage({ page: 'account', fx: c.fx, ...(c.path ? { path: c.path } : {}), cols, rows });
    const p = s;
    expect(await awaitText(p, () => frameShows(p.frame, c.waitForText!))).toBe(true);
  }, 120_000);
}
