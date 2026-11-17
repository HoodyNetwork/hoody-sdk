// Vitest: a deploy through the page's real bound sends and core's own change locks,
// the fake transport only at the fetch. The page does no recovery of its own (no replay; a settle only for a found script): each of the
// cases (an earlier write already holding the path, a switch of the shown computer, a held refusal answered across a
// switch, an instantiate answer lost, and a later refusal that once read as proof) ends "may have gone through" with the
// reservation kept and nothing sent again. Only a fresh read of the bound computer showing the script releases the draft. A
// deploy not sent keeps its reservation too; Try again sends once under it, only from its stored didnt
// phase: never after a held or unknown answer, and never twice at once. The one exception:
// a Check that hoody-exec answers its own "Script not found" for exactly the reservation's path makes it didnt and frees core's
// hold of the deploy's own send, key kept, so Deploy again sends once more under the same op id or Idempotency-Key; any other
// 404, a 5xx, no answer or another path frees nothing, and so does an absent read while core holds another send of the path
// (ABSENT_HELD) or can't list its sends or free this one (ABSENT_KEPT). The send is freed first, then the record marked.
import { CoreQueryProvider, dropDraftRecord, dropScriptAsks, queryClient, readDraftRecords, readScriptAsks, type DraftRecord, type Target } from '@core';
import { setTarget } from '@core/ctx';
import { boot, calls, onFetch, R1, settle, TARGET, type Call, type Reply } from '@core/test/env';
import { act, renderHook as render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({ shown: null as unknown }));
vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return { ...real, fixtureModeActive: () => false, useCurrentComputer: () => world.shown };
});

import { execSaysAbsent, noAnswerOf, useBoundSends, type Binding } from '../data';
import { forgetRuns } from '../writer';
import { confirmDeployed, deployInstantiate, deployWrite } from './deploy';
import { discardDraft, markAbsent, markDeploy, nextAttempt, openRecord, readDraftRecord, sendAgain as sendAgainRec } from './records';
import { snapshotOf, verdictFor } from './snapshot';

const B: Binding = { target: TARGET, realm: R1, owner: 'fp1', exec: 1 };
// The Hub showing another project's computer.
const B_COMP: Target = { project: { id: 'p2' }, container: { id: 'c2', server_name: 'sv2' } };
const ID = 'coredeploy';
const PATH = 'default/1/hello.ts';
const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await settle(); };
const isInst = (c: Call): boolean => c.method === 'POST' && c.url.includes('/script-templates/') && c.url.includes('/instantiate');
const isWrite = (c: Call): boolean => c.method === 'POST' && c.url.includes('/exec/scripts/write');
const isSettle = (c: Call): boolean => c.method === 'POST' && c.url.includes('/exec/ops/settle');
const isRead = (c: Call): boolean => c.method === 'GET' && c.url.includes('/exec/scripts/read');
let inst: Reply[] = [];
let write: Reply[] = [];
let readReply: Reply = { status: 404, body: { code: 'not_found', message: 'x' } };
// The journal's answer: by default the op was never seen (its send was lost before the server), so settle fences it.
let settleReply: Reply | null = null;
/** The computer does not answer at all (stopped): its settle and its health read (core's read-back of a lost settle) both fail. */
let down = false;
// hoody-exec's own answer for a script not there (its usual error shape).
const execAbsent = (path = PATH): Reply => ({ status: 404, body: { error: 'Script not found', code: 'ERROR_404', details: { path }, timestamp: '2026-11-08T00:00:00.000Z' } });

const mount = () => render(() => useBoundSends(B), { wrapper: CoreQueryProvider });
const showing = (view: ReturnType<typeof mount>, t: Target): void => { world.shown = t; setTarget(t); view.rerender(); };
const deploying = (): void => { expect(readDraftRecord(ID)).toMatchObject({ state: 'deploying', deploy: { path: PATH } }); };

beforeEach(async () => {
  boot({ realm: R1 });
  queryClient.clear();
  forgetRuns();
  world.shown = TARGET;
  setTarget(TARGET as Target);
  inst = [];
  write = [];
  readReply = { status: 404, body: { code: 'not_found', message: 'x' } };
  settleReply = null;
  down = false;
  calls.length = 0;
  onFetch((c: Call): Reply => {
    if (down && (isSettle(c) || c.url.includes('/exec/health'))) return { status: 502, body: '' };
    if (isInst(c)) return inst.shift() ?? { status: 201, body: { path: PATH } };
    if (isWrite(c)) return write.shift() ?? { status: 200, body: { data: { revision: 'r1' } } };
    if (isSettle(c)) return settleReply ?? { status: 200, body: { opId: c.body.opId, state: 'fenced', at: '2026-11-09T00:00:00.000Z' } };
    if (isRead(c)) return readReply;
    if (c.url.includes('/exec/health')) return { status: 200, body: { now: 1_700_000_000_000, data: { now: 1_700_000_000_000 } } };
    return { status: 200, body: { data: {} } };
  });
  await openRecord(ID, 'idea', B);
  await nextAttempt(readDraftRecord(ID) as never, false);
});
afterEach(async () => {
  const asks = readScriptAsks();
  if (Array.isArray(asks)) await dropScriptAsks(asks);
  const recs = readDraftRecords();
  if (Array.isArray(recs)) for (const r of recs) await dropDraftRecord(r);
});

const deploy = async (view: ReturnType<typeof mount>) => {
  const s = await snapshotOf('export default 1;\n', null, { project: 'p1', compId: 'c1', exec: 1 });
  if (!s.ok) throw new Error('snapshot');
  return deployWrite({ sends: view.result.current }, { draftId: ID, snapshot: s.snapshot, verdict: verdictFor(s.snapshot, { verdict: 'ready', errors: [], missing: [] }), path: PATH });
};
const instantiate = (view: ReturnType<typeof mount>) =>
  deployInstantiate({ sends: view.result.current }, { draftId: ID, project: 'p1', compId: 'c1', exec: 1, name: 'hello', path: PATH, vars: { WHO: 'x' } });
const snap = async () => {
  const s = await snapshotOf('export default 1;\n', null, { project: 'p1', compId: 'c1', exec: 1 });
  if (!s.ok) throw new Error('snapshot');
  return { snapshot: s.snapshot, verdict: verdictFor(s.snapshot, { verdict: 'ready', errors: [], missing: [] }) };
};
const again = async (view: ReturnType<typeof mount>) => { let r: unknown; await act(async () => { r = await confirmDeployed({ sends: view.result.current }, ID); await flush(); }); return r; };

describe('may have gone through: the reservation is kept and nothing is sent again', () => {
  it('an earlier write already holding the path: the deploy is refused by core and kept; the earlier write is never touched', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await view.result.current.write({ path: PATH, content: 'older', ifRevision: null, opId: 'op-older-0000-0001' }); await flush(); });
    calls.length = 0;
    let first: unknown;
    await act(async () => { first = await deploy(view); await flush(); });
    expect(first).toEqual({ outcome: 'pending', code: 'READ_BACK_FIRST' });
    deploying();
    expect(await again(view)).toEqual({ outcome: 'pending', code: 'NOT_KNOWN' });
    deploying();
    expect(calls.filter((c) => isWrite(c) || isSettle(c) || isInst(c))).toEqual([]);
  });

  it('a lost write answer with another computer shown: the check reads nothing and keeps the reservation', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    deploying();
    showing(view, B_COMP);
    calls.length = 0;
    expect(await again(view)).toEqual({ outcome: 'pending', code: 'NOT_KNOWN' });
    expect(calls).toEqual([]);
    deploying();
  });

  it('a held refusal answered as the computer is switched stays a held refusal: the reservation is kept', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await view.result.current.write({ path: PATH, content: 'older', ifRevision: null, opId: 'op-older-0000-0002' }); await flush(); });
    // The switch lands while core is answering: after the gate let the write through, before core's refusal comes back.
    const sends = { ...view.result.current, write: (v: Parameters<typeof view.result.current.write>[0]) => { const p = view.result.current.write(v); showing(view, B_COMP); return p; } };
    const s = await snapshotOf('export default 1;\n', null, { project: 'p1', compId: 'c1', exec: 1 });
    if (!s.ok) throw new Error('snapshot');
    const r = await deployWrite({ sends }, { draftId: ID, snapshot: s.snapshot, verdict: verdictFor(s.snapshot, { verdict: 'ready', errors: [], missing: [] }), path: PATH });
    expect(r).toEqual({ outcome: 'pending', code: 'READ_BACK_FIRST' });
    deploying();
    expect(calls.filter(isWrite)).toHaveLength(1);
  });

  it('an instantiate answer lost: one request only; a second Make it live and a check send nothing; a later read that shows nothing proves nothing', async () => {
    const view = mount();
    inst = [{ status: 0, network: true }, { status: 422, body: { code: 'template_needs_token', message: 'x' } }];
    let first: unknown;
    await act(async () => { first = await instantiate(view); await flush(); });
    expect(first).toMatchObject({ outcome: 'pending' });
    let second: unknown;
    await act(async () => { second = await instantiate(view); await flush(); });
    expect(second).toEqual({ outcome: 'pending', code: 'DEPLOY_UNKNOWN' });
    expect(await again(view)).toEqual({ outcome: 'pending', code: 'NOT_KNOWN' });
    expect(calls.filter(isInst)).toHaveLength(1);
    deploying();
  });
});

