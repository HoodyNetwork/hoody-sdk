// The kit's dialog, drawn alone (here, beside the prims it is mounted with: FocusRoot, OverlayHost).
// A page that blocks a dialog's action puts a `failed` OutcomeBanner among the dialog's children, after the body and
// the consequences. In a body that scrolls (80x24) that note was below the fold: the action was dim and the first
// screen did not say why. A dialog whose primary is disabled now draws such a note above the body. Nothing else moves.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Primary disabled + a failed note among the children: the note and its reason are on the first screen, above the body's first line, in a body that scrolls | 'off: the note first' |
// | 2 | The same when the page wrapped the note in one element of its own | 'in a wrapper' |
// | 3 | The same in a dialog that fits: the order does not depend on the size | 'roomy' |
// | 4 | Primary enabled: the note stays where the page put it, after the body | 'on: as given' |
// | 5 | Primary disabled + a note of another kind (a refusal, `not_sent`): stays after the body | 'another kind stays' |
// | 6 | Primary disabled, no note: the children are drawn as given | 'off, no note' |
// | 7 | When the note arrives, what stands beside it is not mounted again (a field keeps what was typed) | 'the rest keeps its state' |
import { expect, test } from 'bun:test';
import { useEffect, useState } from 'react';
import { drawTest } from './testing';
import { Box, FocusRoot, Text } from './index';
import { OverlayHost } from './Overlay';
import { ConfirmDialog } from '../../kit/overlays/Dialog';
import { OutcomeBanner } from '../../kit/states/States';

const draw = (node: React.ReactNode, width = 80, height = 24) => drawTest(<FocusRoot><OverlayHost>{node}</OverlayHost></FocusRoot>, { width, height });
const LINES = Array.from({ length: 30 }, (_, i) => `consequence number ${i + 1}`);
const BODY = 'First line of the body.';
const NOTE = 'A payment is not settled';
const WHY = 'Because of a reason.';
const AFTER = 'After the note.';
const row = (frame: string, text: string): number => frame.split('\n').findIndex((l) => l.includes(text));

let mounts = 0;
function Beside() {
  useEffect(() => { mounts++; }, []);
  return <Text>{AFTER}</Text>;
}
let arrive: () => void = () => {};
function Page({ off, kind = 'failed', wrap = false, note = true, late = false, lines = LINES }: { off: boolean; kind?: 'failed' | 'not_sent'; wrap?: boolean; note?: boolean; late?: boolean; lines?: string[] }) {
  const [here, setHere] = useState(!late);
  useEffect(() => { arrive = () => setHere(true); return () => { arrive = () => {}; }; }, []);
  const banner = <OutcomeBanner kind={kind} title={NOTE} body={WHY} />;
  return (
    <ConfirmDialog isOpen onOpenChange={() => {}} title="Change it?" body={BODY} consequences={lines} confirmLabel="Change" onConfirm={() => {}} confirmDisabled={off && here}>
      {note && here ? (wrap ? <Box>{banner}</Box> : banner) : null}
      <Beside />
    </ConfirmDialog>
  );
}
async function frameOf(node: React.ReactNode, w = 80, h = 24): Promise<string> {
  const t = await draw(node, w, h);
  const f = await t.settle();
  t.renderer.destroy();
  return f;
}

test('off: the note first', async () => {
  const f = await frameOf(<Page off />);
  expect(row(f, NOTE)).toBeGreaterThan(-1);
  expect(f).toContain(WHY);
  expect(row(f, BODY)).toBeGreaterThan(row(f, NOTE));
});

test('in a wrapper', async () => {
  const f = await frameOf(<Page off wrap />);
  expect(row(f, NOTE)).toBeGreaterThan(-1);
  expect(f).toContain(WHY);
  expect(row(f, BODY)).toBeGreaterThan(row(f, NOTE));
});

test('roomy', async () => {
  const f = await frameOf(<Page off lines={['one']} />, 120, 40);
  expect(row(f, NOTE)).toBeGreaterThan(-1);
  expect(row(f, BODY)).toBeGreaterThan(row(f, NOTE));
  expect(row(f, AFTER)).toBeGreaterThan(row(f, BODY));
});

test('on: as given', async () => {
  const f = await frameOf(<Page off={false} lines={['one']} />, 120, 40);
  expect(row(f, BODY)).toBeGreaterThan(-1);
  expect(row(f, NOTE)).toBeGreaterThan(row(f, BODY));
  expect(row(f, AFTER)).toBeGreaterThan(row(f, NOTE));
});

test('another kind stays', async () => {
  const f = await frameOf(<Page off kind="not_sent" lines={['one']} />, 120, 40);
  expect(row(f, BODY)).toBeGreaterThan(-1);
  expect(row(f, NOTE)).toBeGreaterThan(row(f, BODY));
});

test('off, no note', async () => {
  const f = await frameOf(<Page off note={false} lines={['one']} />, 120, 40);
  expect(row(f, BODY)).toBeGreaterThan(-1);
  expect(row(f, AFTER)).toBeGreaterThan(row(f, BODY));
  expect(f).not.toContain(NOTE);
});

test('the rest keeps its state', async () => {
  mounts = 0;
  const t = await draw(<Page off late lines={['one']} />, 120, 40);
  const before = await t.settle();
  expect(before).not.toContain(NOTE);
  expect(mounts).toBe(1);
  arrive();
  await t.settle();
  const after = await t.settle();
  t.renderer.destroy();
  expect(row(after, NOTE)).toBeGreaterThan(-1);
  expect(row(after, BODY)).toBeGreaterThan(row(after, NOTE));
  expect(mounts).toBe(1);
});
