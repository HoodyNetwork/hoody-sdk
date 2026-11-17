// The pick effect drops or re-picks a computer only from a read that has not failed since. After a good whole list, a refetch
// whose body cannot be read leaves the old rows beside the error: a computer then chosen that those rows lack stays (the control
// is live.realmtarget.test.tsx: from a good whole list it is re-picked).
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { answers, bootFixtureCore, chooseComputer, fixtureWorld, queryClient, reply } from '@core';
import type * as Core from '@core';
import { containersRoute, snapshot } from '@core/shell';
import { useShellData } from './context';
import { LiveShellData } from './live';

const calls = vi.hoisted(() => ({ choose: 0, drop: 0 }));
vi.mock('@core', async (importOriginal) => {
  const core = await importOriginal<typeof Core>();
  return {
    ...core,
    chooseComputer: (c: Parameters<typeof core.chooseComputer>[0]) => { calls.choose += 1; return core.chooseComputer(c); },
    dropComputer: () => { calls.drop += 1; return core.dropComputer(); },
  };
});

const rows = fixtureWorld.computers.map((c) => ({ id: c.id, name: c.name, status: c.status, project_id: c.project_id, server_name: c.server_name, realm_ids: [...c.realm_ids], server: c.server }));
const STALE = { id: 'f'.repeat(24), project_id: 'p'.repeat(24), server_name: 'elsewhere-1' };
const target = () => snapshot().target?.container.id ?? null;

function Probe() {
  useShellData();
  return null;
}
const mount = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <LiveShellData>
        <Probe />
      </LiveShellData>
    </QueryClientProvider>,
  );

describe('LiveShellData: a target the retained rows lack, after a failed read', () => {
  beforeEach(() => queryClient.clear());

  it('stays: the rows are the last answer, not proof that the computer is absent', async () => {
    bootFixtureCore({
      rules: [
        reply(containersRoute, answers.ok({ data: { computers: rows } }), { times: 1 }),
        reply(containersRoute, answers.ok({ data: {} })),
      ],
    });
    mount();
    await waitFor(() => expect(target()).not.toBeNull());
    await act(async () => { await queryClient.refetchQueries(); });
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    calls.choose = 0;
    calls.drop = 0;
    act(() => void chooseComputer(STALE));
    await act(async () => { await Promise.resolve(); });
    expect(target()).toBe(STALE.id);
    expect(calls).toEqual({ choose: 1, drop: 0 });
  });
});
