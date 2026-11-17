// ConversationView.term: the frame's own rules around Details, in cells (the size class comes from the frame's width:
// 80 columns is 's', 120 is 'm'). These hold:
//   - small, Details open as the whole sheet: a gate that ARRIVES closes the sheet, and its card is drawn in the chat
//   - at m, Details is a column beside the chat: an arriving gate leaves it open
//   - a gate already waiting when the view opens is no arrival: the sheet stays
//   - Activity's Show for a waiting gate, on the small sheet: closes the sheet and draws that gate's card
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { focusedNode, queryAllByRole, semanticsOf } from '../../term/prim/semantics';
import { ConversationView } from './ConversationView';
import type { GateView } from './GateCard';
import { withGateArm } from './gateArm';
import { scriptedSource, type ScriptedSource, type ScriptStep } from './scriptedSource.fixture';

const GATE: GateView = { kind: 'confirm', risk: 'restarts a service', tool: 'bash', params: { command: 'systemctl --user restart web' }, offerSession: false };
const ASK = 'Restart the web service';
const CMD = 'systemctl --user restart web';

let t: TestTerm | null = null;
let restore: (() => void) | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; restore?.(); restore = null; });

const tree = () => semanticsOf(t!.renderer as never);
/** Details is on screen: its section tabs are in the tree (a slot that is not drawn is not). */
const detailsShown = (): boolean => queryAllByRole(tree(), 'tablist', { name: 'Details sections' }).length > 0;

/** The AI page's use: the host owns Details' open state (open at first) and logs every call it gets. Activity is
 *  asked for by name, so a tab remembered by an earlier test never hides it. */
function Host({ src, width, log }: { src: ScriptedSource; width: number; log: boolean[] }) {
  const [open, setOpen] = useState(true);
  return (
    <FocusRoot>
      <OverlayHost>
        <Box dir="column" width={width} height={30}>
          <ConversationView source={src} pane="Chats" detailsOpen={open} onDetails={(o) => { log.push(o); setOpen(o); }} tab="activity" />
        </Box>
      </OverlayHost>
    </FocusRoot>
  );
}

function chat(waiting: boolean): ScriptedSource {
  const steps: ScriptStep[] = [{ k: 'user', text: ASK }];
  if (waiting) steps.push({ k: 'gate', gate: GATE });
  const src = scriptedSource(steps);
  src.drain();
  return src;
}

async function open(src: ScriptedSource, width: number, log: boolean[]): Promise<string> {
  t = await drawTest(<Host src={src} width={width} log={log} />, { width, height: 30 });
  await t.settle(); // the first frame guesses 120 columns; the measured width lands on the next
  return t.settle();
}

async function arrive(src: ScriptedSource): Promise<string> {
  src.push({ k: 'gate', gate: GATE });
  src.tick();
  await t!.settle();
  return t!.settle();
}

// Catches ConversationView.term.tsx 34-41 (arrival at a small size with Details open: onDetails(false)).
test('small, Details open as the sheet: a gate arriving closes it; the chat and the card are drawn', async () => {
  restore = withGateArm(0);
  const src = chat(false);
  const log: boolean[] = [];
  let f = await open(src, 80, log);
  expect(detailsShown()).toBe(true);
  expect(f).not.toContain(ASK);
  f = await arrive(src);
  expect(log).toEqual([false]);
  expect(detailsShown()).toBe(false);
  expect(f).toContain(ASK);
  expect(f).toContain(CMD);
});

// Catches `isSmall(size)` in the arrival rule (line 38): at m Details sits beside the chat and is left open.
test('at m, Details beside the chat: a gate arriving leaves it open; the card is drawn in the chat', async () => {
  restore = withGateArm(0);
  const src = chat(false);
  const log: boolean[] = [];
  let f = await open(src, 120, log);
  expect(detailsShown()).toBe(true);
  expect(f).toContain(ASK);
  f = await arrive(src);
  expect(log).toEqual([]);
  expect(detailsShown()).toBe(true);
  expect(f).toContain(CMD);
});

// Pins the behaviour, not one line: a gate waiting at mount is not an arrival. The first effect runs at the first
// frame's guessed 120 columns ('m', line 30), where no arrival closes Details, so `seen` (line 33) starting empty would
// pass here too; this holds the outcome whichever way the frame gets it.
test('small: a gate already waiting when the view opens leaves the sheet open', async () => {
  restore = withGateArm(0);
  const src = chat(true);
  const log: boolean[] = [];
  const f = await open(src, 80, log);
  expect(log).toEqual([]);
  expect(detailsShown()).toBe(true);
  expect(f).not.toContain(ASK);
});

// Catches showGate (lines 43-46): Activity's Show on the small sheet closes it, so the card it shows is drawn.
test('small: Activity\'s Show for the waiting gate closes the sheet and the card is drawn', async () => {
  restore = withGateArm(0);
  const src = chat(true);
  const log: boolean[] = [];
  await open(src, 80, log);
  for (let i = 0; i < 30 && focusedNode(tree())?.name !== 'Show'; i++) {
    t!.mockInput.pressTab();
    await t!.settle();
  }
  expect(focusedNode(tree())?.name).toBe('Show');
  t!.mockInput.pressEnter();
  await t!.settle();
  const f = await t!.settle();
  expect(log).toEqual([false]);
  expect(detailsShown()).toBe(false);
  expect(f).toContain(CMD);
  expect(src.recorded.decide).toEqual([]);
});
