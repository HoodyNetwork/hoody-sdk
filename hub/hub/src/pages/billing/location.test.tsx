// Vitest: where a paid plan's server goes. Buy a plan's drawer has a Location choice: "Automatic (best available)" (the
// default) and the plan's own locations from the regions read, a full one listed and off. The price is read again for
// the choice and says where the server will be. A refused location names itself, charges nothing and sends the person
// back to the picker; a list that cannot be read leaves Automatic and never blocks the purchase. The Plans view names
// only locations the read lists with room; a subscription shows its server's own location; an upgrade keeps it.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetUnknownCheckouts } from './data';
import page from './page';
import strings from './strings.en.json';

const BUY = '/billing?checkout=buy&plan=fam-plus';
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(v[k]));

async function openBuy(state?: string) {
  resetUnknownCheckouts();
  await renderPage(page, { state, path: BUY });
  const dialog = await screen.findByRole('dialog', undefined, { timeout: 20000 });
  await within(dialog).findByRole('checkbox', undefined, { timeout: 20000 });
  return dialog;
}
const phaseOf = (dialog: HTMLElement) => dialog.querySelector('[data-phase]')?.getAttribute('data-phase');
// The Location choice is a radio list in view (up to six places): Automatic first, then each place.
const picker = (dialog: HTMLElement) => within(dialog).getByRole('radiogroup', { name: strings['loc.label'] });
const radios = (dialog: HTMLElement) => within(picker(dialog)).getAllByRole('radio') as HTMLInputElement[];
const textOf = (r: HTMLElement) => r.closest('label')?.textContent ?? '';
const chosenText = (dialog: HTMLElement) => textOf(radios(dialog).find((r) => r.checked)!);
async function choose(dialog: HTMLElement, name: RegExp) {
  // A place before Automatic: Automatic's own line names where it would place the server right now.
  await userEvent.click((radios(dialog).find((r) => r.value !== 'auto' && name.test(textOf(r))) ?? radios(dialog).find((r) => name.test(textOf(r))))!);
  // The price is read again for the choice: back on the review, consent asked again.
  await within(dialog).findByRole('checkbox', undefined, { timeout: 20000 });
}
const confirm = async (dialog: HTMLElement) => {
  await userEvent.click(within(dialog).getByRole('checkbox'));
  await userEvent.click(within(dialog).getByRole('button', { name: strings['buy.confirm'] }));
};

