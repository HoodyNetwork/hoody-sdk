// TalkBar: the bar that takes the composer row while Talk is on. While live it
// holds the talk control (hold to talk, or hands-free), the microphone level, Mute, Stop answer, Stop speaking, End and
// the Devices menu; in every other phase it is one band in the phase's words, with that phase's way on. Presentational:
// state comes in as props (from kit/voice/machine.ts and the page binding), every action goes out as a callback.
// What it promises:
//   - Hold to talk follows the HOLD RULE (TalkControl): one physical owner per hold (a pointer or a key), started only by
//     a physical down, ended only by that owner's release or a cancel; every down gets exactly one up. Telling a tap
//     (latch) from a hold is the machine's (PTT_LATCH_MS), never the bar's.
//   - Hands-free is offered only when the microphone reports echo cancellation; otherwise its row is disabled and says
//     to use headphones.
//   - Stop speaking shows only when the page allows it (a reply open); Stop answer only while an answer can stop.
//     Escape on the bar does Stop speaking when shown, else Stop answer. useTalkShortcuts gives the page keys (t, m,
//     Escape) the same actions.
//   - Every state has words; nothing is shown by colour or motion alone. The level is a kit Meter named "Microphone
//     level" (static when motion is reduced: the kit's durations drop to 0).
import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { mergeProps, useFocusRing, useHover } from 'react-aria';
import { isVirtualClick, isVirtualPointerEvent } from 'react-aria/private/utils/isVirtualEvent';
import { Button, ButtonFace, buttonClass, chipFor, cx } from '../controls/Button';
import { ActionMenu } from '../overlays/Overlays';
import type { MenuList } from '../overlays/Menu';
import { usePageShortcuts } from '../../shell/pageShortcuts';
import { Band } from '../states/Band';
import { useStrings } from '../strings';
import { Meter } from '../widgets/Widgets';
import type { EndReason, Mic, Mode, Phase } from './machine';
import strings from './Voice.strings.en.json';
import s from './Voice.module.css';

export type TalkActivity = 'listening' | 'hearing' | 'thinking' | 'speaking';

export interface TalkDevice {
  id: string;
  /** The device's own name, shown as written. */
  label: string;
}

export interface TalkBarHandlers {
  onPttDown: () => void;
  onPttUp: () => void;
  onMode: (mode: Mode) => void;
  onMute: () => void;
  onUnmute: () => void;
  onStopAnswer: () => void;
  onStopSpeaking: () => void;
  onEnd: () => void;
  onInput: (id: string) => void;
  onOutput: (id: string) => void;
  /** Try again (checkUnknown, denied, noDevice, connectFailed) and Talk again (ended). */
  onRetry: () => void;
  onTryAnyway: () => void;
  onTakeOver: () => void;
  onOpenSettings: () => void;
  /** playbackBlocked: resume the audio context (a user gesture). */
  onEnableSound: () => void;
}

export interface TalkBarProps extends TalkBarHandlers {
  phase: Phase;
  mode: Mode;
  mic: Mic;
  activity?: TalkActivity;
  /** The microphone reports echo cancellation: hands-free may be offered. */
  handsFree: boolean;
  /** Microphone level, 0 to 1. */
  level: number;
  /** An answer is open and can be stopped. */
  canStopAnswer: boolean;
  /** Stop speaking is allowed now. */
  canStopSpeaking: boolean;
  /** A Stop answer is running. */
  stopping: boolean;
  /** notReady: the check's stage, in words. */
  notReadyStage?: string;
  ended?: EndReason;
  /** Speech was stopped because playback fell behind: `lead` with play lead, `old` for an older agent. */
  overflow?: 'lead' | 'old';
  inputs: readonly TalkDevice[];
  input?: string;
  outputs: readonly TalkDevice[];
  output?: string;
  /** The browser can choose the speaker (setSinkId). */
  canChooseOutput: boolean;
}

const LIVE: readonly Phase[] = ['live', 'muting', 'muted'];

