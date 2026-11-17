// When a server's room can grow: a free slice always (a paid plan
// exists for it), a paid shared slice only near or at its limit,
// a whole machine never (nothing bigger is sold for it). The kit UpgradeLink still decides who may see it.
import { upgradeProminence, type UpgradeAvailable, type UpgradeProminence } from '@kit';
import type { LaneReading } from '@core';
import { serverFull, serverKey, serverLabel } from '../logic';
import type { Computer, Server } from '../types';

export interface Upgrade {
  available: UpgradeAvailable;
  prominence: UpgradeProminence;
}

const NONE: Upgrade = { available: 'none', prominence: 'quiet' };
const finite = (p: number | null | undefined): p is number => typeof p === 'number' && Number.isFinite(p);

/** The room upgrade of a server: `full` as the page already reads it; `more` are other shares used (0-100) shown beside
 *  it (the server panel's CPU, memory and disk), so the piece turns near with whichever meter is highest. */
export function roomUpgrade(r: { free: boolean; kind?: Server['kind']; cap: Server['cap'] }, full: boolean, more: Array<number | null> = []): Upgrade {
  if (r.kind === 'metal') return NONE;
  const pcts = [r.cap && r.cap.max > 0 ? (r.cap.used / r.cap.max) * 100 : null, ...more].filter(finite);
  const prominence = upgradeProminence(pcts.length ? Math.max(...pcts) : null, full);
  return { available: r.free || prominence !== 'quiet' ? 'plan' : 'none', prominence };
}

/** The AI upgrade of a server card: only near or full (a lane at 75 % or more), never quiet. */
export function aiUpgrade(lanes: LaneReading[]): Upgrade {
  const pcts = lanes.filter((l) => !l.off).map((l) => l.pct).filter(finite);
  if (!pcts.length) return NONE;
  const top = Math.max(...pcts);
  const prominence = upgradeProminence(top, top >= 100);
  return prominence === 'quiet' ? NONE : { available: 'plan', prominence };
}

/** A computer's server in the servers list: by id, else by name (as the list's Plan filter joins them). */
export function serverOf(c: Computer, servers: readonly Server[] | undefined): Server | undefined {
  if (!servers) return undefined;
  const key = serverKey(c);
  const name = serverLabel(c).name;
  return servers.find((x) => x.id === key) ?? (name ? servers.find((x) => x.name === name) : undefined);
}

/** A computer's size upgrade is its server's: the server's room rule, turned near by the computer's own
 *  meters (`more`). An unknown server offers nothing. */
export function computerUpgrade(server: Server | undefined, more: Array<number | null> = []): Upgrade {
  return server ? roomUpgrade(server, serverFull(server), more) : NONE;
}

/** The near-only piece of a computer card: only near or full from the card's own meters, on a server
 *  that can grow; never quiet. */
export function cardUpgrade(server: Server | undefined, meters: Array<number | null>): Upgrade {
  if (!server || server.kind === 'metal') return NONE;
  const pcts = meters.filter(finite);
  if (!pcts.length) return NONE;
  const top = Math.max(...pcts);
  const prominence = upgradeProminence(top, top >= 100);
  return prominence === 'quiet' ? NONE : { available: 'plan', prominence };
}

/** The account's computer slots as the summary strip shows them: used and max summed over every server that
 *  reports its room, whole machines included. */
export function slotsOf(servers: readonly Server[] | undefined): { used: number; max: number } {
  return (servers ?? []).reduce((a, x) => (x.cap ? { used: a.used + x.cap.used, max: a.max + x.cap.max } : a), { used: 0, max: 0 });
}

/** The strip's room link, read from the same total the strip shows (so "Full" never sits beside room that is left). Offered
 *  only when a server that can grow is among them. Below 75 % it is quiet with a free slice among them and absent without
 *  one; near from 75 %, full when every slot is used. */
export function slotsUpgrade(servers: readonly Server[] | undefined): Upgrade {
  const rows = (servers ?? []).filter((x) => x.cap);
  const total = slotsOf(rows);
  if (total.max <= 0 || !rows.some((x) => x.kind !== 'metal')) return NONE;
  return roomUpgrade({ free: rows.some((x) => x.free), cap: total }, total.used >= total.max);
}

/** The create form's line under the server field: always quiet (a form, so it never competes with the primary),
 *  and only when a server that can grow is full or no room is left anywhere. */
export function createUpgrade(servers: readonly Server[] | undefined, roomLeft: number): Upgrade {
  const growable = (servers ?? []).filter((x) => (x.status === 'active' || !x.status) && x.kind !== 'metal');
  const show = growable.some((x) => serverFull(x)) || (servers !== undefined && roomLeft === 0 && growable.length > 0);
  return show ? { available: 'plan', prominence: 'quiet' } : NONE;
}
