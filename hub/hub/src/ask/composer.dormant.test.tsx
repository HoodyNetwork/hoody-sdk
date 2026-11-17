// The dock's composer on a chat the computer put to sleep: Send is open with typed text, and one press wakes the chat once and sends one
// turn (the real engine over the FakeAgent and the real journal).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import kc from '@kit/agent/Conversation.strings.en.json';
import { Composer } from './Composer';
import { world, type World } from './accept/env';

let w: World | null = null;
beforeEach(() => { resetApproversForTests(); });
afterEach(() => { cleanup(); w?.dispose(); w = null; resetApproversForTests(); });

describe('the dock on a chat asleep on the computer', () => {
  it('Send is open, and one press wakes the chat then sends one turn', async () => {
    w = world();
    const approval = (w.agent as any).approval.bind(w.agent);
    (w.agent as any).approval = (sid: string) => approval(sid).then((r: any) => ({ ...r, mode: 'default' }));
    const eng = await w.dock();
    eng.setAuto(false);
    eng.send('hi!');
    await w.flush(3000);
    w.agent.setDormant(eng.record!.s as string, true);
    eng.wake();
    await w.flush(100);
    expect(eng.getSnapshot().dormant).toBe(true);
    const count = (m: string) => w!.agent.log.filter((x) => x[0] === m).length;
    const a0 = count('attach'), t0 = count('turn');
    render(<Composer eng={eng} snap={eng.getSnapshot()} computer="atlas" draft="TEST TYPING" setDraft={() => {}} note={null} onDismissNote={() => {}} flash={false} inputRef={{ current: null }} onTyping={() => {}} />);
    const send = screen.getByRole('button', { name: kc['agent.send'] });
    expect(send.getAttribute('aria-disabled')).not.toBe('true');
    expect((send as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { fireEvent.click(send); await w!.flush(2000); });
    expect(count('attach') - a0).toBe(1);
    expect(count('turn') - t0).toBe(1);
  });
});
