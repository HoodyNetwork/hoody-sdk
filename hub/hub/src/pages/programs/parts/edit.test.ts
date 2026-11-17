// Edit a program (parts/edit.ts) against the daemon's real answers (those of
// its program update): each answer's meaning, one send per Save with only the changed fields, and a lost answer held
// until a fresh read of the program shows what was sent.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import { answers, bootFixtureCore, queryClient, reply, type FixtureRule, type Target } from '@core';
import { resetChanges } from '@core/changes';
import { snapshot } from '@core/ctx';
import { sandboxRoutes } from '../sandbox/routes';
import { checkEdit, dismissEditAttempt, editHolds, editStore, editableOf, mark, readEditable, refusalOf, runEdit, type EditVars } from './edit';

// What core's api handed back for each call, as the page's code left it (sandbox/scrub.test.ts's way).
const seen = vi.hoisted(() => ({ answers: [] as unknown[] }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return {
    ...real,
    api: async (...a: Parameters<typeof real.api>) => {
      const res = await real.api(...a);
      seen.answers.push(res);
      return res;
    },
  };
});

type Answer = { status: number; body: unknown };
interface World {
  stored: { name: string; command: string };
  sends: { id: string; body: unknown }[];
  reads: number;
  answer: (id: string, body: { name?: string; command?: string }) => Answer;
  read?: () => Answer;
}
function boot(w: World): Target {
  const rules: FixtureRule[] = [
    reply(sandboxRoutes.program, () => {
      w.reads++;
      if (w.read) return w.read();
      return answers.ok({ success: true, program: { id: 7, name: w.stored.name, command: w.stored.command, enabled: true, boot: false, environment: { API_TOKEN: 'FAKE-never-shown' } } });
    }),
    reply(sandboxRoutes.edit, (req) => {
      const id = /\/programs\/edit\/([^/?]+)/.exec(req.path)?.[1] ?? '';
      const body = (req.body ?? {}) as { name?: string; command?: string };
      w.sends.push({ id, body });
      return w.answer(id, body);
    }),
  ];
  bootFixtureCore({ rules });
  queryClient.clear();
  return snapshot().target as Target;
}
const world = (answer: World['answer']): World => ({ stored: { name: 'web', command: 'node server.js' }, sends: [], reads: 0, answer });
/** The daemon's 2xx: the edit is stored. */
const store = (w: World) => (_id: string, body: { name?: string; command?: string }): Answer => {
  w.stored = { ...w.stored, ...body };
  return { status: 200, body: { success: true, program: { id: 7, name: w.stored.name, environment: { API_TOKEN: 'FAKE-never-shown' } } } };
};
const K = 'part|prog:7';
const vars = (target: Target, command = 'node app.js'): EditVars => ({ id: '7', name: 'web', command, body: { command }, target });

beforeEach(() => {
  resetChanges();
  editStore.reset();
  seen.answers = [];
});

describe('what a refusal means (the daemon\'s fixed sentences, on this id)', () => {
  it.each([
    [400, 'program 7 saved but NOT applied: supervisor refused the definition', 'notApplied'],
    [400, 'program 7 persisted but its configuration was NOT applied (see daemon log)', 'notApplied'],
    [400, 'program 7 was updated but its configuration was NOT removed (see daemon log)', 'notApplied'],
    [400, 'program 71 saved but NOT applied: supervisor refused the definition', 'refused'],
    [400, 'Program with ID 7 not found', 'refused'],
    [400, 'Program name "api" is already in use by ID 2. Choose a different name.', 'refused'],
    [400, null, 'unclear'],
    [400, '  ', 'unclear'],
    [413, null, 'refused'],
    [403, 'program 7 saved but NOT applied', 'refused'],
    [undefined, null, 'refused'],
  ] as const)('%s %j is %s', (status, raw, want) => {
    expect(refusalOf(status, raw, '7')).toBe(want);
  });
});

