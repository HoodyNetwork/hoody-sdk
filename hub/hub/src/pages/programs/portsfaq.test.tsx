// Vitest: the Ports & aliases tab's Questions. Under its two tables the tab lists the page's questions, as the Running tab
// does (the last eight are about ports and aliases); an answer opens in short blocks; the aliases section's "own domain"
// link opens its question in place, on this tab.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import page from './page';
import strings from './strings.en.json';

const PATH = '/programs?tab=ports';
const PORTS = ['whichPorts', 'hoodyPorts', 'portOrAlias', 'makeAlias', 'aliasStopped', 'whoCanOpen', 'ownDomain', 'httpsPort'] as const;
const PROGRAMS = ['whatIsProgram', 'systemPrograms', 'keepOrOnce', 'startDone', 'sandboxLimits', 'sandboxNetwork', 'sandboxApply', 'maybeWentThrough'] as const;
const q = (id: (typeof PORTS)[number] | (typeof PROGRAMS)[number]) => strings[`faq.${id}.q` as const];
const section = async () => (await screen.findByRole('heading', { name: kitStrings['faq.title'] })).closest('section')!;

describe('Programs: the Ports & aliases tab\'s questions', () => {
  it('lists the page\'s sixteen questions, each closed, the eight about ports and aliases last and in order', async () => {
    await renderPage(page, { path: PATH });
    const faq = await section();
    const asked = within(faq).getAllByRole('button').map((b) => b.textContent);
    expect(asked).toEqual([...PROGRAMS, ...PORTS].map(q));
    for (const b of within(faq).getAllByRole('button')) expect(b).toHaveAttribute('aria-expanded', 'false');
  });

  it('is under the two tables', async () => {
    await renderPage(page, { path: PATH });
    const faq = await section();
    const aliases = await screen.findByRole('table', { name: strings['pa.aliases.title'] });
    expect(aliases.compareDocumentPosition(faq) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('an answer opens in short blocks: the kinds of port as a list between two short paragraphs', async () => {
    await renderPage(page, { path: PATH });
    await section();
    await userEvent.click(screen.getByRole('button', { name: q('whichPorts') }));
    const item = document.getElementById('faq-whichPorts')!;
    const kinds = within(item).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(kinds).toHaveLength(2);
    expect(kinds[0]).toMatch(new RegExp(`^${strings['pa.ports.kind.web']}: `));
    expect(kinds[1]).toMatch(new RegExp(`^${strings['pa.ports.kind.other']}: `));
    expect(item.querySelectorAll('p')).toHaveLength(2);
  });

  it('creating an alias reads as numbered steps', async () => {
    await renderPage(page, { path: PATH });
    await section();
    await userEvent.click(screen.getByRole('button', { name: q('makeAlias') }));
    const item = document.getElementById('faq-makeAlias')!;
    expect(item.querySelector('ol')).not.toBeNull();
    expect(within(item).getAllByRole('listitem')).toHaveLength(3);
  });

  it('the aliases section\'s own-domain link opens its question in place, on this tab', async () => {
    const { router } = await renderPage(page, { path: PATH });
    await section();
    // The question sits in the aliases section, drawn once the aliases are read (the Questions section is there before).
    await userEvent.click(await screen.findByRole('button', { name: strings['pa.why.q'] }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('link', { name: strings['pa.why.more'] }));
    await waitFor(() => expect(screen.getByRole('button', { name: q('ownDomain') })).toHaveAttribute('aria-expanded', 'true'));
    expect(new URLSearchParams(router.state.location.search).get('tab')).toBe('ports');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the questions show with nothing listening and no alias too', async () => {
    await renderPage(page, { state: 'ports-empty', path: PATH });
    const faq = await section();
    expect(within(faq).getAllByRole('button')).toHaveLength(PROGRAMS.length + PORTS.length);
  });
});
