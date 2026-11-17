// Account, "Forget this browser": two sentences refuse to remove local data while a payment made here has no final
// answer, or while the saved payments cannot be read. On the web they say the payment was made "in this browser" and
// saved "in this browser". A terminal has no browser: the record is on this device (termWords.json).
// Money wording: the terminal sentence is the web's sentence with those three words replaced and nothing else, so
// a web rewording of either one fails here and is looked at again.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TERM_WORDS } from './termWords';

const NAME = 'pages/account/strings.en.json';
const web = JSON.parse(readFileSync(path.resolve(import.meta.dir, '../..', NAME), 'utf8')) as Record<string, string>;

test('a held payment and unreadable saved payments are on this device, and the rest of each sentence is the web\'s', () => {
  for (const key of ['w.payHeld', 'w.payUnreadable']) {
    const w = web[key]!;
    expect({ key, webNamesTheBrowser: w.split('in this browser').length === 2 }).toEqual({ key, webNamesTheBrowser: true });
    expect({ key, term: TERM_WORDS[NAME]?.[key] }).toEqual({ key, term: w.replace('in this browser', 'on this device') });
  }
});

test('the two sentences as a terminal reads them', () => {
  expect(TERM_WORDS[NAME]?.['w.payHeld']).toBe('A payment made on this device has no final answer yet. Check it in Billing first; local data can be removed once it is settled.');
  expect(TERM_WORDS[NAME]?.['w.payUnreadable']).toBe('The payments saved on this device could not be read, so nothing can be removed. Check Billing, then try again.');
});
