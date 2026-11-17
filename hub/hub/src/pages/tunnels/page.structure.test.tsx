// Structure of the Tunnels page: the empty page offers the act it waits for as its one primary (the header draws none
// beside it), and the Setup drawer names its first choice once, in the step's heading.
import { describe, expect, it } from 'vitest';
import { interpolate } from '@kit';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('tunnels: nothing connected', () => {
  it('the empty state holds Connect a laptop first, then Refresh; no second Connect a laptop in the header', async () => {
    await renderPage(page, { state: 'idle' });
    const title = await screen.findByText(strings['st.title.idle']);
    const state = title.closest('[data-empty-place]');
    expect(state, 'the empty state is a framed card').not.toBeNull();
    const names = within(state as HTMLElement).getAllByRole('button').map((b) => b.textContent);
    expect(names.slice(0, 2)).toEqual([strings['setup.open'], strings.refresh]);
    expect(screen.getAllByRole('button', { name: strings['setup.open'] })).toHaveLength(1);
  });

  it('with tunnels listed the header keeps Connect a laptop', async () => {
    await renderPage(page);
    await screen.findByRole('table', { name: strings.title });
    expect(screen.getAllByRole('button', { name: strings['setup.open'] })).toHaveLength(1);
  });
});

describe('tunnels setup: the first step', () => {
  it('draws "What to connect" once (the step heading) and still names the choice group with it', async () => {
    await renderPage(page);
    await userEvent.click(await screen.findByRole('button', { name: strings['setup.open'] }));
    const dlg = await screen.findByRole('dialog', { name: interpolate(strings['setup.title'], { name: 'atlas' }) });
    expect(within(dlg).getByRole('radiogroup', { name: strings['setup.what'] })).toBeInTheDocument();
    expect(within(dlg).getAllByText(strings['setup.what'])).toHaveLength(1);
  });
});
