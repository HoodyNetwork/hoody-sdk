// A label | value row keeps its value at the card's right edge whatever the value is. A text value was right-aligned
// by its Text; a value that is a part (a term with its tip, as the plan cards' Computers and Hardware rows) had no
// alignment and stood one space after its label, so two rows of a card read ragged beside the others.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot, Text } from '../../term/prim';
import { InfoTip } from '../overlays/InfoTip';
import { PlanCard } from './PlanCard';

/** The inside lines of the card (between its side borders). */
const inside = (f: string): string[] => f.split('\n').filter((l) => /^[│┃]/.test(l)).map((l) => l.slice(1, l.trimEnd().length - 1));
/** Where a line's drawn text ends (cells from the card's inner left edge). */
const end = (l: string): number => l.trimEnd().length;

const rows = [
  { id: 'computers', label: 'Computers', value: <InfoTip text="How many computers the server holds." subject="Computers">3</InfoTip> },
  { id: 'cores', label: 'CPU cores', value: '2' },
  { id: 'hardware', label: 'Hardware', value: <InfoTip text="Shared with other servers." subject="Shared hardware">Shared hardware</InfoTip> },
  { id: 'plain', label: 'Region', value: <Text>Frankfurt</Text> },
  { id: 'ai', label: 'AI', value: 'Plus AI allowance' },
];

for (const width of [45, 36] as const) {
  test(`${width} cells: a part as the value ends at the right edge, as the text values do`, async () => {
    const t = await drawTest(<FocusRoot><PlanCard name="Small" rows={rows} /></FocusRoot>, { width, height: 12 });
    const f = await t.settle();
    const lines = inside(f);
    const of = (label: string) => lines.find((l) => l.trimStart().startsWith(label))!;
    const edge = end(of('CPU cores'));
    expect(of('CPU cores').trimEnd().endsWith('2')).toBe(true);
    for (const label of ['Computers', 'Hardware', 'Region', 'AI']) expect(end(of(label)), label).toBe(edge);
    // Label and value are apart: more than the one space a ragged row had.
    expect(of('Computers')).toMatch(/Computers {3,}\S/);
    t.renderer.destroy();
  });
}

test('a part too wide for its label line takes the next line, at the right edge, inside the card', async () => {
  const long = [
    { id: 'cores', label: 'CPU cores', value: '2' },
    { id: 'hardware', label: 'Hardware', value: <InfoTip text="Shared with other servers." subject="Shared">Shared with other servers</InfoTip> },
  ];
  const t = await drawTest(<FocusRoot><PlanCard name="Small" rows={long} /></FocusRoot>, { width: 30, height: 10 });
  const f = await t.settle();
  const lines = inside(f);
  const edge = end(lines.find((l) => l.includes('CPU cores'))!);
  const label = lines.findIndex((l) => l.includes('Hardware'));
  expect(lines[label]!.trim()).toBe('Hardware');
  const value = lines[label + 1]!;
  expect(value.trim().startsWith('Shared with other servers')).toBe(true);
  expect(end(value)).toBe(edge);
  // Nothing is drawn on or past the border.
  for (const l of f.split('\n').filter((x) => /^[│┃]/.test(x))) expect(/[│┃]$/.test(l.trimEnd())).toBe(true);
  t.renderer.destroy();
});
