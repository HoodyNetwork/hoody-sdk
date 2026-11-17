// routing.ts: whether a computer's routing node may be used for new requests right now
// (a withheld server is never used).
//
// Contract:
//   - The evidence is the latest ACCEPTED computer row for this account: a current, successful read that holds the row
//     (noteRoutingRows). It records the row's routing node (hosts.ts routingNode: the flat server_name), or '' when the row
//     withholds it (null, missing, empty or not a string). A failed read, a read still pending, and a list that does not
//     hold the computer record nothing: the earlier evidence stands.
//   - routingAllows(container, server): true while no row of the shown account was accepted for the computer (nothing is
//     known against the target's own server), or while the latest row names exactly `server`. A row that withholds the
//     server suspends every new request to the computer; a row that names another server suspends new requests to the
//     old one (new requests use the new one). Requests already sent are never touched here: they finish on their own.
//   - kit.ts admit() asks it for every agent and kit call (api, streams and their reconnects, uploads, bash jobs), at the
//     moment the call is admitted, so a target frozen earlier (an engine's io, a shell-jobs io) cannot bypass it. A
//     suspended call is refused unsent with the code a target with no server gets (NO_AGENT_URL / NO_KIT_URL).
//   - Scoped to the account: evidence is kept per account and dropped on every generation bump except a realm switch or
//     fallback (the rows are the same computers' rows in every realm) and the fixture transport's late bump. Session
//     disposal drops it all (dispose.ts).
import { onBump, snapshot } from './ctx';
import { createListeners } from './listeners';
import { routingNode } from './hosts';

const KEEP_ON: ReadonlySet<string> = new Set(['switch', 'fallback', 'late']);
const ev = new Map<string, string>();
const listeners = createListeners();
let rev = 0;
const keyOf = (account: string, container: string) => `${account}\u0000${container}`;

/** Accepts the rows of a current, successful read of `account`'s computers. Rows that are not objects with a string id are skipped. */
export function noteRoutingRows(account: string | null | undefined, rows: readonly unknown[]): void {
  if (!account) return;
  let moved = false;
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const id = (r as { id?: unknown }).id;
    if (typeof id !== 'string' || !id) continue;
    const node = routingNode(r as { server_name?: unknown });
    const k = keyOf(account, id);
    if (ev.get(k) === node) continue;
    ev.set(k, node);
    moved = true;
  }
  if (moved) { rev++; listeners.emit(); }
}

/** The latest accepted routing node of the computer for the shown account: '' when withheld, null when no row was accepted. */
export function routingOf(container: string): string | null {
  const a = snapshot().account;
  if (!a) return null;
  const v = ev.get(keyOf(a, container));
  return v === undefined ? null : v;
}

/** Whether a new request to `container` on `server` may be sent now (see the contract). */
export function routingAllows(container: string, server: string | null | undefined): boolean {
  const v = routingOf(container);
  if (v === null) return true;
  return v !== '' && v === server;
}

/** Moves whenever the evidence changes. */
export function routingRev(): number { return rev; }
export function onRouting(fn: () => void): () => void { return listeners.add(fn); }

/** Session disposal and tests: every row forgotten. */
export function resetRouting(): void {
  if (!ev.size) return;
  ev.clear();
  rev++;
  listeners.emit();
}

onBump((reason) => { if (!KEEP_ON.has(String(reason))) resetRouting(); });
