// Boots @core before the first render.
//
// Fixtures mode (hub:dev, hub:shots, page specs): core runs on fixtureWorld with the visible pages'
// core-format rules for the shown state (?fx=), and boots again when the dev toolbar changes the
// state; latency (?fxl=) becomes the transport's extra delay. This never touches shared.js.
// Live mode: core's exits keep the v3 Hub's place (hubLifecycle: sign-in carries hub=v3 and the
// page's view, a reload keeps the hash), then initLive() and bootLive() (identity, realm, watchers, 401 / superseded handling);
// a boot that is leaving the page renders nothing; an offline or purge-failed boot renders with the
// shell's panel for it (showBootPanel).
// Both modes end with the passcode gate: after the last await, right before main.tsx renders,
// a tab whose account has a passcode record locks synchronously, the lock host mirrors it onto the body, and the tab
// listens for lock messages. Fixtures mode installs it too (shots and Playwright show the lock screen).
import { bootGate, installLockHost, startLockReceiver } from '@core';
// The fixture boot straight from its (dev-only) file: '@core' is the live barrel in a production build.
import { bootFixtureCore } from '@core/fixture-boot';
import { cryptReady } from '@core/cryptStore';
import { bootLive, configureLifecycle, initLive } from '@core/shell';
import { hubLifecycle } from '../shell/hubUrl';
import { setLockBootPanel } from '../shell/LockNotices';
import { showBootPanel } from '../shell/notices';
import { focusShownTitle } from '../shell/pageHost';
import { LATENCY_MS, bootPageOrder, fixtureStore, loadCoreRules } from './fixtures';

export type CoreBoot = 'render' | 'leaving';

export async function bootCore(pageIds: readonly string[]): Promise<CoreBoot> {
  if (__HUB_FIXTURES__) {
    let shown = fixtureStore.get();
    const boot = async () => {
      const rules = await loadCoreRules(bootPageOrder(pageIds, window.location.hash), shown.state);
      const q = new URLSearchParams(window.location.search);
      const realm = q.get('fxrealm');
      const t = bootFixtureCore({ rules, keepStorage: true, ...(realm && { realm }), ...(q.get('fxcomputer') === 'none' && { target: null }), ...(q.get('fxframed') === '1' && { framed: true }) });
      t.setExtraDelay(LATENCY_MS[shown.latency]);
      return t;
    };
    let transport = await boot();
    await cryptReady(); // saved preferences open before the first render here too
    fixtureStore.subscribe(() => {
      const next = fixtureStore.get();
      if (next.state !== shown.state) {
        shown = next;
        void boot().then((t) => {
          transport = t;
        });
      } else if (next.latency !== shown.latency) {
        shown = next;
        transport.setExtraDelay(LATENCY_MS[next.latency]);
      }
    });
    gate();
    return 'render';
  }
  configureLifecycle(hubLifecycle);
  initLive();
  const result = await bootLive();
  if (result.state === 'leaving') return 'leaving';
  // Saved preferences are encrypted: open them before the first render. Bounded at 2 s on purpose: past it the
  // page renders defaults with status 'loading' (set() refused, so nothing is overwritten) and re-renders once the
  // account opens.
  await cryptReady();
  // Offline and purge-failed boots still render: the shell shows their panel over the app.
  showBootPanel(result);
  setLockBootPanel(result);
  gate();
  return 'render';
}

/** The passcode gate, synchronous after the last await: lock first, then the host mirrors it. */
function gate(): void {
  bootGate();
  installLockHost({ fallbackFocus: focusShownTitle });
  startLockReceiver();
}
