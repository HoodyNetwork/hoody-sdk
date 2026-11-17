// Vitest, mounted on core's real change source: the Magic comments panel of a script. The real panel, real read and
// change hooks and the real core run; only the toast is replaced and the computer's answers are made by hand. What it proves:
// the fields are drawn from the computer's own schema (one this page never heard of included), the stored values fill them, a
// secret is never shown or prefilled, a proposed set is checked by a dry run before it can be saved, a save carries the read
// revision and an op id, a revision conflict changes nothing and asks again, and a lost answer is checked, never resent.
import { CoreQueryProvider, queryClient } from '@core';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, calls, onFetch, R1, settle, TARGET, type Call, type Reply } from '@core/test/env';

const world = vi.hoisted(() => ({
  write: 200,
  dry: 200,
  settle: 'unknown' as string,
  toasts: [] as Array<{ title: string; tone?: string }>,
  comments: {} as Record<string, unknown>,
  warnings: [] as unknown[],
  schema: undefined as unknown,
  revision: 'abcdef0123456789',
}));
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string; tone?: string }) => { world.toasts.push(c); return 'toast-1'; } }));

import { useSetComments } from './data';
import { isConflict, isRevisionClash } from './logic';
import { heldKeyPlaces, parseSchema, unseenPlaces, valueOf } from './magic';
import { sentOf } from './parts/opcheck';
import { MagicPanel } from './parts/MagicPanel';
import sched from '@kit/forms/ScheduleField.strings.en.json';
import strings from './strings.en.json';
import type { CompScripts } from './types';

const PATH = 'default/1/a.ts';
const fld = (key: string, category: string, type: string, extra: Record<string, unknown> = {}) => ({ key, directive: `@${key}`, category, type, description: `About ${key}. More words after the first sentence.`, defaults: { when_omitted: null, runtime: null, sdk_import: null }, ...extra });
const SCHEMA = {
  schema_version: '1.0.0',
  total_fields: 9,
  parse_window_lines: 50,
  unknown_keys_behavior: 'ignored-by-serializer',
  defaults_context: { when_omitted: 'x', runtime: 'x', sdk_import: 'x' },
  categories: {},
  fields: [
    { ...fld('enabled', 'execution', 'boolean'), defaults: { when_omitted: true, runtime: true, sdk_import: true } },
    fld('timeout', 'execution', 'integer', { range: { min: 0, max: 2147483647 } }),
    fld('x-brand-new', 'execution', 'string'),
    fld('token', 'auth', 'string|string[]'),
    fld('ai-key', 'ai', 'string'),
    fld('description', 'metadata', 'string'),
    fld('tags', 'metadata', 'string[]'),
    fld('widget', 'zzz-new-category', 'string'),
    fld('remote-token', 'remote', 'object[]'),
  ],
};
const item = (extra: object = {}) => ({ id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: PATH, name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, failed: 0, managed: null, ownershipUnknown: false, group: 'ok', ...extra } as never);
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, agent: { templates: true, writer: true, guardedDelete: true }, agentRealm: null, instances: {}, rows: [{ path: PATH }], summary: {}, aliases: [], deleted: [] } as unknown as CompScripts;
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const isDry = (c: Call) => !!c.body && typeof c.body === 'object' && (c.body as { dry_run?: unknown }).dry_run === true;
const reply = (c: Call): Reply => {
  if (c.url.includes('/exec/ops/settle')) return { status: 200, body: { opId: 'x', state: world.settle } };
  if (c.url.includes('/magic-comments/schema')) return { status: 200, body: world.schema ?? SCHEMA };
  if (c.url.includes('/magic-comments/read')) return { status: 200, body: { path: PATH, resolvedPath: PATH, revision: world.revision, comments: world.comments, warnings: world.warnings } };
  if (c.url.includes('/magic-comments/update')) {
    const n = isDry(c) ? world.dry : world.write;
    if (n === 200) return { status: 200, body: isDry(c) ? { dry_run: true, path: PATH, resolvedPath: PATH, current: { description: 'old', 'ai-key': '[REDACTED]', token: '[REDACTED]' }, proposed: { description: 'new', 'ai-key': '[REDACTED]', token: '[REDACTED]' }, changes: Object.keys((c.body as { comments: object }).comments), ignored: [] } : { dry_run: false, revision: 'ffffffffffffffff', previousRevision: world.revision } };
    // The kit answers `{ error: <code> }` and core keeps the code only when the route lists it.
    return { status: n, body: { error: n === 409 ? 'REVISION_MISMATCH' : 'BAD_REQUEST' } };
  }
  return { status: 200, body: { data: {} } };
};
const click = async (name: string | RegExp) => { await act(async () => { fireEvent.click(await screen.findByRole('button', { name })); await flush(); }); };
const typeInto = async (name: string, value: string) => { await act(async () => { fireEvent.change(await screen.findByRole('textbox', { name }), { target: { value } }); await flush(); }); };
// A category the panel folds sits in its titled group under the one More settings fold: open the fold (once), then the group is shown.
const open = async (title: string) => {
  await screen.findByRole('button', { name: new RegExp(strings['magic.more']) });
  const fold = screen.getByRole('button', { name: new RegExp(strings['magic.more']) });
  if (fold.getAttribute('aria-expanded') !== 'true') await act(async () => { fireEvent.click(fold); await flush(); });
  await screen.findByRole('group', { name: title });
};
const updates = (dry?: boolean) => calls.filter((c) => c.method === 'PUT' && c.url.includes('/magic-comments/update') && (dry === undefined || isDry(c) === dry));
const reads = () => calls.filter((c) => c.method === 'GET' && c.url.includes('/magic-comments/read'));
const bodyOf = (c: Call) => c.body as { path: string; ifRevision: string; opId?: string; dry_run?: boolean; comments: Record<string, unknown> };
const warnedClose = async () => { await click(strings['force.label']); await click(strings['force.confirm']); };

let probe: { comments: ReturnType<typeof useSetComments> } | undefined;
function Probe() { probe = { comments: useSetComments() }; return null; }
const mount = (o: { editable?: boolean; onChanged?: () => void; it?: object } = {}) => render(<><Probe /><MagicPanel item={item(o.it)} comp={comp} editable={o.editable ?? true} onChanged={o.onChanged ?? (() => undefined)} /></>, { wrapper: CoreQueryProvider });

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  calls.length = 0;
  Object.assign(world, { write: 200, dry: 200, settle: 'unknown', comments: { description: 'Old words', enabled: false }, warnings: [], schema: undefined, revision: 'abcdef0123456789' });
  world.toasts.length = 0;
  unseenPlaces.clear();
  heldKeyPlaces.clear();
  onFetch(reply);
  setTarget(TARGET);
});

