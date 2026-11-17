// Secrets in the terminal (security tier). A secret is in a drawn frame only after Show: masked, the frame holds bullets
// (or "Hidden until you press Show"), never the value. The rules (holding, wiping, the multiline view/edit mapping) are the
// web's: Secret.pure.ts, wipe.ts, core's HeldSecret.
//
// SecretField: one Tab stop on the value box; s, Enter or Space shows/hides, c copies (OSC 52, through Ids' useBoundCopyText,
// bound to this field's mount); with copyPrimary, c also copies from the rest of its layer when the focused control
// does not take it;
// the [Show] and [Copy] words also take a click. Copies go through prim's one copy seam (FocusRoot mounts its host). SecretInput: masked entry (prim FieldInput `mask`) with a [Show] toggle;
// multiline, a masked editor drawn here (typing, Enter, Backspace/Delete, arrows, bracketed paste with its line ends).
//
// What the screen allows is asked at every Show and every Copy press (term/app/secret-screen-ctx.ts; no provider = never):
// a refused Show stays masked and a refused Copy writes nothing, each told on the note line, and a `load` field reads
// nothing when refused. Copy writes only what secretCopyText leaves unchanged. A shown value hides again after
// REVEAL_IDLE_MS with no key press (RevealIdle).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type * as Web from './Secret';
import { holdSecret, hostEnv, isLocked, onLockChange, useSecret, type HeldSecret } from '@core';
import { Box, Pressable, Text, captureCopy, useFocusable, useFocusControl, useKeys, isPressKey, useTerminalBlur } from '../../term/prim';
import { focusInk } from '../../term/prim/FocusInk';
import { mergeRefs, textOf, useSem, type Sem } from '../../term/prim/semantics';
import { FieldInput, type FieldHandle } from '../../term/prim/FieldInput';
import { usePasteText } from '../../term/prim/FieldPaste';
import { boundaries, cellWidth } from '../../term/prim/Caret';
import { useRenderer } from '../../term/prim/engine';
import { RevealIdle, secretCopyText } from '../../term/app/secret-screen';
import { revealIdleMs, useSecretScreen } from '../../term/app/secret-screen-ctx';
import { Button } from '../controls/Button';
import { SegmentedControl } from '../controls/SegmentedControl';
import { useCopy } from '../data/Ids';
import { useBoundCopyText } from '../data/termCopyText';
import { jsonView } from '../data/highlight';
import { useStrings } from '../strings';
import { Checkbox } from './fields';
import strings from './forms.strings.en.json';
import { useFieldLock } from './lock';
import { ITEM_MASK, bullets, localHold, secretSplice, secretView, useDropOnUnmount } from './Secret.pure';
import { FIELD_CELLS, ControlRow, FieldFrame, useTermForm, useValidation } from './termField';
import ts from './term.strings.en.json';
import { safeCapture, useWipeOn } from './wipe';
import { useNeutralWindowTitle } from '../windowTitle';

/**
 * Copy shortcuts (Ctrl/Cmd+C, Ctrl/Cmd+X, Ctrl/Cmd+Insert) on a HIDDEN secret are taken and dropped, as prim
 * SecretInput does and as the web's password input refuses copy: they reach neither the clipboard nor an app shortcut.
 */
const copyKey = (k: { name?: string; ctrl?: boolean; meta?: boolean; super?: boolean }): boolean =>
  (k.name === 'c' || k.name === 'x' || k.name === 'insert') && (k.ctrl === true || k.meta === true || k.super === true);

export type { SecretConfirm, CopyAttempt, SecretFieldProps, SecretInputProps } from './Secret';
export { secretView, secretSplice, secretEdit } from './Secret.pure';
export { useWipeOn };

/** Copy a text still being read (the web's module-level API), called inside the press (the vault's Copy value and Open
 *  and copy). There is no unbound copy (a write when the read finishes would reach whichever terminal is current
 *  then, even after this mount ended): the press's mount is captured here, before the read, and the text goes only
 *  through it, only while it is still mounted. As SecretField's own Copy: the screen is asked (at the press and again at
 *  the write), and only what secretCopyText leaves unchanged is written; a refusal at the press reads nothing. */
