// The pure parts of the hook editor: what one press of Save does for a draft (create, update in place, replace), and every
// identity the editor refuses before anything is minted.
import { describe, expect, it } from 'vitest';
import { hooksBlockOf, testBody, upsertBody, type HookRow, type HooksBlock } from './hooks';
import { hookIdentityOf, hookLockKeyOf, testRowOf, type HookVars } from './hooksData';
import { turnsDirection } from './hidden';
import { DESC_MAX, NAME_MAX, TIMEOUT_MAX, draftOf, exactSame, locate, planOf, removeOf, strippedOf, timeoutOf, type HookDraft } from './hookEdit';

const U = '/home/a/.hoody/settings.json';
const P = '/w/shop/.hoody/settings.json';
const L = '/w/shop/.hoody/settings.local.json';
const hook = (over: Record<string, unknown> = {}) => ({ event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, label: 'Guard', description: 'Checks shell commands', ...over });
const block = (hooks: unknown[]): HooksBlock => hooksBlockOf({
  status: 'ok', live: { total: hooks.length, hooks }, session: {}, stale: false,
  files: [{ scope: 'user', path: U, exists: true, sets_disable_all: false }, { scope: 'project', path: P, exists: true, sets_disable_all: false }, { scope: 'local', path: L, exists: false, sets_disable_all: false }],
  trust: { state: 'ok', hash: 'h', reason: '' },
})!;
const draft = (over: Partial<HookDraft> = {}): HookDraft => ({ event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', timeout: '', name: 'Guard', description: 'Checks shell commands', ...over });
const only = (b: HooksBlock, i = 0): HookRow => b.hooks[i]!;
const steps = (p: ReturnType<typeof planOf>) => (p.ok ? p.steps.map((s) => s.op) : null);

describe('planOf: what Save does', () => {
  it('a new hook is ONE upsert in the chosen file, with name, description and a timeout', () => {
    const b = block([]);
    const p = planOf(b, null, draft({ command: 'echo hi', timeout: '30' }), undefined, 'user');
    expect(p).toMatchObject({ ok: true, kind: 'create', scope: 'user' });
    expect(p.ok && p.steps).toEqual([{ op: 'upsert', fields: { event: 'PreToolUse', matcher: 'Bash', command: 'echo hi', timeout: 30, name: 'Guard', description: 'Checks shell commands' } }]);
  });
  it('a change that leaves the identity alone is ONE upsert in place, never a delete, and always carries the timeout', () => {
    const b = block([hook({ timeout: 15 })]);
    const p = planOf(b, only(b), draft({ name: 'Guard shell', timeout: '15' }), undefined, null);
    expect(p).toMatchObject({ ok: true, kind: 'update', scope: 'user' });
    expect(steps(p)).toEqual(['upsert']);
    expect(p.ok && p.steps[0]).toMatchObject({ op: 'upsert', fields: { timeout: 15, name: 'Guard shell' } });
  });
  it('an empty timeout is sent as 0 (the default for the event), never left out', () => {
    const b = block([hook({ timeout: 15 })]);
    const p = planOf(b, only(b), draft({ timeout: '' }), undefined, null);
    expect(p.ok && p.steps[0]).toMatchObject({ fields: { timeout: 0 } });
    expect(upsertBody({ sessionId: 's', nonce: 'n', scope: 'user', fields: { event: 'Stop', matcher: '', command: 'x', timeout: 0 } })).toEqual({ session_id: 's', nonce: 'n', scope: 'user', event: 'Stop', command: 'x', timeout: 0 });
  });
  it('an update may leave the name and description empty (the agent keeps them) but a create and a replace may not', () => {
    const b = block([hook()]);
    const up = planOf(b, only(b), draft({ name: '', description: '' }), undefined, null);
    expect(up.ok && up.steps[0]).toEqual({ op: 'upsert', fields: { event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', timeout: 0 } });
    expect(planOf(b, only(b), draft({ command: './other.sh', name: '' }), undefined, null)).toEqual({ ok: false, why: 'invalid', problems: ['name_missing'] });
    expect(planOf(b, null, draft({ command: 'x', description: '' }), undefined, 'user')).toEqual({ ok: false, why: 'invalid', problems: ['desc_missing'] });
  });
  it('a changed command is a REPLACE: the add of the new hook first, then the delete of the old one named exactly as listed', () => {
    const b = block([hook({ matcher: 'Bash' })]);
    const p = planOf(b, only(b), draft({ command: './guard2.sh' }), undefined, null);
    expect(p).toMatchObject({ ok: true, kind: 'replace', scope: 'user' });
    expect(steps(p)).toEqual(['upsert', 'delete']);
    expect(p.ok && p.steps[1]).toEqual({ op: 'delete', hook: { event: 'PreToolUse', matcher: 'Bash', command: './guard.sh' } });
    expect(p.ok && p.steps[0]).toMatchObject({ fields: { command: './guard2.sh' } });
  });
  it('a changed event or matcher is a replace too', () => {
    const b = block([hook()]);
    expect(planOf(b, only(b), draft({ event: 'PostToolUse' }), undefined, null)).toMatchObject({ ok: true, kind: 'replace' });
    expect(planOf(b, only(b), draft({ matcher: 'Edit' }), undefined, null)).toMatchObject({ ok: true, kind: 'replace' });
  });
  it('an edit is written to the file the hook is in, never another', () => {
    const b = block([hook({ source: P })]);
    expect(planOf(b, only(b), draft({ command: 'x' }), '/w/shop', 'user')).toMatchObject({ ok: true, scope: 'project' });
  });
});

describe('planOf: identities the agent could take for another hook are refused', () => {
  it.each([
    ['Bash -> bash (the alias the agent folds)', 'Bash', 'bash'],
    ['a trailing space', 'Bash', 'Bash '],
    ['an unknown capitalised plain name', 'Bash', 'Zork'],
  ])('%s is not an exact edit and not a different hook: refused, nothing minted', (_n, from, to) => {
    const b = block([hook({ matcher: from, command: 'x' })]);
    const p = planOf(b, only(b), draft({ matcher: to, command: 'x', name: 'n', description: 'd' }), undefined, null);
    if (to === 'Bash ') expect(p).toMatchObject({ ok: true, kind: 'update' });
    else expect(p).toEqual({ ok: false, why: 'ambiguous' });
  });
  it('nothing and "*" are one wildcard: an edit from one spelling to the other is an update in place', () => {
    const b = block([hook({ matcher: '' })]);
    expect(planOf(b, only(b), draft({ matcher: '*' }), undefined, null)).toMatchObject({ ok: true, kind: 'update' });
  });
  it('a new identity equal to ANOTHER hook of that file is a collision (the add would overwrite it)', () => {
    const b = block([hook({ command: 'a' }), hook({ command: 'b', label: 'B' })]);
    expect(planOf(b, only(b, 0), draft({ command: 'b' }), undefined, null)).toEqual({ ok: false, why: 'collision' });
    expect(planOf(b, null, draft({ command: 'b' }), undefined, 'user')).toEqual({ ok: false, why: 'collision' });
  });
  it('a hook the agent may take for the new one is ambiguous, not a collision', () => {
    const b = block([hook({ command: 'a' }), hook({ command: 'b', matcher: 'bash' })]);
    expect(planOf(b, only(b, 0), draft({ command: 'b', matcher: 'Bash' }), undefined, null)).toEqual({ ok: false, why: 'ambiguous' });
  });
  it('the same identity in ANOTHER file is not a collision; a hook whose file is not known counts as possibly the same file', () => {
    const other = block([hook({ command: 'a' }), hook({ command: 'b', source: P })]);
    expect(planOf(other, only(other, 0), draft({ command: 'b' }), '/w/shop', null)).toMatchObject({ ok: true, kind: 'replace' });
    const unknown = block([hook({ command: 'a' }), hook({ command: 'b', source: '/elsewhere.json' })]);
    expect(planOf(unknown, only(unknown, 0), draft({ command: 'b' }), undefined, null)).toEqual({ ok: false, why: 'collision' });
  });
});

describe('planOf: other refusals', () => {
  it('replacing the identity of a hook that is OFF is refused (the new hook would arrive ON); an update in place of it is not', () => {
    const b = block([hook({ disabled: true })]);
    expect(planOf(b, only(b), draft({ command: './new.sh' }), undefined, null)).toEqual({ ok: false, why: 'off' });
    expect(planOf(b, only(b), draft({ name: 'Renamed' }), undefined, null)).toMatchObject({ ok: true, kind: 'update' });
  });
  it('a new identity that cannot be named whole is refused: empty command, a non-ASCII matcher, a field past the cap', () => {
    const b = block([]);
    expect(planOf(b, null, draft({ command: '' }), undefined, 'user')).toEqual({ ok: false, why: 'invalid', problems: ['command'] });
    expect(planOf(b, null, draft({ matcher: 'Bäsh', command: 'x' }), undefined, 'user')).toEqual({ ok: false, why: 'ascii' });
    expect(planOf(b, null, draft({ command: 'x'.repeat(5000) }), undefined, 'user')).toEqual({ ok: false, why: 'long' });
  });
  it('an old hook that cannot be changed from here (twin, folder, file unknown) is refused with the reason', () => {
    const twins = block([hook(), hook({ matcher: 'bash' })]);
    expect(planOf(twins, only(twins, 0), draft(), undefined, null)).toEqual({ ok: false, why: 'twin' });
    const proj = block([hook({ source: P })]);
    expect(planOf(proj, only(proj), draft(), undefined, null)).toEqual({ ok: false, why: 'folder' });
    const unk = block([hook({ source: '' })]);
    expect(planOf(unk, only(unk), draft(), undefined, null)).toEqual({ ok: false, why: 'unplaced' });
  });
  it('a new hook goes to a file this place owns: a realm place has the user file only', () => {
    const b = block([]);
    expect(planOf(b, null, draft({ command: 'x' }), undefined, 'project')).toEqual({ ok: false, why: 'scope' });
    expect(planOf(b, null, draft({ command: 'x' }), '/w/shop', 'project')).toMatchObject({ ok: true, scope: 'project' });
    expect(planOf(b, null, draft({ command: 'x' }), undefined, null)).toEqual({ ok: false, why: 'scope' });
  });
});

describe('draft checks', () => {
  const b = block([]);
  const bad = (d: Partial<HookDraft>) => { const p = planOf(b, null, draft({ command: 'x', ...d }), undefined, 'user'); return p.ok ? null : p.why === 'invalid' ? p.problems : p.why; };
  it('name and description are required for a new hook and bounded in BYTES, the name on one line', () => {
    expect(bad({ name: '' })).toEqual(['name_missing']);
    expect(bad({ description: '  ' })).toEqual(['desc_missing']);
    expect(bad({ name: 'a'.repeat(NAME_MAX) })).toBeNull();
    expect(bad({ name: 'a'.repeat(NAME_MAX + 1) })).toEqual(['name_long']);
    expect(bad({ name: 'é'.repeat(NAME_MAX / 2 + 1) })).toEqual(['name_long']);
    expect(bad({ name: 'two\nlines' })).toEqual(['name_line']);
    expect(bad({ description: 'd'.repeat(DESC_MAX + 1) })).toEqual(['desc_long']);
  });
  it('the timeout is whole seconds from 0 to 86400; empty means the default', () => {
    expect(timeoutOf('')).toBe(0);
    expect(timeoutOf('60')).toBe(60);
    expect(timeoutOf(String(TIMEOUT_MAX))).toBe(TIMEOUT_MAX);
    for (const x of ['-1', '1.5', '86401', 'abc', '1e3', '9999999']) expect(timeoutOf(x)).toBeNull();
    expect(bad({ timeout: '-5' })).toEqual(['timeout']);
  });
  it('the event must be one the agent knows', () => {
    expect(bad({ event: 'Nope' })).toEqual(['event']);
  });
});

describe('bodies', () => {
  it('an upsert leaves out the wildcard matcher and empty name/description, and always carries session, nonce, scope and timeout', () => {
    expect(upsertBody({ sessionId: 's1', nonce: 'n1', scope: 'project', fields: { event: 'Stop', matcher: '', command: 'c', timeout: 0 } }))
      .toEqual({ session_id: 's1', nonce: 'n1', scope: 'project', event: 'Stop', command: 'c', timeout: 0 });
    expect(upsertBody({ sessionId: 's1', nonce: 'n1', scope: 'user', fields: { event: 'Stop', matcher: 'Bash', command: 'c', timeout: 9, name: 'N', description: 'D' } }))
      .toEqual({ session_id: 's1', nonce: 'n1', scope: 'user', event: 'Stop', matcher: 'Bash', command: 'c', timeout: 9, name: 'N', description: 'D' });
  });
  it('a test names the unsaved command and leaves the timeout out when it is the default', () => {
    expect(testBody({ sessionId: 's', event: 'Stop', command: 'c', timeout: 0 })).toEqual({ session_id: 's', event: 'Stop', command: 'c' });
    expect(testBody({ sessionId: 's', event: 'Stop', command: 'c', timeout: 5 })).toEqual({ session_id: 's', event: 'Stop', command: 'c', timeout: 5 });
  });
  it('draftOf starts from the hook and exactSame ignores only the wildcard spelling and the ASCII trim', () => {
    const b = block([hook({ timeout: 7 })]);
    expect(draftOf(only(b))).toEqual({ event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', timeout: '7', name: 'Guard', description: 'Checks shell commands' });
    expect(draftOf(null).command).toBe('');
    expect(exactSame({ event: 'Stop', matcher: '*', command: 'c' }, { event: 'Stop', matcher: '', command: 'c' })).toBe(true);
    expect(exactSame({ event: 'Stop', matcher: 'Bash', command: 'c' }, { event: 'Stop', matcher: 'bash', command: 'c' })).toBe(false);
  });
});

describe('one hold per file', () => {
  it('an add or change locks the same key as a toggle, a delete and the kill switch of that file', () => {
    const at = { target: { project: { id: 'p1' }, container: { id: 'c1' } }, realm: 'r1', cwd: '/w/shop' } as unknown as HookVars;
    const base = { ...at, hold: {} as HookVars['hold'] };
    const ref = { event: 'PreToolUse', matcher: 'Bash', command: './guard.sh' };
    for (const scope of ['user', 'project', 'local'] as const) {
      const up = hookLockKeyOf({ ...base, scope, op: 'upsert', fields: { ...ref, timeout: 0 } });
      expect(up).toEqual(hookLockKeyOf({ ...base, scope, op: 'toggle', hook: ref, disabled: true }));
      expect(up).toEqual(hookLockKeyOf({ ...base, scope, op: 'delete', hook: ref }));
      expect(up).toEqual(hookLockKeyOf({ ...base, scope, op: 'disable_all', value: true }));
    }
  });
});

describe('the edited hook is found by what it is, never by where it sits', () => {
  it('a fresh list with another hook in front still plans an edit of the same hook (no false twin)', () => {
    const first = block([hook(), hook({ event: 'Stop', matcher: '', command: 'notify-send done' })]);
    const fresh = block([hook({ event: 'PostToolUse', command: './after.sh' }), hook(), hook({ event: 'Stop', matcher: '', command: 'notify-send done' })]);
    expect(only(fresh, 1)).not.toBe(only(first));
    expect(planOf(fresh, only(first), draft({ name: 'Guard shell' }), undefined, null)).toMatchObject({ ok: true, kind: 'update' });
    expect(locate(fresh, only(first))).toBe(only(fresh, 1));
  });
  it('a hook no longer in the list is refused as gone; two exact copies in one file as ambiguous', () => {
    const first = block([hook()]);
    expect(planOf(block([]), only(first), draft({ name: 'x' }), undefined, null)).toEqual({ ok: false, why: 'gone' });
    expect(locate(block([]), only(first))).toBe('gone');
    expect(locate(block([hook(), hook()]), only(first))).toBe('ambiguous');
  });
  it('the same hook in another file is a different hook: found in its own file only', () => {
    const both = block([hook({ source: P }), hook()]);
    expect(locate(both, only(block([hook()])))).toBe(only(both, 1));
    expect(locate(block([hook({ source: P })]), only(block([hook()])))).toBe('gone');
  });
});

describe('removing the old hook again is judged on the list read just before', () => {
  it('the delete names the hook found in the fresh list', () => {
    const first = block([hook()]);
    const fresh = block([hook({ event: 'PostToolUse', command: './new.sh' }), hook()]);
    expect(removeOf(fresh, only(first), undefined)).toEqual({ ok: true, step: { op: 'delete', hook: { event: 'PreToolUse', matcher: 'Bash', command: './guard.sh' } } });
  });
  it('a hook the agent could take for the old one, added since, refuses the delete (it would reach both)', () => {
    const first = block([hook()]);
    expect(removeOf(block([hook(), hook({ matcher: 'bash' })]), only(first), undefined)).toEqual({ ok: false, why: 'twin' });
  });
  it('the old hook gone, or in a folder file this place cannot name, sends nothing', () => {
    const first = block([hook()]);
    expect(removeOf(block([]), only(first), undefined)).toEqual({ ok: false, why: 'gone' });
    const proj = block([hook({ source: P })]);
    expect(removeOf(proj, only(proj), undefined)).toEqual({ ok: false, why: 'folder' });
  });
});

describe('a test row is read whole or not at all', () => {
  const good = { exit_code: 0, stdout: 'hi', stderr: '', timed_out: false, duration_ms: 12 };
  it('a whole row reads; a timed-out row may have no exit code', () => {
    expect(testRowOf(good)).toEqual({ exitCode: 0, stdout: 'hi', stderr: '', timedOut: false, durationMs: 12 });
    expect(testRowOf({ ...good, exit_code: null, timed_out: true })).toMatchObject({ exitCode: null, timedOut: true });
  });
  const bad: [string, Record<string, unknown>][] = [
    ['exit_code a string', { exit_code: '0' }], ['exit_code fractional', { exit_code: 1.5 }], ['exit_code not finite', { exit_code: Infinity }],
    ['stdout a number', { stdout: 42 }], ['stderr null', { stderr: null }], ['timed_out a string', { timed_out: 'true' }],
    ['duration negative', { duration_ms: -1 }], ['duration fractional', { duration_ms: 1.5 }], ['duration not finite', { duration_ms: NaN }],
  ];
  for (const [what, over] of bad) it(`one field wrong (${what}) makes the row unknown`, () => { expect(testRowOf({ ...good, ...over })).toBeNull(); });
  for (const k of Object.keys(good)) {
    it(`one field missing (${k}) makes the row unknown`, () => { const r: Record<string, unknown> = { ...good }; delete r[k]; expect(testRowOf(r)).toBeNull(); });
  }
});

// A replace writes a NEW hook (upsert) then deletes the old one, so the new hook carries the old one's condition; an update in
// place sends no `when` (the agent keeps the stored one when the key is absent).
describe('planOf: when (call_when)', () => {
  const W = ['+edit_file|write_file', '-bash(command=\\bgo test\\b):success'];
  const stop = (over: Record<string, unknown> = {}) => hook({ event: 'Stop', matcher: '', command: './check.sh', when: W, ...over });
  const sdraft = (over: Partial<HookDraft> = {}) => draft({ event: 'Stop', matcher: '', command: './check.sh', ...over });
  it('a replace carries the old hook\'s condition into the new hook, verbatim', () => {
    const b = block([stop()]);
    const p = planOf(b, only(b), sdraft({ command: './check2.sh' }), undefined, null);
    expect(p).toMatchObject({ ok: true, kind: 'replace' });
    expect(p.ok && p.steps[0]).toMatchObject({ op: 'upsert', fields: { command: './check2.sh', when: W } });
    expect(upsertBody({ sessionId: 's', nonce: 'n', scope: 'user', fields: (p.ok && p.steps[0]!.op === 'upsert' ? p.steps[0]!.fields : null)! }).when).toEqual(W);
  });
  it('a replace onto SubagentStop keeps the condition', () => {
    const b = block([stop()]);
    expect(planOf(b, only(b), sdraft({ event: 'SubagentStop' }), undefined, null)).toMatchObject({ ok: true, kind: 'replace' });
  });
  it.each(['PreToolUse', 'PostToolUse', 'UserPromptSubmit'])('a replace of a hook with a condition onto %s is refused before any step', (event) => {
    const b = block([stop()]);
    expect(planOf(b, only(b), sdraft({ event }), undefined, null)).toEqual({ ok: false, why: 'when_event' });
  });
  it('a hook without a condition may move to any event, and its replace sends no when', () => {
    const b = block([stop({ when: undefined })]);
    const p = planOf(b, only(b), sdraft({ event: 'PreToolUse', matcher: 'Bash' }), undefined, null);
    expect(p).toMatchObject({ ok: true, kind: 'replace' });
    expect(p.ok && p.steps[0]!.op === 'upsert' && 'when' in p.steps[0]!.fields).toBe(false);
  });
  it('an update in place sends no when key, so the agent keeps the stored condition', () => {
    const b = block([stop()]);
    const p = planOf(b, only(b), sdraft({ name: 'Check again' }), undefined, null);
    expect(p).toMatchObject({ ok: true, kind: 'update' });
    const f = p.ok && p.steps[0]!.op === 'upsert' ? p.steps[0]!.fields : null;
    expect(f && 'when' in f).toBe(false);
    expect('when' in upsertBody({ sessionId: 's', nonce: 'n', scope: 'user', fields: f! })).toBe(false);
  });
  it('a replace of a hook whose condition could not be read is refused (it could not be carried)', () => {
    const b = block([stop({ when: 'not a list' })]);
    expect(planOf(b, only(b), sdraft({ command: './check2.sh' }), undefined, null)).toEqual({ ok: false, why: 'when' });
    // In place it is still fine: nothing about the condition is sent.
    expect(planOf(b, only(b), sdraft({ name: 'Renamed' }), undefined, null)).toMatchObject({ ok: true, kind: 'update' });
  });
});

describe('a typed name or description that turns the text\'s direction is refused, never stripped', () => {
  const cp = (...c: number[]) => String.fromCodePoint(...c);
  const RLO = cp(0x202e), RLI = cp(0x2067), PDI = cp(0x2069);
  it('every embedding, override and isolate turns direction; the marks, ZWJ, ZWNJ and plain text do not', () => {
    for (const c of [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) expect(turnsDirection(`a${cp(c)}b`), c.toString(16)).toBe(true);
    for (const c of [0x200e, 0x200f, 0x061c, 0x200d, 0x200c, 0x200b, 0x2065, 0x206a, 0x2029, 0x2030]) expect(turnsDirection(`a${cp(c)}b`), c.toString(16)).toBe(false);
    expect(turnsDirection('')).toBe(false);
  });
  it('a new hook named with one is refused (name_bidi), and so is a description with one (desc_bidi): nothing is planned', () => {
    const b = block([]);
    expect(planOf(b, null, draft({ command: 'echo hi', name: `Guard${RLO}llehs` }), undefined, 'user')).toEqual({ ok: false, why: 'invalid', problems: ['name_bidi'] });
    expect(planOf(b, null, draft({ command: 'echo hi', description: `Checks ${RLI}shell${PDI} commands` }), undefined, 'user')).toEqual({ ok: false, why: 'invalid', problems: ['desc_bidi'] });
    // both at once: both reasons
    expect(planOf(b, null, draft({ command: 'echo hi', name: `G${RLO}`, description: `D${RLI}` }), undefined, 'user')).toEqual({ ok: false, why: 'invalid', problems: ['name_bidi', 'desc_bidi'] });
  });
  it('a hook whose SAVED name holds one opens without it (draftOf), so its update plans; the same draft with it typed back is refused', () => {
    const b = block([hook({ label: `Guard${RLO}llehs` })]);
    const p = planOf(b, only(b), draftOf(only(b)), undefined, null);
    expect(p.ok && p.steps[0]).toMatchObject({ op: 'upsert', fields: { name: 'Guardllehs' } });
    expect(planOf(b, only(b), { ...draftOf(only(b)), name: `Guard${RLO}llehs`, timeout: '20' }, undefined, null)).toEqual({ ok: false, why: 'invalid', problems: ['name_bidi'] });
  });

  it('real text is saved as typed: a ZWJ emoji, ZWNJ, RLM, LRM and ALM in a name or description', () => {
    const name = `Deploy ${cp(0x1f9d1, 0x200d, 0x1f4bb)}`;
    const description = `mi${cp(0x200c)}khaham ${cp(0x200f)}a${cp(0x200e)}b${cp(0x061c)}c`;
    const p = planOf(block([]), null, draft({ command: 'echo hi', name, description }), undefined, 'user');
    expect(p.ok && p.steps[0]).toMatchObject({ op: 'upsert', fields: { name, description } });
  });
});

describe('the hold records a digest of the hook for every op, never its text', () => {
  const at = { target: { project: { id: 'p1' }, container: { id: 'c1' } }, realm: 'r1', cwd: '/w/shop', hold: {} } as unknown as HookVars;
  const long = { event: 'PreToolUse', matcher: 'M'.repeat(4096), command: 'c'.repeat(4096) };
  it('a toggle, an add, a change and a plain delete of a hook as long as the agent takes stay far under core\'s 8192 record cap', () => {
    for (const v of [
      { ...at, scope: 'user', op: 'toggle', hook: long, disabled: true },
      { ...at, scope: 'user', op: 'delete', hook: long },
      { ...at, scope: 'project', op: 'upsert', fields: { ...long, timeout: 0, name: 'n'.repeat(80), description: 'd'.repeat(500) } },
    ] as unknown as HookVars[]) {
      const id = hookIdentityOf(v) as Record<string, unknown>;
      const json = JSON.stringify(id);
      expect(json.length, String(v.op)).toBeLessThan(400);
      for (const k of ['command', 'matcher', 'event', 'name', 'description']) expect(id, k).not.toHaveProperty(k);
      expect(id).toMatchObject({ ...hookLockKeyOf(v), op: v.op });
      expect(typeof id.text).toBe('string');
    }
  });
  it('the digest tells hooks apart (event, matcher, command each count) and keeps what the hold shows (op, the switch value)', () => {
    const ref = { event: 'PreToolUse', matcher: 'Bash', command: './guard.sh' };
    const of = (hook: typeof ref) => (hookIdentityOf({ ...at, scope: 'user', op: 'toggle', hook, disabled: false } as unknown as HookVars) as Record<string, unknown>).text;
    const t0 = of(ref);
    expect(of({ ...ref })).toBe(t0);
    expect(of({ ...ref, event: 'PostToolUse' })).not.toBe(t0);
    expect(of({ ...ref, matcher: 'Edit' })).not.toBe(t0);
    expect(of({ ...ref, command: './guard2.sh' })).not.toBe(t0);
    expect(hookIdentityOf({ ...at, scope: 'user', op: 'toggle', hook: ref, disabled: false } as unknown as HookVars)).toMatchObject({ op: 'toggle', disabled: false });
    expect(hookIdentityOf({ ...at, scope: 'user', op: 'disable_all', value: true } as unknown as HookVars)).toEqual({ ...hookLockKeyOf({ ...at, scope: 'user' } as unknown as HookVars), op: 'disable_all', value: true });
  });
});

describe('the draft strips only the name and description, and an all-hidden label is kept by an update', () => {
  const ZW = String.fromCodePoint(0x200b);
  it('draftOf copies a raw hidden character in the event, matcher and command verbatim (only the name and description are stripped)', () => {
    const h = only(block([hook({ matcher: `Ba${ZW}sh`, command: `./gu${ZW}ard.sh`, label: `G${ZW}uard`, description: `Ch${ZW}ecks` })]));
    const d = draftOf(h);
    expect(d.matcher).toBe(h.matcher);
    expect(d.command).toBe(h.command);
    expect(d.event).toBe(h.event);
    expect(h.command.includes(ZW) && h.matcher.includes(ZW)).toBe(true);
    expect(d).toMatchObject({ name: 'Guard', description: 'Checks' });
  });
  it('a label made only of hidden characters opens empty with its note, and the update leaves the name out (the agent keeps the stored one)', () => {
    const b = block([hook({ label: ZW.repeat(3) })]);
    const h = only(b);
    expect(strippedOf(h)).toEqual({ name: true, description: false });
    const d = draftOf(h);
    expect(d.name).toBe('');
    const p = planOf(b, h, { ...d, timeout: '20' }, undefined, null);
    expect(p).toMatchObject({ ok: true, kind: 'update' });
    expect(p.ok && p.steps.length).toBe(1);
    const f = p.ok ? (p.steps[0] as unknown as { fields: Record<string, unknown> }).fields : {};
    expect(f).not.toHaveProperty('name');
    expect(f).toMatchObject({ description: 'Checks shell commands', timeout: 20 });
  });
});
