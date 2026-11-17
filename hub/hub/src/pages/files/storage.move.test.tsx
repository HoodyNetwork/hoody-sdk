// The storage feature has one code home, pages/files/storage. Files'
// Storage tab and the computer page's Storage tab render the same StorageTab component for the same
// computer, with the same write rule (an account session may change storage; a token session sees the read-only note).
// This file holds the Files half; pages/computers/storage.move.test.tsx holds the computer page's half and expects
// the same render ({ atlas, canWrite: true }) of the component links.ts hands out (each page tests its own page).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureWorld } from '@core';
import { cleanup, renderPage, screen, within } from '@app/testing';
import { resetFiles } from './fixtures';
import filesPage from './page';
import * as links from './links';
import * as home from './storage';
import storage from './storage/strings.en.json';
import ts from './transfers/transfers.strings.en.json';
import ps from './pc/pc.strings.en.json';
import type * as StorageTabModule from './storage/StorageTab';

// Every StorageTab rendered, on either page, with the computer and write rule it got.
const shown = vi.hoisted(() => [] as { id: string; canWrite: boolean }[]);
vi.mock('./storage/StorageTab', async (orig) => {
  const real = await orig<typeof StorageTabModule>();
  return { ...real, StorageTab: (p: Parameters<typeof real.StorageTab>[0]) => { shown.push({ id: p.computer.id, canWrite: p.canWrite }); return real.StorageTab(p); } };
});

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const handle = `atlas.${atlas.id.slice(-4)}`;

describe('storage: one component on Files and on the computer page', () => {
  beforeEach(() => { resetFiles(); shown.length = 0; });
  afterEach(() => { cleanup(); });

  it('links.ts hands out the storage home\'s own StorageTab', () => {
    expect(links.StorageTab).toBe(home.StorageTab);
  });

  it('Files\' Storage tab renders it for the computer in pane A, able to add storage', async () => {
    await renderPage(filesPage, { path: `/files?a=${handle}&tab=storage` });
    expect(await screen.findByRole('tab', { name: ts['tab.storage'], selected: true }, { timeout: 8000 })).toBeInTheDocument();
    expect(await screen.findByText(storage['backends.empty'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: storage.add })).toBeInTheDocument();
    expect(shown.at(-1)).toEqual({ id: atlas.id, canWrite: true });
  }, 40000);

  it('Storage names its computer in the page subtitle, not in a caption under the tab strip', async () => {
    await renderPage(filesPage, { path: `/files?a=${handle}&tab=storage` });
    const line = ts['storage.for'].replace('{{name}}', 'atlas');
    const head = (await screen.findByRole('heading', { level: 1 }, { timeout: 8000 })).closest('header')!;
    expect(await within(head).findByText(line, undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(within(await screen.findByRole('tabpanel', undefined, { timeout: 8000 })).queryByText(line)).toBeNull();
  }, 40000);

  it('Files\' tabs read Browse, Storage, Transfers, Use from your PC; without a computer in pane A it asks for one', async () => {
    await renderPage(filesPage, { path: '/files?tab=storage' });
    expect(await screen.findByText(ts['storage.pick.title'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((x) => x.textContent)).toEqual([ts['tab.browse'], ts['tab.storage'], ts['tab.transfers'], ps['tab.pc']]);
    expect(shown).toEqual([]);
  }, 40000);

  it('a token session sees the read-only note on Files, as on the computer page, and Add storage off', async () => {
    await renderPage(filesPage, { path: `/files?a=${handle}&tab=storage`, state: 'tokenRead' });
    expect(await screen.findByText(storage.noWrite, undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: storage.add })).toHaveAttribute('aria-disabled', 'true');
    expect(shown.at(-1)).toEqual({ id: atlas.id, canWrite: false });
  }, 40000);
});
