// Vitest: every field the agent publishes on the list row and the stop answer has a parser
// check. The field names and types are read from the agent's own Go source (its bash-job routes: the list row's properties and the
// stop response's Properties), not copied here, so a field the agent adds later fails this file until the parser checks it. Each
// field, set to a value of the wrong type on an otherwise valid payload, must make the parser answer unknown, and so must each
// field left out when the agent marks it required. A missing source is a failure, not a skip.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import { parseJobList, parseJobStopReply } from './jobStop';

// Outside the monorepo there is no agent source to read: both groups are skipped. Inside it a missing file fails.
const AGENT = monorepoPath(process.env.HUB_AGENT_SRC, 'hoody-kit', 'hoody-agent');
const SRC = AGENT === null ? '' : readFileSync(`${AGENT}/internal/httpapi/routes_sessions_bash_jobs.go`, 'utf8');

/** {Name: "x", Type: "t"} entries of a Go []BodyProp literal, in order. */
function props(snippet: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of snippet.matchAll(/\{Name: "([a-z_]+)", Type: "([a-z]+)"/g)) out.set(m[1]!, m[2]!);
  if (out.size === 0) throw new Error('no BodyProp entries found');
  return out;
}
/** A string slice literal's items. */
const strs = (snippet: string): string[] => [...snippet.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!);
function between(from: string, to: string, at = 0): string {
  const a = SRC.indexOf(from, at);
  if (a < 0) throw new Error(`${from} not found`);
  const b = SRC.indexOf(to, a + from.length);
  if (b < 0) throw new Error(`${to} not found after ${from}`);
  return SRC.slice(a, b);
}

const WRONG: Record<string, unknown> = { string: 7, integer: 'x', boolean: 'x' };
const wrong = (t: string): unknown => {
  if (!(t in WRONG)) throw new Error(`no wrong-type value for type ${t}: teach the parser and this table the new type`);
  return WRONG[t];
};

describe.skipIf(AGENT === null)('totality: every published field has a parser check', () => {
  it('list row (bashJobRowProps, bashJobRowRequired)', () => {
    const fields = props(between('var bashJobRowProps', '\n}'));
    const required = strs(between('var bashJobRowRequired', '}'));
    const row: Record<string, unknown> = { job_id: 'j', command: 'c', started_ms: 1, state: 'running', last_line: '', remote: false };
    expect([...fields.keys()].sort()).toEqual(Object.keys(row).sort());
    expect(parseJobList({ items: [row] })).not.toBe('unknown');
    for (const [f, t] of fields) expect(parseJobList({ items: [{ ...row, [f]: wrong(t) }] }), f).toBe('unknown');
    for (const f of required) {
      const r = { ...row };
      delete r[f];
      expect(parseJobList({ items: [r] }), `without ${f}`).toBe('unknown');
    }
  });

  it('stop answer (stopSessionBashJob 200 Properties, Required)', () => {
    const op = SRC.indexOf('OperationID: "stopSessionBashJob"');
    expect(op).toBeGreaterThan(0);
    const fields = props(between('Properties: []BodyProp{', '\n\t\t\t},', op));
    const required = strs(between('Required: []string{', '}', op));
    // Every field the answer can carry at once: an unknown outcome on the container, answered again under its key.
    const body: Record<string, unknown> = { job_id: 'j', outcome: 'unknown', reason: 'unconfirmed', already_ended: false, remote: true, duplicate: true };
    expect([...fields.keys()].sort()).toEqual(Object.keys(body).sort());
    const reply = (b: Record<string, unknown>) => ({ ok: true, status: 200, body: b });
    expect(parseJobStopReply({ jobId: 'j' }, reply(body)).kind).toBe('answer');
    for (const [f, t] of fields) expect(parseJobStopReply({ jobId: 'j' }, reply({ ...body, [f]: wrong(t) })), f).toEqual({ kind: 'unknown' });
    for (const f of required) {
      const b = { ...body };
      delete b[f];
      expect(parseJobStopReply({ jobId: 'j' }, reply(b)), `without ${f}`).toEqual({ kind: 'unknown' });
    }
  });

  it('the published enums are the parser\'s', () => {
    const op = SRC.indexOf('OperationID: "stopSessionBashJob"');
    expect(strs(between('Enum: []string{', '}', SRC.indexOf('{Name: "outcome"', op)))).toEqual(['stopped', 'failed', 'unknown']);
    expect(strs(between('Enum: []string{', '}', SRC.indexOf('{Name: "reason"', op)))).toEqual(['still_running', 'unsafe_record', 'unconfirmed', 'end_not_seen']);
    expect(strs(between('Enum: []string{', '}', SRC.indexOf('{Name: "state"')))).toEqual(['running', 'ended', 'unknown']);
  });
});

// Contract fixture, not the guard: the guard is the parser, which proves nothing from a success status other than 200 (core's
// readsStatus hands the status over). This pins the agent's side of the contract from its Go source: every success its stop
// handler writes is 200, and its published success is 200 alone, so a change there is seen here first.
describe.skipIf(AGENT === null)('the stop answers success with 200 only', () => {
  it('handleStopSessionBashJob writes no success status other than http.StatusOK', () => {
    const body = between('func (g *Gateway) handleStopSessionBashJob(', '\nfunc ');
    const writes = [...body.matchAll(/writeJSON\(w, (http\.Status[A-Za-z]+)/g)].map((m) => m[1]);
    expect(writes.length).toBeGreaterThan(0);
    expect(new Set(writes)).toEqual(new Set(['http.StatusOK']));
    expect(body).not.toMatch(/WriteHeader\(|http\.Status(Accepted|Created|NoContent|NonAuthoritativeInfo|PartialContent)/);
  });
  it('the published stop operation declares 200 as its only success', () => {
    const op = SRC.indexOf('What the stop established.');
    expect(op).toBeGreaterThan(0);
    const decl = SRC.slice(SRC.lastIndexOf('Responses:', op), op);
    expect(decl).toContain('{Status: http.StatusOK,');
    expect(SRC).not.toMatch(/Status: http\.Status(Accepted|Created|NoContent)/);
  });
});
