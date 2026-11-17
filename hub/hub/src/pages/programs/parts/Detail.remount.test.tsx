// The Ports table's per-port buttons are the same buttons across a render of the page: the page hands Detail new
// press and Logs handlers on every render of its own, and a keyboard user on a
// port's inline Restart keeps their place (the kit table renders every function cell through one stable host). The
// buttons still follow the live state: a held press turns those same buttons off. A press reaches the handler the page
// holds now, with the row it holds now, and acts on that one port only (range false: never the whole range).
import { describe, expect, it, vi } from 'vitest';
import { bootFixtureCore, queryClient, type Target } from '@core';
import { render, screen, userEvent, within } from '@app/testing';
// eslint-disable-next-line no-restricted-imports -- a test harness (fixture core render, query provider), not page code
import { QueryClientProvider } from '@tanstack/react-query';
import type * as Nav from '@kit/nav';
import type { ReactElement } from 'react';
import type { Row as ProgramRow } from '../logic';
import { Detail, type DetailProps } from './Detail';
import type { Op } from './ops';
import strings from '../strings.en.json';

// The table's URL state needs a router this harness does not mount; the parts table reads none of it.
vi.mock('@kit/nav', async (orig) => ({ ...(await orig<typeof Nav>()), useSearchParam: () => [undefined, () => undefined], useGo: () => () => undefined }));

const can = { start: true, stop: true, restart: true, boot: false, portStart: false };
const partCan = { start: false, stop: true, restart: true };
const row: ProgramRow = {
  key: 'prog:2', id: '2', scope: 'yours', name: 'api', kit: null, state: 'running', exitCode: null, enabled: true, lazy: false, boot: true, policy: null,
  up: 60, port: null, range: { start: 8000, end: 8001 } as ProgramRow['range'], partsUp: 2, stop: null, ends: null, known: true, attention: false, bucket: 0, can,
  parts: [
    { port: 8000, state: 'running', up: 60, can: partCan },
    { port: 8001, state: 'running', up: 60, can: partCan },
  ],
};
const held: Op = { act: 'restart', target: {} as Target, port: null, status: 'working', press: {} as Op['press'] };

function props(over: Partial<DetailProps> = {}): DetailProps {
  return { row, op: undefined, confirm: null, onAct: vi.fn(), onConfirm: () => {}, onCancelConfirm: () => {}, onCheck: () => {}, onDismiss: async () => false, onLogs: vi.fn(), ...over };
}
const wrap = (p: DetailProps): ReactElement => (
  <QueryClientProvider client={queryClient}>
    <Detail {...p} />
  </QueryClientProvider>
);
const restart = () => screen.getByRole('button', { name: 'Restart port 8000 of api' });
const rowOfPort = (port: number) => within(screen.getByRole('table', { name: 'Ports of api' })).getAllByRole('row').find((r) => r.querySelector('td')?.textContent?.trim() === String(port)) as HTMLElement;
/** A port row's ⋯ menu items, opened here. */
async function menuOf(port: number): Promise<HTMLElement> {
  await userEvent.click(within(rowOfPort(port)).getByRole('button', { name: 'Row actions' }));
  return screen.findByRole('menu');
}

