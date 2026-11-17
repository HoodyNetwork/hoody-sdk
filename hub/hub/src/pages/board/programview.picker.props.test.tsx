// Vitest: the program view's "Pick another" Picker gets what the Board's own Picker gets (BoardView pickerBase):
// whether the list is whole (a partial first page never says "no match"), the Board's power (Start or Resume on a
// stopped computer) and where a held start comes from. Its dialog opens only on a tile 'gone' with its computer still
// listed, which the fixtures cannot reach, so this pins the wiring in the source.
import { describe, expect, it } from 'vitest';
import src from './parts/ProgramView.tsx?raw';

const picker = src.slice(src.indexOf('<Picker'), src.indexOf('/>', src.indexOf('onPick=', src.indexOf('<Picker'))));

describe('Program view: Pick another', () => {
  it('passes complete, power and heldFrom to the Picker', () => {
    expect(picker).toContain('complete={comps.complete}');
    expect(picker).toContain('power={power}');
    expect(picker).toContain('heldFrom={heldFromLink}');
  });
});
