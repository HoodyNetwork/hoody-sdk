// Boots @core for the terminal app. Fixtures flavour: the same fixture world and page fixture states the web's dev
// server, shots and specs use (app/core-boot.ts does this for the browser; the lock-host and DOM parts stay there).
import { FIXTURE_REALM, bootFixtureCore, containersRoute, fixtureWorld, reply } from '@core';
import { bootPageOrder, fixtureStore, loadCoreRules, resetFixtureServers } from '@app/fixtures';
import { loggingOut, realm as selectedRealm } from '../../core/ctx';
import { disposeCoreSession } from '../../core/dispose';
import { configureLifecycle } from '../../core/lifecycle';
import { installTransport } from '../../core/transport';
import type { TermBoot } from './lifecycle';

export interface FixtureBoot {
  /** Page ids the app serves. */
  pageIds: readonly string[];
  /** The page opened first: its fixture rules win over other pages' defaults. */
  page: string;
  /** The fixture state (the `fx` name of the web shots); null is each page's default. */
  fx: string | null;
}

/**
 * The computer list of a realm the person switched to. The pages' default states answer the list with the rows of the
 * realm the Hub opens on, whatever realm asked; the Hub then keeps only the selected realm's rows, so after a switch the
 * top bar said "No computers yet" beside a realm menu that counted three. On any other single realm the fixture world's
 * own computers of that realm answer first. Default states only: a named state (failed, empty, slow) keeps its own list.
 */
const otherRealmComputers = reply(containersRoute, () => {
  const r = selectedRealm();
  return { status: 200, body: { data: { computers: fixtureWorld.computers.filter((c) => c.realm_ids.includes(r)) } } };
}, { when: () => { const r = selectedRealm(); return r !== 'all' && r !== FIXTURE_REALM; } });

/** `end`: the lifecycle's way to end the mount (app/lifecycle.ts TermBoot.start); without it (a test render) the
 *  page stays where it is. */
export async function bootTermFixtures(o: FixtureBoot, end?: (why: 'expired' | 'signed-out') => void): Promise<void> {
  if (!__HUB_FIXTURES__) throw new Error('TERM_FIXTURES_OFF: this build carries no fixtures');
  // Core leaves the page when the session ends (sign-out, "Sign in again" after a password change): its default is
  // window.location.replace, which a terminal does not have. As the live boot does (boot.live.ts), the mount ends.
  configureLifecycle({ navigate: () => { end?.(loggingOut() ? 'signed-out' : 'expired'); }, herePath: () => '/' });
  fixtureStore.set({ state: o.fx, latency: 'instant' });
  // A boot is a new session: each page's fake server forgets the last one (app/fixtures.ts resetFixtureServers).
  await resetFixtureServers(o.pageIds);
  const pages = await loadCoreRules(bootPageOrder(o.pageIds, `#/${o.page}`), o.fx);
  const t = bootFixtureCore({ rules: o.fx === null ? [otherRealmComputers, ...pages] : pages, keepStorage: true });
  t.setExtraDelay(0);
}

/**
 * The fixture boot as the lifecycle takes it (lifecycle.ts TermBoot). Dispose ends core's session as a mount teardown
 * does (purge, every per-session reset) and drops the fixture transport, so the next mount boots clean.
 */
export function fixtureBoot(o: FixtureBoot): TermBoot {
  return {
    start: (_session, end) => bootTermFixtures(o, end),
    async dispose(reason) {
      try { await disposeCoreSession(reason); } finally { configureLifecycle({ navigate: () => {}, herePath: () => '/' }); installTransport(null); }
    },
  };
}
