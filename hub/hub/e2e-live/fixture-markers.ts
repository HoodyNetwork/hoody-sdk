// The fixture markers a production bundle must not carry: one list, read by hub:build (scripts/build.ts fails the
// build on a hit) and by tests that run the same check on a built bundle. Each marker is a string only the fixture
// world, the fixture transport or fixture boot spells; a hit means
// fixture-only code or data reached the bundle (a branch not under __HUB_FIXTURES__, a module the build kept).
//
// FIXTURE_ALLOW lists the hits a live page really needs, each with the reason it stays. An entry that matches
// nothing is stale and fails the scan too, so it leaves with the code it covered.
import fs from 'node:fs';
import path from 'node:path';

export interface FixtureMarker {
  readonly name: string;
  readonly re: RegExp;
}

export const FIXTURE_MARKERS: readonly FixtureMarker[] = [
  { name: 'fixture session token', re: /fixture-access-token|fixturesession00/g },
  { name: 'fixture realm domain', re: /fixture\.invalid/g },
  { name: 'NO_FIXTURE answer', re: /NO_FIXTURE/g },
  { name: 'fixture transport code', re: /FIXTURE_MODE/g },
  { name: 'fixture world names (Ada/atlas account)', re: /64f0ada00000000000000001|ada@example\.com/g },
  { name: 'DevToolbar', re: /fxbar|DevToolbar/g },
  { name: 'fixture boot token', re: /fixture-boot-token/g },
  { name: 'fixture marker route', re: /\/__fixture\//g },
  { name: 'fixture project id', re: /p-fixture/g },
  { name: 'FIXTURE failure code', re: /(["'`])FIXTURE\1/g },
];

export interface FixtureAllow {
  readonly marker: string;
  /** The matched text, quotes left off (a build may quote a string either way). */
  readonly text: string;
  readonly reason: string;
}

export const FIXTURE_ALLOW: readonly FixtureAllow[] = [];

export interface FixtureScan {
  /** marker name -> files (relative names as given) with a hit no allow entry covers */
  readonly hits: Record<string, string[]>;
  /** allow entries that matched nothing */
  readonly stale: string[];
  /** .js files among the texts: none means no bundle was read, so an empty hit list proves nothing */
  readonly scripts: number;
}

/** Scans named texts (file name, contents) for the markers. */
export function scanFixtureMarkers(files: Iterable<readonly [string, string]>, allow: readonly FixtureAllow[] = FIXTURE_ALLOW): FixtureScan {
  const hits: Record<string, string[]> = {};
  const used = new Set<FixtureAllow>();
  let scripts = 0;
  for (const [name, text] of files) {
    if (name.endsWith('.js')) scripts++;
    for (const m of FIXTURE_MARKERS) {
      for (const hit of text.matchAll(m.re)) {
        const bare = hit[0].replace(/^["'`]|["'`]$/g, '');
        const ok = allow.find((a) => a.marker === m.name && a.text === bare);
        if (ok) { used.add(ok); continue; }
        const list = (hits[m.name] ||= []);
        if (!list.includes(name)) list.push(name);
      }
    }
  }
  const stale = allow.filter((a) => !used.has(a)).map((a) => `${a.marker}: ${a.text}`);
  return { hits, stale, scripts };
}

/** The bundle's .js, .css and .html files under each root, keyed by their path relative to `base`. */
export function bundleTexts(roots: readonly string[], base: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(js|css|html)$/.test(e.name)) out.push([path.relative(base, f), fs.readFileSync(f, 'utf8')]);
    }
  };
  for (const r of roots) walk(r);
  return out;
}

/** One line per problem; empty when the bundle is clean. */
export function fixtureScanProblems(s: FixtureScan): string[] {
  return [
    ...(s.scripts === 0 ? ['no .js file was scanned, so no bundle was checked'] : []),
    ...Object.entries(s.hits).map(([k, v]) => `${k}: ${v.join(', ')}`),
    ...s.stale.map((a) => `stale allow entry (matches nothing): ${a}`),
  ];
}
