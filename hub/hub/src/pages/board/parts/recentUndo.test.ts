// Recent > Clear's Undo is bound to the scope the list was cleared in (parts/recentUndo.ts). The Board's own Clear is
// held at page level (page.undoscope.test.tsx); the program view's Clear (ProgramView.tsx, the "Pick another program"
// picker) had no such check: its Undo wrote the cleared realm's entries under whatever realm was shown at the press.
import { bootFixtureCore, fixtureWorld, FIXTURE_REALM } from '@core';
import { setRealm } from '@core/ctx';
import { beforeEach, describe, expect, it } from 'vitest';
import programView from './ProgramView.tsx?raw';
import { recentScope } from './recentUndo';

const OTHER_REALM = fixtureWorld.realms.map((r) => r.id).find((id) => id !== FIXTURE_REALM) as string;

beforeEach(() => { bootFixtureCore({ rules: [] }); });

describe('recentScope: the scope a Recent list was cleared in', () => {
  it('still holds while nothing changed', () => {
    const still = recentScope();
    expect(still()).toBe(true);
  });

  it('does not hold once another realm is shown', () => {
    const still = recentScope();
    setRealm(OTHER_REALM);
    expect(still()).toBe(false);
    // A scope taken in the other realm is that realm's own.
    expect(recentScope()()).toBe(true);
  });
});

describe('the program view\'s Clear', () => {
  it('takes the scope at the Clear and restores only behind it', () => {
    const clear = programView.slice(programView.indexOf('clear: () => {'), programView.indexOf('known={[]}'));
    expect(clear).toContain('const still = recentScope();');
    // The scope is taken before the list is cleared, and the restore comes only after the refusal's return.
    expect(clear.indexOf('recentScope()')).toBeLessThan(clear.indexOf('api.apply(clearRecents)'));
    const refusal = clear.indexOf("if (!still()) { showToast({ title: t('recent.notRestored'), tone: 'info' }); return; }");
    expect(refusal).toBeGreaterThan(-1);
    expect(clear.indexOf('restoreRecents(s, before)')).toBeGreaterThan(refusal);
    // One restore only: none outside the check.
    expect(clear.split('restoreRecents(').length).toBe(2);
  });
});
