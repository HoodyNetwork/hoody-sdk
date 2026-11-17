// Fake agent answers for the Claude Code copies, for the tests: answered as the agent answers.
// Each computer holds a login (or none) and some files below its home folder. A preview plans a copy from the source (the
// agent's own computer for kind host) onto the target and issues a single-use token; an apply checks the token (409
// preview_stale: unknown, expired, or the source/target differs from the plan), then writes as the agent does: a login only
// with overwrite when the target held one; each file the plan showed as present or unknown only when overwrite lists it
// (else skipped), and a path in overwrite the plan did not show as present/unknown refuses the whole apply (400).
//   apply: 'lost' writes and no answer comes back (the connection dropped); 'gateway' writes and answers a gateway error
//   (pending); 'unknown' writes nothing and answers 503 outcome_unknown; 'malformed' writes and answers 200 with `applyBody`.
//   previewAfter: once an apply was sent, every later preview gets this answer (a follow-up check that fails).
//   gate: an apply waits for it before it is checked (a deferred answer). gates: the nth apply sent waits for gates[n]
//   instead (overlapping applies, each answered on its own).
//   previewHold: a preview sent after an apply reads the computers at once, then holds its answer until this settles (a
//   read made before a held apply wrote, answered after it). A function is asked when each such preview is sent
//   (undefined: answered at once).
import { answers, reply, type FixtureAnswer, type FixtureRequest, type FixtureRule } from '@core';
import { transferRoutes } from './transferApi';

export interface CopyComputer {
  /** The login file's text, or absent. `unknown`: whether one is there cannot be checked. */
  login?: string | 'unknown';
  /** Files below home: path → contents. */
  files: Record<string, string>;
}

