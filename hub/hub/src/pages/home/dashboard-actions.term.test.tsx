// Home's dashboard actions in a terminal: Needs you, Your realms and Customize.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Needs you names the computer that needs a look and the waiting Bot; Open goes to Computers, Review to Bots | 'Needs you: … leads to …' |
// | 2 | Pressing a realm in Your realms shows that realm: the top bar names it, the card marks it Showing | 'Your realms: …' |
// | 3 | Customize: a card switched off leaves Home and stays off; Reset to default brings it back | 'Customize: …' |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, semanticsOf, type SemNode } from '../../term/prim/semantics';
import bots from '../bots/strings.en.json';
import computers from '../computers/strings.en.json';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const flat = (ns: readonly SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
const says = (text: string): boolean => flat(tree()).some((n) => n.name.includes(text) || (n.description ?? '').includes(text));
const named = (name: string, role?: string, within: readonly SemNode[] = tree()): SemNode[] => flat(within).filter((n) => n.name === name && (!role || n.role === role));
async function until(ok: () => boolean): Promise<void> { for (let i = 0; i < 8 && !ok(); i++) await s!.settle(); }
async function press(n: SemNode | undefined): Promise<void> {
  expect(n).toBeDefined();
  act(n!, 'press');
  await s!.settle();
}
function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
  expect(s!.frame).not.toContain('could not be drawn');
}
/** The top bar's first line: the page title and the realm shown. */
const top = (): string => s!.frame.split('\n')[0] ?? '';
/** The page header's title (the top bar names no page). */
const pageTitle = (): string => flat(tree()).filter((n) => n.role === 'heading' && n.level === 1).map((n) => n.name ?? '').join(' ');

// The fixture realm holds a computer that needs a look (ember, failed) and a running computer's Bot waits at a gate.
for (const [action, page] of [[strings['needs.computers.action'], computers.title], [strings['needs.bots.action'], bots.title]] as const) {
  test(`Needs you: "${action}" leads to ${page}`, async () => {
    s = await renderPage({ page: 'home', fx: 'attention', cols: 120, rows: 40 });
    await s.settle();
    clean();
    expect(says(strings['needs.title'])).toBe(true);
    expect(says(strings['needs.computer'].replace('{{name}}', 'ember'))).toBe(true);
    expect(says(strings['needs.bots_one'])).toBe(true);
    expect(pageTitle()).not.toContain(page);
    // Needs you comes before the cards, so its action is the first of that name.
    await press(named(action, 'link')[0]);
    await until(() => pageTitle().includes(page));
    expect(pageTitle()).toContain(page);
  }, 240_000);
}

// The fixture account's realms, in the card's order (core/world.ts): Personal, Acme client, Lab.
test('Your realms: pressing a realm shows it; the top bar names it and the card marks it Showing', async () => {
  s = await renderPage({ page: 'home', cols: 120, rows: 40 });
  await s.settle();
  clean();
  // A realm's name in the card is the button that shows it.
  const realm = (name: string): SemNode | undefined =>
    named(name).find((n) => n.actions.includes('press') && n.actions.includes('focus'));
  // The card sits below the fold at 120x40 (the cards before it fill the screen). Focusing its last realm scrolls the
  // page to it, as Tab does, and the rows above that one stay in view with the card's title.
  async function reveal(): Promise<void> {
    const last = realm('Lab');
    expect(last).toBeDefined();
    act(last!, 'focus');
    await s!.settle();
  }
  // A realm's row in the card, from its name on (two realms may share a line): read below the card's title, so the top
  // bar and the realm line under the greeting, which also name the realm, are never read.
  const row = (name: string): string => {
    const lines = s!.frame.split('\n');
    const head = lines.findIndex((l) => l.includes(strings['realms.title']));
    expect(head).toBeGreaterThan(-1);
    const l = lines.find((x, i) => i > head && x.includes(name)) ?? '';
    expect(l).toContain(name);
    return l.slice(l.indexOf(name));
  };
  const shown = (name: string): RegExp => new RegExp(`^${name}\\s+${strings['realms.showing']}`);
  expect(top()).toContain('Personal');
  await reveal();
  expect(row('Personal')).toMatch(shown('Personal'));
  expect(row('Acme client')).not.toMatch(shown('Acme client'));
  await press(realm('Acme client'));
  await until(() => top().includes('Acme client'));
  expect(top()).toContain('Acme client');
  expect(top()).not.toContain('Personal');
  // Home is drawn again for the realm shown: bring the card back into view.
  await reveal();
  expect(row('Acme client')).toMatch(shown('Acme client'));
  expect(row('Personal')).not.toMatch(shown('Personal'));
  clean();
}, 240_000);

test('Customize: a card switched off leaves Home and stays off; Reset to default brings it back', async () => {
  s = await renderPage({ page: 'home', path: '/home?customize=1', cols: 120, rows: 40 });
  await s.settle();
  clean();
  const drawer = (): SemNode | undefined => flat(tree()).find((n) => n.role === 'dialog' && n.name === strings['customize.title']);
  const inDrawer = (name: string): SemNode | undefined => { const d = drawer(); return d ? named(name, 'button', [d])[0] : undefined; };
  // The card's switch in the Customize list is named by the card.
  const toggle = (): SemNode | undefined => named(strings['actions.title'], 'switch')[0];
  expect(drawer()).toBeDefined();
  expect(toggle()?.states.checked).toBe(true);
  await press(toggle());
  expect(toggle()?.states.checked).toBe(false);
  await press(inDrawer(strings['customize.done']));
  await until(() => drawer() === undefined);
  expect(drawer()).toBeUndefined();
  // The card is gone from Home: none of its tiles' words are left.
  expect(says(strings['actions.bot.body'])).toBe(false);

  // Customize again from the header: the card is still off.
  await press(named(strings['action.customize'], 'button')[0]);
  await until(() => drawer() !== undefined);
  expect(toggle()?.states.checked).toBe(false);
  await press(inDrawer(strings['customize.reset']));
  expect(toggle()?.states.checked).toBe(true);
  await press(inDrawer(strings['customize.done']));
  await until(() => drawer() === undefined);
  expect(says(strings['actions.bot.body'])).toBe(true);
  clean();
}, 240_000);
