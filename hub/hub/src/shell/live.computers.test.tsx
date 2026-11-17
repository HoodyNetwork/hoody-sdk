// The live shell data says whether the realm's computer list is known. Loading while the list has not answered;
// unknown when the read failed or an empty page of a longer list answered; known (no read state) once rows came or a
// whole list answered zero. Try again is the person's: it reads the list once, and nothing retries on its own.
import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { answers, bootFixtureCore, fixtureWorld, queryClient, reply } from '@core';
import { containersRoute } from '@core/shell';
import { useShellData } from './context';
import { LiveShellData } from './live';

const W = fixtureWorld;
const rows = W.computers.map((c) => ({ id: c.id, name: c.name, status: c.status, project_id: c.project_id, server_name: c.server_name, realm_ids: [...c.realm_ids], server: c.server }));
// Rows of other realms only: the shown realm (the fixture's first) holds none of them.
const elsewhere = rows.filter((r) => !r.realm_ids.includes(W.realms[0]!.id));

function Probe() {
  const d = useShellData();
  return (
    <div>
      <p data-testid="read">{d.computersRead ?? 'known'}</p>
      <p data-testid="count">{d.computers.length}</p>
      <button onClick={() => d.retryComputers?.()}>retry</button>
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
const read = () => screen.getByTestId('read').textContent;

describe('LiveShellData: is the computer list known', () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it('loading while the list has not answered, then known with its rows', async () => {
    bootFixtureCore({ rules: [reply(containersRoute, answers.ok({ data: { computers: rows } }, 200))] });
    mount();
    expect(read()).toBe('loading');
    await waitFor(() => expect(read()).toBe('known'));
    expect(Number(screen.getByTestId('count').textContent)).toBeGreaterThan(0);
  });

  it('a whole list that answered zero is known (none yet)', async () => {
    bootFixtureCore({ rules: [reply(containersRoute, answers.ok({ data: { computers: [], pagination: { totalPages: 1 } } }))] });
    mount();
    await waitFor(() => expect(read()).toBe('known'));
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('a failed read is unknown, never none', async () => {
    bootFixtureCore({ rules: [reply(containersRoute, answers.refused(500, 'INTERNAL'))] });
    mount();
    await waitFor(() => expect(read()).toBe('unknown'));
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('a lost read is unknown', async () => {
    bootFixtureCore({ rules: [reply(containersRoute, answers.lost(10))] });
    mount();
    await waitFor(() => expect(read()).toBe('unknown'));
  });

  it('an empty first page of a longer list is unknown: the realm\'s computers may be on a later page', async () => {
    bootFixtureCore({ rules: [reply(containersRoute, answers.ok({ data: { computers: elsewhere, pagination: { totalPages: 3 } } }))] });
    mount();
    await waitFor(() => expect(read()).toBe('unknown'));
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('a whole list holding only other realms\' computers is known: the realm has none', async () => {
    bootFixtureCore({ rules: [reply(containersRoute, answers.ok({ data: { computers: elsewhere } }))] });
    mount();
    await waitFor(() => expect(read()).toBe('known'));
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('Try again reads the list once: loading while it runs, then the rows; nothing retried before the press', async () => {
    let calls = 0;
    bootFixtureCore({
      rules: [
        reply(containersRoute, () => { calls += 1; return answers.refused(500, 'INTERNAL'); }, { times: 1 }),
        reply(containersRoute, () => { calls += 1; return answers.ok({ data: { computers: rows } }, 200); }),
      ],
    });
    mount();
    await waitFor(() => expect(read()).toBe('unknown'));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(calls).toBe(1);
    await act(async () => {
      screen.getByText('retry').click();
    });
    await waitFor(() => expect(read()).toBe('loading'));
    await waitFor(() => expect(read()).toBe('known'));
    expect(calls).toBe(2);
    expect(Number(screen.getByTestId('count').textContent)).toBeGreaterThan(0);
  });

  it('offline before the first answer (the read waits for the network): loading, never not loaded', async () => {
    bootFixtureCore({ rules: [reply(containersRoute, answers.ok({ data: { computers: rows } }))] });
    onlineManager.setOnline(false);
    try {
      mount();
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
      expect(read()).toBe('loading');
    } finally {
      onlineManager.setOnline(true);
    }
    await waitFor(() => expect(read()).toBe('known'));
  });

  it('a whole empty list whose refetch fails is unknown, not "none": the old answer no longer says the realm has none', async () => {
    bootFixtureCore({
      rules: [
        reply(containersRoute, answers.ok({ data: { computers: [], pagination: { totalPages: 1 } } }), { times: 1 }),
        reply(containersRoute, answers.refused(500, 'INTERNAL'), { times: 1 }),
        reply(containersRoute, answers.ok({ data: { computers: rows } }, 300)),
      ],
    });
    mount();
    await waitFor(() => expect(read()).toBe('known'));
    await act(async () => {
      screen.getByText('retry').click();
    });
    await waitFor(() => expect(read()).toBe('unknown'));
    expect(screen.getByTestId('count').textContent).toBe('0');
    // Try again after that failure: loading while it runs (fetching wins over the held error), then the rows.
    await act(async () => {
      screen.getByText('retry').click();
    });
    await waitFor(() => expect(read()).toBe('loading'));
    await waitFor(() => expect(read()).toBe('known'));
    expect(Number(screen.getByTestId('count').textContent)).toBeGreaterThan(0);
  });

  it('Try again after an empty page of a longer list reads as loading while it runs (the old answer is still held)', async () => {
    bootFixtureCore({
      rules: [
        reply(containersRoute, answers.ok({ data: { computers: elsewhere, pagination: { totalPages: 3 } } }), { times: 1 }),
        reply(containersRoute, answers.ok({ data: { computers: rows } }, 300)),
      ],
    });
    mount();
    await waitFor(() => expect(read()).toBe('unknown'));
    await act(async () => {
      screen.getByText('retry').click();
    });
    await waitFor(() => expect(read()).toBe('loading'));
    await waitFor(() => expect(read()).toBe('known'));
  });
});
