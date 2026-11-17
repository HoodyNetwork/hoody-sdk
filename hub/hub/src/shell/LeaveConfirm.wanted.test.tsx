// A leave question is asked for as long as its caller wants it. A realm switch cancelled or superseded while
// its question is open answers Stay for itself and leaves no obsolete dialog; a newer switch keeps its own question.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { askLeave, capture, holdLeave, setLeaveAsker } from '@core';
import { beginSwitch, FIXTURE_REALM, switchRealm } from '@core/shell';
import { FIXTURE_REALM_2 } from '@core/fixtures';
import { setSwitching } from '../core/ctx';
import strings from './strings.en.json';
import { LeaveConfirm } from './LeaveConfirm';

const releases: Array<() => void> = [];
afterEach(async () => {
  cleanup();
  while (releases.length) releases.pop()!();
  await switchRealm('all');
});
const wait = (ms = 20) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const leaveDialog = () => screen.queryByRole('alertdialog', { name: strings['leave.title'] });

describe('a question ends with the switch it was for', () => {
  it('askLeave with a check already false answers Stay without asking', async () => {
    releases.push(holdLeave('upload'));
    const ask = vi.fn(() => Promise.resolve(true));
    releases.push(setLeaveAsker(ask));
    expect(await askLeave(() => false)).toBe(false);
    expect(await askLeave(() => { throw new Error('x'); })).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });

  it('nothing running: a check already false (or throwing) still answers Stay; a wanted caller goes on', async () => {
    expect(await askLeave(() => false)).toBe(false);
    expect(await askLeave(() => { throw new Error('x'); })).toBe(false);
    expect(await askLeave(() => true)).toBe(true);
    expect(await askLeave()).toBe(true);
  });

  it('a switch cancelled while its question is open: the dialog closes, Stay, the realm stays', async () => {
    render(<LeaveConfirm />);
    releases.push(holdLeave('upload'));
    const before = capture().realm;
    const op = beginSwitch(FIXTURE_REALM_2);
    await wait();
    expect(await screen.findByRole('alertdialog', { name: strings['leave.title'] })).toBeInTheDocument();
    act(() => op.cancel());
    await wait();
    expect(leaveDialog()).toBeNull();
    expect(await op.done).toBe(false);
    expect(capture().realm).toBe(before);
  });

  it('a switch superseded while asked: the old one gets Stay, the question stays for the new one, Go on commits it', async () => {
    render(<LeaveConfirm />);
    releases.push(holdLeave('upload'));
    const old = beginSwitch(FIXTURE_REALM_2);
    await wait();
    await screen.findByRole('alertdialog', { name: strings['leave.title'] });
    let oldDone: boolean | null = null;
    void old.done.then((v) => { oldDone = v; });
    const next = beginSwitch(FIXTURE_REALM);
    await wait();
    expect(oldDone).toBe(false);
    const d = await screen.findByRole('alertdialog', { name: strings['leave.title'] });
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: strings['leave.confirm'] })); });
    expect(await next.done).toBe(true);
    expect(capture().realm).toBe(FIXTURE_REALM);
  });
  it('two callers joined in one question: the one no longer wanted gets Stay, the other keeps the dialog and its answer', async () => {
    render(<LeaveConfirm />);
    releases.push(holdLeave('upload'));
    let firstWanted = true;
    const got: Array<[string, boolean]> = [];
    await act(async () => {
      void askLeave(() => firstWanted).then((v) => got.push(['first', v]));
      void askLeave(() => true).then((v) => got.push(['second', v]));
    });
    await screen.findByRole('alertdialog', { name: strings['leave.title'] });
    firstWanted = false;
    act(() => setSwitching(null)); // any core change
    await wait();
    expect(got).toEqual([['first', false]]);
    const d = await screen.findByRole('alertdialog', { name: strings['leave.title'] });
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: strings['leave.confirm'] })); });
    expect(got).toEqual([['first', false], ['second', true]]);
  });
});
