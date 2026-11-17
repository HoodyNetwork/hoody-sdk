// A conversation tile's body: the conversation drawn natively on the Board, never the Hub in a frame
// of itself. The tile acts. Its source is the ACTIVE source of the seam (kit
// useActiveConversation, the AI tab's own), so gates are decided in the tile's cards and the dense composer sends and stops
// through the kit's composer machine (useConvComposer), the same per-chat record as the AI tab's composer: a send whose outcome
// is unknown holds Send here and there alike, and Stop is held per captured turn in both.
//
// Contract, in plain words:
//   - The source is the tile's own reference on the computer the tile's row names (tileInfo: by handle), never the top
//     bar's computer. No source (the computer is not named, no provider, no account): a card that says so, with Open in AI.
//     While the source is still opening (first mount, shown again after hidden), a loader, never that card.
//   - One hold per shown body; it is released when the tile goes, while the tile is hidden (another tile maximised), and
//     when the Board is kept hidden (a kept page's effects stop), so a hidden tile or Board reads nothing. While the hold is
//     on, the attachment lease is pinned by the source itself (ask/active), so a running or waiting chat keeps it.
//   - The body owns its keys: its root carries data-hub-keys="frame" (shell keygate), so an arrow or a letter typed anywhere
//     in it never reaches the Board's or the shell's keys. It is the tile's FrameHandle: element() is the root (the Board's
//     focus lock enters the tile when focus is anywhere inside it), focus() puts focus on the transcript unless focus is
//     already inside the body.
//   - Escape in the composer is the composer's: it collapses a selection, stays while there is text, and on an empty composer
//     moves focus to the transcript. Only an Escape the composer did not take (focus elsewhere in the tile) leaves the tile
//     (Tile.tsx's group, which honours defaultPrevented).
//   - Y and N decide only inside a gate card (GateCard's own keys); text typed in the composer never decides.
//   - A gate that arrives never takes focus unless this tile is the entered one (`inside`) and focus is not in a field of it
//     that takes text (its composer, even empty: the AI tab's takesText rule) and the person is not typing: a passive tile
//     shows its pill.
//   - The status row: Needs you (a gate waits), Running (a turn runs).
//   - Liveness: the shown tile asks for the stream at rank `focused` while it is the entered one, else `visible`, so
//     a full stream budget cuts a tile in view before the dock and the focused tile; a cut tile reads the state every 5 s. The
//     engine follows the strongest of its holders, so a passive tile never downgrades the AI tab's open chat.
//   - The tile takes text only: no files (the AI tab adds them; a file dropped on it is refused, never opened by the browser), no model chip and no Options (those stay in AI).
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useCore } from '@core';
import {
  CONV_MAX, ChatLinkHost, Composer, usePageLink, type LinkTarget, SessionView, Spinner, StatusPill, TextButton, attemptTarget, takeBackToDraft, useActiveConversationHold, useConvComposer, useEditing, useGo,
  useRefuseStrayFiles, useSizeClass, useStrings, useWhy, type ActiveSource, type ComposerNote, type ConvRef, type ShownComputer, type Translate,
} from '@kit';
import { linkBoardAddPath } from '../links';
import type { BoardComputer } from '../computers';
import type { FrameHandle } from './Frame';
import strings from './ConvTile.strings.en.json';
import s from './ConvTile.module.css';

export interface ConvTileProps {
  conv: ConvRef;
  /** The tile's computer (tileInfo found it by the reference's handle). */
  computer: BoardComputer;
  /** This tile holds the keys (the Board's lock): only then may an arriving gate take focus. */
  inside: boolean;
  /** Kept mounted but out of sight (another tile maximised): the hold is released and nothing is read or drawn. */
  hidden: boolean;
  /** No source: the tile's own card (Tile.tsx, with Open in AI), as the Bot tile's fallback. */
  fallback: ReactNode;
}

export const ConvTile = forwardRef<FrameHandle, ConvTileProps>(function ConvTile({ conv, computer, inside, hidden, fallback }, ref) {
  const t = useStrings(strings);
  const root = useRef<HTMLDivElement>(null);
  // The server goes with it when the row names one: the active registry places the engine by it (it is not the hold's identity).
  const server = computer.server_name || undefined;
  const at = useMemo<ShownComputer>(() => ({ project: computer.project_id, id: computer.id, name: computer.name, ...(server ? { server } : {}) }), [computer.project_id, computer.id, computer.name, server]);
  // Hidden (another tile maximised, one tile at a time): no reference, so the hold is released and nothing is read.
  const { source, opening } = useActiveConversationHold(hidden ? null : conv, at);
  // Text only: while the body shows (live, opening, or the can't-be-read card), a file dragged anywhere nothing takes it is
  // refused with no drop effect, so the browser never opens it in place of the Hub; nothing claims it (the Hub's stray-file guard,
  // as the Files page uses; reference-counted, iframe tiles' own documents never reach it).
  useRefuseStrayFiles(!hidden);
  // The reply's links read against the tile's computer and its realm's list; Put on Board adds to this Board.
  const servesBoard = !!usePageLink('board');
  const boardAdd = useMemo(() => (servesBoard && at ? (tg: LinkTarget) => linkBoardAddPath(at, tg) : undefined), [servesBoard, at]);
  // Ask the agent to fix it: into this chat's draft, the record the tile's composer and the AI tab share.
  const account = useCore().account ?? '';
  const ask = useCallback((text: string) => takeBackToDraft(attemptTarget(account, conv.computer, conv.realm, conv.sid), text), [account, conv.computer, conv.realm, conv.sid]);
  const go = useGo();
  useImperativeHandle(ref, () => ({
    // Focus already inside (a press on the transcript, a gate card) stays where the person put it.
    focus: () => {
      const r = root.current;
      if (!r || r.contains(document.activeElement)) return;
      (r.querySelector<HTMLElement>('[role="log"]') ?? r).focus({ preventScroll: true });
    },
    element: () => root.current,
  }), []);
  return (
    // The tile's own key owner: the shell's and the Board's keys stand aside for anything typed in here (keygate).
    <div ref={root} className={s.root} data-hub-keys="frame" data-conv-tile="" tabIndex={-1}>
      {hidden ? null : source ? <ChatLinkHost value={{ chat: at, realm: conv.realm, openHub: go, boardAdd, ask }}><Live source={source} conv={conv} inside={inside} t={t} /></ChatLinkHost> : opening ? <div className={s.opening}><Spinner size="lg" label={t('conv.opening')} /></div> : fallback}
    </div>
  );
});

