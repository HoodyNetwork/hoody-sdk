// Get a computer: copying is a choice at the top of the form, and the form says when the tools come.
// Copying a computer is a clear choice at the top of the form, not a select in the middle of it ("Start
//     from", then the kit computer picker in the same drawer; create.copy.test.tsx has the copy). Other realms show each
//     realm's computer count and say what adding a realm does (the API: the computer is listed in that realm and can
//     be managed from it; the page's realms question says the list can be changed later in Realms).
// 87: Hoody kit, Developer kit and Hoody AI each have a tooltip (hover and focus). Turning the Hoody kit off asks first
//     and says exactly what stays: SSH and the computer's web addresses (http-/https-), and that the kit can't be added
//     later (the API's update takes no hoody_kit). Kept off only after the person confirms.
import { fixtureWorld } from '@core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Data from './data';
import { computers } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const sent = vi.hoisted(() => ({ calls: [] as { project: string; body: Record<string, unknown> }[] }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  const m = { mutateAsync: (v: { project: string; body: Record<string, unknown> }) => (sent.calls.push(v), Promise.resolve({ outcome: 'done' as const })) };
  return { ...real, useCreate: () => m };
});

const S = strings as Record<string, string>;
const [host, other] = fixtureWorld.realms;

async function openCreate() {
  await renderPage(page, { path: '/computers' });
  await userEvent.click(await screen.findByRole('button', { name: strings['action.get'] }, { timeout: 8000 }));
  return screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
}
async function openMore() {
  const d = await openCreate();
  await userEvent.click(within(d).getByRole('button', { name: new RegExp(`^${strings['create.more']}`) }));
  return d;
}
const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('Get a computer: copy a computer', () => {
  beforeEach(() => { sent.calls = []; });

  it('is the first choice above the name field, not a select in the middle of the form', async () => {
    const d = await openCreate();
    const from = within(d).getByRole('radiogroup', { name: strings['create.from'] });
    expect(before(from, within(d).getByLabelText(strings['field.name']))).toBe(true);
    expect(within(d).queryByRole('button', { name: /Or copy one of your computers/ })).toBeNull();
  }, 40000);

  it('a copy is picked in the same drawer and sends no create', async () => {
    const d = await openCreate();
    await userEvent.click(within(within(d).getByRole('radiogroup', { name: strings['create.from'] })).getByRole('radio', { name: new RegExp(`^${strings['create.fromCopy']}`) }));
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(`${strings['create.copyFrom']}$`) }));
    await userEvent.click((await screen.findAllByRole('radio', { name: new RegExp(`^${computers[0]!.name}`) })).at(-1) as HTMLElement);
    expect(screen.getByRole('dialog', { name: strings['create.title'] })).toBe(d);
    await waitFor(() => expect(within(d).getByRole('button', { name: strings['copyd.go'] })).toBeInTheDocument());
    expect(sent.calls).toEqual([]);
  }, 40000);
});

