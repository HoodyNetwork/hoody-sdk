// The inspector: one schedule's facts, next runs, history and Advanced (the masked command).
import {
  Button, CodeBlock, CopyButton, Icon, useWipeOn, OutcomeBanner, DataTable, DetailBody, DetailHeader, EmptyState, ErrorState, Facts, Notice, NotifyHint, Row, Section, Skeleton, Stack, StatusPill, Switch, Tag, TextButton, When, createColumnHelper, useStrings,
} from '@kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type HistoryRun, useHistory, useReveal } from '../data';
import { mask, type SchedRow } from '../logic';
import strings from '../strings.en.json';
import { firstOutputLine, newestFailed } from './failLine';
import { OpNote } from './OpNote';
import { headerParts } from './RowActions';
import { type Op, isHeld, onOffUnknown } from './ops';
import { type Zone, kindText, labelText, lastText, lastTone, loopText, nextText, runLine, scheduleText, tookText, whenText, type T } from './words';

export interface DetailProps {
  row: SchedRow;
  now: number;
  zone: Zone;
  op: Op | undefined;
  onRun: (row: SchedRow) => void;
  onPause: (row: SchedRow, on: boolean) => void;
  onEdit: (row: SchedRow) => void;
  onDelete: (row: SchedRow) => void;
  onCheck: (row: SchedRow) => void;
  onDismiss: (row: SchedRow) => void;
  onScripts?: (row: SchedRow) => void;
  /** Absent where this load hides Bots. */
  onChat?: (row: SchedRow) => void;
}

const hist = createColumnHelper<HistoryRun>();
const SHOWN = 10;

const histTone = (r: HistoryRun['result']) => (r === 'ok' ? 'ok' : r === 'failed' || r === 'lost' || r === 'timeout' ? 'danger' : r === 'running' ? 'info' : 'neutral');

function histWord(t: T, r: HistoryRun): string {
  return r.result === 'failed' && r.exit != null ? t('hist.exit', { n: r.exit }) : t(`hist.${r.result}`);
}

type HistoryRead = ReturnType<typeof useHistory>;

/** `history`: the inspector's one read of this row's runs (the failed-run line uses the same answer). `open`: a run to
 *  open and scroll to (See output); it waits until the runs are shown, and `onOpened` hands it back once handled, so
 *  the parent drops it (a remount, such as coming back to this row, never repeats it). The parent keys this component
 *  by the row, so Show more never carries over to another row. */
function History({ row, now, zone, history, open, onOpened }: { row: SchedRow; now: number; zone: Zone; history: HistoryRead; open?: { id: string; seq: number }; onOpened: (seq: number) => void }) {
  const t = useStrings(strings);
  const [all, setAll] = useState(false);
  const handled = useRef(0);
  // The run the table is asked to open (DataTable openRow): passed on once the runs are shown, handed back by the table.
  const [ask, setAsk] = useState<{ id: string; seq: number } | undefined>(undefined);
  const loaded = history.isPending || history.error ? undefined : history.data?.runs;
  useEffect(() => {
    if (!open || handled.current === open.seq || !loaded) return;
    const at = loaded.findIndex((r) => r.id === open.id);
    if (at < 0) {
      handled.current = open.seq;
      onOpened(open.seq);
      return;
    }
    // A run past the first ten: show them all, then open it once that render is in.
    if (at >= SHOWN && !all) {
      setAll(true);
      return;
    }
    // The table expands the run, brings it to the top and focuses its toggle (web and terminal alike).
    setAsk((a) => (a?.seq === open.seq ? a : { id: open.id, seq: open.seq }));
  }, [open, loaded, all, onOpened]);
  const opened = useCallback(
    (seq: number) => {
      handled.current = seq;
      setAsk(undefined);
      onOpened(seq);
    },
    [onOpened],
  );
  const columns = useMemo(
    () => [
      hist.accessor('at', { header: t('hist.time'), cell: (c) => <When at={c.getValue()} text={whenText(t, c.getValue(), now, zone)} />, meta: { width: '176px' } }),
      hist.display({
        id: 'result',
        header: t('hist.result'),
        cell: (c) => (
          <Row gap={2}>
            <StatusPill tone={histTone(c.row.original.result)} dot>
              {histWord(t, c.row.original)}
            </StatusPill>
          </Row>
        ),
      }),
      hist.display({ id: 'took', header: t('hist.took'), meta: { align: 'end', width: '120px', mono: true }, cell: (c) => (c.row.original.tookMs == null ? '' : tookText(t, c.row.original.tookMs)) }),
    ],
    [t, now, zone],
  );
  if (!row.can.history) return <Notice>{t('d.noHistory')}</Notice>;
  if (history.isPending) return <Skeleton rows={3} variant="text" />;
  if (history.error) return <ErrorState size="compact" title={t('d.histFailed')} onRetry={() => void history.refetch()} />;
  const runs = history.data?.runs ?? [];
  if (!runs.length) return <EmptyState size="sm" title={t('d.noRuns')} />;
  const shown = all ? runs : runs.slice(0, SHOWN);
  return (
    <Stack gap={2}>
      <DataTable
        label={t('detail.history')}
        data={shown}
        columns={columns}
        getRowId={(r) => r.id}
        bare
        fill={false}
        canExpand={(r) => r.result === 'failed' || r.result === 'lost'}
        renderExpanded={(r) => (r.output ? <CodeBlock code={mask(r.output)} label={t('hist.output')} wrap lang="ansi" /> : <Notice>{t('hist.noOutput')}</Notice>)}
        {...(ask ? { openRow: ask } : {})}
        onRowOpened={opened}
      />
      {!all && runs.length > SHOWN && (
        <Row>
          <Button variant="ghost" size="sm" onPress={() => setAll(true)}>
            {t('detail.showMore')}
          </Button>
        </Row>
      )}
    </Stack>
  );
}

