// The class styles' band selection (jsx/style): the terminal's width and the page pane's width each re-select the
// table when a band is crossed, and only then.
import { afterEach, expect, test } from 'bun:test';
import { setStylePane, setStyleTable, setStyleTables, setStyleWidth, styleResolver, styleWidthClass, type StyleResolver } from './style';

afterEach(() => setStyleTable(null));

// Bands of 20 columns for both widths.
const keyFor = (cols: number, pane: number): string => `m${Math.floor(cols / 20)}c${Math.floor(pane / 20)}`;
function install(cols: number): { built: string[]; resolvers: Map<string, StyleResolver> } {
  const built: string[] = [];
  const resolvers = new Map<string, StyleResolver>();
  setStyleTables((k) => { let r = resolvers.get(k); if (!r) { built.push(k); r = () => undefined; resolvers.set(k, r); } return r; }, keyFor, cols);
  return { built, resolvers };
}

test('before a pane is measured the pane is the terminal', () => {
  install(100);
  expect(styleWidthClass()).toBe('m5c5');
});

test('a pane width change (a dock opens, the sidebar folds) re-selects the band; back again reuses the resolver', () => {
  const { built, resolvers } = install(120);
  setStylePane(96);
  expect(styleWidthClass()).toBe('m6c4');
  const wide = styleResolver();
  setStylePane(58); // the Agent dock opened
  expect(styleWidthClass()).toBe('m6c2');
  expect(styleResolver()).toBe(resolvers.get('m6c2')!);
  setStylePane(96); // closed again
  expect(styleResolver()).toBe(wide);
  expect(built).toEqual(['m6c6', 'm6c4', 'm6c2']); // each band built once
});

test('a change inside a band selects nothing new', () => {
  const { built } = install(120);
  setStylePane(96);
  const n = built.length;
  const r = styleResolver();
  setStylePane(99);
  setStyleWidth(121);
  expect(styleResolver()).toBe(r);
  expect(built.length).toBe(n);
});

test('the pane is never judged wider than the terminal (a resize arrives before the pane is measured again)', () => {
  install(120);
  setStylePane(96);
  setStyleWidth(60);
  expect(styleWidthClass()).toBe('m3c3');
});

test('with the shell gone the pane is the terminal again', () => {
  install(120);
  setStylePane(58);
  setStylePane(null);
  expect(styleWidthClass()).toBe('m6c6');
});
