// Acceptance (Stop and send now, the journal kind): an interrupt is a keyed COMMAND under its own entry kind, so the door,
// the guard, the key-only recovery and the record attach all know it. The engine does not send one; these tests drive the
// door directly: mint, admit, post through the guard, and then recover by key from another tab. C9: a lost answer is
// read back by its key (a hit gives the original receipt, a miss is retired), and nothing here ever sends an interrupt a second time.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import { routes } from '../data';
import { createBody } from '../logic';
import { FakeAgent } from '../fake';
import { SendToken, guardIO, matches, textDigest, type Op } from '../journal';
import { bindDestForTests } from '../journal/testing';
import { ACCOUNT, HANDLE, KEY, REALM, REQ, slot, storedEntries, storedKeys, world, type World } from './env';

let w: World | null = null;
beforeEach(() => { resetApproversForTests(); });
afterEach(() => { w?.dispose(); w = null; resetApproversForTests(); });

const HOLD = [[{ k: 'text', text: 'Working.' }, { k: 'hold' }], [{ k: 'text', text: 'Switched.' }]] as any;
/** An op for the command `cmd`; an interrupt carries the digest of its text (what the ticket binds), as the engine will. */
const op = (key: string, sid: string, cmd: 'message' | 'interrupt' | 'stop', text = ''): Op =>
  ({ acct: ACCOUNT, container: slot.computer, h: HANDLE, r: REALM, route: 'command', key, sid, c: KEY('1'), cmd, ...(cmd === 'interrupt' ? { td: textDigest(text) } : {}) }) as Op;
const guarded = (x: World) => guardIO(x.agent as any, { acct: ACCOUNT, container: slot.computer }) as any;
const count = (x: World, m: string) => x.agent.log.filter((l) => l[0] === m).length;
/** A session with a turn running. */
async function running(x: World): Promise<string> {
  const c = (await x.agent.create(createBody(REALM, 'c1')!, 'k-create', REALM)) as { session_id: string };
  await x.agent.turn(c.session_id, 'go', 'k-turn');
  await x.flush(100);
  return c.session_id;
}
const wire = (x: World) => x.agent.log.filter((l) => l[0] === 'interrupt');

describe('A1: an interrupt goes through the door under an entry of its own kind', () => {
  it('one wire request, the entry is kind interrupt on this chat, and the journal stores no text (entries and the request store)', async () => {
    w = world({ script: HOLD });
    const sid = await running(w);
    const g = guarded(w);
    const key = w.j.mint('command')!;
    const adm = w.j.admit(op(key, sid, 'interrupt', 'forget it, do plan B'), new SendToken()) as any;
    expect('kind' in adm, JSON.stringify(adm)).toBe(false);
    let held: ReturnType<typeof storedEntries> = [];
    let raw = '';
    // The entry is written ahead of the request (write-ahead): it is there when the call leaves.
    const out = await w.j.post(adm, (t) => { held = storedEntries(w!.fs).filter((e) => e.k === key); raw = w!.fs.peek(REQ) ?? ''; return g.interrupt(sid, 'forget it, do plan B', key, REALM, [t]); });
    expect(out).toMatchObject({ kind: 'sent' });
    expect(wire(w)).toHaveLength(1);
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ kind: 'interrupt', s: sid, r: REALM, h: HANDLE });
    expect(raw, 'the entries hold no text').not.toContain('plan B');
    expect(raw, 'nor a digest of it').not.toContain(textDigest('forget it, do plan B'));
    expect(storedKeys(w.fs), 'the receipt settles it: the entry goes').not.toContain(key);
  });

  it('the ticket binds the KIND: a message ticket cannot carry an interrupt call, nor an interrupt ticket a message call; nothing is sent', async () => {
    w = world({ script: HOLD });
    const sid = await running(w);
    const g = guarded(w);
    const k1 = w.j.mint('command')!;
    const asMessage = w.j.admit(op(k1, sid, 'message'), new SendToken()) as any;
    const r1 = await w.j.post(asMessage, (t) => g.interrupt(sid, 'x', k1, REALM, [t]));
    const k2 = w.j.mint('command')!;
    const asInterrupt = w.j.admit(op(k2, sid, 'interrupt', 'x'), new SendToken()) as any;
    const r2 = await w.j.post(asInterrupt, (t) => g.command(sid, 'x', k2, REALM, [t]));
    expect([r1, r2].map((r: any) => r.kind)).toEqual(['notSent', 'notSent']);
    expect(count(w, 'interrupt') + count(w, 'command')).toBe(0);
  });

  it('a call with no ticket is TICKET_REQUIRED (the guard lists interrupt as a journaled member)', async () => {
    w = world({ script: HOLD });
    const sid = await running(w);
    const got = await guarded(w).interrupt(sid, 'x', KEY('9'), REALM, undefined).then(() => 'resolved', (e: any) => e?.code ?? String(e));
    expect(got).toBe('TICKET_REQUIRED');
    expect(count(w, 'interrupt')).toBe(0);
  });

  it('the stored entry is validated as a kind (an entry the page itself wrote reads back), and a record attach lists its key with the follow-ups', async () => {
    w = world({ script: HOLD, commandLost: true });
    const sid = await running(w);
    const g = guarded(w);
    const key = w.j.mint('command')!;
    const adm = w.j.admit(op(key, sid, 'interrupt', 'plan B'), new SendToken()) as any;
    await w.j.post(adm, (t) => g.interrupt(sid, 'plan B', key, REALM, [t]));
    const sc = (w.jB as any).entries.scan(HANDLE);
    expect(sc.s).toBe('ok');
    expect((sc as any).entries.find((e: any) => e.k === key)).toMatchObject({ kind: 'interrupt', s: sid });
    const rec = (w.jB as any).records.attach(HANDLE, { r: REALM, s: sid, k1: KEY('1') } as any);
    expect(rec.k3, 'the unsettled interrupt is held like a follow-up').toContain(key);
  });
});

