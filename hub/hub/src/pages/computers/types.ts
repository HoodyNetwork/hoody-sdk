// Shapes of the Hoody API answers this page reads (only the fields it uses).
import type { LaneReading } from '@core';

export interface ServerSpecs {
  cpu_cores?: number | null;
  ram_gb?: number | null;
  /** The computer's disk limit on this server, in GB. */
  disk_gb?: number | null;
  /** A free slice: CPU and memory are shared with the other free computers (cores and memory are null then). */
  shared_compute?: boolean;
}

export interface ComputerServer {
  id?: string;
  name?: string;
  city?: string;
  country_name?: string;
  /** ISO country code, for the flag. */
  country?: string;
  /** The site's name as the API reports it. */
  datacenter?: string;
  /** A free slice (it never expires). */
  is_free?: boolean;
  /** A paid slice of a shared host. */
  paid_subserver?: boolean;
  /** The current rental's end (ISO 8601), dedicated and paid servers only; null for free ones. */
  expires_at?: string | null;
  specs?: ServerSpecs | null;
}

export interface Computer {
  /** 24 hex. A credential: shown only through IdChip / masked. */
  id: string;
  name: string;
  status: string;
  project_id: string;
  server_id?: string;
  server_name?: string;
  server?: ComputerServer;
  realm_ids?: string[];
  /** null: the API couldn't check (its reads of the proxy rules failed); never read as false. */
  has_proxy_permissions?: boolean | null;
  /** 'unknown': the API couldn't check; never read as 'none'. */
  proxy_permissions_scope?: 'none' | 'computer' | 'project' | 'both' | 'unknown';
  ssh_hostname?: string;
  ssh_public_key?: string;
  /** The API's image name (debian/13); read through core imageWords. */
  computer_image?: string;
  comment?: string;
  color?: string;
  created_at?: string;
  /** OpenSSH fingerprint (SHA256:…) of the installed key; and when it was set. Null or absent: no key, or not said. */
  ssh_key_fingerprint?: string | null;
  ssh_key_installed_at?: string | null;
  /** Snapshots kept of this computer, and the one it was last restored from. */
  snapshot_count?: number;
  last_used_snapshot?: string | null;
  /** Aliases (addresses of your own) that point at this computer. */
  proxy_domains_count?: number;
  /** Its server ended or was reinstalled: nothing can start it again. */
  server_expired?: boolean;
  server_expired_at?: string | null;
  /** Why a failed creation or copy failed (status failed only). */
  failure_reason?: { code?: string; message?: string } | null;
  ai?: boolean;
  hoody_kit?: boolean;
  dev_kit?: boolean;
  kvm?: boolean;
  autostart?: boolean;
  ramdisk?: boolean;
}

export interface Project {
  id: string;
  name: string;
  /** `#RRGGBB` as the API keeps it (shown only through computerColor). */
  color?: string;
  realm_ids?: string[];
  /** The account's first project: the API never deletes it. */
  is_default?: boolean;
  /** The owner's account id (the API's user_id): another account's means the project is shared with this one.
   *  Absent when the answer does not say: no member-only behaviour is claimed then. */
  owner?: string;
  /** Its own realms leave out the shown realm: shown because computers listed here belong to it (projectsInView). */
  outside?: boolean;
  /** Read by id because the shown realm's projects list lacks it: shown without Rename or Delete, since only that
   *  list proves a change (projectsInView). */
  readOnly?: boolean;
}

export interface Realm {
  id: string;
  name: string;
  /** Palette name (red, orange, green, teal, blue, purple, pink). */
  color: string;
  /** True when `name` is the realm's alias; false when it is only its short id (no alias set). */
  named?: boolean;
  /** Computers in it, from core's realm usage; null or absent while unknown. */
  computers?: number | null;
}

export interface Server {
  id: string;
  name: string;
  place: string;
  /** ISO country code. */
  cc?: string;
  cpu: number | null;
  ram: number | null;
  disk: number | null;
  free: boolean;
  days: number | null;
  status: string;
  cap: { used: number; max: number } | null;
  /** Which group the Servers list shows it in: your free slice, a paid slice of a shared host (subserver), a whole
   *  machine (bare metal); null or missing when the answer does not say (its own group, never a guess). */
  kind?: 'free' | 'subserver' | 'metal' | null;
  /** The list row's own id (a rental, or a free slice), when the answer gives one: the server panel opens exactly that row. */
  rentalId?: string;
}

export interface Subscription {
  id: string;
  state: string;
  plan?: { title?: string };
  server_name?: string;
  paid_through?: string;
  delete_at?: string | null;
  auto_renew?: boolean;
  active_operation_id?: string | null;
}

/** A computer's listeners (core reads and classifies them: core/computerRuntime.ts). */
export type { Listener, RuntimeInfo } from '@core';

/** A proxy alias: core's alias row (core aliasRowsOf parses the list answer for every page). */
export type { AliasRow as Alias } from '@core';

export interface Usage {
  cpu: number | null;
  mem: { used: number; total: number } | null;
  disk: { used: number; total: number } | null;
  /** The same disk reading in bytes, as the read sends it (the Storage tab formats bytes). */
  diskBytes?: { used: number; total: number } | null;
  at: string;
  /** When the computer last started (the stats read's started_at); null or absent when the read does not say. */
  started?: string | null;
  /** Processes running in it, when the read says. */
  processes?: number | null;
}

export type ProgramState = 'running' | 'starting' | 'stopped' | 'idle' | 'restarting' | 'failed' | 'unknown';

export interface Program {
  id: string;
  name: string;
  system: boolean;
  state: ProgramState;
  ports: number[];
  uptimeSeconds: number | null;
  boot: boolean | null;
  /** A port-range program: a whole stop or restart covers every part (`all`), as on the Programs page. */
  range?: boolean;
}

export interface CommandResult {
  state: 'exit' | 'signal' | 'timeout';
  code: number | null;
  signal: string;
  time: string;
  out: string;
  err: string;
  outCut: boolean;
  errCut: boolean;
  /** The folder the program says it ran in (an absolute path), else null (not reported). */
  cwd: string | null;
}

/** One server's AI use (GET /users/me/free-ai-usage): its lanes, or that the answer could not read them (ok false). */
export interface ServerAi {
  ok: boolean;
  lanes: LaneReading[];
}

/** The AI usage read, by server id; `truncated`: the answer stopped early (it reads a bounded number of servers). */
export interface ServersAi {
  byId: Record<string, ServerAi>;
  truncated: boolean;
}
