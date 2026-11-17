// ProviderSetup in the terminal: "Open the sign-in page" hands the address on through the kit's openOutside (the host
// opens it, or it is copied and shown). It called window.open, which ended the Hub with TERM_GLOBAL.
import type { providers } from '@core';
import { startFixtureMode } from '@core/transport';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { act, getByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { ProviderSetup } from './ProviderSetup';
import { closeToast, toastQueue } from '../states/Toast.store';

let t: TestTerm | null = null;
// The step binds its attempt to the signed-in context: the fixture session gives it one (no network).
beforeEach(() => { startFixtureMode(); });
// An "Open …" press with no host browser leaves the address toast, which stays until dismissed: none for the next file.
afterEach(() => { t?.renderer.destroy(); t = null; for (const x of [...toastQueue().visibleToasts]) closeToast(x.key); });

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const none = () => Promise.resolve<Settled>({ ok: false, err: { kind: 'failed', code: 'unexpected', status: 500, retryAfter: null, details: {} } });
const api: providers.ProvidersApi = {
  version: none, providers: none, provider: none, auth: () => Promise.resolve(ok({ auth: { ready: false } })), catalogue: none as never,
  oauthPoll: () => Promise.resolve(ok({ state: 'pending' })), pkcePoll: none, pkceStart: none, pkceCode: none, pkceCancel: none, keyPut: none, keyDelete: none,
  authTest: none, authDefault: none, oauthStart: () => Promise.resolve(ok({ job_id: 'job-1', user_code: 'ABCD-1234', verification_uri: 'https://auth.openai.com/codex/device' })),
  oauthCancel: none, signOut: none,
};
// The sign-in waits for the person: the poll's sleep never ends.
const env: providers.Env = { sleep: () => new Promise<void>(() => undefined), now: () => 0, hidden: () => false, visible: () => Promise.resolve(), newKey: () => 'k-1', digest: () => Promise.resolve('fp-1'), alive: () => true };

test('Open the sign-in page keeps the step and the Hub running', async () => {
  t = await drawTest(
    <FocusRoot><OverlayHost><PaneSize>
      <ProviderSetup api={api} env={env} providerId="openai" providerLabel="OpenAI" device at={null} onConnected={() => undefined} />
    </PaneSize></OverlayHost></FocusRoot>, { width: 100, height: 40 });
  let f = await t.settle();
  for (let i = 0; i < 20 && !f.includes('Open the sign-in page'); i++) { await new Promise((r) => setTimeout(r, 20)); f = await t.settle(); }
  expect(f).toContain('Open the sign-in page');
  act(getByRole(semanticsOf(t.renderer as unknown as SemRoot), 'button', { name: 'Open the sign-in page' }), 'press');
  f = await t.settle();
  expect(f).toContain('Open the sign-in page');
});
