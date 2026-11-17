// C9: a held band's Dismiss always names the send it showed (its variables and core's hold
// token). Core's no-argument Dismiss frees every hold this page has of the lock in the realm, so the SSH drawer of
// one computer would free another computer's hold it never showed (a second change could then be sent there while
// the first is unknown). The runner refuses a held band without variables instead of falling back to it.
import { CoreQueryProvider, answers, fixtureWorld, heldChanges, redeemRoute, reply } from '@core';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as dataModule from './data';
import { useSetSshKey } from './data';
import page from './page';
import { useRunner } from './parts/runner';
import strings from './strings.en.json';

// Every redeem answer is lost: the invite card's band is core's held redeem.
vi.mock('./fixtures', async (importOriginal) => {
  const orig = (await importOriginal()) as { default: { default: string; states: Record<string, unknown[]> } };
  const states = { ...orig.default.states, emptyPendingRedeem: [reply(redeemRoute, answers.pending5xx(502)), ...orig.default.states.empty!] };
  return { ...orig, default: { ...orig.default, states } };
});
// The redeem change, recording how its Dismiss is called (the real core call still runs).
const redeemDismissed: unknown[][] = [];
vi.mock('./data', async (importOriginal) => {
  const orig = await importOriginal<typeof dataModule>();
  return {
    ...orig,
    useRedeem: () => {
      const m = orig.useRedeem();
      const real = m.dismiss as (...a: unknown[]) => Promise<boolean>;
      return { ...m, dismiss: (...a: unknown[]) => { redeemDismissed.push(a); return real(...a); } };
    },
  };
});

const wrapper = CoreQueryProvider;
const named = (n: string) => fixtureWorld.computers.find((c) => c.name === n)!;
const sshHolds = () => heldChanges('computer.ssh_key').map((h) => ({ computer: (h.identity as { computer?: string }).computer, hold: h.hold }));
const KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl test@hoody';

describe('a held band Dismiss names the send it showed', () => {
  it('SSH: Dismiss in computer A’s drawer leaves computer B’s unshown hold held', async () => {
    await renderPage(page, { state: 'pendingOps', path: '/computers?sel=atlas.00a1&tab=connect' });
    const atlas = named('atlas'), cedar = named('cedar');
    const direct = renderHook(() => useSetSshKey(), { wrapper });
    await act(async () => {
      expect((await direct.result.current.mutateAsync({ id: atlas.id, key: KEY })).outcome).toBe('pending');
      expect((await direct.result.current.mutateAsync({ id: cedar.id, key: KEY })).outcome).toBe('pending');
    });
    const before = sshHolds();
    expect(before.map((h) => h.computer).sort()).toEqual([atlas.id, cedar.id].sort());
    const cedarHold = before.find((h) => h.computer === cedar.id)!.hold;
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^(${strings['ssh.key.replace']}|${strings['ssh.key.set']})$`) }, { timeout: 8000 }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(await within(dlg).findByRole('button', { name: strings['held.dismiss'] }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismissGo'] }));
    await waitFor(() => expect(sshHolds().map((h) => h.computer)).toEqual([cedar.id]), { timeout: 8000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(sshHolds()).toEqual([{ computer: cedar.id, hold: cedarHold }]);
  });

  it('runner: a held band without variables refuses (false) and never calls the no-argument Dismiss', async () => {
    await renderPage(page, { state: 'pendingOps', path: '/computers?sel=atlas.00a1&tab=connect' });
    const atlas = named('atlas');
    const direct = renderHook(() => useSetSshKey(), { wrapper });
    await act(async () => { expect((await direct.result.current.mutateAsync({ id: atlas.id, key: KEY })).outcome).toBe('pending'); });
    const dismiss = vi.fn(async () => true);
    const stub = { mutateAsync: vi.fn(async () => ({ outcome: 'not_sent' as const })), dismiss };
    const r = renderHook(() => useRunner<{ id: string; key: string | null }>(stub, { lock: 'computer.ssh_key', change: 'sshKey' }), { wrapper });
    await waitFor(() => expect(r.result.current.held).not.toBeNull());
    let freed: unknown;
    await act(async () => { freed = await r.result.current.dismiss(); });
    expect(freed).toBe(false);
    expect(dismiss).not.toHaveBeenCalled();
    expect(sshHolds().map((h) => h.computer)).toEqual([atlas.id]);
  });

  it('redeem: the invite card’s Dismiss passes the variables and the shown hold (two arguments)', async () => {
    redeemDismissed.length = 0;
    await renderPage(page, { state: 'emptyPendingRedeem', path: '/computers' });
    await userEvent.type(await screen.findByLabelText(strings['zero.invite.label'], {}, { timeout: 8000 }), 'abcd-1234');
    await userEvent.click(screen.getByRole('button', { name: strings['zero.invite.go'] }));
    await waitFor(() => expect(heldChanges('invite.redeem')).toHaveLength(1), { timeout: 8000 });
    const shown = heldChanges('invite.redeem')[0]!.hold;
    expect(shown).toBeTruthy();
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismiss'] }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismissGo'] }));
    await waitFor(() => expect(heldChanges('invite.redeem')).toHaveLength(0), { timeout: 8000 });
    expect(redeemDismissed).toEqual([[{ code: '' }, shown]]);
  });
});
