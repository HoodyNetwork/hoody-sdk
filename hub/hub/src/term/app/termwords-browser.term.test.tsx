// Web words the terminal drew as they are: Files' preview foot ("Opens in a new tab. Your browser shows a download's
// progress."), the upload dialog ("…while the Hub is open in this tab"), Transfers' empty state ("Uploads from this
// browser…"), the link download's refusals and a notice reply's ("this browser couldn't keep…", "Another tab of this
// browser…"), and the inbox tip ("…and on the bell": the terminal has no bell, its sidebar counts unread notices).
// Each now has a terminal variant in termWords.json, in a table termWords.ts lists, and it names no part of a browser.
// termWords.term.test.tsx holds the general rules (the key exists, same placeholders, the app's tables take every
// variant); this file pins these keys, and one frame proves the app draws them: the Files preview's foot.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role } from '../prim/semantics';
import { TERM_WORDS, TERM_WORD_TABLES } from './termWords';

const BROWSER_WORDS = /\b(browsers?|tap|taps|tapping|click|clicks|clicking|bell)\b|new tab|this tab|another tab/i;

const KEYS: ReadonlyArray<readonly [table: string, key: string]> = [
  ['pages/files/strings.en.json', 'preview.note'],
  ['pages/files/Upload.strings.en.json', 'background'],
  ['pages/files/transfers/transfers.strings.en.json', 'empty.body'],
  ['pages/files/link/link.strings.en.json', 'result.notSent'],
  ['pages/files/link/link.strings.en.json', 'result.HELD'],
  ['pages/notifications/strings.en.json', 'an.notSent'],
  ['pages/notifications/strings.en.json', 'an.held.elsewhere'],
  ['shell/strings.en.json', 'hint.inbox'],
];

test('each of these keys has terminal words, in a listed table, with no browser word in them', () => {
  for (const [table, key] of KEYS) {
    const text = TERM_WORDS[table]?.[key];
    expect({ table, key, variant: typeof text === 'string', listed: typeof TERM_WORD_TABLES[table]?.[key] === 'string' }).toEqual({ table, key, variant: true, listed: true });
    expect({ table, key, browser: BROWSER_WORDS.test(text!) }).toEqual({ table, key, browser: false });
  }
});

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test("Files' preview foot says what Download does here, never a new tab or a browser", async () => {
  s = await renderPage({ page: 'files', path: '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp', cols: 140, rows: 100 });
  await s.settle();
  const r = s.renderer as unknown as { root: never; stdin: never };
  const press = async (role: Role, name: string | RegExp, i = 0) => {
    const found = queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), role, { name });
    expect(found.length).toBeGreaterThan(i);
    act(found[i]!, 'press');
    await s!.settle();
  };
  // package.json is the second row of /srv/app (after the public folder), as in pages/files/opened.term.test.tsx.
  await press('button', /Row actions/, 1);
  await press('menuitem' as Role, 'Preview…');
  const frame = s.frame;
  // The foot's reason column is about 35 cells in an 80-cell drawer: match words that stay on its first line.
  expect(frame).toContain('Download opens the file');
  expect(frame).not.toMatch(/new tab|this browser|your browser/i);
  // The app put the variant into the table the page reads.
  expect(TERM_WORD_TABLES['pages/files/strings.en.json']?.['preview.note']).toBe(TERM_WORDS['pages/files/strings.en.json']?.['preview.note']);
  expect(s.trapsAt).toEqual([]);
}, 180_000);
