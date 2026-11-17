// Web words the terminal drew as they are on the Computers page and its tabs: the current-computer question ("This
// browser keeps the choice"), the access check ("Reload the page"), the colour tip ("Click to change"), the desktop
// list ("the ones this tab knows"), the earlier create ("This browser still keeps..."), the zip backup ("to your
// browser", "Your browser shows the progress"), the access drawer ("While this tab is open"), the firewall and upload
// holds ("another tab"). Each now has a terminal variant in termWords.json, in a table termWords.ts lists, and it names
// no part of a browser. termWords.term.test.tsx holds the general rules (the key exists, same placeholders, the app's
// tables take every variant); this file pins these keys, so a table dropped from TERM_WORD_TABLES fails here.
import { expect, test } from 'bun:test';
import { TERM_WORDS, TERM_WORD_TABLES } from './termWords';

const BROWSER_WORDS = /\b(browsers?|tap|taps|tapping|click|clicks|clicking)\b|new tab|this tab|another tab|reload the page/i;
// The terminal Hub keeps nothing between runs and shares nothing between processes (term/env/session.ts): no text may
// claim a choice outlives the run, or that another Hub process holds something.
const CROSS_RUN_WORDS = /\bthis device\b|another Hub|earlier visit/i;

const KEYS: ReadonlyArray<readonly [table: string, key: string]> = [
  ['pages/computers/strings.en.json', 'current.ask.body'],
  ['pages/computers/strings.en.json', 'access.unchecked.body'],
  ['pages/computers/strings.en.json', 'colour.tip'],
  ['pages/computers/strings.en.json', 'desktop.listDown'],
  ['pages/computers/strings.en.json', 'zero.unknown.oldBody'],
  ['pages/computers/snapshots/strings.en.json', 'zip.lede'],
  ['pages/computers/snapshots/strings.en.json', 'zip.started'],
  ['pages/computers/parts/AccessDrawer.strings.en.json', 'acc.change.watching'],
  ['pages/computers/parts/Firewall.strings.en.json', 'fw.held.elsewhere'],
  ['pages/files/Upload.strings.en.json', 'held.elsewhere'],
];

test('each of these keys has terminal words, in a listed table, with no browser or cross-run word in them', () => {
  for (const [table, key] of KEYS) {
    const text = TERM_WORDS[table]?.[key];
    expect({ table, key, variant: typeof text === 'string', listed: typeof TERM_WORD_TABLES[table]?.[key] === 'string' }).toEqual({ table, key, variant: true, listed: true });
    expect({ table, key, browser: BROWSER_WORDS.test(text!) }).toEqual({ table, key, browser: false });
    expect({ table, key, crossRun: CROSS_RUN_WORDS.test(text!) }).toEqual({ table, key, crossRun: false });
  }
});
