// A Tabs strip in a content-sized parent (a column that aligns its children to the start, as the Notifications toolbar
// does) folds only when its ROOM is short, never because it measured its own folded content. For example: "▸ Inbox 26
// 1 ›" at 120x40 with 90 free columns, after the badge arrived on a later render and the strip measured itself
// narrower than its tabs (the notifications page at 120x40).
import { afterEach, expect, test } from 'bun:test';
import { useEffect, useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { Tabs } from './Tabs';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

function Late({ align }: { align: 'start' | 'stretch' }) {
  const [unread, setUnread] = useState<number | undefined>(undefined);
  useEffect(() => { const h = setTimeout(() => setUnread(26), 30); return () => clearTimeout(h); }, []);
  return (
    <FocusRoot>
      <Box dir="column" align={align}>
        <Tabs label="Views" value="inbox" items={[{ id: 'inbox', label: 'Inbox', badge: unread }, { id: 'learn', label: 'Get notified' }]} />
        <Text>under</Text>
      </Box>
    </FocusRoot>
  );
}

for (const align of ['start', 'stretch'] as const) {
  test(`a badge arriving later never folds a strip that has room (parent align ${align})`, async () => {
    t = await drawTest(<Late align={align} />, { width: 100, height: 6 });
    await new Promise((r) => setTimeout(r, 80));
    await t.settle();
    const f = await t.settle();
    expect(f).toContain('▸ Inbox 26');
    expect(f).toContain('Get notified');
    expect(f).not.toMatch(/\d ›/);
  });
}

test('a strip that has no room still folds (the room is the parent, not the content)', async () => {
  t = await drawTest(
    <FocusRoot>
      <Box dir="column" align="start" width={20}>
        <Tabs label="Views" value="inbox" items={[{ id: 'inbox', label: 'Inbox', badge: 26 }, { id: 'learn', label: 'Get notified' }]} />
      </Box>
    </FocusRoot>,
    { width: 40, height: 6 },
  );
  const f = await t.settle();
  expect(f).toContain('▸ Inbox 26');
  expect(f).toMatch(/1 ›/);
});
