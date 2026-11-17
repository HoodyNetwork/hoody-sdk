// A pick list row that cannot be picked (the Computer menu's "Loading computers…", a search's "No match", the account
// heading with no settings page) was drawn only in the 'faint' colour. With NO_COLOR (the mono tier) colours are
// dropped, so it looked the same as a row that can be picked. It is also dim now (the kit Button's disabled look); a row
// that can be picked is not.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../prim/testing';
import { FocusRoot, setColourTier } from '../prim';
import { PickList, type PickItem } from './layer';

const DIM = 2;
let t: TestTerm | null = null;
afterEach(async () => { await t?.dispose(); t = null; setColourTier('truecolor'); });

const items: PickItem[] = [
  { id: 'a', label: 'Alpha computer' },
  { id: 'b', label: 'Beta computer' },
  { id: 'load', label: 'Loading computers', disabled: true },
];

/** The attributes of the first cell drawing `text`. */
function attrsOf(term: TestTerm, frame: string, text: string): number {
  const y = frame.split('\n').findIndex((l) => l.includes(text));
  expect(y, frame).toBeGreaterThanOrEqual(0);
  const row = frame.split('\n')[y]!;
  const x = Bun.stringWidth(row.slice(0, row.indexOf(text)));
  let c = 0;
  for (const sp of term.captureSpans().lines[y]!.spans) {
    const w = (sp as { width?: number }).width ?? [...sp.text].length;
    if (x < c + w) return sp.attributes;
    c += w;
  }
  return 0;
}

test('mono: a row that cannot be picked is dim, a row that can is not', async () => {
  setColourTier('mono');
  t = await drawTest(<FocusRoot><PickList items={items} active={0} onPick={() => {}} rows={6} /></FocusRoot>, { width: 40, height: 6 });
  const f = await t.settle();
  expect(attrsOf(t, f, 'Loading computers') & DIM, f).toBe(DIM);
  // Positive control on the same list: the other rows (the active one and a plain one) carry no dim.
  expect(attrsOf(t, f, 'Alpha computer') & DIM, f).toBe(0);
  expect(attrsOf(t, f, 'Beta computer') & DIM, f).toBe(0);
});
