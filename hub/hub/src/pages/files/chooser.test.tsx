// Vitest: the Files reads as the kit FileChooser takes them (chooser.ts), on real core over the Files fixtures. The
// computers offered are the shown realm's only (a computer of another realm is not among them, so it can be neither
// opened nor chosen); a computer that is not running is listed with the reason and cannot be opened; a folder is read
// from the computer chosen, and the choice names that computer and the absolute path.
import { describe, expect, it, vi } from 'vitest';
import { FileChooser, type ChooserResult } from '@kit';
import { act, fireEvent, renderPage, screen, waitFor, within } from '@app/testing';
import { chooserAbs, chooserDir, useFileChooserHost } from './chooser';
import page from './page';
import strings from './chooser.strings.en.json';

const chosen = vi.fn<(picked: readonly ChooserResult[]) => void>();
function Harness() {
  const host = useFileChooserHost();
  return (
    <FileChooser
      isOpen
      overlayId="chooser-test"
      mode="file"
      rootLabel="/"
      start="home/ada/"
      current="c0a7150000000000000000a1"
      reads={host.reads}
      computers={host.computers}
      computersStatus={host.computersStatus}
      places={() => host.places}
      onClose={() => undefined}
      onChoose={chosen}
    />
  );
}
const harnessPage = { ...page, load: () => Promise.resolve({ default: Harness }) };
const WAIT = { timeout: 8000 };
const open = async (realm?: string) => {
  chosen.mockClear();
  await renderPage(harnessPage, { path: '/files', ...(realm ? { realm } : {}) });
  return screen.findByRole('dialog', { name: /^Choose a file( on |$)/ }, WAIT);
};
const rowOf = (d: HTMLElement, name: string) => waitFor(() => {
  const o = within(within(d).getByRole('listbox', { name: 'In this folder' })).getAllByRole('option').find((x) => x.getAttribute('data-key') === name);
  if (!o) throw new Error(`no row ${name}`);
  return o;
}, WAIT);
const press = (el: HTMLElement) => act(async () => { fireEvent.click(el); });
const computerPanel = async (d: HTMLElement) => {
  await press(within(d).getByRole('button', { name: /Computer$/ }));
  return waitFor(() => screen.getByRole('dialog', { name: 'Computer' }), WAIT);
};

describe('the Files reads behind the file chooser', () => {
  it('maps paths both ways', () => {
    expect(chooserAbs('')).toBe('/');
    expect(chooserAbs('home/ada/')).toBe('/home/ada');
    expect(chooserAbs('home/ada/notes.txt')).toBe('/home/ada/notes.txt');
    expect(chooserDir('/home/ada')).toBe('home/ada/');
    expect(chooserDir('/')).toBe('');
  });

  it('lists a folder of the chosen computer with sizes, and hands back the computer and the absolute path', async () => {
    const d = await open();
    const notes = await rowOf(d, 'notes.txt');
    expect(notes.getAttribute('aria-label')).toMatch(/notes\.txt.*1\.2 KB/u);
    expect((await rowOf(d, 'projects')).getAttribute('aria-label')).toContain('projects, folder');
    await press(notes);
    await press(within(d).getByRole('button', { name: 'Choose' }));
    expect(chosen).toHaveBeenCalledTimes(1);
    expect(chosen.mock.calls[0]![0]).toEqual([expect.objectContaining({
      computer: { id: 'c0a7150000000000000000a1', name: 'atlas' }, path: 'home/ada/notes.txt', fullPath: '/home/ada/notes.txt', name: 'notes.txt', kind: 'file', size: 1204,
    })]);
  });

  it('offers the shown realm\'s computers only: one of another realm is not listed, so it can be neither opened nor chosen', async () => {
    const d = await open();
    const panel = await computerPanel(d);
    await waitFor(() => expect(within(panel).getByText('cedar')).toBeTruthy(), WAIT);
    expect(within(panel).getByText('atlas')).toBeTruthy();
    // borealis and granite are computers of the Acme client realm; harbor of Lab.
    for (const other of ['borealis', 'granite', 'harbor', 'ember', 'dune']) expect(within(panel).queryByText(other)).toBeNull();
  });

  it('lists a stopped computer with the reason; pressing it opens nothing', async () => {
    const d = await open();
    await rowOf(d, 'notes.txt');
    const panel = await computerPanel(d);
    await waitFor(() => expect(within(panel).getAllByText(strings['chooser.off.stopped']).length).toBeGreaterThan(0), WAIT);
    await press(within(panel).getByText('cedar'));
    // Still atlas, still its folder.
    expect(within(d).getByRole('button', { name: /atlas.*Computer$/u })).toBeTruthy();
    expect(await rowOf(d, 'notes.txt')).toBeTruthy();
  });

  it('in another realm the list is that realm\'s: its running computer opens, the first realm\'s are gone', async () => {
    const d = await open('f2f2f2f2f2f2f2f2f2f2f2f2');
    const panel = await computerPanel(d);
    await waitFor(() => expect(within(panel).getByText('borealis')).toBeTruthy(), WAIT);
    expect(within(panel).queryByText('atlas')).toBeNull();
    expect(within(panel).queryByText('cedar')).toBeNull();
  });
});
