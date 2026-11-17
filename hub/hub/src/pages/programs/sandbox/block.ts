// The program sandbox block as the daemon stores it (its own types), and the pure rules the Hub
// mirrors from it: canonical form, fingerprint, "does it restrict anything" and "does it owe inbound rules".
// No React, no I/O. Every rule here copies the daemon's own rule; a rule the daemon does not have is not here.

/** A port on the wire: 8000 or "8000-8003" (the daemon's port type). The spelling is kept: the daemon stores the
 *  block as sent. */
export type PortSpec = number | string;

export interface FsBlock {
  read_only_root?: boolean;
  writable?: string[];
  hidden?: string[];
}
export type NetMode = 'full' | 'restricted' | 'none';
export interface NetBlock {
  mode?: NetMode;
  bind_ports?: PortSpec[];
  connect_ports?: PortSpec[];
  ingress_allow_from?: string[];
  ingress_allow_platform?: boolean;
  ingress_rate_limit?: string;
  udp?: 'allow' | 'deny';
}
export interface ProcBlock {
  max_memory?: string;
  max_pids?: number;
  max_open_files?: number;
  max_cpu?: string;
  max_file_size?: string;
  tmp_size?: string;
  private_tmp?: boolean;
}
export interface SandboxBlock {
  filesystem?: FsBlock;
  network?: NetBlock;
  process?: ProcBlock;
}

/** A plain JSON object: not null, not an array. The one guard the sandbox readers share. */
export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** JSON with object keys sorted and nulls dropped (the daemon treats an explicit null as absent), array order
 *  kept (writable, hidden and ingress_allow_from keep their order in storage). Two blocks with equal canonical
 *  text are the same stored block. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map((x) => canonical(x === undefined ? null : x)).join(',') + ']';
  if (isObj(v)) {
    const keys = Object.keys(v).filter((k) => v[k] !== null && v[k] !== undefined).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  return JSON.stringify(v ?? null);
}

/** A short fingerprint of a block's canonical text (cyrb53): tells sends apart in a hold's identity without
 *  carrying the block. Not a security property. null (no block) has its own fingerprint. */
export function fingerprint(block: SandboxBlock | null): string {
  const s = block === null ? 'null' : canonical(block);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** The block as a SandboxBlock when the wire value has the right outer shape (an object, or null for none);
 *  undefined when it does not (a malformed answer is never read as "no sandbox"). Inner fields are kept as
 *  they came: the words and the editor read them defensively. */
export function readBlock(v: unknown): SandboxBlock | null | undefined {
  if (v === null) return null;
  if (!isObj(v)) return undefined;
  for (const k of Object.keys(v)) if (!['filesystem', 'network', 'process'].includes(k)) return undefined;
  for (const k of ['filesystem', 'network', 'process'] as const) if (v[k] !== undefined && v[k] !== null && !isObj(v[k])) return undefined;
  return v as SandboxBlock;
}

const nonEmpty = (a: unknown): boolean => Array.isArray(a) && a.length > 0;
const present = (v: unknown): boolean => v !== undefined && v !== null;

/** Does any restriction remain (the daemon's own test, all thirteen conditions)? `writable`,
 *  `bind_ports`, `connect_ports` and `ingress_allow_platform` on their own restrict nothing. A block that
 *  restricts nothing is stored as absent and the program runs unsandboxed. */
export function restricts(b: SandboxBlock | null): boolean {
  if (!b) return false;
  const fs = b.filesystem ?? {};
  const net = b.network ?? {};
  const p = b.process ?? {};
  return (
    fs.read_only_root === true ||
    nonEmpty(fs.hidden) ||
    (present(net.mode) && net.mode !== 'full') ||
    nonEmpty(net.ingress_allow_from) ||
    present(net.ingress_rate_limit) ||
    present(p.max_memory) ||
    present(p.max_pids) ||
    present(p.max_open_files) ||
    p.private_tmp === true ||
    net.udp === 'deny' ||
    present(p.max_cpu) ||
    present(p.max_file_size) ||
    present(p.tmp_size)
  );
}

/** Does the policy owe inbound firewall rules (the daemon's own test)? A non-empty allowlist or any
 *  rate limit. */
export function owesInbound(b: SandboxBlock | null): boolean {
  const net = b?.network ?? {};
  return nonEmpty(net.ingress_allow_from) || present(net.ingress_rate_limit);
}

/** The host parts a policy needs (openapi HealthResponse.sandbox; the daemon's probe): every effective block
 *  needs the sandbox runtime and the process-limit runner; inbound rules need the firewall tool; mode
 *  restricted needs Landlock ABI 4+; tmp_size needs a runtime that can size tmpfs. */
export type HostPart = 'bwrap' | 'systemd_run' | 'nft' | 'landlock' | 'tmpfs_size';
export function needs(b: SandboxBlock | null): HostPart[] {
  if (!restricts(b)) return [];
  const out: HostPart[] = ['bwrap', 'systemd_run'];
  if (owesInbound(b)) out.push('nft');
  if (b?.network?.mode === 'restricted') out.push('landlock');
  if (present(b?.process?.tmp_size)) out.push('tmpfs_size');
  return out;
}

/** What /health reports about the host's sandbox parts (only the fields used here). */
export interface HostSupport {
  bwrap: boolean;
  systemd_run: boolean;
  nft: boolean;
  landlock_abi: number;
  bwrap_tmpfs_size: boolean;
  /** Container-wide state of the inbound table. */
  firewall: 'ok' | 'degraded' | 'none' | 'unknown';
}

/** Reads /health's `sandbox` object; null when it is absent or not the documented shape (host not checked). */
export function readHost(v: unknown): HostSupport | null {
  if (!isObj(v)) return null;
  const b = (k: string) => (typeof v[k] === 'boolean' ? (v[k] as boolean) : null);
  const bw = b('bwrap');
  const sr = b('systemd_run');
  const nf = b('nft');
  const ts = b('bwrap_tmpfs_size');
  const ll = typeof v.landlock_abi === 'number' && Number.isInteger(v.landlock_abi) ? v.landlock_abi : null;
  if (bw === null || sr === null || nf === null || ts === null || ll === null) return null;
  const fw = v.firewall === 'ok' || v.firewall === 'degraded' || v.firewall === 'none' ? v.firewall : 'unknown';
  return { bwrap: bw, systemd_run: sr, nft: nf, landlock_abi: ll, bwrap_tmpfs_size: ts, firewall: fw };
}

/** The parts this policy needs that the host lacks; null when the host was not checked. */
export function missingParts(b: SandboxBlock | null, host: HostSupport | null): HostPart[] | null {
  if (!host) return null;
  const has: Record<HostPart, boolean> = {
    bwrap: host.bwrap,
    systemd_run: host.systemd_run,
    nft: host.nft,
    landlock: host.landlock_abi >= 4,
    tmpfs_size: host.bwrap_tmpfs_size,
  };
  return needs(b).filter((p) => !has[p]);
}