describe('A2: a lost answer is recovered by the key, from another tab, and never sent again', () => {
  it('the original receipt is read by key (the original interrupted:true), and no second interrupt is sent', async () => {
    w = world({ script: HOLD, commandLost: true });
    const sid = await running(w);
    const g = guarded(w);
    const key = w.j.mint('command')!;
    const adm = w.j.admit(op(key, sid, 'interrupt', 'plan B'), new SendToken()) as any;
    const out = await w.j.post(adm, (t) => g.interrupt(sid, 'plan B', key, REALM, [t]));
    expect(out, JSON.stringify(out)).toMatchObject({ kind: 'sent', v: { t: 'unknown' } });
    expect(wire(w)).toHaveLength(1);
    expect(storedKeys(w.fs), 'unknown is not proof: the entry stays').toContain(key);
    const chk = await w.jB.check(w.agent as any, HANDLE, key);
    expect(chk.v, JSON.stringify(chk.v)).not.toMatchObject({ t: 'notAdmitted' });
    expect(wire(w), 'recovery sent nothing').toHaveLength(1);
    expect(count(w, 'commandByKey')).toBe(1);
    expect(count(w, 'commandKeyRetire'), 'a hit needs no retire').toBe(0);
    expect((await w.agent.commandByKey(sid, key)) as any).toMatchObject({ kind: 'interrupt', interrupted: true });
  });

  it('an interrupt that never arrived: the read misses, the key is retired (nothing ran), and the late original is refused command_key_retired', async () => {
    w = world({ script: HOLD });
    const sid = await running(w);
    const key = w.j.mint('command')!;
    const adm = w.j.admit(op(key, sid, 'interrupt', 'plan B'), new SendToken()) as any;
    // The request leaves the page and never reaches the agent (the network holds it); its answer is lost.
    const real = (FakeAgent.prototype as any).interrupt.bind(w.agent);
    (w.agent as any).interrupt = () => Promise.reject({ status: 0, pending: true, kind: 'pending' });
    const g = guarded(w);
    const out = await w.j.post(adm, (t) => g.interrupt(sid, 'plan B', key, REALM, [t]));
    expect(out, JSON.stringify(out)).toMatchObject({ kind: 'sent', v: { t: 'unknown' } });
    expect(storedKeys(w.fs), 'the entry stays until proof').toContain(key);
    const chk = await w.jB.check(w.agent as any, HANDLE, key);
    expect(chk.v, JSON.stringify(chk.v)).toMatchObject({ t: 'notAdmitted' });
    expect(count(w, 'commandKeyRetire')).toBe(1);
    expect(count(w, 'commandByKey'), 'the read came first').toBe(1);
    await expect(real(sid, 'plan B', key)).rejects.toMatchObject({ status: 409, code: 'command_key_retired' });
    expect(w.agent.ledgerRows(sid, 'command'), 'nothing ran: the agent holds no command row').toBe(0);
    expect(storedKeys(w.fs), 'the entry goes on proof').not.toContain(key);
  });
});

