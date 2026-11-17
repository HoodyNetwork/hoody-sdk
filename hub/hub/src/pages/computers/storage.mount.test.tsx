// Storage tab mount: the computer detail carries a Storage tab right after Backups, opened from the URL
// like every tab, holding the storage feature (pages/files/storage) on the page's fixture answers. A session that can
// change the computer gets "Add storage"; a limited session sees the read-only note, and Add storage stays in place, off
// with that reason.
import { afterEach, describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import { computers } from './fixtures';
import { handleOf } from './logic';
import page from './page';
import strings from './strings.en.json';
import { storageStrings as storage } from '../files/links';

// The Files page's words for the section (its links file hands over the section, not its strings).
const shares = { title: 'Shared folders', givenEmpty: 'No shared folders', receivedEmpty: 'Nothing shared with it', scope: 'Show shares of', share: 'Share a folder' };

const running = () => computers.find((x) => x.status === 'running') ?? computers[0];

describe('computers: the Storage tab', () => {
  it('sits right after Backups and opens from the URL with the storage lists', async () => {
    const c = running();
    await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c!))}&tab=storage` });
    expect(await screen.findByRole('tab', { name: strings['tab.storage'], selected: true }, { timeout: 8000 })).toBeInTheDocument();
    const names = screen.getAllByRole('tab').map((x) => x.textContent);
    expect(names.indexOf(strings['tab.storage'])).toBe(names.indexOf(strings['tab.backups']) + 1);
    expect(await screen.findByText(storage['backends.empty'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: storage.add })).toBeInTheDocument();
    expect(screen.queryByText(storage.noWrite)).toBeNull();
  }, 40000);

  it('a session that cannot change the computer gets the read-only note and Add storage off', async () => {
    const c = running();
    await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c!))}&tab=storage`, state: 'limited' });
    expect(await screen.findByRole('tab', { name: strings['tab.storage'], selected: true }, { timeout: 8000 })).toBeInTheDocument();
    // The note shows in the tab, and Add storage, off, carries the same words as its reason (its own description).
    const notes = await screen.findAllByText(storage.noWrite, undefined, { timeout: 8000 });
    const add = screen.getByRole('button', { name: storage.add });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    const described = new Set((add.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
    expect(notes.filter((n) => !described.has(n.id))).toHaveLength(1);
  }, 40000);

  it('the preview state with rows lists the connected storage and its folder', async () => {
    const c = running();
    await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c!))}&tab=storage`, state: 'storageRows' });
    // One row: the storage, with the folder it is open as in its own column.
    expect(await screen.findByText('Backups box at /mnt/hoody/box', undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('deploy on SFTP server')).toBeInTheDocument();
    expect(screen.queryByText(storage['backends.empty'])).toBeNull();
  }, 40000);
});

// The computer's shared folders sit under its storage lists, read only (the Shared folders switch is on).
describe('computers: shared folders in the Storage tab', () => {
  afterEach(() => window.history.replaceState({}, '', '/'));

  it('shows this computer\'s shared folders, read only and without the every-computer switch', async () => {
    const c = running();
    await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c!))}&tab=storage` });
    expect(await screen.findByText(storage['backends.empty'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect((await screen.findAllByText(shares.title, undefined, { timeout: 8000 })).length).toBeGreaterThan(0);
    // The page's fixtures hold no share: both lists are read whole and say so.
    expect(await screen.findByText(shares.givenEmpty, undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(await screen.findByText(shares.receivedEmpty)).toBeInTheDocument();
    expect(screen.queryByText(shares.scope)).toBeNull();
    expect(screen.queryByRole('button', { name: shares.share })).toBeNull();
  }, 40000);
});
