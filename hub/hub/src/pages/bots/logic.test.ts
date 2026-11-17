// Vitest: the bots page's pure rules.
import { describe, expect, it } from 'vitest';
import { chatAppsOf, rowOf } from './data';
import {
  botIdFromName,
  botKey,
  expiryFromDate,
  keyStateOf,
  labelProblem,
  limitProblem,
  maskId,
  nameProblem,
  parseBotKey,
  plainLine,
  previewUrl,
  primaryOf,
  scrubSecrets,
  snippets,
  SNIPPET_LANG,
  SNIPPET_KINDS,
  statusOf,
  suggestName,
  zoneOfLinks,
  zoneOfUrl,
  dialogOwnOutcome,
  withOlder,
  gateStateOf,
  decisionWasOurs,
  heldAfter,
} from './logic';

const view = { gate: null, turnRunning: false, pausedAtLimit: false, queued: 0 };

describe('status', () => {
  it('ranks waiting for you over paused over working over queued over idle', () => {
    const gate = { id: 'g', generation: 1, type: 'confirm', summary: '', tool: null, advanced: null } as const;
    expect(statusOf({ ...view, gate, turnRunning: true, pausedAtLimit: true })).toBe('waiting');
    expect(statusOf({ ...view, turnRunning: true, pausedAtLimit: true })).toBe('paused');
    expect(statusOf({ ...view, turnRunning: true })).toBe('working');
    expect(statusOf({ ...view, queued: 2 })).toBe('queued');
    expect(statusOf(view)).toBe('idle');
  });

  it('offers one primary action: approve or answer, then fix, then the link', () => {
    const confirm = { gate: { id: 'g', generation: 1, type: 'confirm', summary: '', tool: null, advanced: null } } as const;
    const question = { gate: { ...confirm.gate, type: 'question' } } as const;
    expect(primaryOf(confirm, true, true)).toBe('approve');
    expect(primaryOf(question, false, true)).toBe('answer');
    expect(primaryOf({ gate: null }, true, true)).toBe('fix');
    expect(primaryOf({ gate: null }, false, true)).toBe('link');
    expect(primaryOf({ gate: null }, false, false)).toBeNull();
  });
});

describe('identity', () => {
  it('round-trips a row key and refuses malformed ones', () => {
    expect(parseBotKey(botKey('c1', 'r1', 'atlas'))).toEqual({ computerId: 'c1', realm: 'r1', id: 'atlas' });
    expect(parseBotKey('c1~r1')).toBeNull();
    expect(parseBotKey('c1~~atlas')).toBeNull();
    expect(parseBotKey(undefined)).toBeNull();
  });

  it('masks long ids to their first and last four characters', () => {
    expect(maskId('a1b2c3d4e5f60718293a4b5c')).toBe('a1b2…4b5c');
    expect(maskId('short')).toBe('short');
  });
});

describe('names', () => {
  it('suggests adjective-color-animal from the random source', () => {
    expect(suggestName(() => 0)).toBe('quiet-amber-otter');
    expect(suggestName(() => 0.999)).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/);
  });

  it('turns a name into the identifier the agent accepts', () => {
    expect(botIdFromName('  My Cool Bot! ')).toBe('my-cool-bot');
    expect(nameProblem('', [])).toBe('empty');
    expect(nameProblem('!!!', [])).toBe('bad_id');
    expect(nameProblem('Atlas', ['atlas'])).toBe('taken');
    expect(nameProblem('Atlas', [])).toBeNull();
  });
});

