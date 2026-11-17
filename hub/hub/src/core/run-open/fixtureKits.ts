// fixtureKits.ts: a launch that works in hub:dev, shots and page specs. Fixture rules on every run-open route
// (RUN_OPEN_DECLARED, the routes runOpenSend uses) answered by the FakeKits made with them: the SDK's run / terminal /
// display fake, so the fixture computer creates its terminal, runs the tracked command and reports it running, as
// the published kit shapes say. Reached only from fixture data (pages' fixtures.ts and the Open with fixture rules
// they load, compiled behind __HUB_FIXTURES__, which the production build defines false; fixtureKits.test.ts holds
// that line); nothing on a live page calls it.
import type { FixtureAnswer, FixtureRequest, FixtureRule } from '../transport';
import { reply } from '../transport';
import { FakeKits } from './fakeKits';
import { RUN_OPEN_DECLARED } from './send';

/** The kit host's N a request goes to: one program (run 1, terminal-0), or the terminal or display it names: its
 *  terminal_id or displayId query, else the terminal a DELETE /terminal/N path names (a signal path's number is a
 *  command id, never the terminal). */
function indexOf(rule: number | 'band' | 'held', req: FixtureRequest): number {
  if (typeof rule === 'number') return rule;
  const q = req.query.terminal_id ?? req.query.displayId;
  if (q !== undefined) return Number(q);
  const n = /^\/api\/v1\/terminal\/(\d{1,5})$/.exec(req.path)?.[1];
  return n === undefined ? NaN : Number(n);
}

/** The fake behind one rule set, for a spec or a test to read what was sent. */
export interface RunOpenFixture {
  readonly kits: FakeKits;
  readonly rules: readonly FixtureRule[];
}

/** Rules for every run-open route over a fresh FakeKits; `delayMs` per answer (a kit is a network hop away). */
export function runOpenFixture(o: { delayMs?: number } = {}): RunOpenFixture {
  const kits = new FakeKits();
  const rules = RUN_OPEN_DECLARED.map((d) =>
    reply(d.route, async (req): Promise<FixtureAnswer> => {
      const query = Object.keys(req.query).length ? { ...req.query } : undefined;
      const a = await kits.send({ kit: d.kit, index: indexOf(d.index, req) }, req.method, req.path, query, req.body ?? undefined);
      return { status: a.status, body: a.body, ...(o.delayMs ? { delayMs: o.delayMs } : {}) };
    }));
  return { kits, rules: Object.freeze(rules) };
}
