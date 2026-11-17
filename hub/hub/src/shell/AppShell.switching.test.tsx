// Realm switch progress in the real AppShell. Once a switch has run a moment, the switch line says where the Hub is
// going and which realm the page still shows.
// - The line is a row of its own under the top bar, outside main, so it never covers the page.
// - The page stays usable (no aria-busy, no inert): a newer pick supersedes the switch.
// - The live region stays in the DOM, empty when idle; Cancel sits outside it, and Cancel or Esc ends the switch.
// - While a ?open_realm= link withholds the page, the line is the one announcement, and it does not claim the page
//   still shows the old realm.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSwitching } from '@core/ctx';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';
import type * as RealmParam from './realmParam';
import type * as SwitchOps from './switchOp';

const ctl = vi.hoisted(() => ({ wait: false, cancelled: 0, cancels: true }));
vi.mock('./realmParam', async (orig) => ({ ...(await orig<typeof RealmParam>()), useRealmParam: () => ctl.wait }));
vi.mock('./switchOp', async (orig) => ({
  ...(await orig<typeof SwitchOps>()),
  cancelSwitch: () => {
    if (!ctl.cancels) return false;
    ctl.cancelled += 1;
    setSwitching(null);
    return true;
  },
}));

function Other() {
  return <h1>Other</h1>;
}
const strings = { title: 'Page' } as const;
const page = (id: string, component: () => ReactElement): PageManifest =>
  definePage({ id, path: `/${id}`, title: 'title', layout: 'settings', load: async () => ({ default: component }), status: 'ready', sensitive: false, strings });

