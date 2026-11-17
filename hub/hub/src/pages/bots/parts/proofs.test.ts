// Vitest on the Bots read-back judges: each one frees a change only on an answer it validated and that shows the change's
// effect, never on an unchanged, malformed or foreign answer, and never returns "not applied". Pure functions, no page.
import { describe, expect, it } from 'vitest';
import dataSource from '../data.ts?raw';
import { BOT_PROOFS, CLOSED_PROOF_MAX_PAGES, CLOSED_PROOF_PAGE, closedPagesFor, cleanInstructions, digest, proofFor, rawArchiveOk, rawChannelsOk, rawDelegateIdle, rawListOk, rawLogOk, rawViewOk, toLinkIndex, type Answers, type BotChangeKey, type LinkFacts } from './proofs';

const KEY = 'c1~global~chief';
const OTHER = 'c1~global~other';
const UID = 'uid-1';
const rec = (o: Record<string, unknown>): Record<string, unknown> => o;

const viewOf = (over: Record<string, unknown> = {}) => ({
  ok: true, id: 'chief', uid: UID, name: 'Chief', role: 'ops', instructions: 'be brief', model: 'hoody-ai/hoody-free', yolo: false, guardrailCheck: 'strict',
  allowedComputers: null, allowedAgents: null, guardrails: ['no push'], guardrailRevision: 4, gate: null, turnRunning: false, turnId: null, sessionId: 's1', ...over,
});
const view = (over: Record<string, unknown> = {}, key = KEY): Answers => [[{ [key]: viewOf(over) }]];

const row = (over: Record<string, unknown> = {}) => ({ key: KEY, id: 'chief', uid: UID, name: 'Chief', computerId: 'c1', ...over });
const list = (rows: unknown[], over: Record<string, unknown> = {}): Answers => [[{ ok: true, computerId: 'c1', rows, suspended: 0, hasMore: false, ...over }]];

const link = (over: Partial<LinkFacts> = {}): LinkFacts => ({ id: 'bu_1', botKey: KEY, botUid: UID, label: 'chief', ownerEnabled: true, cors: false, limits: {}, keysKnown: true, keys: [], ...over });
const key = (over: Record<string, unknown> = {}) => ({ id: 'k1', name: 'ci', enabled: true, allowlist: ['10.0.0.1'], expiresAt: null, notes: 'n', rotatedAt: null, ...over });
const idx = (links: unknown[], complete = true): Answers => [[{ complete, links }]];

const judge = (k: BotChangeKey, vars: Record<string, unknown>, answers: Answers) => {
  const p = BOT_PROOFS[k];
  return p.proves(p.identity(vars), answers);
};
/** The superset of botAction reads, in order: computerBots, log, view, archive, linkIndex. */
const actionReads = (over: Partial<Record<'computerBots' | 'log' | 'view' | 'archive' | 'linkIndex', readonly unknown[]>>): Answers => [over.computerBots ?? [], over.log ?? [], over.view ?? [], over.archive ?? [], over.linkIndex ?? []];

