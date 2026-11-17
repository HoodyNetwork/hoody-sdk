// The composer's send and Stop (kit/agent/convComposer.ts), on a fake
// ActiveSource: one send at a time per chat; done clears the text; a refusal keeps it; an unknown holds Send until dismissed and
// nothing sends that text again (C9); the answer lands on the chat it was sent to; one Stop per turn until certain facts settle
// it; the page's files go with the send and leave only when the outcome took them or left no proof.
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONV_AUTO, CONV_MAX, attemptsOf, resetAttemptsForTests, setAttempts, useConvComposer, type ComposerFiles } from './convComposer';
import type { ActiveSource, ConvSnapshot, SendOutcome } from './source';

interface Facts { turn: boolean; gate: string; reach: string; state: string }

function fakeSource(over: Partial<Facts> = {}) {
  const subs = new Set<() => void>();
  let snap = { facts: { turn: false, gate: 'none', reach: 'ok', state: 'idle', ...over }, blocks: [], turnId: undefined as string | undefined, turnConfirmed: true, endedTurnId: undefined as string | undefined } as unknown as ConvSnapshot;
  const sends: { d: unknown; o: unknown; answer: (o: SendOutcome) => void }[] = [];
  const stops: { answer: (o: SendOutcome) => void }[] = [];
  const src = {
    kind: 'session',
    snapshot: () => snap,
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
    can: () => ({ ok: true }),
    send: vi.fn((d: unknown, o?: unknown) => new Promise<SendOutcome>((r) => sends.push({ d, o, answer: r }))),
    stop: vi.fn(() => new Promise<SendOutcome>((r) => stops.push({ answer: r }))),
  } as unknown as ActiveSource;
  const set = (s: Partial<{ facts: Partial<Facts>; turnId: string; endedTurnId: string; turnConfirmed: boolean; blocks: ConvSnapshot['blocks'] }>) => {
    const cur = snap as unknown as { facts: Facts };
    snap = { ...snap, ...s, facts: { ...cur.facts, ...(s.facts ?? {}) } } as unknown as ConvSnapshot;
    act(() => { for (const f of [...subs]) f(); });
  };
  return { src, sends, stops, set };
}

const T1 = 'acc|atlas.00a1|global|s1';
const T2 = 'acc|atlas.00a1|global|s2';
const answer = async (fn: (o: SendOutcome) => void, o: SendOutcome) => { await act(async () => { fn(o); await Promise.resolve(); }); };

beforeEach(() => { resetAttemptsForTests(); });
afterEach(() => { cleanup(); });

