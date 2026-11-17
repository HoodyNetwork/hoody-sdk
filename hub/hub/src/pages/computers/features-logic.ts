// Pure rules of a computer's features (the Overview's Features section): no React, no I/O.
//
// Contract, in plain words:
//   - FEATURES is every per-computer feature the Hoody API keeps, in the order the section lists them. Every one is a
//     row whether it is on or off. A row whose value the computer's row does not give is "Not known", never off.
//   - TOGGLES are the ones the API changes after the computer is made, with PUT /computers/:id: AI, the RAM disk and
//     starting with its server. The Hoody Kit and the developer kit are chosen when the computer is made and never
//     change. KVM has its own route and its own flow (the VMs page's, through its links).
//   - toggleBlock says why a switch is off limits before anything is sent: the computer has expired, this session may
//     not change computers, the computer's project is proven to be someone else's, or the Hub runs inside a frame. Anything else is the API's to refuse, and its refusal is shown.
//   - featureVerdict is the proof of a change on a fresh computers list: the row shows the asked value. A row that
//     still shows the old value proves nothing (a request still on its way reads the same).
//   - Turning the RAM disk off is confirmed first: what is kept in it may be lost.
import type { Computer } from './types';

export const FEATURES = ['hoody_kit', 'dev_kit', 'ai', 'ramdisk', 'autostart', 'kvm'] as const;
export type FeatureId = (typeof FEATURES)[number];

export const TOGGLES = ['ai', 'ramdisk', 'autostart'] as const;
export type Toggle = (typeof TOGGLES)[number];
export const isToggle = (v: unknown): v is Toggle => typeof v === 'string' && (TOGGLES as readonly string[]).includes(v);

/** What the computer's row says about a feature: on, off, or null when the row does not say. */
export function featureValue(c: Partial<Record<FeatureId, unknown>>, id: FeatureId): boolean | null {
  const v = c[id];
  return typeof v === 'boolean' ? v : null;
}

/** The computer's server ended or was reinstalled: none of its settings can change. */
export function expiredOf(c: Pick<Computer, 'server_expired' | 'status'>): boolean {
  return c.server_expired === true || c.status === 'host_reinstalled';
}

/** Why a feature switch cannot be pressed here. */
export type ToggleBlock = 'expired' | 'notOwner' | 'noRight' | 'framed';

/** `notOwner` only when it is proven: the computer's project names an owner and it is not this account (the API lets
 *  only the project's owner change a computer). Unknown owner: not blocked, and the API's refusal is shown. */
export function toggleBlock(o: { expired: boolean; canWrite: boolean; framed: boolean; notOwner?: boolean }): ToggleBlock | null {
  if (o.expired) return 'expired';
  if (o.notOwner) return 'notOwner';
  if (!o.canWrite) return 'noRight';
  if (o.framed) return 'framed';
  return null;
}

/** Whether the change is confirmed before it is sent. */
export function needsConfirm(feature: Toggle, on: boolean): boolean {
  return feature === 'ramdisk' && !on;
}

/** A feature change as its held change shows it. */
export interface FeatureIdentity { readonly computer: string; readonly feature: Toggle; readonly on: boolean }

const rec = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export const isFeatureIdentity = (v: unknown): v is FeatureIdentity => {
  const r = rec(v);
  return !!r && typeof r.computer === 'string' && r.computer !== '' && isToggle(r.feature) && typeof r.on === 'boolean';
};

/** A read-back's verdict on a change (core's ReadVerdict). */
export type ReadVerdict = 'applied' | 'not_applied' | undefined;

/** What a fresh computers list proves about a feature change: applied when the computer's row shows the asked value. */
export function featureVerdict(identity: unknown, rows: readonly unknown[]): ReadVerdict {
  if (!isFeatureIdentity(identity)) return undefined;
  const row = rows.map(rec).find((r) => r?.id === identity.computer);
  if (!row) return undefined;
  const now = row[identity.feature];
  return typeof now === 'boolean' && now === identity.on ? 'applied' : undefined;
}
