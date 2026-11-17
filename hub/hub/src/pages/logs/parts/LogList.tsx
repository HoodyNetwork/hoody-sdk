// The list: a windowed list of compact rows (time, result, from, what, visitor, took) with
// dividers (gap, reset, overflow, day), Show newer / Show older, and the floating
// "N new · Jump to newest" pill. Only the rows in view are drawn, so 2,000 rows stay light. The
// kit has no bare virtual list; this one is page-private.
import { Button, Skeleton, StatusPill, clearClipTitle, clipTitle, cx, formatNumber, hoverPointer, statusPillMetrics, textWidth, useBusyMark, useFontsReady, type TextMetrics } from '@kit';
import { type CSSProperties, type KeyboardEvent, type PointerEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot } from '../controller';
import { durationOf, isData, leadOf, outcomeOf, sourceHasVisitor, sourceOf, titleOf, toneOf, visitorOf, type DataItem, type ListItem } from '../logic';
import { IpBadge } from './IpBadge';
import s from './Logs.module.css';
import { useIpLookup } from './useIpLookup';
import { asTx, clockTime, dayLabel, shortClock, type T } from './words';

// Measured columns: Time, Result, From and Took take their words' width, measured from the
// words (the translated header, every outcome and source word, the loaded durations), never from the DOM: each windowed
// row is its own grid, so every row and the head read the same --c-* values set on the list.
const FACE = '"Geist", system-ui, sans-serif';
const MONO = '"Geist Mono", ui-monospace, monospace';
/** The head's caps label (.head: 600, --fs-xs 11 px, --tracking-caps 0.03em). */
const HEAD: TextMetrics = { font: `600 11px ${FACE}`, glyph: 6.6, tracking: 0.33, caps: true };
/** A StatusPill with its dot: the kit's one descriptor of the pill (pillMetrics.ts, held to Display.module.css). */
const PILL: TextMetrics = statusPillMetrics(true);
/** A muted body cell (From): --t-body, 13 px. */
const BODY: TextMetrics = { font: `400 13px ${FACE}`, glyph: 7.2 };
/** A mono cell (Time, Took): --font-mono at --fs-sm, 12 px. */
const CLOCK: TextMetrics = { font: `400 12px ${MONO}`, glyph: 7.2 };
/** The widest a measured track may be; What keeps the rest. */
const TRACK_MAX = 200;
/** The fixed parts of the wide template (Logs.module.css): Visitor's 172 px track, the --sp-2 8 px column gap and the
 * --sp-3 12 px row padding each side (the list's inner width is what its container query reads). */
const VISITOR_TRACK = 172;
const GAP = 8;
const FRAME = 2 * 12;
/** The least What keeps in the wide template; a list too narrow for that and every wide track takes the mid one. */
const WHAT_MIN = 240;
/** Logs.module.css's container breakpoint between the wide and the mid template. */
const MID_BELOW = 880;
const OUTCOMES = ['failed', 'problem', 'ok', 'notFound', 'refused', 'tooMany', 'turned'] as const;
const SOURCES = ['visits', 'bots', 'decisions', 'changes', 'scripts', 'account', 'helper'] as const;

const ROW = 32;
const DIV = 28;
const OVER = 8;

export interface LogListProps {
  t: T;
  snap: Snapshot;
  selected: string | undefined;
  onSelect: (it: DataItem) => void;
  onOlder: () => void;
  onNewer: () => void;
  onJump: () => void;
  onReading: (reading: boolean) => void;
  /** The row that has keyboard focus (j/k), by key. */
  active: string | undefined;
  onActive: (key: string) => void;
}


