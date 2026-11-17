// The web side of the shared behaviour scenarios (src/**/*.scenario.ts): each case runs against the WEB component with
// the repo's web test stack. The terminal side is scripts/term/scenarios.ts. Both must pass.
// One file only (the options: src/term/docs/scenarios.md):
//   HUB_SCENARIO=Button HUB_SCENARIO_OUT=<file.json> vitest run --config hub/vite.config.mts hub/src/term/scenario/scenarios.web.test.ts
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { filesOf, runScenarioFile, type FileResult } from './run';
import { webDriver } from './web-driver';

const mods = import.meta.glob<{ default?: unknown }>('/src/**/*.scenario.ts');
const want = (process.env.HUB_SCENARIO ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const picked = Object.entries(mods).filter(([p]) => !want.length || want.some((w) => p.includes(w)));
const loaded = await Promise.all(picked.map(async ([p, load]) => [p, filesOf(await load())] as const));
const results: Array<FileResult & { file: string }> = [];

for (const [p, files] of loaded) {
  for (const f of files) {
    describe(`${f.component} (${p})`, () => {
      // A file with no case proves each behavioural prop on its page instead (`pageProof`, scenarios.md "Page proof"):
      // one skipped entry keeps vitest from failing the empty suite ("No test found in suite").
      if (f.cases.length === 0) it.skip('no case here: proved on the page (pageProof)', () => {});
      for (const c of f.cases) {
        it(c.name, async () => {
          const r = await runScenarioFile(f, webDriver(), (n) => n === c.name);
          const row = results.find((x) => x.component === f.component && x.file === p) ?? (results.push({ component: f.component, platform: 'web', cases: [], file: p }), results.at(-1)!);
          row.cases.push(...r.cases);
          if (process.env.HUB_SCENARIO_OUT) writeFileSync(process.env.HUB_SCENARIO_OUT, JSON.stringify(results, null, 2));
          const res = r.cases[0]!;
          expect(res.ok, res.error).toBe(true);
        });
      }
    });
  }
}
