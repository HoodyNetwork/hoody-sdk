// Vitest: the name drawer reopened after a reload (the page's lock table empty) is locked by core's hold alone,
// and its warned Start over frees the hold its warning was shown over, never a send that replaced it meanwhile, and
// says nothing was dismissed then (as armed-dismiss.test.tsx for the 2FA drawers).
import { CoreQueryProvider, queryClient } from '@core';
import { boot, onFetch, settle, signIn, UID } from '@core/test/env';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRename } from './data';
import { NameSheet } from './parts/NameSheet';
import { locks } from './parts/locks';
import strings from './strings.en.json';

const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};
const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name }));
    await flush();
  });
};
type Rename = ReturnType<typeof useRename>;
const hookMount = () => {
  const out: { h?: Rename } = {};
  function P() {
    out.h = useRename();
    return null;
  }
  return { out, view: render(<P />, { wrapper: CoreQueryProvider }) };
};

describe('the name drawer: a warned Start over over the hold shown when it armed', () => {
  const armed = async () => {
    boot();
    signIn();
    queryClient.clear();
    locks.clear();
    onFetch((c) => (c.method === 'GET' ? { status: 500, body: {} } : { status: 502, body: {} }));
    const first = hookMount();
    await act(flush);
    await act(async () => {
      expect((await first.out.h!.run({ alias: 'Ada' })).outcome).toBe('pending');
      await flush();
    });
    first.view.unmount();
    render(<NameSheet open onClose={() => undefined} onDone={() => undefined} />, { wrapper: CoreQueryProvider });
    const other = hookMount();
    await act(flush);
    // The page's lock is gone (a reload): the drawer is locked by core's hold alone.
    expect(await screen.findByRole('button', { name: strings['check.again'] })).toBeInTheDocument();
    await click(strings['check.again']);
    expect(await screen.findByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
    return other;
  };

  it('keeps a send that replaced the shown hold held, and says nothing was dismissed', async () => {
    const other = await armed();
    await act(async () => {
      expect(await other.out.h!.dismissRows(other.out.h!.heldNow() as never)).toBe(true);
      await flush();
    });
    await act(async () => {
      expect((await other.out.h!.run({ alias: 'Ada B.' })).outcome).toBe('pending');
      await flush();
    });
    const replacement = other.out.h!.heldNow();
    expect(replacement).toHaveLength(1);
    await click(strings['check.startOver']);
    expect(other.out.h!.heldNow()).toEqual(replacement);
    expect(screen.getByText(strings['check.nothing'])).toBeInTheDocument();
  });
});

describe('the name drawer after a reload, proven', () => {
  it('a Check again that proves the name closes the drawer and reports it saved, with no page lock to release', async () => {
    boot();
    signIn();
    queryClient.clear();
    locks.clear();
    onFetch((c) => (c.method === 'GET' ? { status: 500, body: {} } : { status: 502, body: {} }));
    const first = hookMount();
    await act(flush);
    await act(async () => {
      expect((await first.out.h!.run({ alias: 'Ada' })).outcome).toBe('pending');
      await flush();
    });
    first.view.unmount();
    locks.clear(); // a reload: the page's lock table is empty, core's hold stays
    const done = vi.fn();
    const closed = vi.fn();
    render(<NameSheet open onClose={closed} onDone={done} />, { wrapper: CoreQueryProvider });
    await act(flush);
    onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: { id: UID, alias: 'Ada', email: 'ada@example.com', username: 'ada' } } } : { status: 502, body: {} }));
    await click(strings['check.again']);
    expect(done).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalled();
  });
});
