// TODO actions on a live page: the real core over a fake fetch, every request counted. Run and Approve confirm
// that a worker starts unattended; Deny starts nothing; a TODO a worker holds reads "Claimed by a worker" and offers only
// Cancel run (no claim or release from the Hub); cancel run's outcome is the run_end of the run it was sent for, read
// back after the answer; a lost answer stays unknown until a read shows the effect, and is never sent again. A confirm
// is bound to the attempt it was opened for (confirm.ts): the send reads the
// TODO again and sends nothing if the run, proposal or revision moved; a capability change or a proposal's expiry
// discards the confirm in an update, and it never comes back.
// eslint-disable-next-line no-restricted-imports -- a router harness for the list's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryClient } from '@core';
import { boot, calls, onFetch, settle, type Call, type Reply } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetKeptForTests } from '../kept';
import { TodosList } from './List';
import strings from './Actions.strings.en.json';
import listStrings from './List.strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const NOW = () => new Date().toISOString();
const todo = (o: Record<string, unknown>) => ({ num: 1, state: 'ready', priority: 2, rank: 1, cwd: '/w', source: { kind: 'manual' }, created_at: '2026-10-27T08:00:00Z', updated_at: '2026-10-27T09:00:00Z', realm: R1, revision: 1, ...o });
let items: Array<Record<string, unknown>> = [];
let full: Record<string, Record<string, unknown>> = {};
let writes: Record<string, (c: Call) => Reply> = {};

const path = (u: string) => new URL(u).pathname;
const writeCalls = () => calls.filter((c) => c.method !== 'GET');
const reads = (id: string) => calls.filter((c) => c.method === 'GET' && path(c.url).endsWith(`/todos/${id}`)).length;
const flush = async () => {
  for (let i = 0; i < 20; i++) await act(async () => { await settle(); });
};
async function show(id: string, tab = 'open') {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <TodosList computer="atlas" /> }),
    history: createMemoryHistory({ initialEntries: [`/ai/auto/todos?tab=${tab}&sel=${encodeURIComponent(`${R1}/${id}`)}`] }),
  });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  await flush();
  return router;
}
const press = async (name: string | RegExp, root?: HTMLElement) => {
  await userEvent.click((root ? within(root) : screen).getByRole('button', { name }));
  await flush();
};
const dialog = () => screen.getByRole('alertdialog');

/** The kit StatusLine (one stays mounted; its words change): a role=status p with its own aria-live. */
const statusLines = (root: ParentNode = document) => [...root.querySelectorAll('p[role="status"][aria-live]')] as HTMLElement[];

