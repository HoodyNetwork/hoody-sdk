// The pause of every agent on a computer, shown in two places: the pane foot's control
// (PauseControl) and the band in an open conversation (PauseBand). Both are driven by one PauseStore per computer
// (kit/agent/pause.ts), which reads GET /pause while a surface holds it and takes event.pause_state.
//
// The one description of what pausing does (pauseDescription) is the same text everywhere the pause is offered.
// Pausing is never a cancel, and an unknown outcome is never shown as paused or as failed: "May be paused" with Check
// again until a read answers. A read that failed while the state is unknown is shown as that, never as running.
import { useEffect, useId, useSyncExternalStore } from 'react';
import { Button } from '../controls/Button';
import { SR_ONLY } from '../controls/SrOnly';
import { Band } from '../states/Band';
import { ErrorDetails, errorSentence, useErrorInfo } from '../states/ErrorDetails';
import stateStrings from '../states/strings.en.json';
import { useStrings } from '../strings';
import type { PauseStore, PauseView } from './pause';
import strings from './Pause.strings.en.json';
import s from './Pause.module.css';

/** The store's view, re-read on every change. */
export function usePauseView(store: PauseStore): PauseView {
  return useSyncExternalStore(store.subscribe, store.view, store.view);
}

/** Keeps the store reading (30 s and on focus) for as long as the calling surface is mounted. */
export function useHoldPause(store: PauseStore): void {
  useEffect(() => store.hold(), [store]);
}

/** The one published description, for a computer named `computer`. */
export function usePauseDescription(computer: string): string {
  const t = useStrings(strings);
  return t('pause.description', { computer });
}

/** The read failed and no earlier read is known. */
const readFailed = (v: PauseView): boolean => v.error?.of === 'read' && v.state === null;

export interface PauseProps {
  store: PauseStore;
  /** The computer's name, as the person knows it. */
  computer: string;
  /** In a rail's foot: the button's icon on the rail's lead column and its label on the text edge. */
  rail?: boolean;
  /** Running, no Pause button (through `usePauseToggle`); every
   *  other state (paused, may be paused, unread) still shows its strip and its way out. */
  quiet?: boolean;
  /** The id of the pause's description where the host shows it (a SettingRow's help with
   *  usePauseDescription's text): the Pause button is described by it, and the screen-reader copy here is left out, so
   *  the description is read once. Without it (the rail foot) the button keeps its own screen-reader description. */
  describedBy?: string;
}

/** The pause's one toggle: Pause while running, Resume while paused, null while the state is unknown (may be paused,
 *  or unread: those offer Check again / Try again, never a toggle). PauseControl's buttons and any menu item that offers
 *  the pause run this same `run`, so every place sends the same one change through the store (one at a time: `busy`). */
export interface PauseToggle {
  kind: 'pause' | 'resume';
  /** A read (or an event) has answered: false while the first read is still out, when the computer may already be
   *  paused. A menu offers the toggle only once it is known. */
  known: boolean;
  label: string;
  busy: boolean;
  isDisabled: boolean;
  run: () => void;
}

export function usePauseToggle(store: PauseStore): PauseToggle | null {
  const t = useStrings(strings);
  const v = usePauseView(store);
  if (v.unsure || readFailed(v)) return null;
  if (v.state?.paused === true) {
    return { kind: 'resume', known: true, label: v.busy === 'resuming' ? t('pause.resuming') : t('pause.resume'), busy: v.busy === 'resuming', isDisabled: v.busy !== null, run: () => void store.set(false) };
  }
  return { kind: 'pause', known: v.state !== null, label: v.busy === 'pausing' ? t('pause.pausing') : t('pause.pause'), busy: v.busy === 'pausing', isDisabled: v.busy !== null, run: () => void store.set(true) };
}

