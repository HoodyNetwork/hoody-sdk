import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, Text, setColourTier, colourTier } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { Band, Notice } from './Band';
import { EmptyPlace, EmptyRail, EmptyState, ErrorState, OutcomeBanner, Skeleton, Spinner } from './States';

let t: TestTerm | null = null;
const tier = colourTier();
afterEach(() => { t?.renderer.destroy(); t = null; setColourTier(tier); });
const draw = async (node: React.ReactNode, w = 70, h = 12) => { t = await drawTest(<FocusRoot><OverlayHost>{node}</OverlayHost></FocusRoot>, { width: w, height: h }); return t.settle(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('Skeleton: nothing for 150 ms, then static bars with the words "Loading…"; immediate shows at once', async () => {
  const f0 = await draw(<Skeleton rows={3} />, 70, 20);
  expect(f0.trim()).toBe('');
  await wait(200);
  const f1 = await t!.settle();
  expect(f1).toContain('Loading…');
  expect(f1.split('\n').filter((l) => l.includes('▁')).length).toBe(3);
  t!.renderer.destroy();
  const f2 = await draw(<Skeleton rows={2} variant="table" columns={3} immediate />);
  expect(f2).toContain('Loading…');
  expect(f2).toMatchSnapshot();
});

test('EmptyState: md is a card; compact is one line; a rail makes it sm and plain; a frame place takes the full width', async () => {
  const md = await draw(<EmptyState icon="schedules" title="No schedules yet" body="Add one." action={<Text>[New]</Text>} />);
  expect(md).toMatch(/┌/);
  expect(md).toContain('No schedules yet');
  t!.renderer.destroy();
  const compact = await draw(<EmptyState title="Nothing here" size="compact" action={<Text>[Add]</Text>} />);
  expect(compact.split('\n')[0]).toMatch(/Nothing here · \[Add\]/);
  t!.renderer.destroy();
  const rail = await draw(<EmptyRail><EmptyState title="Empty rail" /></EmptyRail>);
  expect(rail).not.toMatch(/┌/);
  t!.renderer.destroy();
  const frame = await draw(<EmptyPlace place="frame"><EmptyState title="In the frame" /></EmptyPlace>, 70);
  expect(frame.split('\n')[0]).toMatch(/^┌─{60,}/);
});

test('ErrorState: the generic words, Try again calls back; pending facts turn it into the pending state with no resend', async () => {
  let n = 0;
  const f = await draw(<ErrorState onRetry={() => { n++; }} />);
  expect(f).toContain('Try again');
  t!.mockInput.pressTab();
  await t!.settle();
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(n).toBe(1);
  t!.renderer.destroy();
  const pending = await draw(<ErrorState title="Couldn't save" onRetry={() => {}} error={{ outcome: 'pending' }} />);
  expect(pending).not.toContain('Try again');
  expect(pending).not.toContain("Couldn't save");
});

test('OutcomeBanner: a pending one offers Check again; Stop tracking asks first in the kit dialog, and only the confirm calls back', async () => {
  let checks = 0, gone = 0;
  const f = await draw(<OutcomeBanner kind="pending" onCheck={() => { checks++; }} onDismiss={() => { gone++; }} />, 80, 14);
  expect(f).toContain('◷');
  expect(f).toContain('Check again');
  t!.mockInput.pressTab(); await t!.settle();
  t!.mockInput.pressEnter(); await t!.settle();
  expect(checks).toBe(1);
  t!.mockInput.pressTab(); await t!.settle();
  t!.mockInput.pressEnter();
  const asked = await t!.settle();
  expect(asked).toContain('Stop tracking this?');
  expect(gone).toBe(0);
  // A danger confirm opens on Cancel (the kit rule); Tab reaches Stop tracking anyway.
  t!.mockInput.pressTab(); await t!.settle();
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(gone).toBe(1);
});

test('Band: every tone reads in mono by its mark; a dismissable band closes; Notice levels', async () => {
  setColourTier('mono');
  let closed = 0;
  const f = await draw(<>
    <Band>neutral words</Band>
    <Band tone="warn">warn words</Band>
    <Band tone="danger" size="table" onDismiss={() => { closed++; }}>danger words</Band>
    <Notice level="warn">careful</Notice>
  </>, 60, 8);
  expect(f).toMatch(/i neutral words/);
  expect(f).toMatch(/! warn words/);
  expect(f).toMatch(/✗ danger words/);
  expect(f).toMatch(/! careful/);
  expect(f).toMatchSnapshot();
  // "a dismissable band closes": the close is pressed and its report counted here. The danger band's close is
  // the only stop here; Enter on it reports once (Band.term.tsx line 63).
  t!.mockInput.pressTab();
  await t!.settle();
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(closed).toBe(1);
});

test('Spinner is a still mark (no animation): the same frame twice', async () => {
  const a = await draw(<Spinner label="Starting" />, 20, 1);
  await wait(300);
  expect(await t!.settle()).toBe(a);
  expect(a).toContain('… Starting');
});

test('a compact ErrorState in a wrapping row (Billing: the header meta beside the title) wraps its words and keeps Try again on screen', async () => {
  const { Box: B } = await import('../../term/prim');
  t = await drawTest(
    <FocusRoot>
      <B dir="column" width={58}>
        <B dir="row" wrap gapX={2} shrink={1} maxWidth="100%" align="center">
          <Text bold>Plans & Billing</Text>
          <ErrorState size="compact" title="Balance unavailable" body="No answer from the server. Check your connection, then try again." error={{ status: 0, kind: 'network' } as never} onRetry={() => {}} />
        </B>
      </B>
    </FocusRoot>,
    { width: 58, height: 6 },
  );
  const f = await t.settle();
  expect(f).toContain('Balance unavailable');
  expect(f).toContain('Try again');
  for (const l of f.split('\n')) expect(l.trimEnd().length).toBeLessThanOrEqual(58);
});
