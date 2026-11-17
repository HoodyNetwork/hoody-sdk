// Measurement harness of the ship artifact: mounts the BUILT terminal Hub (hub-term.js) with a fake client and an
// in-memory terminal, and prints one JSON line: cold start to first frame, RSS, bytes written, the requests the boot
// made. Run in its own process (cold): bun scripts/term/build/measure.ts <path to hub-term.js> [cols rows]
// The fake client answers the boot's reads with a minimal signed-in account. Mode 'error' (default) refuses everything
// else (status 404); mode 'empty' also answers the pages' reads as an account that owns nothing (fake-empty.ts). It
// holds no credential. Also the entry of the --compile proof (compile-entry.ts imports this with the bundle).
import '../netns-required'; // refuses outside the OS boundary; compiled into the --compile proof, so no re-run
// The fake itself lives in demo-client.ts (no boundary guard there: `hoody hub --demo` compiles it into a release binary).
import { fakeClient, type FakeCall } from './demo-client';

export { FAKE_MODES, fakeClient, type FakeCall, type FakeMode } from './demo-client';

export async function measureMount(mod: { mountTerminalHub(o: unknown): Promise<unknown> }, t0: number, cols = 120, rows = 40): Promise<Record<string, unknown>> {
  const tImported = performance.now();
  const calls: FakeCall[] = [];
  let bytes = 0;
  let firstFrame = -1;
  let frames = 0;
  const ac = new AbortController();
  let resolveFirst!: () => void;
  const first = new Promise<void>((r) => { resolveFirst = r; });
  const mounted = mod.mountTerminalHub({
    client: fakeClient(calls),
    context: { profile: 'measure', realmId: '5f0c0ffee0c0ffee0c0ffee0' },
    route: { page: 'home', path: '/' },
    io: {
      cells: { write: (s: string) => { bytes += s.length; } },
      input: { onData: () => () => {} },
      size: () => ({ cols, rows }),
      colourTier: 'truecolor',
      onFrame: (n: number) => { frames = n; if (firstFrame < 0) { firstFrame = performance.now(); resolveFirst(); } },
    },
    onSetDefault: async () => {},
    signal: ac.signal,
    strictGlobals: false,
  });
  let error: string | null = null;
  mounted.catch((e: unknown) => { error = String((e as Error)?.message ?? e); resolveFirst(); });
  await Promise.race([first, new Promise((r) => setTimeout(r, 20_000))]);
  const rssFirst = process.memoryUsage().rss;
  await new Promise((r) => setTimeout(r, 1500));
  const rssSettled = process.memoryUsage().rss;
  ac.abort();
  await Promise.race([mounted.catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
  return {
    importMs: Math.round(tImported - t0),
    firstFrameMs: firstFrame < 0 ? null : Math.round(firstFrame - t0),
    frames,
    bytesWritten: bytes,
    rssFirstFrameMiB: +(rssFirst / 2 ** 20).toFixed(1),
    rssSettledMiB: +(rssSettled / 2 ** 20).toFixed(1),
    requests: calls.map((c) => `${c.method} ${c.path}`).slice(0, 30),
    error,
  };
}

if (import.meta.main) {
  const t0 = 0; // performance.now() counts from process start: cold start includes the runtime's own start
  const bundle = process.argv[2];
  if (!bundle) { process.stderr.write('usage: measure.ts <hub-term.js> [cols rows]\n'); process.exit(2); }
  const mod = await import(bundle) as { mountTerminalHub(o: unknown): Promise<unknown> };
  const r = await measureMount(mod, t0, Number(process.argv[3] ?? 120), Number(process.argv[4] ?? 40));
  process.stdout.write('MEASURE ' + JSON.stringify(r) + '\n');
  process.exit(0);
}
