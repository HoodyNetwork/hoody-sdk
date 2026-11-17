// Loop changes on a live page: the real core over a fake fetch. Every request is counted:
// one intent per updateLoop body; a timing change deletes first and creates only after a proven delete; a lost create is
// never sent again and its check reads the chat's loops (listLoops) without claiming one; a delete sends its body; a lost
// answer stays "may have gone through" until a read shows the change. A confirm (and the Replace drawer) is bound to the
// loop it was opened on (confirm.ts): a selection or state change discards it for good, and the
// send reads the chat's loops again and sends nothing if the loop is gone or no longer offers it. A stopped loop starts
// again with both its limits as listed, never one dropped.
// eslint-disable-next-line no-restricted-imports -- a router harness for the list's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryClient } from '@core';
import { boot, calls, onFetch, settle, type Call, type Reply } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetKeptForTests } from '../kept';
import { LoopsList } from './List';
import strings from './Edit.strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const T0 = Date.parse('2026-10-29T12:00:00Z');
const loop = (o: Record<string, unknown> = {}) => ({
  id: 'loop_a', session_id: 'sess-1', prompt: 'Check CI on main', interval_ms: 1800000, max_runs: 50, run_count: 7,
  paused: false, state: 'running', realm: R1, created_at: '2026-10-29T11:00:00Z', ...o,
});
let loops: Array<Record<string, unknown>> = [];
/** The chat's own listing (GET /sessions/sess-1/loops); default: the same rows. */
let chatLoops: (() => Reply) | null = null;
let writes: Record<string, (c: Call) => Reply> = {};

const path = (u: string) => new URL(u).pathname;
const writeCalls = () => calls.filter((c) => c.method !== 'GET');
const chatListCalls = () => calls.filter((c) => c.method === 'GET' && path(c.url).endsWith('/sessions/sess-1/loops'));
const posts = () => calls.filter((c) => c.method === 'POST' && path(c.url).endsWith('/sessions/sess-1/loops'));

const flush = async () => {
  for (let i = 0; i < 20; i++) await act(async () => { await settle(); });
};
async function show(at = '/ai/auto/loops') {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <LoopsList computer="atlas" /> }),
    history: createMemoryHistory({ initialEntries: [at] }),
  });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  await flush();
  return router;
}
async function openLoop() {
  await show(`/ai/auto/loops?sel=${encodeURIComponent(`${R1}/sess-1/loop_a`)}`);
}
// A loop's changes sit in its detail header: the primary and Run now as buttons, the rest under ⋯ (More actions). A press
// finds the button, else opens ⋯ and picks the menu item of that name.
const press = async (name: string | RegExp, root: HTMLElement | Document = document) => {
  const scope = root instanceof Document ? screen : within(root);
  const b = scope.queryByRole('button', { name });
  if (b) await userEvent.click(b);
  else {
    await userEvent.click(scope.getByRole('button', { name: 'More actions' }));
    await flush();
    await userEvent.click(screen.getByRole('menuitem', { name }));
  }
  await flush();
};
/** The changes the loop's header offers: its buttons and its ⋯ menu items (the menu is opened and closed to read it). */
const offered = async (): Promise<string[]> => {
  const bar = screen.queryByRole('group', { name: strings['a.label'] });
  if (!bar) return [];
  const names = within(bar).queryAllByRole('button').map((x) => x.getAttribute('aria-label') ?? x.textContent ?? '').filter((n) => n !== 'More actions');
  const more = within(bar).queryByRole('button', { name: 'More actions' });
  if (more) {
    await userEvent.click(more);
    await flush();
    names.push(...screen.getAllByRole('menuitem').map((x) => (x.textContent ?? '').trim()));
    await userEvent.keyboard('{Escape}');
    await flush();
  }
  return names.map((n) => n.trim());
};
const dialog = () => screen.getByRole('alertdialog');

beforeEach(() => {
  boot({ realm: R1 });
  resetKeptForTests();
  queryClient.clear();
  loops = [loop()];
  chatLoops = null;
  writes = {};
  onFetch((c) => {
    const p = path(c.url);
    if (c.method === 'GET' && p.endsWith('/agent/loops')) return { status: 200, body: { items: loops, meta: { total: loops.length } } };
    if (c.method === 'GET' && p.endsWith('/sessions/sess-1/loops')) return chatLoops ? chatLoops() : { status: 200, body: { items: loops, meta: { total: loops.length } } };
    if (c.method === 'GET' && /\/sessions\/[^/]+$/.test(p)) return { status: 200, body: { session: { id: 'sess-1', name: 'Fix the tests' } } };
    if (c.method === 'GET' && p.endsWith('/agent/sessions')) {
      return { status: 200, body: { items: [{ id: 'sess-1', realm: R1, name: 'Fix the tests', state: 'idle' }, { id: 'sess-9', realm: R1, name: 'Old one', state: 'closed' }], meta: { total: 2 } } };
    }
    const w = writes[`${c.method} ${p.replace(/^.*\/agent/, '')}`];
    if (w) return w(c);
    return { status: 404, body: { code: 'not_found', error: 'nope' } };
  });
});
afterEach(() => cleanup());

/** The kit StatusLine (one stays mounted; its words change): a role=status p with its own aria-live. */
const statusLines = (root: ParentNode = document) => [...root.querySelectorAll('p[role="status"][aria-live]')] as HTMLElement[];

