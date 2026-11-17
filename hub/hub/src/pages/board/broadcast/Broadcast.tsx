// The Board's broadcast: one strip button that opens the panel and shows the Live chip, the panel, and
// the leave guard. parts/BoardView.tsx mounts <Broadcast computers area /> in the strip; nothing else of the Board changes.
//
// Contract, in plain words:
//   - Start is offered only when this browser can broadcast (capability.ts), a computer is chosen, the viewer-link
//     list of that computer answered (aliases unavailable: Start refused, with why), and the person ticked the
//     privacy box. The box and the "only my address" note show before every Start; the tick clears after each one.
//   - Start calls Broadcaster.start in the press itself (the browser asks for the tab there). The link ends with the
//     stream (broadcaster.ts): Stop is the one stop, and every Start makes a new link; Start waits ('busy') while an
//     earlier link may still exist.
//   - The Live chip shows from the press until the sender has really ended (Broadcaster.running): "Ending…" while
//     stopping. Viewers read "unknown" whenever the pipe's status stream is not open, never 0.
//   - The link's create and remove outcomes are shown as C9 says: unknown is its own state with Check again, never
//     failed or gone; failed offers Try again. Leftover links (earlier broadcasts' aliases of the computer) list
//     with Turn off; a turn-off whose outcome is unknown stays listed as not confirmed, with Check again.
//   - Leaving the Board while a broadcast runs or its link is on asks first (LeaveGuard + ConfirmDialog): Stop and
//     leave ends the stream, turns the link off, waits for both, then leaves. Stay keeps everything.
//   - The Board keeps this view mounted for its lifetime and says when its strip is not on screen (`shown` false:
//     phone width, focus mode). Hidden, the panel closes (its button is off screen) in the same commit, with no
//     exit animation keeping its dialog over the Board; focus left on the page body or on the hidden button goes to
//     the Board's `restoreFocus`. The broadcast, its link and the leave ask go on as before.
//     Shown again, the panel stays closed until the button is pressed.
import { isFramed } from '@core';
import { Band, Button, Checkbox, IconButton, ComputerPicker, ConfirmDialog, CopyButton, ErrorState, LeaveGuard, Notice, PickerField, Popover, QrButton, Skeleton, cx, formatDateTime, formatRelative, showToast, useComputerChoice, useIsPhone, useNow, type LeaveGuardProps } from '@kit';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { BoardComputer } from '../computers';
import { holdsComputer, type Broadcaster, type BroadcastState } from './broadcaster';
import { browserEnv, unsupported, type Unsupported } from './capability';
import { useRemoveLink, useRenewLink } from './data';
import { expired, type AliasList, type BroadcastAlias } from './link';
import { useBroadcast } from './useBroadcast';
import { clock, useBT, type T } from './text';
import s from './broadcast.module.css';

/** The Board's computer read (useBoardComputers): failed with no list means the computers are unknown, not none.
 *  `complete` false: the rows are known to be only part of the list (absent from an older read: taken as whole). */
export interface ComputersRead {
  readonly failed: boolean;
  /** The failed read's rejection, for the shared error details (absent: the panel says it without them). */
  readonly error?: unknown;
  readonly complete?: boolean;
  retry(): void;
}

export interface BroadcastProps {
  /** Null until the Board's first answer: unknown, never shown as "no computers". */
  readonly computers: readonly BoardComputer[] | null;
  /** The read behind `computers`: a failed first read shows the read error with Try again. Without it a null list
   *  shows the reading state. */
  readonly read?: ComputersRead;
  /** The tile area: the capture is narrowed to it when the browser can. */
  readonly area?: { readonly current: Element | null } | null;
  /** False while the Board's strip is not on screen (phone width, focus mode): the panel closes. Default true. */
  readonly shown?: boolean;
  /** Where focus goes when the strip hides and focus is left on the body or the hidden button (a visible Board place). */
  readonly restoreFocus?: () => void;
}

const LEAVE_SETTLE_MS = 15_000;

