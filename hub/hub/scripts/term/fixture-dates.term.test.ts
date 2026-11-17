// The fixture world and the fixture clock agree (keys): every fixture date is computed from, or
// lies before, GOLDEN_NOW (clock.ts), unless it is a named deliberate future date.
//  - relative dates (`Date.now()` at module load) are right only when the module loads under the frozen clock:
//    pageNeedles (the secrets read the goldens do FIRST) and runPageGoldens freeze it before any fixture loads;
//  - absolute ISO literals in fixture sources after GOLDEN_NOW must be listed in FUTURE_OK with a reason.
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { GOLDEN_NOW } from './clock';

const SRC = path.join(import.meta.dir, '..', '..', 'src');
/** Deliberate future dates: `<file under src>|<literal>` -> why. */
const FUTURE_OK: Record<string, string> = {
  'pages/referrals/fixtures.ts|2026-12-03T00:00:00.000Z': 'next_release_at: the next day-batched Referral credit release, after the hold (always in the future)',
  'pages/scripts/fixtures.ts|2026-11-18T14:25:00Z': 'retainedUntil: an old script version kept until a future date',
};

function fixtureSources(): string[] {
  const out: string[] = [];
  const pages = path.join(SRC, 'pages');
  for (const p of fs.readdirSync(pages)) {
    const d = path.join(pages, p);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d)) if (/^fixtures.*\.ts$/.test(f) && !/\.(test|spec)\./.test(f)) out.push(`pages/${p}/${f}`);
  }
  for (const f of ['core/world.ts', 'app/fixtures.ts']) if (fs.existsSync(path.join(SRC, f))) out.push(f);
  return out;
}

test('no absolute fixture date lies after GOLDEN_NOW unless listed as a deliberate future date', () => {
  const late: string[] = [];
  const seen = new Set<string>();
  for (const f of fixtureSources()) {
    for (const m of fs.readFileSync(path.join(SRC, f), 'utf8').matchAll(/['"`](20\d\d-[01]\d-[0-3]\dT[0-9:.]+Z?)['"`]/g)) {
      const t = Date.parse(m[1]!.endsWith('Z') ? m[1]! : `${m[1]}Z`);
      if (!(t > GOLDEN_NOW)) continue;
      const k = `${f}|${m[1]}`;
      seen.add(k);
      if (!FUTURE_OK[k]) late.push(k);
    }
  }
  expect(late, 'a fixture date after GOLDEN_NOW: compute it from Date.now() (frozen) or list it in FUTURE_OK with a reason').toEqual([]);
  expect(Object.keys(FUTURE_OK).filter((k) => !seen.has(k)), 'FUTURE_OK rows that match nothing').toEqual([]);
});

// Both hold the clock (holdFixtureClock) for their own run and give it back after: the hold is taken in the exported
// function, before it calls the `…Held` body that loads fixtures.
const heldFirst = (file: string, fn: string, loads: string): void => {
  const src = fs.readFileSync(path.join(import.meta.dir, file), 'utf8');
  const outer = src.slice(src.indexOf(`export async function ${fn}(`));
  const hold = outer.indexOf('holdFixtureClock();');
  expect(hold).toBeGreaterThan(0);
  expect(hold).toBeLessThan(outer.indexOf(`${fn}Held(`));
  const body = src.slice(src.indexOf(`async function ${fn}Held(`));
  expect(body.indexOf(loads)).toBeGreaterThan(0);
};

test('runPageGoldens freezes the clock before it reads the page secrets (which load the fixtures)', () => {
  heldFirst('goldens.ts', 'runPageGoldens', 'secretToolsFor(page)');
});

test('pageNeedles freezes the clock before it loads any fixture; a fixture loaded then is GOLDEN_NOW-relative', async () => {
  // Order in the source (a test process may have loaded the cached modules earlier, so the runtime check below uses a
  // fresh instance of the keys fixtures).
  heldFirst('secrets.ts', 'pageNeedles', 'loadFixtures(page)');
  const { holdFixtureClock, clockFrozen } = await import('./clock');
  const { pageNeedles } = await import('./secrets');
  await pageNeedles('keys');
  // The hold is given back: nothing else holds the clock here, so it runs real again.
  expect(clockFrozen()).toBe(false);
  // A fixture loaded while the clock is held is GOLDEN_NOW-relative.
  const release = holdFixtureClock();
  try {
    expect(Date.now()).toBe(GOLDEN_NOW);
    const { keys } = (await import(`${path.join(SRC, 'pages/keys/fixtures.ts')}?fixture-dates=1`)) as { keys: Array<{ alias: string; expires_at: string | null }> };
    expect(keys.find((k) => k.alias === 'ci-deploy')?.expires_at).toBe(new Date(GOLDEN_NOW + 70 * 86_400_000).toISOString());
  } finally { release(); }
}, 60_000);
