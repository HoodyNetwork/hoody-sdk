// The workflow source editor's state over a fake api: the revision line read, the draft checked before sending,
// a save that lands only on its revision (the next base read again, since the agent answers none), the conflict's ways
// out, a lost save proved only by a read of the sent definition (stamped keys aside), and Delete / Reset / Hide.
import { describe, expect, it } from 'vitest';
import { createDangerStore, hiddenOf, resetSight } from './danger';
import { canonicalOf, createSourceStore, definitionOf, holdsSent, sourceOf } from './source';
import type { Refusal, Settled, WorkflowSourceApi } from './sourceApi';

const ok = (b: unknown): Settled => ({ ok: true, body: b });
const err = (kind: Refusal['kind'], o: Partial<Refusal> = {}): Settled => ({ ok: false, err: { kind, code: '', status: 0, notApplied: false, ...o } });
const env = (output: string, is_error = false) => ok({ status: 'ok', output, is_error });
// As getWorkflow reads it (the agent's workflow definition marshalled): entry_point and next_steps are StepRef objects, steps a map.
const DEF = {
  name: 'ship-fix', entry_point: { id: 'a', params: { issue: '$(input.issue)' } },
  steps: { a: { type: 'bash', command: 'true', next_steps: [{ id: 'b' }] }, b: { type: 'agent', agent: 'fixer', prompt: 'Fix it' } },
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z',
};
const text = (d: object) => JSON.stringify(d, null, 2);
/** What Save sends for a draft (definitionOf's def: the stamped keys left out). */
const sent = (d: object): Record<string, unknown> => {
  const r = definitionOf(text(d));
  if (!('def' in r)) throw new Error(`draft refused: ${r.problem}`);
  return r.def;
};
const { name: _n, created_at: _c, updated_at: _u, ...UNSTAMPED } = DEF;
const doc = (d: object, rev: string) => env(`revision: ${rev}\n${text(d)}`);
const conflict = err('failed', { code: 'revision_conflict', status: 200, notApplied: true });

type Pending = (s: Settled) => void;
function fake() {
  const q = { gets: [] as Pending[], puts: [] as Array<{ def: Record<string, unknown>; rev: string; answer: Pending }>, removes: [] as Pending[], hides: [] as Array<{ hidden: boolean; answer: Pending }>, lists: [] as Pending[] };
  const api: WorkflowSourceApi = {
    get: () => new Promise((r) => q.gets.push(r)),
    put: (def, rev) => new Promise((r) => q.puts.push({ def, rev, answer: r })),
    remove: () => new Promise((r) => q.removes.push(r)),
    hide: (hidden) => new Promise((r) => q.hides.push({ hidden, answer: r })),
    list: () => new Promise((r) => q.lists.push(r)),
  };
  return { q, api };
}
const tick = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

async function loaded(d: object = DEF, rev = 'r1') {
  const f = fake();
  const st = createSourceStore({ api: f.api });
  const p = st.load();
  f.q.gets[0]!(doc(d, rev));
  await p;
  return { f, st };
}

describe('sourceOf', () => {
  it('reads the revision line and the definition below it, keeping the text as read', () => {
    expect(sourceOf({ output: `revision: r1:ab\n${text(DEF)}`, is_error: false })).toEqual({ content: text(DEF), revision: 'r1:ab', project: false });
  });
  it('a project workflow: the provenance line is dropped and remembered', () => {
    const out = `revision: r1:ab\nproject: true (UNTRUSTED — layered from the repository)\n${text(DEF)}`;
    expect(sourceOf({ output: out, is_error: false })).toEqual({ content: text(DEF), revision: 'r1:ab', project: true });
  });
  it('anything else is no source: no revision line, a revision with a space, not an object, an error envelope', () => {
    for (const x of [
      { output: text(DEF) }, { output: 'revision: a b\n{}' }, { output: 'revision: r\n[1]' }, { output: 'revision: r\nnot json' },
      { output: 'revision: r' }, { output: 'revision: r\n{}', is_error: true }, null, 'revision: r\n{}', { output: 7 },
    ]) expect(sourceOf(x)).toBeNull();
  });
});

