// On Home, the widget's program tiles carry the same fixed actions row as the Overview's Open on
// tiles, a named group under each tile that is there at rest (never a hover-only row floating over the tile).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import { interpolate } from '@kit';
import strings from './strings.en.json';
import page from './page';

const host = { ...page, load: () => import('./widget') };

describe('computers widget: tile actions sit in a row of their own', () => {
  it('Terminal has a named Copy and QR row under its tile, outside the tile button', async () => {
    await renderPage(host, {});
    const name = strings['program.terminal'];
    const row = await screen.findByRole('group', { name: interpolate(strings['use.actions'], { what: name }) }, { timeout: 8000 });
    expect(within(row).getByRole('button', { name: 'QR code' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: interpolate(strings['copy.what'], { what: name }) })).toBeInTheDocument();
    expect(row.closest('button')).toBeNull();
    expect(row.className).toMatch(/useActions/);
  });
});