// A change in flight says so in the status line already on the page.
describe('the change in flight', () => {
  it('Pausing… fills the status line that was mounted, empty, before the send', async () => {
    writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' }, delayMs: 60_000 });
    await openLoop();
    const before = statusLines();
    expect(before).toHaveLength(1);
    expect(before[0]!.textContent).toBe('');
    await press('Pause');
    await press('Pause', dialog());
    expect(screen.getByText(strings['o.running.pause']).closest('p[role="status"]')).toBe(before[0]);
    expect(statusLines()).toEqual(before);
  });
});

describe('one intent per updateLoop', () => {
  it('pause confirms with the chat warning and sends exactly {paused:true}', async () => {
    writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    await openLoop();
    await press('Pause');
    expect(within(dialog()).getByText(new RegExp(strings['pause.note'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy();
    expect(writeCalls()).toHaveLength(0);
    await press('Pause', dialog());
    const w = writeCalls();
    expect(w).toHaveLength(1);
    expect(w[0]!.method).toBe('PATCH');
    expect(w[0]!.body).toEqual({ paused: true });
    expect(new URL(w[0]!.url).searchParams.get('realm')).toBe(R1);
    expect(await screen.findByText(strings['o.done.pause'])).toBeTruthy();
  });

  it('resume of a paused loop sends exactly {paused:false}', async () => {
    loops = [loop({ paused: true, state: 'paused' })];
    writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    await openLoop();
    await press('Resume');
    expect(writeCalls().map((c) => c.body)).toEqual([{ paused: false }]);
  });

  it('a new end time sends only expires_in', async () => {
    writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    await openLoop();
    await press(strings['a.extend']);
    await press(strings['extend.confirm'], dialog());
    expect(writeCalls().map((c) => c.body)).toEqual([{ expires_in: '1d' }]);
  });

  it('a finished loop offers no pause, resume, run now or end time', async () => {
    loops = [loop({ state: 'ended', paused: true, stop_reason: 'max_runs' })];
    await openLoop();
    const has = await offered();
    for (const n of ['Pause', 'Resume', 'Run now', strings['a.extend']]) expect(has).not.toContain(n);
    expect(has).toContain(strings['a.replace']);
  });

  it('a finished loop is not started again (its run limit)', async () => {
    loops = [loop({ state: 'ended', paused: true, stop_reason: 'max_runs' })];
    await openLoop();
    expect(await offered()).not.toContain(strings['a.restart']);
  });
});

describe('start again', () => {
  const stopped = (o: Record<string, unknown> = {}) => loop({ state: 'stopped', paused: true, stop_reason: 'max_cost_usd', max_cost_usd: 2, spent_usd: 2.01, ...o });
  it('a loop a limit stopped offers start again, a timing change and delete, and no pause, resume, run now or end time', async () => {
    loops = [stopped()];
    await openLoop();
    const has = await offered();
    for (const n of ['Pause', 'Resume', 'Run now', strings['a.extend']]) expect(has).not.toContain(n);
    for (const n of [strings['a.restart'], strings['a.replace'], 'Delete']) expect(has).toContain(n);
  });

  it('its confirm says why it stopped and which limits it keeps, and sends both limits once', async () => {
    loops = [stopped({ max_wall_ms: 3_600_000 })];
    writes['PATCH /sessions/sess-1/loops/loop_a'] = () => {
      loops = [stopped({ max_wall_ms: 3_600_000, state: 'running', paused: false, stop_reason: undefined, spent_usd: 0 })];
      return { status: 200, body: { status: 'ok' } };
    };
    await openLoop();
    await press(strings['a.restart']);
    const d = dialog();
    expect(d.closest('[data-hub-overlay]')?.getAttribute('data-hub-overlay') ?? d.getAttribute('data-hub-overlay')).toBe('ai-loops-restart');
    expect(d.textContent).toContain('It stopped because it reached its spending limit.');
    expect(d.textContent).toContain('It keeps its spending limit of $2.00 and its running-time limit of 1 hours.');
    expect(d.textContent).toContain('count from zero');
    expect(writeCalls()).toHaveLength(0);
    await press(strings['restart.confirm'], dialog());
    expect(writeCalls().map((c) => [c.method, c.body])).toEqual([['PATCH', { max_cost_usd: 2, max_wall_ms: 3_600_000 }]]);
    // told from the read after the answer (it names no state), never as the answer itself
    expect(await screen.findByText(strings['o.seen.restart'])).toBeTruthy();
    expect(screen.queryByText(strings['o.done.restart'])).toBeNull();
  });

  describe('with the agent\'s loop_preconditions capability', () => {
    const caps = () => {
      writes['GET /version'] = () => ({ status: 200, body: { api_version: 'v1', capabilities: [{ name: 'loop_preconditions', supported: true, available: true }] } });
    };
    it('the start again names the loop as read (stopped, its limits) and its ok answer is told as the answer', async () => {
      caps();
      loops = [stopped({ max_wall_ms: 3_600_000 })];
      writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
      await openLoop();
      await press(strings['a.restart']);
      const before = chatListCalls().length;
      await press(strings['restart.confirm'], dialog());
      expect(writeCalls().map((c) => c.body)).toEqual([{ max_cost_usd: 2, max_wall_ms: 3_600_000, if_state: 'stopped', if_max_cost_usd: 2, if_max_wall_ms: 3_600_000 }]);
      expect(await screen.findByText(strings['o.done.restart'])).toBeTruthy();
      // one read before the send, none after it
      expect(chatListCalls().length - before).toBe(1);
    });
    it('a start again the agent answers loop_changed says the loop changed and nothing was changed; nothing is sent again', async () => {
      caps();
      loops = [stopped()];
      writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 409, body: { code: 'loop_changed', error: 'the loop changed since it was read (now running); nothing was changed', details: { state: 'running', max_cost_usd: 5, max_wall_ms: 0 } } });
      await openLoop();
      await press(strings['a.restart']);
      await press(strings['restart.confirm'], dialog());
      expect(await screen.findByText(strings['o.refused.changed'])).toBeTruthy();
      expect(writeCalls()).toHaveLength(1);
    });
    it('a pause names the state and the limits as read', async () => {
      caps();
      loops = [loop({ max_cost_usd: 0.5 })];
      writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
      await openLoop();
      await press('Pause');
      await press('Pause', dialog());
      expect(writeCalls().map((c) => c.body)).toEqual([{ paused: true, if_state: 'running', if_max_cost_usd: 0.5, if_max_wall_ms: 0 }]);
    });
  });

  it('an answered start again whose read shows the loop still stopped stays unknown; nothing is sent again', async () => {
    loops = [stopped()];
    writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    await openLoop();
    await press(strings['a.restart']);
    await press(strings['restart.confirm'], dialog());
    expect(await screen.findByText(strings['o.unsure'])).toBeTruthy();
    expect(screen.queryByText(strings['o.done.restart'])).toBeNull();
    expect(screen.queryByText(strings['o.seen.restart'])).toBeNull();
    expect(writeCalls()).toHaveLength(1);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['a spending limit under a cent is shown exactly', { max_cost_usd: 0.004 }, 'It keeps its spending limit of $0.004.'],
    ['a fractional dollar limit is shown exactly', { max_cost_usd: 1.234 }, 'It keeps its spending limit of $1.234.'],
    ['a running-time limit in seconds is shown in seconds', { max_cost_usd: 0, max_wall_ms: 90_000 }, 'It keeps its running-time limit of 90 seconds.'],
    ['a running-time limit with milliseconds is shown to the millisecond', { max_cost_usd: 0, max_wall_ms: 1_500 }, 'It keeps its running-time limit of 1.5 seconds.'],
    ['a running-time limit in whole minutes is shown in minutes', { max_cost_usd: 0, max_wall_ms: 5_400_000 }, 'It keeps its running-time limit of 90 minutes.'],
  ])('its confirm: %s, and sends that limit as listed', async (_n, o, words) => {
    loops = [stopped(o)];
    writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    await openLoop();
    await press(strings['a.restart']);
    expect(dialog().textContent).toContain(words);
    await press(strings['restart.confirm'], dialog());
    expect(writeCalls().map((c) => c.body)).toEqual([{ max_cost_usd: Number(o.max_cost_usd ?? 0), max_wall_ms: Number(o.max_wall_ms ?? 0) }]);
  });

  it('a loop with no limits says so and sends both as none', async () => {
    loops = [stopped({ stop_reason: 'stop_when', max_cost_usd: undefined })];
    writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    await openLoop();
    await press(strings['a.restart']);
    expect(dialog().textContent).toContain(strings['restart.noLimits']);
    expect(dialog().textContent).toContain(strings['restart.again']);
    await press(strings['restart.confirm'], dialog());
    expect(writeCalls().map((c) => c.body)).toEqual([{ max_cost_usd: 0, max_wall_ms: 0 }]);
  });

  it('a limit changed between the confirm and the send sends nothing', async () => {
    loops = [stopped()];
    writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    await openLoop();
    await press(strings['a.restart']);
    const raised = [stopped({ max_cost_usd: 5 })];
    chatLoops = () => ({ status: 200, body: { items: raised, meta: { total: 1 } } });
    await press(strings['restart.confirm'], dialog());
    expect(writeCalls()).toHaveLength(0);
    expect(await screen.findByText(strings['o.notSent.changed'])).toBeTruthy();
  });

  it('a lost answer stays unknown until a read shows the loop running again', async () => {
    loops = [stopped()];
    writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 0, body: null, network: true });
    await openLoop();
    await press(strings['a.restart']);
    await press(strings['restart.confirm'], dialog());
    expect(await screen.findByText(strings['o.unsure'])).toBeTruthy();
    loops = [stopped({ state: 'running', paused: false, stop_reason: undefined, spent_usd: 0 })];
    await press('Check again');
    expect(await screen.findByText(strings['o.seen.restart'])).toBeTruthy();
    expect(writeCalls()).toHaveLength(1);
  });
});

