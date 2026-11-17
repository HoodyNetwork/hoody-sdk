// SessionView.term: one conversation in a terminal: the transcript (your messages, step trails, replies, decided lines,
// notes) and the open gates, read through the same ConversationSource as the web, with the web's rules:
//   - The follow rule: while the reader is at the end the view follows any change at the end (the engine's sticky edge);
//     once they scroll up it never moves under them, and a "New messages below" line offers End to come back. Reaching
//     the end again by scrolling resumes following.
//   - Gate cards decide only when the source is active and can('decide' | 'answer') allows it (GateCard.term adds the
//     terminal safety rules). A waiting gate whose card is not on screen gets the "Waiting for you" line with Show.
// Terminal additions:
//   - Windowed: only the blocks near the viewport are mounted (one screen of overscan above and below); the rest are
//     spacers as tall as the block last measured (or an estimate before it ever drew). The first visible block is the
//     scroll anchor while the reader is up the transcript, so a block above that turns from spacer to text (or is
//     measured anew) never moves what they read. 10 000-line chats stay at a few dozen mounted blocks.
//   - Keys: the transcript is a Tab stop ("Conversation"): ↑ ↓ a line, PgUp PgDn a page, Home End; PgUp / PgDn also work
//     from anywhere a field does not take them (the composer passes them on). End or the line's button jumps to newest.
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import type * as Web from './SessionView';
import type { ConvStop, SessionViewProps, TurnMenu } from './SessionView';
import { Box, Text } from '@term/prim';
import { Pressable, Scroll, mergeRefs, useFocusable, useKeys, useSem, focusInk, type Key, type BoxRenderable, type ScrollBoxRenderable } from '@term/kit';
import { Button, LinkButton } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { formatRelative } from '../format';
import { Band } from '../states/Band';
import { Skeleton } from '../states/States';
import { useStrings } from '../strings';
import { DecidedLine, GateCard } from './GateCard';
import { NeedsBar } from './NeedsBar';
import { GateBringContext } from './gateBring';
import { estimateRows, windowOf } from './sessionWindow';
import { Prose, ReplyBox, ReplyFooter } from './Reply';
import { ResultRow } from './ResultRow';
import { StepTrail } from './StepTrail';
import { SummaryNote } from './SummaryNote';
import { Author, SentText, useAgentName } from './SentMessage';
import { gateIdOf, isActive, type ActiveSource, type ConversationSource, type ConvBlock, type GateEntry, type RowAction } from './source';
import { turnPhase, type TurnPhase } from './turnPhase';
import { useWhy } from './why';
import strings from './SessionView.strings.en.json';
import jumpStrings from './JumpToNewest.strings.en.json';
import termStrings from './SessionView.term.strings.en.json';

export type { ConvStop, SessionViewProps, TurnMenu } from './SessionView';

interface RowCtx { source: ConversationSource; onTakeBack?: (text: string) => void; takeBackFiles?: boolean; agentUrl?: string }
const LABEL: Record<RowAction, 'sv.resend' | 'sv.retry' | 'sv.edit' | 'sv.remove' | 'sv.checkAgain'> = { resend: 'sv.resend', retry: 'sv.retry', takeBack: 'sv.edit', editQueued: 'sv.edit', withdraw: 'sv.remove', check: 'sv.checkAgain' };
/** The source method and capability each row action goes through (the web's table): Edit on a queued message asks the agent to
 *  take it back, as Remove does; Check again only reads the row back. */
const METHOD: Record<RowAction, 'resend' | 'retry' | 'takeBack' | 'withdraw' | 'check'> = { resend: 'resend', retry: 'retry', takeBack: 'takeBack', editQueued: 'withdraw', withdraw: 'withdraw', check: 'check' };

function rowActionsOn(b: Extract<ConvBlock, { k: 'user' }>, row: RowCtx): RowAction[] {
  const src = row.source;
  if (!isActive(src) || !b.req || !b.actions) return [];
  return b.actions.filter((a) => typeof src[METHOD[a]] === 'function'
    && (a !== 'takeBack' || (!!row.onTakeBack && (!!row.takeBackFiles || !b.files?.length)))
    && (a !== 'editQueued' || !!row.onTakeBack));
}

