// The panels place every catalogue option exactly once, never a refused or Board-owned
// one, with the section ids of the doc; every strings key a panel names exists.
import { describe, expect, it } from 'vitest';
import { TILE_PROGRAMS, type Catalog } from '../embed/catalog';
import catalog from '../embed/catalog.ui.json';
import { BOARD_OWNED, programOptions } from '../embed/options';
import { PANELS, opensIds, placementOf, rowIds, startView } from './model';
import strings from './strings.en.json';

const CAT = catalog as unknown as Catalog;
const placed = (p: (typeof TILE_PROGRAMS)[number]) => {
  const pl = placementOf(p);
  return [...Object.values(pl.sections).flat(), ...pl.advanced];
};

describe('every option is placed once', () => {
  it.each(TILE_PROGRAMS.map((p) => [p]))('%s: the panel names exactly the catalogue options, once each', (p) => {
    const ids = placed(p);
    expect(new Set(ids).size, 'an option placed twice').toBe(ids.length);
    expect([...ids].sort()).toEqual(programOptions(CAT, p).map((o) => o.id).sort());
    expect(placementOf(p).pendingDesign).toEqual([]);
  });
  it.each(TILE_PROGRAMS.map((p) => [p]))('%s: no refused or Board-owned name is shown', (p) => {
    const refused = Object.keys(CAT.kits[p]?.refused ?? {});
    for (const id of placed(p)) {
      expect(refused).not.toContain(id);
      expect(BOARD_OWNED).not.toContain(id);
    }
  });
  it('the counts are the catalogue\'s: agent 31, terminal 34, display 38, files 16, browser 2, code 6, sqlite 4, notes 9', () => {
    expect(Object.fromEntries(TILE_PROGRAMS.map((p) => [p, placed(p).length]))).toEqual({ agent: 31, terminal: 34, display: 38, files: 16, browser: 2, code: 6, sqlite: 4, notes: 9 });
  });
  it('the section ids and their order are the doc\'s', () => {
    const order = (p: (typeof TILE_PROGRAMS)[number]) => [...Object.keys(placementOf(p).sections), 'advanced'];
    expect(order('terminal')).toEqual(['session', 'window', 'text', 'colours', 'cursor', 'sidepanel', 'scrolling', 'accessibility', 'advanced']);
    expect(order('agent')).toEqual(['window', 'text', 'colours', 'cursor', 'sidepanel', 'scrolling', 'accessibility', 'advanced']);
    expect(order('display')).toEqual(['quality', 'desktop', 'look', 'input', 'sharing', 'viewer', 'advanced']);
    expect(order('files')).toEqual(['opens', 'listing', 'look', 'parts', 'advanced']);
    expect(order('browser')).toEqual(['display', 'advanced']);
    expect(order('code')).toEqual(['opens', 'startup', 'advanced']);
    expect(order('sqlite')).toEqual(['opens', 'database', 'look', 'advanced']);
    expect(order('notes')).toEqual(['opens', 'look', 'parts', 'advanced']);
  });
  it('the doc\'s per-section counts hold (agent: window 1, text 4, colours 3, cursor 4, sidepanel 6, scrolling 4, accessibility 2, advanced 7)', () => {
    const counts = (p: (typeof TILE_PROGRAMS)[number]) => ({ ...Object.fromEntries(Object.entries(placementOf(p).sections).map(([k, v]) => [k, v.length])), advanced: placementOf(p).advanced.length });
    expect(counts('agent')).toEqual({ window: 1, text: 4, colours: 3, cursor: 4, sidepanel: 6, scrolling: 4, accessibility: 2, advanced: 7 });
    expect(counts('display')).toEqual({ quality: 5, desktop: 4, look: 3, input: 7, sharing: 4, viewer: 7, advanced: 8 });
    expect(counts('files')).toEqual({ opens: 3, listing: 2, look: 4, parts: 6, advanced: 1 });
    expect(counts('code')).toEqual({ opens: 2, startup: 3, advanced: 1 });
    expect(counts('sqlite')).toEqual({ opens: 1, database: 1, look: 1, advanced: 1 });
    expect(counts('notes')).toEqual({ opens: 4, look: 3, parts: 2, advanced: 0 });
  });
  it('new tiles start on Root folder (files), Default folder (code) and Browser windows (browser) Overview (sqlite) and Home (notes); the others have one view', () => {
    expect(TILE_PROGRAMS.map((p) => startView(p))).toEqual([undefined, undefined, undefined, 'root', 'status', 'root', 'overview', 'home']);
    for (const p of ['files', 'browser', 'code', 'sqlite', 'notes'] as const) for (const o of PANELS[p].opens ?? []) expect(CAT.kits[p]?.views).toContain(p + '.' + o.view);
  });
});

describe('every strings key a panel names exists (no catalogue text at run time)', () => {
  const S = strings as Record<string, string>;
  it.each(TILE_PROGRAMS.map((p) => [p]))('%s', (p) => {
    const panel = PANELS[p];
    const missing: string[] = [];
    const need = (k: string) => S[k] === undefined && missing.push(k);
    for (const sec of panel.sections) {
      need('section.' + sec.id);
      for (const r of sec.rows) {
        need(r.key + '.label');
        if ('choices' in r) for (const c of r.choices) need(c.key);
        if ('placeholder' in r && r.placeholder) need(r.placeholder);
        if ('patternErr' in r && r.patternErr) need(r.patternErr);
        expect(rowIds(r).length).toBeGreaterThan(0);
      }
    }
    for (const o of panel.opens ?? []) need(o.key);
    for (const [view, fields] of Object.entries(panel.opensFields ?? {})) {
      for (const f of fields) {
        need(f.key + '.label');
        if (CAT.views[p + '.' + view]?.required.includes(f.id)) need(f.key + '.required');
      }
    }
    expect(opensIds(panel).every((id) => programOptions(CAT, p).some((o) => o.id === id))).toBe(true);
    expect(missing).toEqual([]);
  });
});
