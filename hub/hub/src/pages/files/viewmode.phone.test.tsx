// Vitest: on a phone the Files panes toggle in the page header shows its icons only (each choice keeps its name for
// screen readers and as a tooltip); on a wider screen it shows the words.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const L = vi.hoisted(() => ({ phone: true }));
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), useIsPhone: () => L.phone }));

const radios = async () => {
  const group = await screen.findByRole('radiogroup', { name: strings['view.label'] }, { timeout: 8000 });
  return [strings['view.one'], strings['view.two']].map((n) => within(group).getByRole('radio', { name: n }));
};

describe('panes toggle on a phone', () => {
  it('draws icons only, the names kept', async () => {
    L.phone = true;
    await renderPage(page, { path: '/files?a=atlas.00a1' });
    for (const r of await radios()) expect(r.closest('[data-icon-only]')).not.toBeNull();
  }, 40000);

  it('draws the words on a wider screen', async () => {
    L.phone = false;
    await renderPage(page, { path: '/files?a=atlas.00a1' });
    for (const r of await radios()) expect(r.closest('[data-icon-only]')).toBeNull();
  }, 40000);
});
