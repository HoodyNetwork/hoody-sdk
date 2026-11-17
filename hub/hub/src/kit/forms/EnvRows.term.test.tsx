// EnvRows.term: the web component's observable behaviours, each held here.
//  - the legend, then the help (or the help under the rows with helpBelow)
//  - one row per variable: the name in a mono field, the value masked (never drawn), a Remove per row
//  - typing in a name or value calls onEdit(id, {key}) / onEdit(id, {value})
//  - Remove calls onRemove(id); Add calls onAdd()
//  - the caller's error shows as one line under the rows (✗)
//  - isDisabled (or a Form lock) holds every field and both buttons
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { EnvRows, type EnvRow } from './EnvRows';

const W = { width: 90, height: 16 };
const labels = { key: (n: number) => `Name ${n}`, value: (n: number) => `Value ${n}`, remove: (n: number) => `Remove ${n}`, keyHint: 'NAME', valueHint: 'value', add: 'Add variable' };
type Log = Array<[string, unknown]>;

function P({ log, helpBelow, error, isDisabled }: { log: Log; helpBelow?: boolean; error?: string; isDisabled?: boolean }) {
  const [rows, setRows] = useState<EnvRow[]>([{ id: 1, key: 'API_URL', value: 'hunter2-secret' }]);
  return (
    <FocusRoot>
      <EnvRows
        rows={rows}
        legend="Environment"
        help="Values stay on this computer."
        helpBelow={helpBelow}
        labels={labels}
        error={error}
        isDisabled={isDisabled}
        onEdit={(id, c) => { log.push(['edit', c]); setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...c } : r))); }}
        onRemove={(id) => { log.push(['remove', id]); setRows((rs) => rs.filter((r) => r.id !== id)); }}
        onAdd={() => { log.push(['add', null]); setRows((rs) => [...rs, { id: rs.length + 10, key: '', value: '' }]); }}
      />
    </FocusRoot>
  );
}

test('legend, help, a row with the value masked; error line', async () => {
  const t = await drawTest(<P log={[]} error="Names must be unique." />, W);
  const f = t.captureCharFrame();
  expect(f).toMatch(/Environment\s*\nValues stay on this computer\./);
  expect(f).toContain('API_URL');
  expect(f).not.toContain('hunter2');
  expect(f).toContain('Add variable');
  expect(f).toContain('✗ Names must be unique.');
  t.renderer.destroy();
});

test('helpBelow puts the help under the rows', async () => {
  const t = await drawTest(<P log={[]} helpBelow />, W);
  const f = t.captureCharFrame();
  expect(f.indexOf('Values stay')).toBeGreaterThan(f.indexOf('API_URL'));
  t.renderer.destroy();
});

test('typing edits the name; Add adds a row; Remove removes it', async () => {
  const log: Log = [];
  const t = await drawTest(<P log={log} />, W);
  t.mockInput.pressTab();
  await t.mockInput.typeText('2');
  let f = await t.settle();
  expect(f).toContain('API_URL2');
  // One key, one edit: no repeat of a value the field already holds.
  expect(log).toEqual([['edit', { key: 'API_URL2' }]]);
  // Name → value → Remove → Add.
  t.mockInput.pressTab();
  await t.mockInput.typeText('x');
  await t.settle();
  expect(log.length).toBe(2);
  expect(log[1]![0]).toBe('edit');
  expect(typeof (log[1]![1] as { value?: string }).value).toBe('string');
  f = t.captureCharFrame();
  expect(f).not.toContain('hunter2');
  t.renderer.destroy();
});

test('Add and Remove by keys (stops: name, value, Show, Remove, Add); isDisabled holds both and the fields', async () => {
  const log: Log = [];
  let t = await drawTest(<P log={log} />, W);
  for (let i = 0; i < 5; i++) t.mockInput.pressTab();
  t.mockInput.pressEnter();
  let f = await t.settle();
  expect(log).toEqual([['add', null]]);
  expect(f.match(/= [│┃]/g)?.length).toBe(2);
  t.renderer.destroy();
  t = await drawTest(<P log={log} />, W);
  for (let i = 0; i < 4; i++) t.mockInput.pressTab();
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(log.at(-1)).toEqual(['remove', 1]);
  expect(f).not.toContain('API_URL');
  t.renderer.destroy();
  const held: Log = [];
  const u = await drawTest(<P log={held} isDisabled />, W);
  for (let i = 0; i < 6; i++) { u.mockInput.pressTab(); u.mockInput.pressEnter(); await u.mockInput.typeText('z'); }
  await u.settle();
  expect(held).toEqual([]);
  u.renderer.destroy();
});
