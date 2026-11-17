// Vitest: every field the agent can put on the wire shapes decisionEvidence parses has a
// parser check. The field lists are read from the agent's own Go source, not copied here, so a field the agent adds later
// fails this file until the parser checks it. "Checked" is proved, not listed: each field, set to a value of the wrong type
// on an otherwise valid payload that carries it, must make the parser answer unknown. A missing source is a failure, not a skip.
//   - the protocol types: the event.gate_resolved frame and the gate decision (struct json tags and Go types);
//   - the confirm record's details (409 gate_already_resolved details);
//   - the 409 gate_cancelled details map.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import { parseConfirmReply, parseDecision, parseGateResolved } from './decisionEvidence';

const AGENT = monorepoPath(process.env.HUB_AGENT_SRC, 'hoody-kit', 'hoody-agent');
const read = (rel: string): string => readFileSync(`${AGENT}/${rel}`, 'utf8');

/** The json fields of a Go struct, with their Go types. */
function goFields(src: string, name: string): Map<string, string> {
  const start = src.indexOf(`type ${name} struct {`);
  if (start < 0) throw new Error(`struct ${name} not found`);
  const body = src.slice(start, src.indexOf('\n}', start));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/^\s*\w+\s+(\*?[\w.]+)\s+`json:"([a-z_]+)[,"]/gm)) out.set(m[2]!, m[1]!);
  if (out.size === 0) throw new Error(`no json fields in ${name}`);
  return out;
}

/** The string keys a Go snippet writes into a map[string]any (literal keys and out["k"] assignments). */
function mapKeys(snippet: string): Set<string> {
  const keys = new Set<string>();
  for (const m of snippet.matchAll(/"([a-z_]+)":\s/g)) keys.add(m[1]!);
  for (const m of snippet.matchAll(/out\["([a-z_]+)"\]/g)) keys.add(m[1]!);
  return keys;
}

/** A value of the wrong type for a wire type. */
const WRONG: Record<string, unknown> = { string: 7, int: 'x', int64: 'x', bool: 'x', '*bool': 'x', object: 'x', '*GateDecision': 'x', true: 'x' };
const wrong = (t: string): unknown => {
  if (!(t in WRONG)) throw new Error(`no wrong-type value for Go type ${t}: teach the parser and this table the new type`);
  return WRONG[t];
};

const ours = { gate: { id: 'i7:3', generation: 2 }, requestId: 'hub-r-1' };
const decisionAll = { approved: true, persist_dirs: false, session_scope: true, trust_computer: false, remember: true, superseded: false };

// Outside the monorepo there is no agent source to read: skipped. Inside it a missing file fails.
describe.skipIf(AGENT === null)('totality: every agent wire field has a parser check', () => {
  it('GateDecision (the wire type)', () => {
    const fields = goFields(read('internal/protocol/types.go'), 'GateDecision');
    expect([...fields.keys()].sort()).toEqual(Object.keys(decisionAll).sort());
    expect(parseDecision(decisionAll)).not.toBe('unknown');
    for (const [f, t] of fields) expect(parseDecision({ ...decisionAll, [f]: wrong(t) }), f).toBe('unknown');
  });

  it('EventGateResolved (the wire type)', () => {
    const fields = goFields(read('internal/protocol/types.go'), 'EventGateResolved');
    // Every field the confirm frame can carry, at once: the agent's answered, scope-limited resolution of a helper's gate.
    const frame: Record<string, unknown> = {
      kind: 'confirm', gate_id: 3, outcome: 'answered', provenance: 'decision', holder: 'h', generation: 1, request_id: 'gw-1',
      helper_id: 'h1', parent_tool_call_id: 'tu1', task_id: 'h1', decision: decisionAll, session_scope_applied: false,
      note: 'decision applied once; session_scope allow is frozen by the locked approval policy',
    };
    const OTHER_KIND = ['question_id']; // a confirm frame must not carry it: present at all is refused
    for (const f of fields.keys()) expect(f in frame || OTHER_KIND.includes(f), `field ${f} is not in the base frame`).toBe(true);
    const target = { kind: 'confirm', gateId: 3 } as const;
    expect(parseGateResolved(target, frame)).not.toBe('unknown');
    for (const [f, t] of fields) expect(parseGateResolved(target, { ...frame, [f]: wrong(t) }), f).toBe('unknown');
  });

  it('409 gate_already_resolved details (the confirm record)', () => {
    const src = read('internal/httpapi/session_confirm.go');
    const start = src.indexOf('func (rec *confirmRecord) details()');
    expect(start, 'confirmRecord.details not found').toBeGreaterThan(-1);
    const keys = mapKeys(src.slice(start, src.indexOf('\n}', start)));
    const TYPES: Record<string, string> = { gate_id: 'string', generation: 'int', outcome: 'string', decision: 'object', decision_unknown: 'true', request_id: 'string' };
    for (const k of keys) expect(k in TYPES, `record field ${k} has no type here (and no parser check)`).toBe(true);
    const answered = { gate_id: 'i7:3', generation: 2, outcome: 'answered', decision: decisionAll, request_id: 'hub-r-1' };
    const lost = { gate_id: 'i7:3', generation: 2, outcome: 'cancelled', decision_unknown: true };
    const reply = (details: unknown) => parseConfirmReply(ours, { ok: false, status: 409, code: 'gate_already_resolved', details });
    expect(reply(answered).kind).toBe('record');
    expect(reply(lost).kind).toBe('record');
    for (const k of keys) {
      const base: Record<string, unknown> = k in answered ? answered : lost;
      expect(k in base, `field ${k} is in no base record`).toBe(true);
      expect(reply({ ...base, [k]: wrong(TYPES[k]!) }), k).toEqual({ kind: 'unknown' });
    }
  });

  it('409 gate_cancelled details', () => {
    const line = read('internal/httpapi/session_handlers.go').split('\n').find((l) => l.includes('"gate_cancelled"') && l.includes('writeError'));
    expect(line, 'the gate_cancelled refusal not found').toBeTruthy();
    const keys = mapKeys(line!);
    const TYPES: Record<string, string> = { gate_id: 'string', generation: 'int', outcome: 'string', provenance: 'string' };
    expect([...keys].sort()).toEqual(Object.keys(TYPES).sort());
    const base = { gate_id: 'i7:3', generation: 2, outcome: 'cancelled', provenance: 'cancelled' };
    const reply = (details: unknown) => parseConfirmReply(ours, { ok: false, status: 409, code: 'gate_cancelled', details });
    expect(reply(base).kind).toBe('cancelled');
    for (const k of keys) expect(reply({ ...base, [k]: wrong(TYPES[k]!) }), k).toEqual({ kind: 'unknown' });
  });
});
