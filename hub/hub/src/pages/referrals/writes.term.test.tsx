// Referrals' writes in a terminal (C9): Join and a custom code are core changes. A lost answer is core's held banner
// (never "failed"), the action it stands for is gone or inert, and Check again only re-reads the program (a hold stays
// until the read proves the change). A create that went through lists the code; Retire asks first (Keep it changes
// nothing) and a confirmed retire takes the row away.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import kit from '../../kit/strings.en.json';
import { act, queryAllByRole, semanticsOf, type Role, type SemNode } from '../../term/prim/semantics';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const FAILED = kit['outcome.failed.title'];
const CHECK = kit['outcome.pending.check'];
const say = (key: keyof typeof strings, vars: Record<string, string> = {}): string => strings[key].replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const all = (role: Role, name: string | RegExp): SemNode[] => queryAllByRole(tree(), role, { name });
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
/** Whether the screen draws these words (a text or a control's name or description; a field's value is not counted). */
const says = (text: string): boolean => flat(tree()).some((n) => n.role !== 'textbox' && (n.name.includes(text) || (n.description ?? '').includes(text)));
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
async function open(fx: string | null): Promise<void> {
  s = await renderPage({ page: 'referrals', fx, cols: 120, rows: 40 });
  await s.settle();
}
function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
  expect(s!.placeholders.rendered).toEqual([]);
}
/** Type a custom code and wait for its check (400 ms after typing stops; a short timer the harness waits for). */
async function typeCode(code: string): Promise<void> {
  act(await one('textbox', strings['create.label']), 'type', code);
  await s!.settle();
  await until(() => ((all('textbox', strings['create.label'])[0]?.description ?? '').includes(strings['check.available'])));
  const field = await one('textbox', strings['create.label']);
  expect(field.value).toBe(code);
  expect(field.description ?? '').toContain(strings['check.available']);
}

test('Join: the confirm, then the earning state with the new main link and Copy link', async () => {
  await open('canJoin');
  await press('button', strings['join.action']);
  expect(says(strings['join.title'])).toBe(true);
  expect(says(strings['join.creditOnly'])).toBe(true);
  expect(says(strings['join.leave'])).toBe(true);
  await press('button', strings['join.confirm']);
  await until(() => s!.frame.includes('signup?ref=q4n8w2zt'));
  expect(s!.frame).toContain('signup?ref=q4n8w2zt');
  expect(all('button', strings['link.copyMain']).length).toBeGreaterThan(0);
  expect(all('button', strings['join.action']).length).toBe(0);
  expect(says(strings['held.join'])).toBe(false);
  clean();
}, 240_000);

test('a join whose answer is lost is held: Join… is gone, Check again re-reads and keeps the hold, never "failed"', async () => {
  await open('joinPending');
  await press('button', strings['join.action']);
  await press('button', strings['join.confirm']);
  await until(() => says(strings['held.join']));
  expect(says(strings['held.join'])).toBe(true);
  expect(says(FAILED)).toBe(false);
  expect(all('button', strings['join.action']).length).toBe(0);
  await press('button', CHECK);
  await until(() => !all('button', CHECK)[0]?.states.disabled);
  // Nothing was applied: the read proves nothing, the hold stays, and the action stays gone.
  expect(says(strings['held.join'])).toBe(true);
  expect(all('button', CHECK).length).toBe(1);
  expect(all('button', strings['join.action']).length).toBe(0);
  expect(s!.frame).not.toContain('signup?ref=q4n8w2zt');
  clean();
}, 240_000);

test('a custom code that went through is listed with its own Retire…, and the field is empty again', async () => {
  await open(null);
  await typeCode('maya-new1');
  await press('button', strings['create.action']);
  await until(() => all('button', say('release.label', { code: 'maya-new1' })).length > 0);
  expect(all('button', say('release.label', { code: 'maya-new1' })).length).toBe(1);
  expect(all('button', say('release.label', { code: 'maya-builds' })).length).toBe(1);
  expect((await one('textbox', strings['create.label'])).value).toBe('');
  expect(says(say('held.create', { code: 'maya-new1' }))).toBe(false);
  clean();
}, 240_000);

test('a custom code create whose answer is lost is held under its code; Check again keeps it; never "failed"', async () => {
  await open('createPending');
  await typeCode('maya-new1');
  await press('button', strings['create.action']);
  const held = say('held.create', { code: 'maya-new1' });
  await until(() => says(held));
  expect(says(held)).toBe(true);
  expect(says(FAILED)).toBe(false);
  await press('button', CHECK);
  await until(() => !all('button', CHECK)[0]?.states.disabled);
  expect(says(held)).toBe(true);
  // Not listed: no Retire… for it, while the code that was there before still has one (positive control).
  expect(all('button', say('release.label', { code: 'maya-new1' })).length).toBe(0);
  expect(all('button', say('release.label', { code: 'maya-builds' })).length).toBe(1);
  clean();
}, 240_000);

test('Retire… asks first: Keep it changes nothing; Retire code takes the row away', async () => {
  await open(null);
  const retire = say('release.label', { code: 'maya-builds' });
  await press('button', retire);
  const title = say('release.title', { code: 'maya-builds' });
  expect(says(title)).toBe(true);
  for (const k of ['release.gone', 'release.kept', 'release.never', 'release.counts'] as const) expect(says(strings[k])).toBe(true);
  await press('button', strings['release.keep']);
  await until(() => !says(title));
  expect(says(title)).toBe(false);
  expect(all('button', retire).length).toBe(1);

  await press('button', retire);
  expect(says(title)).toBe(true);
  await press('button', strings['release.confirm']);
  await until(() => all('button', retire).length === 0);
  expect(all('button', retire).length).toBe(0);
  // The rest of the card stays (positive control): the main link and its Copy link.
  expect(s!.frame).toContain('signup?ref=k7m2q9xa');
  expect(all('button', strings['link.copyMain']).length).toBeGreaterThan(0);
  clean();
}, 240_000);