describe('useConvComposer: the send', () => {
  it('sends the typed text once; a second press while it is on its way sends nothing; done clears the box', async () => {
    const f = fakeSource();
    const h = renderHook(() => useConvComposer(f.src, T1));
    act(() => h.result.current.setDraft('hello'));
    expect(h.result.current.canSendText).toBe(true);
    act(() => h.result.current.send());
    act(() => h.result.current.send());
    expect(f.src.send).toHaveBeenCalledTimes(1);
    expect(f.sends[0]!.d).toEqual({ text: 'hello' });
    expect(h.result.current.sending).toBe(true);
    await answer(f.sends[0]!.answer, { k: 'done' });
    expect(attemptsOf(T1)).toMatchObject({ draft: '', send: null });
  });

  // The agent runs /clear, /skills, /hooks and /hooks reload only as the exact text (its own input handling). A pick from
  // the "/" menu leaves "/name " in the draft, so a command line goes out without its trailing whitespace.
  it.each([['/clear ', '/clear'], ['/skills ', '/skills'], ['/hooks  ', '/hooks'], ['/hooks reload ', '/hooks reload'], ['/hooks reload\t', '/hooks reload']])(
    'a command line %j goes out exact as %j; done still clears the box', async (typed, sent) => {
      const f = fakeSource();
      const h = renderHook(() => useConvComposer(f.src, T1));
      act(() => h.result.current.setDraft(typed));
      act(() => h.result.current.send());
      expect(f.sends[0]!.d).toEqual({ text: sent });
      await answer(f.sends[0]!.answer, { k: 'done' });
      expect(attemptsOf(T1)).toMatchObject({ draft: '', send: null });
    });

  it.each([['hello /skills '], ['/note line one\nline two  \n'], ['/skills\nmore '], ['/clear\n\n'], ['/hooks reload \n'], ['/unknown  '], ['/exit '], ['/usr/local/bin  '], ['/compact 3 '], ['/skills list ']])(
    'only an exact-match command on one line loses its trailing whitespace; %j goes out as typed', (typed) => {
      const f = fakeSource();
      const h = renderHook(() => useConvComposer(f.src, T1));
      act(() => h.result.current.setDraft(typed));
      act(() => h.result.current.send());
      expect(f.sends[0]!.d).toEqual({ text: typed });
    });

  it('a second press while a command is on its way sends nothing; an unknown clears the typed box and holds Send (C9)', async () => {
    const f = fakeSource();
    const h = renderHook(() => useConvComposer(f.src, T1));
    act(() => h.result.current.setDraft('/clear '));
    act(() => h.result.current.send());
    act(() => h.result.current.send());
    expect(f.src.send).toHaveBeenCalledTimes(1);
    await answer(f.sends[0]!.answer, { k: 'unknown' });
    expect(attemptsOf(T1)).toMatchObject({ draft: '', send: { k: 'unknown' } });
    act(() => h.result.current.setDraft('/clear '));
    act(() => h.result.current.send());
    expect(f.src.send).toHaveBeenCalledTimes(1);
  });

  it('an auto-approve command refused is sent again exact with its policy; the limits and the files read the typed draft', async () => {
    const f = fakeSource();
    const take = vi.fn(() => ({ parts: {}, drop: () => {} }));
    const h = renderHook(() => useConvComposer(f.src, T1, { take }));
    act(() => h.result.current.setDraft('/hooks reload '));
    act(() => h.result.current.send(CONV_AUTO));
    expect(take).toHaveBeenLastCalledWith('/hooks reload ', 'turn');
    expect(f.sends[0]).toMatchObject({ d: { text: '/hooks reload' }, o: CONV_AUTO });
    await answer(f.sends[0]!.answer, { k: 'refused', code: 'busy' });
    const sa = attemptsOf(T1).send as { k: string; text: string; auto?: true };
    expect(sa).toEqual({ k: 'notSent', text: '/hooks reload', auto: true });
    act(() => h.result.current.send(CONV_AUTO, sa.text));
    expect(f.sends[1]).toMatchObject({ d: { text: '/hooks reload' }, o: CONV_AUTO });
    expect(f.src.send).toHaveBeenCalledTimes(2);
    // over the limit as typed (trailing spaces count, as Send's own rule counts them): nothing goes, even through Send it now
    act(() => h.result.current.setDraft('/skills' + ' '.repeat(CONV_MAX)));
    expect(h.result.current.canSendText).toBe(false);
    await answer(f.sends[1]!.answer, { k: 'refused', code: 'busy' });
    act(() => h.result.current.send());
    expect(f.src.send).toHaveBeenCalledTimes(2);
  });

  it('a refused command keeps the draft as typed, and Send it now sends the exact command again', async () => {
    const f = fakeSource();
    const h = renderHook(() => useConvComposer(f.src, T1));
    act(() => h.result.current.setDraft('/skills '));
    act(() => h.result.current.send());
    await answer(f.sends[0]!.answer, { k: 'refused', code: 'busy' });
    expect(attemptsOf(T1)).toMatchObject({ draft: '/skills ', send: { k: 'notSent', text: '/skills' } });
    act(() => h.result.current.send());
    expect(f.sends[1]!.d).toEqual({ text: '/skills' });
  });

  it('a refusal keeps the text for Send it now; duplicate_held reads unresolved, never not sent', async () => {
    const f = fakeSource();
    const h = renderHook(() => useConvComposer(f.src, T1));
    act(() => h.result.current.setDraft('keep me'));
    act(() => h.result.current.send());
    await answer(f.sends[0]!.answer, { k: 'refused', code: 'busy' });
    expect(attemptsOf(T1)).toMatchObject({ draft: 'keep me', send: { k: 'notSent', text: 'keep me' } });
    act(() => h.result.current.send());
    await answer(f.sends[1]!.answer, { k: 'refused', code: 'duplicate_held' });
    expect(attemptsOf(T1).send).toEqual({ k: 'unresolved' });
  });

  it('an unknown (or a throw) clears the box and holds Send until dismissed; nothing sends that text again', async () => {
    const f = fakeSource();
    const h = renderHook(() => useConvComposer(f.src, T1));
    act(() => h.result.current.setDraft('maybe'));
    act(() => h.result.current.send());
    await answer(f.sends[0]!.answer, { k: 'unknown' });
    expect(attemptsOf(T1)).toMatchObject({ draft: '', send: { k: 'unknown' } });
    expect(h.result.current.held).toBe(true);
    act(() => h.result.current.setDraft('maybe'));
    expect(h.result.current.canSendText).toBe(false);
    act(() => h.result.current.send());
    expect(f.src.send).toHaveBeenCalledTimes(1);
    act(() => h.result.current.dismiss());
    expect(attemptsOf(T1).send).toEqual({ k: 'dismissed' });
    act(() => h.result.current.send());
    expect(f.src.send).toHaveBeenCalledTimes(2);
    (f.src.send as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw new Error('boom'); });
    await answer(f.sends[1]!.answer, { k: 'done' });
    act(() => h.result.current.setDraft('throws'));
    await act(async () => { h.result.current.send(); await Promise.resolve(); });
    expect(attemptsOf(T1).send).toEqual({ k: 'unknown' });
  });

  it("the answer lands on the chat it was sent to, whichever chat is shown when it arrives", async () => {
    const f = fakeSource();
    const h = renderHook(({ t }) => useConvComposer(f.src, t), { initialProps: { t: T1 } });
    act(() => h.result.current.setDraft('to s1'));
    act(() => h.result.current.send());
    h.rerender({ t: T2 });
    await answer(f.sends[0]!.answer, { k: 'unknown' });
    expect(attemptsOf(T1).send).toEqual({ k: 'unknown' });
    expect(attemptsOf(T2).send).toBeNull();
  });

  it('Auto-approve this reply rides only while the draft is still the retried text', async () => {
    const f = fakeSource();
    const h = renderHook(() => useConvComposer(f.src, T1));
    act(() => h.result.current.setDraft('auto'));
    act(() => h.result.current.send({ autoApproveTurn: true }));
    expect(f.sends[0]!.o).toEqual({ autoApproveTurn: true });
    await answer(f.sends[0]!.answer, { k: 'refused', code: 'busy' });
    expect(attemptsOf(T1).send).toEqual({ k: 'notSent', text: 'auto', auto: true });
    act(() => h.result.current.setDraft('other'));
    act(() => h.result.current.send({ autoApproveTurn: true }, 'auto'));
    expect(f.sends[1]!.o).toBeUndefined();
  });
});

