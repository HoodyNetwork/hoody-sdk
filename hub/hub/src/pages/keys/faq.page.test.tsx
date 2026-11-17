// Vitest: where the keys questions show up. Every tab lists all eight under "Questions" (the API keys tab at the end of its
// list); the New key drawer's realms and access Whys end with their answers (Edit renders the same KeyFields with the same
// two props), and the made-share panel links to what to send. Inside a drawer the answer peeks over it (an overlay).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import { REALM_A } from './fixtures';
import { links } from './links';
import page from './page';
import strings from './strings.en.json';

const IDS = ['secretOnce', 'whatIsKey', 'realms', 'rights', 'endsAndAddresses', 'sshKey', 'shareRealm', 'shareMessage'] as const;
const q = (id: (typeof IDS)[number]) => strings[`faq.${id}.q` as const];
const a = (id: (typeof IDS)[number]) => strings[`faq.${id}.a` as const];

const peekOf = async () => {
  const dlgs = await screen.findAllByRole('dialog');
  return dlgs[dlgs.length - 1]!;
};
const listsAll = async () => {
  await screen.findByRole('heading', { name: kitStrings['faq.title'] }, { timeout: 8000 });
  for (const id of IDS) expect(await screen.findByRole('button', { name: q(id) })).toHaveAttribute('aria-expanded', 'false');
};

describe('keys questions', () => {
  it('the API keys, SSH key and Shared access tabs each list the eight questions, closed, under "Questions"', async () => {
    await renderPage(page, { realm: 'all' });
    await listsAll();
    await userEvent.click(await screen.findByRole('tab', { name: new RegExp(strings['tab.ssh']) }));
    await listsAll();
    await userEvent.click(await screen.findByRole('tab', { name: new RegExp(strings['tab.shared']) }));
    await listsAll();
  }, 30000);

  it('New key: the realms Why ends with the realms answer, and the access Why with the rights answer', async () => {
    await renderPage(page, { realm: 'all' });
    await userEvent.click(await screen.findByRole('button', { name: strings['action.new'] }));
    const d = await screen.findByRole('dialog');
    await userEvent.click(within(d).getByRole('button', { name: strings['nk.realmsMore'] }));
    await userEvent.click(within(d).getByRole('link', { name: q('realms') }));
    expect(within(await peekOf()).getByText(a('realms'))).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(d).getByRole('radio', { name: new RegExp(strings['nk.choose']) }));
    await userEvent.click(await within(d).findByRole('button', { name: strings['nk.rightsMore'] }));
    await userEvent.click(await within(d).findByRole('link', { name: q('rights') }));
    expect(within(await peekOf()).getByText(a('rights'))).toBeInTheDocument();
  }, 30000);

  it('the made-share panel: its closed Why opens what to send', async () => {
    await renderPage(page, { state: 'shared', realm: 'all', path: links.shareRealm(REALM_A) });
    const d = await screen.findByRole('dialog', {}, { timeout: 8000 });
    const go = await within(d).findByRole('button', { name: strings['share.review'] });
    await waitFor(() => expect(go).toBeEnabled(), { timeout: 8000 });
    await userEvent.click(go);
    await userEvent.click(await within(d).findByRole('button', { name: strings['share.create'] }));
    await userEvent.click(await within(d).findByRole('button', { name: strings['share.sendMore'] }, { timeout: 8000 }));
    await userEvent.click(within(d).getByRole('link', { name: strings['faq.shareMessage.q'] }));
    expect(within(await peekOf()).getByText(a('shareMessage'))).toBeInTheDocument();
  }, 30000);
});
