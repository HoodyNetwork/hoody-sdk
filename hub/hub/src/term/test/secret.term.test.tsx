// The secret-entry primitive.
import { expect, test } from 'bun:test';
import { useState, type ReactNode } from 'react';
import { copiesOf, drawTest } from '../prim/testing';
import { FocusRoot, SecretInput, describeSecret } from '../prim';
import { semanticsOf, semText } from '../prim/semantics';

const draw = (node: ReactNode, width = 40, height = 4) => drawTest(<FocusRoot>{node}</FocusRoot>, { width, height });

test('typed secret: bullets only in the frame, no value in semantics, copy keys do nothing', async () => {
  let seen = '';
  function F() { const [v, setV] = useState(''); seen = v; return <SecretInput value={v} onChange={setV} autoFocus width={30} sem={{ name: 'Password' }} />; }
  const t = await draw(<F />);
  await t.mockInput.typeText('hunter2'); await t.settle();
  expect(seen).toBe('hunter2');
  const frame = t.captureCharFrame();
  expect(frame).not.toContain('hunter2');
  expect(frame).toContain('•••••••');
  const sem = JSON.stringify(semanticsOf(t.renderer as never));
  expect(sem).not.toContain('hunter2');
  expect(semText(semanticsOf(t.renderer as never))).not.toContain('hunter2');
  const copied = copiesOf(t.renderer);
  t.mockInput.pressKey('x', { ctrl: true }); await t.settle(); // (Ctrl+C quits the test renderer)
  expect(copied).toEqual([]);
  expect(describeSecret(seen)).toBe('[secret: set]');
  t.renderer.destroy();
});

test('wipe: wipeOn change and unmount clear the caller value', async () => {
  let seen = 'x';
  let setKey: (n: number) => void = () => {};
  let setShown: (b: boolean) => void = () => {};
  function F() {
    const [v, setV] = useState('secret1');
    const [k, sk] = useState(0); setKey = sk;
    const [shown, ss] = useState(true); setShown = ss;
    seen = v;
    return shown ? <SecretInput value={v} onChange={setV} wipeOn={k} /> : null;
  }
  const t = await draw(<F />);
  expect(seen).toBe('secret1');
  setKey(1); await t.settle();
  expect(seen).toBe('');
  setKey(2); await t.settle();
  // unmount: the caller's value is wiped
  function G() { const [v, setV] = useState('s2'); const [on, setOn] = useState(true); seen = v; setShown = setOn; return on ? <SecretInput value={v} onChange={setV} /> : null; }
  t.renderer.destroy();
  const u = await draw(<G />);
  expect(seen).toBe('s2');
  setShown(false); await u.settle();
  expect(seen).toBe('');
  u.renderer.destroy();
});

test('compat <input type=password> uses the secret primitive', async () => {
  const t = await draw(<input type="password" defaultValue="hunter2" />);
  expect(t.captureCharFrame()).not.toContain('hunter2');
  expect(JSON.stringify(semanticsOf(t.renderer as never))).not.toContain('hunter2');
  t.renderer.destroy();
});

test('disabled secret is inert', async () => {
  const changes: string[] = [];
  const t = await draw(<SecretInput value="" onChange={(v) => changes.push(v)} disabled />);
  await t.mockMouse.click(1, 0); await t.settle();
  await t.mockInput.typeText('a'); await t.settle();
  expect(changes).toEqual([]);
  t.renderer.destroy();
});
