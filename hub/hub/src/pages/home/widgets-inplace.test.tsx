// Vitest: an added web widget shows on Home in place and the form empties; no toast says it (on a
// phone one covered the drag grip).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { showToast } from '@kit';
import page from './page';
import strings from './widgets/strings.en.json';
import './testWaits';

vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));

const KIT = 'https://p-0123456789abcdef01234567-agent-1.srv.fixture.invalid/app';

afterEach(() => {
  vi.mocked(showToast).mockClear();
});

describe('adding a web widget', () => {
  it('shows the widget in place and empties the form, with no toast', async () => {
    await renderPage(page, { path: '/home?customize=1' });
    const form = await screen.findByRole('region', { name: strings['add.title'] });
    const field = within(form).getByLabelText(strings['add.url']);
    await userEvent.type(field, KIT);
    await userEvent.type(within(form).getByLabelText(strings['add.name']), 'Docs');
    await userEvent.click(within(form).getByRole('button', { name: strings['add.submit'] }));
    await waitFor(() => expect(screen.getAllByText('Docs').length).toBeGreaterThan(0));
    expect(field).toHaveValue('');
    expect(vi.mocked(showToast)).not.toHaveBeenCalled();
  });
});