async function open(path: string) {
  const router = buildRouter([page('other', Other)], { queryClient: new QueryClient(), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  if (!ctl.wait) await screen.findByRole('heading', { level: 1, name: 'Other' });
}

const main = () => document.getElementById('hub-main') as HTMLElement;
const line = () => document.querySelector('[data-hub-switch-line]') as HTMLElement;
const status = () => line().querySelector('[role="status"]') as HTMLElement;
const cancel = () => within(line()).queryByRole('button', { name: 'Cancel the realm switch' });
const SOME = 'c'.repeat(24);
// Status regions with something to read out (the app keeps other, empty, live regions mounted).
const spoken = () => screen.getAllByRole('status').filter((el) => el.textContent !== '');

beforeEach(() => {
  Object.assign(ctl, { wait: false, cancelled: 0, cancels: true });
});
afterEach(() => {
  act(() => setSwitching(null));
  cleanup();
  document.body.innerHTML = '';
});

describe('AppShell during a realm switch', () => {
  it('a visible polite line in its own row says where the Hub is going and what the page still shows; the page stays usable', async () => {
    await open('/other');
    // A row of the shell under the top bar, never inside main (so it never covers the page's top).
    expect(main().contains(line())).toBe(false);
    expect(line().compareDocumentPosition(main()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(status()).toHaveAttribute('aria-live', 'polite');
    expect(line().textContent).toBe('');
    expect(cancel()).toBeNull();
    await act(async () => setSwitching(SOME));
    expect(line().textContent).toBe('');
    expect(await screen.findByText('Switching realm…')).toBeInTheDocument();
    // The realm the page shows (the fixture world's), by name; Cancel is not part of the message.
    expect(status()).toHaveTextContent(/^Switching realm…This page still shows [^{}]+\.$/);
    expect(status().contains(cancel())).toBe(false);
    expect(cancel()).toHaveTextContent('Cancel');
    expect(line().textContent).not.toMatch(/[0-9a-f]{24}/);
    expect(document.body.textContent).not.toMatch(/c{24}/);
    expect(main()).not.toHaveAttribute('aria-busy');
    expect(main()).not.toHaveAttribute('inert');
    expect(screen.getByRole('heading', { level: 1, name: 'Other' })).toBeInTheDocument();
    await act(async () => setSwitching(null));
    expect(line()).toBeInTheDocument();
    expect(line().textContent).toBe('');
    expect(cancel()).toBeNull();
  });

  it('Cancel ends the switch and puts focus on the realm menu', async () => {
    const user = userEvent.setup();
    await open('/other');
    await act(async () => setSwitching(SOME));
    await waitFor(() => expect(cancel()).not.toBeNull());
    await user.click(cancel() as HTMLElement);
    expect(ctl.cancelled).toBe(1);
    expect(line().textContent).toBe('');
    expect(document.activeElement).toBe(document.querySelector('[data-hub-switch="realm"]'));
  });

  it('on a phone, Cancel puts focus on the visible realm-and-computer chip, not the hidden desktop menu', async () => {
    const user = userEvent.setup();
    await open('/other');
    // Below 768 px the desktop realm trigger is display:none (no boxes) and the phone chip shows.
    const desktop = document.querySelector('[data-hub-switch="realm"]') as HTMLElement;
    const phone = document.querySelector('[data-hub-switch="context"]') as HTMLElement;
    expect(desktop && phone).toBeTruthy();
    desktop.getClientRects = () => [] as unknown as DOMRectList;
    phone.getClientRects = () => [new DOMRect(0, 0, 120, 44)] as unknown as DOMRectList;
    await act(async () => setSwitching(SOME));
    await waitFor(() => expect(cancel()).not.toBeNull());
    await user.click(cancel() as HTMLElement);
    expect(ctl.cancelled).toBe(1);
    expect(document.activeElement).toBe(phone);
  });

  it('Esc cancels a switch the line shows, and only then; an open overlay keeps its own Esc', async () => {
    const user = userEvent.setup();
    await open('/other');
    await user.keyboard('{Escape}');
    expect(ctl.cancelled).toBe(0);
    await act(async () => setSwitching(SOME));
    await waitFor(() => expect(cancel()).not.toBeNull());
    // The realm menu open: Esc closes the menu, the switch goes on.
    await user.click(document.querySelector('[data-hub-switch="realm"]') as HTMLElement);
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(ctl.cancelled).toBe(0);
    expect(cancel()).not.toBeNull();
    // Nothing open: Esc cancels.
    (document.querySelector('h1') as HTMLElement).focus();
    await user.keyboard('{Escape}');
    expect(ctl.cancelled).toBe(1);
    expect(line().textContent).toBe('');
  });

  it('a switch the shell did not start: Esc falls through to the page and the line stays', async () => {
    const user = userEvent.setup();
    ctl.cancels = false;
    await open('/other');
    await act(async () => setSwitching(SOME));
    await waitFor(() => expect(cancel()).not.toBeNull());
    (document.querySelector('h1') as HTMLElement).focus();
    const seen = vi.fn();
    window.addEventListener('keydown', (e) => seen(e.defaultPrevented), { once: true });
    await user.keyboard('{Escape}');
    expect(seen).toHaveBeenCalledWith(false);
    expect(status()).toHaveTextContent('Switching realm…');
  });

  it('a ?open_realm= link: one announcement, "Opening the realm…" then where it goes, never "still shows"', async () => {
    ctl.wait = true;
    await open('/other');
    // The page area waits (RealmWait), hidden from assistive tech: the line is the only status read out.
    expect(document.querySelector('[data-hub-realm-wait]')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('heading', { level: 1, name: 'Other' })).toBeNull();
    await waitFor(() => expect(status()).toHaveTextContent(/^Opening the realm…$/));
    expect(spoken()).toEqual([status()]);
    expect(cancel()).toBeNull();
    await act(async () => setSwitching(SOME));
    await waitFor(() => expect(status()).toHaveTextContent(/^Switching realm…$/));
    expect(status()).not.toHaveTextContent('still shows');
    expect(spoken()).toEqual([status()]);
    expect(cancel()).not.toBeNull();
  });
});
