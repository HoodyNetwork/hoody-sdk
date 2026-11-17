// Vitest, the writing assistant on a script (the Ask drawer, and useAsk's places). The real drawer, banner and Check run;
// replaced: the overview (one computer whose assistant flags the test sets) and the ask itself (a double that records what it
// was sent and answers what the test says, the way writer.ts does: done, failed, not_sent or pending). What is pinned: what an ask
// carries, that the answer is only a proposal to review, that a pending ask is read back (Check again) and never asked twice,
// that a failure says why in words, and that a disabled Ask says why the assistant is not there.
import { act, render, renderHook, screen, userEvent, within } from '@app/testing';
import { useMemo, useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Ans = { outcome: 'done' | 'pending' | 'failed' | 'not_sent' | 'stale'; data?: { reply: string }; code?: string };
const world = vi.hoisted(() => {
  const w = {
    agent: { templates: true, writer: true, writerOwner: 'fp1', guardedDelete: true } as Record<string, unknown>,
    agentRealm: 'global' as string | null,
    asks: [] as Array<Record<string, unknown>>,
    checks: [] as Array<[string, string | null]>,
    cancels: [] as Array<[string, string | null]>,
    /** The places the person closed knowingly (AiTurnApi.discard). */
    discards: [] as Array<Record<string, unknown>>,
    /** The answers a view that still showed their place took (AiTurnApi.claim answered true). */
    acks: [] as Ans[],
    /** The answers already claimed (a claim is true once per answer, the way the store's compare-and-set delete is). */
    handed: new Set<Ans>(),
    mutate: (async () => ({ outcome: 'done' })) as (v: Record<string, unknown>) => Promise<Ans>,
    check: (async () => null) as () => Promise<Ans | null>,
    validates: 0,
    /** Which ask each answer is of: an answer is of the ask that was current when it came in. */
    inc: new WeakMap<object, string>(),
    /** What the writer holds for each ask (AiTurnApi.valuesOf), by ask name: set by a press that made its own ask, released when an ask ends. */
    vals: new Map<string, unknown>(),
    /** What the writer does when the store no longer holds the current ask (another tab claimed or closed it): its values go. */
    endAsk: () => {},
    cur: 'ask-1',
    /** Answers of an ask this press did not make (AiTurnApi.joined): the press found an ask out at its place and continued it. */
    joined: new WeakSet<object>(),
    /** Claims attempted (AiTurnApi.claim called), won or not. */
    claimCalls: 0,
    /** What the review answers (a deferred one lets a test order the verdicts). */
    validate: null as null | (() => Promise<unknown>),
    /** The store of asks, as the hook sees it: a version the views follow, and whether an ask is open at the place. */
    ver: 0,
    subs: new Set<() => void>(),
    unsettled: false,
  };
  let open = false;
  Object.defineProperty(w, 'unsettled', { enumerable: true, get: () => open, set: (v: boolean) => { open = v; w.ver++; for (const f of [...w.subs]) f(); } });
  w.endAsk = () => { w.vals.delete(w.cur); w.unsettled = false; };
  return w;
});

// The sign-in hook, real, with the view each place gives it recorded (the drawer's open lifetime).
const signInViews = vi.hoisted(() => [] as Array<string | undefined>);
// And what each place passes the box as its own press being blocked: Try again follows it.
const blockedSeen = vi.hoisted(() => [] as Array<string | undefined>);
vi.mock('./parts/AgentSignIn', async (orig) => {
  const real = await orig<typeof AgentSignInModule>();
  return {
    ...real,
    useAgentSignIn: (...a: Parameters<typeof real.useAgentSignIn>) => { signInViews.push(a[2]); return real.useAgentSignIn(...a); },
    AgentSignIn: (p: Parameters<typeof real.AgentSignIn>[0]) => { blockedSeen.push(p.blocked); return real.AgentSignIn(p); },
  };
});

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const { toItems } = await import('./logic');
  return {
    ...real,
    useAiTurn: () => ({
      // An ask that reached its turn stays stored (open) until a view claims its answer, the way the store holds it.
      mutateAsync: async (v: Record<string, unknown>) => { world.asks.push(v); const at = world.cur; const a = await world.mutate(v); if (!world.inc.has(a)) world.inc.set(a, at); if (v.values !== undefined && !world.joined.has(a)) world.vals.set(at, v.values); if (a.outcome === 'pending') world.unsettled = true; return a; },
      check: async (p: { compId: string; path: string | null }) => { world.checks.push([p.compId, p.path]); const at = world.cur; const a = await world.check(); if (a && !world.inc.has(a)) world.inc.set(a, at); if (a && a.outcome === 'pending') world.unsettled = true; return a; },
      valuesOf: (a: Ans) => world.vals.get(world.inc.get(a) ?? ''),
      joined: (a: Ans) => world.joined.has(a),
      cancel: async (p: { compId: string; path: string | null }) => { world.cancels.push([p.compId, p.path]); return true; },
      open: () => world.unsettled,
      discard: async (p: Record<string, unknown>) => { world.discards.push(p); world.vals.delete(world.cur); world.unsettled = false; },
      claim: async (a: Ans, eligible?: () => boolean) => { world.claimCalls++; if (world.handed.has(a)) return false; if (eligible && !eligible()) return false; world.handed.add(a); world.acks.push(a); if (a.outcome !== 'pending') { world.unsettled = false; world.vals.delete(world.inc.get(a) ?? ''); } return true; },
    }),
    useAskStore: () => useSyncExternalStore((f: () => void) => { world.subs.add(f); return () => { world.subs.delete(f); }; }, () => world.ver),
    useValidate: () => ({ mutateAsync: async () => { world.validates++; return world.validate ? world.validate() : { data: { publishable: true, results: {} } }; }, isPending: false }),
    useOverview: () => {
      const data = useMemo(() => ({
        computers: [{
          id: 'c0a7150000000000000000a1', name: 'atlas', handle: 'a.0000', state: 'on', serverName: 'n1', realmIds: [], origin: '', err: null,
          caps: { now: null, revisions: true, history: true, env: true, executions: true, tests: true, publishable: true },
          agent: world.agent, agentRealm: world.agentRealm, rows: [], summary: {}, instances: {}, aliases: [], deleted: [],
        } as never],
      }), []);
      const items = useMemo(() => toItems(data.computers), [data]);
      return { data, items, isPending: false, isError: false, error: null, refetch: async () => ({ 'a.0000': [] as string[] }) };
    },
  };
});

