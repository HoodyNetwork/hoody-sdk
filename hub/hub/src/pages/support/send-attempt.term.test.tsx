// Support's sends in a terminal (C9), through the fixtures' request log: a ticket create and a reply whose answer is
// lost are held, never called failed, never sent again; Check again only reads (a list or a thread GET) and says what it
// found; a duplicate is a definite refusal with its wait; a close whose answer is lost is held the same way and the menu
// stops offering Close. Every "not drawn" or "not sent" check has a positive control on the same screen.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import overlays from '../../kit/overlays/strings.en.json';
import kit from '../../kit/strings.en.json';
import { act, queryAllByRole, semanticsOf, type Role, type SemNode } from '../../term/prim/semantics';
import { requestLog } from './fixtures';
import strings from './strings.en.json';

let s: PageSession | null = null;
beforeEach(() => { requestLog.length = 0; });
afterEach(() => { s?.close(); s = null; });

/** T_OPEN of the fixtures: "Invoice shows the wrong country", billing, waiting for support. */
const OPEN = '0000000000000000' + (0x6720a1b2 + 2).toString(16);
const PENDING = kit['outcome.pending.title'];
const FAILED = kit['outcome.failed.title'];
const CHECK = kit['outcome.pending.check'];
/** A sentence's words before its first {{variable}} (the time a result line carries is the test's clock). */
const head = (key: keyof typeof strings): string => strings[key].split('{{')[0]!;

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const all = (role: Role, name: string | RegExp): SemNode[] => queryAllByRole(tree(), role, { name });
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
/** Whether the screen draws these words (a text or a control's name or description; a field's value is not counted). */
const says = (text: string): boolean => flat(tree()).some((n) => n.role !== 'textbox' && (n.name.includes(text) || (n.description ?? '').includes(text)));
const sent = (route: (typeof requestLog)[number]['route']) => requestLog.filter((r) => r.route === route);
async function one(role: Role, name: string | RegExp): Promise<SemNode> {
  let n = all(role, name)[0];
  for (let i = 0; i < 5 && !n; i++) { await s!.settle(); n = all(role, name)[0]; }
  expect(n).toBeDefined();
  return n!;
}
async function press(role: Role, name: string | RegExp): Promise<void> {
  act(await one(role, name), 'press');
  await s!.settle();
}
async function until(ok: () => boolean): Promise<void> {
  for (let i = 0; i < 5 && !ok(); i++) await s!.settle();
}
/** Focus a field, let it draw focused, then type as keys: an engine field takes keys only once it draws focused, so
 *  act(…, 'type') (focus and keys in one go) loses them. */
async function typeInto(field: SemNode, text: string): Promise<void> {
  act(field, 'focus');
  await s!.settle();
  await s!.keys.type(text);
}
function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
  expect(s!.placeholders.rendered).toEqual([]);
}

/** A control of the New ticket drawer: the list behind it has column headers with the same words (Category, Subject). */
async function inDrawer(role: Role, name: string | RegExp): Promise<SemNode> {
  const d = await one('dialog', strings['new.title']);
  const n = queryAllByRole([d], role, { name })[0];
  expect(n, `${role} ${String(name)} in ${strings['new.title']}`).toBeDefined();
  return n!;
}

/** The New ticket drawer filled in: Billing (typeahead on the closed select), a subject, a message. */
async function fillNewTicket(subject: string, body: string): Promise<void> {
  // The Select's trigger is named by the shown value and the label (kit/forms/more.term.tsx): "Choose… Category".
  const category = () => inDrawer('button', new RegExp(`${strings['new.category']}$`));
  await typeInto(await category(), 'b');
  expect((await category()).name).toBe(`${strings['category.billing']} ${strings['new.category']}`);
  await typeInto(await inDrawer('textbox', strings['new.subject']), subject);
  await typeInto(await inDrawer('textbox', strings['new.message']), body);
  expect((await inDrawer('textbox', strings['new.subject'])).value).toBe(subject);
  expect((await inDrawer('textbox', strings['new.message'])).value).toBe(body);
}

async function reply(words: string): Promise<void> {
  await typeInto(await one('textbox', strings['reply.label']), words);
  // The words are in the box (the positive control for every later "not sent" or "kept" check).
  expect((await one('textbox', strings['reply.label'])).value).toBe(words);
  await press('button', strings['action.send']);
}

test('a ticket create whose answer is lost is held: never failed, Check again reads the list only, Send ticket stays inert', async () => {
  s = await renderPage({ page: 'support', fx: 'sendUnknown', cols: 120, rows: 40, path: '/support?new=1' });
  await s.settle();
  await fillNewTicket('Card charged twice', 'Two charges on the same day for one plan.');
  await press('button', strings['action.sendTicket']);
  await until(() => says(strings['send.known']));

  const creates = sent('create');
  expect(creates.length).toBe(1);
  const body = creates[0]!.body as Record<string, unknown>;
  expect(body.category).toBe('billing');
  expect(body.subject).toBe('Card charged twice');
  expect(body.body).toBe('Two charges on the same day for one plan.');
  expect(typeof body.client_key).toBe('string');
  expect(says(PENDING)).toBe(true);
  expect(says(strings['send.known'])).toBe(true);
  expect(says(FAILED)).toBe(false);
  // The draft is locked while held: the fields still show it.
  expect((await inDrawer('textbox', strings['new.subject'])).value).toBe('Card charged twice');

  const lists = sent('list').length;
  await press('button', CHECK);
  await until(() => says(head('send.none')));
  expect(says(head('send.none'))).toBe(true);
  expect(sent('list').length).toBeGreaterThan(lists);
  expect(sent('create').length).toBe(1);
  expect(says(PENDING)).toBe(true);

  // Send ticket is off while the create is held; a click on it (as a person would try) sends nothing.
  const again = await one('button', strings['action.sendTicket']);
  expect(again.states.disabled).toBe(true);
  act(again, 'click', undefined, { force: true });
  await s.settle();
  expect(sent('create').length).toBe(1);
  clean();
}, 240_000);

