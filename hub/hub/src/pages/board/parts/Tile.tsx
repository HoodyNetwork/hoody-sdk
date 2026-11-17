// One tile: header (label, live dot, hint, actions) and body (frame, or a card, never a broken
// frame). The same component draws the program view's solo tile with its own card actions.
//
// Contract, in plain words:
//   - The header is a plain element (never a button: the shell gives Enter and arrows to a focused button), and the
//     drag handle; a click on it (no drag) makes the tile active and enters the program. Only its icons are
//     buttons. ↗ is a real link to the share address (no Board options, no token).
//   - While the program has the keys (inside), the root carries data-hub-keys="frame" so the shell's keys stand
//     aside, and the header hint says how to leave: Escape on the tile bar, Ctrl+Alt+B where the program forwards
//     it (parentKeys), or focus moving outside the tile. On a coarse pointer it names no key: a tap outside the
//     tile leaves.
//   - A Bot tile while its computer runs: the Bots page's tile view for that Bot (contributed by the shell), or,
//     when this Hub does not serve the Bots page, a card saying so with the card actions (Remove). Other states: the
//     computer's cards, as for any computer tile.
//   - Body by state: live → the frame (skeleton until loaded, the kit's warn band over it after 20 s); stopped /
//     starting / attention / gone / unknown → a card (TileCard: the kit's small empty state on the card ground). Start and Resume only through core's shared lifecycle change (power,
//     lifecycle.ts): while it may have gone through, the card reads "Starting…" (pending: Check again, a read).
//     "Needs a look" is split by the raw status: failed, expired (→ Billing), suspended, any other.
//   - An SSH tile's frame waits for SshGate (the session still is that ssh); otherwise the gate's card shows.
//   - An agent frame signs in with core's boot token on each mount (SignedFrame); the share URL never has it.
//   - "Back to Board" follows the frame in the tab order (visually hidden until focused); it hands the keyboard
//     back to the Board surface.
//   - Which computer: the header's inline-start stripe and a square mark before the computer name are the
//     computer's own colour (core computerColor, read again here: no raw value reaches a style); in All realms a realm
//     chip (cut name, a button whose popover shows the full name) follows the name, and the group's accessible name
//     ends with the realm. The header and the tile act only on pointer events whose target is inside their own DOM: a
//     press in the chip's popover (a portal, still inside this tree for React) never drags, enters or picks the body.
//   - A terminal, display or web port tile with an app launch at its place (useLaunchHeld) not proven yet shows "may still be starting"
//     with Check instead of its frame (the apps launcher's TileHold, loaded on demand) until a read proves it.
//   - A conversation tile (tileInfo `conv`) while its computer runs: the conversation itself, drawn natively
//     (ConvTile, read only), never a frame; its FrameHandle is the native body. Other states: the computer's cards.
//   - Header order: name · computer, realm chip, ⇕ session (beside the name it changes), the state dot; then one
//     group of actions at the end: options, maximise, reload, open-out, ⋯. Saved options are a count on the options
//     button (a 6 px dot and the number; its name "Options for X (N changed)"), no separate chip. No key cap shows:
//     keys are in tooltips, and in aria-keyshortcuts on the active tile only (the Board's keys act on the active
//     tile; the tile menu's rows keep their caps).
//   - The realm chip is a kit Button (`literal`: a realm's name is the person's own text) around the kit RealmChip.
import { botKeyOf, computerColor } from '@core';
import { ActionMenu, Band, Button, ComputerMark, ConfirmDialog, CopyButton, IconButton, LinkButton, Outcome, Popover, RealmChip, Tooltip, cx, pressClasses, useContributions, useMedia, type IconName, type MenuEntry } from '@kit';
import { lazy, Suspense, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react';
import { useT, type T } from './text';
import s from './board.module.css';
import type { FrameHandle, FrameState } from './Frame';
import type { Power } from './lifecycle';
import { SignedFrame } from './SignedFrame';
import { SshGate } from './SshGate';
import { cutMiddle, groupLabel, type TileInfo } from './tileInfo';
import { ConvTile } from './ConvTile';
import { TileCard } from './TileCard';
import { framedHere, hostOf } from './outside';
import { isBotTile, isPortTile, isProgramTile, isUrlTile, type BotTile } from '../model/boards';
import { loadLauncher, useLaunchHeld, type AnyTile, type HoldComputer } from '../../apps/links';

const TileHold = lazy(() => loadLauncher().then((m) => ({ default: m.TileHold })));

/** A tile's frame, or the apps launcher's hold around it while a launch sits at its place (useLaunchHeld is
 *  synchronous and needs no launcher chunk, so a plain tile's frame mounts at once; only a held tile waits on the
 *  lazy TileHold, and shows its hold card rather than the program until a read proves the launch). */
function LaunchGate({ computer, tile, children }: { computer: HoldComputer | null | undefined; tile: AnyTile | null | undefined; children: ReactNode }) {
  if (!useLaunchHeld(computer, tile)) return <>{children}</>;
  return (
    <Suspense fallback={<div className={s.skeleton} aria-hidden="true"><i /><i /><i /></div>}>
      <TileHold computer={computer ?? null} tile={tile ?? null}>
        {children}
      </TileHold>
    </Suspense>
  );
}

/** A Bot tile's body: the Bots page's own tile view for the Bot's key; `fallback` when this Hub does not serve
 *  the Bots page (its view is not contributed). */
function BotView({ tile, fallback }: { tile: BotTile; fallback: ReactNode }) {
  const view = useContributions().tileViews.find((v) => v.pageId === 'bots' && v.id === 'bot');
  if (!view) return <>{fallback}</>;
  const View = view.Component;
  return (
    <Suspense fallback={<div className={s.skeleton} aria-hidden="true"><i /><i /><i /></div>}>
      <div className={s.botView}>
        <View target={botKeyOf(tile.computer, tile.realm, tile.bot)} />
      </div>
    </Suspense>
  );
}

/** A link to the page that sent a held change (its name, for the button and the body). */
export interface HeldFromLink { readonly name: string; readonly go: () => void }

export interface TileProps {
  info: TileInfo;
  domId: string;
  style?: CSSProperties;
  active: boolean;
  maximised: boolean;
  /** Kept mounted but out of sight (maximise, one at a time): its session keeps running. */
  hidden: boolean;
  solo?: boolean;
  narrow: boolean;
  /** The keys go to this tile's program (the lock): the root carries data-hub-keys="frame", so the shell's
   *  global and page keys stand aside, and the header shows the lock and how to leave. */
  inside: boolean;
  /** Escape on the tile itself (header, buttons) while locked: leave the program, back to the Board keys. */
  onLeave?: () => void;
  reloadKey: number;
  frameState: FrameState;
  frameRef: Ref<FrameHandle>;
  /** Tooltips show these keys only on the Board (not in the program view). */
  keys: boolean;
  menu: readonly MenuEntry[];
  menuOpen: boolean;
  onMenuOpen: (open: boolean) => void;
  onActivate: () => void;
  /** Drag feedback: 'hold' while a touch press waits for its hold (a bar fills the header), 'press' while a
   *  draggable header is held or dragged (grabbing cursor, selected header, accent outline). */
  pressed?: 'hold' | 'press';
  onHeadPointerDown?: (e: ReactPointerEvent) => void;
  /** A pointer pressed on the tile outside its header (the body, its border): the Board enters a live tile on its
   *  release, unless the press was on a control. */
  onBodyPointerDown?: (e: ReactPointerEvent) => void;
  onMax?: () => void;
  onReload: () => void;
  onFrameState: (s: FrameState) => void;
  onRegister: (win: Window | null, origin: string) => void;
  onBack: () => void;
  onRetry: () => void;
  /** Card actions that differ between the Board and the program view. */
  cardActions: ReactNode;
  /** Opens the tile's computer on the Computers page (null: no way to get there from this load). */
  onOpenComputers: (() => void) | null;
  /** The page that sent a held change another page sent, when this load serves it (null: no link, the card says
   *  "the page that sent it"). Never a classic fallback: the classic Hub cannot show the hold. */
  heldFrom: HeldFromLink | null;
  /** Opens Billing (an expired computer); null: no way to get there from this load. */
  onOpenBilling: (() => void) | null;
  /** Start / Resume for a stopped or paused computer, or a held lifecycle change of it (null: none). */
  power: Power | null;
  /** Saved options of this tile: a count on the options button; 0 shows none. */
  changed?: number;
  onOptions?: () => void;
  /** Change session of a program tile: a button for it beside the header's name, then an Options button
   *  (onOptions); a narrow tile drops both ("…" has both). */
  onSession?: () => void;
  /** The header's extra content (the program view's Add to Board). */
  headExtra?: ReactNode;
}

/** The stripe's colour: the computer's, normalised here again (the stripe is a style sink); none falls back in CSS. */
function stripeStyle(color: string | null): CSSProperties | undefined {
  const c = computerColor({ color: color ?? undefined });
  return c ? ({ '--board-computer': c } as CSSProperties) : undefined;
}

const DOT_CLASS: Record<string, string | undefined> = { loading: s.dotLoading, loaded: s.dotLoaded, slow: s.dotSlow, stopped: s.dotStopped };

export function Tile(p: TileProps) {
  const t = useT();
  const coarse = useMedia('(pointer: coarse)');
  const head = useRef<HTMLDivElement>(null);
  const { info } = p;
  // A live Bot tile has no frame: the Bots page's view is its body (loaded once drawn; Reload remounts it).
  const botLive = info.state === 'live' && isBotTile(info.tile);
  // A live conversation tile has no frame either: its body is the conversation itself (ConvTile).
  const convLive = info.state === 'live' && !!info.conv && !!info.computer;
  const live = (info.state === 'live' && !!info.url) || botLive || convLive;
  const shown = botLive || convLive ? 'loaded' : p.frameState;
  const dot = live ? shown : 'stopped';
  const dotTip = live ? (info.unchecked ? t('tile.dot.unchecked') : t('tile.dot.' + shown)) : t('tile.dot.stopped');
  return (
    // The group's Escape leaves a locked program (focus on the header or its buttons); the Board's keys are elsewhere.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      id={p.domId}
      role="group"
      aria-label={groupLabel(info, t)}
      className={cx(s.tile, p.active && s.active, p.hidden && s.hidden, p.solo && s.solo, p.narrow && s.narrow, pressClasses(p.pressed).card)}
      style={p.style}
      {...(p.hidden ? { inert: true, 'aria-hidden': true } : {})}
      {...(p.inside ? { 'data-hub-keys': 'frame' } : {})}
      {...(p.pressed === 'hold' ? { 'data-pressed': 'hold' } : p.pressed === 'press' ? { 'data-pressed': 'press' } : {})}
      onPointerDownCapture={p.onActivate}
      onPointerDown={p.onBodyPointerDown ? (e) => { if (e.currentTarget.contains(e.target as Node) && !head.current?.contains(e.target as Node)) p.onBodyPointerDown?.(e); } : undefined}
      onKeyDown={p.inside && p.onLeave ? (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); p.onLeave?.(); } } : undefined}
    >
      {/* The header is the drag handle; a click on it (no drag) enters the program, its keyboard twins are the Board keys. */}
      <div ref={head} className={cx(s.head, pressClasses(p.pressed).head)} style={pressClasses(p.pressed).headStyle} onPointerDown={p.onHeadPointerDown ? (e) => { if (head.current?.contains(e.target as Node)) p.onHeadPointerDown?.(e); } : undefined}>
        <span className={s.stripe} aria-hidden="true" style={stripeStyle(info.color)} />
        <span className={s.label}>
          <span className={s.labelName}>{info.name}</span>
          <span aria-hidden="true">·</span>
          <ComputerMark color={info.color} className={s.labelMark} />
          <span className={s.labelComputer}>{info.computerName}</span>
          {info.suffix && <span>{info.suffix.trim()}</span>}
        </span>
        {/* The realm chip takes at most half the head, so a long realm name never pushes the head's controls out. */}
        {info.realm && (
          <span className={s.realmSlot}>
            <Popover
              label={t('tile.realm')}
              title={t('tile.realm')}
              width="sm"
              trigger={
                <Button size="sm" variant="ghost" literal shrink excludeFromTabOrder={!p.active}>
                  <RealmChip realm={{ name: cutMiddle(info.realm.name), ...(info.realm.tint ? { color: info.realm.tint } : {}) }} />
                </Button>
              }
            >
              <p className={s.realmFull}>{info.realm.name}</p>
            </Popover>
          </span>
        )}
        {/* Beside the title, not on it: a click on the header's text still enters the program. */}
        {p.onSession && !p.narrow && (
          <IconButton icon="chevrons-up-down" label={t('tile.sessionOf', { name: info.name })} size="sm" onPress={p.onSession} excludeFromTabOrder={!p.active} />
        )}
        <span className={cx(s.dot, DOT_CLASS[dot])} role="img" aria-label={dotTip} title={dotTip} />
        {p.inside && <span className={s.hint}>{coarse ? t('tile.hintTouch') : info.parentKeys ? t('tile.hintKeys') : t('tile.hintTab')}</span>}
        <span className={s.actions}>
          {p.headExtra}
          {p.onOptions && !p.narrow && (p.onSession || !!p.changed) && <OptionsButton p={p} t={t} />}
          {p.onMax && <IconButton icon={p.maximised ? 'minimize' : 'maximize'} label={p.maximised ? t('tile.restore') : t('tile.maximise')} shortcut={p.keys ? 'Z' : undefined} {...(p.keys && p.active ? { 'aria-keyshortcuts': 'Z' } : {})} size="sm" onPress={p.onMax} excludeFromTabOrder={!p.active} />}
          <IconButton icon="reload" label={t('tile.reload')} shortcut="R" {...(p.active ? { 'aria-keyshortcuts': 'R' } : {})} size="sm" onPress={p.onReload} isDisabled={!live} excludeFromTabOrder={!p.active} />
          {info.shareUrl ? (
            <Tooltip content={t('tile.openNew')}>
              <LinkButton href={info.shareUrl} variant="ghost" size="sm" icon="external" aria-label={t('tile.openNew')} />
            </Tooltip>
          ) : null}
          <ActionMenu items={p.menu} label={t('tile.menu')} size="sm" placement="bottom end" isOpen={p.menuOpen} onOpenChange={p.onMenuOpen} />
        </span>
      </div>
      <div className={s.body}>{body(p, live, t)}</div>
    </div>
  );
}

