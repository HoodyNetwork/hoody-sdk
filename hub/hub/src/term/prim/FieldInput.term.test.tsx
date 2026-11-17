// FieldInput and the Caret model. Behaviours held:
// - plain line: typing, controlled (a caller that refuses a key wins), Enter submits, paste inserts
// - masked: the value is never drawn (bullets only), typing, backspace, word delete, Home/End, paste, undo
// - read-only: arrows move, typing and deleting change nothing
// - multiline: Enter is a new line
// - wipe (masked, plain line, multiline, and SecretInput's wipeOn): undo and redo, each shown working just before,
//   bring nothing typed back afterwards, also when the value was already empty at the wipe
// - a masked field emptied from outside with no wipe (a form cleared after save; SecretInput as a raw password
//   input draws it, no wipeOn): undo and redo bring nothing back
// - a bracketed paste still open at a wipe is dropped when it ends; the next paste goes in as usual, also when the
//   parser was reset before that paste ended (a suspend, a parse error): the paste it abandoned never ends
// - an empty value the masked field sent itself (Backspace to empty) keeps undo
// - Caret: grapheme-safe moves, word jumps, maxLength
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, inputHeld, testRender, type TestTerm } from './testing';
import { FocusRoot } from './focus';
import { FieldInput, type FieldInputProps } from './FieldInput';
import { SecretInput } from './SecretInput';
import { apply, cellWidth, edit, insert, wordJump } from './Caret';

function Host(props: Partial<FieldInputProps> & { seen?: string[]; submitted?: string[]; filter?: (v: string) => string; initial?: string }) {
  const [v, set] = useState(props.initial ?? '');
  return (
    <FocusRoot>
      <FieldInput {...props} value={v} autoFocus width={30}
        onChange={(n) => { props.seen?.push(n); set(props.filter ? props.filter(n) : n); }}
        onSubmit={(n) => props.submitted?.push(n)} />
    </FocusRoot>
  );
}

test('plain: typing, Enter submits the value', async () => {
  const seen: string[] = [];
  const submitted: string[] = [];
  const t = await drawTest(<Host seen={seen} submitted={submitted} />, { width: 40, height: 3 });
  await t.mockInput.typeText('hello');
  expect(await t.settle()).toContain('hello');
  t.mockInput.pressEnter();
  await t.settle();
  expect(submitted).toEqual(['hello']);
  expect(seen.at(-1)).toBe('hello');
  t.renderer.destroy();
});

test('plain: a caller refusing a key wins (digits only)', async () => {
  const t = await drawTest(<Host filter={(v) => v.replace(/\D/g, '')} />, { width: 40, height: 3 });
  await t.mockInput.typeText('1a2');
  const f = await t.settle();
  expect(f).toContain('12');
  expect(f).not.toContain('a');
  t.renderer.destroy();
});

test('plain: bracketed paste inserts', async () => {
  const t = await drawTest(<Host />, { width: 40, height: 3 });
  await t.mockInput.pasteBracketedText('pasted text');
  expect(await t.settle()).toContain('pasted text');
  t.renderer.destroy();
});

test('masked: the value is never drawn, only bullets; editing keys work', async () => {
  const seen: string[] = [];
  const t = await drawTest(<Host mask seen={seen} />, { width: 40, height: 3 });
  await t.mockInput.typeText('s3cret word');
  let f = await t.settle();
  expect(f).not.toContain('s3cret');
  expect(f).toContain('•••••••••••');
  expect(seen.at(-1)).toBe('s3cret word');
  t.mockInput.pressKey('w', { ctrl: true });
  await t.settle();
  expect(seen.at(-1)).toBe('s3cret ');
  t.mockInput.pressBackspace();
  await t.settle();
  expect(seen.at(-1)).toBe('s3cret');
  t.mockInput.pressKey('HOME');
  t.mockInput.pressKey('a', { ctrl: true });
  await t.mockInput.typeText('x');
  await t.settle();
  expect(seen.at(-1)).toBe('xs3cret');
  t.mockInput.pressKey('-', { ctrl: true });
  await t.settle();
  expect(seen.at(-1)).toBe('s3cret');
  await t.mockInput.pasteBracketedText('PASTE');
  f = await t.settle();
  expect(seen.at(-1)).toBe('PASTEs3cret');
  expect(f).not.toContain('PASTE');
  t.renderer.destroy();
});

test('read-only: arrows move, nothing edits', async () => {
  const seen: string[] = [];
  const t = await drawTest(<Host readOnly initial="fixed" seen={seen} />, { width: 40, height: 3 });
  await t.mockInput.typeText('zz');
  t.mockInput.pressBackspace();
  t.mockInput.pressArrow('left');
  await t.mockInput.pasteBracketedText('p');
  expect(await t.settle()).toContain('fixed');
  expect(seen).toEqual([]);
  t.renderer.destroy();
});

