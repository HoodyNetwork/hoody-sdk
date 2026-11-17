// The send census of the live terminal Hub.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | One predicate says what a change is: any method but GET and HEAD, and a GET its route declares a change. api() uses it and holds no second copy | 'a change, by one predicate' |
// | 2 | Every place in the Hub's source that hands a request to the network (the transport's legs, the session's API call, a raw fetch, a socket, a worker, a beacon, a script tag) is in the table below with its family. A new one fails here until it is listed, which is when the send policy learns of it | 'every send site is listed' |
// | 3 | The live entry reaches no send site outside the table (the import graph, static and dynamic) | 'the live entry reaches listed sites only' |
// | 4 | Every live mount is wired: the live entry is the only caller of the live boot and always hands it the page's address with its query (routeHref, never the bare path) and the wiring built from the host's options (liveWiringOf); none but boot.live.ts builds the wire | 'entry.live wires the boot' |
import { expect, setDefaultTimeout, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { isChangeCall } from '../../core/routes';
import { closureOf } from '../../../scripts/term/static-imports';

// The tests below read and parse the whole source tree: on a loaded host that takes longer than bun's 5 s default.
setDefaultTimeout(30_000);

const SRC = path.resolve(import.meta.dir, '..', '..');

test('a change, by one predicate', () => {
  const table: Array<[string, boolean | undefined, boolean]> = [
    ['GET', undefined, false], ['HEAD', undefined, false], ['get', undefined, false], ['head', undefined, false],
    ['GET', true, true], ['HEAD', true, true], // a route declared a change (a create-or-get)
    ['GET', false, false],
    ['POST', undefined, true], ['PUT', undefined, true], ['PATCH', undefined, true], ['DELETE', undefined, true], ['post', undefined, true],
    ['OPTIONS', undefined, true], ['', undefined, true], // anything that is not plainly a read is a change
  ];
  for (const [method, change, want] of table) expect(isChangeCall(change === undefined ? {} : { change }, method), `${method} change:${String(change)}`).toBe(want);
  const api = fs.readFileSync(path.join(SRC, 'core', 'api.ts'), 'utf8');
  expect(api).toContain('const mutation = isChangeCall(route, m);');
  // No second copy of the rule in api(): a method compared with GET or HEAD to decide a change.
  expect(api.match(/!==\s*'(GET|HEAD)'/g) ?? []).toEqual([]);
});

/** What hands a request to the network, by the text that does it. */
const PRIMITIVES: Record<string, RegExp> = {
  'transport.hoody': /transport\(\)\s*\.hoody\(/g,
  'transport.fetch': /transport\(\)\s*\.fetch\(/g,
  'transport.socket': /transport\(\)\s*\.socket\??\.?\(/g,
  apiCall: /\.apiCall\(/g,
  'raw fetch': /(?<![.\w])fetch\(|globalThis\.fetch\(|window\.fetch\(/g,
  'client call': /\bclient\.(fetch|request)\(/g,
  socket: /new\s+(\w+\.)?WebSocket\(|new\s+WS\(|\(leg\.socket\b[^)]*\)\(|new\s+EventSource\(/g,
  worker: /new\s+(Shared)?Worker\(/g,
  beacon: /sendBeacon\(|new\s+XMLHttpRequest\(/g,
  'script tag': /\b(el|script|s)\.src\s*=\s*[A-Z_a-z]/g,
};
/** Every send site: file → what it holds, and the family the send policy puts it in. Counts are of occurrences in code (comments stripped). */
const SITES: Record<string, { has: Record<string, number>; family: string }> = {
  'core/api.ts': { has: { 'transport.hoody': 2 }, family: 'api(): the Hoody leg, first send and its one retry' },
  'core/kit-io.ts': { has: { 'transport.fetch': 2 }, family: 'run / download / upload bytes: the kit leg, after kit.ts admit' },
  'core/kit.ts': { has: { 'transport.fetch': 1 }, family: 'send(): the kit and agent leg, the admitted plan' },
  'core/origin.ts': { has: { 'raw fetch': 1 }, family: 'readHubConfig: the one-file Hub\'s credential-less GET of a candidate Hoody\'s /hub/config; called only from standalone/, never by a terminal mount' },
  'core/query.ts': { has: { 'raw fetch': 2 }, family: 'not a send: the query client\'s own fetch( of a query (a function name), no network call' },
  'core/realm.ts': { has: { 'transport.hoody': 1 }, family: 'the realm switch probe: the Hoody leg' },
  'core/signin.ts': { has: { apiCall: 1 }, family: 'the web sign-in page\'s calls as nobody, through shared.js apiCall; the terminal signs in with its own flow' },
  'core/token.ts': { has: { 'transport.hoody': 1 }, family: 'the access-key check: the Hoody leg' },
  'core/transport.ts': { has: { apiCall: 1, 'raw fetch': 4, socket: 1 }, family: 'the real transport: the web\'s legs; a terminal mount installs its own (boot.live.ts)' },
  'core/socket.ts': { has: { socket: 1 }, family: 'sockets: a declared ws route, through the transport\'s socket leg' },
  'core/upload.ts': { has: { 'transport.fetch': 1, worker: 1 }, family: 'uploads: in the page through the kit leg; the worker is web only (never asked for in a terminal)' },
  'core/upload.worker.ts': { has: { 'raw fetch': 1 }, family: 'the upload worker\'s own send: web only' },
  'core/boot-token.ts': { has: { 'script tag': 1 }, family: 'the web\'s boot-token producer script: web only (the terminal needs its own producer)' },
  'pages/api/logic.ts': { has: { 'raw fetch': 1 }, family: 'not a send: the text of a code sample the API page shows' },
  'shell/staleChunk.ts': { has: { 'raw fetch': 1 }, family: 'the web shell\'s stale-bundle check: web only' },
  'kit/gallery/view.tsx': { has: { 'raw fetch': 1 }, family: 'the kit gallery: fixtures mode only' },
  'standalone/device.ts': { has: { 'raw fetch': 1 }, family: 'the one-file Hub\'s device-flow sign-in to the chosen Hoody: standalone web only' },
  'standalone/token.ts': { has: { apiCall: 2 }, family: 'the one-file Hub\'s access-key sign-in through shared.js apiCall: standalone web only' },
  'term/app/boot.live.ts': { has: { apiCall: 1, 'client call': 1 }, family: 'the terminal\'s transport: the host client, behind the fence' },
  'term/app/boot.demo.ts': { has: { apiCall: 1, 'client call': 2 }, family: 'the demo\'s transport: a marked demo client only, answers from memory; the second call is the start\'s read of the sample computer list (its node, so the first kit read is routed), on the same demo client' },
  'term/app/live-wire.ts': { has: { apiCall: 1, 'client call': 1 }, family: 'the terminal\'s transport under the send policy (4i): every call admitted, bound to its wire attempt, behind the fence' },
  'term/app/cli-client.ts': { has: { 'raw fetch': 2 }, family: 'the CLI\'s HoodyClient adapter (step 10): one is the wire under the host client (fetchWire, redirect manual), the other the adapter\'s own `async fetch(` method name, not a send; entry.live re-exports it through cli-http.ts for the CLI, which hands the client to a mount' },
  'term/app/cli-http.ts': { has: { 'client call': 2 }, family: 'the CLI session before the mount (`hoody hub`): the start realm\'s two reads (the realm names, GET /realms) through the session\'s own client on the base host; the session\'s wire and GET /hub/config go out on the CLI\'s transport (`getFetch()`), redirect manual' },
  'term/env/client-shared.ts': { has: { 'client call': 1 }, family: 'the session\'s API call over the host client' },
  'term/host-types.ts': { has: { 'raw fetch': 1 }, family: 'not a send: the client seam\'s type' },
};

const skip = (f: string): boolean => /\.(test|spec|scenario)\.|\.term\.test\.|\.fixtures?\.|(^|\/)fixtures?(\/|\.)|\.d\.ts$|e2e/.test(f);
function sources(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(e.name) && !skip(path.relative(SRC, p))) out.push(p);
  }
  return out;
}
const code = (f: string): string => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"`])\/\/ .*$/gm, '$1');
function found(f: string): Record<string, number> {
  const t = code(f);
  const has: Record<string, number> = {};
  for (const [name, re] of Object.entries(PRIMITIVES)) { const n = (t.match(re) ?? []).length; if (n) has[name] = n; }
  return has;
}

test('every send site is listed', () => {
  const seen: Record<string, Record<string, number>> = {};
  for (const f of sources(SRC)) { const has = found(f); if (Object.keys(has).length) seen[path.relative(SRC, f)] = has; }
  const listed = Object.fromEntries(Object.entries(SITES).filter(([, v]) => Object.keys(v.has).length).map(([k, v]) => [k, v.has]));
  expect(seen).toEqual(listed);
  for (const [f, v] of Object.entries(SITES)) expect(v.family.length, f).toBeGreaterThan(10);
});

test('the live entry reaches listed sites only', () => {
  const reach = [...closureOf([path.join(SRC, 'term', 'entry.live.ts')])].map((f) => path.relative(SRC, f)).filter((f) => !f.startsWith('..') && !skip(f));
  expect(reach.length).toBeGreaterThan(100);
  const withSends = reach.filter((f) => Object.keys(found(path.join(SRC, f))).length > 0).sort();
  for (const f of withSends) expect(Object.keys(SITES), f).toContain(f);
  // What the terminal's own send policy must cover: every reached site whose family is a leg.
  expect(withSends).toEqual(['core/api.ts', 'core/boot-token.ts', 'core/kit-io.ts', 'core/kit.ts', 'core/origin.ts', 'core/query.ts', 'core/realm.ts', 'core/token.ts', 'core/transport.ts', 'shell/staleChunk.ts', 'term/app/boot.live.ts', 'term/app/cli-client.ts', 'term/app/cli-http.ts', 'term/app/live-wire.ts', 'term/env/client-shared.ts', 'term/host-types.ts']);
});

test('entry.live wires the boot', () => {
  // The top-level arguments of each call of `name(` in a file's code.
  const argsOf = (text: string, name: string): string[][] => {
    const out: string[][] = [];
    const re = new RegExp(`(?<![.\\w])${name}\\(`, 'g');
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const args: string[] = [];
      let depth = 0, cur = '', i = m.index + m[0].length;
      for (; i < text.length; i++) {
        const c = text[i]!;
        if ('([{'.includes(c)) depth++;
        if (')]}'.includes(c)) { if (depth === 0) break; depth--; }
        if (c === ',' && depth === 0) { args.push(cur.trim()); cur = ''; } else cur += c;
      }
      if (cur.trim()) args.push(cur.trim());
      // A spread hands any number of arguments: never counted as one.
      if (args.some((a) => a.startsWith('...'))) args.push('<spread>', '<spread>', '<spread>', '<spread>');
      out.push(args);
    }
    return out;
  };
  const roots = [SRC, path.resolve(SRC, '..', 'scripts')];
  const files = roots.flatMap((r) => sources(r));
  const calls: Array<[string, number, string, string]> = [];
  for (const f of files) {
    const rel = path.relative(path.resolve(SRC, '..'), f).split(path.sep).join('/');
    const text = code(f);
    if (rel === 'src/term/app/boot.live.ts') {
      // The one place the wire is built: only from the `wiring` its caller passed.
      expect(text.match(/liveWire\(/g)?.length).toBe(1);
      expect(text).toContain('if (wiring) wire = liveWire(client, session, fence, wiring);');
      continue;
    }
    expect(text.includes('liveWire('), rel).toBe(rel === 'src/term/app/live-wire.ts');
    for (const a of argsOf(text, 'liveBoot')) calls.push([rel, a.length, a[2] ?? '', a[3] ?? '']);
  }
  // The live entry is the only caller, and it passes client, context, the address (path and query) and the wiring of the
  // host's options.
  expect(calls).toEqual([['src/term/entry.live.ts', 4, '() => routeHref(route)', 'liveWiringOf(o)']]);
});