describe('a switch while the reservation is stored, before the send reaches core: core still classifies it', () => {
  // The computer is switched after the deploy read its clock and reserved, before the bound send is made: the send still goes
  // to core, which refuses a held change first and then leaves anything else unsent (`still`).
  const switching = (view: ReturnType<typeof mount>) => ({
    ...view.result.current,
    write: (v: Parameters<typeof view.result.current.write>[0]) => { showing(view, B_COMP); return view.result.current.write(v); },
    instantiate: (v: Parameters<typeof view.result.current.instantiate>[0]) => { showing(view, B_COMP); return view.result.current.instantiate(v); },
  });
  const snap = async () => {
    const s = await snapshotOf('export default 1;\n', null, { project: 'p1', compId: 'c1', exec: 1 });
    if (!s.ok) throw new Error('snapshot');
    return s.snapshot;
  };

  it('write, an earlier write held: READ_BACK_FIRST, the reservation and its metadata kept, nothing sent', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await view.result.current.write({ path: PATH, content: 'older', ifRevision: null, opId: 'op-older-0000-0003' }); await flush(); });
    calls.length = 0;
    const sn = await snap();
    const r = await deployWrite({ sends: switching(view) }, { draftId: ID, snapshot: sn, verdict: verdictFor(sn, { verdict: 'ready', errors: [], missing: [] }), path: PATH });
    expect(r).toEqual({ outcome: 'pending', code: 'READ_BACK_FIRST' });
    expect(readDraftRecord(ID)).toMatchObject({ state: 'deploying', deploy: { kind: 'write', path: PATH, opId: expect.any(String) } });
    expect(calls.filter(isWrite)).toEqual([]);
  });

  it('instantiate, an earlier instantiate of the path held: READ_BACK_FIRST, the reservation and its key kept, nothing sent', async () => {
    const view = mount();
    inst = [{ status: 0, network: true }];
    await act(async () => { await view.result.current.instantiate({ name: 'hello', path: PATH, vars: { WHO: 'older' } }); await flush(); });
    calls.length = 0;
    const r = await deployInstantiate({ sends: switching(view) }, { draftId: ID, project: 'p1', compId: 'c1', exec: 1, name: 'hello', path: PATH, vars: { WHO: 'x' } });
    expect(r).toEqual({ outcome: 'pending', code: 'READ_BACK_FIRST' });
    expect(readDraftRecord(ID)).toMatchObject({ state: 'deploying', deploy: { kind: 'instantiate', path: PATH, opId: expect.any(String) } });
    expect(calls.filter(isInst)).toEqual([]);
  });

  it('nothing held: not sent, yet the reservation and its metadata are kept; Try again sends once under it', async () => {
    const view = mount();
    const sn = await snap();
    const verdict = verdictFor(sn, { verdict: 'ready', errors: [], missing: [] });
    expect(await deployWrite({ sends: switching(view) }, { draftId: ID, snapshot: sn, verdict, path: PATH })).toEqual({ outcome: 'not_sent', code: 'NOT_SHOWN' });
    const kept = readDraftRecord(ID) as DraftRecord;
    expect(kept).toMatchObject({ state: 'deploying', deploy: { kind: 'write', path: PATH, phase: 'didnt' } });
    expect(calls.filter(isWrite)).toEqual([]);
    showing(view, TARGET as Target);
    let again2: unknown;
    await act(async () => { again2 = await deployWrite({ sends: view.result.current }, { draftId: ID, snapshot: sn, verdict, path: PATH }); await flush(); });
    expect(again2).toEqual({ outcome: 'done', live: 'consumed' });
    expect(calls.filter(isWrite)).toHaveLength(1);
    expect(calls.filter(isWrite)[0]!.body).toMatchObject({ opId: kept.deploy!.opId });
  });

  it('instantiate, nothing held: kept with its key; Try again sends one request under the same Idempotency-Key', async () => {
    const view = mount();
    const v = { draftId: ID, project: 'p1', compId: 'c1', exec: 1, name: 'hello', path: PATH, vars: { WHO: 'x' } };
    expect(await deployInstantiate({ sends: switching(view) }, v)).toEqual({ outcome: 'not_sent', code: 'NOT_SHOWN' });
    const key = (readDraftRecord(ID) as DraftRecord).deploy!.opId;
    expect(readDraftRecord(ID)).toMatchObject({ state: 'deploying', deploy: { kind: 'instantiate', path: PATH, phase: 'didnt' } });
    expect(calls.filter(isInst)).toEqual([]);
    showing(view, TARGET as Target);
    let again2: unknown;
    await act(async () => { again2 = await deployInstantiate({ sends: view.result.current }, v); await flush(); });
    expect(again2).toEqual({ outcome: 'done', live: 'consumed' });
    const sent = calls.filter(isInst);
    expect(sent).toHaveLength(1);
    expect(Object.entries(sent[0]!.headers).find(([h]) => h.toLowerCase() === 'idempotency-key')?.[1]).toBe(key);
  });

  it('Try again is for the reservation\'s own kind and path, and a held refusal offers none', async () => {
    const view = mount();
    const sn = await snap();
    const verdict = verdictFor(sn, { verdict: 'ready', errors: [], missing: [] });
    await deployWrite({ sends: switching(view) }, { draftId: ID, snapshot: sn, verdict, path: PATH });
    const kept = (readDraftRecord(ID) as DraftRecord).deploy!.opId;
    showing(view, TARGET as Target);
    expect(await deployWrite({ sends: view.result.current }, { draftId: ID, snapshot: sn, verdict, path: 'default/1/other.ts' })).toEqual({ outcome: 'not_sent', code: 'RESERVED_PATH' });
    expect(await deployInstantiate({ sends: view.result.current }, { draftId: ID, project: 'p1', compId: 'c1', exec: 1, name: 'hello', path: PATH, vars: {} })).toEqual({ outcome: 'not_sent', code: 'RESERVED_PATH' });
    expect(calls.filter((c) => isWrite(c) || isInst(c))).toEqual([]);
    expect(readDraftRecord(ID)).toMatchObject({ state: 'deploying', deploy: { opId: kept, phase: 'didnt' } });
  });

  // Through real core: not sent, then Try again whose answer is lost or held; later Try agains never reach core.
  for (const kind of ['write', 'instantiate'] as const) {
    it(`${kind}: Try again answered unknown, then every later Try again is refused before core (one request in all)`, async () => {
      const view = mount();
      const sn = await snap();
      const verdict = verdictFor(sn, { verdict: 'ready', errors: [], missing: [] });
      const v = { draftId: ID, project: 'p1', compId: 'c1', exec: 1, name: 'hello', path: PATH, vars: { WHO: 'x' } };
      const send = (s: Parameters<typeof deployWrite>[0]['sends'] & { instantiate: never }) => (kind === 'write' ? deployWrite({ sends: s }, { draftId: ID, snapshot: sn, verdict, path: PATH }) : deployInstantiate({ sends: s }, v));
      expect(await send(switching(view) as never)).toEqual({ outcome: 'not_sent', code: 'NOT_SHOWN' });
      showing(view, TARGET as Target);
      if (kind === 'write') write = [{ status: 0, network: true }]; else inst = [{ status: 0, network: true }];
      let r: unknown;
      await act(async () => { r = await send(view.result.current as never); await flush(); });
      expect(r).toMatchObject({ outcome: 'pending' });
      expect(readDraftRecord(ID)).toMatchObject({ deploy: { phase: 'held' } });
      for (let i = 0; i < 2; i++) {
        await act(async () => { r = await send(view.result.current as never); await flush(); });
        expect(r).toEqual({ outcome: 'pending', code: 'DEPLOY_UNKNOWN' });
      }
      expect(calls.filter(kind === 'write' ? isWrite : isInst)).toHaveLength(1);
    });

    it(`${kind}: two Try agains at once reach core once`, async () => {
      const view = mount();
      const sn = await snap();
      const verdict = verdictFor(sn, { verdict: 'ready', errors: [], missing: [] });
      const v = { draftId: ID, project: 'p1', compId: 'c1', exec: 1, name: 'hello', path: PATH, vars: { WHO: 'x' } };
      const send = (s: never) => (kind === 'write' ? deployWrite({ sends: s }, { draftId: ID, snapshot: sn, verdict, path: PATH }) : deployInstantiate({ sends: s }, v));
      await send(switching(view) as never);
      showing(view, TARGET as Target);
      let both: unknown[] = [];
      await act(async () => { both = await Promise.all([send(view.result.current as never), send(view.result.current as never)]); await flush(); });
      expect(both).toContainEqual({ outcome: 'done', live: 'consumed' });
      expect(both.filter((x) => (x as { outcome: string }).outcome === 'not_sent')).toHaveLength(1);
      expect(calls.filter(kind === 'write' ? isWrite : isInst)).toHaveLength(1);
    });
  }
});