/** Options: the options icon button; with saved options a button with the same icon, a 6 px dot and the count,
 *  named "Options for X (N changed)". Its tooltip is that name (kit `nameTooltip`), so the page adds no tooltip text.
 *  O shows in the tooltip with the Board's keys on (as before), and in aria-keyshortcuts only on the active tile (the
 *  key acts on the active tile); never a key cap. */
function OptionsButton({ p, t }: { p: TileProps; t: T }) {
  const name = p.info.name;
  const keys = p.keys && p.active ? { 'aria-keyshortcuts': 'O' } : {};
  if (!p.changed) return <IconButton icon="sliders" label={t('tile.optionsFor', { name })} shortcut={p.keys ? 'O' : undefined} {...keys} size="sm" onPress={p.onOptions} excludeFromTabOrder={!p.active} />;
  return (
    <Button size="sm" variant="ghost" icon="sliders" literal aria-label={t('tile.optionsChanged', { name, count: p.changed })} nameTooltip={p.keys ? { shortcut: 'O' } : true} {...keys} onPress={p.onOptions} excludeFromTabOrder={!p.active}>
      <span className={s.optCount}>
        <span className={s.optDot} aria-hidden="true" />
        {/* A number, read as data (the anatomy's explanation walk counts Number() as data, a bare prop read as unknown). */}
        {Number(p.changed)}
      </span>
    </Button>
  );
}

