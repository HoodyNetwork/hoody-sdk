// An empty `role="img"` span with a label (the support unread dot, drawn by CSS alone) shows one cell.
import { expect, test } from 'bun:test';
import { drawTest } from '../prim/testing';
import { FocusRoot } from '../prim';

test('an empty labelled image draws one mark, in a text run and on its own', async () => {
  const t = await drawTest(<FocusRoot><p>Ticket <span role="img" aria-label="Unread" /></p><div><span role="img" aria-label="Unread" /></div><div><span role="img" /></div></FocusRoot>, { width: 20, height: 4 });
  const lines = t.captureCharFrame().split('\n').map((l) => l.trimEnd());
  expect(lines[0]).toBe('Ticket •');
  expect(lines[1]).toBe('•');
  expect(lines[2] ?? '').toBe('');
  t.renderer.destroy();
});
