// New note when the create's answer is lost (C9), in the terminal. The dialog says the note may have gone through and
// offers Check again, which only reads (flows.checkNote); nothing sends the note again while the outcome is unknown. The
// fixture Api is wrapped to count what reaches Notes, so a second create would show. Closing keeps the hold (holds.ts):
// the pending outcome moves to the toast, and New note opens on the held note again, its title locked. A note Check
// again finds ends the dialog and opens the note, with no "may have gone through" toast left behind (NewNote.tsx
// `proven`), and the hand-off names the note's computer.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, queryAllByText, semanticsOf, type Role, type RoleQuery, type SemNode } from '../../term/prim/semantics';
import forms from '../../kit/forms/forms.strings.en.json';
import handoff from '../../kit/states/Handoff.term.strings.en.json';
import notesTerm from './parts/notesTerm.strings.en.json';
import strings from './strings.en.json';

/** atlas, the shell's computer and the one New note goes to (fixtures.ts, fixtureWorld). */
const ATLAS = 'c0a7150000000000000000a1';
const TITLE = 'Q4 plan';
const SEND_AGAIN = 'Send again';

let s: PageSession | null = null;
/** What the page handed the fixture Api: each create send (its id and title), and each read back (Check again). */
let sends: { id: string; name: string }[] = [];
let reads = 0;
let restore: (() => void) | null = null;
afterEach(() => { s?.close(); s = null; restore?.(); restore = null; });

/** afterBoot: the page's fixture Api, counting its sends and reads. fixtures.ts installs the plain one when it first
 *  loads, so it is loaded before ours goes over it; afterEach puts the plain one back. */
async function countCalls(): Promise<void> {
  await import('./fixtures');
  const { fixtureApi } = await import('./fixtureApi');
  const { installFixtureApi } = await import('./fixtureApiSeam');
  sends = [];
  reads = 0;
  // Typed by the seam's own parameter, so the wrapper follows whatever the page's Api holds (every other call as is).
  installFixtureApi(() => {
    const a = fixtureApi();
    return {
      ...a,
      send: (c, nb, body) => { sends.push({ id: body.id, name: body.attributes.name }); return a.send(c, nb, body); },
      node: (c, nb, sent) => { reads++; return a.node(c, nb, sent); },
    };
  });
  restore = () => installFixtureApi(fixtureApi);
}

const tree = (): SemNode[] => {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
};
const all = (role: Role, name: string | RegExp, o: Omit<RoleQuery, 'name'> = {}): SemNode[] => queryAllByRole(tree(), role, { name, ...o });
/** How many text runs say `text` (whole, however the frame wraps it). */
const said = (text: string): number => queryAllByText(tree(), text).length;
function clean(p: PageSession): void {
  expect(p.failures).toEqual([]);
  expect(p.trapsAt).toEqual([]);
}

/** New note, a title typed in its field, Enter (the dialog's primary from a one-line field). */
async function create(title: string): Promise<void> {
  act(all('button', strings['action.new'])[0]!, 'press');
  await s!.settle();
  expect(all('dialog', strings['new.title']).length).toBe(1);
  act(all('textbox', strings['new.field'])[0]!, 'type', title);
  await s!.settle();
  await s!.keys.press('enter');
}

