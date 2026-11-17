// aliases.ts: the proxy alias routes (a computer's shareable named URL) and the lock Computers and Scripts share.
//
// Contract, in plain words:
//   - Scope is 'realm' for every alias route: the service scopes aliases to the realm host it is called on (the
//     list filters by it and refuses a realm_id that conflicts with it; a create records it). A call on the base
//     host would list and create outside the shown realm.
//   - aliasRoutes.create's body is the service's create body (computer_id and program required; alias, port,
//     index, target_path, allow_path_override, expires_at optional). Computers names a port alias; Scripts points an exec
//     alias at a script path.
//   - aliasRoutes.edit is the service's alias update, the one route for PATCH /proxy/aliases/:id (alias, port,
//     expires_at; a call sends only the keys it changes): Computers renames an alias or moves the port an http/https
//     alias goes to; the Board's broadcast link keeps a short expiry that the live sender extends.
//   - aliasRowsOf parses the list answer, the one parse every page reads aliases through: each row's url is the proxy's own address for the alias, kept as given and never rebuilt from
//     the name. aliasAtPort says whether an alias points at a port (http, https, or no program from an older API).
//   - aliasList is one computer's alias list as a core read (input: the computer id), so a page that shows aliases
//     outside its own source reads it here and a change that proves an alias created or removed names it in coreReads:
//     every page's copy of the list is then read again (Programs shows the list Computers changes).
//   - aliasLock: one lock for a change of an existing alias (remove, enable/disable, edit), keyed by the alias id, on
//     every page: while one may have gone through, the other page's change of the same alias is refused (BUSY or
//     READ_BACK_FIRST) and never sent. Creates keep their own identities under the same lock base (a port alias
//     {computer, port, name}, a script alias {computer, target}) through aliasLock.lock with their own lockKey.
import { defineQuery } from './query';
import { defineRoute } from './routes';
import { recordOrUndefined as rec, stringOrEmpty as str } from './shape';

export const aliasRoutes = Object.freeze({
  list: defineRoute({ method: 'GET', path: '/proxy/aliases', scope: 'realm', query: ['computer_id'] }),
  create: defineRoute({ method: 'POST', path: '/proxy/aliases', scope: 'realm', body: ['computer_id', 'program', 'port', 'index', 'target_path', 'allow_path_override', 'alias', 'expires_at'] }),
  state: defineRoute({ method: 'PATCH', path: '/proxy/aliases/:id/state', scope: 'realm', body: ['enabled'] }),
  remove: defineRoute({ method: 'DELETE', path: '/proxy/aliases/:id', scope: 'realm' }),
  edit: defineRoute({ method: 'PATCH', path: '/proxy/aliases/:id', scope: 'realm', body: ['alias', 'port', 'expires_at'] }),
});

/** One proxy alias as pages read it: a row of the alias list answer. */
export interface AliasRow {
  id: string;
  /** The alias name (the record's `alias`). */
  name: string;
  /** The proxy's own address for the alias (the record's `url`): opened and shown as given, never rebuilt from the name. */
  url: string;
  /** For an http/https alias the port; for a program alias (terminal, desktop...) the program's instance number. */
  port: number;
  /** The alias's program: http/https point at a port; anything else at a Hoody program. Empty from an older API. */
  program?: string;
  /** The path the alias opens in its program (the record's `target_path`; a script's public link: the script's address).
   *  Absent when the record has none. */
  target?: string;
  /** The caller picks the path (the record's `allow_path_override`): the alias opens no one fixed path. */
  anyPath?: true;
  createdAt: string;
}

/** The aliases of a list answer ({data: {aliases: [...]}}); an answer without the list has none. */
export function aliasRowsOf(raw: unknown): AliasRow[] {
  const list = rec(rec(raw)?.data)?.aliases;
  return (Array.isArray(list) ? list : []).map((a: unknown) => {
    const x = rec(a);
    const index = x?.index;
    const target = x?.target_path;
    return {
      id: str(x?.id), name: str(x?.alias), url: str(x?.url), port: typeof index === 'number' && Number.isFinite(index) ? index : 0, program: str(x?.program),
      ...(typeof target === 'string' && target !== '' ? { target } : {}),
      ...(x?.allow_path_override === true ? { anyPath: true as const } : {}),
      createdAt: str(x?.created_at),
    };
  });
}

