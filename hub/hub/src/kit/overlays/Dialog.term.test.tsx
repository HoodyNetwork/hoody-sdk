// Dialog, ConfirmDialog, DangerConfirm in the terminal.
//
// | # | Web behaviour (Dialog.tsx, React Aria modal) | Test |
// |---|---|---|
// | 1 | Closed: nothing drawn; open: title, body, Cancel + primary over the page | 'draws title, body and buttons' |
// | 2 | A confirm opens on Cancel, never on the action (Enter there cancels) | 'a confirm opens on Cancel' |
// | 3 | Tab reaches the action; Enter/Space presses it: onConfirm() with no arguments, once | 'the action fires once' |
// | 4 | Cancel / × / Esc / scrim: onOpenChange(false); refused while busy, Esc then says why | 'busy refuses every close' |
// | 5 | busy: Cancel disabled, primary shows busy and does not fire | 'busy refuses every close' |
// | 6 | outcome done closes (onOpenChange(false)); pending locks the primary and offers Check again | 'done closes, pending locks' |
// | 7 | Enter in a one-line text field presses the primary; never in a danger dialog | 'Enter in a field' |
// | 8 | DangerConfirm: the action arms only when the typed text matches (trimmed); opens on the field; reset on close | 'DangerConfirm arms' |
// | 9 | danger tone: a warning mark and the danger frame (reads without colour: "!" mark) | 'draws title, body and buttons' |
// | 10 | isDismissable=false: Esc and the scrim do nothing | 'not dismissable' |
// | 11 | consequences: one bulleted line each, in order | 'draws title, body and buttons' |
// | 8b | ConfirmDialog `typed` with a field the page drew (no autoFocus): opens on that field | 'a typed confirm whose page drew the field' |
// | 12 | Golden frames at 80x24 and 120x40 | 'golden' |
// | 13 | The body is a size container (container queries read the dialog body, not the viewport) | 'body is a pane' |
// | 15 | A dialog wider than the screen is clamped to it; its divider fills the clamped width and never wraps onto the next row | 'clamped: the divider never wraps' |
// | 14 | Squeezed for room, only the body gives way: the title, rule and buttons stay whole (survey: the rule drew under the body) | 'squeezed: only the body shrinks' |
// | 16 | An open option list in the dialog (Combobox, Select) takes Enter and Esc first: Enter picks, Esc closes the list | 'an open option list in a dialog' |
// | 17 | A paste reaches the focused field of any kind in the dialog (masked, multi-line, secret, OTP), never one behind it; a secret is not drawn | 'a paste reaches the focused' |
// | 18 | A pending outcome carries the page's recovery actions after Check again, then its note; no other outcome draws them | 'outcomeActions' |
// | 19 | A disabled primary that says why (primaryDisabledReason, confirmDisabledReason) stays a Tab stop, shows its reason while focused, never fires | 'a disabled primary that says why' |
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot, Text, usePaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { TextInput } from '../../term/prim';
import { ConfirmDialog, DangerConfirm, Dialog } from './Dialog';
import { Button } from '../controls/Button';
import type { OutcomeLike } from '../outcome';
import { Combobox, Select } from '../forms/more';
import { SecretInput } from '../forms/Secret';
import { OtpField } from '../forms/OtpField';
import { FieldInput } from '../../term/prim/FieldInput';

/** Esc waits for the key parser's lone-escape timeout. */
async function esc(t: { mockInput: { pressEscape(): void }; settle(): Promise<string> }): Promise<string> {
  t.mockInput.pressEscape();
  await new Promise((r) => setTimeout(r, 80));
  return t.settle();
}

type Calls = { confirm: number; open: boolean[] };

function ConfirmPage({ calls, busy, outcome, dismissable }: { calls: Calls; busy?: boolean; outcome?: OutcomeLike; dismissable?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Text>The page behind</Text>
      <ConfirmDialog
        isOpen={open}
        onOpenChange={(o) => { calls.open.push(o); setOpen(o); }}
        title="Delete schedule nightly-backup?"
        body="It stops running. Its run history is kept for 30 days."
        consequences={['The next run at 02:00 does not happen.', 'Runs in progress finish.']}
        tone="danger"
        confirmLabel="Delete"
        onConfirm={(...args: unknown[]) => { expect(args).toEqual([]); calls.confirm++; }}
        busy={busy}
        outcome={outcome}
        {...(dismissable === false ? { isDismissable: false } : {})}
      />
    </>
  );
}

