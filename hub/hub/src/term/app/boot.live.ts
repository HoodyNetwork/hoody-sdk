// The live boot (lifecycle.ts TermBoot): core on the host's signed-in client, as the web boots on shared.js
// (initLive, bootLive). The client keeps the credentials: core gets a Shared whose calls go through it
// (env/client-shared.ts) and never sees a token. No fixture module is imported here or below.
//
// Every request through this mount's transport is fenced (fence.ts): dispose trips the fence first, so a stuck or late
// answer settles as stale (outcome unknown) and writes no core state after the end; a boot still waiting gives up the
// same way. An answer arriving after the trip is wiped at the response boundary before it is dropped, and
// the fence's signal reaches the client, so it stops its own refresh/retry work too.
import { bootLive, configureLifecycle, initLive, onLifecycle } from '../../core/lifecycle';
import { loggingOut } from '../../core/ctx';
import { disposeCoreSession } from '../../core/dispose';
import { filterRows, pin, pinnedRealm } from '../../core/realm';
import { RE24 } from '../../core/realm-id';
import { installShared, shared } from '../../core/session';
import { installTransport } from '../../core/transport';
import { setTarget } from '../../core/ctx';
import { setProxyDomain } from '../../core/hosts';
import { localStore } from '../../core/host-env';
import { clientShared, type TermCallOpts } from '../env/client-shared';
import type { HoodyClient, HubTermContext } from '../host-types';
import type { TermBoot } from './lifecycle';
import { bootFailure } from './boot-code';
import { createFence, guardBody } from './fence';
import { api } from '../../core/api';
import { containersRoute } from '../../core/computer';
import { pageAt } from '../../core/power';
import { seamPlaces } from './live-seam';
import { liveWire, type LiveWire, type LiveWiring } from './live-wire';

/** The host's place (context.containerId) against the session's own computer list: 'none' (no place named),
 *  'unverified' (list not answered yet), 'member' (in the list: the target), 'absent' (a complete list lacks it, or it
 *  sits in another project), 'unknown' (the list could not be read, or the place is past PLACE_PAGES_MAX pages). */
export type PlaceState = 'none' | 'unverified' | 'member' | 'absent' | 'unknown';
/** The most list pages (100 rows each) the place check reads, as core's computersAll (ALL_PAGES_MAX). */
export const PLACE_PAGES_MAX = 10;

/** How long dispose waits for late answers before it reports. */
export const DRAIN_MS = 250;

const notSent = () => ({ status: 0, notSent: true, stale: true });

/** The web's stored realm choice (core realm.ts KEY, a registered local key): an id, or removed for all realms. */
const REALM_KEY = 'hub_realm_v1';
function seedSelection(realmId: string): void {
  try { if (RE24.test(realmId)) localStore().setItem(REALM_KEY, realmId); else localStore().removeItem(REALM_KEY); } catch { /* storage unavailable: all realms */ }
}

/** `wiring`: the send policy of a live mount (live-wire.ts). With it every request of both legs is
 *  admitted, bound to its wire attempt and, for a change, to its durable record. */
