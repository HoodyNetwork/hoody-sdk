// A setting's editor closes with a Cancel button drawn as a button, as the web's and as every other terminal Cancel
// (Dialog, Drawer, Form); pressing it cancels.
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { SettingGroup } from './SettingGroup';
import { SettingRow } from './SettingRow';
import { TextField } from './fields';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

async function until(done: (f: string) => boolean): Promise<string> {
  const end = performance.now() + 2000;
  for (;;) { const f = await t!.settle(); if (done(f) || performance.now() > end) return f; }
}

test('the editor\'s Cancel is a button ([Cancel]) and cancels', async () => {
  const calls: string[] = [];
  function P() {
    const [v, setV] = useState('');
    return (
      <FocusRoot>
        <SettingGroup variant="field">
          <SettingRow label="Recovery email" reveal={{
            label: 'Replace…',
            editor: <TextField label="New address" value={v} onChange={setV} />,
            onSave: () => Promise.resolve(),
            onCancel: () => calls.push('cancel'),
          }}>a@example.org</SettingRow>
        </SettingGroup>
      </FocusRoot>
    );
  }
  t = await drawTest(<P />, { width: 90, height: 16 });
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  const f = await until((x) => x.includes('New address'));
  expect(f).toContain('[Cancel]');
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  await until((x) => !x.includes('New address'));
  expect(calls).toEqual(['cancel']);
});