const draw = (node: React.ReactNode, width = 80, height = 24) => drawTest(<FocusRoot><OverlayHost>{node}</OverlayHost></FocusRoot>, { width, height });

test('draws title, body, consequences and buttons; danger reads without colour', async () => {
  const calls: Calls = { confirm: 0, open: [] };
  const t = await draw(<ConfirmPage calls={calls} />);
  const f = await t.settle();
  expect(f).toContain('Delete schedule nightly-backup?');
  expect(f).toContain('It stops running.');
  expect(f).toMatch(/• The next run at 02:00 does not happen\.\s/);
  expect(f.indexOf('The next run')).toBeLessThan(f.indexOf('Runs in progress'));
  expect(f).toContain('[Cancel]');
  expect(f).toContain('[Delete]');
  expect(f).toMatch(/│\s*! Delete schedule/);
  expect(f).toContain('Esc ×');
  t.renderer.destroy();
});

test('a confirm opens on Cancel: Enter cancels, the action never fires', async () => {
  const calls: Calls = { confirm: 0, open: [] };
  const t = await draw(<ConfirmPage calls={calls} />);
  t.mockInput.pressEnter();
  const f = await t.settle();
  expect(calls).toEqual({ confirm: 0, open: [false] });
  expect(f).not.toContain('Delete schedule');
  t.renderer.destroy();
});

test('Tab reaches the action; Enter fires it once with no arguments', async () => {
  const calls: Calls = { confirm: 0, open: [] };
  const t = await draw(<ConfirmPage calls={calls} />);
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(calls.confirm).toBe(1);
  expect(calls.open).toEqual([]);
  t.renderer.destroy();
});

test('busy refuses every close and the action; Esc says why', async () => {
  const calls: Calls = { confirm: 0, open: [] };
  const t = await draw(<ConfirmPage calls={calls} busy />);
  let f = await t.settle();
  expect(f).toContain('… Delete');
  expect(f).not.toContain('Esc ×');
  f = await esc(t);
  expect(calls.open).toEqual([]);
  expect(f).toContain('Wait for the answer before closing');
  for (let i = 0; i < 4; i++) { t.mockInput.pressTab(); t.mockInput.pressEnter(); }
  await t.settle();
  expect(calls).toEqual({ confirm: 0, open: [] });
  await t.mockMouse.click(0, 0);
  await t.settle();
  expect(calls.open).toEqual([]);
  t.renderer.destroy();
});

test('done closes; pending locks the primary and offers Check again', async () => {
  const calls: Calls = { confirm: 0, open: [] };
  const t = await draw(<ConfirmPage calls={calls} outcome={{ kind: 'done' } as OutcomeLike} />);
  await t.settle();
  expect(calls.open).toEqual([false]);
  t.renderer.destroy();
  const c2: Calls = { confirm: 0, open: [] };
  const t2 = await draw(<ConfirmPage calls={c2} outcome={{ kind: 'pending' } as OutcomeLike} />);
  const f = await t2.settle();
  expect(f).toMatch(/may have gone through/i);
  for (let i = 0; i < 4; i++) { t2.mockInput.pressTab(); t2.mockInput.pressEnter(); await t2.settle(); }
  expect(c2.confirm).toBe(0);
  t2.renderer.destroy();
});

test('not dismissable: Esc and the scrim do nothing', async () => {
  const calls: Calls = { confirm: 0, open: [] };
  const t = await draw(<ConfirmPage calls={calls} dismissable={false} />);
  await esc(t);
  await t.mockMouse.click(0, 0);
  await t.settle();
  expect(calls.open).toEqual([]);
  t.renderer.destroy();
});

function RenamePage({ log, tone }: { log: string[]; tone?: 'danger' }) {
  const [name, setName] = useState('atlas');
  return (
    <Dialog isOpen onOpenChange={(o) => log.push(`open:${o}`)} title="Rename" tone={tone} primaryLabel="Rename" onPrimary={() => log.push(`rename:${name}`)} size="lg">
      <TextInput value={name} onChange={setName} />
    </Dialog>
  );
}

