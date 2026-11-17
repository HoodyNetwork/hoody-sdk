// Vitest: Programs leads to the apps launcher. The Running programs tab's header has the page's
// primary action, Launch an app, and the empty list offers it too; each opens the Apps tab with its launcher drawer
// open (launch=1, the launcher's own URL contract), so there is one launcher.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

// The apps page's launch.title (pages import only its links.ts).
const LAUNCHER = 'Launch an app';

describe('programs: Launch an app from Running programs', () => {
  it("the header's primary action opens the Apps tab with the launcher open", async () => {
    const user = userEvent.setup();
    const { router } = await renderPage(page);
    expect(await screen.findByRole('table', { name: strings.title }, { timeout: 8000 })).toBeInTheDocument();
    const header = screen.getByRole('heading', { level: 1, name: strings.title }).closest('header') as HTMLElement;
    // The page's primary (kit PageHeader primary: the accent button; the phone FAB is runapp.spec.ts).
    const launch = within(header).getByRole('button', { name: strings['runApp'] });
    expect(launch).toHaveAttribute('data-variant', 'primary');
    await user.click(launch);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'apps', launch: '1' }));
    expect(await screen.findByRole('dialog', { name: LAUNCHER }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: strings['tab.apps'], selected: true })).toBeInTheDocument();
  }, 40000);

  it('the empty list offers Launch an app, beside How programs work, and it opens the launcher', async () => {
    const user = userEvent.setup();
    const { router } = await renderPage(page, { state: 'empty' });
    const title = await screen.findByRole('heading', { name: strings['empty.none.title'] }, { timeout: 8000 });
    const empty = within(title.parentElement as HTMLElement);
    const launch = empty.getByRole('button', { name: strings['runApp'] });
    const guide = empty.getByRole('button', { name: strings['empty.guide'] });
    // One action row: Launch an app first and primary, How programs work beside it, not primary.
    expect(launch.parentElement).toBe(guide.parentElement);
    expect(launch.nextElementSibling).toBe(guide);
    expect(launch).toHaveAttribute('data-variant', 'primary');
    expect(guide).not.toHaveAttribute('data-variant', 'primary');
    await user.click(launch);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'apps', launch: '1' }));
    expect(await screen.findByRole('dialog', { name: LAUNCHER }, { timeout: 8000 })).toBeInTheDocument();
  }, 40000);
});
