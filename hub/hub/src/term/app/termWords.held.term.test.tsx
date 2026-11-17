// Account, the leave question, GitHub runs in Apps, a held change and the provider key: eleven more sentences told a
// terminal user that a record is in "this browser" or that work runs "from this tab" / was sent "from another tab".
// In the terminal the record is on this device, the work runs from this Hub and the other sender is another Hub
// (termWords.json). Each key is named here so a web rewording is looked at again.
// Not here on purpose: the two Account sentences about a held payment (w.payHeld, w.payUnreadable) are a set of their
// own (money wording, two reads).
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TERM_WORDS, TERM_WORD_TABLES } from './termWords';

const SRC = path.resolve(import.meta.dir, '../..');
const KEYS: readonly (readonly [string, string])[] = [
  ['pages/account/strings.en.json', 'ag.saved'],
  ['pages/account/strings.en.json', 'w.running_one'],
  ['pages/account/strings.en.json', 'w.running_other'],
  ['pages/account/strings.en.json', 'e.sentOther'],
  ['pages/account/strings.en.json', 'e.replaced'],
  ['shell/strings.en.json', 'leave.title'],
  ['shell/strings.en.json', 'leave.body_one'],
  ['shell/strings.en.json', 'leave.body_other'],
  ['pages/apps/strings.en.json', 'gh.block.storage'],
  ['pages/apps/strings.en.json', 'gh.unreadableBody'],
  ['pages/apps/strings.en.json', 'gh.dismissStorage'],
  ['kit/strings.en.json', 'held.elsewhere'],
  ['kit/pickers/ProviderSetup.strings.en.json', 'key.notHeld'],
];
const WEB_PLACE = /\bbrowsers?\b|\b(another|other|this) (tab|window)\b/i;

test('the tables are ones the terminal app rewrites', () => {
  for (const name of ['pages/apps/strings.en.json', 'kit/strings.en.json', 'kit/pickers/ProviderSetup.strings.en.json', 'kit/agent/SessionView.strings.en.json', 'kit/agent/Approver.strings.en.json', 'kit/agent/states/AgentStates.strings.en.json']) {
    expect(Object.keys(TERM_WORD_TABLES)).toContain(name);
  }
});

test('each has a terminal wording with no browser, tab or window in it; the web sentence did name one', () => {
  for (const [name, key] of KEYS) {
    const web = (JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, string>)[key];
    const term = TERM_WORDS[name]?.[key];
    expect({ name, key, webNamesIt: typeof web === 'string' && WEB_PLACE.test(web) }).toEqual({ name, key, webNamesIt: true });
    expect({ name, key, term: typeof term === 'string' && !WEB_PLACE.test(term) }).toEqual({ name, key, term: true });
  }
});

test('work runs from this Hub, a record is on this device, the other sender is another Hub', () => {
  expect(TERM_WORDS['shell/strings.en.json']?.['leave.title']).toBe('Work is still running from this Hub');
  expect(TERM_WORDS['pages/account/strings.en.json']?.['ag.saved']).toBe('Saved for this device.');
  expect(TERM_WORDS['kit/strings.en.json']?.['held.elsewhere']).toBe('It was sent from another page of this Hub or another Hub, so only that one can stop tracking it.');
  expect(TERM_WORDS['pages/apps/strings.en.json']?.['gh.block.storage']).toBe("This device couldn't keep a record of the run, so nothing was sent. Try again.");
});

// What may have gone through is the web's, word for word: a variant changes where, never what happened.
test('the sentences about what stops and what may have gone through are the web\'s', () => {
  for (const [name, key] of KEYS) {
    const web = (JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, string>)[key]!;
    const term = TERM_WORDS[name]![key]!;
    // One action has another name in a terminal: the Account removal does not sign out there, it leaves the Hub
    // (termWords.leave.term.test.tsx), so "Signing out stops" is "Leaving the Hub stops" in those two sentences.
    const named = key.startsWith('w.running_') ? web.replace('Signing out stops', 'Leaving the Hub stops') : web;
    const kept = named.split(/(?<=\.)\s+/).filter((part) => !WEB_PLACE.test(part));
    for (const part of kept) expect({ key, part, kept: term.includes(part) }).toEqual({ key, part, kept: true });
  }
});
