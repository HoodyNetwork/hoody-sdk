// An <input aria-label> keeps its name; aria-labelledby to an inline <span id> in a text run names it.
import { expect, test } from 'bun:test';
import { drawTest } from '../prim/testing';
import { FocusRoot } from '../prim';
import { semanticsOf, semText } from '../prim/semantics';

test('input aria-label names the textbox; labelledby reaches an inline span', async () => {
  const t = await drawTest(<FocusRoot><input aria-label="Search" /><div>Get <span id="l">Email me</span> today</div><button aria-labelledby="l">x</button></FocusRoot>, { width: 30, height: 4 });
  await t.renderOnce();
  await new Promise((r) => setTimeout(r, 20));
  const txt = semText(semanticsOf(t.renderer as never));
  expect(txt).toContain('textbox "Search"');
  expect(txt).toContain('button "Email me"');
  t.renderer.destroy();
});
