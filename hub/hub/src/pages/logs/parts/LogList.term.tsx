// The Logs list in the terminal: the same rows (time, result, from, what, visitor, took), dividers, Show newer / Show
// older and the "N new" pill as the web list, drawn on the terminal's table primitives (term/prim ListWindow, TableMark,
// ClipText, TableCells) with the kit DataTable's keys and cursor model:
//   - one focusable list; ↑/↓ or k/j, PageUp/PageDown, Home/End move the cursor (the page's `active` row), Enter or o
//     opens it (onSelect); a click puts the cursor on a row and opens it; the wheel moves the view alone;
//   - the cursor bar and the open row's mark are TableMarks (left out of mouse selection), cells are kept apart by one
//     plain space, so a copied row reads "time result from what visitor took";
//   - only the lines in view are drawn (2,000 rows stay light);
//   - result and from words are never cut (their columns take their widest word); What gives way: a path keeps its
//     tail ("Files: opened …/backup.tar.gz"), plain text is cut at its end with one "…"; a visitor keeps its end.
// Narrow lists shed Visitor, then Took, then From, as the web's container query does.
import { Button, Skeleton, StatusPill, formatNumber } from '@kit';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { durationOf, isData, leadOf, outcomeOf, sourceHasVisitor, sourceOf, titleOf, toneOf, visitorOf, type DataItem, type ListItem } from '../logic';
import type * as Web from './LogList';
import { useIpLookup } from './useIpLookup';
import { asTx, clockTime, dayLabel } from './words';
import { Box, Text, useBoxSize, clipCells, padCells, widestCells } from '@term/prim';
import { useFocusable, type Focusable, type Key } from '../../../term/prim';
import { useSem } from '../../../term/prim/semantics';
import { ScrollThumb, useListWindow } from '../../../term/prim/ListWindow';
import { ClipText } from '../../../term/prim/TableClip';
import { TableMark } from '../../../term/prim/TableMark';

export type { LogListProps } from './LogList';

/** The cursor bar's cells. */
const LEAD = 2;
/** A StatusPill with its dot draws "● word". */
const DOT = 2;
/** An address (IPv4 at most 15) and its two-letter country. */
const VISITOR_W = 18;
/** The least What keeps before a column is shed. */
const WHAT_MIN = 20;
/** The least What keeps beside the Visitor column: What happened is the list's main column, and an address may not
 *  take the words of its title ("GET 200 Terminal: opened /session" became "GET 200 …/session" at 120 columns). */
const WHAT_MIN_VISITOR = 36;

type Col = 'time' | 'out' | 'src' | 'what' | 'visitor' | 'took';

