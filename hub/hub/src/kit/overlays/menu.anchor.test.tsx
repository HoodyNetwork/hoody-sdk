// Vitest: ActionMenu `anchor` places the popover against another element (a tab whose menu it is),
// and `trigger={null}` gives the menu no trigger of its own: it opens only through `isOpen`, draws no button anyone can
// see, reach or press, and still has its name. Without either prop the menu is as before (its trigger is its anchor).
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { ActionMenu, type MenuEntry } from './Overlays';

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});
afterEach(() => vi.restoreAllMocks());

const ROWS = (act1: () => void): MenuEntry[] => [
  { id: 'one', label: 'Rename', onAction: act1 },
  { id: 'two', label: 'Duplicate', onAction: () => undefined },
];
const BOX = { x: 300, y: 200, left: 300, top: 200, right: 340, bottom: 220, width: 40, height: 20, toJSON: () => ({}) } as DOMRect;

function Anchored({ trigger, onAction = () => undefined, onOpen }: { trigger?: null; onAction?: () => void; onOpen?: (o: boolean) => void }) {
  const at = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <span ref={at} data-testid="at">
        thing
      </span>
      <button type="button" onClick={() => setOpen(true)}>
        open it
      </button>
      <ActionMenu
        label="Thing actions"
        items={ROWS(onAction)}
        anchor={at}
        placement="bottom start"
        isOpen={open}
        onOpenChange={(o) => {
          setOpen(o);
          onOpen?.(o);
        }}
        {...(trigger === null ? { trigger: null } : {})}
      />
    </div>
  );
}

describe('ActionMenu: anchor and no trigger of its own', () => {
  it('trigger={null}: no button anyone can see or reach, and no React Aria warning', async () => {
    const warn = vi.spyOn(console, 'warn');
    const error = vi.spyOn(console, 'error');
    render(<Anchored trigger={null} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Thing actions' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'open it' }));
    await screen.findByRole('menu');
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('opened through isOpen, the menu keeps its name and its rows act and close it', async () => {
    const onAction = vi.fn();
    const onOpen = vi.fn();
    render(<Anchored trigger={null} onAction={onAction} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'open it' }));
    const menu = await screen.findByRole('menu', { name: 'Thing actions' });
    await userEvent.click(within(menu, 'Rename'));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('Escape closes it', async () => {
    const onOpen = vi.fn();
    render(<Anchored trigger={null} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'open it' }));
    await screen.findByRole('menu');
    await userEvent.keyboard('{Escape}');
    expect(onOpen).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('the popover is placed against the anchor, not the trigger', async () => {
    const real = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.dataset.testid === 'at' ? BOX : real.call(this);
    });
    render(<Anchored trigger={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'open it' }));
    const menu = await screen.findByRole('menu');
    const pop = menu.closest<HTMLElement>('[data-trigger="MenuTrigger"]') ?? menu.parentElement?.closest<HTMLElement>('[style]');
    await waitFor(() => expect(parseFloat(pop?.style.top ?? '0')).toBeGreaterThanOrEqual(BOX.bottom));
  });

  it('without anchor or trigger={null} the dots trigger is drawn and opens the menu, as before', async () => {
    render(<ActionMenu label="Row actions" items={ROWS(() => undefined)} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Row actions' }));
    });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(document.querySelector('[data-menu-anchored]')).toBeNull();
  });
});

function within(menu: HTMLElement, name: string) {
  const row = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((r) => r.textContent?.includes(name));
  if (!row) throw new Error(`no row ${name}`);
  return row;
}