describe('link label', () => {
  it('follows the public label rule', () => {
    expect(labelProblem('')).toBe('empty');
    expect(labelProblem('Upper-case-name')).toBe('bad_char');
    expect(labelProblem('short')).toBe('too_short');
    expect(labelProblem('a'.repeat(49))).toBe('too_long');
    expect(labelProblem('1abcdefgh')).toBe('bad_start');
    expect(labelProblem('abcdefgh-')).toBe('bad_end');
    expect(labelProblem('abcd--efgh')).toBe('double_hyphen');
    expect(labelProblem('atlas-blog-bot')).toBeNull();
  });

  it('previews the address, using the suggestion when the field is empty', () => {
    expect(previewUrl('', 'hoody.bot', 'quiet-amber-heron-bot')).toBe('https://quiet-amber-heron-bot.hoody.bot');
    expect(previewUrl('mine-mine-mine', 'hoody.bot', 'x')).toBe('https://mine-mine-mine.hoody.bot');
    expect(previewUrl('mine-mine-mine', '', 'x')).toBe('');
  });

  it('reads the zone only from an address that matches its label', () => {
    expect(zoneOfUrl('https://atlas-blog-bot.hoody.bot', 'atlas-blog-bot')).toBe('hoody.bot');
    expect(zoneOfUrl('https://evil.test/atlas-blog-bot.hoody.bot', 'atlas-blog-bot')).toBe('');
    expect(zoneOfUrl('https://other-label-bot.hoody.bot', 'atlas-blog-bot')).toBe('');
  });

  it('takes the zone from the first link whose address shows one', () => {
    const links = [null, { url: '', label: 'x' }, { url: 'https://evil.test/a', label: 'a' }, { url: 'https://other-bot.other.zone', label: 'other-bot' }, { url: 'https://atlas-blog-bot.hoody.bot', label: 'atlas-blog-bot' }];
    expect(zoneOfLinks(links)).toBe('other.zone');
    expect(zoneOfLinks([])).toBe('');
    expect(zoneOfLinks([null, { url: '', label: '' }])).toBe('');
  });
});

describe('keys and limits', () => {
  it('judges a key expired before paused before active', () => {
    const now = Date.UTC(2026, 9, 23);
    expect(keyStateOf({ enabled: true, expiresAt: new Date(now - 1).toISOString() }, now)).toBe('expired');
    expect(keyStateOf({ enabled: false, expiresAt: null }, now)).toBe('paused');
    expect(keyStateOf({ enabled: true, expiresAt: null }, now)).toBe('active');
  });

  it('turns an expiry date into the end of that UTC day', () => {
    expect(expiryFromDate('2026-12-31')).toBe('2026-12-31T23:59:59.999Z');
    expect(expiryFromDate('')).toBeNull();
    expect(expiryFromDate('2026-02-30')).toBeUndefined();
    expect(expiryFromDate('tomorrow')).toBeUndefined();
  });

  it('checks each limit against its range', () => {
    expect(limitProblem('key_rpm', '60')).toBeNull();
    expect(limitProblem('key_rpm', '0')).toBe('range');
    expect(limitProblem('key_concurrency', '17')).toBe('range');
    expect(limitProblem('bot_rpm', '')).toBe('empty');
    expect(limitProblem('bot_rpm', '1.5')).toBe('range');
  });
});

describe('untrusted text', () => {
  it('makes agent text one plain line, bounded', () => {
    expect(plainLine('a\u0000b\n\nc\u202ed')).toBe('a b c d');
    expect(plainLine('x'.repeat(200), 20)).toHaveLength(20);
    expect(plainLine(undefined)).toBe('');
  });

  it('hides anything that looks like a token', () => {
    expect(scrubSecrets('use sk-abcdefghijklmnop now')).toBe('use [hidden] now');
    expect(scrubSecrets('123456789:FAKEtokenFAKEtoken_FAKEtokenFAKE000')).toBe('[hidden]');
    expect(scrubSecrets('nothing secret')).toBe('nothing secret');
    // A key whose tail is a token of another family (-ak-) is hidden whole, its start with it.
    expect(scrubSecrets(['use sk-12345678-ak-', 'Ab12Cd34Ef56Gh78Ij90 now'].join(''))).toBe('use [hidden] now');
  });
});

describe('connect examples', () => {
  it('never embeds a key and always reads it from the environment', () => {
    const ex = snippets('https://atlas-blog-bot.hoody.bot/', 'atlas-blog-bot');
    for (const text of Object.values(ex)) expect(text).toContain('HOODY_BOT_KEY');
    expect(ex.curl).toContain('https://atlas-blog-bot.hoody.bot/v1/chat/completions');
    expect(ex.mcp).toContain('/mcp');
  });
  it('each example is coloured as what it is; the JSON one really parses as JSON', () => {
    expect(SNIPPET_LANG).toEqual({ curl: 'shell', openai: 'python', anthropic: 'python', mcp: 'json' });
    expect(Object.keys(SNIPPET_LANG).sort()).toEqual([...SNIPPET_KINDS].sort());
    const ex = snippets('https://atlas-blog-bot.hoody.bot/', 'atlas-blog-bot');
    expect(() => JSON.parse(ex.mcp)).not.toThrow();
    for (const k of ['openai', 'anthropic'] as const) expect(ex[k]).toMatch(/^import /);
  });
});