describe('definitionOf', () => {
  it('a JSON object with an entry point and steps is sent as is', () => {
    // The fields the agent stamps itself are never sent.
    expect(definitionOf(text({ ...DEF, system: true }))).toEqual({ def: UNSTAMPED });
    expect(definitionOf('{"entry_point":{"id":"a"},"steps":{"a":{}}}')).toMatchObject({ def: { entry_point: { id: 'a' } } });
    expect(definitionOf('{"entry_point":"a","steps":[{"id":"a"}]}')).toMatchObject({ def: { entry_point: 'a' } });
  });
  it('says why a draft cannot be sent', () => {
    expect(definitionOf('{\n  "a": 1,\n}')).toMatchObject({ problem: 'json' });
    expect(definitionOf('[1]')).toEqual({ problem: 'object' });
    expect(definitionOf('{"steps":{"a":{}}}')).toEqual({ problem: 'entry' });
    expect(definitionOf('{"entry_point":" ","steps":{"a":{}}}')).toEqual({ problem: 'entry' });
    expect(definitionOf('{"entry_point":{"id":""},"steps":{"a":{}}}')).toEqual({ problem: 'entry' });
    expect(definitionOf('{"entry_point":{"params":{}},"steps":{"a":{}}}')).toEqual({ problem: 'entry' });
    expect(definitionOf('{"entry_point":"a","steps":{}}')).toEqual({ problem: 'steps' });
    expect(definitionOf('{"entry_point":"a","steps":[]}')).toEqual({ problem: 'steps' });
    expect(definitionOf(`{"entry_point":"a","steps":{"a":{}},"x":"${'y'.repeat(1 << 20)}"}`)).toEqual({ problem: 'tooBig' });
  });
  // The agent's field kinds, each with JSON null (Go leaves the zero value / a nil pointer, no error).
  it.each([
    ['summary', 'string', 's'], ['params', '[]WorkflowParamDef', []], ['labels', '[]string', ['a']], ['max_concurrency', 'int', 2],
    ['env', 'map[string]string', { A: '1' }], ['timeout_sec', '*int', 60], ['outputs', 'map[string]string', { o: '$(step.a)' }],
  ] as const)('%s (%s) takes its value and null, as the agent decodes it', (k, _kind, x) => {
    const base = '"entry_point":"a","steps":{"a":{}}';
    expect(definitionOf(`{${base},"${k}":${JSON.stringify(x)}}`)).toMatchObject({ def: { [k]: x } });
    expect(definitionOf(`{${base},"${k}":null}`)).toMatchObject({ def: { [k]: null } });
  });
  it('a null map value is taken (the agent stores ""), a null entry point or steps are not', () => {
    expect(definitionOf('{"entry_point":"a","steps":{"a":{}},"env":{"A":null}}')).toMatchObject({ def: { env: { A: null } } });
    expect(definitionOf('{"entry_point":null,"steps":{"a":{}}}')).toEqual({ problem: 'entry' });
    expect(definitionOf('{"entry_point":"a","steps":null}')).toEqual({ problem: 'steps' });
  });
  // the agent stores a null omitempty field as left out, so a cleared timeout read back without it is the
  // save; the old value read back is not.
  it('clearing a timeout sends null; a lost save read back without the field is Saved, read back as before stays unsure', async () => {
    {
      const { f, st } = await loaded({ ...DEF, timeout_sec: 60 });
      const mine = { ...DEF, timeout_sec: null };
      st.setDraft(text(mine));
      const p = st.save();
      expect(f.q.puts[0]!.def).toEqual({ ...UNSTAMPED, timeout_sec: null });
      f.q.puts[0]!.answer(err('pending'));
      await p;
      const c = st.check();
      f.q.gets[1]!(doc({ ...DEF, updated_at: 'later' }, 'r2'));
      await c;
      expect(st.view()).toMatchObject({ save: 'saved', dirty: false });
    }
    {
      const { f, st } = await loaded({ ...DEF, timeout_sec: 60 });
      const mine = { ...DEF, timeout_sec: null };
      st.setDraft(text(mine));
      const p = st.save();
      f.q.puts[0]!.answer(err('pending'));
      await p;
      const c = st.check();
      f.q.gets[1]!(doc({ ...DEF, timeout_sec: 60 }, 'r1'));
      await c;
      expect(st.view()).toMatchObject({ save: 'unsure', draft: text(mine), dirty: true });
    }
  });
  it('null follows Go: a null field equals it left out, a null env value equals ""; an empty or zero value proves nothing', () => {
    for (const k of ['summary', 'params', 'labels', 'max_concurrency', 'env', 'timeout_sec', 'outputs'])
      expect(holdsSent(text(DEF), sent({ ...DEF, [k]: null }))).toBe(true);
    expect(holdsSent(text({ ...DEF, env: { A: '' } }), sent({ ...DEF, env: { A: null } }))).toBe(true);
    // An outputs template decoded blank is refused by the agent: never proof, even against a stored blank one.
    expect(holdsSent(text({ ...DEF, outputs: { result: '' } }), { ...UNSTAMPED, outputs: { result: null } })).toBe(false);
    expect(holdsSent(text({ ...DEF, outputs: { result: ' ' } }), { ...UNSTAMPED, outputs: { result: ' ' } })).toBe(false);
    expect(holdsSent(text(DEF), sent({ ...DEF, env: { A: null } }))).toBe(false);
    expect(holdsSent(text({ ...DEF, timeout_sec: 60 }), sent({ ...DEF, timeout_sec: null }))).toBe(false);
    expect(holdsSent(text(DEF), sent({ ...DEF, timeout_sec: 0 }))).toBe(false);
    expect(holdsSent(text(DEF), sent({ ...DEF, summary: '' }))).toBe(false);
  });
  it('a null or blank outputs template is refused before sending (the agent refuses a blank template)', () => {
    const base = '"entry_point":"a","steps":{"a":{}}';
    for (const t of ['null', '""', '"  "', '"\\t\\n"', '"\\u0085"'])
      expect(definitionOf(`{${base},"outputs":{"ok":"$(step.a)","result":${t}}}`)).toEqual({ problem: 'blankOutput', key: 'result' });
    expect(definitionOf(`{${base},"outputs":{"result":"$(step.a)"}}`)).toMatchObject({ def: { outputs: { result: '$(step.a)' } } });
  });
  // a raw stored "outputs":{"result":""} (served for repair): the draft sets it to null.
  it('a stored blank output changed to null: nothing is sent, the draft is kept', async () => {
    const { f, st } = await loaded({ ...DEF, outputs: { result: '' } });
    const mine = { ...DEF, outputs: { result: null } };
    st.setDraft(text(mine));
    await st.save();
    expect(f.q.puts).toHaveLength(0);
    expect(st.view()).toMatchObject({ save: 'idle', draft: text(mine), dirty: true, problem: { kind: 'blankOutput', key: 'result' } });
  });
  it("other fields are checked with the agent's decoder rules before anything is sent", () => {
    const base = '"entry_point":"a","steps":{"a":{}}';
    expect(definitionOf(`{${base},"entrypoint":"a"}`)).toEqual({ problem: 'unknownKey', key: 'entrypoint' });
    expect(definitionOf(`{${base},"project":true}`)).toEqual({ problem: 'unknownKey', key: 'project' });
    for (const [k, x] of [['summary', 1], ['params', {}], ['labels', [1]], ['labels', 'ops'], ['max_concurrency', 1.5], ['max_concurrency', '2'], ['env', { A: 1 }], ['env', []], ['timeout_sec', '60'], ['outputs', { a: true }]] as const)
      expect(definitionOf(`{${base},"${k}":${JSON.stringify(x)}}`)).toEqual({ problem: 'type', key: k });
    expect(definitionOf(`{${base},"summary":"s","params":[],"labels":["a"],"max_concurrency":2,"env":{"A":"1"},"timeout_sec":60,"outputs":{"o":"$(step.a)"}}`)).toMatchObject({ def: { max_concurrency: 2 } });
  });
});

