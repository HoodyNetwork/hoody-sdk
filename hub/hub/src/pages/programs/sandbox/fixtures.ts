// Fake daemon answers for the sandbox routes: per-program status, /health, the program read and the edit. A world
// is made fresh per call; an edit that the world accepts changes its stored block, so the status reads after it
// follow (as the daemon's do). The programs page spreads `sandboxRules` into its states.
import { answers, reply, type FixtureRequest, type FixtureRule } from '@core';
import { fingerprint, owesInbound, readBlock, restricts, type SandboxBlock } from './block';
import { sandboxRoutes as routes } from './routes';
import { hostSamples, programSamples, statusSamples } from './samples';

type Answer = ReturnType<typeof answers.ok> | ReturnType<typeof answers.refused> | { status: number; body: unknown };
export type Status = (typeof statusSamples)[keyof typeof statusSamples] | Record<string, unknown>;

export interface SandboxWorld {
  /** Status answer bodies by program id; an id missing here has no block. */
  status?: Record<string, Status>;
  /** /health `sandbox` object (undefined: the host's parts are not reported). */
  host?: unknown;
  /** Program answer bodies by id; an id missing here reads as programSamples.plain with that id. */
  program?: Record<string, unknown>;
  /** The edit's answer; default: accepted (the stored block becomes the sent one). */
  edit?: (req: FixtureRequest, id: string) => Answer | Promise<Answer>;
  /** While true, every status read fails (502): a refresh over an earlier answer. */
  failStatus?: boolean;
  /** Called on every status read (tests take the request's computer from it). */
  onStatus?: (req: FixtureRequest) => void;
  /** Every edit body the world received, in order (tests read it). */
  sent?: { id: string; body: unknown }[];
  /** New program's answer; default: added as id 21 (the answer echoes a secret-looking environment the page must
   *  drop). */
  add?: (req: FixtureRequest) => Answer | Promise<Answer>;
  /** Run once's answer; default: started as quick_1791370000000_0. */
  quickStart?: (req: FixtureRequest) => Answer | Promise<Answer>;
  /** Every add and run-once body the world received, in order. */
  adds?: { route: 'add' | 'quickStart'; body: unknown }[];
}

const idOf = (req: FixtureRequest) => /\/programs\/(?:edit\/)?([^/?]+)(?:\/sandbox)?(?:\?.*)?$/.exec(req.path)?.[1] ?? '';

/** The status the daemon gives for a stored block (no live problem): what an accepted edit leaves. */
export function statusFor(block: SandboxBlock | null): Status {
  if (!block) return statusSamples.none;
  if (!restricts(block)) return { ...statusSamples.inactive, configured: block };
  const rev = fingerprint(block).slice(0, 12);
  const inbound = owesInbound(block);
  return {
    success: true,
    configured: block,
    rev,
    effective: statusSamples.set.effective,
    live: inbound ? { table_present: true, chain: `hd_7_${rev}`, rules: statusSamples.set.live.rules } : { table_present: false, chain: null, rules: [] },
    firewall: inbound ? 'ok' : 'none',
    problems: [],
  };
}

type Wrapped = { program: Record<string, unknown> } & Record<string, unknown>;
const wrapped = (v: unknown): v is Wrapped => typeof v === 'object' && v !== null && typeof (v as { program?: unknown }).program === 'object' && (v as { program?: unknown }).program !== null;

/** The world's program answer for `id`: its own, else programSamples.plain under that id. A wrapped program always
 *  has a command (the daemon stores one for every program). */
function programOf(w: SandboxWorld, id: string): unknown {
  const got: unknown = w.program?.[id] ?? { ...programSamples.plain, program: { ...programSamples.plain.program, id: Number(id) || id } };
  return wrapped(got) ? { ...got, program: { command: 'node server.js', ...got.program } } : got;
}

export function sandboxRulesFor(w: SandboxWorld = {}): FixtureRule[] {
  // The world's own map: an accepted edit writes it, and a test may rewrite it between reads.
  const status: Record<string, Status> = (w.status ??= {});
  return [
    reply(routes.status, (req) => {
      w.onStatus?.(req);
      if (w.failStatus) return { status: 502, body: { error: 'BAD_GATEWAY' } };
      return answers.ok(status[idOf(req)] ?? statusSamples.none);
    }),
    reply(routes.health, () => answers.ok({ status: 'ok', ...(w.host !== undefined ? { sandbox: w.host } : {}) })),
    // A fresh copy per read: the page's scrub empties the answer in place.
    reply(routes.program, (req) => {
      const id = idOf(req);
      return answers.ok(structuredClone(programOf(w, id)));
    }),
    reply(routes.edit, async (req) => {
      const id = idOf(req);
      const body = req.body as { sandbox?: unknown; name?: unknown; command?: unknown } | null;
      w.sent?.push({ id, body });
      if (w.edit) return w.edit(req, id);
      // Edit's send (name, command; no `sandbox` key): stored, so the program read after it shows them. The block
      // is left as it is.
      if (!body || !('sandbox' in body)) {
        const cur = programOf(w, id);
        const next: Record<string, unknown> = { ...(wrapped(cur) ? cur.program : {}), ...(typeof body?.name === 'string' ? { name: body.name } : {}), ...(typeof body?.command === 'string' ? { command: body.command } : {}) };
        (w.program ??= {})[id] = { ...(wrapped(cur) ? cur : { success: true }), program: next };
        return answers.ok({ success: true, program: { id: Number(id) || id, name: next.name, environment: { SECRET_LOOKING: 'never-shown' } } });
      }
      const block = readBlock(body?.sandbox ?? null);
      if (block === undefined) return answers.refused(400, 'sandbox: malformed');
      status[id] = statusFor(block && restricts(block) ? block : null);
      return answers.ok({ success: true, program: { id: Number(id) || id, name: 'web', environment: { SECRET_LOOKING: 'never-shown' } } });
    }),
    reply(routes.add, async (req) => {
      const body = req.body as { name?: unknown; command?: unknown } | null;
      w.adds?.push({ route: 'add', body });
      if (w.add) return w.add(req);
      return answers.ok({ success: true, program: { id: 21, name: body?.name, command: body?.command, environment: { SECRET_LOOKING: 'never-shown' } } });
    }),
    reply(routes.quickStart, async (req) => {
      const body = req.body as { name?: unknown } | null;
      w.adds?.push({ route: 'quickStart', body });
      if (w.quickStart) return w.quickStart(req);
      return answers.ok({ success: true, temporary_id: 'quick_1791370000000_0', name: body?.name, status: 'starting', created_at: '2026-10-25T08:00:00Z' });
    }),
  ];
}

/** The programs page's default world (fixtureWorld's programs on atlas): web has a policy with inbound rules, api
 *  is limited to its ports, worker's firewall does not match, docs-preview's old rules drain, report-builder holds
 *  a block that restricts nothing, legacy-cron (turned off) has resource limits. */
export const sandboxRules: FixtureRule[] = sandboxRulesFor({
  status: {
    '1': statusSamples.set,
    '2': statusSamples.restricted,
    '3': statusSamples.tableMismatch,
    '6': statusSamples.drainingCleared,
    '7': statusSamples.inactive,
    '8': statusSamples.limitsOnly,
  },
  host: hostSamples.ok,
  program: {
    '2': { success: true, program: { id: 2, name: 'api', user: 'hoody', enabled: true, boot: false, directory: '/hoody/storage/apps/api', port_range: { start: 8000, end: 8003 }, environment: {} } },
    '8': { ...programSamples.disabled, program: { ...programSamples.disabled.program, id: 8, name: 'legacy-cron' } },
  },
});
