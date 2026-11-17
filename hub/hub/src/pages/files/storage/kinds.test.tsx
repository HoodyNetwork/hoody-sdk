// An empty storage list says what it is for: storage you have elsewhere. Under its title it names the best-known
// kinds the picker connects, each name after its mark as one unit, three to a row, and how many more, counted from the
// picker's own list; it reads as the plain sentence (the marks are decoration). The section's sentence says the
// storage is elsewhere.
import { bootFixtureCore, queryClient } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the tab, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router harness: the tables read the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { storageRules } from './fixtures';
import { BEST_KNOWN, CHOICES, STORAGE_KINDS, choiceOf } from './providers';
import { StorageTab, type StorageComputer } from './StorageTab';
import strings from './strings.en.json';

const routed = (node: ReactElement) => <RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => node }), history: createMemoryHistory({ initialEntries: ['/'] }) })} />;
const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: 'p'.repeat(24), server_id: 's'.repeat(24), server_name: 'n12' } as StorageComputer;
const NAMES = ['Amazon S3', 'Google Drive', 'Dropbox', 'Microsoft OneDrive', 'Box', 'MEGA'];

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe('storage kinds', () => {
  it('six best-known picker entries; the count is one per name, less the plain S3 form and "Other"', () => {
    expect(BEST_KNOWN).toHaveLength(6);
    for (const v of BEST_KNOWN) expect(choiceOf(v)).toBeDefined();
    const names = CHOICES.filter((c) => c.value !== 's3' && c.value !== 's3:Other').map((c) => c.label ?? c.type);
    // Backblaze B2 is listed twice (its own form, and among the S3-compatible services): one kind.
    expect(names.filter((n) => n === 'Backblaze B2')).toHaveLength(2);
    expect(STORAGE_KINDS).toBe(names.length - 1);
    expect(STORAGE_KINDS).toBeGreaterThan(BEST_KNOWN.length);
  });

  it('an empty list names the six after their marks and how many more, read as one sentence; the section says elsewhere', async () => {
    bootFixtureCore({ rules: storageRules({ seed: { backends: [], mounts: [], held: [] } }) });
    render(routed(<QueryClientProvider client={queryClient}><StorageTab computer={C} canWrite /></QueryClientProvider>));
    const more = STORAGE_KINDS - 6;
    const title = await screen.findByText(strings['backends.empty']);
    const body = title.nextElementSibling as HTMLElement;
    // Read as a person hears it: the marks are hidden.
    const heard = body.cloneNode(true) as HTMLElement;
    for (const m of heard.querySelectorAll('[aria-hidden="true"]')) m.remove();
    expect(heard.textContent?.replace(/\s+/g, ' ').trim()).toBe(`Works with ${NAMES.join(', ')} and ${more} more`);
    // Six marks, each the first letter of the name after it, mark and name one unit (never split across lines).
    const marks = [...body.querySelectorAll('[aria-hidden="true"]')];
    expect(marks.map((m) => m.textContent)).toEqual(NAMES.map((n) => n[0]!.toUpperCase()));
    marks.forEach((m, i) => expect(m.parentElement!.textContent).toBe(`${NAMES[i]![0]!.toUpperCase()}${NAMES[i]}${i < 5 ? ',' : ''}`));
    // Three kinds to a row: written line breaks after the lead, the third kind and the sixth.
    expect(body.textContent!.split('\n').map((l) => l.trim())).toEqual([
      'Works with',
      `${NAMES.slice(0, 3).map((n) => `${n[0]!.toUpperCase()}${n},`).join(' ')}`,
      `${NAMES.slice(3).map((n, i) => `${n[0]!.toUpperCase()}${n}${i < 2 ? ',' : ''}`).join(' ')}`,
      `and ${more} more`,
    ]);
    expect(screen.getByText(strings.lede)).toBeInTheDocument();
    expect(strings.lede).toMatch(/you have elsewhere/);
  });

  it('a list with storage in it names no kinds', async () => {
    bootFixtureCore({ rules: storageRules({ seed: { backends: [{ id: 'a'.repeat(16), backend_type: 'sftp', server: 'sftp:generic', user: 'deploy', connected: true, created_at: '2026-10-24T06:00:00Z', mount_paths: [] }], mounts: [], held: [] } }) });
    render(routed(<QueryClientProvider client={queryClient}><StorageTab computer={C} canWrite /></QueryClientProvider>));
    await screen.findByText('deploy on SFTP server');
    expect(screen.queryByText(/^Works with/)).toBeNull();
  });
});
