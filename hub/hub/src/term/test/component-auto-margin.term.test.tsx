// A parent's child rule with an auto margin reaches a component item: Files' bar (`.barActions > :first-child {
// margin-inline-start: auto }`) pushes its first action, a kit Button that draws prims, to the bar's end. The rule was
// lost on a component (only elements resolve child rules), so the wrapped action line started at the left.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../prim/testing';
import { Box, Text } from '../prim';
import { resolverFor } from '../jsx/css-table';
import { setStyleTable } from '../jsx/style';
import type { Table } from '../../../scripts/term/css-translate/types';

const cls = (n: string) => `pages/x/automargin.module.css#${n}`;
const entry = (n: string, extra: Record<string, unknown>) => ({ [cls(n)]: { id: cls(n), style: {}, status: 'full', outcomes: [], ...extra } });
const table = { version: 1, generated: '', widthClass: {}, unitModel: {}, modules: {}, classes: {
  ...entry('bar', { style: { flexDirection: 'row', columnGap: 1 } }),
  ...entry('actions', { contents: true, childRules: [
    { selector: '.actions > :first-child', direct: true, match: { pseudo: ['first-child'] }, specificity: [0, 2, 0], outcomes: [], style: { marginLeft: 'auto' } },
    { selector: '.actions > *', direct: true, match: {}, specificity: [0, 1, 0], outcomes: [], style: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' } },
  ] }),
} } as unknown as Table;

// A kit-like component: draws prims only.
const Prim = ({ label }: { label: string }) => <Box><Text>{`[${label}]`}</Text></Box>;
// A component that draws an element: the element takes the rule itself.
const Elem = ({ label }: { label: string }) => <span>{`<${label}>`}</span>;

let t: TestTerm | null = null;
afterEach(() => { setStyleTable(null); t?.renderer.destroy(); t = null; });

const draw = async (first: 'prim' | 'elem'): Promise<string> => {
  setStyleTable(resolverFor(table));
  t = await drawTest(
    <Box dir="column" width={40} height={2}>
      <div className={cls('bar')}>
        <span>crumbs</span>
        <div className={cls('actions')}>
          {first === 'prim' ? <Prim label="Find" /> : <Elem label="Find" />}
          <Prim label="New" />
        </div>
      </div>
    </Box>, { width: 40, height: 2 });
  await t.settle();
  return (await t.settle()).split('\n')[0]!;
};

test('a component pushed by a child rule\'s auto margin sits at the row\'s end', async () => {
  expect(await draw('prim')).toBe(`${'crumbs'.padEnd(28)}[Find] [New]`);
});

test('a component drawing an element: the element takes the margin, still at the end', async () => {
  expect(await draw('elem')).toBe(`${'crumbs'.padEnd(28)}<Find> [New]`);
});
