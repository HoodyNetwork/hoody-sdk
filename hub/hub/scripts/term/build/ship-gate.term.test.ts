// The ship gate's frame reading (build/ship-gate.ts): the page pane is what sits right of the shell's rule.
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { DEMO_CHECKS, demoCheckProblems, drawerPaneText, frameKey, goldenFile, pagePaneText, sameAcrossModes } from './ship-gate';

describe('ship gate', () => {
  test('page pane: right of the first column rule, header and footer rows dropped', () => {
    const frame = [' HOODY  Keys', ' Home   │  Keys', ' Files  │  2 keys', ' foot'].join('\n');
    expect(pagePaneText(frame)).toBe('  Keys\n  2 keys');
  });
  test('a stop banner alone is an empty pane', () => {
    const frame = 'hoody hub: stopped: navigator is not available in the terminal (TERM_GLOBAL)\n\n\n';
    expect(pagePaneText(frame).replace(/\s+/g, '')).toBe('');
  });
  test('modes: frame keys, golden files, a page drawing the same frame in both modes is named', () => {
    expect(frameKey('keys', 'error')).toBe('keys');
    expect(frameKey('keys', 'empty')).toBe('keys@empty');
    expect(goldenFile('/g', 'keys', 'error')).toBe('/g/keys.120x40.txt');
    expect(goldenFile('/g', 'keys', 'empty')).toBe('/g/empty/keys.120x40.txt');
    const frames = { home: 'A', 'home@empty': 'A', keys: 'B', 'keys@empty': 'C', blank: ' ', 'blank@empty': ' ' };
    expect(sameAcrossModes(frames, ['home', 'keys', 'blank', 'gone'], ['error', 'empty'])).toEqual(['home']);
    expect(sameAcrossModes(frames, ['home'], ['error'])).toEqual([]);
  });
  test('every gated page has both goldens and they differ (the empty account loads what the error set refuses)', () => {
    const dir = path.join(import.meta.dir, 'ship-golden');
    const pages = fs.readdirSync(dir).filter((f) => f.endsWith('.120x40.txt')).map((f) => f.slice(0, -'.120x40.txt'.length));
    expect(pages.sort()).toEqual(['billing', 'home', 'keys', 'schedules']);
    for (const p of pages) {
      const e = fs.readFileSync(goldenFile(dir, p, 'error'), 'utf8');
      const m = fs.readFileSync(goldenFile(dir, p, 'empty'), 'utf8');
      expect({ p, same: e === m }).toEqual({ p, same: false });
    }
  });
  test('demo check billing-rent: the drawn offer with its hand-off passes; a failed offer read, a payment step or a blank frame is named', () => {
    const rent = DEMO_CHECKS.find((d) => d.id === 'billing-rent')!;
    expect(rent.page).toBe('billing');
    // As the built bundle draws it at 120x40 (the drawer over the shaded page, the hand-off sentence wrapped in its box).
    const box = [
      '░░░┃ Rent a server                                   Esc ×',
      '░░░┃ ┌──────────────────────────────────────────────┐   █',
      '░░░┃ │ ⇗ Payments and plan changes are made in the web Hub. The terminal sends  │█',
      '░░░┃ │ none: nothing was sent and nothing was charged.                          │█',
      '░░░┃ │ [c Copy link]                                                            │█',
      '░░░┃ Singapore M Singapore, SG                                                   █',
    ];
    const good = [...box, '░░░┃  Total first payment', '░░░┃ [Cancel]'].join('\n');
    expect(demoCheckProblems(rent, good)).toEqual([]);
    const failed = ['░░░┃ Rent a server', "░░░┃ ! Couldn't load the offer.", '░░░┃ [Try again]'].join('\n');
    const p = demoCheckProblems(rent, failed);
    expect(p.filter((x) => x.rule === 'demo-missing').length).toBe(4);
    expect(p).toContainEqual({ page: 'billing-rent@demo', rule: 'demo-refused', message: 'drawn: "Couldn\'t load the offer."' });
    expect(demoCheckProblems(rent, [...box, '░░░┃  Total first payment', '░░░┃ [Confirm and pay]'].join('\n'))).toEqual([{ page: 'billing-rent@demo', rule: 'demo-refused', message: 'drawn: "Confirm and pay"' }]);
    // A payment step that may have gone through, drawn at open, is named even with every wanted word on screen.
    expect(demoCheckProblems(rent, [...box, '░░░┃  Total first payment', '░░░┃ Your payment may have gone through.'].join('\n'))).toEqual([{ page: 'billing-rent@demo', rule: 'demo-refused', message: 'drawn: "may have gone through"' }]);
    // The hand-off's own action is wanted: a box without it is named.
    expect(demoCheckProblems(rent, [...box.filter((r) => !r.includes('Copy link')), '░░░┃  Total first payment'].join('\n'))).toEqual([{ page: 'billing-rent@demo', rule: 'demo-missing', message: 'not drawn: "[c Copy link]"' }]);
    expect(demoCheckProblems(rent, '   \n  ')).toEqual([{ page: 'billing-rent@demo', rule: 'blank', message: 'nothing was drawn' }]);
    // In colour the page behind the drawer is drawn, not shaded: its words sit between the wrapped lines of the box.
    const page = [' Home     │  Plans & Billin', ' Board    │  ──────────────', ' Vault    │  ▸ Listings', ' Logs     │  / Search serve', ' Notes    │  Whole machines', ' Tab move · Enter open'];
    const over = (rows: readonly string[]): string => rows.map((r, i) => (page[i % page.length] ?? '').padEnd(30) + r.replace(/^░░░/, '')).join('\n');
    const coloured = over([...box, '░░░┃  Total first payment', '░░░┃ [Cancel]']);
    expect(demoCheckProblems(rent, coloured)).toEqual([]);
    expect(demoCheckProblems(rent, over([...box, '░░░┃  Total first payment', '░░░┃ [Confirm and pay]']))).toEqual([{ page: 'billing-rent@demo', rule: 'demo-refused', message: 'drawn: "Confirm and pay"' }]);
  });
  test('drawer pane: right of the edge most rows share; a frame without one is read whole', () => {
    const frame = [' Home  │ ┏━━┓ page   ┃ Drawer', ' Files │ ┃ x┃ card   ┃ line two', ' Logs  │ ┗━━┛        ┃ end'].join('\n');
    expect(drawerPaneText(frame)).toBe(' Drawer\n line two\n end');
    expect(drawerPaneText(' Home │ page\n Files │ more')).toBe(' Home │ page\n Files │ more');
  });
});
