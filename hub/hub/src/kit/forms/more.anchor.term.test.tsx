// more.term: an open list is drawn at its field as laid out, not where the field stood when the list opened. A field
// that moves in the same update that opens its list (a panel that lays out as it opens, lines added above) keeps its
// list right under it.
import { expect, test } from 'bun:test';
import { useRef, useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot, Pressable, Text } from '../../term/prim';
import { Combobox } from './more';
import type { Option } from './more.pure';

const opts: Option[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie' },
];

function Moves() {
  const [lines, setLines] = useState(0);
  const [v, setV] = useState<string | undefined>('a');
  const input = useRef<HTMLInputElement | null>(null);
  return (
    <FocusRoot>
      <Box dir="column">
        <Pressable autoFocus onPress={() => { setLines(6); input.current?.focus(); }}>{({ focused }) => <Text inverse={focused}>[Go]</Text>}</Pressable>
        {Array.from({ length: lines }, (_, i) => <Text key={i}>{`line ${i}`}</Text>)}
        <Combobox label="Region" options={opts} value={v} onChange={setV} inputRef={input} />
      </Box>
    </FocusRoot>
  );
}

test('Combobox: a list opened while its field moves is drawn under the field', async () => {
  const t = await drawTest(<Moves />, { width: 60, height: 24 });
  await t.settle();
  t.mockInput.pressEnter();
  await new Promise((r) => setTimeout(r, 80));
  const f = (await t.settle()).split('\n');
  const field = f.findIndex((l) => /Alpha\s+▾/.test(l));
  const top = f.findIndex((l) => l.includes('┌'));
  expect(f.slice(1, 7).join('\n')).toContain('line 5');
  expect(f.findIndex((l) => l.includes('Bravo'))).toBeGreaterThan(field);
  expect(top).toBe(field + 1);
  t.renderer.destroy();
});
