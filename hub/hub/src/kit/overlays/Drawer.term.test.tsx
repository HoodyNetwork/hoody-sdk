// Drawer in the terminal (Drawer.term.tsx on prim/Overlay).
//
// | # | Web behaviour (Drawer.tsx) | Test |
// |---|---|---|
// | 1 | A side sheet on the right, full height, title + subtitle + ×, a body, a footer (outcome/reason, secondary, Cancel, primary) | 'draws' |
// | 2 | Sizes sm/md/lg (480/640/880 px = 60/80/110 columns); never past the screen less the 7-column rail where the shell draws it (100 columns and up; narrower no strip is kept, nor a page strip under 20 columns); under 75 columns (the web's 600 px) the whole screen | 'sizes' |
// | 3 | ×, Esc, a scrim press, Cancel: onOpenChange(false) when clean | 'closes when clean' |
// | 4 | dirty: every close asks "Discard changes?" first; Keep editing is focused (Enter keeps); Discard closes | 'dirty asks' |
// | 5 | busy: every close refused, Cancel disabled, × shows no Esc | 'busy refuses' |
// | 6 | useDrawer() inside: requestClose is the guarded close; null outside | 'useDrawer' |
// | 7 | the body behind gets no keys while open; Tab stays in the drawer | 'traps' |
// | 8 | onBack: "‹ Back to …" in the header calls onBack | 'back' |
// | 9 | width by keys on the handle (← wider, → narrower), kept per resizeKey | 'resize' |
// | 10 | The body is a size container (container queries read the drawer body, not the viewport) | 'body is a pane' |
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot, Pressable, Text, usePaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { Button } from '../controls/Button';
import { Drawer, useDrawer } from './Drawer';
import type { DrawerSize } from './Drawer';

async function esc(t: { mockInput: { pressEscape(): void }; settle(): Promise<string> }): Promise<string> {
  t.mockInput.pressEscape();
  await new Promise((r) => setTimeout(r, 80));
  return t.settle();
}

function InnerClose({ log }: { log: string[] }) {
  const d = useDrawer();
  return <Button onPress={() => { log.push(`inner:${d ? 'drawer' : 'null'}`); d?.requestClose(); }}>Inner close</Button>;
}

function Page({ log, dirty, busy, size = 'md', back }: { log: string[]; dirty?: boolean; busy?: boolean; size?: DrawerSize; back?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Pressable autoFocus onPress={() => log.push('page')}>{({ focused }) => <Text inverse={focused}>[Page]</Text>}</Pressable>
      <InnerClose log={log} />
      <Drawer
        isOpen={open}
        onOpenChange={(o) => { log.push(`open:${o}`); setOpen(o); }}
        title="New schedule"
        subtitle="Runs a command on a computer."
        size={size}
        dirty={dirty}
        busy={busy}
        resizeKey="test-schedule"
        {...(back ? { onBack: () => log.push('back'), backLabel: 'Back to Schedules' } : {})}
        reason="Name the schedule first."
        primary={<Button variant="primary" onPress={() => log.push('create')}>Create</Button>}
      >
        <Text>Body line</Text>
        <InnerClose log={log} />
      </Drawer>
    </>
  );
}

const draw = (node: React.ReactNode, width = 120, height = 40) => drawTest(<FocusRoot><OverlayHost>{node}</OverlayHost></FocusRoot>, { width, height });

test('draws: header, body, footer with reason, Cancel, primary', async () => {
  const t = await draw(<Page log={[]} />);
  const f = await t.settle();
  expect(f).toContain('New schedule');
  expect(f).toContain('Runs a command on a computer.');
  expect(f).toContain('Esc ×');
  expect(f).toContain('Body line');
  expect(f).toMatch(/Name the schedule first\.\s+\[Cancel\]\s+.?Create/);
  t.renderer.destroy();
});