export function TalkBar(p: TalkBarProps) {
  const t = useStrings(strings);
  if (!LIVE.includes(p.phase)) return <PhaseBand {...p} />;
  // Escape stops speaking when allowed, else the answer (not while it is stopping); with neither it falls through.
  const stop = p.canStopSpeaking ? p.onStopSpeaking : p.canStopAnswer && !p.stopping ? p.onStopAnswer : undefined;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !stop) return;
    e.preventDefault();
    stop();
  };
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape from any control in the bar stops speech or the answer; the controls keep their own keys
    <div className={s.bar} role="group" aria-label={t('bar.label')} onKeyDown={onKeyDown}>
      {p.overflow && <p className={s.note}>{t(`overflow.${p.overflow}`)}</p>}
      <div className={s.row}>
        <TalkControl {...p} />
        <ModeMenu {...p} />
        <Meter value={Math.round(p.level * 100)} label={t('level')} tone="neutral" size="sm" className={s.level} />
        <span className={s.activity} aria-live="polite">
          {p.phase === 'muted' ? t('phase.muted') : p.activity ? t(`activity.${p.activity}`) : ''}
        </span>
        {p.phase === 'muted' ? (
          <Button variant="secondary" size="sm" onPress={p.onUnmute}>
            {t('unmute')}
          </Button>
        ) : (
          <Button variant="secondary" size="sm" busy={p.phase === 'muting'} onPress={p.onMute}>
            {p.phase === 'muting' ? t('muting') : t('mute')}
          </Button>
        )}
        {(p.canStopAnswer || p.stopping) && (
          <Button variant="secondary" size="sm" busy={p.stopping} onPress={p.onStopAnswer}>
            {p.stopping ? t('stopping') : t('stopAnswer')}
          </Button>
        )}
        {p.canStopSpeaking && (
          <Button variant="secondary" size="sm" onPress={p.onStopSpeaking}>
            {t('stopSpeaking')}
          </Button>
        )}
        <DevicesMenu {...p} />
        <Button tone="danger" size="sm" onPress={p.onEnd}>
          {t('end')}
        </Button>
      </div>
    </div>
  );
}

/** What holds the control down: one physical pointer (by id) or one physical key (by `KeyboardEvent.code`). */
type HoldOwner = { kind: 'pointer'; id: number } | { kind: 'key'; code: string };

/** Space and Enter (main or numpad) activate the hold; `key` says which keys, `code` which physical key owns it. */
const isHoldKey = (e: globalThis.KeyboardEvent) => e.key === ' ' || e.key === 'Enter';

/**
 * Hold to talk (or the hands-free label). HOLD RULE: one physical owner per hold; a hold starts only from
 * a physical down and ends only from its owner's own release or a cancel; every down gets exactly one up.
 * - A native button, outside React Aria's press layer (usePress released our pointer capture and doubled assistive
 *   taps): only raw pointer and key events drive it. It wears the kit Button's look (buttonClass, ButtonFace), and its
 *   hover and focus-visible states come from useHover and useFocusRing, which press nothing.
 * - Owner: a primary pointer (button 0, isPrimary, not virtual by React Aria's own platform rules), held only once
 *   setPointerCapture took (no capture, no hold, no down), or one key (Space, Enter or NumpadEnter by `code`, not an
 *   auto-repeat).
 * - Ends: that pointer's release of its primary button or contact (a pointermove or pointerup with `buttons & 1` clear,
 *   so a chord's left-up ends it), its pointercancel, or that key's keyup, wherever they happen. Any other pointer's or
 *   key's release, and a second key or pointer while one owns the hold, change nothing.
 * - Cancels (the one up, owner cleared first so a second cancel sends nothing): lostpointercapture of the owner, focus
 *   leaving the control, window blur, the page hidden or left, the control disabled (not live), hands-free, unmount.
 * - Tap: an activation with no physical down (assistive technology, switch access, a programmatic click) is one tap, down
 *   then up, never a hold: a click that React Aria's isVirtualClick names virtual, or that follows a virtual
 *   pointerdown on this control (an arm every cancel drops). A physical press's own click is never a tap: browsers send
 *   it as a PointerEvent carrying that press's pointerId (a program or key click carries -1), so it is matched by id,
 *   with no timing. Nor is a click while held; one click Event is at most one tap. A click that is not a PointerEvent
 *   (older engines) has no id: it taps through the arm; with a physical press owed it is that press's click once (a
 *   trusted one ends the oldest record, an untrusted one sets that record's one-shot latch); with nothing owed it is
 *   one tap (see onClick, and its stated exposure).
 * - The activation keys never make the browser's own click: their keydown and keyup are preventDefault-ed here (they
 *   still bubble, so Escape and the page keys are untouched).
 */