describe('delete sends its body', () => {
  it('a delete is one DELETE with a JSON body {}', async () => {
    writes['DELETE /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    await openLoop();
    await press('Delete');
    await press('Delete', dialog());
    const w = writeCalls();
    expect(w).toHaveLength(1);
    expect(w[0]!.method).toBe('DELETE');
    expect(w[0]!.body).toEqual({});
    expect(await screen.findByText(strings['o.done.delete'])).toBeTruthy();
  });
});

describe('a timing change = stop + new', () => {
  async function replace() {
    await openLoop();
    await press(strings['a.replace']);
    const form = screen.getByRole('dialog');
    const every = within(form).getByRole('textbox', { name: strings['f.every'] });
    await userEvent.clear(every);
    await userEvent.type(every, '10');
    await press(strings['replace.confirm'], form);
  }

  it('deletes the loop first and creates the new one only after the delete answered', async () => {
    const order: string[] = [];
    writes['DELETE /sessions/sess-1/loops/loop_a'] = (c) => (order.push(c.method), { status: 200, body: { status: 'ok' } });
    writes['POST /sessions/sess-1/loops'] = (c) => (order.push(c.method), { status: 200, body: { status: 'ok', loop: loop({ id: 'loop_b', interval_ms: 600000 }) } });
    await replace();
    expect(order).toEqual(['DELETE', 'POST']);
    expect(posts()[0]!.body).toMatchObject({ prompt: 'Check CI on main', interval: '10m', max_runs: 50 });
    expect(await screen.findByText(strings['o.done.replace'])).toBeTruthy();
  });

  // the new loop keeps the old one's limits, so a capped loop never comes back uncapped.
  it('the new loop keeps the spending and running-time limits, shown in the form and sent with it', async () => {
    loops = [loop({ max_cost_usd: 2.5, max_wall_ms: 7_200_000 })];
    writes['DELETE /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    writes['POST /sessions/sess-1/loops'] = () => ({ status: 200, body: { status: 'ok', loop: loop({ id: 'loop_b', interval_ms: 600000 }) } });
    await openLoop();
    await press(strings['a.replace']);
    const form = screen.getByRole('dialog');
    expect(within(form).getByRole('textbox', { name: strings['f.maxCost'] })).toHaveValue('2.5');
    expect(within(form).getByRole('textbox', { name: strings['f.maxWall'] })).toHaveValue('2');
    const every = within(form).getByRole('textbox', { name: strings['f.every'] });
    await userEvent.clear(every);
    await userEvent.type(every, '10');
    await press(strings['replace.confirm'], form);
    expect(posts()[0]!.body).toMatchObject({ interval: '10m', max_cost_usd: 2.5, max_wall_ms: 7_200_000 });
  });

  it('an old limit too large to write again is never lowered: the form says so at its open and the confirm is disabled', async () => {
    loops = [loop({ max_wall_ms: 9_007_199_254_740_991 })];
    await openLoop();
    await press(strings['a.replace']);
    const form = screen.getByRole('dialog');
    expect(within(form).getByText(strings['p.tooBig'])).toBeTruthy();
    expect(within(form).getByRole('button', { name: strings['replace.confirm'] })).toBeDisabled();
    expect(writeCalls()).toHaveLength(0);
  });

  it('a limit written as 0 is refused in the form and nothing is sent; emptied, the loop has none', async () => {
    loops = [loop({ max_cost_usd: 2.5 })];
    writes['DELETE /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    writes['POST /sessions/sess-1/loops'] = () => ({ status: 200, body: { status: 'ok', loop: loop({ id: 'loop_b' }) } });
    await openLoop();
    await press(strings['a.replace']);
    const form = screen.getByRole('dialog');
    const cost = within(form).getByRole('textbox', { name: strings['f.maxCost'] });
    await userEvent.clear(cost);
    await userEvent.type(cost, '0');
    expect(within(form).getByText(strings['p.maxCost'])).toBeTruthy();
    expect(within(form).getByRole('button', { name: strings['replace.confirm'] })).toBeDisabled();
    await userEvent.clear(cost);
    await press(strings['replace.confirm'], form);
    expect(posts()).toHaveLength(1);
    expect(posts()[0]!.body).not.toHaveProperty('max_cost_usd');
    expect(posts()[0]!.body).not.toHaveProperty('max_wall_ms');
  });

  it('a delete answered 404 starts nothing and never says the old loop is gone', async () => {
    writes['DELETE /sessions/sess-1/loops/loop_a'] = () => ({ status: 404, body: { code: 'not_found', error: 'loop not found' } });
    writes['POST /sessions/sess-1/loops'] = () => ({ status: 200, body: { status: 'ok', loop: loop({ id: 'loop_b' }) } });
    await replace();
    expect(posts()).toHaveLength(0);
    expect(screen.getByText(strings['o.refused.notFound'])).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/no longer there|is gone/i);
  });

  it('a delete whose answer is lost starts nothing new', async () => {
    writes['DELETE /sessions/sess-1/loops/loop_a'] = () => ({ status: 0, network: true });
    writes['POST /sessions/sess-1/loops'] = () => ({ status: 200, body: { status: 'ok', loop: loop({ id: 'loop_b' }) } });
    await replace();
    expect(posts()).toHaveLength(0);
    expect(screen.getByText(strings['o.unsure.replaceDelete'])).toBeTruthy();
    // Check again still sees the old loop: nothing proven, nothing sent.
    await press(/Check again/);
    expect(chatListCalls().length).toBeGreaterThan(0);
    expect(posts()).toHaveLength(0);
    // The old loop reads gone: the new one waits for the person's press.
    chatLoops = () => ({ status: 200, body: { items: [], meta: { total: 0 } } });
    await press(/Check again/);
    expect(posts()).toHaveLength(0);
    expect(screen.getByText(strings['o.awaiting'])).toBeTruthy();
    await press(strings['o.startNew']);
    expect(posts()).toHaveLength(1);
    expect(writeCalls().filter((c) => c.method === 'DELETE')).toHaveLength(1);
  });
});

describe('a lost create is checked with listLoops, never resent or auto-claimed', () => {
  async function create() {
    await show();
    await press(strings.new);
    const form = screen.getByRole('dialog');
    await userEvent.click(within(form).getByRole('button', { name: new RegExp(strings['new.chat']) }));
    await flush();
    // Only open chats are offered.
    expect(screen.queryByRole('option', { name: 'Old one' })).toBeNull();
    await userEvent.click(screen.getByRole('option', { name: 'Fix the tests' }));
    await flush();
    await userEvent.type(within(form).getByRole('textbox', { name: new RegExp(strings['f.prompt']) }), 'Ping the build');
    await press(strings['new.confirm'], form);
    return form;
  }

  it('a lost answer is never sent again; Check again reads the chat and only offers look-alikes', async () => {
    writes['POST /sessions/sess-1/loops'] = () => ({ status: 0, network: true });
    const form = await create();
    expect(posts()).toHaveLength(1);
    expect(posts()[0]!.body).toEqual({ prompt: 'Ping the build', interval: '30m', max_runs: 50 });
    expect(within(form).getByText(strings['o.unsure.create'])).toBeTruthy();
    // The start button cannot send it again.
    const start = within(form).getByRole('button', { name: strings['new.confirm'] });
    await userEvent.click(start);
    await flush();
    expect(posts()).toHaveLength(1);
    // The chat now holds a look-alike made after the send: shown, never claimed by itself.
    const made = new Date(Date.now()).toISOString();
    chatLoops = () => ({ status: 200, body: { items: [loop({ id: 'loop_n', prompt: 'Ping the build', created_at: made })], meta: { total: 1 } } });
    await press(/Check again/, form);
    expect(chatListCalls()).toHaveLength(1);
    expect(within(form).getByText(strings['cand.title'])).toBeTruthy();
    expect(within(form).queryByText(strings['o.done.create'])).toBeNull();
    await press(strings['cand.mine'], form);
    expect(within(form).getByText(strings['o.done.create'])).toBeTruthy();
    expect(posts()).toHaveLength(1);
  });

  // the look-alikes are a kit ItemList named by their question, each
  // one's "This one is mine" its row action, and the outcome lines sit under no page live region (each kit line owns its role).
  it('look-alikes are kit list rows, each with its own pick, under no page live region', async () => {
    writes['POST /sessions/sess-1/loops'] = () => ({ status: 0, network: true });
    const form = await create();
    expect(within(form).getByText(strings['o.unsure.create']).closest('[aria-live]')).toBeNull();
    const made = new Date(Date.now()).toISOString();
    chatLoops = () => ({ status: 200, body: { items: [loop({ id: 'loop_n', prompt: 'Ping the build', created_at: made })], meta: { total: 1 } } });
    await press(/Check again/, form);
    const list = within(form).getByRole('list', { name: strings['cand.title'] });
    const row = list.querySelector('[data-hub-item="loop_n"]') as HTMLElement;
    expect(row).not.toBeNull();
    await press(strings['cand.mine'], row);
    expect(within(form).getByText(strings['o.done.create'])).toBeTruthy();
    expect(posts()).toHaveLength(1);
  });

  it('a look-alike older than the send is not offered', async () => {
    writes['POST /sessions/sess-1/loops'] = () => ({ status: 503, body: { code: 'service_unavailable', error: 'x' } });
    const form = await create();
    chatLoops = () => ({ status: 200, body: { items: [loop({ id: 'loop_old', prompt: 'Ping the build', created_at: new Date(T0 - 86_400_000).toISOString() })], meta: { total: 1 } } });
    await press(/Check again/, form);
    expect(within(form).getByText(strings['cand.none'])).toBeTruthy();
    expect(within(form).queryByRole('button', { name: strings['cand.mine'] })).toBeNull();
    expect(posts()).toHaveLength(1);
  });
});

describe('a lost answer stays unknown until a read shows the change', () => {
  it('a lost pause: a read still showing it running proves nothing; one showing it paused settles it', async () => {
    writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 0, network: true });
    await openLoop();
    await press('Pause');
    await press('Pause', dialog());
    expect(screen.getByText(strings['o.unsure'])).toBeTruthy();
    expect(screen.queryByText(strings['o.done.pause'])).toBeNull();
    await press(/Check again/);
    expect(screen.getByText(strings['o.same'])).toBeTruthy();
    expect(screen.queryByText(strings['o.done.pause'])).toBeNull();
    chatLoops = () => ({ status: 200, body: { items: [loop({ paused: true, state: 'paused' })], meta: { total: 1 } } });
    await press(/Check again/);
    expect(screen.getByText(strings['o.seen.pause'])).toBeTruthy();
    expect(screen.queryByText(strings['o.done.pause'])).toBeNull();
    expect(writeCalls()).toHaveLength(1);
  });

  it("a lost delete is never settled by a 404 from the chat's listing (another owner or realm answers it too)", async () => {
    writes['DELETE /sessions/sess-1/loops/loop_a'] = () => ({ status: 0, network: true });
    await openLoop();
    await press('Delete');
    await press('Delete', dialog());
    expect(screen.getByText(strings['o.unsure'])).toBeTruthy();
    chatLoops = () => ({ status: 404, body: { code: 'not_found', error: 'session not found' } });
    await press(/Check again/);
    expect(screen.getByText(strings['o.readFailed'])).toBeTruthy();
    expect(screen.queryByText(strings['o.seen.delete'])).toBeNull();
    expect(screen.queryByText(strings['o.done.delete'])).toBeNull();
    expect(writeCalls()).toHaveLength(1);
  });

  it('a lost run now is never settled: Check again shows the loop as it is now and it stays unknown', async () => {
    loops = [loop({ paused: true, state: 'paused', run_count: 7 })];
    writes['POST /sessions/sess-1/loops/loop_a/run-now'] = () => ({ status: 0, network: true });
    await openLoop();
    await press('Run now');
    if (screen.queryByRole('alertdialog')) await press('Run now', dialog());
    expect(screen.getByText(strings['o.unsure'])).toBeTruthy();
    chatLoops = () => ({ status: 200, body: { items: [loop({ paused: true, state: 'paused', run_count: 8 })], meta: { total: 1 } } });
    await press(/Check again/);
    expect(screen.getByText(strings['o.unsure'])).toBeTruthy();
    expect(screen.getByText(/Now: run count 8, no end time\./)).toBeTruthy();
    expect(screen.queryByText(strings['o.done.runNow'])).toBeNull();
    expect(writeCalls()).toHaveLength(1);
  });

  it('an unknown change can be let go with its own press; nothing is sent', async () => {
    writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 0, network: true });
    await openLoop();
    await press('Pause');
    await press('Pause', dialog());
    await press(strings['o.forget']);
    expect(screen.queryByText(strings['o.unsure'])).toBeNull();
    expect(writeCalls()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Pause' }).hasAttribute('disabled')).toBe(false);
  });

  it('a replaced loop whose row went away keeps its unknown new loop where the row was', async () => {
    writes['DELETE /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    writes['POST /sessions/sess-1/loops'] = () => ({ status: 0, network: true });
    await openLoop();
    await press(strings['a.replace']);
    await press(strings['replace.confirm'], screen.getByRole('dialog'));
    expect(screen.getByText(strings['o.unsure.create'])).toBeTruthy();
    // The list is read again without the old loop: its row and actions go.
    loops = [];
    await act(async () => { await queryClient.invalidateQueries(); });
    await flush();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.getByText(strings['o.unsure.create'])).toBeTruthy();
    expect(screen.getByRole('button', { name: /Check again/ })).toBeTruthy();
    expect(posts()).toHaveLength(1);
  });

  it('a refused change is a definite refusal, not an unknown', async () => {
    writes['POST /sessions/sess-1/loops/loop_a/run-now'] = () => ({ status: 400, body: { code: 'bad_request', error: 'loop already firing' } });
    await openLoop();
    await press('Run now');
    expect(screen.getByText(strings['o.refused'])).toBeTruthy();
    expect(screen.queryByText(strings['o.unsure'])).toBeNull();
  });
});