test('Enter in a one-line field presses the primary (an ordinary dialog opens on the field)', async () => {
  const log: string[] = [];
  const t = await draw(<RenamePage log={log} />);
  await t.mockInput.typeText('-2');
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['rename:atlas-2']);
  t.renderer.destroy();
  const log2: string[] = [];
  const t2 = await draw(<RenamePage log={log2} tone="danger" />);
  // a danger dialog opens on Cancel; even in the field Enter never confirms
  t2.mockInput.pressTab({ shift: true });
  t2.mockInput.pressTab({ shift: true });
  await t2.settle();
  t2.mockInput.pressEnter();
  await t2.settle();
  expect(log2.filter((l) => l.startsWith('rename'))).toEqual([]);
  t2.renderer.destroy();
});

function PastePage({ got }: { got: Record<string, string> }) {
  const [vals, setVals] = useState<Record<string, string>>({ mask: '', area: '', pem: '', otp: '' });
  const set = (k: string) => (x: string) => { got[k] = x; setVals((o) => ({ ...o, [k]: x })); };
  return (
    <>
      <TextInput value={vals.page ?? ''} onChange={set('page')} />
      <Dialog isOpen onOpenChange={() => {}} title="Add key" primaryLabel="Save" onPrimary={() => {}}>
        <FieldInput value={vals.mask!} onChange={set('mask')} mask />
        <FieldInput value={vals.area!} onChange={set('area')} lines={3} />
        <SecretInput label="PEM" multiline rows={2} value={vals.pem!} onChange={set('pem')} />
        <OtpField value={vals.otp!} onChange={set('otp')} />
      </Dialog>
    </>
  );
}

test('a paste reaches the focused masked, multi-line, secret and OTP field in a dialog; nothing behind it; no secret drawn', async () => {
  const got: Record<string, string> = {};
  const t = await draw(<PastePage got={got} />, 80, 30);
  // The dialog opens on its first field (the masked one); Tab walks the others.
  await t.mockInput.pasteBracketedText('hunter2');
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  await t.mockInput.pasteBracketedText('two\nlines');
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  await t.mockInput.pasteBracketedText('PEMA\r\nPEMB');
  await t.settle();
  // Past the secret's "Show what you typed" to the code.
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  await t.mockInput.pasteBracketedText('123456');
  const f = await t.settle();
  expect(got).toEqual({ mask: 'hunter2', area: 'two\nlines', pem: 'PEMA\r\nPEMB', otp: '123456' });
  expect(f).not.toContain('hunter2');
  expect(f).not.toContain('PEMA');
  t.renderer.destroy();
}, 30_000);

function PickPage({ log }: { log: string[] }) {
  const [open, setOpen] = useState(true);
  const [v, setV] = useState<string | undefined>();
  const [s, setS] = useState<string | undefined>();
  const opts = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Bravo' }, { value: 'c', label: 'Charlie' }];
  return (
    <Dialog isOpen={open} onOpenChange={(o) => { log.push(`open:${o}`); setOpen(o); }} title="Move computer" primaryLabel="Move" onPrimary={() => log.push(`move:${v}:${s}`)}>
      <Combobox label="Project" options={opts} value={v} onChange={(x) => { log.push(`combo:${x}`); setV(x); }} />
      <Select label="Region" options={opts} value={s} onChange={(x) => { log.push(`select:${x}`); setS(x); }} />
    </Dialog>
  );
}

test('an open option list in a dialog takes Enter and Esc before the dialog does (as on the web)', async () => {
  const log: string[] = [];
  const t = await draw(<PickPage log={log} />);
  // The dialog opens on the Combobox: typing opens its list; ↓ then Enter picks the highlighted option, not "Move".
  await t.mockInput.typeText('a');
  await t.settle();
  t.mockInput.pressArrow('down');
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['combo:b']);
  // Esc on an open list closes the list only; the dialog stays.
  t.mockInput.pressArrow('down');
  let f = await t.settle();
  expect(f).toContain('Charlie');
  f = await esc(t);
  expect(log).toEqual(['combo:b']);
  expect(f).toContain('Move computer');
  // The Select: Enter opens, ↓ Enter picks; the dialog's primary is not pressed.
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  t.mockInput.pressArrow('down');
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['combo:b', 'select:b']);
  // With no list open, Enter in the one-line field presses the primary again.
  t.mockInput.pressTab({ shift: true });
  await t.settle();
  t.mockInput.pressEscape();
  await new Promise((r) => setTimeout(r, 80));
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['combo:b', 'select:b', 'move:b:b']);
  t.renderer.destroy();
}, 30_000);