describe('useConvComposer: the files the page hands in', () => {
  it('a held take sends nothing; the parts go with the send; drop on done, unknown and a throw, never on a refusal', async () => {
    const f = fakeSource();
    let hold = true;
    const drop = vi.fn();
    const files: ComposerFiles = { take: () => (hold ? null : { parts: { images: [{ name: 'a.png', mime: 'image/png', data: 'AA' }] }, drop }) };
    const h = renderHook(() => useConvComposer(f.src, T1, files));
    act(() => h.result.current.setDraft('with a file'));
    act(() => h.result.current.send());
    expect(f.src.send).not.toHaveBeenCalled();
    expect(attemptsOf(T1).send).toBeNull();
    hold = false;
    act(() => h.result.current.send());
    expect(f.sends[0]!.d).toEqual({ text: 'with a file', images: [{ name: 'a.png', mime: 'image/png', data: 'AA' }] });
    await answer(f.sends[0]!.answer, { k: 'refused', code: 'busy' });
    expect(drop).not.toHaveBeenCalled();
    act(() => h.result.current.send());
    await answer(f.sends[1]!.answer, { k: 'unknown' });
    expect(drop).toHaveBeenCalledTimes(1);
    act(() => h.result.current.dismiss());
    act(() => h.result.current.setDraft('again'));
    act(() => h.result.current.send());
    await answer(f.sends[2]!.answer, { k: 'done' });
    expect(drop).toHaveBeenCalledTimes(2);
    // A send that throws leaves no proof either way: its files go too.
    (f.src.send as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw new Error('boom'); });
    act(() => h.result.current.setDraft('thrown'));
    await act(async () => { h.result.current.send(); await Promise.resolve(); });
    expect(attemptsOf(T1).send).toEqual({ k: 'unknown' });
    expect(drop).toHaveBeenCalledTimes(3);
  });

  it('take is never asked for empty or over-long text, nor while the source refuses the send', () => {
    const f = fakeSource();
    let allow = true;
    (f.src as unknown as { can: () => { ok: boolean } }).can = () => ({ ok: allow });
    const take = vi.fn(() => null);
    const h = renderHook(() => useConvComposer(f.src, T1, { take }));
    act(() => h.result.current.setDraft('   '));
    act(() => h.result.current.send());
    act(() => h.result.current.setDraft('x'.repeat(4001)));
    act(() => h.result.current.send());
    allow = false;
    act(() => h.result.current.setDraft('fine text'));
    act(() => h.result.current.send());
    expect(take).not.toHaveBeenCalled();
    allow = true;
    act(() => h.result.current.send());
    expect(take).toHaveBeenCalledWith('fine text', 'turn');
  });
});

