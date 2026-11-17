// Fake agent answers for AI → Settings → Connections → GitHub accounts, for the preview and the tests: one account store per
// computer and realm, so a change shows in the next status read. Modes per change: `lost` applies it and answers with a
// gateway error (outcome unknown); `notApplied` answers the same way and changes nothing; the login's `expired` / `denied`
// are GitHub's definite refusals. The device code here is a placeholder, never a real one. Names from the fixture world (Ada).
// mcpRules: the settings session (rules/Session.ts) and the MCP servers list it is read on, so the MCP section opens.
import { agent, agentSignInRoutes, answers, fixtureWorld, reply, type FixtureAnswer, type FixtureRequest, type FixtureRule } from '@core';
import { routes as askRoutes } from '@ask/io';
import { attachRules } from '../../parts/fixtures.attach';
import { SETTINGS_AGENT } from '../rules/Session';
import { sessionRoutes } from '../rules/routes';
import { mcpRoutes } from './mcp.routes';
import { githubRoutes } from './routes';

export interface GhFixtureAccount { key: string; host: string; login: string; active: boolean }
export type GhHealth = 'ok' | 'invalid' | 'forbidden' | 'unchecked';
type Mode = 'lost' | 'notApplied';

export interface GitHubOpts {
  seed?: GhFixtureAccount[];
  health?: GhHealth;
  noPush?: boolean;
  statusFails?: boolean;
  /** The status answers without an accounts list (the list was not read); `() => boolean` decides per read. */
  noList?: boolean | (() => boolean);
  /** The login the device flow links. */
  newLogin?: string;
  login?: Mode | 'expired' | 'denied';
  startLost?: boolean;
  active?: Mode;
  logout?: Mode;
  /** The status names this login as the one it checked, not the account in use (a switch between the check and the list). */
  observed?: string;
  /** Tests only: the start / the wait answers once this settles. */
  startGate?: Promise<void>;
  pollGate?: Promise<void>;
  /** Tests only: a log-out applies at once and answers once this settles. */
  logoutGate?: Promise<void>;
  /** Tests only: status reads answer once this settles (when it gives one). */
  statusWait?: () => Promise<void> | undefined;
  /** Tests only: sees each request as it arrives, its body as the network would carry it (read once, now); `raw` is the
   *  body object core passed (a getter in it reads what it holds at the time it is read). */
  onSend?: (r: FixtureRequest, raw: unknown) => void;
}

const acct = (login: string, active: boolean): GhFixtureAccount => ({ key: `github.com/${login}`, host: 'github.com', login, active });
/** The default world: Ada's own account in use and a work account linked. */
export const githubSeed = (): GhFixtureAccount[] => [acct('ada', true), acct('ada-work', false)];

