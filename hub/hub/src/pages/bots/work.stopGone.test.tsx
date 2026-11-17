// Vitest: the Stop dialog belongs to its task. When the task leaves the Bot's list (another Bot shown) the ask is
// forgotten once no stop of it is out, so the task coming back never brings the dialog back unasked; and a refusal that
// comes back after the dialog went is said on the page.
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

async function show() {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Host /> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
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

it('the task leaving and coming back never brings its Stop dialog back unasked', async () => {
  await show();
  await askStop();
  await act(async () => control.shown!(false));
  expect(screen.queryByText(strings['work.stopTitle'])).toBeNull();
  await act(async () => control.shown!(true));
  await screen.findByText('Read deploy log');
  expect(screen.queryByText(strings['work.stopTitle'])).toBeNull();
}, 30000);

it('a refusal that comes back after the dialog went is said on the page', async () => {
  await show();
  await askStop();
  await act(async () => control.set!({ running: true, outcome: 'running' }));
  await act(async () => control.shown!(false));
  await act(async () => control.set!({ running: false, outcome: 'failed', code: 'stop_failed' }));
  expect(await screen.findByText(kitStrings['outcome.failed.title'])).toBeInTheDocument();
}, 30000);
