// Vitest: where the programs questions show up. The list pane lists them under "Questions" (the eight about programs are checked here;
// the ports and alias ones in portsfaq.test.tsx); the system-program note and the
// Sandbox panel open their question in place (the page root shows the list); the New program drawer is an overlay, so its start-time
// link peeks the answer over the drawer.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import { opsStore } from './parts/ops';
import page from './page';
import sbStrings from './sandbox/strings.en.json';
import strings from './strings.en.json';

const IDS = ['whatIsProgram', 'systemPrograms', 'keepOrOnce', 'startDone', 'sandboxLimits', 'sandboxNetwork', 'sandboxApply', 'maybeWentThrough'] as const;
const q = (id: (typeof IDS)[number]) => strings[`faq.${id}.q` as const];
/** An answer's blocks (kit Faq: a blank line starts a new one): the peek draws each as its own paragraph or list. */
const blocks = (id: (typeof IDS)[number]) => strings[`faq.${id}.a` as const].split('\n\n');
/** The whole answer is in `el`: every paragraph as written, every list line as an item without its marker. */
const expectAnswer = (el: HTMLElement, id: (typeof IDS)[number]) => {
  for (const b of blocks(id)) for (const line of b.split('\n')) expect(within(el).getByText(line.replace(/^(- |[0-9]\. )/, ''))).toBeInTheDocument();
};

const peekOf = async () => {
  const dlgs = await screen.findAllByRole('dialog');
  return dlgs[dlgs.length - 1]!;
};

describe('programs questions', () => {
  beforeEach(() => opsStore.reset());

  it('the page lists the eight program questions, each closed, under the kit "Questions" heading', async () => {
    await renderPage(page, { state: 'many' });
    await screen.findByRole('heading', { name: kitStrings['faq.title'] });
    for (const id of IDS) expect(await screen.findByRole('button', { name: q(id) })).toHaveAttribute('aria-expanded', 'false');
  });

  it('a system program says why it needs care in a closed Why, whose link opens its question in the list', async () => {
    await renderPage(page, { state: 'many' });
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['group.system']) }));
    await userEvent.click(await screen.findByRole('row', { name: /hoody-agent/ }));
    // The link ends the closed Why: open it first.
    await userEvent.click(await screen.findByRole('button', { name: strings['sys.why'] }));
    await userEvent.click(await screen.findByRole('link', { name: strings['sys.more'] }));
    expect(await screen.findByRole('button', { name: q('systemPrograms') })).toHaveAttribute('aria-expanded', 'true');
  });

  it('the New program drawer links to when a start counts as done, and the answer opens over the drawer', async () => {
    await renderPage(page, { state: 'many' });
    await userEvent.click(await screen.findByRole('button', { name: 'New program' }));
    const dlg = await screen.findByRole('dialog', { name: 'New program' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Advanced' }));
    // The link ends a closed Why under the field, never loose in the form.
    expect(within(dlg).queryByRole('link', { name: sbStrings['np.startSecs.more'] })).toBeNull();
    await userEvent.click(await within(dlg).findByRole('button', { name: sbStrings['np.startSecs.q'] }));
    await userEvent.click(await within(dlg).findByRole('link', { name: sbStrings['np.startSecs.more'] }));
    expect(blocks('startDone').length).toBeGreaterThan(1);
    expectAnswer(await peekOf(), 'startDone');
  });

  it('the New program drawer links to what Keep it and Run once differ in, and the answer opens over the drawer', async () => {
    await renderPage(page, { state: 'many' });
    await userEvent.click(await screen.findByRole('button', { name: 'New program' }));
    const dlg = await screen.findByRole('dialog', { name: 'New program' });
    expect(within(dlg).queryByRole('link', { name: sbStrings['np.mode.more'] })).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: sbStrings['np.mode.q'] }));
    await userEvent.click(await within(dlg).findByRole('link', { name: sbStrings['np.mode.more'] }));
    expectAnswer(await peekOf(), 'keepOrOnce');
  });
});
