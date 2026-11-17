// New note's definite answers in the terminal, and how the dialog is reached. A create that definitely did not apply
// (nothing sent, Notes refused it) says so in the dialog and gives the title back: the field can be typed again and the
// primary is Create, never Send again or Check again; Create then sends a new note with a new id. A 409 (the id was
// taken) is the one resend the flow makes, under a new id (flows.createNote), and the note it makes opens. The command
// palette's `/notes?new=1` opens New note once and drops the key, so closing it leaves it closed. The fixture Api is
// wrapped to count what reaches Notes.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, queryAllByText, semanticsOf, type Role, type RoleQuery, type SemNode } from '../../term/prim/semantics';
import forms from '../../kit/forms/forms.strings.en.json';
import strings from './strings.en.json';

const TITLE = 'Q4 plan';

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
  expect(all('dialog', strings['new.title'])).toHaveLength(1);
  act(all('textbox', strings['new.field'])[0]!, 'type', title);
  await s!.settle();
  await s!.keys.press('enter');
}

const DEFINITE = [
  { fx: 'createNotSent', head: forms['outcome.notSent'], words: strings['new.notSent'] },
  { fx: 'createFailed', head: forms['outcome.failed'], words: strings['new.cantAdd'] },
  { fx: 'createProtected', head: forms['outcome.failed'], words: strings['new.protected'] },
] as const;

for (const c of DEFINITE) {
  test(`${c.fx}: the answer is said, the title can be typed again, and Create sends a new note`, async () => {
    s = await renderPage({ page: 'notes', fx: c.fx, cols: 120, rows: 40, afterBoot: countCalls });
    await s.settle();
    await create(TITLE);
    expect(sends).toHaveLength(1);
    expect(said(c.head)).toBeGreaterThan(0);
    expect(said(c.words)).toBeGreaterThan(0);
    // Nothing of it may have applied: no "may have gone through", no Check again, no Send again.
    expect(said(forms['outcome.pending'])).toBe(0);
    expect(all('button', forms['outcome.check'])).toHaveLength(0);
    expect(all('button', 'Send again')).toHaveLength(0);
    expect(all('dialog', strings['new.title'])).toHaveLength(1);
    const field = all('textbox', strings['new.field']);
    expect(field).toHaveLength(1);
    expect(field[0]!.states.disabled).toBeUndefined();
    expect(field[0]!.value).toBe(TITLE);
    const createButton = all('button', strings['new.create'], { disabled: false });
    expect(createButton).toHaveLength(1);
    // Create again is a new note: a new id, never the refused one sent again.
    act(createButton[0]!, 'press');
    await s.settle();
    expect(sends).toHaveLength(2);
    expect(sends[1]!.id).not.toBe(sends[0]!.id);
    expect(sends[1]!.name).toBe(TITLE);
    expect(reads).toBe(0);
    clean(s);
  }, 180_000);
}

test('createTaken: the id was taken, so it is sent once more under a new id, and the note opens', async () => {
  s = await renderPage({ page: 'notes', fx: 'createTaken', cols: 120, rows: 40, afterBoot: countCalls });
  await s.settle();
  await create(TITLE);
  const frame = await s.settle();
  expect(sends).toHaveLength(2);
  expect(sends[1]!.id).not.toBe(sends[0]!.id);
  expect(sends.map((x) => x.name)).toEqual([TITLE, TITLE]);
  expect(reads).toBe(0);
  // Created: the dialog ends and the note opens; the refusal of the first id is never shown.
  expect(all('dialog', strings['new.title'])).toHaveLength(0);
  expect(said(strings['new.taken'])).toBe(0);
  expect(said(forms['outcome.toastTitle'])).toBe(0);
  expect(frame).toContain(TITLE);
  clean(s);
}, 180_000);

test('/notes?new=1 opens New note on the shell\'s computer once; closed, it stays closed and nothing was sent', async () => {
  s = await renderPage({ page: 'notes', path: '/notes?new=1', cols: 120, rows: 40, afterBoot: countCalls });
  await s.settle();
  expect(all('dialog', strings['new.title'])).toHaveLength(1);
  expect(said(strings['new.body'].replace('{{computer}}', 'atlas').replace('{{section}}', 'Work'))).toBeGreaterThan(0);
  await s.keys.press('escape');
  await s.settle();
  expect(all('dialog', strings['new.title'])).toHaveLength(0);
  // The key was dropped when the form opened: a later settle (the notes read again) does not open it a second time.
  await s.settle();
  expect(all('dialog', strings['new.title'])).toHaveLength(0);
  expect(sends).toHaveLength(0);
  clean(s);
}, 180_000);