describe('the one release: a fresh read of the bound computer showing the script', () => {
  it('the script read back at its path marks the draft deployed, sending nothing else but the journal\'s settle of its own op', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    readReply = { status: 200, body: { data: { path: PATH, content: 'export default 1;\n', revision: 'r1' } } };
    // The lost send landed: the journal settles its op committed (a fenced or refused op found another writer's file: below).
    const op = (readDraftRecord(ID) as DraftRecord).deploy!.opId;
    settleReply = { status: 200, body: { opId: op, state: 'committed', path: PATH, revision: 'r1' } };
    calls.length = 0;
    expect(await again(view)).toEqual({ outcome: 'done', live: 'consumed' });
    expect(calls.filter(isRead)).toHaveLength(1);
    expect(new URL(calls.filter(isRead)[0]!.url).searchParams.get('path')).toBe(PATH);
    expect(calls.filter((c) => isWrite(c) || isInst(c))).toEqual([]);
    expect(calls.filter(isSettle).map((c) => c.body)).toEqual([{ opId: op, sentAfter: 1_700_000_000_000 }]);
    expect(readDraftRecord(ID)).toMatchObject({ state: 'consumed' });
  });

  it('a read that fails other than not found is not known, with its cause: kept', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    readReply = { status: 503, body: { code: 'unavailable', message: 'x' } };
    expect(await again(view)).toEqual({ outcome: 'pending', code: 'NOT_KNOWN', why: 'server' });
    deploying();
    readReply = { status: 0, network: true };
    expect(await again(view)).toEqual({ outcome: 'pending', code: 'NOT_KNOWN', why: 'unreachable' });
    deploying();
  });
});