export function Broadcast({ computers, read, area, shown = true, restoreFocus }: BroadcastProps) {
  const why = useMemo(() => unsupported(browserEnv(isFramed())), []);
  const [pick, setPick] = useState<string | undefined>(undefined);
  const chosen = pick && computers?.some((c) => c.id === pick) ? pick : computers?.[0]?.id;
  const { b, state, aliases } = useBroadcast(chosen);
  return <BroadcastView why={why} b={b} state={state} aliases={aliases} computers={computers} {...(read ? { read } : {})} chosen={chosen} onPick={setPick} area={area ?? null} shown={shown} {...(restoreFocus ? { restoreFocus } : {})} />;
}

/** The alias list as the panel reads it (a core query result in the page). */
export interface AliasesView {
  readonly data?: AliasList | null | undefined;
  readonly isSuccess: boolean;
  readonly isError: boolean;
  refetch(): unknown;
}

/** The leftover rows' remove change (useRemoveLink in the page). */
export type UseRemove = () => Pick<ReturnType<typeof useRemoveLink>, 'mutate' | 'readBack' | 'data' | 'isPending' | 'held'>;
/** The link extension change (useRenewLink in the page): a leftover whose extension an earlier panel left unknown is
 *  held under it, and only its own read-back frees it. */
export type UseRenew = () => Pick<ReturnType<typeof useRenewLink>, 'readBack' | 'held'>;

export interface BroadcastViewProps {
  readonly why: Unsupported | null;
  readonly b: Broadcaster | null;
  readonly state: BroadcastState;
  readonly aliases: AliasesView;
  /** Null: not read yet, or the first read failed (`read.failed`). */
  readonly computers: readonly BoardComputer[] | null;
  readonly read?: ComputersRead;
  readonly chosen: string | undefined;
  readonly onPick: (id: string) => void;
  readonly area: { readonly current: Element | null } | null;
  /** False while the strip is not on screen: the panel closes and cannot open. Default true. */
  readonly shown?: boolean;
  /** Where focus goes when the strip hides and focus is left on the body or the hidden button. */
  readonly restoreFocus?: () => void;
  /** Tests swap the router guard. */
  readonly Guard?: ComponentType<LeaveGuardProps>;
  readonly useRemove?: UseRemove;
  readonly useRenew?: UseRenew;
}

