// The draft rules: catalogue checks with the catalogue's error lines, required Opens fields, what Save keeps (only
// shown, enabled, valid options; the view written explicitly), "N changed", display presets and the files parts
// writer.
import { describe, expect, it } from 'vitest';
import type { Catalog } from '../embed/catalog';
import catalog from '../embed/catalog.ui.json';
import {
  applyQuality, catView, changedCount, changedIn, errorPlaces, errorsOf, mbitToBits, partShown, partsOf, partsParams, qualityOf, resetDraft, saveDraft,
  setOption, setOptions, shownSections, staleIds, type Draft, type Part,
} from './draft';

const CAT = catalog as unknown as Catalog;
const term = (params: Record<string, unknown>): Draft => ({ view: undefined, params: params as Draft['params'] });
const keys = (e: Record<string, { key: string; vars?: unknown }>) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v.vars ? [v.key, v.vars] : v.key]));

describe('checks: the catalogue\'s, with the doc\'s error lines', () => {
  it('integers refuse decimals and out-of-range values with the field\'s own bounds', () => {
    expect(keys(errorsOf(CAT, 'terminal', term({ fontSize: 14.5, lineHeight: 1.2, minimumContrastRatio: 4.5, scrollback: 100001, cursorStyle: 'bar', cursorWidth: 0, fastScrollSensitivity: 0 })))).toEqual({
      fontSize: 'err.whole',
      lineHeight: 'err.whole',
      minimumContrastRatio: 'err.whole',
      scrollback: ['err.range', { min: '0', max: '100,000' }],
      cursorWidth: ['err.min', { min: '1' }],
      fastScrollSensitivity: ['err.min', { min: '1' }],
    });
    expect(errorsOf(CAT, 'terminal', term({ fontSize: 8, lineHeight: 2, minimumContrastRatio: 21, scrollback: 0 }))).toEqual({});
  });
  it('a URL must start with http(s); one with a user name and password is kept', () => {
    expect(keys(errorsOf(CAT, 'terminal', term({ panel: 'ftp://x.test' })))).toEqual({ panel: 'err.url' });
    expect(errorsOf(CAT, 'terminal', term({ panel: 'https://user:pw@app.test/' }))).toEqual({});
    const d: Draft = { view: 'display', params: { iframe_url: 'https://user:pw@site.test/' } };
    expect(saveDraft(CAT, 'browser', d)).toEqual({ view: 'display', params: { iframe_url: 'https://user:pw@site.test/' } });
  });
  it('paths start with / and have no . or .. segments; code patterns name what they want', () => {
    expect(keys(errorsOf(CAT, 'files', { view: 'folder', params: { path: 'home' } }))).toEqual({ path: 'err.slash' });
    expect(keys(errorsOf(CAT, 'files', { view: 'folder', params: { path: '/home/../etc' } }))).toEqual({ path: 'err.dots' });
    expect(keys(errorsOf(CAT, 'code', { view: 'editor', params: { folder: 'src', locale: 'english' } }))).toEqual({ folder: 'err.slash', locale: 'err.locale' });
    expect(keys(errorsOf(CAT, 'code', { view: 'extension', params: { extension: 'python' } }))).toEqual({ extension: 'err.extension' });
  });
  it('text over its catalogue length, and any value over 2,048 characters as JSON, is an inline error (never dropped silently)', () => {
    expect(keys(errorsOf(CAT, 'terminal', term({ title: 'x'.repeat(201), cwd: '/' + 'a'.repeat(3000) })))).toEqual({
      title: ['err.maxLength', { max: '200' }],
      cwd: ['err.tooLong', { max: '2,048' }],
    });
  });
  it('a theme must be a JSON object; the control\'s own parse failure wins', () => {
    expect(errorsOf(CAT, 'terminal', term({ theme: { background: '#000' } }))).toEqual({});
    expect(keys(errorsOf(CAT, 'terminal', term({ theme: { a: 1 } }), { theme: { key: 'err.json' } }))).toEqual({ theme: 'err.json' });
  });
  it('the Opens block\'s required fields are named per view; the code folder is optional on One extension', () => {
    expect(keys(errorsOf(CAT, 'files', { view: 'search', params: {} }))).toEqual({ directory: 'files.directory.required', q: 'files.q.required' });
    expect(keys(errorsOf(CAT, 'files', { view: 'folder', params: {} }))).toEqual({ path: 'files.path.folder.required' });
    expect(keys(errorsOf(CAT, 'files', { view: 'editor', params: {} }))).toEqual({ path: 'files.path.file.required' });
    expect(errorsOf(CAT, 'files', { view: 'root', params: {} })).toEqual({});
    expect(keys(errorsOf(CAT, 'code', { view: 'extension', params: {} }))).toEqual({ extension: 'code.extension.required' });
    expect(errorsOf(CAT, 'code', { view: 'extension', params: { extension: 'ms-python.python' } })).toEqual({});
  });
  it('hidden and disabled rows are neither checked nor saved', () => {
    // Bar width shows only for the bar cursor; side-panel fields wait for a page.
    const d = term({ cursorStyle: 'block', cursorWidth: 0, 'panel-width-pct': 200, fontSize: 12 });
    expect(errorsOf(CAT, 'terminal', d)).toEqual({});
    expect(saveDraft(CAT, 'terminal', d)).toEqual({ params: { cursorStyle: 'block', fontSize: 12 } });
    const withPage = setOption(d, 'panel', 'https://app.test/');
    expect(keys(errorsOf(CAT, 'terminal', withPage))).toEqual({ 'panel-width-pct': ['err.range', { min: '5', max: '95' }] });
  });
  it('errorPlaces names the sections in panel order (Save\'s tooltip and the first field it focuses)', () => {
    const d = term({ fontSize: 1, theme: { a: 1 }, scrollback: -1 });
    const e = errorsOf(CAT, 'terminal', d, { theme: { key: 'err.json' } });
    expect(errorPlaces('terminal', catView(CAT, 'terminal', undefined), d, e)).toEqual([
      { place: 'text', ids: ['fontSize'] },
      { place: 'colours', ids: ['theme'] },
      { place: 'scrolling', ids: ['scrollback'] },
    ]);
  });
});

