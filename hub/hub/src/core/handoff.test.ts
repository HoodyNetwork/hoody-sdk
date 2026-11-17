// core/handoff: the trip record to the AI page and back. It round-trips through the
// tab's session storage under the raw target computer id; it never stores a secret (every write and read rebuilds it
// from an allowlist); it lives 30 minutes; the AI page takes it only for this account, realm and shown computer.
import { afterEach, describe, expect, it } from 'vitest';
import { setIdentity } from './ctx';
import { HANDOFF_KEY, HANDOFF_TTL_MS, handoffAtOrigin, handoffReturnHref, newHandoffId, parseHandoff, readHandoff, receiveHandoff, removeHandoff, setHandoffResult, writeHandoff, type Handoff } from './handoff';
import { partitioned } from './kit-io';
import { registryEntry } from './registry';
import { boot, R1, R2, UID } from './test/env';

const NOW = 1_800_000_000_000;
const ID = '0123456789abcdef';
const C = 'c1';

function trip(over: Partial<Handoff> = {}): Handoff {
  return {
    v: 1,
    id: ID,
    at: NOW,
    scope: { account: UID, realm: R1, computer: 'p1|c1', gen: 3, boot: 'b-1' },
    origin: { page: 'bots', href: '/bots?drawer=new&initial=c1', label: 'New Bot', focus: 'model' },
    target: { computer: C, name: 'atlas' },
    dest: 'endpoint',
    draft: { kind: 'newBot', name: 'Night watch', instructions: 'Watch the logs.', link: true, computer: C, model: { spec: 'hoody-ai/hoody-free', consent: false } },
    ...over,
  };
}
const raw = () => sessionStorage.getItem(HANDOFF_KEY) ?? '';

afterEach(() => sessionStorage.clear());

