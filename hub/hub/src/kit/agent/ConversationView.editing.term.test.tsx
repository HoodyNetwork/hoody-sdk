// ConversationView.term: a gate arriving while the person types in the composer never takes the focus from it (the web
// rule: ConversationView.tsx passes `typing={p.typing || editing}`, useEditing in takesText.ts). The AI page
// (pages/ai/parts/Conversation.tsx) passes no `typing`, so in the terminal only the frame's own reading protects the
// composer: without it GateCard.term's arrival effect (line 227, `if (typing) return`) moves the focus to Deny, and the
// next "y" the person meant as text allows the command once.
// The second test is the positive control: the reading is about TEXT fields, not "anywhere in the frame"; off a field,
// an arriving gate still takes the focus to Deny (the safe choice), and leaving the field clears the reading. The third:
// every text field in the frame counts (a card's reason), not only the composer.
import { afterEach, expect, test } from 'bun:test';
import { useState, type ReactNode } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, Pressable, Text, TextInput } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import { ConversationView } from './ConversationView';
import type { GateView } from './GateCard';
import { withGateArm } from './gateArm';
import { scriptedSource, type ScriptedSource } from './scriptedSource.fixture';

const GATE: GateView = { kind: 'confirm', risk: 'restarts a service', tool: 'bash', params: { command: 'systemctl --user restart web' }, offerSession: false };

let t: TestTerm | null = null;
let restore: (() => void) | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; restore?.(); restore = null; });

const focused = (term: TestTerm) => focusedNode(semanticsOf(term.renderer as never));
const focusedName = (term: TestTerm): string | undefined => focused(term)?.name;
/** Tab until the focused node is named `name` (at most 30 presses); fails when it never is. */
async function focusOn(term: TestTerm, name: string): Promise<void> {
  for (let i = 0; i < 30 && focusedName(term) !== name; i++) {
    term.mockInput.pressTab();
    await term.settle();
  }
  expect(focusedName(term)).toBe(name);
}

/** The host's composer slot: a text field and a button after it. The field takes the focus on mount in its own effect,
 *  before the frame's subscription exists: the reading must also look once after mount (line 42). */
function Slot({ typed, onAttach }: { typed: string[]; onAttach: () => void }) {
  const [draft, setDraft] = useState('');
  return (
    <Box dir="column" shrink={0}>
      <TextInput value={draft} onChange={(v) => { typed.push(v); setDraft(v); }} autoFocus sem={{ name: 'Message' }} />
      <Pressable onPress={onAttach} sem={{ name: 'Attach' }}><Text>[Attach]</Text></Pressable>
    </Box>
  );
}

/** The AI page's use: no `typing` prop, the composer in the slot, Details closed. */
function Host({ src, slot, height = 30 }: { src: ScriptedSource; slot: ReactNode; height?: number }) {
  return (
    <FocusRoot>
      <OverlayHost>
        <Box dir="column" width={120} height={height}>
          <ConversationView source={src} pane="Chats" detailsOpen={false} onDetails={() => {}} composer={slot} />
        </Box>
      </OverlayHost>
    </FocusRoot>
  );
}

function chat(): ScriptedSource {
  const src = scriptedSource([{ k: 'user', text: 'Restart the web service' }]);
  src.drain();
  return src;
}

// Catches ConversationView.term.tsx line 78 (`typing={p.typing || editing}`; live: `typing={p.typing}`) and the reading
// at lines 40-42 (on a focus change, and once after mount for the field that took the focus in its own effect).
test('a gate arriving while the person types in the composer leaves the focus there; "y" stays text, nothing is decided', async () => {
  restore = withGateArm(0);
  const src = chat();
  const typed: string[] = [];
  t = await drawTest(<Host src={src} slot={<Slot typed={typed} onAttach={() => {}} />} />, { width: 120, height: 30 });
  await t.settle();
  await focusOn(t, 'Message');
  await t.mockInput.typeText('ok');
  await t.settle();
  expect(typed.at(-1)).toBe('ok');
  src.push({ k: 'gate', gate: GATE });
  src.tick();
  const f = await t.settle();
  expect(f).toContain('systemctl --user restart web'); // the card is drawn
  expect(focusedName(t)).toBe('Message');
  await t.mockInput.typeText('y');
  await t.settle();
  expect(typed.at(-1)).toBe('oky');
  expect(src.recorded.decide).toEqual([]);
});

// Catches `fc.inField()` (line 40: a button in the frame is not typing) and the reading on every focus change (line 41:
// leaving the field clears it). Either broken, the arriving card leaves the focus on Attach.
test('after Tab from the composer to a button, an arriving gate takes the focus to Deny; "n" denies', async () => {
  restore = withGateArm(0);
  const src = chat();
  const typed: string[] = [];
  let attached = 0;
  t = await drawTest(<Host src={src} slot={<Slot typed={typed} onAttach={() => { attached += 1; }} />} />, { width: 120, height: 30 });
  await t.settle();
  await focusOn(t, 'Message');
  await focusOn(t, 'Attach');
  src.push({ k: 'gate', gate: GATE });
  src.tick();
  await t.settle();
  expect(focusedName(t)).toBe('Deny');
  t.mockInput.pressKey('n');
  await t.settle();
  expect(src.recorded.decide.map((x) => x.d.choice)).toEqual(['deny']);
  expect(attached).toBe(0);
  expect(typed).toEqual([]);
});

// The rule covers every text field in the frame, not only the composer (the web's root is the whole frame): a second gate
// arriving while the person writes the reason on the first card leaves the focus in that reason (GateCard.term line 227
// through `typing`). Catches `fc.containsFocus(frame.current)` scoped to the frame (line 40; a reading of the composer
// box alone misses this field) and line 78.
test('writing a reason on one card when a second gate arrives: the focus stays in the reason; "y" stays text', async () => {
  restore = withGateArm(0);
  const src = chat();
  const typed: string[] = [];
  t = await drawTest(<Host src={src} slot={<Slot typed={typed} onAttach={() => {}} />} height={40} />, { width: 120, height: 40 });
  await t.settle();
  await focusOn(t, 'Attach'); // off the field: the first card takes the focus to its Deny on arrival
  src.push({ k: 'gate', gate: GATE });
  src.tick();
  await t.settle();
  expect(focusedName(t)).toBe('Deny');
  await focusOn(t, 'Add a reason');
  t.mockInput.pressEnter();
  await t.settle();
  // The reason field opens with the focus in it (its autoFocus once the button that had the focus is gone).
  expect(focused(t)?.role).toBe('textbox');
  await t.mockInput.typeText('not now');
  await t.settle();
  expect(focused(t)?.value).toBe('not now');
  src.push({ k: 'gate', gate: { ...GATE, params: { command: 'systemctl --user stop web' } } });
  src.tick();
  const f = await t.settle();
  expect(f).toContain('systemctl --user stop web'); // the second card is drawn
  expect(focused(t)?.role).toBe('textbox');
  await t.mockInput.typeText('y');
  await t.settle();
  expect(focused(t)?.value).toBe('not nowy');
  expect(src.recorded.decide).toEqual([]);
  expect(typed).toEqual([]);
});
