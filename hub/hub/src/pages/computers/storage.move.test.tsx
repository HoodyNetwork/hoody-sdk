// The computer page's Storage tab renders
// the storage home's StorageTab, the one links.ts hands out, for the selected computer with the write rule of the
// session. pages/files/storage.move.test.tsx holds the Files half and expects the same render ({ atlas, canWrite: true }).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureWorld } from '@core';
import { cleanup, renderPage, screen } from '@app/testing';
import page from './page';
import * as links from '../files/links';

// Every StorageTab rendered, with the computer and write rule it got.
const shown = vi.hoisted(() => [] as { id: string; canWrite: boolean }[]);
vi.mock('../files/storage/StorageTab', async (orig) => {
  const real = await orig<{ StorageTab: typeof links.StorageTab }>();
  return { ...real, StorageTab: (p: Parameters<typeof real.StorageTab>[0]) => { shown.push({ id: p.computer.id, canWrite: p.canWrite }); return real.StorageTab(p); } };
});

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const handle = `atlas.${atlas.id.slice(-4)}`;

describe('storage: the computer page renders the storage home\'s StorageTab', () => {
  beforeEach(() => { shown.length = 0; });
  afterEach(() => { cleanup(); });

  it('renders it for the selected computer, able to add storage, as Files does', async () => {
    await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handle)}&tab=storage` });
    expect(await screen.findByText(links.storageStrings['backends.empty'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: links.storageStrings.add })).toBeInTheDocument();
    expect(shown.at(-1)).toEqual({ id: atlas.id, canWrite: true });
  }, 40000);
});