describe('holdsSent', () => {
  it('the stamped keys (name, system, created_at, updated_at) are never sent and set aside in the read; key order does not matter', () => {
    const stored = text({ updated_at: 'later', steps: { b: { prompt: 'Fix it', agent: 'fixer', type: 'agent' }, a: { next_steps: [{ id: 'b' }], command: 'true', type: 'bash' } }, entry_point: { params: { issue: '$(input.issue)' }, id: 'a' }, name: 'ship-fix', system: true, created_at: 'x' });
    expect(holdsSent(stored, sent({ ...DEF, name: 'other' }))).toBe(true);
  });
  it("the agent's own normalizing is followed: shorthand sent, the stored canonical form read back proves it", () => {
    const canon = { name: 'w', entry_point: { id: 'a' }, steps: { a: { type: 'bash', command: 'true', next_steps: [{ id: 'stop' }] }, b: { type: 'bash', command: 'x', next_steps: [{ id: 'a' }, { id: 'stop' }] } }, labels: ['ops'] };
    const short = { entry_point: 'a', steps: [{ id: 'a', type: 'bash', command: 'true', next_steps: 'stop' }, { id: 'b', type: 'bash', command: 'x', next_steps: ['a', { id: 'stop' }] }], labels: [' Ops ', 'ops'] };
    expect(holdsSent(text(canon), sent(short))).toBe(true);
    // A map step with an inner id equal to its key.
    expect(holdsSent(text(canon), sent({ ...canon, steps: { ...canon.steps, a: { id: 'a', ...canon.steps.a } } }))).toBe(true);
    // Shapes the agent refuses prove nothing.
    expect(canonicalOf({ steps: [{ id: 'a' }, { id: 'a' }] })).toBeNull();
    expect(canonicalOf({ steps: { a: { id: 'b' } } })).toBeNull();
  });
  it('a sent definition holding a stamped key proves nothing (Save never sends one)', () => {
    expect(holdsSent(text(DEF), DEF)).toBe(false);
  });
  it('any other difference is not proof: a command, a reference, a parameter, a field', () => {
    expect(holdsSent(text(DEF), sent({ ...DEF, summary: 'new' }))).toBe(false);
    expect(holdsSent(text(DEF), sent({ ...DEF, steps: { ...DEF.steps, a: { ...DEF.steps.a, command: 'false' } } }))).toBe(false);
    expect(holdsSent(text(DEF), sent({ ...DEF, steps: { ...DEF.steps, a: { ...DEF.steps.a, next_steps: [{ id: 'stop' }] } } }))).toBe(false);
    expect(holdsSent(text(DEF), sent({ ...DEF, entry_point: { id: 'a', params: { issue: '$(input.other)' } } }))).toBe(false);
    expect(holdsSent(text(DEF), sent({ ...DEF, entry_point: 'a' }))).toBe(false);
    expect(holdsSent(text({ ...DEF, summary: 'x' }), sent(DEF))).toBe(false);
    expect(holdsSent('not json', sent(DEF))).toBe(false);
  });
  it('nothing is assumed beyond the rules: a key on one side only is never proof (an explicit false, an empty value)', () => {
    // stream is a pointer in the agent: an explicit false means something; leaving it out means the default.
    expect(holdsSent(text(DEF), sent({ ...DEF, steps: { ...DEF.steps, a: { ...DEF.steps.a, stream: false } } }))).toBe(false);
    expect(holdsSent(text(DEF), sent({ ...DEF, summary: '' }))).toBe(false);
    expect(holdsSent(text(DEF), sent({ ...DEF, labels: [] }))).toBe(false);
    expect(holdsSent(text(DEF), sent({ ...DEF, steps: { ...DEF.steps, a: { ...DEF.steps.a, env: {} } } }))).toBe(false);
    expect(holdsSent(text({ ...DEF, x_unknown: '' }), sent(DEF))).toBe(false);
  });
  it('a label the agent refuses proves nothing (empty once trimmed, a comma, a newline)', () => {
    const stored = text({ ...DEF, labels: ['ops'] });
    expect(holdsSent(stored, sent({ ...DEF, labels: ['ops', ''] }))).toBe(false);
    expect(holdsSent(stored, sent({ ...DEF, labels: ['ops', '  '] }))).toBe(false);
    expect(holdsSent(stored, sent({ ...DEF, labels: ['ops,dev'] }))).toBe(false);
    expect(holdsSent(stored, sent({ ...DEF, labels: ['ops\n'] }))).toBe(false);
    expect(holdsSent(stored, sent({ ...DEF, labels: ['Ops'] }))).toBe(true);
  });
  it('a label outside ASCII proves nothing: Go lowercases a final sigma unlike JavaScript (ΚΟΣΜΟΣ)', () => {
    expect(holdsSent(text({ ...DEF, labels: ['κοσμος'] }), sent({ ...DEF, labels: ['ΚΟΣΜΟΣ'] }))).toBe(false);
    expect(holdsSent(text({ ...DEF, labels: ['κοσμος'] }), sent({ ...DEF, labels: ['κοσμος'] }))).toBe(false);
  });
  it('a lost save of ΚΟΣΜΟΣ, read back with the label as it was, stays unsure and keeps the draft', async () => {
    const { f, st } = await loaded({ ...DEF, labels: ['κοσμος'] });
    const mine = { ...DEF, labels: ['ΚΟΣΜΟΣ'] };
    st.setDraft(text(mine));
    const p = st.save();
    f.q.puts[0]!.answer(err('pending'));
    await p;
    const c = st.check();
    f.q.gets[1]!(doc({ ...DEF, labels: ['κοσμος'] }, 'r1'));
    await c;
    expect(st.view()).toMatchObject({ save: 'unsure', draft: text(mine), dirty: true });
  });
  // the agent decodes the stamped fields before overwriting them, so a bad type there refuses the save
  // while the proof set the field aside. The field is never sent (so it cannot refuse it), and the proof compares
  // exactly what was sent: a refused save read back unchanged stays unsure with the draft.
  it('a stamped field of a bad type is never sent; a refused save read back unchanged stays unsure with the draft', async () => {
    for (const bad of [{ system: 'false' }, { updated_at: 123 }, { name: 7 }, { created_at: ['x'] }]) {
      const { f, st } = await loaded();
      const mine = { ...DEF, ...bad, summary: 'new' };
      st.setDraft(text(mine));
      const p = st.save();
      expect(f.q.puts[0]!.def).toEqual({ ...UNSTAMPED, summary: 'new' });
      f.q.puts[0]!.answer(env('Validation failed (not saved): x', true));
      await p;
      const c = st.check();
      f.q.gets[1]!(doc(DEF, 'r1'));
      await c;
      expect(st.view()).toMatchObject({ save: 'unsure', draft: text(mine), dirty: true });
    }
  });
  it('a lost save of an explicit stream:false, read back as before, stays unsure and keeps the draft', async () => {
    const { f, st } = await loaded();
    const mine = { ...DEF, steps: { ...DEF.steps, a: { ...DEF.steps.a, stream: false } } };
    st.setDraft(text(mine));
    const p = st.save();
    f.q.puts[0]!.answer(err('pending'));
    await p;
    const c = st.check();
    f.q.gets[1]!(doc({ ...DEF, updated_at: 'later' }, 'r1'));
    await c;
    expect(st.view()).toMatchObject({ save: 'unsure', draft: text(mine), dirty: true });
  });
  it("a legacy tool name the agent renames is not mirrored: it proves nothing (the save stays unsure)", () => {
    const stored = { ...DEF, steps: { ...DEF.steps, c: { type: 'tool', tool: 'read_file' } } };
    expect(holdsSent(text(stored), sent({ ...DEF, steps: { ...DEF.steps, c: { type: 'tool', tool: 'Read' } } }))).toBe(false);
  });
});