export interface TransferOpts {
  /** By computer id (a computer not listed holds nothing). */
  world?: Record<string, CopyComputer>;
  apply?: 'lost' | 'gateway' | 'unknown' | 'malformed';
  /** The 200 body of apply 'malformed'. */
  applyBody?: unknown;
  previewAfter?: FixtureAnswer;
  gate?: Promise<void>;
  gates?: ReadonlyArray<Promise<void>>;
  previewHold?: Promise<void> | (() => Promise<void> | undefined);
  /** Token lifetime (ms); default ten minutes. */
  ttlMs?: number;
  /** The clock the fake agent reads (default Date.now). */
  now?: () => number;
  /** Runs right before an apply is checked (another tab, a person on the target). */
  beforeApply?: (world: Record<string, CopyComputer>) => void;
  onSend?: (r: FixtureRequest) => void;
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const refuse = (status: number, code: string, details: Record<string, unknown> = {}): FixtureAnswer => ({ status, body: { error: code, details } });
const CLAUDE_DIR = '.claude/';
const CONFIG = ['settings.json', 'CLAUDE.md', 'keybindings.json'];
const CRED = '.claude/.credentials.json';

/** A refusal answer rather than the plan or the ends it would read. */
const isAnswer = (x: object): x is FixtureAnswer => !('from' in x);

interface Plan { op: 'login' | 'files'; agent: string; realm: string; from: string; to: string; snap: string; exp: number; used: boolean }

export function transferRules(o: TransferOpts = {}): FixtureRule[] {
  const world = o.world ?? {};
  const now = o.now ?? (() => Date.now());
  const ttl = o.ttlMs ?? 600_000;
  const plans = new Map<string, Plan>();
  let n = 0;
  let applied = false;
  let sends = 0;
  const at = (id: string): CopyComputer => (world[id] ??= { files: {} });
  const agentOf = (r: FixtureRequest) => r.target?.container.id ?? '';
  const realmOf = (r: FixtureRequest) => String(rec(r.query).realm ?? '');
  const fromOf = (r: FixtureRequest, b: Record<string, unknown>): string | null => {
    const s = rec(b.source);
    if (s.kind === undefined || s.kind === 'host') return agentOf(r);
    return s.kind === 'computer' && typeof s.computer === 'string' && s.computer ? s.computer : null;
  };
  const loginState = (c: CopyComputer) => (c.login === 'unknown' ? 'unknown' : c.login === undefined ? 'absent' : 'present');
  const filesOf = (c: CopyComputer, mode: string, path: string): Array<[string, string]> | null => {
    if (path === CRED || path.endsWith('.credentials.json')) return null;
    if (mode === 'file') return c.files[path] !== undefined ? [[path, c.files[path] as string]] : [];
    const pre = path.endsWith('/') ? path : `${path}/`;
    return Object.keys(c.files)
      .filter((p) => p.startsWith(pre) && !p.endsWith('.credentials.json') && (pre !== CLAUDE_DIR || CONFIG.includes(p.slice(pre.length)) || /^(agents|commands|skills|output-styles|hooks)\//.test(p.slice(pre.length))))
      .sort()
      .map((p) => [p, c.files[p] as string]);
  };
  const stateOf = (c: CopyComputer, p: string) => (c.files[p] !== undefined ? 'present' : 'absent');
  const issue = (p: Omit<Plan, 'exp' | 'used'>) => {
    const token = `tok-${++n}`;
    const exp = now() + ttl;
    plans.set(token, { ...p, exp, used: false });
    return { token, exp };
  };
  const take = (r: FixtureRequest, op: Plan['op'], token: unknown): Plan | FixtureAnswer => {
    const p = typeof token === 'string' ? plans.get(token) : undefined;
    if (!p || p.used || p.op !== op || p.agent !== agentOf(r) || p.realm !== realmOf(r)) return refuse(409, 'preview_stale', { reason: 'unknown' });
    p.used = true;
    if (now() >= p.exp) return refuse(409, 'preview_stale', { reason: 'expired' });
    return p;
  };
  const planCheck = (r: FixtureRequest, b: Record<string, unknown>): { from: string; to: string } | FixtureAnswer => {
    const to = typeof b.target_computer === 'string' ? b.target_computer.trim() : '';
    if (!to) return refuse(400, 'bad_request', { field: 'target_computer' });
    if (to === agentOf(r)) return refuse(400, 'bad_request', { reason: 'not_remote' });
    const from = fromOf(r, b);
    if (from === null) return refuse(400, 'bad_request', { reason: 'bad_source' });
    return { from, to };
  };
  /** A preview: read now (o.onSend first), answered at once, or after previewHold when an apply was sent before it. */
  const held = async (r: FixtureRequest, read: () => FixtureAnswer): Promise<FixtureAnswer> => {
    o.onSend?.(r);
    const hold = o.previewHold && applied ? (typeof o.previewHold === 'function' ? o.previewHold() : o.previewHold) : null;
    const a = read();
    if (hold) await hold;
    return a;
  };
  return [
    reply(transferRoutes.loginPreview, async (r) => held(r, () => {
      if (o.previewAfter && applied) return o.previewAfter;
      const b = rec(r.body);
      const c = planCheck(r, b);
      if (isAnswer(c)) return c;
      const src = at(c.from).login;
      if (src === undefined || src === 'unknown') return refuse(422, 'source_unusable', { reason: 'source_empty' });
      const tgt = at(c.to);
      const { token, exp } = issue({ op: 'login', agent: agentOf(r), realm: realmOf(r), from: c.from, to: c.to, snap: `${src}|${loginState(tgt)}` });
      return answers.ok({ preview_token: token, expires_ms: exp, target_path: '/home/user/.claude/.credentials.json', target_state: loginState(tgt), bytes: src.length, preview: '{ "claudeAiOauth": { "accessToken": "•••", "refreshToken": "•••" } } #a1b2' });
    })),
    reply(transferRoutes.loginApply, async (r) => {
      o.onSend?.(r);
      applied = true;
      const gate = o.gates?.[sends++] ?? o.gate;
      if (gate) await gate;
      const b = rec(r.body);
      o.beforeApply?.(world);
      const p = take(r, 'login', b.preview_token);
      if (isAnswer(p)) return p;
      const src = at(p.from).login;
      const tgt = at(p.to);
      const prior = loginState(tgt);
      if (`${src}|${prior}` !== p.snap) return refuse(409, 'preview_stale', { reason: 'changed' });
      if (prior !== 'absent' && b.overwrite !== true) return refuse(409, 'target_exists', { target_state: prior });
      if (o.apply === 'unknown') return refuse(503, 'outcome_unknown', { reason: 'target_rename_outcome_unknown' });
      tgt.login = src as string;
      if (o.apply === 'lost') return answers.lost();
      if (o.apply === 'gateway') return answers.pending5xx();
      if (o.apply === 'malformed') return answers.ok(o.applyBody);
      return answers.ok({ imported: true, overwrote: prior === 'present', prior_state: prior, owner_only: true });
    }),
    reply(transferRoutes.filesPreview, async (r) => held(r, () => {
      if (o.previewAfter && applied) return o.previewAfter;
      const b = rec(r.body);
      const c = planCheck(r, b);
      if (isAnswer(c)) return c;
      const mode = b.mode;
      const path = typeof b.path === 'string' ? b.path : '';
      if (mode !== 'file' && mode !== 'dir') return refuse(400, 'bad_request', { reason: 'bad_mode' });
      if (path.startsWith('/') || path.split('/').includes('..')) return refuse(400, 'bad_request', { reason: 'path_unsafe' });
      const list = filesOf(at(c.from), mode, path);
      if (list === null) return refuse(422, 'source_unusable', { reason: 'credential_requires_import' });
      if (list.length === 0) return refuse(422, 'source_unusable', { reason: 'source_empty' });
      const tgt = at(c.to);
      const files = list.map(([p, v]) => ({ path: p, size: v.length, target_state: stateOf(tgt, p) }));
      const snap = JSON.stringify({ list, t: files.map((f) => f.target_state), mode, path });
      const { token, exp } = issue({ op: 'files', agent: agentOf(r), realm: realmOf(r), from: c.from, to: c.to, snap });
      return answers.ok({ preview_token: token, expires_ms: exp, mode, file_count: files.length, total_bytes: files.reduce((a, f) => a + f.size, 0), files });
    })),
    reply(transferRoutes.filesApply, async (r) => {
      o.onSend?.(r);
      applied = true;
      const gate = o.gates?.[sends++] ?? o.gate;
      if (gate) await gate;
      const b = rec(r.body);
      o.beforeApply?.(world);
      const p = take(r, 'files', b.preview_token);
      if (isAnswer(p)) return p;
      const plan = JSON.parse(p.snap) as { list: Array<[string, string]>; t: string[]; mode: string; path: string };
      const list = filesOf(at(p.from), plan.mode, plan.path) ?? [];
      const tgt = at(p.to);
      const t = list.map(([q]) => stateOf(tgt, q));
      if (JSON.stringify({ list, t, mode: plan.mode, path: plan.path }) !== p.snap) return refuse(409, 'preview_stale', { reason: 'changed' });
      const over = Array.isArray(b.overwrite) ? b.overwrite.map(String) : [];
      const replaceable = new Set(list.filter(([q]) => stateOf(tgt, q) !== 'absent').map(([q]) => q));
      if (over.some((q) => !replaceable.has(q))) return refuse(400, 'bad_request', { reason: 'overwrite_not_planned' });
      if (o.apply === 'unknown') return refuse(503, 'outcome_unknown', { reason: 'target_rename_outcome_unknown' });
      const written: string[] = [];
      const skipped: string[] = [];
      let bytes = 0;
      for (const [q, v] of list) {
        if (replaceable.has(q) && !over.includes(q)) { skipped.push(q); continue; }
        tgt.files[q] = v;
        written.push(q);
        bytes += v.length;
      }
      if (o.apply === 'lost') return answers.lost();
      if (o.apply === 'gateway') return answers.pending5xx();
      if (o.apply === 'malformed') return answers.ok(o.applyBody);
      return answers.ok({ files_written: written.length, bytes, written, skipped });
    }),
  ];
}