// The agent's own words after a log-out (the section shows its own sentence, never this one).
const PURGE_NOTE = 'revoke it on GitHub';
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function githubRules(opts: GitHubOpts = {}): FixtureRule[] {
  const seen = opts.onSend;
  const o: GitHubOpts = seen ? { ...opts, onSend: (r) => seen({ ...r, body: r.body === undefined ? undefined : JSON.parse(JSON.stringify(r.body)) }, r.body) } : opts;
  const stores = new Map<string, GhFixtureAccount[]>();
  const storeOf = (r: FixtureRequest): GhFixtureAccount[] => {
    const id = `${r.target?.container.id ?? ''}\u0000${r.query.realm ?? ''}`;
    let st = stores.get(id);
    if (!st) stores.set(id, (st = (o.seed ?? githubSeed()).map((a) => ({ ...a }))));
    return st;
  };
  const statusBody = (st: GhFixtureAccount[]) => {
    const on = st.find((a) => a.active);
    const list = st.map((a) => ({ ...a }));
    if (!on) return { status: 'ok', linked: false, accounts: list };
    const base = { status: 'ok', linked: true, login: o.observed ?? on.login, host: on.host, accounts: list };
    switch (o.health ?? 'ok') {
      case 'invalid': return { ...base, valid: false, reachable: true, code: 'token_invalid', needs_reauth: true };
      case 'forbidden': return { ...base, reachable: true, code: 'token_forbidden' };
      case 'unchecked': return { ...base, reachable: false };
      default: return { ...base, valid: true, reachable: true, scopes: o.noPush ? ['read:org'] : ['repo', 'read:org', 'workflow'], has_repo_scope: !o.noPush };
    }
  };
  return [
    reply(githubRoutes.status, async (r) => {
      o.onSend?.(r, r.body);
      const w = o.statusWait?.();
      if (w) await w;
      if (o.statusFails) return answers.refused(500, 'internal_error');
      const body: Record<string, unknown> = statusBody(storeOf(r));
      if (typeof o.noList === 'function' ? o.noList() : o.noList) delete body.accounts;
      return answers.ok(body);
    }),
    reply(githubRoutes.start, async (r) => {
      o.onSend?.(r, r.body);
      if (o.startGate) await o.startGate;
      if (o.startLost) return answers.pending5xx();
      return answers.ok({ status: 'ok', device_code: 'fixture-device-code', user_code: 'WDJB-MJHT', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 });
    }),
    reply(githubRoutes.poll, async (r) => {
      o.onSend?.(r, r.body);
      if (o.pollGate) await o.pollGate;
      if (o.login === 'expired') return answers.refused(410, 'github_login_expired');
      if (o.login === 'denied') return answers.refused(403, 'github_login_denied');
      if (o.login === 'notApplied') return answers.pending5xx();
      const st = storeOf(r);
      const login = o.newLogin ?? 'ada-lab';
      const a = acct(login, false);
      if (!st.some((x) => x.key === a.key)) st.push(a);
      if (rec(r.body).activate === true || !st.some((x) => x.active)) for (const x of st) x.active = x.key === a.key;
      return o.login === 'lost' ? answers.pending5xx() : answers.ok({ status: 'ok', key: a.key, login, host: 'github.com' });
    }),
    reply(githubRoutes.active, (r) => {
      o.onSend?.(r, r.body);
      if (o.active === 'notApplied') return answers.pending5xx();
      const st = storeOf(r);
      const key = String(rec(r.body).key ?? '');
      if (!st.some((x) => x.key === key)) return answers.refused(400, 'bad_request');
      for (const x of st) x.active = x.key === key;
      return o.active === 'lost' ? answers.pending5xx() : answers.ok({ status: 'ok', accounts: st.map((x) => ({ ...x })) });
    }),
    reply(githubRoutes.logout, async (r) => {
      o.onSend?.(r, r.body);
      if (o.logout === 'notApplied') return answers.pending5xx();
      const st = storeOf(r);
      const key = String(rec(r.body).key ?? '');
      const i = st.findIndex((x) => x.key === key);
      if (i < 0) return answers.refused(404, 'not_found');
      const [gone] = st.splice(i, 1);
      if (gone?.active && st[0]) st[0].active = true;
      if (o.logoutGate) await o.logoutGate;
      return o.logout === 'lost' ? answers.pending5xx() : answers.ok({ status: 'ok', accounts: st.map((x) => ({ ...x })), credential_purge: 'partial', message: PURGE_NOTE });
    }),
  ];
}

const MCP_OWNER = 'fp-ada';
/** The agent's sign-in status for Ada's account, signed in (agentLoginOf reads it as ready). */
const MCP_STATUS = { auth_active: true, account_id: fixtureWorld.account.id, owner_fingerprint: MCP_OWNER, restriction: 'none' };
const sidOfPath = (r: FixtureRequest) => decodeURIComponent((r.path.split('/sessions/')[1] ?? '').split('/')[0] ?? '');
interface McpRow {
  name: string; scope: string; transport: string; enabled: boolean; command?: string; args?: string[]; url?: string; env_keys: string[];
  header_keys: string[]; connected: boolean; tool_count?: number; require_confirmation: boolean; allowed_tools?: string[];
}
const mcpSeed = (): McpRow[] => [
  { name: 'pg', scope: 'user', transport: 'stdio', enabled: true, command: 'npx', args: ['-y', '@mcp/pg'], env_keys: ['PGPASSWORD'], header_keys: [], connected: true, tool_count: 4, require_confirmation: false },
  { name: 'linear', scope: 'user', transport: 'http', enabled: false, url: 'https://mcp.linear.app/mcp', env_keys: [], header_keys: ['Authorization'], connected: false, require_confirmation: false },
];

/** The settings session and the MCP servers list: the agent signed in for Ada, each settings create answered with a new
 *  session bound exactly where it was asked for (the request's realm and computer), its attachment lease, its hard close,
 *  and the list (pg and linear, user layer) read on a session still open. The sign-in status answers every status read (no
 *  other screen of the tab reads it); the create answers only the settings route (rules/routes.ts, a chat's create is another
 *  route) with the settings agent; the close, the lease and the list answer only the sessions it made. `live` holds the open
 *  ones, each with the folder it was opened for (none for a realm-wide one); the Rules & safety fixtures read hooks on them. */
