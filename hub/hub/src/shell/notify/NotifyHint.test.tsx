// NotifyHint: draws for a wanted kind, once per screen (when the owner is dismissed or leaves, the next hint takes the screen), adds the alert line for account kinds,
// stays away when alerts are on or it was dismissed, and Set up opens Get notified at its section.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureWorld } from '@core';
import { NotifyHint } from './NotifyHint';

const UID = fixtureWorld.account.id;
const hintsKey = `hub_notify:${UID}:hints`;
const alertsKey = `hub_notify:${UID}:alerts`;

async function inRouter(node: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: node }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}

function stubNotification(permission: NotificationPermission) {
  vi.stubGlobal('Notification', Object.assign(function N() {}, { permission, requestPermission: () => Promise.resolve(permission) }));
}

beforeEach(() => {
  window.localStorage.clear();
  stubNotification('default');
});
afterEach(() => vi.unstubAllGlobals());

describe('NotifyHint', () => {
  it('draws the kind line, plus the alert line for an account kind', async () => {
    await inRouter(() => <NotifyHint kind="computer" />);
    expect(screen.getByRole('note')).toHaveTextContent('A new computer sends a notice when it is running, or if it fails. You can add a browser alert.');
    expect(screen.getByRole('button', { name: 'Set up' })).toBeInTheDocument();
  });

  it('a local kind promises only a browser alert', async () => {
    await inRouter(() => <NotifyHint kind="bot" />);
    expect(screen.getByRole('note')).not.toHaveTextContent('You can add a browser alert');
  });

  it('only one hint per screen', async () => {
    await inRouter(() => (
      <>
        <NotifyHint kind="computer" />
        <NotifyHint kind="bot" />
      </>
    ));
    expect(screen.getAllByRole('note')).toHaveLength(1);
  });

  it('handoff: the owner dismissed, the other hint claims the screen, still one at a time', async () => {
    await inRouter(() => (
      <>
        <NotifyHint kind="computer" />
        <NotifyHint kind="bot" />
      </>
    ));
    const first = screen.getByRole('note');
    expect(first).toHaveAttribute('data-hub-notify-hint', 'computer');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss this tip' }));
    const notes = screen.getAllByRole('note');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveAttribute('data-hub-notify-hint', 'bot');
  });

  it('handoff: the owner unmounted, the other hint claims the screen', async () => {
    function Two() {
      const [shown, setShown] = useState(true);
      return (
        <>
          {shown && <NotifyHint kind="computer" />}
          <NotifyHint kind="bot" />
          <button type="button" onClick={() => setShown(false)}>leave</button>
        </>
      );
    }
    await inRouter(() => <Two />);
    expect(screen.getByRole('note')).toHaveAttribute('data-hub-notify-hint', 'computer');
    fireEvent.click(screen.getByRole('button', { name: 'leave' }));
    const notes = screen.getAllByRole('note');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveAttribute('data-hub-notify-hint', 'bot');
  });

  it('dismiss removes it and remembers the kind for this account', async () => {
    await inRouter(() => <NotifyHint kind="rental" />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss this tip' }));
    expect(screen.queryByRole('note')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(hintsKey) ?? '[]')).toEqual(['rental']);
  });

  it('a dismissed kind and alerts already on draw nothing', async () => {
    window.localStorage.setItem(hintsKey, JSON.stringify(['inbox']));
    await inRouter(() => <NotifyHint kind="inbox" />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('alerts on: nothing to offer', async () => {
    stubNotification('granted');
    window.localStorage.setItem(alertsKey, 'on');
    await inRouter(() => <NotifyHint kind="computer" />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('Set up opens Get notified at the browser section and dismisses', async () => {
    const router = await inRouter(() => <NotifyHint kind="purchase" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Set up' }));
    });
    expect(router.state.location.pathname).toBe('/notifications/learn');
    expect(router.state.location.hash).toBe('browser');
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('onGo runs instead of navigating when the caller is the notifications page', async () => {
    const onGo = vi.fn();
    await inRouter(() => <NotifyHint kind="inbox" onGo={onGo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set up' }));
    expect(onGo).toHaveBeenCalledWith('browser');
  });
});
