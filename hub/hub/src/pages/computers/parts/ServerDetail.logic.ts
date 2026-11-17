// What the server detail shows, read from the API's own answers. No React, no I/O.
// GET /servers (the rentals list: real rentals plus the free-tier slices) carries the server snapshot with
// specs as { cpu: { cores }, ram: { capacity_gb }, disks: { config, total_gb, summary }, network, additional }; the computers page's
// container snapshot spells them cpu_cores / ram_gb / disk_gb. Both are read, so a row of either shape fills the panel.
// The runtime read (GET /rentals/:id/runtime) is a server's whole-box reading or a slice's own.
import { commerceRules, stringOrEmpty as str } from '@core';

type Raw = Record<string, unknown> | undefined;
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export interface ServerFacts {
  /** The id the rentals routes take: a rental's, or a free slice's own server id. */
  rentalId: string;
  serverId: string;
  name: string;
  city: string;
  cc: string;
  datacenter: string;
  model: string;
  free: boolean;
  /** Free slices (and paid ones) share compute: no per-computer quota. */
  sharedCompute: boolean;
  status: string;
  cores: number | null;
  threads: number | null;
  cpuModel: string;
  ramGb: number | null;
  diskGb: number | null;
  /** The disk groups (specs.disks.config), read the Market's way; the panel words them, never the API's summary sizes. */
  disks: ReturnType<typeof commerceRules.disksOf>;
  diskSummary: string;
  bandwidth: string;
  trafficTb: number | null;
  trafficUnlimited: boolean;
  /** How many IPv4 addresses the server has (the API names no address itself). */
  ipv4Count: number | null;
  rentalEnd: string | null;
  days: number | null;
  amount: string;
  /** Whether a computer here can be given /dev/kvm (full VMs); null: not known. */
  kvm: boolean | null;
  /** True: a slice of a shared host; false: a dedicated bare-metal server; null: the row does not say. */
  isVm: boolean | null;
  cap: { used: number; max: number } | null;
}

export function factsOf(row: unknown): ServerFacts | null {
  const x = obj(row);
  if (!x) return null;
  const v = obj(x.server);
  const sp = obj(v?.specs);
  const cpu = obj(sp?.cpu);
  const ram = obj(sp?.ram);
  const disks = obj(sp?.disks);
  const net = obj(sp?.network);
  const add = obj(sp?.additional);
  const cap = obj(v?.computer_capacity);
  const used = num(cap?.used);
  const max = num(cap?.max);
  const free = x.is_free_tier === true || v?.is_free === true;
  const end = str(x.rental_end);
  const serverId = str(v?.id) || str(x.server_id) || str(x.id);
  return {
    rentalId: str(x.id) || serverId,
    serverId,
    name: str(v?.name),
    city: str(v?.city),
    cc: str(v?.country),
    datacenter: str(v?.datacenter),
    model: str(v?.model),
    free,
    sharedCompute: sp?.shared_compute === true || free,
    status: str(x.status),
    cores: num(cpu?.cores) ?? num(sp?.cpu_cores),
    threads: num(cpu?.threads),
    cpuModel: str(cpu?.model),
    ramGb: num(ram?.capacity_gb) ?? num(sp?.ram_gb),
    diskGb: num(disks?.total_gb) ?? num(sp?.disk_gb),
    disks: commerceRules.disksOf(disks?.config),
    diskSummary: str(disks?.summary),
    bandwidth: str(net?.bandwidth_formatted),
    trafficTb: num(net?.traffic_tb),
    trafficUnlimited: net?.traffic_unlimited === true,
    ipv4Count: num(add?.ipv4_count),
    // A free slice has no end: its rental_end is a far-future placeholder.
    rentalEnd: free || !end ? null : end,
    days: free ? null : num(x.remaining_days),
    amount: free ? '' : str(x.amount),
    kvm: typeof v?.kvm_supported === 'boolean' ? v.kvm_supported : null,
    isVm: typeof v?.is_vm === 'boolean' ? v.is_vm : null,
    cap: used !== null && max !== null ? { used, max } : null,
  };
}

/** What is known of the row that was opened: the server's id, and the list row's own (rental) id when the view has it. */
export interface Who {
  serverId: string;
  rentalId?: string;
}

/**
 * The row of the list that was opened. A server can have several rows (the list keeps rental history), and a rental id
 * and a server id are different things: with the rental id, exactly that row (and it must be on this server); without
 * it, the server's live row (active or on hold), else its latest listed one.
 */
export function pickFacts(raw: unknown, who: Who): ServerFacts | null {
  if (!who.serverId) return null;
  const rows = arr(obj(raw)?.data)
    .map((r) => ({ f: factsOf(r), status: str(obj(r)?.status) }))
    .filter((r): r is { f: ServerFacts; status: string } => r.f !== null && r.f.serverId === who.serverId);
  if (who.rentalId) return rows.find((r) => r.f.rentalId === who.rentalId)?.f ?? null;
  return (rows.find((r) => r.status === 'active' || r.status === 'hold') ?? rows[0])?.f ?? null;
}

export interface ServerRuntime {
  /** The rental the reading was asked for (a reading of another rental is never this one's). */
  rentalId: string;
  scope: 'server' | 'subserver';
  /** A whole server's seconds since it booted; null for a slice or when not read. */
  uptimeS: number | null;
  cpu: number | null;
  mem: number | null;
  disk: number | null;
  /** The figures are the last known ones, or could not be verified. */
  stale: boolean;
}

export function runtimeOf(raw: unknown, rentalId = ''): ServerRuntime | null {
  const d = obj(obj(raw)?.data);
  if (!d) return null;
  const scope = d.scope === 'subserver' ? 'subserver' : d.scope === 'server' ? 'server' : null;
  if (!scope) return null;
  const cpu = obj(d.cpu);
  const mem = obj(d.mem);
  const disk = obj(scope === 'server' ? d.storage : d.disk);
  return {
    rentalId,
    scope,
    uptimeS: scope === 'server' ? num(d.uptime_s) : null,
    cpu: num(scope === 'server' ? cpu?.busy_pct : cpu?.usage_pct),
    mem: num(mem?.pct),
    disk: num(disk?.pct),
    stale: d.stale === true || d.health === 'unverified',
  };
}

/** True when the server has no room left for another computer. */
export function capFull(f: Pick<ServerFacts, 'cap'>): boolean {
  return !!f.cap && f.cap.max > 0 && f.cap.used >= f.cap.max;
}