describe('the read', () => {
  it('reads the name and the command of a wrapped or a bare program, and whether an edit is applied at once', () => {
    expect(editableOf({ success: true, program: { id: 7, name: 'web', command: 'node server.js', enabled: true, boot: false } })).toEqual({ name: 'web', command: 'node server.js', appliesNow: false });
    expect(editableOf({ id: 7, name: 'web', command: 'x', boot: true })).toEqual({ name: 'web', command: 'x', appliesNow: true });
    expect(editableOf({ id: 7, name: 'web', command: 'x', enabled: false, boot: true })?.appliesNow).toBe(false);
    expect(editableOf({ id: 7, name: 'web', command: 'x', port_range: { start: 8000, end: 8003 } })?.appliesNow).toBe(true);
    expect(editableOf({ id: 7, name: 'web', command: 'x', sandbox: { max_pids: 8 } })?.appliesNow).toBe(true);
    expect(editableOf({ id: 7, name: 'web' })).toBeNull();
    expect(editableOf({ error: 'BAD_GATEWAY' })).toBeNull();
    expect(editableOf(null)).toBeNull();
  });

  it('leaves the raw answer empty (environment values never stay)', async () => {
    const w = world(() => ({ status: 200, body: {} }));
    const target = boot(w);
    expect(await readEditable('7', target)).toEqual({ name: 'web', command: 'node server.js', appliesNow: false });
    expect(seen.answers).toHaveLength(1);
    const raw = seen.answers[0] as { program?: Record<string, unknown> };
    expect(raw.program && Object.keys(raw.program)).toEqual([]);
    expect(JSON.stringify(seen.answers)).not.toContain('FAKE');
  });

  it('a mark tells a name and a command apart and holds neither', () => {
    expect(mark('web', 'node app.js')).toBe(mark('web', 'node app.js'));
    expect(mark('web', 'node app.js')).not.toBe(mark('web', 'node server.js'));
    expect(mark('web2', 'node app.js')).not.toBe(mark('web', 'node app.js'));
    expect(mark('web', 'node app.js')).toMatch(/^[0-9a-f]{14}$/);
  });
});