export const copyWhenRead: typeof Web.copyWhenRead = (text, handoff) => {
  const to = captureCopy();
  if (!to || !to.screen().copy) return Promise.resolve<Web.CopyAttempt>({ wrote: false, reason: 'refused' });
  return text().then(
    (v): Web.CopyAttempt => {
      if (v === null || (handoff && !handoff())) return { wrote: false, reason: 'none' };
      const c = to.screen().copy ? secretCopyText(v) : null;
      return c !== null && to.copy(c) ? { wrote: true } : { wrote: false, reason: 'refused' };
    },
    (): Web.CopyAttempt => ({ wrote: false, reason: 'none' }),
  );
};

/** The terminal going to the background: `fn` runs when the terminal loses focus (focus reporting, the web's
 *  visibilitychange) and when the host reports itself hidden. */
function useOnHidden(fn: () => void): void {
  const latest = useRef(fn);
  latest.current = fn;
  useTerminalBlur(() => latest.current());
  useEffect(() => {
    let off: (() => void) | undefined;
    try {
      off = hostEnv().onVisibilityChange(() => {
        let visible = true;
        try { visible = hostEnv().visible(); } catch { visible = true; }
        if (!visible) latest.current();
      });
    } catch { off = undefined; }
    return () => off?.();
  }, []);
}

/** The passcode lock engaging is a wipe here (the terminal draws the lock over a page that stays mounted): `fn` runs
 *  each time the app locks. */
function useWipeOnLock(fn: () => void, enabled = true): void {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let was = isLocked();
    return onLockChange(() => {
      const now = isLocked();
      if (now && !was) latest.current();
      was = now;
    });
  }, [enabled]);
}

/** Every key press and paste on this renderer while `on`, seen before any handler takes it. */
function useAnyKey(on: boolean, fn: () => void): void {
  const renderer = useRenderer();
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (!on) return;
    const input = renderer.keyInput;
    const seen = (): void => latest.current();
    input.prependListener('keypress', seen);
    input.prependListener('paste', seen);
    return () => { input.off('keypress', seen); input.off('paste', seen); };
  }, [on, renderer]);
}

/** One field's idle clock: while `shown`, no key press for revealIdleMs() calls `hide`. */
function useRevealIdle(shown: boolean, hide: () => void): void {
  // While a value is shown the terminal's window title is the fixed neutral one (term/shell/windowTitle.tsx).
  useNeutralWindowTitle(shown);
  const latest = useRef(hide);
  latest.current = hide;
  const idle = useRef<RevealIdle | null>(null);
  idle.current ??= new RevealIdle(() => latest.current(), revealIdleMs());
  useEffect(() => {
    if (shown) idle.current!.shown();
    else idle.current!.hidden();
  }, [shown]);
  useEffect(() => () => idle.current?.hidden(), []);
  useAnyKey(shown, () => idle.current?.touch());
}

/** The web's useRevealGuard with the field's terminal rules: `hide` runs when the terminal loses focus or the host
 *  reports itself hidden, and after revealIdleMs() with no key press while `shown`. */
export const useRevealGuard: typeof Web.useRevealGuard = (shown, hide) => {
  useOnHidden(() => { if (shown) hide(); });
  useRevealIdle(shown, hide);
};

type Refusal = 'revealRefused' | 'copyRefused' | 'copyValueRefused';

/** A button word (the web's icon buttons): out of the Tab order, since the value box's keys (s, c) are the keyboard
 *  way, but a click or focus() reaches it, and it carries the web button's name and pressed state. */
function Act({ label, onPress, off, strong, pressed }: { label: string; onPress: () => void; off?: boolean; strong?: boolean; pressed?: boolean }) {
  return (
    <Pressable shrink={0} tabStop={false} disabled={off} onPress={onPress} sem={{ name: label, pressed }}>
      {({ focused }) => <Text colour={off ? 'faint' : strong ? 'accInk' : 'ink'} bg={strong && !off ? 'acc' : undefined} dim={off} {...focusInk(focused)}>[{label}]</Text>}
    </Pressable>
  );
}

