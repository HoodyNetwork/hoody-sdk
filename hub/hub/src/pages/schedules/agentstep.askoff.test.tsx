// Vitest: with Ask off, Bots is the only way to the agent from New schedule. The agent choice says so ("Opens Bots"),
// opens the selected computer's Bots, and never shows the agent step or the Agent panel. ASK_ENABLED is on, so askOn is
// turned off here through the page's own import of it (add.test.tsx keeps the same check for a build whose switch is off).
import type * as Kit from '@kit';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { chooseComputer, fixtureWorld } from '@core';
import { useAskDock } from '@kit';
import page from './page';
import strings from './strings.en.json';

vi.mock('@kit', async (orig) => {
  const real = await orig<typeof Kit>();
  return { ...real, askOn: () => false };
});

// Two different computers, so a link that names the wrong one (or always the first) fails.
const twoComputers = fixtureWorld.computers.slice(0, 2);

describe('schedules: the agent way with Ask off', () => {
  it('has two different computers to choose from', () => {
    expect(twoComputers).toHaveLength(2);
    expect(twoComputers[0]!.id).not.toBe(twoComputers[1]!.id);
  });

  it.each(twoComputers.map((c) => [c.name, c] as const))('opens the Bots of the selected computer (%s), never the agent step', async (_n, c) => {
    const { router } = await renderPage(page, { path: '/schedules?edit=new' });
    await act(async () => { chooseComputer(c); });
    expect(await screen.findByText(strings['new.agentGoBots'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['new.agent']) }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/bots'));
    expect((router.state.location.search as Record<string, unknown>).computer).toBe(c.id);
    expect(screen.queryByRole('dialog', { name: strings['new.agentTitle'] })).toBeNull();
    expect(screen.queryByText(strings['new.agentWhat'])).toBeNull();
    const dock = renderHook(() => useAskDock()).result.current;
    expect(dock.isOpen).toBe(false);
    expect(dock.draft).toBeUndefined();
  });
});