test('sizes: md is 80 columns at the right; narrow terminal = whole screen', async () => {
  for (const [size, cols] of [['sm', 60], ['md', 80]] as const) {
    const t = await draw(<Page log={[]} size={size} />);
    const lines = (await t.settle()).split('\n');
    const row = lines.find((l) => l.includes('New schedule'))!;
    // the drawer's left edge (the handle) starts at width - cols
    expect(row.indexOf('┃')).toBe(120 - cols);
    t.renderer.destroy();
  }
  // Where the shell draws its sidebar (100 columns and up): never wider than the screen less the collapsed rail
  // (56 px = 7 columns), so the rail stays in view, as the web's calc(100vw - var(--sidebar-w-collapsed)).
  // Narrower there is no rail to keep: no strip is kept, and a page strip under 20 columns (cut page text) is covered
  // too; a drawer that leaves 20 columns or more keeps its own width.
  for (const [size, w, edge] of [['lg', 100, 7], ['md', 80, 0], ['md', 90, 0], ['lg', 99, 0], ['sm', 80, 20]] as const) {
    const t = await draw(<Page log={[]} size={size} />, w, 24);
    const f = await t.settle();
    const row = f.split('\n').find((l) => l.includes('New schedule'))!;
    expect(row.indexOf('┃')).toBe(edge);
    if (edge === 0) expect(f).not.toContain('[Page]');
    t.renderer.destroy();
  }
  // Under 75 columns (the web's `@media (width < 600px)`): the whole screen, no handle.
  const t = await draw(<Page log={[]} size="md" />, 74, 24);
  const f = await t.settle();
  expect(f).not.toContain('[Page]');
  expect(f).not.toContain('┃');
  expect(f.split('\n').find((l) => l.includes('New schedule'))!.indexOf('New schedule')).toBe(1);
  t.renderer.destroy();
});

test('closes when clean: Esc, scrim, Cancel', async () => {
  const log: string[] = [];
  const t = await draw(<Page log={log} />);
  await esc(t);
  expect(log).toEqual(['open:false']);
  t.renderer.destroy();
  const l2: string[] = [];
  const t2 = await draw(<Page log={l2} />);
  await t2.settle();
  await t2.mockMouse.click(2, 10);
  await t2.settle();
  expect(l2).toEqual(['open:false']);
  t2.renderer.destroy();
});

test('dirty asks first; Enter keeps editing; Discard closes', async () => {
  const log: string[] = [];
  const t = await draw(<Page log={log} dirty />);
  let f = await esc(t);
  expect(f).toContain('Discard changes?');
  expect(log).toEqual([]);
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(f).not.toContain('Discard changes?');
  expect(f).toContain('New schedule');
  await esc(t);
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['open:false']);
  t.renderer.destroy();
});

// Once, a second Esc asked again (the question redrawn in place), so the drawer read as stuck.
test('dirty: Esc on the question keeps editing; the next Esc asks again; nothing closes without Discard', async () => {
  const log: string[] = [];
  const t = await draw(<Page log={log} dirty />);
  let f = await esc(t);
  expect(f).toContain('Discard changes?');
  f = await esc(t);
  expect(f).not.toContain('Discard changes?');
  expect(f).toContain('New schedule');
  expect(log).toEqual([]);
  f = await esc(t);
  expect(f).toContain('Discard changes?');
  expect(log).toEqual([]);
  t.renderer.destroy();
});

test('busy refuses every close; Cancel disabled; no Esc on the ×', async () => {
  const log: string[] = [];
  const t = await draw(<Page log={log} busy />);
  let f = await t.settle();
  expect(f).not.toContain('Esc ×');
  f = await esc(t);
  await t.mockMouse.click(2, 10);
  for (let i = 0; i < 6; i++) { t.mockInput.pressTab(); t.mockInput.pressEnter(); }
  await t.settle();
  expect(log.filter((l) => l.startsWith('open'))).toEqual([]);
  t.renderer.destroy();
});

