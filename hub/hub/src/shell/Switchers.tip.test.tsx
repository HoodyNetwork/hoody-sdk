// The top bar's computer trigger tells the shown computer's facts on hover or keyboard
// focus: its name, its realm when one realm is shown, where it runs, and whether it runs. No tooltip while no listed
// computer is shown, and the trigger still opens its menu. Keyboard focus only here; hover is shown in the browser shots.
// The same facts are the trigger's accessible description, and the trigger stays the same element (keeping focus)
// while the shown computer leaves or joins the list.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-aria-components';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider, type ShellData } from './context';
import { PagesProvider } from './pageLinks';
import { ComputerSwitcher } from './Switchers';

// A token session has no account capability, so no Get a computer link: a known-empty list then hides the switcher.
const cap = vi.hoisted(() => ({ account: true }));
vi.mock('@core', () => ({ useCan: () => cap.account }));

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const ONE = '6a00000000000000000000a1';
const TWO = '6a00000000000000000000b2';
const REALM = '6b00000000000000000000c3';
const boxes = [
  { id: ONE, name: 'box-one', running: true, flag: '🇸🇬', location: 'Singapore · sg-2' },
  { id: TWO, name: 'box-two', running: false, flag: '', location: '' },
];

const tree = (data: Partial<ShellData>): ReactElement => (
  <RouterProvider navigate={() => undefined}>
    <PagesProvider pages={[pg('computers')]}>
      <ShellDataProvider value={{ realms: [{ id: REALM, name: 'Lab' }], realmId: REALM, computers: boxes, computerId: ONE, ...data }}>
        <ComputerSwitcher />
      </ShellDataProvider>
    </PagesProvider>
  </RouterProvider>
);

function mount(data: Partial<ShellData> = {}) {
  return render(tree(data));
}

const tip = () => document.querySelector('[data-hub-computer-tip]');
// The kit tooltip stacks the facts one per line in one block.
const lines = () => Array.from(tip()?.querySelector(':scope > span')?.children ?? []).map((el) => el.textContent);
const focusTrigger = async () => {
  await userEvent.setup().tab();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: / Computer$/ }));
};

describe('computer trigger tooltip', () => {
  it('keyboard focus: name, realm, place, running', async () => {
    mount();
    await focusTrigger();
    await waitFor(() => expect(tip()).not.toBeNull());
    expect(lines()).toEqual(['box-one', 'Lab', '🇸🇬 Singapore · sg-2', 'Running']);
    expect(screen.getByRole('tooltip')).toHaveTextContent('box-one');
  });

  it('All realms: no realm line; a computer with no place and not running says so', async () => {
    mount({ realmId: 'all', computerId: TWO });
    await focusTrigger();
    await waitFor(() => expect(tip()).not.toBeNull());
    expect(lines()).toEqual(['box-two', 'Not running']);
  });

  it('no computer shown (All computers): no tooltip', async () => {
    mount({ computerId: undefined });
    await focusTrigger();
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(tip()).toBeNull();
  });

  it('screen readers get the same facts as the trigger description, less the name it already says, tooltip open or not (:912)', async () => {
    mount();
    const button = screen.getByRole('button', { name: 'box-one Computer' });
    expect(button).toHaveAccessibleDescription('Lab, 🇸🇬 Singapore · sg-2, Running');
    await focusTrigger();
    await waitFor(() => expect(tip()).not.toBeNull());
    expect(button).toHaveAccessibleDescription('Lab, 🇸🇬 Singapore · sg-2, Running');
  });

  it('no listed computer shown: the trigger text is in its name, so nothing describes it (:912)', () => {
    mount({ computerId: undefined });
    const button = screen.getByRole('button', { name: 'All computers Computer' });
    expect(button).not.toHaveAttribute('aria-describedby');
  });

  it('the focused trigger stays the same element while the shown computer leaves and rejoins the list', async () => {
    const { rerender } = mount({ computers: [], computersRead: 'loading', retryComputers: () => undefined });
    await focusTrigger();
    const button = document.activeElement;
    rerender(tree({}));
    expect(screen.getByRole('button', { name: / Computer$/ })).toBe(button);
    expect(document.activeElement).toBe(button);
    rerender(tree({ computers: [boxes[1]!] }));
    expect(screen.getByRole('button', { name: / Computer$/ })).toBe(button);
    expect(document.activeElement).toBe(button);
  });

  // A tip open from the keyboard when the shown computer leaves the list is closed; once focus has moved
  // away, the computer's return does not bring it back unfocused and unhovered.
  it('a tip open when the shown computer leaves the list does not come back after focus moved away', async () => {
    const { rerender } = render(<>{tree({})}<button type="button">elsewhere</button></>);
    await focusTrigger();
    await waitFor(() => expect(tip()).not.toBeNull());
    rerender(<>{tree({ computers: [boxes[1]!] })}<button type="button">elsewhere</button></>);
    await waitFor(() => expect(tip()).toBeNull());
    act(() => { screen.getByRole('button', { name: 'elsewhere' }).focus(); });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'elsewhere' }));
    rerender(<>{tree({})}<button type="button">elsewhere</button></>);
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(tip()).toBeNull();
  });
  // With no Get a computer link, a known-empty list hides the whole switcher; the tip held open
  // then must not come back, unfocused, when the computer returns.
  it('a tip open when a known-empty list hides the switcher does not come back after focus moved away', async () => {
    cap.account = false;
    onTestFinished(() => { cap.account = true; });
    const { rerender } = render(<>{tree({})}<button type="button">elsewhere</button></>);
    await focusTrigger();
    await waitFor(() => expect(tip()).not.toBeNull());
    rerender(<>{tree({ computers: [] })}<button type="button">elsewhere</button></>);
    expect(screen.queryByRole('button', { name: / Computer$/ })).toBeNull();
    await waitFor(() => expect(tip()).toBeNull());
    act(() => { screen.getByRole('button', { name: 'elsewhere' }).focus(); });
    rerender(<>{tree({})}<button type="button">elsewhere</button></>);
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(tip()).toBeNull();
  });
  it('the tip still opens again on the next keyboard focus after the computer came back', async () => {
    const { rerender } = render(<>{tree({})}<button type="button">elsewhere</button></>);
    await focusTrigger();
    await waitFor(() => expect(tip()).not.toBeNull());
    rerender(<>{tree({ computers: [boxes[1]!] })}<button type="button">elsewhere</button></>);
    await waitFor(() => expect(tip()).toBeNull());
    rerender(<>{tree({})}<button type="button">elsewhere</button></>);
    act(() => { screen.getByRole('button', { name: 'elsewhere' }).focus(); });
    await userEvent.setup().tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: / Computer$/ }));
    await waitFor(() => expect(tip()).not.toBeNull());
  });

  it('opening the menu from the keyboard closes an open tooltip', async () => {
    mount();
    await focusTrigger();
    await waitFor(() => expect(tip()).not.toBeNull());
    await userEvent.setup().keyboard('{Enter}');
    expect(screen.getByRole('menu', { name: 'Computer' })).toBeInTheDocument();
    await waitFor(() => expect(tip()).toBeNull());
  });

  it('the trigger still opens the computer menu', async () => {
    mount();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: / Computer$/ })); });
    expect(screen.getByRole('menu', { name: 'Computer' })).toBeInTheDocument();
  });
});
