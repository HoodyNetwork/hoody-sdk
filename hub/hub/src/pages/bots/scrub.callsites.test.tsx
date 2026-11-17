// Vitest: at each place the Bots page shows the agent's outside text through plainLine(scrubSecrets(x), n), a key stays
// hidden when a control byte sits inside it or an invisible character sits right before it. scrub.boundary.test.ts pins the generic order; this pins every place that uses it,
// the computer names a runtime row shows included (outside text too: the API names a computer).
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, renderHook, screen, userEvent, waitFor, within } from '@app/testing';
import { CoreQueryProvider, queryClient } from '@core';
import { boot, onFetch, settle } from '@core/test/env';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTargets, useMessageTask, type BotRow, type BotView, type Change, type Delegate, type FinishedList, type LogPage, type LogRow } from './data';
import { senderWho, stageWords, taskMessageText } from './logic';
import { ActivityLog, ActivityTab, type RowPlaceView } from './parts/ActivityTab';
import { MessageTaskDrawer, PendingMessages } from './parts/MessageTask';
import { WorkTab } from './parts/WorkTab';
import strings from './strings.en.json';

const DIGITS = '0123456789abcdef';
const VARIANTS: ReadonlyArray<readonly [string, string]> = [
  ['a control byte inside the key', 'sk-\u0007live0123456789abcdef'],
  ['an invisible character right before the key', 'note\u200bsk-live0123456789abcdef'],
];
const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const BOT_KEY = `c1~${R1}~chief`;

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 'sv1' }]);
});
afterEach(() => cleanup());

/** Nothing on the page, in its text or in any accessible name, holds the key's body. */
function expectNoKey(): void {
  expect(document.body.textContent ?? '').not.toContain(DIGITS);
  for (const el of document.querySelectorAll('[aria-label],[title],[aria-description]')) {
    for (const a of ['aria-label', 'title', 'aria-description']) expect(el.getAttribute(a) ?? '').not.toContain(DIGITS);
  }
}

describe('the functions every Bots line is built from', () => {
  it.each(VARIANTS)('a stage reason and a stage code (underscores turn to spaces after the scrub), with %s', (_n, v) => {
    for (const out of [stageWords({ message: '', reason: `failed_${v}`, code: '' }), stageWords({ message: '', reason: '', code: `failed_${v}` })]) {
      expect(out).toContain('[hidden]');
      expect(out).not.toContain(DIGITS);
    }
  });
  it.each(VARIANTS)('a key sender name and a chat app name, with %s', (_n, v) => {
    for (const who of [`key:${v}`, v]) {
      const name = senderWho(who).name;
      expect(name).toContain('[hidden]');
      expect(name).not.toContain(DIGITS);
    }
  });
  it.each(VARIANTS)('a task title in the text sent to the Bot, with %s', (_n, v) => {
    const text = taskMessageText({ title: v, sessionId: 's1' }, 'hi');
    expect(text).toContain('[hidden]');
    expect(text).not.toContain(DIGITS);
  });
});

const logProps = { loading: false, error: false, onRetry: () => undefined, onLoadOlder: () => undefined, loadingOlder: false, olderFailed: false, hideTasks: false, onHideTasks: () => undefined };
const logRow = (o: Partial<LogRow>): LogRow => ({ seq: 1, kind: 'report', text: 'ok', at: '2026-11-06T10:00:00Z', raw: null, delegateTitle: null, sessionId: null, sender: null, ...o });
const pageOf = (...rows: LogRow[]): LogPage => ({ rows, live: 'up_to_date', hasOlder: false, archiveRows: 0 });

