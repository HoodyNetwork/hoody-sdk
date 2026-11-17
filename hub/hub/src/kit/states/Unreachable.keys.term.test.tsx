// React must not warn about keys while the terminal draws UnreachableState. Box rewrites a fragment child that holds
// bare text (prim/Box.ts inkBare); the copy it puts in the children list needs a key like the BareText beside it.
// React reports a missing key once per component pair, so each case is its own test (run alone with -t for a clean read).
import { afterAll, afterEach, beforeAll, expect, spyOn, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { setStyleTable } from '../../term/jsx/style';
import { installStyleTable } from '../../../scripts/term/style-table';
import { UnreachableState } from './Unreachable';

beforeAll(() => installStyleTable(120), 120_000);
afterAll(() => setStyleTable(null));

const keyWarnings = (calls: unknown[][]): string[] =>
  calls.map((c) => c.map(String).join(' ')).filter((m) => /"key"/.test(m));

let spy: ReturnType<typeof spyOn> | null = null;
afterEach(() => { spy?.mockRestore(); spy = null; });

async function warnings(node: ReactNode): Promise<string[]> {
  spy = spyOn(console, 'error').mockImplementation(() => {});
  const t = await drawTest(<FocusRoot><OverlayHost><Box width={80}>{node}</Box></OverlayHost></FocusRoot>, { width: 80, height: 16 });
  await t.settle();
  t.renderer.destroy();
  return keyWarnings(spy.mock.calls);
}

for (const size of ['compact', 'sm', 'md'] as const) {
  for (const error of [undefined, { status: 0 }]) {
    for (const secondary of [undefined, <>other</>]) {
      test(`UnreachableState ${size}${error ? ' details' : ''}${secondary ? ' secondary' : ''}: no React key warning`, async () => {
        expect(await warnings(<UnreachableState size={size} computer="atlas" onRetry={() => {}} error={error} secondary={secondary} />)).toEqual([]);
      });
    }
  }
}

function Row() { return <Box dir="row" gap={1}><Text>a</Text><>b<Text>c</Text></></Box>; }
test('Box: a fragment holding bare text beside another child: no React key warning', async () => {
  expect(await warnings(<Row />)).toEqual([]);
});
