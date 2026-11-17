// The shell's computers carry their colour only as core computerColor
// gives it. A container row's colour is normalised on the way in; a hostile or missing value is no colour.
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { answers, bootFixtureCore, fixtureWorld, queryClient, reply } from '@core';
import { containersRoute } from '@core/shell';
import { useShellData } from './context';
import { LiveShellData } from './live';

const W = fixtureWorld;
const realm = W.realms[0]!.id;
const row = (id: string, name: string, color?: string) => ({ id, name, status: 'running', realm_ids: [realm], ...(color === undefined ? {} : { color }) });

function Probe() {
  const d = useShellData();
  return <pre data-testid="colors">{JSON.stringify(Object.fromEntries(d.computers.map((c) => [c.name, c.color ?? null])))}</pre>;
}

describe('LiveShellData: a computer\'s colour', () => {
  beforeEach(() => queryClient.clear());

  it('normalises each row through computerColor; anything else is no colour', async () => {
    const rows = [row('a1', 'hex', '#e5484d'), row('a2', 'short', 'abc'), row('a3', 'hostile', 'red;x:url(y)'), row('a4', 'named', 'red'), row('a5', 'none')];
    bootFixtureCore({ rules: [reply(containersRoute, answers.ok({ data: { computers: rows } }))] });
    render(
      <QueryClientProvider client={queryClient}>
        <LiveShellData>
          <Probe />
        </LiveShellData>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('colors').textContent).toContain('hex'));
    expect(JSON.parse(screen.getByTestId('colors').textContent!)).toEqual({ hex: '#E5484D', short: '#AABBCC', hostile: null, named: null, none: null });
  });
});
