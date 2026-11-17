// The web Hub's fixture decision, in one place (vite.config.mts uses it; src/app/core-barrel.test.ts pins it; no Vite here).
//   fixtures: dev serve, `--mode fixtures` (hub:shots, page specs), vitest (`test` mode). A production `vite build`: never.
//   '@core': the fixture barrel (src/core/index.fixtures.ts: the web barrel plus core's fixture-only states) only with
//   fixtures; the web barrel src/core/index.ts in a production build, whose fixture names __HUB_FIXTURES__ folding keeps
//   out of /auth/home. The terminal ship build names its own fixture-free barrel, src/core/index.live.ts
//   (scripts/term/resolve.ts FIXTURE_BARRELS).
import path from 'node:path';

export function hubFixturesFor(command: 'serve' | 'build', mode: string): boolean {
  return command === 'serve' || mode === 'fixtures' || mode === 'test';
}

export function coreBarrelFor(hub: string, fixtures: boolean): string {
  return path.join(hub, fixtures ? 'src/core/index.fixtures.ts' : 'src/core/index.ts');
}
