// Every shell switch path reaches core's one leave guard (realm.ts), with core's real switch: a ?open_realm=
// link and a failed switch's Try again ask while work runs, and Stay keeps the realm.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { capture, holdLeave, setLeaveAsker } from '@core';
import { switchRealm } from '@core/shell';
import { FIXTURE_REALM_2 } from '@core/fixtures';
import { definePage, type PageManifest } from '@kit/page';
import strings from './strings.en.json';
import { buildRouter } from '../app/router';

const h = vi.hoisted(() => ({ listeners: new Set<(n: unknown) => void>(), toast: vi.fn() }));
vi.mock('@core/shell', async (orig) => ({
  ...(await orig<object>()),
  onRealmNotice: (l: (n: unknown) => void) => {
    h.listeners.add(l);
    return () => void h.listeners.delete(l);
  },
}));
vi.mock('@kit/states/Toast', async (orig) => ({ ...(await orig<object>()), showToast: h.toast }));

import { CoreNotices } from './notices';

const releases: Array<() => void> = [];
afterEach(async () => {
  cleanup();
  document.body.innerHTML = '';
  while (releases.length) releases.pop()!();
  h.toast.mockClear();
  await switchRealm('all');
});
function asker(answer: boolean) {
  const fn = vi.fn((_n: number) => Promise.resolve(answer));
  releases.push(setLeaveAsker(fn));
  return fn;
}

function Home() {
  return <h1 data-hub-title tabIndex={-1}>Home</h1>;
}
const PAGES: PageManifest[] = [
  definePage({ id: 'home', path: '/home', title: 'title', layout: 'settings', load: async () => ({ default: Home }), status: 'ready', sensitive: false, strings: { title: 'Home' } }),
];
async function openLink() {
  const router = buildRouter(PAGES, { queryClient: new QueryClient(), shell: true, history: createMemoryHistory({ initialEntries: [`/home?open_realm=${FIXTURE_REALM_2}`] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

describe('every switch path asks while work runs', () => {
  // The shell mounts its own dialog (AppShell's LeaveConfirm): the link asks through it.
  const leaveDialog = () => screen.findByRole('alertdialog', { name: strings['leave.title'] });
  it('a ?open_realm= link: Stay keeps the realm', async () => {
    releases.push(holdLeave('upload'));
    await openLink();
    const d = await leaveDialog();
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: strings['leave.stay'] })); await new Promise((r) => setTimeout(r, 20)); });
    expect(capture().realm).not.toBe(FIXTURE_REALM_2);
  });

  it('a ?open_realm= link: Go on anyway switches', async () => {
    releases.push(holdLeave('upload'));
    await openLink();
    const d = await leaveDialog();
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: strings['leave.confirm'] })); await new Promise((r) => setTimeout(r, 20)); });
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    expect(capture().realm).toBe(FIXTURE_REALM_2);
  });

  it("a failed switch's Try again: Stay keeps the realm", async () => {
    render(<CoreNotices />);
    const before = capture().realm;
    act(() => { for (const l of [...h.listeners]) l({ kind: 'switch-failed', target: FIXTURE_REALM_2, current: before }); });
    const action = (h.toast.mock.calls.at(-1)?.[0] as { action?: { onAction: () => void } }).action;
    expect(action).toBeDefined();
    releases.push(holdLeave('upload'));
    const ask = asker(false);
    await act(async () => { action!.onAction(); await new Promise((r) => setTimeout(r, 20)); });
    expect(ask).toHaveBeenCalledWith(1, expect.any(Function));
    expect(capture().realm).toBe(before);
  });
});
