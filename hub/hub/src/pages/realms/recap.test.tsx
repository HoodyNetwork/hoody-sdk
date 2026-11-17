// The summary rail lists every picked computer by name with its colour mark, never a
// count alone; past 8 picks the list scrolls inside the rail and is a keyboard stop. The done step recaps what was made: the realm's name, its colour (by name) and the computers that
// joined it, or None. Only a computer proved in the realm is listed; one refused (or still unknown) is left out, and
// the count lines say so. A run made in full goes straight on to the new realm (endlinks.test.tsx), so these
// are the ends that stay on the results.
import { beforeEach, describe, expect, it } from 'vitest';
import { computerColor, fixtureWorld, worldColours } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { MANY_EXTRA, manyExtra, resetRealmsWorld } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const T = 8000;
const [ATLAS, BOREALIS, CEDAR] = fixtureWorld.computers;
if (!ATLAS || !BOREALIS || !CEDAR) throw new Error('fixture computers');

async function named(name: string) {
  const field = await screen.findByLabelText(strings['name.label'], undefined, { timeout: T });
  await waitFor(() => expect(screen.getByRole('button', { name: strings.next })).toBeEnabled(), { timeout: T });
  await userEvent.type(field, name);
  await userEvent.click(screen.getByRole('button', { name: strings.next }));
}
const pick = async (name: string) => {
  const row = await waitFor(() => {
    // The table's row (the rail lists picked names too).
    const r = screen.getAllByText(name).map((el) => el.closest<HTMLElement>('[data-row-id]')).find((x) => x) ?? null;
    expect(r, name).not.toBeNull();
    return r as HTMLElement;
  }, { timeout: T });
  await userEvent.click(within(row).getByRole('checkbox'));
};
const create = async () => {
  await userEvent.click(screen.getByRole('button', { name: strings.next }));
  await userEvent.click(await screen.findByRole('button', { name: strings.create }));
};
/** A fact's value by its label, inside `root`. */
const fact = (root: HTMLElement, label: string) => {
  const term = within(root).getByText(label, { selector: 'dt' });
  const value = term.nextElementSibling ?? term.parentElement?.nextElementSibling;
  if (!value) throw new Error(`no value for ${label}`);
  return value as HTMLElement;
};
const doneSection = async (title: string) => (await screen.findByRole('heading', { name: title }, { timeout: T })).closest('section') as HTMLElement;
const railColour = () => fact(screen.getByRole('heading', { name: strings['summary.title'] }).closest('section') as HTMLElement, strings['summary.color']).textContent;

beforeEach(() => resetRealmsWorld());

const toComputers = async (state?: string) => {
  await renderPage(page, { path: '/realms/new', ...(state ? { state } : {}) });
  await named('Studio');
};
const rail = () => screen.getByRole('heading', { name: strings['summary.title'] }).closest('section') as HTMLElement;
const pickedList = () => within(rail()).getByRole('list', { name: strings['summary.picked'] });
const names = () => within(pickedList()).getAllByRole('listitem').map((li) => li.textContent?.trim());
/** Each listed computer's mark colour, null where it draws none. */
const marks = () => within(pickedList()).getAllByRole('listitem').map((li) => li.querySelector('[data-computer-color]')?.getAttribute('data-computer-color') ?? null);
/** The many state's computers: the world's, with their colours, and the extra ones. */
const manyAll = (): { name: string; color: string | null }[] => [
  ...fixtureWorld.computers.map((c) => ({ name: c.name, color: computerColor({ color: worldColours[c.name] }) })),
  ...manyExtra.map((x) => ({ name: x.name, color: computerColor({ color: x.color }) })),
];
const waitMany = () => waitFor(() => expect(screen.getByText('node-01')).toBeInTheDocument(), { timeout: T });

