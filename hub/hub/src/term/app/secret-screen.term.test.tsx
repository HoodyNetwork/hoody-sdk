// When a secret may be shown and copied in the terminal (admission row 7).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | secretReveal only on the alternate screen the renderer really uses, a TTY, TERM set and not dumb | 'secretReveal' |
// | 2 | The facts come from the live renderer (screenMode, capabilities), not from its options | 'facts from the renderer' |
// | 3 | Copy only where a reveal is allowed and the terminal said OSC 52 is supported (not 'unknown') | 'Copy' |
// | 4 | A secret's copy text: the value unchanged, at most 4 KiB before base64; one that cleaning would change, longer or empty = nothing | 'copy text' |
// | 5 | Re-hide after 60 s revealed with no key press; a key restarts the clock; hidden stops it | 'RevealIdle' |
import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { testRender } from '../prim/testing';
import { REVEAL_IDLE_MS, RevealIdle, SECRET_COPY_MAX, screenFactsOf, secretCopyOf, secretCopyText, secretRevealOf, type IdleTimers, type ScreenFacts } from './secret-screen';

const OK: ScreenFacts = { screenMode: 'alternate-screen', tty: true, term: 'xterm-256color', osc52: 'supported' };

describe('secretReveal', () => {
  test.each([
    ['the alternate screen on a terminal', OK, true],
    ['tmux', { ...OK, term: 'tmux-256color' }, true],
    ['the main screen (OTUI_USE_ALTERNATE_SCREEN=0, or a split footer)', { ...OK, screenMode: 'main-screen' }, false],
    ['a split footer', { ...OK, screenMode: 'split-footer' }, false],
    ['no screen mode read', { ...OK, screenMode: undefined }, false],
    ['not a terminal', { ...OK, tty: false }, false],
    ['TERM unset', { ...OK, term: undefined }, false],
    ['TERM empty', { ...OK, term: ' ' }, false],
    ['TERM=dumb', { ...OK, term: 'dumb' }, false],
  ] as const)('%s → %s', (_n, f, want) => {
    expect(secretRevealOf(f)).toBe(want);
  });
});

describe('facts from the renderer', () => {
  test('a real engine renderer: its own screenMode and capability answer are what is read', async () => {
    const t = await testRender(createElement('box'), { width: 20, height: 4 });
    try {
      const r = t.renderer as unknown as { screenMode: unknown; capabilities: { osc52_support?: unknown } | null };
      const f = screenFactsOf(r, { isTTY: true }, { TERM: 'xterm-256color' });
      expect(f.screenMode).toBe(r.screenMode);
      expect(typeof f.screenMode).toBe('string');
      expect(f.osc52).toBe(r.capabilities?.osc52_support);
    } finally {
      t.renderer.destroy();
    }
  });
  test('the options a renderer was given do not count; a getter that throws reads as unknown', () => {
    const asked = { useAlternateScreen: true, screenMode: 'main-screen' };
    expect(secretRevealOf(screenFactsOf(asked, { isTTY: true }, { TERM: 'xterm' }))).toBe(false);
    const hostile = { get screenMode(): unknown { throw new Error('x'); }, get capabilities(): never { throw new Error('y'); } };
    const f = screenFactsOf(hostile, { isTTY: true }, { TERM: 'xterm' });
    expect([f.screenMode, f.osc52, secretRevealOf(f), secretCopyOf(f)]).toEqual([undefined, undefined, false, false]);
    expect(screenFactsOf({ screenMode: 'alternate-screen' }, null, {}).tty).toBe(false);
    expect(screenFactsOf({ screenMode: 'alternate-screen' }, { isTTY: 'yes' as unknown as boolean }, {}).tty).toBe(false);
  });
});