describe('the editor', () => {
  it('a failed or unreadable first read is a failed read, never an empty workflow; a 404 is gone', async () => {
    for (const [answer, load] of [[err('failed', { code: 'internal', status: 500 }), 'failed'], [env('nope'), 'failed'], [err('failed', { code: 'not_found', status: 404 }), 'gone']] as const) {
      const f = fake();
      const st = createSourceStore({ api: f.api });
      const p = st.load();
      f.q.gets[0]!(answer);
      await p;
      expect(st.view().load).toBe(load);
      expect(st.view().base).toBeNull();
    }
  });

  it('a draft that is not a definition is never sent', async () => {
    const { f, st } = await loaded();
    st.setDraft('{ broken');
    expect(st.view().problem).toMatchObject({ kind: 'json' });
    await st.save();
    expect(f.q.puts).toHaveLength(0);
  });

  it('save: sent once with the revision read; saved; the next base is the workflow read again', async () => {
    const { f, st } = await loaded();
    const mine = { ...DEF, summary: 'Fix it' };
    st.setDraft(text(mine));
    const p = st.save();
    expect(st.view().save).toBe('saving');
    void st.save();
    expect(f.q.puts).toHaveLength(1);
    expect(f.q.puts[0]!.rev).toBe('r1');
    expect(f.q.puts[0]!.def).toEqual({ ...UNSTAMPED, summary: 'Fix it' });
    f.q.puts[0]!.answer(env('updated workflow "ship-fix"'));
    await tick();
    expect(st.view().save).toBe('saved');
    expect(st.view().revision).toBeNull();
    // Until the base read answers there is no revision to check a save against.
    st.setDraft(text({ ...mine, summary: 'again' }));
    await st.save();
    expect(f.q.puts).toHaveLength(1);
    f.q.gets[1]!(doc({ ...mine, updated_at: 'now' }, 'r2'));
    await p;
    expect(st.view().revision).toBe('r2');
    expect(st.view().draft).toBe(text({ ...mine, summary: 'again' }));
    void st.save();
    expect(f.q.puts[1]!.rev).toBe('r2');
  });

  it('save answered but the next base cannot be read: stale, Save waits for a reload', async () => {
    const { f, st } = await loaded();
    st.setDraft(text({ ...DEF, summary: 'x' }));
    const p = st.save();
    f.q.puts[0]!.answer(env('ok'));
    await tick();
    f.q.gets[1]!(err('failed', { code: 'internal', status: 500 }));
    await p;
    expect(st.view().stale).toBe(true);
    st.setDraft(text({ ...DEF, summary: 'y' }));
    await st.save();
    expect(f.q.puts).toHaveLength(1);
  });

  it('a 200 that is not an envelope saying it ran is not saved: unsure', async () => {
    const { f, st } = await loaded();
    st.setDraft(text({ ...DEF, summary: 'x' }));
    const p = st.save();
    f.q.puts[0]!.answer(ok({ status: 'ok' }));
    await p;
    expect(st.view().save).toBe('unsure');
  });

  it('a conflict writes nothing; Compare reads theirs, Keep mine bases the draft on it, the next save carries their revision', async () => {
    const { f, st } = await loaded();
    st.setDraft(text({ ...DEF, summary: 'mine' }));
    const p = st.save();
    f.q.puts[0]!.answer(conflict);
    await p;
    expect(st.view().save).toBe('conflict');
    await st.save();
    expect(f.q.puts).toHaveLength(1);
    const c = st.compare();
    f.q.gets[1]!(doc({ ...DEF, summary: 'theirs' }, 'r9'));
    await c;
    expect(st.view().theirs).toMatchObject({ phase: 'read', revision: 'r9' });
    st.keepMine();
    expect(st.view().save).toBe('idle');
    expect(st.view().draft).toBe(text({ ...DEF, summary: 'mine' }));
    void st.save();
    expect(f.q.puts[1]!.rev).toBe('r9');
  });

  it('Load theirs drops the draft for the workflow as it is now', async () => {
    const { f, st } = await loaded();
    st.setDraft(text({ ...DEF, summary: 'mine' }));
    const p = st.save();
    f.q.puts[0]!.answer(conflict);
    await p;
    const r = st.reload();
    f.q.gets[1]!(doc({ ...DEF, summary: 'theirs' }, 'r9'));
    await r;
    expect(st.view()).toMatchObject({ save: 'idle', revision: 'r9', draft: text({ ...DEF, summary: 'theirs' }), dirty: false });
  });

  it('a paused refusal wrote nothing and says so', async () => {
    const { f, st } = await loaded();
    st.setDraft(text({ ...DEF, summary: 'x' }));
    const p = st.save();
    f.q.puts[0]!.answer(err('failed', { code: 'daemon_paused', status: 200, notApplied: true }));
    await p;
    expect(st.view()).toMatchObject({ save: 'refused', refusal: { code: 'daemon_paused', unsent: false } });
  });

  it('a lost save is never resent; only a read holding the sent definition settles it', async () => {
    const { f, st } = await loaded();
    const mine = { ...DEF, entry_point: 'a', summary: 'mine' };
    st.setDraft(text(mine));
    const p = st.save();
    f.q.puts[0]!.answer(err('pending'));
    await p;
    expect(st.view().save).toBe('unsure');
    await st.save();
    expect(f.q.puts).toHaveLength(1);
    // The workflow as before the send: proves nothing.
    let c = st.check();
    f.q.gets[1]!(doc(DEF, 'r1'));
    await c;
    expect(st.view()).toMatchObject({ save: 'unsure', checked: 'same' });
    // Another change: proves nothing either.
    c = st.check();
    f.q.gets[2]!(doc({ ...DEF, summary: 'someone else' }, 'r5'));
    await c;
    expect(st.view()).toMatchObject({ save: 'unsure', checked: 'changed' });
    // A failed read: nothing.
    c = st.check();
    f.q.gets[3]!(err('failed', { code: 'internal', status: 500 }));
    await c;
    expect(st.view()).toMatchObject({ save: 'unsure', checked: 'failed' });
    // What was sent, as the agent stores it (re-stamped; the string shorthand it took as {id}): saved.
    c = st.check();
    f.q.gets[4]!(doc({ ...mine, entry_point: { id: 'a' }, updated_at: 'now', system: false }, 'r6'));
    await c;
    expect(st.view()).toMatchObject({ save: 'saved', revision: 'r6' });
    expect(f.q.puts).toHaveLength(1);
  });

  it('Stop tracking sends nothing and bases the draft on the workflow as last seen', async () => {
    const { f, st } = await loaded();
    st.setDraft(text({ ...DEF, summary: 'mine' }));
    const p = st.save();
    f.q.puts[0]!.answer(err('pending'));
    await p;
    const c = st.check();
    f.q.gets[1]!(doc({ ...DEF, summary: 'other' }, 'r5'));
    await c;
    st.abandon();
    expect(st.view()).toMatchObject({ save: 'idle', revision: 'r5', draft: text({ ...DEF, summary: 'mine' }) });
    void st.save();
    expect(f.q.puts[1]!.rev).toBe('r5');
  });

  it('answers after reset change nothing', async () => {
    const { f, st } = await loaded();
    st.setDraft(text({ ...DEF, summary: 'x' }));
    const p = st.save();
    st.reset();
    f.q.puts[0]!.answer(env('ok'));
    await p;
    expect(st.view().load).toBe('idle');
    expect(f.q.gets).toHaveLength(1);
  });
});

