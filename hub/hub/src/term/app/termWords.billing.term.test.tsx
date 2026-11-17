// Plans & Billing in the terminal names no browser, tab, window or site storage as where a payment's safety record
// lives or what must stay open. The checkout, the held bands and the reservations are shared with the web and say
// "This browser couldn't save the request", "don't close this window", "Keep this tab open", "another tab": in the
// terminal the record is in this device's Hub store and the other sender is another Hub, so the terminal app gives
// each such key its own wording (termWords.json). The amounts, the "never charged twice" promise and every
// {{placeholder}} are the web's (termWords.term.test.tsx pins the placeholders).
// Left as they are, with the reason:
//   top.framedOpen                  drawn only inside another page's frame, which a terminal cannot be
//   plans.more.ssh.browser, plans.more.ssh.cliBody, plans.more.infra.computersBody
//                                   describe the product (a terminal in a browser, computers that keep running), not
//                                   this Hub
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TERM_WORDS, TERM_WORD_TABLES } from './termWords';

const SRC = path.resolve(import.meta.dir, '../..');
const NAME = 'pages/billing/strings.en.json';
const LEFT = new Set(['top.framedOpen', 'plans.more.ssh.browser', 'plans.more.ssh.cliBody', 'plans.more.infra.computersBody']);
const WEB_PLACE = /\bbrowsers?\b|\breload(s|ed|ing)?\b|\b(another|other|this|the|a new|two) (tabs?|windows?)\b|\bthis site\b|\bprivate (window|browsing)\b/i;
const asDrawn = (): Record<string, unknown> => ({ ...(JSON.parse(readFileSync(path.join(SRC, NAME), 'utf8')) as Record<string, unknown>), ...(TERM_WORDS[NAME] ?? {}) });

test('the billing table is one the terminal app rewrites', () => {
  expect(Object.keys(TERM_WORD_TABLES)).toContain(NAME);
});

test('as the terminal draws it, no billing string names a browser, a tab, a window, a reload or site storage', () => {
  const offenders = Object.entries(asDrawn()).filter(([key, text]) => !LEFT.has(key) && typeof text === 'string' && WEB_PLACE.test(text)).map(([key]) => key);
  expect(offenders).toEqual([]);
});

test('the strings left as they are still exist (a renamed key must be looked at again)', () => {
  const table = asDrawn();
  for (const key of LEFT) expect({ key, has: typeof table[key] === 'string' }).toEqual({ key, has: true });
});

test('while a charge is sent the terminal says not to quit; a record that could not be saved names this device', () => {
  const t = TERM_WORDS[NAME] ?? {};
  expect(t['mkt.posting']).toBe("Charging your wallet — don't quit the Hub.");
  expect(t['buy.storeErr']).toContain("this device couldn't save the request, which is what keeps it from ever being charged twice");
  expect(t['top.notSaved']).toContain('Keep this Hub open until you have checked.');
  expect(t['buy.adopted']).toContain('another Hub already sent a request for this');
});

// The money promises are the web's, word for word: a variant changes where the record lives, never what is charged.
test('each variant keeps the web sentence about charging', () => {
  const web = JSON.parse(readFileSync(path.join(SRC, NAME), 'utf8')) as Record<string, string>;
  const money = /[^.:]*\b(charged?|charges?|sent)\b[^.:]*/gi;
  const kept = (s: string) => (s.match(money) ?? []).map((x) => x.trim()).filter((x) => !WEB_PLACE.test(x));
  for (const [key, text] of Object.entries(TERM_WORDS[NAME] ?? {})) {
    for (const part of kept(web[key]!)) expect({ key, part, kept: text.includes(part) }).toEqual({ key, part, kept: true });
  }
});
