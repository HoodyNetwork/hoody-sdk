// Make an alias says, before the person creates it, that a new link can take about a minute to work while
// its address spreads (DNS). The kit's PropagatingNote, its "created" line; the port row's note covers the minute after.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';
import kitNote from '@kit/widgets/Propagating.strings.en.json';

describe('computers: the alias drawer warns that a new address takes a minute', () => {
  it('Make an alias shows the kit\'s DNS line in the drawer', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=ports' });
    const table = await screen.findByRole('table', { name: strings['ports.title'] }, { timeout: 8000 });
    await waitFor(() => expect(within(table).getByText('3000')).toBeInTheDocument());
    const row = within(table).getByText('3000', { selector: 'td, td *' }).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: strings['alias.make'] }));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText(kitNote['propagating.created'])).toBeInTheDocument();
  }, 40000);
});