describe('Buy a plan: the Location choice', () => {
  it('lists Automatic first, then the plan\'s locations as city and country; a full one is listed, off, as Full', async () => {
    const dialog = await openBuy();
    // The default is Automatic, with where that would be right now (the quote's hint).
    expect(chosenText(dialog)).toMatch(new RegExp(`^${strings['loc.auto'].replace(/[()]/g, '\\$&')}`));
    expect(within(dialog).getByText(fill(strings['loc.autoNow'], { place: 'Frankfurt, Germany' }))).toBeInTheDocument();
    // Every place is in view without opening anything: no closed select, no listbox.
    expect(within(dialog).queryByRole('button', { name: new RegExp(strings['loc.label']) })).toBeNull();
    const options = radios(dialog);
    expect(options.map(textOf)).toEqual([
      strings['loc.auto'] + fill(strings['loc.autoNow'], { place: 'Frankfurt, Germany' }),
      expect.stringContaining('Frankfurt, Germany'),
      expect.stringContaining('Helsinki, Finland'),
      expect.stringMatching(/Singapore$/),
      expect.stringContaining('New York, United States'),
    ]);
    const full = options[4]!;
    expect(full).toBeDisabled();
    expect(textOf(full)).toMatch(new RegExp(`${strings['loc.full']}$`));
    for (const o of options.slice(0, 4)) expect(o).toBeEnabled();
    // A press on the full one chooses nothing.
    await userEvent.click(full.closest('label')!);
    expect(options[0]!.checked).toBe(true);
  });

  it('a choice reads the price again, unticks the consent and says where the server will be and that it cannot move', async () => {
    const dialog = await openBuy();
    await userEvent.click(within(dialog).getByRole('checkbox'));
    expect((within(dialog).getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    await choose(dialog, /Helsinki, Finland/);
    expect(chosenText(dialog)).toMatch(/Helsinki, Finland/);
    expect((within(dialog).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(within(dialog).getByText(fill(strings['loc.chosen'], { place: 'Helsinki, Finland' }))).toBeInTheDocument();
    // Back to Automatic: the hint again.
    await choose(dialog, new RegExp(strings['loc.auto'].replace(/[()]/g, '\\$&')));
    expect(within(dialog).getByText(fill(strings['loc.autoNow'], { place: 'Frankfurt, Germany' }))).toBeInTheDocument();
  });

  it('a purchase with a choice lands there: the receipt names the location', async () => {
    const dialog = await openBuy();
    await choose(dialog, /Singapore/);
    await confirm(dialog);
    await waitFor(() => expect(phaseOf(dialog)).toBe('done'), { timeout: 20000 });
    expect(dialog).toHaveTextContent(fill(strings['loc.in'], { place: 'Singapore' }));
  });

  it('the chosen location filled before the purchase: named, nothing charged, back on the review with the picker', async () => {
    const dialog = await openBuy('send-region-full');
    await choose(dialog, /Helsinki, Finland/);
    await confirm(dialog);
    const said = await within(dialog).findByText(fill(strings['loc.refusedFullIn'], { place: 'Helsinki, Finland' }), undefined, { timeout: 20000 });
    expect(said).toBeInTheDocument();
    expect(said.textContent).toMatch(/Nothing was charged/);
    await waitFor(() => expect(phaseOf(dialog)).toBe('review'));
    // Not the failure screen: the picker is there to choose another, and Confirm needs the box again.
    expect(radios(dialog).every((r) => !r.disabled || /New York/.test(textOf(r)))).toBe(true);
    expect((within(dialog).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    // The Band says the refusal once; the field adds no line of its own.
    expect(within(dialog).getAllByText(/Nothing was charged/)).toHaveLength(1);
    // Choosing another location takes the refusal's words away with it.
    await choose(dialog, /Singapore/);
    expect(within(dialog).queryByText(/Nothing was charged/)).toBeNull();
  });

  it('a location that left the list: said, nothing charged, back on the review', async () => {
    const dialog = await openBuy('send-region-unknown');
    await choose(dialog, /Helsinki, Finland/);
    await confirm(dialog);
    expect(await within(dialog).findByText(strings['loc.refusedUnknown'], undefined, { timeout: 20000 })).toBeInTheDocument();
    await waitFor(() => expect(phaseOf(dialog)).toBe('review'));
  });

  it('the list cannot be read: the drawer says so, offers Automatic only with a Retry, and the purchase still goes through', async () => {
    const dialog = await openBuy('regions-error');
    expect(within(dialog).getByText(strings['loc.listErr'])).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /retry|try again/i })).toBeInTheDocument();
    expect(radios(dialog).map(textOf)).toEqual([expect.stringMatching(new RegExp(`^${strings['loc.auto'].replace(/[()]/g, '\\$&')}`))]);
    await confirm(dialog);
    await waitFor(() => expect(phaseOf(dialog)).toBe('done'), { timeout: 20000 });
  });

  it('while the list is being read: Automatic alone, and it says the locations are being read', async () => {
    const dialog = await openBuy('regions-loading');
    expect(within(dialog).getByText(strings['loc.loading'])).toBeInTheDocument();
    expect(radios(dialog)).toHaveLength(1);
  });

  it('every location full: each is listed off; Automatic stays the choice', async () => {
    const dialog = await openBuy('regions-all-full');
    const options = radios(dialog);
    expect(options).toHaveLength(5);
    expect(options.slice(1).every((o) => o.disabled)).toBe(true);
    expect(options[0]!.checked).toBe(true);
    // The line under the field says what the plan card says.
    expect(picker(dialog)).toHaveAccessibleDescription(strings['plans.regionsFull']);
    // Automatic promises no room under its name when none has any.
    expect(textOf(options[0]!)).toBe(strings['loc.auto']);
    expect(within(dialog).queryByText(strings['loc.autoHelp'])).toBeNull();
  });

  it('only Buy a plan has the choice: a payment and an upgrade have none', async () => {
    resetUnknownCheckouts();
    await renderPage(page, { path: '/billing?checkout=pay&sub=a1b2c3d4e5f60718293a4b02' });
    const dialog = await screen.findByRole('dialog', undefined, { timeout: 20000 });
    await within(dialog).findByRole('checkbox', undefined, { timeout: 20000 });
    expect(within(dialog).queryByRole('radiogroup', { name: strings['loc.label'] })).toBeNull();
  });
});

describe('an upgrade keeps the server where it is', () => {
  it('the review says the location as a fact, with no picker', async () => {
    resetUnknownCheckouts();
    await renderPage(page, { path: '/billing?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=plan-pro-v2&exact=true' });
    const dialog = await screen.findByRole('dialog', undefined, { timeout: 20000 });
    await within(dialog).findByRole('checkbox', undefined, { timeout: 20000 });
    expect(within(dialog).getByText(fill(strings['loc.stays'], { server: 'n12', place: 'Singapore' }))).toBeInTheDocument();
    expect(within(dialog).queryByRole('radiogroup', { name: strings['loc.label'] })).toBeNull();
  });
});

describe('the Plans view names only locations the read lists with room', () => {
  const card = (name: string) => screen.findByRole('group', { name }, { timeout: 20000 });
  const part = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-plan-part="regions"]')!;
  it('a paid plan: the locations with room, the full one left out; Free has no choice', async () => {
    await renderPage(page, { path: '/billing' });
    const plus = part(await card('Small'));
    const tags = await within(plus).findByRole('list');
    expect(within(tags).getAllByRole('listitem')).toHaveLength(3);
    expect(plus).toHaveTextContent('Helsinki, Finland');
    expect(plus).not.toHaveTextContent('New York');
    expect(part(await card(strings['plans.free']))).toHaveTextContent(strings['plans.regionsNone']);
  });
  it.each([
    ['regions-loading', 'plans.regionsLoading'],
    ['regions-error', 'plans.regionsUnknown'],
    ['regions-all-full', 'plans.regionsFull'],
    ['regions-none', 'plans.regionsFull'],
  ] as const)('%s: the card and the table say so and name no location', async (state, key) => {
    await renderPage(page, { state, path: '/billing' });
    const plus = part(await card('Small'));
    await waitFor(() => expect(plus).toHaveTextContent(strings[key]));
    expect(within(plus).queryByRole('list')).toBeNull();
    expect(document.body).not.toHaveTextContent(/Frankfurt|Helsinki|New York/);
    const table = within(await screen.findByRole('region', { name: strings['plans.cmp.title'] })).getByRole('table');
    expect(table).toHaveTextContent(strings[key]);
  });
  it('no location name is copy any more: the strings hold none', () => {
    expect(Object.keys(strings).filter((k) => /^plans\.region\./.test(k))).toEqual([]);
  });
});

describe('a subscription shows where its server is', () => {
  it('under the server\'s name, from the subscription\'s own region; nothing for one that names none', async () => {
    await renderPage(page, { path: '/billing?view=wallet' });
    const table = await screen.findByRole('table', { name: strings['subs.heading'] }, { timeout: 20000 });
    const rowOf = (text: RegExp) => within(table).getAllByRole('row').find((r) => text.test(r.textContent ?? '')) as HTMLElement;
    expect(rowOf(/fra-7/)).toHaveTextContent('Frankfurt, Germany');
    expect(rowOf(/n12/)).toHaveTextContent('Singapore');
    // The fourth fixture subscription names no region: its row names no place.
    const none = rowOf(/#[0-9a-f]{8}/);
    expect(none).toBeTruthy();
    expect(none).not.toHaveTextContent(/Germany|Singapore|Finland/);
  });
});
