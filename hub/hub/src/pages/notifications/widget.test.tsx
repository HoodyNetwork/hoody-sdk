// Vitest: the Home widget in its fixture states.
import { bootFixtureCore, heldChanges, queryClient } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetFixtureServer, setListDown } from './fixtures';
import { READ_ALL_LOCK } from './data';
import page from './page';
import strings from './strings.en.json';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The widget has the shape of a page view, so the page harness renders it through the real router.
async function show(state?: string) {
  await renderPage({ ...page, load: () => import('./widget') }, { state });
}

describe('notifications widget', () => {
  beforeEach(() => {
    bootFixtureCore();
    resetFixtureServer();
  });

  it('lists the latest unread notices and marks them all read', async () => {
    await show();
    const list = await screen.findByRole('list', { name: strings.title });
    expect(list.querySelectorAll('li').length).toBeGreaterThan(0);
    expect(list.querySelectorAll('li').length).toBeLessThanOrEqual(4);
    await userEvent.click(screen.getByRole('button', { name: strings.readAll }));
    expect(await screen.findByText(strings['widget.empty'])).toBeInTheDocument();
  });

  it('shows one line when everything is read', async () => {
    await show('caught-up');
    expect(await screen.findByText(strings['widget.empty'])).toBeInTheDocument();
  });

  it('offers Try again when the list cannot load', async () => {
    await show('error');
    await waitFor(() => expect(screen.getByText(strings['widget.error'])).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('locks Mark all read while it may have gone through, and offers Check again', async () => {
    await show('ack-pending-unreadable');
    await userEvent.click(await screen.findByRole('button', { name: strings.readAll }));
    // The kit Outcome replaces the button while it may have gone through: nothing can be resent.
    expect(await screen.findByText(strings['widget.markPending'])).toBeInTheDocument();
    expect(heldChanges(READ_ALL_LOCK)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: strings.readAll })).toBeNull();
    expect(screen.queryByText(strings['widget.markFailed'])).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Check/ }));
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByRole('button', { name: strings.readAll })).toBeNull();
    setListDown(false);
    // It went through: a fresh list reads nothing unread, which proves it.
    await userEvent.click(screen.getByRole('button', { name: /^Check/ }));
    expect(await screen.findByText(strings['widget.empty'])).toBeInTheDocument();
    expect(screen.queryByText(strings['widget.markPending'])).toBeNull();
    await waitFor(() => expect(heldChanges(READ_ALL_LOCK)).toEqual([]));
  });

  it('keeps Check again when the list reads empty while Mark all read may have gone through', async () => {
    await show('ack-pending');
    await userEvent.click(await screen.findByRole('button', { name: strings.readAll }));
    expect(await screen.findByText(strings['widget.markPending'])).toBeInTheDocument();
    // A refetch that is not a read-back (focus, another tab): the list now reads empty, the hold stays.
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    expect(await screen.findByText(strings['widget.empty'])).toBeInTheDocument();
    expect(screen.getByText(strings['widget.markPending'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Check/ })).toBeInTheDocument();
  });

  it('a Mark all read no list can prove stays held; Forget it warns first, then frees it', async () => {
    await show('ack-lost');
    await userEvent.click(await screen.findByRole('button', { name: strings.readAll }));
    expect(await screen.findByText(strings['widget.markPending'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Check/ }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(heldChanges(READ_ALL_LOCK)).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: strings['forgetAll.button'] }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(strings['forgetAll.body'])).toBeInTheDocument();
    expect(heldChanges(READ_ALL_LOCK)).toHaveLength(1);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['forgetAll.confirm'] }));
    await waitFor(() => expect(heldChanges(READ_ALL_LOCK)).toEqual([]));
    expect(await screen.findByRole('button', { name: strings.readAll })).toBeEnabled();
  });

  it('its row links and Mark all read carry the touch classes, which make them 44 px targets on a coarse pointer only', async () => {
    await show();
    const list = await screen.findByRole('list', { name: strings.title });
    const link = list.querySelector('a') as HTMLElement;
    expect(link.className).toMatch(/rowLink/);
    expect(screen.getByRole('button', { name: strings.readAll }).className).toMatch(/markAll/);
    // jsdom has no pointer media: the stylesheet itself is checked. Both classes grow to the control height inside the coarse block
    // and not outside it.
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'widget.module.css'), 'utf8');
    const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
    const outside = css.slice(0, css.indexOf('@media (pointer: coarse)'));
    expect(coarse).toMatch(/\.rowLink\s*{[^}]*min-height: var\(--ctl-h\)/);
    expect(coarse).toMatch(/\.markAll\s*{[^}]*min-height: var\(--ctl-h\)/);
    expect(outside).not.toMatch(/min-height/);
  });
});
