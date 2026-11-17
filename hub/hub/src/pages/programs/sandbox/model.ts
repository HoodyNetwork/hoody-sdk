// What GET /programs/{id}/sandbox says, read honestly (the daemon's status read and
// openapi SandboxStatus). The status reports the STORED policy (configured), what the daemon would build from it at
// launch (rev, effective) and the inbound firewall read back (firewall, live). It never reports whether the running
// process is the sandboxed one, so nothing here says it is: the strongest chip is "Policy set".
import { isObj, missingParts, readBlock, type HostPart, type HostSupport, type SandboxBlock } from './block';

export type Firewall = 'ok' | 'degraded' | 'draining' | 'none';

export interface SandboxStatus {
  /** The stored block exactly as persisted; null when the program has none. */
  configured: SandboxBlock | null;
  /** The policy revision (12 hex) when the stored block resolves to an effective policy; null otherwise. */
  rev: string | null;
  /** The diagnostic argument vectors the daemon builds from the policy (null whenever rev is null). */
  effective: { bwrap: string[]; scope: string[] } | null;
  /** The inbound rules read back from the kernel. */
  live: { tablePresent: boolean; chain: string | null; rules: unknown[] };
  firewall: Firewall;
  /** Every reason firewall is degraded, verbatim. */
  problems: string[];
}

const strings = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null);
const REV = /^[0-9a-f]{12}$/;

/** Parses the status answer. null when it is not the documented shape: a malformed answer is never read as
 *  "not sandboxed" or as "policy set" (the chip shows Checking). */
export function readStatus(w: unknown): SandboxStatus | null {
  if (!isObj(w) || w.success !== true) return null;
  // The daemon always sends `configured` (null for none): an answer without it is malformed (readBlock: undefined),
  // never "no policy" (a removal must not be proved by a garbled answer).
  const configured = readBlock(w.configured);
  if (configured === undefined) return null;
  const fw = w.firewall;
  if (fw !== 'ok' && fw !== 'degraded' && fw !== 'draining' && fw !== 'none') return null;
  const problems = strings(w.problems);
  if (!problems) return null;
  // The daemon's own invariant: problems is empty exactly when firewall is not degraded. An answer that breaks it
  // is not trusted as clean; it is read as degraded (the problems still show).
  const firewall: Firewall = problems.length > 0 ? 'degraded' : fw;
  // Every documented field is required (the daemon always sends them): a
  // missing one, or a live read-back of the wrong shape, is malformed, never a clean default.
  if (!('rev' in w) || !('effective' in w) || !isObj(w.live)) return null;
  if (typeof w.live.table_present !== 'boolean' || !Array.isArray(w.live.rules) || (w.live.chain !== null && typeof w.live.chain !== 'string')) return null;
  let rev: string | null = null;
  if (w.rev !== null) {
    if (typeof w.rev !== 'string' || !REV.test(w.rev)) return null;
    rev = w.rev;
  }
  let effective: SandboxStatus['effective'] = null;
  if (isObj(w.effective)) {
    const b = strings(w.effective.bwrap_argv) ?? [];
    const s = strings(w.effective.scope_argv) ?? [];
    effective = { bwrap: b, scope: s };
  }
  const l = isObj(w.live) ? w.live : {};
  const live = {
    tablePresent: l.table_present === true,
    chain: typeof l.chain === 'string' ? l.chain : null,
    rules: Array.isArray(l.rules) ? l.rules : [],
  };
  return { configured, rev, effective, live, firewall, problems };
}

/** The UNCONFINED hold line (from the daemon's status read): an earlier definition of this program may still
 *  be running without its confinement. Shown on its own, prominently. */
export function isUnconfinedLine(p: string): boolean {
  return /\bUNCONFINED\b/.test(p);
}

export type Chip = 'none' | 'set' | 'setDisabled' | 'inactive' | 'draining' | 'cantStart' | 'problem' | 'checking';

export interface ChipInput {
  /** The status answer; null while not read, when the read failed or the answer was malformed. */
  status: SandboxStatus | null;
  /** The program is enabled (from the overview row). */
  enabled: boolean;
  /** The host's sandbox parts; null when /health was not read. */
  host: HostSupport | null;
}

/** The list chip. Precedence: Problem > Can't start > Old rules draining > Restricts nothing > Policy set > None,
 *  and Checking whenever there is no trustworthy answer. Degraded always wins. A host that was not checked does not
 *  lower "Policy set": a launch that lacks a part fails closed (the program does not run unconfined). */
export function chipOf({ status, enabled, host }: ChipInput): Chip {
  if (!status) return 'checking';
  if (status.firewall === 'degraded' || status.problems.length > 0) return 'problem';
  if (status.rev !== null && enabled) {
    const miss = missingParts(status.configured, host);
    if (miss && miss.length > 0) return 'cantStart';
  }
  if (status.firewall === 'draining') return 'draining';
  if (status.rev === null) return status.configured ? 'inactive' : 'none';
  return enabled ? 'set' : 'setDisabled';
}

export const CHIP_TONE: Readonly<Record<Chip, 'ok' | 'warn' | 'danger' | 'neutral'>> = {
  none: 'neutral',
  set: 'ok',
  setDisabled: 'neutral',
  inactive: 'warn',
  draining: 'warn',
  cantStart: 'danger',
  problem: 'danger',
  checking: 'neutral',
};

/** The missing parts the panel names (rev set and the host checked); [] otherwise. */
export function missingFor(status: SandboxStatus | null, host: HostSupport | null): HostPart[] {
  if (!status || status.rev === null) return [];
  return missingParts(status.configured, host) ?? [];
}