function RowActions({ b, row, on }: { b: Extract<ConvBlock, { k: 'user' }>; row: RowCtx; on: readonly RowAction[] }): ReactElement | null {
  const t = useStrings(strings);
  const why = useWhy();
  const [full, setFull] = useState(false);
  const src = row.source;
  if (!isActive(src) || !b.req) return null;
  const req = b.req;
  const press = (a: RowAction) => {
    if (!src.can(METHOD[a]).ok) return;
    if (a === 'resend') void src.resend?.(req);
    else if (a === 'retry') void src.retry?.(req);
    else if (a === 'withdraw') void src.withdraw?.(req, 'remove');
    else if (a === 'check') void src.check(req);
    else if (a === 'editQueued') {
      // The text comes back only when the agent answered withdrawn; any other answer is the row's own note.
      const put = row.onTakeBack;
      void src.withdraw?.(req, 'edit').then((r) => { if (r.k === 'withdrawn' && r.text) put?.(r.text); });
    } else {
      const r = src.takeBack?.(req);
      setFull(!!r && r.k === 'refused' && r.code === 'draft_full');
      if (r && r.k === 'text') row.onTakeBack?.(r.text);
    }
  };
  const blocked = on.map((a) => src.can(METHOD[a])).find((c) => !c.ok);
  return (
    <Box dir="row" gapX={1} wrap>
      {on.map((a) => <TextButton key={a} isDisabled={!src.can(METHOD[a]).ok} onPress={() => press(a)}>{t(LABEL[a])}</TextButton>)}
      {blocked && !blocked.ok ? <Text colour="muted">{why(blocked)}</Text> : null}
      {full ? <Text colour="warn">{t('sv.editFull')}</Text> : null}
    </Box>
  );
}

/** Whether the Agent's author row leads this block: once per turn, above its first block after your message. */
const agentLeads = (blocks: readonly ConvBlock[], i: number): boolean => blocks[i]!.k !== 'user' && blocks[i]!.k !== 'summary' && (i === 0 || blocks[i - 1]!.k === 'user' || blocks[i - 1]!.k === 'summary');

function Block({ b, turnMenu, row, onReview }: { b: ConvBlock; turnMenu?: TurnMenu; row: RowCtx; onReview?: () => void }): ReactElement | null {
  const t = useStrings(strings);
  switch (b.k) {
    case 'user': {
      const on = rowActionsOn(b, row);
      return (
        <Box dir="column" shrink={0}>
          {/* Your message: a rail, who wrote it and when, then its words (an action's request with its context folded). */}
          <Box dir="row" shrink={0}>
            <Box border={['left']} borderColour="blueText" width={1} shrink={0} />
            <Box dir="column" grow={1} shrink={1} padX={1}>
              <Author who="you" at={b.at} />
              <SentText text={b.text} />
              {b.files && b.files.length > 0 ? (
                <Text colour="muted">{t('sv.attSent') + ': ' + b.files.map((f) => (f.kind === 'image' ? '▣ ' : '▤ ') + f.name + (f.meta ? ` (${f.meta})` : '')).join(', ')}</Text>
              ) : null}
            </Box>
          </Box>
          {b.note || on.length > 0 ? (
            <Box dir="row" gap={1} pad={{ left: 2 }} wrap>
              {b.note ? <Text colour={b.note.bad ? 'danger' : 'muted'}>{(b.note.bad ? '✗ ' : '') + b.note.text}</Text> : null}
              {on.length > 0 ? <RowActions b={b} row={row} on={on} /> : null}
            </Box>
          ) : null}
        </Box>
      );
    }
    case 'steps': return <StepTrail b={b} />;
    case 'summary': return <SummaryNote text={b.text} />;
    case 'reply':
      if (!b.text) return null;
      return (
        <ReplyBox>
          <Prose text={b.text} caret={b.streaming} marks />
          {b.cut ? <Text colour="muted">{b.cut}</Text> : null}
          {b.final && !b.streaming ? <ResultRow text={b.text} files={b.files} onReview={onReview} /> : null}
          {b.final && !b.streaming ? <ReplyFooter text={b.text} cost={b.cost} at={b.at} menu={turnMenu && b.turn !== undefined ? turnMenu({ key: b.key, turn: b.turn }) : undefined} /> : null}
        </ReplyBox>
      );
    case 'decided': return <DecidedLine d={b.d} />;
    case 'line': {
      const line = <Text colour={b.tone === 'bad' ? 'danger' : b.tone === 'muted' ? 'faint' : 'blueText'}>{(b.tone === 'bad' ? '✗ ' : b.tone === 'info' ? 'i ' : '') + b.text}</Text>;
      // A turn whose outcome is not known: Check again reads the chat again (never sends), on an active source that can.
      const src = row.source;
      const recheck = b.recheck && isActive(src) ? src.recheckOutcome : undefined;
      const go = b.link ?? (b.agentApp && row.agentUrl ? { label: b.agentApp, href: row.agentUrl } : null);
      if (!recheck && !go) return line;
      return (
        <Box dir="column" shrink={0}>
          {line}
          <Box dir="row" shrink={0}>
            {recheck
              ? <Button variant="secondary" size="sm" onPress={recheck}>{t('sv.checkAgain')}</Button>
              : <LinkButton href={go!.href} variant="secondary" size="sm" literal>{go!.label}</LinkButton>}
          </Box>
        </Box>
      );
    }
  }
}

