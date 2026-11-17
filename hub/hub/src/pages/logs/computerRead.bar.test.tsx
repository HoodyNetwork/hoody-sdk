// Vitest: the Logs page with a chosen computer while the shell does not know its computer list. The toolbar's computer
// control is the kit ComputerPicker, and it carries the list's state itself: loading
// on a disabled trigger, could not be read on the trigger with the shell's Try again in its panel; no loose text in
// the toolbar row and no separate line. useComputer and useShellData are replaced: renderPage mounts no shell.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import type * as KitModule from '@kit';
import type { ShellData } from '@kit';
import type * as DataModule from './data';
import type { ComputerRead } from './data';

const held = vi.hoisted(() => ({ read: null as ComputerRead | null, shell: null as ShellData | null }));
vi.mock('./data', async (orig) => {
  const m = await orig<typeof DataModule>();
  return { ...m, useComputer: () => held.read ?? m.useComputer() };
});
vi.mock('@kit', async (orig) => {
  const m = await orig<typeof KitModule>();
  return { ...m, useShellData: () => held.shell ?? m.useShellData() };
});
const { liveComputer } = await import('./data');
const { default: page } = await import('./page');

const target = { project: { id: 'p1' }, container: { id: 'c0000000000000000000a001' } };
const shell = (o: Partial<ShellData>): ShellData => ({ realms: [], realmId: 'r1', computers: [], setComputer: () => {}, ...o });
afterEach(() => { held.read = null; held.shell = null; });

async function pickerInToolbar(text: string): Promise<HTMLElement> {
  const bar = await screen.findByRole('group', { name: 'Logs' });
  expect(bar).toBeTruthy();
  const trigger = within(bar).getByRole('button', { name: /^.+ Computer$/ });
  expect(trigger).toHaveTextContent(text);
  // The words are the picker's own: nothing outside it says them.
  expect(screen.getAllByText(text, { exact: false }).every((x) => trigger.contains(x))).toBe(true);
  return trigger;
}

describe('Logs page: the toolbar while the computer list is not known', () => {
  it('could not be read: the picker\'s trigger says so, and Try again in its panel is the shell\'s read', async () => {
    const retryComputers = vi.fn();
    held.shell = shell({ computersRead: 'unknown', retryComputers });
    held.read = liveComputer(target, held.shell);
    await renderPage(page);
    const trigger = await pickerInToolbar('The computer list could not be read');
    await userEvent.setup().click(trigger);
    const list = await screen.findByRole('dialog', { name: 'Computer' });
    await userEvent.setup().click(within(list).getByRole('button', { name: 'Try again' }));
    expect(retryComputers).toHaveBeenCalledTimes(1);
  });

  it('loading: the picker\'s trigger says so and is disabled', async () => {
    held.shell = shell({ computersRead: 'loading' });
    held.read = liveComputer(target, held.shell);
    await renderPage(page);
    expect(await pickerInToolbar('Loading computers…')).toBeDisabled();
  });
});