function body(p: TileProps, live: boolean, t: T): ReactNode {
  const { info } = p;
  const vars = { name: info.name, computer: info.computerName };
  const card = (title: string, text: string, actions: ReactNode, icon: IconName = 'computer') => <TileCard icon={icon} title={title} body={text} actions={actions} />;
  // A web tile the Hub's frame policy refuses (any outside site): the tile's own card (as a stopped computer's),
  // never a frame the browser would refuse.
  if (live && info.url && isUrlTile(info.tile) && !framedHere(info.url)) {
    return card(t('tile.blocked'), t('tile.blockedBody', { host: hostOf(info.url) }), (
      <>
        <LinkButton href={info.url} variant="secondary" iconEnd="external">
          {t('tile.openNew')}
        </LinkButton>
        <CopyButton text={info.url} label={t('tile.copyLink')} withLabel />
      </>
    ), 'globe');
  }
  if (live && info.url) {
    const frame = (
      <>
        <SignedFrame key={p.reloadKey} ref={p.frameRef} agent={!!info.tile && isProgramTile(info.tile) && info.tile.program === 'agent'} foreign={isUrlTile(info.tile) || isPortTile(info.tile)} page={isUrlTile(info.tile) || isPortTile(info.tile)} name={info.name} src={info.url} title={info.title} inTabOrder={p.active && !p.hidden} onState={p.onFrameState} register={p.onRegister} />
        {p.frameState === 'loading' && (
          <div className={s.skeleton} aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        )}
        {p.frameState === 'slow' && (
          <Band
            tone="warn"
            size="table"
            over
            /* noDetails: the frame has not answered; there is no rejection to show */
            actions={
              <>
                <Button size="sm" variant="secondary" onPress={p.onReload}>
                  {t('tile.reload')}
                </Button>
                {info.shareUrl ? (
                  <LinkButton size="sm" href={info.shareUrl} iconEnd="external">
                    {t('tile.openNew')}
                  </LinkButton>
                ) : null}
              </>
            }
          >
            {t('tile.slow', vars)}
          </Band>
        )}
        {p.power?.pending && p.power.heldOp && <HeldCard power={p.power} name={info.name} actions={null} t={t} band heldFrom={p.heldFrom} />}
        <span className={s.back}>
          <Button size="sm" variant="secondary" onPress={p.onBack}>
            {t('tile.back')}
          </Button>
        </span>
      </>
    );
    // An SSH tile opens its frame only while terminal-N still is that ssh (a fresh attach starts a plain shell).
    const gated = info.computer && isProgramTile(info.tile) && info.tile.ssh ? (
      <SshGate computer={info.computer} session={info.tile.session} ssh={info.tile.ssh} name={info.name} reloadKey={p.reloadKey} actions={p.cardActions}>
        {frame}
      </SshGate>
    ) : frame;
    return (
      <LaunchGate computer={info.computer} tile={info.tile}>
        {gated}
      </LaunchGate>
    );
  }
  const raw = String(info.computer?.status ?? '').toLowerCase();
  const paused = raw === 'paused';
  const pw = p.power;
  const openBilling = p.onOpenBilling ? (
    <Button variant="secondary" onPress={p.onOpenBilling}>
      {t('tile.openBilling')}
    </Button>
  ) : null;
  const openComputers = p.onOpenComputers ? (
    <Button variant="secondary" onPress={p.onOpenComputers}>
      {t('tile.openComputers')}
    </Button>
  ) : null;
  // A conversation tile while its computer runs: the conversation, natively (no frame, no address of the Hub in itself).
  if (live && info.conv && info.computer) {
    return (
      <>
        <ConvTile key={p.reloadKey} ref={p.frameRef} conv={info.conv} computer={info.computer} inside={p.inside} hidden={p.hidden}
          fallback={card(t('tile.convUnavailableTitle'), t('tile.convUnavailableBody'), info.shareUrl ? <LinkButton href={info.shareUrl} variant="secondary" iconEnd="external">{t('tile.openInAi')}</LinkButton> : null, 'info')} />
        {pw?.pending && pw.heldOp && <HeldCard power={pw} name={info.name} actions={null} t={t} band heldFrom={p.heldFrom} />}
      </>
    );
  }
  // A Bot tile while its computer runs: the Bots page's tile view (no frame, no address); a Hub without the Bots page
  // says so in a card. A lifecycle change that may have gone through is the same band as over a live frame.
  if (live && isBotTile(info.tile)) {
    return (
      <>
        <BotView key={p.reloadKey} tile={info.tile} fallback={card(t('tile.botUnavailableTitle', vars), t('tile.botUnavailableBody'), p.cardActions, 'info')} />
        {pw?.pending && pw.heldOp && <HeldCard power={pw} name={info.name} actions={null} t={t} band heldFrom={p.heldFrom} />}
      </>
    );
  }
  // A lifecycle change of this computer that may have gone through (any page): Check again (a read; none for a
  // restart, which no read proves) and the warned Dismiss, on every card; over a live frame it is a band (a stop,
  // pause or restart sent elsewhere whose answer was lost: the frame stays, the band says it may have gone through).
  if (pw?.pending && pw.heldOp && info.state !== 'live' && info.state !== 'gone') {
    return <HeldCard power={pw} name={info.name} actions={p.cardActions} t={t} heldFrom={p.heldFrom} />;
  }
  switch (info.state) {
    case 'live':
      // Running, but no address can be built here (no proxy domain, the catalogue refused it, or it is loading).
      return info.refused ? card(t('tile.refused', vars), t('tile.noAddress'), p.cardActions, 'warn') : (
        <div className={s.skeleton} aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      );
    case 'stopped': {
      if (pw?.busy) return card(t(paused ? 'tile.resumingTitle' : 'tile.startingTitle', vars), t('tile.startingBody', vars), p.cardActions);
      const press = pw?.op ? (
        <Button variant={p.solo ? 'primary' : 'secondary'} onPress={pw.run}>
          {t(pw.op === 'resume' ? 'tile.resume' : 'tile.start')}
        </Button>
      ) : openComputers;
      return card(t(paused ? 'tile.pausedTitle' : 'tile.stoppedTitle', vars), t(paused ? 'tile.pausedBody' : 'tile.stoppedBody', vars), (
        <>
          {pw?.outcome && <Outcome outcome={pw.outcome} />}
          {press}
          {p.cardActions}
        </>
      ));
    }
    case 'starting':
      return card(t('tile.startingTitle', vars), t('tile.startingBody', vars), p.cardActions);
    case 'attention':
      if (raw === 'failed') return card(t('tile.failedTitle', vars), t('tile.failedBody'), <>{openComputers}{p.cardActions}</>, 'warn');
      if (raw === 'expired') return card(t('tile.expiredTitle', vars), t('tile.expiredBody', vars), <>{openBilling}{p.cardActions}</>, 'warn');
      if (raw === 'suspended') return card(t('tile.suspendedTitle', vars), t('tile.suspendedBody'), <>{openComputers}{p.cardActions}</>, 'warn');
      return card(t('tile.attentionTitle', vars), t('tile.attentionBody'), <>{openComputers}{p.cardActions}</>, 'warn');
    case 'gone':
      return card(info.computer ? t('tile.goneTitle', vars) : t('tile.goneTitleNoName'), t('tile.goneBody'), p.cardActions);
    case 'unknown':
      return card(t('tile.unknownTitle', vars), t('tile.unknownBody'), (
        <>
          <Button size="md" variant="secondary" onPress={p.onRetry}>
            {t('tile.tryAgain')}
          </Button>
          {p.cardActions}
        </>
      ), 'warn');
    default:
      return (
        <div className={s.skeleton} aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      );
  }
}

