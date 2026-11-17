// The dock's Stop for the running turn: the working bar draws it (the composer draws none, as on the AI page), and never while the
// chat is catching up (nothing is proven running then).
import { describe, expect, it, vi } from 'vitest';
import * as C from './conv';
import type { Snapshot } from './engine';
import { stopFor } from './Composer';

function snapWith(conv: C.Conv, over: Partial<Snapshot> = {}): Snapshot {
  return { conv, ...over } as Snapshot;
}
const user = (id: string): C.UserMsg => ({ id, text: 'hi', at: 1, key: 'k-' + id, via: 'turn', state: 'sent', turnId: null, commandId: null, reason: '' });
function running(turnId: string | null): C.Conv {
  const c = C.addUser(C.emptyConv('s1'), user('u1'));
  return C.addTurn(c, { turnId, user: 'u1', now: 1 });
}

describe('stopFor', () => {
  it('a turn the agent named and still running: Stop, wired to the given press', () => {
    const press = vi.fn();
    const st = stopFor(snapWith(running('turn-1')), press);
    expect(st).toMatchObject({ busy: false });
    st!.onPress();
    expect(press).toHaveBeenCalledTimes(1);
  });
  it('no Stop for a turn the agent has not named yet, or with nothing running', () => {
    expect(stopFor(snapWith(running(null)), () => undefined)).toBeNull();
    expect(stopFor(snapWith(C.emptyConv('s1')), () => undefined)).toBeNull();
  });
  it('catching up: the composer keeps its Stop, the working bar offers none', () => {
    const s = snapWith(running('turn-1'), { catchingUp: true });
    expect(stopFor(s, () => undefined)).not.toBeNull();
    expect(stopFor(s, () => undefined, true)).toBeNull();
  });
});