describe('the Ports table keeps its per-port buttons across a render of the page', () => {
  it('new press and Logs handlers with the same row: the same Restart button, still focused, pressing reaches the new handler', () => {
    bootFixtureCore();
    queryClient.clear();
    const first = props();
    const { rerender } = render(wrap(first));
    const before = restart();
    before.focus();
    expect(before).toHaveFocus();
    const next = props();
    rerender(wrap(next));
    expect(restart()).toBe(before);
    expect(restart()).toHaveFocus();
    restart().click();
    expect(next.onAct).toHaveBeenCalledTimes(1);
    expect(next.onAct).toHaveBeenCalledWith(row, 'restart', { port: 8000, range: false });
    expect(first.onAct).not.toHaveBeenCalled();
  });

  // A held press turns them off with the reason: the kit draws a soft-disabled inline row action (aria-disabled,
  // described by its reason) as a new element, so this checks the state by name, not the element (the kit's choice;
  // the inline action remounts as it gains a reason).
  it('a held press: the buttons turn off with the reason, and back on when it ends', () => {
    bootFixtureCore();
    queryClient.clear();
    // The same handlers throughout: only the hold changes, so nothing else can carry it to the buttons.
    const base = props();
    const { rerender } = render(wrap(base));
    const before = restart();
    expect(before).toBeEnabled();
    rerender(wrap({ ...base, op: held }));
    expect(restart()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Restart port 8001 of api' })).toHaveAttribute('aria-disabled', 'true');
    // Each says why: the held press's reason is its description.
    expect(restart()).toHaveAccessibleDescription(expect.stringContaining(strings['ports.held']));
    expect(screen.getByRole('button', { name: 'Restart port 8001 of api' })).toHaveAccessibleDescription(expect.stringContaining(strings['ports.held']));
    restart().click();
    expect(base.onAct).not.toHaveBeenCalled();
    rerender(wrap(base));
    expect(restart()).toBeEnabled();
    expect(restart()).not.toHaveAttribute('aria-disabled');
    restart().click();
    expect(base.onAct).toHaveBeenCalledWith(row, 'restart', { port: 8000, range: false });
  });

  it('a refetch that builds a new row and parts with only an uptime changed keeps the same button, and a press carries the new row', () => {
    bootFixtureCore();
    queryClient.clear();
    const first = props();
    const { rerender } = render(wrap(first));
    const before = restart();
    const refetched: ProgramRow = { ...row, up: 120, parts: row.parts.map((p) => ({ ...p, up: 120, can: { ...p.can } })), can: { ...row.can } };
    expect(refetched.parts[0]).not.toBe(row.parts[0]);
    rerender(wrap({ ...first, row: refetched }));
    expect(restart()).toBe(before);
    restart().click();
    expect(first.onAct).toHaveBeenCalledWith(refetched, 'restart', { port: 8000, range: false });
    // What a port can do is shown: a part that can only start now offers Start on its row, and no Restart.
    rerender(wrap({ ...first, row: { ...refetched, parts: [{ ...refetched.parts[0]!, state: 'stopped', can: { start: true, stop: false, restart: false } }, refetched.parts[1]!] } }));
    expect(screen.queryByRole('button', { name: 'Restart port 8000 of api' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start port 8000 of api' })).toBeEnabled();
  });

  it('Stop and Logs in a port row menu reach the current handlers with the current row, one port only', async () => {
    bootFixtureCore();
    queryClient.clear();
    const first = props();
    const { rerender } = render(wrap(first));
    const next = props();
    const refetched: ProgramRow = { ...row, parts: row.parts.map((p) => ({ ...p })) };
    rerender(wrap({ ...next, row: refetched }));
    await userEvent.click(within(await menuOf(8001)).getByRole('menuitem', { name: 'Logs of port 8001 of api' }));
    expect(next.onLogs).toHaveBeenCalledTimes(1);
    // The very row the page holds now (a deep-equal copy of the old one would pass toHaveBeenCalledWith).
    expect(vi.mocked(next.onLogs!).mock.calls[0]![0]).toBe(refetched);
    expect(vi.mocked(next.onLogs!).mock.calls[0]![1]).toBe(8001);
    expect(first.onLogs).not.toHaveBeenCalled();
    await userEvent.click(within(await menuOf(8000)).getByRole('menuitem', { name: 'Stop port 8000 of api' }));
    expect(next.onAct).toHaveBeenCalledWith(refetched, 'stop', { port: 8000, range: false });
    rerender(wrap({ ...next, row: refetched, onLogs: undefined }));
    expect(within(await menuOf(8001)).queryByRole('menuitem', { name: 'Logs of port 8001 of api' })).toBeNull();
  });
});