/** The pane foot: a Pause button; paused it turns warn, "Paused · turns wait at their next step", with Resume. */
export function PauseControl({ store, computer, rail, quiet, describedBy }: PauseProps) {
  const t = useStrings(strings);
  const v = usePauseView(store);
  const toggle = usePauseToggle(store);
  useHoldPause(store);
  const id = useId();
  const description = t('pause.description', { computer });
  if (v.unsure) {
    return (
      <span className={`${s.foot} ${s.warn}${rail ? ` ${s.railWarn}` : ''}`} data-pause="unsure">
        <span className={s.strip}>{t('pause.unsureStrip')}</span>
        <Button size="sm" variant="ghost" onPress={() => void store.refresh()}>{t('pause.checkAgain')}</Button>
      </span>
    );
  }
  // C9: an unknown state is neither running nor paused, so no Pause button until a read answers.
  if (readFailed(v)) {
    return (
      <span className={`${s.foot} ${s.warn}${rail ? ` ${s.railWarn}` : ''}`} data-pause="unread">
        <span className={s.strip}>{t('pause.readFailedStrip')}</span>
        <Button size="sm" variant="ghost" onPress={() => void store.refresh()}>{t('pause.tryAgain')}</Button>
      </span>
    );
  }
  if (!toggle) return null; // unreachable: the two unknown states returned above
  if (toggle.kind === 'resume') {
    return (
      <span className={`${s.foot} ${s.warn}${rail ? ` ${s.railWarn}` : ''}`} data-pause="paused">
        <span className={s.strip}>{t('pause.strip')}</span>
        <Button size="sm" variant="secondary" busy={toggle.busy} isDisabled={toggle.isDisabled} onPress={toggle.run}>
          {toggle.busy ? t('pause.resuming') : t('pause.resume')}
        </Button>
      </span>
    );
  }
  // Quiet: the slot stays (an empty mark), so the foot's row keeps its two ends.
  if (quiet) return <span className={s.foot} data-pause="running" />;
  return (
    <span className={s.foot} data-pause="running">
      <Button size="sm" variant="ghost" icon="pause" {...(rail ? { className: s.railPause } : {})} busy={toggle.busy} isDisabled={toggle.isDisabled} aria-describedby={describedBy ?? id} onPress={toggle.run}>
        {toggle.busy ? t('pause.pausing') : t('pause.pause')}
      </Button>
      {!describedBy && <span id={id} className={SR_ONLY}>{description}</span>}
    </span>
  );
}

/** The band in an open conversation: nothing while running; paused (Resume), may be paused (Check again), or a read
 *  or change that failed (Try again / the refusal). */
export function PauseBand({ store, computer }: PauseProps) {
  const t = useStrings(strings);
  const ts = useStrings(stateStrings);
  const v = usePauseView(store);
  // The rejection's own facts (an unreadable answer has none: its code and status stand in) give the mapped sentence
  // and Details beside the pause's own words.
  const info = useErrorInfo(v.error ? (v.error.facts ?? v.error) : null);
  const why = info ? <> {errorSentence(info, undefined, ts)} <ErrorDetails error={info} mode="button" /></> : null;
  useHoldPause(store);
  if (v.unsure) {
    return (
      <Band tone="warn" icon="pause" actions={<Button size="sm" variant="ghost" onPress={() => void store.refresh()}>{t('pause.checkAgain')}</Button>}>
        {t('pause.unsure', { computer })}
      </Band>
    );
  }
  if (readFailed(v)) {
    return (
      <Band tone="warn" icon="pause" actions={<Button size="sm" variant="ghost" onPress={() => void store.refresh()}>{t('pause.tryAgain')}</Button>}>
        <span>{t('pause.readFailed', { computer })}</span>
        {why}
      </Band>
    );
  }
  const paused = v.state?.paused === true;
  const refused = v.error?.of === 'set' ? (v.error.code ? t('pause.setFailed', { code: v.error.code }) : t('pause.setFailedNoCode')) : null;
  // A refused change never takes the known state or its way back away: while paused, Resume stays beside the refusal.
  if (paused || refused) {
    const resume = paused ? (
      <Button size="sm" variant="secondary" busy={v.busy === 'resuming'} isDisabled={v.busy !== null} onPress={() => void store.set(false)}>{v.busy === 'resuming' ? t('pause.resuming') : t('pause.resume')}</Button>
    ) : undefined;
    return (
      <Band tone="warn" icon="pause" actions={resume}>
        {paused ? t('pause.band', { computer }) : null}
        {paused && refused ? ' ' : null}
        {refused}
        {refused && why}
      </Band>
    );
  }
  return null;
}
