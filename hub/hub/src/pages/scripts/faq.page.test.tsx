// Vitest: where the scripts questions show up. The list pane lists all ten under "Questions"; a script's Overview, and its Settings
// tab link to the answer about public links, the settings at the top, and secrets, and each opens its question in the list.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import page from './page';
import strings from './strings.en.json';

const IDS = ['whatIsScript', 'needCode', 'whatCan', 'assistant', 'schedule', 'publicLink', 'accessKey', 'secrets', 'settingsAtTop', 'versionsAndDelete'] as const;
const q = (id: (typeof IDS)[number]) => strings[`faq.${id}.q` as const];
const a = (id: (typeof IDS)[number]) => strings[`faq.${id}.a` as const];
const peekOf = async () => {
  const dlgs = await screen.findAllByRole('dialog');
  return dlgs[dlgs.length - 1]!;
};

const SEL = 'sel=atlas.00a1~weather.ts';

describe('scripts questions', () => {
  it('the page lists the ten questions, each closed, under the kit "Questions" heading', async () => {
    await renderPage(page, { path: '/scripts' });
    // A loaded host can take seconds to draw the page: the first find waits up to the test's own timeout.
    await screen.findByRole('heading', { name: kitStrings['faq.title'] }, { timeout: 14000 });
    for (const id of IDS) expect(await screen.findByRole('button', { name: q(id) })).toHaveAttribute('aria-expanded', 'false');
  });

  it('the new-script wizard is a separate view with the same questions under its steps, each once and closed', async () => {
    await renderPage(page, { state: 'many', path: '/scripts/new' });
    await screen.findByRole('heading', { level: 1 }, { timeout: 14000 });
    expect(await screen.findAllByRole('heading', { name: kitStrings['faq.title'] })).toHaveLength(1);
    for (const id of IDS) {
      const found = screen.getAllByRole('button', { name: q(id) });
      expect(found, id).toHaveLength(1);
      expect(found[0]).toHaveAttribute('aria-expanded', 'false');
    }
  });

  // Beside a selected script the rail leaves the questions out (they come back when a link targets one), so a link peeks.
  it('the Overview of a script links to what a public link is, and peeks its answer', async () => {
    await renderPage(page, { path: `/scripts?${SEL}` });
    // The answer ends a Why: the question opens it, then its link peeks the answer.
    await userEvent.click(await screen.findByRole('button', { name: strings['share.who.q'] }, { timeout: 5000 }));
    await userEvent.click(screen.getByRole('link', { name: strings['share.more'] }));
    expect(within(await peekOf()).getByText(a('publicLink'))).toBeInTheDocument();
  });

  it('the Settings tab links to the settings at the top and to secrets, and each peeks its answer', async () => {
    await renderPage(page, { path: `/scripts?${SEL}&tab=settings` });
    // Each answer ends a Why: the question opens it, then its link peeks the answer.
    await userEvent.click(await screen.findByRole('button', { name: strings['secrets.why.q'] }, { timeout: 5000 }));
    await userEvent.click(screen.getByRole('link', { name: strings['secrets.more'] }));
    expect(within(await peekOf()).getByText(a('secrets'))).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(await screen.findByRole('button', { name: strings['magic.why.q'] }));
    await userEvent.click(screen.getByRole('link', { name: strings['settings.more'] }));
    expect(within(await peekOf()).getByText(a('settingsAtTop'))).toBeInTheDocument();
  });
});
