// Secret.term: the web component's observable behaviours, each held here.
// SecretField
//  - masked until Show: the frame holds bullets and "Hidden until you press Show", never the value; visiblePrefix stays shown
//  - s / Enter shows and hides (the word flips Show/Hide); c copies without Show; onCopy() called with no argument
//  - "Copied" after a good copy; a refused copy keeps "Copy failed" in the note line
//  - the "once" note under it; the "I saved it" tick (confirm) calls onChange(next)
//  - format lines: one masked item per line, "Show codes", "Copy codes" copies the items joined by LF, "N codes" count
//  - a resetKey change wipes: "It is no longer shown here.", onWipe() once, the value gone from the frame
//  - load (onRead): unread box "Not read yet"; s calls onRead; c calls onReadCopy; emptyText shows instead of buttons
// SecretInput
//  - typing is masked (bullets); [Show] reveals, [Hide] masks; onChange(value) per edit
//  - a resetKey change clears it: onChange(''); undo and redo afterwards bring nothing typed back, nor after the page
//    empties the value itself
//  - multiline: masked lines show bullets with line ends; a paste keeps CR LF byte for byte; Backspace removes one char
//  - focusOnError: the field takes the focus when its error appears, and only with the option
// copyWhenRead: null text = { wrote: false, reason: 'none' }; text = { wrote: true } and the clipboard took it
//  - bound to the mount live at the call: a text read after that mount ended is refused, never copied through the
//    next mount; a screen that refuses copies reads nothing; a text secretCopyText would change is refused
import { expect, test } from 'bun:test';
import { useState, type ReactNode } from 'react';
import { copiesOf, drawTest, inputHeld, testRender, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, Text } from '../../term/prim';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import { Form, FormFooter } from './Form';
import { SecretField, SecretInput, copyWhenRead } from './Secret';

const W = { width: 80, height: 16 };
const KEY = 'hk_3f9a_SUPERSECRETVALUE42';

test('SecretField: masked until s, prefix shown, s hides again', async () => {
  const t = await drawTest(<FocusRoot><SecretField label="API key" value={KEY} visiblePrefix={7} /></FocusRoot>, W);
  let f = t.captureCharFrame();
  expect(f).toContain('API key');
  expect(f).toContain('hk_3f9a');
  expect(f).not.toContain('SUPERSECRET');
  expect(f).toContain('Hidden until you press Show');
  expect(f).toContain("Copy it now: it won't be shown again.");
  expect(f).toContain('[Show]');
  t.mockInput.pressTab();
  await t.mockInput.typeText('s');
  f = await t.settle();
  expect(f).toContain(KEY);
  expect(f).toContain('[Hide]');
  // The key hint follows the state: revealed says "s hide", never "s show".
  expect(f).toContain('s hide');
  expect(f).not.toContain('s show');
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(f).not.toContain('SUPERSECRET');
  t.renderer.destroy();
});

