// FormFooter's state line takes the room left beside the buttons (web: `.footer { width: 100% }`,
// `.footerState { flex: 1 1 0 }`, more.module.css): words too long for that room wrap beside the buttons.
// | # | Guarantee | Test |
// | 1 | In a full-width form a long pending line wraps beside the buttons; the buttons are not sent under it | 'pending at …' |
// | 2 | As a Drawer's foot, narrow or wide, the buttons stay on screen whole beside the state | 'drawer foot at …' |
// Engine 0.8.4-hoody.3 breaks a wrapping row's lines on each item's flex basis, as CSS does. With no basis the state's
// basis was its text and the buttons went two rows under the words (ai, Connect a key, pending). Basis 0 alone made a
// Drawer's foot only as wide as the buttons and cut them (computers create, vault new entry, demo save).
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { Drawer } from '../overlays/Drawer';
import { Form, FormFooter } from './more';

const detail = 'This may have gone through. Check again before trying a second time.';

for (const width of [70, 100]) {
  test(`pending at ${width} columns: the words wrap beside the buttons, on the buttons' line`, async () => {
    const t = await drawTest(
      <FocusRoot>
        <Form onSubmit={() => {}} outcome="pending" onCheck={() => {}}>
          <FormFooter dirty={false} pendingDetail={detail} onCancel={() => {}} />
        </Form>
      </FocusRoot>, { width, height: 12 });
    const lines = (await t.settle()).split('\n');
    const head = lines.findIndex((l) => l.includes('May have gone through'));
    const buttons = lines.findIndex((l) => l.includes('[Close]'));
    const lastWords = lines.findIndex((l) => l.includes('time.'));
    expect(head).toBeGreaterThanOrEqual(0);
    expect(lastWords).toBeGreaterThan(head);
    // The buttons share a line with the state (its head or its words), at the end of that line.
    expect(buttons).toBeGreaterThanOrEqual(head);
    expect(buttons).toBeLessThanOrEqual(lastWords);
    expect(lines[buttons]).toMatch(/\S\s{2,}\[Close\]\s+Check again\s*$/);
    t.renderer.destroy();
  });
}

for (const width of [30, 46, 80, 120]) {
  test(`drawer foot at ${width} columns: "Unsaved changes" and both buttons are on screen, the buttons whole`, async () => {
    const t = await drawTest(
      <FocusRoot><OverlayHost>
        <Drawer isOpen onOpenChange={() => {}} title="New thing" size="sm" resizeKey={`test-foot-basis-${width}`} footer={<FormFooter dirty requireDirty={false} onSubmit={() => {}} submitLabel="Get computer" />}>
          <Text>Body</Text>
        </Drawer>
      </OverlayHost></FocusRoot>, { width, height: 24 });
    const lines = (await t.settle()).split('\n');
    const f = lines.join('\n');
    expect(f).toContain('Unsaved changes');
    expect(f).toContain('[Cancel]');
    expect(f).toContain('Get computer');
    // The footer is the screen's last lines: nothing of it is drawn past the bottom.
    expect(lines.findIndex((l) => l.includes('Get computer'))).toBeLessThan(24);
    t.renderer.destroy();
  });
}
