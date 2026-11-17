// Vitest: Forget it passes the hold that was SHOWN, read from core and captured when its dialog opened. It frees exactly
// that send (also after a remount), a wrong or replaced hold frees nothing, a false answer says nothing was dismissed
// (never "failed") and keeps the band, and with no hold shown there is no Forget at all.
import { act, render, renderHook } from '@testing-library/react';
import { CoreQueryProvider, bootFixtureCore, heldChanges } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { READ_LOCK, useMarkRead, useReadHolds } from './data';
import { resetFixtureServer } from './fixtures';
import { ForgetHold } from './parts/ForgetReadAll';
import page from './page';
import strings from './strings.en.json';

const ID = '4e0000000000000000000000';
const hooks = () => renderHook(() => ({ m: useMarkRead(), holds: useReadHolds() }), { wrapper: CoreQueryProvider });

describe('Forget it frees the hold that was shown', () => {
  beforeEach(() => {
    bootFixtureCore();
    resetFixtureServer();
  });

  it('the dialog describes itself with the warning, so a screen reader hears it with the title', async () => {
    render(<ForgetHold what="forgetOne" overlayId="notifications-forget-row" holds={['h1']} onForget={() => Promise.resolve(true)} />);
    await userEvent.click(screen.getByRole('button', { name: strings['forgetOne.button'] }));
    expect(await screen.findByRole('alertdialog')).toHaveAccessibleDescription(strings['forgetOne.body']);
  });

  it('a held mark-read is freed by its shown hold after a remount, and by nothing else', async () => {
    await renderPage(page, { state: 'ack-lost' });
    const first = hooks();
    await act(async () => {
      await first.result.current.m.run(ID);
    });
    first.unmount();
    const again = hooks();
    const shown = again.result.current.holds.get(ID);
    expect(shown).toEqual(expect.any(String));
    let freed: boolean | undefined;
    await act(async () => {
      freed = await again.result.current.m.forget({ id: ID, hold: 'not-the-hold' });
    });
    expect(freed).toBe(false);
    expect(heldChanges(READ_LOCK)).toHaveLength(1);
    await act(async () => {
      freed = await again.result.current.m.forget({ id: ID, hold: shown as string });
    });
    expect(freed).toBe(true);
    expect(heldChanges(READ_LOCK)).toEqual([]);
  });

  it('the dialog hands onForget the holds that were in view when it opened; false says nothing was dismissed and keeps the band', async () => {
    const seen: Array<readonly string[]> = [];
    const view = render(<ForgetHold what="forgetOne" overlayId="notifications-forget-row" holds={['h1']} onForget={(h) => (seen.push(h), Promise.resolve(false))} />);
    await userEvent.click(screen.getByRole('button', { name: strings['forgetOne.button'] }));
    view.rerender(<ForgetHold what="forgetOne" overlayId="notifications-forget-row" holds={['h2']} onForget={(h) => (seen.push(h), Promise.resolve(false))} />);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['forgetOne.confirm'] }));
    expect(await screen.findByText(strings['forget.nothing'])).toBeInTheDocument();
    expect(seen).toEqual([['h1']]);
    expect(screen.getByRole('button', { name: strings['forgetOne.button'] })).toBeInTheDocument();
  });

  it('a Forget that freed its send says nothing more', async () => {
    render(<ForgetHold what="forgetOne" overlayId="notifications-forget-row" holds={['h1']} onForget={() => Promise.resolve(true)} />);
    await userEvent.click(screen.getByRole('button', { name: strings['forgetOne.button'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['forgetOne.confirm'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.queryByText(strings['forget.nothing'])).toBeNull();
  });

  it('offers no Forget when no hold is shown', () => {
    render(<ForgetHold what="forgetOne" overlayId="notifications-forget-row" holds={[]} onForget={() => Promise.resolve(true)} />);
    expect(screen.queryByRole('button', { name: strings['forgetOne.button'] })).toBeNull();
  });
});