describe('the summary rail names the picked computers', () => {
  it('one pick: the count and the computer by name, with its colour mark', async () => {
    await toComputers('colours');
    await pick(ATLAS.name);
    const v = fact(rail(), strings['summary.computers']);
    expect(v).toHaveTextContent(strings['summary.count_one'].replace('{{count}}', '1'));
    expect(names()).toEqual([ATLAS.name]);
    expect(within(pickedList()).getByRole('listitem').querySelector('[data-computer-color]')).not.toBeNull();
  });

  it('several picks: every name, in the table\'s order; the list is not a scroll stop', async () => {
    await toComputers();
    const three = fixtureWorld.computers.slice(0, 3).map((c) => c.name);
    for (const n of three) await pick(n);
    expect(fact(rail(), strings['summary.computers'])).toHaveTextContent(strings['summary.count_other'].replace('{{count}}', '3'));
    expect(names()).toEqual(three);
    expect(pickedList()).not.toHaveAttribute('tabindex');
  });

  it('many picks: every name is listed, in the table\'s order, each with its own colour mark; the list scrolls and takes keyboard focus', async () => {
    await toComputers('many');
    const all = manyAll();
    expect(all).toHaveLength(fixtureWorld.computers.length + MANY_EXTRA);
    await waitMany();
    // Picked in reverse: the rail keeps the table's order (by name), not the order of the picks.
    for (const c of [...all].reverse()) await pick(c.name);
    expect(fact(rail(), strings['summary.computers'])).toHaveTextContent(strings['summary.count_other'].replace('{{count}}', String(all.length)));
    const sorted = [...all].sort((a, b) => a.name.localeCompare(b.name));
    expect(names()).toEqual(sorted.map((c) => c.name));
    // Every mark is the computer's own colour (cedar's is not a colour: no mark); the long name is whole.
    expect(marks()).toEqual(sorted.map((c) => c.color));
    expect(marks().filter((m) => m !== null).length).toBeGreaterThan(MANY_EXTRA);
    expect(names()).toContain('node-16-build-and-release-runner-eu-west-long-name');
    expect(pickedList()).toHaveAttribute('tabindex', '0');
  }, 120000);

  it('the scroll point: 8 picks are a plain list, the 9th makes it a scroll stop, and taking one back undoes it', async () => {
    await toComputers('many');
    await waitMany();
    const nine = manyAll().slice(0, 9).map((c) => c.name);
    for (const n of nine.slice(0, 8)) await pick(n);
    expect(names()).toHaveLength(8);
    expect(pickedList()).not.toHaveAttribute('tabindex');
    await pick(nine[8]!);
    expect(names()).toHaveLength(9);
    expect(pickedList()).toHaveAttribute('tabindex', '0');
    await pick(nine[8]!);
    expect(names()).toHaveLength(8);
    expect(pickedList()).not.toHaveAttribute('tabindex');
  }, 120000);
});

describe('the done step says what was made', () => {
  it('a computer that joined is listed by name, with the realm\'s name and colour', async () => {
    await renderPage(page, { path: '/realms/new', state: 'computerHeld' });
    await named('Studio');
    await pick(ATLAS.name);
    const colour = railColour();
    expect(colour).toBeTruthy();
    await create();
    const done = await doneSection(strings['done.ok'].replace('{{name}}', 'Studio'));
    expect(fact(done, strings['summary.name'])).toHaveTextContent('Studio');
    expect(fact(done, strings['summary.color']).textContent).toBe(colour);
    expect(fact(done, strings['done.joined'])).toHaveTextContent(ATLAS.name);
  });

  it('a refused computer is left out: Computers added says None, and the count line says it is not in the realm', async () => {
    await renderPage(page, { path: '/realms/new', state: 'computerRefused' });
    await named('Studio');
    await pick(ATLAS.name);
    await create();
    const done = await doneSection(strings['done.made'].replace('{{name}}', 'Studio'));
    expect(fact(done, strings['done.joined'])).toHaveTextContent(strings['done.joinedNone']);
    expect(fact(done, strings['done.joined'])).not.toHaveTextContent(ATLAS.name);
    expect(within(done).getByText(strings['count.refused_one'].replace('{{count}}', '1'))).toBeInTheDocument();
  });

  it('mixed ends: only the computer that joined is listed; the unknown and the refused ones keep their count lines', async () => {
    await renderPage(page, { path: '/realms/new', state: 'computerMixed' });
    await named('Studio');
    for (const c of [ATLAS, BOREALIS, CEDAR]) await pick(c.name);
    await create();
    const done = await doneSection(strings['done.made'].replace('{{name}}', 'Studio'));
    const joined = fact(done, strings['done.joined']);
    await waitFor(() => expect(within(done).getByText(strings['count.unknown_one'].replace('{{count}}', '1'))).toBeInTheDocument(), { timeout: T });
    expect(joined.textContent?.trim()).toBe(ATLAS.name);
    expect(joined).not.toHaveTextContent(BOREALIS.name);
    expect(joined).not.toHaveTextContent(CEDAR.name);
    expect(within(done).getByText(strings['count.refused_one'].replace('{{count}}', '1'))).toBeInTheDocument();
  });

  it('only unknown ends: Computers added says None, beside the line that it may have been added', async () => {
    await renderPage(page, { path: '/realms/new', state: 'computerUnknown' });
    await named('Studio');
    await pick(ATLAS.name);
    await create();
    const done = await doneSection(strings['done.made'].replace('{{name}}', 'Studio'));
    await waitFor(() => expect(within(done).getByText(strings['count.unknown_one'].replace('{{count}}', '1'))).toBeInTheDocument(), { timeout: T });
    expect(fact(done, strings['done.joined'])).toHaveTextContent(strings['done.joinedNone']);
    expect(fact(done, strings['done.joined'])).not.toHaveTextContent(ATLAS.name);
  });
});
