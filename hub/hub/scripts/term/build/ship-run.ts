// The ship gate's mount (build/ship-gate.ts runs it in a pty): the BUILT bundle, imported by absolute path, mounted
// with the entry's DEFAULT options (strict globals on, the bundle's own styles, the process's terminal) and the fake
// client of measure.ts. Nothing of hub/src is loaded here: what draws is exactly what ships.
//   bun ship-run.ts <bundle.js> <page id> <route path> <result.json> <stop file> [error|empty|demo]
// `demo`: the bundle's demo mount (mountDemoHub) with the sample account of `hoody hub --demo` (build/demo-client.ts),
// as the demo executable mounts it (build/hub-ship.ts demoEntry); its reads are not listed in the result.
// Ends when <stop file> appears (the gate took its snapshot), then writes {receipt, error, requests} to <result.json>.
import '../netns-required'; // refuses outside the OS boundary; compiled into the --compile proof, so no re-run
import fs from 'node:fs';
import { fakeClient, type FakeCall, type FakeMode } from './measure';

const [bundle, page, route, resultFile, stopFile, modeArg] = process.argv.slice(2);
const demo = modeArg === 'demo';
const mode: FakeMode = modeArg === 'empty' ? 'empty' : 'error';
if (!bundle || !page || !route || !resultFile || !stopFile) {
  process.stderr.write('usage: ship-run.ts <bundle.js> <page> <path> <result.json> <stop file>\n');
  process.exit(2);
}
const calls: FakeCall[] = [];
const ac = new AbortController();
const stdin = process.stdin;
if (stdin.isTTY) stdin.setRawMode(true);
const poll = setInterval(() => { if (fs.existsSync(stopFile)) ac.abort(); }, 100);
let receipt: unknown = null;
let error: string | null = null;
try {
  const hub = (await import(bundle)) as { mountTerminalHub(o: unknown): Promise<unknown>; mountDemoHub(o: unknown): Promise<unknown> };
  const sample = demo ? await import('./demo-client') : null;
  receipt = await (sample ? hub.mountDemoHub.bind(hub) : hub.mountTerminalHub.bind(hub))({
    client: sample ? sample.demoClient() : fakeClient(calls, mode),
    context: sample ? { ...sample.DEMO_CONTEXT } : { profile: 'ship-gate', realmId: '5f0c0ffee0c0ffee0c0ffee0' },
    route: { page, path: route },
    io: {
      cells: { write: (s: string) => { process.stdout.write(s); } },
      input: { onData: (cb: (s: string) => void) => { const on = (b: Buffer): void => cb(b.toString('utf8')); stdin.on('data', on); return () => { stdin.off('data', on); }; } },
      size: () => ({ cols: process.stdout.columns ?? 120, rows: process.stdout.rows ?? 40 }),
      onResize: (cb: () => void) => { process.stdout.on('resize', cb); return () => { process.stdout.off('resize', cb); }; },
      colourTier: 'truecolor',
    },
    onSetDefault: async () => {},
    signal: ac.signal,
  });
} catch (e) {
  error = String((e as Error)?.message ?? e);
} finally {
  clearInterval(poll);
  if (stdin.isTTY) stdin.setRawMode(false);
}
fs.writeFileSync(resultFile, JSON.stringify({ receipt, error, requests: calls.map((c) => `${c.method} ${c.path}`) }, null, 1));
process.exit(0);