beforeEach(() => {
  boot({ realm: R1 });
  resetKeptForTests();
  queryClient.clear();
  writes = {};
  items = [
    todo({ id: 'todo_a', num: 1, title: 'Rotate the staging credentials' }),
    todo({ id: 'todo_b', num: 2, title: 'Prune the old snapshots' }),
    todo({ id: 'todo_c', num: 3, title: 'Upgrade the database', state: 'in_progress', lease: { daemon_id: 'd', session_id: 'w1', acquired_at: '2026-10-29T11:00:00Z', expires_at: '2026-10-29T11:02:00Z' } }),
    todo({ id: 'todo_e', num: 5, title: 'Write the release notes', state: 'done', closed_at: '2026-10-26T00:00:00Z' }),
  ];
  full = {
    todo_a: { ...items[0], proposals: [{ id: 'prop_1', action: 'run_worker', agent: 'implementer', prompt: 'Rotate them', status: 'pending', todo_revision: 1, created_at: 'x', expires_at: 'y' }] },
    todo_b: { ...items[1] },
    todo_c: { ...items[2], timeline: [{ id: 'e1', ts: '2026-10-29T11:00:00Z', kind: 'run_start', actor: { kind: 'worker' }, meta: { session: 'w1' } }] },
    todo_e: { ...items[3], proposals: [{ id: 'prop_9', status: 'pending', agent: 'x' }] },
  };
  onFetch((c) => {
    const p = path(c.url);
    if (c.method === 'GET' && p.endsWith('/agent/todos')) return { status: 200, body: { items, meta: { total: items.length }, revision: 3 } };
    if (c.method === 'GET' && p.endsWith('/agent/todos/revision')) return { status: 200, body: { revision: 3 } };
    const m = /\/agent\/todos\/([^/]+)$/.exec(p);
    if (c.method === 'GET' && m) {
      const t = full[m[1]!];
      return t ? { status: 200, body: { status: 'ok', todo: t } } : { status: 404, body: { error: 'not found', code: 'not_found' } };
    }
    const w = writes[`${c.method} ${p.replace(/^.*\/agent/, '')}`];
    if (w) return w(c);
    return { status: 404, body: { code: 'not_found', error: 'nope' } };
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** A proposal deadline the test's own run time cannot reach, however loaded the machine: the clock (Date and timers) is
 *  faked and still runs (1 ms steps, so a settle turn costs no more than on the real clock), the deadline is 60 s out (the
 *  per-test timeout is 15 s), and passTo moves the clock past it. */
const expiresSoon = () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true, advanceTimeDelta: 1 });
  return Date.now() + 60_000;
};
const passTo = async (exp: number) => {
  await act(async () => {
    vi.advanceTimersByTime(Math.max(0, exp - Date.now()) + 200);
  });
};

describe('run', () => {
  it('confirms that the worker runs unattended, then sends one run in the TODO realm', async () => {
    writes['POST /todos/todo_a/run'] = () => ({ status: 202, body: { job_id: 'j1', session_id: 'w9' } });
    await show('todo_a');
    await press(strings['a.run']);
    expect(within(dialog()).getByText(strings['run.effect'])).toBeTruthy();
    expect(writeCalls()).toHaveLength(0);
    await press(strings['run.confirm'], dialog());
    const w = writeCalls();
    expect(w.map((c) => `${c.method} ${path(c.url).replace(/^.*\/agent/, '')}`)).toEqual(['POST /todos/todo_a/run']);
    expect(new URL(w[0]!.url).searchParams.get('realm')).toBe(R1);
    expect(screen.getByText(strings['o.done.run'])).toBeTruthy();
  });

  it('a lost run is never sent again, nor settled: Check shows a run_start it reads, and the run stays unknown', async () => {
    writes['POST /todos/todo_a/run'] = () => ({ status: 0, network: true });
    await show('todo_a');
    await press(strings['a.run']);
    await press(strings['run.confirm'], dialog());
    expect(screen.getByText(strings['o.unsure'])).toBeTruthy();
    expect(screen.getByText(strings['o.unsure.start'])).toBeTruthy();
    expect(screen.getByRole('button', { name: strings['a.run'] }).hasAttribute('disabled') || screen.getByRole('button', { name: strings['a.run'] }).getAttribute('aria-disabled') === 'true').toBe(true);
    await press(/Check again/);
    expect(screen.getByText(strings['o.run.never'])).toBeTruthy();
    full.todo_a = { ...full.todo_a, lease: { daemon_id: 'd', acquired_at: NOW(), expires_at: NOW() } };
    await press(/Check again/);
    expect(screen.getByText(strings['o.run.never'])).toBeTruthy();
    full.todo_a = { ...full.todo_a, timeline: [{ id: 'r1', ts: NOW(), kind: 'run_start', actor: { kind: 'daemon' }, body: 'worker implementer started (todos.run RPC)' }] };
    await press(/Check again/);
    expect(screen.getByText(/A worker started at .*: this run or another/)).toBeTruthy();
    expect(screen.getByText(strings['o.unsure'])).toBeTruthy();
    expect(screen.queryByText(strings['o.done.run'])).toBeNull();
    expect(screen.getByRole('button', { name: strings['o.forget'] })).toBeTruthy();
    expect(writeCalls()).toHaveLength(1);
  });

  it('a confirm opened on one TODO closes when another is selected, and sends nothing', async () => {
    writes['POST /todos/todo_a/run'] = () => ({ status: 202, body: { job_id: 'j1', session_id: 'w9' } });
    writes['POST /todos/todo_b/run'] = () => ({ status: 202, body: { job_id: 'j2', session_id: 'w8' } });
    const router = await show('todo_a');
    await press(strings['a.run']);
    expect(dialog()).toBeTruthy();
    await act(async () => {
      router.history.push(`/ai/auto/todos?tab=open&sel=${encodeURIComponent(`${R1}/todo_b`)}`);
    });
    await flush();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(writeCalls()).toHaveLength(0);
  });

  it('a Run confirm closes when the TODO is claimed meanwhile, and sends nothing', async () => {
    writes['POST /todos/todo_a/run'] = () => ({ status: 202, body: { job_id: 'j1', session_id: 'w9' } });
    await show('todo_a');
    await press(strings['a.run']);
    expect(dialog()).toBeTruthy();
    const lease = { daemon_id: 'd', session_id: 'w5', acquired_at: NOW(), expires_at: NOW() };
    items = items.map((x) => (x.id === 'todo_a' ? { ...x, state: 'in_progress', lease } : x));
    full.todo_a = { ...full.todo_a, state: 'in_progress', lease };
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await flush();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(writeCalls()).toHaveLength(0);
  });

  it('a refused run starts nothing and says so', async () => {
    writes['POST /todos/todo_a/run'] = () => ({ status: 400, body: { code: 'bad_request', error: 'TODO #1 is already claimed' } });
    await show('todo_a');
    await press(strings['a.run']);
    await press(strings['run.confirm'], dialog());
    expect(screen.getByText(strings['o.refused.run'])).toBeTruthy();
    expect(screen.queryByText(strings['o.unsure'])).toBeNull();
  });
});

describe('proposals', () => {
  it('approve confirms the unattended run and sends the proposal approve', async () => {
    writes['POST /todos/todo_a/proposals/prop_1/approve'] = () => ({ status: 200, body: { status: 'ok' } });
    await show('todo_a');
    expect(screen.getByText('Proposed: run as implementer')).toBeTruthy();
    await press(strings['a.approve']);
    expect(within(dialog()).getByText(strings['approve.effect'])).toBeTruthy();
    await press(strings['approve.confirm'], dialog());
    expect(writeCalls().map((c) => path(c.url).replace(/^.*\/agent/, ''))).toEqual(['/todos/todo_a/proposals/prop_1/approve']);
    expect(screen.getByText(strings['o.done.approve'])).toBeTruthy();
  });

  it('an approve answered 404 while the TODO still reads: the TODO or its proposal was not found, never gone', async () => {
    writes['POST /todos/todo_a/proposals/prop_1/approve'] = () => ({ status: 404, body: { code: 'not_found', error: 'proposal "prop_1" not found' } });
    await show('todo_a');
    await press(strings['a.approve']);
    await press(strings['approve.confirm'], dialog());
    expect(screen.getByText(strings['o.refused.notFoundProposal'])).toBeTruthy();
    expect(screen.queryByText(strings['o.refused.notFound'])).toBeNull();
    expect(document.body.textContent).not.toMatch(/no longer there|is gone/i);
  });

  it('a deny answered 404 says the same', async () => {
    writes['POST /todos/todo_a/proposals/prop_1/deny'] = () => ({ status: 404, body: { code: 'not_found', error: 'proposal "prop_1" not found' } });
    await show('todo_a');
    await press(strings['a.deny']);
    expect(screen.getByText(strings['o.refused.notFoundProposal'])).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/no longer there|is gone/i);
  });

  it('a run answered 404 says the agent could not find the TODO', async () => {
    writes['POST /todos/todo_a/run'] = () => ({ status: 404, body: { code: 'not_found', error: 'TODO "todo_a" not found' } });
    await show('todo_a');
    await press(strings['a.run']);
    await press(strings['run.confirm'], dialog());
    expect(screen.getByText(strings['o.refused.notFound'])).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/no longer there|is gone/i);
  });

  it('deny sends at once, starts nothing', async () => {
    writes['POST /todos/todo_a/proposals/prop_1/deny'] = () => ({ status: 200, body: { status: 'ok' } });
    await show('todo_a');
    await press(strings['a.deny']);
    expect(writeCalls().map((c) => path(c.url).replace(/^.*\/agent/, ''))).toEqual(['/todos/todo_a/proposals/prop_1/deny']);
    expect(screen.getByText(strings['o.done.deny'])).toBeTruthy();
  });

  it('a lost approve that a read shows denied is ruled out, never done', async () => {
    writes['POST /todos/todo_a/proposals/prop_1/approve'] = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });
    await show('todo_a');
    await press(strings['a.approve']);
    await press(strings['approve.confirm'], dialog());
    expect(screen.getByText(strings['o.unsure'])).toBeTruthy();
    full.todo_a = { ...full.todo_a, proposals: [{ id: 'prop_1', status: 'denied' }] };
    await press(/Check again/);
    expect(screen.getByText(strings['o.ruledOut'])).toBeTruthy();
    expect(screen.queryByText(strings['o.done.approve'])).toBeNull();
    expect(writeCalls()).toHaveLength(1);
  });

  it('only a proposal still waiting is offered', async () => {
    full.todo_a = { ...full.todo_a, proposals: [{ id: 'prop_0', status: 'approved', agent: 'reviewer' }, { id: 'prop_1', status: 'pending', agent: 'implementer' }] };
    await show('todo_a');
    expect(screen.getByText('Proposed: run as implementer')).toBeTruthy();
    expect(screen.queryByText('Proposed: run as reviewer')).toBeNull();
    expect(screen.getAllByRole('button', { name: strings['a.approve'] })).toHaveLength(1);
  });

  it('an unknown approve outlives its row: the TODO gone, the notice stays with Check again and Stop tracking', async () => {
    writes['POST /todos/todo_a/proposals/prop_1/approve'] = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });
    await show('todo_a');
    await press(strings['a.approve']);
    await press(strings['approve.confirm'], dialog());
    expect(screen.getByText(strings['o.unsure'])).toBeTruthy();
    items = items.filter((x) => x.id !== 'todo_a');
    delete full.todo_a;
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await flush();
    expect(screen.getByText(strings['o.unsure'])).toBeTruthy();
    expect(screen.getByRole('button', { name: strings['o.forget'] })).toBeTruthy();
    await press(/Check again/);
    expect(screen.getByText(strings['o.readFailed'])).toBeTruthy();
    expect(writeCalls()).toHaveLength(1);
  });

  it('a proposal past its own expires_at is shown expired, with no Approve or Deny', async () => {
    full.todo_a = { ...full.todo_a, proposals: [{ id: 'prop_1', status: 'pending', agent: 'implementer', expires_at: '2026-01-01T00:00:00Z' }] };
    await show('todo_a');
    expect(screen.getByText('Proposed: run as implementer')).toBeTruthy();
    expect(screen.getByText(strings.proposalExpired)).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['a.approve'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['a.deny'] })).toBeNull();
  });

  it('a closed TODO offers neither run nor proposals', async () => {
    await show('todo_e', 'done');
    expect(screen.getByText(strings.closed)).toBeTruthy();
    for (const n of [strings['a.run'], strings['a.approve'], strings['a.deny'], strings['a.cancelRun']]) expect(screen.queryByRole('button', { name: n })).toBeNull();
  });
});

