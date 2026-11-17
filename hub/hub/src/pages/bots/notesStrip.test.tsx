// Vitest: the note under the Start banner for a hold another page sent links to the page that sent it (Computers when the
// hold names none, which Computers and Board holds do today) and offers no Dismiss; our own hold's Dismiss frees the hold
// that was shown when its dialog opened. A hidden sender page gets no link: that is the kit HeldFromLink's own test.
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CoreQueryProvider, bootFixtureCore, computerLifecycleRoute, containersRoute, heldChanges, reply } from '@core';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStartComputer, type Computer, type StartHold } from './data';
import { ComputerNotesStrip } from './view';
import strings from './strings.en.json';

const C1 = 'aaaaaaaaaaaaaaaaaaaaaac1';
const computer: Computer = { id: C1, name: 'atlas', server: 'n1', flag: 'SG', state: 'stopped', listState: 'ok', suspended: 0, hasMore: false };
const hold = (over: Partial<StartHold>): StartHold => ({ computerId: C1, op: 'stop', ours: false, hold: 'h1', from: null, ...over });

const strip = (holds: StartHold[], onDismissStart: (s: { computerId: string; hold: string }) => void = () => undefined) => (
  <ComputerNotesStrip computers={[]} allComputers={[computer]} holds={holds} onRetry={() => undefined} onResume={() => undefined} resuming={false} starting={false} onCheckStart={() => undefined} onDismissStart={onDismissStart} />
);

describe('ComputerNotesStrip', () => {
  it('a hold that names no sender page links to Computers, read-only', () => {
    render(strip([hold({})]));
    expect(screen.getByText(strings['start.elsewhereLink']).closest('a')?.getAttribute('href')).toBe('/computers');
    expect(screen.queryByRole('button', { name: /^(?:close|stop tracking…|hide this note)$/i })).toBeNull();
  });

  it('a hold another page sent links to that page and words a foreign Stop neutrally', () => {
    render(strip([hold({ from: { page: 'board', path: '/board' } })]));
    expect(screen.getByText(strings['start.elsewhereLink']).closest('a')?.getAttribute('href')).toBe('/board');
    expect(screen.getByText(strings['start.heldTitleOther'].replace('{{name}}', 'atlas'))).toBeInTheDocument();
  });
});

describe('ComputerNotesStrip Dismiss of our own hold', () => {
  beforeEach(() => {
    bootFixtureCore({
      rules: [
        reply(containersRoute, () => ({ body: { data: { computers: [{ id: C1, status: 'stopped' }] } } })),
        reply(computerLifecycleRoute, () => ({ status: 502, body: {} })),
      ],
    });
  });

  it('passes the hold shown when the dialog opened, and frees it', async () => {
    const hook = renderHook(() => useStartComputer(), { wrapper: CoreQueryProvider });
    await act(async () => {
      await hook.result.current.run({ computerId: C1 });
    });
    const own = hook.result.current.holds[0];
    expect(own?.ours).toBe(true);
    const seen: Array<{ computerId: string; hold: string }> = [];
    render(
      strip(hook.result.current.holds, (shown) => {
        seen.push(shown);
        void hook.result.current.dismiss(shown);
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Stop tracking' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['start.dismissGo'] }));
    expect(seen).toEqual([{ computerId: C1, hold: own?.hold }]);
    await waitFor(() => expect(heldChanges('computer.lifecycle')).toHaveLength(0));
  });
});
