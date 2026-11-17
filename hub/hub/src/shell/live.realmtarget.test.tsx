// A computer target the selected realm's list does not hold (chosen in another realm, or its realms changed) is
// re-picked from that list, or dropped when nothing there is pickable (the remembered id stays, so its own realm
// picks it again). For example Keys > SSH "The computer could not be read" (403 "not in requested realm"),
// cause: a target left over from another realm. A list with more pages cannot tell, so the target stays. With realm
// hosts off the list answers the whole account, so the realm's rows are the ones its realm_ids name.
// Every case settles in one pass: core's choose/drop calls are counted through, and capped so an effect loop fails
// the test instead of hanging the runner.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { answers, bootFixtureCore, chooseComputer, fixtureWorld, pickComputer, queryClient, rememberedComputerId, reply } from '@core';
import type * as Core from '@core';
import { containersRoute, snapshot } from '@core/shell';
import { useShellData } from './context';
import { LiveShellData } from './live';

const calls = vi.hoisted(() => ({ choose: 0, drop: 0 }));
vi.mock('@core', async (importOriginal) => {
  const core = await importOriginal<typeof Core>();
  const count = (k: 'choose' | 'drop') => {
    calls[k] += 1;
    if (calls[k] > 20) throw new Error(`${k} keeps running: the pick effect does not settle`);
  };
  return {
    ...core,
    chooseComputer: (c: Parameters<typeof core.chooseComputer>[0]) => (count('choose'), core.chooseComputer(c)),
    dropComputer: () => (count('drop'), core.dropComputer()),
  };
});
const resetCalls = () => Object.assign(calls, { choose: 0, drop: 0 });

const W = fixtureWorld;
const rows = W.computers.map((c) => ({ id: c.id, name: c.name, status: c.status, project_id: c.project_id, server_name: c.server_name, realm_ids: [...c.realm_ids], server: c.server }));
const STALE = { id: 'f'.repeat(24), project_id: 'p'.repeat(24), server_name: 'elsewhere-1' };

const boot = (computers: unknown[], pagination?: object) =>
  bootFixtureCore({ rules: [reply(containersRoute, answers.ok({ data: pagination ? { computers, pagination } : { computers } }))] });
function Picker() {
  const d = useShellData();
  return (
    <>
      <p data-testid="picker">{d.computers.map((c) => c.id).join(',')}</p>
      <button onClick={() => d.setComputer?.(foreign().id)}>pick another realm’s computer</button>
    </>
  );
}
// Mounts the shell's live data; the choose/drop counts start from here (the test's own setup is not counted).
const mount = () => {
  resetCalls();
  return render(
    <QueryClientProvider client={queryClient}>
      <LiveShellData>
        <Picker />
      </LiveShellData>
    </QueryClientProvider>,
  );
};
const settled = async () => {
  await act(async () => {
    await queryClient.refetchQueries();
  });
};
const shown = () => snapshot().realm;
const foreign = () => rows.find((r) => !r.realm_ids.includes(shown()))!;
const target = () => snapshot().target?.container.id ?? null;
const listRead = () => waitFor(() => expect(queryClient.isFetching()).toBe(0));

describe('LiveShellData: a target outside the selected realm', () => {
  beforeEach(() => queryClient.clear());

  it('is re-picked from the realm’s list', async () => {
    boot(rows);
    act(() => void chooseComputer(STALE));
    mount();
    const want = pickComputer(rows, { remembered: null })!.id;
    await waitFor(() => expect(target()).toBe(want));
    expect(target()).not.toBe(STALE.id);
    await settled();
    expect(calls).toEqual({ choose: 1, drop: 0 });
  });

  it('a computer of another realm in an account-wide answer (realm hosts off) is re-picked from the realm’s rows', async () => {
    boot(rows);
    expect(shown()).not.toBe('all');
    const other = foreign();
    act(() => void chooseComputer(other));
    mount();
    const want = pickComputer(rows, { remembered: null })!;
    expect(want.realm_ids).toContain(shown());
    await waitFor(() => expect(target()).toBe(want.id));
    await settled();
    expect(calls).toEqual({ choose: 1, drop: 0 });
  });

  it('the picker lists the selected realm’s computers only, also from an account-wide answer', async () => {
    boot(rows);
    mount();
    const mine = rows.filter((r) => r.realm_ids.includes(shown())).map((r) => r.id);
    await waitFor(() => expect(screen.getByTestId('picker').textContent).toBe(mine.join(',')));
    expect(screen.getByTestId('picker').textContent).not.toContain(foreign().id);
    const before = target();
    const chosen = calls.choose;
    await act(async () => {
      screen.getByText('pick another realm’s computer').click();
    });
    expect(target()).toBe(before);
    expect(calls.choose).toBe(chosen);
  });

  it('is dropped when nothing in the list can be picked, and the remembered computer stays', async () => {
    boot(rows.map((r) => ({ ...r, status: 'stopped' })));
    act(() => void chooseComputer(STALE));
    expect(rememberedComputerId()).toBe(STALE.id);
    mount();
    await waitFor(() => expect(target()).toBeNull());
    expect(rememberedComputerId()).toBe(STALE.id);
    await settled();
    expect(calls).toEqual({ choose: 0, drop: 1 });
  });

  it('is dropped when the realm holds no computer', async () => {
    boot([]);
    act(() => void chooseComputer(STALE));
    mount();
    await waitFor(() => expect(target()).toBeNull());
    expect(rememberedComputerId()).toBe(STALE.id);
    await settled();
    expect(calls).toEqual({ choose: 0, drop: 1 });
  });

  it('a target the list holds stays, even when it is not the one the pick rule would choose', async () => {
    boot(rows);
    const first = pickComputer(rows, { remembered: null })!.id;
    const other = rows.find((r) => r.id !== first && pickComputer(rows, { remembered: r.id })?.id === r.id)!;
    act(() => void chooseComputer(other));
    mount();
    await listRead();
    await settled();
    expect(target()).toBe(other.id);
    expect(calls).toEqual({ choose: 0, drop: 0 });
  });

  it('a list with more pages cannot tell, so the target stays', async () => {
    boot(rows, { total: 250, page: 1, limit: 100, totalPages: 3 });
    act(() => void chooseComputer(STALE));
    mount();
    await listRead();
    await settled();
    expect(target()).toBe(STALE.id);
    expect(calls).toEqual({ choose: 0, drop: 0 });
  });
});
