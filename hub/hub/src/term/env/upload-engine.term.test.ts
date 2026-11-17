// The upload engine in the terminal (core/upload.ts engine(), core/host-env.ts `workers`).
// Bun HAS a Worker constructor, so typeof Worker is no answer: a worker's native fetch (upload.worker.ts) bypasses the
// mount's transport and fence. The terminal env says `workers: false`, so uploads stay on the page engine.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | With the terminal env, a Worker constructor present and fixtures off, the upload engine is the page engine and no Worker is ever constructed | 'no worker engine in the terminal' |
// | 3 | Worker dispatch FORCED (the real worker engine called directly) on the terminal env (workers: false), with a counting Worker constructor and a counting native fetch: hash and send end unposted, no Worker is constructed, nothing is posted, no native fetch runs | 'forced worker dispatch is refused' |
// | 2 | The same core with a host that allows workers picks the worker engine (the web's choice, unchanged) | 'a host that allows workers' |
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { hostEnv, installHostEnv, resetHostEnvForTests } from '../../core/host-env';
import { fixtureModeActive, installTransport, transport } from '../../core/transport';
import { realUploadEnginesForTests, uploadEngineKind } from '../../core/upload';
import { installTermEnv } from './session';

const RealWorker = globalThis.Worker;
const RealFetch = globalThis.fetch;
// "Fixtures off" is this file's own condition, not the process's: a page render earlier in the same process
// (renderPage, a fixture boot) leaves its fixture transport installed, and the engine then is the page engine for
// THAT reason (red after strict-probes.account in a shared process, green alone). Each test runs on the real
// transport and gives the process its transport and the terminal env back.
let transportBefore: ReturnType<typeof transport> | null = null;
beforeEach(() => { transportBefore = transport(); installTransport(null); resetHostEnvForTests({ unresolved: true }); installTermEnv(); });
afterEach(() => { globalThis.Worker = RealWorker; globalThis.fetch = RealFetch; resetHostEnvForTests({ unresolved: true }); installTermEnv(); installTransport(transportBefore); });

test('no worker engine in the terminal', () => {
  let made = 0;
  globalThis.Worker = class { constructor() { made++; } } as unknown as typeof Worker;
  expect(typeof Worker).toBe('function');
  expect(fixtureModeActive()).toBe(false);
  expect(hostEnv().workers).toBe(false);
  expect(uploadEngineKind()).toBe('page');
  expect(made).toBe(0);
});

test('forced worker dispatch is refused', async () => {
  let made = 0, posted = 0, fetched = 0;
  globalThis.Worker = class { constructor() { made++; } postMessage() { posted++; } terminate() {} } as unknown as typeof Worker;
  globalThis.fetch = (async () => { fetched++; throw new Error('native fetch reached'); }) as unknown as typeof fetch;
  expect(hostEnv().workers).toBe(false);
  const { worker } = realUploadEnginesForTests();
  const file = new Blob([new Uint8Array([1, 2, 3])]);
  const spec = { url: 'https://agent.realm.invalid/upload', method: 'PUT', headers: {} } as unknown as Parameters<typeof worker.send>[0];
  expect(await worker.send(spec, file, new AbortController().signal, {} as never)).toBe('unposted');
  await expect(worker.hash(file, new AbortController().signal)).rejects.toBeDefined();
  expect({ made, posted, fetched }).toEqual({ made: 0, posted: 0, fetched: 0 });
});

test('a host that allows workers', () => {
  resetHostEnvForTests({ unresolved: true });
  installHostEnv({ ...termLike(), workers: true });
  expect(uploadEngineKind()).toBe('worker');
});

/** The web env's members without its browser reads (the strict globals would trap them): only what engine() reads. */
function termLike(): Parameters<typeof installHostEnv>[0] {
  return { local: null, session: null, vault: null, locks: null, onExternalChange: () => () => {}, visible: () => true,
    onVisibilityChange: () => () => {}, onLifecycle: () => () => {}, channel: () => null };
}