describe('a confirm bound to the loop it was opened on', () => {
  const refetch = async () => {
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await flush();
  };

  it('a Delete confirm opened on loop A is discarded when B is selected, and nothing is deleted on B', async () => {
    loops = [loop(), loop({ id: 'loop_b', prompt: 'Watch the deploy' })];
    writes['DELETE /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    writes['DELETE /sessions/sess-1/loops/loop_b'] = () => ({ status: 200, body: { status: 'ok' } });
    const router = await show(`/ai/auto/loops?sel=${encodeURIComponent(`${R1}/sess-1/loop_a`)}`);
    await press('Delete');
    expect(dialog()).toBeTruthy();
    await act(async () => {
      router.history.push(`/ai/auto/loops?sel=${encodeURIComponent(`${R1}/sess-1/loop_b`)}`);
    });
    await flush();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(writeCalls()).toHaveLength(0);
  });

  it('a Pause confirm is discarded when the loop stops, and does not come back when it runs again', async () => {
    writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    await openLoop();
    await press('Pause');
    expect(dialog()).toBeTruthy();
    loops = [loop({ state: 'stopped', paused: true, stop_reason: 'max_cost_usd' })];
    await refetch();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    loops = [loop()];
    await refetch();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText(strings.changed)).toBeTruthy();
    expect(writeCalls()).toHaveLength(0);
  });

  it('a confirmed Delete sends nothing when the chat no longer lists the loop at the send', async () => {
    writes['DELETE /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    await openLoop();
    await press('Delete');
    chatLoops = () => ({ status: 200, body: { items: [], meta: { total: 0 } } });
    await press('Delete', dialog());
    expect(writeCalls()).toHaveLength(0);
    expect(screen.getByText(strings['o.notSent.changed'])).toBeTruthy();
  });

  it('a confirmed Pause sends nothing when the loop no longer offers a pause at the send', async () => {
    writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    await openLoop();
    await press('Pause');
    chatLoops = () => ({ status: 200, body: { items: [loop({ state: 'stopped', paused: true })], meta: { total: 1 } } });
    await press(strings['a.pause'], dialog());
    expect(writeCalls()).toHaveLength(0);
    expect(screen.getByText(strings['o.notSent.changed'])).toBeTruthy();
  });

  it('a confirmed end time sends nothing when the loop expired before the send, though it still offers an end time', async () => {
    writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    await openLoop();
    await press(strings['a.extend']);
    chatLoops = () => ({ status: 200, body: { items: [loop({ state: 'expired' })], meta: { total: 1 } } });
    await press(strings['extend.confirm'], dialog());
    expect(writeCalls()).toHaveLength(0);
    expect(screen.getByText(strings['o.notSent.changed'])).toBeTruthy();
  });

  it('an end time opened on a running loop stays off when only the opening read shows it expired; nothing is sent', async () => {
    writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    chatLoops = () => ({ status: 200, body: { items: [loop({ state: 'expired' })], meta: { total: 1 } } });
    await openLoop();
    await press(strings['a.extend']);
    expect(dialog().textContent).toContain(strings['confirm.unreadable']);
    const b = within(dialog()).getByRole('button', { name: strings['extend.confirm'] });
    expect(b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true').toBe(true);
    await userEvent.click(b);
    await flush();
    expect(writeCalls()).toHaveLength(0);
  });

  it("the confirm button waits for the read that binds it, and stays off when the chat's loops cannot be read", async () => {
    writes['DELETE /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    await openLoop();
    chatLoops = () => ({ status: 500, body: { code: 'internal_error', error: 'x' } });
    await press('Delete');
    const b = within(dialog()).getByRole('button', { name: 'Delete' });
    expect(b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true').toBe(true);
    await userEvent.click(b);
    await flush();
    expect(writeCalls()).toHaveLength(0);
  });

  it("a 404 from the chat's listing is unreadable, never \"no loops\": the confirm stays off and nothing is sent", async () => {
    writes['DELETE /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    await openLoop();
    chatLoops = () => ({ status: 404, body: { code: 'not_found', error: 'session not found' } });
    await press('Delete');
    expect(dialog().textContent).toContain(strings['confirm.unreadable']);
    const b = within(dialog()).getByRole('button', { name: 'Delete' });
    expect(b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true').toBe(true);
    await userEvent.click(b);
    await flush();
    expect(writeCalls()).toHaveLength(0);
  });

  it("an end time picked on a running loop is discarded when the loop expires; Never is then reset, never sent", async () => {
    writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    await openLoop();
    await press(strings['a.extend']);
    await userEvent.click(within(dialog()).getByRole('button', { name: new RegExp(strings['extend.label']) }));
    await flush();
    await userEvent.click(screen.getByRole('option', { name: strings['end.never'] }));
    await flush();
    loops = [loop({ state: 'expired' })];
    await refetch();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText(strings.changed)).toBeTruthy();
    expect(writeCalls()).toHaveLength(0);
    await press(strings['a.extend']);
    await press(strings['extend.confirm'], dialog());
    expect(writeCalls().map((c) => c.body)).toEqual([{ expires_in: '1d' }]);
  });
});

describe('every loop overlay carries its own name (layout.overlayId)', () => {
  const named = (el: HTMLElement) => el.closest('[data-hub-overlay]')?.getAttribute('data-hub-overlay') ?? el.getAttribute('data-hub-overlay');
  it.each([
    ['Pause', 'ai-loops-pause'],
    ['Delete', 'ai-loops-delete'],
    [strings['a.extend'], 'ai-loops-extend'],
  ])('the %s confirm is %s', async (button, id) => {
    await openLoop();
    await press(button);
    expect(named(dialog())).toBe(id);
    expect(writeCalls()).toHaveLength(0);
  });

  it('the timing-change drawer is ai-loops-replace and the new-loop drawer is ai-loops-new', async () => {
    await openLoop();
    await press(strings['a.replace']);
    expect(named(screen.getByRole('dialog'))).toBe('ai-loops-replace');
    cleanup();
    await show();
    await press(strings.new);
    expect(named(screen.getByRole('dialog'))).toBe('ai-loops-new');
    expect(writeCalls()).toHaveLength(0);
  });
});

// Each short line links to its answer in the tab's questions (pages/ai/faq.ts).
describe('links to the answers', () => {
  const refetch = async () => {
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await flush();
  };
  const href = (name: string, root?: HTMLElement) => (root ? within(root) : screen).getByRole('link', { name }).getAttribute('href') ?? '';

  it.each(['Pause', 'Delete', strings['a.extend']])('the %s confirm links to the loop change answer', async (button) => {
    await openLoop();
    await press(button);
    expect(href(strings['more.change'], dialog())).toMatch(/#faq-loopChange$/);
  });

  it('the timing-change drawer\'s Why links to the loop change answer; the new-loop drawer\'s to the loop basics', async () => {
    await openLoop();
    await press(strings['a.replace']);
    const form = screen.getByRole('dialog');
    await press(strings['f.memoryQ'], form);
    expect(href(strings['more.change'], form)).toMatch(/#faq-loopChange$/);
    cleanup();
    resetKeptForTests();
    await show();
    await press(strings.new);
    const fresh = screen.getByRole('dialog');
    await press(strings['f.memoryQ'], fresh);
    expect(href(strings['more.kinds'], fresh)).toMatch(/#faq-autoKinds$/);
  });

  it('a done change links to the loop change answer; a lost one to the unknown answer', async () => {
    writes['PATCH /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    await openLoop();
    await press('Pause');
    await press('Pause', dialog());
    expect(await screen.findByText(strings['o.done.pause'])).toBeTruthy();
    expect(href(strings['more.change'])).toMatch(/#faq-loopChange$/);
    cleanup();
    resetKeptForTests();
    writes['DELETE /sessions/sess-1/loops/loop_a'] = () => ({ status: 0, network: true });
    await openLoop();
    await press('Delete');
    await press('Delete', dialog());
    expect(screen.getByText(strings['o.unsure'])).toBeTruthy();
    expect(href(strings['more.unsure'])).toMatch(/#faq-autoUnsure$/);
    expect(screen.queryByRole('link', { name: strings['more.change'] })).toBeNull();
  });

  it('a confirmed change that sent nothing links to the not-sent answer', async () => {
    writes['DELETE /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    await openLoop();
    await press('Delete');
    chatLoops = () => ({ status: 200, body: { items: [], meta: { total: 0 } } });
    await press('Delete', dialog());
    expect(screen.getByText(strings['o.notSent.changed'])).toBeTruthy();
    expect(href(strings['more.notSent'])).toMatch(/#faq-autoNotSent$/);
  });

  it('an old loop gone with the new one not started links to the loop change answer', async () => {
    writes['DELETE /sessions/sess-1/loops/loop_a'] = () => ({ status: 0, network: true });
    await openLoop();
    await press(strings['a.replace']);
    const form = screen.getByRole('dialog');
    const every = within(form).getByRole('textbox', { name: strings['f.every'] });
    await userEvent.clear(every);
    await userEvent.type(every, '10');
    await press(strings['replace.confirm'], form);
    chatLoops = () => ({ status: 200, body: { items: [], meta: { total: 0 } } });
    await press(/Check again/);
    expect(screen.getByText(strings['o.awaiting'])).toBeTruthy();
    const band = screen.getByText(strings['o.awaiting']).closest('div') as HTMLElement;
    expect(href(strings['more.change'], band)).toMatch(/#faq-loopChange$/);
  });

  it('a confirm closed because the loop moved: its band links to the not-sent answer', async () => {
    await openLoop();
    await press('Pause');
    loops = [loop({ state: 'stopped', paused: true, stop_reason: 'max_cost_usd' })];
    await refetch();
    loops = [loop()];
    await refetch();
    const band = screen.getByText(strings.changed, { exact: false }).closest('[class]') as HTMLElement;
    expect(href(strings['more.notSent'], band)).toMatch(/#faq-autoNotSent$/);
    expect(writeCalls()).toHaveLength(0);
  });

  it('a replaced loop whose row went away keeps its link to the unknown answer', async () => {
    writes['DELETE /sessions/sess-1/loops/loop_a'] = () => ({ status: 200, body: { status: 'ok' } });
    writes['POST /sessions/sess-1/loops'] = () => ({ status: 0, network: true });
    await openLoop();
    await press(strings['a.replace']);
    await press(strings['replace.confirm'], screen.getByRole('dialog'));
    loops = [];
    await act(async () => { await queryClient.invalidateQueries(); });
    await flush();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.getByText(strings['o.unsure.create'])).toBeTruthy();
    expect(href(strings['more.unsure'])).toMatch(/#faq-autoUnsure$/);
    expect(screen.queryByRole('link', { name: strings['more.change'] })).toBeNull();
  });
});

describe('the detail header and the new-loop drawer', () => {
  it('a running loop: Pause is the primary, Run now beside it, the rest under ⋯ with Delete last', async () => {
    await openLoop();
    const bar = screen.getByRole('group', { name: strings['a.label'] });
    expect(within(bar).getByRole('button', { name: 'Pause' })).toBeTruthy();
    const has = await offered();
    expect([...has].sort()).toEqual(['Delete', 'Pause', 'Run now', strings['a.extend'], strings['a.replace']].sort());
    expect(has[has.length - 1]).toBe('Delete');
  });
  it('a paused loop says what pausing does in one Verdict line, and offers Resume as the primary', async () => {
    loops = [loop({ state: 'paused', paused: true })];
    await openLoop();
    expect(within(screen.getByRole('group', { name: strings['a.label'] })).getByRole('button', { name: 'Resume' })).toBeTruthy();
    expect(screen.getAllByText(/A paused loop no longer keeps its chat open/).length).toBeGreaterThan(0);
  });
  it('no open chat: the drawer offers a new chat instead of the form, and no Start loop', async () => {
    onFetch((c) => {
      const p = path(c.url);
      if (c.method === 'GET' && p.endsWith('/agent/sessions')) return { status: 200, body: { items: [{ id: 'sess-9', realm: R1, name: 'Old one', state: 'closed' }], meta: { total: 1 } } };
      if (c.method === 'GET' && p.endsWith('/agent/loops')) return { status: 200, body: { items: loops, meta: { total: loops.length } } };
      return { status: 404, body: { code: 'not_found', error: 'nope' } };
    });
    await show();
    await press(strings.new);
    const form = screen.getByRole('dialog');
    expect(within(form).getByText(strings['new.noChats'])).toBeTruthy();
    expect(within(form).getByRole('link', { name: strings['new.newChat'] }).getAttribute('href')).toMatch(/\/ai\/new$/);
    expect(within(form).queryByRole('textbox', { name: new RegExp(strings['f.prompt']) })).toBeNull();
    expect(within(form).queryByRole('button', { name: strings['new.confirm'] })).toBeNull();
  });
});

// forms-required, "New loop drawer": Start loop was off with nothing naming the chat or the prompt it waits
// for. Off, it now stays focusable and says which one (kit ReasonButton), and a press sends nothing.
describe('New loop: Start loop says what it waits for', () => {
  it('names the chat first, then the prompt; with both it is on and says nothing', async () => {
    await show();
    await press(strings.new);
    const form = screen.getByRole('dialog');
    const start = () => within(form).getByRole('button', { name: strings['new.confirm'] });
    expect(start().getAttribute('aria-disabled')).toBe('true');
    expect(start().hasAttribute('disabled')).toBe(false);
    expect(within(form).getAllByText(strings['new.needChat']).length).toBeGreaterThan(0);
    await userEvent.click(start());
    await flush();
    expect(posts()).toHaveLength(0);
    await userEvent.click(within(form).getByRole('button', { name: new RegExp(strings['new.chat']) }));
    await flush();
    await userEvent.click(screen.getByRole('option', { name: 'Fix the tests' }));
    await flush();
    // The chat is picked: the empty prompt is what it waits for now.
    expect(within(form).queryByText(strings['new.needChat'])).toBeNull();
    expect(start().getAttribute('aria-disabled')).toBe('true');
    expect(within(form).getAllByText(strings['p.prompt']).length).toBeGreaterThan(0);
    await userEvent.click(start());
    await flush();
    expect(posts()).toHaveLength(0);
    await userEvent.type(within(form).getByRole('textbox', { name: new RegExp(strings['f.prompt']) }), 'Ping the build');
    await flush();
    expect(start().getAttribute('aria-disabled')).not.toBe('true');
    expect(start().hasAttribute('disabled')).toBe(false);
  });
});