export const LogList: typeof Web.LogList = ({ t, snap, selected, onSelect, onOlder, onNewer, onJump, onReading, active, onActive }) => {
  const tx = asTx(t);
  const [size, onSize] = useBoxSize();
  const width = size?.width ?? 80;
  const items = snap.items;
  const data = useMemo(() => items.filter(isData), [items]);
  // The cursor is the page's active row (j/k move it there too); none yet = the first data row.
  const cursorKey = active ?? data[0]?.k;
  const cursor = Math.max(0, items.findIndex((x) => x.k === cursorKey));
  const heights = useMemo(() => items.map(() => 1), [items]);
  const [viewSize, onViewSize] = useBoxSize();
  const w = useListWindow({ heights, cursor, view: viewSize?.height ?? 10 });

  // Reading means scrolled away from the top or a row is open: Live rows wait behind the pill (as the web).
  useEffect(() => { onReading(w.top > 1 || selected !== undefined); }, [w.top, selected, onReading]);
  // "Jump to newest" shows the top (the view only, as the web's scrollTop = 0).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (snap.jump) w.scroll(-w.total); }, [snap.jump]);

  const moveTo = (i: number) => {
    if (!data.length) return;
    const next = data[Math.min(data.length - 1, Math.max(0, i))];
    if (next) onActive(next.k);
  };
  const dataAt = Math.max(0, data.findIndex((x) => x.k === cursorKey));
  const pageStep = Math.max(1, w.view - 1);
  const focus = useFocusable({
    auto: true,
    onKey: (k: Key) => {
      if (k.ctrl || k.meta) return false;
      switch (k.name) {
        case 'down': case 'j': moveTo(dataAt + 1); return true;
        case 'up': case 'k': moveTo(dataAt - 1); return true;
        case 'pagedown': moveTo(dataAt + pageStep); return true;
        case 'pageup': moveTo(dataAt - pageStep); return true;
        case 'home': moveTo(0); return true;
        case 'end': moveTo(data.length - 1); return true;
        case 'return': case 'linefeed': case 'o': {
          const it = data[dataAt];
          if (!it) return false;
          onSelect(it);
          return true;
        }
        default: return false;
      }
    },
  });

  // The Visitor column exists only for the sources whose rows can carry an address; countries for the rows drawn now.
  const visitor = sourceHasVisitor(snap.v.source);
  const slice = items.slice(w.from, w.to);
  const geoOf = useIpLookup(visitor ? slice.filter(isData).map(visitorOf).filter(Boolean) : []);

  // Measured columns, as on the web: each takes its widest word or its header, never cut. Result and From measure the
  // words of the rows read, not every word they could show: "Proxy decisions" held 16 cells of a list of "Visits", and
  // What happened was cut for it at 80 columns. The widths hold while scrolling (every row read is measured, not the
  // rows drawn); they can widen when Live or Show older reads the first row of a new result or source.
  const cols = useMemo(() => {
    const took = data.map(durationOf).filter((d): d is number => d !== null).map((d) => t('row.ms', { n: formatNumber(d) }));
    return {
      time: widestCells([t('col.time'), clockTime(0)]),
      out: widestCells([t('col.outcome'), ...data.map(outcomeOf).filter((o) => o !== 'neutral').map((o) => t(`out.${o}`))]) + DOT,
      src: widestCells([t('col.source'), ...data.map((it) => t(`src.${sourceOf(it)}`))]),
      took: took.length ? widestCells([t('col.duration'), ...took]) : 0,
    };
  }, [data, t]);
  // Shed Visitor while What would keep less than WHAT_MIN_VISITOR, then Took, then From while it would keep less than
  // WHAT_MIN (the 1 is the scrollbar).
  const shown = useMemo(() => {
    const on: Col[] = ['time', 'out', 'src', 'what', ...(visitor ? (['visitor'] as Col[]) : []), ...(cols.took ? (['took'] as Col[]) : [])];
    const fixed = (c: Col): number => (c === 'time' ? cols.time : c === 'out' ? cols.out : c === 'src' ? cols.src : c === 'took' ? cols.took : c === 'visitor' ? VISITOR_W : 0);
    const whatRoom = (list: Col[]) => width - LEAD - 1 - list.reduce((n, c) => n + fixed(c), 0) - (list.length - 1);
    const drop = (c: Col) => { const i = on.indexOf(c); if (i >= 0) on.splice(i, 1); };
    if (whatRoom(on) < WHAT_MIN_VISITOR) drop('visitor');
    for (const c of ['took', 'src'] as const) {
      if (whatRoom(on) >= WHAT_MIN) break;
      drop(c);
    }
    return { list: on, width: fixed };
  }, [cols, visitor, width]);

  if (snap.loading && !items.length) {
    return <Box dir="column" grow={1} onSize={onSize}><Skeleton variant="table" rows={10} columns={visitor ? 6 : 5} immediate /></Box>;
  }

  const sep = (key: string) => <Text key={key}>{' '}</Text>;
  const head = (
    <Box dir="row" height={1} shrink={0}>
      <TableMark width={LEAD}>{' '}</TableMark>
      {shown.list.flatMap((c, i) => {
        const label = t(c === 'time' ? 'col.time' : c === 'out' ? 'col.outcome' : c === 'src' ? 'col.source' : c === 'what' ? 'col.what' : c === 'visitor' ? 'col.visitor' : 'col.duration');
        const cell = c === 'what'
          ? <Box key={c} grow={1} shrink={1} minWidth={0} clip><Text colour="muted" bold>{label}</Text></Box>
          : <Box key={c} width={shown.width(c)} shrink={0} clip justify={c === 'took' ? 'end' : 'start'}><Text colour="muted" bold>{c === 'took' ? padCells(clipCells(label, shown.width(c)), shown.width(c), 'end') : clipCells(label, shown.width(c))}</Text></Box>;
        return i ? [sep(`s:${c}`), cell] : [cell];
      })}
      {/* The rows end one cell early for the scrollbar: so does the heading, and each heading stays over its column. */}
      <Text>{' '}</Text>
    </Box>
  );

  const row = (it: DataItem) => {
    const o = outcomeOf(it);
    const tone = toneOf(o);
    const d = durationOf(it);
    const ip = visitorOf(it);
    const lead = leadOf(it);
    const tag = lead ? [lead.method, lead.status].filter((x) => x !== null).join(' ') : '';
    const title = titleOf(it, tx);
    // What happened, whole: the title and a request's path (the row's spoken name keeps it uncut).
    const rest = lead ? `${title} ${lead.path}` : title;
    const isSel = selected === it.k;
    const isCur = it.k === cursorKey;
    const bar = isCur && focus.focused ? '▌ ' : isCur ? '› ' : isSel ? '│ ' : '  ';
    const geo = ip ? geoOf(ip) : null;
    const country = geo && geo.s === 'known' ? geo.country : '';
    const cell = (c: Col) => {
      if (c === 'time') return <Box key={c} width={cols.time} shrink={0}><Text colour="muted">{clockTime(it.t)}</Text></Box>;
      if (c === 'out') return <Box key={c} width={cols.out} shrink={0} clip>{o === 'neutral' ? null : <StatusPill tone={tone === 'danger' ? 'danger' : tone === 'ok' ? 'ok' : 'warn'} dot>{t(`out.${o}`)}</StatusPill>}</Box>;
      if (c === 'src') return <Box key={c} width={cols.src} shrink={0}><Text colour="muted">{t(`src.${sourceOf(it)}`)}</Text></Box>;
      if (c === 'what') {
        // The request line ("GET 200") is never cut; the words after it give way, a path keeping its tail.
        return (
          <Box key={c} dir="row" grow={1} shrink={1} minWidth={0}>
            {tag ? <Text bold>{tag + ' '}</Text> : null}
            <ClipText text={rest} cut={/\//.test(rest) ? 'path' : 'end'} />
          </Box>
        );
      }
      if (c === 'visitor') {
        return (
          <Box key={c} dir="row" width={VISITOR_W} shrink={0}>
            {ip ? <ClipText text={country ? `${ip} ${country}` : ip} cut="start" colour="muted" /> : null}
          </Box>
        );
      }
      return <Box key={c} width={cols.took} shrink={0} justify="end"><Text colour="muted">{d === null ? '' : padCells(t('row.ms', { n: formatNumber(d) }), cols.took, 'end')}</Text></Box>;
    };
    return (
      <RowLine
        key={it.k}
        name={`${clockTime(it.t)} ${o === 'neutral' ? '' : t(`out.${o}`)} ${tag} ${rest}`.replace(/\s+/g, ' ').trim()}
        selected={isSel}
        bg={(isCur && focus.focused) || isSel ? 'selected' : undefined}
        focusRow={() => { focus.focus(); onActive(it.k); }}
        onPress={() => { focus.focus(); onActive(it.k); onSelect(it); }}
      >
        <TableMark colour={isCur && focus.focused ? 'focus' : 'blueText'} width={LEAD}>{bar}</TableMark>
        {shown.list.flatMap((c, i) => (i ? [sep(`s:${c}`), cell(c)] : [cell(c)]))}
      </RowLine>
    );
  };

  const lines = slice.map((it) => (it.kind === 'div'
    ? (
      <Box key={it.k} dir="row" height={1} shrink={0} sem={{ role: 'separator' }}>
        <TableMark width={LEAD}>{' '}</TableMark>
        <Text colour="muted">{`── ${it.div === 'day' ? dayLabel(it.t ?? 0) : t(`live.${it.div}`)} ──`}</Text>
      </Box>
    )
    : isData(it) ? row(it) : null));

  return (
    <Box dir="column" grow={1} minHeight={0} onSize={onSize} sem={{ role: 'region', name: t('list') }}>
      {snap.newCount > 0 && (
        <Box dir="row" shrink={0}>
          <Button size="sm" variant="primary" icon="arrow-up" onPress={onJump}>
            {t('pill.new', { count: snap.newCount, n: formatNumber(snap.newCount) })}
          </Button>
        </Box>
      )}
      {snap.moreNewer && !snap.liveOn && (
        <Box dir="row" shrink={0}><Button size="sm" variant="secondary" onPress={onNewer}>{t('act.newer')}</Button></Box>
      )}
      {head}
      <Box dir="row" grow={1} minHeight={0}>
        <Box
          dir="column"
          grow={1}
          minHeight={0}
          clip
          onSize={onViewSize}
          // The list's own focus sits on its rows: without a drawn node the focus order leaves it out, and Tab never
          // comes back to it once it has gone.
          boxRef={focus.ref}
          onWheel={(e) => { const dir = (e as { scroll?: { direction?: string } }).scroll?.direction; if (dir === 'up') w.scroll(-3); else if (dir === 'down') w.scroll(3); }}
        >
          {lines}
        </Box>
        <ScrollThumb bar={w.bar} view={w.view} />
      </Box>
      {snap.moreOlder && (
        <Box dir="row" shrink={0}>
          <Button size="sm" variant="secondary" busy={snap.olderBusy} onPress={onOlder}>{t('act.older')}</Button>
        </Box>
      )}
    </Box>
  );
};

/** One row: a table row a reader (or a scenario) can find, focus (the list's cursor goes there) and click. */
function RowLine({ name, selected, bg, focusRow, onPress, children }: { name: string; selected: boolean; bg: 'selected' | undefined; focusRow: () => void; onPress: () => void; children: ReactNode }) {
  const f = useRef<Focusable>({ focused: false, ref: { current: null }, focus: focusRow, blur: () => {} });
  f.current.focus = focusRow;
  const semRef = useSem({ role: 'row', name, selected: selected || undefined }, { role: 'row', focus: f.current });
  return (
    <Box dir="row" height={1} shrink={0} bg={bg} boxRef={semRef} onPress={onPress}>
      {children}
    </Box>
  );
}
