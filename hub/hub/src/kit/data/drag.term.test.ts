import { expect, test } from 'bun:test';
import { copyKeyName, isCopyDrag, useRefuseStrayFiles, useTableDrag } from './drag';

test('no drag in a terminal: the table gets nothing to spread and no hint', () => {
  const d = useTableDrag(undefined, undefined, () => undefined, () => []);
  expect(d.frameProps).toEqual({});
  expect(d.rowProps('a', {})).toEqual({});
  expect(d.hint).toBeNull();
  expect(useRefuseStrayFiles(true)).toBeUndefined();
  expect(copyKeyName(true)).toBe('Option');
  expect(isCopyDrag({ altKey: false, ctrlKey: true }, false)).toBe(true);
});
