// The live shell data reads core: realms, the realm's computers, the account, the chosen computer.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { answers, bootFixtureCore, fixtureWorld, queryClient, reply } from '@core';
import { realmsRoute } from '@core/realm';
import { containersRoute, snapshot } from '@core/shell';
import { useShellData } from './context';
import { LiveShellData } from './live';

const W = fixtureWorld;
const rows = W.computers.map((c) => ({ id: c.id, name: c.name, status: c.status, project_id: c.project_id, server_name: c.server_name, realm_ids: [...c.realm_ids], server: c.server }));
// A computer of the shown realm (the fixture's first) other than the one the pick rule chooses: the list answers
// the whole account, and the shell keeps the shown realm's rows only.
const chosen = rows.find((r, i) => i > 0 && r.realm_ids.includes(W.realms[0]!.id))!;

function Probe() {
  const d = useShellData();
  return (
    <div>
      <p data-testid="realms">{d.realms.map((r) => r.name).join(',')}</p>
      <p data-testid="computers">{d.computers.map((c) => `${c.name}${c.running ? '+' : ''}`).join(',')}</p>
      <p data-testid="current">{d.computers.find((c) => c.id === d.computerId)?.name ?? '-'}</p>
      <p data-testid="account">{d.account?.name ?? '-'}</p>
      <p data-testid="counts">{d.realms.map((r) => String(r.computers ?? '?')).join(',')}</p>
      <button onClick={() => d.refreshRealms?.()}>refresh realms</button>
      <button onClick={() => d.setComputer?.(chosen.id)}>pick</button>
      <button onClick={() => d.clearComputer?.()}>none</button>
    </div>
  );
}

const mount = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <LiveShellData>
        <Probe />
      </LiveShellData>
    </QueryClientProvider>,
  );

describe('LiveShellData', () => {
  beforeEach(() => {
    queryClient.clear();
    bootFixtureCore({ rules: [reply(containersRoute, answers.ok({ data: { computers: rows } }))] });
  });

  it('shows the realm names, the computers from the list and the account', async () => {
    mount();
    expect(screen.getByTestId('realms').textContent).toBe(W.realms.map((r) => r.name).join(','));
    await waitFor(() => expect(screen.getByTestId('computers').textContent).toContain(W.computers[0]!.name));
    expect(screen.getByTestId('account').textContent).not.toBe('-');
    expect(screen.getByTestId('realms').textContent).not.toMatch(/[0-9a-f]{24}/);
  });

  it('choosing no computer clears core\'s target and it stays clear when the list reads again', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('current').textContent).not.toBe('-'));
    await act(async () => {
      screen.getByText('none').click();
    });
    expect(snapshot().target).toBeNull();
    expect(screen.getByTestId('current').textContent).toBe('-');
    await act(async () => {
      await queryClient.refetchQueries();
    });
    expect(snapshot().target).toBeNull();
    expect(screen.getByTestId('current').textContent).toBe('-');
    await act(async () => {
      screen.getByText('pick').click();
    });
    expect(snapshot().target?.container.id).toBe(chosen.id);
  });

  it('picking a computer makes it core\'s target', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('computers').textContent).toContain(chosen.name));
    await act(async () => {
      screen.getByText('pick').click();
    });
    expect(snapshot().target?.container.id).toBe(chosen.id);
    expect(screen.getByTestId('current').textContent).toBe(chosen.name);
  });

  it('a computer with no name and no server name is "Unnamed computer", never "No computer selected"', async () => {
    const unnamed = rows.map((r, i) => (i === 0 ? { ...r, name: '', server_name: '' } : r));
    bootFixtureCore({ rules: [reply(containersRoute, answers.ok({ data: { computers: unnamed } }))] });
    mount();
    await waitFor(() => expect(screen.getByTestId('computers').textContent).toContain(chosen.name));
    expect(screen.getByTestId('computers').textContent).toMatch(/^Unnamed computer/);
    expect(screen.getByTestId('computers').textContent).not.toMatch(/No computer selected/);
  });
});

describe('LiveShellData: realm computer counts', () => {
  it("each realm's count is the realm list's usage, and refreshRealms reads it again (one read at a time)", async () => {
    const usage: Record<string, { computers: number }> = Object.fromEntries(W.realms.map((r) => [r.id, { computers: 2 }]));
    let reads = 0;
    queryClient.clear();
    bootFixtureCore({
      rules: [
        reply(realmsRoute, () => {
          reads += 1;
          return { status: 200, body: { data: { realm_ids: W.realms.map((r) => r.id), usage: structuredClone(usage) } } };
        }),
        reply(containersRoute, answers.ok({ data: { computers: rows } })),
      ],
    });
    mount();
    // The boot's own read fills the counts first (whatever it answered); what matters is what a refresh reads.
    await waitFor(() => expect(screen.getByTestId('counts').textContent).not.toMatch(/\?/));
    expect(screen.getByTestId('counts').textContent).not.toBe(['5', ...W.realms.slice(1).map(() => '2')].join(','));
    const before = reads;
    usage[W.realms[0]!.id] = { computers: 5 };
    // Two presses before the first read answers: one request.
    await act(async () => {
      screen.getByRole('button', { name: 'refresh realms' }).click();
      screen.getByRole('button', { name: 'refresh realms' }).click();
    });
    await waitFor(() => expect(screen.getByTestId('counts').textContent).toBe(['5', ...W.realms.slice(1).map(() => '2')].join(',')));
    expect(reads).toBe(before + 1);
  });
});