describe('dialogOwnOutcome', () => {
  it('shows a failed or pending outcome only in the dialog that sent it', () => {
    expect(dialogOwnOutcome('pending', 'delete', 'delete')).toEqual({ kind: 'pending' });
    expect(dialogOwnOutcome('pending', 'delete', 'reset')).toBeUndefined();
    expect(dialogOwnOutcome('failed', 'purge', 'forget')).toBeUndefined();
    expect(dialogOwnOutcome('done', 'purge', 'purge')).toBeUndefined();
    expect(dialogOwnOutcome('failed', null, 'purge')).toBeUndefined();
  });
});

describe('withOlder', () => {
  const page = { rows: [{ seq: 5 }, { seq: 6 }], hasOlder: true, live: 'up_to_date' };
  it('places older rows first, once each, and takes their hasOlder', () => {
    const r = withOlder(page, { rows: [{ seq: 3 }, { seq: 4 }, { seq: 5 }], hasOlder: false });
    expect(r.rows.map((x) => x.seq)).toEqual([3, 4, 5, 6]);
    expect(r.hasOlder).toBe(false);
  });
  it('is the page itself while nothing older was loaded', () => {
    expect(withOlder(page, null)).toBe(page);
  });
});

describe('gateStateOf', () => {
  it('reads a 409 gate_decision_pending as pending, never failed', () => {
    expect(gateStateOf('failed', 'gate_decision_pending', true)).toBe('pending');
  });
  it('reads gate_already_resolved, answered and cancelled as decided elsewhere, never failed', () => {
    for (const c of ['gate_already_resolved', 'gate_already_answered', 'gate_cancelled']) expect(gateStateOf('failed', c, true)).toBe('elsewhere');
    expect(gateStateOf('failed', 'something_else', true)).toBe('failed');
  });
  it('a used decision belongs to its own gate: the next gate is idle', () => {
    expect(gateStateOf('done', undefined, true)).toBe('decided');
    expect(gateStateOf('done', undefined, false)).toBe('idle');
    expect(gateStateOf('failed', 'x', false)).toBe('idle');
  });
  it('a lock held for an unknown answer shows on every gate', () => {
    expect(gateStateOf('pending', undefined, false)).toBe('pending');
  });
});

describe('decisionWasOurs', () => {
  it('is true only when the deciding request is the one this card sent', () => {
    expect(decisionWasOurs({ request_id: 'k1', decision: 'approved' }, 'k1')).toBe(true);
    expect(decisionWasOurs({ request_id: 'k2' }, 'k1')).toBe(false);
    expect(decisionWasOurs(undefined, 'k1')).toBe(false);
    expect(decisionWasOurs({ request_id: '' }, '')).toBe(false);
  });
});

describe('heldAfter', () => {
  it('holds the action whose answer is unknown, and releases only on done', () => {
    expect(heldAfter(null, 'purge', 'pending')).toBe('purge');
    expect(heldAfter('purge', 'purge', 'not_sent')).toBe('purge');
    expect(heldAfter('purge', 'purge', 'failed')).toBe('purge');
    expect(heldAfter('purge', 'purge', 'done')).toBeNull();
    expect(heldAfter(null, 'reset', 'failed')).toBeNull();
  });
});

describe('chatAppsOf', () => {
  it('lists each known chat app once, in a fixed order, from the channels a Bot carries', () => {
    expect(chatAppsOf({ channels: [{ kind: 'slack' }, { kind: 'telegram' }, { kind: 'slack' }] })).toEqual(['telegram', 'slack']);
    expect(chatAppsOf({ channels: [{ kind: 'discord' }] })).toEqual(['discord']);
  });

  it('names nothing for no channels, unknown kinds or malformed rows', () => {
    expect(chatAppsOf({})).toEqual([]);
    expect(chatAppsOf(undefined)).toEqual([]);
    expect(chatAppsOf({ channels: 'telegram' })).toEqual([]);
    expect(chatAppsOf({ channels: [{ kind: 'matrix' }, { kind: 7 }, null, 'slack'] })).toEqual([]);
  });

  it('reaches the list row from the raw list answer', () => {
    const row = rowOf({ id: 'chief', uid: 'u1', name: 'Chief', channels: [{ id: 'ch_01234567', kind: 'discord' }, { id: 'ch_89abcdef', kind: 'telegram' }] }, 'c1');
    expect(row.chatApps).toEqual(['telegram', 'discord']);
    expect(rowOf({ id: 'bare', uid: 'u2', name: 'Bare' }, 'c1').chatApps).toEqual([]);
  });
});
