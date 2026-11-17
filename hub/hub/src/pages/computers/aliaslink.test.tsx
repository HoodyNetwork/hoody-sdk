// links.alias: another page (Programs' per-port "Create alias") opens this page's alias drawer for exactly
// that port of the named computer. The key is dropped once read, so a reload does not reopen it; a port that is not
// one, or a computer this list does not hold, opens nothing.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, waitFor, within } from '@app/testing';
import { links } from './links';
import page from './page';
import strings from './strings.en.json';

const title = (port: number) => strings['aliasd.title'].replace('{{port}}', String(port));

describe('computers: links.alias opens the alias drawer for that port', () => {
  it('builds the href', () => {
    expect(links.alias('atlas.00a1', 8080)).toBe('/computers?sel=atlas.00a1&alias=8080');
  });

  it('opens the drawer for port 3000 of atlas and drops the key', async () => {
    const { router } = await renderPage(page, { path: links.alias('atlas.00a1', 3000) });
    expect(await screen.findByRole('dialog', { name: title(3000) }, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).alias).toBeUndefined());
    expect((router.state.location.search as Record<string, unknown>).sel).toBe('atlas.00a1');
  }, 40000);

  it('with no port it builds alias=new, which opens the drawer with a Port field to type and drops the key', async () => {
    expect(links.alias('atlas.00a1')).toBe('/computers?sel=atlas.00a1&alias=new');
    const { router } = await renderPage(page, { path: links.alias('atlas.00a1') });
    const d = await screen.findByRole('dialog', { name: strings['alias.make'] }, { timeout: 8000 });
    expect(within(d).getByRole('textbox', { name: strings['aliasd.port'] })).toHaveValue('');
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).alias).toBeUndefined());
    expect((router.state.location.search as Record<string, unknown>).sel).toBe('atlas.00a1');
  }, 40000);

  for (const bad of ['abc', '0', '65536', '80.5', '-1', 'NEW', 'new1']) {
    it(`a port of "${bad}" opens nothing and drops the key`, async () => {
      const { router } = await renderPage(page, { path: `/computers?sel=atlas.00a1&alias=${bad}` });
      await waitFor(() => expect((router.state.location.search as Record<string, unknown>).alias).toBeUndefined(), { timeout: 8000 });
      expect(screen.queryByRole('dialog')).toBeNull();
    }, 40000);
  }

  it('a computer the list does not hold opens nothing and drops the key once the list is read', async () => {
    const { router } = await renderPage(page, { path: links.alias('nobody.zzzz', 3000) });
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).alias).toBeUndefined(), { timeout: 8000 });
    expect(screen.queryByRole('dialog')).toBeNull();
  }, 40000);
});
