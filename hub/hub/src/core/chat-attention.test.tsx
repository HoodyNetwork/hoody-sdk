// chat-attention.test.tsx: the shell's chat-attention observer (GET /gates page 1 while visible, the AI page's realm rule,
// served realms only) and the notes of chats let go while their turn ran (bounded, expiring, their last state).
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attentionGates, chatNotes, chatTickedPlace, clearChatNote, countedGates, useChatNotes, NOTE_TTL_MS, NOTES_MAX, noteChatStates, noteLeftRunning, noteMark, resetChatAttentionForTests, useChatAttention,
} from './chat-attention';
import { chatListRoutes, resetChatListsForTests } from './chat-lists';
import { bump, setTarget, snapshot, startLoggingOut } from './ctx';
import { bootFixtureCore } from './fixture-boot';
import { queryClient, useCore } from './query';
import { switchTo } from './realm';
import { answers, reply, type FixtureRequest, type FixtureRule } from './transport';
import { fixtureWorld } from './world';

const PERSONAL = fixtureWorld.realms[0]!.id;
const ACME = fixtureWorld.realms[1]!.id;
const UNSERVED = 'abcdefabcdefabcdefabcdef';
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 30; i++) await act(async () => { await new Promise((r) => setTimeout(r, 1)); }); }
const gate = (sid: string, realm: string, agent?: string) => ({ gate_id: 'g-' + sid, generation: 1, kind: 'confirm', session_id: sid, realm, ...(agent ? { agent } : {}) });

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
}

function observe(rules: FixtureRule[], realm?: string): void {
  bootFixtureCore({ rules, ...(realm ? { realm } : {}) });
  queryClient.clear();
  function Probe() { useChatAttention(); return null; }
  render(<Probe />, { wrapper: wrap });
}

beforeEach(() => { resetChatAttentionForTests(); resetChatListsForTests(); setHidden(false); });
afterEach(() => { setHidden(false); vi.useRealTimers(); });

describe('countedGates: which gates light the AI dot', () => {
  const g = [{ sid: 'a', realm: PERSONAL }, { sid: 'b', realm: UNSERVED }, { sid: 'c', realm: ACME }, { sid: 'd', realm: PERSONAL, agent: 'bot' }];
  it('a realm the login does not serve never counts; nor a Bot\'s own session; nor anything while the realm list is unknown', () => {
    expect(countedGates(g, 'all', [PERSONAL, ACME]).map((x) => x.sid)).toEqual(['a', 'c']);
    expect(countedGates(g, PERSONAL, [PERSONAL, ACME]).map((x) => x.sid)).toEqual(['a']);
    expect(countedGates(g, 'all', null)).toEqual([]);
  });
});

describe('useChatAttention: the observer', () => {
  it('reads GET /gates page 1 of the shown realm and keeps the counted gates for the shown account and computer', async () => {
    const sent: FixtureRequest[] = [];
    observe([reply(chatListRoutes.gates, (r) => { sent.push(r); return answers.ok({ items: [gate('s1', PERSONAL), gate('s2', UNSERVED)], meta: { total: 2 } }); })]);
    await flush();
    expect(sent.length).toBe(1);
    expect(sent[0]!.query.page).toBe('1');
    const seen = attentionGates();
    expect(seen?.gates.map((x) => x.sid)).toEqual(['s1']);
    expect(seen?.computer).toBe(fixtureWorld.current.id);
  });

  it('a gate in a realm the login does not serve never lights anything (All realms)', async () => {
    observe([reply(chatListRoutes.gates, answers.ok({ items: [gate('s9', UNSERVED)], meta: { total: 1 } }))], 'all');
    await flush();
    expect(attentionGates()?.gates).toEqual([]);
  });

  it('a hidden tab sends nothing', async () => {
    setHidden(true);
    const sent: FixtureRequest[] = [];
    observe([reply(chatListRoutes.gates, (r) => { sent.push(r); return answers.ok({ items: [], meta: { total: 0 } }); })]);
    await flush();
    expect(sent).toEqual([]);
    expect(attentionGates()).toBeNull();
  });

  it('realm=all refused with 400 realm_scope_unsupported: the plain listing (no realm on the wire) is read instead', async () => {
    const listed: FixtureRequest[] = [];
    const plain: FixtureRequest[] = [];
    observe([
      reply(chatListRoutes.gates, (r) => { listed.push(r); return answers.refused(400, 'realm_scope_unsupported'); }),
      reply(chatListRoutes.gatesHere, (r) => { plain.push(r); return answers.ok({ items: [gate('s1', PERSONAL), gate('s2', UNSERVED)], meta: { total: 2 } }); }),
    ], 'all');
    await flush();
    expect(listed.length).toBeGreaterThan(0);
    expect(plain.length).toBe(1);
    expect(plain[0]!.query.realm).toBeUndefined();
    expect(attentionGates()?.gates.map((x) => x.sid)).toEqual(['s1']);
  });

  it('reads again 30 s after the last answer; a failure waits longer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true });
    let n = 0;
    let fail = false;
    observe([reply(chatListRoutes.gates, () => { n++; return fail ? answers.refused(500, 'internal') : answers.ok({ items: [], meta: { total: 0 } }); })]);
    await flush();
    expect(n).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(n).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(11_000); });
    await flush();
    expect(n).toBe(2);
    fail = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(31_000); });
    await flush();
    const afterFail = n;
    expect(afterFail).toBe(3);
    // Backed off: no read 30 s after a failure.
    await act(async () => { await vi.advanceTimersByTimeAsync(31_000); });
    await flush();
    expect(n).toBe(afterFail);
  });
});

