// Vitest: the Link tab's At a glance block, the link's four facts said once: its state, its keys
// "N of max" with a meter, its call limits and whether other websites may call it. Keys not read whole say "Can't
// tell", never a count; the facts the old Limits section and fact strip repeated are gone from the rest of the tab.
import { renderPage, screen, userEvent, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { KEYS_MAX } from './logic';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const glance = async (state?: string) => {
  await renderPage(page, { ...(state ? { state } : {}), path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=link` });
  const head = await screen.findByRole('heading', { name: strings['linkGlance.title'] });
  return within(head.closest('section') as HTMLElement);
};
/** The value shown beside a fact's label. */
const fact = (g: ReturnType<typeof within>, key: keyof typeof strings) => (g.getByText(strings[key], { exact: true }).nextElementSibling as HTMLElement | null)?.textContent ?? '';

describe('the Link tab at a glance', () => {
  it('says the link state, the keys of the most it holds with a meter, the limits and other websites', async () => {
    const g = await glance();
    expect(fact(g, 'linkGlance.link')).toBe(strings['link.status.active']);
    // Every key counts toward the most a link holds, an expired one too (the fixture's third key): 3 of 20.
    expect(fact(g, 'linkGlance.keys')).toContain(`3 of ${KEYS_MAX}`);
    expect(g.getByRole('meter', { name: `3 of ${KEYS_MAX} keys` })).toHaveAttribute('aria-valuenow', String((3 / KEYS_MAX) * 100));
    expect(fact(g, 'linkGlance.limits')).toBe('60 / min per key, 120 / min in all');
    expect(fact(g, 'linkGlance.cors')).toBe(strings['link.cors.on']);
  });

  it('the Keys table runs to the edges of its card like the Addresses table (it once sat inset)', async () => {
    await glance();
    const body = (id: string) => document.querySelector(`#${id} [class*="panelBody"]`)?.className ?? '';
    expect(body('bot-link-addresses')).toMatch(/flush/);
    expect(body('bot-link-keys')).toMatch(/flush/);
  });

  it('says the link\'s own limits, not the defaults', async () => {
    const g = await glance('linkLimits');
    expect(fact(g, 'linkGlance.limits')).toBe('30 / min per key, 90 / min in all');
  });

  it('a full link: 20 of 20, the meter full, and New key says why it is off', async () => {
    const g = await glance('keysFull');
    expect(fact(g, 'linkGlance.keys')).toContain(`${KEYS_MAX} of ${KEYS_MAX}`);
    expect(g.getByRole('meter')).toHaveAttribute('aria-valuenow', '100');
    const newKey = screen.getByRole('button', { name: strings['keys.new'] });
    expect(newKey).toHaveAttribute('aria-disabled', 'true');
  });

  it('keys not read: "Can\'t tell", no meter, no keys table and no "No keys yet"', async () => {
    const g = await glance('keysUnknown');
    expect(fact(g, 'linkGlance.keys')).toBe(strings['linkGlance.cantTell']);
    expect(g.queryByRole('meter')).toBeNull();
    expect(await screen.findByText(strings['keys.unknown'])).toBeInTheDocument();
    expect(screen.queryByText(strings['keys.empty'])).toBeNull();
    expect(screen.queryByRole('table', { name: /keys?$/ })).toBeNull();
  });

  it('a link turned off says Off in the glance', async () => {
    expect(fact(await glance('linkOff'), 'linkGlance.link')).toBe(strings['link.status.disabled']);
  });

  it('a frozen link says Frozen in the glance and, beside it, why and what to do; the reason is not said a second time below', async () => {
    const g = await glance('linkFrozen');
    expect(fact(g, 'linkGlance.link')).toBe(strings['link.status.frozen']);
    expect(fact(g, 'linkGlance.frozenWhy')).toBe(`The account has an unpaid balance. ${strings['linkGlance.frozenNext']}`);
    expect(screen.getAllByText(/The account has an unpaid balance\./)).toHaveLength(1);
  });

  it('a change still going out is said in the glance, once', async () => {
    const g = await glance('linkPropagating');
    expect(fact(g, 'linkGlance.change')).toBe('Applying: 1 of 3 computers done');
    expect(screen.getAllByText('Applying: 1 of 3 computers done')).toHaveLength(1);
  });

  it('a link that is not frozen has no such fact', async () => {
    const g = await glance('linkOff');
    expect(g.queryByText(strings['linkGlance.frozenWhy'])).toBeNull();
  });

  it('each fact shows once: no second state, limits or websites line, and no "Answers from" (the header names the computer)', async () => {
    await glance();
    expect(screen.getAllByText('60 / min per key, 120 / min in all')).toHaveLength(1);
    expect(screen.queryByText('Answers from')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText('Limits and allowed websites')).toBeNull();
  });
});

