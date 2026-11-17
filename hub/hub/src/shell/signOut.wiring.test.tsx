// Every sign-out control goes through the warned sign-out (requestSignOut): the account menu (LiveShellData's
// signOut) and the suspended screen and banner. The purge failure's "Try again" stays a plain logout: it is not
// a sign-out choice; it retries the credential purge (stored change records are not part of it), and a sign-out's
// panel names the sends still out that sign-out kept.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFixtureCore, fixtureWorld, queryClient } from '@core';
import { setIdentity } from '@core/ctx';
import type * as CoreShell from '@core/shell';
import type { LifecycleEvent } from '@core/shell';
import type { PageManifest } from '@kit/page';

const request = vi.fn();
const logout = vi.fn();
let kept = 0; // live sends the last 'done' sign-out kept stored (signOut.tsx useSendsKeptAtSignOut)
vi.mock('./signOut', () => ({ requestSignOut: () => request(), SignOutConfirm: () => null, useSendsKeptAtSignOut: () => kept }));
const endToken = vi.fn();
let life: ((e: LifecycleEvent) => void) | undefined;
vi.mock('@core/shell', async (orig) => {
  const real = await orig<typeof CoreShell>();
  return {
    ...real,
    logout: () => logout(),
    endTokenSession: (r: string) => endToken(r),
    onLifecycle: (l: (e: LifecycleEvent) => void) => {
      life = l;
      const off = real.onLifecycle(l);
      return () => {
        if (life === l) life = undefined;
        off();
      };
    },
  };
});

import { useShellData } from './context';
import { LiveShellData } from './live';
import { CoreNotices, showBootPanel } from './notices';
import { PagesProvider } from './pageLinks';

beforeEach(() => {
  kept = 0;
  request.mockClear();
  logout.mockClear();
  endToken.mockClear();
});

const suspend = () =>
  act(async () => {
    const a = fixtureWorld.account;
    setIdentity({ id: a.id, username: a.username, email: a.email, banned: true });
  });

describe('sign-out controls ask first', () => {
  it('the account menu sign-out', async () => {
    queryClient.clear();
    bootFixtureCore({ rules: [] });
    function Probe() {
      const d = useShellData();
      return <button onClick={() => d.signOut?.()}>out</button>;
    }
    render(
      <QueryClientProvider client={queryClient}>
        <LiveShellData>
          <Probe />
        </LiveShellData>
      </QueryClientProvider>,
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'out' })));
    expect(request).toHaveBeenCalledTimes(1);
    expect(logout).not.toHaveBeenCalled();
  });

  it('the suspended screen and its banner', async () => {
    const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
    const at = (path: string) => (
      <PagesProvider pages={[pg('home'), pg('notifications'), pg('bots')]}>
        <CoreNotices path={path} />
      </PagesProvider>
    );
    const { rerender } = render(at('/bots'));
    await suspend();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    expect(request).toHaveBeenCalledTimes(1);
    rerender(at('/notifications'));
    expect(screen.getByRole('status')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    expect(request).toHaveBeenCalledTimes(2);
    expect(logout).not.toHaveBeenCalled();
  });

  it('Try again after a failed purge retries the way it started', async () => {
    const { unmount } = render(<CoreNotices />);
    // A token session whose end could not purge: Try again ends it again with the same reason.
    await act(async () => life?.({ kind: 'token-panel', panel: 'purgeFailed', again: 'invalid' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })));
    expect(endToken).toHaveBeenCalledWith('invalid');
    expect(logout).not.toHaveBeenCalled();
    unmount();
    // A sign-out whose purge failed: Try again is logout() again.
    render(<CoreNotices />);
    await act(async () => life?.({ kind: 'purge-failed' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(endToken).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
  });

  it('a boot that ended in a failed token purge keeps its reason too', async () => {
    showBootPanel({ state: 'purge-failed', again: 'leave' });
    render(<CoreNotices />);
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Try again' })));
    expect(endToken).toHaveBeenCalledWith('leave');
    expect(logout).not.toHaveBeenCalled();
  });

  it('a sign-out that kept live sends stored and whose purge failed says so on its panel; a token panel does not', async () => {
    kept = 2;
    const { unmount } = render(<CoreNotices />);
    await act(async () => life?.({ kind: 'purge-failed' }));
    const panel = screen.getByRole('alertdialog');
    expect(panel.textContent).toMatch(/2 changes were still being sent: they stay on this browser and keep the same change blocked until their answers come back\./);
    expect(panel.textContent).not.toMatch(/removed/i);
    unmount();
    render(<CoreNotices />);
    await act(async () => life?.({ kind: 'token-panel', panel: 'purgeFailed', again: 'invalid' }));
    expect(screen.getByRole('alertdialog').textContent).not.toMatch(/still being sent/);
  });

  it('a failed sign-out purge with no live send kept has no such line; one kept send reads in the singular', async () => {
    const { unmount } = render(<CoreNotices />);
    await act(async () => life?.({ kind: 'purge-failed' }));
    expect(screen.getByRole('alertdialog').textContent).not.toMatch(/still being sent/);
    unmount();
    kept = 1;
    render(<CoreNotices />);
    await act(async () => life?.({ kind: 'purge-failed' }));
    expect(screen.getByRole('alertdialog').textContent).toMatch(/1 change was still being sent: it stays on this browser and keeps the same change blocked until its answer comes back\./);
  });

  it('a boot that ended in a failed purge names no kept sends, whatever count this page holds', async () => {
    kept = 2;
    showBootPanel({ state: 'purge-failed' });
    render(<CoreNotices />);
    expect((await screen.findByRole('alertdialog')).textContent).not.toMatch(/still being sent/);
  });
});
