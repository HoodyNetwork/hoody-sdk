// Programs, a press under way (parts/OpNote.tsx): the note said "… Working on it… Working on it…" in the terminal. A
// labelled Spinner sat before the same words (those were aria-hidden on the web; the terminal draws both, and its Spinner
// draws its label, kit/states/Spinner.term.tsx). The spinner is only the mark and the words are the status: once on the
// line, and as the status's name.
import { afterEach, expect, test } from 'bun:test';
import { FocusRoot } from '../../term/prim';
import { queryAllByRole, semanticsOf } from '../../term/prim/semantics';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { OpNote } from './parts/OpNote';
import type { Op } from './parts/ops';
import strings from './strings.en.json';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const WORD = strings['op.working'];
const times = (line: string, word: string) => line.split(word).length - 1;
// Only what the working note reads (its status and act); the rest of an Op is not drawn there.
const working = { act: 'start', status: 'working' } as unknown as Op;

test('a press under way says Working on it… once', async () => {
  t = await drawTest(<FocusRoot><OpNote op={working} name="web" onCheck={() => undefined} onDismiss={async () => false} /></FocusRoot>, { width: 100, height: 6 });
  const f = await t.settle();
  const lines = f.split('\n').filter((l) => l.includes(WORD));
  expect(lines.length, f).toBe(1);
  expect(times(lines[0]!, WORD), f).toBe(1);
  expect(queryAllByRole(semanticsOf(t.renderer as never), 'status', { name: new RegExp(WORD) }).length, f).toBe(1);
}, 60_000);
