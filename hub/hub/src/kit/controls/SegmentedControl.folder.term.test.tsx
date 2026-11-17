// SegmentedControl.term, variant="folder": the web draws folder tabs, "the kit Tabs strip's look" (SegmentedControl.module.css
// .folder). In the terminal that is Tabs.term's tab: "▸ Label" bold for the chosen one, "  Label" for the others, and
// never ‹ ›, which a terminal Tabs strip uses only for its carousel markers (‹ n / n ›): a folder switch whose views all
// fit must not read as a folded strip (Computers header: "Computers ‹ Computers › Servers  Projects").
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { SegmentedControl, type SegmentItem } from './SegmentedControl';

const items: SegmentItem[] = [
  { id: 'computers', label: 'Computers' },
  { id: 'servers', label: 'Servers', count: 2 },
  { id: 'projects', label: 'Projects' },
];

const firstLine = (f: string): string => f.split('\n')[0] ?? '';

test('folder: the chosen view is "▸ Label" as an open tab, the others plain; no ‹ › anywhere', async () => {
  const t = await drawTest(
    <FocusRoot><SegmentedControl label="Views" variant="folder" items={items} value="computers" onChange={() => {}} /></FocusRoot>,
    { width: 60, height: 3 },
  );
  const line = firstLine(t.captureCharFrame());
  expect(line).toContain('▸ Computers');
  expect(line).toContain('  Servers 2  ');
  expect(line).toContain('  Projects');
  expect(line).not.toMatch(/[‹›]/);
  t.renderer.destroy();
});

test('folder: the ▸ mark follows the value; the default variant keeps its ‹ › segment marks', async () => {
  let t = await drawTest(
    <FocusRoot><SegmentedControl label="Views" variant="folder" items={items} value="servers" onChange={() => {}} /></FocusRoot>,
    { width: 60, height: 3 },
  );
  let line = firstLine(t.captureCharFrame());
  expect(line).toContain('▸ Servers 2');
  expect(line).not.toContain('▸ Computers');
  t.renderer.destroy();
  t = await drawTest(
    <FocusRoot><SegmentedControl label="Views" items={items} value="servers" onChange={() => {}} /></FocusRoot>,
    { width: 60, height: 3 },
  );
  line = firstLine(t.captureCharFrame());
  expect(line).toContain('‹ Servers 2 ›');
  expect(line).not.toContain('▸');
  t.renderer.destroy();
});