describe('Save and counts', () => {
  it('files and code write the view explicitly; Reset all goes back to the start view (root)', () => {
    expect(resetDraft('files')).toEqual({ view: 'root', params: {} });
    expect(resetDraft('code')).toEqual({ view: 'root', params: {} });
    expect(resetDraft('browser')).toEqual({ view: 'status', params: {} });
    expect(resetDraft('terminal')).toEqual({ view: undefined, params: {} });
    expect(saveDraft(CAT, 'files', { view: 'root', params: { sort: 'size' } })).toEqual({ view: 'root', params: { sort: 'size' } });
    expect(saveDraft(CAT, 'files', { view: 'folder', params: { path: '/srv', sort: 'size' } })).toEqual({ view: 'folder', params: { path: '/srv', sort: 'size' } });
  });
  it('options the chosen view does not take stay in the draft but are not saved', () => {
    const d: Draft = { view: 'editor', params: { path: '/a.md', sort: 'size', hideSidebar: true, theme: 'nord' } };
    expect(saveDraft(CAT, 'files', d)).toEqual({ view: 'editor', params: { path: '/a.md', theme: 'nord' } });
    expect(saveDraft(CAT, 'browser', { view: 'status', params: { iframe_url: 'https://x.test/', maximize_new_windows: false } })).toEqual({ view: 'status', params: { maximize_new_windows: false } });
  });
  it('"N changed" counts kept options plus a view other than the start view; an absent view reads as the start view', () => {
    expect(changedCount(CAT, 'terminal', undefined, { fontSize: 14, cursorStyle: 'bar', bogus: 1 })).toBe(2);
    expect(changedCount(CAT, 'files', 'root', {})).toBe(0);
    expect(changedCount(CAT, 'files', 'folder', { path: '/srv' })).toBe(2);
    expect(changedCount(CAT, 'code', 'root', { locale: 'en' })).toBe(1);
    expect(changedCount(CAT, 'browser', 'status', {})).toBe(0);
    expect(changedCount(CAT, 'browser', undefined, {})).toBe(0);
  });
  it('a row waiting for a page is not counted as a change (Save would not keep it)', () => {
    expect(changedIn(CAT, 'terminal', term({ 'panel-width': '400px' }))).toEqual({});
    expect(changedIn(CAT, 'terminal', term({ panel: 'https://docs.example.com/', 'panel-width': '400px' }))).toEqual({ sidepanel: 1, advanced: 1 });
  });
  it('the pixel panel sizes follow the orientation, like the percentage rows', () => {
    const v = catView(CAT, 'terminal', undefined);
    const shown = (p: Record<string, unknown>) => shownSections('terminal', v, p as Draft['params']).flatMap((x) => x.rows.map((r) => r.id));
    expect(shown({ panel: 'https://a.example/', 'panel-position': 'top' })).toEqual(expect.arrayContaining(['panel-height', 'panel-height-pct']));
    expect(shown({ panel: 'https://a.example/', 'panel-position': 'top' })).not.toContain('panel-width');
    expect(shown({ panel: 'https://a.example/', 'panel-position': 'left' })).not.toContain('panel-height');
    expect(shown({ panel: 'https://a.example/' })).toEqual(expect.arrayContaining(['panel-width', 'panel-height']));
  });
  it('changedIn feeds the section chips', () => {
    expect(changedIn(CAT, 'terminal', term({ fontSize: 14, fontFamily: 'Menlo, monospace', theme: { background: '#000' } }))).toEqual({ text: 2, colours: 1 });
    expect(changedIn(CAT, 'files', { view: 'search', params: { directory: '/srv', q: 'x', sort: 'size' } })).toEqual({ opens: 2 });
  });
  it('saved options the catalogue no longer accepts are reported', () => {
    expect(staleIds(CAT, 'terminal', undefined, { fontSize: 14, shell: '/bin/sh', fontSize2: 3, cursorStyle: 'beam' })).toEqual(['shell', 'fontSize2', 'cursorStyle']);
    expect(staleIds(CAT, 'terminal', undefined, null)).toEqual([]);
  });
  it('the display size field keeps what was typed as a string', () => {
    const d: Draft = { view: undefined, params: { override_width: '1920' } };
    expect(errorsOf(CAT, 'display', d)).toEqual({});
    expect(saveDraft(CAT, 'display', d)).toEqual({ params: { override_width: '1920' } });
  });
  it('staleIds names a desktop height and the old notification presets, now that the catalogue refuses them (a stored tile already loses them at load, persist parseProgramTile)', () => {
    expect(staleIds(CAT, 'display', undefined, { override_width: 'auto', override_height: 'auto', web_notifications: true, notification_connection_type: 'polling' }))
      .toEqual(['override_height', 'web_notifications', 'notification_connection_type']);
  });
  it('a quality preset clears Image quality and Fixed quality; either one set reads as Custom', () => {
    const d: Draft = { view: undefined, params: { quality_mode: 'best', quality: 40 } };
    expect(qualityOf(d.params)).toBe('custom');
    expect(qualityOf({ quality_mode: 'reduced' })).toBe('custom');
    expect(applyQuality(d, 'sharp').params).toEqual({});
    expect(qualityOf(applyQuality(d, 'low').params)).toBe('low');
  });
});

