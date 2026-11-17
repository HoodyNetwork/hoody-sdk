// The live shell's computer list never reads "none" from a body it could not read or from a page that may not be
// the whole list. A body without a containers array is a read error (unknown), like a failed read; a full page of 100 rows
// with no pagination is not known to be the whole list (the same rule as core's computersPage), so a realm that shows no
// computer in it is unknown, not "none".
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { answers, bootFixtureCore, queryClient, reply } from '@core';
import { containersRoute } from '@core/shell';
import { useShellData } from './context';
import { LiveShellData } from './live';

const row = (id: string, realm: string) => ({ id, name: id, status: 'running', project_id: 'p1', server_name: 'n1', realm_ids: [realm] });
const elsewhereId = 'r-another-realm';

function Probe() {
  const d = useShellData();
  return (
    <div>
      <p data-testid="read">{d.computersRead ?? 'known'}</p>
      <p data-testid="count">{d.computers.length}</p>
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

describe('LiveShellData: a list that is not known never reads as none', () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it('a body without a containers array is unknown, not a whole list of zero', async () => {
    bootFixtureCore({ rules: [reply(containersRoute, answers.ok({ data: {} }, 200))] });
    mount();
    await waitFor(() => expect(read()).toBe('unknown'));
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('a containers field that is not a list is unknown too', async () => {
    bootFixtureCore({ rules: [reply(containersRoute, answers.ok({ data: { computers: 'none' as unknown as unknown[] } }, 200))] });
    mount();
    await waitFor(() => expect(read()).toBe('unknown'));
  });

  it('a full page of 100 rows with no pagination, none in the shown realm: unknown (a later page may hold them)', async () => {
    const full = Array.from({ length: 100 }, (_, i) => row(`x${i}`, elsewhereId));
    bootFixtureCore({ rules: [reply(containersRoute, answers.ok({ data: { computers: full } }, 200))] });
    mount();
    await waitFor(() => expect(read()).toBe('unknown'));
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('99 rows with no pagination, none in the shown realm: known, the realm has none', async () => {
    const some = Array.from({ length: 99 }, (_, i) => row(`x${i}`, elsewhereId));
    bootFixtureCore({ rules: [reply(containersRoute, answers.ok({ data: { computers: some } }, 200))] });
    mount();
    await waitFor(() => expect(read()).toBe('known'));
    expect(screen.getByTestId('count').textContent).toBe('0');
  });
});
