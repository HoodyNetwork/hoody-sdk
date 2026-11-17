// Vitest: the Home widget "Your computer" when the computers list cannot be read
// (a 2xx without data.containers, which core and this page read as an error). It says the list could not be read and
// offers Try again, never "No computer yet" with "Get a computer", which would tell someone with computers they have none.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import states from '@kit/states/strings.en.json';
import strings from './strings.en.json';
import page from './page';

const host = { ...page, load: () => import('./widget') };

describe('computers widget: the list cannot be read', () => {
  it('shows the read error with Try again, never the no-computer state', async () => {
    const r = await renderPage(host, { state: 'listMalformed' });
    expect(await screen.findByText(strings['widget.listUnread'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(strings['widget.noneYet'])).toBeNull();
    expect(screen.queryByText(strings['action.get'])).toBeNull();
    // Try again reads the list again (the error shows again, since the list is still unreadable).
    const reads = () => r.queryClient.getQueryCache().getAll().filter((q) => JSON.stringify(q.queryKey).includes('computers')).reduce((n, q) => n + q.state.errorUpdateCount + q.state.dataUpdateCount, 0);
    const before = reads();
    await userEvent.click(screen.getByRole('button', { name: states['state.retry'] }));
    await waitFor(() => expect(reads()).toBeGreaterThan(before), { timeout: 8000 });
    expect(await screen.findByText(strings['widget.listUnread'])).toBeInTheDocument();
  }, 30000);
});