describe('a TODO a worker holds', () => {
  it('reads Claimed by a worker, offers Cancel run, and no Run, claim or release', async () => {
    await show('todo_c', 'running');
    expect(screen.getByText(`${strings.claimed} ${strings['claimed.note']}`)).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['a.run'] })).toBeNull();
    expect(screen.queryByRole('button', { name: /claim|release/i })).toBeNull();
    expect(screen.getByRole('button', { name: strings['a.cancelRun'] })).toBeTruthy();
  });

  it('its proposals wait: neither Approve nor Deny is offered while it is held', async () => {
    full.todo_c = { ...full.todo_c, proposals: [{ id: 'prop_3', status: 'pending', agent: 'implementer', expires_at: '2099-01-01T00:00:00Z' }] };
    await show('todo_c', 'running');
    expect(screen.getByText('Proposed: run as implementer')).toBeTruthy();
    expect(screen.getByText(strings['held.proposals'])).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['a.approve'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['a.deny'] })).toBeNull();
  });

  it('cancel answered, its run_end not read yet: unknown, never Run cancelled', async () => {
    writes['POST /todos/todo_c/cancel-run'] = () => ({ status: 200, body: { status: 'ok' } });
    await show('todo_c', 'running');
    await press(strings['a.cancelRun']);
    await press(strings['cancel.confirm'], dialog());
    expect(screen.getByText(strings['o.cancel.answered'])).toBeTruthy();
    expect(screen.queryByText(strings['o.done.cancelRun'])).toBeNull();
    expect(writeCalls()).toHaveLength(1);
  });

  it("an earlier run's cancelled end is not this cancel's outcome", async () => {
    full.todo_c = { ...full.todo_c, timeline: [{ id: 'e0', ts: '2026-10-29T10:00:00Z', kind: 'run_start', meta: { session: 'w0' } }, { id: 'e0b', ts: '2026-10-29T10:30:00Z', kind: 'run_end', meta: { outcome: 'cancelled' } }, ...(full.todo_c!.timeline as unknown[])] };
    writes['POST /todos/todo_c/cancel-run'] = () => {
      full.todo_c = { ...full.todo_c, timeline: [...(full.todo_c!.timeline as unknown[]), { id: 'e9', ts: NOW(), kind: 'run_end', meta: { outcome: 'cancelled', session: 'w0' } }] };
      return { status: 200, body: { status: 'ok' } };
    };
    await show('todo_c', 'running');
    await press(strings['a.cancelRun']);
    await press(strings['cancel.confirm'], dialog());
    expect(screen.queryByText(strings['o.done.cancelRun'])).toBeNull();
    expect(screen.getByText(strings['o.cancel.answered'])).toBeTruthy();
  });

  it('cancel run confirms, sends once, and takes its outcome from its run_end entry (naming its session) read back', async () => {
    writes['POST /todos/todo_c/cancel-run'] = () => {
      full.todo_c = { ...full.todo_c, lease: undefined, state: 'ready', timeline: [...(full.todo_c!.timeline as unknown[]), { id: 'e2', ts: NOW(), kind: 'run_end', actor: { kind: 'human' }, body: 'run cancelled by user', meta: { outcome: 'cancelled', session: 'w1' } }] };
      return { status: 200, body: { status: 'ok' } };
    };
    await show('todo_c', 'running');
    const before = reads('todo_c');
    await press(strings['a.cancelRun']);
    await press(strings['cancel.confirm'], dialog());
    expect(writeCalls().map((c) => path(c.url).replace(/^.*\/agent/, ''))).toEqual(['/todos/todo_c/cancel-run']);
    expect(reads('todo_c')).toBeGreaterThan(before);
    expect(screen.getByText(strings['o.done.cancelRun'])).toBeTruthy();
  });

  it('cancel answered, but the run_end read back says it finished on its own: that end is shown, not Run cancelled', async () => {
    writes['POST /todos/todo_c/cancel-run'] = () => {
      full.todo_c = { ...full.todo_c, lease: undefined, state: 'review', timeline: [...(full.todo_c!.timeline as unknown[]), { id: 'e2', ts: NOW(), kind: 'run_end', actor: { kind: 'worker' }, meta: { outcome: 'done', session: 'w1' } }] };
      return { status: 200, body: { status: 'ok' } };
    };
    await show('todo_c', 'running');
    await press(strings['a.cancelRun']);
    await press(strings['cancel.confirm'], dialog());
    expect(screen.getByText(new RegExp(strings['end.done'].replace(/[.:]/g, '\\$&')))).toBeTruthy();
    expect(screen.queryByText(strings['o.done.cancelRun'])).toBeNull();
    expect(screen.getByText(strings['o.cancel.answered'])).toBeTruthy();
  });

  it('cancel answered, the run_end read back names no session: unsure, never Run cancelled', async () => {
    writes['POST /todos/todo_c/cancel-run'] = () => {
      full.todo_c = { ...full.todo_c, lease: undefined, state: 'ready', timeline: [...(full.todo_c!.timeline as unknown[]), { id: 'e2', ts: NOW(), kind: 'run_end', actor: { kind: 'human' }, body: 'run cancelled by user', meta: { outcome: 'cancelled' } }] };
      return { status: 200, body: { status: 'ok' } };
    };
    await show('todo_c', 'running');
    await press(strings['a.cancelRun']);
    await press(strings['cancel.confirm'], dialog());
    expect(screen.queryByText(strings['o.done.cancelRun'])).toBeNull();
    expect(screen.getByText(new RegExp(strings['o.cancel.unnamed'].replace(/[.,]/g, '\\$&')))).toBeTruthy();
    expect(writeCalls()).toHaveLength(1);
  });

  it('cancel refused because the run had already ended shows how it ended', async () => {
    writes['POST /todos/todo_c/cancel-run'] = () => {
      full.todo_c = { ...full.todo_c, lease: undefined, state: 'review', timeline: [...(full.todo_c!.timeline as unknown[]), { id: 'e2', ts: NOW(), kind: 'run_end', actor: { kind: 'worker' }, meta: { outcome: 'done', session: 'w1' } }] };
      return { status: 400, body: { code: 'bad_request', error: 'TODO #3 has no active run' } };
    };
    await show('todo_c', 'running');
    await press(strings['a.cancelRun']);
    await press(strings['cancel.confirm'], dialog());
    expect(screen.getByText(strings['o.refused.cancelRun'])).toBeTruthy();
    expect(screen.getByText(strings['end.done'])).toBeTruthy();
  });

  it('cancel refused, the TODO read back shows an end naming no run: it is never told as this run\'s', async () => {
    writes['POST /todos/todo_c/cancel-run'] = () => {
      full.todo_c = { ...full.todo_c, lease: undefined, state: 'ready', timeline: [...(full.todo_c!.timeline as unknown[]), { id: 'e2', ts: NOW(), kind: 'run_end', meta: { outcome: 'cancelled' } }] };
      return { status: 400, body: { code: 'bad_request', error: 'TODO #3 has no active run' } };
    };
    await show('todo_c', 'running');
    await press(strings['a.cancelRun']);
    await press(strings['cancel.confirm'], dialog());
    expect(screen.getByText(strings['o.refused.cancelRun'])).toBeTruthy();
    expect(screen.getByText(strings['o.cancel.unnamed'])).toBeTruthy();
    expect(screen.queryByText(strings['end.cancelled'])).toBeNull();
  });
});

