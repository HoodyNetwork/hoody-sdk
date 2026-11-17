// Shapes of the scripts page: what the Exec kit, the agent and the Hoody API answer, as the page reads them.

/** What this computer's Exec kit can do (health.features). Anything absent shows "Update this computer". */
export interface Caps {
  /** The kit clock in ms, or null. */
  now: number | null;
  revisions: boolean;
  history: boolean;
  env: boolean;
  executions: boolean;
  tests: boolean;
  publishable: boolean;
}

export interface MagicComments {
  enabled?: boolean;
  schedule?: string | null;
  label?: string;
  description?: string;
  /** Redacted by the kit: how many `@token` lines the file has. */
  tokens?: unknown[];
  token?: string | null;
  logLevel?: string;
}

/** One script file under default/1/ as `GET scripts/list` gives it. */
export interface ScriptRow {
  /** Root-relative: `default/1/api/weather.ts`. */
  path: string;
  isDirectory?: boolean;
  magicComments?: MagicComments;
}

/** The kit's 24 h summary of one script (monitor/scripts-summary). */
export interface Summary {
  scriptPath: string;
  calls: number;
  failed: number;
  lastOutcome?: string;
  truncated?: boolean;
}

/** The agent's record of a script made from an idea. */
export interface Instance {
  path: string;
  template: string;
  state: string;
  elsewhere: boolean;
  hasToken: boolean;
  aliasId: string | null;
}

/** A public link (an API alias) of the computer's Exec. */
export interface Alias {
  id: string;
  alias?: string;
  url: string;
  target_path: string;
  enabled?: boolean;
  allow_path_override?: boolean;
  custom_domain?: string | null;
  /** When the link was made, from the server (the propagation note reads it). */
  created_at?: string;
  computer_id?: string;
  program?: string;
  index?: number;
}

export interface DeletedEntry {
  path: string;
  version: string | number;
  retainedUntil: string;
}

export type CompState = 'on' | 'off' | 'starting' | 'gone';

export interface AgentCaps {
  /** The agent supports ideas (script-templates). */
  templates: boolean;
  /** The agent can write scripts (script-writer). */
  writer: boolean;
  /** Why it cannot (shown as a note): the agent lacks the capability, is not signed in as this account, or no realm is chosen. 'loading': not known yet. */
  writerWhy?: 'loading' | 'old' | 'login' | 'account' | 'identity' | 'realm';
  /** With writerWhy 'login': the press may sign the agent in ('renew': its login was rejected, as after a Hub sign-out). */
  signIn?: 'offer' | 'renew';
  /** The owner the agent reported when it is ready: a session it starts must report the same. */
  writerOwner?: string;
  /** The agent's guarded delete for idea-made scripts. */
  guardedDelete: boolean;
}

/** One computer and what the reads of its scripts found. */
export interface CompScripts {
  id: string;
  name: string;
  /** name.last4, never the full id. */
  handle: string;
  state: CompState;
  serverName: string;
  realmIds: string[];
  /** The computer's colour as the API keeps it: drawn only through the kit's ComputerMark, which normalises it. */
  color?: string;
  /** The Exec address of the computer: https://…-exec-1.… with no path. */
  origin: string;
  /** The reads failed: private (Exec refuses the Hub) or unreachable. */
  err: 'private' | 'unreachable' | null;
  caps: Caps | null;
  agent: AgentCaps;
  /** The realm the agent's script routes are called in; null = the computer is in several realms and none is chosen (agent reads wait). */
  agentRealm?: string | null;
  /** The realm the ownership read was asked in: the chosen one, else the computer's first (every realm's ledger is listed from any of them), else global. A managed row of it is this realm's. */
  ownerRealm?: string | null;
  rows: ScriptRow[];
  summary: Record<string, Summary>;
  /** Idea records by path; null = ownership could not be read (unknown, never "unmanaged"). */
  instances: Record<string, Instance> | null;
  /** With instances null, why: the read is still going, or it failed with this kind (core/source SourceErrorKind) and this
   *  rejection (its Details, conformance.errors E1). Unset = read. */
  ownerRead?: { k: 'reading' } | { k: 'failed'; kind: string; error: unknown };
  aliases: Alias[];
  /** False when the links could not be read at all (unset counts as read): then no link is known to exist or not. */
  aliasesRead?: boolean;
  /** null = history is not available on this kit. */
  deleted: DeletedEntry[] | null;
}

