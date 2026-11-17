// A toast never hides what the person needs next in an open drawer. Placement is the Toaster's
// (as on the web). The case that showed it: the model chooser's sign-in step, where
// "[Open …]" hands the address to openOutside (no host browser: the address in a toast that stays until dismissed)
// and the toast covered "Finish sign-in", the field's hint and the 15-minute line.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { closeToast, toastQueue } from './Toast.store';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; for (const x of [...toastQueue().visibleToasts]) closeToast(x.key); });

test('the sign-in step at 120x40: after Open, the address toast covers no line of the drawer', async () => {
  s = await renderPage({ page: 'ai', path: '/ai/models?pick=helper', cols: 120, rows: 40 });
  await s.settle();
  const sem = await import('../../term/prim/semantics');
  const tree = () => { const r = s!.renderer as unknown as { root: never; stdin: never }; return sem.semanticsOf({ root: r.root, stdin: r.stdin }); };
  const press = async (role: 'button' | 'link' | 'menuitemradio' | 'option', name: string | RegExp) => { sem.act(sem.getByRole(tree(), role, { name }), 'press'); await new Promise((r) => setTimeout(r, 150)); return s!.settle(); };
  // The chooser opens on the ready models: Show: All lists the providers that need setup, and such a model's row opens
  // its provider's setup step.
  await press('button', 'Show Ready');
  await press('menuitemradio', 'All');
  const before = await press('option', 'OpenRouter Auto');
  expect(before).toContain('Finish sign-in');
  // What the step draws below its Open control, each on its own line.
  const needed = ['Finish sign-in', 'Cancel sign-in', 'It starts with localhost', 'The sign-in stays open for 15 minutes.'];
  for (const words of needed) expect(before).toContain(words);
  const open = sem.getAllByRole(tree(), 'link').concat(sem.queryAllByRole(tree(), 'button')).find((n) => /^Open OpenRouter/.test(n.name))!;
  expect(open).toBeDefined();
  sem.act(open, 'press');
  await new Promise((r) => setTimeout(r, 300));
  const after = await s.settle();
  // The toast is there, and stays until dismissed: the queue holds no timer for it (a 4 s default would run in real time).
  expect(after).toContain('Open this address in your');
  expect(after).toContain('https://openrouter.ai/auth');
  expect(toastQueue().visibleToasts.map((x) => x.timer === undefined || x.timer === null)).toEqual([true]);
  await s.releaseHeld();
  const later = await s.settle();
  expect(later).toContain('Open this address in your');
  // Every control of the step and the field's hint are still whole on screen. The step's last line is static text; the
  // toast may stand over it when the drawer leaves no free rows (the place that covers no control): here it covers
  // "The sign-in stays open for 15 minutes." (a covered static line is accepted).
  const kept = needed.filter((w) => w !== 'The sign-in stays open for 15 minutes.');
  for (const words of kept) expect(later, words).toContain(words);
  const lines = later.split('\n');
  const row = lines.findIndex((l) => l.includes('Open this address in your'));
  // Entering the stack (F6) and leaving it (Esc) keeps the toast where it is and gives the focus back.
  // The control that has the focus in the drawer (the stack is a focus scope of its own, so it is asked by name).
  const openHasFocus = () => sem.queryAllByRole(tree(), 'link').concat(sem.queryAllByRole(tree(), 'button')).some((n) => /^Open OpenRouter/.test(n.name) && n.states.focused === true);
  expect(openHasFocus()).toBe(true);
  await s.keys.press('\x1b[17~'); // F6 as a terminal sends it
  const entered = await s.settle();
  expect(entered).toContain('Esc / F6 leave');
  expect(entered.split('\n').findIndex((l) => l.includes('Open this address in your'))).toBe(row);
  await s.keys.press('escape');
  await new Promise((r) => setTimeout(r, 120)); // a lone Esc is held a moment (it may start a sequence)
  const left = await s.settle();
  expect(left).toContain('Open this address in your');
  expect(left).not.toContain('Esc / F6 leave');
  for (const words of kept) expect(left, words).toContain(words);
  expect(openHasFocus()).toBe(true);
  // Dismissed: gone, the step untouched, the focus still there.
  for (const x of [...toastQueue().visibleToasts]) closeToast(x.key);
  const gone = await s.settle();
  expect(gone).not.toContain('Open this address in your');
  expect(openHasFocus()).toBe(true);
}, 240_000);