// ── The working row ──────────────────────────────────────────────────────────────────────────

const PHASE_WORD = {
  sending: 'sv.work.sending', working: 'sv.work.working', waiting: 'sv.work.waiting', stopping: 'sv.work.stopping', reconnecting: 'sv.work.reconnecting', catching_up: 'sv.work.catchingUp', lost: 'sv.work.lost',
} as const satisfies Record<Exclude<TurnPhase['k'], 'idle'>, keyof typeof strings>;

/** The working row's words: what the turn waits on when that is known (compacting, a step, the reply being written, the model
 *  thinking), else the phase's own line. */
export const workWord: typeof Web.workWord = (phase) => {
  if (phase.k !== 'working') return PHASE_WORD[phase.k];
  if (phase.doing === 'compacting') return 'sv.work.compacting';
  if (phase.step) return 'sv.work.step';
  if (phase.writing) return 'sv.work.writing';
  if (phase.doing === 'thinking') return 'sv.work.thinking';
  return PHASE_WORD.working;
};

/** The host's Stop: held while its press is unresolved. */
function StopButton({ stop }: { stop: ConvStop }): ReactElement {
  const t = useStrings(strings);
  return <Button variant="secondary" size="sm" busy={stop.busy} onPress={stop.onPress}>{'■ ' + t('sv.work.stop')}</Button>;
}

/** The working row, pinned under the transcript: what the newest turn is doing, its running step, and the host's Stop when given. */
function WorkRow({ phase, stop }: { phase: Exclude<TurnPhase, { k: 'idle' }>; stop?: ConvStop | null }): ReactElement {
  const t = useStrings(strings);
  const step = phase.k === 'working' ? phase.step : undefined;
  const words = t(workWord(phase));
  return (
    <Box dir="row" gap={1} shrink={0} padX={1}>
      <Box shrink={0} sem={{ role: 'status' }}><Text colour="blueText">{words}</Text></Box>
      <Box grow={1} shrink={1}>{step ? <Text colour="muted" truncate>{step.verb + (step.summary ? ' ' + step.summary : '')}</Text> : phase.k === 'catching_up' ? <Text colour="muted">{t('sv.work.catchingUpWhy')}</Text> : phase.k === 'working' && phase.doing === 'compacting' ? <Text colour="muted">{t('sv.work.compactingWhy')}</Text> : null}</Box>
      {stop ? <Box shrink={0}><StopButton stop={stop} /></Box> : null}
    </Box>
  );
}

// ── Windowing ───────────────────────────────────────────────────────────────────────────────────────────────────

interface View { top: number; h: number; w: number; max: number }

/** The reading column's widest, in cells, by size class (the web caps its column too): long lines past ~100 cells read badly.
 *  Every other size takes the web's 760 px (95 cells): a pane of class s, m or l can be wider than that. Approval cards
 *  keep the same width, centred, as on the web, where they sit in the column. */
const READ_MAX: Partial<Record<SessionViewProps['size'], number>> = { xl: 100, xxl: 110 };
const READ_DEFAULT = 95;