function DangerPage({ calls }: { calls: Calls }) {
  const [open, setOpen] = useState(true);
  return (
    <DangerConfirm isOpen={open} onOpenChange={(o) => { calls.open.push(o); setOpen(o); }} title="Delete computer atlas?" confirmText="atlas" confirmLabel="Delete computer" onConfirm={() => calls.confirm++} />
  );
}

test('DangerConfirm opens on its field and arms only on the exact text', async () => {
  const calls: Calls = { confirm: 0, open: [] };
  const t = await draw(<DangerPage calls={calls} />);
  let f = await t.settle();
  expect(f).toContain('Type atlas to confirm');
  await t.mockInput.typeText('atla');
  await t.settle();
  t.mockInput.pressEnter(); // Enter never confirms a danger dialog
  f = await t.settle();
  expect(calls).toEqual({ confirm: 0, open: [] });
  // still disarmed: Tab from the field skips the disabled action (Cancel, then round to the ×)
  await t.mockInput.typeText('s ');
  await t.settle();
  t.mockInput.pressTab();
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(calls.confirm).toBe(1);
  expect(calls.open).toEqual([]);
  t.renderer.destroy();
});

function TypedPage({ calls }: { calls: Calls }) {
  const [typed, setTyped] = useState('');
  return (
    <ConfirmDialog isOpen onOpenChange={(o) => calls.open.push(o)} title="Delete folder atlas?" tone="danger" typed confirmLabel="Delete" confirmDisabled={typed !== 'atlas'} onConfirm={() => calls.confirm++}>
      <TextInput value={typed} onChange={setTyped} />
    </ConfirmDialog>
  );
}

test('a typed confirm whose page drew the field opens on that field, not on Cancel', async () => {
  const calls: Calls = { confirm: 0, open: [] };
  const t = await draw(<TypedPage calls={calls} />);
  await t.settle();
  await t.mockInput.typeText('atlas');
  const f = await t.settle();
  expect(f).toContain('atlas'); // the typed name went into the field (on Cancel it was swallowed)
  t.mockInput.pressEnter(); // Enter in the field never confirms a danger dialog, and never cancels
  await t.settle();
  expect(calls).toEqual({ confirm: 0, open: [] });
  t.mockInput.pressTab(); // Cancel
  t.mockInput.pressTab(); // the armed action
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(calls.confirm).toBe(1);
  t.renderer.destroy();
});

test('golden: a danger confirm at 80x24 and 120x40', async () => {
  for (const [w, h] of [[80, 24], [120, 40]] as const) {
    const calls: Calls = { confirm: 0, open: [] };
    const t = await draw(<ConfirmPage calls={calls} />, w, h);
    const f = await t.settle();
    const lines = f.split('\n');
    const top = lines.findIndex((l) => l.includes('┌'));
    expect(top).toBe(Math.floor(h * 0.2));
    const row = lines[top]!;
    expect(row.indexOf('┌')).toBe(Math.floor((w - 60) / 2));
    expect(f).not.toMatch(/[╔╗╚╝║═]/);
    expect(f).toMatchSnapshot(`confirm-${w}x${h}`);
    t.renderer.destroy();
  }
});

function PaneProbe({ seen }: { seen: { cols: number; source: string }[] }) {
  const d = usePaneSize();
  seen.push({ cols: d.cols, source: d.source });
  return <Text>{`pane ${d.cols}`}</Text>;
}

test('body is a pane', async () => {
  const seen: { cols: number; source: string }[] = [];
  const t = await draw(<Dialog isOpen onOpenChange={() => {}} title="Sizes" primaryLabel="OK" onPrimary={() => {}}><PaneProbe seen={seen} /></Dialog>, 120, 40);
  await t.settle();
  const last = seen[seen.length - 1]!;
  expect(last.source).toBe('pane');
  expect(last.cols).toBeGreaterThan(0);
  expect(last.cols).toBeLessThan(120);
  t.renderer.destroy();
});

test('squeezed: only the body shrinks', async () => {
  const long = Array.from({ length: 30 }, (_, i) => `Line ${i + 1} of what happens.`).join(' ');
  const t = await drawTest(<FocusRoot><OverlayHost><ConfirmDialog isOpen onOpenChange={() => {}} title="End this session?" body={long} confirmLabel="End" onConfirm={() => {}} /></OverlayHost></FocusRoot>, { width: 80, height: 14 });
  await t.settle();
  const rows = (await t.settle()).split('\n');
  const title = rows.findIndex((r) => r.includes('End this session?'));
  expect(title).toBeGreaterThanOrEqual(0);
  expect(rows[title + 1]).toMatch(/─{20,}/);
  expect(rows.some((r) => /\[Cancel\]\s+\[?End\]?/.test(r))).toBe(true);
  t.renderer.destroy();
});

