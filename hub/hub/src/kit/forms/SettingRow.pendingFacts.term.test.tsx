// A setting row locks on the kind its outcome line shows: a failed outcome whose error facts say pending (the change
// may have gone through) reads pending on the line, so the row's fields lock and its actions hide, and nothing can be
// sent again. A definite failure keeps the actions and leaves the fields open.
import { expect, test } from 'bun:test';
import { errorInfo } from '@core';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { Button } from '../controls/Button';
import { useFormState } from './lock';
import { SettingGroup } from './SettingGroup';
import { SettingRow } from './SettingRow';

/** The row's value: says whether the row has locked its fields. */
function Lock() {
  return <Text>{useFormState().locked ? 'fields locked' : 'fields open'}</Text>;
}

async function draw(error: unknown, grouped: boolean): Promise<string> {
  const row = (
    <SettingRow label="Default model" outcome="failed" error={error} onCheck={() => Promise.resolve(true)}
      actions={<Button size="sm" variant="secondary" onPress={() => {}}>Change model</Button>}>
      <Lock />
    </SettingRow>
  );
  const t = await drawTest(
    <FocusRoot><Box dir="column" width={90}>{grouped ? <SettingGroup label="Model">{row}</SettingGroup> : row}</Box></FocusRoot>,
    { width: 93, height: 14 });
  const f = await t.settle();
  t.renderer.destroy();
  return f;
}

for (const grouped of [true, false]) {
  const where = grouped ? 'in a group' : 'outside a group';

  test(`${where}: pending facts under a failed outcome hide the actions and lock the fields`, async () => {
    const f = await draw(errorInfo({ pending: true, status: 502 }), grouped);
    expect(f).not.toContain('Change model');
    expect(f).toContain('fields locked');
  });

  test(`${where}: a definite failure keeps the actions and the fields open`, async () => {
    const f = await draw(errorInfo({ status: 400 }), grouped);
    expect(f).toContain('Change model');
    expect(f).toContain('fields open');
  });
}
