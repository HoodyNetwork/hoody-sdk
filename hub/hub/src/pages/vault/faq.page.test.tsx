// Vitest: where the vault questions show up. The list pane lists all seven under "Questions"; the New drawer's one Why
// holds the links to single answers, opened over the drawer (an overlay, so they peek); the entry panel's Why peeks its
// questions too.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { resetChanges } from '@core/changes';
import kitStrings from '@kit/strings.en.json';
import { requestLog, resetFixtureVaults } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const IDS = ['vaultFor', 'scope', 'showValue', 'encrypt', 'valueInput', 'metadata', 'export'] as const;
const q = (id: (typeof IDS)[number]) => strings[`faq.${id}.q` as const];
const a = (id: (typeof IDS)[number]) => strings[`faq.${id}.a` as const];

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  vi.stubGlobal('isSecureContext', true);
});

const openNew = async () => {
  await userEvent.click((await screen.findAllByRole('button', { name: strings['action.new'] }))[0]!);
  return screen.findByRole('dialog');
};
const peekOf = async () => {
  const dlgs = await screen.findAllByRole('dialog');
  return dlgs[dlgs.length - 1]!;
};

describe('vault questions', () => {
  it('the list pane lists the seven questions, each closed, under the kit "Questions" heading', async () => {
    await renderPage(page, { path: '/vault' });
    await screen.findByRole('heading', { name: kitStrings['faq.title'] });
    for (const id of IDS) expect(await screen.findByRole('button', { name: q(id) })).toHaveAttribute('aria-expanded', 'false');
  });

  it('the New drawer: one closed Why holds the value, encrypt and metadata links, and each opens its own answer', async () => {
    await renderPage(page, { path: '/vault' });
    const dlg = await openNew();
    // Closed, the form shows no question link of its own: the three sit in the one Why.
    expect(within(dlg).queryByRole('link', { name: strings['edit.valueMore'] })).toBeNull();
    const why = within(dlg).getByRole('button', { name: strings['edit.why.q'] });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(why);
    expect(within(dlg).getByText(strings['edit.why.a'])).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('link', { name: strings['edit.valueMore'] }));
    expect(within(await peekOf()).getByText(a('valueInput'))).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(dlg).getByRole('link', { name: strings['edit.encryptMore'] }));
    expect(within(await peekOf()).getByText(a('encrypt'))).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(await within(dlg).findByRole('link', { name: strings['edit.metaMore'] }));
    expect(within(await peekOf()).getByText(a('metadata'))).toBeInTheDocument();
  });

  it('Replace says on the value field what happens to the old value', async () => {
    await renderPage(page, { path: '/vault?edit=replace:github-token' });
    const dlg = await screen.findByRole('dialog');
    const field = await within(dlg).findByLabelText(strings['edit.value']);
    const said = (field.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    expect(said).toContain(strings['edit.promiseReplaces']);
    expect(said).toContain(strings['edit.promiseOldHidden']);
  });

  it('an entry panel before the value is read: the value section ends in one closed Why whose links peek over the page', async () => {
    await renderPage(page, { path: '/vault?sel=github-token' });
    await screen.findByText(strings['detail.facts']);
    expect(screen.queryByRole('button', { name: q('showValue') })).toBeNull(); // beside an entry the rail holds no questions until a link targets one
    expect(screen.queryByRole('link', { name: strings['value.more'] })).toBeNull(); // no loose link: it ends the Why
    const why = screen.getByRole('button', { name: strings['value.why.q'] });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(why);
    expect(screen.getByText(strings['value.why.a'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: strings['value.more'] }));
    expect(within(await peekOf()).getByText(a('showValue'))).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('link', { name: strings['value.encryptedMore'] }));
    expect(within(await peekOf()).getByText(a('encrypt'))).toBeInTheDocument();
  });
});
