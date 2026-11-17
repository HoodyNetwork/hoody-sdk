// The demo boot (lifecycle.ts TermBoot): core on a sample account that lives in the host's memory (`hoody hub --demo`).
// Its own file on purpose: boot.live.ts and its rules for a real account (the pinned realm, the refused kit and agent
// leg, the fence) are not touched and not shared. Only a client that carries the demo mark gets this boot
// (entry.demo.ts refuses any other), and a demo client holds no credential and sends nothing: every answer is its own.
//
// What differs from the live boot, and why it is safe here only:
//   - no realm pin: the sample account's realm list and names load from the client, and the switcher works;
//   - a proxy domain, the reserved DEMO_PROXY_DOMAIN: kit and agent reads are built for it and handed to the client,
//     which answers them from memory. `.invalid` never resolves, so a leak would reach nobody;
//   - realm marks: a colour is a preference of the device, and this device has none for the sample account, so the
//     sample realms take DEMO_TINTS in list order (kept in the mount's memory store, never on disk);
//   - the selected realm at the start is the recorded one (DEMO_CONTEXT.realmId): the sample data lives there;
//   - the current computer is the one the host names (no membership read: the sample account is the host's own data).
// What it shares with the live terminal: no payment is made here. The demo installs its own gate (core/live-gate.ts)
// that lets every direct change through as it is (the demo client refuses each one before anything is sent) and
// refuses no request early; it is installed so the checkout and Add funds draw the live terminal's hand-off to the web
// Hub (pages/billing/parts/moneyHandoff.term.tsx) instead of a Confirm the demo would refuse. Dispose removes it only
// while it is still the installed one.
// No fixture module is imported here or below.
import { bootLive, configureLifecycle, initLive } from '../../core/lifecycle';
import { loggingOut, setTarget } from '../../core/ctx';
import { disposeCoreSession } from '../../core/dispose';
import { RE24 } from '../../core/realm-id';
import { list as realmList, setTint, type RealmColor } from '../../core/realm';
import { localStore } from '../../core/host-env';
import { installShared, shared } from '../../core/session';
import { installTransport } from '../../core/transport';
import { routingNode, setProxyDomain } from '../../core/hosts';
import { clearLiveGate, setLiveGate, type LiveGate } from '../../core/live-gate';
import { clientShared } from '../env/client-shared';
import type { HoodyClient, HubTermContext } from '../host-types';
import type { TermBoot } from './lifecycle';
import { bootFailure } from './boot-code';
import { setDemoMounted } from './demo-flag';

/** The only proxy domain a demo mount builds computer addresses for (RFC 2606: never resolves). */
export const DEMO_PROXY_DOMAIN = 'demo.invalid';
/** The mark of a demo client (a registered symbol: the host's module and the bundle's see the same one). */
export const DEMO_CLIENT = Symbol.for('hoody.term.demoClient');
export const isDemoClient = (c: HoodyClient): boolean => (c as unknown as Record<symbol, unknown>)[DEMO_CLIENT] === true;

/** The marks of the sample realms, in list order (a real account's come from the device's own choices). */
export const DEMO_TINTS: readonly RealmColor[] = ['teal', 'orange', 'purple', 'blue', 'green', 'pink', 'red'];

/** core/realm.ts's key of the selected realm (registry row `hub_realm_v1`; boot.demo.term.test.ts holds the two together). */
const REALM_SELECTION_KEY = 'hub_realm_v1';

const notSent = () => ({ status: 0, notSent: true, stale: true });

export function demoBoot(client: HoodyClient, context: HubTermContext, herePath: () => string): TermBoot {
  const gate = new AbortController();
  let started = false;
  // This mount's gate, its own object: each direct change runs as it would with no gate, and nothing is refused early
  // (no `early`). Dispose takes out only this object, so a later mount's gate stays in (a test that ends the session
  // itself frees the slot at once, while this boot's dispose runs later).
  const demoGate: LiveGate = { direct: (_site, _place, send) => send(undefined) };
  return {
    async start(session, end) {
      if (!isDemoClient(client)) throw new Error('TERM_DEMO_CLIENT_REQUIRED');
      for (const v of [context.projectId, context.containerId]) if (v !== undefined && !(typeof v === 'string' && RE24.test(v))) throw new Error('TERM_CONTEXT_INVALID');
      started = true;
      setDemoMounted(true);
      setLiveGate(demoGate);
      setProxyDomain(DEMO_PROXY_DOMAIN);
      installShared(clientShared(client, session, gate.signal, { authEnded: () => end('signed-out') }));
      const live = (): boolean => !gate.signal.aborted && session.live();
      installTransport({
        hoody: (method, url, body, opts) => (live() ? shared().apiCall(method, url, body === null ? undefined : body, null, undefined, opts) : Promise.reject(notSent())),
        fetch: (url, init) => (live() ? client.fetch(url, init, { session: { sid: client.identity.sid, generation: 0 }, signal: gate.signal, beforeWire: live }) : Promise.reject(notSent())),
      });
      configureLifecycle({ navigate: () => { end(loggingOut() ? 'signed-out' : 'expired'); }, herePath });
      // The demo opens in the realm its sample data was recorded in, as a returning person's selection would
      // (core restores it and keeps it only once the realm list names it; the mount's store is memory).
      if (typeof context.realmId === 'string' && RE24.test(context.realmId)) localStore().setItem(REALM_SELECTION_KEY, context.realmId);
      initLive();
      const boot = await bootLive();
      if (boot.state !== 'ready') throw bootFailure(boot.state);
      await boot.realms;
      (realmList() ?? []).forEach((id, i) => { setTint(id, DEMO_TINTS[i % DEMO_TINTS.length]!); });
      // The sample computer's row names its server: the target carries it from the first draw, so a page that reads at
      // once (Logs) never asks before the shell's computer list has answered (a target with no server has no address).
      // The demo client answers from its sample data; nothing leaves the process.
      let node = '';
      if (context.containerId) {
        const list = await client.request('GET', '/computers?page=1&limit=100', null, { session: { sid: client.identity.sid, generation: 0 }, signal: gate.signal, beforeWire: live }).catch(() => null) as { data?: { computers?: unknown[] } } | null;
        const row = list?.data?.computers?.find((r) => !!r && typeof r === 'object' && (r as { id?: unknown }).id === context.containerId);
        if (row) node = routingNode(row as { server_name?: unknown });
      }
      setTarget(context.containerId ? { project: { id: context.projectId ?? '' }, container: node ? { id: context.containerId, server_name: node } : { id: context.containerId } } : null);
    },
    closeGate: () => { gate.abort(); },
    async dispose(reason) {
      gate.abort();
      setDemoMounted(false);
      clearLiveGate(demoGate);
      try {
        if (started) await disposeCoreSession(reason);
      } finally {
        configureLifecycle({ navigate: () => {}, herePath: () => '/' });
        installShared(null);
        installTransport(null);
        setProxyDomain(null);
      }
    },
  };
}