describe('the Activity log', () => {
  it.each(VARIANTS)('a runtime row hides it in the task title, the row text and the advanced text, with %s', (_n, v) => {
    for (const row of [logRow({ delegateTitle: v }), logRow({ text: v }), logRow({ raw: v })]) {
      cleanup();
      render(<ActivityLog {...logProps} page={pageOf(row)} />);
      expect(document.body.textContent).toContain('[hidden]');
      expectNoKey();
    }
  });
  it.each(VARIANTS)('a runtime row names its computers (the task\'s and where it runs) without the key, with %s', (_n, v) => {
    const places: RowPlaceView[] = [
      { sid: 's1', title: 'Plain task', session: v, runs: null, href: null },
      { sid: 's1', title: 'Plain task', session: 'atlas', runs: v, href: null },
      { sid: 's1', title: 'Plain task', session: v, runs: '', href: null },
    ];
    for (const p of places) {
      cleanup();
      render(<ActivityLog {...logProps} page={pageOf(logRow({ sessionId: 's1' }))} placeOf={() => p} />);
      expect(document.body.textContent).toContain('[hidden]');
      expectNoKey();
    }
  });
  it.each(VARIANTS)('the title that links the task\'s chat hides it in its text and its accessible name, with %s', (_n, v) => {
    const place = (): RowPlaceView => ({ sid: 's1', title: v, session: 'atlas', runs: null, href: '/ai/c/s1' });
    render(<ActivityLog {...logProps} page={pageOf(logRow({ sessionId: 's1' }))} placeOf={place} />);
    const link = screen.getByRole('link', { name: /open the task's chat/ });
    expect(link.textContent).toContain('[hidden]');
    expect(link.getAttribute('aria-label')).toContain('[hidden]');
    expectNoKey();
  });
});

const task = (o: Partial<Delegate>): Delegate => ({ sessionId: 's1', title: 'Plain task', state: 'working', computerId: 'c1', model: 'm', waitingOn: null, startedAt: '2026-11-06T10:00:00Z', ...o });
const botAt = (): BotView =>
  ({
    key: BOT_KEY, id: 'chief', uid: 'u-chief', name: 'Chief', role: '', instructions: '', model: 'p/a', modelLabel: 'A',
    provider: { id: 'p', label: 'P', ready: 'ready' }, yolo: false, gate: null, turnRunning: false, turnId: null, sessionModel: null,
    pausedAtLimit: false, queued: 0, tasksOpen: 0, allowedComputers: null, allowedAgents: null, guardrails: [], guardrailCheck: 'off',
    guardrailRevision: 6, checkerOk: true, routing: 'off', async: false, waitSeconds: 0, realtimeMaxItems: 0,
    speech: { enabled: false, ready: null, why: null, config: null }, workers: { known: true, backend: 'llm', allowed: ['llm'], agent: '', model: '' },
    caps: { botExpect: true, botGateHttp: true, botTurnCancel: true }, attention: [], createdAt: '',
  }) as BotView;

async function show(ui: ReactNode): Promise<void> {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <>{ui}</> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
}

describe('the tasks in the Details panel', () => {
  it.each(VARIANTS)('names a task and its "Message this task" button without the key, with %s', async (_n, v) => {
    await show(
      <ActivityTab {...logProps} page={undefined} bot={botAt()} row={{ key: BOT_KEY, lastActivityAt: null } as BotRow} link={null} onOpenSettings={() => undefined} tasks={[task({ title: v })]} onMessageTask={() => undefined} details />,
    );
    const labels = [...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label') ?? '').filter((l) => l.startsWith('Message the task'));
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) expect(l).toContain('[hidden]');
    expect(document.body.textContent).toContain('[hidden]');
    expectNoKey();
  });
});

describe('the Work tab', () => {
  const stop = { run: vi.fn(), outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false, readBack: vi.fn(), dismiss: vi.fn(), reset: vi.fn() } as unknown as Change<void, { sessionId: string; close: boolean }>;
  const finished: FinishedList & { open: boolean } = { count: 0, rows: [], loading: false, error: false, canMore: false, more: () => undefined, retry: () => undefined, open: false };

  it.each(VARIANTS)('hides it in the title and in what a task waits on, and a search never finds it, with %s', async (_n, v) => {
    await show(<WorkTab delegates={[task({ sessionId: 'a', title: v }), task({ sessionId: 'b', title: 'Plain task', waitingOn: v })]} computers={[]} stop={stop} canStop finished={finished} />);
    const table = within(await screen.findByRole('table', { name: strings['work.title'] }));
    expect(table.getByText('Plain task')).toBeInTheDocument();
    expect(document.body.textContent).toContain('Waiting to:');
    expect(document.body.textContent).toContain('[hidden]');
    expectNoKey();
    const box = screen.getByPlaceholderText(strings['work.search']);
    await userEvent.click(box);
    await userEvent.paste('0123456789');
    await waitFor(() => expect(screen.getByText(strings['work.noMatch'])).toBeInTheDocument());
    await userEvent.clear(box);
    await userEvent.paste('hidden');
    await waitFor(() => expect(screen.queryByText(strings['work.noMatch'])).toBeNull());
    expect(within(screen.getByRole('table', { name: strings['work.title'] })).getByText('Plain task')).toBeInTheDocument();
    expectNoKey();
  }, 30000);
});

describe('the message form and a message that may have been sent', () => {
  const send = { run: vi.fn(async () => ({ outcome: 'done' as const, data: { queued: false } })), outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false, readBack: vi.fn(), dismiss: vi.fn(), reset: vi.fn() } as unknown as Change<{ queued: boolean }, { sessionId: string; text: string }>;
  
  it.each(VARIANTS)('the drawer names the task without the key, with %s', async (_n, v) => {
    await show(<MessageTaskDrawer task={task({ title: v })} onClose={() => undefined} send={send} />);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('[hidden]');
    expectNoKey();
  });

  it.each(VARIANTS)('the held-message banner names the task without the key, with %s', async (_n, v) => {
    onFetch((c) => (c.method === 'POST' ? { status: 0, network: true } : { status: 200, body: { data: {} } }));
    const h = renderHook(() => useMessageTask(BOT_KEY, 's1', []), { wrapper: CoreQueryProvider });
    for (let i = 0; i < 10; i++) await act(settle);
    await act(async () => {
      await h.result.current.run({ sessionId: 's1', text: 'words' });
    });
    for (let i = 0; i < 10; i++) await act(settle);
    render(<PendingMessages botKey={BOT_KEY} tasks={[task({ title: v })]} openId={undefined} />, { wrapper: CoreQueryProvider });
    expect(await screen.findByText(/may have been sent/)).toBeInTheDocument();
    expect(document.body.textContent).toContain('[hidden]');
    expectNoKey();
  });
});