const HELD_TITLE: Readonly<Record<string, string>> = {
  start: 'tile.startUnknown', resume: 'tile.resumeUnknown', stop: 'tile.stopUnknown', 'force-stop': 'tile.stopUnknown',
  restart: 'tile.restartUnknown', pause: 'tile.pauseUnknown',
};

/** The card of a held lifecycle change: Check again (not for a restart) and Dismiss behind a warning; band: the
 *  same as the kit's warn band over a live frame's top edge (one line of text, so the title leads its sentence and
 *  names the group). Another page's hold: read-only, with a link to that page when it is served.
 *  computer: the text names the computer itself (the picker's Launch an app), not a tile's computer. */
export function HeldCard({ power, name, actions, t, band = false, heldFrom, computer }: { power: Power; name: string; actions: ReactNode; t: T; band?: boolean; heldFrom: HeldFromLink | null; computer?: string }) {
  // A Dismiss that freed nothing (the shown send was no longer held): said on the card, which stays.
  const [notSettled, setNotSettled] = useState(false);
  const op = power.heldOp ?? 'start';
  const title = t(HELD_TITLE[op] ?? 'tile.startUnknown');
  if (!power.ownHold) {
    // Another page sent it: only that page can check or dismiss it (core), so the card points there.
    const body = heldFrom
      ? t(computer !== undefined ? 'tile.heldElsewhereBodyOnC' : 'tile.heldElsewhereBodyOn', { name, computer: computer ?? '', page: heldFrom.name })
      : t(computer !== undefined ? 'tile.heldElsewhereBodyC' : 'tile.heldElsewhereBody', { name, computer: computer ?? '' });
    const open = heldFrom ? (
      <Button variant="secondary" size={band ? 'sm' : 'md'} onPress={heldFrom.go}>
        {t('tile.openSender', { page: heldFrom.name })}
      </Button>
    ) : null;
    if (!band) return <TileCard icon="clock" title={title} body={body} actions={<>{open}{actions}</>} />;
    return (
      <div className={s.over} role="group" aria-label={title}>
        <Band tone="warn" size="table" over icon="clock" /* noDetails: a held send has no answer to show */ actions={open}>
          {t('tile.heldBandText', { title, body })}
        </Band>
      </div>
    );
  }
  // Keyed by the shown send: when another send replaces it in place (another tab's newer one), the warning closes.
  return <OwnHeld key={power.holdId ?? ''} power={power} name={name} computer={computer} t={t} band={band} title={title} actions={actions} notSettled={notSettled} onNotSettled={setNotSettled} />;
}

