// The computer menu has a way back to no computer ("All computers"): pages that list across
// computers show them all, and a page that needs one asks for a pick in place ("Pick a computer" opens this menu).
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-aria-components';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { chromeHidden, useChromeHidden } from './chrome';
import { ComputerRequired } from './ComputerRequired';
import { ShellDataProvider, type ShellData } from './context';
import { PagesProvider } from './pageLinks';
import { ComputerSwitcher, PhoneContext } from './Switchers';

vi.mock('@core', () => ({ useCan: () => true }));

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const C1 = '6a00000000000000000000a1';
const C2 = '6a00000000000000000000a2';
const computers = [
  { id: C1, name: 'alpha', running: true },
  { id: C2, name: 'beta', running: false },
];
const navigate = vi.fn();

function mount(node: ReactNode, data: Partial<ShellData> = {}, pages: PageManifest[] = [pg('computers')]) {
  const setComputer = vi.fn();
  const clearComputer = vi.fn();
  render(
    <RouterProvider navigate={navigate}>
      <PagesProvider pages={pages}>
        <ShellDataProvider value={{ realms: [{ id: 'all', name: 'All realms' }], realmId: 'all', computers, setComputer, clearComputer, ...data } as ShellData}>
          {node}
        </ShellDataProvider>
      </PagesProvider>
    </RouterProvider>,
  );
  return { setComputer, clearComputer };
}
const press = async (el: Element) => act(async () => { fireEvent.click(el); });
const openMenu = async () => press(screen.getByRole('button', { name: / Computer$/ }));
const rows = () => Array.from(document.querySelectorAll('[role="menu"] [role^="menuitem"]'));

afterEach(() => {
  navigate.mockReset();
});

describe('computer menu: All computers', () => {
  it('"All computers" comes first and is the one checked while no computer is shown; the trigger says so', async () => {
    mount(<ComputerSwitcher />, { computerId: undefined });
    expect(screen.getByRole('button', { name: / Computer$/ })).toHaveTextContent('All computers');
    await openMenu();
    expect(rows().map((r) => r.textContent)).toEqual(['All computers', 'alpha', 'beta', 'Get a computer']);
    expect(screen.getByRole('menuitemradio', { name: 'All computers' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'alpha' })).toHaveAttribute('aria-checked', 'false');
  });

  it('picking it shows no computer (and picks none); picking a computer still picks it', async () => {
    const { setComputer, clearComputer } = mount(<ComputerSwitcher />, { computerId: C2 });
    await openMenu();
    expect(screen.getByRole('menuitemradio', { name: 'beta' })).toHaveAttribute('aria-checked', 'true');
    await press(screen.getByRole('menuitemradio', { name: 'All computers' }));
    expect(clearComputer).toHaveBeenCalledTimes(1);
    expect(setComputer).not.toHaveBeenCalled();
    await openMenu();
    await press(screen.getByRole('menuitemradio', { name: 'alpha' }));
    expect(setComputer).toHaveBeenCalledWith(C1);
    expect(clearComputer).toHaveBeenCalledTimes(1);
  });

  it('opening it lands on the computer shown (not the first row); Get a computer stays a plain item', async () => {
    const user = userEvent.setup();
    mount(<ComputerSwitcher />, { computerId: C2 });
    screen.getByRole('button', { name: / Computer$/ }).focus();
    await user.keyboard('{Enter}');
    const beta = screen.getByRole('menuitemradio', { name: 'beta' });
    await waitFor(() => expect(beta).toHaveAttribute('tabindex', '0'));
    expect(screen.getByRole('menuitemradio', { name: 'All computers' })).toHaveAttribute('tabindex', '-1');
    const get = screen.getByRole('menuitem', { name: 'Get a computer' });
    expect(get).not.toHaveAttribute('aria-checked');
    await press(get);
    expect(navigate).toHaveBeenCalledWith('/computers?get=1', undefined);
  });

  it('with no computers there is nothing to show all of: no "All computers", the trigger says none yet', async () => {
    mount(<ComputerSwitcher />, { computers: [], computerId: undefined });
    expect(screen.getByRole('button', { name: / Computer$/ })).toHaveTextContent('No computers yet');
    await openMenu();
    expect(rows().map((r) => r.textContent)).toEqual(['Get a computer']);
  });

  it('a shown computer missing from the list (another realm, deleted) is not "All computers": nothing is checked', async () => {
    mount(<ComputerSwitcher />, { computerId: '6a00000000000000000000ff' });
    expect(screen.getByRole('button', { name: / Computer$/ })).toHaveTextContent('Computer not listed');
    await openMenu();
    expect(screen.getByRole('menuitemradio', { name: 'All computers' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('menuitemradio', { name: 'alpha' })).toHaveAttribute('aria-checked', 'false');
  });

  it('on the phone sheet too: All is current only while no computer is shown', async () => {
    mount(<PhoneContext />, { computerId: undefined });
    await press(screen.getByRole('button', { name: / Realm and computer$/ }));
    expect(screen.getByRole('button', { name: 'All computers' })).toHaveAttribute('aria-current', 'true');
  });

  it('on the phone sheet a computer missing from the list does not make All current', async () => {
    mount(<PhoneContext />, { computerId: '6a00000000000000000000ff' });
    await press(screen.getByRole('button', { name: / Realm and computer$/ }));
    expect(screen.getByRole('button', { name: 'All computers' })).not.toHaveAttribute('aria-current');
  });

  it('the phone sheet starts its computer list with "All computers", current while none is shown', async () => {
    const { clearComputer, setComputer } = mount(<PhoneContext />, { computerId: C1 });
    await press(screen.getByRole('button', { name: / Realm and computer$/ }));
    const all = screen.getByRole('button', { name: 'All computers' });
    expect(all).not.toHaveAttribute('aria-current');
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: /alpha/ })).toHaveAttribute('aria-current', 'true');
    await press(all);
    expect(clearComputer).toHaveBeenCalledTimes(1);
    expect(setComputer).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Realm and computer' })).toBeNull();
  });
});