describe('A3: a queued interrupt reply keeps its entry until the agent says the command ended (by id, and by frame)', () => {
  /** Post an interrupt whose reply is `reply`; returns its key. */
  const sendQueued = async (x: World, reply: unknown): Promise<string> => {
    const k = x.j.mint('command')!;
    const a = x.j.admit(op(k, 'sess-1', 'interrupt', 'plan B'), new SendToken()) as any;
    const io: any = bindDestForTests({ interrupt: () => Promise.resolve(reply) } as any, slot.computer);
    const g = guardIO(io, { acct: ACCOUNT, container: slot.computer }) as any;
    await x.j.post(a, (t) => g.interrupt('sess-1', 'plan B', k, REALM, [t]));
    return k;
  };
  it('a read by the id the reply gave: queued is admitted and the entry stays; ended settles it', async () => {
    w = world();
    const k = await sendQueued(w, { command_id: 'cmd-1', state: 'queued' });
    expect(storedKeys(w.fs)).toEqual([k]);
    const queued: any = bindDestForTests({ commandGet: () => Promise.resolve({ command_id: 'cmd-1', state: 'queued' }) } as any, slot.computer);
    expect((await w.j.checkById(queued, HANDLE, k)).t).toBe('admitted');
    expect(storedKeys(w.fs)).toEqual([k]);
    const ended: any = bindDestForTests({ commandGet: () => Promise.resolve({ command_id: 'cmd-1', state: 'committed' }) } as any, slot.computer);
    expect((await w.j.checkById(ended, HANDLE, k)).t).toBe('settled');
    expect(storedKeys(w.fs)).toEqual([]);
  });
  it('a committed frame naming the command settles the entry; a frame naming another command changes nothing', async () => {
    w = world();
    const k = await sendQueued(w, { command_id: 'cmd-1', state: 'queued' });
    const io: any = bindDestForTests({} as any, slot.computer);
    w.j.observe(io, { type: 'command', r: REALM, sid: 'sess-1', kind: 'committed', ids: ['cmd-9'], state: 'committed' } as any);
    expect(storedKeys(w.fs), 'another command').toEqual([k]);
    w.j.observe(io, { type: 'command', r: REALM, sid: 'sess-1', kind: 'committed', ids: ['cmd-1'], state: 'committed' } as any);
    expect(storedKeys(w.fs), 'its own command ended').toEqual([]);
  });
});

describe('A4: the ticket binds the exact body of an interrupt: its text (by digest) and no field besides kind and text', () => {
  it('through the guard: a call with another text than the admitted one is refused and sends nothing; the admitted text goes', async () => {
    w = world({ script: HOLD });
    const sid = await running(w);
    const g = guarded(w);
    const key = w.j.mint('command')!;
    const adm = w.j.admit(op(key, sid, 'interrupt', 'plan B'), new SendToken()) as any;
    const other = await w.j.post(adm, (t) => g.interrupt(sid, 'plan C', key, REALM, [t]));
    expect(other, JSON.stringify(other)).toMatchObject({ kind: 'notSent' });
    expect(wire(w), 'the other text left nothing').toHaveLength(0);
    const k2 = w.j.mint('command')!;
    const adm2 = w.j.admit(op(k2, sid, 'interrupt', 'plan B'), new SendToken()) as any;
    expect(await w.j.post(adm2, (t) => g.interrupt(sid, 'plan B', k2, REALM, [t]))).toMatchObject({ kind: 'sent' });
    expect(wire(w)).toHaveLength(1);
  });
  it('at the issuer (matches, the check core makes on the body it actually sends): the exact {kind, text} matches; another text, an on_gate or any other field does not', () => {
    const key = KEY('1');
    const o = op(key, 's1', 'interrupt', 'plan B');
    const call = (body: unknown) => ({ route: routes.command, sid: 's1', idem: key, realm: REALM, body });
    expect(matches(o, call({ kind: 'interrupt', text: 'plan B' })), 'the exact body').toBe(true);
    expect(matches(o, call({ kind: 'interrupt', text: 'plan C' })), 'another text').toBe(false);
    expect(matches(o, call({ kind: 'interrupt', text: 'plan B', on_gate: 'deny' })), 'an on_gate').toBe(false);
    expect(matches(o, call({ kind: 'interrupt', text: 'plan B', extra: 1 })), 'any other field').toBe(false);
    expect(matches(o, call({ kind: 'interrupt' })), 'no text').toBe(false);
    expect(matches(o, call({ kind: 'interrupt', text: 5 })), 'a text that is not a string').toBe(false);
    expect(matches(o, call({ kind: 'message', text: 'plan B', on_gate: 'deny' })), 'a message').toBe(false);
    // Distinct strings that UTF-8 would fold together (an unpaired surrogate becomes U+FFFD) stay distinct.
    const lone = op(key, 's1', 'interrupt', '\ud800');
    expect(matches(lone, call({ kind: 'interrupt', text: '\ud800' })), 'the admitted lone surrogate').toBe(true);
    expect(matches(lone, call({ kind: 'interrupt', text: '\ufffd' })), 'U+FFFD is another text').toBe(false);
    expect(matches({ ...o, td: undefined } as Op, call({ kind: 'interrupt', text: 'plan B' })), 'an op without a digest binds nothing, so it matches nothing').toBe(false);
  });
  it('an interrupt op without a text digest (or with a malformed one) is not admitted', () => {
    w = world();
    const k1 = w.j.mint('command')!;
    expect(w.j.admit({ ...op(k1, 's1', 'interrupt', 'x'), td: undefined } as Op, new SendToken())).toMatchObject({ kind: 'notSent', why: 'invalid' });
    const k2 = w.j.mint('command')!;
    expect(w.j.admit({ ...op(k2, 's1', 'interrupt', 'x'), td: 'not-a-digest' } as Op, new SendToken())).toMatchObject({ kind: 'notSent', why: 'invalid' });
  });
});