test('SecretField: c copies without Show; onCopy has no argument', async () => {
  const calls: unknown[][] = [];
  const t = await drawTest(<FocusRoot><SecretField label="Key" value={KEY} onCopy={(...a: unknown[]) => calls.push(a)} /></FocusRoot>, W);
  const copied = copiesOf(t.renderer);
  t.mockInput.pressTab();
  await t.mockInput.typeText('c');
  const f = await t.settle();
  expect(copied.at(-1)).toBe(KEY);
  expect(calls).toEqual([[]]);
  expect(f).not.toContain('SUPERSECRET');
  // No terminal took the OSC 52 write in the test renderer, or it did: either answer is drawn.
  expect(/Copied|Couldn't copy/.test(f)).toBe(true);
  t.renderer.destroy();
});

test('SecretField lines: masked items, Show codes, Copy codes joins by LF, count, confirm tick', async () => {
  const got: boolean[] = [];
  function P() {
    const [ok, setOk] = useState(false);
    return <FocusRoot><SecretField label="Backup codes" format="lines" value={'aaaa-1111\nbbbb-2222\n\ncccc-3333'} confirm={{ checked: ok, onChange: (v) => { got.push(v); setOk(v); } }} /></FocusRoot>;
  }
  const t = await drawTest(<P />, { width: 80, height: 20 });
  const copied = copiesOf(t.renderer);
  let f = t.captureCharFrame();
  expect(f).not.toContain('aaaa-1111');
  expect(f).toContain('••••••••');
  expect(f).toContain('[Show codes]');
  expect(f).toContain('3 codes');
  expect(f).toContain('[ ] I saved them');
  t.mockInput.pressTab();
  await t.mockInput.typeText('c');
  await t.settle();
  expect(copied.at(-1)).toBe('aaaa-1111\nbbbb-2222\ncccc-3333');
  await t.mockInput.typeText('s');
  f = await t.settle();
  expect(f).toContain('bbbb-2222');
  expect(f).toContain('[Hide codes]');
  t.mockInput.pressTab();
  t.mockInput.pressKey(' ');
  f = await t.settle();
  expect(got).toEqual([true]);
  expect(f).toContain('[x] I saved them');
  t.renderer.destroy();
});

test('SecretField: a resetKey change wipes it and tells the page once', async () => {
  let wipes = 0;
  let setK: (k: number) => void = () => {};
  function P() {
    const [k, sk] = useState(1);
    setK = sk;
    return <FocusRoot><SecretField label="Key" value={KEY} resetKey={k} onWipe={() => { wipes++; }} /></FocusRoot>;
  }
  const t = await drawTest(<P />, W);
  t.mockInput.pressTab();
  await t.mockInput.typeText('s');
  expect(await t.settle()).toContain(KEY);
  setK(2);
  let f = await t.settle();
  await new Promise((r) => setTimeout(r, 10));
  f = await t.settle();
  expect(f).toContain('It is no longer shown here.');
  expect(f).not.toContain('SUPERSECRET');
  expect(wipes).toBe(1);
  t.renderer.destroy();
});

test('SecretField load: unread box, s reads, c reads-and-copies, emptyText', async () => {
  const seen: string[] = [];
  const t = await drawTest(
    <FocusRoot>
      <SecretField label="Entry" onRead={() => seen.push('read')} onReadCopy={async () => { seen.push('copy'); return { wrote: true }; }} once={false} />
      <SecretField label="Empty" onRead={() => {}} emptyText="No value stored." once={false} />
    </FocusRoot>, W);
  let f = t.captureCharFrame();
  expect(f).toContain('(Not read yet)');
  expect(f).toContain('No value stored.');
  t.mockInput.pressTab();
  await t.mockInput.typeText('s');
  await t.mockInput.typeText('c');
  f = await t.settle();
  await new Promise((r) => setTimeout(r, 10));
  f = await t.settle();
  expect(seen).toEqual(['read', 'copy']);
  expect(f).toContain('Copied');
  t.renderer.destroy();
});

test('SecretInput: masked typing, Show reveals, resetKey clears', async () => {
  const got: string[] = [];
  let setK: (k: number) => void = () => {};
  function P() {
    const [v, setV] = useState('');
    const [k, sk] = useState(1);
    setK = sk;
    return <FocusRoot><SecretInput label="Token" value={v} resetKey={k} onChange={(x) => { got.push(x); setV(x); }} autoFocus /></FocusRoot>;
  }
  const t = await drawTest(<P />, W);
  await t.mockInput.typeText('tok3n');
  let f = await t.settle();
  expect(f).not.toContain('tok3n');
  expect(f).toContain('•••••');
  expect(got.at(-1)).toBe('tok3n');
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(f).toContain('tok3n');
  expect(f).toContain('Hide');
  setK(2);
  f = await t.settle();
  expect(got.at(-1)).toBe('');
  expect(f).not.toContain('tok3n');
  t.renderer.destroy();
});

/** The kit SecretInput under the keyboard protocol that tells Ctrl+- (undo) and Ctrl+. (redo) apart. */
async function kittyDraw(node: ReactNode): Promise<TestTerm> {
  const t = await testRender(node, { ...W, kittyKeyboard: true }) as TestTerm;
  t.settle = async () => {
    let last = '';
    for (let same = 0, i = 0; same < 3 && i < 100; i++) {
      await t.renderOnce();
      const f = t.captureCharFrame();
      same = f === last && !inputHeld(t.renderer) ? same + 1 : 0;
      last = f;
      await new Promise((r) => setTimeout(r, 5));
    }
    return last;
  };
  await t.settle();
  return t;
}

for (const how of ['resetKey', 'the page clears the value'] as const) {
  test(`SecretInput: after ${how}, undo and redo (shown working just before) bring nothing typed back`, async () => {
    const got: string[] = [];
    let wipe: () => void = () => {};
    function P() {
      const [v, setV] = useState('');
      const [k, sk] = useState(1);
      wipe = how === 'resetKey' ? () => sk(2) : () => setV('');
      return <FocusRoot><SecretInput label="Token" value={v} resetKey={k} onChange={(x) => { got.push(x); setV(x); }} autoFocus /></FocusRoot>;
    }
    const t = await kittyDraw(<P />);
    const undo = async () => { t.mockInput.pressKey('-', { ctrl: true }); await t.settle(); };
    const redo = async () => { t.mockInput.pressKey('.', { ctrl: true }); await t.settle(); };
    await t.mockInput.typeText('tok3n');
    await t.settle();
    t.mockInput.pressBackspace();
    await t.settle();
    expect(got.at(-1)).toBe('tok3');
    await undo();
    expect(got.at(-1)).toBe('tok3n');
    await redo();
    expect(got.at(-1)).toBe('tok3');
    // The redo stack holds the shorter value when the wipe comes.
    await undo();
    expect(got.at(-1)).toBe('tok3n');
    wipe();
    await t.settle();
    const before = got.length;
    await redo();
    await undo();
    await undo();
    await redo();
    const f = await t.settle();
    expect(got.slice(before).filter((x) => x !== '')).toEqual([]);
    expect(f).not.toContain('•');
    t.renderer.destroy();
  }, 30_000);
}

test('SecretInput multiline: bullets and line ends masked; paste keeps CR LF; Backspace', async () => {
  const got: string[] = [];
  function P() {
    const [v, setV] = useState('');
    return <FocusRoot><SecretInput label="PEM" multiline rows={3} value={v} onChange={(x) => { got.push(x); setV(x); }} autoFocus /></FocusRoot>;
  }
  const t = await drawTest(<P />, W);
  expect(t.captureCharFrame()).toContain('Type or paste');
  await t.mockInput.pasteBracketedText('AB\r\nCD');
  let f = await t.settle();
  expect(got.at(-1)).toBe('AB\r\nCD');
  expect(f).not.toContain('AB');
  expect(f).toContain('••');
  t.mockInput.pressBackspace();
  await t.settle();
  expect(got.at(-1)).toBe('AB\r\nC');
  await t.mockInput.typeText('x');
  f = await t.settle();
  expect(got.at(-1)).toBe('AB\r\nCx');
  expect(f).not.toContain('Cx');
  t.renderer.destroy();
});

for (const on of [true, false]) {
  test(`SecretInput focusOnError ${on ? 'on' : 'off'}: an error that appears ${on ? 'moves the focus into the field' : 'leaves the focus where it was'}`, async () => {
    const got: string[] = [];
    let fail: () => void = () => {};
    function P() {
      const [err, setErr] = useState<string | undefined>();
      const [v, setV] = useState('');
      fail = () => setErr('Wrong password.');
      return (
        <FocusRoot>
          <SecretInput label="First" value="" onChange={() => { got.push('first field'); }} autoFocus />
          <SecretInput label="Password" value={v} onChange={(x) => { got.push(x); setV(x); }} errorMessage={err} focusOnError={on} />
        </FocusRoot>
      );
    }
    const t = await drawTest(<P />, W);
    fail();
    expect(await t.settle()).toContain('Wrong password.');
    // The next key goes to whichever field holds the focus.
    await t.mockInput.typeText('k');
    await t.settle();
    expect(got).toEqual(on ? ['k'] : ['first field']);
    t.renderer.destroy();
  });
}

// A send: the footer's busy locks the field and drops its focus; the refusal arrives in the render that ends busy,
// while the lock the footer reports still holds for one more effect. Focus waits for the unlock, and only takes the
// field back when nothing else holds the focus by then (the person moved on: no steal).
for (const moved of [false, true]) {
  test(`SecretInput focusOnError after a send: ${moved ? 'the person moved focus during the lock; it stays there' : 'focus is back in the field once it unlocks'}`, async () => {
    const got: string[] = [];
    let step: (busy: boolean, err?: string) => void = () => {};
    function P() {
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState<string | undefined>();
      const [v, setV] = useState('');
      step = (b, e) => { setBusy(b); setErr(e); };
      return (
        <FocusRoot>
          {/* Outside the form: the send's lock does not take it. */}
          <SecretInput label="Elsewhere" value="" onChange={() => { got.push('elsewhere'); }} />
          <Form onSubmit={() => undefined}>
            <SecretInput label="API key" value={v} onChange={(x) => { got.push(x); setV(x); }} errorMessage={err} focusOnError autoFocus />
            <FormFooter dirty={false} busy={busy} submitLabel="Save" />
          </Form>
        </FocusRoot>
      );
    }
    const t = await drawTest(<P />, { width: 80, height: 24 });
    step(true);
    await t.settle();
    if (moved) {
      // Tab until the field outside the form holds the focus (the person's own move during the lock).
      const where = () => focusedNode(semanticsOf({ root: t.renderer.root, stdin: (t.renderer as unknown as { stdin?: unknown }).stdin } as never) as never)?.name;
      for (let i = 0; i < 6 && where() !== 'Elsewhere'; i++) { t.mockInput.pressTab(); await t.settle(); }
      expect(where()).toBe('Elsewhere');
    }
    step(false, 'Not accepted.');
    const f = await t.settle();
    expect(f).toContain('Not accepted.');
    await t.mockInput.typeText('k');
    await t.settle();
    expect(got).toEqual(moved ? ['elsewhere'] : ['k']);
    t.renderer.destroy();
  });
}

/** What a test renderer is asked to copy, with the terminal answering "asked" (copiesOf passes the write on to the test
 *  renderer, whose own answer is not ours to rely on). */
function takenCopies(renderer: unknown): string[] {
  const r = renderer as { copyToClipboardOSC52(text: string): boolean };
  const sent: string[] = [];
  r.copyToClipboardOSC52 = (text: string) => { sent.push(text); return true; };
  return sent;
}

test('copyWhenRead: the text goes through the mount of the press; nothing to copy is none', async () => {
  const t = await drawTest(<FocusRoot><Text>host</Text></FocusRoot>, W);
  const copied = takenCopies(t.renderer);
  expect(await copyWhenRead(async () => null)).toEqual({ wrote: false, reason: 'none' });
  expect(await copyWhenRead(async () => 'v1', () => false)).toEqual({ wrote: false, reason: 'none' });
  expect(await copyWhenRead(() => Promise.reject(new Error('read failed')))).toEqual({ wrote: false, reason: 'none' });
  expect(copied).toEqual([]);
  expect(await copyWhenRead(async () => 'v2\nline two', () => true)).toEqual({ wrote: true });
  expect(copied).toEqual(['v2\nline two']);
  // Only what secretCopyText leaves unchanged, as SecretField's own Copy: a control character is never cleaned away.
  expect(await copyWhenRead(async () => 'v\u0007x')).toEqual({ wrote: false, reason: 'refused' });
  expect(copied).toEqual(['v2\nline two']);
  t.renderer.destroy();
});

test('copyWhenRead: a read that finishes after its mount ended copies nothing, not through the next mount', async () => {
  let end: () => void = () => {};
  function A() {
    const [on, setOn] = useState(true);
    end = () => setOn(false);
    return on ? <FocusRoot><Text>A</Text></FocusRoot> : <Text>ended</Text>;
  }
  const ta = await drawTest(<A />, W);
  const sentA = takenCopies(ta.renderer);
  let release: (v: string) => void = () => {};
  const late = copyWhenRead(() => new Promise<string | null>((r) => { release = r; }));
  end();
  await ta.settle();
  const tb = await drawTest(<FocusRoot><Text>B</Text></FocusRoot>, W);
  const sentB = takenCopies(tb.renderer);
  release('late from A');
  expect(await late).toEqual({ wrote: false, reason: 'refused' });
  expect(sentA).toEqual([]);
  expect(sentB).toEqual([]);
  // A press under B copies through B.
  expect(await copyWhenRead(async () => 'in B')).toEqual({ wrote: true });
  expect(sentB).toEqual(['in B']);
  ta.renderer.destroy();
  tb.renderer.destroy();
});

test('copyWhenRead: a mount whose screen refuses copies reads nothing and copies nothing', async () => {
  // `bare`: no secret-screen provider, so the screen says no (secret-screen-ctx DENY_ALL).
  const t = await drawTest(<FocusRoot><Text>bare</Text></FocusRoot>, W, { bare: true });
  const copied = takenCopies(t.renderer);
  let reads = 0;
  expect(await copyWhenRead(async () => { reads++; return 'v3'; })).toEqual({ wrote: false, reason: 'refused' });
  expect(reads).toBe(0);
  expect(copied).toEqual([]);
  t.renderer.destroy();
});

// The web masks a revealed value on visibilitychange; the terminal does it when the terminal loses focus (focus
// reporting: the renderer's "blur", ESC[O).
test('SecretField and SecretInput mask again when the terminal loses focus', async () => {
  const t = await drawTest(<FocusRoot><SecretField label="API key" value={KEY} visiblePrefix={7} /></FocusRoot>, W);
  t.mockInput.pressTab();
  await t.mockInput.typeText('s');
  expect(await t.settle()).toContain(KEY);
  (t.renderer as unknown as { emit(e: string): void }).emit('blur');
  const f = await t.settle();
  expect(f).not.toContain('SUPERSECRET');
  expect(f).toContain('[Show]');
  t.renderer.destroy();

  const u = await drawTest(<FocusRoot><SecretInput label="Token" value="tok3n" onChange={() => {}} /></FocusRoot>, W);
  u.mockInput.pressTab();
  u.mockInput.pressTab();
  u.mockInput.pressEnter();
  expect(await u.settle()).toContain('tok3n');
  (u.renderer as unknown as { emit(e: string): void }).emit('blur');
  expect(await u.settle()).not.toContain('tok3n');
  u.renderer.destroy();
});

test('SecretField dropOnHide: terminal blur drops the value', async () => {
  let wiped = 0;
  const t = await drawTest(<FocusRoot><SecretField label="API key" value={KEY} dropOnHide onWipe={() => { wiped++; }} /></FocusRoot>, W);
  t.mockInput.pressTab();
  await t.mockInput.typeText('s');
  expect(await t.settle()).toContain(KEY);
  (t.renderer as unknown as { emit(e: string): void }).emit('blur');
  const f = await t.settle();
  expect(f).not.toContain('SUPERSECRET');
  expect(wiped).toBe(1);
  t.renderer.destroy();
});

// A copy shortcut on a hidden secret never reaches the clipboard, the field's own key hook or the app's
// shortcuts (prim SecretInput, the compat <input type="password">; and the kit SecretInput).
test('copy keys on a secret field are taken and dropped: no clipboard, no onKey, no shortcut', async () => {
  const { SecretInput: PrimSecret } = await import('../../term/prim/SecretInput');
  const { useKeys } = await import('../../term/prim');
  const seen: string[] = [];
  const shortcuts: string[] = [];
  function Spy() { useKeys((k) => { if (k.ctrl || k.meta) shortcuts.push(k.name ?? ''); return false; }); return null; }
  function P() {
    const [v, setV] = useState('');
    return <FocusRoot><Spy /><PrimSecret value={v} onChange={setV} autoFocus onKey={(k) => { if (k.ctrl || k.meta) seen.push(k.name ?? ''); return false; }} /></FocusRoot>;
  }
  const t = await drawTest(<P />, W);
  // The app runs with exitOnCtrlC: false (app/run.ts); the headless renderer defaults to true.
  (t.renderer as unknown as { exitOnCtrlC: boolean }).exitOnCtrlC = false;
  const copied = copiesOf(t.renderer);
  await t.mockInput.typeText('hunter2');
  await t.settle();
  t.mockInput.pressKey('a', { ctrl: true });
  t.mockInput.pressKey('c', { ctrl: true });
  t.mockInput.pressKey('x', { ctrl: true });
  t.mockInput.pressKey('c', { meta: true });
  const f = await t.settle();
  expect(copied).toEqual([]);
  expect(seen.filter((n) => n === 'c' || n === 'x')).toEqual([]);
  expect(shortcuts.filter((n) => n === 'c' || n === 'x')).toEqual([]);
  expect(f).not.toContain('hunter2');
  t.renderer.destroy();

  function K() {
    const [v, setV] = useState('');
    return <FocusRoot><Spy /><SecretInput label="Token" value={v} onChange={setV} autoFocus /></FocusRoot>;
  }
  shortcuts.length = 0;
  const u = await drawTest(<K />, W);
  (u.renderer as unknown as { exitOnCtrlC: boolean }).exitOnCtrlC = false;
  const copied2 = copiesOf(u.renderer);
  await u.mockInput.typeText('hunter2');
  u.mockInput.pressKey('a', { ctrl: true });
  u.mockInput.pressKey('c', { ctrl: true });
  u.mockInput.pressKey('x', { ctrl: true });
  await u.settle();
  expect(copied2).toEqual([]);
  expect(shortcuts.filter((n) => n === 'c' || n === 'x')).toEqual([]);
  u.renderer.destroy();

  function M() {
    const [v, setV] = useState('');
    return <FocusRoot><Spy /><SecretInput label="Key" multiline rows={3} value={v} onChange={setV} autoFocus /></FocusRoot>;
  }
  shortcuts.length = 0;
  const m = await drawTest(<M />, W);
  (m.renderer as unknown as { exitOnCtrlC: boolean }).exitOnCtrlC = false;
  const copied3 = copiesOf(m.renderer);
  await m.mockInput.typeText('hunter2');
  m.mockInput.pressKey('c', { ctrl: true });
  m.mockInput.pressKey('x', { meta: true });
  await m.settle();
  expect(copied3).toEqual([]);
  expect(shortcuts.filter((n) => n === 'c' || n === 'x')).toEqual([]);
  m.renderer.destroy();
});