export const SecretField: typeof Web.SecretField = ({
  label, held: heldProp, ctx, value, format = 'single', visiblePrefix = 0, description, once = true, confirm, copyPrimary, onCopy, onWipe, resetKey,
  goneText, onRead, onReadCopy, isReading, isReadDisabled, dropOnHide, emptyText, json, showLabel, hideLabel, copyLabel, readingLabel, maskKey,
}) => {
  const load = onRead
    ? { reading: !!isReading, disabled: isReadDisabled, onShow: onRead, onCopy: onReadCopy ?? (async (): Promise<Web.CopyAttempt> => ({ wrote: false, reason: 'none' })) }
    : undefined;
  const t = useStrings(strings);
  const tt = useStrings(ts);
  const own = useMemo(() => {
    if (heldProp !== undefined || !value) return null;
    const c = safeCapture();
    return c ? holdSecret(value, c) : localHold(value);
  }, [heldProp, value]);
  const held = heldProp !== undefined ? heldProp : own;
  const secret = useSecret(held, ctx ?? held?.ctx);
  const ask = useSecretScreen();
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [shownFor, setShownFor] = useState<HeldSecret | null>(null);
  // A `load` field shows what it read as it arrives: that arrival is a reveal, asked like a Show press.
  const [arrived, setArrived] = useState<HeldSecret | null | undefined>(undefined);
  if (load && held !== arrived) {
    setArrived(held);
    const ok = !!held && ask().reveal;
    setShownFor(ok ? held : null);
    setRefusal(held && !ok ? 'revealRefused' : null);
  } else if (!load && held !== arrived) {
    setArrived(held);
    setRefusal(null);
  }
  // A `maskKey` change masks again during this render, so no frame draws the value shown. Boxed: React would call a
  // bare function as an initializer or updater instead of storing it as the key. After the arrival above: a value
  // that arrives with the change stays masked.
  const [maskSeen, setMaskSeen] = useState<{ key: unknown }>(() => ({ key: maskKey }));
  if (!Object.is(maskSeen.key, maskKey)) {
    setMaskSeen({ key: maskKey });
    setShownFor(null);
  }
  const shown = shownFor !== null && shownFor === held;
  const heldNow = useRef(held);
  heldNow.current = held;
  const hide = (): void => {
    if (dropOnHide) heldNow.current?.drop();
    setShownFor(null);
  };
  const mayReveal = (): boolean => {
    const ok = ask().reveal;
    setRefusal(ok ? null : 'revealRefused');
    return ok;
  };
  /** The text a Copy may write now, or null with the reason on the note line. */
  const mayCopy = (text: string | null): string | null => {
    if (!ask().copy) { setRefusal('copyRefused'); return null; }
    const c = text === null ? null : secretCopyText(text);
    setRefusal(c === null ? 'copyValueRefused' : null);
    return c;
  };
  const toggleShown = (): void => { if (shown) hide(); else if (mayReveal()) setShownFor(held); };
  const readShow = (): void => { if (mayReveal()) load!.onShow(); };
  const readCopy = (): void => { if (ask().copy) { setRefusal(null); tryCopy(load!.onCopy); } else setRefusal('copyRefused'); };
  const [wiped, setWiped] = useState(false);
  const [copied, copy] = useCopy();
  const putText = useBoundCopyText();
  const copiedFor = useRef<HeldSecret | null>(null);
  const [failedFor, setFailedFor] = useState<HeldSecret | null>(null);
  useEffect(() => {
    if (copied === 'failed') setFailedFor(copiedFor.current);
    else if (copied === 'copied') setFailedFor(null);
  }, [copied]);
  const attempt = useRef(0);
  const [tried, setTried] = useState<{ n: number; state: 'copied' | 'failed' } | null>(null);
  const tryCopy = (run: () => Promise<Web.CopyAttempt>): void => {
    const n = ++attempt.current;
    setTried(null);
    void run().then((a) => {
      if (n !== attempt.current) return;
      setTried(a.wrote ? { n, state: 'copied' } : a.reason === 'refused' ? { n, state: 'failed' } : null);
    });
  };
  const copyFailed = load ? tried?.state === 'failed' : failedFor !== null && failedFor === held;
  const copyState = load ? (tried?.state ?? 'idle') : copied;
  const told = useRef(false);
  useDropOnUnmount(own);
  useDropOnUnmount(heldProp ?? null);
  const gone = wiped || !secret;
  useEffect(() => {
    if (!gone) { told.current = false; return; }
    setShownFor(null);
    if (!told.current && (held || value)) { told.current = true; onWipe?.(); }
  }, [gone, held, value, onWipe]);
  useWipeOn(() => { held?.drop(); setWiped(true); }, resetKey, !load || !!held);
  useWipeOnLock(() => { heldNow.current?.drop(); setShownFor(null); setWiped(true); }, !load || !!held);
  useEffect(() => setWiped(false), [held]);
  const dropRef = useRef(dropOnHide);
  dropRef.current = dropOnHide;
  useOnHidden(() => {
    if (dropRef.current) heldNow.current?.drop();
    setShownFor(null);
  });
  useRevealIdle(shown && !gone, hide);
  const [rawFor, setRawFor] = useState<HeldSecret | null>(null);
  const raw = rawFor !== null && rawFor === held;
  const view = useMemo(() => (json && shown && secret ? jsonView(secret) : null), [json, shown, secret]);
  const items = useMemo(() => (format === 'lines' && secret ? secret.split(/\r?\n/).filter((x) => x.trim() !== '') : []), [format, secret]);
  const doCopy = (): void => {
    const v = !wiped && held ? (held.reveal(ctx ?? held.ctx) ?? null) : null;
    if (!v) return;
    const text = mayCopy(load || format !== 'lines' ? v : items.join('\n'));
    if (text === null) return;
    if (load) {
      tryCopy(async () => ((await putText(text)) ? { wrote: true } : { wrote: false, reason: 'refused' }));
      onCopy?.();
      return;
    }
    copiedFor.current = held;
    copy(text);
    onCopy?.();
  };
  const copyWord = copyLabel ?? t('secret.copy');
  // A refusal is told on the note line (the button keeps its word, the full sentence would crowd the row).
  const copyNow = copyState === 'copied' ? t('secret.copied') : format === 'lines' ? (copyLabel ?? t('secret.copyCodes')) : copyWord;
  const noteText = description ?? (once ? t('secret.once') : undefined);
  const unread = !!load && gone;
  const showWord = format === 'lines' ? t('secret.showCodes') : (showLabel ?? t('secret.show'));
  const hideWord = format === 'lines' ? t('secret.hideCodes') : (hideLabel ?? t('secret.hide'));
  const off = !!load?.disabled || !!load?.reading;
  // The one Tab stop: the value box. s / Enter / Space show or hide, c copies.
  const f = useFocusable({
    disabled: gone && !(unread && !emptyText),
    onKey: (k) => {
      if (k.ctrl || k.meta) return false;
      if (unread) {
        if (off) return k.name === 's' || k.name === 'c' || isPressKey(k);
        if (k.name === 's' || isPressKey(k)) { readShow(); return true; }
        if (k.name === 'c') { readCopy(); return true; }
        return false;
      }
      if (k.name === 's' || isPressKey(k)) { if (!load?.disabled) toggleShown(); return true; }
      if (k.name === 'c') { if (!load?.disabled) doCopy(); return true; }
      return false;
    },
  });
  // A copy-first step (copyPrimary: the keys "shown once" panel) also copies on `c` while the focus is elsewhere in its
  // layer and the focused control does not take the key: that panel opens with the focus on itself (a raw focus target,
  // which takes no keys), and its web handler clicks a <button>, which this Copy word is not. The same doCopy as the
  // value box's `c` and the Copy word: the screen is asked, nothing goes around it. Never for a `load` or a wiped field.
  useKeys((k) => {
    if (!copyPrimary || load || gone || k.name !== 'c' || k.ctrl || k.meta || k.shift || k.super) return false;
    doCopy();
    return true;
  });
  // The same rule as every field's gutter (termField ControlRow): heavy while focused, never the caret-like half block.
  const rule = f.focused ? '┃' : '│';
  // A value Copy would write changed or that is too long gets no Copy (a `c` press still says why).
  const copyable = !unread && !gone && secretCopyText(format === 'lines' ? items.join('\n') : secret) !== null;
  const hint = f.focused
    ? <Text colour="faint">{tt(unread || copyable ? (shown ? 'secret.copyKeyHide' : 'secret.copyKey') : shown ? 'secret.hideKey' : 'secret.showKey')}</Text>
    : null;

  let box: ReactNode;
  if (unread) {
    box = emptyText ? (
      <Text colour="muted">{emptyText}</Text>
    ) : (
      <Box dir="row" gap={1} wrap>
        <Text colour="faint">{bullets(0)}</Text>
        <Text colour="muted">({t('secret.notRead')})</Text>
        {load!.reading ? <Text colour="muted" sem={{ role: 'status', name: readingLabel ?? t('secret.reading') }}>{readingLabel ?? t('secret.reading')}</Text> : <Act label={showLabel ?? t('secret.show')} pressed={false} off={off} onPress={readShow} />}
        <Act label={copyNow} off={off} onPress={readCopy} />
        {hint}
      </Box>
    );
  } else if (gone) {
    box = <Text colour="muted">⊘ {goneText ?? t('secret.gone')}</Text>;
  } else {
    let value: ReactNode;
    if (format === 'lines') {
      value = (
        <Box dir="column">
          {items.map((item, i) => <Text key={i}>{String(i + 1).padStart(2, ' ')}. {shown ? item : ITEM_MASK}</Text>)}
        </Box>
      );
    } else if (shown && view && view.kind !== 'plain') {
      const text = view.kind === 'json' && !raw ? view.text : (secret ?? '');
      value = <Box dir="column">{text.split('\n').map((l, i) => <Text key={i}>{l}</Text>)}</Box>;
    } else if (shown) {
      value = format === 'text'
        ? <Box dir="column">{(secret ?? '').split(/\r?\n/).map((l, i) => <Text key={i}>{l}</Text>)}</Box>
        : <Text>{secret}</Text>;
    } else {
      value = (
        <Text>
          {visiblePrefix > 0 && secret ? secret.slice(0, visiblePrefix) : ''}
          <Text colour="faint">{bullets((secret?.length ?? 0) - visiblePrefix)}</Text>
          <Text colour="muted"> ({t('secret.masked')})</Text>
        </Text>
      );
    }
    box = (
      // No Box gap on the wrapping row: the action row keeps its place with its own left pad, also on a line of its own.
      <Box dir={format === 'single' ? 'row' : 'column'} wrap>
        {value}
        <Box dir="row" gap={1} shrink={0} pad={format === 'single' ? { left: 1 } : undefined}>
          <Act label={shown ? hideWord : showWord} pressed={shown} off={!!load?.disabled} onPress={toggleShown} />
          {copyable ? <Act label={copyNow} strong={copyPrimary} off={!!load?.disabled} onPress={doCopy} /> : null}
          {hint}
        </Box>
      </Box>
    );
  }
  const jsonSwitch = view?.kind === 'json' ? (
    <SegmentedControl label={t('secret.viewAs')} items={[{ id: 'formatted', label: t('secret.formatted') }, { id: 'raw', label: t('secret.raw') }]}
      value={raw ? 'raw' : 'formatted'} onChange={(k) => setRawFor(k === 'raw' ? held : null)} />
  ) : null;
  // The group is a secret in every state, revealed included: what the screen shows on purpose never
  // reaches the semantics tree (agent export, snapshots, diagnostics). The tree says only whether a value is there;
  // `value` feeds that bit and is never written out for a secret.
  const groupSem: Sem = { role: 'group', name: label, busy: load?.reading || undefined, secret: true, value: unread || (!gone && secret) ? '•' : '' };
  // The group is the value box's focus stop, so it registers with the focus handle: while the box has the focus the tree
  // marks this group focused (a Box `sem` carries no focus state; without it the focused value has no
  // focused node). One merged ref, rebuilt only when a part changes.
  const groupSemRef = useSem(unread && emptyText ? undefined : gone && !unread ? undefined : groupSem, { role: 'group', focus: f });
  const groupRef = useMemo(() => mergeRefs(f.ref, groupSemRef), [f.ref, groupSemRef]);
  return (
    // Never wider than where it is placed (a step's text column, a Flow row): its value and note wrap inside it.
    <Box dir="column" shrink={0} maxWidth="100%">
      <Box dir="row" gap={2}><Text>{label}</Text>{jsonSwitch}</Box>
      <Box dir="row" boxRef={groupRef} onPress={() => f.focus()}>
        <Text colour={f.focused ? 'focus' : 'lineStrong'}>{rule}</Text>
        <Box grow={1} shrink={1} pad={{ left: 1 }}>{box}</Box>
      </Box>
      {shown && view && (view.kind === 'tooLong' || view.kind === 'tooBig') ? <Text colour="muted">{view.kind === 'tooLong' ? t('secret.tooLong') : t('secret.rawOnly')}</Text> : null}
      {format === 'lines' && !gone ? <Text colour="muted">{t('secret.count', { count: items.length })}</Text> : null}
      {refusal && (!gone || unread) ? (
        <Text colour="warn">! {tt(`secret.${refusal}`)}</Text>
      ) : copyFailed && (!gone || unread) ? (
        <Text colour="warn">! {t('secret.copyFailed')}</Text>
      ) : noteText && (!gone || unread) ? (
        typeof noteText === 'string' ? <Text colour="muted">⚿ {noteText}</Text> : noteText
      ) : null}
      {confirm && !gone ? (
        <Checkbox isSelected={confirm.checked} onChange={confirm.onChange} label={confirm.label ?? (format === 'lines' ? t('secret.savedMany') : t('secret.saved'))} />
      ) : null}
    </Box>
  );
};