describe('a page that needs a computer, with none shown', () => {
  it('offers "Pick a computer", which opens the computer menu', async () => {
    mount(
      <>
        <ComputerSwitcher />
        <ComputerRequired state="none" header={{ title: 'Programs' }} />
      </>,
      { computerId: undefined },
    );
    expect(screen.queryByRole('menu')).toBeNull();
    await press(screen.getByRole('button', { name: 'Pick a computer' }));
    expect(screen.getByRole('menu', { name: 'Computer' })).toBeInTheDocument();
  });

  it('in focus mode, "Pick a computer" brings the chrome back and opens the menu', async () => {
    const restored = vi.fn();
    function Focus() {
      useChromeHidden(true, restored);
      return null;
    }
    mount(
      <>
        <Focus />
        <ComputerSwitcher />
        <ComputerRequired state="none" header={{ title: 'Programs' }} />
      </>,
      { computerId: undefined },
    );
    expect(chromeHidden()).toBe(true);
    await press(screen.getByRole('button', { name: 'Pick a computer' }));
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });
    expect(restored).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('menu', { name: 'Computer' })).toBeInTheDocument();
  });

  it('on a phone (the top bar trigger not shown), "Pick a computer" opens the realm and computer sheet', async () => {
    mount(
      <>
        <ComputerSwitcher />
        <PhoneContext />
        <ComputerRequired state="none" header={{ title: 'Programs' }} />
      </>,
      { computerId: undefined },
    );
    (document.querySelector('[data-hub-switch="computer"]') as HTMLElement).style.display = 'none';
    await press(screen.getByRole('button', { name: 'Pick a computer' }));
    expect(screen.getByRole('dialog', { name: 'Realm and computer' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('a second switcher leaving does not take the first one\'s opener with it', async () => {
    function Two() {
      const [second, setSecond] = useState(true);
      return (
        <>
          <ComputerSwitcher />
          {second && <ComputerSwitcher />}
          <button type="button" onClick={() => setSecond(false)}>
            drop second
          </button>
          <ComputerRequired state="none" header={{ title: 'Programs' }} />
        </>
      );
    }
    mount(<Two />, { computerId: undefined });
    await press(screen.getByRole('button', { name: 'drop second' }));
    await press(screen.getByRole('button', { name: 'Pick a computer' }));
    expect(screen.getByRole('menu', { name: 'Computer' })).toBeInTheDocument();
  });

  it('the first switcher leaving leaves the second one\'s opener in place', async () => {
    function Two() {
      const [first, setFirst] = useState(true);
      return (
        <>
          {first && <ComputerSwitcher />}
          <ComputerSwitcher />
          <button type="button" onClick={() => setFirst(false)}>
            drop first
          </button>
          <ComputerRequired state="none" header={{ title: 'Programs' }} />
        </>
      );
    }
    mount(<Two />, { computerId: undefined });
    await press(screen.getByRole('button', { name: 'drop first' }));
    await press(screen.getByRole('button', { name: 'Pick a computer' }));
    expect(screen.getByRole('menu', { name: 'Computer' })).toBeInTheDocument();
  });

  it('a pick asked in focus mode is dropped if its switcher goes before the chrome is back', async () => {
    function Swap() {
      useChromeHidden(true);
      const [k, setK] = useState(0);
      return (
        <>
          <ComputerSwitcher key={k} />
          <button type="button" onClick={() => setK(1)}>
            swap switcher
          </button>
          <ComputerRequired state="none" header={{ title: 'Programs' }} />
        </>
      );
    }
    mount(<Swap />, { computerId: undefined });
    // Hold the frames, so the swap lands before the queued open runs.
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
    const caf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames[id - 1] = () => undefined;
    });
    try {
      await press(screen.getByRole('button', { name: 'Pick a computer' }));
      expect(frames).toHaveLength(1);
      await press(screen.getByRole('button', { name: 'swap switcher' }));
      await act(async () => {
        for (const f of frames) f(0);
      });
    } finally {
      raf.mockRestore();
      caf.mockRestore();
    }
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('with no computer switcher on screen (a page rendered without the shell) it offers no pick', () => {
    mount(<ComputerRequired state="none" header={{ title: 'Programs' }} />, { computerId: undefined });
    expect(screen.queryByRole('button', { name: 'Pick a computer' })).toBeNull();
  });

  it('a page that passes action={null} gets no pick', () => {
    mount(
      <>
        <ComputerSwitcher />
        <ComputerRequired state="none" header={{ title: 'Logs' }} action={null} />
      </>,
      { computerId: undefined },
    );
    expect(screen.queryByRole('button', { name: 'Pick a computer' })).toBeNull();
  });

  it('with no computer to pick it offers no pick (its own action, if any, stands)', () => {
    // The switcher still shows (Get a computer), so only the empty list keeps the pick away.
    mount(
      <>
        <ComputerSwitcher />
        <ComputerRequired state="none" header={{ title: 'Programs' }} />
      </>,
      { computers: [], computerId: undefined },
    );
    expect(screen.queryByRole('button', { name: 'Pick a computer' })).toBeNull();
  });

  it('a page\'s own action replaces the pick', () => {
    mount(<ComputerRequired state="none" header={{ title: 'Logs' }} action={<button type="button">Open logs help</button>} />, { computerId: undefined });
    expect(screen.queryByRole('button', { name: 'Pick a computer' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open logs help' })).toBeInTheDocument();
  });
});
