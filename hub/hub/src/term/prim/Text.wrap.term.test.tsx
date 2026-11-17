// Word wrap breaks where the web does: at spaces and the web's break opportunities, never inside "$0.25", "4.5" or a
// word-initial "-exec", and a line
// never ends with an opening bracket. The break set is the engine's (native
// `utf8.asciiPunctLineBreak`, fork patch 0008, engine 0.8.4-hoody.2); these pin it from the Hub side.
import { expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from './testing';
import { Box, FocusRoot, Text } from './index';

async function lines(node: ReactNode, width: number, height = 6): Promise<string[]> {
  const t = await drawTest(<FocusRoot>{node}</FocusRoot>, { width, height });
  await t.settle();
  const f = await t.settle();
  t.renderer.destroy();
  return f.split('\n').map((l) => l.trimEnd()).filter((l) => l.length > 0);
}

test('a usage line: "$0.25" stays whole on its line', async () => {
  const got = await lines(
    <Box width={40}><Text>{'91,610 in, 530 out · 90,400 cached · $0.25'}</Text></Box>,
    44,
  );
  expect(got).toEqual(['91,610 in, 530 out · 90,400 cached ·', '$0.25']);
});

test('no break after "." or between a hyphen and a digit, nor after a word-initial hyphen', async () => {
  expect(await lines(<Box width={10}><Text>{'x sonnet-4.5z'}</Text></Box>, 10)).not.toContain('x sonnet-');
  expect(await lines(<Box width={5}><Text>{'run -exec now'}</Text></Box>, 5)).toEqual(['run', '-exec', 'now']);
  expect(await lines(<Box width={8}><Text>{'cost $0.25'}</Text></Box>, 8)).toEqual(['cost', '$0.25']);
});

test('no line ends with an opening bracket or a quote', async () => {
  expect(await lines(<Box width={10}><Text>{'spreads (DNS).'}</Text></Box>, 10)).toEqual(['spreads', '(DNS).']);
  expect(await lines(<Box width={5}><Text>{'ab [cd] e'}</Text></Box>, 5)).toEqual(['ab', '[cd]', 'e']);
  expect(await lines(<Box width={5}><Text>{'ab {cd} e'}</Text></Box>, 5)).toEqual(['ab', '{cd}', 'e']);
  expect(await lines(<Box width={8}><Text>{'say "hi there"'}</Text></Box>, 8)).toEqual(['say "hi', 'there"']);
  expect(await lines(<Box width={8}><Text>{"say 'hi there'"}</Text></Box>, 8)).toEqual(["say 'hi", "there'"]);
});

test('the web\'s own break opportunities stay: a hyphen after a word, a slash', async () => {
  expect(await lines(<Box width={10}><Text>{'self-contained'}</Text></Box>, 10)).toEqual(['self-', 'contained']);
  expect(await lines(<Box width={8}><Text>{'path/to/file'}</Text></Box>, 8)).toEqual(['path/to/', 'file']);
});
