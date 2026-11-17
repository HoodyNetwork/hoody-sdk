// Vitest: a done Clear shows in place (the list empties); no toast says it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { showToast } from '@kit';
import page from './page';
import strings from './strings.en.json';
import { requestLog, resetFixtureVaults } from './fixtures';
import { resetChanges } from '@core/changes';

vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  vi.stubGlobal('isSecureContext', true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(showToast).mockClear();
});

describe('Clear vault', () => {
  it('done: the list empties in place, with no toast', async () => {
    await renderPage(page, { path: '/vault' });
    const tb = await screen.findByRole('table', { name: strings.title });
    await within(tb).findByRole('row', { name: /github-token/ });
    await userEvent.click(await screen.findByRole('button', { name: strings['action.more'] }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.clear'] }));
    const dlg = await screen.findByRole('alertdialog');
    await userEvent.type(within(dlg).getByRole('textbox'), 'Personal');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['clear.confirm'] }));
    await waitFor(() => expect(requestLog.filter((r) => r.method === 'DELETE' && r.path === '/vault')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('row', { name: /github-token/ })).toBeNull(), { timeout: 8000 });
    expect(vi.mocked(showToast).mock.calls.map((c) => c[0].title)).not.toContain(strings['done.cleared']);
    expect(vi.mocked(showToast)).not.toHaveBeenCalled();
  });
});