describe("hoody-exec's own \"Script not found\" frees the deploy's own send, key kept", () => {
  const sendAgain = async (view: ReturnType<typeof mount>, kind: 'write' | 'instantiate') => { let r: unknown; await act(async () => { r = kind === 'write' ? await deploy(view) : await instantiate(view); await flush(); }); return r; };
  const opOf = (): string => (readDraftRecord(ID) as DraftRecord).deploy!.opId;
  const idemOf = (c: Call): string | undefined => Object.entries(c.headers).find(([h]) => h.toLowerCase() === 'idempotency-key')?.[1];
  const held = (view: ReturnType<typeof mount>, kind: 'write' | 'instantiate', op: string) => view.result.current.heldOf(kind, PATH, op);

  for (const kind of ['write', 'instantiate'] as const) {
    const lost = (): void => { if (kind === 'write') write = [{ status: 0, network: true }]; else inst = [{ status: 0, network: true }]; };
    const sent = (): Call[] => calls.filter(kind === 'write' ? isWrite : isInst);
    const keyOf = (c: Call): string | undefined => (kind === 'write' ? c.body.opId : idemOf(c));

    // An instantiate has no journal to fence a late send:
    // no read frees it, it stays held until its own proof (a Check that finds the script).
    it.skipIf(kind === 'instantiate')(`${kind}: proven absent → its own hold freed → Deploy again sends once, under a fresh op id (the journal fenced the old one)`, async () => {
      const view = mount();
      lost();
      await sendAgain(view, kind);
      const op = opOf();
      expect(readDraftRecord(ID)).toMatchObject({ deploy: { phase: 'held' } });
      expect(await held(view, kind, op)).toBeDefined();
      readReply = execAbsent();
      calls.length = 0;
      expect(await again(view)).toEqual({ outcome: 'not_sent', code: 'ABSENT' });
      // A write is settled first: the op, never seen, is fenced, so it can never land later.
      expect(calls.filter(isSettle).map((c) => c.body)).toEqual(kind === 'write' ? [{ opId: op, sentAfter: 1_700_000_000_000 }] : []);
      const next = opOf();
      if (kind === 'write') expect(next).not.toBe(op); else expect(next).toBe(op);
      expect(readDraftRecord(ID)).toMatchObject({ state: 'deploying', deploy: { opId: next, phase: 'didnt', sentAfter: kind === 'write' ? 1_700_000_000_000 : null } });
      expect(await held(view, kind, op)).toBeUndefined();
      expect(await sendAgain(view, kind)).toEqual({ outcome: 'done', live: 'consumed' });
      expect(sent()).toHaveLength(1);
      expect(sent().map(keyOf)).toEqual([next]);
    });

    // hoody-exec's op journal and the agent's Idempotency-Key receipts: a key seen with the same body answers its first outcome
    // again; the same key with another body is refused and does nothing; a create-only send of a path already made is refused.
    // The first send's answer is lost and its effect lands only after the Check's read (`land`), as a slow server would.
    const servers = () => {
      const made = new Map<string, string>();
      const bodies = new Map<string, string>();
      const st = { land: null as (() => void) | null };
      const fenced = new Set<string>();
      const ok: Reply = kind === 'write' ? { status: 200, body: { data: { revision: 'r1' } } } : { status: 201, body: { path: PATH } };
      const reused: Reply = kind === 'write' ? { status: 409, body: { code: 'OP_ID_REUSED', message: 'x' } } : { status: 422, body: { code: 'idempotency_key_reused', message: 'x' } };
      const taken: Reply = kind === 'write' ? { status: 409, body: { code: 'REVISION_MISMATCH', message: 'x' } } : { status: 409, body: { code: 'script_exists', message: 'x' } };
      onFetch((c: Call): Reply => {
        // hoody-exec's journal (writes only): an op it has seen is in progress until it lands, then committed; one it never saw
        // is fenced by the settle, and refused 409 OP_FENCED if it arrives after.
        if (isSettle(c)) {
          const k = c.body.opId as string;
          if (!bodies.has(k)) { fenced.add(k); return { status: 200, body: { opId: k, state: 'fenced' } }; }
          return { status: 200, body: made.get(PATH) === k ? { opId: k, state: 'committed', path: PATH, revision: 'r1' } : { opId: k, state: 'in_progress', path: PATH } };
        }
        if (isWrite(c) && fenced.has(keyOf(c)!)) return { status: 409, body: { error: 'x', code: 'ERROR_409', details: { code: 'OP_FENCED' } } };
        if (isWrite(c) || isInst(c)) {
          const k = keyOf(c)!, body = JSON.stringify(c.body);
          const before = bodies.get(k);
          if (before !== undefined) return before !== body ? reused : made.get(PATH) === k ? ok : { status: 0, network: true };
          bodies.set(k, body);
          if (made.has(PATH)) return taken;
          if (bodies.size === 1) { st.land = () => { made.set(PATH, k); }; return { status: 0, network: true }; }
          made.set(PATH, k);
          return ok;
        }
        if (isRead(c)) return made.has(PATH) ? { status: 200, body: { data: { path: PATH, content: 'export default 1;\n', revision: 'r1' } } } : execAbsent();
        if (c.url.includes('/exec/health')) return { status: 200, body: { now: 1_700_000_000_000, data: { now: 1_700_000_000_000 } } };
        return { status: 200, body: { data: {} } };
      });
      return { made, st };
    };

    it(`${kind}: a first send that lands after the Check's read is found by a later Check: one script, nothing resent`, async () => {
      const { made, st } = servers();
      const view = mount();
      await sendAgain(view, kind);
      expect(made.size).toBe(0);
      if (kind === 'write') {
        // The journal has the op in progress: nothing is freed or moved; once it lands a Check finds it live.
        expect(await again(view)).toEqual({ outcome: 'pending', code: 'ABSENT_KEPT' });
        expect(readDraftRecord(ID)).toMatchObject({ deploy: { phase: 'held' } });
        expect(await sendAgain(view, kind)).toEqual({ outcome: 'pending', code: 'DEPLOY_UNKNOWN' });
        st.land!();
        expect(await again(view)).toEqual({ outcome: 'done', live: 'consumed' });
        expect(sent()).toHaveLength(1);
        expect([...made.entries()]).toEqual([[PATH, sent().map(keyOf)[0]]]);
        return;
      }
      // An instantiate is kept the same way, with nothing to ask: once it lands a Check finds it live.
      expect(await again(view)).toEqual({ outcome: 'pending', code: 'ABSENT_UNPROVEN' });
      expect(readDraftRecord(ID)).toMatchObject({ deploy: { phase: 'held' } });
      expect(await sendAgain(view, kind)).toEqual({ outcome: 'pending', code: 'DEPLOY_UNKNOWN' });
      st.land!();
      expect(await again(view)).toEqual({ outcome: 'done', live: 'consumed' });
      expect(sent()).toHaveLength(1);
      expect([...made.entries()]).toEqual([[PATH, sent().map(keyOf)[0]]]);
    });

    it.skipIf(kind === 'write')(`${kind}: proven absent frees nothing (no journal fences a late send): still held, the hold kept, no resend, nothing settled`, async () => {
      const view = mount();
      lost();
      await sendAgain(view, kind);
      const op = opOf();
      readReply = execAbsent();
      calls.length = 0;
      let freed = 0;
      const sends = { ...view.result.current, release: async (k: 'write' | 'instantiate', h: Parameters<typeof view.result.current.release>[1]) => { const ok = await view.result.current.release(k, h); if (ok) freed++; return ok; } };
      let both: unknown[] = [];
      await act(async () => { both = await Promise.all([confirmDeployed({ sends }, ID), confirmDeployed({ sends }, ID)]); await flush(); });
      expect(both).toEqual([{ outcome: 'pending', code: 'ABSENT_UNPROVEN' }, { outcome: 'pending', code: 'ABSENT_UNPROVEN' }]);
      expect(freed).toBe(0);
      expect(calls.filter(isSettle)).toEqual([]);
      expect(readDraftRecord(ID)).toMatchObject({ state: 'deploying', deploy: { opId: op, phase: 'held' } });
      expect(await held(view, kind, op)).toBeDefined();
      expect(await sendAgain(view, kind)).toEqual({ outcome: 'pending', code: 'DEPLOY_UNKNOWN' });
      expect(sent()).toHaveLength(0);
    });

    it(`${kind}: a proxy's 404 (code not_found) frees nothing: still held, the hold kept, no resend`, async () => {
      const view = mount();
      lost();
      await sendAgain(view, kind);
      const op = opOf();
      readReply = { status: 404, body: { code: 'not_found', message: 'x' } };
      expect(await again(view)).toEqual({ outcome: 'pending', code: 'NOT_KNOWN' });
      expect(readDraftRecord(ID)).toMatchObject({ deploy: { opId: op, phase: 'held' } });
      expect(await held(view, kind, op)).toBeDefined();
      expect(await sendAgain(view, kind)).toEqual({ outcome: 'pending', code: 'DEPLOY_UNKNOWN' });
      expect(sent()).toHaveLength(1);
    });

    it(`${kind}: hoody-exec's own words for another path free nothing`, async () => {
      const view = mount();
      lost();
      await sendAgain(view, kind);
      const op = opOf();
      readReply = execAbsent('default/1/other.ts');
      expect(await again(view)).toEqual({ outcome: 'pending', code: 'NOT_KNOWN' });
      expect(readDraftRecord(ID)).toMatchObject({ deploy: { opId: op, phase: 'held' } });
      expect(await held(view, kind, op)).toBeDefined();
      expect(sent()).toHaveLength(1);
    });

    it.skipIf(kind === 'instantiate')(`${kind}: two Checks at once free once and mark once: the other's release is refused, or it finds the record moved`, async () => {
      const view = mount();
      lost();
      await sendAgain(view, kind);
      const op = opOf();
      readReply = execAbsent();
      let freed = 0;
      const sends = { ...view.result.current, release: async (k: 'write' | 'instantiate', h: Parameters<typeof view.result.current.release>[1]) => { const ok = await view.result.current.release(k, h); if (ok) freed++; return ok; } };
      let both: unknown[] = [];
      await act(async () => { both = await Promise.all([confirmDeployed({ sends }, ID), confirmDeployed({ sends }, ID)]); await flush(); });
      expect(both.filter((x) => (x as { code: string }).code === 'ABSENT')).toEqual([{ outcome: 'not_sent', code: 'ABSENT' }]);
      expect(both.filter((x) => (x as { code: string }).code !== 'ABSENT')).toEqual([{ outcome: 'pending', code: expect.stringMatching(/^(ABSENT_KEPT|RECORD_MOVED)$/) }]);
      expect(freed).toBe(1);
      expect(readDraftRecord(ID)).toMatchObject({ deploy: { phase: 'didnt' } });
      if (kind === 'write') expect(opOf()).not.toBe(op); else expect(opOf()).toBe(op);
    });
  }

  it('a second Check of a reservation already shown absent reads nothing and changes nothing', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    readReply = execAbsent();
    expect(await again(view)).toEqual({ outcome: 'not_sent', code: 'ABSENT' });
    const reads = calls.filter(isRead).length;
    const before = readDraftRecord(ID);
    expect(await again(view)).toEqual({ outcome: 'not_sent', code: 'NO_DEPLOY' });
    expect(calls.filter(isRead).length).toBe(reads);
    expect(readDraftRecord(ID)).toEqual(before);
  });

  it('an earlier write of the path that core holds is never freed and moves nothing (ABSENT_HELD); once it is settled, Deploy again goes', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await view.result.current.write({ path: PATH, content: 'older', ifRevision: null, opId: 'op-older-0000-0009' }); await flush(); });
    let first: unknown;
    await act(async () => { first = await deploy(view); await flush(); });
    expect(first).toEqual({ outcome: 'pending', code: 'READ_BACK_FIRST' });
    const op = opOf();
    expect(await held(view, 'write', op)).toBeUndefined();
    readReply = execAbsent();
    expect(await again(view)).toEqual({ outcome: 'pending', code: 'ABSENT_HELD' });
    expect(readDraftRecord(ID)).toMatchObject({ deploy: { opId: op, phase: 'held' } });
    const older = (await held(view, 'write', 'op-older-0000-0009'))!;
    expect(older).toBeDefined();
    expect(await deploy(view)).toEqual({ outcome: 'pending', code: 'DEPLOY_UNKNOWN' });
    // The earlier write's own sender settles it (core's held-change notice): the next Check makes the deploy didnt.
    await act(async () => { expect(await view.result.current.release('write', older)).toBe(true); await flush(); });
    expect(await again(view)).toEqual({ outcome: 'not_sent', code: 'ABSENT' });
    // The op was never sent: the journal fences it, and Deploy again goes under a fresh op id.
    const next = opOf();
    expect(next).not.toBe(op);
    expect(await deploy(view)).toEqual({ outcome: 'done', live: 'consumed' });
    expect(calls.filter(isWrite).map((c) => c.body.opId)).toEqual(['op-older-0000-0009', next]);
  });

  // An absent read alone never frees a write; only the journal's fenced or refused does.
  for (const [name, reply, frees] of [
    ['in progress', (op: string) => ({ status: 200, body: { opId: op, state: 'in_progress', path: PATH } }), false],
    ['unknown', (op: string) => ({ status: 200, body: { opId: op, state: 'unknown', path: PATH } }), false],
    ['forgotten', (op: string) => ({ status: 200, body: { opId: op, state: 'forgotten' } }), false],
    ['fenced for another op', () => ({ status: 200, body: { opId: 'op-other-0000-0001', state: 'fenced' } }), false],
    ['fenced with no op id', () => ({ status: 200, body: { state: 'fenced' } }), false],
    ['committed with no path', (op: string) => ({ status: 200, body: { opId: op, state: 'committed' } }), false],
    ['a state it never answers', (op: string) => ({ status: 200, body: { opId: op, state: 'done' } }), false],
    ['in progress with a conflicting outcome fenced', (op: string) => ({ status: 200, body: { opId: op, state: 'in_progress', outcome: 'fenced', path: PATH } }), false],
    ['a 5xx', () => ({ status: 503, body: { error: 'x', code: 'ERROR_503' } }), false],
    ['no answer', () => ({ status: 0, network: true }), false],
    ['refused (never applied)', (op: string) => ({ status: 200, body: { opId: op, state: 'refused', path: PATH, code: 'ROUTE_EFFECT_CHANGED' } }), true],
  ] as Array<[string, (op: string) => Reply, boolean]>) {
    it(`write proven absent, the journal answers ${name}: ${frees ? 'freed, Deploy again under a fresh op id' : 'nothing freed or moved (ABSENT_KEPT)'}`, async () => {
      const view = mount();
      write = [{ status: 0, network: true }];
      await act(async () => { await deploy(view); await flush(); });
      const op = opOf();
      readReply = execAbsent();
      settleReply = reply(op);
      expect(await again(view)).toEqual(frees ? { outcome: 'not_sent', code: 'ABSENT' } : { outcome: 'pending', code: 'ABSENT_KEPT' });
      if (frees) {
        expect(await held(view, 'write', op)).toBeUndefined();
        expect(readDraftRecord(ID)).toMatchObject({ deploy: { phase: 'didnt' } });
        expect(opOf()).not.toBe(op);
      } else {
        expect(await held(view, 'write', op)).toBeDefined();
        expect(readDraftRecord(ID)).toMatchObject({ deploy: { opId: op, phase: 'held' } });
        expect(await deploy(view)).toEqual({ outcome: 'pending', code: 'DEPLOY_UNKNOWN' });
      }
      expect(calls.filter(isWrite)).toHaveLength(1);
    });
  }

  // A settle is itself a guarded send. One whose own answer was lost while the computer was down stays held,
  // and core refuses every later settle (READ_BACK_FIRST) until a read-back proves it changed nothing: without reading it back
  // first, "Check again later" would never change, even with the computer back.
  it('a Check whose own settle answer was lost (the computer down) keeps the deploy; the next Check, the computer back, reads that settle back, asks again and frees it', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    const op = opOf();
    readReply = execAbsent();
    settleReply = { status: 200, body: { opId: op, state: 'fenced', at: '2026-11-09T00:00:00.000Z' } };
    down = true;
    expect(await again(view)).toEqual({ outcome: 'pending', code: 'ABSENT_KEPT' });
    expect(await held(view, 'write', op)).toBeDefined();
    down = false;
    calls.length = 0;
    expect(await again(view)).toEqual({ outcome: 'not_sent', code: 'ABSENT' });
    expect(calls.filter(isSettle).map((c) => c.body)).toEqual([{ opId: op, sentAfter: 1_700_000_000_000 }]);
    expect(await held(view, 'write', op)).toBeUndefined();
    expect(readDraftRecord(ID)).toMatchObject({ deploy: { phase: 'didnt' } });
    expect(calls.filter((c) => isWrite(c) || isInst(c))).toEqual([]);
  });

  // Only this settle's own held send is read back; with none held the Check makes
  // no health read for it.
  it('a Check with no settle held reads nothing back: one settle, no health read', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    const op = opOf();
    readReply = execAbsent();
    settleReply = { status: 200, body: { opId: op, state: 'fenced', at: '2026-11-09T00:00:00.000Z' } };
    // The lost write's own read-back already ran (core reads health back at once); only the Check's own requests count.
    await act(async () => { await flush(); });
    calls.length = 0;
    expect(await again(view)).toEqual({ outcome: 'not_sent', code: 'ABSENT' });
    expect(calls.filter((c) => c.url.includes('/exec/health'))).toEqual([]);
    expect(calls.filter(isSettle)).toHaveLength(1);
  });

  // Absent, but the journal says this op committed: it was made, then
  // someone removed it. Never "Check again later" for good: the hold is freed and the reservation is didnt under a fresh op id
  // (ABSENT_REMOVED, its own words); the committed op only replays, so Deploy again under the new id makes the one script.
  it('write proven absent, the journal answers committed (made, then removed): freed, ABSENT_REMOVED, Deploy again under a fresh op id makes it once', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    const op = opOf();
    readReply = execAbsent();
    settleReply = { status: 200, body: { opId: op, state: 'committed', path: PATH, revision: 'r1' } };
    expect(await again(view)).toEqual({ outcome: 'not_sent', code: 'ABSENT_REMOVED' });
    expect(await held(view, 'write', op)).toBeUndefined();
    expect(readDraftRecord(ID)).toMatchObject({ state: 'deploying', deploy: { phase: 'didnt' } });
    const fresh = opOf();
    expect(fresh).not.toBe(op);
    calls.length = 0;
    expect(await deploy(view)).toMatchObject({ outcome: 'done' });
    expect(calls.filter(isWrite).map((c) => (c.body as { opId?: string }).opId)).toEqual([fresh]);
  });

  // The first send can land between the Check's read and its settle. A
  // committed answer then proves only that the op made the script, not that it is gone: a second read decides. Found: it's live,
  // its hold freed; no answer: nothing moves.
  for (const late of ['found', 'no answer'] as const) {
    it(`write absent, then the op commits before the settle and a second read is ${late}: never "removed"`, async () => {
      const view = mount();
      write = [{ status: 0, network: true }];
      await act(async () => { await deploy(view); await flush(); });
      const op = opOf();
      let landed = false;
      onFetch((c: Call): Reply => {
        if (isSettle(c)) { landed = true; return { status: 200, body: { opId: c.body.opId, state: 'committed', path: PATH, revision: 'r1' } }; }
        if (isRead(c)) return !landed ? execAbsent() : late === 'found' ? { status: 200, body: { data: { path: PATH, content: 'export default 1;\n', revision: 'r1' } } } : { status: 503, body: { code: 'unavailable', message: 'x' } };
        if (c.url.includes('/exec/health')) return { status: 200, body: { now: 1_700_000_000_000, data: { now: 1_700_000_000_000 } } };
        return { status: 200, body: { data: {} } };
      });
      calls.length = 0;
      const r = await again(view);
      expect(calls.filter(isRead)).toHaveLength(2);
      if (late === 'found') {
        expect(r).toEqual({ outcome: 'done', live: 'consumed' });
        expect(await held(view, 'write', op)).toBeUndefined();
      } else {
        expect(r).toMatchObject({ outcome: 'pending', code: 'NOT_KNOWN' });
        expect(readDraftRecord(ID)).toMatchObject({ state: 'deploying', deploy: { opId: op, phase: 'held' } });
        expect(await held(view, 'write', op)).toBeDefined();
      }
      expect(calls.filter((c) => isWrite(c) || isInst(c))).toEqual([]);
    });
  }

  it('a write send delayed before the server, proven absent and the draft discarded: the late send is fenced and makes nothing', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    const op = opOf();
    const fenced = new Set<string>();
    let made = false;
    onFetch((c: Call): Reply => {
      if (isSettle(c)) { fenced.add(c.body.opId); return { status: 200, body: { opId: c.body.opId, state: 'fenced' } }; }
      if (isWrite(c)) { if (fenced.has(c.body.opId)) return { status: 409, body: { error: 'x', code: 'ERROR_409', details: { code: 'OP_FENCED' } } }; made = true; return { status: 200, body: { data: { revision: 'r1' } } }; }
      if (isRead(c)) return made ? { status: 200, body: { data: { path: PATH, content: 'export default 1;\n', revision: 'r1' } } } : execAbsent();
      if (c.url.includes('/exec/health')) return { status: 200, body: { now: 1_700_000_000_000, data: { now: 1_700_000_000_000 } } };
      return { status: 200, body: { data: {} } };
    });
    expect(await again(view)).toEqual({ outcome: 'not_sent', code: 'ABSENT' });
    expect(fenced).toEqual(new Set([op]));
    const { discardDraft } = await import('./records');
    let gone: { ok: boolean } | undefined;
    await act(async () => { gone = await discardDraft(readDraftRecord(ID) as DraftRecord, { mayBeDeployed: true }); await flush(); });
    expect(gone?.ok).toBe(true);
    // The delayed request finally arrives (as hoody-exec would get it): refused, nothing made.
    let late: { outcome: string } | undefined;
    await act(async () => { late = (await view.result.current.write({ path: PATH, content: 'export default 1;\n', ifRevision: null, opId: op })) as never; await flush(); });
    expect(late?.outcome).not.toBe('done');
    expect(made).toBe(false);
  });

  it("core won't free the deploy's own send: nothing moves (ABSENT_KEPT), its hold kept, no Deploy again", async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    const op = opOf();
    readReply = execAbsent();
    let tried = 0;
    const sends = { ...view.result.current, release: async () => { tried++; return false; } };
    let r: unknown;
    await act(async () => { r = await confirmDeployed({ sends }, ID); await flush(); });
    expect(r).toEqual({ outcome: 'pending', code: 'ABSENT_KEPT' });
    expect(tried).toBe(1);
    expect(readDraftRecord(ID)).toMatchObject({ state: 'deploying', deploy: { opId: op, phase: 'held' } });
    expect(await held(view, 'write', op)).toBeDefined();
    expect(await deploy(view)).toEqual({ outcome: 'pending', code: 'DEPLOY_UNKNOWN' });
    expect(calls.filter(isWrite)).toHaveLength(1);
  });

  it("a held list core can't read moves nothing: ABSENT_KEPT, nothing freed", async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    const op = opOf();
    readReply = execAbsent();
    let r: unknown;
    let tried = 0;
    await act(async () => { r = await confirmDeployed({ sends: { ...view.result.current, heldAt: async () => null, release: async () => { tried++; return false; } } }, ID); await flush(); });
    expect(r).toEqual({ outcome: 'pending', code: 'ABSENT_KEPT' });
    expect(tried).toBe(0);
    expect(readDraftRecord(ID)).toMatchObject({ deploy: { opId: op, phase: 'held' } });
    expect(await held(view, 'write', op)).toBeDefined();
  });

  it("heldOf and heldAt name only sends at that path: the same op id held at another path is never the deploy's", async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    const other = 'default/1/other.ts';
    await act(async () => { await view.result.current.write({ path: other, content: 'x', ifRevision: null, opId: 'op-same-0000-0001' }); await flush(); });
    expect(await view.result.current.heldOf('write', other, 'op-same-0000-0001')).toBeDefined();
    expect(await view.result.current.heldOf('write', PATH, 'op-same-0000-0001')).toBeUndefined();
    expect(await view.result.current.heldAt('write', other)).toHaveLength(1);
    expect(await view.result.current.heldAt('write', PATH)).toEqual([]);
  });

  it("the hold is taken before the read: a new send of the op made while the read is out is never freed, and nothing moves", async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    const op = opOf();
    const first = (await held(view, 'write', op))!;
    readReply = execAbsent();
    // While the read is out the first send is freed and the same op is sent again, its answer lost: a later send of the change.
    const sends = { ...view.result.current, exists: async (p: string) => {
      const seen = await view.result.current.exists(p);
      await view.result.current.release('write', first);
      write = [{ status: 0, network: true }];
      await view.result.current.write({ path: PATH, content: 'export default 1;\n', ifRevision: null, opId: op });
      return seen;
    } };
    let r: unknown;
    await act(async () => { r = await confirmDeployed({ sends }, ID); await flush(); });
    expect(r).toEqual({ outcome: 'pending', code: 'ABSENT_HELD' });
    expect(readDraftRecord(ID)).toMatchObject({ deploy: { opId: op, phase: 'held' } });
    const later = await held(view, 'write', op);
    expect(later).toBeDefined();
    expect(later!.hold).not.toBe(first.hold);
  });

  it('a record moved held → didnt → sending → held while the read was out (record only) is not marked', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    const op = opOf();
    readReply = execAbsent();
    const sends = { ...view.result.current, exists: async (p: string) => {
      const seen = await view.result.current.exists(p);
      // Another tab: its Check made it didnt, its Deploy again sent it under the same op, and that answer was lost too (a
      // later millisecond, as any real second tab's would be: the record's own stamps then differ).
      await new Promise((res) => setTimeout(res, 2));
      const a = await markAbsent(readDraftRecord(ID) as DraftRecord, op);
      if (!a.ok) throw new Error('markAbsent');
      const s = await sendAgainRec(a.record);
      if (!s.ok) throw new Error('sendAgain');
      const h = await markDeploy(s.record, op, 'held');
      if (!h.ok) throw new Error('markDeploy');
      return seen;
    } };
    let r: unknown;
    await act(async () => { r = await confirmDeployed({ sends }, ID); await flush(); });
    expect(r).toEqual({ outcome: 'pending', code: 'RECORD_MOVED' });
    expect(readDraftRecord(ID)).toMatchObject({ deploy: { opId: op, phase: 'held' } });
  });

  it('the other tab\'s Check and Deploy again while the read was out, its answer lost: its later send is held, so nothing moves or is freed', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    const op = opOf();
    const first = (await held(view, 'write', op))!;
    readReply = execAbsent();
    const sends = { ...view.result.current, exists: async (p: string) => {
      const seen = await view.result.current.exists(p);
      // The other tab: its Check freed the first send and marked it didnt; its Deploy again went under the same op, answer lost.
      expect(await view.result.current.release('write', first)).toBe(true);
      const a = await markAbsent(readDraftRecord(ID) as DraftRecord, op);
      if (!a.ok) throw new Error('markAbsent');
      write = [{ status: 0, network: true }];
      await deployWrite({ sends: view.result.current }, { draftId: ID, snapshot: (await snap()).snapshot, verdict: (await snap()).verdict, path: PATH });
      return seen;
    } };
    let r: unknown;
    await act(async () => { r = await confirmDeployed({ sends }, ID); await flush(); });
    expect(r).toEqual({ outcome: 'pending', code: 'ABSENT_HELD' });
    expect(readDraftRecord(ID)).toMatchObject({ deploy: { opId: op, phase: 'held' } });
    const later = (await held(view, 'write', op))!;
    expect(later.hold).not.toBe(first.hold);
    expect(calls.filter(isWrite).map((c) => c.body.opId)).toEqual([op, op]);
  });

  it('a record discarded while the read was out is not marked; its own send, proven absent, is freed first, key kept', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    const op = opOf();
    readReply = execAbsent();
    const sends = { ...view.result.current, exists: async (p: string) => {
      const seen = await view.result.current.exists(p);
      await discardDraft(readDraftRecord(ID) as DraftRecord, { mayBeDeployed: true });
      return seen;
    } };
    let r: unknown;
    await act(async () => { r = await confirmDeployed({ sends }, ID); await flush(); });
    expect(r).toEqual({ outcome: 'pending', code: 'RECORD_MOVED' });
    expect(readDraftRecord(ID)).toMatchObject({ state: 'discarded' });
    expect(await held(view, 'write', op)).toBeUndefined();
  });

  // The record moves while the read is out: to another op (a newer reservation), or back into a fresh send of the same op.
  for (const [what, moved] of [
    ['another op', (d: DraftRecord): DraftRecord => ({ ...d, deploy: { ...d.deploy!, opId: 'op-newer-0000-0001' } })],
    ['a fresh send of the same op', (d: DraftRecord): DraftRecord => ({ ...d, deploy: { ...d.deploy!, phase: 'sending', beatAt: Date.now() } })],
  ] as const) {
    it(`a reservation moved to ${what} while the read was out is left as it is, never marked`, async () => {
      const { putDraftRecord } = await import('@core');
      const view = mount();
      write = [{ status: 0, network: true }];
      await act(async () => { await deploy(view); await flush(); });
      const op = opOf();
      readReply = execAbsent();
      let after: DraftRecord | null = null;
      const sends = { ...view.result.current, exists: async (p: string) => {
        const seen = await view.result.current.exists(p);
        const cur = readDraftRecord(ID) as DraftRecord;
        after = moved(cur);
        expect(await putDraftRecord(after, cur)).toBe('ok');
        return seen;
      } };
      let r: unknown;
      await act(async () => { r = await confirmDeployed({ sends }, ID); await flush(); });
      expect(r).toEqual({ outcome: 'pending', code: 'RECORD_MOVED' });
      expect((readDraftRecord(ID) as DraftRecord).deploy).toEqual(after!.deploy);
      // The record alone moved (core holds no later send here): the deploy's own send, proven absent, was freed first, key kept.
      expect(await held(view, 'write', op)).toBeUndefined();
    });
  }

  it('the Scripts list (no hold lookup) changes nothing on an absent read: ABSENT_SEEN, still held', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    const op = opOf();
    readReply = execAbsent();
    let r: unknown;
    await act(async () => { r = await confirmDeployed({ sends: { exists: view.result.current.exists } }, ID); await flush(); });
    expect(r).toEqual({ outcome: 'pending', code: 'ABSENT_SEEN' });
    expect(readDraftRecord(ID)).toMatchObject({ deploy: { opId: op, phase: 'held' } });
    expect(await held(view, 'write', op)).toBeDefined();
  });

  // The list can't ask hoody-exec's journal, so a script it finds may be another writer's. It never makes a
  // write live: FOUND_SEEN, nothing moves, no settle sent, and the draft's own Check settles the op.
  it("the Scripts list finds a write's script: never live there (FOUND_SEEN), still held, nothing settled or sent", async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    const op = opOf();
    readReply = { status: 200, body: { data: { path: PATH, content: 'export default 1;\n', revision: 'r1' } } };
    calls.length = 0;
    let r: unknown;
    await act(async () => { r = await confirmDeployed({ sends: { exists: view.result.current.exists } }, ID); await flush(); });
    expect(r).toEqual({ outcome: 'pending', code: 'FOUND_SEEN' });
    expect(readDraftRecord(ID)).toMatchObject({ state: 'deploying', deploy: { opId: op, phase: 'held' } });
    expect(await held(view, 'write', op)).toBeDefined();
    expect(calls.filter((c) => isSettle(c) || isWrite(c) || isInst(c))).toEqual([]);
  });
});