describe('every change has a judge', () => {
  it('covers every useChange key of data.ts', () => {
    const keys: string[] = [];
    let at = 0;
    for (;;) {
      at = dataSource.indexOf('useChange<', at);
      if (at < 0) break;
      const start = at;
      at += 'useChange<'.length;
      if (dataSource.slice(start - 9, start) === 'function ') continue;
      let depth = 1;
      let i = at;
      for (; i < dataSource.length && depth > 0; i++) {
        if (dataSource[i] === '<') depth++;
        else if (dataSource[i] === '>') depth--;
      }
      const m = /^\(\s*'(\w+)'/.exec(dataSource.slice(i));
      if (m) keys.push(m[1]!);
    }
    expect(keys.length).toBeGreaterThanOrEqual(15);
    for (const k of keys) expect(proofFor(k), k).toBeDefined();
  });
  it('declares its reads, and only rotateKey and sendMessage claim no proof at all', () => {
    for (const [k, p] of Object.entries(BOT_PROOFS)) {
      expect(['state', 'none']).toContain(p.proofBy);
      if (k === 'rotateKey' || k === 'sendMessage') {
        expect(p.proofBy).toBe('none');
        expect(p.reads).toEqual([]);
      } else {
        expect(p.proofBy, k).toBe('state');
        expect(p.reads.length, k).toBeGreaterThan(0);
      }
    }
    expect(proofFor('constructor')).toBeUndefined();
  });
});

describe('no judge is fooled by an answer it cannot trust', () => {
  const junk: Answers[] = [[], [[]], [[null]], [[undefined]], [[1]], [['x']], [[{}]], [[[]]], [[{ complete: 'yes', links: 'no' }]], [[{ [KEY]: 7 }]], [[{ [KEY]: { id: 'chief' } }]]];
  const vars: Record<BotChangeKey, Record<string, unknown>> = {
    loadOlder: { botKey: KEY },
    createBot: { name: 'Chief', computerId: 'c1' },
    saveSettings: { botKey: KEY, uid: UID, revision: 4, patch: { name: 'Chief' } },
    saveGuardrails: { botKey: KEY, uid: UID, revision: 4, patch: { guardrail_check: 'strict' }, rules: ['no push'] },
    decideGate: { botKey: KEY, uid: UID, gate: { id: 'g1', generation: 2 } },
    stopTurn: { botKey: KEY, uid: UID, turnId: 't1' },
    botAction: { botKey: KEY, uid: UID, action: 'delete' },
    createLink: { botKey: KEY, uid: UID, label: 'x' },
    patchLink: { linkId: 'bu_1', enabled: false },
    panic: { linkId: 'bu_1' },
    repoint: { linkId: 'bu_1', botKey: KEY, computerId: 'c2', uid: UID },
    mintKey: { linkId: 'bu_1', name: 'ci', allowlist: [], expiresAt: null, notes: '', knownKeyIds: [] },
    rotateKey: { linkId: 'bu_1', keyId: 'k1', rotatedAt: null },
    keyChange: { linkId: 'bu_1', keyId: 'k1', action: 'pause' },
    stopDelegate: { botKey: KEY, sessionId: 'sess', close: false },
    channelChange: { botKey: KEY, uid: UID, action: 'enable', channelId: 'ch1' },
    channelsPause: { botKey: KEY, uid: UID, paused: true },
    keyRevokeAll: { linkId: 'bu_1' },
    sendMessage: { botKey: KEY, sessionId: 'sess' },
  };
  it('junk answers are unknown for every change, and nothing throws', () => {
    for (const k of Object.keys(BOT_PROOFS) as BotChangeKey[]) {
      for (const a of junk) expect(judge(k, vars[k], a), `${k} ${JSON.stringify(a)}`).toBeUndefined();
    }
  });
  it('an identity that is missing or malformed judges nothing', () => {
    for (const k of Object.keys(BOT_PROOFS) as BotChangeKey[]) {
      for (const id of [undefined, null, 5, 'x', [], {}]) expect(BOT_PROOFS[k].proves(id, view()), k).toBeUndefined();
    }
  });
  it('none of the judges can return "not applied"', () => {
    const answers: Answers[] = [view(), list([row()]), idx([link({ keys: [key()] })]), [[{ [KEY]: { ok: true, rows: [], hasOlder: false } }]]];
    for (const k of Object.keys(BOT_PROOFS) as BotChangeKey[]) for (const a of answers) expect(judge(k, vars[k], a)).not.toBe('not_applied');
  });
});

describe('loadOlder (a read)', () => {
  const log = (key = KEY, over: Record<string, unknown> = {}): Answers => [[{ [key]: { ok: true, rows: [{ seq: 1 }], hasOlder: false, ...over } }]];
  it('is freed by a fresh, well formed log answer of that Bot, and by nothing else', () => {
    expect(judge('loadOlder', { botKey: KEY }, log())).toBe('applied');
    expect(judge('loadOlder', { botKey: KEY }, [[]])).toBeUndefined();
  });
  it('an answer that is not a log of that Bot frees nothing: {}, another Bot, no ok marker, a row without a seq', () => {
    expect(judge('loadOlder', { botKey: KEY }, [[{}]])).toBeUndefined();
    expect(judge('loadOlder', { botKey: KEY }, log(OTHER))).toBeUndefined();
    expect(judge('loadOlder', { botKey: KEY }, log(KEY, { ok: false }))).toBeUndefined();
    expect(judge('loadOlder', { botKey: KEY }, log(KEY, { ok: undefined }))).toBeUndefined();
    expect(judge('loadOlder', { botKey: KEY }, log(KEY, { rows: [{}] }))).toBeUndefined();
    expect(judge('loadOlder', { botKey: KEY }, log(KEY, { hasOlder: 'no' }))).toBeUndefined();
    expect(judge('loadOlder', { botKey: '' }, log(''))).toBeUndefined();
  });
});

describe('createBot', () => {
  const vars = { name: ' Chief ', computerId: 'c1', model: 'm', instructions: 'secret plan', withLink: false, label: '' };
  it('applied: the computer\'s own list has a Bot with the id the name makes and the same name', () => {
    expect(judge('createBot', vars, list([row()]))).toBe('applied');
  });
  it('unknown: another name under that id, another computer\'s list, an answer without its computer, no such Bot', () => {
    expect(judge('createBot', vars, list([row({ name: 'Other' })]))).toBeUndefined();
    expect(judge('createBot', vars, list([row({ computerId: 'c2' })]))).toBeUndefined();
    expect(judge('createBot', vars, [[{ ok: true, computerId: 'c2', rows: [row()], suspended: 0, hasMore: false }]])).toBeUndefined();
    expect(judge('createBot', vars, [[{ rows: [row()], suspended: 0, hasMore: false }]])).toBeUndefined();
    expect(judge('createBot', vars, list([row({ id: 'other' })]))).toBeUndefined();
    expect(judge('createBot', vars, list([]))).toBeUndefined();
  });
  it('the identity holds a digest of the name and none of the instructions', () => {
    const id = JSON.stringify(BOT_PROOFS.createBot.identity(vars));
    expect(id).not.toContain('secret plan');
    expect(id).not.toContain('Chief');
  });
});

describe('saveSettings of the Helpers section', () => {
  const w = (over: Record<string, unknown> = {}) => ({ known: true, backend: 'llm', allowed: ['llm', 'acp'], agent: 'claude', model: 'claude-sonnet-5-5', ...over });
  const press = (patch: Record<string, unknown>) => ({ botKey: KEY, uid: UID, revision: 4, patch });
  const at5 = (workers: unknown) => view({ guardrailRevision: 5, workers });
  it('applied: the view shows the patched worker fields (the list as a set) at a newer revision', () => {
    const p = press({ allowed_worker_backends: ['acp', 'llm'], worker_backend: 'acp', worker_delegated_agent: 'claude', worker_delegated_model: ' claude-sonnet-5-5 ' });
    expect(judge('saveSettings', p, at5(w({ backend: 'acp', allowed: ['llm', 'acp'] })))).toBe('applied');
  });
  it('a revoke names only the list: applied once the list shows it (the agent moved the default itself)', () => {
    expect(judge('saveSettings', press({ allowed_worker_backends: ['llm'] }), at5(w({ backend: 'llm', allowed: ['llm'] })))).toBe('applied');
  });
  it('unknown: a field still the old value, no policy in the view, an unknown policy, an unchanged revision', () => {
    const p = press({ allowed_worker_backends: ['llm', 'acp'], worker_backend: 'acp', worker_delegated_agent: 'claude', worker_delegated_model: 'claude-opus-5-5' });
    const ok = w({ backend: 'acp', model: 'claude-opus-5-5' });
    expect(judge('saveSettings', p, at5(ok))).toBe('applied');
    for (const bad of [{ backend: 'llm' }, { allowed: ['llm'] }, { agent: '' }, { model: 'claude-sonnet-5-5' }]) {
      expect(judge('saveSettings', p, at5({ ...ok, ...bad })), JSON.stringify(bad)).toBeUndefined();
    }
    expect(judge('saveSettings', p, at5(undefined))).toBeUndefined();
    // A policy whose default is not allowed proves nothing, a revoke included.
    expect(judge('saveSettings', press({ allowed_worker_backends: ['llm'] }), at5(w({ backend: 'acp', allowed: ['llm'] })))).toBeUndefined();
    expect(judge('saveSettings', press({ allowed_worker_backends: ['llm'] }), at5(w({ backend: 'llm', allowed: [] })))).toBeUndefined();
    expect(judge('saveSettings', p, at5({ ...ok, known: false }))).toBeUndefined();
    expect(judge('saveSettings', p, view({ guardrailRevision: 4, workers: ok }))).toBeUndefined();
  });
});

describe('saveSettings and saveGuardrails', () => {
  const press = { botKey: KEY, uid: UID, revision: 4, patch: { name: 'Chief 2', role: 'new role', instructions: 'be very brief', model: 'a/b', yolo: true, guardrail_check: 'lenient', allowed_computers: ['c2', 'c1'], allowed_agents: [] } };
  const after = { name: 'Chief 2', role: 'new role', instructions: 'be very brief', model: 'a/b', yolo: true, guardrailCheck: 'lenient', allowedComputers: ['c1', 'c2'], allowedAgents: null, guardrailRevision: 5 };
  it('applied: the Bot\'s own view shows every patched field at a newer revision (lists as sets; name, role and model trimmed as the agent keeps them)', () => {
    expect(judge('saveSettings', press, view(after))).toBe('applied');
    expect(judge('saveSettings', { ...press, patch: { name: ' Chief 2 ' } }, view({ name: 'Chief 2', guardrailRevision: 5 }))).toBe('applied');
  });
  it('unknown: one field still the old value, the same Bot under another uid, another Bot\'s key', () => {
    for (const bad of [{ name: 'Chief' }, { role: 'ops' }, { instructions: 'be brief' }, { model: 'x' }, { yolo: false }, { guardrailCheck: 'strict' }, { allowedComputers: ['c1'] }, { allowedAgents: ['x'] }]) {
      expect(judge('saveSettings', press, view({ ...after, ...bad })), JSON.stringify(bad)).toBeUndefined();
    }
    expect(judge('saveSettings', press, view({ ...after, uid: 'uid-2' }))).toBeUndefined();
    expect(judge('saveSettings', press, view(after, OTHER))).toBeUndefined();
    expect(judge('saveSettings', press, [[{ [KEY]: viewOf({ ...after, id: 'other' }) }]])).toBeUndefined();
  });
  it('a revision that did not move is unknown, even when every field already matches (a change tied to this send moves it)', () => {
    expect(judge('saveSettings', press, view({ ...after, guardrailRevision: 4 }))).toBeUndefined();
    expect(judge('saveSettings', press, view({ ...after, guardrailRevision: 3 }))).toBeUndefined();
    expect(judge('saveSettings', { botKey: KEY, uid: UID, revision: 4, patch: { name: 'Chief' } }, view({ guardrailRevision: 4 }))).toBeUndefined();
  });
  it('a press without its revision judges nothing (the baseline is required)', () => {
    expect(judge('saveSettings', { ...press, revision: undefined }, view(after))).toBeUndefined();
    expect(judge('saveSettings', { ...press, revision: -1 }, view(after))).toBeUndefined();
    expect(judge('saveSettings', { ...press, revision: 4.5 }, view(after))).toBeUndefined();
  });
  it('a press without a uid, or one that set nothing, judges nothing', () => {
    expect(judge('saveSettings', { ...press, uid: '' }, view(after))).toBeUndefined();
    expect(judge('saveSettings', { botKey: KEY, uid: UID, revision: 4, patch: {} }, view({ guardrailRevision: 9 }))).toBeUndefined();
  });
  it('the instructions are compared as the agent stores them: cleaned (line breaks, odd spaces, control characters) and trimmed', () => {
    const p = { botKey: KEY, uid: UID, revision: 4, patch: { instructions: ' be brief ' } };
    expect(judge('saveSettings', p, view({ instructions: 'be brief', guardrailRevision: 5 }))).toBe('applied');
    expect(judge('saveSettings', p, view({ instructions: 'be brief ', guardrailRevision: 5 }))).toBe('applied');
    expect(judge('saveSettings', p, view({ instructions: 'be briefer', guardrailRevision: 5 }))).toBeUndefined();
    const multi = { botKey: KEY, uid: UID, revision: 4, patch: { instructions: 'one\r\ntwo\u2028three\u00a0four\u2800five' } };
    expect(judge('saveSettings', multi, view({ instructions: 'one\ntwo\nthree fourfive', guardrailRevision: 5 }))).toBe('applied');
    expect(judge('saveSettings', multi, view({ instructions: 'one\ntwo\nthree four five', guardrailRevision: 5 }))).toBeUndefined();
  });
  it('instructions the route refuses (a control or invisible format character) prove nothing, even when the view shows their cleaned form', () => {
    for (const bad of ['be\u200b brief', 'be\u0000 brief', 'be\u001b[31m brief', 'be\u202e brief']) {
      const p = { botKey: KEY, uid: UID, revision: 4, patch: { instructions: bad } };
      expect(judge('saveSettings', p, view({ instructions: 'be brief', guardrailRevision: 5 }))).toBeUndefined();
    }
    for (const ok of ['be\n brief', 'be\r\n brief', 'be\t brief']) {
      const p = { botKey: KEY, uid: UID, revision: 4, patch: { instructions: ok } };
      expect(judge('saveSettings', p, view({ instructions: cleanInstructions(ok), guardrailRevision: 5 }))).toBe('applied');
    }
  });
  it('a view the select did not mark well formed, or whose fields are missing, is no view (no field is read as false, 0 or strict)', () => {
    const yolo = { botKey: KEY, uid: UID, revision: 4, patch: { yolo: false } };
    expect(judge('saveSettings', yolo, view({ yolo: false, guardrailRevision: 5 }))).toBe('applied');
    expect(judge('saveSettings', yolo, view({ yolo: undefined, guardrailRevision: 5 }))).toBeUndefined();
    expect(judge('saveSettings', yolo, view({ ok: undefined, guardrailRevision: 5 }))).toBeUndefined();
    expect(judge('saveSettings', yolo, view({ ok: false, guardrailRevision: 5 }))).toBeUndefined();
    expect(judge('saveSettings', yolo, view({ guardrailRevision: undefined }))).toBeUndefined();
    expect(judge('saveSettings', { botKey: KEY, uid: UID, revision: 4, patch: { guardrail_check: 'strict' } }, view({ guardrailCheck: undefined, guardrailRevision: 5 }))).toBeUndefined();
    expect(judge('saveSettings', { botKey: KEY, uid: UID, revision: 4, patch: { guardrail_check: 'maybe' } }, view({ guardrailCheck: 'maybe', guardrailRevision: 5 }))).toBeUndefined();
  });
  it('the Guardrails flow also needs the rules, and the PATCH alone is not the section', () => {
    const flow = { botKey: KEY, uid: UID, revision: 4, patch: { guardrail_check: 'lenient' }, rules: ['no push', ' no deploy ', ''] };
    expect(judge('saveGuardrails', flow, view({ guardrailCheck: 'lenient', guardrails: ['no push', 'no deploy'], guardrailRevision: 6 }))).toBe('applied');
    expect(judge('saveGuardrails', flow, view({ guardrailCheck: 'lenient', guardrails: ['no push'], guardrailRevision: 5 }))).toBeUndefined();
  });
  it('the identity keeps digests of text, never the text', () => {
    const id = JSON.stringify(BOT_PROOFS.saveSettings.identity({ ...press, rules: ['top secret rule'] }));
    for (const t of ['be very brief', 'new role', 'top secret rule']) expect(id).not.toContain(t);
  });
});

describe('decideGate', () => {
  const press = { botKey: KEY, uid: UID, gate: { id: 'g1', generation: 2 } };
  it('applied: the Bot\'s view no longer shows that gate (gone, or another generation)', () => {
    expect(judge('decideGate', press, view({ gate: null }))).toBe('applied');
    expect(judge('decideGate', press, view({ gate: { id: 'g2', generation: 1 } }))).toBe('applied');
    expect(judge('decideGate', press, view({ gate: { id: 'g1', generation: 3 } }))).toBe('applied');
  });
  it('unknown: the same gate still parked, no view of this Bot, another uid, a press without a gate or a uid', () => {
    expect(judge('decideGate', press, view({ gate: { id: 'g1', generation: 2 } }))).toBeUndefined();
    expect(judge('decideGate', press, view({}, OTHER))).toBeUndefined();
    expect(judge('decideGate', press, view({ uid: 'uid-2' }))).toBeUndefined();
    expect(judge('decideGate', { botKey: KEY, uid: UID, gate: null }, view())).toBeUndefined();
    expect(judge('decideGate', { ...press, uid: '' }, view({ gate: null }))).toBeUndefined();
    expect(judge('decideGate', { botKey: KEY, gate: press.gate }, view({ gate: null }))).toBeUndefined();
  });
});

describe('stopTurn', () => {
  const press = { botKey: KEY, uid: UID, turnId: 't1' };
  it('applied: no running turn, or a running turn with another id', () => {
    expect(judge('stopTurn', press, view({ turnRunning: false }))).toBe('applied');
    expect(judge('stopTurn', press, view({ turnRunning: true, turnId: 't2' }))).toBe('applied');
  });
  it('unknown: that turn still running, a running turn that names no id, a press that named no turn or no uid, another uid', () => {
    expect(judge('stopTurn', press, view({ turnRunning: true, turnId: 't1' }))).toBeUndefined();
    expect(judge('stopTurn', press, view({ turnRunning: true, turnId: null }))).toBeUndefined();
    expect(judge('stopTurn', { ...press, turnId: null }, view())).toBeUndefined();
    expect(judge('stopTurn', { ...press, turnId: '' }, view())).toBeUndefined();
    expect(judge('stopTurn', { botKey: KEY, turnId: 't1' }, view({ turnRunning: false }))).toBeUndefined();
    expect(judge('stopTurn', press, view({ turnRunning: false, uid: 'uid-2' }))).toBeUndefined();
  });
  it('a view whose turn_running the select did not mark well formed is not "no running turn"', () => {
    expect(judge('stopTurn', press, view({ ok: false, turnRunning: false }))).toBeUndefined();
    expect(judge('stopTurn', press, view({ turnRunning: undefined }))).toBeUndefined();
  });
});

describe('botAction', () => {
  it('delete: applied when the whole list lacks the Bot, or lists another non-empty uid under the key', () => {
    const v = { action: 'delete', botKey: KEY, uid: UID };
    expect(judge('botAction', v, list([]))).toBe('applied');
    expect(judge('botAction', v, list([row({ uid: 'uid-2' })]))).toBe('applied');
    expect(judge('botAction', v, list([row()]))).toBeUndefined();
    expect(judge('botAction', v, list([], { hasMore: true }))).toBeUndefined();
    expect(judge('botAction', { ...v, uid: '' }, list([]))).toBeUndefined();
    expect(judge('botAction', v, [[{ ok: true, computerId: 'c2', rows: [], suspended: 0, hasMore: false }]])).toBeUndefined();
    expect(judge('botAction', v, [[{ rows: [], suspended: 0, hasMore: false }]])).toBeUndefined();
  });
  it('delete: a suspended Bot is omitted from the list, so a list that counts one (or does not say) proves no absence', () => {
    const v = { action: 'delete', botKey: KEY, uid: UID };
    expect(judge('botAction', v, list([], { suspended: 1 }))).toBeUndefined();
    expect(judge('botAction', v, list([], { suspended: undefined }))).toBeUndefined();
    expect(judge('botAction', v, list([], { suspended: -1 }))).toBeUndefined();
    expect(judge('botAction', v, list([], { suspended: 1.5 }))).toBeUndefined();
  });
  it('delete: a row with no uid (owned elsewhere: a live Bot) is not a replacement', () => {
    const v = { action: 'delete', botKey: KEY, uid: UID };
    expect(judge('botAction', v, list([row({ uid: '' })]))).toBeUndefined();
  });
  it('delete: the computer is the key\'s; an explicit computer that disagrees names nothing', () => {
    const v = { action: 'delete', botKey: KEY, uid: UID };
    expect(BOT_PROOFS.botAction.identity({ ...v, computerId: 'c2' })).toMatchObject({ computerId: '' });
    expect(judge('botAction', { ...v, computerId: 'c2' }, [[{ ok: true, computerId: 'c2', rows: [], suspended: 0, hasMore: false }]])).toBeUndefined();
    expect(judge('botAction', { ...v, computerId: 'c2' }, list([]))).toBeUndefined();
    expect(judge('botAction', { ...v, computerId: 'c1' }, list([]))).toBe('applied');
    expect(judge('botAction', { action: 'delete', botKey: 'nokey', uid: UID }, list([]))).toBeUndefined();
  });
  const logs = (seqs: number[], hasOlder = false) => [[{ [KEY]: { ok: true, rows: seqs.map((seq) => ({ seq })), hasOlder } }]];
  it('forget: applied when the tail is whole and every row is newer than the newest the press saw', () => {
    const v = { action: 'forget', botKey: KEY, uid: UID, logSeq: 10 };
    const ans = (seqs: number[], more = false, over: Record<string, unknown> = {}): Answers => actionReads({ log: logs(seqs, more)[0]!, view: view(over)[0]! });
    expect(judge('botAction', v, ans([]))).toBe('applied');
    expect(judge('botAction', v, ans([11, 12]))).toBe('applied');
    expect(judge('botAction', v, ans([9, 11]))).toBeUndefined();
    expect(judge('botAction', v, ans([11], true))).toBeUndefined();
    expect(judge('botAction', v, ans([11], false, { uid: 'uid-2' }))).toBeUndefined();
    expect(judge('botAction', { ...v, logSeq: null }, ans([]))).toBeUndefined();
    expect(judge('botAction', { ...v, logSeq: 0 }, ans([]))).toBeUndefined();
    expect(judge('botAction', { ...v, uid: '' }, ans([]))).toBeUndefined();
    expect(judge('botAction', v, actionReads({ log: logs([11])[0]! }))).toBeUndefined();
  });
  it('reset: kind none: a new session id is what any reset leaves, so no answer ever proves it', () => {
    const v = { action: 'reset', botKey: KEY, uid: UID, sessionId: 's1' };
    const id = BOT_PROOFS.botAction.identity(v);
    expect(BOT_PROOFS.botAction.kind(id)).toBe('none');
    for (const sid of ['s2', 's1', '', null]) expect(judge('botAction', v, actionReads({ view: view({ sessionId: sid })[0]! })), String(sid)).toBeUndefined();
    // another writer's reset, between the press and the check, reads the same
    expect(judge('botAction', v, actionReads({ view: view({ sessionId: 's-other-writer' })[0]! }))).toBeUndefined();
  });
  it('purge: applied when the one-row archive read is empty with nothing more', () => {
    const v = { action: 'purge', botKey: KEY, uid: UID };
    const ans = (a: unknown, over: Record<string, unknown> = {}): Answers => actionReads({ view: view(over)[0]!, archive: [{ [KEY]: { ok: true, ...(a as object) } }] });
    expect(judge('botAction', v, ans({ rows: 0, more: false }))).toBe('applied');
    expect(judge('botAction', v, ans({ rows: 1, more: false }))).toBeUndefined();
    expect(judge('botAction', v, ans({ rows: 0, more: true }))).toBeUndefined();
    expect(judge('botAction', v, ans({ rows: 0, more: false }, { uid: 'uid-2' }))).toBeUndefined();
    expect(judge('botAction', v, ans({ rows: 0 }))).toBeUndefined();
    expect(judge('botAction', { ...v, uid: '' }, ans({ rows: 0, more: false }))).toBeUndefined();
  });
  it('resume: applied when the press saw suspended Bots and the computer\'s own list counts none', () => {
    const v = { action: 'resume', botKey: KEY, uid: UID, computerId: 'c1', suspended: 2 };
    expect(judge('botAction', v, list([], { suspended: 0 }))).toBe('applied');
    expect(judge('botAction', v, list([], { suspended: 1 }))).toBeUndefined();
    expect(judge('botAction', v, list([], { suspended: undefined }))).toBeUndefined();
    expect(judge('botAction', { ...v, suspended: 0 }, list([], { suspended: 0 }))).toBeUndefined();
    expect(judge('botAction', v, [[{ ok: true, computerId: 'c2', rows: [], suspended: 0, hasMore: false }]])).toBeUndefined();
  });
  it('deleteLink: applied when the complete index has no such link', () => {
    const v = { action: 'deleteLink', botKey: KEY, linkId: 'bu_1' };
    const ans = (a: Answers): Answers => actionReads({ linkIndex: a[0]! });
    expect(judge('botAction', v, ans(idx([])))).toBe('applied');
    expect(judge('botAction', v, ans(idx([link({ id: 'bu_2' })])))).toBe('applied');
    expect(judge('botAction', v, ans(idx([link()])))).toBeUndefined();
    expect(judge('botAction', v, ans(idx([], false)))).toBeUndefined();
    expect(judge('botAction', { ...v, linkId: '' }, ans(idx([])))).toBeUndefined();
  });
  it('an unknown action judges nothing', () => {
    expect(judge('botAction', { action: 'explode', botKey: KEY, uid: UID }, list([]))).toBeUndefined();
  });
});

describe('links', () => {
  it('createLink: applied when the index lists a link under that Bot key with the press\'s Bot uid; unknown otherwise', () => {
    const v = { botKey: KEY, uid: UID, label: 'x', cors: false };
    expect(judge('createLink', v, idx([link()]))).toBe('applied');
    expect(judge('createLink', v, idx([link({ botKey: OTHER })]))).toBeUndefined();
    expect(judge('createLink', v, idx([]))).toBeUndefined();
  });
  it('createLink: a link of another Bot incarnation under the same key, or a press without its uid, proves nothing', () => {
    const v = { botKey: KEY, uid: UID, label: 'x', cors: false };
    expect(judge('createLink', v, idx([link({ botUid: 'uid-2' })]))).toBeUndefined();
    expect(judge('createLink', { ...v, uid: '' }, idx([link({ botUid: '' })]))).toBeUndefined();
    expect(judge('createLink', { ...v, uid: undefined }, idx([link()]))).toBeUndefined();
  });
  it('patchLink: applied when the link shows every field the press set; unknown for any difference or a missing link', () => {
    const v = { linkId: 'bu_1', enabled: false, cors: true, limits: { key_rpm: 30 } };
    expect(judge('patchLink', v, idx([link({ ownerEnabled: false, cors: true, limits: { key_rpm: 30, bot_rpm: 5 } })]))).toBe('applied');
    expect(judge('patchLink', v, idx([link({ ownerEnabled: true, cors: true, limits: { key_rpm: 30 } })]))).toBeUndefined();
    expect(judge('patchLink', v, idx([link({ ownerEnabled: false, cors: false, limits: { key_rpm: 30 } })]))).toBeUndefined();
    expect(judge('patchLink', v, idx([link({ ownerEnabled: false, cors: true, limits: { key_rpm: 31 } })]))).toBeUndefined();
    expect(judge('patchLink', v, idx([link({ id: 'bu_2', ownerEnabled: false, cors: true, limits: { key_rpm: 30 } })]))).toBeUndefined();
    expect(judge('patchLink', { linkId: 'bu_1' }, idx([link()]))).toBeUndefined();
  });
  it('panic: applied when the link is off with a known, empty key list', () => {
    const v = { linkId: 'bu_1' };
    expect(judge('panic', v, idx([link({ ownerEnabled: false, keys: [] })]))).toBe('applied');
    expect(judge('panic', v, idx([link({ ownerEnabled: false, keys: [key()] })]))).toBeUndefined();
    expect(judge('panic', v, idx([link({ ownerEnabled: true, keys: [] })]))).toBeUndefined();
    expect(judge('panic', v, idx([link({ ownerEnabled: false, keys: [], keysKnown: false })]))).toBeUndefined();
  });
  it('repoint: applied when the link id is listed under the target Bot key with the press\'s uid', () => {
    const v = { linkId: 'bu_1', botKey: KEY, computerId: 'c2', uid: UID };
    expect(judge('repoint', v, idx([link({ botKey: 'c2~global~chief' })]))).toBe('applied');
    expect(judge('repoint', v, idx([link()]))).toBeUndefined();
    expect(judge('repoint', v, idx([link({ id: 'bu_2', botKey: 'c2~global~chief' })]))).toBeUndefined();
    expect(judge('repoint', { linkId: 'bu_1', botKey: KEY, computerId: '', uid: UID }, idx([link()]))).toBeUndefined();
  });
  it('repoint: another incarnation of the target Bot, or a press without the target\'s uid, proves nothing', () => {
    const v = { linkId: 'bu_1', botKey: KEY, computerId: 'c2', uid: UID };
    expect(judge('repoint', v, idx([link({ botKey: 'c2~global~chief', botUid: 'uid-2' })]))).toBeUndefined();
    expect(judge('repoint', { ...v, uid: '' }, idx([link({ botKey: 'c2~global~chief' })]))).toBeUndefined();
  });
  it('a link whose fields are of the wrong type, or a key list that is not keys, makes the whole index no answer', () => {
    const v = { linkId: 'bu_1', enabled: false };
    const off = link({ ownerEnabled: false });
    expect(judge('patchLink', v, idx([off]))).toBe('applied');
    for (const bad of [{ ownerEnabled: undefined }, { cors: 'no' }, { limits: null }, { keysKnown: undefined }, { botUid: undefined }, { keys: 'x' }, { keys: [{ id: 'k1' }] }, { keys: [key({ enabled: undefined })] }, { keysKnown: false, keys: [key()] }]) {
      expect(judge('patchLink', v, idx([{ ...off, ...bad }])), JSON.stringify(bad)).toBeUndefined();
    }
    expect(judge('patchLink', v, idx([off, { id: 'bu_9' }]))).toBeUndefined();
  });
});

describe('keys', () => {
  const mint = { linkId: 'bu_1', name: 'ci', allowlist: ['10.0.0.2', '10.0.0.1'], expiresAt: '2026-12-01T00:00:00Z', notes: 'for ci', knownKeyIds: ['k0'] };
  const made = key({ id: 'k9', name: 'ci', allowlist: ['10.0.0.1', '10.0.0.2'], expiresAt: '2026-12-01T00:00:00.000Z', notes: 'for ci' });
  it('mintKey: applied for a new key with the press\'s fields (times by instant), unknown when only a known key matches or the baseline is missing', () => {
    expect(judge('mintKey', mint, idx([link({ keys: [key({ id: 'k0' }), made] })]))).toBe('applied');
    expect(judge('mintKey', mint, idx([link({ keys: [{ ...made, id: 'k0' }] })]))).toBeUndefined();
    expect(judge('mintKey', mint, idx([link({ keys: [{ ...made, notes: 'other' }] })]))).toBeUndefined();
    expect(judge('mintKey', mint, idx([link({ keys: [{ ...made, allowlist: ['10.0.0.1'] }] })]))).toBeUndefined();
    expect(judge('mintKey', mint, idx([link({ keys: [{ ...made, expiresAt: null }] })]))).toBeUndefined();
    expect(judge('mintKey', mint, idx([link({ keysKnown: false, keys: [] })]))).toBeUndefined();
    expect(judge('mintKey', { ...mint, knownKeyIds: undefined }, idx([link({ keys: [made] })]))).toBeUndefined();
    expect(judge('mintKey', { ...mint, name: '' }, idx([link({ keys: [{ ...made, name: '' }] })]))).toBeUndefined();
  });
  it('mintKey: the name and the notes are compared exactly as the agent stores them (verbatim)', () => {
    const padded = { ...mint, notes: ' for ci ' };
    expect(judge('mintKey', padded, idx([link({ keys: [{ ...made, notes: 'for ci' }] })]))).toBeUndefined();
    expect(judge('mintKey', padded, idx([link({ keys: [{ ...made, notes: ' for ci ' }] })]))).toBe('applied');
    expect(judge('mintKey', { ...mint, name: ' ci' }, idx([link({ keys: [made] })]))).toBeUndefined();
  });
  it('mintKey and rotateKey say their secret is shown once', () => {
    expect(BOT_PROOFS.mintKey.secretAnswer && BOT_PROOFS.rotateKey.secretAnswer).toBe(true);
  });
  it('rotateKey: kind none: a new rotation time is what any rotation leaves (another writer\'s too), so no answer proves it', () => {
    const v = { linkId: 'bu_1', keyId: 'k1', rotatedAt: '2026-10-01T00:00:00Z' };
    const id = BOT_PROOFS.rotateKey.identity(v);
    expect(BOT_PROOFS.rotateKey.kind(id)).toBe('none');
    for (const rotatedAt of ['2026-10-24T01:00:00Z', '2026-10-01T00:00:00.000Z', null]) expect(judge('rotateKey', v, idx([link({ keys: [key({ rotatedAt })] })])), String(rotatedAt)).toBeUndefined();
    expect(judge('rotateKey', { ...v, rotatedAt: null }, idx([link({ keys: [key({ rotatedAt: '2026-10-24T01:00:00Z' })] })]))).toBeUndefined();
    expect(judge('rotateKey', v, idx([link({ keys: [] })]))).toBeUndefined();
  });
  it('keyChange pause and resume: the key listed and off / on', () => {
    expect(judge('keyChange', { linkId: 'bu_1', keyId: 'k1', action: 'pause' }, idx([link({ keys: [key({ enabled: false })] })]))).toBe('applied');
    expect(judge('keyChange', { linkId: 'bu_1', keyId: 'k1', action: 'pause' }, idx([link({ keys: [key()] })]))).toBeUndefined();
    expect(judge('keyChange', { linkId: 'bu_1', keyId: 'k1', action: 'resume' }, idx([link({ keys: [key()] })]))).toBe('applied');
    expect(judge('keyChange', { linkId: 'bu_1', keyId: 'k1', action: 'resume' }, idx([link({ keys: [key({ enabled: false })] })]))).toBeUndefined();
    expect(judge('keyChange', { linkId: 'bu_1', keyId: 'k1', action: 'pause' }, idx([link({ keys: [] })]))).toBeUndefined();
  });
  it('keyChange revoke: the link listed with a known key list that lacks the key', () => {
    const v = { linkId: 'bu_1', keyId: 'k1', action: 'revoke' };
    expect(judge('keyChange', v, idx([link({ keys: [] })]))).toBe('applied');
    expect(judge('keyChange', v, idx([link({ keys: [key()] })]))).toBeUndefined();
    expect(judge('keyChange', v, idx([link({ keys: [], keysKnown: false })]))).toBeUndefined();
    expect(judge('keyChange', v, idx([]))).toBeUndefined();
    expect(judge('keyChange', v, idx([link({ id: 'bu_2', keys: [] })]))).toBeUndefined();
  });
  it('keyChange edit: the key shows the fields the press set, exactly', () => {
    const v = { linkId: 'bu_1', keyId: 'k1', action: 'edit', fields: { name: 'ci2', allowlist: ['10.0.0.9'], expiresAt: null, notes: 'x' } };
    expect(judge('keyChange', v, idx([link({ keys: [key({ name: 'ci2', allowlist: ['10.0.0.9'], notes: 'x' })] })]))).toBe('applied');
    expect(judge('keyChange', v, idx([link({ keys: [key({ name: 'ci2', allowlist: ['10.0.0.9'], notes: 'y' })] })]))).toBeUndefined();
    expect(judge('keyChange', { ...v, fields: { ...v.fields, notes: ' x ' } }, idx([link({ keys: [key({ name: 'ci2', allowlist: ['10.0.0.9'], notes: 'x' })] })]))).toBeUndefined();
    expect(judge('keyChange', { ...v, fields: undefined }, idx([link({ keys: [key()] })]))).toBeUndefined();
    expect(judge('keyChange', { ...v, action: 'explode' }, idx([link({ keys: [key()] })]))).toBeUndefined();
  });
  it('the identity of a key press holds digests, never the key\'s name or notes', () => {
    const id = JSON.stringify(BOT_PROOFS.mintKey.identity(mint));
    expect(id).not.toContain('for ci');
  });
});

describe('stopDelegate', () => {
  const ds = (state: string, sessionId = 'sess', idle = state === 'idle'): Answers => [[{ [KEY]: [{ sessionId, state, idle }] }]];
  it('applied: the session (its own id) is idle with its activity known, for a stop that does not close it', () => {
    expect(judge('stopDelegate', { botKey: KEY, sessionId: 'sess', close: false }, ds('idle'))).toBe('applied');
  });
  it('a closed row in the open read proves nothing (only the closed read shows a task closed)', () => {
    expect(judge('stopDelegate', { botKey: KEY, sessionId: 'sess', close: true }, ds('closed', 'sess', false))).toBeUndefined();
    expect(judge('stopDelegate', { botKey: KEY, sessionId: 'sess', close: false }, ds('closed'))).toBeUndefined();
  });
  it('a row whose state is none of the page\'s own states proves nothing, idle or not', () => {
    for (const state of ['nonsense', 'open', '']) {
      expect(judge('stopDelegate', { botKey: KEY, sessionId: 'sess', close: false }, ds(state, 'sess', true)), state).toBeUndefined();
    }
  });
  it('unknown: still working or waiting, closing but not closed, the session not listed (one page), another session', () => {
    expect(judge('stopDelegate', { botKey: KEY, sessionId: 'sess', close: true }, ds('idle'))).toBeUndefined();
    expect(judge('stopDelegate', { botKey: KEY, sessionId: 'sess', close: false }, ds('working'))).toBeUndefined();
    expect(judge('stopDelegate', { botKey: KEY, sessionId: 'sess', close: false }, ds('waiting'))).toBeUndefined();
    expect(judge('stopDelegate', { botKey: KEY, sessionId: 'sess', close: false }, ds('closed', 'other'))).toBeUndefined();
    expect(judge('stopDelegate', { botKey: KEY, sessionId: 'sess', close: false }, [[{ [KEY]: [] }]])).toBeUndefined();
  });
  // The closed list comes in pages (the agent lists oldest first): the read's answers are one per page, after the open list's.
  const withClosed = (open: unknown[], ...pages: unknown[][]): Answers => [[{ [KEY]: open }], pages.map((p) => ({ [KEY]: p }))];
  const row = (sessionId: string, state: string, idle = false) => ({ sessionId, state, idle });
  it('a stop that closes is applied when the session is on any page of the closed list, however many pages there are', () => {
    const v = { botKey: KEY, sessionId: 'sess', close: true };
    expect(judge('stopDelegate', v, withClosed([], [row('a', 'closed')], [row('b', 'closed')], [row('sess', 'closed')]))).toBe('applied');
    expect(judge('stopDelegate', v, withClosed([], [row('sess', 'closed')], [row('b', 'closed')]))).toBe('applied');
  });
  it('a working row in the open read does not hide the task listed closed on a closed page (the two reads can differ in time)', () => {
    const v = { botKey: KEY, sessionId: 'sess', close: true };
    expect(judge('stopDelegate', v, withClosed([row('sess', 'working')], [row('sess', 'closed')]))).toBe('applied');
    expect(judge('stopDelegate', v, withClosed([row('sess', 'working')], [row('other', 'closed')]))).toBeUndefined();
  });
  it('idle proves a non-closing stop only on an idle step of the open read: not a working row reported idle, not an idle row of the closed read', () => {
    const v = { botKey: KEY, sessionId: 'sess', close: false };
    expect(judge('stopDelegate', v, ds('working', 'sess', true))).toBeUndefined();
    expect(judge('stopDelegate', v, withClosed([], [row('sess', 'idle', true)]))).toBeUndefined();
  });
  it('only a row listed closed in the closed read proves anything from it: an idle open row there proves no stop', () => {
    expect(judge('stopDelegate', { botKey: KEY, sessionId: 'sess', close: false }, withClosed([], [row('sess', 'open', true)]))).toBeUndefined();
    expect(judge('stopDelegate', { botKey: KEY, sessionId: 'sess', close: true }, withClosed([], [row('sess', 'open', true)]))).toBeUndefined();
  });
  it('with more than 500 closed tasks the closed read covers every page, and a matching row beyond page one is found', () => {
    expect(closedPagesFor(undefined)).toEqual([]);
    expect(closedPagesFor(0)).toEqual([]);
    expect(closedPagesFor(CLOSED_PROOF_PAGE)).toEqual([1]);
    expect(closedPagesFor(1200)).toEqual([1, 2, 3]);
    expect(closedPagesFor(10_000_000)).toHaveLength(CLOSED_PROOF_MAX_PAGES);
    const pageOf = (page: number) => Array.from({ length: Math.min(CLOSED_PROOF_PAGE, 1200 - (page - 1) * CLOSED_PROOF_PAGE) }, (_, i) => row(`t${(page - 1) * CLOSED_PROOF_PAGE + i + 1}`, 'closed'));
    const answers = withClosed([], ...closedPagesFor(1200).map(pageOf));
    expect(judge('stopDelegate', { botKey: KEY, sessionId: 't1200', close: true }, answers)).toBe('applied');
    expect(judge('stopDelegate', { botKey: KEY, sessionId: 't1', close: true }, answers)).toBe('applied');
    // Past the cap the task is on a page that is not read: unknown, never applied.
    const beyond = (CLOSED_PROOF_MAX_PAGES + 2) * CLOSED_PROOF_PAGE;
    const capped = withClosed([], ...closedPagesFor(beyond).map((p) => [row(`p${p}`, 'closed')]));
    expect(judge('stopDelegate', { botKey: KEY, sessionId: `t${beyond}`, close: true }, capped)).toBeUndefined();
  });
  it('a session missing from the open list is not proof it closed: only the closed list shows that', () => {
    const v = { botKey: KEY, sessionId: 'sess', close: true };
    expect(judge('stopDelegate', v, withClosed([row('other', 'working')]))).toBeUndefined();
    expect(judge('stopDelegate', v, withClosed([], [row('a', 'closed')], [row('b', 'closed')]))).toBeUndefined();
    expect(judge('stopDelegate', v, [[{ [KEY]: [] }]])).toBeUndefined();
  });
  it('the closed list never proves another session, an open one, or a malformed row', () => {
    const v = { botKey: KEY, sessionId: 'sess', close: true };
    expect(judge('stopDelegate', v, withClosed([], [row('other', 'closed')]))).toBeUndefined();
    expect(judge('stopDelegate', v, withClosed([], [row('sess', 'working')]))).toBeUndefined();
    expect(judge('stopDelegate', v, withClosed([], [{ sessionId: 'sess', state: 'closed' }]))).toBeUndefined();
    expect(judge('stopDelegate', { ...v, botKey: 'other~global~bot' }, withClosed([], [row('sess', 'closed')]))).toBeUndefined();
  });
  it('a task still in the open list is judged by the open list even when the closed pages are there', () => {
    const v = { botKey: KEY, sessionId: 'sess', close: true };
    expect(judge('stopDelegate', v, withClosed([row('sess', 'idle', true)], [row('x', 'closed')]))).toBeUndefined();
    expect(judge('stopDelegate', { ...v, close: false }, withClosed([row('sess', 'idle', true)], [row('x', 'closed')]))).toBe('applied');
  });
  it('an open session not reported idle (no step, a gate step, anything else) is not idle, and a state that is empty or unknown is not a stop', () => {
    expect(judge('stopDelegate', { botKey: KEY, sessionId: 'sess', close: false }, ds('idle', 'sess', false))).toBeUndefined();
    expect(judge('stopDelegate', { botKey: KEY, sessionId: 'sess', close: false }, ds(''))).toBeUndefined();
    expect(judge('stopDelegate', { botKey: KEY, sessionId: 'sess', close: false }, ds('stopping'))).toBeUndefined();
    expect(judge('stopDelegate', { botKey: KEY, sessionId: 'sess', close: false }, [[{ [KEY]: [{ sessionId: 'sess', state: 'idle' }] }]])).toBeUndefined();
    expect(judge('stopDelegate', { botKey: KEY, sessionId: '', close: false }, ds('idle', ''))).toBeUndefined();
  });
});

describe('channelChange', () => {
  const chans = (channels: unknown[], complete = true): Answers => [[{ [KEY]: { ok: true, channels, complete } }]];
  const ch = (over: Record<string, unknown> = {}) => ({ id: 'ch1', enabled: true, ...over });
  const withView = (a: Answers, over: Record<string, unknown> = {}): Answers => [a[0]!, view(over)[0]!];
  it('create: kind none: a new channel of that kind with that label is what any create leaves, and carries no trace of this press\'s credentials', () => {
    const v = { botKey: KEY, uid: UID, action: 'create:telegram', label: 'team', token: 'tok-123', knownChannelIds: ['ch0'] };
    expect(BOT_PROOFS.channelChange.kind(BOT_PROOFS.channelChange.identity(v))).toBe('none');
    expect(judge('channelChange', v, chans([ch({ id: 'ch0' }), ch({ id: 'ch1', kind: 'telegram', label: 'team' })]))).toBeUndefined();
    expect(judge('channelChange', { ...v, channelId: 'ch1' }, withView(chans([ch({ id: 'ch1', kind: 'telegram', label: 'team' })])))).toBeUndefined();
  });
  it('enable and disable: the channel listed (its id is its own identity) and on / off', () => {
    expect(judge('channelChange', { botKey: KEY, action: 'enable', channelId: 'ch1' }, chans([ch()]))).toBe('applied');
    expect(judge('channelChange', { botKey: KEY, action: 'enable', channelId: 'ch1' }, chans([ch({ enabled: false })]))).toBeUndefined();
    expect(judge('channelChange', { botKey: KEY, action: 'disable', channelId: 'ch1' }, chans([ch({ enabled: false })]))).toBe('applied');
    expect(judge('channelChange', { botKey: KEY, action: 'disable', channelId: 'ch1' }, chans([]))).toBeUndefined();
  });
  it('enable: a channel whose enabled is not known (the select left it null) is not enabled', () => {
    expect(judge('channelChange', { botKey: KEY, action: 'enable', channelId: 'ch1' }, chans([ch({ enabled: null })]))).toBeUndefined();
    expect(judge('channelChange', { botKey: KEY, action: 'enable', channelId: 'ch1' }, chans([ch({ id: '' })]))).toBeUndefined();
  });
  it('remove: only a complete list without the channel, with the Bot confirmed by a view of the same uid', () => {
    const v = { botKey: KEY, uid: UID, action: 'remove', channelId: 'ch1' };
    expect(judge('channelChange', v, withView(chans([])))).toBe('applied');
    expect(judge('channelChange', v, withView(chans([ch()])))).toBeUndefined();
    expect(judge('channelChange', v, withView(chans([], false)))).toBeUndefined();
    expect(judge('channelChange', v, withView([[{ [KEY]: { ok: true, channels: [] } }]]))).toBeUndefined();
    expect(judge('channelChange', v, withView([[{ [KEY]: { channels: [], complete: true } }]]))).toBeUndefined();
  });
  it('remove: an empty list proves nothing without the Bot\'s own view (a list does not echo its Bot): another Bot, another uid, no uid, no view', () => {
    const v = { botKey: KEY, uid: UID, action: 'remove', channelId: 'ch1' };
    expect(judge('channelChange', v, chans([]))).toBeUndefined();
    expect(judge('channelChange', v, withView(chans([]), { uid: 'uid-2' }))).toBeUndefined();
    expect(judge('channelChange', { ...v, uid: '' }, withView(chans([])))).toBeUndefined();
    expect(judge('channelChange', v, [chans([])[0]!, view({}, OTHER)[0]!])).toBeUndefined();
    expect(judge('channelChange', v, [chans([])[0]!, view({ ok: false })[0]!])).toBeUndefined();
  });
  it('credentials and an owner code can never be confirmed by a read', () => {
    for (const action of ['credentials', 'ownerCode']) {
      expect(judge('channelChange', { botKey: KEY, uid: UID, action, channelId: 'ch1' }, chans([ch()])), action).toBeUndefined();
      expect(judge('channelChange', { botKey: KEY, uid: UID, action, channelId: 'ch1' }, chans([]))).toBeUndefined();
    }
  });
  it('the identity never holds a token', () => {
    const id = JSON.stringify(BOT_PROOFS.channelChange.identity({ botKey: KEY, action: 'credentials', channelId: 'ch1', token: 'tok-123', appToken: 'app-456' }));
    expect(id).not.toContain('tok-123');
    expect(id).not.toContain('app-456');
  });
});

describe('toLinkIndex (built from the raw bot_urls array, never from the Bot-keyed map)', () => {
  const rawKey = (over: Record<string, unknown> = {}) => ({ id: 'k1', name: 'ci', prefix: 'bk_ab', enabled: true, ipv4_allow: [], expires_at: null, notes: null, rotated_at: null, status: 'active', ...over });
  const rawLink = (over: Record<string, unknown> = {}) => ({ id: 'bu_1', label: 'x', computer_id: 'c1', bot: { realm: 'global', id: 'chief', uid: UID }, owner_enabled: true, cors: false, limits: { key_rpm: 3, bad: 'x' }, keys: [rawKey()], ...over });
  const ans = (raw: unknown, cursor: unknown): Answers => [[toLinkIndex(raw, cursor)]];

  it('is whole only when the first page ended (cursor exactly null) and every link was well formed', () => {
    const a = toLinkIndex([rawLink()], null);
    expect(a.complete).toBe(true);
    expect(a.links).toHaveLength(1);
    expect(a.links[0]).toMatchObject({ id: 'bu_1', botKey: KEY, botUid: UID, ownerEnabled: true, cors: false, keysKnown: true, limits: { key_rpm: 3 } });
    expect(a.links[0]!.keys[0]).toMatchObject({ id: 'k1', notes: '', rotatedAt: null, enabled: true });
    expect(toLinkIndex([rawLink()], 'next').complete).toBe(false);
    expect(toLinkIndex([rawLink()], undefined).complete).toBe(false);
    expect(toLinkIndex(undefined, null)).toEqual({ complete: false, links: [] });
    expect(toLinkIndex({ [KEY]: rawLink() }, null)).toEqual({ complete: false, links: [] });
  });
  it('keeps every link: two Bot incarnations under one key, and detached links, are all there (a map would drop them)', () => {
    const a = toLinkIndex([rawLink({ id: 'bu_1' }), rawLink({ id: 'bu_2', bot: { realm: 'global', id: 'chief', uid: 'uid-2' } }), rawLink({ id: 'bu_3', bot: null }), rawLink({ id: 'bu_4', bot: null, computer_id: null })], null);
    expect(a.complete).toBe(true);
    expect(a.links.map((l) => l.id)).toEqual(['bu_1', 'bu_2', 'bu_3', 'bu_4']);
    expect(a.links.map((l) => l.botKey)).toEqual([KEY, KEY, '', '']);
    expect(judge('botAction', { action: 'deleteLink', botKey: KEY, linkId: 'bu_2' }, actionReads({ linkIndex: toLinkIndex([rawLink({ id: 'bu_1' }), rawLink({ id: 'bu_2', bot: { realm: 'global', id: 'chief', uid: 'uid-2' } })], null) as never }))).toBeUndefined();
  });
  it('a malformed link is left out and the index is then not whole: no absence is proved from it', () => {
    const bad = rawLink({ id: 'bu_2', owner_enabled: undefined });
    const a = toLinkIndex([rawLink(), bad], null);
    expect(a.links.map((l) => l.id)).toEqual(['bu_1']);
    expect(a.complete).toBe(false);
    const del = { action: 'deleteLink', botKey: KEY, linkId: 'bu_2' };
    expect(judge('botAction', del, actionReads({ linkIndex: a as never }))).toBeUndefined();
    for (const over of [{ id: '' }, { cors: 'no' }, { limits: null }, { bot: { realm: 'global' } }, { bot: { realm: '', id: 'chief', uid: UID } }, { computer_id: '' }, { keys: [rawKey({ enabled: undefined })] }, { keys: [rawKey({ rotated_at: undefined })] }, { keys: [rawKey({ ipv4_allow: 'x' })] }, { keys: [{ id: '' }] }]) {
      const r = toLinkIndex([rawLink(over)], null);
      expect(r.links, JSON.stringify(over)).toHaveLength(0);
      expect(r.complete, JSON.stringify(over)).toBe(false);
    }
  });
  it('a link with no key list is keysKnown false with no keys: it never reads as a known empty list', () => {
    const raw = rawLink({ keys: undefined, owner_enabled: false });
    const a = toLinkIndex([raw], null);
    expect(a.links[0]).toMatchObject({ keysKnown: false, keys: [] });
    expect(judge('panic', { linkId: 'bu_1' }, [[a]])).toBeUndefined();
    expect(judge('panic', { linkId: 'bu_1' }, ans([rawLink({ keys: [], owner_enabled: false })], null))).toBe('applied');
  });
  it('a revoked key is not live, and a missing note is the empty note', () => {
    const a = toLinkIndex([rawLink({ keys: [rawKey({ id: 'k1', status: 'revoked' }), rawKey({ id: 'k2', notes: 'n' })] })], null);
    expect(a.links[0]!.keys.map((k) => [k.id, k.notes])).toEqual([['k2', 'n']]);
  });
  it('the index it builds is what the judges accept, end to end', () => {
    const raw = rawLink({ owner_enabled: false, keys: [rawKey({ id: 'k2', enabled: false })] });
    expect(judge('keyChange', { linkId: 'bu_1', keyId: 'k2', action: 'pause' }, ans([raw], null))).toBe('applied');
    expect(judge('patchLink', { linkId: 'bu_1', enabled: false }, ans([raw], 'more'))).toBe('applied');
    expect(judge('createLink', { botKey: KEY, uid: UID }, ans([raw], 'more'))).toBe('applied');
    expect(judge('botAction', { action: 'deleteLink', botKey: KEY, linkId: 'bu_9' }, actionReads({ linkIndex: toLinkIndex([raw], 'more') as never }))).toBeUndefined();
  });
});

describe('digest', () => {
  it('is stable, differs for different text, and is not the text', () => {
    expect(digest('a')).toBe(digest('a'));
    expect(digest('a')).not.toBe(digest('b'));
    expect(digest('hello')).toMatch(/^[0-9a-f]{16}$/);
    expect(rec({ d: digest('') }).d).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ── the split, the lock, and a red table for every entry ───────────────────────────────────────

interface Fx {
  key: BotChangeKey;
  vars: Record<string, unknown>;
  applied: Answers;
  unchanged: Answers;
  /** The same press on another Bot, link, key or computer: the applied answer is not about it. */
  other: Record<string, unknown>;
}
const fixtures: Fx[] = [
  { key: 'loadOlder', vars: { botKey: KEY }, applied: [[{ [KEY]: { ok: true, rows: [], hasOlder: false } }]], unchanged: [[]], other: { botKey: OTHER } },
  { key: 'createBot', vars: { name: 'Chief', computerId: 'c1' }, applied: list([row()]), unchanged: list([]), other: { name: 'Chief', computerId: 'c2' } },
  { key: 'saveSettings', vars: { botKey: KEY, uid: UID, revision: 4, patch: { name: 'Chief 2' } }, applied: view({ name: 'Chief 2', guardrailRevision: 5 }), unchanged: view(), other: { botKey: OTHER, uid: UID, revision: 4, patch: { name: 'Chief 2' } } },
  { key: 'decideGate', vars: { botKey: KEY, uid: UID, gate: { id: 'g1', generation: 1 } }, applied: view({ gate: null }), unchanged: view({ gate: { id: 'g1', generation: 1 } }), other: { botKey: OTHER, uid: UID, gate: { id: 'g1', generation: 1 } } },
  { key: 'stopTurn', vars: { botKey: KEY, uid: UID, turnId: 't1' }, applied: view(), unchanged: view({ turnRunning: true, turnId: 't1' }), other: { botKey: OTHER, uid: UID, turnId: 't1' } },
  { key: 'botAction', vars: { action: 'delete', botKey: KEY, uid: UID }, applied: list([]), unchanged: list([row()]), other: { action: 'delete', botKey: 'c2~global~chief', uid: UID } },
  { key: 'createLink', vars: { botKey: KEY, uid: UID, label: 'x' }, applied: idx([link()]), unchanged: idx([]), other: { botKey: OTHER, uid: UID, label: 'x' } },
  { key: 'patchLink', vars: { linkId: 'bu_1', enabled: false }, applied: idx([link({ ownerEnabled: false })]), unchanged: idx([link()]), other: { linkId: 'bu_2', enabled: false } },
  { key: 'panic', vars: { linkId: 'bu_1' }, applied: idx([link({ ownerEnabled: false })]), unchanged: idx([link({ keys: [key()] })]), other: { linkId: 'bu_2' } },
  { key: 'repoint', vars: { linkId: 'bu_1', botKey: KEY, computerId: 'c2', uid: UID }, applied: idx([link({ botKey: 'c2~global~chief' })]), unchanged: idx([link()]), other: { linkId: 'bu_2', botKey: KEY, computerId: 'c2', uid: UID } },
  { key: 'mintKey', vars: { linkId: 'bu_1', name: 'ci', allowlist: [], expiresAt: null, notes: '', knownKeyIds: [] }, applied: idx([link({ keys: [key({ allowlist: [], notes: '' })] })]), unchanged: idx([link()]), other: { linkId: 'bu_2', name: 'ci', allowlist: [], expiresAt: null, notes: '', knownKeyIds: [] } },
  { key: 'keyChange', vars: { linkId: 'bu_1', keyId: 'k1', action: 'pause' }, applied: idx([link({ keys: [key({ enabled: false })] })]), unchanged: idx([link({ keys: [key()] })]), other: { linkId: 'bu_1', keyId: 'k2', action: 'pause' } },
  { key: 'stopDelegate', vars: { botKey: KEY, sessionId: 'sess', close: false }, applied: [[{ [KEY]: [{ sessionId: 'sess', state: 'idle', idle: true }] }]], unchanged: [[{ [KEY]: [{ sessionId: 'sess', state: 'working', idle: false }] }]], other: { botKey: KEY, sessionId: 'sess2', close: false } },
  { key: 'keyRevokeAll', vars: { linkId: 'bu_1' }, applied: idx([link({ keys: [] })]), unchanged: idx([link({ keys: [key()] })]), other: { linkId: 'bu_2' } },
  { key: 'channelsPause', vars: { botKey: KEY, uid: UID, paused: true }, applied: [[{ [KEY]: { ok: true, paused: true } }], [], view()[0]!], unchanged: [[{ [KEY]: { ok: true, paused: false } }], [], view()[0]!], other: { botKey: OTHER, uid: UID, paused: true } },
  { key: 'channelChange', vars: { botKey: KEY, uid: UID, action: 'enable', channelId: 'ch1' }, applied: [[{ [KEY]: { ok: true, complete: true, channels: [{ id: 'ch1', enabled: true }] } }]], unchanged: [[{ [KEY]: { ok: true, complete: true, channels: [{ id: 'ch1', enabled: false }] } }]], other: { botKey: KEY, uid: UID, action: 'enable', channelId: 'ch2' } },
];

describe('every entry: applied, unchanged, another entity, malformed', () => {
  const malformed: Answers[] = [[], [[]], [[null]], [[{}]], [['x']], [[[]]], [[{ ok: true }]], [[{ [KEY]: null }]], [[{ ok: true, rows: 'x', links: 'y', channels: 'z' }]]];
  for (const f of fixtures) {
    const p = BOT_PROOFS[f.key];
    it(`${f.key}: applied, and nothing else`, () => {
      const id = p.identity(f.vars);
      expect(p.proves(id, f.applied)).toBe('applied');
      expect(p.proves(id, f.unchanged), 'unchanged state').toBeUndefined();
      if (f.key !== 'loadOlder') expect(p.proves(p.identity(f.other), f.applied), 'another entity').toBeUndefined();
      else expect(p.proves(p.identity(f.other), f.applied), 'another Bot').toBeUndefined();
      for (const m of malformed) expect(p.proves(id, m), JSON.stringify(m)).toBeUndefined();
    });
    it(`${f.key}: validate and judge are the two halves of proves`, () => {
      const id = p.identity(f.vars);
      const parsed = p.validate(f.applied, id);
      expect(parsed).not.toBeNull();
      expect(p.judge(id, parsed)).toBe(p.proves(id, f.applied));
      expect(p.validate(f.unchanged, id) === null || p.judge(id, p.validate(f.unchanged, id)) === undefined).toBe(true);
      expect(p.validate([[{}]], id)).toBeNull();
      expect(p.judge(id, null)).toBeUndefined();
      expect(p.judge(id, undefined)).toBeUndefined();
      expect(p.kind(id)).toBe('state');
    });
    it(`${f.key}: no malformed identity can make it throw or free`, () => {
      for (const id of [undefined, null, 1, 'x', [], {}, { botKey: 5, linkId: {}, action: [] }]) {
        expect(() => p.proves(id, f.applied)).not.toThrow();
        expect(p.proves(id, f.applied)).toBeUndefined();
        expect(() => p.validate(f.applied, id)).not.toThrow();
        expect(() => p.kind(id)).not.toThrow();
      }
    });
  }
});

describe('a computer list with a row that names nothing proves nothing', () => {
  it('an empty key or id in any row makes the list no answer; a row with no uid (owned elsewhere) is still a row', () => {
    const v = { action: 'delete', botKey: KEY, uid: UID };
    expect(judge('botAction', v, list([row({ key: '' })]))).toBeUndefined();
    expect(judge('botAction', v, list([row({ id: '' })]))).toBeUndefined();
    expect(judge('botAction', v, list([row({ key: 'c1~global~other', id: 'other', uid: '' })]))).toBe('applied');
  });
});

describe('an answer must say it was well formed', () => {
  it('a list, log, channel or archive read without its ok marker judges nothing (a malformed raw answer is not an empty whole list)', () => {
    expect(judge('botAction', { action: 'delete', botKey: KEY, uid: UID }, [[{ computerId: 'c1', rows: [], suspended: 0, hasMore: false }]])).toBeUndefined();
    expect(judge('botAction', { action: 'delete', botKey: KEY, uid: UID }, [[{ ok: false, computerId: 'c1', rows: [], suspended: 0, hasMore: false }]])).toBeUndefined();
    expect(judge('createBot', { name: 'Chief', computerId: 'c1' }, [[{ computerId: 'c1', rows: [row()], suspended: 0, hasMore: false }]])).toBeUndefined();
    const forget = { action: 'forget', botKey: KEY, uid: UID, logSeq: 10 };
    expect(judge('botAction', forget, actionReads({ log: [{ [KEY]: { rows: [], hasOlder: false } }], view: view()[0]! }))).toBeUndefined();
    expect(judge('botAction', { action: 'purge', botKey: KEY, uid: UID }, actionReads({ view: view()[0]!, archive: [{ [KEY]: { rows: 0, more: false } }] }))).toBeUndefined();
    expect(judge('channelChange', { botKey: KEY, uid: UID, action: 'remove', channelId: 'ch1' }, [[{ [KEY]: { channels: [], complete: true } }], view()[0]!])).toBeUndefined();
    expect(judge('botAction', { action: 'resume', botKey: KEY, uid: UID, computerId: 'c1', suspended: 2 }, [[{ computerId: 'c1', rows: [], suspended: 0, hasMore: false }]])).toBeUndefined();
  });
});

describe('the lock is the entity, never the press\'s fields or action', () => {
  const lock = (k: BotChangeKey, vars: Record<string, unknown>) => JSON.stringify(BOT_PROOFS[k].lockKey(vars));
  it('two different patches of one link or Bot share a lock; another entity does not', () => {
    expect(lock('patchLink', { linkId: 'bu_1', enabled: false })).toBe(lock('patchLink', { linkId: 'bu_1', cors: true, limits: { key_rpm: 1 } }));
    expect(lock('patchLink', { linkId: 'bu_1', enabled: false })).not.toBe(lock('patchLink', { linkId: 'bu_2', enabled: false }));
    expect(lock('saveSettings', { botKey: KEY, patch: { name: 'a' } })).toBe(lock('saveSettings', { botKey: KEY, patch: { name: 'b' }, rules: ['x'] }));
    expect(lock('saveSettings', { botKey: KEY, patch: {} })).toBe(lock('saveGuardrails', { botKey: KEY, patch: {} }));
    expect(lock('keyChange', { linkId: 'bu_1', keyId: 'k1', action: 'pause' })).toBe(lock('keyChange', { linkId: 'bu_1', keyId: 'k1', action: 'revoke' }));
    expect(lock('channelChange', { botKey: KEY, channelId: 'ch1', action: 'enable' })).toBe(lock('channelChange', { botKey: KEY, channelId: 'ch1', action: 'remove' }));
    expect(lock('channelChange', { botKey: KEY, channelId: 'ch1', action: 'enable' })).not.toBe(lock('channelChange', { botKey: KEY, channelId: 'ch2', action: 'enable' }));
    expect(lock('mintKey', { linkId: 'bu_1', name: 'a' })).toBe(lock('mintKey', { linkId: 'bu_1', name: 'b' }));
    expect(lock('createBot', { computerId: 'c1', name: 'a' })).toBe(lock('createBot', { computerId: 'c1', name: 'b' }));
  });
  it('a Bot action locks the Bot, the computer (resume) or the link (deleteLink), whatever the action', () => {
    expect(lock('botAction', { action: 'reset', botKey: KEY })).toBe(lock('botAction', { action: 'delete', botKey: KEY }));
    expect(lock('botAction', { action: 'resume', botKey: KEY, computerId: 'c1' })).toBe(lock('botAction', { action: 'resume', botKey: OTHER }));
    expect(lock('botAction', { action: 'deleteLink', botKey: KEY, linkId: 'bu_1' })).not.toBe(lock('botAction', { action: 'deleteLink', botKey: KEY, linkId: 'bu_2' }));
  });
  it('the gate and the turn of one Bot share a serialize key; nothing else names one', () => {
    const g = BOT_PROOFS.decideGate.serializeOn?.({ botKey: KEY, gate: { id: 'g1', generation: 1 } });
    const t = BOT_PROOFS.stopTurn.serializeOn?.({ botKey: KEY, turnId: 't1' });
    expect(g).toEqual(t);
    expect(g).not.toEqual(BOT_PROOFS.stopTurn.serializeOn?.({ botKey: OTHER, turnId: 't1' }));
    for (const k of Object.keys(BOT_PROOFS) as BotChangeKey[]) if (k !== 'decideGate' && k !== 'stopTurn') expect(BOT_PROOFS[k].serializeOn, k).toBeUndefined();
  });
});

describe('changes with no sound proof are always unknown', () => {
  const sweep: Answers[] = [
    [[{ [KEY]: { ok: true, complete: true, channels: [] } }]],
    [[{ [KEY]: { ok: true, complete: true, channels: [{ id: 'ch1', enabled: true }] } }]],
    [[{ [KEY]: { ok: true, complete: false, channels: [{ id: 'ch2', enabled: true }] } }]],
    view({ sessionId: 's2', guardrailRevision: 9 }), list([]), idx([link({ keys: [key({ rotatedAt: '2026-10-24T01:00:00Z' })] })]), [],
    actionReads({ view: view({ sessionId: 's2' })[0]!, log: [{ [KEY]: { ok: true, rows: [], hasOlder: false } }], archive: [{ [KEY]: { ok: true, rows: 0, more: false } }] }),
  ];
  const none = (k: BotChangeKey, vars: Record<string, unknown>, label: string) =>
    it(`${label}: kind none, validate null, proves undefined for every answer`, () => {
      const p = BOT_PROOFS[k];
      const id = p.identity(vars);
      expect(p.kind(id), label).toBe('none');
      for (const a of sweep) {
        expect(p.validate(a, id), label).toBeNull();
        expect(p.proves(id, a), label).toBeUndefined();
      }
    });
  for (const action of ['credentials', 'ownerCode', 'explode', '', 'create:telegram', 'create:slack', 'create:discord']) none('channelChange', { botKey: KEY, uid: UID, action, channelId: 'ch1', label: 'x', knownChannelIds: [], token: 'tok' }, `channel ${action || '(none)'}`);
  none('botAction', { botKey: KEY, uid: UID, action: 'reset', sessionId: 's1' }, 'reset');
  none('botAction', { botKey: KEY, uid: UID, action: 'explode' }, 'unknown Bot action');
  none('keyChange', { linkId: 'bu_1', keyId: 'k1', action: 'explode' }, 'unknown key action');
  none('sendMessage', { botKey: KEY, sessionId: 'sess' }, 'a message to a task');
  none('rotateKey', { linkId: 'bu_1', keyId: 'k1', rotatedAt: null }, 'rotate (null baseline)');
  none('rotateKey', { linkId: 'bu_1', keyId: 'k1', rotatedAt: '2026-10-01T00:00:00Z' }, 'rotate (dated baseline)');
  it('the entry-level proofBy is state for every entry but rotateKey and sendMessage (the per-press kind carries the other exceptions)', () => {
    for (const [k, p] of Object.entries(BOT_PROOFS)) expect(p.proofBy, k).toBe(k === 'rotateKey' || k === 'sendMessage' ? 'none' : 'state');
  });
});

// ── the raw checks the selects run: a field the select would default must make the answer unusable ──────────

const rawView = (over: Record<string, unknown> = {}) => ({
  id: 'chief', uid: UID, realm: 'global', name: 'Chief', role: 'ops', instructions: 'be brief', model: 'hoody-ai/hoody-free', yolo: false, guardrail_check: 'strict',
  guardrails: 'no push', allowed_computers: [], allowed_agents: [], revision: 4, turn_running: false, session_id: 's1', pending_gate: null, ...over,
});
const without = (o: Record<string, unknown>, k: string): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([x]) => x !== k));

describe('rawViewOk', () => {
  it('accepts the agent\'s whole view, with or without a pending gate', () => {
    expect(rawViewOk(rawView())).toBe(true);
    expect(rawViewOk(rawView({ pending_gate: { session_id: 's1', gate_id: 'g1', type: 'confirm', summary: 'x', generation: 2 } }))).toBe(true);
  });
  it('rejects a view missing, or with a wrong type for, any field a proof reads (the select would default it)', () => {
    for (const k of ['id', 'uid', 'name', 'role', 'instructions', 'model', 'yolo', 'guardrail_check', 'guardrails', 'allowed_computers', 'allowed_agents', 'revision', 'turn_running', 'pending_gate']) {
      expect(rawViewOk(without(rawView(), k)), `missing ${k}`).toBe(false);
    }
    for (const bad of [{ guardrail_check: 'maybe' }, { guardrail_check: '' }, { revision: -1 }, { revision: 1.5 }, { yolo: 'no' }, { uid: '' }, { id: '' }, { allowed_computers: 'c1' }, { allowed_agents: [1] }, { turn_running: 0 }, { pending_gate: [] }, { pending_gate: {} }, { pending_gate: { gate_id: '', generation: 1 } }, { pending_gate: { gate_id: 'g1' } }, { guardrails: ['x'] }]) {
      expect(rawViewOk(rawView(bad)), JSON.stringify(bad)).toBe(false);
    }
    for (const x of [undefined, null, 5, 'x', [], {}]) expect(rawViewOk(x)).toBe(false);
  });
});

describe('rawListOk', () => {
  const rawList = (over: Record<string, unknown> = {}) => ({ items: [{ id: 'chief', uid: UID, realm: 'global' }], meta: { total: 1 }, suspended_count: 0, ...over });
  it('accepts a whole list, and a row another program owns (no uid)', () => {
    expect(rawListOk(rawList())).toBe(true);
    expect(rawListOk(rawList({ items: [{ id: 'x', realm: 'global', owned_elsewhere: true }] }))).toBe(true);
  });
  it('rejects a list without a real suspended count (the select would read 0), without meta.total, or with a row that names nothing', () => {
    expect(rawListOk(without(rawList(), 'suspended_count'))).toBe(false);
    expect(rawListOk(rawList({ suspended_count: '1' }))).toBe(false);
    expect(rawListOk(rawList({ suspended_count: -1 }))).toBe(false);
    expect(rawListOk(rawList({ suspended_count: 1.5 }))).toBe(false);
    expect(rawListOk(without(rawList(), 'meta'))).toBe(false);
    expect(rawListOk(rawList({ meta: { total: 'x' } }))).toBe(false);
    expect(rawListOk(rawList({ items: 'x' }))).toBe(false);
    for (const row of [{ uid: UID, realm: 'global' }, { id: '', uid: UID, realm: 'global' }, { id: 'x', uid: '', realm: 'global' }, { id: 'x', uid: UID }, { id: 'x', uid: UID, realm: '' }, null, 5]) {
      expect(rawListOk(rawList({ items: [row] })), JSON.stringify(row)).toBe(false);
    }
    expect(rawListOk(undefined)).toBe(false);
  });
});

describe('rawLogOk, rawArchiveOk, rawChannelsOk', () => {
  it('a log tail needs its rows\' seq and has_more', () => {
    expect(rawLogOk({ items: [{ seq: 1 }], has_more: false })).toBe(true);
    expect(rawLogOk({ items: [], has_more: true })).toBe(true);
    expect(rawLogOk({ items: [{ seq: 1 }] })).toBe(false);
    expect(rawLogOk({ items: [{}], has_more: false })).toBe(false);
    expect(rawLogOk({ has_more: false })).toBe(false);
    expect(rawLogOk(null)).toBe(false);
  });
  it('an archive read needs its rows and has_more', () => {
    expect(rawArchiveOk({ items: [], has_more: false })).toBe(true);
    expect(rawArchiveOk({ items: [] })).toBe(false);
    expect(rawArchiveOk({ has_more: false })).toBe(false);
  });
  it('a channel list needs each channel\'s id and a boolean effective enabled value, and meta.total', () => {
    const ch = (over: Record<string, unknown> = {}) => ({ id: 'ch_1', kind: 'telegram', effective: { enabled: { value: true } }, ...over });
    expect(rawChannelsOk({ items: [ch()], meta: { total: 1 } })).toBe(true);
    expect(rawChannelsOk({ items: [], meta: { total: 0 } })).toBe(true);
    expect(rawChannelsOk({ items: [ch({ effective: {} })], meta: { total: 1 } })).toBe(false);
    expect(rawChannelsOk({ items: [ch({ effective: { enabled: {} } })], meta: { total: 1 } })).toBe(false);
    expect(rawChannelsOk({ items: [ch({ effective: { enabled: { value: 'yes' } } })], meta: { total: 1 } })).toBe(false);
    expect(rawChannelsOk({ items: [ch({ id: '' })], meta: { total: 1 } })).toBe(false);
    expect(rawChannelsOk({ items: [ch()] })).toBe(false);
  });
});

describe('rawDelegateIdle', () => {
  const d = (over: Record<string, unknown> = {}) => ({ session_id: 'sess', state: 'open', open_gates: [], current_step: { kind: 'idle' }, ...over });
  it('is true only for an open delegate with no open gate whose session reported an idle step', () => {
    expect(rawDelegateIdle(d())).toBe(true);
  });
  it('is false for a missing step, a gate step (a gate entered between two reads), a working step, an open gate, a closed or unknown state', () => {
    expect(rawDelegateIdle(without(d(), 'current_step'))).toBe(false);
    expect(rawDelegateIdle(d({ current_step: { kind: 'gate' } }))).toBe(false);
    expect(rawDelegateIdle(d({ current_step: { kind: 'model' } }))).toBe(false);
    expect(rawDelegateIdle(d({ current_step: { kind: 'tool' } }))).toBe(false);
    expect(rawDelegateIdle(d({ current_step: {} }))).toBe(false);
    expect(rawDelegateIdle(d({ open_gates: [{ summary: 'x' }] }))).toBe(false);
    expect(rawDelegateIdle(without(d(), 'open_gates'))).toBe(false);
    expect(rawDelegateIdle(d({ state: 'closed' }))).toBe(false);
    expect(rawDelegateIdle(d({ state: '' }))).toBe(false);
    expect(rawDelegateIdle(null)).toBe(false);
  });
});

describe('cleanInstructions (the agent\'s cleanText, then trim)', () => {
  it('maps line breaks and odd spaces, drops control and format characters, keeps tabs and text, trims', () => {
    expect(cleanInstructions('  a\r\nb\rc\u0085d\u000be\u000cf\u2028g\u2029h  ')).toBe('a\nb\nc\nd\ne\nf\ng\nh');
    expect(cleanInstructions('x\u00a0y\u3000z\ta')).toBe('x y z\ta');
    expect(cleanInstructions('a\u0000b\u200bc\u2800d\u034fe')).toBe('abcde');
    expect(cleanInstructions('a\ud800b')).toBe('a\ufffdb');
    expect(cleanInstructions(undefined)).toBe('');
    expect(cleanInstructions('   ')).toBe('');
  });
});

describe('channelsPause', () => {
  const v = { botKey: KEY, uid: UID, paused: false };
  const reads = (settings: unknown, viewAnswer: unknown = view()[0]![0]): Answers => [[settings], [], [viewAnswer]];
  it('an answer without the ok marker or a boolean state proves nothing, even when it reads as the wanted state', () => {
    expect(judge('channelsPause', v, reads({ [KEY]: { ok: false, paused: false } }))).toBeUndefined();
    expect(judge('channelsPause', v, reads({ [KEY]: { paused: false } }))).toBeUndefined();
    expect(judge('channelsPause', v, reads({ [KEY]: { ok: true, paused: 'no' } }))).toBeUndefined();
    expect(judge('channelsPause', v, reads({ [OTHER]: { ok: true, paused: false } }))).toBeUndefined();
  });
  it('a read of a replacement Bot (another uid) or without the Bot view proves nothing', () => {
    expect(judge('channelsPause', v, reads({ [KEY]: { ok: true, paused: false } }))).toBe('applied');
    expect(judge('channelsPause', v, reads({ [KEY]: { ok: true, paused: false } }, { [KEY]: viewOf({ uid: 'uid-2' }) }))).toBeUndefined();
    expect(judge('channelsPause', v, [[{ [KEY]: { ok: true, paused: false } }], [], []])).toBeUndefined();
    expect(judge('channelsPause', { botKey: KEY, paused: false }, reads({ [KEY]: { ok: true, paused: false } }))).toBeUndefined();
  });
  it('the lock is the Bot alone and the identity adds the Bot uid and the wanted state', () => {
    expect(BOT_PROOFS.channelsPause.lockKey({ botKey: KEY, uid: UID, paused: true })).toEqual({ botKey: KEY });
    expect(BOT_PROOFS.channelsPause.lockKey({ botKey: KEY, uid: UID, paused: false })).toEqual(BOT_PROOFS.channelsPause.lockKey({ botKey: KEY, uid: UID, paused: true }));
    expect(BOT_PROOFS.channelsPause.identity({ botKey: KEY, uid: UID, paused: true, token: 'x' })).toEqual({ botKey: KEY, uid: UID, paused: true });
  });
});

describe('a key edit with a holder note', () => {
  const fields = { name: 'ci', allowlist: ['10.0.0.1'], expiresAt: null, notes: 'n', holderNote: 'Ask Dana' };
  const v = { linkId: 'bu_1', keyId: 'k1', action: 'edit', fields };
  it('is applied only when the key shows exactly that note', () => {
    expect(judge('keyChange', v, idx([link({ keys: [key({ holderNote: 'Ask Dana' })] })]))).toBe('applied');
    expect(judge('keyChange', v, idx([link({ keys: [key({ holderNote: 'Ask Sam' })] })]))).toBeUndefined();
    expect(judge('keyChange', v, idx([link({ keys: [key()] })]))).toBeUndefined();
  });
  it('clearing it is applied when the key shows none, and an answer that carries none counts as none', () => {
    const clear = { ...v, fields: { ...fields, holderNote: '' } };
    expect(judge('keyChange', clear, idx([link({ keys: [key({ holderNote: '' })] })]))).toBe('applied');
    expect(judge('keyChange', clear, idx([link({ keys: [key({ holderNote: 'Ask Dana' })] })]))).toBeUndefined();
  });
  it('an edit that left the note untouched compares nothing about it, whatever the key shows now', () => {
    const { holderNote: _h, ...rest } = fields;
    const untouched = { ...v, fields: rest };
    expect(judge('keyChange', untouched, idx([link({ keys: [key({ holderNote: 'written elsewhere' })] })]))).toBe('applied');
    expect(judge('keyChange', untouched, idx([link({ keys: [key({ holderNote: '' })] })]))).toBe('applied');
    expect(judge('keyChange', untouched, idx([link({ keys: [key({ notes: 'other' })] })]))).toBeUndefined();
  });
  it('the identity holds a digest of the note, never the text', () => {
    expect(JSON.stringify(BOT_PROOFS.keyChange.identity(v))).not.toContain('Ask Dana');
  });
  it('a new key without a note is the one the key shows with none', () => {
    const { holderNote: _h, ...rest } = fields;
    const mv = { linkId: 'bu_1', ...rest, knownKeyIds: [] };
    expect(judge('mintKey', mv, idx([link({ keys: [key({ allowlist: ['10.0.0.1'], notes: 'n', holderNote: '' })] })]))).toBe('applied');
    expect(judge('mintKey', mv, idx([link({ keys: [key({ allowlist: ['10.0.0.1'], notes: 'n', holderNote: 'other' })] })]))).toBeUndefined();
  });
  it('a new key carries it too: a key with another note is not the one this press made', () => {
    const mv = { linkId: 'bu_1', ...fields, knownKeyIds: [] };
    expect(judge('mintKey', mv, idx([link({ keys: [key({ allowlist: ['10.0.0.1'], notes: 'n', holderNote: 'Ask Dana' })] })]))).toBe('applied');
    expect(judge('mintKey', mv, idx([link({ keys: [key({ allowlist: ['10.0.0.1'], notes: 'n', holderNote: 'other' })] })]))).toBeUndefined();
  });
  it('the raw answer is read: holder_note is the key\'s note, absent is none', () => {
    const raw = (extra: Record<string, unknown>) => toLinkIndex([{ id: 'bu_1', label: 'x', computer_id: 'c1', bot: { realm: 'global', id: 'chief', uid: UID }, owner_enabled: true, cors: false, limits: {}, keys: [{ id: 'k1', name: 'ci', enabled: true, ipv4_allow: [], expires_at: null, notes: null, rotated_at: null, ...extra }] }], null);
    expect(raw({ holder_note: 'Ask Dana' }).links[0]?.keys[0]?.holderNote).toBe('Ask Dana');
    expect(raw({}).links[0]?.keys[0]?.holderNote).toBe('');
    expect(raw({ holder_note: null }).links[0]?.keys[0]?.holderNote).toBe('');
    // A value of another type is a malformed key: the list is not complete, so no edit or mint is proven by it.
    expect(raw({ holder_note: 42 }).complete).toBe(false);
  });
});
