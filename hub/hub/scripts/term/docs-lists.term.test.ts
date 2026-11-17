import { expect, test } from 'bun:test';
import { exportListProblems, exportLists } from './docs-lists';

const doc = (body: string): string => `# T\n\ntext\n<!-- exports-of: src/term/prim/page.ts -->\n${body}\n<!-- exports-of:end -->\n`;

test('a list naming exactly the exports passes', () => {
  const [l] = exportLists(doc('`Box`, `Text`'));
  expect(l!.source).toBe('src/term/prim/page.ts');
  expect(l!.line).toBe(4);
  expect(exportListProblems(l!, ['Text', 'Box'])).toEqual([]);
});

test('an export missing from the list and a listed name the file lacks both fail', () => {
  const [l] = exportLists(doc('`Box`, `Gone`'));
  expect(exportListProblems(l!, ['Box', 'Spacer'])).toEqual([
    '`Gone` is listed as an export of src/term/prim/page.ts, which does not export it',
    'src/term/prim/page.ts exports Spacer, which the list lacks',
  ]);
});

test('text outside the markers is not part of the list', () => {
  const [l] = exportLists('`Outside`\n' + doc('`Box`') + '`After`');
  expect([...l!.names]).toEqual(['Box']);
  expect(exportLists('no list here `Box`')).toEqual([]);
});

test('the syntax shown with a placeholder (`<file>`) is not a list', () => {
  expect(exportLists('`<!-- exports-of: <file> -->` ... `<!-- exports-of:end -->`')).toEqual([]);
});
