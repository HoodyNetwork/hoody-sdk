// The real hook under StrictMode: its double effect must not end a Talk that is still mounted.
import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { VOICE_CAPS_UNKNOWN } from '../data';
import { useBotVoice } from './useBotVoice';
import { voiceInitial } from '@kit/pure';
import { TALK_VIEW_START } from './talkView';

const h = vi.hoisted(() => ({ made: [] as { dispose: ReturnType<typeof vi.fn> }[] }));
vi.mock('./session', () => ({
  createTalkSession: () => {
    const s = {
      dispose: vi.fn(),
      caps: vi.fn(),
      rows: vi.fn(),
      subscribe: () => () => undefined,
      snapshot: () => SNAP,
    };
    h.made.push(s);
    return s;
  },
}));
const SNAP = { voice: voiceInitial(), view: TALK_VIEW_START };

function Probe() {
  useBotVoice('c1:r1:b1', VOICE_CAPS_UNKNOWN, undefined, () => undefined);
  return null;
}
const disposed = () => h.made.reduce((n, s) => n + s.dispose.mock.calls.length, 0);

beforeEach(() => { h.made.length = 0; });

it('StrictMode\'s double effect ends nothing; the unmount ends the session once', async () => {
  const r = render(<StrictMode><Probe /></StrictMode>);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(disposed()).toBe(0);
  r.unmount();
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(disposed()).toBe(1);
});