export function BroadcastView({ why, b, state, aliases, computers: list, read, chosen, onPick, area, shown = true, restoreFocus, Guard = LeaveGuard, useRemove = useRemoveLink, useRenew = useRenewLink }: BroadcastViewProps) {
  const t = useBT();
  const [open, setOpen] = useState(false);
  const running = b?.running ?? false;
  const overlay = useOverlayRoot(running && !shown);
  const [awayBar, setAwayBar] = useState<HTMLDivElement | null>(null);
  const phone = useIsPhone();
  const awayStart = useAwayAtBottom(overlay, awayBar, phone);
  // A hidden strip closes the panel in the same render (its popover is portaled to the body and would stay over the
  // Board, holding focus and the Board's keys); hidden, the trigger is not on screen, so it cannot open again.
  if (!shown && open) setOpen(false);
  // When the strip hides, focus that ends up nowhere is the Board's to place: the closed panel's focus falls to the
  // body, and react-aria's own restore (and a keyboard user resting on the button) aims at the button, now hidden.
  // One frame later, focus on the body or on this view's button goes to `restoreFocus`; focus anywhere else (the
  // leave ask over the panel, a tile) stays.
  const root = useRef<HTMLSpanElement>(null);
  const wasShown = useRef(shown);
  useLayoutEffect(() => {
    const hid = wasShown.current && !shown;
    wasShown.current = shown;
    if (!hid || !restoreFocus) return;
    const id = requestAnimationFrame(() => {
      const now = document.activeElement;
      if (!now || now === document.body || !!root.current?.contains(now)) restoreFocus();
    });
    return () => cancelAnimationFrame(id);
  }, [shown, restoreFocus]);

  // ---- leave guard ----
  const [leave, setLeave] = useState<{ proceed: () => void; reset: () => void } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const guarded = running || !!state.link || state.linkState === 'making' || state.linkState === 'unknown';
  const stopAndLeave = async () => {
    if (!b || !leave || leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    b.revoke();
    // Settled covers both: the stream ended, then the link's create and remove have outcomes.
    await settled(b, LEAVE_SETTLE_MS);
    const st = b.state;
    if (st.linkState !== 'removed' && st.linkState !== 'none' && st.linkState !== 'failed') showToast(st.linkState === 'removal-failed' ? { tone: 'error', title: t('link.removalFailed'), body: t('link.removalFailedFix') } : { tone: 'unknown', title: t('link.removalUnknown') });
    const go = leave.proceed;
    setLeave(null);
    leavingRef.current = false;
    setLeaving(false);
    go();
  };

  return (
    <span ref={root} className={s.trigger}>
      <Popover
        label={t('panel')}
        title={t('panel')}
        width="lg"
        placement="bottom end"
        phone="sheet"
        isOpen={open}
        onOpenChange={setOpen}
        {...(shown ? {} : { className: s.instant })}
        // A toolbar control in the strip's 32 scope: the camera alone, named Broadcast; while
        // live, the camera and the Live words are one press target into the panel, named by the words first (WCAG 2.5.3).
        trigger={
          running ? (
            <Button literal icon="video" variant="ghost" size="toolbar" aria-label={t('open.live', { live: chipText(t, state) })}>
              <LiveMark t={t} state={state} />
            </Button>
          ) : (
            <IconButton icon="video" label={t('open')} variant="ghost" size="toolbar" />
          )
        }
      >
        {why ? (
          <p className={s.muted}>{t(`unsupported.${why}`)}</p>
        ) : !b ? null : (
          <Panel t={t} b={b} state={state} computers={list} read={read} chosen={chosen} onPick={onPick} aliases={aliases} area={area} useRemove={useRemove} useRenew={useRenew} />
        )}
      </Popover>
      {/* The strip is off screen (narrow window, Focus): the broadcast still runs, so its Live mark and Stop stay reachable,
          over any open sheet or dialog too. While one is open the bar lives inside its root, so it is in the overlay's Tab
          cycle; React Aria's top layer keeps a press on it from counting as outside the overlay, as for toasts. */}
      {running && !shown && b && createPortal(
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- an Escape on Stop goes to the open overlay (escapeToOverlay)
        <div ref={setAwayBar} role="group" aria-label={t('away')} className={s.away} data-react-aria-top-layer="true"
          onKeyDown={overlay ? (e) => escapeToOverlay(e, overlay) : undefined}
          {...(overlay ? { 'data-in-overlay': '' } : {})}
          {...(phone ? { 'data-phone': '' } : {})}
          {...(overlay && awayStart !== null ? { 'data-at-bottom': '', style: { '--away-start': `${awayStart}px` } as CSSProperties } : {})}>
          <LiveMark t={t} state={state} />
          <Button variant="secondary" icon="stop" aria-label={t('stop')} isDisabled={state.phase === 'stopping'} onPress={() => b.stop()}>
            {t('away.stop')}
          </Button>
        </div>,
        overlay ?? document.body,
      )}
      {/* One leave at a time: a further leave while the first is ending the broadcast stays on the page. */}
      <Guard active={guarded} onBlock={(proceed, reset) => { if (leavingRef.current) reset(); else setLeave({ proceed, reset }); }} />
      <ConfirmDialog
        isOpen={!!leave}
        onOpenChange={(o) => { if (!o && !leaving) { leave?.reset(); setLeave(null); } }}
        title={t('leave.title')}
        body={leaving ? t('leave.waiting') : t('leave.body')}
        confirmLabel={t('leave.confirm')}
        cancelLabel={t('leave.stay')}
        busy={leaving}
        isDismissable={!leaving}
        onConfirm={() => void stopAndLeave()}
      />
    </span>
  );
}

/** The topmost open overlay's visible content root while `active`: React Aria portals each overlay into the body between
 *  its focus scope's start and end markers, and its focus containment cycles through those nodes. A desktop Popover puts
 *  an inert full-screen underlay first, so the root is the scope node that holds the scope's first focusable and is
 *  neither inert nor aria-hidden. Null when none is open. */
function useOverlayRoot(active: boolean): HTMLElement | null {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!active) { setRoot(null); return; }
    const find = () => {
      const starts = document.body.querySelectorAll(':scope > [data-focus-scope-start]');
      let pick: HTMLElement | null = null;
      for (let n = starts[starts.length - 1]?.nextElementSibling ?? null; n && !n.hasAttribute('data-focus-scope-end'); n = n.nextElementSibling) {
        if (!(n instanceof HTMLElement) || n.closest(HIDDEN)) continue;
        const first = [...n.querySelectorAll(FOCUSABLE)].find((e) => !e.closest(HIDDEN) && !e.closest(`.${s.away}`));
        if (first) { pick = n; break; }
      }
      setRoot(pick);
    };
    find();
    const watch = new MutationObserver(find);
    watch.observe(document.body, { childList: true });
    return () => watch.disconnect();
  }, [active]);
  return root;
}
/** The bar sits in the overlay's root but outside its dialog, where the overlay listens for Escape:
 *  an Escape on the bar is sent on to the first dialog in that root, the overlay's own (a sub-dialog a Popover opens later
 *  in its root keeps focus inside itself, and React Aria closes only the topmost overlay). The overlay then decides as for
 *  an Escape from inside: it closes, or stays when it refuses a keyboard dismiss, and a modified or held Escape does
 *  nothing there. Never Stop's: the broadcast keeps running. */
