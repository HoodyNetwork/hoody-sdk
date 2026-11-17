// The page key `t` focuses Talk in the terminal. The web host's `focus` finds the Mic's button with a DOM
// query (pages/bots/voice/TalkHost.tsx: micBox.current?.querySelector('button')); the terminal entry is a prim, not a
// compat <button>, so the query found nothing and `t` did nothing while the shortcut sheet listed it. The terminal hook
// focuses the entry by its id (MicButton.term and TalkBar.term hold the same literal: these tests pin that they agree).
// With a reason from the page the entry is soft-disabled, as the web's: `t` reaches it, it says why, a press runs nothing.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import { Box } from '../../term/prim';
import { Button } from '../controls/Button';
import { routed } from '../layouts/termHarness';
import { MicButton, type MicReason } from './MicButton';
import { useTalkShortcuts } from './TalkBar';
import strings from './Voice.strings.en.json';

function Host({ reason, enabled = true, asked }: { reason?: MicReason; enabled?: boolean; asked: string[] }) {
  // The web host's focus, as TalkHost passes it: it must not be what moves the focus here.
  useTalkShortcuts({ enabled, focus: () => { asked.push('host focus'); } });
  return (
    <Box dir="column">
      <Button autoFocus onPress={() => {}}>Other</Button>
      <MicButton reason={reason} onPress={() => { asked.push('talk started'); }} />
    </Box>
  );
}

const focused = (r: Parameters<typeof semanticsOf>[0]) => focusedNode(semanticsOf(r));

test('`t` moves the focus to the Talk entry; a press there opens the hand-off and starts nothing', async () => {
  const asked: string[] = [];
  const t = await drawTest(routed(() => <Host asked={asked} />).element, { width: 80, height: 24 });
  try {
    await t.settle();
    expect(focused(t.renderer)?.name).toBe('Other');
    t.mockInput.pressKey('t');
    await t.settle();
    expect(focused(t.renderer)?.name).toBe('Talk');
    t.mockInput.pressEnter();
    const f = await t.settle();
    expect(f).toContain('Talking needs a microphone');
    expect(asked).toEqual([]);
  } finally { t.renderer.destroy(); }
});

test('with a reason from the page, `t` reaches Talk, which says why and runs nothing', async () => {
  const asked: string[] = [];
  const t = await drawTest(routed(() => <Host asked={asked} reason="notSetUp" />).element, { width: 80, height: 24 });
  try {
    const f0 = await t.settle();
    expect(f0).toContain(strings['mic.why.notSetUp']);
    t.mockInput.pressKey('t');
    await t.settle();
    const n = focused(t.renderer);
    expect(n?.name).toBe('Talk');
    expect(n?.description ?? '').toContain(strings['mic.why.notSetUp']);
    t.mockInput.pressEnter();
    await t.settle();
    expect(asked).toEqual([]);
  } finally { t.renderer.destroy(); }
});

test('while Talk cannot be focused (enabled false) `t` moves nothing', async () => {
  const asked: string[] = [];
  const t = await drawTest(routed(() => <Host asked={asked} enabled={false} />).element, { width: 80, height: 24 });
  try {
    await t.settle();
    t.mockInput.pressKey('t');
    await t.settle();
    expect(focused(t.renderer)?.name).toBe('Other');
    expect(asked).toEqual([]);
  } finally { t.renderer.destroy(); }
});
