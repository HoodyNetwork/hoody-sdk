// Vitest: where the tunnels questions show up. The list pane lists all eight under "Questions"; the Setup drawer (its two Whys and the
// flagged-port band), the reconnecting note and a web address's "Not loading?" link go to single answers, which open in place
// (the drawer is an overlay, so the link peeks the answer).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import page from './page';
import strings from './strings.en.json';

const IDS = ['what', 'twoWays', 'ports', 'riskyPorts', 'password', 'fails', 'notLoading', 'reconnecting'] as const;
const q = (id: (typeof IDS)[number]) => strings[`faq.${id}.q` as const];
const a = (id: (typeof IDS)[number]) => strings[`faq.${id}.a` as const];

const openSetup = async () => {
  await userEvent.click(await screen.findByRole('button', { name: strings['setup.open'] }));
  return screen.findByRole('dialog', { name: 'Connect a laptop to atlas' });
};
const peekOf = async () => {
  const dlgs = await screen.findAllByRole('dialog');
  return dlgs[dlgs.length - 1]!;
};

describe('tunnels questions', () => {
  it('the list pane lists the eight questions, each closed, under the kit "Questions" heading', async () => {
    await renderPage(page);
    await screen.findByRole('heading', { name: kitStrings['faq.title'] });
    for (const id of IDS) expect(await screen.findByRole('button', { name: q(id) })).toHaveAttribute('aria-expanded', 'false');
  });

  it('the failures are one closed "If it fails" Why in the drawer that ends with the answer, not four lines', async () => {
    await renderPage(page);
    const dlg = await openSetup();
    for (const lead of ['Port in use', 'Port held by another session', 'Port refused']) expect(within(dlg).queryByText(new RegExp(`^${lead}`))).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['setup.fails'] }));
    await userEvent.click(await within(dlg).findByRole('link', { name: strings['setup.fails.more'] }));
    expect(within(await peekOf()).getByText(a('fails'))).toBeInTheDocument();
  });

  it('the "Which one should I pick?" Why under the choice ends with its answer', async () => {
    await renderPage(page);
    const dlg = await openSetup();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['setup.twoWays.more'] }));
    await userEvent.click(await within(dlg).findByRole('link', { name: strings['setup.twoWays.link'] }));
    expect(within(await peekOf()).getByText(a('twoWays'))).toBeInTheDocument();
  });

  it('a database port shows the warning and a link to the ports it flags', async () => {
    await renderPage(page);
    const dlg = await openSetup();
    expect(within(dlg).queryByRole('link', { name: strings['setup.risky.more'] })).toBeNull();
    const port = within(dlg).getByRole('textbox', { name: strings['setup.port'] });
    await userEvent.clear(port);
    await userEvent.type(port, '5432');
    await userEvent.click(await within(dlg).findByRole('link', { name: strings['setup.risky.more'] }));
    expect(within(await peekOf()).getByText(a('riskyPorts'))).toBeInTheDocument();
  });

  it('a reconnecting address says what that means and links to the answer', async () => {
    await renderPage(page);
    const tb = await screen.findByRole('table');
    await within(tb).findByText(strings['group.reconnecting']);
    const row = within(tb).getAllByRole('row').find((r) => /\b8080\b/.test(r.textContent ?? ''));
    if (!row) throw new Error('no :8080 row');
    await userEvent.click(row);
    const link = await screen.findByRole('link', { name: strings['held.more'] });
    expect(screen.getByRole('button', { name: q('reconnecting') })).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(link);
    await waitFor(() => expect(screen.getByRole('button', { name: q('reconnecting') })).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByRole('button', { name: q('what') })).toHaveAttribute('aria-expanded', 'false');
  });

  it('a web address answers "Not loading?" in a closed Why that ends with the link to the full answer', async () => {
    await renderPage(page);
    const tb = await screen.findByRole('table');
    await within(tb).findByText('127.0.0.1:5432');
    const row = within(tb).getAllByRole('row').find((r) => /\b3000\b/.test(r.textContent ?? '') && r.textContent?.includes(strings['kind.expose']));
    if (!row) throw new Error('no :3000 row');
    await userEvent.click(row);
    const why = await screen.findByRole('button', { name: strings['note.title'] });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: strings['note.title'] })).toBeNull();
    await userEvent.click(why);
    expect(await screen.findByText(strings['note.why'])).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: strings['note.more'] });
    expect(screen.getByRole('button', { name: q('notLoading') })).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(link);
    await waitFor(() => expect(screen.getByRole('button', { name: q('notLoading') })).toHaveAttribute('aria-expanded', 'true'));
  });
});