describe('the script found at the path frees the write\'s own hold; the write creates, never replaces', () => {
  const opOf = (): string => (readDraftRecord(ID) as DraftRecord).deploy!.opId;
  const found: Reply = { status: 200, body: { data: { path: PATH, content: 'export default 1;\n', revision: 'r1' } } };

  for (const [state, extra] of [['committed', { path: PATH, revision: 'r1' }]] as const) {
    it(`write: a lost send, then Check finds the script and the journal settles the op ${state}: live, core holds nothing of it (Home settled), nothing sent again`, async () => {
      const view = mount();
      write = [{ status: 0, network: true }];
      await act(async () => { await deploy(view); await flush(); });
      const op = opOf();
      expect(await view.result.current.heldOf('write', PATH, op)).toBeDefined();
      readReply = found;
      settleReply = { status: 200, body: { opId: op, state, ...extra } };
      calls.length = 0;
      expect(await again(view)).toEqual({ outcome: 'done', live: 'consumed' });
      expect(await view.result.current.heldOf('write', PATH, op)).toBeUndefined();
      expect(await view.result.current.heldAt('write', PATH)).toEqual([]);
      expect(calls.filter((c) => isWrite(c) || isInst(c))).toEqual([]);
      expect(calls.filter(isSettle).map((c) => c.body)).toEqual([{ opId: op, sentAfter: 1_700_000_000_000 }]);
    });
  }

  // The journal proves this op made nothing (refused: the other file was there; fenced: it never got in),
  // so the file found is another writer's. Never "It's live": the hold is freed, the draft goes back to open with its code kept
  // (no send of the op can land: refused replays, fenced is refused OP_FENCED), and the page shows the address was just taken,
  // with Change address. Nothing is finished, nothing sent again.
  for (const [state, extra] of [['refused', { path: PATH, code: 'REVISION_MISMATCH' }], ['fenced', {}]] as const) {
    it(`write: a lost send, then Check finds a script and the journal settles the op ${state}: not live, the draft open again, core holds nothing of it, nothing sent again`, async () => {
      const view = mount();
      write = [{ status: 0, network: true }];
      await act(async () => { await deploy(view); await flush(); });
      const op = opOf();
      const before = readDraftRecord(ID) as DraftRecord;
      expect(await view.result.current.heldOf('write', PATH, op)).toBeDefined();
      readReply = found;
      settleReply = { status: 200, body: { opId: op, state, ...extra } };
      calls.length = 0;
      expect(await again(view)).toEqual({ outcome: 'failed', code: 'REVISION_MISMATCH' });
      const now = readDraftRecord(ID) as DraftRecord;
      expect(now).toMatchObject({ state: 'open', deploy: null });
      expect({ current: now.current, retained: now.retained, compId: now.compId, path: before.deploy!.path }).toEqual({ current: before.current, retained: before.retained, compId: before.compId, path: PATH });
      expect(await view.result.current.heldOf('write', PATH, op)).toBeUndefined();
      expect(await view.result.current.heldAt('write', PATH)).toEqual([]);
      expect(calls.filter((c) => isWrite(c) || isInst(c))).toEqual([]);
      expect(calls.filter(isSettle).map((c) => c.body)).toEqual([{ opId: op, sentAfter: 1_700_000_000_000 }]);
    });

    it(`write: found, the journal settles the op ${state}, but core won't free its hold (a request still out): nothing moves, never live (TAKEN_KEPT)`, async () => {
      const view = mount();
      write = [{ status: 0, network: true }];
      await act(async () => { await deploy(view); await flush(); });
      const op = opOf();
      const before = readDraftRecord(ID) as DraftRecord;
      readReply = found;
      settleReply = { status: 200, body: { opId: op, state, ...extra } };
      let tried = 0;
      let r: unknown;
      await act(async () => { r = await confirmDeployed({ sends: { ...view.result.current, release: async () => { tried++; return false; } } }, ID); await flush(); });
      expect(r).toEqual({ outcome: 'pending', code: 'TAKEN_KEPT' });
      expect(tried).toBe(1);
      expect(readDraftRecord(ID)).toEqual(before);
      expect(await view.result.current.heldOf('write', PATH, op)).toBeDefined();
    });
  }

  it('write: found and settled fenced while the record moved during the read (a Discard): the hold freed, the record not reopened', async () => {
    const { putDraftRecord } = await import('@core');
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    const op = opOf();
    let after: DraftRecord | undefined;
    const sends = { ...view.result.current, exists: async (p: string) => {
      const seen = await view.result.current.exists(p);
      const cur = readDraftRecord(ID) as DraftRecord;
      after = { ...cur, state: 'discarded', deploy: null } as DraftRecord;
      expect(await putDraftRecord(after, cur)).toBe('ok');
      return seen;
    } };
    readReply = found;
    settleReply = { status: 200, body: { opId: op, state: 'fenced' } };
    let r: unknown;
    await act(async () => { r = await confirmDeployed({ sends }, ID); await flush(); });
    expect(r).toEqual({ outcome: 'pending', code: 'RECORD_MOVED' });
    expect(readDraftRecord(ID)).toEqual(after);
  });

  // The file found may be another writer's, and this op's send may still be on its way (delayed before
  // admission); were the hold freed, that send could create the draft's script after the other file is deleted or moved. Only a
  // journal answer that ends the op frees it; every other answer keeps core's hold, so its recovery stays.
  for (const [name, reply] of [
    ['in progress', (op: string) => ({ status: 200, body: { opId: op, state: 'in_progress', path: PATH } })],
    ['unknown', (op: string) => ({ status: 200, body: { opId: op, state: 'unknown', path: PATH } })],
    ['forgotten', (op: string) => ({ status: 200, body: { opId: op, state: 'forgotten' } })],
    ['malformed (no state)', (op: string) => ({ status: 200, body: { opId: op } })],
    ['in progress with a conflicting outcome committed', (op: string) => ({ status: 200, body: { opId: op, state: 'in_progress', outcome: 'committed', path: PATH } })],
    ['fenced for another op', () => ({ status: 200, body: { opId: 'op-other-0000-0001', state: 'fenced' } })],
    ['committed with no path', (op: string) => ({ status: 200, body: { opId: op, state: 'committed' } })],
    ['a 5xx', () => ({ status: 503, body: { error: 'x', code: 'ERROR_503' } })],
    ['no answer', () => ({ status: 0, network: true })],
  ] as Array<[string, (op: string) => Reply]>) {
    it(`write: found, but the journal answers ${name}: still live, core keeps its hold (its recovery stays), nothing sent again`, async () => {
      const view = mount();
      write = [{ status: 0, network: true }];
      await act(async () => { await deploy(view); await flush(); });
      const op = opOf();
      readReply = found;
      settleReply = reply(op);
      calls.length = 0;
      expect(await again(view)).toEqual({ outcome: 'done', live: 'consumed' });
      expect(await view.result.current.heldOf('write', PATH, op)).toBeDefined();
      expect(calls.filter((c) => isWrite(c) || isInst(c))).toEqual([]);
    });
  }

  it('write: found while the computer is no longer shown: no settle is sent and the hold stays', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    const op = opOf();
    readReply = found;
    const sends = { ...view.result.current, settle: async () => null };
    let r: unknown;
    await act(async () => { r = await confirmDeployed({ sends }, ID); await flush(); });
    expect(r).toEqual({ outcome: 'done', live: 'consumed' });
    expect(await view.result.current.heldOf('write', PATH, op)).toBeDefined();
  });

  it('write: a late duplicate of the same op after the Check changes nothing and leaves nothing held (create-only: refused, or replayed)', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    const op = opOf();
    readReply = found;
    settleReply = { status: 200, body: { opId: op, state: 'committed', path: PATH, revision: 'r1' } };
    expect(await again(view)).toEqual({ outcome: 'done', live: 'consumed' });
    for (const reply of [
      { status: 409, body: { error: 'x', code: 'ERROR_409', details: { code: 'REVISION_MISMATCH' } } },
      { status: 200, body: { data: { revision: 'r1', replayed: true } } },
    ] as Reply[]) {
      write = [reply];
      let r: { outcome: string } | undefined;
      await act(async () => { r = (await view.result.current.write({ path: PATH, content: 'export default 1;\n', ifRevision: null, opId: op })) as never; await flush(); });
      expect(r?.outcome).toMatch(/^(failed|done)$/);
      expect(await view.result.current.heldAt('write', PATH)).toEqual([]);
      expect(readDraftRecord(ID)).toMatchObject({ state: 'consumed' });
    }
    // The page never sends it: a Deploy again of a live draft is refused unsent.
    calls.length = 0;
    let d: unknown;
    await act(async () => { d = await deploy(view); await flush(); });
    expect(d).toEqual({ outcome: 'not_sent', code: 'ALREADY_LIVE' });
    expect(calls.filter(isWrite)).toEqual([]);
  });

  it('instantiate is not covered: found, the draft is live, but core keeps its hold of that send', async () => {
    const view = mount();
    inst = [{ status: 0, network: true }];
    await act(async () => { await instantiate(view); await flush(); });
    const op = opOf();
    readReply = found;
    expect(await again(view)).toEqual({ outcome: 'done', live: 'consumed' });
    expect(await view.result.current.heldOf('instantiate', PATH, op)).toBeDefined();
  });

  it('a hold core will not free (its request still out) keeps the hold: still live, never a failure', async () => {
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    readReply = found;
    settleReply = { status: 200, body: { opId: opOf(), state: 'committed', path: PATH, revision: 'r1' } };
    let tried = 0;
    let r: unknown;
    await act(async () => { r = await confirmDeployed({ sends: { ...view.result.current, release: async () => { tried++; return false; } } }, ID); await flush(); });
    expect(r).toEqual({ outcome: 'done', live: 'consumed' });
    expect(tried).toBe(1);
  });
});