function escapeToOverlay(e: ReactKeyboardEvent<HTMLElement>, overlay: HTMLElement) {
  if (e.key !== 'Escape' || e.defaultPrevented || e.nativeEvent.isComposing) return;
  const dialog = overlay.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
  if (!dialog) return;
  e.preventDefault();
  e.stopPropagation();
  const { code, repeat, shiftKey, ctrlKey, altKey, metaKey } = e.nativeEvent;
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code, repeat, shiftKey, ctrlKey, altKey, metaKey, bubbles: true, cancelable: true }));
}
const HIDDEN = '[inert], [aria-hidden="true"]';
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]';

/** Inside an overlay on desktop, when the scrim the overlay leaves open at the start is narrower than the bar plus 16 px
 *  (a Drawer on a narrow window, a dialog or popover near the start), the bar moves to the viewport's bottom, centred over
 *  the overlay's panel: this returns the bar's inline-start offset for that (`--away-start`), kept inside the viewport,
 *  or null for the usual placement. Re-measured when the window, the panel or the bar resizes (its live text changes
 *  width), when the panel's positioned parent moves (React Aria places a Popover by its style) and when the overlay's
 *  entry animation ends (it slides the panel in, which no resize reports). */
function useAwayAtBottom(root: HTMLElement | null, bar: HTMLElement | null, phone: boolean): number | null {
  const [start, setStart] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!root || !bar || phone) { setStart(null); return; }
    const panel = root.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
    if (!panel) { setStart(null); return; }
    const measure = () => {
      const p = panel.getBoundingClientRect();
      const rtl = getComputedStyle(bar).direction === 'rtl';
      const w = bar.offsetWidth;
      const exposed = rtl ? window.innerWidth - p.right : p.left;
      const centre = rtl ? window.innerWidth - (p.left + p.width / 2) : p.left + p.width / 2;
      setStart(exposed < w + 16 ? Math.round(Math.min(Math.max(centre - w / 2, 8), window.innerWidth - w - 8)) : null);
    };
    measure();
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    watch?.observe(panel);
    watch?.observe(bar);
    const moved = new MutationObserver(measure);
    if (panel.parentElement) moved.observe(panel.parentElement, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', measure);
    root.addEventListener('animationend', measure);
    return () => { watch?.disconnect(); moved.disconnect(); window.removeEventListener('resize', measure); root.removeEventListener('animationend', measure); };
  }, [root, bar, phone]);
  return start;
}

/** Resolves once the broadcast is settled (Broadcaster.settled: the stream ended, the link's create then remove
 *  have outcomes), at most `ms` later. */