describe('the panel is drawn from the computer', () => {
  it('shows every field the computer lists, one it never heard of included, grouped by its categories', async () => {
    mount();
    expect(await screen.findByRole('switch', { name: strings['magic.f.enabled'] })).toBeTruthy();
    // A field this page has no label for shows under the computer's own key, in the computer's own category.
    expect(await screen.findByRole('textbox', { name: 'x-brand-new' })).toBeTruthy();
    await open('zzz-new-category');
    expect(await screen.findByRole('textbox', { name: 'widget' })).toBeTruthy();
    // The schema is asked once for the list; the page names no field of its own.
    expect(calls.filter((c) => c.url.includes('/magic-comments/schema'))).toHaveLength(1);
  });

  it('fills the fields from what is stored', async () => {
    mount();
    await open(strings['magic.cat.metadata']);
    expect((await screen.findByRole('textbox', { name: strings['magic.f.description'] }) as HTMLInputElement).value).toBe('Old words');
    expect((screen.getByRole('switch', { name: strings['magic.f.enabled'] }) as HTMLInputElement).checked).toBe(false);
  });

  it('says what is wrong in the header now', async () => {
    world.warnings = [{ directive: '@timeout', value: 'banana', message: 'is not a duration' }];
    mount();
    expect(await screen.findByText(/@timeout: is not a duration/)).toBeTruthy();
    // The kit problem list, worth-knowing tone (the header still parses), no line: nothing to press.
    const list = screen.getByRole('list', { name: strings['magic.warnings'] });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => r.getAttribute('data-tone'))).toEqual(['warn']);
    expect(within(list).queryByRole('button')).toBeNull();
  });

  it('a computer that lists no fields says so and offers no editor', async () => {
    world.schema = { fields: [] };
    mount();
    expect(await screen.findByText(strings['magic.noSchema'])).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['magic.review'] })).toBeNull();
  });
});

describe('secrets are never shown or prefilled', () => {
  it('a stored key and AI key read as set, and neither their sentinel nor any value reaches the page', async () => {
    world.comments = { token: '[REDACTED]', tokens: ['[REDACTED]'], 'ai-key': '[REDACTED]', 'remote-token': [{ name: 'ops', secret: '[REDACTED]' }] };
    mount();
    await open(strings['magic.cat.ai']);
    await open(strings['magic.cat.remote']);
    expect((await screen.findAllByText(strings['magic.secretSet'])).length).toBe(3);
    expect(document.body.textContent).not.toContain('[REDACTED]');
    for (const el of Array.from(document.querySelectorAll('input, textarea'))) expect((el as HTMLInputElement).value).not.toContain('REDACTED');
    // No input is open for a secret until the person asks to replace it, and then it starts empty and masked.
    expect(document.querySelectorAll('input[type="password"]')).toHaveLength(0);
    await click(strings['magic.secretReplace']);
    const input = document.querySelector('input[type="password"]') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('a replaced AI key is sent to the check and the save, and its value is on no screen', async () => {
    world.comments = { 'ai-key': '[REDACTED]' };
    mount();
    await open(strings['magic.cat.ai']);
    await click(strings['magic.secretReplace']);
    const input = document.querySelector('input[type="password"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'sk-very-private-value' } }); await flush(); });
    await click(strings['magic.review']);
    expect(bodyOf(updates(true)[0]!).comments).toEqual({ 'ai-key': 'sk-very-private-value' });
    expect(await screen.findByText(new RegExp(strings['magic.line.hidden'].replace('{{name}}', strings['magic.f.ai-key']).replace(/[()]/g, '.')))).toBeTruthy();
    expect(document.body.textContent).not.toContain('sk-very-private-value');
    expect(document.body.textContent).not.toContain('[REDACTED]');
    await click(new RegExp(strings['magic.save'].replace('{{n}}', '1')));
    expect(bodyOf(updates(false)[0]!).comments).toEqual({ 'ai-key': 'sk-very-private-value' });
    expect(document.body.textContent).not.toContain('sk-very-private-value');
  });

  it('removing a secret sends null for it and nothing else', async () => {
    world.comments = { 'ai-key': '[REDACTED]' };
    mount();
    await open(strings['magic.cat.ai']);
    await click(strings['magic.secretRemove']);
    await click(strings['magic.review']);
    expect(bodyOf(updates(true)[0]!).comments).toEqual({ 'ai-key': null });
  });
});

describe('a proposed set is checked before it can be saved', () => {
  it('Save waits for a check of exactly these edits; another edit asks for a new check; nothing is written by the check', async () => {
    mount();
    await open(strings['magic.cat.metadata']);
    await typeInto(strings['magic.f.description'], 'New words');
    const save = () => screen.getByRole('button', { name: /^Save \d+ changes$/ }) as HTMLButtonElement;
    expect(save().disabled).toBe(true);
    await click(strings['magic.review']);
    const [dry] = updates(true);
    expect(dry!.method).toBe('PUT');
    expect(bodyOf(dry!)).toMatchObject({ path: PATH, ifRevision: 'abcdef0123456789', dry_run: true, comments: { description: 'New words' } });
    expect(updates(false)).toEqual([]);
    expect(save().disabled).toBe(false);
    expect(await screen.findByText(/Old words|old/)).toBeTruthy();
    await typeInto(strings['magic.f.description'], 'Newer words');
    expect(save().disabled).toBe(true);
    expect(updates(false)).toEqual([]);
  });

  it('a check made against one revision does not stand once the script is read at another: Save asks for a new check', async () => {
    mount();
    await open(strings['magic.cat.metadata']);
    await typeInto(strings['magic.f.description'], 'New words');
    const save = () => screen.getByRole('button', { name: /^Save \d+ changes$/ }) as HTMLButtonElement;
    await click(strings['magic.review']);
    expect(save().disabled).toBe(false);
    // Somebody else saved: the next read of the script holds another revision, though the person touched nothing.
    world.revision = '0123456789abcdef';
    await act(async () => { await queryClient.refetchQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('magic-comments') || JSON.stringify(q.queryKey).includes('commentsRead') }); await flush(); });
    expect(save().disabled).toBe(true);
    expect(updates(false)).toEqual([]);
  });

  it('only the fields that changed are sent, and a field changed back is not an edit', async () => {
    mount();
    await open(strings['magic.cat.metadata']);
    await typeInto(strings['magic.f.description'], 'Something else');
    await typeInto(strings['magic.f.description'], 'Old words');
    expect((screen.getByRole('button', { name: strings['magic.review'] }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click(await screen.findByRole('switch', { name: strings['magic.f.enabled'] })); await flush(); });
    await click(strings['magic.review']);
    expect(bodyOf(updates(true)[0]!).comments).toEqual({ enabled: true });
  });

  it('a number the computer would not take is said at the field and never sent', async () => {
    mount();
    await typeInto(strings['magic.f.timeout'], '99999999999');
    expect(await screen.findByText(strings['magic.problem.range'])).toBeTruthy();
    expect((screen.getByRole('button', { name: strings['magic.review'] }) as HTMLButtonElement).disabled).toBe(true);
    expect(updates()).toEqual([]);
  });

  it('a check the computer refuses says nothing was changed and leaves Save off', async () => {
    world.dry = 422;
    mount();
    await open(strings['magic.cat.metadata']);
    await typeInto(strings['magic.f.description'], 'New words');
    await click(strings['magic.review']);
    expect(await screen.findByText(strings['magic.note.refused'])).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Save \d+ changes$/, hidden: false })).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Save \d+ changes$/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(updates(false)).toEqual([]);
  });

  it('a script that cannot be edited here has every control off', async () => {
    mount({ editable: false });
    expect((await screen.findByRole('switch', { name: strings['magic.f.enabled'] }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('textbox', { name: 'x-brand-new' }) as HTMLInputElement).disabled).toBe(true);
  });
});

