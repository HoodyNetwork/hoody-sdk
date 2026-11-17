// SessionTab in the terminal: Details → Session mounts and draws under the terminal's strict globals (no document, no
// window). useLiveSession takes its "back in view" listeners from the host env, never from document or window: a direct read
// throws TERM_GLOBAL at mount and the AI page draws "This page could not be drawn".
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { SessionTab } from './SessionTab';

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; });

test('the Session tab mounts and draws at 80 and 120 cells with no chat target', async () => {
  for (const width of [80, 120]) {
    term = await drawTest(<FocusRoot><OverlayHost><Box dir="column" width={width}><SessionTab target={null} session="s1" computer="atlas" realmId="global" /></Box></OverlayHost></FocusRoot>, { width, height: 40 });
    const frame = await term.settle();
    expect(frame, String(width)).toContain('atlas');
    expect(frame).not.toContain('could not be drawn');
    term.renderer.destroy();
    term = null;
  }
}, 60_000);
