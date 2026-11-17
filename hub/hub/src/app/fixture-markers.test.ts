// The fixture-marker scan that hub:build and hub-live share
// (e2e-live/fixture-markers.ts). The bundle itself is checked by hub:build; this pins what the scan finds.
import { describe, expect, it } from 'vitest';
import { FIXTURE_ALLOW, FIXTURE_MARKERS, fixtureScanProblems, scanFixtureMarkers } from '../../e2e-live/fixture-markers';

const SAMPLES: Record<string, string> = {
  'fixture session token': 'var t=`fixture-access-token`',
  'fixture realm domain': 'https://api.fixture.invalid/x',
  'NO_FIXTURE answer': '{error:`NO_FIXTURE`}',
  'fixture transport code': 'code:`FIXTURE_MODE`',
  'fixture world names (Ada/atlas account)': 'ada@example.com',
  'DevToolbar': 'class="fxbar"',
  'fixture boot token': 'var a=`fixture-boot-token`',
  'fixture marker route': '"GET /__fixture/session":null',
  'fixture project id': '{project:{id:`p-fixture`}}',
  'FIXTURE failure code': "code:'FIXTURE'",
};

// The list is empty today; these rules are about any entry it may hold.
const SAMPLE_ALLOW = [{ marker: 'FIXTURE failure code', text: 'FIXTURE', reason: 'sample' }];

describe('the fixture-marker scan', () => {
  it('has a sample for every marker, and each marker finds its own', () => {
    expect(FIXTURE_MARKERS.map((m) => m.name).sort()).toEqual(Object.keys(SAMPLES).sort());
    for (const [name, text] of Object.entries(SAMPLES)) {
      expect(scanFixtureMarkers([['a.js', text]], []).hits[name], name).toEqual(['a.js']);
    }
  });

  it('a clean bundle has no problem', () => {
    const s = scanFixtureMarkers([['a.js', 'const fixtures=!1;function f(){return`CALL_FAILED`}'], ['b.css', '.bar{}']], []);
    expect(fixtureScanProblems(s)).toEqual([]);
  });

  it('names each file with a hit once, per marker', () => {
    const s = scanFixtureMarkers([['a.js', 'NO_FIXTURE NO_FIXTURE fxbar'], ['b.js', 'NO_FIXTURE']], []);
    expect(s.hits).toEqual({ 'NO_FIXTURE answer': ['a.js', 'b.js'], DevToolbar: ['a.js'] });
  });

  it('the allow list covers its exact text in any quotes, and nothing more', () => {
    for (const q of ['`', "'", '"']) {
      expect(fixtureScanProblems(scanFixtureMarkers([['a.js', `code:${q}FIXTURE${q}`]], SAMPLE_ALLOW)), q).toEqual([]);
    }
    // the allowed code does not cover another marker in the same file
    expect(scanFixtureMarkers([['a.js', 'code:`FIXTURE`,x:`FIXTURE_MODE`']], SAMPLE_ALLOW).hits).toEqual({ 'fixture transport code': ['a.js'] });
    // a word that only contains FIXTURE is not the code
    expect(scanFixtureMarkers([['a.js', '`FIXTURES_REFUSED`']], []).hits).toEqual({});
  });

  it('an allow entry that matches nothing is stale and fails the scan', () => {
    const s = scanFixtureMarkers([['a.js', 'nothing here']], SAMPLE_ALLOW);
    expect(s.stale).toEqual(['FIXTURE failure code: FIXTURE']);
    expect(fixtureScanProblems(s)).toHaveLength(1);
  });

  it('a scan that read no .js file is a problem, not a clean bundle', () => {
    expect(fixtureScanProblems(scanFixtureMarkers([]))).toEqual(['no .js file was scanned, so no bundle was checked']);
    expect(fixtureScanProblems(scanFixtureMarkers([['b.css', '.bar{}'], ['template dist/hub/index.html', '<html>']]))).toEqual(['no .js file was scanned, so no bundle was checked']);
    expect(fixtureScanProblems(scanFixtureMarkers([['a.js', 'nothing here']]))).toEqual([]);
  });

  it('no allow entry is left: the live catch code was renamed, so a FIXTURE failure code in a bundle is a hit', () => {
    expect(FIXTURE_ALLOW).toEqual([]);
    expect(scanFixtureMarkers([['a.js', "code:'FIXTURE'"]]).hits).toEqual({ 'FIXTURE failure code': ['a.js'] });
  });

  it('every allow entry names a marker and says why it stays', () => {
    const names = new Set(FIXTURE_MARKERS.map((m) => m.name));
    for (const a of FIXTURE_ALLOW) {
      expect(names.has(a.marker), a.marker).toBe(true);
      expect(a.reason.trim().length, a.marker).toBeGreaterThanOrEqual(10);
    }
  });
});