test('multiline: Enter is a new line', async () => {
  const seen: string[] = [];
  const t = await drawTest(<Host lines={3} seen={seen} />, { width: 40, height: 5 });
  await t.mockInput.typeText('a');
  t.mockInput.pressEnter();
  await t.mockInput.typeText('b');
  await t.settle();
  expect(seen.at(-1)).toBe('a\nb');
  t.renderer.destroy();
});

test('Caret: graphemes, words, maxLength, cells', () => {
  const e = edit('a👍🏽b');
  expect(apply(e, 'backspace').value).toBe('a👍🏽');
  expect(apply(apply(e, 'left'), 'backspace').value).toBe('ab');
  expect(wordJump('foo bar-baz', 0, 1)).toBe(3);
  expect(wordJump('foo bar-baz', 11, -1)).toBe(8);
  expect(insert(edit('abc'), 'defg', 5).value).toBe('abcde');
  expect(insert(edit(''), 'a\nb\x1b[31m', 99).value).toBe('ab[31m');
  expect(cellWidth('日本')).toBe(4);
  expect(apply({ value: 'abcd', caret: 3, anchor: 1 }, 'backspace')).toEqual({ value: 'ad', caret: 1, anchor: null });
});

/** A caller that wipes as kit fields do: bumps `wipe` (unless `noWipe`) and empties its value. */
function WipeHost(props: Partial<FieldInputProps> & { seen: string[]; wipeNow: { current: () => void }; secret?: boolean; noWipe?: boolean }) {
  const [v, set] = useState('');
  const [w, setW] = useState(0);
  props.wipeNow.current = () => { if (!props.noWipe) setW((n) => n + 1); set(''); };
  const onChange = (n: string) => { props.seen.push(n); set(n); };
  const { seen: _s, wipeNow: _w, secret, noWipe, ...rest } = props;
  return (
    <FocusRoot>
      {secret
        ? <SecretInput value={v} {...(noWipe ? {} : { wipeOn: w })} autoFocus width={30} onChange={onChange} />
        : <FieldInput {...rest} value={v} {...(noWipe ? {} : { wipe: w })} autoFocus width={30} onChange={onChange} />}
    </FocusRoot>
  );
}

/** drawTest with the keyboard protocol that tells Ctrl+- and Ctrl+. apart: undo and redo reach every field only
 *  through it (legacy Ctrl+. is not redo). */
async function kittyTest(node: ReturnType<typeof WipeHost>): Promise<TestTerm> {
  const t = await testRender(node, { width: 40, height: 5, kittyKeyboard: true }) as TestTerm;
  t.settle = async () => {
    let last = '';
    for (let same = 0, i = 0; same < 3 && i < 100; i++) {
      await t.renderOnce();
      const f = t.captureCharFrame();
      same = f === last && !inputHeld(t.renderer) ? same + 1 : 0;
      last = f;
      await new Promise((r) => setTimeout(r, 5));
    }
    return last;
  };
  await t.settle();
  return t;
}
const undo = async (t: TestTerm) => { t.mockInput.pressKey('-', { ctrl: true }); await t.settle(); };
const redo = async (t: TestTerm) => { t.mockInput.pressKey('.', { ctrl: true }); await t.settle(); };
/** Presses `key` until the last value reported is `want` (an editor may undo a typing run in more than one step). */
async function until(t: TestTerm, key: (t: TestTerm) => Promise<void>, seen: string[], want: string): Promise<void> {
  for (let i = 0; i < 12 && seen.at(-1) !== want; i++) await key(t);
  expect(seen.at(-1)).toBe(want);
}
/** After a wipe or clear: redo, undo, undo, redo report nothing typed (an engine input reports its unchanged empty
 *  value on an undo with no history). */
async function nothingBack(t: TestTerm, seen: string[]): Promise<void> {
  const before = seen.length;
  await redo(t);
  await undo(t);
  await undo(t);
  await redo(t);
  expect(seen.slice(before).filter((v) => v !== '')).toEqual([]);
  const f = await t.settle();
  expect(f).not.toContain('hunt');
  expect(f).not.toContain('•');
}

const VARIANTS = [
  ['masked', { mask: true }],
  ['plain line', {}],
  ['multiline', { lines: 3 }],
  ['SecretInput', { secret: true }],
] as const;

