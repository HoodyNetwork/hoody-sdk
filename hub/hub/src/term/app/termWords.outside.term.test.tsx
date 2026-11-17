// A terminal has no tabs. Where the web says "Open in a new tab", the terminal says "Open outside the Hub": one name
// for the action on every page, on the button and in each sentence that quotes it (termWords.json, applied by
// createTermApp). This reads every string table of the app as the terminal app has it (the file, with its termWords
// variants over it) and fails on any text that still says "new tab". It reads TERM_WORDS only and never applies it.
// Not read: the kit gallery (fixtures mode on the web only) and standalone/ (the one-file Hub, a web page).
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { TERM_WORDS, TERM_WORD_TABLES } from './termWords';

const SRC = path.resolve(import.meta.dir, '../..');
const NEW_TAB = /\bnew tabs?\b/i;
// Left as the web has them, each with its reason. A key that stops saying "new tab" must leave this list.
const LEFT = new Set([
  // drawn only when the Hub is shown inside another page; a terminal never is
  'kit/strings.en.json page.framed.open',
  'pages/billing/strings.en.json top.framedOpen',
  // a browser refusing to open a tab: nothing in a terminal blocks one
  'pages/apps/strings.en.json tab.blocked',
  // describes the exported HTML file, which is opened in a browser wherever it was made
  'pages/board/strings.en.json html.body',
  // read only by the web's VM screen (pages/vms/parts/Screen.tsx); a terminal draws Screen.term.tsx, which never
  // waits on a screen to load. It had a terminal wording that nothing drew.
  'pages/vms/strings.en.json screen.slow',
]);

const tables = (): string[] =>
  (readdirSync(SRC, { recursive: true }) as string[])
    .map((f) => f.split(path.sep).join('/'))
    .filter((f) => f.endsWith('strings.en.json') && !f.includes('gallery') && !f.startsWith('standalone/'))
    .sort();
const drawn = (name: string): Record<string, unknown> => ({
  ...(JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, unknown>),
  ...(TERM_WORDS[name] ?? {}),
});

test('the sweep reads the whole app (hundreds of tables, the kit Link among them)', () => {
  const all = tables();
  expect(all.length).toBeGreaterThan(100);
  expect(all).toContain('kit/controls/Link.strings.en.json');
  expect(all).toContain('pages/computers/strings.en.json');
});

test('as the terminal draws them, no string says "new tab"', () => {
  const hits: string[] = [];
  for (const name of tables()) {
    for (const [key, value] of Object.entries(drawn(name))) {
      if (typeof value === 'string' && NEW_TAB.test(value) && !LEFT.has(`${name} ${key}`)) hits.push(`${name} ${key}: ${value}`);
    }
  }
  expect(hits).toEqual([]);
});

test('every string left as it is still says "new tab" on the web and has no terminal wording', () => {
  for (const id of LEFT) {
    const [name, key] = id.split(' ') as [string, string];
    const web = (JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, string>)[key];
    expect({ id, says: typeof web === 'string' && NEW_TAB.test(web) }).toEqual({ id, says: true });
    expect({ id, variant: TERM_WORDS[name]?.[key] }).toEqual({ id, variant: undefined });
  }
});

test('the action has one name: on the buttons, in the link note and in the sentences that quote it', () => {
  for (const [name, key] of [
    ['pages/ai/strings.en.json', 'claude.termTab'],
    ['pages/computers/strings.en.json', 'desktop.open'],
    ['pages/apps/strings.en.json', 'launcher.openTab'],
    ['pages/apps/strings.en.json', 'gh.openTab'],
    ['kit/agent/LinkMark.strings.en.json', 'local.open'],
    ['pages/board/strings.en.json', 'tile.openNew'],
    ['pages/notes/strings.en.json', 'action.openNoteTab'],
    ['pages/home/widgets/strings.en.json', 'card.open'],
    ['pages/apps/launch/openWith/strings.en.json', 'ow.chooser.newTab'],
  ] as const) {
    expect(Object.keys(TERM_WORD_TABLES)).toContain(name);
    expect({ name, key, term: TERM_WORDS[name]?.[key] }).toEqual({ name, key, term: 'Open outside the Hub' });
  }
  expect(TERM_WORDS['kit/controls/Link.strings.en.json']?.['ext.newTab']).toBe('(opens outside the Hub)');
  expect(TERM_WORDS['pages/computers/strings.en.json']?.['use.newTab']).toBe('Outside the Hub');
  expect(TERM_WORDS['pages/ai/strings.en.json']?.['claude.typedLogin']).toContain('Open it with Open outside the Hub, then');
  expect(TERM_WORDS['pages/ai/strings.en.json']?.['claude.typedInstall']).toContain('Open outside the Hub shows it.');
});

// A variant changes where the thing opens, never what the sentence says about it.
test('the two sentences that also named a browser keep every other clause of the web sentence', () => {
  const vms = JSON.parse(readFileSync(path.join(SRC, 'pages/vms/strings.en.json'), 'utf8')) as Record<string, string>;
  expect(TERM_WORDS['pages/vms/strings.en.json']?.['faq.screen.a']).toBe(
    vms['faq.screen.a']!.replace('in a new tab', 'outside the Hub').replace('your browser', 'this device'),
  );
  expect(TERM_WORDS['pages/computers/strings.en.json']?.['desktop.slow.body']).toBe(
    'It may still be starting, or it cannot be shown inside the Hub. Open it outside the Hub to see what it says.',
  );
});