describe('Get a computer: other realms', () => {
  it('each realm row shows its computer count, and the form says what adding a realm does', async () => {
    const d = await openMore();
    // Every other realm, each with its own exact count (the whole row name: realm name, then count).
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rest = fixtureWorld.realms.filter((r) => r.id !== host!.id);
    expect(rest.length).toBeGreaterThan(1);
    for (const r of rest) {
      const n = fixtureWorld.computers.filter((c) => c.realm_ids.includes(r.id)).length;
      expect(within(d).getByRole('checkbox', { name: new RegExp(`^${esc(r.name)} ${n} computers?$`) })).toBeInTheDocument();
    }
    expect(other).toBeTruthy();
    // What adding a realm does is the answer of the question under the list.
    await userEvent.click(within(d).getByRole('button', { name: S['create.realmsWhy'] ?? '' }));
    expect(within(d).getByText(S['create.realmsHelp'] ?? '', { exact: false })).toHaveTextContent(/lists this computer too/);
    // The link opens the realms answer over the drawer (a peek), and Escape closes only that answer.
    await userEvent.click(within(d).getByRole('link', { name: S['create.realmsFaq'] ?? '' }));
    const dlgs = await screen.findAllByRole('dialog');
    expect(within(dlgs[dlgs.length - 1]!).getByText(S['faq.realmsAndProjects.a'] ?? '')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(within(await screen.findByRole('dialog', { name: strings['create.title'] })).getByRole('link', { name: S['create.realmsFaq'] ?? '' })).toBeInTheDocument();
    expect(host).toBeTruthy();
  }, 40000);
});

describe('Get a computer: feature tooltips and the Hoody kit', () => {
  beforeEach(() => { sent.calls = []; });

  // The words are each switch's own description, never an info button's hover tooltip, which a phone's tap never opens;
  // the form has no info buttons.
  it('Hoody kit, Developer kit and Hoody AI each say what they install in their own description, no info button', async () => {
    const d = await openMore();
    for (const [sw, help] of [['create.hoodyKit', 'create.hoodyKitHelp'], ['create.devKit', 'create.devKitHelp'], ['create.ai', 'create.aiHelp']] as const) {
      expect(within(d).getByRole('switch', { name: strings[sw] })).toHaveAccessibleDescription(strings[help]);
    }
    expect(strings['create.hoodyKitHelp']).toMatch(/can't be added later/);
    expect(strings['create.devKitHelp']).toMatch(/Node\.js/);
    // The form also says when the tools come: when the computer is made.
    expect(strings['create.devKitHelp']).toMatch(/installed when made/);
    expect(strings['create.aiHelp']).toMatch(/free model/);
    expect(within(d).queryByRole('button', { name: /Terminal, files|Node\.js|call Hoody AI/ })).toBeNull();
    expect(strings['create.ai']).toMatch(/Hoody AI/);
  }, 40000);

  it('no help line promises a browser terminal: without the kit there is none', async () => {
    expect(strings['create.sshHelp']).not.toMatch(/terminal/i);
  });

  it('turning the Hoody kit off asks first; Cancel keeps it on and nothing changes', async () => {
    const d = await openMore();
    const kit = () => within(d).getByRole('switch', { name: new RegExp(strings['create.hoodyKit']) });
    const dev = () => within(d).getByRole('switch', { name: new RegExp(strings['create.devKit']) });
    const devBefore = (dev() as HTMLInputElement).checked;
    expect(kit()).toBeChecked();
    await userEvent.click(kit());
    const ask = await screen.findByRole('alertdialog', {}, { timeout: 4000 });
    // Asks first: while the question is open, nothing has changed yet.
    expect(kit()).toBeChecked();
    expect((dev() as HTMLInputElement).checked).toBe(devBefore);
    expect(ask).toHaveTextContent(/SSH/);
    expect(ask).toHaveTextContent(/http-/);
    expect(ask).toHaveTextContent(/later/);
    await userEvent.click(within(ask).getByRole('button', { name: /Cancel/ }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(kit()).toBeChecked();
    expect((dev() as HTMLInputElement).checked).toBe(devBefore);
    expect(sent.calls).toEqual([]);
  }, 40000);

  it('confirmed, the kit goes off and the create sends hoody_kit false', async () => {
    const d = await openMore();
    await userEvent.click(within(d).getByRole('switch', { name: new RegExp(strings['create.hoodyKit']) }));
    const ask = await screen.findByRole('alertdialog', {}, { timeout: 4000 });
    await userEvent.click(within(ask).getByRole('button', { name: S['create.kitOffGo'] ?? 'create.kitOffGo' }));
    expect(within(d).getByRole('switch', { name: new RegExp(strings['create.hoodyKit']) })).not.toBeChecked();
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    await vi.waitFor(() => expect(sent.calls).toHaveLength(1));
    expect(sent.calls[0]!.body.hoody_kit).toBe(false);
  }, 40000);
});
