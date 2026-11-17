// The Bots list's Resume outcome in the terminal (view.tsx ComputerNotesStrip, drawn by the kit's terminal OutcomeBanner).
// One that may have gone through names its computer with Check again and Stop tracking when this mount holds it; held by
// another mount, Check again only and no computer named; one that did not go through says so.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import '../../term/env/router-globals';
import { bootFixtureCore } from '@core';
import { bump } from '@core/ctx';
import { beginTermSession, type TermSession } from '../../term/env/session';
import type { ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { ComputerNotesStrip, type ResumeShown } from './view';
import type { Computer } from './data';
import strings from './strings.en.json';
import kit from '@kit/strings.en.json';

let session: TermSession | null = null;
beforeEach(() => { session = beginTermSession(); bootFixtureCore({}); });
afterEach(() => { bump('signout'); session?.end(); session = null; });

async function draw(node: ReactNode, width = 100, height = 16): Promise<string> {
  const t = await drawTest(<FocusRoot><Box width={width}>{node}</Box></FocusRoot>, { width, height });
  const frame = await t.settle();
  t.renderer.destroy();
  return frame;
}
const no = (): void => {};
const atlas = { id: 'c1', name: 'atlas' } as unknown as Computer;
const strip = (resumed: ResumeShown) => (
  <ComputerNotesStrip computers={[]} allComputers={[atlas]} holds={[]} onRetry={no} onResume={no} resuming={false} resumed={resumed} starting={false} onCheckStart={no} onDismissStart={no} />
);
const mine = [{ identity: { action: 'resume', computerId: 'c1' }, hold: 'h1' }];
const shown = (outcome: ResumeShown['outcome'], held: ResumeShown['held'] = () => mine): ResumeShown => ({ outcome, computerId: 'c1', held, onCheck: no, onDismiss: no, onClose: no });

test('a Resume that may have gone through names its computer, with Check again and Stop tracking', async () => {
  const f = await draw(strip(shown('pending')));
  expect(f).toContain(strings['notice.resumeHeld'].replace('{{name}}', 'atlas'));
  expect(f).toContain(kit['outcome.pending.check']);
  expect(f).toContain('Stop tracking');
});

test('a Resume another mount holds: Check again only, no computer named, no Stop tracking', async () => {
  const f = await draw(strip(shown('pending', () => [])));
  expect(f).toContain(strings['notice.resumeHeldAny']);
  expect(f).toContain(kit['outcome.pending.check']);
  expect(f).not.toContain('Stop tracking');
});

test('a Resume that did not go through says so', async () => {
  const f = await draw(strip(shown('failed')));
  expect(f).toContain(kit['outcome.failed.title']);
});

test('nothing is drawn while no Resume outcome is to be told', async () => {
  const f = await draw(strip(shown('idle')));
  expect(f.trim()).toBe('');
});