export const SessionView: typeof Web.SessionView = ({ source, size, agentUrl = '', typing = false, empty, top, turnMenu, onTakeBack, takeBackFiles, onReview, stop }: SessionViewProps) => {
  const t = useStrings(strings);
  const tj = useStrings(jumpStrings);
  const tt = useStrings(termStrings);
  const why = useWhy();
  const agentName = useAgentName();
  const snap = useSyncExternalStore(source.subscribe, source.snapshot);
  const waiting = snap.gates.filter((g) => g.decision === null);
  const box = useRef<ScrollBoxRenderable | null>(null);
  const [view, setView] = useState<View>({ top: 0, h: 24, w: 80, max: 0 });
  const measured = useRef(new Map<string, { w: number; h: number }>());
  const nodes = useRef(new Map<string, BoxRenderable>());
  const gateNode = useRef<BoxRenderable | null>(null);
  // The approvals area: its own scroll under the transcript, never inside it (below).
  const gateBox = useRef<ScrollBoxRenderable | null>(null);
  const [rootH, setRootH] = useState(24);
  const [gatesH, setGatesH] = useState<number | null>(null);
  const gateNodes = useRef(new Map<string, BoxRenderable>());
  const bring = useContext(GateBringContext);
  const [, bump] = useState(0);
  const [behind, setBehind] = useState(false);
  const atEnd = useCallback((): boolean => {
    const b = box.current;
    if (!b || b.isDestroyed) return true;
    const vh = b.viewport.height;
    return b.scrollTop >= b.scrollHeight - vh - 1;
  }, []);
  const read = useCallback(() => {
    const b = box.current;
    if (!b || b.isDestroyed) return;
    const vp = b.viewport;
    const next: View = { top: b.scrollTop, h: vp.height, w: vp.width, max: Math.max(0, b.scrollHeight - vp.height) };
    setView((v) => (v.top === next.top && v.h === next.h && v.w === next.w && v.max === next.max ? v : next));
    if (atEnd()) setBehind(false);
  }, [atEnd]);
  // Scroll and size changes of the transcript (the engine's own events).
  useEffect(() => {
    const b = box.current;
    if (!b) return undefined;
    const { verticalScrollBar: bar, viewport, content } = b;
    bar.on('change', read);
    viewport.on('resize', read);
    content.on('resize', read);
    read();
    return () => { bar.off('change', read); viewport.off('resize', read); content.off('resize', read); };
  }, [read]);
  // A new snapshot: following = the engine's sticky edge does it; up the transcript, new text below lights the line.
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    const b = box.current;
    if (!b || b.isDestroyed) return;
    if (!atEnd()) setBehind(true);
    b.afterLayout(() => { if (atEnd()) setBehind(false); read(); });
  }, [snap, atEnd, read]);

  const cap = READ_MAX[size] ?? READ_DEFAULT;
  const width = Math.max(10, cap ? Math.min(cap, view.w) : view.w);
  const blocks = snap.blocks;
  const heights = useMemo(() => blocks.map((b, i) => {
    const m = measured.current.get(b.key);
    return m && m.w === width ? m.h : estimateRows(b, width) + (agentLeads(blocks, i) ? 1 : 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read when a block reports a new size (bump)
  }), [blocks, width, view]);
  const { from, to } = windowOf(heights, view.top, Math.max(1, view.h));
  // Keep what the reader reads in place: anchor the first mounted block that is on screen, while they are up the transcript.
  const release = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const b = box.current;
    release.current?.();
    release.current = null;
    if (!b || b.isDestroyed || !behindOrUp(b)) return;
    let y = 0;
    for (let i = 0; i < blocks.length; i++) {
      const h = heights[i]!;
      if (y + h > view.top && i >= from && i <= to) {
        const node = nodes.current.get(blocks[i]!.key);
        if (node && !node.isDestroyed) release.current = b.anchor(node);
        break;
      }
      y += h;
    }
  });
  function behindOrUp(b: ScrollBoxRenderable): boolean {
    const vh = b.viewport.height;
    return b.scrollTop < b.scrollHeight - vh - 1;
  }

  const onBlockSize = useCallback((key: string, w: number, h: number) => {
    const m = measured.current.get(key);
    if (m && m.w === w && m.h === h) return;
    measured.current.set(key, { w, h });
    bump((n) => n + 1);
  }, []);

  // Keys: the transcript's own (when it has the focus); PgUp / PgDn, and End while behind, from anywhere that passes them.
  const scrollKeys = (k: Key, own: boolean): boolean => {
    const b = box.current;
    if (!b || b.isDestroyed) return false;
    const page = Math.max(1, view.h - 2);
    if (k.name === 'pageup') { b.scrollBy(-page); return true; }
    if (k.name === 'pagedown') { b.scrollBy(page); return true; }
    // End from anywhere that passes it (an empty composer does) jumps to the newest while new messages wait below.
    if (!own) { if (k.name === 'end' && behind) { toNewest(); return true; } return false; }
    if (k.name === 'up') { b.scrollBy(-1); return true; }
    if (k.name === 'down') { b.scrollBy(1); return true; }
    if (k.name === 'home') { b.scrollTo(0); return true; }
    if (k.name === 'end') { toNewest(); return true; }
    return false;
  };
  const log = useFocusable({ onKey: (k) => scrollKeys(k, true) });
  // The log's sem carries its focus handle, so the accessible tree marks it focused when Tab reaches it (a sem on the Box
  // alone had no focus: with the log focused, the tree had no focused node at all).
  const logSem = useSem({ name: t('sv.log') }, { role: 'log', focus: log });
  const logRef = useMemo(() => mergeRefs(log.ref, logSem), [log.ref, logSem]);
  useKeys((k) => scrollKeys(k, false));
  const toNewest = () => {
    const b = box.current;
    setBehind(false);
    if (b && !b.isDestroyed) b.scrollTo(Infinity);
  };
  const showGate = () => {
    const b = gateBox.current;
    const g = gateNode.current;
    if (b && g && !g.isDestroyed) b.scrollChildIntoView(g, { align: 'nearest' });
  };
  // Activity's Show (through the frame): that gate's card into view. (Focus on its first control waits for a prim call that
  // focuses within a node; until then Tab reaches the card's Deny first.)
  useEffect(() => {
    if (bring.n === 0 || !bring.id) return;
    const b = gateBox.current, g = gateNodes.current.get(bring.id);
    if (!b || !g || g.isDestroyed) return;
    b.scrollChildIntoView(g, { align: 'nearest' });
  }, [bring]);
  // Whether the first waiting card is on screen (the Waiting line shows when it is not, or more than one waits).
  const cardSeen = (() => {
    const b = gateBox.current, g = gateNode.current;
    if (!b || !g || g.isDestroyed || b.isDestroyed) return true;
    const vp = b.viewport;
    return g.y >= vp.y && g.y + Math.min(g.height, vp.height) <= vp.y + vp.height;
  })();

  const active = isActive(source);
  const needsBar = waiting.length > 0 && (waiting.length > 1 || !cardSeen);
  // The host hands a Stop only while a turn can be stopped: with it the row is never away, whatever else the snapshot says.
  const phaseRead = turnPhase(snap, { stopping: !!stop?.busy && !stop.unknown });
  const phase: TurnPhase = phaseRead.k === 'idle' && stop ? { k: 'working' } : phaseRead;
  const nothing = snap.blocks.length === 0 && snap.gates.length === 0;
  const reading = nothing && snap.facts.state === 'loading';
  const row: RowCtx = { source, onTakeBack, takeBackFiles, agentUrl };
  const gateCard = (g: GateEntry) => {
    const action = g.gate.kind === 'confirm' ? 'decide' : 'answer';
    const cap = source.can(action);
    const unavailable = cap.ok ? undefined : why(cap);
    const may = (a: 'decide' | 'answer' | 'check') => active && source.can(a).ok;
    const checkCap = source.can('check');
    return (
      <GateCard
        gate={g.gate}
        pending={g.decision === 'sending'}
        unknown={g.decision === 'unknown'}
        gone={g.decision === 'unknown' && !!g.gone}
        sent={g.sent}
        addressing={g.addressing}
        held={g.held}
        helper={g.helper ? { name: g.helperName ?? '' } : false}
        unavailable={unavailable}
        agentUrl={agentUrl}
        typing={typing}
        onDecide={(choice, reason) => { if (may(action)) void (source as ActiveSource).decide(g.ref, { choice, reason }); }}
        onAnswer={(a) => { if (may(action)) void (source as ActiveSource).answer(g.ref, a); }}
        onCheck={() => { if (may('check')) void (source as ActiveSource).check({ key: g.key, kind: 'decision' }); }}
        checkUnavailable={checkCap.ok ? undefined : why(checkCap)}
        onDismiss={active && (source as ActiveSource).canDismiss(g.ref) ? () => { (source as ActiveSource).dismissDecision(g.ref); } : undefined}
      />
    );
  };

  // The transcript: spacers outside the window (one per run), blocks inside it.
  const items: ReactNode[] = [];
  let gap = 0, gapKey = '';
  const flushGap = () => { if (gap > 0) items.push(<Box key={'gap:' + gapKey} height={gap} shrink={0} />); gap = 0; };
  blocks.forEach((b, i) => {
    if (i < from || i > to) { if (gap === 0) gapKey = b.key; gap += heights[i]!; return; }
    flushGap();
    items.push(
      <Box
        key={b.key}
        dir="column"
        shrink={0}
        pad={{ bottom: 1, top: b.k === 'user' && i > 0 ? 1 : 0 }}
        boxRef={(n: BoxRenderable | null) => { if (n) nodes.current.set(b.key, n); else nodes.current.delete(b.key); }}
        onSize={(w, h) => onBlockSize(b.key, w, h)}
      >
        {agentLeads(blocks, i) ? <Author who="agent" name={agentName(snap.meta)} /> : null}
        <Block b={b} turnMenu={turnMenu} row={row} onReview={onReview} />
      </Box>,
    );
  });
  flushGap();

  return (
    <Box dir="column" grow={1} shrink={1} minHeight={3} onSize={(_w: number, h: number) => { setRootH((o) => (o === h ? o : h)); }}>
      {top}
      <Box dir="column" grow={1} shrink={1} boxRef={logRef as never /* contract-any: engine node type */}>
        <Scroll grow={1} shrink={1} stickBottom scrollRef={box} padX={1}>
          {snap.saved ? <Band size="table" tone="neutral">{t('sv.saved', { when: formatRelative(snap.saved.at) })}</Band> : null}
          {snap.gapTop ? <Text colour="faint">{t('sv.gap')}</Text> : null}
          {reading ? <Box dir="column" shrink={0}><Text colour="muted">{t('sv.reading')}</Text><Skeleton variant="text" rows={4} /></Box> : nothing ? empty : (
            <Box dir="column" shrink={0} {...(cap ? { maxWidth: cap, alignSelf: 'center' as const, width: '100%' as const } : {})}>{items}</Box>
          )}
        </Scroll>
      </Box>
      {snap.gates.length > 0 ? (
        // Approvals live OUTSIDE the transcript's scroll, pinned between it and the composer: nothing the agent writes can
        // draw here (the transcript clips to its own box), so a card is told apart by where it is, not only by how it looks
        // (a reply may print a look-alike frame; it stays in the transcript, above the area). The area takes what its
        // cards need, at most 60% of the conversation's rows; past that it scrolls on its own, so Allow and Deny are
        // always reachable and the transcript keeps at least its last rows. It follows the focus: a card's control below
        // the area's last row is still a Tab stop, and Tab brings it into view, as the web's page scroll does.
        <Box dir="column" shrink={0} height={Math.max(3, Math.min(gatesH ?? Infinity, Math.floor(rootH * 0.6)))}>
          <Scroll grow={1} shrink={1} scrollRef={gateBox} padX={1} followFocus>
            <Box dir="column" shrink={0} width="100%" maxWidth={cap} alignSelf="center" onSize={(_w: number, h: number) => { setGatesH((o) => (o === h ? o : h)); }}>
              {snap.gates.map((g, gi) => (
                <Box key={gateIdOf(g)} dir="column" shrink={0} pad={{ bottom: gi < snap.gates.length - 1 ? 1 : 0 }} boxRef={(n: BoxRenderable | null) => { const id = gateIdOf(g); if (n) gateNodes.current.set(id, n); else gateNodes.current.delete(id); if (g === waiting[0]) gateNode.current = n; }}>
                  {gateCard(g)}
                </Box>
              ))}
            </Box>
          </Scroll>
        </Box>
      ) : null}
      {needsBar ? (
        // One drawing of the needs row: the kit NeedsBar (its terminal sibling), as the web SessionView draws it.
        <NeedsBar gates={waiting} onShow={showGate} />
      ) : null}
      {/* One pinned row speaks at a time, as on the web: the needs row (the host's Stop then sits alone under it), else the working row. */}
      {stop && needsBar ? <Box dir="row" shrink={0} padX={1} justify="end"><StopButton stop={stop} /></Box> : null}
      {!needsBar && phase.k !== 'idle' && (phase.k !== 'waiting' || !!stop) ? <WorkRow phase={phase} stop={stop} /> : null}
      {behind ? (
        <Box dir="row" gap={1} shrink={0} padX={1}>
          <Pressable onPress={toNewest} sem={{ role: 'button', name: tj('jump.label') }}>
            {({ focused }) => <Text colour="blueText" bold {...focusInk(focused)}>{'↓ ' + tt('newBelow') + ' · ' + tj('jump.label') + ' (End)'}</Text>}
          </Pressable>
        </Box>
      ) : null}
      {log.focused ? <Text colour="faint" truncate>{tt('logKeys')}</Text> : null}
    </Box>
  );
};
