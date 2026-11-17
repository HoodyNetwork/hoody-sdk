// The requests of the workflow source editor, declared once with core's
// defineRoute and sent through core's api(), settled (never rejects): an answer is {ok, body} or {ok:false, err} with a C9
// outcome. Every call names the realm the workflow was listed in (else the realm shown).
//   - getWorkflow ?include_revision=true is a gated tool run: a 200 envelope whose output starts `revision: <opaque>`.
//   - putWorkflow carries its compare-and-swap in the body (`expected_revision`); core refuses to send it without one.
//     The agent answers a tool envelope: a 200 is_error with code revision_conflict is its refusal before anything was
//     written (notApplied, a conflict, never success); daemon_paused and invalid_definition (the definition failed the
//     agent's validation) likewise. A refusal keeps the agent's diagnostic (`reason`, diagnosticOf:
//     the envelope's output without the recovery hints the agent writes for a model, cleaned to one line of at most
//     REASON_MAX characters), so the editor can say what to fix. Any other is_error answer may have run in part, so it settles as unknown ('pending') and the editor
//     reads the workflow back before saying either way.
//   - deleteWorkflow (no body, no revision) runs a gated tool too: yours are deleted, a customized shipped workflow goes
//     back to the shipped version (Reset to shipped), a plain shipped one is refused (hide it instead).
//   - hideWorkflow {hidden} is a plain request (not gated) that sets the realm's hidden flag; sending the same value
//     twice changes nothing.
//   - createWorkflow is the same PUT carrying `expected_absent: true` instead of a revision: the agent writes
//     only when no workflow of that name exists, else it refuses with already_exists before writing.
//     Its body is exactly {definition, expected_absent: true}: the route's guard (createOnly) refuses anything else unsent,
//     because the agent reads a missing or false expected_absent as an unconditional write, which would replace a workflow
//     of the same name. reserved_name (exactly "runs", a 400 from the gateway), daemon_paused and invalid_definition are
//     refusals before writing too.
//   - A change is sent once. A lost answer is 'pending', never 'failed'.
//   - Every call of one editor carries the context captured when it was made (account, realm generation, computer),
//     so a save's follow-up read goes to the computer the save went to, whichever computer is shown by then; once
//     that context is no longer alive (a realm switch, sign-out) core sends nothing ('stale').
import { api, defineRoute, errorInfo, outcomeOf, type CallInput, type Ctx, type Route } from '@core';
import { workflowRoutes } from './data';

export const sourceRoutes = {
  get: defineRoute({
    method: 'GET', path: '/workflows/:name', scope: 'agent', realm: 'realm', query: ['include_revision'],
    envelope: true, refuses: ['daemon_paused'], timeoutMs: 20000,
  }),
  put: defineRoute<unknown, { definition: Record<string, unknown>; expected_revision: string }>({
    method: 'PUT', path: '/workflows/:name', scope: 'agent', realm: 'realm', body: ['definition', 'expected_revision'],
    cas: { via: 'body', keys: ['expected_revision'] }, envelope: true, refuses: ['revision_conflict', 'daemon_paused', 'invalid_definition'],
  }),
  remove: defineRoute({ method: 'DELETE', path: '/workflows/:name', scope: 'agent', realm: 'realm', envelope: true, refuses: ['daemon_paused'] }),
  hide: defineRoute<unknown, { hidden: boolean }>({ method: 'POST', path: '/workflows/:name/hide', scope: 'agent', realm: 'realm', body: ['hidden'] }),
  create: defineRoute<unknown, { definition: Record<string, unknown>; expected_absent: true }>({
    method: 'PUT', path: '/workflows/:name', scope: 'agent', realm: 'realm', body: ['definition', 'expected_absent'],
    guard: (r) => createOnly(r.body), envelope: true, refuses: ['already_exists', 'reserved_name', 'daemon_paused', 'invalid_definition'],
  }),
} as const;

/** A create's body, and only that: {definition: an object, expected_absent: true}, no other key. A body without
 *  expected_absent, or with it false, would be an unconditional write; one with expected_revision is a save. */
export function createOnly(body: unknown): boolean {
  if (!obj(body)) return false;
  const keys = Object.keys(body);
  return keys.length === 2 && Object.hasOwn(body, 'definition') && Object.hasOwn(body, 'expected_absent')
    && body.expected_absent === true && obj(body.definition);
}

/** What a failed call settled to. */
export interface Refusal {
  kind: 'pending' | 'failed' | 'not_sent' | 'stale';
  code: string;
  status: number;
  /** The agent refused before changing anything (a listed refusal: revision_conflict, daemon_paused, invalid_definition). */
  notApplied: boolean;
  /** Such a refusal's own words (the envelope's output), cleaned and bounded; absent on anything else. */
  reason?: string;
}
export type Settled = { ok: true; body: unknown } | { ok: false; err: Refusal };

export interface WorkflowSourceApi {
  get(): Promise<Settled>;
  put(definition: Record<string, unknown>, expectedRevision: string): Promise<Settled>;
  remove(): Promise<Settled>;
  hide(hidden: boolean): Promise<Settled>;
  /** The realm's workflow list (a reset's read-back). */
  list(): Promise<Settled>;
}

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The longest refusal reason kept (characters). */
export const REASON_MAX = 2000;