describe('Delete, Reset to shipped, Hide', () => {
  const store = () => { const f = fake(); return { f, d: createDangerStore({ name: 'wf', api: f.api }) }; };

  it('delete: done only on an envelope saying it ran; sent once', async () => {
    const { f, d } = store();
    const p = d.run('delete');
    void d.run('delete');
    expect(f.q.removes).toHaveLength(1);
    f.q.removes[0]!(env('deleted workflow "wf"'));
    await p;
    expect(d.view()).toMatchObject({ phase: 'done', kind: 'delete', gone: true });
  });

  it('a lost delete is checked by reading the workflow: only a 404 settles it', async () => {
    const { f, d } = store();
    const p = d.run('delete');
    f.q.removes[0]!(err('pending'));
    await p;
    expect(d.view().phase).toBe('unsure');
    await d.run('reset');
    await d.run('hide');
    expect(f.q.removes).toHaveLength(1);
    expect(f.q.hides).toHaveLength(0);
    let c = d.check();
    f.q.gets[0]!(doc(DEF, 'r1'));
    await c;
    expect(d.view()).toMatchObject({ phase: 'unsure', observed: 'same' });
    c = d.check();
    f.q.gets[1]!(err('failed', { code: 'internal', status: 500 }));
    await c;
    expect(d.view()).toMatchObject({ phase: 'unsure', observed: 'failed' });
    c = d.check();
    f.q.gets[2]!(err('failed', { code: 'not_found', status: 404 }));
    await c;
    expect(d.view()).toMatchObject({ phase: 'done', gone: true });
  });

  it('an error envelope after the delete may have started (no listed code): unsure, never failed', async () => {
    const { f, d } = store();
    const p = d.run('delete');
    f.q.removes[0]!(env('Error writing workflow', true));
    await p;
    expect(d.view().phase).toBe('unsure');
  });

  it('paused: nothing done', async () => {
    const { f, d } = store();
    const p = d.run('reset');
    f.q.removes[0]!(err('failed', { code: 'daemon_paused', status: 200, notApplied: true }));
    await p;
    expect(d.view().phase).toBe('paused');
  });

  it('a lost reset is checked by the list: a row shipped and unchanged (back now) or no row (back at the next restart)', async () => {
    const { f, d } = store();
    const p = d.run('reset');
    f.q.removes[0]!(err('pending'));
    await p;
    let c = d.check();
    f.q.lists[0]!(ok({ items: [{ name: 'wf', system: true, customized: true }] }));
    await c;
    expect(d.view()).toMatchObject({ phase: 'unsure', observed: 'same' });
    c = d.check();
    f.q.lists[1]!(ok({ status: 'ok' }));
    await c;
    expect(d.view()).toMatchObject({ phase: 'unsure', observed: 'failed' });
    c = d.check();
    f.q.lists[2]!(ok({ items: [{ name: 'wf', system: true }] }));
    await c;
    expect(d.view()).toMatchObject({ phase: 'done', restored: 'now' });
  });

  it('a lost reset whose row is gone was removed; the shipped version comes back at the next restart', async () => {
    const { f, d } = store();
    const p = d.run('reset');
    f.q.removes[0]!(err('pending'));
    await p;
    const c = d.check();
    f.q.lists[0]!(ok({ items: [{ name: 'other', system: true }] }));
    await c;
    expect(d.view()).toMatchObject({ phase: 'done', restored: 'later' });
  });

  it('an answered reset says "back" only once the list shows it; Global answers without a row (back at restart)', async () => {
    for (const [answer, want] of [
      [ok({ items: [{ name: 'wf', system: true }] }), { restored: 'now' }],
      [ok({ items: [] }), { restored: 'later' }],
      [err('failed', { code: 'internal', status: 500 }), { restored: null, observed: 'failed' }],
      [ok({ items: [{ name: 'wf', system: true, customized: true }] }), { restored: null, observed: 'same' }],
    ] as const) {
      const { f, d } = store();
      const p = d.run('reset');
      f.q.removes[0]!(env('removed your customized "wf"; the shipped version returns at the next restart'));
      await tick();
      expect(d.view()).toMatchObject({ phase: 'done', restored: null, reading: true });
      f.q.lists[0]!(answer);
      await p;
      expect(d.view()).toMatchObject({ phase: 'done', kind: 'reset', ...want });
    }
  });

  it('each completion counts once: seq moves on entering done, not on a later read', async () => {
    const { f, d } = store();
    expect(d.view().seq).toBe(0);
    const p = d.run('reset');
    f.q.removes[0]!(env('ok'));
    await tick();
    expect(d.view().seq).toBe(1);
    f.q.lists[0]!(err('failed', { code: 'internal', status: 500 }));
    await p;
    const c = d.check();
    f.q.lists[1]!(ok({ items: [{ name: 'wf', system: true }] }));
    await c;
    expect(d.view()).toMatchObject({ seq: 1, restored: 'now' });
  });

  it('a done reset whose list read failed may read it again', async () => {
    const { f, d } = store();
    const p = d.run('reset');
    f.q.removes[0]!(env('ok'));
    await tick();
    f.q.lists[0]!(err('pending'));
    await p;
    const c = d.check();
    f.q.lists[1]!(ok({ items: [{ name: 'wf', system: true }] }));
    await c;
    expect(d.view()).toMatchObject({ phase: 'done', restored: 'now' });
  });

  it('hide: the answer says whether it is hidden; a lost one may be sent again (it sets one value)', async () => {
    const { f, d } = store();
    let p = d.run('hide');
    expect(f.q.hides[0]!.hidden).toBe(true);
    f.q.hides[0]!.answer(err('pending'));
    await p;
    expect(d.view()).toMatchObject({ phase: 'unsure', hidden: null });
    await d.check();
    expect(f.q.gets).toHaveLength(0);
    p = d.run('hide');
    f.q.hides[1]!.answer(ok({ status: 'ok', name: 'wf', hidden: true, hidden_workflows: ['a', 'wf'] }));
    await p;
    expect(d.view()).toMatchObject({ phase: 'done', hidden: true });
    p = d.run('show');
    expect(f.q.hides[2]!.hidden).toBe(false);
    f.q.hides[2]!.answer(ok({ status: 'ok', name: 'wf', hidden: false, hidden_workflows: ['a'] }));
    await p;
    expect(d.view()).toMatchObject({ phase: 'done', hidden: false });
  });

  it('readers', () => {
    expect(hiddenOf({ hidden_workflows: ['wf'] }, 'wf')).toBe(true);
    expect(hiddenOf({ hidden_workflows: [] }, 'wf')).toBe(false);
    expect(hiddenOf({ hidden: true }, 'wf')).toBeNull();
    expect(hiddenOf({ hidden_workflows: [1] }, 'wf')).toBeNull();
    expect(resetSight({ items: [{ name: 'wf', system: true }] }, 'wf')).toBe('shipped');
    expect(resetSight({ items: [{ name: 'wf', system: true, customized: true }] }, 'wf')).toBe('changed');
    expect(resetSight({ items: [{ name: 'wf' }] }, 'wf')).toBeNull();
    expect(resetSight({}, 'wf')).toBeNull();
    expect(resetSight({ items: [] }, 'wf')).toBe('absent');
  });
});