describe('useConvComposer: Stop', () => {
  it('one Stop per turn: a second press while it is unresolved sends nothing; certain facts that the turn ended settle it', async () => {
    const f = fakeSource({ turn: true, state: 'running' });
    f.set({ turnId: 't1' });
    const h = renderHook(() => useConvComposer(f.src, T1));
    act(() => h.result.current.stop());
    act(() => h.result.current.stop());
    expect(f.src.stop).toHaveBeenCalledTimes(1);
    expect(h.result.current.stopHeld).toBe(true);
    await answer(f.stops[0]!.answer, { k: 'unknown' });
    expect(attemptsOf(T1).stop).toEqual({ k: 'unknown', turn: 't1' });
    act(() => h.result.current.stop());
    expect(f.src.stop).toHaveBeenCalledTimes(1);
    f.set({ facts: { turn: false, state: 'idle' } });
    expect(attemptsOf(T1).stop).toBeNull();
  });

  it('stop_pending and no_turn are never shown as refused; a definite refusal is', async () => {
    const f = fakeSource({ turn: true, state: 'running' });
    f.set({ turnId: 't1' });
    const h = renderHook(() => useConvComposer(f.src, T1));
    act(() => h.result.current.stop());
    await answer(f.stops[0]!.answer, { k: 'refused', code: 'stop_pending' });
    expect(attemptsOf(T1).stop).toEqual({ k: 'unknown', turn: 't1' });
    act(() => setAttempts(T1, (x) => ({ ...x, stop: null })));
    act(() => h.result.current.stop());
    await answer(f.stops[1]!.answer, { k: 'refused', code: 'no_turn' });
    expect(attemptsOf(T1).stop).toEqual({ k: 'unknown', turn: 't1' });
    act(() => setAttempts(T1, (x) => ({ ...x, stop: null })));
    act(() => h.result.current.stop());
    await answer(f.stops[2]!.answer, { k: 'refused', code: 'not_allowed' });
    expect(attemptsOf(T1).stop).toEqual({ k: 'refused', turn: 't1' });
  });

  it('the captured turn ending by its own id settles a Stop, certain facts or not', () => {
    const f = fakeSource({ turn: true, state: 'running' });
    f.set({ turnId: 't1', turnConfirmed: false });
    const h = renderHook(() => useConvComposer(f.src, T1));
    act(() => h.result.current.stop());
    f.set({ endedTurnId: 't1' });
    expect(attemptsOf(T1).stop).toBeNull();
  });

  it('stopShown: only a transcript line marked stop counts (another Check again line does not), and only while it is shown', () => {
    const f = fakeSource({ turn: true, state: 'running' });
    const h = renderHook(() => useConvComposer(f.src, T1));
    expect(h.result.current.stopShown).toBe(false);
    f.set({ blocks: [{ k: 'line', key: 'o0', text: "Couldn't tell how this ended.", tone: 'info', recheck: true }] });
    expect(h.result.current.stopShown).toBe(false);
    f.set({ blocks: [{ k: 'line', key: 's0', text: 'Stop may have gone through.', tone: 'info', recheck: true, stop: true }] });
    expect(h.result.current.stopShown).toBe(true);
    f.set({ blocks: [] });
    expect(h.result.current.stopShown).toBe(false);
  });
});