export function liveBoot(client: HoodyClient, context: HubTermContext, herePath: () => string, wiring?: LiveWiring): TermBoot & { place(): PlaceState; wire(): LiveWire | null } {
  const fence = createFence();
  let wire: LiveWire | null = null;
  const fenced = fence.fenced;
  const trip = fence.trip;
  let started = false;
  let suspended = false;
  let offLifecycle: (() => void) | null = null;
  let place: PlaceState = 'none';
  /** Reads the session's computer list (page by page, PLACE_PAGES_MAX at most, through the fence) for the host's place;
   *  sets the target only when the list holds it. Absent from a complete list: 'absent'; unreadable or past the cap: 'unknown'. */
  const verifyPlace = async (containerId: string, projectId: string | undefined): Promise<void> => {
    for (let page = 1; page <= PLACE_PAGES_MAX; page++) {
      if (fence.tripped()) return;
      const got = pageAt(await fenced(api(containersRoute, { query: { page, limit: 100 } })), page);
      if (fence.tripped()) return;
      // In the pinned realm's rows only, by the shell's own rule (core filterRows: what the switcher shows).
      const row = filterRows(got.rows.filter((r) => r.id === containerId), context.realmId)[0];
      if (row) {
        if (projectId !== undefined && row.project_id !== projectId) { place = 'absent'; return; }
        setTarget({ project: { id: projectId ?? (typeof row.project_id === 'string' ? row.project_id : '') }, container: { id: containerId } } as Parameters<typeof setTarget>[0]);
        place = 'member';
        return;
      }
      if (got.complete) { place = 'absent'; return; }
    }
    place = 'unknown';
  };
  return {
    async start(session, end) {
      // The client's places are checked before anything else: an API origin that is not
      // https, a realm API or proxy domain that is not a bare host name, or a proxy domain
      // nested with the API host or the realm API domain refuses the boot (SeamRefusal TERM_API_ORIGIN /
      // TERM_REALM_DOMAIN / TERM_PROXY_DOMAIN). Nothing is installed or sent before it.
      const places = seamPlaces(client);
      // The host's place is checked at ingress, before anything starts: a project or computer id is exactly
      // 24 lower-case hex characters, else the mount refuses to boot. The computer id feeds the shell's target and
      // every hand-off's place; a token-shaped or otherwise free value never enters either.
      for (const v of [context.projectId, context.containerId]) if (v !== undefined && !(typeof v === 'string' && RE24.test(v))) throw new Error('TERM_CONTEXT_INVALID');
      // The send policy over the checked places (it refuses the same bad places itself); nothing is installed yet.
      if (wiring) wire = liveWire(client, session, fence, wiring);
      started = true;
      // No browser page to read routing from: the proxy domain is set, never discovered.
      // It is the client's (the host read it from GET /api/v1/hub/config), checked above. With one, every
      // computer address is built from it (core/hosts.ts) and the kit and agent legs go out through `client.fetch`
      // below; with none it is '': every computer port address is empty and computer pages show "unavailable" with
      // no `document` read (core hosts.ts reads the page only while no override is set).
      setProxyDomain(places.proxyDomain ?? '');
      wire?.install();
      // The end keeps its provenance: the first reason heard wins: the client's notice, else the reason of the purge
      // core ran (its own sign-out 'signout', an expiry 'expiry'); core's navigation alone never decides it.
      let endedAs: 'signed-out' | 'expired' | null = null;
      const finish = (why: 'signed-out' | 'expired') => { endedAs ??= why; end(endedAs); };
      installShared(clientShared(client, session, fence.signal, {
        purged: (r) => { if (r === 'signout') endedAs ??= 'signed-out'; else if (r === 'expiry') endedAs ??= 'expired'; },
        // Any identity kind: core's purge follower leaves token sessions alone, so the notice ends the mount itself.
        authEnded: finish,
        // A change sent past the send policy (core's Shared called directly) is still refused unsent while this Hub
        // records no change (read-only by choice, a second Hub, or no usable store), with the policy's own codes for it.
        unwired: (method) => {
          const mode = wire && !/^(GET|HEAD)$/i.test(method) ? wire.storeMode() : 'rw';
          return mode === 'rw' ? null : { status: 0, notSent: true, code: mode === 'ro' ? 'TERM_READ_ONLY' : 'NOT_DURABLE' };
        },
      }));
      installTransport(wire ? wire.transport : {
        // A call made after the gate closed never reaches the client (refused unsent).
        // The call's own timeout is the fence's deadline: it fires before core's bound (timeoutMs + slack), so an
        // answer core already gave up on is wiped at this boundary, never dropped unscrubbed.
        // Each call carries its own ended signal: aborted before its consumer hears the timeout or the trip, it
        // makes the call's alive false and aborts the client's signal, so a held first send or retry never leaves.
        // `live` also holds the call's elapsed deadline: past it, every wire check refuses, timer or not.
        hoody: (method, url, body, opts) => (fence.tripped() ? Promise.reject(notSent()) : fence.run((ended, live) => {
          const inner = opts.alive;
          const o: TermCallOpts = { ...opts, alive: () => live() && (typeof inner !== 'function' || inner()), signal: ended };
          return shared().apiCall(method, url, body === null ? undefined : body, null, undefined, o);
        }, { deadlineMs: opts.timeoutMs })),
        // No deadline of its own on this leg: the caller's (kit timeout, upload cancel, stream-open timeout) arrives as
        // init.signal and is joined into the call's ended signal: the moment the caller gives up,
        // the client's signal aborts, beforeWire answers false (a held first send or retry never leaves) and the consumer
        // settles with the signal's reason; a later answer is wiped. The Response keeps that cancellation through its body
        // (guardBody). The trip ends it all the same way.
        fetch: (url, init) => (fence.tripped() ? Promise.reject(notSent()) : fence.run((ended, live) => client.fetch(url, init, {
          session: { sid: client.identity.sid, generation: 0 },
          signal: ended,
          beforeWire: () => live() && session.live(),
        }).then((res) => guardBody(res, ended)), { signal: init.signal ?? null })),
      });
      // Core leaves the page when the session ends: the mount ends with the reason the purge carried (above); with no
      // purge seen, core's own leaving flag decides (a sign-out it started), else expired.
      configureLifecycle({ navigate: () => { finish(endedAs ?? (loggingOut() ? 'signed-out' : 'expired')); }, herePath });
      // A 403 ACCOUNT_BANNED shows the suspended screen in place (core suspend()); the end reason reports it.
      offLifecycle = onLifecycle((e) => { if (e.kind === 'suspended') suspended = true; });
      // The realm. A TOKEN session is held to its one realm: initLive pins it from the session, and it is
      // pinned BEFORE boot starts any realm-dependent work, so bootLive's realm load returns at
      // once and nothing can fall back to 'all' under it; another realm asked for it is refused. An ACCOUNT session is
      // never pinned (core pin() is the token session's): the host's realm is its starting selection, written where the
      // web keeps a chosen realm before core reads it (initLive -> initRealm), so bootLive's load reads the realm list
      // and names and the person can switch (Alt+R). A selection GET /realms does not list falls back to all realms,
      // as on the web.
      const token = client.identity.kind === 'token';
      if (!token) seedSelection(context.realmId);
      initLive();
      if (token && !pin(context.realmId) && pinnedRealm() !== context.realmId) throw new Error('TERM_REALM_REFUSED');
      const boot = await fenced(bootLive());
      // Banned at launch: core answers `banned` without suspend() (nothing was on screen to suspend). The mount still
      // ends here, as suspended, never as a failed boot (endReasonOf reads this flag).
      if (boot.state === 'banned') suspended = true;
      if (boot.state !== 'ready') throw bootFailure(boot.state);
      // An account session's realm list is a real read (no pin), and it can fail (403, 503, the network, a dispose). A
      // failed list stays unknown in core (realm.ts load keeps the last list), as on the web; nothing here awaits it, so
      // its rejection is taken here and never ends the mount (run.ts treats an unhandled rejection as a crash).
      void boot.realms.catch(() => undefined);
      // Nothing during boot may have moved a token session's realm.
      if (token && pinnedRealm() !== context.realmId) throw new Error('TERM_REALM_REFUSED');
      // The shape check above is not membership: a well-formed id the session
      // cannot see must never become the target or a hand-off's place. The target stays empty (the place is held as
      // unverified) until the session's own computer list shows that computer (and its project, when one was named).
      wire?.start();
      setTarget(null);
      place = 'unverified';
      const want = context.containerId;
      if (want) void verifyPlace(want, context.projectId).catch(() => { if (place === 'unverified') place = 'unknown'; });
    },
    place: () => place,
    wire: () => wire,
    suspended: () => suspended,
    // The mount is ending: trip the fence at once (dispose trips it again, harmlessly).
    closeGate: () => { trip(); },
    // The mount's screen, before the first frame: the send policy asks it from here on (live-wiring.ts).
    screen: (ask) => { wiring?.screen?.(ask); },
    async dispose(reason) {
      trip();
      offLifecycle?.();
      offLifecycle = null;
      // Core teardown and the drain are separate cleanup steps: a teardown that throws (a crypt-settle
      // timeout, a failed reset) still lets the drain run and report, and both failures leave as their own records.
      const failures: unknown[] = [];
      try {
        if (started) await disposeCoreSession(reason);
      } catch (e) {
        failures.push(e);
      } finally {
        configureLifecycle({ navigate: () => {}, herePath: () => '/' });
        try { wire?.dispose(); } catch (e) { failures.push(e); }
        // No computer address outlives the mount (as before the boot: an empty override, never the page's).
        if (started) setProxyDomain('');
        installShared(null);
        installTransport(null);
      }
      // Late answers are reported within a bound: dispose waits at most DRAIN_MS for the answers of calls the
      // fence gave up on (the trip aborted their client signals, so a conforming client settles at once), then reports
      // what it knows, counts only, no content: wipes that kept fields, and calls still unresolved. An answer to an
      // unresolved call that comes after this is still wiped, but this mount can no longer report it; the unresolved
      // count says so instead of a clean end.
      try {
        const { incomplete: left, unresolved } = await fence.drain(DRAIN_MS);
        if (left > 0 || unresolved > 0) {
          failures.push(new Error(`TERM_WIPE_INCOMPLETE: ${left} late answer(s) kept fields the wipe could not remove; ${unresolved} call(s) unresolved at the end (a later answer is wiped unreported)`));
        }
      } catch (e) {
        failures.push(e);
      }
      // One failure as itself; several as one AggregateError the mount's teardown splits into one record each.
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) throw new AggregateError(failures, 'TERM_DISPOSE_FAILURES');
    },
  };
}