test('useDrawer: the guarded close inside, null outside; the page gets no keys', async () => {
  const log: string[] = [];
  const t = await draw(<Page log={log} dirty />);
  await t.settle();
  // Tab cycles inside the drawer only: × , handle, body button, Cancel, Create ...
  for (let i = 0; i < 12; i++) t.mockInput.pressTab();
  await t.settle();
  expect(log).toEqual([]);
  expect(log.includes('page')).toBe(false);
  t.renderer.destroy();
  const l2: string[] = [];
  const t2 = await draw(<><InnerClose log={l2} /></>);
  await t2.settle();
  await t2.mockMouse.click(1, 0);
  await t2.settle();
  expect(l2).toEqual(['inner:null']);
  t2.renderer.destroy();
});

test('inner requestClose asks when dirty', async () => {
  const log: string[] = [];
  const t = await draw(<Page log={log} dirty />);
  const f0 = await t.settle();
  const y = f0.split('\n').findIndex((l, i) => i > 3 && l.includes('[Inner close]'));
  const x = f0.split('\n')[y]!.lastIndexOf('[Inner close]');
  await t.mockMouse.click(x + 2, y);
  const f = await t.settle();
  expect(log).toEqual(['inner:drawer']);
  expect(f).toContain('Discard changes?');
  t.renderer.destroy();
});

test('back: the header link calls onBack', async () => {
  const log: string[] = [];
  const t = await draw(<Page log={log} back />);
  const f = await t.settle();
  const y = f.split('\n').findIndex((l) => l.includes('‹ Back to Schedules'));
  const x = f.split('\n')[y]!.indexOf('‹ Back');
  await t.mockMouse.click(x + 2, y);
  await t.settle();
  expect(log).toEqual(['back']);
  t.renderer.destroy();
});

test('resize: ← on the handle widens by 2; the width is kept for the next open', async () => {
  const t = await draw(<Page log={[]} size="sm" />);
  let f = await t.settle();
  const row = () => f.split('\n').find((l) => l.includes('New schedule'))!;
  expect(row().indexOf('┃')).toBe(60);
  expect(f).toContain('[Page]');
  await t.mockMouse.click(60, 5);
  await t.settle();
  t.mockInput.pressArrow('left');
  await t.settle();
  t.mockInput.pressArrow('left');
  f = await t.settle();
  expect(f.split('\n').find((l) => l.includes('New schedule'))!.search(/[┃◂▸│]/)).toBe(56);
  t.renderer.destroy();
  const t2 = await draw(<Page log={[]} size="sm" />);
  f = await t2.settle();
  expect(f.split('\n').find((l) => l.includes('New schedule'))!.indexOf('┃')).toBe(56);
  t2.renderer.destroy();
});

function PaneProbe({ seen }: { seen: { cols: number; source: string }[] }) {
  const d = usePaneSize();
  seen.push({ cols: d.cols, source: d.source });
  return <Text>{`pane ${d.cols}`}</Text>;
}

test('body is a pane', async () => {
  const seen: { cols: number; source: string }[] = [];
  const t = await draw(<Drawer isOpen onOpenChange={() => {}} title="Details" resizeKey="pane-test"><PaneProbe seen={seen} /></Drawer>);
  await t.settle();
  const last = seen[seen.length - 1]!;
  expect(last.source).toBe('pane');
  expect(last.cols).toBeGreaterThan(0);
  expect(last.cols).toBeLessThan(120);
  t.renderer.destroy();
});

// Census cluster 18: a page's own footer ran past the panel (logs Explain, billing held payment). As the web's `.foot`:
// the page's note shrinks and wraps beside the buttons; full screen or narrow, the row wraps in reverse (the last button
// on top), never past the edge.
const footCut = async (t: Awaited<ReturnType<typeof draw>>, w: number, h: number) => {
  const { layoutFaults } = await import('../../term/prim/layoutcheck');
  return layoutFaults((t.renderer as unknown as { root: never }).root, { cols: w, rows: h }).filter((x) => x.kind === 'cut' || x.kind === 'text-cut' || x.kind === 'overdraw');
};

