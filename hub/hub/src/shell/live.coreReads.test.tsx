// A change that declares coreReads [computersPage] makes the top bar's list
// (the shell's read, one cache entry with computersPage, staleTime 30 s) read again wherever the change is proved:
// an immediate done answer, and a pending answer later proved by a read-back. A pending answer whose read-back proves
// nothing reads it no more than the read-back itself did: no loop.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { answers, bootFixtureCore, capture, computerChoiceRev, computersPage, coreSource, defineRoute, fixtureWorld, queryClient, reply, sendProved } from '@core';

type ReadVerdict = 'applied' | 'not_applied' | undefined;
import { containersRoute } from '@core/shell';
import { useShellData } from './context';
import { LiveShellData } from './live';

const W = fixtureWorld;
const realm = W.realms[0]!.id;
const base = { project_id: W.projects[0]!.id, server_name: 'sv1', status: 'running', realm_ids: [realm] };
const A = { id: 'c-aaaaaaaaaaaaaaaaaaaaaaa', name: 'atlas', ...base };
const Bn = { id: 'c-bbbbbbbbbbbbbbbbbbbbbbb', name: 'birch', ...base };
const makeRoute = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/projects/:pid/computers', scope: 'realm', body: ['name'] });

let made = false;
let listReads = 0;
function rules(post: Parameters<typeof reply>[1]) {
  return [
    reply(makeRoute, (() => { made = true; return typeof post === 'function' ? (post as () => unknown)() : post; }) as never),
    reply(containersRoute, () => { listReads += 1; return answers.ok({ data: { computers: made ? [A, Bn] : [A], pagination: { totalPages: 1 } } }); }),
  ];
}

function sourceWith(verdict: (names: string[]) => ReadVerdict, withCore = true) {
  return coreSource('liveCoreReads' + Math.random().toString(36).slice(2), {
    reads: { list: { route: containersRoute, input: () => ({ query: { page: 1, limit: 50 } }), select: (raw: unknown) => (((raw as { data?: { computers?: { name: string }[] } }).data?.computers) ?? []).map((c) => c.name) } },
    changes: {
      make: {
        route: makeRoute, input: (v: { name: string }) => ({ params: { pid: 'p1' }, body: v }), reads: ['list'],
        lock: 'test.liveCoreReads', lockKey: (v: { name: string }) => ({ name: v.name }),
        proves: (_i: unknown, a: readonly (readonly unknown[])[]) => verdict(((a[0] ?? []) as string[][]).flat()),
        ...(withCore ? { coreReads: [computersPage] } : {}),
      },
    },
  });
}

let send!: (name: string) => Promise<{ outcome: string; hold?: string }>;
let complete!: (name: string, hold: string) => Promise<boolean>;
function mount(src: ReturnType<typeof sourceWith>) {
  function Probe() {
    const d = useShellData();
    src.useQuery('list');
    const m = src.useMutation<unknown, { name: string }>('make');
    send = (name) => m.mutateAsync({ name });
    complete = (name, hold) => (m as unknown as { complete: (v: { name: string }, h: string) => Promise<boolean> }).complete({ name }, hold);
    return <p data-testid="count">{d.computersRead ? d.computersRead : d.computers.length}</p>;
  }
  render(<QueryClientProvider client={queryClient}><LiveShellData><Probe /></LiveShellData></QueryClientProvider>);
}
const count = () => screen.getByTestId('count').textContent;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 120)); });
const has = (n: string) => (names: string[]) => (names.includes(n) ? 'applied' as const : undefined);

