// Every list answer that has not failed is the latest accepted row of its
// computers (core noteComputerRows). A row that withholds server_name leaves the current target with no server (no address, and
// core sends nothing to the old one); a row naming it again gives it back; a failed refetch (the old rows kept beside its error)
// changes nothing.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { answers, bootFixtureCore, fixtureWorld, queryClient, reply, routingOf } from '@core';
import { containersRoute, snapshot } from '@core/shell';
import { useShellData } from './context';
import { LiveShellData } from './live';

const atlas = fixtureWorld.computers[0]!;
const rowsWith = (server_name: unknown) => fixtureWorld.computers.map((c) => ({
  id: c.id, name: c.name, status: c.status, project_id: c.project_id, realm_ids: [...c.realm_ids], server: c.server,
  server_name: c.id === atlas.id ? server_name : c.server_name,
}));
const server = () => snapshot().target?.container.server_name;

function Probe() { useShellData(); return null; }
const mount = () => render(<QueryClientProvider client={queryClient}><LiveShellData><Probe /></LiveShellData></QueryClientProvider>);
const refetch = async () => {
  await act(async () => { await queryClient.refetchQueries().catch(() => {}); });
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
};

describe('LiveShellData: the target follows its row\'s routing node', () => {
  beforeEach(() => queryClient.clear());

  it('X, then withheld (no server, core suspends X), then X again', async () => {
    bootFixtureCore({
      rules: [
        reply(containersRoute, answers.ok({ data: { computers: rowsWith(atlas.server_name) } }), { times: 1 }),
        reply(containersRoute, answers.ok({ data: { computers: rowsWith(null) } }), { times: 1 }),
        reply(containersRoute, answers.ok({ data: { computers: rowsWith(atlas.server_name) } })),
      ],
    });
    mount();
    await waitFor(() => expect(snapshot().target?.container.id).toBe(atlas.id));
    expect(server()).toBe(atlas.server_name);
    await refetch();
    await waitFor(() => expect(server()).toBeUndefined());
    expect(snapshot().target?.container.id, 'the same computer stays chosen').toBe(atlas.id);
    expect(routingOf(atlas.id)).toBe('');
    await refetch();
    await waitFor(() => expect(server()).toBe(atlas.server_name));
    expect(routingOf(atlas.id)).toBe(atlas.server_name);
  });

  it('a failed refetch keeps the server', async () => {
    bootFixtureCore({
      rules: [
        reply(containersRoute, answers.ok({ data: { computers: rowsWith(atlas.server_name) } }), { times: 1 }),
        reply(containersRoute, answers.ok({ data: {} })),
      ],
    });
    mount();
    await waitFor(() => expect(server()).toBe(atlas.server_name));
    await refetch();
    expect(server()).toBe(atlas.server_name);
    expect(routingOf(atlas.id)).toBe(atlas.server_name);
  });
});
