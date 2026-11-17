// Core's realm-gone notice: `restored: true` means the realm kept from the last
// visit isn't on the realm list now, so the Hub opened All realms. It gets its own warning; the plain
// notice (a realm that went away during the visit) keeps its text.
import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ listeners: new Set<(n: unknown) => void>(), teardown: new Set<(reason: string) => void>(), toast: vi.fn() }));
vi.mock('@core/shell', async (orig) => ({
  ...(await orig<object>()),
  onRealmNotice: (l: (n: unknown) => void) => {
    h.listeners.add(l);
    return () => void h.listeners.delete(l);
  },
  onTeardown: (l: (reason: string) => void) => {
    h.teardown.add(l);
    return () => void h.teardown.delete(l);
  },
}));
vi.mock('@kit/states/Toast', async (orig) => ({ ...(await orig<object>()), showToast: h.toast }));

import { CoreNotices } from './notices';

const send = (n: unknown) => act(() => { for (const l of [...h.listeners]) l(n); });
const teardown = (reason: string) => act(() => { for (const l of [...h.teardown]) l(reason); });

describe('CoreNotices realm-gone', () => {
  beforeEach(() => h.toast.mockClear());

  // Boot: core's realm list can answer while saved preferences open (core-boot waits up to 2 s for them before
  // the first render), so the notice comes before CoreNotices mounts. Core keeps no notice for a later listener.
  it('a realm-gone sent before the shell mounts shows once it mounts, once under StrictMode', async () => {
    await send({ kind: 'realm-gone', restored: true });
    expect(h.toast).not.toHaveBeenCalled();
    const v = render(
      <StrictMode>
        <CoreNotices />
      </StrictMode>,
    );
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect((h.toast.mock.calls[0]?.[0] as { title: string }).title).toBe("Couldn't reopen the realm you last used");
    v.unmount();
    render(<CoreNotices />);
    expect(h.toast).toHaveBeenCalledTimes(1);
  });

  it('only the latest early realm-gone shows, and the plain one keeps its text', async () => {
    await send({ kind: 'realm-gone', restored: true });
    await send({ kind: 'realm-gone' });
    render(<CoreNotices />);
    expect(h.toast.mock.calls.map((c) => (c[0] as { title: string }).title)).toEqual([
      'The realm you were using is no longer available',
    ]);
  });

  // A teardown (the account ends, sign-out, suspension, a committed switch) makes a kept warning stale: a leaving
  // page that still renders shows nothing for it.
  it('a warning kept before mount is dropped by a teardown before mount', async () => {
    await send({ kind: 'realm-gone', restored: true });
    await teardown('signout');
    render(<CoreNotices />);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('a realm-gone after that teardown is kept again', async () => {
    await teardown('switch');
    await send({ kind: 'realm-gone' });
    render(<CoreNotices />);
    expect(h.toast).toHaveBeenCalledTimes(1);
  });

  it('a notice the mounted shell showed is not shown again by a later mount; other early notices are not kept', async () => {
    const v = render(<CoreNotices />);
    await send({ kind: 'realm-gone' });
    v.unmount();
    await send({ kind: 'look' });
    await send({ kind: 'switch-failed', target: 'all', current: 'all' });
    render(<CoreNotices />);
    expect(h.toast).toHaveBeenCalledTimes(1);
  });

  it('a realm not restored from the last visit gets its own warning, naming what the Hub shows now', async () => {
    render(<CoreNotices />);
    await send({ kind: 'realm-gone', restored: true });
    expect(h.toast).toHaveBeenCalledTimes(1);
    const arg = h.toast.mock.calls[0]?.[0] as { tone: string; title: string; body?: string; action?: unknown };
    expect(arg.tone).toBe('warn');
    expect(arg.title).toBe("Couldn't reopen the realm you last used");
    expect(arg.body).toBe("The Hub couldn't confirm it when it opened, so it shows all your realms.");
    expect(arg.action).toBeUndefined();
    expect(`${arg.title} ${arg.body}`).not.toMatch(/[{}]/);
  });

  it('a realm that went away during the visit keeps the plain warning', async () => {
    render(<CoreNotices />);
    await send({ kind: 'realm-gone' });
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast.mock.calls[0]?.[0]).toEqual({
      tone: 'warn',
      title: 'The realm you were using is no longer available',
      body: 'The Hub shows all your realms now. Pick one from the realm menu to work in it.',
    });
  });

  it('only `restored: true` picks the not-restored warning', async () => {
    render(<CoreNotices />);
    await send({ kind: 'realm-gone', restored: false });
    await send({ kind: 'realm-gone', restored: 'yes' });
    expect(h.toast.mock.calls.map((c) => (c[0] as { title: string }).title)).toEqual([
      'The realm you were using is no longer available',
      'The realm you were using is no longer available',
    ]);
  });
});
