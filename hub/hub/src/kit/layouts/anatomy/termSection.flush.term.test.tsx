// A flush section card: the web's `flush` takes the padding off the body only (lay.flush on .panelBody). The head
// (title, description) keeps the card's padding and the promise and note get it back (s.inset). The terminal does the
// same: with the whole card's padding dropped, "│Monthly" would sit against the border (referrals Monthly). A state the kit draws in
// words keeps the inset as well (the web's sm state pads itself); a table's states stay edge to edge with the table.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../../term/prim';
import { TermSection } from './termSection';
import type { SectionState } from './types';

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; });

async function rows(flush: boolean): Promise<string[]> {
  term = await drawTest(<FocusRoot><Box dir="column" width={40}>
    <TermSection title="Monthly" description="The last 12 months." promise="Kept for a year." note="Times are UTC." flush={flush}><Text>body row</Text></TermSection>
  </Box></FocusRoot>, { width: 40, height: 12 });
  await term.settle();
  return term.captureCharFrame().split('\n').map((l) => l.trimEnd()).filter((l) => l !== '');
}

test('a flush card keeps one cell beside its title, description, promise and note; only the body is edge to edge', async () => {
  const r = await rows(true);
  expect(r.find((l) => l.includes('Monthly'))).toMatch(/^│ Monthly/);
  expect(r.find((l) => l.includes('The last 12'))).toMatch(/^│ The last 12 months\./);
  expect(r.find((l) => l.includes('Kept for'))).toMatch(/^│ Kept for a year\./);
  expect(r.find((l) => l.includes('Times are'))).toMatch(/^│ Times are UTC\./);
  expect(r.find((l) => l.includes('body row'))).toMatch(/^│body row/);
}, 60_000);

test('a card that is not flush is unchanged: every row one cell in', async () => {
  const r = await rows(false);
  for (const word of ['Monthly', 'The last 12', 'Kept for', 'Times are', 'body row']) expect(r.find((l) => l.includes(word))).toMatch(/^│ \S/);
}, 60_000);

async function stateRows(flush: boolean, state: SectionState): Promise<string[]> {
  term = await drawTest(<FocusRoot><Box dir="column" width={40}>
    <TermSection title="Waiting" description="Files not sent yet." state={state} flush={flush}><Text>body row</Text></TermSection>
  </Box></FocusRoot>, { width: 40, height: 14 });
  await term.settle();
  return term.captureCharFrame().split('\n').map((l) => l.trimEnd()).filter((l) => l !== '');
}

// The Files Storage tab drew "│! This didn't load" and "│[Try again]" against the border of its flush cards.
test('a flush card keeps one cell beside a state the kit draws in words: failed, nothing matches', async () => {
  for (const flush of [true, false]) {
    const failed = await stateRows(flush, { kind: 'failed', error: null, onRetry: () => {} });
    expect(failed.find((l) => l.includes("This didn't load"))).toMatch(/^│ \S/);
    expect(failed.find((l) => l.includes('Try again'))).toMatch(/^│ \S/);
    expect(failed.some((l) => l.includes('body row'))).toBe(false);
    term!.renderer.destroy(); term = null;
    const none = await stateRows(flush, { kind: 'noMatch', onClear: () => {} });
    expect(none.find((l) => l.includes('Nothing matches'))).toMatch(/^│ \S/);
    expect(none.find((l) => l.includes('Clear'))).toMatch(/^│ \S/);
    term!.renderer.destroy(); term = null;
  }
}, 60_000);

test('a flush card keeps its table states edge to edge, as the table under them', async () => {
  const r = await stateRows(true, { kind: 'stale', shown: 1, error: null, onRetry: () => {} });
  expect(r.find((l) => l.includes('body row'))).toMatch(/^│body row/);
}, 60_000);