function Live({ source, conv, inside, t }: { source: ActiveSource; conv: ConvRef; inside: boolean; t: Translate<typeof strings> }) {
  const snap = useSyncExternalStore(source.subscribe, source.snapshot);
  const [sizeRef, size] = useSizeClass<HTMLDivElement>('s');
  const status = snap.meta?.status;
  const [typing, setTyping] = useState(false);
  useEffect(() => { source.watch('stream', inside ? 'focused' : 'visible'); }, [source, inside]);
  // Focus on a field that takes text (the composer, empty or not, or a gate's reason field) counts as typing too: the AI tab's
  // rule (useEditing, ConversationView), so a gate that arrives never pulls focus from it and turns the next key into a decision,
  // not even one that arrives while the window is in the background.
  const wrap = useRef<HTMLDivElement>(null);
  const { editing, onFocus, onBlur } = useEditing(wrap);
  return (
    // Focus events only note whether the person is typing; the wrapper draws nothing (display: contents) and takes no input.
    <div ref={wrap} className={s.live} onFocus={onFocus} onBlur={onBlur}>
      <div className={s.status}>
        {status === 'needs' && <StatusPill tone="warn" dot>{t('conv.needs')}</StatusPill>}
        {status === 'running' && <StatusPill tone="info" dot>{t('conv.running')}</StatusPill>}
      </div>
      <div ref={sizeRef} className={s.view}>
        {/* typing: a passive tile's arriving gate never takes focus from wherever the person is (another tile, a field), nor
            does one arriving while focus is in a field of this tile (its composer, even empty) or the person writes in it. */}
        <SessionView source={source} size={size} typing={!inside || typing || editing} />
      </div>
      <TileComposer source={source} conv={conv} t={t} onTyping={setTyping} toLog={() => sizeRef.current?.querySelector<HTMLElement>('[role="log"]')?.focus({ preventScroll: true })} />
    </div>
  );
}

/** The dense composer: text only, Send and Stop from the source's own capability state, the kit's per-chat record. */
function TileComposer({ source, conv, t, onTyping, toLog }: { source: ActiveSource; conv: ConvRef; t: Translate<typeof strings>; onTyping: (v: boolean) => void; toLog: () => void }) {
  const why = useWhy();
  const account = useCore().account ?? '';
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // The same record as the AI tab's composer for this chat (attemptTarget): one send machine, wherever the chat is shown.
  const target = attemptTarget(account, conv.computer, conv.realm, conv.sid);
  const c = useConvComposer(source, target);
  const { attempts: a, facts: f, cap, stopCap, held } = c;
  const notes: ComposerNote[] = [];
  const sa = a.send, st = a.stop;
  if (sa?.k === 'notSent') notes.push({ key: 'send', text: t('conv.send.notSent'), warn: true, status: true, end: <TextButton onPress={() => c.send()}>{t('conv.send.again')}</TextButton> });
  if (sa?.k === 'unresolved') notes.push({ key: 'send', text: t('conv.send.unresolved'), warn: true, status: true });
  if (sa?.k === 'unknown') notes.push({ key: 'send', text: t('conv.send.unknown'), warn: true, status: true, end: <TextButton onPress={c.dismiss}>{t('conv.send.dismiss')}</TextButton> });
  if (sa?.k === 'dismissed') notes.push({ key: 'send', text: t('conv.send.dismissed'), status: true });
  // Said once: not when the transcript already says the Stop's answer never came (its line offers Check again).
  if (st?.k === 'unknown' && !c.stopShown) notes.push({ key: 'stop', text: t('conv.stop.unknown'), warn: true, status: true });
  if (st?.k === 'refused') notes.push({ key: 'stop', text: t('conv.stop.refused'), warn: true, status: true });
  return (
    <div className={s.composer}>
      <Composer
        draft={a.draft}
        setDraft={c.setDraft}
        inputRef={inputRef}
        placeholder={t('conv.placeholder')}
        max={CONV_MAX}
        canSend={c.canSendText}
        onSend={() => c.send()}
        sendWhy={!cap.ok ? why(cap) : held ? t('conv.send.held') : ''}
        sendQuiet={!cap.ok || held || f.gate !== 'none'}
        notes={notes}
        attachments={NO_ATT}
        onRemoveAttachment={noop}
        stop={stopCap.ok ? { busy: c.stopHeld, onPress: c.stop } : null}
        flash={false}
        onTyping={onTyping}
        // Escape is the composer's while it is editing: a selection collapses, text keeps the tile, an empty composer
        // hands focus to the transcript; the key stops there, so Tile.tsx's own Escape (leave the tile) never hears it.
        onEmptyEscape={toLog}
      />
    </div>
  );
}

const NO_ATT: readonly never[] = [];
const noop = () => {};
