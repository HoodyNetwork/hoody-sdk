// live-gate.ts: the slot a terminal mount installs. The live mount installs its wire's gate (term/app/live-wire.ts).
// The demo mount installs a pass-through one (term/app/boot.demo.ts): it keeps no record and refuses nothing
// early, because the demo's client refuses every change before anything is sent.
// So an installed gate says "a terminal mount runs", never "the live wire is in" (as
// pages/billing/parts/moneyHandoff.term.tsx reads it). null on the web and in fixtures: every function here is then a
// pass-through, so the web is unchanged.
//
//   - A DIRECT change is a change core sends with a plain api() call, outside `guarded` and outside an attempt hold,
//     so core keeps no record of it. Each such call site names itself with a literal constant and sends through
//     `directChange(site, target, send)`: the live wire's gate writes that site's own durable record before
//     `send` runs, and settles it by the outcome (the demo's gate runs `send` as it is). A site never chooses its
//     name from the route (else any send of a route could borrow another site's record), and never
//     names its route here: the gate knows each site's one route (core's vault guard allows a vault route only
//     inside api()).
//   - An EARLY refusal is the terminal's answer for a computer-leg send (core/kit.ts `send`) asked before the request is
//     entered, so a send the terminal would refuse reads not sent, never as a lost connection. The transport still
//     decides every request that leaves; this only answers sooner.

import type { Route } from './routes';

/** The direct sites core itself sends from (the boot-token mint goes through the terminal's producer instead). */
export type CoreDirectSite = 'agent-bootstrap' | 'realm-alias-write';
export interface DirectPlace { readonly project: string; readonly computer: string }
export interface LiveGate {
  /** The live wire's: holds the site's record, runs `send` with the record's `bind` (passed to that one api() call:
   *  CallInput.bind), settles the record. A refusal rejects `{kind: 'not_sent', notSent: true, code}`; `send` did not
   *  run. The demo's runs `send(undefined)`, as with no gate. */
  direct<T>(site: CoreDirectSite, place: DirectPlace | null, send: (bind: object | undefined) => Promise<T>): Promise<T>;
  /** The refusal the terminal would give this computer-leg route now (its code; `stale` when the mount ended), or null. */
  early?(route: Route): { readonly code: string; readonly stale?: boolean } | null;
}

let gate: LiveGate | null = null;
export function setLiveGate(g: LiveGate | null): void { gate = g; }
export function liveGateInstalled(): boolean { return gate !== null; }
/** Takes `g` out of the slot only while it is the one installed: a mount's dispose leaves a later mount's gate in. */
export function clearLiveGate(g: LiveGate): void { if (gate === g) gate = null; }

/** One direct change of `site`. Without a gate (the web, fixtures): `send()` as it is. */
export function directChange<T>(site: CoreDirectSite, place: DirectPlace | null, send: (bind: object | undefined) => Promise<T>): Promise<T> {
  const g = gate;
  return g ? g.direct(site, place, send) : send(undefined);
}

/** The terminal's early refusal of a computer-leg send, or null. Without a gate (the web, fixtures): null. */
export function liveEarlyRefusal(route: Route): { readonly code: string; readonly stale?: boolean } | null {
  const g = gate;
  return g && typeof g.early === 'function' ? g.early(route) : null;
}