function settled(b: Broadcaster, ms: number): Promise<void> {
  const done = () => b.settled;
  if (done()) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    const off = b.subscribe(() => { if (done()) finish(); });
    function finish() { clearTimeout(timer); off(); resolve(); }
  });
}

function chipText(t: T, st: BroadcastState): string {
  if (st.phase === 'stopping') return t('chip.ending');
  if (st.phase !== 'live') return t('chip');
  return st.status.viewers === null ? t('chip.unknown') : t('chip.viewers', { count: st.status.viewers });
}

function LiveMark({ t, state }: { t: T; state: BroadcastState }) {
  return (
    <span className={cx(s.live, state.phase === 'stopping' && s.ending)}>
      <span className={s.dot} aria-hidden="true" />
      <span className={s.liveText}>{chipText(t, state)}</span>
    </span>
  );
}

interface PanelProps {
  t: T;
  b: Broadcaster;
  state: BroadcastState;
  computers: readonly BoardComputer[] | null;
  read: ComputersRead | undefined;
  chosen: string | undefined;
  onPick: (id: string) => void;
  aliases: AliasesView;
  area: { readonly current: Element | null } | null;
  useRemove: UseRemove;
  useRenew: UseRenew;
}

function Panel({ t, b, state, computers: known, read, chosen, onPick, aliases, area, useRemove, useRenew }: PanelProps) {
  const [ok, setOk] = useState(false);
  const [audio, setAudio] = useState(false);
  const choice = useComputerChoice();
  const running = b.running;
  // One rule with the alias list's computer (useBroadcast): the broadcast keeps its computer while it may own a link.
  const computers = known ?? [];
  const locked = holdsComputer(state);
  const computer = (locked && state.computer ? state.computer.id : chosen) ?? '';
  const target = computers.find((c) => c.id === computer) ?? (state.computer && state.computer.id === computer ? state.computer : undefined);
  const aliasesReady = aliases.isSuccess;
  const canStart = !running && !!target && ok && aliasesReady && !locked;
  // Why Start is off, said on the button (soft-disabled): the first thing the person can act on. A running or held
  // broadcast has its own lines.
  const startWhy = running || locked ? undefined
    : !target ? t('start.needComputer')
    : aliases.isError ? t('aliases.down')
    : !ok ? t('start.needOk')
    : !aliasesReady ? t('aliases.loading')
    : undefined;

  const start = () => {
    if (!target) return;
    void b.start({ id: target.id, name: target.name, project_id: target.project_id, server_name: target.server_name }, { audio, area: area?.current ?? null });
    setOk(false);
  };

  // Unknown is never shown as none: "no computers" only after a successful, whole, empty read. A broadcast that holds its
  // computer keeps its panel whatever the list says.
  if (!state.computer && known === null) {
    return read?.failed
      ? <ErrorState size="sm" error={read.error} title={t('computer.failed')} onRetry={() => read.retry()} />
      : <Skeleton variant="text" rows={2} immediate />;
  }
  // An empty list says "none" only when the read behind it succeeded and is the whole list.
  if (!computers.length && !state.computer) {
    if (read?.failed) return <ErrorState size="sm" error={read.error} title={t('computer.failed')} onRetry={() => read.retry()} />;
    if (read?.complete === false) return <ErrorState size="sm" /* noDetails: a partial list is not a rejection; no error to show */ title={t('computer.partial')} onRetry={() => read.retry()} />;
    return <p className={s.muted}>{t('computer.none')}</p>;
  }

  return (
    <div className={s.panel}>
      {!running && state.phase !== 'ended' && <p className={s.muted}>{t('intro')}</p>}
      <PickerField label={t('computer')} description={t('computer.hint')}>
        <ComputerPicker label={t('computer')} computers={computers.map((c) => choice(c))} value={computer || undefined} onChange={onPick} isDisabled={locked} />
      </PickerField>
      {state.startError && (
        <Band size="table" tone="warn" onDismiss={() => b.dismissError()}>
          {t(`error.${state.startError}`)}
        </Band>
      )}
      {running ? <LiveBlock t={t} b={b} state={state} /> : state.phase === 'ended' && state.end && <EndLine t={t} state={state} />}
      <LinkBlock t={t} b={b} state={state} />
      {!running && (
        <>
          <Notice level="warn">{t('warn.body')}</Notice>
          <Checkbox label={t('warn.ok')} isSelected={ok} onChange={setOk} />
          <Checkbox label={t('audio')} isSelected={audio} onChange={setAudio} />
          {aliases.isError ? (
            <Band size="table" tone="warn" actions={<Button size="sm" variant="ghost" onPress={() => void aliases.refetch()}>{t('retry')}</Button>}>
              {t('aliases.down')}
            </Band>
          ) : !aliasesReady && target ? (
            <p className={s.muted}>{t('aliases.loading')}</p>
          ) : null}
          {/* Start waits only for the tick: say so beside the button (the box sits next to an optional one). */}
          {!ok && !!target && aliasesReady && !locked ? <Notice>{t('start.needOk')}</Notice> : null}
          <div className={s.actions}>
            <Button variant="primary" isDisabled={!canStart} {...(startWhy ? { disabledReason: startWhy } : {})} onPress={start}>
              {t('start')}
            </Button>
          </div>
        </>
      )}
      {target && <Leftovers t={t} computer={target.id} current={state.link?.id ?? null} rows={aliases.data?.rows ?? []} useRemove={useRemove} useRenew={useRenew} />}
    </div>
  );
}