describe('display quality presets round-trip', () => {
  const base: Draft = { view: undefined, params: {} };
  it.each(['sharp', 'smooth', 'low'] as const)('%s: applying it, then reading it back, selects it', (q) => {
    expect(qualityOf(applyQuality(base, q).params)).toBe(q);
  });
  it('Smooth motion then Low bandwidth leaves no video; other values read as Custom', () => {
    const d = applyQuality(applyQuality(base, 'smooth'), 'low');
    expect(d.params).toEqual({ encoding: 'jpeg', bandwidth_limit: 2000000 });
    expect(qualityOf({ encoding: 'png' })).toBe('custom');
    expect(qualityOf({ encoding: 'jpeg', bandwidth_limit: 1000000 })).toBe('custom');
    expect(applyQuality(setOptions(base, { encoding: 'png', video: false }), 'sharp').params).toEqual({});
  });
  it('the bandwidth field in Mbit/s writes whole bits per second', () => {
    expect(mbitToBits(2)).toBe(2000000);
    expect(mbitToBits(1.2345678)).toBe(1234568);
    expect(mbitToBits(NaN)).toBeUndefined();
  });
});

describe('files page parts writer', () => {
  const combos = (parts: Part[]): Set<Part>[] => parts.reduce<Set<Part>[]>((acc, part) => acc.flatMap((s) => [s, new Set([...s, part])]), [new Set()]);
  it.each(['root', 'folder', 'editor', 'search'])('%s: every tick combination reads back as ticked and writes the shorter encoding (a on a tie)', (view) => {
    const v = catView(CAT, 'files', view);
    const offered = partsOf(v);
    expect(offered).toEqual(view === 'editor' ? ['header', 'footer', 'borders'] : ['header', 'sidebar', 'preview', 'footer', 'borders']);
    for (const ticked of combos(offered)) {
      const out = partsParams(offered, ticked);
      const set = Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined)) as Record<string, boolean>;
      for (const part of offered) expect(partShown(set, part), `${view} ${[...ticked].join('+')} ${part}`).toBe(ticked.has(part));
      const a = offered.length - ticked.size, b = 1 + ticked.size;
      expect(Object.keys(set).length).toBe(Math.min(a, b));
      if (b < a) expect(set.chromeless).toBe(true);
      else expect(set.chromeless).toBeUndefined();
      // Kept as written: every value passes the catalogue for this view.
      expect(errorsOf(CAT, 'files', { view, params: { ...set, path: '/x', directory: '/x', q: 'x' } })).toEqual({});
    }
  });
  it('Minimal (nothing ticked) writes chromeless alone; everything ticked writes nothing', () => {
    expect(Object.entries(partsParams(['header', 'sidebar', 'preview', 'footer', 'borders'], new Set())).filter(([, x]) => x !== undefined)).toEqual([['chromeless', true]]);
    expect(Object.values(partsParams(['header', 'footer', 'borders'], new Set(['header', 'footer', 'borders'] as Part[]))).filter((x) => x !== undefined)).toEqual([]);
  });
});
