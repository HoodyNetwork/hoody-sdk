import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Plain words in panel text: these strings name no internal part ("egress program",
// "upstream", "drawer", "Exec", "the agent's answer") and use no tracking jargon ("held", "settled", "proved",
// "read newer", "moved"). Where a panel says "realm" first, it explains the word. The
// files are read from disk: a pages-root test may not import other pages (hub/page-boundaries).
const PAGES = __dirname;
const read = (f: string): Record<string, string> => JSON.parse(readFileSync(join(PAGES, f), 'utf8')) as Record<string, string>;

const REALM = 'A realm is a separate space with its own computers, keys and settings. Pick it from the realm menu at the top.';
const JARGON = /egress program|upstream|drawer|\bExec\b|agent[’']s answer|\bheld\b|settled|proved|read newer|\bmoved\b/i;

const PLAIN: Record<string, string[]> = {
  'computers/parts/ConnectProxy.strings.en.json': ['proxy.what', 'proxy.limits', 'proxy.exit.up.body', 'proxy.check'],
  'computers/parts/ExitIp.strings.en.json': ['exit.local', 'exit.unavailable'],
  'computers/parts/AccessDrawer.strings.en.json': ['acc.adv.lede', 'acc.change.watching', 'acc.now.advanced', 'acc.p.removeKeyOpen', 'acc.p.heldWait'],
  'computers/parts/Firewall.strings.en.json': ['fw.left.notFirst'],
  'ai/knowledge/memory/Memory.strings.en.json': ['d.missing', 'edit.held'],
  'ai/knowledge/skills/strings.en.json': ['hub.badPreview', 'imp.badScan', 'imp.noResult'],
  'account/strings.en.json': ['check.nothing'],
  'keys/strings.en.json': ['pd.body', 'op.notSettledOf'],
  'vault/strings.en.json': ['edit.freedElsewhere'],
  'apps/launch/openWith/strings.en.json': ['w.notDurable', 'ow.chooser.kept'],
  'scripts/strings.en.json': ['ai.err.ceiling', 'ai.err.joined'],
  'ai/folders/strings.en.json': ['account.where.global', 'account.where.pinned'],
  'support/strings.en.json': ['send.known', 'send.checkLine', 'send.stopLine', 'send.held', 'close.unknown', 'close.checkLine', 'thread.cleaned'],
};
const rows = Object.entries(PLAIN).flatMap(([f, keys]) => keys.map((k): [string, string, string] => [f, k, read(f)[k] ?? '']));

describe('panel text names no internal part', () => {
  it.each(rows)('%s %s', (_f, _k, text) => {
    expect(text).not.toBe('');
    expect(text).not.toMatch(JARGON);
  });
});

describe('realm is explained where a panel first says it', () => {
  it('the computer realms panel and the AI default model both carry the gloss', () => {
    expect(read('computers/strings.en.json')['realmsd.lede']).toContain(REALM);
    expect(read('ai/strings.en.json')['def.chooseRealmBody']).toContain(REALM);
  });
});

// On a phone with a computer picked, the top bar shows the realm only as its square (by
// design), so text that sends someone to a realm names the realm menu at the top, and where it stops
// them (a body, band or lede) also the square. Short notes and statements name the menu only, and so does a
// region the square would take over the 150-character anatomy budget (def.chooseRealmBody and realmsd.lede, which
// share the realm gloss, and the connections All realms body). ask/ and the kit gallery
// are read by path, as the pages are.
const MENU = 'realm menu at the top';
const SQUARE = '(on a phone, tap the realm square)';
const TOP: [string, string, 'square' | 'menu'][] = [
  ['ai/strings.en.json', 'rules.checked.allRealms.body', 'square'],
  ['ai/strings.en.json', 'rules.checked.allRealms.bodyPick', 'square'],
  ['ai/strings.en.json', 'def.chooseRealmBody', 'menu'],
  ['computers/strings.en.json', 'realmsd.lede', 'menu'],
  ['ai/parts/Pane.strings.en.json', 'gear.stopAllPickRealm', 'menu'],
  ['ai/knowledge/skills/strings.en.json', 'allRealms.body', 'square'],
  ['ai/knowledge/instructions/strings.en.json', 'allRealms.body', 'square'],
  ['ai/knowledge/memory/Memory.strings.en.json', 'allRealms.body', 'square'],
  ['ai/settings/connections/Mcp.strings.en.json', 'allRealms', 'square'],
  ['ai/settings/connections/strings.en.json', 'allRealms.body', 'menu'],
  ['ai/settings/rules/strings.en.json', 'where.allRealms.body', 'square'],
  ['ai/agents/Tools.strings.en.json', 'noRealm', 'square'],
  ['ai/models/claude/Transfer.strings.en.json', 'noRealm', 'square'],
  ['ai/new/NewChat.strings.en.json', 'band.pickRealm', 'square'],
  ['keys/strings.en.json', 'share.allEmpty.body', 'square'],
  ['guide/strings.en.json', 'recipe.3.body', 'square'],
  ['guide/strings.en.json', 'realms.lede', 'square'],
  ['bots/strings.en.json', 'newBot.realmGlobal', 'menu'],
  ['vault/strings.en.json', 'partition.pickHint', 'square'],
  ['vault/strings.en.json', 'partition.pickOther', 'square'],
  ['vault/strings.en.json', 'faq.scope.a', 'square'],
  ['../ask/strings.en.json', 'ask.tRealmNote', 'menu'],
  ['../ask/strings.en.json', 'ask.pickRealmTop', 'square'],
  ['../ask/strings.en.json', 'ask.pinned', 'square'],
  ['../kit/gallery/overlays.strings.en.json', 'popover.body', 'menu'],
];

describe('text that sends someone to a realm names the realm menu, not "the top bar"', () => {
  it.each(TOP)('%s %s', (f, k, kind) => {
    const text = read(f)[k] ?? '';
    expect(text).not.toBe('');
    expect(text).not.toContain('top bar');
    expect(text).toContain(MENU);
    if (kind === 'square') expect(text).toContain(SQUARE);
    else expect(text).not.toContain(SQUARE);
  });

  it('a statement about the picked realm says "at the top", not "the top bar"', () => {
    expect(read('../ask/strings.en.json')['ask.realmNeeded']).toBe('This computer is not in the realm picked at the top.');
    // The GitHub accounts place group's reason no longer names the realm picked (Global is offered under
    // any realm); only shared access keeps it off. Its region has little anatomy budget left: keep it short.
    expect(read('ai/settings/connections/strings.en.json')['place.globalOff']).toBe('Shared access does not reach Global.');
  });

  // The button goes to Connections on All realms and Global, so the words
  // name Connections, Global and All realms and ask only for the computer; a recovery that names none of them is false copy.
  it.each([['Connections'], ['Global'], ['All realms'], ['{{computer}} there first']])('a Global folder\'s account failure words name %s (account.where.global)', (word) => {
    expect(read('ai/folders/strings.en.json')['account.where.global']).toContain(word);
  });
  // The words are the band under the failure, counted with it (150 characters),
  // so they no longer repeat the folder's computer and place: the failure above them is about this folder.
  it('a Global folder\'s account failure words are exactly the recovery the button gives (account.where.global)', () => {
    expect(read('ai/folders/strings.en.json')['account.where.global']).toBe(
      'Connections acts for the computer chosen in the top bar: choose {{computer}} there first. It opens on All realms and Global.',
    );
  });

  it('per-realm rules settings under All realms say where the Hub can change them (the top bar has no Global)', () => {
    expect(read('ai/settings/rules/strings.en.json').perRealmAll).toBe('Each realm has its own setting. The Hub can change this only in the Global realm for now.');
  });

  it('no page string sends someone to a realm "in the top bar"', () => {
    const files = (readdirSync(PAGES, { recursive: true }) as string[]).filter((f) => f.endsWith('strings.en.json'));
    const hits = files.flatMap((f) =>
      Object.entries(read(f))
        .filter(([, v]) => typeof v === 'string' && /\b(realms?|Global)\b[^.:]{0,30}\bin the top bar\b/i.test(v))
        .map(([k]) => `${f} ${k}`),
    );
    expect(hits).toEqual([]);
  });
});

// No written price, percentage or quota number in the Referrals
// words. Shares, thresholds and codes left come from the API through {{…}}. The one listed exception is the fixed
// code-shape rule "4–20" in check.invalid: it is set aside for the quota-number checks only, so a price, a
// percentage or a size written into that key (or around the literal) is still caught. The
// docs' code limits (3 active, 10 over the life of the account) and windows (12 months, 3 calendar
// months, 60 days, 7 days) are written as words; each is pinned against the docs in referrals/codes-levels.test.tsx.
// None of them is a number before or after codes, tickets or messages, so the checks below still run unchanged.
describe('referrals words write no prices, percentages or quota numbers', () => {
  const G4_LISTED: Record<string, string> = { 'check.invalid': '4–20' };
  const words = Object.entries(read('referrals/strings.en.json')).map(([k, v]): [string, string] => [k, v.replace(/\{\{[^}]*\}\}/g, ' ')]);
  const unlisted = (k: string, v: string) => (k in G4_LISTED ? v.replace(G4_LISTED[k] as string, ' ') : v);
  const NOUN = '(?:codes?|tickets?|messages?)';
  const G4_CHECKS = [
    ['a price', /\$\s?\d/, false],
    ['a percentage', /\d+\s?%/, false],
    ['a size', /\d+ ?(cores?|GB|TB)/i, false],
    ['a number before codes, tickets or messages', new RegExp(`\\d\\s*(?:[a-z-]+\\s+){0,2}${NOUN}`, 'i'), true],
    ['a number after codes, tickets or messages', new RegExp(`${NOUN}\\W*\\d`, 'i'), true],
  ] as const;
  const g4Hits = (entries: [string, string][], rx: RegExp, listed: boolean) =>
    entries.filter(([k, v]) => rx.test(listed ? unlisted(k, v) : v)).map(([k]) => k);
  it.each(G4_CHECKS)('no string writes %s', (_what, rx, listed) => {
    expect(g4Hits(words, rx, listed)).toEqual([]);
  });
  // Planted strings: each must be caught by at least one check, so a widened exception or a lost boundary goes red.
  it.each([
    ['codes.x', 'codes10'], ['codes.x', 'tickets10'], ['codes.x', 'messages10'], ['codes.x', 'codes: 10'],
    ['codes.x', '10codes'], ['codes.x', '10 tickets'], ['codes.x', '10 messages'], ['codes.x', '10 GBs'],
    ['codes.x', '10GB'], ['codes.x', 'codes    10'], ['check.invalid', 'Use $4–20 letters.'], ['check.invalid', 'Use 4–20% letters.'],
    ['check.invalid', 'Use 4–20 letters, 10 codes.'],
  ])('a planted %s "%s" is caught', (k, v) => {
    expect(G4_CHECKS.some(([, rx, listed]) => g4Hits([[k, v]], rx, listed).length > 0)).toBe(true);
  });
  it('the listed code-shape rule is still in check.invalid, so its exception sets aside only that', () => {
    expect(read('referrals/strings.en.json')['check.invalid']).toContain(G4_LISTED['check.invalid']);
  });
  it('the custom-code limits are the docs\' numbers, the count left the API\'s', () => {
    const w = read('referrals/strings.en.json');
    expect(w['codes.counter_other']).toBe('{{active}} · {{count}} more can be made now');
    expect(w['codes.active_other']).toBe('{{count}} of 3 active');
    expect(w['release.counts']).toMatch(/your limit of 10 over the life of your account\.$/);
  });
});
