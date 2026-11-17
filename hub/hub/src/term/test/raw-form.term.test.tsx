// A submit button outside its raw form (`form={id}`), and a kit control inside a raw form.
import { expect, test } from 'bun:test';
import { drawTest } from '../prim/testing';
import { FocusRoot } from '../prim';
import { submitRawForm, useEnclosingRawForm } from '../jsx/dom';

test('submitRawForm submits the raw form with that id, once, with a submitter; unknown id answers false', async () => {
  const got: unknown[] = [];
  const t = await drawTest(<FocusRoot><form id="mk" onSubmit={(e: { preventDefault(): void; submitter?: unknown }) => { e.preventDefault(); got.push(e.submitter); }}><input name="n" /></form></FocusRoot>, { width: 20, height: 3 });
  await t.renderOnce();
  expect(submitRawForm('mk', 'btn')).toBe(true);
  expect(got).toEqual(['btn']);
  expect(submitRawForm('nope')).toBe(false);
  t.renderer.destroy();
  expect(submitRawForm('mk')).toBe(false);
});

test('a raw button with form={id} outside the form submits it', async () => {
  let n = 0;
  const t = await drawTest(<FocusRoot><form id="f2" onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); n++; }} /><button type="submit" form="f2">Make key</button></FocusRoot>, { width: 20, height: 3 });
  await t.renderOnce();
  const f = t.captureCharFrame();
  const y = f.split('\n').findIndex((l) => l.includes('Make key'));
  await t.mockMouse.click(f.split('\n')[y]!.indexOf('Make key') + 1, y);
  expect(n).toBe(1);
  t.renderer.destroy();
});

test('useEnclosingRawForm: a component inside a raw form submits it; outside it gets null', async () => {
  let inside: ReturnType<typeof useEnclosingRawForm> = null;
  let outside: ReturnType<typeof useEnclosingRawForm> | undefined;
  let n = 0;
  const In = () => { inside = useEnclosingRawForm(); return null; };
  const Out = () => { outside = useEnclosingRawForm(); return null; };
  const t = await drawTest(<FocusRoot><form onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); n++; }}><div><In /></div></form><Out /></FocusRoot>, { width: 20, height: 3 });
  await t.renderOnce();
  expect(outside).toBeNull();
  (inside as { submit(): void } | null)?.submit();
  expect(n).toBe(1);
  t.renderer.destroy();
});

test('Enter in a single-line field submits its form exactly once, with a preventDefault-able event', async () => {
  const events: { defaultPrevented?: boolean }[] = [];
  const t = await drawTest(<FocusRoot><form onSubmit={(e: { preventDefault(): void; defaultPrevented?: boolean }) => { e.preventDefault(); events.push(e); }}><input aria-label="Code" autoFocus /><button type="submit">Turn on</button></form></FocusRoot>, { width: 30, height: 3 });
  await t.renderOnce();
  await t.mockInput.typeText('123456');
  t.mockInput.pressEnter();
  await t.renderOnce();
  await new Promise((r) => setTimeout(r, 30));
  expect(events.length).toBe(1);
  expect(events[0]!.defaultPrevented).toBe(true);
  t.renderer.destroy();
});

test('Enter does not submit while the default submit button is disabled or pending; a disabled button press does nothing', async () => {
  let n = 0;
  const draw = (attrs: Record<string, unknown>) => drawTest(<FocusRoot><form onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); n++; }}><input aria-label="Code" autoFocus /><button type="submit" {...attrs}>Turn on</button></form></FocusRoot>, { width: 30, height: 3 });
  for (const attrs of [{ disabled: true }, { 'aria-disabled': 'true' }, { 'aria-busy': 'true' }]) {
    const t = await draw(attrs);
    await t.renderOnce();
    await t.mockInput.typeText('1');
    t.mockInput.pressEnter();
    await new Promise((r) => setTimeout(r, 30));
    if (!('aria-busy' in attrs)) {
      const f = t.captureCharFrame();
      const y = f.split('\n').findIndex((l) => l.includes('Turn on'));
      await t.mockMouse.click(f.split('\n')[y]!.indexOf('Turn on') + 1, y);
    }
    t.renderer.destroy();
  }
  expect(n).toBe(0);
});

test('a submit button outside the form (form={id}) is that form\'s default button for Enter', async () => {
  let n = 0;
  const t = await drawTest(<FocusRoot><form id="tf" onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); n++; }}><input aria-label="Code" autoFocus /></form><button type="submit" form="tf" disabled>Go</button></FocusRoot>, { width: 30, height: 3 });
  await t.renderOnce();
  await new Promise((r) => setTimeout(r, 20));
  await t.mockInput.typeText('1');
  t.mockInput.pressEnter();
  await new Promise((r) => setTimeout(r, 30));
  expect(n).toBe(0);
  t.renderer.destroy();
});

test('useEnclosingRawForm().implicit() respects the default button', async () => {
  const { useEnclosingRawForm: use } = await import('../jsx/dom');
  let api: ReturnType<typeof use> = null;
  let n = 0;
  const Grab = () => { api = use(); return null; };
  const t = await drawTest(<FocusRoot><form onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); n++; }}><Grab /><button type="submit" disabled>Go</button></form></FocusRoot>, { width: 20, height: 3 });
  await t.renderOnce();
  await new Promise((r) => setTimeout(r, 10));
  (api as unknown as { implicit(): void }).implicit();
  expect(n).toBe(0);
  (api as unknown as { submit(): void }).submit();
  expect(n).toBe(1);
  t.renderer.destroy();
});
