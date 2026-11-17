// SecretInput focusOnError, a send that locks the field and ends with NO error (a 'changed' or other answer shown
// outside the field): the field held the focus when the lock began, so on unlock it takes it back while nothing holds
// it. A person who moved the focus during the lock keeps it; a field that did not hold the focus never takes it.
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { SecretInput } from './Secret';

const W = { width: 80, height: 16 };

async function run(o: { moveAway?: boolean; keyFocused?: boolean }): Promise<string[]> {
  const got: string[] = [];
  let lock: () => void = () => {};
  let unlock: () => void = () => {};
  function P() {
    const [off, setOff] = useState(false);
    lock = () => setOff(true);
    unlock = () => setOff(false);
    return (
      <FocusRoot>
        <SecretInput label="Elsewhere" value="" onChange={() => { got.push('elsewhere'); }} autoFocus={o.keyFocused === false} />
        <SecretInput label="API key" value="" onChange={() => { got.push('key'); }} focusOnError isDisabled={off} autoFocus={o.keyFocused !== false} />
      </FocusRoot>
    );
  }
  const t = await drawTest(<P />, W);
  lock();
  await t.settle();
  if (o.moveAway) { t.mockInput.pressTab(); await t.settle(); }
  unlock();
  await t.settle();
  await t.mockInput.typeText('k');
  await t.settle();
  t.renderer.destroy();
  return got;
}

test('no error, nobody moved the focus: on unlock the key field takes it back', async () => {
  expect(await run({})).toEqual(['key']);
});

test('no error, the person moved the focus during the lock: it stays where they put it', async () => {
  expect(await run({ moveAway: true })).toEqual(['elsewhere']);
});

test('no error, the key field did not hold the focus at the lock: it takes nothing', async () => {
  expect(await run({ keyFocused: false })).toEqual(['elsewhere']);
});
