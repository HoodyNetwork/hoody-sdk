// The transcript (the role "log" region) takes focus to scroll by keys; the accessible tree must say so:
// its sem sat on the Box without the focus handle, so with the log focused the tree had no focused node and a
// screen reader heard nothing when Tab reached it.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import { SessionView } from './SessionView';
import { DEMO_SCRIPT, scriptedSource } from './scriptedSource.fixture';

test('Tab onto the transcript: the focused node is the log', async () => {
  const src = scriptedSource(DEMO_SCRIPT);
  const t = await drawTest(
    <FocusRoot><Box dir="column" width={80} height={24}><SessionView source={src} size="l" typing={false} /></Box></FocusRoot>,
    { width: 80, height: 24 },
  );
  try {
    await t.settle();
    let f = '';
    for (let i = 0; i < 30; i++) {
      t.mockInput.pressTab();
      f = await t.settle();
      if (f.includes('PgUp PgDn page')) break;
    }
    expect(f, f).toContain('PgUp PgDn page');
    const n = focusedNode(semanticsOf(t.renderer));
    expect(n?.role, f).toBe('log');
  } finally { t.renderer.destroy(); }
});
