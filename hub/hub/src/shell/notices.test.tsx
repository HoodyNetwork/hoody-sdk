// Core notices: a possibly-applied change shows one "may have gone through" toast without a retry;
// a suspended account gets the suspended screen with Notifications, sessions and Sign out.
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureWorld } from '@core';
import { notifyPending } from '@core/api';
import { capture, setIdentity } from '@core/ctx';
import type { PageManifest } from '@kit/page';
import { Toaster } from '@kit/states/Toast';
import { CoreNotices, PENDING_SETTLE_MS } from './notices';

describe('CoreNotices', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  // Toasts live in one module queue across tests, so the no-toast case runs first.
  it('no toast when the page shows that outcome itself', async () => {
    render(
      <>
        <div data-outcome="pending">The page's own line</div>
        <CoreNotices />
        <Toaster />
      </>,
    );
    await act(async () => {
      notifyPending(capture());
      vi.advanceTimersByTime(PENDING_SETTLE_MS + 10);
    });
    expect(screen.queryByText(/may have gone through$/)).toBeNull();
  });

  it('a change that may have gone through shows an unknown toast with no Try again', async () => {
    render(
      <>
        <CoreNotices />
        <Toaster />
      </>,
    );
    await act(async () => {
      notifyPending(capture());
      vi.advanceTimersByTime(PENDING_SETTLE_MS + 10);
    });
    // The title names the realm the change was sent in, filled in.
    const title = screen.getByText(/^A change in .+ may have gone through$/);
    expect(title.textContent).not.toMatch(/[{}]/);
    expect(screen.getByText("The answer didn't arrive. Check there before you try it again.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('a suspended account sees only the suspended screen', async () => {
    render(<CoreNotices />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await act(async () => {
      const a = fixtureWorld.account;
      setIdentity({ id: a.id, username: a.username, email: a.email, banned: true });
    });
    expect(screen.getByRole('alertdialog', { name: 'Your account is suspended' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open notifications' })).toHaveAttribute('href', '/notifications');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});

describe('CoreNotices suspended links while Account is hidden', () => {
  it('Notifications routes inside the Hub; with Account hidden there is no sessions link', async () => {
    const { PagesProvider } = await import('./pageLinks');
    const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
    render(
      <PagesProvider pages={[pg('home'), pg('notifications')]}>
        <CoreNotices />
      </PagesProvider>,
    );
    await act(async () => {
      const a = fixtureWorld.account;
      setIdentity({ id: a.id, username: a.username, email: a.email, banned: true });
    });
    expect(screen.getByRole('link', { name: 'Open notifications' })).toHaveAttribute('href', '/notifications');
    expect(screen.queryByRole('link', { name: 'Account and sessions' })).toBeNull();
  });
});

describe('CoreNotices suspended: the views its links open stay usable', () => {
  const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
  it('on Notifications or Account the screen gives way to a banner with Sign out; anywhere else it blocks', async () => {
    const { PagesProvider } = await import('./pageLinks');
    const at = (path: string) => (
      <PagesProvider pages={[pg('home'), pg('notifications'), pg('account'), pg('bots')]}>
        <CoreNotices path={path} />
      </PagesProvider>
    );
    const { rerender } = render(at('/bots'));
    await act(async () => {
      const a = fixtureWorld.account;
      setIdentity({ id: a.id, username: a.username, email: a.email, banned: true });
    });
    expect(screen.getByRole('alertdialog', { name: 'Your account is suspended' })).toBeInTheDocument();
    for (const path of ['/notifications', '/account', '/account/sessions']) {
      rerender(at(path));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent('Your account is suspended');
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    }
    rerender(at('/bots'));
    expect(screen.getByRole('alertdialog', { name: 'Your account is suspended' })).toBeInTheDocument();
  });
});