describe('a confirm bound to its attempt', () => {
  const held = (session: string) => ({ daemon_id: 'd', session_id: session, acquired_at: NOW(), expires_at: NOW() });
  const refetch = async () => {
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await flush();
  };

  it('Cancel run confirmed for one run sends nothing when another run holds the TODO at the send', async () => {
    writes['POST /todos/todo_c/cancel-run'] = () => ({ status: 200, body: { status: 'ok' } });
    await show('todo_c');
    await press(strings['a.cancelRun']);
    expect(dialog()).toBeTruthy();
    // the run the dialog was opened for ended and another worker took the TODO; the list still shows it held
    full.todo_c = { ...full.todo_c, lease: held('w2') };
    await press(strings['cancel.confirm'], dialog());
    expect(writeCalls()).toHaveLength(0);
    expect(screen.getByText(strings['o.notSent.changed'])).toBeTruthy();
  });

  it('Run confirmed at one content revision sends nothing when the TODO was edited before the send', async () => {
    writes['POST /todos/todo_a/run'] = () => ({ status: 202, body: { job_id: 'j1' } });
    full.todo_a = { ...full.todo_a, content_rev: 4 };
    await show('todo_a');
    await press(strings['a.run']);
    full.todo_a = { ...full.todo_a, content_rev: 5 };
    await press(strings['run.confirm'], dialog());
    expect(writeCalls()).toHaveLength(0);
    expect(screen.getByText(strings['o.notSent.changed'])).toBeTruthy();
  });

  it('Approve on a proposal that reads in a status outside the closed set is never sent', async () => {
    writes['POST /todos/todo_a/proposals/prop_1/approve'] = () => ({ status: 200, body: { status: 'ok' } });
    await show('todo_a');
    await press(strings['a.approve']);
    full.todo_a = { ...full.todo_a, proposals: [{ id: 'prop_1', status: 'approving', agent: 'implementer' }] };
    await press(strings['approve.confirm'], dialog());
    expect(writeCalls()).toHaveLength(0);
  });

  it('a Cancel run confirm hidden by the run ending is discarded, and does not come back when a run holds it again', async () => {
    await show('todo_c');
    await press(strings['a.cancelRun']);
    expect(dialog()).toBeTruthy();
    items = items.map((x) => (x.id === 'todo_c' ? { ...x, state: 'ready', lease: undefined } : x));
    full.todo_c = { ...full.todo_c, state: 'ready', lease: undefined };
    await refetch();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    items = items.map((x) => (x.id === 'todo_c' ? { ...x, state: 'in_progress', lease: held('w3') } : x));
    full.todo_c = { ...full.todo_c, state: 'in_progress', lease: held('w3') };
    await refetch();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText(strings.changed)).toBeTruthy();
    expect(writeCalls()).toHaveLength(0);
  });

  it('an Approve confirm is discarded when its proposal passes expires_at, with no other update', async () => {
    writes['POST /todos/todo_a/proposals/prop_1/approve'] = () => ({ status: 200, body: { status: 'ok' } });
    const exp = expiresSoon();
    full.todo_a = { ...full.todo_a, proposals: [{ id: 'prop_1', status: 'pending', agent: 'implementer', expires_at: new Date(exp).toISOString() }] };
    await show('todo_a');
    await press(strings['a.approve']);
    expect(dialog()).toBeTruthy();
    await passTo(exp);
    await flush();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText(strings.changed)).toBeTruthy();
    expect(screen.getByText(strings.proposalExpired)).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['a.approve'] })).toBeNull();
    expect(writeCalls()).toHaveLength(0);
  });

  it('a proposal that passes expires_at with no confirm open loses Approve and Deny, with no other update', async () => {
    const exp = expiresSoon();
    full.todo_a = { ...full.todo_a, proposals: [{ id: 'prop_1', status: 'pending', agent: 'implementer', expires_at: new Date(exp).toISOString() }] };
    await show('todo_a');
    expect(screen.getByRole('button', { name: strings['a.approve'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: strings['a.deny'] })).toBeTruthy();
    await passTo(exp);
    expect(screen.getByText(strings.proposalExpired)).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['a.approve'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['a.deny'] })).toBeNull();
    expect(writeCalls()).toHaveLength(0);
  });

  it('the confirm button waits for the read that binds it, and stays off when that read fails', async () => {
    writes['POST /todos/todo_a/run'] = () => ({ status: 202, body: { job_id: 'j1' } });
    await show('todo_a');
    const saved = full.todo_a!;
    delete full.todo_a;
    await press(strings['a.run']);
    expect(within(dialog()).getByText(new RegExp(strings['confirm.unreadable'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy();
    const b = within(dialog()).getByRole('button', { name: strings['run.confirm'] });
    expect(b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true').toBe(true);
    full.todo_a = saved;
    expect(writeCalls()).toHaveLength(0);
  });

  it("a cancel answered: an unlabelled cancelled end after ANOTHER run's start is not its run's end", async () => {
    writes['POST /todos/todo_c/cancel-run'] = () => ({ status: 200, body: { status: 'ok' } });
    await show('todo_c');
    await press(strings['a.cancelRun']);
    // the read after the answer: w1's lease expired and w2 took over (no end for w1), then w2 was cancelled
    const run = (id: string, kind: string, meta: Record<string, string>) => ({ id, ts: NOW(), kind, actor: { kind: 'worker' }, meta });
    writes['POST /todos/todo_c/cancel-run'] = () => {
      full.todo_c = { ...full.todo_c, lease: undefined, timeline: [run('e1', 'run_start', { session: 'w1' }), run('e2', 'run_start', { session: 'w2' }), run('e3', 'run_end', { outcome: 'cancelled' })] };
      return { status: 200, body: { status: 'ok' } };
    };
    await press(strings['cancel.confirm'], dialog());
    expect(writeCalls()).toHaveLength(1);
    expect(screen.queryByText(strings['o.done.cancelRun'])).toBeNull();
    expect(screen.getByText(strings['o.cancel.answered'])).toBeTruthy();
  });

  it('a lost deny whose proposal reads a status outside the closed set stays unknown, never ruled out', async () => {
    writes['POST /todos/todo_a/proposals/prop_1/deny'] = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });
    await show('todo_a');
    await press(strings['a.deny']);
    expect(screen.getByText(strings['o.unsure'])).toBeTruthy();
    full.todo_a = { ...full.todo_a, proposals: [{ id: 'prop_1', status: 'denying' }] };
    await press(/Check again/);
    expect(screen.getByText(strings['o.unsure'])).toBeTruthy();
    expect(screen.queryByText(strings['o.ruledOut'])).toBeNull();
    full.todo_a = { ...full.todo_a, proposals: [{ id: 'prop_1' }] };
    await press(/Check again/);
    expect(screen.queryByText(strings['o.ruledOut'])).toBeNull();
    expect(writeCalls()).toHaveLength(1);
  });

  it('a lost approve that reads approved stays unknown, shown as what the TODO reads now', async () => {
    writes['POST /todos/todo_a/proposals/prop_1/approve'] = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });
    await show('todo_a');
    await press(strings['a.approve']);
    await press(strings['approve.confirm'], dialog());
    full.todo_a = { ...full.todo_a, proposals: [{ id: 'prop_1', status: 'approved' }] };
    await press(/Check again/);
    expect(screen.getByText(strings['o.unsure'])).toBeTruthy();
    expect(screen.getByText(new RegExp(strings['o.now.approved'].slice(0, 30)))).toBeTruthy();
    expect(screen.queryByText(strings['o.done.approve'])).toBeNull();
    expect(screen.queryByText(strings['o.seen.approve'])).toBeNull();
  });
});