describe('a proved change reads the top bar list again', () => {
  beforeEach(() => { made = false; listReads = 0; queryClient.clear(); });
  afterEach(() => cleanup());

  it('1. an immediate done: the shared list reaches N+1 well under its 30 s staleness, with no visit to Home', async () => {
    bootFixtureCore({ rules: rules(answers.ok({ data: {} })) });
    mount(sourceWith(has('birch')));
    await waitFor(() => expect(count()).toBe('1'));
    let r!: { outcome: string };
    await act(async () => { r = await send('birch'); });
    expect(r.outcome).toBe('done');
    await waitFor(() => expect(count()).toBe('2'), { timeout: 3000 });
  });

  it('2. a pending create later proved by its read-back: the shared list reaches N+1 too', async () => {
    bootFixtureCore({ rules: rules(answers.pending5xx(502)) });
    mount(sourceWith(has('birch')));
    await waitFor(() => expect(count()).toBe('1'));
    let r!: { outcome: string };
    await act(async () => { r = await send('birch'); });
    expect(r.outcome).toBe('pending');
    await waitFor(() => expect(count()).toBe('2'), { timeout: 3000 });
  });

  it('a pending answer whose read-back proves nothing leaves the top bar list as it was, and reads it no more', async () => {
    bootFixtureCore({ rules: rules(answers.pending5xx(502)) });
    mount(sourceWith(() => undefined));
    await waitFor(() => expect(count()).toBe('1'));
    await act(async () => { await send('birch'); });
    await settle();
    const after = listReads;
    await settle();
    await settle();
    expect(count()).toBe('1');
    expect(listReads).toBe(after);
  });

  it('a change without coreReads leaves the top bar list on its cache (the declaration is what reads it again)', async () => {
    bootFixtureCore({ rules: rules(answers.ok({ data: {} })) });
    mount(sourceWith(has('birch'), false));
    await waitFor(() => expect(count()).toBe('1'));
    await act(async () => { await send('birch'); });
    await settle();
    await settle();
    expect(count()).toBe('1');
  });

  it('the shell\'s own pick of a computer is not the person\'s: computerChoiceRev does not move', async () => {
    bootFixtureCore({ target: null, rules: rules(answers.ok({ data: {} })) });
    const r0 = computerChoiceRev();
    mount(sourceWith(has('birch')));
    await waitFor(() => expect(capture().target?.container.id).toBe(A.id));
    expect(computerChoiceRev()).toBe(r0);
  });

  it('sendProved: a pending send that its read-back proves applied answers true, once', async () => {
    bootFixtureCore({ rules: rules(answers.pending5xx(502)) });
    mount(sourceWith(has('birch')));
    await waitFor(() => expect(count()).toBe('1'));
    let r!: { outcome: string; hold?: string };
    await act(async () => { r = await send('birch'); });
    expect(r.outcome).toBe('pending');
    expect(typeof r.hold).toBe('string');
    let ok: boolean | undefined;
    await act(async () => { ok = await sendProved(r.hold!); });
    expect(ok).toBe(true);
    expect(await sendProved(r.hold!)).toBe(false);
  });

  it('sendProved: a pending send whose read-back proves nothing answers false', async () => {
    bootFixtureCore({ rules: rules(answers.pending5xx(502)) });
    mount(sourceWith(() => undefined));
    await waitFor(() => expect(count()).toBe('1'));
    let r!: { outcome: string; hold?: string };
    await act(async () => { r = await send('birch'); });
    let ok: boolean | undefined;
    await act(async () => { ok = await sendProved(r.hold!); });
    expect(ok).toBe(false);
  });

  it('a pending change the page itself proves (complete) reads the top bar list again too', async () => {
    bootFixtureCore({ rules: rules(answers.pending5xx(502)) });
    mount(sourceWith(() => undefined));
    await waitFor(() => expect(count()).toBe('1'));
    let r!: { outcome: string; hold?: string };
    await act(async () => { r = await send('birch'); });
    await settle();
    expect(count()).toBe('1');
    let ok: boolean | undefined;
    await act(async () => { ok = await complete('birch', r.hold!); });
    expect(ok).toBe(true);
    await waitFor(() => expect(count()).toBe('2'), { timeout: 3000 });
  });
});
