// Vitest: the two tabs of Programs: Running programs (the page's list) and Apps (?tab=apps, the
// apps page's AppsSection). The Apps tab's own behaviour is tested with it, in pages/apps.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('programs: Running programs and Apps tabs', () => {
  // The tab strip sits right under the header with no caption of its own (one tab look across pages): what the Running
  // tab holds is the page's first question, what the Apps tab holds is that tab's header line.
  it('opens on Running programs; the strip has no caption, the first question says what the tabs are', async () => {
    await renderPage(page);
    expect(await screen.findByRole('tab', { name: strings['tab.running'], selected: true })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: strings.title })).toBeInTheDocument();
    expect(screen.queryByText(/services this computer keeps on, like a website or a bot\. Apps:/)).toBeNull();
    expect(screen.getAllByText(strings['faq.whatIsProgram.q']).length).toBeGreaterThan(0);
  });

  it('the Apps tab shows the apps opened on demand and Launch an app, and keeps it in the URL', async () => {
    const user = userEvent.setup();
    const { router } = await renderPage(page);
    await user.click(await screen.findByRole('tab', { name: strings['tab.apps'] }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'apps' }));
    expect((await screen.findAllByRole('button', { name: 'Launch an app' /* the apps page's launch.action (pages import only its links.ts) */ }, { timeout: 4000 })).length).toBeGreaterThan(0);
    expect(screen.queryByText(/services this computer keeps on, like a website or a bot\. Apps:/)).toBeNull();
    expect(screen.getByText(/programs you open only when you need them/i)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: strings.title })).toBeNull();
  });

  it('a link to ?tab=apps lands on the Apps tab', async () => {
    await renderPage(page, { path: '/programs?tab=apps' });
    expect(await screen.findByRole('tab', { name: strings['tab.apps'], selected: true }, { timeout: 4000 })).toBeInTheDocument();
  });
});
