// Vitest: while the picker is open for a slot, the picker is the slot's content: the
// slot's own Add and recent picks hide (the body is marked picking; they stay in place), and Add gets focus back when it
// closes. The picker is placed against the slot body's anchor line, not the button. Add names N only on the slot N
// opens (addKey) with keys on, and never as a key cap inside its label; naming it or not never remounts Add.
import { bootFixtureCore, CoreQueryProvider } from '@core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from '../computers';
import type { TileRef } from '../model/boards';
import { EmptySlot, type EmptySlotProps } from './EmptySlot';
import strings from '../strings.en.json';

const S = strings as Record<string, string>;
const pc = { id: 'c1', name: 'atlas', project_id: 'p1', server_name: 'n12', status: 'running' } as BoardComputer;
const ref = (session: number): TileRef => ({ project: 'p1', computer: 'c1', program: 'terminal', session });

function Slot(p: Partial<EmptySlotProps>) {
  const [open, setOpen] = useState(false);
  return (
    <CoreQueryProvider>
      <EmptySlot
        domId="slot-a"
        active
        hidden={false}
        only={false}
        keys
        addKey
        pickerOpen={open}
        onPickerOpen={setOpen}
        picker={{ computers: [pc], failed: false, onRetry: () => {}, recents: [], known: [], onBoard: [], realmName: 'Personal', onComputers: null }}
        recents={[{ tile: ref(1), label: 'terminal-1' }, { tile: ref(2), label: 'terminal-2' }]}
        onPick={() => {}}
        onClose={() => {}}
        onActivate={() => {}}
        {...p}
      />
    </CoreQueryProvider>
  );
}
const slot = () => screen.getByRole('group', { name: S['empty.chip'] });
const addButton = () => within(slot()).getByRole('button', { name: S['empty.add'] });

beforeEach(() => { bootFixtureCore({ rules: [] }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Empty slot: the picker is the slot while it is open', () => {
  it('opening hides Add and the recent picks in place; closing shows them and gives Add the focus back', async () => {
    const user = userEvent.setup();
    render(<Slot />);
    const add = addButton();
    const recents = within(slot()).getByRole('group', { name: S['empty.recent'] });
    const picking = () => slot().querySelector('[data-picking]');
    expect(picking()).toBeNull();
    await user.click(add);
    expect(await screen.findByRole('dialog', { name: S['picker.title'] })).toBeTruthy();
    const marked = picking();
    expect(marked).not.toBeNull();
    // Both stay in the body (so the layout and the focus target stay), under the picking mark that hides them.
    expect(marked!.contains(add)).toBe(true);
    expect(marked!.contains(recents)).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: S['picker.title'] })).toBeNull());
    expect(picking()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(addButton()));
  });

  it('the first-visit welcome hides the same way while its picker is open', async () => {
    const user = userEvent.setup();
    render(<Slot only />);
    await user.click(addButton());
    await screen.findByRole('dialog', { name: S['picker.title'] });
    expect(slot().querySelector('[data-picking]')!.contains(addButton())).toBe(true);
  });

  it('the anchor is a hidden line inside the body, first, outside the parts that hide', () => {
    render(<Slot />);
    const anchor = slot().querySelector('[aria-hidden="true"]:empty');
    expect(anchor).not.toBeNull();
    expect(anchor!.tagName).toBe('SPAN');
    expect(anchor!.parentElement!.firstElementChild).toBe(anchor);
    expect(anchor!.parentElement!.contains(addButton())).toBe(true);
  });
});

describe('Empty slot: Add names its key in the tooltip, not the label', () => {
  it('the slot N opens, keys on: aria-keyshortcuts N and no key cap in the button', () => {
    render(<Slot />);
    const add = addButton();
    expect(add.getAttribute('aria-keyshortcuts')).toBe('N');
    expect(add.querySelector('kbd')).toBeNull();
    expect(add.textContent).toBe(S['empty.add']);
  });

  it('the tooltip on hover names Add a program and N', async () => {
    const user = userEvent.setup();
    render(<Slot />);
    await user.hover(addButton());
    const tip = await screen.findByRole('tooltip', {}, { timeout: 2000 });
    expect(tip.textContent).toContain(S['empty.add']);
    expect(tip.textContent).toContain('N');
  });

  it('not the slot N opens, or keys off: no key named, even on the active slot', () => {
    render(<Slot addKey={false} active />);
    expect(addButton().hasAttribute('aria-keyshortcuts')).toBe(false);
    cleanup();
    render(<Slot keys={false} />);
    expect(addButton().hasAttribute('aria-keyshortcuts')).toBe(false);
  });

  it('an inactive slot that is the one N opens names N', () => {
    render(<Slot active={false} />);
    expect(addButton().getAttribute('aria-keyshortcuts')).toBe('N');
  });

  it('naming N or not, and activation, keep the same Add element (a press that activates the slot is not lost)', () => {
    const r = render(<Slot addKey={false} active={false} />);
    const before = addButton();
    r.rerender(<Slot addKey active />);
    expect(addButton()).toBe(before);
    expect(before.getAttribute('aria-keyshortcuts')).toBe('N');
    r.rerender(<Slot addKey={false} active={false} />);
    expect(addButton()).toBe(before);
  });
});