function TalkControl({ mode, mic, phase, onPttDown, onPttUp }: TalkBarProps) {
  const t = useStrings(strings);
  const btn = useRef<HTMLButtonElement>(null);
  const owner = useRef<HoldOwner | null>(null);
  const [pressed, setPressed] = useState(false);
  const down = useRef(onPttDown);
  down.current = onPttDown;
  const up = useRef(onPttUp);
  up.current = onPttUp;
  const muted = phase !== 'live';
  const blocked = useRef(muted);
  blocked.current = muted;
  const { focusProps, isFocusVisible } = useFocusRing();
  const { hoverProps, isHovered } = useHover({ isDisabled: muted });
  // A virtual pointerdown seen on the control (by pointerId), waiting for its click: that click is the tap.
  const armed = useRef<number | null>(null);
  // Pointers that went down physically on the control and whose own click may still come here: that click carries the
  // same pointerId, so it is matched by id (through a chord, or other clicks in between). A record ends at its click,
  // at the next down of its id, at its pointercancel, at a non-owner release outside the control (its click goes
  // elsewhere) and at every cancel; keys and other clicks never touch it. The value is the record's one-shot latch
  // (true once an untrusted id-less click was taken as this press's click); it ends with the record.
  const pressedIds = useRef(new Map<number, boolean>()).current;
  // Stable (refs and a state setter only), so listeners added with them are removed with them. `release` is the owner's
  // own end; `cancel` is every other end and also drops the records (no press's click is owed after a cancel). Both drop
  // a waiting virtual arm (a late click is then a lone click, routed on its own).
  const release = useRef(() => {
    armed.current = null;
    if (!owner.current) return;
    owner.current = null;
    setPressed(false);
    up.current();
  }).current;
  const cancel = useRef(() => {
    pressedIds.clear();
    release();
  }).current;
  useEffect(() => {
    const el = btn.current;
    if (!el) return;
    const handled = new WeakSet<Event>();
    const begin = (o: HoldOwner) => {
      if (owner.current || blocked.current) return;
      owner.current = o;
      setPressed(true);
      down.current();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (isVirtualPointerEvent(e)) {
        pressedIds.delete(e.pointerId);
        if (!owner.current && !blocked.current) armed.current = e.pointerId;
        return;
      }
      pressedIds.set(e.pointerId, false);
      armed.current = null;
      if (owner.current || blocked.current || e.button !== 0 || !e.isPrimary) return;
      // Capture first: its release then reaches us wherever it happens. No capture, no hold (and no down to strand).
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        return;
      }
      if (!el.hasPointerCapture(e.pointerId)) return;
      begin({ kind: 'pointer', id: e.pointerId });
    };
    const onPointerEnd = (e: PointerEvent) => {
      const o = owner.current;
      const owns = o?.kind === 'pointer' && o.id === e.pointerId;
      if (e.type === 'pointercancel') {
        pressedIds.delete(e.pointerId);
        if (armed.current === e.pointerId) armed.current = null;
      }
      // A release outside the control and not captured by it (never the owner: the hold has capture) sends its click
      // elsewhere, so nothing is owed here.
      if (e.type === 'pointerup' && !el.hasPointerCapture(e.pointerId) && !(e.target instanceof Node && el.contains(e.target))) {
        pressedIds.delete(e.pointerId);
      }
      if (!owns) return;
      if (e.type === 'pointercancel' || e.type === 'lostpointercapture') cancel();
      else if ((e.buttons & 1) === 0) release();
    };
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (!isHoldKey(e)) return;
      e.preventDefault();
      armed.current = null;
      if (!e.repeat) begin({ kind: 'key', code: e.code });
    };
    const onKeyUp = (e: globalThis.KeyboardEvent) => {
      if (isHoldKey(e) && e.target instanceof Node && el.contains(e.target)) e.preventDefault();
      const o = owner.current;
      if (o?.kind === 'key' && o.code === e.code) release();
    };
    const onClick = (e: MouseEvent) => {
      if (handled.has(e)) return;
      handled.add(e);
      // A physical press's own click (matched by its pointerId) is never a tap; it spends its record even while another
      // owner holds, but never the owner pointer's own record while that pointer still holds. A click while held or
      // disabled is never a tap.
      const o = owner.current;
      const own = e instanceof PointerEvent && !(o?.kind === 'pointer' && o.id === e.pointerId) && pressedIds.delete(e.pointerId);
      if (own || o || blocked.current) return;
      // The arm is spent only by its own pointer's click, or by a click that is not a PointerEvent (older engines, where
      // every click is a MouseEvent with no id to match). Such a click taps through the arm. Else, with a physical press
      // owed on this control, it is that press's click once (no new pair), and with nothing owed it is one tap, so a
      // screen-reader click on those engines still works. A trusted one ends the oldest record: an engine that sends a
      // trusted click without an id sends every press's click so. An untrusted one (a program's dispatched MouseEvent)
      // never ends a record; it sets the oldest open record's one-shot latch, and when every owed record has taken
      // its click it taps. Stated exposure: an assistive click is trusted too, so on those engines a lone one that
      // arrives while a mouse press's own click is still owed is taken once as that press's click.
      // Any other click is routed on its own and leaves the arm.
      let tap: boolean;
      if (!(e instanceof PointerEvent)) {
        tap = armed.current !== null;
        armed.current = null;
        if (!tap) {
          let owed: number | undefined;
          for (const [id, taken] of pressedIds) if (e.isTrusted || !taken) { owed = id; break; }
          if (owed === undefined) tap = true;
          else if (e.isTrusted) pressedIds.delete(owed);
          else pressedIds.set(owed, true);
        }
      } else if (armed.current !== null && e.pointerId === armed.current) {
        tap = true;
        armed.current = null;
      } else {
        tap = isVirtualClick(e);
      }
      if (!tap) return;
      down.current();
      up.current();
    };
    // Focus leaving the control: a key held while tabbing away never sends its keyup here.
    const onFocusOut = () => cancel();
    const onContextMenu = (e: Event) => {
      if (owner.current) e.preventDefault();
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') cancel();
    };
    el.addEventListener('pointerdown', onPointerDown, true);
    el.addEventListener('keydown', onKeyDown, true);
    el.addEventListener('click', onClick, true);
    el.addEventListener('focusout', onFocusOut, true);
    el.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('pointermove', onPointerEnd, true);
    document.addEventListener('pointerup', onPointerEnd, true);
    document.addEventListener('pointercancel', onPointerEnd, true);
    document.addEventListener('lostpointercapture', onPointerEnd, true);
    document.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', cancel);
    window.addEventListener('pagehide', cancel);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown, true);
      el.removeEventListener('keydown', onKeyDown, true);
      el.removeEventListener('click', onClick, true);
      el.removeEventListener('focusout', onFocusOut, true);
      el.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('pointermove', onPointerEnd, true);
      document.removeEventListener('pointerup', onPointerEnd, true);
      document.removeEventListener('pointercancel', onPointerEnd, true);
      document.removeEventListener('lostpointercapture', onPointerEnd, true);
      document.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('pagehide', cancel);
      document.removeEventListener('visibilitychange', hidden);
      // Unmounting mid-press (the bar leaves live) releases too.
      cancel();
    };
  }, [mode, release, cancel, pressedIds]);
  // Switching to hands-free or leaving live mid-press (muting) keeps this mounted, so it releases here too.
  useEffect(() => {
    if (mode === 'vad' || muted) cancel();
  }, [mode, muted, cancel]);
  if (mode === 'vad') return <span className={s.handsFree}>{t('mode.vad')}</span>;
  const label = mic === 'ptt-held' ? t('hold.held') : mic === 'latched' ? t('hold.latched') : t('hold.idle');
  const chipped = chipFor({ variant: 'primary', size: 'md', hasEnd: false });
  return (
    // eslint-disable-next-line jsx-a11y/role-supports-aria-props -- ARIA 1.3 aria-description (why it is muted), as the kit Button carried it here; the rule's table predates it
    <button
      {...mergeProps(focusProps, hoverProps)}
      ref={btn}
      type="button"
      className={cx(buttonClass({ variant: 'primary', size: 'md', chipped }), s.hold)}
      // State attributes as React Aria Components write them ("true" or absent), so the kit CSS reads them alike.
      data-variant="primary"
      data-glyph={chipped ? '' : undefined}
      data-focus-visible={isFocusVisible || undefined}
      data-hovered={isHovered || undefined}
      data-pressed={pressed || undefined}
      data-disabled={muted || undefined}
      disabled={muted}
      aria-pressed={mic === 'ptt-held' || mic === 'latched'}
      aria-description={muted ? t('hold.mutedWhy') : undefined}
    >
      <ButtonFace chipped={chipped}>{label}</ButtonFace>
    </button>
  );
}

