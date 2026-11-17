// Account > End all other sessions in the terminal when the answer is unknown (fixture end-pending, C9): the danger
// confirm opens on Cancel, never on the action. After the send the dialog stays open with "may have gone through",
// Check again and the warned Stop tracking, and its End button is locked (never a resend). Esc closes it, and the
// page still says the change may have gone through: never shown as failed, never dropped.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf, semText, type SemNode } from '../../term/prim/semantics';
import forms from '../../kit/forms/forms.strings.en.json';
import overlay from '../../kit/overlays/strings.en.json';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const focused = (): string | undefined => focusedNode(tree())?.name;
function find(nodes: readonly SemNode[], pred: (n: SemNode) => boolean): SemNode | undefined {
  for (const n of nodes) {
    if (pred(n)) return n;
    const c = find(n.children, pred);
    if (c) return c;
  }
  return undefined;
}
// A ConfirmDialog is an alertdialog (kit/overlays/Dialog.term.tsx ConfirmDialog), as on the web.
const dialog = (): SemNode | undefined => find(tree(), (n) => n.role === 'alertdialog' && n.name === strings['s.endOthersTitle']);
const endButton = (d: SemNode): SemNode | undefined => find([d], (n) => n.role === 'button' && n.name === strings['s.endOthers']);

test('end all other sessions, answer unknown: locked dialog with Check again; Esc keeps the pending notice', async () => {
  s = await renderPage({ page: 'account', fx: 'end-pending', cols: 120, rows: 40, path: '/account?end=others' });
  await s.settle();
  let d = dialog();
  expect(d).toBeDefined();
  // A danger confirm opens on Cancel; its End button is live before the send (the positive control for the lock).
  expect(focused()).toBe(overlay.cancel);
  expect(endButton(d!)?.states.disabled).toBeUndefined();

  for (let i = 0; i < 10 && focused() !== strings['s.endOthers']; i++) await s.keys.press('tab');
  expect(focused()).toBe(strings['s.endOthers']);
  await s.keys.press('enter');
  await s.releaseHeld();

  // Unknown outcome: the dialog stays, says so, offers Check again and the warned Stop tracking, and locks End.
  d = dialog();
  expect(d).toBeDefined();
  const inDialog = semText([d!]);
  expect(inDialog).toContain(strings['s.endWarn']);
  expect(inDialog).toContain(forms['outcome.check']);
  expect(inDialog).toContain(strings['check.startOver']);
  expect(endButton(d!)?.states.disabled).toBe(true);

  // Esc closes it (a pending outcome may be left); the page keeps saying the change may have gone through.
  await s.keys.press('escape');
  expect(dialog()).toBeUndefined();
  expect(semText(tree())).toContain(strings['err.pending']);
  expect(s.failures).toEqual([]);
}, 240_000);
