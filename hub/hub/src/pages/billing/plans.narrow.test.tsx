// Plans: "Plans for" and the Free column. "Plans for" says which server an Upgrade changes before
// anything is pressed; it lists "A new server" (the default without ?sub=) first, then the paid servers that
// can upgrade now. Free is not a catalogue plan, so its column shows only what the Hub knows.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const ready = () => screen.findByRole('group', { name: 'Small' }, { timeout: 15_000 }); // the file's first test loads the lazy page, slow on a busy host
const picker = () => screen.getByRole('radiogroup', { name: strings['plans.for'] });

describe('Plans for', () => {
  it('lists A new server, which is chosen without ?sub=, then the servers that can upgrade now', async () => {
    await renderPage(page, { path: '/billing' });
    await ready();
    const options = within(picker()).getAllByRole('radio');
    // n12 and Singapore M can upgrade; fra-7 is held and the new server has a change running, so neither is offered.
    // RadioGroup radios are inputs: their names come from their labels.
    expect(options.map((o) => o.closest('label')?.textContent)).toEqual([strings['plans.forNew'], 'n12 · Small', 'Singapore M · Medium']);
    expect(within(picker()).getByRole('radio', { name: strings['plans.forNew'] })).toBeChecked();
    expect(picker()).toHaveAccessibleDescription(strings['plans.forNewLine']);
  });
  it('is a row of a kit setting group: the row names the choices and its help line is their description', async () => {
    await renderPage(page, { path: '/billing' });
    await ready();
    const row = picker().closest<HTMLElement>('[data-sg-row]');
    expect(row, 'the choices sit in a setting row').not.toBeNull();
    expect(row!.closest('[data-setting-group]')).not.toBeNull();
    // The name and the help are the row's own text, not the radio group's.
    const named = document.getElementById(picker().getAttribute('aria-labelledby') ?? '');
    expect(named?.textContent).toBe(strings['plans.for']);
    expect(picker().querySelector('label, [slot="description"]')?.textContent ?? '').not.toBe(strings['plans.for']);
    const help = document.getElementById(picker().getAttribute('aria-describedby') ?? '');
    expect(help?.textContent).toBe(strings['plans.forNewLine']);
  });
  it('?sub= picks that server and says what an upgrade does to it', async () => {
    await renderPage(page, { path: '/billing?sub=a1b2c3d4e5f60718293a4b01' });
    await ready();
    expect(within(picker()).getByRole('radio', { name: 'n12 · Small' })).toBeChecked();
    expect(picker()).toHaveAccessibleDescription('Upgrade changes n12 in place. It stops and starts again in a few minutes.');
  });
  it('picking a server puts its whole id in the address; A new server takes it out again', async () => {
    const { router } = await renderPage(page, { path: '/billing' });
    await ready();
    await userEvent.click(within(picker()).getByRole('radio', { name: 'Singapore M · Medium' }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: 'plans', sub: 'a1b2c3d4e5f60718293a4b03' }));
    expect(await within(screen.getByRole('group', { name: 'Large' })).findByRole('button', { name: 'Upgrade to Large: Singapore M' })).toBeEnabled();
    await userEvent.click(within(picker()).getByRole('radio', { name: strings['plans.forNew'] }));
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('sub'));
    expect(await within(screen.getByRole('group', { name: 'Large' })).findByRole('button', { name: 'Choose Large' })).toBeEnabled();
  });
  it('an account with no paid server has no Plans for', async () => {
    await renderPage(page, { state: 'empty', path: '/billing' });
    await ready();
    expect(screen.queryByRole('radiogroup', { name: strings['plans.for'] })).toBeNull();
  });
});

describe('the plan rows: one vocabulary', () => {
  // Kept from the old table: computers, never containers; disk read and write named when they differ.
  it('a Computers row in every plan, no "container", and the disk speed with read and write named', async () => {
    await renderPage(page, { path: '/billing' });
    await ready();
    for (const name of ['Small', 'Medium', 'Large'])
      expect(within(screen.getByRole('group', { name })).getByText(strings['buy.resComputers'], { selector: 'dt' })).toHaveTextContent('Computers');
    const plans = screen.getByRole('group', { name: 'Small' }).parentElement as HTMLElement;
    expect(plans.textContent).not.toMatch(/containers?/i);
    // The disk speed is a row of the Compare plans table, no longer of the cards.
    expect(within(plans).queryByText('400 MiB/s read, 200 MiB/s write')).toBeNull();
    const cmp = await screen.findByRole('region', { name: strings['plans.cmp.title'] });
    expect(within(cmp).getAllByText('400 MiB/s read, 200 MiB/s write').length).toBeGreaterThan(0);
  });
});

describe('the Free column', () => {
  it('$0, Your plan and the free server, its computers, the Free AI tier, the FAQ answer; nothing to buy', async () => {
    await renderPage(page, { path: '/billing' });
    await ready();
    const free = screen.getByRole('group', { name: strings['plans.free'] });
    expect(within(free).getByText('$0')).toBeInTheDocument();
    expect(within(free).getByText(strings.yourPlan)).toBeInTheDocument();
    expect(within(free).getByText('Your free server: ash-3')).toBeInTheDocument();
    expect(within(free).getByText(strings['buy.resComputers'], { selector: 'dt' }).nextElementSibling).toHaveTextContent(/^3$/);
    // The Free tier is the scale's base: one step lit, named in words.
    expect(within(free).getByText(strings['plans.aiLabel'], { selector: 'dt' }).nextElementSibling).toHaveTextContent(/^Free 1×$/);
    expect(within(free).getByRole('img', { name: strings['plans.aiScaleBase'] })).toBeInTheDocument();
    expect(within(free).getByText(strings['plans.freeStays'], { exact: false })).toBeInTheDocument();
    expect(within(free).getByText(strings['plans.freeDetails'])).toBeInTheDocument();
    expect(within(free).queryByRole('button', { name: /^(Get|Upgrade) / })).toBeNull();
  });
  it('an account without a free server: no Your plan, no server line, no computers it cannot know', async () => {
    await renderPage(page, { state: 'empty', path: '/billing' });
    await ready();
    const free = screen.getByRole('group', { name: strings['plans.free'] });
    expect(within(free).queryByText(strings.yourPlan)).toBeNull();
    expect(within(free).queryByText(/Your free server/)).toBeNull();
    expect(within(free).queryByText(strings['buy.resComputers'], { selector: 'dt' })).toBeNull();
    expect(within(free).queryByText(strings['plans.freeStays'], { exact: false })).toBeNull();
    expect(within(free).getByText(strings['plans.aiLabel'], { selector: 'dt' }).nextElementSibling).toHaveTextContent(/^Free 1×$/);
  });
  it('the paid columns count the account\'s servers on each plan (held ones too, ended ones not)', async () => {
    await renderPage(page, { path: '/billing' });
    await ready();
    expect(within(screen.getByRole('group', { name: 'Small' })).getByText('2 of your servers')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Medium' })).getByText('2 of your servers')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Large' })).queryByText(/of your servers/)).toBeNull();
  });
  it('a server on a retired version of a family is not counted on the family\'s current column', async () => {
    await renderPage(page, { state: 'plans-sub-retired', path: '/billing' });
    await ready();
    expect(within(screen.getByRole('group', { name: 'Medium' })).getByText('1 of your servers')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Small' })).getByText('2 of your servers')).toBeInTheDocument();
  });
});
