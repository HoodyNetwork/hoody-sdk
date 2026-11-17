// Reply.term: the reply's markdown drawn in cells, safe against hostile agent output.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { Prose, ReplyFooter } from './Reply';
import { tableWidths } from './tableWidths';

const MD = [
  '## Plan',
  'This is **bold**, *italic* and `npm test`. See [the docs](https://example.com/docs) or https://example.org/a/very/long/path/that/keeps/going/and/going?x=1',
  '- first item',
  '- second item that is long enough to wrap onto the next line of a narrow column',
  '1. one',
  '2. two',
  '> quoted words',
  '| Name | Port | State |',
  '| --- | --- | --- |',
  '| web | 3000 | running |',
  '| db | 5432 | stopped |',
  '```ts',
  'const x: number = 1;',
  '```',
].join('\n');

test('markdown blocks at 60 columns', async () => {
  const t = await drawTest(<FocusRoot><Box width={60}><Prose text={MD} /></Box></FocusRoot>, { width: 60, height: 40 });
  const f = await t.settle();
  expect(f).toContain('Plan');
  expect(f).toContain('• first item');
  expect(f).toContain('1. one');
  expect(f).toContain('│ quoted words');
  expect(f).toMatch(/Name\s+│ Port │ State/);
  expect(f).toContain('web  │ 3000 │ running');
  expect(f).toContain('─────┼─');
  expect(f).toContain('const x: number = 1;');
  expect(f.replace(/\s+/g, '')).toContain('thedocs(example.com)');
  // A bare address is drawn whole (it wraps; nothing is cut with an ellipsis).
  expect(f.replace(/\s+/g, '')).toContain('https://example.org/a/very/long/path/that/keeps/going/and/going?x=1');
  expect(f).not.toContain('…');
  t.renderer.destroy();
});

test('a table too wide becomes rows of "Header: value"', async () => {
  const md = '| Alpha column | Beta column | Gamma column | Delta column |\n| --- | --- | --- | --- |\n| a | b | c | d |';
  const t = await drawTest(<FocusRoot><Box width={30}><Prose text={md} /></Box></FocusRoot>, { width: 30, height: 12 });
  const f = await t.settle();
  expect(f).toContain('Alpha column: a');
  expect(f).toContain('Delta column: d');
  t.renderer.destroy();
});

test('tableWidths: fits, squeezes, gives up', () => {
  expect(tableWidths([4, 4], 20)).toEqual([4, 4]);
  expect(tableWidths([30, 10], 30)).toEqual([17, 10]);
  expect(tableWidths([30, 30, 30], 20)).toBeNull();
});

test('a long code block folds to its peek and opens', async () => {
  const code = '```sh\n' + Array.from({ length: 30 }, (_, i) => `echo line-${i + 1}`).join('\n') + '\n```';
  const t = await drawTest(<FocusRoot><Box width={50}><Prose text={code} /></Box></FocusRoot>, { width: 50, height: 50 });
  let f = await t.settle();
  expect(f).toContain('echo line-12');
  expect(f).not.toContain('echo line-13');
  expect(f).toContain('18 more lines');
  // Tab to the code's Copy, then to the fold toggle.
  t.mockInput.pressTab();
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(f).toContain('echo line-30');
  expect(f).toContain('Show less');
  t.renderer.destroy();
});

test('hostile agent output: no escape reaches the terminal, no link to a script address', async () => {
  const evil = 'Hello \x1b]52;c;ZXZpbA==\x07 \x1b[2J\x1b]0;pwned\x07 [click](javascript:alert(1)) ‮evil‬ done\n```\n\x1b[31mred\x1b[0m\n```';
  const t = await drawTest(<FocusRoot><Box width={60}><Prose text={evil} /></Box></FocusRoot>, { width: 60, height: 12 });
  const f = await t.settle();
  expect(f).not.toContain('\x1b');
  expect(f).not.toContain('‮');
  expect(f).toContain('done');
  // javascript: is text, never a link.
  const cells = JSON.stringify(t.captureSpans?.() ?? '');
  expect(cells).not.toContain('javascript:');
  t.renderer.destroy();
});

test('streaming caret, footer', async () => {
  const t = await drawTest(
    <FocusRoot>
      <Box dir="column" width={40}>
        <Prose text="Working on it" caret />
        <ReplyFooter text="x" cost={0.012} at={Date.UTC(2026, 10, 11, 9, 5)} />
      </Box>
    </FocusRoot>,
    { width: 40, height: 6 },
  );
  const f = await t.settle();
  expect(f).toContain('Working on it▍');
  expect(f).toContain('Copy');
  expect(f).toContain('$0.012');
  t.renderer.destroy();
});
