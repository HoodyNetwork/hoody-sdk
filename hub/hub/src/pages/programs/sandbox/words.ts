// A stored block in plain words, one line per limit, for the panel. Only what the block says: never what the
// running process does (the daemon does not report that).
import type { StringKey, Translate } from '@kit';
import type { HostPart, PortSpec, SandboxBlock } from './block';
import type strings from './strings.en.json';

type T = Translate<typeof strings>;
type Key = StringKey<typeof strings>;

// Inner fields come as the computer sent them: anything but a list reads as none.
const arr = (v: unknown): readonly (string | PortSpec)[] => (Array.isArray(v) ? (v as (string | PortSpec)[]) : []);
const list = (xs: unknown) => arr(xs).map(String).join(', ');

/** One line per limit the block sets, in the editor's order. ['Restricts nothing'] for a block that sets none. */
export function blockLines(t: T, b: SandboxBlock): string[] {
  const out: string[] = [];
  const fs = b.filesystem;
  if (fs?.read_only_root) out.push(arr(fs.writable).length ? t('sb.w.ro', { paths: list(fs.writable) }) : t('sb.w.roAll'));
  if (arr(fs?.hidden).length) out.push(t('sb.w.hidden', { paths: list(fs?.hidden) }));
  const n = b.network;
  if (n?.mode === 'none') out.push(t('sb.w.netNone'));
  if (n?.mode === 'restricted') out.push(arr(n.connect_ports).length ? t('sb.w.netRestrictedTo', { ports: list(n.connect_ports) }) : t('sb.w.netRestricted'));
  // bind_ports limits listening only in restricted mode (Landlock TCP rules); elsewhere it only names
  // ports, and the words say listening is not limited.
  if (n?.bind_ports) {
    const ports = arr(n.bind_ports);
    if (n.mode === 'restricted') out.push(ports.length ? t('sb.w.listen', { ports: list(ports) }) : t('sb.w.listenNone'));
    else if (ports.length) out.push(t('sb.w.ports', { ports: list(ports) }));
  }
  // Inbound rules: new IPv4 TCP connections from outside; replies pass, and the computer's own and
  // the platform's connections pass unless turned off; the rate is a meter per source address.
  const inbound = arr(n?.ingress_allow_from).length > 0 || !!n?.ingress_rate_limit;
  if (arr(n?.ingress_allow_from).length) out.push(t('sb.w.inbound', { list: list(n?.ingress_allow_from) }));
  if (n?.ingress_rate_limit) out.push(t('sb.w.rate', { rate: String(n.ingress_rate_limit) }));
  if (inbound) out.push(n?.ingress_allow_platform === false ? t('sb.w.noLocal') : t('sb.w.platform'));
  if (inbound && n?.mode !== 'restricted') out.push(t('sb.w.otherPorts'));
  if (n?.udp === 'deny') out.push(t('sb.w.udp'));
  const p = b.process;
  if (p?.max_memory) out.push(t('sb.w.memory', { v: p.max_memory }));
  if (p?.max_pids !== undefined) out.push(t('sb.w.pids', { v: p.max_pids }));
  if (p?.max_open_files !== undefined) out.push(t('sb.w.files', { v: p.max_open_files }));
  if (p?.max_cpu) out.push(t('sb.w.cpu', { v: p.max_cpu }));
  if (p?.max_file_size) out.push(t('sb.w.fileSize', { v: p.max_file_size }));
  if (p?.private_tmp) out.push(p.tmp_size ? t('sb.w.tmpSize', { v: p.tmp_size }) : t('sb.w.tmp'));
  return out.length ? out : [t('sb.w.nothing')];
}

/** The missing host parts in words ("the sandbox runtime, the firewall tool"). */
export function partsText(t: T, parts: readonly HostPart[]): string {
  return parts.map((p) => t(`sb.part.${p}` as Key)).join(t('sb.partsJoin'));
}