describe('one Save', () => {
  it('sends only what it was given, and a 2xx is said only after a fresh read shows it', async () => {
    const w = world(() => ({ status: 200, body: {} }));
    w.answer = store(w);
    const target = boot(w);
    expect(await runEdit(K, vars(target))).toBe('saved');
    expect(w.sends).toEqual([{ id: '7', body: { command: 'node app.js' } }]);
    expect(w.reads).toBe(1);
    expect(editStore.get(K)).toBeUndefined();
    expect(editHolds(target)).toEqual([]);
  });

  it('a 2xx a read does not show yet stays "saved, not shown yet" with Check again; nothing is sent again', async () => {
    const w = world(() => ({ status: 200, body: { success: true } }));
    const target = boot(w);
    expect(await runEdit(K, vars(target))).toBeUndefined();
    expect(editStore.get(K)).toMatchObject({ status: 'unknown', accepted: true, stuck: true, name: 'web', mark: mark('web', 'node app.js') });
    expect(editStore.get(K)?.hold).toBeUndefined();
    // A second Save while it is unknown sends nothing.
    expect(await runEdit(K, vars(target))).toBeUndefined();
    w.stored = { name: 'web', command: 'node app.js' };
    expect(await checkEdit(K, editStore.get(K))).toBe(true);
    expect(w.sends).toHaveLength(1);
    expect(editStore.get(K)).toBeUndefined();
  });

  it('a lost answer (5xx) is held, never failed: Check again reads only, and frees it once a read shows what was sent', async () => {
    const w = world(() => ({ status: 500, body: { success: false, error: 'PERSIST: failed to save the program list: No space left on device' } }));
    const target = boot(w);
    expect(await runEdit(K, vars(target))).toBeUndefined();
    const held = editStore.get(K);
    expect(held).toMatchObject({ status: 'unknown', stuck: true });
    expect(held?.hold).toEqual(expect.any(String));
    expect(held?.accepted).toBeUndefined();
    expect(editHolds(target)).toEqual([{ id: '7', name: 'web', mark: mark('web', 'node app.js'), hold: held?.hold, own: true }]);
    // Still the old command: a check proves nothing and frees nothing.
    expect(await checkEdit(K, editStore.get(K))).toBe(false);
    expect(editHolds(target)).toHaveLength(1);
    // A new Save of the same program is refused by core unsent, and shows the held send (never "not sent"), with what
    // THAT send asked for.
    editStore.reset();
    expect(await runEdit(K, vars(target, 'node other.js'))).toBeUndefined();
    expect(editStore.get(K)).toMatchObject({ status: 'unknown', hold: held?.hold, mark: mark('web', 'node app.js') });
    // Another value than the one sent proves nothing either.
    w.stored = { name: 'web', command: 'node other.js' };
    expect(await checkEdit(K, editStore.get(K))).toBe(false);
    w.stored = { name: 'web', command: 'node app.js' };
    expect(await checkEdit(K, editStore.get(K))).toBe(true);
    expect(editHolds(target)).toEqual([]);
    expect(w.sends).toHaveLength(1);
  });

  it('a read that is not the program proves nothing', async () => {
    const w = world(() => ({ status: 502, body: { error: 'BAD_GATEWAY' } }));
    w.read = () => ({ status: 200, body: { success: true } });
    const target = boot(w);
    await runEdit(K, vars(target));
    expect(editStore.get(K)).toMatchObject({ status: 'unknown', stuck: true });
    expect(editHolds(target)).toHaveLength(1);
    w.read = () => ({ status: 500, body: {} });
    expect(await checkEdit(K, editStore.get(K))).toBe(false);
    expect(editHolds(target)).toHaveLength(1);
  });

  it('a warned Dismiss frees exactly the shown hold; the note of a newer send stays', async () => {
    const w = world(() => ({ status: 502, body: { error: 'BAD_GATEWAY' } }));
    const target = boot(w);
    await runEdit(K, vars(target));
    const shown = editStore.get(K);
    if (!shown) throw new Error('no attempt');
    expect(await dismissEditAttempt(K, { ...shown, hold: 'not-that-send' })).toBe(false);
    expect(editHolds(target)).toHaveLength(1);
    expect(await dismissEditAttempt(K, shown)).toBe(true);
    expect(editHolds(target)).toEqual([]);
    expect(editStore.get(K)).toBeUndefined();
  });

  it('the post-save sentence says saved but not applied; it is not a refusal and holds nothing', async () => {
    const w = world(() => ({ status: 400, body: { success: false, error: 'program 7 saved but NOT applied: the process manager refused the definition' } }));
    const target = boot(w);
    expect(await runEdit(K, vars(target))).toBe('notApplied');
    expect(editStore.get(K)).toBeUndefined();
    expect(editHolds(target)).toEqual([]);
  });

  it('any other 400 is refused: nothing held, the rejection kept, no read', async () => {
    const w = world(() => ({ status: 400, body: { success: false, error: 'Program name "api" is already in use by ID 2. Choose a different name.' } }));
    const target = boot(w);
    expect(await runEdit(K, vars(target))).toBeUndefined();
    expect(editStore.get(K)).toMatchObject({ status: 'refused' });
    expect(editStore.get(K)?.error?.status).toBe(400);
    expect(editHolds(target)).toEqual([]);
    expect(w.reads).toBe(0);
    // A refusal holds nothing: the next Save is sent.
    w.answer = store(w);
    expect(await runEdit(K, vars(target))).toBe('saved');
    expect(w.sends).toHaveLength(2);
  });

  it('a 400 with no text may have saved it: unknown, read back, never refused', async () => {
    const w = world(() => ({ status: 400, body: {} }));
    const target = boot(w);
    expect(await runEdit(K, vars(target))).toBeUndefined();
    expect(editStore.get(K)).toMatchObject({ status: 'unknown', stuck: true });
    expect(editStore.get(K)?.accepted).toBeUndefined();
    expect(w.reads).toBe(1);
  });
});