describe('Copy', () => {
  test.each([
    ['supported', OK, true],
    ['unknown (the engine would still write)', { ...OK, osc52: 'unknown' }, false],
    ['unsupported', { ...OK, osc52: 'unsupported' }, false],
    ['no answer', { ...OK, osc52: undefined }, false],
    ['supported, but no reveal (main screen)', { ...OK, screenMode: 'main-screen' }, false],
  ] as const)('%s → %s', (_n, f, want) => {
    expect(secretCopyOf(f)).toBe(want);
  });
});

describe('copy text', () => {
  test('the secret unchanged, or nothing: a value cleaning would alter gets no Copy (never a different credential)', () => {
    expect(secretCopyText('hdy_abc-DEF_123')).toBe('hdy_abc-DEF_123');
    // A multi-line value (a key file) and a tab are kept as they are.
    expect(secretCopyText('line 1\nline\t2')).toBe('line 1\nline\t2');
    for (const v of ['hdy_abc\u001b]52;c;?\u0007', 'ab\r\ncd', 'ab\u00adcd', 'ab\u200bcd', 'ab\u0000cd', 'ab\u0085cd']) expect(secretCopyText(v)).toBeNull();
  });
  test('bounded at 4 KiB in UTF-8 bytes', () => {
    expect(secretCopyText('a'.repeat(SECRET_COPY_MAX))).toHaveLength(SECRET_COPY_MAX);
    expect(secretCopyText('a'.repeat(SECRET_COPY_MAX + 1))).toBeNull();
    // Bytes, not characters: 2048 two-byte characters fit, one more does not.
    expect(secretCopyText('é'.repeat(2048))).not.toBeNull();
    expect(secretCopyText('é'.repeat(2049))).toBeNull();
    for (const v of ['', '\u0007', null, undefined, 42]) expect(secretCopyText(v)).toBeNull();
  });
});

describe('RevealIdle', () => {
  function clock(): IdleTimers & { now: number; advance(ms: number): void; live: number } {
    let id = 0;
    const due = new Map<number, { at: number; fn: () => void }>();
    const c = {
      now: 0,
      get live() { return due.size; },
      set: (fn: () => void, ms: number) => { due.set(++id, { at: c.now + ms, fn }); return id; },
      clear: (h: unknown) => { due.delete(h as number); },
      advance(ms: number) { c.now += ms; for (const [k, v] of [...due]) if (v.at <= c.now) { due.delete(k); v.fn(); } },
    };
    return c;
  }
  test('hidden after 60 s with no key; once', () => {
    const c = clock(); let hides = 0;
    const r = new RevealIdle(() => { hides++; }, REVEAL_IDLE_MS, c);
    r.shown();
    c.advance(REVEAL_IDLE_MS - 1);
    expect(hides).toBe(0);
    c.advance(1);
    expect(hides).toBe(1);
    c.advance(REVEAL_IDLE_MS * 3);
    expect(hides).toBe(1);
    expect(REVEAL_IDLE_MS).toBe(60_000);
  });
  test('a key press restarts the clock; after hiding a key does not start it', () => {
    const c = clock(); let hides = 0;
    const r = new RevealIdle(() => { hides++; }, REVEAL_IDLE_MS, c);
    r.shown();
    c.advance(50_000); r.touch(); c.advance(50_000);
    expect(hides).toBe(0);
    c.advance(10_000);
    expect(hides).toBe(1);
    r.touch(); c.advance(REVEAL_IDLE_MS * 2);
    expect(hides).toBe(1);
  });
  test('hidden by the person stops it; shown again starts a fresh clock; one timer at a time', () => {
    const c = clock(); let hides = 0;
    const r = new RevealIdle(() => { hides++; }, REVEAL_IDLE_MS, c);
    r.shown(); c.advance(30_000); r.hidden();
    expect(c.live).toBe(0);
    c.advance(REVEAL_IDLE_MS);
    expect(hides).toBe(0);
    r.shown(); r.shown(); r.touch();
    expect(c.live).toBe(1);
    c.advance(REVEAL_IDLE_MS);
    expect(hides).toBe(1);
  });
});