/** One computer's alias list (input: the computer id), parsed by aliasRowsOf: the core read a change names in coreReads. */
export const aliasList = defineQuery<unknown, AliasRow[], string>(aliasRoutes.list, {
  input: (id) => ({ query: { computer_id: id } }),
  select: aliasRowsOf,
});

/** An alias that points at a port (http/https, or no program from an older API); a program alias's number is an instance, not a port. */
export const aliasAtPort = (a: { program?: string }): boolean => !a.program || a.program === 'http' || a.program === 'https';

/** The shared alias lock: spread `{ lock: aliasLock.lock, lockKey: (v) => aliasLock.key(<alias id>) }`. */
export const aliasLock = Object.freeze({
  lock: 'proxy.alias',
  key: (aliasId: string): { alias: string } => ({ alias: aliasId }),
});

// The alias name rules, shared by Computers and Scripts.
/** An alias name's shape as the API accepts it: 3 to 61 lowercase letters, digits and dashes, no dash at either end. */
export const ALIAS_RE = /^[a-z0-9][a-z0-9-]{1,59}[a-z0-9]$/;
// The API's other refusals (its own alias check): the proxy's service labels, as the whole name or
// followed by a dash (`egressmyapp` stays fine), the infrastructure labels `containers` and `computers` exactly, and the shapes of
// the platform's own hostnames.
const ALIAS_RESERVED_PREFIX = /^(egress|workspaces|workspace|os)(-|$)/;
const ALIAS_SYSTEM_SHAPE = /^((proxy|egress|workspaces|workspace|os)-)?[0-9a-f]{24}-[0-9a-f]{24}/;
/** Why the API would refuse this alias name ('rule': its shape; 'reserved': a name kept for the platform), or null. */
export function aliasProblem(v: string): 'rule' | 'reserved' | null {
  if (!ALIAS_RE.test(v)) return 'rule';
  if (v === 'containers' || v === 'computers' || ALIAS_RESERVED_PREFIX.test(v) || ALIAS_SYSTEM_SHAPE.test(v)) return 'reserved';
  return null;
}
export function validAlias(v: string): boolean {
  return aliasProblem(v) === null;
}

const ALIAS_WORDS_A = ['amber', 'brave', 'calm', 'clever', 'cosmic', 'crisp', 'eager', 'fancy', 'gentle', 'golden', 'happy', 'humble', 'jolly', 'lively', 'lucky', 'mellow', 'misty', 'nimble', 'proud', 'quick', 'quiet', 'rapid', 'shiny', 'silver', 'snowy', 'sunny', 'swift', 'tidy', 'vivid', 'witty'] as const;
const ALIAS_WORDS_B = ['badger', 'breeze', 'canyon', 'cedar', 'comet', 'coral', 'falcon', 'fern', 'forest', 'harbor', 'island', 'lagoon', 'lantern', 'maple', 'meadow', 'otter', 'panda', 'pebble', 'pine', 'planet', 'raven', 'river', 'robin', 'summit', 'thunder', 'tiger', 'valley', 'violet', 'willow', 'zephyr'] as const;
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
const ALIAS_SUFFIX_LEN = 16;
const cryptoBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));

/**
 * An alias name to start from: two words to recognise it, then 16 random letters and digits ("quiet-river-k3…"),
 * about 82 bits, so the address cannot be found by trying names: an alias opens for anyone who has it unless the
 * computer's permissions say otherwise. Never a reserved label (the words are not).
 */
export function suggestAliasName(bytes: (n: number) => Uint8Array = cryptoBytes): string {
  const r = bytes(2 + ALIAS_SUFFIX_LEN * 2);
  const two = (i: number) => (r[i * 2] ?? 0) * 256 + (r[i * 2 + 1] ?? 0);
  const a = ALIAS_WORDS_A[(r[0] ?? 0) % ALIAS_WORDS_A.length];
  const b = ALIAS_WORDS_B[(r[1] ?? 0) % ALIAS_WORDS_B.length];
  let tail = '';
  // Two bytes per character: 65536 % 36 leaves a bias under 0.06 %, far from mattering for guessing.
  for (let i = 1; i <= ALIAS_SUFFIX_LEN; i++) tail += B36[two(i) % 36];
  return `${a}-${b}-${tail}`;
}