describe('saving', () => {
  const edit = async () => { await open(strings['magic.cat.metadata']); await typeInto(strings['magic.f.description'], 'New words'); await click(strings['magic.review']); };
  const saveBtn = () => click(/^Save \d+ changes$/);

  it('sends the read revision and an op id, then reads the script again and tells the page', async () => {
    const changed = vi.fn();
    mount({ onChanged: changed });
    await edit();
    const readsBefore = reads().length;
    await saveBtn();
    const [put] = updates(false);
    expect(bodyOf(put!)).toMatchObject({ path: PATH, ifRevision: 'abcdef0123456789', comments: { description: 'New words' } });
    expect(bodyOf(put!).opId).toMatch(/^[0-9a-f]{32}$/);
    expect(bodyOf(put!).dry_run).toBeUndefined();
    expect(updates(false)).toHaveLength(1);
    expect(changed).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(reads().length).toBeGreaterThan(readsBefore));
    expect((screen.getByRole('button', { name: strings['magic.review'] }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a revision conflict writes nothing, reads the script again, keeps the edits and asks for a new check; it is never sent again', async () => {
    mount();
    await edit();
    // Somebody else saved first: the computer now holds another revision and refuses ours.
    world.write = 409;
    world.revision = '0123456789abcdef';
    const readsBefore = reads().length;
    await saveBtn();
    expect(await screen.findByText(strings['magic.note.conflict'])).toBeTruthy();
    expect(updates(false)).toHaveLength(1);
    await vi.waitFor(() => expect(reads().length).toBeGreaterThan(readsBefore));
    expect(probe!.comments.held()).toEqual([]);
    expect(screen.queryByText(strings['outcome.pending.settings'])).toBeNull();
    // The edits are still there; Save is off until they are checked again against the new revision.
    expect((screen.getByRole('textbox', { name: strings['magic.f.description'] }) as HTMLInputElement).value).toBe('New words');
    expect((screen.getByRole('button', { name: /^Save \d+ changes$/ }) as HTMLButtonElement).disabled).toBe(true);
    world.write = 200;
    await click(strings['magic.review']);
    expect(bodyOf(updates(true).at(-1)!).ifRevision).toBe('0123456789abcdef');
    await saveBtn();
    expect(updates(false)).toHaveLength(2);
    expect(bodyOf(updates(false)[1]!).ifRevision).toBe('0123456789abcdef');
  });

  it('a conflict on Save drops the check even when the read still shows the same revision: Save asks for a new check', async () => {
    mount();
    await edit();
    world.write = 409;
    await saveBtn();
    expect(await screen.findByText(strings['magic.note.conflict'])).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Save \d+ changes$/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(updates(false)).toHaveLength(1);
  });

  it('any other refusal writes nothing, shows the refusal, reads the script again and asks for a new check; it is never sent again', async () => {
    mount();
    await edit();
    world.write = 422;
    const readsBefore = reads().length;
    await saveBtn();
    expect(await screen.findByText(strings['outcome.failed.settings'])).toBeTruthy();
    expect(updates(false)).toHaveLength(1);
    await vi.waitFor(() => expect(reads().length).toBeGreaterThan(readsBefore));
    expect(probe!.comments.held()).toEqual([]);
    expect((screen.getByRole('button', { name: /^Save \d+ changes$/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('textbox', { name: strings['magic.f.description'] }) as HTMLInputElement).value).toBe('New words');
  });

  it('a lost answer holds the panel, is checked by its op, and is never sent again', async () => {
    const changed = vi.fn();
    mount({ onChanged: changed });
    await edit();
    world.write = 502;
    await saveBtn();
    expect(await screen.findByText(strings['outcome.pending.settings'])).toBeTruthy();
    expect(updates(false)).toHaveLength(1);
    expect((screen.getByRole('textbox', { name: strings['magic.f.description'] }) as HTMLInputElement).disabled).toBe(true);
    expect(world.toasts).toEqual([]);
    world.settle = 'committed';
    await click(strings['outcome.check']);
    const settleCall = calls.find((c) => c.url.includes('/ops/settle'))!;
    expect((settleCall.body as { opId: string }).opId).toBe(bodyOf(updates(false)[0]!).opId);
    expect(probe!.comments.held()).toEqual([]);
    expect(screen.queryByText(strings['outcome.pending.settings'])).toBeNull();
    expect(changed).toHaveBeenCalled();
    expect(updates(false)).toHaveLength(1);
  });

  it('an op the computer does not know stays held until the warned close, and the edits survive it', async () => {
    mount();
    await edit();
    world.write = 502;
    await saveBtn();
    await click(strings['outcome.check']);
    expect(probe!.comments.held()).toHaveLength(1);
    expect(screen.queryByText(strings['outcome.pending.settings'])).toBeTruthy();
    await warnedClose();
    expect(probe!.comments.held()).toEqual([]);
    expect(updates(false)).toHaveLength(1);
    expect((screen.getByRole('textbox', { name: strings['magic.f.description'] }) as HTMLInputElement).value).toBe('New words');
  });

  it('a send that never happened (fenced) frees the hold as not done and says so', async () => {
    mount();
    await edit();
    world.write = 502;
    await saveBtn();
    world.settle = 'fenced';
    await click(strings['outcome.check']);
    expect(probe!.comments.held()).toEqual([]);
    expect(world.toasts.map((x) => x.title)).toContain(strings['check.notSent']);
  });
});

describe('the key', () => {
  const key = () => click(strings['key.replace']);
  const keyOf = (c: Call) => bodyOf(c).comments.token as string;

  it('a new key goes through the check and the save as the token, never rewrites the file, and is shown once after it is known', async () => {
    mount();
    await key();
    expect(await screen.findByText(strings['magic.keyMaking'])).toBeTruthy();
    await click(strings['magic.review']);
    expect(keyOf(updates(true)[0]!)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(screen.queryByText(strings['key.shownTitle'])).toBeNull();
    await click(/^Save \d+ changes$/);
    expect(calls.filter((c) => c.url.includes('/scripts/write'))).toEqual([]);
    expect(keyOf(updates(false)[0]!)).toBe(keyOf(updates(true)[0]!));
    expect(await screen.findByText(strings['key.shownTitle'])).toBeTruthy();
    expect(within(screen.getByRole('dialog')).getByText(strings['key.shownBody'])).toBeTruthy();
  });

  it('a key whose save may have gone through is not shown; the Check by op that proves it shows it', async () => {
    mount();
    await key();
    await click(strings['magic.review']);
    world.write = 502;
    await click(/^Save \d+ changes$/);
    expect(await screen.findByText(strings['outcome.pending.settings'])).toBeTruthy();
    expect(screen.queryByText(strings['key.shownTitle'])).toBeNull();
    expect(screen.queryByText(strings['key.unseen'])).toBeTruthy();
    world.settle = 'committed';
    await click(strings['outcome.check']);
    expect(await screen.findByText(strings['key.shownTitle'])).toBeTruthy();
    expect(updates(false)).toHaveLength(1);
  });

  it('removing the key sends null for the token', async () => {
    world.comments = { token: '[REDACTED]', tokens: ['[REDACTED]'] };
    mount();
    await click(strings['magic.secretRemove']);
    await click(strings['magic.review']);
    expect(bodyOf(updates(true)[0]!).comments).toEqual({ token: null });
    await click(/^Save \d+ changes$/);
    expect(bodyOf(updates(false)[0]!).comments).toEqual({ token: null });
    expect(calls.filter((c) => c.url.includes('/scripts/write'))).toEqual([]);
  });

  it('a secret\'s state is read out as its buttons change it: one status line that stays and changes its words', async () => {
    world.comments = { token: '[REDACTED]', tokens: ['[REDACTED]'] };
    mount();
    await screen.findByRole('button', { name: strings['magic.secretRemove'] });
    const said = () => screen.getAllByRole('status').filter((n) => (n.textContent ?? '').includes(strings['magic.secretRemoving']) || (n.textContent ?? '').includes(strings['magic.secretSet']) || (n.textContent ?? '').includes(strings['magic.keyMaking']));
    // Nothing pressed yet: nothing is read out.
    expect(said()).toEqual([]);
    await click(strings['magic.secretRemove']);
    const line = said();
    expect(line.length).toBe(1);
    expect(line[0]!.getAttribute('aria-live')).toBe('polite');
    expect(line[0]!.textContent).toMatch(new RegExp(`: ${strings['magic.secretRemoving']}$`));
    await click(strings['magic.undo']);
    // The same node says the new state: a change inside a live region, not a new region.
    expect(line[0]!.isConnected).toBe(true);
    expect(line[0]!.textContent).toMatch(new RegExp(`: ${strings['magic.secretSet'].replace(/[()]/g, '\\$&')}$`));
    await key();
    expect(line[0]!.textContent).toContain(strings['magic.keyMaking']);
  });

  it('Undo drops a key that was made but not saved', async () => {
    mount();
    await key();
    await click(strings['magic.undo']);
    expect(screen.queryByText(strings['magic.keyMaking'])).toBeNull();
    expect((screen.getByRole('button', { name: strings['magic.review'] }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('the panel\'s edge cases', () => {
  const save = () => click(/^Save \d+ changes$/);
  const saveBtnOf = () => screen.getByRole('button', { name: /^Save \d+ changes$/ }) as HTMLButtonElement;

  it('a key made for the token survives an edit of another secret and is shown after the save', async () => {
    world.comments = { 'ai-key': '[REDACTED]' };
    mount();
    await click(strings['key.replace']);
    await open(strings['magic.cat.ai']);
    await click(strings['magic.secretReplace']);
    const input = document.querySelector('input[type="password"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'sk-second' } }); await flush(); });
    await click(strings['magic.review']);
    const made = bodyOf(updates(true)[0]!).comments.token as string;
    expect(made).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await save();
    expect(bodyOf(updates(false)[0]!).comments.token).toBe(made);
    expect(await screen.findByText(strings['key.shownTitle'])).toBeTruthy();
  });

  it('a replacement secret has no Show toggle: what is typed can never be revealed', async () => {
    world.comments = { 'ai-key': '[REDACTED]' };
    mount();
    await open(strings['magic.cat.ai']);
    await click(strings['magic.secretReplace']);
    expect(document.querySelectorAll('input[type="password"]')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^show/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /show|hide/i })).toBeNull();
  });

  it('the sentinel can never be typed into a secret: it is said at the field and nothing is sent', async () => {
    world.comments = { 'ai-key': '[REDACTED]' };
    mount();
    await open(strings['magic.cat.ai']);
    await click(strings['magic.secretReplace']);
    const input = document.querySelector('input[type="password"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: '[REDACTED]' } }); await flush(); });
    expect(await screen.findByText(strings['magic.problem.sentinel'])).toBeTruthy();
    expect((screen.getByRole('button', { name: strings['magic.review'] }) as HTMLButtonElement).disabled).toBe(true);
    expect(updates()).toEqual([]);
  });

  it('a script that cannot be edited has its secret actions off too', async () => {
    world.comments = { token: '[REDACTED]', tokens: ['[REDACTED]'], 'ai-key': '[REDACTED]' };
    mount({ editable: false });
    await open(strings['magic.cat.ai']);
    for (const name of [strings['key.replace'], strings['magic.secretReplace'], strings['magic.secretRemove']]) {
      for (const b of await screen.findAllByRole('button', { name })) expect((b as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('a description from the computer is shown as plain text: no markup, no link', async () => {
    world.schema = { ...SCHEMA, fields: [{ ...fld('x-brand-new', 'execution', 'string'), description: 'Use <a href="https://evil.example/x">this link</a> now. Second sentence.' }] };
    mount();
    await screen.findByRole('textbox', { name: 'x-brand-new' });
    expect(document.querySelector('a[href*="evil"]')).toBeNull();
    expect(document.body.textContent).toContain('<a href="https://evil.example/x">this link</a> now.');
  });

  it('a revision conflict in the kit\'s real envelope (code nested in details) is recognised as a conflict', async () => {
    const real = (c: Call): Reply | undefined => (c.url.includes('/magic-comments/update') && !isDry(c) ? { status: 409, body: { code: 'ERROR_409', message: 'Revision mismatch', details: { code: 'REVISION_MISMATCH' } } } : undefined);
    mount();
    await open(strings['magic.cat.metadata']);
    await typeInto(strings['magic.f.description'], 'New words');
    await click(strings['magic.review']);
    onFetch((c) => real(c) ?? reply(c));
    await save();
    expect(await screen.findByText(strings['magic.note.conflict'])).toBeTruthy();
    expect(updates(false)).toHaveLength(1);
    expect(probe!.comments.held()).toEqual([]);
    expect(saveBtnOf().disabled).toBe(true);
  });

  it('isRevisionClash (the panel only): a stale answer, a named mismatch and a bare 409 are clashes; a 409 that names its own code, a 422 and a lost answer are not', () => {
    expect(isRevisionClash({ outcome: 'stale' })).toBe(true);
    expect(isRevisionClash({ outcome: 'failed', code: 'REVISION_MISMATCH' })).toBe(true);
    expect(isRevisionClash({ outcome: 'failed', status: 409 })).toBe(true);
    expect(isRevisionClash({ outcome: 'failed', status: 409, code: 'SCRIPT_BUSY' })).toBe(false);
    expect(isRevisionClash({ outcome: 'failed', status: 422 })).toBe(false);
    expect(isRevisionClash({ outcome: 'pending', status: 409 })).toBe(false);
    expect(isRevisionClash(null)).toBe(false);
  });

  it('isConflict (the code editor) is not widened: a bare 409 is not "Somebody saved first"', () => {
    expect(isConflict({ outcome: 'failed', status: 409 } as never)).toBe(false);
    expect(isConflict({ outcome: 'failed', code: 'BAD_REVISION' })).toBe(true);
    expect(isConflict({ outcome: 'stale' })).toBe(true);
  });

  it('a Check that frees the hold as not done drops the old review and the key notice: Save asks for a new check', async () => {
    mount();
    await click(strings['key.replace']);
    await click(strings['magic.review']);
    world.write = 502;
    await save();
    expect(await screen.findByText(strings['key.unseen'])).toBeTruthy();
    world.settle = 'fenced';
    await click(strings['outcome.check']);
    expect(probe!.comments.held()).toEqual([]);
    expect(screen.queryByText(strings['key.unseen'])).toBeNull();
    expect(saveBtnOf().disabled).toBe(true);
    expect(updates(false)).toHaveLength(1);
  });

  it('a send core refused because an earlier change is still held is not recorded as the op of this press', () => {
    mount();
    const o = { compId: 'c1', path: PATH, opId: 'op-new', vars: {} };
    expect(sentOf(probe!.comments, o, { outcome: 'pending', code: 'READ_BACK_FIRST' })).toBeUndefined();
    expect(sentOf(probe!.comments, o, { outcome: 'pending', code: 'BUSY' })).toBeUndefined();
    expect(sentOf(probe!.comments, o, { outcome: 'pending' })).toMatchObject({ opId: 'op-new' });
    expect(sentOf(probe!.comments, o, { outcome: 'done' })).toBeNull();
  });
});

describe('the schema and the numbers', () => {
  it('a key the object prototype has is never a field', () => {
    const doc = { fields: [{ key: 'constructor', directive: '@constructor', category: 'x', type: 'string' }, { key: 'toString', directive: '@t', category: 'x', type: 'string' }, { key: 'fine', directive: '@fine', category: 'x', type: 'string' }] };
    expect(parseSchema(doc)!.fields.map((f) => f.key)).toEqual(['fine']);
  });

  const field = (type: string, extra: Record<string, unknown> = {}) => parseSchema({ fields: [{ key: 'n', directive: '@n', category: 'x', type, ...extra }] })!.fields[0]!;
  it('an integer past what a number holds is out of range, never rounded or sent as null', () => {
    const f = field('integer', { range: { min: 0, max: 9007199254740993 } });
    expect(valueOf(f, '9007199254740993')).toEqual({ problem: 'range' });
    expect(valueOf(f, '1'.repeat(400))).toEqual({ problem: 'range' });
    expect(valueOf(f, '42')).toEqual({ value: 42 });
  });
  it('a number-or-switch field holds the same bounds', () => {
    const f = field('boolean|integer', { range: { min: 2, max: 10 } });
    expect(valueOf(f, '0')).toEqual({ problem: 'number' });
    expect(valueOf(f, '1')).toEqual({ problem: 'range' });
    expect(valueOf(f, '11')).toEqual({ problem: 'range' });
    expect(valueOf(f, '9007199254740993')).toEqual({ problem: 'range' });
    expect(valueOf(f, '5')).toEqual({ value: 5 });
    expect(valueOf(f, 'true')).toEqual({ value: true });
  });
});

describe('held key saves, Save refusals and new keys', () => {
  const save = () => click(/^Save \d+ changes$/);
  const saveBtnOf = () => screen.getByRole('button', { name: /^Save \d+ changes$/ }) as HTMLButtonElement;

  it('the warned close of a held key save drops the old review and the key notice, reads the script again and keeps the draft', async () => {
    mount();
    await click(strings['key.replace']);
    await click(strings['magic.review']);
    world.write = 502;
    await save();
    expect(await screen.findByText(strings['key.unseen'])).toBeTruthy();
    await click(strings['outcome.check']);
    expect(probe!.comments.held()).toHaveLength(1);
    const readsBefore = reads().length;
    await warnedClose();
    expect(probe!.comments.held()).toEqual([]);
    expect(screen.queryByText(strings['key.unseen'])).toBeNull();
    expect(saveBtnOf().disabled).toBe(true);
    await vi.waitFor(() => expect(reads().length).toBeGreaterThan(readsBefore));
    // The edit survives (a key is still to be made), and a new check makes it savable again; nothing was sent twice meanwhile.
    expect(screen.getByText(strings['magic.keyMaking'])).toBeTruthy();
    expect(updates(false)).toHaveLength(1);
    world.write = 200;
    await click(strings['magic.review']);
    expect(saveBtnOf().disabled).toBe(false);
  });

  it('a bare 409 on Save is handled as a refusal with the panel note, never as the editor\'s "Somebody saved first"', async () => {
    world.write = 409;
    mount();
    await open(strings['magic.cat.metadata']);
    await typeInto(strings['magic.f.description'], 'New words');
    await click(strings['magic.review']);
    await save();
    expect(await screen.findByText(strings['magic.note.conflict'])).toBeTruthy();
    expect(screen.queryByText(strings['code.conflict'])).toBeNull();
    expect(document.body.textContent).not.toContain('Somebody saved first');
  });

  it('a number-or-switch field with no maximum still refuses a digit string no number can hold', () => {
    const f = parseSchema({ fields: [{ key: 'n', directive: '@n', category: 'x', type: 'boolean|integer' }] })!.fields[0]!;
    expect(valueOf(f, '9007199254740993')).toEqual({ problem: 'range' });
    expect(valueOf(f, '1'.repeat(400))).toEqual({ problem: 'range' });
    expect(valueOf(f, '30')).toEqual({ value: 30 });
  });

  it('the key shown after the save is the one that was sent, and it is gone from the page once the dialog is closed', async () => {
    mount();
    await click(strings['key.replace']);
    await click(strings['magic.review']);
    await save();
    const sentKey = bodyOf(updates(false)[0]!).comments.token as string;
    const dialog = await screen.findByRole('dialog');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: /show/i })); await flush(); });
    const shown = Array.from(dialog.querySelectorAll('input')).map((i) => (i as HTMLInputElement).value).join('') + (dialog.textContent ?? '');
    expect(shown).toContain(sentKey);
    await click(strings['key.done']);
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.textContent).not.toContain(sentKey);
    for (const el of Array.from(document.querySelectorAll('input, textarea'))) expect((el as HTMLInputElement).value).not.toContain(sentKey);
  });

  it('a Check that proves the save never ran reads the script again', async () => {
    mount();
    await open(strings['magic.cat.metadata']);
    await typeInto(strings['magic.f.description'], 'New words');
    await click(strings['magic.review']);
    world.write = 502;
    await save();
    world.settle = 'fenced';
    const readsBefore = reads().length;
    await click(strings['outcome.check']);
    await vi.waitFor(() => expect(reads().length).toBeGreaterThan(readsBefore));
  });
});

// "Make a new key" on a script with several `@token` lines keeps every token: the kit writes a made key as the only
// key otherwise, which would cut off every other caller. The made key goes beside the stored ones (a `[REDACTED]` per
// stored line keeps that key), Remove says it removes them all, and a count the read does not give makes no key.
describe('keys-guard: several keys are kept', () => {
  const R = '[REDACTED]';
  const fill = (s: string, n: number) => s.replace('{{count}}', String(n));
  const tokenOf = (c: Call) => bodyOf(c).comments.token;

  it('a new key on a script with three keys goes beside them: the check and the save send the three kept, then the new one', async () => {
    world.comments = { token: R, tokens: [R, R, R] };
    mount();
    await click(strings['key.replace']);
    await click(strings['magic.review']);
    const dry = tokenOf(updates(true)[0]!) as string[];
    expect(dry.slice(0, 3)).toEqual([R, R, R]);
    expect(dry).toHaveLength(4);
    expect(dry[3]).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await click(/^Save \d+ changes?$/);
    expect(tokenOf(updates(false)[0]!)).toEqual(dry);
    expect(await screen.findByText(strings['key.shownTitle'])).toBeTruthy();
  });

  it('the lines say how many keys there are and that a made key goes beside them', async () => {
    world.comments = { token: R, tokens: [R, R, R] };
    mount();
    expect(await screen.findByText(fill(strings['magic.keysSet'], 3))).toBeTruthy();
    await click(strings['key.replace']);
    expect(await screen.findByText(fill(strings['key.keep'], 3))).toBeTruthy();
  });

  it('a script with one key still has it replaced: one token is sent', async () => {
    world.comments = { token: R, tokens: [R] };
    mount();
    await click(strings['key.replace']);
    expect(await screen.findByText(strings['magic.keyMaking'])).toBeTruthy();
    await click(strings['magic.review']);
    expect(tokenOf(updates(true)[0]!)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('Remove on a script with three keys says it removes all three, and sends null', async () => {
    world.comments = { token: R, tokens: [R, R, R] };
    mount();
    await click(fill(strings['magic.keysRemove'], 3));
    expect(await screen.findByText(fill(strings['magic.keysRemoving'], 3))).toBeTruthy();
    await click(strings['magic.review']);
    expect(bodyOf(updates(true)[0]!).comments).toEqual({ token: null });
  });

  it('a read that sets a key but does not list them makes no key, and says why', async () => {
    world.comments = { token: R };
    mount();
    // The button stays, off, and carries the reason (it shows on focus, hover and a press); a press makes no key.
    const b = (await screen.findByRole('button', { name: strings['key.replace'] })) as HTMLButtonElement;
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(b.getAttribute('aria-describedby')!)?.textContent).toBe(strings['key.countUnknown']);
    expect(screen.getByText(strings['key.countUnknown'])).toBeTruthy();
    await act(async () => { fireEvent.click(b); await flush(); });
    expect(screen.queryByText(strings['magic.keyMaking'])).toBeNull();
    expect((screen.getByRole('button', { name: strings['magic.review'] }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a script at the most keys the computer takes makes no more, and says why', async () => {
    world.comments = { token: R, tokens: Array.from({ length: 16 }, () => R) };
    mount();
    const b = (await screen.findByRole('button', { name: strings['key.replace'] })) as HTMLButtonElement;
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(b.getAttribute('aria-describedby')!)?.textContent).toBe(fill(strings['key.full'], 16));
    expect(screen.getByText(fill(strings['key.full'], 16))).toBeTruthy();
    await act(async () => { fireEvent.click(b); await flush(); });
    expect(screen.queryByText(fill(strings['key.keep'], 16))).toBeNull();
    expect((screen.getByRole('button', { name: strings['magic.review'] }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('keys-guard: an unseen key beside others', () => {
  it('a held save that added a key beside three says that key works until removed, never "make a new key again"', async () => {
    const R = '[REDACTED]';
    world.comments = { token: R, tokens: [R, R, R] };
    mount();
    await click(strings['key.replace']);
    await click(strings['magic.review']);
    world.write = 502;
    await click(/^Save \d+ changes?$/);
    expect(await screen.findByText(strings['key.unseenBeside'])).toBeTruthy();
    expect(screen.queryByText(strings['key.unseen'])).toBeNull();
  });
});

// A key made before a read again is held when that read gives no key count or a full one, so one
// token never replaces the stored keys and seventeen are never sent. A warned close of a save that may have added the key beside
// the others drops it from the draft, so it is never sent twice, and keeps the notice that it may work until removed.
describe('a made key is held after a read again', () => {
  const R = '[REDACTED]';
  const fill = (s: string, n: number) => s.replace('{{count}}', String(n));
  const tokenOf = (c: Call) => bodyOf(c).comments.token;
  const reviewBtn = () => screen.getByRole('button', { name: strings['magic.review'] }) as HTMLButtonElement;
  const saveBtn = () => screen.getByRole('button', { name: /^Save \d+ changes?$/ }) as HTMLButtonElement;
  // Make a key beside three, check it, then lose the save to somebody else's: the panel reads the script again and finds `after`.
  const madeThenClash = async (after: Record<string, unknown>) => {
    world.comments = { token: R, tokens: [R, R, R] };
    mount();
    await click(strings['key.replace']);
    await click(strings['magic.review']);
    world.write = 409;
    world.revision = '0123456789abcdef';
    world.comments = after;
    const before = reads().length;
    await click(/^Save \d+ changes?$/);
    await vi.waitFor(() => expect(reads().length).toBeGreaterThan(before));
    await act(flush);
  };

  it('a read again that sets a key without listing them holds the made key: no check or save, so one token never replaces them', async () => {
    await madeThenClash({ token: R });
    expect(reviewBtn().disabled).toBe(true);
    expect(saveBtn().disabled).toBe(true);
    // The sentence is the warning beside Check and Save; the key's own row says only that the key is on hold.
    expect(screen.getByText(strings['key.held']).closest('[data-sg-row]')).toBeNull();
    expect(screen.getByText(strings['magic.keyOnHold']).closest('[data-sg-row]')).toBeTruthy();
    expect(screen.getByText(strings['key.countUnknown'])).toBeTruthy();
    expect(updates().every((c) => Array.isArray(tokenOf(c)))).toBe(true);
  });

  it('a read again that finds the most keys the computer takes holds the made key: it never promises a place beside them', async () => {
    await madeThenClash({ token: R, tokens: Array.from({ length: 16 }, () => R) });
    expect(reviewBtn().disabled).toBe(true);
    expect(saveBtn().disabled).toBe(true);
    expect(screen.getByText(fill(strings['key.full'], 16))).toBeTruthy();
    expect(screen.queryByText(fill(strings['key.keep'], 16))).toBeNull();
    expect(screen.getByText(strings['key.held'])).toBeTruthy();
  });

  it('Undo of a held key frees the other edits to be checked', async () => {
    await madeThenClash({ token: R });
    await open(strings['magic.cat.metadata']);
    await typeInto(strings['magic.f.description'], 'New words');
    expect(reviewBtn().disabled).toBe(true);
    await click(strings['magic.undo']);
    world.write = 200;
    await click(strings['magic.review']);
    expect(bodyOf(updates(true).at(-1)!).comments).toEqual({ description: 'New words' });
  });

  it('a warned close of a save that may have added the key beside three drops it, keeps the notice, and a new key is a new one', async () => {
    world.comments = { token: R, tokens: [R, R, R] };
    mount();
    await click(strings['key.replace']);
    await click(strings['magic.review']);
    const first = (tokenOf(updates(true)[0]!) as string[])[3];
    world.write = 502;
    await click(/^Save \d+ changes?$/);
    expect(await screen.findByText(strings['key.unseenBeside'])).toBeTruthy();
    await click(strings['outcome.check']);
    // The held write did go through: the script now has four keys.
    world.comments = { token: R, tokens: [R, R, R, R] };
    world.revision = 'ffffffffffffffff';
    const before = reads().length;
    await warnedClose();
    await vi.waitFor(() => expect(reads().length).toBeGreaterThan(before));
    await act(flush);
    expect(screen.getByText(fill(strings['magic.keysSet'], 4))).toBeTruthy();
    expect(screen.getByText(strings['key.unseenBeside'])).toBeTruthy();
    expect(reviewBtn().disabled).toBe(true);
    world.write = 200;
    await click(strings['key.replace']);
    await click(strings['magic.review']);
    const again = tokenOf(updates(true).at(-1)!) as string[];
    expect(again.slice(0, 4)).toEqual([R, R, R, R]);
    expect(again).toHaveLength(5);
    expect(again[4]).not.toBe(first);
    expect(updates(false)).toHaveLength(1);
  });
});

// After a warned close of a save that may have added a key beside the others, the line that it
// works until removed stays through later saves, done or refused; only a save that replaces every key, or a read with none, ends it.
describe('a key that may be live unseen stays said', () => {
  const R = '[REDACTED]';
  const unseenAfterClose = async () => {
    world.comments = { token: R, tokens: [R, R, R], description: 'Old words' };
    mount();
    await click(strings['key.replace']);
    await click(strings['magic.review']);
    world.write = 502;
    await click(/^Save \d+ changes?$/);
    await click(strings['outcome.check']);
    world.comments = { token: R, tokens: [R, R, R, R], description: 'Old words' };
    world.revision = 'ffffffffffffffff';
    const before = reads().length;
    await warnedClose();
    await vi.waitFor(() => expect(reads().length).toBeGreaterThan(before));
    await act(flush);
    expect(screen.getByText(strings['key.unseenBeside'])).toBeTruthy();
  };
  const describeEdit = async () => { await open(strings['magic.cat.metadata']); await typeInto(strings['magic.f.description'], 'New words'); await click(strings['magic.review']); };

  it('a later save of another setting that goes through keeps the line', async () => {
    await unseenAfterClose();
    world.write = 200;
    await describeEdit();
    await click(/^Save \d+ changes?$/);
    await act(flush);
    expect(updates(false).length).toBe(2);
    expect(screen.getByText(strings['key.unseenBeside'])).toBeTruthy();
  });

  it('a later save that is refused keeps the line', async () => {
    await unseenAfterClose();
    world.write = 422;
    await describeEdit();
    await click(/^Save \d+ changes?$/);
    await act(flush);
    expect(screen.getByText(strings['key.unseenBeside'])).toBeTruthy();
  });

  it('removing all the keys ends the line', async () => {
    await unseenAfterClose();
    world.write = 200;
    await click(strings['magic.keysRemove'].replace('{{count}}', '4'));
    await click(strings['magic.review']);
    world.comments = { token: null, tokens: [], description: 'Old words' };
    await click(/^Save \d+ changes?$/);
    await act(flush);
    await vi.waitFor(() => expect(screen.queryByText(strings['key.unseenBeside'])).toBeNull());
  });
});

// A read with no key ends the unseen-key line at once and for good; a key added later never
// brings it back.
describe('a read with no key ends the unseen line', () => {
  const R = '[REDACTED]';
  const closeWith = async (after: Record<string, unknown>) => {
    world.comments = { token: R, tokens: [R, R, R], description: 'Old words' };
    mount();
    await click(strings['key.replace']);
    await click(strings['magic.review']);
    world.write = 502;
    await click(/^Save \d+ changes?$/);
    await click(strings['outcome.check']);
    world.comments = after;
    world.revision = 'ffffffffffffffff';
    const before = reads().length;
    await warnedClose();
    await vi.waitFor(() => expect(reads().length).toBeGreaterThan(before));
    await act(flush);
  };

  it('a warned close whose read again shows no key shows no unseen-key line', async () => {
    await closeWith({ token: null, tokens: [], description: 'Old words' });
    expect(screen.queryByText(strings['key.unseenBeside'])).toBeNull();
    expect(screen.queryByText(strings['key.unseen'])).toBeNull();
  });

  it('a key added after that read never brings the line back', async () => {
    await closeWith({ token: null, tokens: [], description: 'Old words' });
    // Somebody adds a key, and a save of another setting loses to it: the panel reads one key now.
    world.comments = { token: R, tokens: [R], description: 'Old words' };
    world.revision = '0123456789abcdef';
    world.write = 409;
    await open(strings['magic.cat.metadata']);
    await typeInto(strings['magic.f.description'], 'New words');
    await click(strings['magic.review']);
    const before = reads().length;
    await click(/^Save \d+ changes?$/);
    await vi.waitFor(() => expect(reads().length).toBeGreaterThan(before));
    await act(flush);
    expect(screen.getByText(strings['magic.secretSet'])).toBeTruthy();
    expect(screen.queryByText(strings['key.unseenBeside'])).toBeNull();
  });
});

// The unseen-key line's smaller cases.
describe('keys-guard-lows: the 2- and 15-key edges, a press that sent nothing, a remount', () => {
  const R = '[REDACTED]';
  const tokenOf = (c: Call) => bodyOf(c).comments.token;

  it('a new key on a script with exactly two keys goes beside both: [kept, kept, new]', async () => {
    world.comments = { token: R, tokens: [R, R] };
    mount();
    await click(strings['key.replace']);
    await click(strings['magic.review']);
    const dry = tokenOf(updates(true)[0]!) as string[];
    expect(Array.isArray(dry)).toBe(true);
    expect(dry.slice(0, 2)).toEqual([R, R]);
    expect(dry).toHaveLength(3);
  });

  it('a script with 15 keys still makes a 16th: sixteen values, the last the new key', async () => {
    world.comments = { token: R, tokens: Array.from({ length: 15 }, () => R) };
    mount();
    const b = (await screen.findByRole('button', { name: strings['key.replace'] })) as HTMLButtonElement;
    expect(b.disabled).toBe(false);
    await click(strings['key.replace']);
    await click(strings['magic.review']);
    const dry = tokenOf(updates(true)[0]!) as string[];
    expect(dry).toHaveLength(16);
    expect(dry[15]).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('a press core refuses for an older hold (another tab) sent nothing: no "may have been added" line, now or after the warned close', async () => {
    world.comments = { token: R, tokens: [R, R, R] };
    mount();
    await click(strings['key.replace']);
    await click(strings['magic.review']);
    // Another change of the same script goes out (another tab) just before this press, and its answer is lost: core holds that
    // lock, so it refuses this press, which sends nothing.
    world.write = 502;
    const btn = screen.getByRole('button', { name: /^Save \d+ changes?$/ });
    await act(async () => {
      const other = probe!.comments.mutateAsync({ compId: 'c1', path: PATH, ifRevision: world.revision, opId: 'f'.repeat(32), comments: { description: 'x' } }).catch(() => null);
      fireEvent.click(btn);
      await other;
      await flush();
    });
    expect(updates(false)).toHaveLength(1);
    expect(bodyOf(updates(false)[0]!).comments).toEqual({ description: 'x' });
    expect(screen.queryByText(strings['key.unseenBeside'])).toBeNull();
    expect(screen.queryByText(strings['key.unseen'])).toBeNull();
    if (screen.queryByRole('button', { name: strings['force.label'] })) {
      await warnedClose();
      await act(flush);
    }
    expect(screen.queryByText(strings['key.unseenBeside'])).toBeNull();
  });

  it('the unseen-key line survives a remount of the panel', async () => {
    world.comments = { token: R, tokens: [R, R, R] };
    const first = mount();
    await click(strings['key.replace']);
    await click(strings['magic.review']);
    world.write = 502;
    await click(/^Save \d+ changes?$/);
    await click(strings['outcome.check']);
    world.comments = { token: R, tokens: [R, R, R, R] };
    world.revision = 'ffffffffffffffff';
    await warnedClose();
    await act(flush);
    expect(screen.getByText(strings['key.unseenBeside'])).toBeTruthy();
    first.unmount();
    mount();
    expect(await screen.findByText(strings['key.unseenBeside'])).toBeTruthy();
  });
});

// A refused press after an earlier save that went through beside the others never borrows that
// save's "beside" for its warned close: the new, never-sent key stays in the draft and no "may have been added" line shows.
describe('a refused press after a done beside save', () => {
  const R = '[REDACTED]';
  it('the warned close after a refused press keeps the unsent key and shows no unseen-key line', async () => {
    world.comments = { token: R, tokens: [R, R, R] };
    mount();
    await click(strings['key.replace']);
    await click(strings['magic.review']);
    world.comments = { token: R, tokens: [R, R, R, R] };
    world.revision = 'ffffffffffffffff';
    await click(/^Save \d+ changes?$/);
    await click(strings['key.done']);
    await act(flush);
    expect(screen.getByText(strings['magic.keysSet'].replace('{{count}}', '4'))).toBeTruthy();
    await click(strings['key.replace']);
    await click(strings['magic.review']);
    world.write = 502;
    const btn = screen.getByRole('button', { name: /^Save \d+ changes?$/ });
    await act(async () => {
      const other = probe!.comments.mutateAsync({ compId: 'c1', path: PATH, ifRevision: world.revision, opId: 'e'.repeat(32), comments: { description: 'x' } }).catch(() => null);
      fireEvent.click(btn);
      await other;
      await flush();
    });
    // The older hold's banner: Check again leaves it unknown, then the warned close.
    await click(strings['outcome.check']);
    await warnedClose();
    await act(flush);
    expect(screen.queryByText(strings['key.unseenBeside'])).toBeNull();
    expect(screen.getByText(strings['key.keep'].replace('{{count}}', '4'))).toBeTruthy();
  });
});

// A held save that sent a made key keeps its line across a remount of the panel, while it is
// held and after the warned close made from the remounted panel.
describe('a held key save across a remount', () => {
  const R = '[REDACTED]';
  const heldThenRemount = async (comments: Record<string, unknown>) => {
    world.comments = comments;
    const first = mount();
    await click(strings['key.replace']);
    await click(strings['magic.review']);
    world.write = 502;
    await click(/^Save \d+ changes?$/);
    first.unmount();
    mount();
    await act(flush);
  };

  it('beside three keys: the line shows again after the remount, stays after the warned close, and after another remount', async () => {
    await heldThenRemount({ token: R, tokens: [R, R, R] });
    expect(await screen.findByText(strings['key.unseenBeside'])).toBeTruthy();
    world.comments = { token: R, tokens: [R, R, R, R] };
    await click(strings['outcome.check']);
    await warnedClose();
    await act(flush);
    expect(screen.getByText(strings['key.unseenBeside'])).toBeTruthy();
    cleanup();
    mount();
    expect(await screen.findByText(strings['key.unseenBeside'])).toBeTruthy();
  });

  it('a single key: the line shows again after the remount and stays after the warned close', async () => {
    await heldThenRemount({ token: R, tokens: [R] });
    expect(await screen.findByText(strings['key.unseen'])).toBeTruthy();
    await click(strings['outcome.check']);
    await warnedClose();
    await act(flush);
    expect(screen.getByText(strings['key.unseen'])).toBeTruthy();
  });
  // With no key before, the cached read after the remount shows no key at the revision the held save was sent
  // against. It can predate the save, so it must not end the line the warned close keeps.
  it('no key before: the key the held save may have landed shows its line once the read after the warned close lists it', async () => {
    await heldThenRemount({ token: null, tokens: [] });
    expect(await screen.findByText(strings['key.unseen'])).toBeTruthy();
    await click(strings['outcome.check']);
    world.comments = { token: R, tokens: [R] };
    world.revision = 'ffffffffffffffff';
    const before = reads().length;
    await warnedClose();
    await vi.waitFor(() => expect(reads().length).toBeGreaterThan(before));
    await act(flush);
    expect(await screen.findByText(strings['key.unseen'])).toBeTruthy();
  });

  it('no key before: a read still at the sent revision keeps the mark, and a remount that reads the landed key shows the line', async () => {
    await heldThenRemount({ token: null, tokens: [] });
    await click(strings['outcome.check']);
    await warnedClose();
    await act(flush);
    world.comments = { token: R, tokens: [R] };
    world.revision = 'ffffffffffffffff';
    cleanup();
    queryClient.clear();
    mount();
    expect(await screen.findByText(strings['key.unseen'])).toBeTruthy();
  });

  it('no key before: a read at a later revision that shows no key ends the line for good', async () => {
    await heldThenRemount({ token: null, tokens: [] });
    await click(strings['outcome.check']);
    world.revision = 'ffffffffffffffff';
    const before = reads().length;
    await warnedClose();
    await vi.waitFor(() => expect(reads().length).toBeGreaterThan(before));
    await act(flush);
    expect(screen.queryByText(strings['key.unseen'])).toBeNull();
    expect(unseenPlaces.size).toBe(0);
  });
});

// The schedule field is the shared preset picker, and Overview's "Set schedule" lands on it.
describe('the schedule in Settings', () => {
  const withSchedule = () => { world.schema = { ...SCHEMA, fields: [...SCHEMA.fields, fld('schedule', 'execution', 'string')] }; };
  const kindButton = () => screen.findByRole('button', { name: new RegExp(strings['magic.f.schedule']) });

  it('a picked kind is checked and saved as its exec expression, through the same guarded review', async () => {
    withSchedule();
    world.comments = { description: 'Old words', schedule: '0 8 * * *' };
    mount();
    fireEvent.click(await kindButton());
    await act(async () => { fireEvent.click(await screen.findByRole('option', { name: sched['k.weekdays'] })); await flush(); });
    await click(strings['magic.review']);
    expect(bodyOf(updates(true).at(-1)!).comments).toEqual({ schedule: '0 8 * * 1-5' });
    await click(/^Save \d+ changes?$/);
    expect(bodyOf(updates(false).at(-1)!).comments).toEqual({ schedule: '0 8 * * 1-5' });
  });

  it('Never removes the schedule', async () => {
    withSchedule();
    world.comments = { description: 'Old words', schedule: '0 8 * * *' };
    mount();
    fireEvent.click(await kindButton());
    await act(async () => { fireEvent.click(await screen.findByRole('option', { name: sched['k.off'] })); await flush(); });
    await click(strings['magic.review']);
    expect(bodyOf(updates(true).at(-1)!).comments).toEqual({ schedule: null });
  });

  it("Overview's ask moves focus to the schedule once it is drawn, and is answered once", async () => {
    withSchedule();
    const done = vi.fn();
    render(<MagicPanel item={item()} comp={comp} editable onChanged={() => undefined} focusSchedule={1} onScheduleFocused={done} />, { wrapper: CoreQueryProvider });
    const b = await kindButton();
    await act(flush);
    expect(document.activeElement).toBe(b);
    expect(done).toHaveBeenCalledTimes(1);
  });

  // The draft still holds the last good time while the box shows a bad one, so nothing may review or save it.
  it('a time box that is not a time blocks Review and Save until it is one again', async () => {
    withSchedule();
    world.comments = { description: 'Old words', schedule: '0 8 * * *' };
    mount();
    const time = (await screen.findByRole('textbox', { name: sched['time'] })) as HTMLInputElement;
    const review = () => screen.getByRole('button', { name: strings['magic.review'] }) as HTMLButtonElement;
    await act(async () => { fireEvent.change(time, { target: { value: '09:30' } }); await flush(); });
    expect(review().disabled).toBe(false);
    await act(async () => { fireEvent.change(time, { target: { value: '' } }); await flush(); });
    expect(review().disabled).toBe(true);
    await act(async () => { fireEvent.change(time, { target: { value: '10:15' } }); await flush(); });
    await click(strings['magic.review']);
    expect(bodyOf(updates(true).at(-1)!).comments).toEqual({ schedule: '15 10 * * *' });
    const save = () => screen.getByRole('button', { name: /^Save \d+ changes?$/ }) as HTMLButtonElement;
    expect(save().disabled).toBe(false);
    await act(async () => { fireEvent.change(time, { target: { value: '9' } }); await flush(); });
    expect(save().disabled).toBe(true);
  });

  // An empty expression is no draft, yet Custom picked from Never must open its box.
  it('Custom picked with no schedule opens the expression box, and what is written there is saved', async () => {
    withSchedule();
    world.comments = { description: 'Old words' };
    mount();
    fireEvent.click(await kindButton());
    await act(async () => { fireEvent.click(await screen.findByRole('option', { name: sched['k.custom'] })); await flush(); });
    const box = screen.getByRole('textbox', { name: sched['expr'] });
    await act(async () => { fireEvent.change(box, { target: { value: '15 3 * * *' } }); await flush(); });
    await click(strings['magic.review']);
    expect(bodyOf(updates(true).at(-1)!).comments).toEqual({ schedule: '15 3 * * *' });
  });

  // Only the exact preset text reads as a preset, so a saved expression is shown as written, never rewritten.
  it('a saved expression that is not exactly a preset reads as custom, as written', async () => {
    withSchedule();
    world.comments = { description: 'Old words', schedule: '0  8 * * *' };
    mount();
    expect(((await screen.findByRole('textbox', { name: sched['expr'] })) as HTMLInputElement).value).toBe('0  8 * * *');
    expect(screen.queryByRole('textbox', { name: sched['time'] })).toBeNull();
  });

  // A select that can't be used takes no focus; a script that can't be edited ends the ask unserved.
  it("Overview's ask on a script that can't be edited moves no focus and is ended once", async () => {
    withSchedule();
    const done = vi.fn();
    render(<MagicPanel item={item()} comp={comp} editable={false} onChanged={() => undefined} focusSchedule={1} onScheduleFocused={done} />, { wrapper: CoreQueryProvider });
    const b = await kindButton();
    await act(flush);
    expect(document.activeElement).not.toBe(b);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