export type SettingsSessions = Map<string, string | undefined>;
export function mcpRules(live: SettingsSessions = new Map()): FixtureRule[] {
  let n = 0;
  const mine = (r: FixtureRequest) => live.has(sidOfPath(r));
  const servers: McpRow[] = mcpSeed();
  let rev = 1;
  let minted = 0;
  const hash = () => `h-user-${rev}`;
  const gone = { status: 404, body: { code: 'not_found', message: 'session not found' } };
  const write = (r: FixtureRequest, apply: (b: Record<string, unknown>) => void): FixtureAnswer => {
    const b = rec(r.body);
    if (!live.has(String(b.session_id ?? ''))) return gone;
    if (b.expect_hash !== hash()) return { status: 409, body: { code: 'mcp_conflict', message: 'the settings changed' } };
    apply(b);
    rev++;
    return answers.ok({ status: 'ok', hash: hash() });
  };
  return [
    reply(agentSignInRoutes.status, answers.ok(MCP_STATUS)),
    // The gateway at the computer-binding contract: the settings chat names its computer only to protocol 3 with the four ask capabilities.
    reply(askRoutes.version, answers.ok({ api_version: '1.1.0', session_protocol_version: 3, pinned_realm: null,
      capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding'].map((name) => ({ name, supported: true, available: true })) })),
    reply(sessionRoutes.create, (r) => {
      const b = rec(r.body);
      const sid = `settings-${++n}`;
      live.set(sid, typeof b.cwd === 'string' ? b.cwd : undefined);
      return answers.ok({ session_id: sid, started: { realm_selector: b.realm, computer_id: b.computer, owner_fingerprint: MCP_OWNER } });
    }, { when: (r) => rec(r.body).agent === SETTINGS_AGENT }),
    reply(agent.sessionRoutes.delete, (r) => {
      live.delete(sidOfPath(r));
      return answers.ok({ status: 'ok' });
    }, { when: mine }),
    ...attachRules(() => new Set(live.keys())).map((x) => ({ ...x, when: mine })),
    reply(mcpRoutes.list, (r) => live.has(r.query.session_id ?? '')
      ? answers.ok({ status: 'ok', servers: servers.map((x) => ({ ...x })), files: [{ scope: 'user', path: '/home/ada/.hoody/mcp.json', exists: true, hash: hash() }], warnings: [] })
      : gone),
    // The writes (add, edit, delete, on/off): each mints its nonce, then changes the user layer the list reads next, under the
    // layer's hash. A write made against another hash is the agent's conflict; one on a closed session is its 404.
    reply(mcpRoutes.begin, (r) => (live.has(String(rec(r.body).session_id ?? '')) ? answers.ok({ status: 'ok', nonce: `nonce-${++minted}` }) : gone)),
    reply(mcpRoutes.upsert, (r) => write(r, (b) => {
      // An MCP server entry of the request body, not a computer's server (conformance.routingnode reads `.server` + `.name` as one).
      const { server: entry } = b;
      const s = rec(entry);
      const name = String(s.name ?? '');
      const old = servers.find((x) => x.name === name);
      const keys = (had: readonly string[], sent: unknown) => {
        const out = new Set(had);
        for (const [k, v] of Object.entries(rec(sent))) { if (v === null) out.delete(k); else out.add(k); }
        return [...out];
      };
      const stdio = s.type === 'stdio';
      const next: McpRow = {
        name, scope: 'user', transport: stdio ? 'stdio' : 'http', enabled: typeof s.enabled === 'boolean' ? s.enabled : old?.enabled ?? true,
        ...(stdio ? { command: String(s.command ?? ''), args: Array.isArray(s.args) ? s.args.map(String) : [] } : { url: String(s.url ?? '') }),
        env_keys: stdio ? keys(old?.env_keys ?? [], s.env) : [], header_keys: stdio ? [] : keys(old?.header_keys ?? [], s.headers),
        connected: old?.connected ?? false, ...(old?.tool_count === undefined ? {} : { tool_count: old.tool_count }),
        require_confirmation: s.require_confirmation === true,
        ...(Array.isArray(s.allowed_tools) ? { allowed_tools: s.allowed_tools.map(String) } : old?.allowed_tools ? { allowed_tools: old.allowed_tools } : {}),
      };
      if (old) servers[servers.indexOf(old)] = next; else servers.push(next);
    })),
    reply(mcpRoutes.remove, (r) => write(r, (b) => {
      const i = servers.findIndex((x) => x.name === b.name);
      if (i >= 0) servers.splice(i, 1);
    })),
    reply(mcpRoutes.enable, (r) => write(r, (b) => {
      const s = servers.find((x) => x.name === b.name);
      if (s) { s.enabled = b.enabled === true; if (!s.enabled) s.connected = false; }
    })),
  ];
}
