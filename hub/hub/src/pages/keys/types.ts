// Types of the keys page: the API's rows as they arrive (Raw*) and the view models logic.ts makes of them.

/** A permission tree: dotted paths of booleans ({containers: {read: true}}). */
export interface Tree {
  [k: string]: boolean | Tree;
}

/** One row of GET /auth/tokens (a key). The secret exists only in the answer that made the key. */
export interface RawToken {
  id: string;
  alias?: string;
  prefix?: string;
  realm_ids?: string[];
  allow_no_realm?: boolean;
  permissions?: Tree;
  is_enabled?: boolean;
  expires_at?: string | null;
  ip_whitelist?: string[];
  vault_access?: boolean;
  event_access?: boolean;
  delegation_depth?: number;
  created_at?: string;
  /** When and from which address the key was last used (null: never). */
  last_used_at?: string | null;
  last_used_ip?: string | null;
  /** The key that made this one (delegated issuance); null: made by the account. */
  created_by_token_id?: string | null;
  /** Only in the answer to a mint; core's scrub nulls it before anything else sees the answer. */
  token?: string | null;
}

export interface RawTemplate {
  name: string;
  permissions: Tree;
}

export interface RawList {
  rows: RawToken[];
  /** The server says the list is cut. */
  truncated: boolean;
}

export interface Catalogue {
  /** Every right of the server's full_access template, as a dotted path (admin and delegation left out). */
  rights: string[];
  full: Tree | null;
  /** Full grants a financial.* right, so its words must say billing and payments are included. */
  billing: boolean;
  /** The other server templates, as the catalogue rights they grant ("Start from"). */
  templates: Array<{ name: string; rights: string[] }>;
}

export interface KeyAccess {
  full: boolean;
  n: number;
  of: number;
  billing: boolean;
  /** The server template whose rights the key holds exactly. */
  tmpl?: string;
}

export type KeyState = "active" | "paused" | "expired";
export type Managed = "" | "boot" | "realm";

export interface Key {
  id: string;
  name: string;
  prefix: string;
  realms: string[];
  allRealms: boolean;
  noRealm: boolean;
  access: KeyAccess | null;
  endsAt: string | null;
  createdAt: string | null;
  /** Last use (null: never used). */
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  /** The id of the key that made this one; null: the account made it. */
  madeBy: string | null;
  state: KeyState;
  enabled: boolean;
  ips: string[];
  vault: boolean;
  events: boolean;
  depth: number;
  delegates: boolean;
  managed: Managed;
  /** The rights the key holds, read-only in the inspector. */
  perms: Tree | null;
  /** What a copy of it inherits, as one comparable string. */
  scope: string;
}

export interface KeyRow {
  key: Key;
  /** false: shown read-only (an All realms key seen from one realm). */
  editable: boolean;
}

export interface Realm {
  id: string;
  name: string;
  /** true when name is the realm's own alias (not a short id or a fallback). */
  named?: boolean;
  color?: string;
}

export interface Scope {
  /** 'all' or the 24-hex realm the shell shows. */
  realm: string;
  /** false in a shared-access (token) session: no keys page. */
  account: boolean;
}

/** The computer the top bar shows. */
export interface TopComputer {
  id: string;
  name: string;
  ssh_hostname?: string;
  ssh_public_key?: string;
}

export type WorksIn = "only" | "all" | "pick";
export type Ends = "never" | "90d" | "1y" | "date";
export type CopyEnds = Ends | "same";

export interface NewKeyForm {
  name: string;
  worksIn: WorksIn;
  realm: string | null;
  picked: string[];
  access: "full" | "choose";
  rights: string[];
  delegate: boolean;
  ends: Ends;
  date: string;
  ips: string;
  /** A realm id typed in "Add a realm by its id" and not added yet: Save waits for it to be added or cleared. */
  realmDraft?: string;
}

export interface CopyInput {
  name: string;
  ends: CopyEnds;
  date: string;
}