for (const [name, extra] of VARIANTS) {
  test(`wipe (${name}): undo and redo work before it and bring nothing back after it`, async () => {
    const seen: string[] = [];
    const wipeNow = { current: () => {} };
    const t = await kittyTest(<WipeHost {...extra} seen={seen} wipeNow={wipeNow} />);
    await t.mockInput.typeText('hunter2');
    await t.settle();
    t.mockInput.pressBackspace();
    await t.settle();
    expect(seen.at(-1)).toBe('hunter');
    await until(t, undo, seen, 'hunter2');
    await until(t, redo, seen, 'hunter');
    // The redo stack holds the shorter word when the wipe comes.
    await until(t, undo, seen, 'hunter2');
    wipeNow.current();
    await t.settle();
    await nothingBack(t, seen);
    t.renderer.destroy();
  }, 30_000);

  test(`wipe (${name}): a wipe while the value is already empty still forgets undo and redo`, async () => {
    const seen: string[] = [];
    const wipeNow = { current: () => {} };
    const t = await kittyTest(<WipeHost {...extra} seen={seen} wipeNow={wipeNow} />);
    await t.mockInput.typeText('hunter2');
    await t.settle();
    await until(t, undo, seen, '');
    await until(t, redo, seen, 'hunter2');
    // Empty again, with the typed word on the redo stack.
    await until(t, undo, seen, '');
    wipeNow.current();
    await t.settle();
    await nothingBack(t, seen);
    t.renderer.destroy();
  }, 30_000);
}

for (const [name, extra] of [['masked', { mask: true }], ['SecretInput', { secret: true }]] as const) {
  test(`cleared from outside without a wipe (${name}): undo and redo bring nothing back`, async () => {
    const seen: string[] = [];
    const clear = { current: () => {} };
    const t = await kittyTest(<WipeHost {...extra} noWipe seen={seen} wipeNow={clear} />);
    await t.mockInput.typeText('hunter2');
    await t.settle();
    t.mockInput.pressBackspace();
    await t.settle();
    await until(t, undo, seen, 'hunter2');
    await until(t, redo, seen, 'hunter');
    await until(t, undo, seen, 'hunter2');
    clear.current();
    await t.settle();
    await nothingBack(t, seen);
    t.renderer.destroy();
  }, 30_000);
}

for (const [name, extra] of VARIANTS) {
  test(`wipe (${name}): a paste open at the wipe is dropped when it ends; the next paste goes in`, async () => {
    const seen: string[] = [];
    const wipeNow = { current: () => {} };
    const t = await kittyTest(<WipeHost {...extra} seen={seen} wipeNow={wipeNow} />);
    t.renderer.stdin.emit('data', Buffer.from('\x1b[200~hunt'));
    await t.renderOnce();
    wipeNow.current();
    await t.settle();
    const before = seen.length;
    t.renderer.stdin.emit('data', Buffer.from('er2\x1b[201~'));
    await t.settle();
    expect(seen.slice(before).filter((v) => v !== '')).toEqual([]);
    await t.mockInput.pasteBracketedText('ok');
    await t.settle();
    expect(seen.at(-1)).toBe('ok');
    t.renderer.destroy();
  }, 30_000);
}

for (const [name, extra] of VARIANTS) {
  test(`wipe (${name}): a paste the parser abandons after the wipe (reset) drops nothing later`, async () => {
    const seen: string[] = [];
    const wipeNow = { current: () => {} };
    const t = await kittyTest(<WipeHost {...extra} seen={seen} wipeNow={wipeNow} />);
    t.renderer.stdin.emit('data', Buffer.from('\x1b[200~hunt'));
    await t.renderOnce();
    wipeNow.current();
    await t.settle();
    // A suspend or a parse error resets the parser: the open paste is abandoned and never ends.
    (t.renderer as unknown as { stdinParser: { reset(): void } }).stdinParser.reset();
    await t.mockInput.pasteBracketedText('ok');
    await t.settle();
    expect(seen.at(-1)).toBe('ok');
    t.renderer.destroy();
  }, 30_000);
}

test('masked: an empty value the field sent itself keeps undo', async () => {
  const seen: string[] = [];
  const wipeNow = { current: () => {} };
  const t = await kittyTest(<WipeHost mask noWipe seen={seen} wipeNow={wipeNow} />);
  await t.mockInput.typeText('pw');
  await t.settle();
  t.mockInput.pressBackspace();
  await t.settle();
  t.mockInput.pressBackspace();
  await t.settle();
  expect(seen.at(-1)).toBe('');
  await undo(t);
  expect(seen.at(-1)).toBe('p');
  await redo(t);
  expect(seen.at(-1)).toBe('');
  t.renderer.destroy();
}, 30_000);