import { AiDrawer } from './parts/AiDrawer';
import type * as AgentSignInModule from './parts/AgentSignIn';
import { useAsk } from './parts/useAsk';
import strings from './strings.en.json';

const REPLY = 'Summary: Greets the caller\nPath: /hello\n```ts\nexport default function () {\n  return new Response("hi");\n}\n```';
const reset = () => {
  Object.assign(world, {
    agent: { templates: true, writer: true, writerOwner: 'fp1', guardedDelete: true },
    agentRealm: 'global',
    mutate: async () => ({ outcome: 'done', data: { reply: REPLY } }),
    check: async () => null,
    unsettled: false,
    cur: 'ask-1',
    claimCalls: 0,
    validates: 0,
    validate: null,
  });
  world.asks.length = 0; world.checks.length = 0; world.cancels.length = 0; world.discards.length = 0; world.acks.length = 0; world.handed.clear(); world.vals.clear();
};

describe('the Ask drawer on a script', () => {
  beforeEach(reset);
  const item = { id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, failed: 0, managed: null, ownershipUnknown: false, group: 'ok' } as never;
  const comp = () => ({ id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, agent: world.agent, agentRealm: world.agentRealm, instances: {}, rows: [], summary: {}, aliases: [], deleted: [] } as never);
  const CURRENT = 'export default function () {\n  return new Response("a");\n}\n';
  const drawer = (onUse: (c: string) => void = () => undefined) => render(<AiDrawer isOpen onClose={() => undefined} item={item} comp={comp()} current={CURRENT} failure={undefined} onUse={onUse} />);
  const sendIt = async (words = 'make it say b') => {
    await userEvent.type(await screen.findByRole('textbox', { name: strings['ai.ask'] }), words);
    await userEvent.click(await screen.findByRole('button', { name: strings['ai.send'] }));
  };

  it('gives the sign-in its open lifetime: closing the drawer is a new view (a pending ask dropped, the box ticked again)', () => {
    signInViews.length = 0;
    const props = { onClose: () => undefined, item, comp: comp(), current: CURRENT, failure: undefined, onUse: () => undefined };
    const v = render(<AiDrawer isOpen {...props} />);
    expect(signInViews.at(-1)).toBe('open');
    v.rerender(<AiDrawer isOpen={false} {...props} />);
    expect(signInViews.at(-1)).toBe('closed');
  });

  it('Try again follows Send: blocked with no words and while an ask is out, free with words', async () => {
    world.mutate = async () => ({ outcome: 'pending', code: 'TURN_RUNNING' });
    drawer();
    await vi.waitFor(() => expect(blockedSeen.at(-1)).toBe(strings['retryWhy.words']));
    await userEvent.type(await screen.findByRole('textbox', { name: strings['ai.ask'] }), 'make it say b');
    await vi.waitFor(() => expect(blockedSeen.at(-1)).toBe(''));
    await userEvent.click(await screen.findByRole('button', { name: strings['ai.send'] }));
    await screen.findByText(strings['outcome.pending.ask']);
    await vi.waitFor(() => expect(blockedSeen.at(-1)).toBe(strings['retryWhy.asking']));
  });

  it('the reason follows what is missing: words typed but no code, or code not loaded yet, never "write what should change"', async () => {
    const props = { onClose: () => undefined, item, comp: comp(), failure: undefined, onUse: () => undefined };
    const v = render(<AiDrawer isOpen {...props} current={CURRENT} />);
    await userEvent.type(await screen.findByRole('textbox', { name: strings['ai.ask'] }), 'make it say b');
    await vi.waitFor(() => expect(blockedSeen.at(-1)).toBe(''));
    v.rerender(<AiDrawer isOpen {...props} current="" />);
    await vi.waitFor(() => expect(blockedSeen.at(-1)).toBe(strings['retryWhy.code']));
    v.rerender(<AiDrawer isOpen {...props} current={null} />);
    await vi.waitFor(() => expect(blockedSeen.at(-1)).toBe(strings['retryWhy.loading']));
    v.rerender(<AiDrawer isOpen {...props} current={CURRENT} />);
    await vi.waitFor(() => expect(blockedSeen.at(-1)).toBe(''));
  });

  it('asks with this script\'s own place, the current code in the prompt, and uses the answer only after the review', async () => {
    const used: string[] = [];
    drawer((c) => used.push(c));
    await sendIt();
    expect(await screen.findByText('Greets the caller')).toBeTruthy();
    expect(world.asks[0]).toMatchObject({ compId: 'c1', path: 'a.ts', realm: 'global', owner: 'fp1' });
    expect(String(world.asks[0]!.text)).toContain('make it say b');
    expect(String(world.asks[0]!.text)).toContain(CURRENT.trim());
    expect(used).toEqual([]);
    await vi.waitFor(() => expect(world.validates).toBe(1));
    await userEvent.click(await screen.findByRole('button', { name: strings['ai.use'] }));
    expect(used).toHaveLength(1);
    expect(used[0]).toContain('return new Response("hi")');
  });

  it('a pending ask is read back by Check again at this script\'s place; its answer becomes the proposal', async () => {
    world.mutate = async () => ({ outcome: 'pending', code: 'REPLY_UNREADABLE' });
    drawer();
    await sendIt();
    expect(await screen.findByText(strings['outcome.pending.ask'])).toBeTruthy();
    world.check = async () => ({ outcome: 'done', data: { reply: REPLY } });
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText('Greets the caller')).toBeTruthy();
    expect(world.checks).toEqual([['c1', 'a.ts']]);
    expect(world.asks).toHaveLength(1);
  });

  it('a drawer opened again finds the unsettled ask pending; its answer after the reopen is not applied (the hidden placeholders are gone) and says so', async () => {
    world.unsettled = true;
    drawer();
    expect(await screen.findByText(strings['outcome.pending.ask'])).toBeTruthy();
    expect((await screen.findByRole('button', { name: strings['ai.send'] }) as HTMLButtonElement).disabled).toBe(true);
    world.check = async () => ({ outcome: 'done', data: { reply: REPLY } });
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText(strings['ai.err.reopened'])).toBeTruthy();
    expect(screen.queryByText('Greets the caller')).toBeNull();
    expect(world.validates).toBe(0);
    expect(world.asks).toHaveLength(0);
  });

  it('a drawer opened again says why an unsettled ask ended without an answer', async () => {
    world.unsettled = true;
    drawer();
    await screen.findByText(strings['outcome.pending.ask']);
    world.check = async () => ({ outcome: 'failed', code: 'cancelled' });
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText(strings['ai.err.cancelled'])).toBeTruthy();
  });

  it('closing the drawer keeps what a pending ask was masked with (the values are the ask\'s, held while it is stored): its answer after the reopen is put back together and applied', async () => {
    world.mutate = async () => ({ outcome: 'pending', code: 'REPLY_UNREADABLE' });
    const props = { onClose: () => undefined, item, comp: comp(), current: CURRENT, failure: undefined, onUse: () => undefined };
    const r = render(<AiDrawer isOpen {...props} />);
    await sendIt();
    expect(await screen.findByText(strings['outcome.pending.ask'])).toBeTruthy();
    r.rerender(<AiDrawer isOpen={false} {...props} />);
    r.rerender(<AiDrawer isOpen {...props} />);
    world.check = async () => ({ outcome: 'done', data: { reply: REPLY } });
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText('Greets the caller')).toBeTruthy();
    expect(world.vals.size).toBe(0);
  });

  it('what an ended ask was masked with is released: a later answer at the place is not unmasked with it', async () => {
    world.mutate = async () => ({ outcome: 'pending', code: 'REPLY_UNREADABLE' });
    drawer();
    await sendIt();
    await screen.findByText(strings['outcome.pending.ask']);
    world.check = async () => ({ outcome: 'failed', code: 'cancelled' });
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText(strings['ai.err.cancelled'])).toBeTruthy();
    // another ask is open at the place now (an earlier view's, or another tab's): this view has no placeholders for it
    world.unsettled = true;
    world.check = async () => ({ outcome: 'done', data: { reply: REPLY } });
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText(strings['ai.err.reopened'])).toBeTruthy();
    expect(screen.queryByText('Greets the caller')).toBeNull();
  });

  it('what a pending ask was masked with is released when another view or tab ends the ask: a later answer at the place is not unmasked with it', async () => {
    world.mutate = async () => ({ outcome: 'pending', code: 'REPLY_UNREADABLE' });
    drawer();
    await sendIt();
    await screen.findByText(strings['outcome.pending.ask']);
    // another tab delivered (or closed) the ask: the store no longer holds it and the banner follows
    await act(async () => { world.endAsk(); });
    await vi.waitFor(() => expect(screen.queryByText(strings['outcome.pending.ask'])).toBeNull());
    // an ask is open at the place again, one this view made no placeholders for (here the same name, as the fake keeps one)
    await act(async () => { world.unsettled = true; });
    world.check = async () => ({ outcome: 'done', data: { reply: REPLY } });
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText(strings['ai.err.reopened'])).toBeTruthy();
    expect(screen.queryByText('Greets the caller')).toBeNull();
    expect(world.validates).toBe(0);
  });

  it('what a pending ask was masked with is released when the person closes it knowingly', async () => {
    world.mutate = async () => ({ outcome: 'pending', code: 'REPLY_UNREADABLE' });
    drawer();
    await sendIt();
    await screen.findByText(strings['outcome.pending.ask']);
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    await userEvent.click(await screen.findByText(strings['force.label']));
    await userEvent.click(await screen.findByRole('button', { name: strings['force.confirm'] }));
    await vi.waitFor(() => expect(world.discards).toHaveLength(1));
    await vi.waitFor(() => expect(screen.queryByText(strings['outcome.pending.ask'])).toBeNull());
    world.unsettled = true;
    world.check = async () => ({ outcome: 'done', data: { reply: REPLY } });
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText(strings['ai.err.reopened'])).toBeTruthy();
    expect(screen.queryByText('Greets the caller')).toBeNull();
  });

  it('an answer of another ask than the one these placeholders were made for is not applied: the hidden values are never put back into it', async () => {
    world.mutate = async () => ({ outcome: 'pending', code: 'REPLY_UNREADABLE' });
    drawer();
    await sendIt();
    await screen.findByText(strings['outcome.pending.ask']);
    // another view closed that ask and made a new one at the place; this view's check reads the new ask's answer
    world.cur = 'ask-2';
    world.check = async () => ({ outcome: 'done', data: { reply: REPLY } });
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText(strings['ai.err.reopened'])).toBeTruthy();
    expect(screen.queryByText('Greets the caller')).toBeNull();
    expect(world.validates).toBe(0);
  });

  it('an answer of the same ask the placeholders were made for is applied', async () => {
    world.mutate = async () => ({ outcome: 'pending', code: 'REPLY_UNREADABLE' });
    drawer();
    await sendIt();
    await screen.findByText(strings['outcome.pending.ask']);
    world.check = async () => ({ outcome: 'done', data: { reply: REPLY } });
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText('Greets the caller')).toBeTruthy();
  });

  it('a press that continued another ask answers with that ask\'s reply: the secrets this press hid are not put into it, and nothing is proposed', async () => {
    world.mutate = async () => { const a: Ans = { outcome: 'done', data: { reply: REPLY } }; world.joined.add(a); return a; };
    drawer();
    await sendIt();
    expect(await screen.findByText(strings['ai.err.joined'])).toBeTruthy();
    expect(screen.queryByText('Greets the caller')).toBeNull();
    expect(world.validates).toBe(0);
  });

  it('a press that continued another ask and found it still out holds no placeholders for it: its later answer is not applied either', async () => {
    world.mutate = async () => { const a: Ans = { outcome: 'pending', code: 'REPLY_UNREADABLE' }; world.joined.add(a); return a; };
    drawer();
    await sendIt();
    await screen.findByText(strings['outcome.pending.ask']);
    world.check = async () => ({ outcome: 'done', data: { reply: REPLY } });
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText(strings['ai.err.reopened'])).toBeTruthy();
    expect(screen.queryByText('Greets the caller')).toBeNull();
    expect(world.validates).toBe(0);
  });

  it('a reply that comes in after the drawer was closed is not claimed, proposed or reviewed: it stays for the next view', async () => {
    let reply: (a: Ans) => void = () => undefined;
    world.mutate = () => new Promise<Ans>((r) => { reply = r; });
    const props = { onClose: () => undefined, item, comp: comp(), current: CURRENT, failure: undefined, onUse: () => undefined };
    const r = render(<AiDrawer isOpen {...props} />);
    await sendIt();
    await vi.waitFor(() => expect(world.asks).toHaveLength(1));
    r.rerender(<AiDrawer isOpen={false} {...props} />);
    await act(async () => { reply({ outcome: 'done', data: { reply: REPLY } }); });
    r.rerender(<AiDrawer isOpen {...props} />);
    expect(screen.queryByText('Greets the caller')).toBeNull();
    expect(world.validates).toBe(0);
    expect(world.acks).toHaveLength(0);
    // the view that is away never even tries the claim
    expect(world.claimCalls).toBe(0);
  });

  it('a reply that comes in after the drawer was closed and opened again is not proposed: the drawer moved on from the press that asked', async () => {
    let reply: (a: Ans) => void = () => undefined;
    world.mutate = () => new Promise<Ans>((r) => { reply = r; });
    const props = { onClose: () => undefined, item, comp: comp(), current: CURRENT, failure: undefined, onUse: () => undefined };
    const r = render(<AiDrawer isOpen {...props} />);
    await sendIt();
    await vi.waitFor(() => expect(world.asks).toHaveLength(1));
    r.rerender(<AiDrawer isOpen={false} {...props} />);
    r.rerender(<AiDrawer isOpen {...props} />);
    await act(async () => { reply({ outcome: 'done', data: { reply: REPLY } }); });
    expect(await screen.findByText(strings['ai.err.reopened'])).toBeTruthy();
    expect(screen.queryByText('Greets the caller')).toBeNull();
    expect(world.validates).toBe(0);
  });

  it('a review of an earlier proposal that comes back while the next ask is out does not make the next proposal ready', async () => {
    const REPLY2 = REPLY.replace('Greets the caller', 'Greets nobody');
    const gates: Array<(v: unknown) => void> = [];
    world.validate = () => new Promise((r) => { gates.push(r); });
    let second: (a: Ans) => void = () => undefined;
    let n = 0;
    world.mutate = () => (++n === 1 ? Promise.resolve({ outcome: 'done', data: { reply: REPLY } } as Ans) : new Promise<Ans>((r) => { second = r; }));
    drawer();
    await sendIt();
    expect(await screen.findByText('Greets the caller')).toBeTruthy();
    await vi.waitFor(() => expect(gates).toHaveLength(1));
    await userEvent.click(await screen.findByRole('button', { name: strings['ai.send'] }));
    await vi.waitFor(() => expect(world.asks).toHaveLength(2));
    await act(async () => { gates[0]!({ data: { publishable: true, results: {} } }); });
    await act(async () => { second({ outcome: 'done', data: { reply: REPLY2 } }); });
    expect(await screen.findByText('Greets nobody')).toBeTruthy();
    expect(screen.queryByText(strings['review.ready'])).toBeNull();
    expect((await screen.findByRole('button', { name: strings['ai.use'] }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a review that answers for an older proposal does not make the newer one ready', async () => {
    const REPLY2 = REPLY.replace('Greets the caller', 'Greets nobody');
    const gates: Array<(v: unknown) => void> = [];
    world.validate = () => new Promise((r) => { gates.push(r); });
    const replies = [REPLY, REPLY2];
    world.mutate = async () => ({ outcome: 'done', data: { reply: replies.shift()! } });
    drawer();
    await sendIt();
    expect(await screen.findByText('Greets the caller')).toBeTruthy();
    await vi.waitFor(() => expect(gates).toHaveLength(1));
    await userEvent.click(await screen.findByRole('button', { name: strings['ai.send'] }));
    expect(await screen.findByText('Greets nobody')).toBeTruthy();
    await vi.waitFor(() => expect(gates).toHaveLength(2));
    const ready = { data: { publishable: true, results: {} } };
    await act(async () => { gates[0]!(ready); });
    expect(screen.queryByText(strings['review.ready'])).toBeNull();
    expect((await screen.findByRole('button', { name: strings['ai.use'] }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { gates[1]!(ready); });
    expect(await screen.findByText(strings['review.ready'])).toBeTruthy();
    expect((await screen.findByRole('button', { name: strings['ai.use'] }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('the pending ask of the drawer can be closed with the warning, and Send works again', async () => {
    world.unsettled = true;
    drawer();
    await screen.findByText(strings['outcome.pending.ask']);
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    await userEvent.click(await screen.findByText(strings['force.label']));
    await userEvent.click(await screen.findByRole('button', { name: strings['force.confirm'] }));
    await vi.waitFor(() => expect(world.discards).toHaveLength(1));
    expect(world.discards[0]).toMatchObject({ compId: 'c1', path: 'a.ts', realm: 'global', owner: 'fp1' });
    await vi.waitFor(() => expect(screen.queryByText(strings['outcome.pending.ask'])).toBeNull());
    await userEvent.type(await screen.findByRole('textbox', { name: strings['ai.ask'] }), 'x');
    expect((await screen.findByRole('button', { name: strings['ai.send'] }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a failed ask proposes nothing and says why', async () => {
    world.mutate = async () => ({ outcome: 'failed', code: 'cancelled' });
    drawer();
    await sendIt();
    expect(await screen.findByText(strings['ai.err.cancelled'])).toBeTruthy();
    expect(screen.queryByText('Greets the caller')).toBeNull();
    expect(world.validates).toBe(0);
  });

  it('with no assistant, Send is disabled and the note says why', async () => {
    world.agent = { templates: true, writer: false, guardedDelete: true, writerWhy: 'account' };
    drawer();
    await userEvent.type(await screen.findByRole('textbox', { name: strings['ai.ask'] }), 'x');
    expect((await screen.findByRole('button', { name: strings['ai.send'] }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(strings['new.writerOtherAccount'].replace('{{computer}}', 'atlas'))).not.toBeNull();
  });

  // The proposal's result is one Verdict plate, its problems a kit list, and the drawer has one primary.
  it('a proposal that needs a fix: the plate marks it, the problems are a kit list with their lines, Use stays off', async () => {
    world.validate = async () => ({ data: { publishable: false, results: { typecheck: { errors: [{ line: 2, message: 'Cannot find name x' }] } } } });
    drawer();
    await sendIt();
    expect(await screen.findByText(strings['review.needsFix'])).toBeTruthy();
    const list = await screen.findByRole('list', { name: strings['ai.problems'] });
    // The kit problem list: the line spoken as "Line 2", then the message (the drawer has no editor to jump to).
    const row = within(list).getAllByRole('listitem')[0]!;
    expect(row.textContent).toContain('Line 2');
    expect(row.textContent).toContain('Cannot find name x');
    expect(within(list).queryByRole('button')).toBeNull();
    expect((screen.getByRole('button', { name: strings['ai.use'] }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('while the proposal is being checked the plate says so, and Use stays off', async () => {
    world.validate = () => new Promise(() => undefined);
    drawer();
    await sendIt();
    expect(await screen.findByText(strings['ai.checking'])).toBeTruthy();
    expect((screen.getByRole('button', { name: strings['ai.use'] }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a check that gives no answer: the plate says nothing is known, and Use stays off', async () => {
    world.validate = async () => null;
    drawer();
    await sendIt();
    expect(await screen.findByText(strings['ai.unchecked'])).toBeTruthy();
    expect((screen.getByRole('button', { name: strings['ai.use'] }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('what is worth knowing about a proposal is a kit list, and the drawer has one primary button', async () => {
    world.mutate = async () => ({ outcome: 'done', data: { reply: REPLY.replace('```ts\n', '```ts\n// @schedule */5 * * * *\n') } });
    drawer();
    await sendIt();
    await screen.findByText(strings['review.ready']);
    expect(screen.getByRole('list', { name: strings['code.worthKnowing'] })).toBeTruthy();
    expect(document.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
  });
});

describe('a Check again, or an ask, that comes back after the place has changed', () => {
  // (Closes and claims by other views are tested over the real store, in parts/useAsk.store.test.tsx: this double has no store.)
  beforeEach(reset);
  const compOf = (id: string, realm = 'global') => ({ id, agentRealm: realm, agent: { writer: true, writerOwner: 'fp1' } }) as never;
  const mount = () => renderHook((p: { scope: string; comp: unknown }) => useAsk(p.scope, p.comp as never, null), { initialProps: { scope: 'sA', comp: compOf('cA') } });
  const pendingNow = async (r: { current: ReturnType<typeof useAsk> }) => { await vi.waitFor(() => expect(r.current.out?.kind).toBe('pending')); };
  const REALM_B = 'bbbbbbbbbbbbbbbbbbbbbbb2';

  it('a late answer of the first place neither clears the pending banner of the place shown now nor is handed to it: it stays at its own place, not acknowledged', async () => {
    world.unsettled = true;
    const { result, rerender } = mount();
    await pendingNow(result);
    let release: (a: Ans) => void = () => undefined;
    world.check = () => new Promise<Ans>((r) => { release = r; });
    let late: Promise<unknown> = Promise.resolve();
    await act(async () => { late = result.current.check(); });
    rerender({ scope: 'sB', comp: compOf('cB') });
    await pendingNow(result);
    await act(async () => { release({ outcome: 'done', data: { reply: REPLY } }); });
    expect(await late).toBeNull();
    expect(result.current.out?.kind).toBe('pending');
    expect(result.current.locked).toBe(true);
    expect(world.acks).toHaveLength(0);
  });

  it('the same answer is handed over, acknowledged and the banner settled, when the place did not change', async () => {
    world.unsettled = true;
    const { result } = mount();
    await pendingNow(result);
    const ans: Ans = { outcome: 'done', data: { reply: REPLY } };
    world.check = async () => ans;
    let got: unknown = null;
    await act(async () => { got = await result.current.check(); });
    expect(got).toMatchObject({ outcome: 'done', reply: REPLY });
    expect(world.acks).toHaveLength(1);
    expect(world.acks[0]).toBe(ans);
    await vi.waitFor(() => expect(result.current.out).toBeNull());
  });

  it('a pending answer, or one cut off, is not acknowledged: its run is still open at its place', async () => {
    world.unsettled = true;
    const { result, rerender } = mount();
    await pendingNow(result);
    let release: (a: Ans) => void = () => undefined;
    world.check = () => new Promise<Ans>((r) => { release = r; });
    let late: Promise<unknown> = Promise.resolve();
    await act(async () => { late = result.current.check(); });
    rerender({ scope: 'sB', comp: compOf('cB') });
    await act(async () => { release({ outcome: 'pending', code: 'TURN_RUNNING' }); });
    expect(await late).toBeNull();
    expect(world.acks).toHaveLength(0);
  });

  for (const [what, next] of [['the scope only', { scope: 'sB', comp: compOf('cA') }], ['the place only', { scope: 'sA', comp: compOf('cB') }], ['the realm only', { scope: 'sA', comp: compOf('cA', REALM_B) }]] as const) {
    it(`a late Check again after ${what} changed is neither settled, handed over nor acknowledged`, async () => {
      world.unsettled = true;
      const { result, rerender } = mount();
      await pendingNow(result);
      let release: (a: Ans) => void = () => undefined;
      world.check = () => new Promise<Ans>((r) => { release = r; });
      let late: Promise<unknown> = Promise.resolve();
      await act(async () => { late = result.current.check(); });
      rerender(next);
      await pendingNow(result);
      await act(async () => { release({ outcome: 'done', data: { reply: REPLY } }); });
      expect(await late).toBeNull();
      expect(world.acks).toHaveLength(0);
      expect(result.current.out?.kind).toBe('pending');
    });
  }

  it('a press whose answer comes back after the view moved shows it nowhere, acknowledges nothing, and leaves the banner of the place shown alone', async () => {
    const { result, rerender } = mount();
    let release: (a: Ans) => void = () => undefined;
    world.mutate = () => new Promise<Ans>((r) => { release = r; });
    let asked: Promise<unknown> = Promise.resolve();
    await act(async () => { asked = result.current.ask('words'); });
    rerender({ scope: 'sB', comp: compOf('cB') });
    await act(async () => { release({ outcome: 'done', data: { reply: REPLY } }); });
    expect(await asked).toBeNull();
    expect(world.acks).toHaveLength(0);
    expect(result.current.out).toBeNull();
  });

  it('a press whose answer comes back to the place that asked is acknowledged and handed over', async () => {
    const { result } = mount();
    const ans: Ans = { outcome: 'done', data: { reply: REPLY } };
    world.mutate = async () => ans;
    let got: unknown = null;
    await act(async () => { got = await result.current.ask('words'); });
    expect(got).toMatchObject({ outcome: 'done', reply: REPLY });
    expect(world.acks).toHaveLength(1);
    expect(world.acks[0]).toBe(ans);
  });

  it('a press whose view is gone when the answer comes back acknowledges nothing: the answer stays at its place', async () => {
    const { result, unmount } = mount();
    let release: (a: Ans) => void = () => undefined;
    world.mutate = () => new Promise<Ans>((r) => { release = r; });
    let asked: Promise<unknown> = Promise.resolve();
    await act(async () => { asked = result.current.ask('words'); });
    unmount();
    await act(async () => { release({ outcome: 'done', data: { reply: REPLY } }); });
    expect(await asked).toBeNull();
    expect(world.acks).toHaveLength(0);
  });

  it('closing one place knowingly does not swallow the answer of an ask still out at another place of the same view', async () => {
    const { result, rerender } = mount();
    let release: (a: Ans) => void = () => undefined;
    world.mutate = () => new Promise<Ans>((r) => { release = r; });
    let asked: Promise<unknown> = Promise.resolve();
    await act(async () => { asked = result.current.ask('words'); });
    // at place B (which holds an ask left unsettled by an earlier view) the person closes that ask knowingly
    world.unsettled = true;
    rerender({ scope: 'sB', comp: compOf('cB') });
    await pendingNow(result);
    await act(async () => { result.current.force(); });
    expect(world.discards).toHaveLength(1);
    // back at A, its ask is still out: the answer comes to the view that shows A, which takes it
    world.unsettled = false;
    rerender({ scope: 'sA', comp: compOf('cA') });
    const ans: Ans = { outcome: 'done', data: { reply: REPLY } };
    await act(async () => { release(ans); });
    expect(await asked).toMatchObject({ outcome: 'done', reply: REPLY });
    expect(world.acks).toHaveLength(1);
    expect(world.acks[0]).toBe(ans);
  });

  it('two overlapping Check again calls that hold the same answer deliver it once: the second settles and returns nothing', async () => {
    world.unsettled = true;
    const { result } = mount();
    await pendingNow(result);
    const ans: Ans = { outcome: 'done', data: { reply: REPLY } };
    let release: (a: Ans) => void = () => undefined;
    world.check = () => new Promise<Ans>((r) => { release = r; });
    let first: Promise<unknown> = Promise.resolve();
    let second: Promise<unknown> = Promise.resolve();
    await act(async () => { first = result.current.check(); });
    const releaseFirst = release;
    await act(async () => { second = result.current.check(); });
    await act(async () => { releaseFirst(ans); release(ans); });
    const got = [await first, await second];
    expect(got.filter((g) => g !== null)).toHaveLength(1);
    expect(got.find((g) => g !== null)).toMatchObject({ outcome: 'done', reply: REPLY });
    expect(world.acks).toHaveLength(1);
  });

  it('the view that loses the claim on an answer another view delivered is freed: its banner follows the place, which holds nothing now', async () => {
    world.unsettled = true;
    const x = mount();
    const y = mount();
    await pendingNow(x.result);
    await pendingNow(y.result);
    const ans: Ans = { outcome: 'done', data: { reply: REPLY } };
    const gates: Array<(a: Ans) => void> = [];
    world.check = () => new Promise<Ans>((r) => { gates.push(r); });
    let cx: Promise<unknown> = Promise.resolve();
    let cy: Promise<unknown> = Promise.resolve();
    await act(async () => { cx = x.result.current.check(); });
    await act(async () => { cy = y.result.current.check(); });
    await act(async () => { gates.forEach((g) => g(ans)); });
    const got = [await cx, await cy];
    expect(got.filter((g) => g !== null)).toHaveLength(1);
    expect(world.acks).toHaveLength(1);
    await vi.waitFor(() => { expect(x.result.current.out).toBeNull(); expect(y.result.current.out).toBeNull(); });
    expect(y.result.current.locked).toBe(false);
  });

  it('a press whose answer another view already delivered is not delivered again, and shows no second banner for it', async () => {
    const x = mount();
    const ans: Ans = { outcome: 'failed', code: 'NO_REPLY' };
    let releaseX: (a: Ans) => void = () => undefined;
    world.mutate = () => new Promise<Ans>((r) => { releaseX = r; });
    let asked: Promise<unknown> = Promise.resolve();
    await act(async () => { asked = x.result.current.ask('words'); });
    // another view of the same place reads the same answer first and delivers it
    world.unsettled = true;
    const y = mount();
    await pendingNow(y.result);
    world.check = async () => ans;
    await act(async () => { await y.result.current.check(); });
    expect(world.acks).toHaveLength(1);
    await act(async () => { releaseX(ans); });
    expect(await asked).toBeNull();
    expect(world.acks).toHaveLength(1);
    await vi.waitFor(() => expect(x.result.current.out).toBeNull());
    expect(x.result.current.locked).toBe(false);
  });

  it('a late ask with the scope unchanged but the realm changed leaves the banner of the new realm alone', async () => {
    const { result, rerender } = mount();
    let release: (a: Ans) => void = () => undefined;
    world.mutate = () => new Promise<Ans>((r) => { release = r; });
    let asked: Promise<unknown> = Promise.resolve();
    await act(async () => { asked = result.current.ask('words'); });
    world.unsettled = true;
    rerender({ scope: 'sA', comp: compOf('cA', REALM_B) });
    await pendingNow(result);
    await act(async () => { release({ outcome: 'stale', code: 'STALE' }); });
    expect(await asked).toBeNull();
    expect(result.current.out?.kind).toBe('pending');
    expect(result.current.locked).toBe(true);
    expect(world.acks).toHaveLength(0);
  });
});
