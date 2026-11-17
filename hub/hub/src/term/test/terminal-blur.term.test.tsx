// useTerminalBlur fires on the terminal's focus-out report (ESC[O), useTerminalFocus on ESC[I.
import { expect, test } from 'bun:test';
import { drawTest } from '../prim/testing';
import { useTerminalBlur, useTerminalFocus } from '../prim';

test('blur and focus reports reach the hooks', async () => {
  const seen: string[] = [];
  const C = () => { useTerminalBlur(() => seen.push('blur')); useTerminalFocus(() => seen.push('focus')); return null; };
  const t = await drawTest(<C />, { width: 10, height: 2 });
  await t.renderOnce();
  const r = t.renderer as unknown as { emit(e: string): void };
  r.emit('blur');
  r.emit('focus');
  expect(seen).toEqual(['blur', 'focus']);
  t.renderer.destroy();
});