function LiveBlock({ t, b, state }: { t: T; b: Broadcaster; state: BroadcastState }) {
  const now = useNow(state.phase === 'live');
  const st = state.status;
  return (
    <>
      <div className={s.status}>
        <LiveMark t={t} state={state} />
        {state.phase === 'live' && <span>{st.viewers === null ? t('viewers.unknown') : t('viewers', { count: st.viewers })}</span>}
        {state.phase === 'live' && st.since !== null && <span className={s.muted}>{t('since', { time: clock(now - st.since) })}</span>}
      </div>
      {state.phase === 'picking' && <p className={s.muted}>{t('state.picking')}</p>}
      {state.phase === 'connecting' && <p className={s.muted}>{t('state.connecting')}</p>}
      {state.phase === 'stopping' && <p className={s.muted}>{t('state.stopping')}</p>}
      {state.confined && state.phase !== 'stopping' && <p className={s.muted}>{t(`confined.${state.confined}`)}</p>}
      <div className={s.actions}>
        <Button variant="secondary" icon="stop" isDisabled={state.phase === 'stopping'} onPress={() => b.stop()}>
          {t('stop')}
        </Button>
      </div>
    </>
  );
}

function EndLine({ t, state }: { t: T; state: BroadcastState }) {
  const end = state.end;
  if (!end) return null;
  const tone = end.reason === 'stopped' ? 'neutral' : 'warn';
  return (
    <Band size="table" tone={tone}>
      {t(`end.${end.reason}`)}
      {end.line ? ' ' + t('end.detail', { line: end.line }) : ''}
    </Band>
  );
}