/** Agent text made safe to show as one line: escape sequences (CSI, OSC, any other ESC pair), C0 and C1 controls and
 *  bidi controls removed, line breaks (U+2028/U+2029 included) and tabs as spaces, trimmed, bounded to REASON_MAX with
 *  an ellipsis. */
export function cleanReason(text: string): string {
  const s = text
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|\u001b[\s\S]?/g, '')
    .replace(/[\t\n\r\v\f\u2028\u2029]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .trim();
  return s.length > REASON_MAX ? `${s.slice(0, REASON_MAX - 1)}…` : s;
}

// The agent's refusal text is written for a model: after the diagnostic come a
// "Tip:" or "Expected:" line and, for an empty steps list, a worked "definition =" example after a sentence telling the
// model to call upsert_workflow again. A person sees the diagnostic only: the agent's own words about what is wrong are
// kept whole, quoted values included (a step id may hold any punctuation or a tool's name); only the daemon's known
// model-directed texts are removed.
const HINT_LINE = /^\s*(?:Tip:|Expected:|definition\s*=)/;
const LEAD_IN = /^\s*(?:Validation failed \(not saved\):|Error:)\s*/;
// The daemon's model-directed sentences inside a diagnostic line, each exactly as it writes them
// (the empty-steps hint). An unknown one stays shown: better than cutting the diagnostic.
const MODEL_TEXT = [/\s*Fill in the steps you want and call upsert_workflow again — for example:\s*$/];

/** The diagnostic of an agent refusal: the lines before its first hint line, without the "Validation failed (not
 *  saved):" / "Error:" lead-in and the daemon's known model-directed sentences, joined with "; ", then cleanReason.
 *  '' when none is left. */
export function diagnosticOf(text: string): string {
  const lines: string[] = [];
  for (const raw of text.split(/\r\n|[\n\r\u2028\u2029]/)) {
    if (HINT_LINE.test(raw)) break;
    const line = MODEL_TEXT.reduce((l, re) => l.replace(re, ''), raw.replace(LEAD_IN, '')).trim();
    if (line) lines.push(line);
  }
  return cleanReason(lines.join('; '));
}

/** A thrown call as a Refusal: only a code core knows or the route declares is kept (errorInfo's allowlist). */
export function refusalOf(e: unknown, change: boolean): Refusal {
  const x = obj(e) ? e : {};
  const notApplied = x.notApplied === true;
  const out = notApplied && obj(x.data) && typeof x.data.output === 'string' ? diagnosticOf(x.data.output) : '';
  return {
    kind: outcomeOf(e, change),
    code: (errorInfo(e).code ?? '').toLowerCase(),
    status: typeof x.status === 'number' ? x.status : 0,
    notApplied,
    ...(out ? { reason: out } : {}),
  };
}

async function call(route: Route, input: CallInput, change: boolean): Promise<Settled> {
  try {
    return { ok: true, body: (await api(route, input)) ?? {} };
  } catch (e) {
    return { ok: false, err: refusalOf(e, change) };
  }
}

/** The calls for one workflow `name` on `ctx`'s computer (default: each call's own context), in `realm` (null: the
 *  realm shown). */
export function workflowSourceApi(name: string, realm: string | null, ctx?: Ctx): WorkflowSourceApi {
  const at = (input: CallInput): CallInput => ({ ...input, ...(realm ? { realm } : {}), ...(ctx ? { ctx } : {}) });
  const on = (input: CallInput): CallInput => at({ ...input, params: { name } });
  return {
    get: () => call(sourceRoutes.get as Route, on({ query: { include_revision: 'true' } } as CallInput), false),
    put: (definition, expected_revision) => call(sourceRoutes.put as Route, on({ body: { definition, expected_revision } } as CallInput), true),
    remove: () => call(sourceRoutes.remove as Route, on({}), true),
    hide: (hidden) => call(sourceRoutes.hide as Route, on({ body: { hidden } } as CallInput), true),
    list: () => call(workflowRoutes.list as Route, at({ query: { limit: 0 } } as CallInput), false),
  };
}

export interface WorkflowCreateApi {
  /** Creates the workflow only if none of its name exists. Sent once. */
  create(definition: Record<string, unknown>): Promise<Settled>;
  /** The workflow with its revision (a lost create's Check again). */
  get(): Promise<Settled>;
}

/** The calls that create workflow `name` on `ctx`'s computer (default: each call's own context), in `realm` (null: the
 *  realm shown). */
export function workflowCreateApi(name: string, realm: string | null, ctx?: Ctx): WorkflowCreateApi {
  const on = (input: CallInput): CallInput => ({ ...input, params: { name }, ...(realm ? { realm } : {}), ...(ctx ? { ctx } : {}) });
  return {
    create: (definition) => call(sourceRoutes.create as Route, on({ body: { definition, expected_absent: true } } as CallInput), true),
    get: () => call(sourceRoutes.get as Route, on({ query: { include_revision: 'true' } } as CallInput), false),
  };
}