describe('core/handoff', () => {
  it('is a registered session key, purged at sign-out', () => {
    expect(registryEntry('session', HANDOFF_KEY)).toEqual({ area: 'session', key: HANDOFF_KEY, purge: true });
  });

  it('round-trips under the raw target computer id, for this account', () => {
    boot({ realm: R1 });
    expect(writeHandoff(trip())).toBe(true);
    expect(readHandoff(C, ID, NOW + 1000)).toEqual(trip());
    expect(raw()).toContain(`"${UID}"`);
    expect(raw()).toContain(`"${C}"`);
    expect(raw(), 'the part is never the pipe-delimited scope computer').not.toMatch(/"p1\|c1":\{/);
    // Another trip id for the same computer reads as none; another account sees nothing.
    expect(readHandoff(C, 'ffffffffffffffff', NOW)).toBeNull();
    setIdentity({ id: '64f0c0ffee0000000000beef', banned: false });
    expect(readHandoff(C, ID, NOW)).toBeNull();
  });

  it('a pipe-delimited or otherwise invalid computer id fails the write (the caller says leaving loses what was typed)', () => {
    boot({ realm: R1 });
    for (const computer of ['p1|c1', '', 'a b', 'x'.repeat(65), '__proto__']) {
      expect(writeHandoff(trip({ target: { computer, name: 'atlas' } })), computer).toBe(false);
    }
    expect(raw()).toBe('');
  });

  it('never writes a secret: fields outside the allowlist are dropped, at every level', () => {
    boot({ realm: R1 });
    const dirty = {
      ...trip(),
      api_key: 'sk-secret-top',
      code: 'otp-secret',
      draft: { ...trip().draft, key: 'sk-secret-draft', secret: 'bot-secret' },
      result: { status: 'created', provider: 'my-ep', secret: 'created-secret' },
      origin: { ...trip().origin, token: 'tok-secret' },
    } as unknown as Handoff;
    expect(writeHandoff(dirty)).toBe(true);
    expect(raw()).not.toMatch(/secret|sk-|otp-|tok-/);
    expect(readHandoff(C, ID, NOW)?.result).toEqual({ status: 'created', provider: 'my-ep' });
  });

  it('a record out of shape is refused whole, never half used', () => {
    const bad: Array<[string, unknown]> = [
      ['id', { ...trip(), id: 'xyz' }],
      ['version', { ...trip(), v: 2 }],
      ['dest', { ...trip(), dest: 'billing' }],
      ['a remote origin', { ...trip(), origin: { ...trip().origin, href: 'https://evil.example/x' } }],
      ['a protocol-relative origin', { ...trip(), origin: { ...trip().origin, href: '//evil.example/x' } }],
      ['a scheme in the origin', { ...trip(), origin: { ...trip().origin, href: 'javascript:alert(1)' } }],
      ['a draft of another kind', { ...trip(), draft: { kind: 'voice', text: 'x' } }],
      ['instructions over the bound', { ...trip(), draft: { ...trip().draft, instructions: 'x'.repeat(16385) } }],
      ['a result of another status', { ...trip(), result: { status: 'maybe' } }],
      ['a settings draft without its fence', { ...trip(), draft: { kind: 'settings', botKey: 'b1', uid: 'u1', name: '', role: '', instructions: '', rules: '' } }],
    ];
    for (const [why, v] of bad) expect(parseHandoff(v), why).toBeNull();
    const settings = { kind: 'settings', botKey: 'b1', uid: 'u1', revision: 4, name: 'Chief', role: 'Lead', instructions: 'Be brief.', rules: 'No deletes.' } as const;
    expect(parseHandoff({ ...trip(), draft: settings })?.draft).toEqual(settings);
  });

  it('lives 30 minutes: an expired entry reads as none and is removed', () => {
    boot({ realm: R1 });
    writeHandoff(trip());
    expect(readHandoff(C, ID, NOW + HANDOFF_TTL_MS)).not.toBeNull();
    expect(readHandoff(C, ID, NOW + HANDOFF_TTL_MS + 1)).toBeNull();
    expect(raw(), 'removed on read').not.toContain(ID);
  });

  it('a new trip for the same account and computer replaces the old one', () => {
    boot({ realm: R1 });
    writeHandoff(trip());
    writeHandoff(trip({ id: 'aaaaaaaaaaaaaaaa', dest: 'claude' }));
    expect(readHandoff(C, ID, NOW)).toBeNull();
    expect(readHandoff(C, 'aaaaaaaaaaaaaaaa', NOW)?.dest).toBe('claude');
  });

  it('the AI page takes it only for this account, this realm and the computer it shows', () => {
    boot({ realm: R1 });
    writeHandoff(trip());
    expect(receiveHandoff(C, ID, NOW)?.id).toBe(ID);
    expect(receiveHandoff('c2', ID, NOW), 'another computer shown').toBeNull();
    expect(receiveHandoff(C, null, NOW), 'no id').toBeNull();
    writeHandoff(trip({ scope: { ...trip().scope, realm: R2 } }));
    expect(receiveHandoff(C, ID, NOW), 'another realm').toBeNull();
    writeHandoff(trip({ scope: { ...trip().scope, account: 'someone-else' } }));
    expect(receiveHandoff(C, ID, NOW), 'another account').toBeNull();
    writeHandoff(trip({ target: { computer: 'c2', name: 'other' } }));
    expect(receiveHandoff(C, ID, NOW), 'stored under another computer').toBeNull();
    // A record under this computer's part that names another computer (written by anything but writeHandoff) is not
    // this computer's trip either.
    const box = partitioned(HANDOFF_KEY, { scope: 'account+computer', area: 'session', purge: true });
    expect(box.set(trip({ target: { computer: 'c2', name: 'other' } }), C)).toBe(true);
    expect(readHandoff(C, ID, NOW)?.target.computer).toBe('c2');
    expect(receiveHandoff(C, ID, NOW), 'a record naming another computer').toBeNull();
  });

  it('browser Back finds the trip by its origin: the same path and params, for this account, realm and computer; it only reads', () => {
    boot({ realm: R1 });
    writeHandoff(trip());
    const at = (href: string, computer = C, now = NOW) => handoffAtOrigin(computer, href, now)?.id ?? null;
    expect(at('/bots?drawer=new&initial=c1')).toBe(ID);
    expect(at('/bots?initial=c1&drawer=new'), 'params in another order').toBe(ID);
    expect(at('/bots?drawer=new&initial=c1&handoff=ffffffffffffffff'), 'a handoff param is not part of the origin').toBe(ID);
    expect(at('/bots?drawer=new&initial=c2'), 'another value').toBeNull();
    expect(at('/bots?drawer=new'), 'a param missing').toBeNull();
    expect(at('/bots?drawer=new&initial=c1&tab=link'), 'a param more').toBeNull();
    expect(at('/logs?drawer=new&initial=c1'), 'another path').toBeNull();
    expect(at('bots?drawer=new&initial=c1'), 'not a local path').toBeNull();
    expect(at('/bots?drawer=new&initial=c1', 'c2'), 'another computer').toBeNull();
    expect(handoffAtOrigin(undefined, '/bots?drawer=new&initial=c1', NOW), 'no computer').toBeNull();
    expect(readHandoff(C, ID, NOW), 'reading by origin removes nothing').not.toBeNull();
    writeHandoff(trip({ origin: { ...trip().origin, href: '/bots?sel=c1~r~scout&settings=model' } }));
    expect(at('/bots?sel=c1%7Er%7Escout&settings=model'), 'the same params, encoded otherwise').toBe(ID);
    writeHandoff(trip({ scope: { ...trip().scope, realm: R2 } }));
    expect(at('/bots?drawer=new&initial=c1'), 'another realm').toBeNull();
    writeHandoff(trip({ scope: { ...trip().scope, account: 'someone-else' } }));
    expect(at('/bots?drawer=new&initial=c1'), 'another account').toBeNull();
    writeHandoff(trip());
    expect(at('/bots?drawer=new&initial=c1', C, NOW + HANDOFF_TTL_MS + 1), 'expired').toBeNull();
  });

  it('a place with a repeated param is no place: the router reads one of them, so neither spelling finds a trip', () => {
    boot({ realm: R1 });
    const at = (href: string) => handoffAtOrigin(C, href, NOW)?.id ?? null;
    writeHandoff(trip({ origin: { ...trip().origin, href: '/bots?sel=c1~r~one&sel=c1~r~two&settings=model' } }));
    expect(at('/bots?sel=c1~r~two&sel=c1~r~one&settings=model'), 'the same values in another order select another Bot').toBeNull();
    expect(at('/bots?sel=c1~r~one&sel=c1~r~two&settings=model'), 'nor the same spelling').toBeNull();
    expect(at('/bots?sel=c1~r~one&settings=model'), 'nor one of them').toBeNull();
    writeHandoff(trip({ origin: { ...trip().origin, href: '/bots?sel=c1~r~one&settings=model' } }));
    expect(at('/bots?sel=c1~r~one&settings=model'), 'one sel is a place').toBe(ID);
    expect(at('/bots?sel=c1~r~two&settings=model'), 'another Bot').toBeNull();
    expect(at('/bots?sel=c1~r~one&s%65l=c1~r~two&settings=model'), 'a repeat spelled encoded').toBeNull();
    expect(at('/bots?sel=c1~r~one&settings=model&settings=model'), 'a repeat with the same value').toBeNull();
    expect(at('/bots?sel=c1~r~one&settings=model&handoff=ffffffffffffffff&handoff=eeeeeeeeeeeeeeee'), 'handoff is not part of the place').toBe(ID);
    writeHandoff(trip({ origin: { ...trip().origin, href: '/bots?drawer=new&initial=c1&initial=c2' } }));
    expect(at('/bots?drawer=new&initial=c2&initial=c1'), 'the computers in another order').toBeNull();
    expect(at('/bots?drawer=new&initial=c1'), 'one of the computers').toBeNull();
    expect(at('/bots?drawer=new&initial=c2'), 'the other computer').toBeNull();
    expect(readHandoff(C, ID, NOW), 'still stored: a lookup by place removes nothing').not.toBeNull();
  });

  it('records a result, and is removed when consumed', () => {
    boot({ realm: R1 });
    writeHandoff(trip());
    expect(setHandoffResult(C, ID, { status: 'created', provider: 'my-ep' }, NOW)).toBe(true);
    expect(readHandoff(C, ID, NOW)?.result).toEqual({ status: 'created', provider: 'my-ep' });
    expect(setHandoffResult(C, 'ffffffffffffffff', { status: 'left' }, NOW), 'another trip').toBe(false);
    expect(removeHandoff(C)).toBe(true);
    expect(readHandoff(C, ID, NOW)).toBeNull();
    expect(setHandoffResult(C, ID, { status: 'left' }, NOW), 'gone').toBe(false);
  });

  it('the return href carries the trip id; ids are 16 hex', () => {
    expect(handoffReturnHref(trip())).toBe(`/bots?drawer=new&initial=c1&handoff=${ID}`);
    expect(handoffReturnHref(trip({ origin: { ...trip().origin, href: '/bots' } }))).toBe(`/bots?handoff=${ID}`);
    // The param goes before a fragment, and one the origin already carries is replaced.
    expect(handoffReturnHref(trip({ origin: { ...trip().origin, href: '/bots?drawer=new#model' } }))).toBe(`/bots?drawer=new&handoff=${ID}#model`);
    expect(handoffReturnHref(trip({ origin: { ...trip().origin, href: '/bots#model' } }))).toBe(`/bots?handoff=${ID}#model`);
    expect(handoffReturnHref(trip({ origin: { ...trip().origin, href: '/bots?handoff=0000000000000000&a=1' } }))).toBe(`/bots?a=1&handoff=${ID}`);
    expect(newHandoffId()).toMatch(/^[0-9a-f]{16}$/);
  });

  // The key is read percent-decoded; every other segment is kept byte for byte.
  it('the return href replaces a handoff key however it is written, and keeps every other segment as it was', () => {
    const at = (href: string) => handoffReturnHref(trip({ origin: { ...trip().origin, href } }));
    expect(at('/bots?%68andoff=old&a=1'), 'encoded key').toBe(`/bots?a=1&handoff=${ID}`);
    expect(at('/bots?a=1&%48andoff=x&b=2'), 'other case stays a different key').toBe(`/bots?a=1&%48andoff=x&b=2&handoff=${ID}`);
    expect(at('/bots?handoff=1&a=1&%68andoff=2&handoff=3'), 'mixed duplicates').toBe(`/bots?a=1&handoff=${ID}`);
    expect(at('/bots?%68andoff&a=1'), 'a key with no value').toBe(`/bots?a=1&handoff=${ID}`);
    expect(at('/bots?a=1&&b=2&'), 'empty segments kept').toBe(`/bots?a=1&&b=2&&handoff=${ID}`);
    expect(at('/bots?&a=1'), 'leading empty segment kept').toBe(`/bots?&a=1&handoff=${ID}`);
    expect(at('/bots?'), 'bare ?').toBe(`/bots?handoff=${ID}`);
    expect(at('/bots?#model'), 'bare ? before a fragment').toBe(`/bots?handoff=${ID}#model`);
    expect(at('/bots?%E0%A4%A=1&a=1'), 'a key that does not decode is read as written').toBe(`/bots?%E0%A4%A=1&a=1&handoff=${ID}`);
    expect(at('/bots?%E0%A4%A=1&handoff=old'), 'a malformed neighbour does not hide the real key').toBe(`/bots?%E0%A4%A=1&handoff=${ID}`);
    expect(at('/bots?x=%68andoff&a=1'), 'a value is never a key').toBe(`/bots?x=%68andoff&a=1&handoff=${ID}`);
    expect(at('/bots?a=1&handoff=old#h?x&handoff=z'), 'only the part before the first # is the query').toBe(`/bots?a=1&handoff=${ID}#h?x&handoff=z`);
  });
  it('carries the pick a model picker was making (intent pick, spec, thinking) through a write and a read', () => {
    boot({ realm: R1 });
    const pick = { intent: 'pick', spec: 'openai/gpt-5', thinking: 'high' } as const;
    expect(writeHandoff(trip({ pick }))).toBe(true);
    expect(readHandoff(C, ID, NOW)?.pick).toEqual(pick);
    for (const thinking of ['', 'off', 'on', 'low', 'medium', 'high', 'xhigh', 'max'] as const) {
      expect(parseHandoff({ ...trip(), pick: { ...pick, thinking } })?.pick, thinking).toEqual({ ...pick, thinking });
    }
  });

  it('a pick out of shape is dropped alone: the rest of the record is kept; extra keys never stored', () => {
    const bad: Array<[string, unknown]> = [
      ['another intent', { intent: 'browse', spec: 'openai/gpt-5', thinking: '' }],
      ['no intent', { spec: 'openai/gpt-5', thinking: '' }],
      ['an empty spec', { intent: 'pick', spec: '', thinking: '' }],
      ['a spec over the bound', { intent: 'pick', spec: 'x'.repeat(257), thinking: '' }],
      ['a thinking level outside the vocabulary', { intent: 'pick', spec: 'openai/gpt-5', thinking: 'ultra' }],
      ['no thinking', { intent: 'pick', spec: 'openai/gpt-5' }],
      ['not a record', 'openai/gpt-5'],
      ['null', null],
    ];
    for (const [why, pick] of bad) {
      const h = parseHandoff({ ...trip(), pick });
      expect(h, why).toEqual(trip());
      expect(h && 'pick' in h, why).toBe(false);
    }
    boot({ realm: R1 });
    expect(writeHandoff({ ...trip(), pick: { intent: 'pick', spec: 'openai/gpt-5', thinking: 'low', key: 'sk-secret-pick' } } as unknown as Handoff)).toBe(true);
    expect(raw()).not.toMatch(/secret|sk-/);
    expect(readHandoff(C, ID, NOW)?.pick).toEqual({ intent: 'pick', spec: 'openai/gpt-5', thinking: 'low' });
  });
});