function LinkBlock({ t, b, state }: { t: T; b: Broadcaster; state: BroadcastState }) {
  const ls = state.linkState;
  if (ls === 'none') return null;
  const check = (fn: () => Promise<void>) => <Button size="sm" variant="ghost" onPress={() => void fn()}>{t('check')}</Button>;
  if (ls === 'making') return <p className={s.muted}>{t('link.making')}</p>;
  if (ls === 'unknown') return <Band size="table" tone="warn" actions={check(() => b.checkLink())}>{t('link.unknown')}</Band>;
  if (ls === 'failed') return <Band size="table" tone="danger" actions={state.phase === 'live' ? <Button size="sm" variant="ghost" onPress={() => b.retryLink()}>{t('retry')}</Button> : undefined}>{t('link.failed')}</Band>;
  if (ls === 'removed') return <p className={s.muted}>{t('link.removed')}</p>;
  if (ls === 'not-found') return <p className={s.muted}>{t('link.notFound')}</p>;
  const link = state.link;
  return (
    <div>
      <p className={s.sub}>{t('link')}</p>
      {link && (
        <div className={s.link}>
          <span className={s.url} title={link.url}>{link.url}</span>
          <CopyButton text={link.url} label={t('link.copy')} />
          <QrButton url={link.url} name={t('link.qr')} secret={false} keyed reach={{ text: t('link.qrWarn') }} size="sm" />
        </div>
      )}
      {ls === 'ready' && state.linkUntil && (state.renew === 'ok'
        ? <p className={s.muted}>{t('link.until', { time: formatDateTime(state.linkUntil) })}</p>
        : <Band size="table" tone="warn">{t(state.renew === 'unknown' ? 'link.renewUnknown' : 'link.renewFailed', { time: formatDateTime(state.linkUntil) })}</Band>)}
      {ls === 'removing' && <p className={s.muted}>{t('link.removing')}</p>}
      {ls === 'removal-unknown' && <Band size="table" tone="warn" actions={check(() => b.checkRemoval())}>{t('link.removalUnknown')}</Band>}
      {ls === 'removal-failed' && <Band size="table" tone="danger" actions={<Button size="sm" variant="ghost" onPress={() => b.retryRemove()}>{t('retry')}</Button>}>{t('link.removalFailed')}</Band>}
    </div>
  );
}

function Leftovers({ t, computer, current, rows, useRemove, useRenew }: { t: T; computer: string; current: string | null; rows: readonly BroadcastAlias[]; useRemove: UseRemove; useRenew: UseRenew }) {
  const left = rows.filter((a) => a.id !== current);
  if (!left.length) return null;
  return (
    <div>
      <p className={s.sub}>{t('leftover.title')}</p>
      <p className={s.muted}>{t('leftover.hint')}</p>
      <ul className={s.leftovers}>
        {left.map((a) => <LeftoverRow key={a.id} t={t} computer={computer} alias={a} useRemove={useRemove} useRenew={useRenew} />)}
      </ul>
    </div>
  );
}

function LeftoverRow({ t, computer, alias, useRemove, useRenew }: { t: T; computer: string; alias: BroadcastAlias; useRemove: UseRemove; useRenew: UseRenew }) {
  const m = useRemove();
  const ext = useRenew();
  const sent = useRef(false);
  const outcome = m.data?.outcome;
  // Unknown also when an earlier mount's turn-off of this alias is still held (core keeps it across remounts).
  const mine = (h: { identity: unknown }) => (h.identity as { alias?: unknown } | null)?.alias === alias.id;
  const renewHeld = ext.held().some(mine);
  const heldHere = m.held().some(mine) || renewHeld;
  // A turn-off refused for a hold (not sent) waits only while a hold is still there; once it is freed, Try again.
  const unknown = heldHere || outcome === 'pending' || outcome === 'stale';
  const failed = outcome === 'failed' || (outcome === 'not_sent' && !unknown);
  const [checking, setChecking] = useState(false);
  const when = alias.createdAt ? formatRelative(alias.createdAt) : '';
  return (
    <li className={s.leftover}>
      <span title={alias.expiresAt ? t('link.expires', { time: formatDateTime(alias.expiresAt) }) : undefined}>
        {expired(alias, Date.now()) ? t('leftover.expired') : t('leftover.row', { time: when })}
      </span>
      {unknown ? (
        <>
          <span>{t('leftover.unconfirmed')}</span>
          <Button size="sm" variant="ghost" busy={checking} onPress={() => { setChecking(true); void (renewHeld ? ext.readBack() : m.readBack()).finally(() => setChecking(false)); }}>
            {t('check')}
          </Button>
        </>
      ) : (
        <>
          {failed && <span>{t('leftover.failed')}</span>}
          <Button
            size="sm"
            tone="danger"
            busy={m.isPending}
            isDisabled={outcome === 'done'}
            onPress={() => { if (m.isPending || (sent.current && !failed)) return; sent.current = true; m.mutate({ computer, alias: alias.id }); }}
          >
            {failed ? t('retry') : t('leftover.remove')}
          </Button>
        </>
      )}
    </li>
  );
}
