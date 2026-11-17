// A dialog body that is only text reads as one sentence: one Text that wraps inside the box and keeps every line, even
// when the body scrolls. Keys' delete confirm (`{text} {t('del.once')}`) drew its two pieces side by side, each wrapping
// in its own column over the other; scripts' version preview cut its one-string body to a single line above a long diff.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot, Scroll } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { CodeBlock } from '../data/Ids';
import { Stack } from '../layouts/Stack';
import { ConfirmDialog, Dialog } from './Dialog';

const SIZE = { width: 80, height: 24 };
const flat = (frame: string) => frame.split('\n').map((r) => r.replace(/[║│█▀▄]/g, ' ').trim()).join(' ').replace(/\s+/g, ' ');

test('a body of text pieces is one sentence, never two columns side by side', async () => {
  const name = 'ci-deploy';
  const t = await drawTest(
    <FocusRoot><OverlayHost>
      <ConfirmDialog isOpen onOpenChange={() => {}} tone="danger" title={`Delete ${name}?`} confirmLabel="Delete key" onConfirm={() => {}}
        body={<>{`Anything that uses ${name} stops working at once.`} {'This cannot be undone.'}</>} />
    </OverlayHost></FocusRoot>, SIZE);
  const f = await t.settle();
  // Read in order across the wrapped lines, the second piece follows the first; side by side, "This cannot be" sat
  // between "stops" and "working".
  expect(flat(f)).toContain('Anything that uses ci-deploy stops working at once. This cannot be undone.');
  t.renderer.destroy();
});

test('a string body keeps all its lines above a bounded scrolling box, in a wide dialog clamped to the screen', async () => {
  const body = 'This is what restoring it would change in the code. Nothing is restored until you press Restore this version.';
  const t = await drawTest(
    <FocusRoot><OverlayHost>
      <Dialog isOpen onOpenChange={() => {}} title="Version 2" size="xl" body={body}>
        {/* The page's diff box (`max-height` + `overflow: auto`): a bounded clip around a scroll that fills it. */}
        <Stack gap={3}>
          <Box dir="column" maxHeight={17} raw={{ overflow: 'hidden' }}><Scroll grow={1}><CodeBlock wrap lang="diff" label="Changes" code="+ // An earlier take" /></Scroll></Box>
        </Stack>
      </Dialog>
    </OverlayHost></FocusRoot>, SIZE);
  const f = await t.settle();
  expect(flat(f)).toContain(body);
  t.renderer.destroy();
});
