// DockSession.window.test.tsx: the one render a session's gate is in the dock's snapshot before
// the dock's active source exists. DockSession draws its fallback, the column, until useDockSource's effect has built the source, so
// that render must offer no decision: the column has none of the source's prerequisites (attachment hold, approver lease). A server
// render runs no effect, so it is exactly that first render.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import kitStrings from '@kit/agent/Conversation.strings.en.json';
import { Column } from './Column';
import * as C from './conv';
import { DockSession } from './DockSession';
import type { AskEngine, Snapshot } from './engine';
import { gateOf } from './logic';

const REF = { computer: 'atlas.1234', realm: 'global', sid: 's1' };
const confirm = gateOf({ id: 'gate-7', generation: 1 }, 'confirm', { tool_name: 'bash', params: { command: 'make' } });
const question = gateOf({ id: 'gate-8', generation: 2 }, 'question', { question: 'Which branch?' });
const card = (gate: typeof confirm) => ({ key: gate.id, gate, helper: false, addressing: false, decision: null, held: null, decidable: true });

describe('DockSession: the render before the source exists offers no decision', () => {
  it('a session with a parked approval and a question draws the column, with no Allow, Deny or question card', () => {
    const snap = { phase: 'ready', conv: C.emptyConv(), status: null, dormant: false, gates: [card(confirm), card(question)] } as unknown as Snapshot;
    const eng = { decide: vi.fn(), answer: vi.fn(), checkDecision: vi.fn(), getSnapshot: () => snap, subscribe: () => () => undefined } as unknown as AskEngine;
    const html = renderToStaticMarkup(
      <DockSession eng={eng} conv={REF} host={{ computer: 'atlas', realm: 'global' }} agentUrl="" typing={false} empty={null}
        onTakeBack={() => undefined} fallback={<div data-testid="fallback"><Column eng={eng} snap={snap} agentUrl="" typing empty={null} /></div>} />,
    );
    // The fallback is what is drawn: the window is real, and it is the column's.
    expect(html).toContain('data-testid="fallback"');
    expect(html).not.toContain('data-ask-gate');
    expect(html).not.toContain(kitStrings['agent.allowOnce']);
    expect(html).not.toContain(`>${kitStrings['agent.deny']}`);
    expect(html).not.toContain('Which branch?');
    expect(eng.decide).not.toHaveBeenCalled();
    expect(eng.answer).not.toHaveBeenCalled();
  });
});
