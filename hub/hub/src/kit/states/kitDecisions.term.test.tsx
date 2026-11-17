// Terminal decisions for kit exports that had none: HoodyLoader draws natively (the still busy mark and the page's
// words), LoadScreen is a hand-off (its web screen is never drawn here). The kit check (scripts/term/kit-classes.ts)
// pins the decision itself; these pin what each draws.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | HoodyLoader with words: "… <words>", a status | 'loader with words' |
// | 2 | HoodyLoader with a label only: "…", a status named by it; neither: hidden | 'loader label' |
// | 3 | LoadScreen: the hand-off's reason, never its stages | 'load screen hands off' |
// | 4 | The sibling's mark values equal the web module's | 'mark values' |
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { getAllByRole, semanticsOf } from '../../term/prim/semantics';
import { Box, FocusRoot } from '../../term/prim';
import { HoodyLoader } from './HoodyLoader';
import { LOAD_CARD_MS, LoadScreen } from './LoadScreen';
import { readFileSync } from 'node:fs';
import { HOODY_MARK, HOODY_PARTS } from './HoodyLoader';
import { BRAND_MARK_PATH, BRAND_WIDTH } from '../data/BrandMark';

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; });

test('loader with words: the still mark, then the words, as a status', async () => {
  term = await drawTest(<Box dir="column"><HoodyLoader text="Waiting for the agent" /></Box>, { width: 40, height: 4 });
  const f = await term.settle();
  expect(f).toContain('… Waiting for the agent');
  expect(getAllByRole(semanticsOf(term.renderer as never), 'status').length).toBe(1);
}, 60_000);

test('loader label: a status named by its label; without one it is hidden', async () => {
  term = await drawTest(<Box dir="column"><HoodyLoader label="Loading chats" /><HoodyLoader /></Box>, { width: 40, height: 4 });
  const f = await term.settle();
  expect(f).toContain('…');
  const st = getAllByRole(semanticsOf(term.renderer as never), 'status');
  expect(st.length).toBe(1);
  expect(st[0]!.name).toBe('Loading chats');
}, 60_000);

test('load screen hands off: the reason is drawn, the stages never are', async () => {
  term = await drawTest(
    <FocusRoot><LoadScreen title="Setting up" status="Step 1" stages={[{ id: 'a', label: 'Make the computer', state: 'now' }]} stagesLabel="Steps" items={[]} itemsLabel="Cards" /></FocusRoot>,
    { width: 100, height: 14 },
  );
  const f = await term.settle();
  expect(f).toContain('The setup screen shows its steps in a browser.');
  expect(f).not.toContain('Make the computer');
}, 60_000);

test('mark values: the siblings\' HOODY_MARK, HOODY_PARTS and LOAD_CARD_MS equal the web modules\'', () => {
  // Read as text: importing the web module here would resolve to this sibling.
  const web = readFileSync(new URL('./HoodyLoader.tsx', import.meta.url), 'utf8');
  expect(web).toContain(`export const HOODY_MARK = '${HOODY_MARK}';`);
  for (const d of HOODY_PARTS) expect(web).toContain(`'${d}',`);
  expect(readFileSync(new URL('./LoadScreen.tsx', import.meta.url), 'utf8')).toContain(`export const LOAD_CARD_MS = ${LOAD_CARD_MS};`);
});

test('brand values: the sibling\'s BRAND_MARK_PATH and BRAND_WIDTH equal the web module\'s', () => {
  // Read as text: importing the web module here would resolve to this sibling.
  const web = readFileSync(new URL('../data/BrandMark.tsx', import.meta.url), 'utf8');
  expect(web).toContain(`export const BRAND_MARK_PATH = '${BRAND_MARK_PATH}';`);
  expect(web).toContain(`export const BRAND_WIDTH = { mark: ${BRAND_WIDTH.mark}, hoody: ${BRAND_WIDTH.hoody}, hub: ${BRAND_WIDTH.hub} } as const;`);
});