describe('markAbsent: only the reservation the Check read, held or with a stale sender, by its op id', () => {
  it('another op, a fresh send or a didnt is never marked, even when it is the stored record; a held one and a stale send are', async () => {
    const { putDraftRecord } = await import('@core');
    const view = mount();
    write = [{ status: 0, network: true }];
    await act(async () => { await deploy(view); await flush(); });
    const held = readDraftRecord(ID) as DraftRecord;
    const op = held.deploy!.opId;
    // Another op: the stored record is the one passed, so only the op id refuses it.
    expect(await markAbsent(held, 'op-other-0000-0001')).toMatchObject({ ok: false });
    expect(readDraftRecord(ID)).toEqual(held);
    // A send its sender still beats for: stored as passed, refused by its phase alone.
    const fresh: DraftRecord = { ...held, deploy: { ...held.deploy!, phase: 'sending', beatAt: Date.now() } };
    expect(await putDraftRecord(fresh, held)).toBe('ok');
    expect(await markAbsent(fresh, op)).toMatchObject({ ok: false });
    expect(readDraftRecord(ID)).toEqual(fresh);
    // Its sender stopped beating: it is marked.
    const stale: DraftRecord = { ...fresh, deploy: { ...fresh.deploy!, beatAt: 1 } };
    expect(await putDraftRecord(stale, fresh)).toBe('ok');
    const m = await markAbsent(stale, op);
    expect(m).toMatchObject({ ok: true });
    // Already didnt: never marked again.
    const didnt = readDraftRecord(ID) as DraftRecord;
    expect(didnt.deploy).toMatchObject({ opId: op, phase: 'didnt' });
    expect(await markAbsent(didnt, op)).toMatchObject({ ok: false });
    expect(readDraftRecord(ID)).toEqual(didnt);
    // The held reservation itself (the Check's case) is marked.
    const back: DraftRecord = { ...didnt, deploy: { ...didnt.deploy!, phase: 'held' } };
    expect(await putDraftRecord(back, didnt)).toBe('ok');
    expect(await markAbsent(back, op)).toMatchObject({ ok: true });
    expect(readDraftRecord(ID)).toMatchObject({ deploy: { opId: op, phase: 'didnt' } });
  });
});

