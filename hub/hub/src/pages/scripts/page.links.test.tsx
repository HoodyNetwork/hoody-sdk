// Vitest: the computer named in the detail header and the Overview fact is a link to that computer on Computers.
import { renderPage, screen } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';

describe('the computer is a link to Computers', () => {
  it('the detail header and the Overview fact link to that computer', async () => {
    await renderPage(page, { state: 'default', path: '/scripts?sel=atlas.00a1~weather.ts' });
    const links = await screen.findAllByRole('link', { name: 'atlas' }, { timeout: 5000 });
    const hrefs = links.map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.filter((h) => h.endsWith('/computers?sel=atlas.00a1')).length).toBeGreaterThanOrEqual(2);
  });
});
