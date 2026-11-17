// Vitest: with the Computers page not served by this load, the AI computer crumb is plain text (no link).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, waitFor } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

vi.mock('@kit', async (orig: () => Promise<Record<string, unknown>>) => ({ ...(await orig()), usePageLink: () => null }));

// The page's own chunk (its load(), import('./tab')) loads once per file before the first visit: renderPage does not
// wait for it, and its cold transform on a busy machine outlives the 5 s of findByText, which is about the page, not the import.
beforeAll(async () => {
  await import('./tab');
}, 120_000);

describe('ai page with the Computers page hidden', () => {
  it('shows no link to the Computers page', async () => {
    await renderPage(page, { path: '/ai/models' });
    await screen.findByText(strings['def.helper'], undefined, { timeout: 5000 });
    await waitFor(() => expect(screen.getAllByText(strings['models.title']).length).toBeGreaterThan(0));
    expect(screen.queryAllByRole('link').filter((l) => /\/computers/.test(l.getAttribute('href') ?? ''))).toHaveLength(0);
  });
});