function Advanced({ row }: { row: SchedRow }) {
  // One reveal belongs to one row: the parent keys this component by the row, and an answer that lands
  // after the row changed is dropped.
  const live = useRef(row.key);
  live.current = row.key;
  const t = useStrings(strings);
  const reveal = useReveal();
  const [text, setText] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  // Focus follows the swap: Show gives way to Hide and back, so the pressed button's place is not lost.
  // Each one takes focus as it mounts (autoFocus), so no DOM read: the terminal Hub has none. Hide only ever
  // mounts after Show was pressed; Show takes focus back only after Hide was pressed, never on first draw.
  const [backToShow, setBackToShow] = useState(false);
  // The revealed command is a secret: any context end (route, realm, sign-out, page hide) masks it again.
  useWipeOn(() => {
    setText(null);
    setState('idle');
    setBackToShow(false);
  });
  const show = async () => {
    setState('busy');
    const asked = row.key;
    const res = await reveal(row);
    if (asked !== live.current) return;
    if (res) {
      setText(res.text);
      setState('idle');
    } else setState('failed');
  };
  const what = row.src === 'loop' ? t('a.showPrompt') : t('a.show');
  return (
    <Stack gap={2}>
      <Facts
        columns={1}
        items={[
          ...(row.sched.expr ? [{ label: t('a.expr'), value: row.sched.expr, mono: true }] : []),
          ...(row.ref.script ? [{ label: t('a.script'), value: String(row.ref.script), mono: true }] : []),
          ...(row.ref.sid ? [{ label: t('a.session'), value: String(row.ref.sid), mono: true }] : []),
          ...(row.ref.loop ? [{ label: t('a.id'), value: String(row.ref.loop), mono: true }] : []),
        ]}
      />
      {text === null ? (
        <Row gap={2}>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- only after Hide was pressed: focus returns to the button that replaced it */}
          <Button autoFocus={backToShow} size="sm" busy={state === 'busy'} onPress={() => void show()}>
            {what}
          </Button>
          {state === 'failed' && <OutcomeBanner kind="failed" body={t('a.failed')} />}
        </Row>
      ) : (
        <Stack gap={2}>
          {text === '' ? (
            <Notice>{t('a.none')}</Notice>
          ) : (
            <CodeBlock // reason: a loop's saved prompt is English for the agent, not code; a schedule's is the command it runs
              code={mask(text)} label={what} wrap lang={row.src === 'loop' ? 'plain' : 'shell'} />
          )}
          <Notice level="warn">{t('a.caveat')}</Notice>
          <Row gap={2}>
            <CopyButton text={mask(text)} label={t('a.copyMasked')} withLabel />
            {/* The command as it is: a secret, so the terminal copies it only where its screen takes a secret copy. */}
            <CopyButton getValue={() => text} secret label={t('a.copyExact')} withLabel />
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- Hide mounts only after Show was pressed: focus moves to the button that replaced it */}
            <Button autoFocus variant="ghost" size="sm" onPress={() => {
              setBackToShow(true);
              setText(null);
            }}>
              {t('adv.hide')}
            </Button>
          </Row>
        </Stack>
      )}
    </Stack>
  );
}