function ModeMenu({ mode, handsFree, onMode }: TalkBarProps) {
  const t = useStrings(strings);
  const items: MenuList = [
    {
      id: 'talk-mode',
      name: t('mode.label'),
      select: 'one',
      current: mode,
      items: [
        { id: 'ptt', label: t('mode.ptt'), onAction: () => onMode('ptt') },
        { id: 'vad', label: t('mode.vad'), onAction: () => onMode('vad'), isDisabled: !handsFree, disabledReason: handsFree ? undefined : t('mode.vadWhy') },
      ],
    },
  ];
  return (
    <ActionMenu
      items={items}
      label={t('mode.label')}
      placement="top start"
      trigger={
        <Button variant="ghost" size="sm" iconEnd="chevron-down">
          {mode === 'vad' ? t('mode.currentVad') : t('mode.currentPtt')}
        </Button>
      }
    />
  );
}

function DevicesMenu({ inputs, input, outputs, output, canChooseOutput, onInput, onOutput }: TalkBarProps) {
  const t = useStrings(strings);
  const items: MenuList = [
    { id: 'talk-input', label: t('devices.input'), select: 'one', current: input ? `in:${input}` : null, items: inputs.map((d) => ({ id: `in:${d.id}`, label: d.label, onAction: () => onInput(d.id) })) },
    canChooseOutput
      ? { id: 'talk-output', label: t('devices.output'), select: 'one', current: output ? `out:${output}` : null, items: outputs.map((d) => ({ id: `out:${d.id}`, label: d.label, onAction: () => onOutput(d.id) })) }
      : { id: 'talk-output', label: t('devices.output'), items: [{ id: 'out:system', label: t('devices.outputSystem'), isDisabled: true, disabledReason: t('devices.outputWhy'), onAction: () => undefined }] },
  ];
  return (
    <ActionMenu
      items={items}
      label={t('devices')}
      placement="top end"
      trigger={
        <Button variant="ghost" size="sm" iconEnd="chevron-down">
          {t('devices')}
        </Button>
      }
    />
  );
}

