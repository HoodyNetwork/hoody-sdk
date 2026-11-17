// Schedules, a schedule's Advanced section: "Show the command" draws the command with the secrets it recognises hidden,
// and "Copy exactly" copies it as it is, a secret. The terminal copied it as any text (OSC 52 whatever the terminal had
// said), past the rule a SecretField's Copy keeps: a secret is copied only where the screen takes a secret copy, and
// only unchanged. Here a screen that refuses a secret copy writes nothing and says so; one that takes it gets the
// command byte for byte.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import { copiesOf } from '../../term/prim/testing';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

// The page fixture's revealed command (fixtures.ts `same.reveal`).
const COMMAND = 'restic backup /home --password-file /root/.pw --token=abc123';

const focused = (p: PageSession): string => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }))?.name ?? '';
};
async function tabTo(p: PageSession, name: RegExp): Promise<void> {
  for (let i = 0; i < 200 && !name.test(focused(p)); i++) await p.keys.press('tab');
  expect(focused(p) || '(nothing focused)').toMatch(name);
}
const exactly = (x: string) => new RegExp(`^${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

/** The first schedule open, its command shown, "Copy exactly" pressed: what reached the clipboard. */
async function copyExactly(screen: { reveal: boolean; copy: boolean }): Promise<{ copies: string[]; frame: string }> {
  s = await renderPage({ page: 'schedules', cols: 120, rows: 40, secretScreen: () => screen });
  const copies = copiesOf(s.renderer);
  await s.settle();
  await s.keys.press('down');
  await s.keys.press('enter');
  await s.settle();
  await tabTo(s, new RegExp(`^(${strings['a.show']}|${strings['a.showPrompt']})$`));
  await s.keys.press('enter');
  await s.settle();
  await tabTo(s, exactly(strings['a.copyExact']));
  await s.keys.press('enter');
  const frame = await s.settle();
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
  return { copies, frame };
}

test('a screen that refuses a secret copy: Copy exactly writes nothing and says why', async () => {
  const { copies, frame } = await copyExactly({ reveal: true, copy: false });
  expect(copies).toEqual([]);
  // The kit's refusal line under the button ("Not copied: this terminal has not said it takes copies.").
  expect(frame).toContain('Not copied');
}, 240_000);

test('a screen that takes a secret copy: Copy exactly writes the command unchanged', async () => {
  const { copies } = await copyExactly({ reveal: true, copy: true });
  expect(copies).toEqual([COMMAND]);
}, 240_000);
