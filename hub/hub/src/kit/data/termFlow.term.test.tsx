// termFlow: the words of a sentence that holds controls.
import { expect, test } from 'bun:test';
import { flowWords } from './termFlow';

test('flowWords: every word keeps the blanks after it, and the pieces join back to the text', () => {
  expect(flowWords('. In the group')).toEqual(['. ', 'In ', 'the ', 'group']);
  expect(flowWords(' to @BotFather ')).toEqual([' ', 'to ', '@BotFather ']);
  expect(flowWords('')).toEqual([]);
  for (const s of ['a  b', '  x', 'one', 'tab\tsep end ']) expect(flowWords(s).join('')).toBe(s);
}, 30_000);