export interface ScriptsOverview {
  computers: CompScripts[];
}

/** One script as the table shows it. */
export interface ScriptItem {
  /** `<computer handle>~<script path inside its folder>`: the selection in the URL (the page names the folder, ?exec=). */
  id: string;
  compId: string;
  compName: string;
  compHandle: string;
  /** Root-relative path. */
  path: string;
  name: string;
  /** The file's route as the kit names it (`/orders/[id]`): the identity of the script (links, aliases, tests). */
  route: string;
  /** The address as people write it (`/orders/:id`, `/docs/*`, `/*`) and what it means, for the Address column. */
  pattern: string;
  /** Exec routes to the file; false = a pre/post file or a catch-all that is not last (no address, pattern is empty). */
  served: boolean;
  /** The address has a [part], so a copy is a pattern, not an address to call. */
  dynamic: boolean;
  routeTip: string;
  description: string;
  status: 'off' | 'failing' | 'working' | null;
  schedule: string | null;
  keyed: boolean;
  calls: number | null;
  failed: number | null;
  /** Made from an idea (template name), or elsewhere. */
  managed: { template: string; elsewhere: boolean } | null;
  /** Ownership could not be read. */
  ownershipUnknown: boolean;
  /** The computer cannot be changed from here (old kit) or is not ready: read-only. */
  group: 'ok' | 'off' | 'starting' | 'private' | 'unreachable' | 'old';
}

/** A script file read in full (scripts/read). */
export interface ScriptFile {
  revision: string | null;
  content: string;
  magicComments?: MagicComments;
}

/** What magic-comments/read answers: the stored values (a secret reads as `[REDACTED]`), the revision they were read at, and what is unusable in them. */
export interface CommentsRead {
  revision: string | null;
  comments: Record<string, unknown>;
  warnings: Array<{ directive: string; value: string; message: string }>;
}

/** A dry run of magic-comments/update: nothing was written. `current` and `proposed` are redacted; `changes` names the keys. */
export interface CommentsDry {
  current: Record<string, unknown> | null;
  proposed: Record<string, unknown> | null;
  changes: string[];
  ignored: string[];
}

export interface Usage {
  totals: { calls?: number; failed?: number; p50Ms?: number | null };
  hours: Array<number | { calls?: number }>;
  coverage?: { complete?: boolean };
}

export interface Failure {
  executionId: string;
  status: number;
  receivedAt: string;
  error?: string;
}

export interface Version {
  version: string | number;
  revision?: string;
  savedAt: string;
  /** The change that replaced this code: `write`, `restore` or `magic-comments`. */
  replacedBy?: string;
  /** The version's size in bytes. */
  size?: number;
}

export interface EnvKey {
  name: string;
  from?: string;
}
export interface EnvFile {
  scope: string;
  rel?: string;
  exists?: boolean;
  revision?: string | null;
  keys?: EnvKey[];
}
export interface EnvKeys {
  files: EnvFile[];
  effective: EnvKey[];
}

/** A saved test (EXK case shape). */
export interface TestCase {
  id: string;
  name: string;
  method: string;
  route: string;
  query?: Array<{ name: string; value?: string; secret?: boolean }>;
  headers?: Array<{ name: string; value?: string; secret?: boolean }>;
  body?: { type: 'json' | 'text'; value: unknown; secretPaths?: string[] };
  expect?: { status?: number; contains?: string };
}
export interface TestsDoc {
  cases: TestCase[];
  revision: string | null;
}

/** route/resolve: who answers an address. */
export interface ResolveAnswer {
  matched: boolean;
  scriptPath?: string;
  type?: string;
}

/** validate/script. */
export interface Validation {
  publishable?: boolean;
  blocking?: Array<{ type?: string; message?: string; line?: number }>;
  results?: {
    syntax?: { valid?: boolean; error?: string };
    typescript?: { valid?: boolean; error?: string };
    typecheck?: { errors?: Array<{ message?: string; line?: number }> };
    dependencies?: { missingModules?: string[]; invalidModules?: string[] };
    magicComments?: { tokens?: unknown[]; token?: string | null };
  };
  magicComments?: { tokens?: unknown[]; token?: string | null };
}

export interface WriteResult {
  revision?: string;
  previousRevision?: string;
}
