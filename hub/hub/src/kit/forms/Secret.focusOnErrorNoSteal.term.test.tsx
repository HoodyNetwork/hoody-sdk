// SecretInput focusOnError while the field is locked (disabled): the owed focus is taken when the field is enabled only
// if the person left the focus where it was (here: on nothing, the disabled field gave it up). A person who moved the
// focus elsewhere during the lock keeps it there: the field never steals it back.
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { SecretInput } from './Secret';

const W = { width: 80, height: 16 };

async function run(moveAway: boolean): Promise<string[]> {
  const got: string[] = [];
  let lockAndFail: () => void = () => {};
  let unlock: () => void = () => {};
  function P() {
    const [err, setErr] = useState<string | undefined>();
    const [off, setOff] = useState(false);
    lockAndFail = () => { setOff(true); setErr('Not accepted.'); };
    unlock = () => setOff(false);
    return (
      <FocusRoot>
        <SecretInput label="Elsewhere" value="" onChange={() => { got.push('elsewhere'); }} />
        <SecretInput label="API key" value="" onChange={() => { got.push('key'); }} errorMessage={err} focusOnError isDisabled={off} autoFocus />
      </FocusRoot>
    );
  }
  const t = await drawTest(<P />, W);
  lockAndFail();
  expect(await t.settle()).toContain('Not accepted.');
  if (moveAway) { t.mockInput.pressTab(); await t.settle(); }
  unlock();
  await t.settle();
  await t.mockInput.typeText('k');
  await t.settle();
  t.renderer.destroy();
  return got;
}

test('locked, nobody moved the focus: on unlock the key field takes it (the next key types there)', async () => {
  expect(await run(false)).toEqual(['key']);
});

test('locked, the person moved the focus elsewhere: on unlock it stays where they put it', async () => {
  expect(await run(true)).toEqual(['elsewhere']);
});
