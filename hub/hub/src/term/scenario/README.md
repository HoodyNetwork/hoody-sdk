# Scenario runner

This directory holds the runner for shared behaviour scenarios and its two drivers. The documentation moved to
`src/term/docs`:

| Topic | Page |
|---|---|
| The semantics tree, its text form, queries | [../docs/semantics.md](../docs/semantics.md) |
| Writing and running a scenario file, mutants, the contract gate and how far to trust it | [../docs/scenarios.md](../docs/scenarios.md) |
| The secret gate | [../docs/forms.md](../docs/forms.md) |

## Files here

| File | What |
|---|---|
| `types.ts` | The scenario types. Plain TypeScript, loaded by both drivers. |
| `run.ts` | The platform-neutral runner. |
| `term-driver.ts` | Terminal driver: the semantics tree at 80x24. |
| `web-driver.ts` | Web driver: happy-dom, testing-library, user-event, dom-accessibility-api. |
| `scenarios.web.test.ts` | The vitest entry of the web side. |
| `route.ts` | Mounts the component under a memory router at `/page` with a query client, with each platform's search codec. |
| `drivers.scenario.ts` | The drivers' own regression cases: Escape timing, router, ids without a role, typing into an unfocused input, a menu radio pick. |
| `source-hooks.ts` | Rewrites sources in memory only: overrides and mutants. |
| `run.term.test.tsx` | The terminal driver's idle tests: a case still working at the settle deadline fails with `unsettled`, and a held timer fires only on a `releaseHeld` step. |
| `parity-notes.json` | Why a case fails on one side only (component difference, scenario fault or driver limit), plus the drivers' known limits. `scripts/term/scenarios.ts --parity-md` reads it. |
