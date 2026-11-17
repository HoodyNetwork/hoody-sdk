// Shell: the dialog askLeave opens while work runs (LeaveConfirm): Stay changes nothing, Go on anyway lets the
// switch go on. The switch paths are leave.paths.test.tsx and core realm.leave.test.ts; sign-out is signOut.leave.test.tsx.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode, useEffect, useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { askLeave, holdLeave } from '@core';
import { interpolate } from '@kit';
import strings from './strings.en.json';

import { LeaveConfirm } from './LeaveConfirm';

const releases: Array<() => void> = [];
afterEach(() => { while (releases.length) releases.pop()!(); });
const hold = () => releases.push(holdLeave('upload'));
const dialog = () => screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));

describe('LeaveConfirm', () => {
  it('names how many run; Stay answers false and closes', async () => {
    render(<LeaveConfirm />);
    hold(); hold();
    let got: boolean | undefined;
    await act(async () => { void askLeave().then((v) => { got = v; }); });
    const d = await dialog();
    expect(d).toHaveTextContent(interpolate(strings['leave.body_other'], { count: 2 }));
    await act(async () => fireEvent.click(within(d).getByRole('button', { name: strings['leave.stay'] })));
    expect(got).toBe(false);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('Go on anyway answers true; a second ask while open gets the same answer', async () => {
    render(<LeaveConfirm />);
    hold();
    const got: boolean[] = [];
    await act(async () => { void askLeave().then((v) => got.push(v)); void askLeave().then((v) => got.push(v)); });
    const d = await dialog();
    expect(d).toHaveTextContent(interpolate(strings['leave.body_one'], { count: 1 }));
    await act(async () => fireEvent.click(within(d).getByRole('button', { name: strings['leave.confirm'] })));
    expect(got).toEqual([true, true]);
  });

  it('unmounting while it asks answers Stay', async () => {
    const { unmount } = render(<LeaveConfirm />);
    hold();
    let got: boolean | undefined;
    await act(async () => { void askLeave().then((v) => { got = v; }); });
    await dialog();
    await act(async () => { unmount(); });
    expect(got).toBe(false);
  });

  it('Escape answers Stay', async () => {
    render(<LeaveConfirm />);
    hold();
    let got: boolean | undefined;
    await act(async () => { void askLeave().then((v) => { got = v; }); });
    const d = await dialog();
    await act(async () => { fireEvent.keyDown(d, { key: 'Escape', code: 'Escape' }); });
    expect(got).toBe(false);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('the open dialog follows the count; once nothing runs it closes and answers go on', async () => {
    render(<LeaveConfirm />);
    const first = holdLeave('upload');
    let got: boolean | undefined;
    await act(async () => { void askLeave().then((v) => { got = v; }); });
    expect(await dialog()).toHaveTextContent(interpolate(strings['leave.body_one'], { count: 1 }));
    const second = holdLeave('copy');
    await act(async () => { await Promise.resolve(); });
    expect(await dialog()).toHaveTextContent(interpolate(strings['leave.body_other'], { count: 2 }));
    await act(async () => { first(); second(); });
    expect(got).toBe(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a StrictMode effect replay that ends the question leaves no dialog without one', async () => {
    hold();
    const got: boolean[] = [];
    function AskOnce() {
      const asked = useRef(false);
      useEffect(() => {
        if (asked.current) return;
        asked.current = true;
        void askLeave().then((v) => got.push(v));
      }, []);
      return null;
    }
    await act(async () => {
      render(<StrictMode><LeaveConfirm /><AskOnce /></StrictMode>);
    });
    await act(async () => { await Promise.resolve(); });
    expect(got).toEqual([false]);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
