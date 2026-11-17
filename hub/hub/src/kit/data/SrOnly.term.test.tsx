// SrOnly in a terminal. The web hides its words from the eye and keeps them for a screen reader; the terminal drew
// nothing AND kept nothing, so where a figure is hidden from the tree and SrOnly says it in words (Referrals: "< 3" on
// screen, "Fewer than 3" for a reader) the semantics tree had no count at all. The words now stay in the tree as text;
// the screen is unchanged, cell for cell.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, Text } from '@term/prim';
import { semText, semanticsOf } from '../../term/prim/semantics';
import { PlanCard } from '../widgets/PlanCard';
import { SrOnly } from './Display';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const tree = (): string => semText(semanticsOf(t!.renderer as never));

test('the words are in the semantics tree and not on screen; a row with a gap draws as if SrOnly were not there', async () => {
  t = await drawTest(<Box dir="row" gapX={1}><Text>one</Text><Text>two</Text></Box>, { width: 30, height: 3 });
  const without = await t.settle();
  t.renderer.destroy();
  t = await drawTest(<Box dir="row" gapX={1}><Text>one</Text><SrOnly>heard only</SrOnly><Text>two</Text></Box>, { width: 30, height: 3 });
  const withIt = await t.settle();
  expect(withIt).toBe(without);
  expect(withIt).toContain('one two');
  expect(tree()).toContain('heard only');
});

test('no words, no node: empty, null and blank children add nothing to the tree', async () => {
  t = await drawTest(<Box dir="row" gapX={1}><Text>one</Text><SrOnly>{null}</SrOnly><SrOnly>{'  '}</SrOnly><Text>two</Text></Box>, { width: 30, height: 3 });
  expect(await t.settle()).toContain('one two');
  expect(tree().match(/text "/g)).toHaveLength(2);
});

test('a plan card whose figure is hidden from the tree says its words there, and draws the figure', async () => {
  const card = (said: boolean) => (
    <PlanCard
      name="Your level"
      price={{ amount: <><bdi aria-hidden="true">{'< 3'}</bdi>{said ? <SrOnly>Fewer than 3</SrOnly> : null}</>, per: <bdi>of 11 needed</bdi> }}
    />
  );
  t = await drawTest(card(false), { width: 40, height: 10 });
  const without = await t.settle();
  t.renderer.destroy();
  t = await drawTest(card(true), { width: 40, height: 10 });
  const frame = await t.settle();
  expect(frame).toBe(without);
  expect(frame).toContain('< 3 of 11 needed');
  const said = tree();
  expect(said).toContain('Fewer than 3');
  expect(said).not.toContain('< 3');
  expect(said).toContain('of 11 needed');
});