describe('the Link tab sections and their head actions', () => {
  it('reads At a glance, Keys, Addresses in that order', async () => {
    await glance();
    const titles = screen.getAllByRole('heading').map((h) => h.textContent);
    const at = (s: string) => titles.indexOf(s);
    expect(at(strings['linkGlance.title'])).toBeGreaterThanOrEqual(0);
    expect(at(strings['linkGlance.title'])).toBeLessThan(at(strings['keys.heading']));
    expect(at(strings['keys.heading'])).toBeLessThan(at(strings['addr.title']));
  });

  it('the link controls are in the Addresses head: Limits and websites, then Re-point, Turn link off and Panic (last, red) in its menu', async () => {
    await glance();
    const head = within(screen.getByRole('heading', { name: strings['addr.title'] }).closest('header') as HTMLElement);
    expect(head.getByRole('button', { name: strings['addr.limits'] })).toBeInTheDocument();
    await userEvent.click(head.getByRole('button', { name: 'More actions' }));
    const items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent ?? '');
    expect(items[0]).toMatch(new RegExp(`^${strings['link.repoint'].replace('…', '')}`));
    expect(items[1]).toMatch(new RegExp(`^${strings['addr.turnOff']}`));
    expect(items[items.length - 1]).toMatch(new RegExp(`^${strings['panic.button']}`));
    // Red only here, in the menu: the Panic item carries the danger tone, the others do not.
    expect(screen.getByRole('menuitem', { name: new RegExp(`^${strings['panic.button']}`) }).className).toMatch(/danger/);
    expect(screen.getByRole('menuitem', { name: new RegExp(`^${strings['link.repoint'].replace('…', '')}`) }).className).not.toMatch(/danger/);
  });

  it('a link that is off offers Turn link on in the menu, with no confirmation', async () => {
    await glance('linkOff');
    const head = within(screen.getByRole('heading', { name: strings['addr.title'] }).closest('header') as HTMLElement);
    await userEvent.click(head.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('menuitem', { name: new RegExp(`^${strings['addr.turnOff']}`) })).toBeNull();
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['addr.turnOn'] }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('Panic from the Addresses menu asks first and says what stops', async () => {
    await glance();
    const head = within(screen.getByRole('heading', { name: strings['addr.title'] }).closest('header') as HTMLElement);
    await userEvent.click(head.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['panic.button']}`) }));
    const dialog = await screen.findByRole('alertdialog', { name: strings['panic.confirmTitle'] });
    expect(within(dialog).getByRole('button', { name: strings['panic.confirm'] })).toBeInTheDocument();
  });

  it('a key row has Edit on the row, and Pause, Rotate and Revoke in its menu, Revoke last', async () => {
    await glance();
    const table = screen.getByRole('table', { name: /^\d+ keys?$/ });
    const row = within(table).getByRole('row', { name: /website widget/ });
    expect(within(row).getByRole('button', { name: strings['key.edit'] })).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    const items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent ?? '');
    expect(items.some((x) => x.startsWith(strings['key.edit']))).toBe(false);
    expect(items[0]).toMatch(new RegExp(`^${strings['key.pause']}`));
    expect(items[items.length - 1]).toMatch(new RegExp(`^${strings['key.revoke']}`));
  });
});
