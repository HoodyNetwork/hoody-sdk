// The task message form in the terminal (parts/MessageTask.tsx, drawn by the kit's terminal Drawer). A message the Bot dropped
// says it was not sent, never "Sent"; while the Bot waits on its approval the form says that sending declines it.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import '../../term/env/router-globals';
import { bootFixtureCore } from '@core';
import { bump } from '@core/ctx';
import type { ReactNode } from 'react';
import { beginTermSession, type TermSession } from '../../term/env/session';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { MessageTaskDrawer } from './parts/MessageTask';
import type { Change, Delegate, TaskMessageAnswer } from './data';
import strings from './strings.en.json';
import voice from './voice/voiceWords.strings.en.json';

let session: TermSession | null = null;
beforeEach(() => { session = beginTermSession(); bootFixtureCore({}); });
afterEach(() => { bump('signout'); session?.end(); session = null; });

async function draw(node: ReactNode, width = 120, height = 40): Promise<string> {
  const t = await drawTest(<FocusRoot><Box width={width} height={height}>{node}</Box></FocusRoot>, { width, height });
  const frame = await t.settle();
  t.renderer.destroy();
  return frame.replace(/\s+/g, ' ');
}
const TASK: Delegate = { sessionId: '9a1be4c07d2f4c11', title: 'Read deploy log', state: 'working', computerId: 'c1', model: 'm', waitingOn: null, startedAt: 'x' };
type Send = Change<TaskMessageAnswer, { sessionId: string; text: string }>;
const fake = (over: Partial<Send> = {}): Send => ({
  run: async () => ({ outcome: 'done' as const }), outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
  readBack: async () => false, dismiss: () => undefined, held: () => undefined, dismissShown: async () => true, reset: () => undefined, ...over,
}) as Send;
const no = (): void => {};

test('a message the Bot dropped says it was not sent, in the words for its reason, never "Sent"', async () => {
  const f = await draw(<MessageTaskDrawer task={TASK} onClose={no} send={fake({ outcome: 'done', data: { queued: false, dropped: 'access_revoked' } })} />);
  expect(f).toContain(voice['textDropped.access_revoked'].split(' ').slice(0, 4).join(' '));
  expect(f).not.toContain(strings['task.msgSent'].split(' ').slice(0, 3).join(' '));
});

test('while the Bot waits on its approval the form says sending declines it', async () => {
  const f = await draw(<MessageTaskDrawer task={TASK} onClose={no} send={fake()} declines />);
  // The warn line wraps in the drawer's footer: its first words, on the line its mark starts.
  const head = strings['say.declines'].split(' ').slice(0, 3).join(' ');
  expect(f).toContain(`! ${head}`);
  const g = await draw(<MessageTaskDrawer task={TASK} onClose={no} send={fake()} />);
  expect(g).not.toContain(head);
});