test('a page footer: its note shrinks beside the buttons; nothing runs past the panel', async () => {
  const foot = (
    <>
      <span>Sends a new request and may use more of your AI helper's budget.</span>
      <Button variant="secondary" onPress={() => {}}>Close</Button>
      <Button onPress={() => {}}>Ask again</Button>
    </>
  );
  for (const [w, h] of [[120, 30], [80, 24]] as const) {
    const t = await draw(<Drawer isOpen onOpenChange={() => {}} title="Explain" size="md" resizeKey="test-foot-note" footer={foot}><Text>Body</Text></Drawer>, w, h);
    const f = await t.settle();
    expect(await footCut(t, w, h)).toEqual([]);
    const row = f.split('\n').find((l) => l.includes('[Close]')) ?? '';
    expect(row, f).toContain('Sends a new request');
    expect(row).toContain('Ask again');
    // The note wraps under its first line, beside the buttons: every word of it is drawn.
    expect(f).toContain('may use more of your AI');
    expect(f).toContain("helper's budget.");
    t.renderer.destroy();
  }
});

test('a page footer full screen: buttons that cannot share a row wrap, the last on top (web wrap-reverse)', async () => {
  const foot = (
    <>
      <Button variant="secondary" onPress={() => {}}>Cancel</Button>
      <Button variant="secondary" onPress={() => {}}>Stop tracking this payment</Button>
      <Button variant="secondary" onPress={() => {}}>Send the same request again</Button>
    </>
  );
  const t = await draw(<Drawer isOpen onOpenChange={() => {}} title="Payment" size="md" resizeKey="test-foot-three" footer={foot}><Text>Body</Text></Drawer>, 60, 20);
  const ls = (await t.settle()).split('\n');
  expect(await footCut(t, 60, 20)).toEqual([]);
  const last = ls.findIndex((l) => l.includes('[Send the same request again]'));
  const first = ls.findIndex((l) => l.includes('[Cancel]') && l.includes('[Stop tracking this payment]'));
  expect(last, ls.join('\n')).toBeGreaterThan(-1);
  expect(first).toBe(last + 1);
  t.renderer.destroy();
});

// billing's held top-up: Cancel, Stop tracking, Send again and Check again need 69 cells; an 80-column screen
// leaves a 60-column drawer 57. The row was one line there (wrapping only under 60 columns) and ran 12 cells past.
test('a page footer wider than narrow: buttons that cannot share a row still wrap, none is cut', async () => {
  const foot = (
    <>
      <Button variant="secondary" onPress={() => {}}>Cancel</Button>
      <Button variant="secondary" onPress={() => {}}>Stop tracking this payment</Button>
      <Button variant="secondary" onPress={() => {}}>Send the same request again</Button>
      <Button onPress={() => {}}>Check again</Button>
    </>
  );
  const t = await draw(<Drawer isOpen onOpenChange={() => {}} title="Add funds" size="sm" resizeKey="test-foot-four" footer={foot}><Text>Body</Text></Drawer>, 80, 24);
  const f = await t.settle();
  expect(await footCut(t, 80, 24), f).toEqual([]);
  for (const label of ['[Cancel]', '[Stop tracking this payment]', '[Send the same request again]', 'Check again']) expect(f, label).toContain(label);
  // Enough room: one row, as before.
  const t2 = await draw(<Drawer isOpen onOpenChange={() => {}} title="Add funds" size="lg" resizeKey="test-foot-four-lg" footer={foot}><Text>Body</Text></Drawer>, 140, 24);
  const row = (await t2.settle()).split('\n').find((l) => l.includes('[Cancel]')) ?? '';
  expect(row).toContain('Check again');
  t.renderer.destroy();
  t2.renderer.destroy();
});