test('a lost answer: "may have gone through", no second send on offer, Check again reads and never sends the note again', async () => {
  s = await renderPage({ page: 'notes', fx: 'createPending', cols: 120, rows: 40, afterBoot: countCalls });
  await s.settle();
  await create(TITLE);
  expect(sends).toHaveLength(1);
  expect(sends[0]!.name).toBe(TITLE);
  expect(said(forms['outcome.pending'])).toBeGreaterThan(0);
  expect(said(strings['new.pending'])).toBeGreaterThan(0);
  // The title that is out stays in its field, off.
  const field = all('textbox', strings['new.field']);
  expect(field).toHaveLength(1);
  expect(field[0]!.states.disabled).toBe(true);
  expect(field[0]!.value).toBe(TITLE);
  // No way to send it a second time is drawn while the outcome is unknown: not even a locked button.
  expect(all('button', SEND_AGAIN)).toHaveLength(0);
  expect(all('button', strings['new.create'])).toHaveLength(0);

  const check = all('button', forms['outcome.check']);
  expect(check).toHaveLength(1);
  act(check[0]!, 'press');
  await s.settle();
  // One read, no second create; not found, so the outcome stays unknown, still in the dialog, still with Check again.
  expect(reads).toBe(1);
  expect(sends).toHaveLength(1);
  expect(said(strings['new.unsure'])).toBeGreaterThan(0);
  expect(all('dialog', strings['new.title'])).toHaveLength(1);
  expect(all('button', forms['outcome.check'])).toHaveLength(1);
  expect(all('button', SEND_AGAIN)).toHaveLength(0);
  clean(s);
}, 180_000);

test('closing keeps the unknown create: the toast offers Check again, and New note opens on it with its title locked', async () => {
  s = await renderPage({ page: 'notes', fx: 'createPending', cols: 120, rows: 40, afterBoot: countCalls });
  await s.settle();
  await create(TITLE);
  expect(said(strings['new.pending'])).toBeGreaterThan(0);
  await s.keys.press('escape');
  await s.settle();
  expect(all('dialog', strings['new.title'])).toHaveLength(0);
  // The pending outcome moved to the sticky toast, its Check again with it (the dialog's is gone).
  expect(said(forms['outcome.toastTitle'])).toBeGreaterThan(0);
  expect(all('button', forms['outcome.check'])).toHaveLength(1);

  act(all('button', strings['action.new'])[0]!, 'press');
  await s.settle();
  expect(all('dialog', strings['new.title'])).toHaveLength(1);
  const field = all('textbox', strings['new.field']);
  expect(field).toHaveLength(1);
  expect(field[0]!.states.disabled).toBe(true);
  expect(field[0]!.value).toBe(TITLE);
  expect(said(strings['new.unsure'])).toBeGreaterThan(0);
  expect(all('button', SEND_AGAIN)).toHaveLength(0);
  expect(all('button', strings['new.create'])).toHaveLength(0);
  expect(all('button', strings['new.allowAgainShort'])).toHaveLength(1);
  // Nothing was sent or read on the way: the close and the reopen only show the hold.
  expect(sends).toHaveLength(1);
  expect(reads).toBe(0);
  clean(s);
}, 180_000);

test('Check again finds the note: the dialog ends, the note opens, nothing was sent twice and no toast is left', async () => {
  const opened: string[] = [];
  s = await renderPage({ page: 'notes', fx: 'createFound', cols: 120, rows: 40, afterBoot: countCalls, openExternal: (u) => { opened.push(u); } });
  await s.settle();
  await create(TITLE);
  expect(said(strings['new.pending'])).toBeGreaterThan(0);
  act(all('button', forms['outcome.check'])[0]!, 'press');
  const frame = await s.settle();
  expect(reads).toBe(1);
  expect(sends).toHaveLength(1);
  expect(all('dialog', strings['new.title'])).toHaveLength(0);
  // Proven, so its pending outcome never follows the dialog out as a "may have gone through" toast.
  expect(said(forms['outcome.toastTitle'])).toBe(0);
  // The note opens beside the list: its title, and the terminal's hand-off in the frame's place.
  expect(frame).toContain(TITLE);
  expect(said(notesTerm['term.note.reason'])).toBeGreaterThan(0);
  // The hand-off's link names the note's computer (atlas, in the shell's list), and lands on the Notes page.
  act(all('button', handoff['handoff.open'])[0]!, 'press');
  await s.settle();
  expect(opened).toHaveLength(1);
  expect(opened[0]).toContain(`computer=${ATLAS}`);
  expect(opened[0]!.endsWith('#/notes')).toBe(true);
  clean(s);
}, 180_000);
