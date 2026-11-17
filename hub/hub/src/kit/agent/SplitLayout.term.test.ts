// SplitLayout.term repeats the web's splitState (a sibling never value-imports its base): the two must agree everywhere.
import { expect, test } from 'bun:test';
import { splitState as termRule } from './SplitLayout.term';
import { SIZE_BREAKS, sizeClassOf, type SizeClass } from './useSizeClass';

test('the terminal frame rule equals the web rule for every size, screen and Details state', async () => {
  // The base, read as source and evaluated alone: its splitState body (no CSS module, no React) — the loader would hand a
  // terminal import of './SplitLayout' the sibling.
  const src = await Bun.file(new URL('./SplitLayout.tsx', import.meta.url)).text();
  const body = src.slice(src.indexOf('export function splitState'), src.indexOf('export interface SplitLayoutProps'));
  expect(body).toContain('isSmall(size)');
  const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(body.replace('export function', 'function') + '\nreturn splitState;');
  const isSmall = (c: SizeClass): boolean => c === 'xs' || c === 's';
  const webRule = new Function('isSmall', js)(isSmall) as typeof termRule;
  const sizes = [...new Set([...SIZE_BREAKS.map((b) => b - 1), ...SIZE_BREAKS, 3000].map((px) => sizeClassOf(px, 'l')))];
  expect(sizes.length).toBe(6);
  for (const size of sizes) for (const detailsOpen of [false, true]) for (const screen of [undefined, 'list', 'conversation'] as const) {
    expect(termRule(size, { detailsOpen, screen })).toEqual(webRule(size, { detailsOpen, screen }));
  }
});