describe('useChatAttention: its own place and the ended reads', () => {
  it('ticks only its own place: chatTickedPlace names the shown computer and realm while visible, null while hidden', async () => {
    observe([reply(chatListRoutes.gates, answers.ok({ items: [], meta: { total: 0 } }))]);
    await flush();
    expect(chatTickedPlace()).toMatch(new RegExp(`/${fixtureWorld.current.id}\\|`));
    setHidden(true);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(chatTickedPlace()).toBeNull();
  });

  it('hide and show again after a failure sends nothing before the backoff ends', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true });
    let n = 0;
    observe([reply(chatListRoutes.gates, () => { n++; return answers.refused(500, 'internal'); })]);
    await flush();
    expect(n).toBe(1);
    for (let i = 0; i < 5; i++) {
      setHidden(true);
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
      await flush();
      setHidden(false);
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
      await flush();
    }
    expect(n).toBe(1);
    // The backoff after one failure is 60 s: the next read comes after it, not before.
    await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });
    await flush();
    expect(n).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    await flush();
    expect(n).toBe(2);
  });

  it('hidden: a generation bump, or a computer switch away and back, sends nothing; showing loads the new key once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true });
    let n = 0;
    observe([reply(chatListRoutes.gates, () => { n++; return answers.refused(500, 'internal'); })]);
    await flush();
    expect(n).toBe(1);
    setHidden(true);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    // Same place, a new generation's key (the old queries dropped): no first load while hidden.
    await act(async () => { bump('suspended'); });
    await flush();
    expect(n, 'no read after a generation bump while hidden').toBe(1);
    // Another computer and back to the answered (stale) one: no read while hidden.
    const a = snapshot().target!;
    await act(async () => { setTarget({ ...a, container: { ...a.container, id: 'other' } }); });
    await flush();
    await act(async () => { setTarget(a); });
    await flush();
    expect(n, 'no read after a computer switch away and back while hidden').toBe(1);
    setHidden(false);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await flush();
    // Shown again: the new key has not answered yet, so it loads once.
    expect(n).toBe(2);
  });

  it('a mounted reader drops a note when it expires, with no other change', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true });
    bootFixtureCore({ rules: [] });
    queryClient.clear();
    let seen: readonly unknown[] = [];
    function Reader() {
      const account = useCore().account;
      useEffect(() => { if (account) noteLeftRunning(account, { computer: 'c1', realm: PERSONAL, sid: 'z' }); }, [account]);
      seen = useChatNotes();
      return null;
    }
    render(<Reader />, { wrapper: wrap });
    await flush();
    expect(seen.length).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(NOTE_TTL_MS + 10); });
    await flush();
    expect(seen.length).toBe(0);
  });
});