// ── SecretInput ─────────────────────────────────────────────────────────────────────

/** The description with its promises after it, each with a lock mark (one line of sentences). */
function withPromises(description: ReactNode, promises: readonly string[] | undefined): ReactNode {
  const list = (promises ?? []).filter((p) => p.trim() !== '');
  if (list.length === 0) return description;
  return (
    <Box dir="column">
      {typeof description === 'string' ? <Text colour="muted">{description}</Text> : description}
      <Box dir="row" gap={2} wrap>{list.map((p) => <Text key={p} colour="muted">⚿ {p.trim()}</Text>)}</Box>
    </Box>
  );
}

/** A multiline secret editor: masked, it draws secretView's bullets and line ends, never the value. Offsets are in the
 *  shown text; every edit goes through secretSplice, so a pasted CR LF reaches the value byte for byte. */
function SecretArea({ value, onChange, masked, disabled, rows, placeholder, autoFocus, handle, onFocusChange, sem }: {
  value: string; onChange: (v: string) => void; masked: boolean; disabled: boolean; rows: number; placeholder?: string; autoFocus?: boolean;
  handle: { current: FieldHandle | null }; onFocusChange: (f: boolean) => void; sem: Sem;
}) {
  // Keys can arrive faster than renders: every key reads and writes this, never the last render's value and caret.
  const [caret, setCaret] = useState(() => secretView(value, masked).text.length);
  const live = useRef({ value, caret });
  // A value from outside (a clear, a wipe) replaces ours; our own edits come back as the value we sent.
  const lastProp = useRef(value);
  if (lastProp.current !== value) {
    lastProp.current = value;
    if (live.current.value !== value) live.current = { value, caret: Math.min(caret, secretView(value, masked).text.length) };
  }
  const put = (r: { value: string; caret: number }): void => {
    const changed = r.value !== live.current.value;
    live.current = { value: r.value, caret: r.caret };
    setCaret(r.caret);
    if (changed) onChange(r.value);
  };
  const move = (c: number): void => { live.current = { ...live.current, caret: c }; setCaret(c); };
  const now = (): { value: string; view: string; at: number } => {
    const v = live.current.value;
    const vw = secretView(v, masked).text;
    return { value: v, view: vw, at: Math.min(live.current.caret, vw.length) };
  };
  const view = secretView(value, masked).text;
  const at = Math.min(live.current.value === value ? live.current.caret : caret, view.length);
  const bView = boundaries(view);
  const next = (o: number): number => { for (const x of bView) if (x > o) return x; return view.length; };
  const f = useFocusable({
    disabled,
    auto: autoFocus,
    onKey: (k) => {
      if (k.name === 'escape' || k.name === 'tab') return false;
      const { value: val, view: vw, at: c } = now();
      const b = boundaries(vw);
      const prev = (o: number): number => { let p = 0; for (const x of b) { if (x >= o) break; p = x; } return p; };
      const next = (o: number): number => { for (const x of b) if (x > o) return x; return vw.length; };
      const lineStart = (o: number): number => vw.lastIndexOf('\n', o - 1) + 1;
      const lineEnd = (o: number): number => { const i = vw.indexOf('\n', o); return i < 0 ? vw.length : i; };
      if (k.name === 'left') { move(prev(c)); return true; }
      if (k.name === 'right') { move(next(c)); return true; }
      if (k.name === 'home') { move(lineStart(c)); return true; }
      if (k.name === 'end') { move(lineEnd(c)); return true; }
      if (k.name === 'up' || k.name === 'down') {
        const s0 = lineStart(c);
        const col = c - s0;
        const target = k.name === 'up' ? (s0 === 0 ? -1 : lineStart(s0 - 1)) : (lineEnd(c) === vw.length ? -1 : lineEnd(c) + 1);
        if (target >= 0) move(Math.min(target + col, lineEnd(target)));
        return true;
      }
      if (k.name === 'backspace') { if (c > 0) put(secretSplice(val, masked, prev(c), c, '')); return true; }
      if (k.name === 'delete') { if (c < vw.length) put(secretSplice(val, masked, c, next(c), '')); return true; }
      if (k.name === 'return' || k.name === 'linefeed') { put(secretSplice(val, masked, c, c, '\n')); return true; }
      if (masked && copyKey(k)) return true;
      if (k.ctrl || k.meta || k.super) return false;
      const typed = k.name === 'space' ? ' ' : k.sequence && !/[\x00-\x1f\x7f-\x9f]/.test(k.sequence) ? k.sequence : '';
      if (!typed) return false;
      put(secretSplice(val, masked, c, c, typed));
      return true;
    },
  });
  handle.current = { focus: f.focus };
  const semRef = useSem(sem, { role: 'textbox', focus: f, disabled, value, secret: masked, multiline: true });
  const was = useRef(f.focused);
  useEffect(() => { if (was.current !== f.focused) { was.current = f.focused; onFocusChange(f.focused); } }, [f.focused, onFocusChange]);
  usePasteText(f.focused && !disabled, (text) => { const n = now(); if (text) put(secretSplice(n.value, masked, n.at, n.at, text)); return true; });
  // The rows around the caret's line.
  const lines = view.split('\n');
  const caretLine = view.slice(0, at).split('\n').length - 1;
  const first = Math.max(0, Math.min(caretLine - rows + 1, lines.length - rows));
  let off = 0;
  for (let i = 0; i < first; i++) off += lines[i]!.length + 1;
  const drawn = lines.slice(first, first + rows).map((l, i) => {
    const start = off;
    off += l.length + 1;
    const lineNo = first + i;
    if (!f.focused || lineNo !== caretLine) return <Text key={lineNo} colour={disabled ? 'faint' : 'ink'}>{l === '' ? ' ' : l}</Text>;
    const c = at - start;
    const end = c < l.length ? next(at) - start : c;
    return (
      <Text key={lineNo}>
        {l.slice(0, c)}<Text inverse>{c < l.length ? l.slice(c, end) : ' '}</Text>{l.slice(end)}
      </Text>
    );
  });
  return (
    <Box dir="column" grow={1} height={rows} boxRef={mergeRefs(f.ref, semRef) as never /* contract-any: engine node type */} onPress={disabled ? undefined : () => f.focus()} clip>
      {value === '' && placeholder ? <Text colour="faint">{placeholder}</Text> : drawn}
    </Box>
  );
}

