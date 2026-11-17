// Vitest: "Work in a folder" offers the agent's home by its path, and a pick belongs to the computer and realm it
// was made on: a switch while the dialog is open starts it over, so one computer's folder never opens on another.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, userEvent } from '@app/testing';
import type { FoldersRead } from './data';
import { FolderDialog } from './Options';
import strings from './NewChat.strings.en.json';
import type * as LinksModule from '../../files/links';

// The folder field's reads go through the Files page's folder read; these fixtures read no computer.
vi.mock('../../files/links', async (orig) => ({
  ...(await orig<typeof LinksModule>()),
  useFolder: vi.fn(() => ({ data: undefined, dataUpdatedAt: 0, isPending: false, isError: false, isFetching: false, fetchStatus: 'idle', refetch: () => Promise.resolve({ isSuccess: false }) })),
}));

afterEach(cleanup);

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const read = (home: string | null): FoldersRead => ({ folders: ['/srv/data'], state: 'ok', retry: null, home });
const opened: string[] = [];
const dialog = (handle: string, home: string | null) => (
  <FolderDialog isOpen onOpenChange={() => {}} computer={handle} handle={handle} realm={R1} realmName="Work" folders={read(home)} onOpen={(h) => opened.push(h)} />
);
const homeName = (p: string) => strings['folder.homeAt'].replace('{{path}}', p);

describe('Work in a folder: the home folder and a computer switch', () => {
  it('offers the reported home by its path and opens its folder page', async () => {
    opened.length = 0;
    render(dialog('atlas', '/home/ada'));
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: homeName('/home/ada') }));
    await userEvent.click(screen.getByRole('button', { name: strings['pickFolder.open'] }));
    expect(opened).toHaveLength(1);
    expect(opened[0]).toContain('computer=atlas');
  });

  it('a switch to another computer while open drops the pick: nothing of the first opens on the second', async () => {
    opened.length = 0;
    const r = render(dialog('atlas', '/home/ada'));
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: homeName('/home/ada') }));
    r.rerender(dialog('bolt', null));
    expect(screen.getByRole('button', { name: strings['pickFolder.open'] })).toBeDisabled();
    expect(screen.queryByText(homeName('/home/ada'))).toBeNull();
    expect(opened).toEqual([]);
  });

  it('switching away and back does not bring the pick back, even when the first computer\'s home is now unknown', async () => {
    opened.length = 0;
    const r = render(dialog('atlas', '/home/ada'));
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: homeName('/home/ada') }));
    r.rerender(dialog('bolt', null));
    r.rerender(dialog('atlas', null));
    expect(screen.getByRole('button', { name: strings['pickFolder.open'] })).toBeDisabled();
    expect(screen.queryByText(/\/home\/ada/)).toBeNull();
    expect(opened).toEqual([]);
  });
});
