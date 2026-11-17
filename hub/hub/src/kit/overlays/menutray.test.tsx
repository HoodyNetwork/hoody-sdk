// ActionMenu's phone tray: below 600 px the menu is a modal dialog named by its visible
// title (`title`, else `label`, else "More actions") that holds the menu, named the same; Close and Escape close it and
// focus goes back to the trigger; `phone="popover"` keeps the anchored popover; a tray opened while a press is held is
// arming (rows ignore pointers) until that press ends. Playwright (traymenu/menufit specs) covers what needs layout.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { ActionMenu, type MenuEntry } from './Overlays';
import strings from './strings.en.json';

function setPhone(phone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (q: string) => ({ matches: phone && q.includes('600'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
}

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  setPhone(true);
});
afterEach(() => {
  cleanup();
  setPhone(false);
  // No press carries into the next test.
  window.dispatchEvent(new Event('blur'));
});

const noop = () => undefined;
const ITEMS: readonly MenuEntry[] = [
  { id: 'open', label: 'Open', onAction: noop },
  { id: 'rename', label: 'Rename', onAction: noop },
];
const tray = () => document.querySelector<HTMLElement>('[data-hub-tray]');

async function openWith(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

describe('ActionMenu tray', () => {
  it('is a dialog named by its title, holding the menu named the same, with a visible Close', async () => {
    render(<ActionMenu label="Row actions" title="Row actions · atlas-01" items={ITEMS} />);
    await openWith(screen.getByRole('button', { name: 'Row actions' }));
    const dialog = screen.getByRole('dialog', { name: 'Row actions · atlas-01' });
    expect(dialog.closest('[data-hub-tray]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Row actions · atlas-01' })).toBeTruthy();
    const menu = screen.getByRole('menu', { name: 'Row actions · atlas-01' });
    expect(dialog.contains(menu)).toBe(true);
    expect(dialog.contains(screen.getByRole('button', { name: strings.close }))).toBe(true);
  });

  it('takes its title from the label, then falls back to "More actions"', async () => {
    const { unmount } = render(<ActionMenu label="Board menu" items={ITEMS} />);
    await openWith(screen.getByRole('button', { name: 'Board menu' }));
    expect(screen.getByRole('dialog', { name: 'Board menu' })).toBeTruthy();
    unmount();
    render(<ActionMenu items={ITEMS} />);
    await openWith(screen.getByRole('button', { name: strings.more }));
    expect(screen.getByRole('dialog', { name: strings.more })).toBeTruthy();
    expect(screen.getByRole('menu', { name: strings.more })).toBeTruthy();
  });

  it.each(['Close', 'Escape'] as const)('%s closes it and gives focus back to the trigger', async (how) => {
    render(<ActionMenu label="Row actions" items={ITEMS} />);
    const trigger = screen.getByRole('button', { name: 'Row actions' });
    trigger.focus();
    await openWith(trigger);
    expect(tray()).not.toBeNull();
    await act(async () => {
      if (how === 'Close') fireEvent.click(screen.getByRole('button', { name: strings.close }));
      else fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(tray()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('phone="popover" keeps the anchored popover below 600 px', async () => {
    render(<ActionMenu label="Row actions" phone="popover" items={ITEMS} />);
    await openWith(screen.getByRole('button', { name: 'Row actions' }));
    expect(screen.getByRole('menu', { name: 'Row actions' })).toBeTruthy();
    expect(tray()).toBeNull();
    expect(screen.queryByRole('heading'), 'no tray head').toBeNull();
  });

  it('above 600 px the default is the popover', async () => {
    setPhone(false);
    render(<ActionMenu label="Row actions" items={ITEMS} />);
    await openWith(screen.getByRole('button', { name: 'Row actions' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(tray()).toBeNull();
  });

  it('a tray opened while a press is held arms until that press ends; a pointercancel ends it too', async () => {
    for (const end of ['pointerup', 'pointercancel'] as const) {
      const { unmount } = render(<ActionMenu label="Row actions" items={ITEMS} />);
      fireEvent.pointerDown(document.body, { pointerId: 1 });
      await openWith(screen.getByRole('button', { name: 'Row actions' }));
      expect(tray()?.hasAttribute('data-arming'), `armed before ${end}`).toBe(true);
      await act(async () => {
        fireEvent[end === 'pointerup' ? 'pointerUp' : 'pointerCancel'](document.body, { pointerId: 1 });
      });
      expect(tray()?.hasAttribute('data-arming'), `${end} ends it`).toBe(false);
      unmount();
    }
  });

  it('a release the document never saw (made in another window) is forgotten: a later open is not arming', async () => {
    // A tap that ended: the pointer was the last input, and no press of its own is held.
    const tap = (id: number) => {
      fireEvent.pointerDown(document.body, { pointerId: id });
      fireEvent.pointerUp(document.body, { pointerId: id });
    };
    // Blur: the press went to another window.
    fireEvent.pointerDown(document.body, { pointerId: 3 });
    await act(async () => {
      window.dispatchEvent(new Event('blur'));
    });
    tap(9);
    let r = render(<ActionMenu label="Row actions" items={ITEMS} />);
    await openWith(screen.getByRole('button', { name: 'Row actions' }));
    expect(tray()?.hasAttribute('data-arming'), 'after a blur').toBe(false);
    r.unmount();
    // A move with no button held: the press ended out of sight.
    fireEvent.pointerDown(document.body, { pointerId: 4 });
    fireEvent.pointerMove(document.body, { pointerId: 4, buttons: 0 });
    tap(9);
    r = render(<ActionMenu label="Row actions" items={ITEMS} />);
    await openWith(screen.getByRole('button', { name: 'Row actions' }));
    expect(tray()?.hasAttribute('data-arming'), 'after a buttonless move').toBe(false);
    r.unmount();
    // Even with a stale press still counted, a key was the last input: a key open never arms.
    fireEvent.pointerDown(document.body, { pointerId: 5 });
    fireEvent.keyDown(document.body, { key: 'Enter' });
    r = render(<ActionMenu label="Row actions" items={ITEMS} />);
    await openWith(screen.getByRole('button', { name: 'Row actions' }));
    expect(tray()?.hasAttribute('data-arming'), 'a key last').toBe(false);
    r.unmount();
    // And a real held press still arms, ended by the window losing focus too.
    fireEvent.pointerDown(document.body, { pointerId: 6 });
    render(<ActionMenu label="Row actions" items={ITEMS} />);
    await openWith(screen.getByRole('button', { name: 'Row actions' }));
    expect(tray()?.hasAttribute('data-arming'), 'a held press').toBe(true);
    await act(async () => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(tray()?.hasAttribute('data-arming'), 'blur ends it').toBe(false);
  });

  it('an open, arming tray stops arming when a move shows its press ended out of sight', async () => {
    fireEvent.pointerDown(document.body, { pointerId: 8 });
    render(<ActionMenu label="Row actions" items={ITEMS} />);
    await openWith(screen.getByRole('button', { name: 'Row actions' }));
    expect(tray()?.hasAttribute('data-arming'), 'precondition: armed').toBe(true);
    await act(async () => {
      fireEvent.pointerMove(document.body, { pointerId: 8, buttons: 1 });
    });
    expect(tray()?.hasAttribute('data-arming'), 'a drag with the button held keeps it').toBe(true);
    await act(async () => {
      fireEvent.pointerMove(document.body, { pointerId: 8, buttons: 0 });
    });
    expect(tray()?.hasAttribute('data-arming'), 'a buttonless move ends it').toBe(false);
  });

  it('a click, double click or right click on the tray title or scrim does not reach the row it was opened from', async () => {
    const got: string[] = [];
    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- a stand-in DataTable row
      <div onClick={() => got.push('click')} onDoubleClick={() => got.push('dblclick')} onContextMenu={() => got.push('context')} onDragStart={() => got.push('drag')}>
        <ActionMenu label="Row actions" title="Row actions · atlas-01" items={ITEMS} />
      </div>,
    );
    await openWith(screen.getByRole('button', { name: 'Row actions' }));
    got.length = 0;
    const heading = screen.getByRole('heading', { name: 'Row actions · atlas-01' });
    fireEvent.click(heading);
    fireEvent.doubleClick(heading);
    fireEvent.contextMenu(heading);
    fireEvent.dragStart(heading);
    const scrim = tray()?.parentElement as HTMLElement;
    fireEvent.click(scrim);
    expect(got).toEqual([]);
  });

  it('a tray opened with no press held (a key, a tap that ended) is not arming', async () => {
    render(<ActionMenu label="Row actions" items={ITEMS} />);
    await openWith(screen.getByRole('button', { name: 'Row actions' }));
    expect(tray()).not.toBeNull();
    expect(tray()?.hasAttribute('data-arming')).toBe(false);
  });
});
