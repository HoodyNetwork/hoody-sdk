// The terminal Hub's fixture entry: development runners (scripts/term/dev.ts, render.ts), termshot runners and tests.
// Never reachable from entry.live.ts (the ship build checks its module graph). A fixtures client boots core on the
// fixture world (the one the web's dev server and shots use) and sends nothing.
import './env/preinstall';
import { fixtureBoot } from './app/boot';
import { mountWith, type MountExtras } from './entry.live';
import type { HoodyClient, HubTermOptions, Receipt } from './host-types';

export { createTermApp, type TermAppOptions } from './app/App';
export { bootTermFixtures, fixtureBoot } from './app/boot';
export { pageFailures } from './app/router';
export { runTerm, type TermExit, type TermRun, type TermRunOptions } from './app/run';
export { ensureStrictGlobals, startTermHub, strictTraps, type TermBoot, type TermHub, type TermHubEnd, type TermHubOptions } from './app/lifecycle';
export { hostServicesOf, streamsOf } from './app/host-io';

const FIXTURES = Symbol.for('hoody.term.fixtureClient');

/** A client that boots the fixture world: `fx` is a fixture state name (null: each page's default). Sends nothing. */
export interface FixtureClient extends HoodyClient {
  readonly [FIXTURES]: { fx: string | null };
}

export function fixtureClient(o: { fx?: string | null } = {}): FixtureClient {
  const notSent = () => Promise.reject({ status: 0, notSent: true });
  return {
    [FIXTURES]: { fx: o.fx ?? null },
    identity: { kind: 'account', uid: 'fixture', sid: 'fixture' },
    realmApiDomain: 'fixtures.invalid',
    request: notSent,
    fetch: notSent,
  };
}

const isFixtureClient = (c: HoodyClient): c is FixtureClient => typeof (c as Partial<FixtureClient>)[FIXTURES] === 'object';

/** mountTerminalHub on the fixture world. Refuses any other client (TERM_FIXTURE_CLIENT_REQUIRED). */
export function mountFixtureHub(o: HubTermOptions & MountExtras): Promise<Receipt> {
  if (!isFixtureClient(o.client)) return Promise.reject(new Error('TERM_FIXTURE_CLIENT_REQUIRED'));
  const fx = o.client[FIXTURES].fx;
  return mountWith(o, (route, pages) => fixtureBoot({ pageIds: pages.map((p) => p.id), page: route.page, fx }));
}