export function Detail({ row, now, zone, op, onRun, onPause, onEdit, onDelete, onCheck, onDismiss, onScripts, onChat }: DetailProps) {
  const t = useStrings(strings);
  const held = isHeld(op);
  const name = labelText(t, row.label);
  const head = headerParts(t, row, held, { onRun: () => onRun(row), onEdit: () => onEdit(row), onDelete: () => onDelete(row), ...(onScripts ? { onScripts: () => onScripts(row) } : {}), ...(onChat ? { onChat: () => onChat(row) } : {}) });
  // A schedule the page can only show says so as a tag beside its kind.
  const readOnly = !row.can.edit && row.src === 'raw';
  const notes: string[] = [];
  if (row.src === 'timer') notes.push(t('d.timer'));
  if (row.src === 'raw') notes.push(t('d.raw'));
  if (row.src === 'exec' && row.can.run) notes.push(t('d.runScript'));
  if (row.runWhy === 'needs_cron') notes.push(t('d.runNeeds'));
  if (row.runWhy === 'ended' || row.runWhy === 'expired' || row.runWhy === 'stopped') notes.push(t(`d.loopNoRun.${row.runWhy}`));
  if (row.src === 'curl' && !row.can.history) notes.push(t('d.curlNoHistory'));
  if (row.src === 'loop') notes.push(t('d.loopMemory'));

  const status = !row.can.pause ? null : onOffUnknown(op) ? (
    <Row gap={1}>
      <Icon name="clock" size="sm" /> {t('on.unknown')}
    </Row>
  ) : (
    <Switch
      label={row.paused ? t('fact.paused') : t('fact.on')}
      aria-label={row.paused ? t('action.resumeName', { name }) : t('action.pauseName', { name })}
      isSelected={!row.paused}
      isDisabled={held}
      onChange={(on) => onPause(row, on)}
    />
  );
  // Why the last run failed, under Last result: the newest failed run's first output line (masked), and See output opens
  // that run in History. One read per row, passed to History, so both always show the same answer.
  const history = useHistory(row);
  const failedRun = row.can.history && !history.isPending && !history.error ? newestFailed(history.data?.runs) : null;
  const failLine = failedRun ? firstOutputLine(failedRun.output) : '';
  // The ask names its row: one made for another row (this inspector stays mounted across rows) is never followed, and
  // leaving the row drops it. A handled ask is dropped too, so coming back to the row never repeats it.
  const [openAsk, setOpenAsk] = useState<{ id: string; row: string; seq: number } | undefined>(undefined);
  const openRun = openAsk?.row === row.key ? { id: openAsk.id, seq: openAsk.seq } : undefined;
  useEffect(() => {
    setOpenAsk((o) => (o && o.row !== row.key ? undefined : o));
  }, [row.key]);
  const onOpened = useCallback((seq: number) => setOpenAsk((o) => (o && o.seq === seq ? undefined : o)), []);
  // Every press gets a new number, also after a handled ask was dropped (History remembers the numbers it handled).
  const askSeq = useRef(0);
  const lastWhen = (at: number) => whenText(t, at, now, zone);
  const lastWord = row.src === 'loop' ? loopText(t, row) : lastText(t, row.last, lastWhen);
  const last =
    failedRun && failLine ? (
      <Stack gap={1}>
        <span>{lastWord}</span>
        <code>{failLine}</code>
        <Row>
          <TextButton onPress={() => setOpenAsk({ id: failedRun.id, row: row.key, seq: (askSeq.current += 1) })}>{t('hist.seeOutput')}</TextButton>
        </Row>
      </Stack>
    ) : (
      lastWord
    );
  const facts = [
    { label: t('fact.schedule'), value: scheduleText(t, row) },
    ...(status ? [{ label: t('fact.enabled'), value: status }] : []),
    { label: t('d.next'), value: nextText(t, row, now, zone) },
    { label: t('d.last'), value: last },
  ].filter((f) => f.value !== '');

  return (
    <div>
      <DetailHeader
        title={name}
        status={<StatusPill tone={lastTone(row.last)} dot>{lastText(t, row.last, lastWhen)}</StatusPill>}
        meta={readOnly ? <><Tag>{kindText(t, row)}</Tag><Tag>{t('detail.readOnly')}</Tag></> : <Tag>{kindText(t, row)}</Tag>}
        actions={head.actions}
        menu={head.menu}
      />
      <DetailBody>
        <Stack gap={4}>
          {op && <OpNote op={op} onCheck={() => onCheck(row)} onDismiss={() => onDismiss(row)} />}
          {notes.map((n) => (
            <Notice key={n}>{n}</Notice>
          ))}
          <Facts columns={1} items={facts} />
          {row.upcoming.length > 0 && (
            <Section title={t('detail.nextRuns', { count: Math.min(5, row.upcoming.length) })} description={row.sched.zone === 'utc' ? t('tip.zoneUtc') : t('tip.zoneSystem')}>
              <Stack gap={1}>
                {row.upcoming.slice(0, 5).map((at) => (
                  <span key={at}>{runLine(t, at, now, zone, row.sched.zone)}</span>
                ))}
              </Stack>
            </Section>
          )}
          <Section title={t('detail.history')}>
            <History key={row.key} row={row} now={now} zone={zone} history={history} onOpened={onOpened} {...(openRun ? { open: openRun } : {})} />
            <NotifyHint kind="schedule" />
          </Section>
          <Section title={t('detail.advanced')} description={t('d.advancedHelp')}>
            <Advanced key={row.key} row={row} />
          </Section>
        </Stack>
      </DetailBody>
    </div>
  );
}