describe('useChatAttention: hidden reads, case by case', () => {
  const hide = async (h: boolean) => { setHidden(h); await act(async () => { document.dispatchEvent(new Event('visibilitychange')); }); await flush(); };

  it('hidden: going back to a computer whose read already answered sends nothing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true });
    const sent: string[] = [];
    observe([reply(chatListRoutes.gates, (r) => { sent.push(r.path); return answers.ok({ items: [], meta: { total: 0 } }); })]);
    await flush();
    const a = snapshot().target!;
    const b = { ...a, container: { ...a.container, id: 'other' } };
    // Visible: both computers answer once.
    await act(async () => { setTarget(b); });
    await flush();
    expect(sent.length).toBe(2);
    await hide(true);
    // Hidden: back and forth between two answered (stale after 31 s) keys.
    await act(async () => { await vi.advanceTimersByTimeAsync(31_000); });
    for (const t of [a, b, a]) { await act(async () => { setTarget(t); }); await flush(); }
    expect(sent.length, 'no read on an answered key while hidden').toBe(2);
  });

  it('hidden: a realm switch sends nothing; showing reads the new realm once', async () => {
    // The realm shown when each read went out (the fixture request carries no realm field).
    const realms: string[] = [];
    observe([reply(chatListRoutes.gates, () => { realms.push(snapshot().realm); return answers.ok({ items: [], meta: { total: 0 } }); })]);
    await flush();
    expect(realms.length).toBe(1);
    await hide(true);
    await act(async () => { await switchTo(ACME); });
    await flush();
    expect(realms.length, 'no read after a realm switch while hidden').toBe(1);
    await hide(false);
    expect(realms.length).toBe(2);
    expect(realms[1]).toBe(ACME);
  });

  it('the sessions read for noted chats: none while hidden, even after a generation bump; showing reads once', async () => {
    let n = 0;
    observe([
      reply(chatListRoutes.gates, answers.ok({ items: [], meta: { total: 0 } })),
      reply(chatListRoutes.sessions, () => { n++; return answers.ok({ items: [], meta: { total: 0 } }); }),
    ]);
    await flush();
    expect(n, 'no sessions read without a note').toBe(0);
    const account = snapshot().account!;
    const computer = snapshot().target!.container.id;
    await hide(true);
    await act(async () => { noteLeftRunning(String(account), { computer, realm: PERSONAL, sid: 'z' }); });
    await act(async () => { bump('suspended'); });
    await flush();
    expect(n, 'no sessions read while hidden').toBe(0);
    await hide(false);
    expect(n).toBe(1);
    // Hidden again, another generation, back to shown: that new key reads once, never more.
    await hide(true);
    await act(async () => { bump('suspended'); });
    await flush();
    expect(n).toBe(1);
    await hide(false);
    expect(n).toBe(2);
  });

  it('sign-out stops the observer: no read after it, and its gates are gone', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true });
    let n = 0;
    observe([reply(chatListRoutes.gates, () => { n++; return answers.ok({ items: [gate('s1', PERSONAL)], meta: { total: 1 } }); })]);
    await flush();
    expect(n).toBe(1);
    expect(attentionGates()?.gates.length).toBe(1);
    await act(async () => { startLoggingOut(); });
    await flush();
    expect(attentionGates()).toBeNull();
    expect(chatTickedPlace()).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
    await flush();
    expect(n, 'no read after sign-out started').toBe(1);
  });
});

describe('notes: chats let go while their turn ran', () => {
  const A = 'acct-1';
  it('are bounded at 20 per account, newest kept', () => {
    for (let i = 0; i < NOTES_MAX + 5; i++) noteLeftRunning(A, { computer: 'c1', realm: PERSONAL, sid: 's' + i });
    const list = chatNotes(A);
    expect(list.length).toBe(NOTES_MAX);
    expect(list.some((n) => n.sid === 's24')).toBe(true);
    expect(list.some((n) => n.sid === 's0')).toBe(false);
    expect(chatNotes('acct-2')).toEqual([]);
  });

  it('expire after 24 h', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_800_000_000_000);
    noteLeftRunning(A, { computer: 'c1', realm: PERSONAL, sid: 'old' });
    vi.setSystemTime(1_800_000_000_000 + NOTE_TTL_MS - 1000);
    expect(chatNotes(A).map((n) => n.sid)).toEqual(['old']);
    vi.setSystemTime(1_800_000_000_000 + NOTE_TTL_MS + 1);
    expect(chatNotes(A)).toEqual([]);
  });

  it('running -> idle reads "Turn ended" (ended), closed reads "Closed", running none; opening the chat clears the note', () => {
    noteLeftRunning(A, { computer: 'c1', realm: PERSONAL, sid: 'x' });
    expect(chatNotes(A, 'c1')[0]!.last).toBe('running');
    expect(noteMark(chatNotes(A, 'c1')[0]!.last)).toBeNull();
    noteChatStates(A, 'c1', [{ id: 'x', realm: PERSONAL, state: 'idle' }]);
    expect(noteMark(chatNotes(A, 'c1')[0]!.last)).toBe('ended');
    noteChatStates(A, 'c1', [{ id: 'x', realm: PERSONAL, state: 'closed' }]);
    expect(noteMark(chatNotes(A, 'c1')[0]!.last)).toBe('closed');
    // A row of another computer or realm is not this note's.
    noteChatStates(A, 'c2', [{ id: 'x', realm: PERSONAL, state: 'idle' }]);
    noteChatStates(A, 'c1', [{ id: 'x', realm: ACME, state: 'idle' }]);
    expect(chatNotes(A, 'c1')[0]!.last).toBe('closed');
    clearChatNote(A, { computer: 'c1', realm: PERSONAL, sid: 'x' });
    expect(chatNotes(A)).toEqual([]);
  });

  it('work without session storage', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      noteLeftRunning(A, { computer: 'c1', realm: PERSONAL, sid: 'y' });
      expect(chatNotes(A).map((n) => n.sid)).toEqual(['y']);
    } finally { spy.mockRestore(); get.mockRestore(); }
  });
});
