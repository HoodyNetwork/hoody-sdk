// Disconnect: a disconnect that may have gone through stays named when its computer stops
// since (the page shows "computer stopped", with no list and nothing read): no Check again, since nothing can be read.
// The shell's computer list says whether the computer runs; here it is the only thing replaced.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Kit from '@kit';
import { reloadChangesForTests, resetChanges } from '@core/changes';
import { fixtureWorld } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetDisconnectForTests } from './disconnect';
import page from './page';
import strings from './strings.en.json';

const shell = vi.hoisted(() => ({ running: true }));
vi.mock('@kit', async (importOriginal) => {
  const kit = await importOriginal<typeof Kit>();
  const { fixtureWorld: world } = await import('@core');
  const atlas = world.computers.find((x) => x.name === 'atlas');
  const useShellData: typeof kit.useShellData = () => {
    const d = kit.useShellData();
    return atlas ? { ...d, computers: [{ id: atlas.id, name: atlas.name, running: shell.running }] } : d;
  };
  return { ...kit, useShellData };
});

const GROUP1 = 'Session 4f2a9c… · from 203.0.113.x · 3 streams of 1024';

beforeEach(() => {
  // eslint-disable-next-line no-restricted-globals -- each test starts with no held change kept by an earlier one
  localStorage.removeItem('hub.v3.changes');
  resetChanges();
  resetDisconnectForTests();
  shell.running = true;
});

describe('tunnels disconnect: the computer stopped since', () => {
  it('its held disconnect is still named, without Check again', async () => {
    expect(fixtureWorld.computers.some((x) => x.name === 'atlas')).toBe(true);
    const first = await renderPage(page, { state: 'disconnect-lost-listed' });
    const tb = await screen.findByRole('table', { name: strings.title });
    await waitFor(() => expect(within(tb).getByText(GROUP1)).toBeInTheDocument());
    const row = () => within(tb).getByText(GROUP1).closest('tr') as HTMLElement;
    const s1 = within(tb).getByText('127.0.0.1:5432').closest('tr') as HTMLElement;
    await userEvent.click(within(s1).getByRole('button', { name: /actions|more/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['disc.menu']}`) }));
    const dlg = await screen.findByRole('alertdialog', { name: strings['disc.title'] });
    await userEvent.click(within(dlg).getByRole('button', { name: strings['disc.action'] }));
    expect(await within(row()).findByText(strings['disc.pending'])).toBeInTheDocument();
    first.unmount();
    resetDisconnectForTests();
    reloadChangesForTests();
    shell.running = false;
    await renderPage(page, { state: 'disconnect-lost-listed' });
    const note = await screen.findByText(/A disconnect of session 4f2a9c… may have gone through/);
    expect(screen.queryByRole('button', { name: strings['disc.check'] })).toBeNull();
    // Above the stopped state, never inside its text (a paragraph holds no blocks).
    expect(note.closest('p')).toBeNull();
    expect(screen.getByRole('heading', { name: 'atlas is stopped' })).toBeInTheDocument();
    expect(document.querySelector('p [role="status"], p div')).toBeNull();
  });
});