describe('every TODO confirm carries its own name (layout.overlayId)', () => {
  const named = (el: HTMLElement) => el.closest('[data-hub-overlay]')?.getAttribute('data-hub-overlay') ?? el.getAttribute('data-hub-overlay');
  it.each([
    ['todo_a', 'open', 'a.run', 'ai-todos-run'],
    ['todo_a', 'open', 'a.approve', 'ai-todos-approve'],
    ['todo_c', 'running', 'a.cancelRun', 'ai-todos-cancel-run'],
  ] as const)('%s (%s): the %s confirm is %s', async (id, tab, button, name) => {
    await show(id, tab);
    await press(strings[button]);
    expect(named(dialog())).toBe(name);
    expect(writeCalls()).toHaveLength(0);
  });
});

// Each short line links to its answer in the tab's questions (pages/ai/faq.ts).
describe('links to the answers', () => {
  const href = (name: string, root?: HTMLElement) => (root ? within(root) : screen).getByRole('link', { name }).getAttribute('href') ?? '';

  it('the Run and Approve confirms link to the unattended run answer, the Cancel run confirm to the cancel answer', async () => {
    await show('todo_a');
    await press(strings['a.run']);
    expect(href(strings['more.run'], dialog())).toMatch(/#faq-autoRun$/);
    await press('Cancel', dialog());
    await press(strings['a.approve']);
    expect(href(strings['more.run'], dialog())).toMatch(/#faq-autoRun$/);
    cleanup();
    await show('todo_c', 'running');
    await press(strings['a.cancelRun']);
    expect(href(strings['more.cancel'], dialog())).toMatch(/#faq-autoCancel$/);
  });

  it('a held TODO links its claimed line and its waiting proposals to the run answer', async () => {
    full.todo_c = { ...full.todo_c, proposals: [{ id: 'prop_3', status: 'pending', agent: 'implementer', expires_at: '2099-01-01T00:00:00Z' }] };
    await show('todo_c', 'running');
    const links = screen.getAllByRole('link', { name: strings['more.run'] });
    expect(links).toHaveLength(2);
    for (const l of links) expect(l.getAttribute('href')).toMatch(/#faq-autoRun$/);
  });

  it('a lost run links to the unknown answer, next to Stop tracking', async () => {
    writes['POST /todos/todo_a/run'] = () => ({ status: 0, network: true });
    await show('todo_a');
    await press(strings['a.run']);
    await press(strings['run.confirm'], dialog());
    expect(href(strings['more.unsure'])).toMatch(/#faq-autoUnsure$/);
    expect(screen.queryByRole('link', { name: strings['more.run'] })).toBeNull();
  });

  it('a confirm that sent nothing links to the not-sent answer; a refused run to the run answer', async () => {
    writes['POST /todos/todo_a/run'] = () => ({ status: 202, body: { job_id: 'j1' } });
    full.todo_a = { ...full.todo_a, content_rev: 4 };
    await show('todo_a');
    await press(strings['a.run']);
    full.todo_a = { ...full.todo_a, content_rev: 5 };
    await press(strings['run.confirm'], dialog());
    expect(screen.getByText(strings['o.notSent.changed'])).toBeTruthy();
    expect(href(strings['more.notSent'])).toMatch(/#faq-autoNotSent$/);
    cleanup();
    resetKeptForTests();
    writes['POST /todos/todo_a/run'] = () => ({ status: 400, body: { code: 'bad_request', error: 'TODO #1 is already claimed' } });
    full.todo_a = { ...full.todo_a, content_rev: 5 };
    await show('todo_a');
    await press(strings['a.run']);
    await press(strings['run.confirm'], dialog());
    expect(screen.getByText(strings['o.refused.run'])).toBeTruthy();
    expect(href(strings['more.run'])).toMatch(/#faq-autoRun$/);
  });

  it('a cancel that is answered links to the cancel answer', async () => {
    writes['POST /todos/todo_c/cancel-run'] = () => ({ status: 400, body: { code: 'bad_request', error: 'no run' } });
    await show('todo_c', 'running');
    await press(strings['a.cancelRun']);
    await press(strings['cancel.confirm'], dialog());
    expect(href(strings['more.cancel'])).toMatch(/#faq-autoCancel$/);
  });

  it('a confirm closed because the TODO moved: its band links to the not-sent answer', async () => {
    await show('todo_a');
    await press(strings['a.run']);
    const lease = { daemon_id: 'd', session_id: 'w5', acquired_at: NOW(), expires_at: NOW() };
    items = items.map((x) => (x.id === 'todo_a' ? { ...x, state: 'in_progress', lease } : x));
    full.todo_a = { ...full.todo_a, state: 'in_progress', lease };
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await flush();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    const band = screen.getByText(strings.changed, { exact: false }).closest('[class]') as HTMLElement;
    expect(href(strings['more.notSent'], band)).toMatch(/#faq-autoNotSent$/);
    expect(writeCalls()).toHaveLength(0);
  });

  it('an unknown approve whose row went away keeps its link to the unknown answer', async () => {
    writes['POST /todos/todo_a/proposals/prop_1/approve'] = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });
    await show('todo_a');
    await press(strings['a.approve']);
    await press(strings['approve.confirm'], dialog());
    items = items.filter((x) => x.id !== 'todo_a');
    delete full.todo_a;
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await flush();
    expect(screen.queryByRole('button', { name: strings['a.run'] })).toBeNull();
    expect(screen.getByText(strings['o.unsure'])).toBeTruthy();
    expect(href(strings['more.unsure'])).toMatch(/#faq-autoUnsure$/);
    expect(screen.queryByRole('link', { name: strings['more.run'] })).toBeNull();
  });
});

// The actions' words sit in the kit's text places. The waiting runs are a
// kit ItemList named for them, each run's Approve and Deny its row actions; while another action of the TODO is
// unsettled they stay focusable and say why they wait, and do nothing.
describe('the waiting runs are kit rows', () => {
  it('shows each waiting run as a row of a kit list named for them, with Approve and Deny in that row', async () => {
    await show('todo_a');
    // Named by the list, not a heading of its own: no h2 beside the TODO's title.
    expect(screen.queryByRole('heading', { name: strings.proposals })).toBeNull();
    const list = screen.getByRole('list', { name: strings.proposals });
    const row = list.querySelector('[data-hub-item="prop_1"]') as HTMLElement;
    expect(row).not.toBeNull();
    expect(within(row).getByText('Proposed: run as implementer')).toBeTruthy();
    expect(within(row).getByRole('button', { name: strings['a.approve'] })).toBeTruthy();
    expect(within(row).getByRole('button', { name: strings['a.deny'] })).toBeTruthy();
  });

  // The words of a send in flight go into the one status line that is
  // already on the page, never into a live region mounted with them.
  it('the running words fill the status line that was mounted, empty, before the send', async () => {
    writes['POST /todos/todo_a/run'] = () => ({ status: 202, body: { job_id: 'j1', session_id: 'w9' }, delayMs: 60_000 });
    await show('todo_a');
    const before = statusLines();
    expect(before).toHaveLength(1);
    expect(before[0]!.textContent).toBe('');
    await press(strings['a.run']);
    await press(strings['run.confirm'], dialog());
    expect(screen.getByText(strings['o.running.run']).closest('p[role="status"]')).toBe(before[0]);
    expect(statusLines()).toEqual(before);
  });

  it('while a lost Run is unsettled, Approve and Deny say why they wait and send nothing', async () => {
    writes['POST /todos/todo_a/run'] = () => ({ status: 0, network: true });
    writes['POST /todos/todo_a/proposals/prop_1/approve'] = () => ({ status: 200, body: { status: 'ok' } });
    writes['POST /todos/todo_a/proposals/prop_1/deny'] = () => ({ status: 200, body: { status: 'ok' } });
    await show('todo_a');
    await press(strings['a.run']);
    await press(strings['run.confirm'], dialog());
    expect(screen.getByText(strings['o.unsure'])).toBeTruthy();
    // One owner per announcement: the kit Outcome's own role, under no page live region.
    expect(screen.getByText(strings['o.unsure']).closest('[aria-live]')).toBeNull();
    for (const n of [strings['a.approve'], strings['a.deny']]) {
      const b = screen.getByRole('button', { name: n, description: strings.busy });
      expect(b.getAttribute('aria-disabled')).toBe('true');
      await userEvent.click(b);
      await flush();
    }
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(writeCalls().map((c) => path(c.url).replace(/^.*\/agent/, ''))).toEqual(['/todos/todo_a/run']);
  });
});

// The TODO's state and its one action (Run, or Cancel run while a worker holds it) sit in the detail
// header; a waiting run is shown once, in "Runs waiting for you" with its prompt, and "Proposed runs" lists only the others.
describe('the TODO detail header and its waiting runs shown once', () => {
  // The detail's own header: the one holding the TODO's title.
  const header = () => document.querySelector('h2[data-hub-title]')!.closest('header') as HTMLElement;
  it('puts the state and Run in the header, none of it under the header', async () => {
    await show('todo_b');
    expect(within(header()).getByText(listStrings['st.ready'])).toBeTruthy();
    expect(within(header()).getByRole('button', { name: strings['a.run'] })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: strings['a.run'] })).toHaveLength(1);
  });

  it('a TODO a worker holds shows Cancel run in the header, beside its running state, and no Run', async () => {
    await show('todo_c', 'running');
    expect(within(header()).getByRole('button', { name: strings['a.cancelRun'] })).toBeTruthy();
    expect(within(header()).getByText(listStrings['st.in_progress'])).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['a.run'] })).toBeNull();
    expect(screen.getByText(strings.claimed, { exact: false })).toBeTruthy();
  });

  it('a closed TODO has no header action, and its proposals stay listed under Proposed runs', async () => {
    await show('todo_e', 'done');
    expect(within(header()).queryByRole('button', { name: strings['a.run'] })).toBeNull();
    expect(within(header()).queryByRole('button', { name: strings['a.cancelRun'] })).toBeNull();
    expect(screen.getByRole('heading', { name: listStrings['t.proposals'] })).toBeTruthy();
    expect(screen.getByText(listStrings['t.proposal'].replace('{{agent}}', 'x'))).toBeTruthy();
  });

  it('a waiting run is shown once, with its prompt and its Approve and Deny, and not again under Proposed runs', async () => {
    await show('todo_a');
    const row = screen.getByRole('list', { name: strings.proposals }).querySelector('[data-hub-item="prop_1"]') as HTMLElement;
    expect(within(row).getByText(strings.prompt)).toBeTruthy();
    expect(within(row).getByText('Rotate them')).toBeTruthy();
    expect(screen.getAllByText('Rotate them')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: listStrings['t.proposals'] })).toBeNull();
    expect(screen.queryByText(listStrings['t.proposal'].replace('{{agent}}', 'implementer'))).toBeNull();
  });

  // The one row keeps what "Proposed runs" shows, its status and the prompt's own line breaks.
  it('a waiting run keeps its status in its row', async () => {
    await show('todo_a');
    const row = screen.getByRole('list', { name: strings.proposals }).querySelector('[data-hub-item="prop_1"]') as HTMLElement;
    expect(within(row).getByText(listStrings['p.pending'])).toBeTruthy();
  });

  it('a held TODO still shows its waiting run with its status, and no Approve or Deny', async () => {
    full.todo_c = { ...full.todo_c, proposals: [{ id: 'prop_h', action: 'run_worker', agent: 'reviewer', prompt: 'Check it', status: 'pending', todo_revision: 1, created_at: 'x', expires_at: '2099-01-01T00:00:00Z' }] };
    await show('todo_c', 'running');
    const row = screen.getByRole('list', { name: strings.proposals }).querySelector('[data-hub-item="prop_h"]') as HTMLElement;
    expect(within(row).getByText(listStrings['p.pending'])).toBeTruthy();
    expect(within(row).queryByRole('button', { name: strings['a.approve'] })).toBeNull();
  });

  it("a multi-line prompt keeps its line breaks and indentation", async () => {
    const prompt = 'Rotate them:\n  1. staging\n  2. production';
    full.todo_a = { ...full.todo_a, proposals: [{ id: 'prop_1', action: 'run_worker', agent: 'implementer', prompt, status: 'pending', todo_revision: 1, created_at: 'x', expires_at: 'y' }] };
    await show('todo_a');
    const row = screen.getByRole('list', { name: strings.proposals }).querySelector('[data-hub-item="prop_1"]') as HTMLElement;
    const el = within(row).getByText((_, e) => e?.tagName === 'BDI' && e.textContent === prompt);
    expect(el.className).toMatch(/prompt/);
  });
});
