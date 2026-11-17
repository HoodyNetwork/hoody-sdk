// The instructions requests sent through core's api(), settled (never rejects): an answer is {ok, body} or {ok:false, err} with a
// C9 outcome (the agents/sourceApi.ts pattern).
//   - put carries its compare-and-swap in the body (expected_revision, the read's revision); core refuses to send it without one.
//   - 409 revision_conflict and 409 instructions_overridden are the agent's refusals before anything was written (`notApplied`),
//     with details.current_revision / details.fields.
//   - A change is sent once. A lost answer is 'pending', never 'failed'.
import { api, errorInfo, isRecord, outcomeOf, type CallInput, type Route, type Target } from '@core';
import { overriddenFields, type InstructionsDraft } from './logic';
import { instructionsRoutes } from './routes';

/** What a failed call settled to. */
export interface Refusal {
  kind: 'pending' | 'failed' | 'not_sent' | 'stale';
  /** A code core knows or the route declares, lower case; '' when there is none (a bare 404 of an unknown path). */
  code: string;
  status: number;
  /** The agent refused before changing anything (a listed refusal). */
  notApplied: boolean;
  /** A revision_conflict's details.current_revision. */
  currentRevision: string | null;
  /** An instructions_overridden's details.fields. */
  fields: ('text' | 'enabled')[] | null;
}
export type Settled = { ok: true; body: unknown } | { ok: false; err: Refusal };

export interface InstructionsApi {
  get(): Promise<Settled>;
  put(d: InstructionsDraft, expectedRevision: string): Promise<Settled>;
}

function refusal(e: unknown, change: boolean): Refusal {
  const x = isRecord(e) ? e : {};
  const d = isRecord(x.details) ? x.details : {};
  const rev = d.current_revision;
  const code = (errorInfo(e).code ?? '').toLowerCase();
  return {
    kind: outcomeOf(e, change),
    // Only a code core knows or the route declares is kept (errorInfo's allowlist): nothing else the server wrote reaches a sentence.
    code,
    status: typeof x.status === 'number' ? x.status : 0,
    notApplied: x.notApplied === true,
    currentRevision: code === 'revision_conflict' && typeof rev === 'string' && rev.length > 0 && rev.length <= 256 ? rev : null,
    fields: code === 'instructions_overridden' ? overriddenFields(d) : null,
  };
}

async function call(route: Route, input: CallInput, change: boolean): Promise<Settled> {
  try {
    return { ok: true, body: (await api(route, input)) ?? {} };
  } catch (e) {
    return { ok: false, err: refusal(e, change) };
  }
}

/** The calls for one computer and realm: both are always named, so a read or write never follows the top bar mid-flight. */
export function instructionsApi(target: Target, realm: string): InstructionsApi {
  const on = (input: CallInput): CallInput => ({ ...input, target, realm });
  return {
    get: () => call(instructionsRoutes.get as Route, on({}), false),
    put: (d, expected_revision) => call(instructionsRoutes.put as Route, on({ body: { text: d.text, enabled: d.enabled, expected_revision } } as CallInput), true),
  };
}
