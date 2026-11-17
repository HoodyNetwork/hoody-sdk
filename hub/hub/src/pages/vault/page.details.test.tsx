// Vitest: a vault change the API refused shows its band with a Details button, so the person can copy the facts for
// support (the kit Band's `error=`); the page's own sentence stays the band's text.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { resetChanges } from '@core/changes';
import page from './page';
import strings from './strings.en.json';
import { requestLog, resetFixtureVaults } from './fixtures';

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  vi.stubGlobal('isSecureContext', true);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const details = () => screen.findByRole('region', { name: 'Details' });

describe('a refused vault change', () => {
  it('a refused delete: the band keeps its words and offers Details', async () => {
    await renderPage(page, { state: 'full', path: '/vault?sel=github-token' });
    await userEvent.click(within(await details()).getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: (n: string) => n.startsWith(strings['action.delete']) }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['delete.confirm'] }));
    const words = await screen.findByText(strings['problem.quota'], {}, { timeout: 10000 });
    const band = words.closest('[role="status"], [role="alert"], [data-band]') as HTMLElement;
    expect(band, 'the refusal is drawn as a band').not.toBeNull();
    expect(within(band).getByRole('button', { name: 'Details' })).toBeInTheDocument();
    expect(requestLog.filter((r) => r.method === 'DELETE')).toHaveLength(1);
  });
});