export const SecretInput: typeof Web.SecretInput = ({ label, description: text, promises, errorMessage, value, onChange, placeholder, isDisabled, resetKey, reveal = true, multiline, rows = 4, focusOnError, ...rest }) => {
  const description = withPromises(text, promises);
  const t = useStrings(strings);
  const tt = useStrings(ts);
  const ask = useSecretScreen();
  const [shownState, setShown] = useState(false);
  const [refused, setRefused] = useState(false);
  const disabled = useFieldLock(isDisabled);
  const prevValue = useRef(value);
  const ownValue = useRef<string | null>(null);
  const cleared = multiline ? value === '' && prevValue.current !== '' && ownValue.current !== '' : value === '';
  const shown = shownState && !disabled && !cleared;
  useEffect(() => {
    if (disabled || cleared) setShown(false);
    if (value !== ownValue.current) ownValue.current = null;
    prevValue.current = value;
  }, [disabled, cleared, value]);
  useOnHidden(() => setShown(false));
  const latest = useRef(value);
  latest.current = value;
  // Every wipe also makes the field forget its undo and caret (FieldInput `wipe`), even when the value is already empty.
  const [wipes, setWipes] = useState(0);
  const wipeInput = (): void => { setShown(false); setWipes((n) => n + 1); if (latest.current !== '') onChange(''); };
  useWipeOn(wipeInput, resetKey);
  useWipeOnLock(wipeInput);
  const masked = !(shown && reveal);
  useRevealIdle(!masked, () => setShown(false));
  const pressShow = (): void => {
    if (shown) { setShown(false); return; }
    const ok = ask().reveal;
    setRefused(!ok);
    if (ok) setShown(true);
  };
  const handle = useRef<FieldHandle | null>(null);
  const [focused, setFocused] = useState(false);
  const atFocus = useRef(value);
  const v = useValidation({ name: rest.name, value, empty: value === '', isRequired: rest.isRequired, errorMessage, focus: () => handle.current?.focus() });
  const hadError = useRef(false);
  // An error that arrives while the field is locked (a send's busy lifts one render later) waits for the unlock: a
  // disabled field takes no focus. At the unlock it takes the focus back unless the person moved it during the lock
  // (what held it when the lock began, or nothing, still holds it: no steal).
  const fc = useFocusControl();
  const wantFocus = useRef<'now' | 'unlock' | null>(null);
  const atLock = useRef<number | null>(null);
  // The field that held the focus when a send locked it gets it back at the unlock even with no error (a 'changed'
  // answer, a pending one), as long as the focus is still on nothing: the lock took it, nobody else did. `focused` is
  // read from the render that locked (the drop runs in the child's effect, before this one).
  const heldAtLock = useRef(false);
  const wasDisabled = useRef(disabled);
  useEffect(() => {
    if (disabled) atLock.current = fc.current();
  }, [disabled, fc]);
  useEffect(() => {
    if (disabled && !wasDisabled.current) heldAtLock.current = focused;
  }, [disabled, focused]);
  useEffect(() => {
    if (focusOnError && errorMessage && !hadError.current) wantFocus.current = disabled ? 'unlock' : 'now';
    if (!errorMessage || !focusOnError) wantFocus.current = null;
    hadError.current = Boolean(errorMessage);
    if (!wantFocus.current || disabled) return;
    const now = fc.current();
    const free = wantFocus.current === 'now' || now === null || now === atLock.current;
    wantFocus.current = null;
    if (free) handle.current?.focus();
  }, [errorMessage, focusOnError, disabled, fc]);
  useEffect(() => {
    const unlocked = wasDisabled.current && !disabled;
    wasDisabled.current = disabled;
    if (!unlocked) return;
    const held = heldAtLock.current;
    heldAtLock.current = false;
    if (focusOnError && held && fc.current() === null) handle.current?.focus();
  }, [disabled, focusOnError, fc]);
  const form = useTermForm();
  const change = (n: string): void => { ownValue.current = n; onChange(n); };
  const onFocusChange = (f: boolean): void => {
    setFocused(f);
    if (f) atFocus.current = latest.current;
    else v.left(atFocus.current !== latest.current);
  };
  // Gutter + pad (2) + text + caret cell; masked text draws one bullet per character.
  const shownText = masked ? '•'.repeat([...value].length) : value;
  const textCells = Math.min(FIELD_CELLS.lg!, Math.max(FIELD_CELLS.xs!, 3 + Math.max(cellWidth(shownText), cellWidth(placeholder ?? ''))));
  const toggle = reveal ? (
    <Button size="sm" variant="ghost" isDisabled={disabled} onPress={pressShow}>{shown ? t('secretInput.hide') : t('secretInput.show')}</Button>
  ) : null;
  const errorText = typeof v.error === 'string' ? v.error : v.error ? textOf(v.error) : undefined;
  // Secret in every state, shown included: the tree says only whether something is typed.
  const sem: Sem = { secret: true, name: label ?? rest['aria-label'], description: v.error ? undefined : textOf(description) || undefined, required: rest.isRequired || undefined, invalid: v.invalid || undefined, errorText };
  return (
    <FieldFrame label={label} required={rest.isRequired} disabled={disabled} description={description} error={v.error}>
      {/* The toggle sits one cell after the text area (a control belongs next to what it acts on): a
          single-line box is as wide as its text or placeholder, at least an extra-small field (xs) and at most a wide one (lg);
          it shrinks with the pane. A multiline area keeps the wide field. */}
      <Box dir="row" gap={1}>
        <Box dir="row" grow={0} shrink={1} width={multiline ? FIELD_CELLS.lg : textCells} maxWidth={FIELD_CELLS.lg}>
        <ControlRow focused={focused} invalid={v.invalid} disabled={disabled}>
          {multiline ? (
            <SecretArea value={value} onChange={change} masked={masked} disabled={disabled} rows={rows} autoFocus={rest.autoFocus} handle={handle} sem={sem}
              placeholder={placeholder ?? (masked && reveal ? t('secretInput.pasteOrShow') : undefined)} onFocusChange={onFocusChange} />
          ) : (
            // Empty, unfocused and with no placeholder, the box shows a faint rule as TextField does (fields.term.tsx
            // emptyFill): a bare gutter "│" under "New password" did not read as a field.
            <FieldInput handle={handle} value={value} onChange={change} wipe={wipes} mask={masked} disabled={disabled} placeholder={placeholder} autoFocus={rest.autoFocus} sem={sem}
              emptyFill="_"
              onKey={(k) => masked && copyKey(k)} onSubmit={() => form?.submit()} onFocusChange={onFocusChange} />
          )}
        </ControlRow>
        </Box>
        {toggle ? <Box shrink={0}>{toggle}</Box> : null}
      </Box>
      {refused && !shown ? <Text colour="warn">! {tt('secret.revealRefused')}</Text> : null}
    </FieldFrame>
  );
};
