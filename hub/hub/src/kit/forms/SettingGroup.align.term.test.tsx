// The value column lines up across the rows of a group (the web's subgrid): a row whose value and actions fill the
// line squeezes its value, never its label column (account Profile: "ada@example.com" one cell left of "Ada").
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { SettingGroup } from './SettingGroup';
import { SettingRow } from './SettingRow';
import { Button } from '../controls/Button';

test('values start at the same cell in every row, however full a row is', async () => {
  const ui = (
    <FocusRoot>
      <SettingGroup title="Profile">
        <SettingRow label="Display name" actions={<Button>Change display name</Button>}>Ada</SettingRow>
        <SettingRow label="Username">ada</SettingRow>
        <SettingRow label="Email" actions={<Button>Change email</Button>}>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><bdi>ada@example-long-domain.com</bdi><span>Verified</span></span>
        </SettingRow>
      </SettingGroup>
    </FocusRoot>
  );
  const t = await drawTest(ui, { width: 78, height: 20 });
  const f = await t.settle();
  const lines = f.split('\n');
  const col = (s: string) => { const l = lines.find((x) => x.includes(s)); expect(l).toBeDefined(); return l!.indexOf(s); };
  expect(col('ada@example')).toBe(col('Ada'));
  expect(col('ada ')).toBe(col('Ada'));
  t.renderer.destroy();
});
