// While the computer list is still being read, Files already draws its tab strip under the header (the strip's line
// is the header's one line), so the header never draws its own line first and then drops it when the list arrives
// (headrule.spec.ts measured that first frame under load).
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from './page';
import ts from './transfers/transfers.strings.en.json';
import type * as DataMod from './data';

vi.mock('./data', async (orig) => {
  const real = await orig<typeof DataMod>();
  const loading = { rows: null, failed: false, error: null, complete: false, more: false, capped: false, unproven: false, loading: true, retry: () => undefined };
  return { ...real, useFilesComputers: () => loading };
});

describe('Files while its computer list is read', () => {
  it('draws the tab strip under a header that hands its line to it', async () => {
    await renderPage(page, { path: '/files' });
    expect(await screen.findByRole('tablist', { name: ts['tabs.label'] }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 }).closest('header')!.classList.contains('tabsFollow')).toBe(true);
  }, 40000);
});