test('a lost create the server stored: Check again shows the possible match and Open it, and still settles nothing', async () => {
  s = await renderPage({ page: 'support', fx: 'sendUnknownApplied', cols: 120, rows: 40, path: '/support?new=1' });
  await s.settle();
  await fillNewTicket('Refund for the old plan', 'I moved plans and was charged for both.');
  await press('button', strings['action.sendTicket']);
  await until(() => says(strings['send.known']));
  expect(sent('create').length).toBe(1);
  await press('button', CHECK);
  await until(() => says(head('send.match')));
  expect(says(head('send.match'))).toBe(true);
  expect(says(strings['send.matchLink'])).toBe(true);
  // A match is a hint: the banner (what we know, Check again) stays and nothing is sent again.
  expect(says(strings['send.known'])).toBe(true);
  expect(says(PENDING)).toBe(true);
  expect(says(FAILED)).toBe(false);
  expect(sent('create').length).toBe(1);
  expect(sent('get').length).toBeGreaterThan(0);
  clean();
}, 240_000);

test('a duplicate reply (409 SUPPORT_DUPLICATE) is refused in its own words with the wait, and the text stays to edit', async () => {
  s = await renderPage({ page: 'support', fx: 'duplicate', cols: 120, rows: 40, path: `/support?sel=${OPEN}` });
  await s.settle();
  const words = 'Is there any news on this?';
  await reply(words);
  await until(() => says(strings['error.duplicate']));
  expect(sent('reply').length).toBe(1);
  expect(says(strings['error.duplicate'])).toBe(true);
  expect(says(strings['error.duplicateWait'].replace('{{duration}}', strings['wait.seconds_other'].replace('{{count}}', '42')))).toBe(true);
  expect(says(FAILED)).toBe(true);
  // Definite: no pending banner, the words are not drawn as a message, and the box keeps the text.
  expect(says(strings['send.known'])).toBe(false);
  expect(says(words)).toBe(false);
  expect((await one('textbox', strings['reply.label'])).value).toBe(words);
  clean();
}, 240_000);

test('a reply whose answer is lost is held: Check again reads the thread only and says it found nothing', async () => {
  s = await renderPage({ page: 'support', fx: 'sendUnknown', cols: 120, rows: 40, path: `/support?sel=${OPEN}` });
  await s.settle();
  const words = 'Here is the invoice number you asked for.';
  await reply(words);
  await until(() => says(strings['send.known']));
  expect(sent('reply').length).toBe(1);
  expect(says(PENDING)).toBe(true);
  expect(says(FAILED)).toBe(false);
  // Locked while held: the box shows the draft read-only and Send is off.
  expect((await one('textbox', strings['reply.label'])).value).toBe(words);
  expect((await one('button', strings['action.send'])).states.disabled).toBe(true);

  const gets = sent('get').length;
  await press('button', CHECK);
  await until(() => says(head('send.none')));
  expect(says(head('send.none'))).toBe(true);
  expect(sent('get').length).toBeGreaterThan(gets);
  expect(sent('reply').length).toBe(1);
  expect(says(PENDING)).toBe(true);
  clean();
}, 240_000);

test('a close whose answer is lost is held: Check again reads the ticket, it is still open, and the menu offers no Close', async () => {
  s = await renderPage({ page: 'support', fx: 'closeLostOpen', cols: 120, rows: 40, path: `/support?sel=${OPEN}` });
  await s.settle();
  // The thread's own ⋯ (the detail pane is the right one at 120 columns).
  const more = async (): Promise<SemNode> => {
    await one('button', overlays.more);
    return all('button', overlays.more).sort((a, b) => b.box[0] - a.box[0])[0]!;
  };
  act(await more(), 'press');
  await s.settle();
  await press('menuitem', strings['action.close']);
  expect(says(strings['close.title'])).toBe(true);
  await press('button', strings['close.confirm']);
  await until(() => says(strings['close.unknown']));
  expect(sent('close').length).toBe(1);
  expect(says(strings['close.unknown'])).toBe(true);
  expect(says(PENDING)).toBe(true);
  expect(says(FAILED)).toBe(false);

  const gets = sent('get').length;
  await press('button', CHECK);
  await until(() => says(head('close.stillOpen')));
  expect(says(head('close.stillOpen'))).toBe(true);
  expect(sent('get').length).toBeGreaterThan(gets);
  expect(sent('close').length).toBe(1);

  // The menu again: Copy ticket reference is there (positive control), Close ticket… is not.
  act(await more(), 'press');
  await s.settle();
  expect(all('menuitem', strings['action.copyRef']).length).toBe(1);
  expect(all('menuitem', strings['action.close']).length).toBe(0);
  await s.keys.press('escape');
  expect(sent('close').length).toBe(1);
  clean();
}, 240_000);