/** The Board's own held send: Check again and the warned Dismiss, bound to the send shown when it was pressed. */
function OwnHeld({ power, name, computer, t, band, title, actions, notSettled, onNotSettled }: { power: Power; name: string; computer: string | undefined; t: T; band: boolean; title: string; actions: ReactNode; notSettled: boolean; onNotSettled: (v: boolean) => void }) {
  // The Dismiss of the send shown at the press and that send's token, kept while the warning is open: the confirm names
  // the shown hold and never reaches a later one.
  const [warned, setWarned] = useState<{ dismiss: (shown: string | null) => Promise<boolean>; hold: string | null } | null>(null);
  const restart = (power.heldOp ?? 'start') === 'restart';
  const v = { name, computer: computer ?? '' };
  const body = computer !== undefined
    ? t(restart ? 'tile.heldRestartBodyC' : 'tile.heldBodyC', v)
    : t(restart ? 'tile.heldRestartBody' : 'tile.heldBody', v);
  const text = notSettled ? `${body} ${t('tile.heldNotSettled')}` : body;
  // The band's Check again (a read; the card's is the kit Outcome's own): busy until the read settles.
  const [checking, setChecking] = useState(false);
  const check = () => { setChecking(true); void Promise.resolve(power.check()).finally(() => setChecking(false)); };
  // Opens the warning for the send shown now (its Dismiss and its token).
  const ask = () => { onNotSettled(false); setWarned({ dismiss: power.dismiss, hold: power.holdId }); };
  return (
    <>
      {band ? (
        <div className={s.over} role="group" aria-label={title}>
          <Band
            tone="warn"
            size="table"
            over
            icon="clock"
            /* noDetails: a held send has no answer to show */
            actions={
              <>
                {restart ? null : (
                  <Button variant="secondary" size="sm" busy={checking} onPress={check}>
                    {t('tile.heldCheck')}
                  </Button>
                )}
                <Button variant="secondary" size="sm" onPress={ask}>
                  {t('tile.heldDismiss')}
                </Button>
              </>
            }
          >
            {t('tile.heldBandText', { title, body: text })}
          </Band>
        </div>
      ) : (
        <TileCard
          icon="clock"
          title={title}
          body={text}
          actions={
            <>
              {restart ? null : <Outcome outcome="pending" onCheck={power.check} />}
              <Button variant="secondary" onPress={ask}>
                {t('tile.heldDismiss')}
              </Button>
              {actions}
            </>
          }
        />
      )}
      <ConfirmDialog
        isOpen={warned !== null}
        onOpenChange={(o) => { if (!o) setWarned(null); }}
        title={t('tile.heldDismissTitle')}
        body={t('tile.heldDismissBody')}
        confirmLabel={t('tile.heldDismiss')}
        tone="danger"
        onConfirm={() => {
          const w = warned;
          setWarned(null);
          if (w) void w.dismiss(w.hold).then((ok) => { if (!ok) onNotSettled(true); });
        }}
      />
    </>
  );
}