/** The head cells in column order; `cls` names the CSS class that sheds the column at a narrow list. */
const HEADS: readonly { key: 'col.time' | 'col.outcome' | 'col.source' | 'col.what' | 'col.visitor' | 'col.duration'; cls?: 'colFrom' | 'colVisitor' | 'colTook' }[] = [
  { key: 'col.time' },
  { key: 'col.outcome' },
  { key: 'col.source', cls: 'colFrom' },
  { key: 'col.what' },
  { key: 'col.visitor', cls: 'colVisitor' },
  { key: 'col.duration', cls: 'colTook' },
];

/** How many rows PageUp and PageDown move. */
const PAGE_ROWS = 10;

export function LogList({ t, snap, selected, onSelect, onOlder, onNewer, onJump, onReading, active, onActive }: LogListProps) {
  const tx = asTx(t);
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(640);
  const [width, setWidth] = useState(0);
  const pendingFocus = useRef<string | null>(null);

  const offsets = useMemo(() => {
    const out: number[] = [];
    let y = 0;
    for (const it of snap.items) { out.push(y); y += it.kind === 'div' ? DIV : ROW; }
    return { at: out, total: y };
  }, [snap.items]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => { setHeight(el.clientHeight || 640); setWidth(el.clientWidth); };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // "Jump to newest" scrolls to the top.
  useEffect(() => { if (snap.jump && box.current) { box.current.scrollTop = 0; setTop(0); } }, [snap.jump]);
  // Reading means scrolled away from the top or a row is open: Live rows wait behind the pill.
  useEffect(() => { onReading(top > ROW || selected !== undefined); }, [top, selected, onReading]);
  // The active row stays in view.
  useEffect(() => {
    const el = box.current;
    if (!el || !active) return;
    const i = snap.items.findIndex((x) => x.k === active);
    if (i < 0) return;
    const y = offsets.at[i] ?? 0;
    // The list may not be its own scroller (the page scrolls): then the window is moved to the row and the
    // focus below brings the row into the page's view.
    if (el.scrollHeight <= el.clientHeight + 1) { if (y < top - ROW || y > top + height) setTop(y); return; }
    if (y < el.scrollTop + ROW) el.scrollTop = Math.max(0, y - ROW);
    else if (y + ROW > el.scrollTop + el.clientHeight) el.scrollTop = y + ROW - el.clientHeight;
    else return;
    setTop(el.scrollTop); // the window follows at once, not on the scroll event
  // eslint-disable-next-line react-hooks/exhaustive-deps -- follows the active row and the rows only
  }, [active, snap.items, offsets]);

  let from = 0;
  while (from < snap.items.length - 1 && (offsets.at[from + 1] ?? 0) < top - OVER * ROW) from++;
  let to = from;
  while (to < snap.items.length && (offsets.at[to] ?? 0) < top + height + OVER * ROW) to++;
  const slice = snap.items.slice(from, to);
  const before = offsets.at[from] ?? 0;
  const after = Math.max(0, offsets.total - (to < snap.items.length ? (offsets.at[to] ?? offsets.total) : offsets.total));

  // The active row holds focus when the keys (j/k, the shell's) moved it: Enter, Home, End act on it.
  useEffect(() => {
    if (!active) return;
    const row = Array.from(box.current?.querySelectorAll<HTMLElement>('[data-key]') ?? []).find((el) => el.dataset.key === active);
    const at = document.activeElement;
    if (row && at !== row && (at === document.body || box.current?.contains(at))) row.focus();
  }, [active, from, to]);

  const move = (e: KeyboardEvent, it: ListItem) => {
    const data = snap.items.filter(isData);
    const i = data.findIndex((x) => x.k === it.k);
    const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'PageDown' ? i + PAGE_ROWS : e.key === 'PageUp' ? i - PAGE_ROWS : e.key === 'Home' ? 0 : e.key === 'End' ? data.length - 1 : null;
    if (to === null) return;
    const next = data[Math.min(data.length - 1, Math.max(0, to))];
    if (next) { e.preventDefault(); pendingFocus.current = next.k; onActive(next.k); }
  };

  // The Visitor column exists only for the sources whose rows can carry an address.
  const visitor = sourceHasVisitor(snap.v.source);
  // The countries of the addresses in the rows drawn now (a scroll asks for the next ones; ipGeo batches and caches).
  const shown = visitor ? slice.filter(isData).map(visitorOf).filter(Boolean) : [];
  const geoOf = useIpLookup(shown);
  // The e2e search proofs' settle hook: the list root is marked while a load runs over the rows it keeps.
  useBusyMark(box, snap.loading);

  // The measured tracks (see HEAD); a new language, new rows or the web fonts arriving measure again, a scroll never does.
  const fontsReady = useFontsReady();
  const sized = useMemo(() => {
    const track = (head: string, words: number) => Math.min(TRACK_MAX, Math.max(textWidth([head], HEAD), words));
    const took = snap.items
      .filter(isData)
      .map(durationOf)
      .filter((d): d is number => d !== null)
      .map((d) => t('row.ms', { n: formatNumber(d) }));
    return {
      time: track(t('col.time'), textWidth([clockTime(0)], CLOCK)),
      out: track(t('col.outcome'), textWidth(OUTCOMES.map((o) => t(`out.${o}`)), PILL)),
      src: track(t('col.source'), textWidth(SOURCES.map((x) => t(`src.${x}`)), BODY)),
      took: track(t('col.duration'), textWidth(took, CLOCK)),
    };
    // fontsReady: the faces arrived, so the fallback's measures are stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.items, t, fontsReady]);
  // The wide template shows every measured track whole and What at least WHAT_MIN. A list past the
  // breakpoint but too narrow for that takes the mid template (tracks capped at today's widths, Visitor and Took shed).
  const wideNeed = FRAME + sized.time + sized.out + sized.src + WHAT_MIN + sized.took + (visitor ? VISITOR_TRACK : 0) + GAP * (visitor ? 5 : 4);
  const squeeze = width > MID_BELOW && width < wideNeed;
  const tracks = { '--c-time': `${sized.time}px`, '--c-out': `${sized.out}px`, '--c-src': `${sized.src}px`, '--c-took': `${sized.took}px` } as CSSProperties;

  // A cut-off cell (What; Result, From and Took when a mid or narrow template caps their track) gets a native tooltip
  // while the pointer is over it (the kit's clipTitle, which also follows a resize under a still pointer): its
  // title then shows instead of the row's own (the ISO time), and once the cell fits again the row's shows.
  const clipHost = useRef<HTMLElement | null>(null);
  const clipEnter = (e: PointerEvent<HTMLElement>) => {
    if (!hoverPointer(e.pointerType)) return;
    if (clipHost.current && clipHost.current !== e.currentTarget) clearClipTitle(clipHost.current);
    clipHost.current = e.currentTarget;
    clipTitle(e.currentTarget);
  };
  const clipLeave = (e: PointerEvent<HTMLElement>) => {
    clearClipTitle(e.currentTarget);
    if (clipHost.current === e.currentTarget) clipHost.current = null;
  };
  useLayoutEffect(() => {
    const el = clipHost.current;
    if (!el) return;
    if (el.isConnected) clipTitle(el);
    else {
      clearClipTitle(el);
      clipHost.current = null;
    }
  });
  // Unmount: stop watching the hovered cell now, never waiting on an observer callback.
  useEffect(
    () => () => {
      if (clipHost.current) clearClipTitle(clipHost.current);
      clipHost.current = null;
    },
    [],
  );

  if (snap.loading && !snap.items.length) {
    return <div className={s.list}><Skeleton variant="table" rows={10} columns={visitor ? 6 : 5} immediate /></div>;
  }

  return (
    <div className={s.list} ref={box} onScroll={(e) => setTop(e.currentTarget.scrollTop)} data-rows={snap.items.filter(isData).length} data-visitor={visitor ? 'on' : 'off'} data-cols={squeeze ? 'mid' : undefined} style={tracks} role="region" aria-label={t('list')}>
      <div className={s.head} aria-hidden="true">
        {HEADS.filter((h) => visitor || h.key !== 'col.visitor').map((h) => (
          <span key={h.key} className={h.cls ? s[h.cls] : undefined}>{t(h.key)}</span>
        ))}
      </div>
      {snap.newCount > 0 && (
        <div className={s.pill}>
          <Button size="sm" variant="primary" icon="arrow-up" onPress={onJump}>
            {t('pill.new', { count: snap.newCount, n: formatNumber(snap.newCount) })}
          </Button>
        </div>
      )}
      {snap.moreNewer && !snap.liveOn && (
        <div className={s.edge}><Button size="sm" variant="secondary" onPress={onNewer}>{t('act.newer')}</Button></div>
      )}
      <div style={{ paddingBlockStart: before, paddingBlockEnd: after }}>
        {slice.map((it) => {
          if (it.kind === 'div') {
            return (
              <div key={it.k} className={s.divider} role="separator">
                {it.div === 'day' ? dayLabel(it.t ?? 0) : t(`live.${it.div}`)}
              </div>
            );
          }
          const o = outcomeOf(it);
          const tone = toneOf(o);
          const d = durationOf(it);
          const ip = visitorOf(it);
          const lead = leadOf(it);
          const tag = lead ? [lead.method, lead.status].filter((x) => x !== null).join(' ') : '';
          const isSel = selected === it.k;
          return (
            <button
              key={it.k}
              type="button"
              className={cx(s.row, isSel && s.rowSelected, it.fresh && s.rowFresh)}
              aria-current={isSel ? 'true' : undefined}
              data-key={it.k}
              data-active={active === it.k ? 'true' : undefined}
              tabIndex={active === it.k || (!active && it === snap.items.find(isData)) ? 0 : -1}
              ref={(el) => { if (el && pendingFocus.current === it.k) { pendingFocus.current = null; el.focus(); } }}
              onClick={() => { onActive(it.k); onSelect(it); }}
              onKeyDown={(e) => move(e, it)}
              title={new Date(it.t).toISOString()}
            >
              <span className={cx(s.mono, s.muted)} title={shortClock(it.t)}>{clockTime(it.t)}</span>
              <span className={s.clip} onPointerEnter={clipEnter} onPointerLeave={clipLeave} onPointerCancel={clipLeave}>{o === 'neutral' ? '' : <StatusPill tone={tone === 'danger' ? 'danger' : tone === 'ok' ? 'ok' : 'warn'} dot>{t(`out.${o}`)}</StatusPill>}</span>
              <span className={cx(s.muted, s.colFrom)} onPointerEnter={clipEnter} onPointerLeave={clipLeave} onPointerCancel={clipLeave}>{t(`src.${sourceOf(it)}`)}</span>
              <span className={s.what} onPointerEnter={clipEnter} onPointerLeave={clipLeave} onPointerCancel={clipLeave}>
                {lead && <span className={s.lead}>{tag}</span>}
                {titleOf(it, tx)}
                {lead && <span className={s.path}>{' '}{lead.path}</span>}
              </span>
              {visitor && <span className={cx(s.mono, s.visitorCell, s.colVisitor)} title={ip || undefined}>{ip && <IpBadge t={t} ip={ip} geo={geoOf(ip)} />}</span>}
              <span className={cx(s.mono, s.end, s.muted, s.clip, s.colTook)} onPointerEnter={clipEnter} onPointerLeave={clipLeave} onPointerCancel={clipLeave}>{d === null ? '' : t('row.ms', { n: formatNumber(d) })}</span>
            </button>
          );
        })}
      </div>
      {snap.moreOlder && (
        <div className={s.edge}>
          <Button size="sm" variant="secondary" busy={snap.olderBusy} onPress={onOlder}>{t('act.older')}</Button>
        </div>
      )}
    </div>
  );
}
