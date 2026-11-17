// Vitest: the Work tab stays mounted across a Bot switch, so what a refused Stop leaves behind is tied to the Bot it was
// asked on: its page banner shows only while that Bot is the one in view.
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, userEvent, within } from '@app/testing';
import { CoreQueryProvider } from '@core';
import kitStrings from '@kit/strings.en.json';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import type { Change, Delegate, FinishedList } from './data';
import { WorkTab } from './parts/WorkTab';
import strings from './strings.en.json';

const task: Delegate = { sessionId: 's-1', title: 'Read deploy log', state: 'working', computerId: 'c1', model: 'm', waitingOn: null, startedAt: '2026-11-14T10:00:00Z' };
const finished: FinishedList & { open: boolean } = { count: 0, rows: [], loading: false, error: false, canMore: false, more: () => {}, retry: () => {}, open: false };

type Stop = Change<void, { sessionId: string; close: boolean }>;
const control: { set?: (s: Partial<Stop>) => void; shown?: (on: boolean) => void } = {};

function Host() {
  const [shown, setShown] = useState(true);
  const [st, setSt] = useState<Partial<Stop>>({ outcome: 'idle', running: false, code: undefined });
  control.set = (s) => setSt((o) => ({ ...o, ...s }));
  control.shown = setShown;
  const stop = {
    ...st,
    run: () => new Promise(() => {}),
    data: undefined, details: undefined, idem: undefined,
    readBack: async () => true, dismiss: () => setSt({ outcome: 'idle', running: false }), reset: () => setSt((o) => (o.running || o.outcome === 'pending' ? o : { ...o, outcome: 'idle', code: undefined })),
  } as unknown as Stop;
  return <WorkTab delegates={shown ? [task] : []} computers={[]} stop={stop} canStop finished={finished} />;
}

let go: (sel: string) => Promise<void>;
async function show() {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Host /> }), history: createMemoryHistory({ initialEntries: ['/bots?sel=bot-a'] }) });
  go = (sel) => router.navigate({ to: '.', search: { sel } as never });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
}

async function askStop() {
  const row = (await screen.findByText('Read deploy log')).closest('tr') as HTMLElement;
  await userEvent.click(within(row).getByRole('button', { name: /^(Row actions|More actions for )/ }));
  await userEvent.click(await screen.findByRole('menuitem', { name: strings['work.stopMenu'] }));
  expect(await screen.findByText(strings['work.stopTitle'])).toBeInTheDocument();
}

afterEach(cleanup);

it("a refusal left by Bot A's Stop is not shown on Bot B's Work tab, and is again on Bot A", async () => {
  await show();
  await askStop();
  await act(async () => control.set!({ running: true, outcome: 'running' }));
  await act(async () => control.shown!(false));
  await act(async () => { await go('bot-b'); });
  await act(async () => control.set!({ running: false, outcome: 'failed', code: 'stop_failed' }));
  expect(screen.queryByText(kitStrings['outcome.failed.title'])).toBeNull();
  await act(async () => { await go('bot-a'); });
  expect(await screen.findByText(kitStrings['outcome.failed.title'])).toBeInTheDocument();
}, 30000);