/** Every phase outside live, as one band with its way on. */
function PhaseBand(p: TalkBarProps) {
  const t = useStrings(strings);
  /** End while starting: it stays reachable, but the key that pressed Talk never lands on it (Composer, data-no-first-focus). */
  const endHere = (
    <Button variant="secondary" size="sm" onPress={p.onEnd} data-no-first-focus="">
      {t('end')}
    </Button>
  );
  const act = (label: keyof typeof strings, run: () => void, primary = false) => (
    <Button variant={primary ? 'primary' : 'secondary'} size="sm" onPress={run}>
      {t(label)}
    </Button>
  );
  const band = (tone: 'neutral' | 'warn' | 'danger', text: string, actions?: ReactElement) => (
    <Band tone={tone} size="table" actions={actions}>
      {text}
    </Band>
  );
  switch (p.phase) {
    case 'off':
      return null;
    case 'starting':
      return band('neutral', t('phase.starting'), endHere);
    case 'connecting':
      return band('neutral', t('phase.connecting'), endHere);
    case 'reconnecting':
      return band('warn', t('phase.reconnecting'), act('end', p.onEnd));
    case 'notReady':
      return band('warn', t('phase.notReady', { stage: p.notReadyStage ?? '' }), act('phase.notReadyAction', p.onOpenSettings));
    case 'checkUnknown':
      return band('warn', t('phase.checkUnknown'), <>{act('phase.tryAgain', p.onRetry, true)}{act('phase.tryAnyway', p.onTryAnyway)}</>);
    case 'denied':
      return band('warn', t('phase.denied'), act('phase.tryAgain', p.onRetry));
    case 'noDevice':
      return band('warn', t('phase.noDevice'), act('phase.tryAgain', p.onRetry));
    case 'playbackBlocked':
      return band('warn', t('phase.playbackBlockedWhy'), act('phase.playbackBlocked', p.onEnableSound, true));
    case 'busyElsewhere':
      return band('neutral', t('phase.busyElsewhere'), act('phase.takeOver', p.onTakeOver, true));
    case 'budget':
      return band('warn', t('phase.budget'), act('phase.tryAgain', p.onRetry));
    case 'connectFailed':
      return band('danger', t('phase.connectFailed'), act('phase.tryAgain', p.onRetry, true));
    case 'ended':
      return band(p.ended === 'user' ? 'neutral' : 'warn', p.overflow ? t(`overflow.${p.overflow}`) : t(`ended.${p.ended ?? 'closed'}`), act('ended.again', p.onRetry));
    default:
      return null;
  }
}

export interface TalkShortcuts {
  /** Talk can be focused now (the bar or the Mic is on the page). */
  enabled: boolean;
  focus: () => void;
  /** Mute while live, unmute while muted; undefined when neither applies. */
  toggleMute?: () => void;
  /** Stop speaking when allowed, else Stop answer; undefined when neither applies. */
  stop?: () => void;
}

/** The page keys of Talk: `t` focuses Talk, `m` mutes or unmutes, Escape stops speaking or the answer. */
export function useTalkShortcuts({ enabled, focus, toggleMute, stop }: TalkShortcuts): void {
  const t = useStrings(strings);
  usePageShortcuts([
    { key: 't', label: t('shortcut.focus'), run: focus, enabled },
    { key: 'm', label: t('shortcut.mute'), run: () => toggleMute?.(), enabled: enabled && !!toggleMute },
    { key: 'Escape', label: t('shortcut.stop'), run: () => stop?.(), enabled: enabled && !!stop, palette: false },
  ]);
}
