// bun test preload for *.term.test.ts(x): strict globals FIRST (the same default mode the ship bundle's first module and
// dev.ts install: no harness mode, nothing measured in a configuration users do not run), then the terminal loader (dev
// flavour, fixtures) and the terminal host env. A trap is a failed mount (app/lifecycle.ts): fix it in the file
// that reads the global, never add an allowance to quiet it. Then the network/subprocess/environment fence.
// The OS network boundary before anything else (netns-first.ts): outside a loopback-only network
// namespace the whole `bun test` re-runs inside one (or refuses); the JS fence below is the early diagnostic.
import './netns-first';
import '../../src/term/env/install-strict';
import { installNetGuard } from './test-net-guard';

// The outside-world fence next (test-net-guard.ts): minimal environment, isolated HOME, no
// outbound network beyond a listener the test opened, no subprocess. Before the loader and anything it pulls in.
await installNetGuard();
const path = (await import('node:path')).default;
const { installTermLoader } = await import('./loader');
const { SRC } = await import('./resolve');

installTermLoader({ flavour: 'dev', fixtures: true });
await import(path.join(SRC, 'term/env/preinstall.ts'));
// Router-core's scroll restoration calls scrollTo unguarded on every memory-router mount (tests that mount a router
// without App.tsx printed 'scrollTo is not defined'): the same no-op the app installs.
await import(path.join(SRC, 'term/env/router-globals.ts'));

// A trap a test did not declare fails that test, even when the code that read the global caught the throw (strict-globals.ts
// says so; it was once not enforced). A test that traps on purpose calls expectTraps(name | '*') first.
{
  const { afterEach, beforeEach } = await import('bun:test');
  const sg = await import(path.join(SRC, 'term/env/strict-globals.ts')) as typeof import('../../src/term/env/strict-globals');
  let mark = 0;
  beforeEach(() => { mark = sg.trapJournalMark(); sg.resetExpectedTraps(); });
  afterEach(() => { sg.trapTeardown(mark); });
  sg.markTrapTeardownRegistered();
}

// The fixture clock never outlives the test that pinned it (clock.ts): bun runs every test
// file in one process, and a frozen Date.now or seeded randomUUID left by one test broke the timing of later files.
// A renderPage session still open across tests keeps it (holdFixtureClock) until it closes. bun has no per-file hook in
// a preload (its afterAll runs once, after the last file), so this runs after every test.
{
  const { afterEach } = await import('bun:test');
  const { thawClock } = await import('./clock');
  afterEach(() => { thawClock(); });
}

// The Agent dock's open state never outlives the test that opened it (kit/ask.ts keeps it for the process, and in the
// host's storage): a dock left open by one file was open at the first frame of every later file (ten
// page tests red after one Ask test; "q ends the mount" in a mixed process).
{
  const { afterEach } = await import('bun:test');
  const ask = await import(path.join(SRC, 'kit/ask.ts')) as typeof import('../../src/kit/ask');
  afterEach(() => { ask.resetAskForTests(); });
}
