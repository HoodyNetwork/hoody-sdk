// TextField.term, inputRef caret: a page that fills a field and focuses it puts the caret where the web does with
// setSelectionRange(at, at) (Scripts "New script": an example adds words to the description, then the caret goes to the
// end, so the next key types after them). The handle's setSelectionRange collapses to its end.
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { TextField } from './fields';

type El = HTMLInputElement & HTMLTextAreaElement;

function Filled({ got, multiline, el }: { got: string[]; multiline?: boolean; el: { current: El | null } }) {
  const [v, setV] = useState('Count the rows');
  return (
    <FocusRoot>
      <TextField aria-label="Describe it" multiline={multiline} rows={3} inputRef={(n: El | null) => { el.current = n; }} value={v} onChange={(x) => { got.push(x); setV(x); }} />
    </FocusRoot>
  );
}

for (const multiline of [false, true]) {
  const kind = multiline ? 'multiline' : 'single-line';
  test(`${kind}: focus() then setSelectionRange(len, len) puts the caret at the end; typing appends`, async () => {
    const got: string[] = [];
    const el: { current: El | null } = { current: null };
    const t = await drawTest(<Filled got={got} multiline={multiline} el={el} />, { width: 60, height: 6 });
    await t.settle();
    const e = el.current!;
    e.focus();
    await t.settle();
    e.setSelectionRange(e.value.length, e.value.length);
    await t.settle();
    await t.mockInput.typeText('!');
    await t.settle();
    expect(got.at(-1)).toBe('Count the rows!');
    t.renderer.destroy();
  });

  test(`${kind}: setSelectionRange(0, 0) puts it at the start`, async () => {
    const got: string[] = [];
    const el: { current: El | null } = { current: null };
    const t = await drawTest(<Filled got={got} multiline={multiline} el={el} />, { width: 60, height: 6 });
    await t.settle();
    const e = el.current!;
    e.focus();
    await t.settle();
    e.setSelectionRange(e.value.length, e.value.length);
    e.setSelectionRange(0, 0);
    await t.settle();
    await t.mockInput.typeText('>');
    await t.settle();
    expect(got.at(-1)).toBe('>Count the rows');
    t.renderer.destroy();
  });
}

test('a password field (drawn field) honours setSelectionRange too', async () => {
  const got: string[] = [];
  let el: El | null = null;
  function P() {
    const [v, setV] = useState('abc');
    return <FocusRoot><TextField aria-label="pw" type="password" inputRef={(n: El | null) => { el = n; }} value={v} onChange={(x) => { got.push(x); setV(x); }} /></FocusRoot>;
  }
  const t = await drawTest(<P />, { width: 60, height: 4 });
  await t.settle();
  el!.focus();
  await t.settle();
  el!.setSelectionRange(1, 1);
  await t.settle();
  await t.mockInput.typeText('X');
  await t.settle();
  expect(got.at(-1)).toBe('aXbc');
  t.renderer.destroy();
});
