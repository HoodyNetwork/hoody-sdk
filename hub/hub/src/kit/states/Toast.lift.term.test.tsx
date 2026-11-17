// Toasts lift above an open drawer's controls (Billing → Add funds at 80x24, the "Open this address"
// toast drew over the drawer's "Open the payment page" link and its foot rule).
//
// | # | Web behaviour (Toast.tsx place → toastPlacement) | Test |
// |---|---|---|
// | 1 | No dialog open: the stack sits in the bottom-right corner | 'corner with nothing open' |
// | 2 | A drawer control in the stack's column: the stack lifts the least that clears it (at most half the screen) | 'lifts above a drawer link' |
// | 3 | The controls are a dialog's own: buttons and links of the page behind count for nothing | 'page controls do not lift' |
import { afterEach, expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { Button } from '../controls/Button';
import { Drawer } from '../overlays/Drawer';
import { Toaster, showToast } from './Toast';
import { toastQueue } from './Toast.store';

afterEach(() => { (toastQueue() as unknown as { clear(): void }).clear(); });

const TOAST = { tone: 'info' as const, title: 'Open this address in your browser', body: 'https://pay.example.test/c/pay/cs_test_a1b2c3', timeout: 0 };

function Page({ drawer, pageLink }: { drawer: boolean; pageLink?: boolean }) {
  return (
    <>
      <Text>Page</Text>
      {pageLink ? <Box absolute={{ bottom: 4, right: 2 }}><Button onPress={() => {}}>Page link far right</Button></Box> : null}
      <Drawer isOpen={drawer} onOpenChange={() => {}} title="Add funds" size="md" resizeKey="toast-lift-test" primary={<Button variant="primary" onPress={() => {}}>Continue to payment</Button>}>
        {Array.from({ length: 16 }, (_, i) => <Text key={i}>Body line {i + 1}</Text>)}
        {/* At the drawer's end edge, in the toasts' column (the payment link sat there at 80x24). */}
        <Box dir="row"><Box grow={1} /><Button onPress={() => {}}>Open the payment page</Button></Box>
      </Drawer>
      <Toaster />
    </>
  );
}

async function frame(drawer: boolean, pageLink = false): Promise<string[]> {
  const t = await drawTest(<FocusRoot><OverlayHost><Page drawer={drawer} pageLink={pageLink} /></OverlayHost></FocusRoot>, { width: 80, height: 24 });
  await t.settle();
  showToast(TOAST);
  await t.settle();
  await t.settle();
  const rows = t.captureCharFrame().split('\n');
  t.renderer.destroy();
  return rows;
}
const rowOf = (rows: string[], s: string): number => rows.findIndex((r) => r.includes(s));
/** The toast frame's last row (its bottom border under the body). */
const toastBottom = (rows: string[]): number => {
  for (let k = rowOf(rows, 'pay.example.test'); k < rows.length; k++) if (/└─+┘/.test(rows[k]!)) return k;
  return -1;
};

test('corner with nothing open: the stack ends one row above the bottom', async () => {
  const rows = await frame(false);
  expect(rowOf(rows, 'Open this address')).toBeGreaterThan(0);
  expect(toastBottom(rows)).toBe(24 - 2);
});

test('lifts above a drawer link: the link and the footer actions stay whole', async () => {
  const rows = await frame(true);
  const link = rowOf(rows, 'Open the payment page');
  expect(link).toBeGreaterThan(0);
  expect(rowOf(rows, 'Continue to payment')).toBeGreaterThan(link);
  expect(rowOf(rows, 'Open this address')).toBeGreaterThan(0);
  // Above the link, never over it, and never more than half the screen up.
  expect(toastBottom(rows)).toBeLessThan(link);
  expect(toastBottom(rows)).toBeGreaterThanOrEqual(24 - 1 - 12 - 1);
});

test('page controls do not lift: only an open dialog or drawer counts', async () => {
  const rows = await frame(false, true);
  expect(toastBottom(rows)).toBe(24 - 2);
});
