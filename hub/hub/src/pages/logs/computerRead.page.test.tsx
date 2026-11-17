// Vitest: the Logs page with no computer chosen and a computer list the shell could not read. It
// says the computer list could not be read, never the generic "couldn't reach the server" (an empty page of a longer
// list is unknown although the server answered), and Try again is the shell's read. Only useComputer is replaced:
// renderPage mounts no shell, and the live branch runs only outside fixtures.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent } from '@app/testing';
import type { ShellData } from '@kit';
import type * as DataModule from './data';
import type { ComputerRead } from './data';

const held = vi.hoisted(() => ({ read: null as ComputerRead | null }));
vi.mock('./data', async (orig) => {
  const m = await orig<typeof DataModule>();
  return { ...m, useComputer: () => held.read ?? m.useComputer() };
});
const { liveComputer } = await import('./data');
const { default: page } = await import('./page');

const shell = (o: Partial<ShellData>): ShellData => ({ realms: [], realmId: 'r1', computers: [], ...o });
afterEach(() => { held.read = null; });

describe('Logs page: a computer list the shell could not read', () => {
  it('says the computer list could not be read, with Try again (the shell\'s read)', async () => {
    const retryComputers = vi.fn();
    held.read = liveComputer(null, shell({ computersRead: 'unknown', retryComputers }));
    await renderPage(page);
    expect(await screen.findByText('The computer list could not be read.')).toBeInTheDocument();
    expect(screen.queryByText(/couldn't reach the server/)).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(retryComputers).toHaveBeenCalledTimes(1);
  });

  it('while the list loads: the page waits, never "pick a computer"', async () => {
    held.read = liveComputer(null, shell({ computersRead: 'loading' }));
    await renderPage(page);
    expect(screen.queryByText('Pick a computer to see its logs.')).toBeNull();
    expect(screen.queryByText('The computer list could not be read.')).toBeNull();
  });
});