describe("what a read's failure says (data.ts)", () => {
  const rej = (status: number, data: unknown, more: Record<string, unknown> = {}) => ({ status, data, kind: status === 404 ? 'refused' : 'unavailable', ...more });
  it("only hoody-exec's own Script not found for exactly that path is absent", () => {
    const own = { error: 'Script not found', code: 'ERROR_404', details: { path: PATH } };
    expect(execSaysAbsent(rej(404, own), PATH)).toBe(true);
    expect(execSaysAbsent(rej(404, { ...own, code: 'not_found' }), PATH)).toBe(false);
    expect(execSaysAbsent(rej(404, { ...own, error: 'Not found' }), PATH)).toBe(false);
    expect(execSaysAbsent(rej(404, { ...own, details: { path: 'default/1/other.ts' } }), PATH)).toBe(false);
    expect(execSaysAbsent(rej(404, { ...own, details: undefined }), PATH)).toBe(false);
    expect(execSaysAbsent(rej(410, own), PATH)).toBe(false);
    expect(execSaysAbsent(rej(503, own), PATH)).toBe(false);
    expect(execSaysAbsent(null, PATH)).toBe(false);
  });
  it('no answer says why when it can: timeout, unreachable, a server error; anything else nothing', () => {
    expect(noAnswerOf({ code: 'TIMEOUT', status: 0, kind: 'unreachable' })).toBe('timeout');
    expect(noAnswerOf({ status: 0, kind: 'unreachable', code: 'NETWORK' })).toBe('unreachable');
    expect(noAnswerOf({ status: 502, kind: 'unavailable' })).toBe('server');
    expect(noAnswerOf({ status: 500 })).toBe('server');
    expect(noAnswerOf({ status: 404, kind: 'refused' })).toBeNull();
    expect(noAnswerOf({ status: 499 })).toBeNull();
    expect(noAnswerOf({ status: 0, notSent: true })).toBeNull();
    expect(noAnswerOf({ status: 503, kind: 'aborted' })).toBeNull();
    expect(noAnswerOf({ status: 503, stale: true })).toBeNull();
    expect(noAnswerOf(null)).toBeNull();
  });
});
