// The Logs toolbar's computer picker draws each computer's colour as the
// shell reads it from the API. Real request path: the shell's live data over a /computers answer, its computers handed
// to ComputerPick, the kit picker's mark normalising the value. A hostile value draws no mark and reaches no style.
// eslint-disable-next-line no-restricted-imports -- a test harness for the shell's live read, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { answers, bootFixtureCore, fixtureWorld, queryClient, reply } from '@core';
import { containersRoute } from '@core/shell';
import { useShellData } from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's live data provider, a test harness for the real request path, not page code
import { LiveShellData } from '@shell/live';
import { ComputerPick } from './parts/ComputerPick';

const realm = fixtureWorld.realms[0]!.id;
const row = (id: string, name: string, color?: string) => ({ id, name, status: 'running', realm_ids: [realm], ...(color === undefined ? {} : { color }) });
const t = (k: string) => ({ 'f.computer': 'Computer', 'pick.running': 'Running', 'pick.stopped': 'Stopped' })[k] ?? k;

function Pick() {
  const shell = useShellData();
  return <ComputerPick shell={{ ...shell, setComputer: () => {} }} currentId="a1" onPick={() => {}} t={t} />;
}

describe('Logs computer picker: the computer colour on the real request path', () => {
  beforeEach(() => queryClient.clear());

  it('trigger and rows draw the API colour; a hostile value draws no mark', async () => {
    const rows = [row('a1', 'atlas', '#3b82f6'), row('a2', 'cedar', 'red;x:url(y)'), row('a3', 'fjord', '#10B981')];
    bootFixtureCore({ rules: [reply(containersRoute, answers.ok({ data: { computers: rows } }))] });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <LiveShellData>
          <Pick />
        </LiveShellData>
      </QueryClientProvider>,
    );
    const trigger = await screen.findByRole('button', { name: /Computer$/ });
    await waitFor(() => expect(trigger.querySelector('[data-computer-color]')?.getAttribute('data-computer-color')).toBe('#3B82F6'));
    await userEvent.setup().click(trigger);
    const list = await screen.findByRole('dialog', { name: 'Computer' });
    const markOf = (name: string) => within(list).getByRole('radio', { name: new RegExp(`^${name}\\b`) }).querySelector('[data-computer-color]')?.getAttribute('data-computer-color') ?? null;
    expect(markOf('atlas')).toBe('#3B82F6');
    expect(markOf('fjord')).toBe('#10B981');
    expect(markOf('cedar')).toBeNull();
    for (const el of [...container.ownerDocument.querySelectorAll<HTMLElement>('[style]')]) expect(el.getAttribute('style')).not.toContain('url(');
  });
});