test('clamped: the divider never wraps', async () => {
  // xl is wider than 60 columns: the layer clamps the panel to the screen.
  const t = await drawTest(<FocusRoot><OverlayHost><Dialog isOpen onOpenChange={() => {}} title="Show the QR code" size="xl" primaryLabel="Done" onPrimary={() => {}}><Text>Body line</Text></Dialog></OverlayHost></FocusRoot>, { width: 60, height: 20 });
  const rows = (await t.settle()).split('\n');
  const title = rows.findIndex((r) => r.includes('Show the QR code'));
  expect(rows[title + 1]).toMatch(/─{40,}/);
  // The row after the divider carries no dash: nothing wrapped.
  expect(rows[title + 2]).not.toContain('─');
  // Every rule row stays inside the frame.
  for (const r of rows) expect(r.length).toBeLessThanOrEqual(60);
  t.renderer.destroy();
});

test('outcomeActions: on a pending outcome only, after Check again, with the note after them', async () => {
  const calls = { stop: 0 };
  const page = (outcome: OutcomeLike | undefined, note: string | null) => (
    <ConfirmDialog
      isOpen
      onOpenChange={() => undefined}
      title="End this session?"
      confirmLabel="End session"
      onConfirm={() => undefined}
      outcome={outcome}
      onCheck={async () => false}
      outcomeDetail="It may have ended."
      outcomeActions={({ detailId }) => { expect(detailId).toBeUndefined(); return <Button onPress={() => { calls.stop++; }}>Stop tracking</Button>; }}
      outcomeNote={note}
    />
  );
  let t = await draw(page({ kind: 'pending' }, 'Nothing was dismissed.'));
  let f = await t.settle();
  expect(f, f).toContain('It may have ended.');
  expect(f, f).toContain('Stop tracking]');
  expect(f.indexOf('Stop tracking]')).toBeGreaterThan(f.indexOf('Check again'));
  expect(f.indexOf('Nothing was dismissed.')).toBeGreaterThan(f.indexOf('Stop tracking]'));
  // The action is a tab stop of the dialog: Tab from Cancel reaches it, Enter presses it.
  for (let i = 0; i < 6 && calls.stop === 0; i++) { t.mockInput.pressTab(); await t.settle(); t.mockInput.pressEnter(); await t.settle(); }
  expect(calls.stop).toBeGreaterThan(0);
  t.renderer.destroy();
  t = await draw(page({ kind: 'failed' }, 'Nothing was dismissed.'));
  f = await t.settle();
  expect(f).not.toContain('Stop tracking]');
  expect(f).not.toContain('Nothing was dismissed.');
  t.renderer.destroy();
});

test('a disabled primary that says why stays a Tab stop, shows its reason while focused and never fires', async () => {
  const calls = { primary: 0, open: [] as boolean[] };
  const REASON = 'Name it first.';
  const cases = [
    <Dialog key="dialog" isOpen onOpenChange={(o) => { calls.open.push(o); }} title="New branch" primaryLabel="Create" primaryDisabled primaryDisabledReason={REASON} onPrimary={() => { calls.primary++; }} />,
    <ConfirmDialog key="confirm" isOpen onOpenChange={(o) => { calls.open.push(o); }} title="Restart atlas?" confirmLabel="Restart" confirmDisabled confirmDisabledReason={REASON} onConfirm={() => { calls.primary++; }} />,
  ];
  for (const node of cases) {
    const t = await draw(node);
    let f = await t.settle();
    expect(f, f).not.toContain(REASON);
    // Both open on Cancel. The reason shows only while the primary has the focus, so seeing it proves Tab reached it
    // (a primary disabled with no reason is skipped by Tab).
    for (let i = 0; i < 3 && !f.includes(REASON); i++) { t.mockInput.pressTab(); f = await t.settle(); }
    expect(f, f).toContain(REASON);
    t.mockInput.pressEnter();
    await t.settle();
    expect(calls).toEqual({ primary: 0, open: [] });
    t.renderer.destroy();
  }
});
