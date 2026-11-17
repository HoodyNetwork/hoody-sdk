// Cascade by source order, unknown class ids recorded, unconsumed style keys count as partial.
import { expect, test } from 'bun:test';
import { clearStyleLedger, resolverFor, styleLedger } from '../jsx/css-table';
import type { Table } from '../../../scripts/term/css-translate/types';

const entry = (id: string, style: Record<string, unknown>) => ({ id, style, status: 'full', outcomes: [] });
const table = { version: 1, generated: '', widthClass: {}, unitModel: {}, modules: {}, classes: {
  'a.module.css#first': entry('a.module.css#first', { paddingLeft: 1 }),
  'a.module.css#second': entry('a.module.css#second', { paddingLeft: 3 }),
  'a.module.css#odd': entry('a.module.css#odd', { aspectRatio: 2 }),
} } as unknown as Table;
const r = resolverFor(table);
const el = (classes: string[]) => ({ tag: 'div', classes, attrs: {}, empty: false });

test('equal specificity: the later rule in the source wins, whatever the className order', () => {
  expect(r(el(['a.module.css#second', 'a.module.css#first']), [])?.box?.raw?.paddingLeft).toBe(3);
  expect(r(el(['a.module.css#first', 'a.module.css#second']), [])?.box?.raw?.paddingLeft).toBe(3);
});

test('a module class id missing from the table is recorded; a global class is not', () => {
  clearStyleLedger();
  r(el(['a.module.css#gone', 'some-global']), []);
  expect(styleLedger().unknownClasses).toEqual(['a.module.css#gone']);
});

test('a class using a style key the runtime does not consume counts as partial', () => {
  clearStyleLedger();
  r(el(['a.module.css#odd']), []);
  expect(styleLedger().partial).toEqual(['a.module.css#odd']);
  expect(styleLedger().unconsumed[0]).toContain('aspectRatio');
});
