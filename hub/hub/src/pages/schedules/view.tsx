// The schedules page: everything that runs by time on the selected computer, in one list with its next
// run and last result. The selection, the filter and the search live in the URL, so Back and deep
// links work. Commands and web requests can be created or edited here; scripts, agent timers and loops
// are changed where they were made.
import {
  AgentHint, Band, Button, ConfirmDialog, DataTable, EmptyState, FirstUseState, Icon, ListDetailPage, PageFrame, PageHeader, Skeleton, StatusPill, Switch, Tag, ComputerRequired, TextButton, askOn, createColumnHelper, followPageLink, showToast, startAgentConversation, useAskDock, useDataView, useGo, usePageLink, useSearchParam, useStrings, type AskStartOutcome,
} from '@kit';
import { AgentSignIn, useAgentSignIn, type SignInComp } from '@app/AgentSignIn';
import { capture, chooseComputer, computerHandle, useAgentScopeFacts } from '@core';
import { useCallback, useMemo, useRef, useState } from 'react';
import { type ActArgs, type SaveArgs, holdAct, holdSave, realmNow, settleAct, settleSave, useAct, useComputer, useComputerKey, useSave, useSchedules } from './data';
import { useScheduleFailAlert } from './failAlert';
import { KIND_FILTERS, type SchedRow, type SourceKey, SHOW_FILTERS, SOURCE_KEYS, actFor, attentionRank, confirmStands, countCreated, createBaseline, createProven, editProven, model, nextAt, proofOf, searchWords, statusOf } from './logic';
import { links as botsLinks } from '../bots/links';
import { links as scriptsLinks } from '../scripts/links';
import { Detail } from './parts/Detail';
import { Editor } from './parts/Editor';
import { NameCell, NextCell, NextLine, ScheduleCell, termNameCell } from './parts/NameCell';
import { SummaryLine } from './parts/SummaryLine';
import { OpNote } from './parts/OpNote';
import { useListRetry } from './parts/listRetry';
import { isHeld, onOffUnknown, opsStore, savedArgs, useOps } from './parts/ops';
import { rowEntries } from './parts/RowActions';
import { type Zone, labelText, lastShort, lastTone, nextShort, scheduleText, sourceNote, whenText } from './parts/words';
import strings from './strings.en.json';

const col = createColumnHelper<SchedRow>();


/** A source that did not answer: its plain sentence. */
type SourceLine = { key: SourceKey; text: string };

/** Sources that did not answer: one warning line each under the toolbar. */
function SourceBand({ lines }: { lines: SourceLine[] }) {
  return (
    <>
      {lines.map((l) => (
        <Band key={l.key} tone="warn" size="table">
          {l.text}
        </Band>
      ))}
    </>
  );
}

// A question belongs to the computer whose row it was asked about: a switch under it (the URL, the back button) closes
// it, and it never resolves its key against another computer's rows (a schedule of the same name there).
// `variant`: the loop question asked (resume or once); a poll that changes it closes the dialog rather than rewording it.
type Confirm = { kind: 'delete' | 'loop'; key: string; computer: string; variant?: SchedRow['confirm'] };
// A loop change is sent in a realm (the agent's): its op keeps that realm. The other changes go to a computer only.
const inRealm = (a: string): boolean => a === 'loop.pause' || a === 'loop.run' || a === 'loop.del';

export default function SchedulesPage() {
  const t = useStrings(strings);
  const go = useGo();
  const computer = useComputer();
  const agentFacts = useAgentScopeFacts();
  // The person's Try again on a computer list not known keeps its button, busy, through its own read (parts/listRetry).
  const { askedAgain, retry: retryList } = useListRetry(computer.read);
  const scriptsLink = usePageLink('scripts');
  const programsLink = usePageLink('programs');
  const data = useSchedules();
  const act = useAct();
  const save = useSave();
  const ops = useOps();
  // A held change belongs to the computer it was sent to: it stays held across a switch, and shows again when
  // the person comes back. Keys carry the computer.
  const computerKey = useComputerKey();
  // The computer now selected, read after an await: a save that waited on a read must not go to another computer.
  const computerNow = useRef(computerKey);
  computerNow.current = computerKey;
  const ok = useCallback((k: string) => `${computerKey}\u0001${k}`, [computerKey]);
  const [edit, setEdit] = useSearchParam('edit');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [saving, setSaving] = useState<{ busy: boolean; outcome?: 'pending' | 'failed' | 'not_sent'; code?: string; checking?: boolean }>({ busy: false });

  const m = useMemo(() => (data.data ? model(data.data) : null), [data.data]);
  // A schedule that fails while the page is open: a browser alert for a person who has looked away (failAlert). Scoped by
  // the computer the rows were read from, never the one selected now (its rows may not have come yet).
  useScheduleFailAlert(m?.rows, data.data?.computer ?? '');
  const now = data.data?.now ?? Date.now();
  const zone: Zone = useMemo(() => ({ offset: data.data?.utcOffset ?? null, mine: Intl.DateTimeFormat().resolvedOptions().timeZone }), [data.data?.utcOffset]);
  // Only a schedule the page can edit opens the editor, however its key got into the URL.
  const editable = edit && edit !== 'new' ? m?.rows.find((r) => r.key === edit && r.can.edit) : undefined;
  const editing: 'new' | SchedRow | undefined = edit === 'new' ? 'new' : editable;

  // ── Actions (C9: one request per press, never resent) ──────────────────────────────

  const send = useCallback(
    async (row: SchedRow, args: ActArgs, extra?: { enabled?: boolean }) => {
      if (isHeld(opsStore.get(ok(row.key)))) return;
      opsStore.set(ok(row.key), { act: args.act, status: 'working', row, ...(extra?.enabled !== undefined ? { enabled: extra.enabled } : {}), ...(inRealm(args.act) ? { realm: realmNow() } : {}) });
      const res = await act(args);
      if (res.outcome === 'done' || res.outcome === 'stale') opsStore.clear(ok(row.key));
      else if (res.outcome === 'pending') opsStore.patch(ok(row.key), { status: 'unknown', ...(res.hold ? { hold: res.hold } : {}) });
      // READ_BACK_FIRST: an earlier try on this may have gone through; it is not "not sent".
      else if (res.outcome === 'not_sent' && res.code === 'READ_BACK_FIRST') opsStore.patch(ok(row.key), { status: 'unknown', earlier: true, ...(res.hold ? { hold: res.hold } : {}) });
      else if (res.outcome === 'not_sent') opsStore.patch(ok(row.key), { status: 'refused', ...(res.code === 'HELD_BY_OTHER' ? { code: res.code } : {}) });
      else opsStore.patch(ok(row.key), { status: 'failed', ...(res.code ? { code: res.code } : {}) });
      void data.refetch();
    },
    [act, data, ok],
  );

  const onRun = useCallback(
    (row: SchedRow) => {
      if (row.confirm) setConfirm({ kind: 'loop', key: row.key, computer: computerKey, variant: row.confirm });
      else void send(row, { act: actFor(row, 'run'), row });
    },
    [send, computerKey],
  );
  const onPause = useCallback((row: SchedRow, on: boolean) => void send(row, { act: actFor(row, 'pause'), row, enabled: on }, { enabled: on }), [send]);
  const onDelete = useCallback((row: SchedRow) => setConfirm({ kind: 'delete', key: row.key, computer: computerKey }), [computerKey]);
  // The question asked on another computer is closed for good: coming back does not open it again.
  if (confirm && confirm.computer !== computerKey) setConfirm(null);
  const onEdit = useCallback((row: SchedRow) => setEdit(row.key), [setEdit]);
  // A script row opens that script selected on the Scripts page: the selected computer's handle and the row's path. With
  // either unknown there is no link at all, never one to the bare list or to another computer's script. A row read for another
  // computer (the first render after a switch still holds the old list) gets no link either.
  const handle = computer.data?.name && computerKey ? computerHandle({ id: computerKey, name: computer.data.name }) : '';
  const onScriptsFor = useCallback(
    (row: SchedRow): (() => void) | undefined => {
      if (!scriptsLink) return undefined;
      if (scriptsLink.kind !== 'hub') return () => followPageLink(scriptsLink, go);
      if (row.ref.computer !== undefined && row.ref.computer !== computerKey) return undefined;
      const href = scriptsLinks.script(handle, typeof row.ref.script === 'string' ? row.ref.script : '');
      return href ? () => go(href) : undefined;
    },
    [scriptsLink, go, handle, computerKey],
  );
  const botsLink = usePageLink('bots');
  const computersLink = usePageLink('computers');
  const guideLink = usePageLink('guide');
  // A loop's chat is its agent's: the Bots page opens on this computer's Bots (it takes no session id).
  const dock = useAskDock();
  // With Ask on, the agent choice is the drawer's own step: Send starts a NEW Agent conversation with the words on the
  // computer shown (the panel opens beside the list with it); the other puts them in the panel's composer, not sent, and closes the
  // drawer. With Ask off, Bots (onChat) is the only way to the agent. The drawer may close while a start waits for the panel: a
  // start that then did not leave has lost its place, so a toast names its computer, and its one way puts the words in that
  // computer's panel composer (not sent), showing that computer first when another one is shown by then, as a start for another
  // computer does. One that may have gone through is the panel's (its conversation, its Check).
  const onAskSend = askOn()
    ? (text: string, onStart: (o: AskStartOutcome) => boolean) => {
        // The start goes to the computer shown now (kit startAgentConversation binds it there): its words go back to that one.
        const was = capture().target;
        const name = computer.data?.name ?? '';
        void startAgentConversation({
          text,
          source: t('title'),
          onStart: (o) => {
            if (onStart(o) || o !== 'notSent') return;
            showToast({
              // noDetails: a start that did not leave carries no rejection (kit startAgentConversation tells only notSent).
              title: t('new.agentLate', { computer: name }),
              body: t('new.agentLateBody'),
              tone: 'error',
              action: {
                label: t('new.agentLateGo'),
                onAction: () => {
                  if (was && capture().target?.container.id !== was.container.id) {
                    chooseComputer({ id: was.container.id, project_id: was.project.id, ...(was.container.server_name !== undefined ? { server_name: was.container.server_name } : {}) });
                  }
                  dock.open({ text, source: t('title'), ...(was ? { computer: was.container.id } : {}) });
                },
              },
            });
          },
        });
      }
    : undefined;
  const onAskPanel = askOn() ? (text: string) => { setEdit(undefined); dock.open({ text, source: t('title') }); } : undefined;
  const onChat = useCallback(
    (_row?: SchedRow) => botsLink && (botsLink.kind === 'hub' ? go(computerKey ? botsLinks.byComputer(computerKey) : botsLink.href) : followPageLink(botsLink, go)),
    [go, botsLink, computerKey],
  );

  // A signed-out agent (its loops not read): the shared sign-in, its own button, here. Its proof is this page's own
  // read: signed in only while the loops answer ('ok'); any other state (failed, private, not read yet) proves nothing, so the
  // box shows no "signed in" then.
  const loopOut = m?.sources.loop.state === 'signed_out';
  const loopOk = m?.sources.loop.state === 'ok';
  const signInComp = useMemo<SignInComp | undefined>(
    () => (computerKey && computer.data ? {
      id: computerKey, name: computer.data.name,
      agent: loopOk ? { writer: true } : loopOut ? { writer: false, writerWhy: 'login', signIn: 'offer' } : { writer: false, writerWhy: 'unread' },
    } : undefined),
    [computerKey, computer.data, loopOk, loopOut],
  );
  const reread = useCallback(async () => {
    const r = await data.refetch();
    return !!r.data && model(r.data).sources.loop.state === 'ok';
  }, [data]);
  const signIn = useAgentSignIn(signInComp, null, reread);

  const onConfirm = useCallback(() => {
    const c = confirm;
    setConfirm(null);
    const row = c && c.computer === computerNow.current ? m?.rows.find((r) => r.key === c.key) : undefined;
    if (!c || !row) return;
    if (c.kind === 'delete') void send(row, { act: actFor(row, 'del'), row });
    else void send(row, { act: actFor(row, 'run'), row });
  }, [confirm, m, send]);

  // Check again reads only: it never sends the action a second time. Only an ok, complete read proves, and it proves
  // the send it is about: the pending answer's hold, else the one held before this read, never one held when the read
  // comes back (another tab may have proved an older send and sent the same change again meanwhile). An earlier
  // send (READ_BACK_FIRST) is never proven by this press's values, and a loop change only by a read of its realm.
  const onCheck = useCallback(
    async (row: SchedRow) => {
      const op = opsStore.get(ok(row.key));
      if (!op || op.status !== 'unknown' || op.act === 'save') return;
      if (op.earlier) {
        opsStore.patch(ok(row.key), { checking: false, stuck: true });
        return;
      }
      opsStore.patch(ok(row.key), { checking: true });
      const args: ActArgs = { act: op.act, row, ...(op.enabled !== undefined ? { enabled: op.enabled } : {}) };
      const hold = op.hold ?? (await holdAct(args));
      // Checked in the same synchronous step that starts the read: the read takes the realm shown then.
      if (op.realm !== undefined && realmNow() !== op.realm) {
        opsStore.patch(ok(row.key), { checking: false, stuck: true });
        return;
      }
      const fresh = await data.refetch();
      const next = fresh.data ? model(fresh.data) : null;
      const proof = next ? proofOf(next, row, { act: op.act, ...(op.enabled !== undefined ? { enabled: op.enabled } : {}) }) : 'unreadable';
      if (proof === 'proven') {
        if (hold !== undefined) settleAct(args, hold);
        opsStore.clear(ok(row.key));
      } else opsStore.patch(ok(row.key), { checking: false, stuck: true });
    },
    [data, ok],
  );
  // Dismissing a held change that nothing could prove releases core's lock: a press after it replays the same key.
  const onDismiss = useCallback((row: SchedRow) => {
    const op = opsStore.get(ok(row.key));
    if (op?.status === 'unknown' && op.act !== 'save') settleAct({ act: op.act, row, ...(op.enabled !== undefined ? { enabled: op.enabled } : {}) }, op.hold);
    opsStore.clear(ok(row.key));
  }, [ok]);

  const saveKey = (target: 'new' | SchedRow | undefined): string => ok(`save:${target === 'new' || !target ? 'new' : target.key}`);
  const onSave = useCallback(
    async (d: { name: string; command: string; runAs: 'user' | 'root' }, expr: string, row: SchedRow | null) => {
      const key = ok(`save:${row ? row.key : 'new'}`);
      if (isHeld(opsStore.get(key))) return;
      const args: SaveArgs = { row, name: d.name, command: d.command, schedule: expr, runAs: d.runAs, computer: computerKey };
      setSaving({ busy: true });
      opsStore.set(key, { act: 'save', status: 'working', expr });
      // What a fresh read shows of this create just before it is sent: the proof is a rise above it. Not the cached
      // list, which may be minutes old; a read that cannot be taken leaves no baseline, so nothing can prove it.
      let before: number | null = null;
      if (!row) {
        const base = await data.refetch();
        before = createBaseline(base.data, { user: d.runAs, schedule: expr, command: d.command, name: d.name });
      }
      if (computerNow.current !== computerKey) {
        // The context changed during the read: nothing was sent, and the held key is for the old computer.
        opsStore.clear(key);
        setSaving({ busy: false, outcome: 'not_sent' });
        return;
      }
      savedArgs.set(key, { args, before });
      const res = await save(args);
      if (res.outcome === 'done' || res.outcome === 'stale') {
        opsStore.clear(key);
        setSaving({ busy: false });
        setEdit(undefined);
        void data.refetch();
      } else if (res.outcome === 'pending' || (res.outcome === 'not_sent' && res.code === 'READ_BACK_FIRST')) {
        // An earlier try may have gone through: held until a read proves it (the send named by the answer's hold).
        // READ_BACK_FIRST: an earlier send of the lock is held, maybe with other values: only allowing another try frees it.
        const earlier = res.outcome === 'not_sent';
        if (res.hold || earlier) savedArgs.set(key, { args, before, ...(res.hold ? { hold: res.hold } : {}), ...(earlier ? { earlier } : {}) });
        opsStore.patch(key, { status: 'unknown', ...(earlier ? { earlier } : {}) });
        setSaving({ busy: false });
      } else {
        opsStore.clear(key);
        setSaving({ busy: false, outcome: res.outcome === 'not_sent' ? 'not_sent' : 'failed', ...(res.code ? { code: res.code } : {}) });
      }
    },
    [save, data, setEdit, computerKey, ok],
  );
  // Check again for a save reads the list fresh. An edit is proven by every field sent reading back (editProven); a create by
  // a matching command (same user, schedule and command) that was not in the list before. Only an ok, complete
  // read proves; anything else leaves it held, and the person may allow another try knowing it may add a second.
  const onCheckSave = useCallback(
    async (key: string) => {
      const held = savedArgs.get(key);
      const sent = held?.args as SaveArgs | undefined;
      const op = opsStore.get(key);
      if (!held || !sent || !op || op.status !== 'unknown') return;
      if (held.earlier) {
        opsStore.patch(key, { checking: false, stuck: true });
        return;
      }
      opsStore.patch(key, { checking: true });
      // The send this read is about: the answer's hold, else the one held before the read (as onCheck).
      const hold = held.hold ?? (await holdSave(sent));
      const fresh = await data.refetch();
      const next = fresh.data ? model(fresh.data) : null;
      let proven = false;
      if (sent.row) {
        const kind = sent.row.src === 'curl' ? 'curl' : 'cron';
        const readable = !!next && next.sources[kind].state === 'ok' && next.sources[kind].complete;
        const after = readable ? next.rows.find((r) => r.key === sent.row?.key) : undefined;
        proven = editProven({ row: sent.row, name: sent.name, command: sent.command, schedule: sent.schedule }, after);
      } else if (fresh.data) {
        const now = countCreated(fresh.data, { user: sent.runAs, schedule: sent.schedule, command: sent.command, name: sent.name });
        proven = createProven(held.before, now);
      }
      if (proven) {
        if (hold !== undefined) settleSave(sent, hold);
        opsStore.clear(key);
        setSaving({ busy: false });
        setEdit(undefined);
      } else opsStore.patch(key, { checking: false, stuck: true });
    },
    [data, setEdit],
  );
  // Allowing another try is the person's explicit call, made after the Check again found nothing. It lets go only the held save
  // the question was opened for (`asked`, its savedArgs record): when another send's record took its place, nothing.
  const onAllowAgain = useCallback((key: string, asked: unknown) => {
    const held = savedArgs.get(key);
    if (held !== asked) return;
    const sent = held?.args as SaveArgs | undefined;
    if (sent) settleSave(sent, held?.hold);
    opsStore.clear(key);
  }, []);

  // ── Table ───────────────────────────────────────────────────────────────────────────

  // A held change's note (words and Check again) needs the room: only a listed row of this computer that holds one (ops
  // are kept across computers, a held save shows in its editor, and a kept failed/not-sent note fits the narrow width).
  const noteShown = !!m?.rows.some((r) => isHeld(ops.get(ok(r.key))));
  const columns = useMemo(
    () => [
      col.accessor((r) => labelText(t, r.label), {
        id: 'name',
        header: t('col.name'),
        meta: { pinned: true, list: 'primary' },
        cell: (c) => {
          const r = c.row.original;
          if (termNameCell) return termNameCell({ attention: !!r.attention, attentionLabel: t('f.attention'), name: labelText(t, r.label), after: <Tag>{t(`kind.${r.src}` as 'kind.cron')}</Tag> });
          return <NameCell row={r}>{labelText(t, r.label)}</NameCell>;
        },
      }),
      // List rows (phone, or beside a detail): a held change's note leads line 2 so the name keeps line 1; then the next
      // run and the schedule, as before. Tables show the note in Last result and the next run in its own column.
      col.display({
        id: 'op',
        header: t('col.last'),
        enableHiding: false,
        meta: { list: 'meta', table: false },
        cell: (c) => {
          const r = c.row.original;
          const op = ops.get(ok(r.key));
          return op ? <OpNote op={op} compact narrow onCheck={() => void onCheck(r)} onDismiss={() => onDismiss(r)} /> : null;
        },
      }),
      col.display({
        id: 'nextList',
        header: t('col.next'),
        enableHiding: false,
        meta: { list: 'meta', table: false },
        cell: (c) => {
          return <NextLine row={c.row.original} now={now} zone={zone} />;
        },
      }),
      col.accessor((r) => scheduleText(t, r), {
        id: 'schedule',
        header: t('col.schedule'),
        meta: { width: '190px', priority: 3, list: 'meta' },
        cell: (c) => {
          return <ScheduleCell row={c.row.original}>{c.getValue()}</ScheduleCell>;
        },
      }),
      col.accessor((r) => nextAt(r), {
        id: 'next',
        header: t('col.next'),
        meta: { width: '190px', priority: 2, list: false },
        cell: (c) => {
          return <NextCell row={c.row.original} now={now} zone={zone} />;
        },
      }),
      col.accessor((r) => attentionRank(r), {
        id: 'last',
        header: t('col.last'),
        meta: { width: noteShown ? '346px' : '150px', priority: 1, list: false }, // 346: Check again as a chip button
        cell: (c) => {
          const r = c.row.original;
          const op = ops.get(ok(r.key));
          if (op) return <OpNote op={op} compact onCheck={() => void onCheck(r)} onDismiss={() => onDismiss(r)} />;
          return (
            <StatusPill tone={lastTone(r.last)} dot>
              {lastShort(t, r.last, (at) => whenText(t, at, now, zone))}
            </StatusPill>
          );
        },
      }),
      col.display({
        id: 'lastList',
        header: t('col.last'),
        enableHiding: false,
        meta: { list: 'status', table: false },
        cell: (c) => {
          const r = c.row.original;
          return (
            <StatusPill tone={lastTone(r.last)} dot>
              {lastShort(t, r.last, (at) => whenText(t, at, now, zone))}
            </StatusPill>
          );
        },
      }),
      col.display({
        id: 'on',
        header: t('col.on'),
        meta: { width: '64px', align: 'end', priority: 1, list: false },
        cell: (c) => {
          const r = c.row.original;
          // A script is turned on and off in Scripts: a mark with that reason, never an empty cell.
          if (!r.can.pause) return r.src === 'exec' ? <Icon name="minus" size="sm" label={t('on.inScripts')} /> : null;
          if (onOffUnknown(ops.get(ok(r.key)))) return <Icon name="clock" size="sm" label={t('on.unknown')} />;
          const name = labelText(t, r.label);
          return <Switch aria-label={r.paused ? t('action.resumeName', { name }) : t('action.pauseName', { name })} label="" isSelected={!r.paused} isDisabled={isHeld(ops.get(ok(r.key)))} onChange={(on) => onPause(r, on)} />;
        },
      }),
    ],
    [t, now, zone, ops, ok, onCheck, onDismiss, onPause, noteShown],
  );

  const view = useDataView<SchedRow>({
    rows: m?.rows,
    columns,
    getRowId: (r) => r.key,
    pageSize: 50,
    search: (r) => searchWords(r, `${labelText(t, r.label)} ${scheduleText(t, r)}`),
    filters: [
      {
        id: 'kind',
        label: t('f.kind'),
        display: 'segmented',
        value: (r) => r.kind,
        options: KIND_FILTERS.map((f) => ({ value: f, label: t(`f.${f}` as 'f.commands') })),
      },
      {
        id: 'status',
        label: t('f.status'),
        value: (r) => statusOf(r),
        options: SHOW_FILTERS.map((f) => ({ value: f, label: t(`f.${f}` as 'f.paused') })),
      },
    ],
    sort: 'next',
    isLoading: data.isPending,
    error: data.error,
  });
  const current = m?.rows.find((r) => r.key === view.activeId);
  const currentToScript = current ? onScriptsFor(current) : undefined;
  // A held action whose schedule left the list (deleted, or gone from a later read) keeps its note, with Check and Dismiss.
  const orphans = [...ops.entries()].filter(
    ([k, op]) => !!m && op.row && k.startsWith(`${computerKey}\u0001`) && isHeld(op) && op.status === 'unknown' && !m?.rows.some((r) => ok(r.key) === k),
  );

  // ── Page ────────────────────────────────────────────────────────────────────────────

  const name = computer.data?.name ?? '';
  // New schedule is in the header in every state that lists, so adding one never depends on what was read. A screen
  // that lists nothing at all (no computer, stopped, the whole read failed) has no editor, so it gets no button.
  // The summary line holds links (Computers, Programs): it is the header's context row, never its subtitle, a two-line
  // clamp that cut the last link off beside the header's buttons while Tab still reached it.
  // `quiet`: the list is empty and its empty state shows New schedule as the screen's one primary, so the header's
  // stays but is drawn as a secondary button (one accent a screen).
  const header = (summary?: React.ReactNode, quiet = false) => ({
    title: t('title'),
    ...(summary ? { context: summary } : {}),
    actions: <AgentHint page="schedules" facts={agentFacts} />,
    primary: { label: t('action.new'), icon: 'plus' as const, onPress: () => setEdit('new') },
    primaryQuiet: quiet,
  });

  // No computer chosen: "none" only on a known list (C9). A list still loading reads as loading; one not loaded says
  // so, with Try again, never "No computer selected".
  const chosen = !!computer.data;
  const listRetry = computer.retry;
  if (!chosen && (computer.read === 'unknown' || (computer.read === 'loading' && askedAgain))) {
    return (
      <ComputerRequired
        state="failed"
        header={{ title: t('title') }}
        title={t('st.title.computersUnknown')}
        body={t('st.computersUnknown')}
        {...(listRetry ? { onRetry: () => retryList(listRetry) } : {})}
        retrying={computer.read === 'loading'}
      />
    );
  }
  if (!chosen && computer.read === 'loading') {
    return (
      <PageFrame>
        <PageHeader title={t('title')} />
        <Skeleton rows={4} />
      </PageFrame>
    );
  }
  if (computer.data === null) {
    return <ComputerRequired state="none" header={{ title: t('title') }} title={t('st.title.noComputer')} body={t('st.pick')} />;
  }
  if (computer.data && computer.data.status.toLowerCase() !== 'running') {
    return <ComputerRequired state="stopped" header={{ title: t('title') }} name={name} title={t('st.title.stopped')} body={t('st.stopped', { name })} />;
  }

  const errCode = (data.error as { kind?: string } | null | undefined)?.kind;
  if (data.error && !m) {
    return (
      <ComputerRequired
        state="failed"
        header={{ title: t('title') }}
        title={errCode === 'forbidden' ? t('st.title.private') : t('st.title.failed')}
        body={errCode === 'forbidden' ? t('st.private', { name }) : t('st.failed')}
        onRetry={() => void data.refetch()}
      />
    );
  }

  // A signed-out agent gets the shared sign-in box below in place of its line, when this session may sign it in (else the line
  // stays, and the box's shared-access note says who can). A stopped Curl has no line (sourceNote), so no Start here.
  const signInOwnsLoop = loopOut && signIn.offered;
  // The box while the agent is signed out, and its result (signed in, may have been) after the loops answer again.
  const signInShows = loopOut || signIn.shown !== null;
  const notes: SourceLine[] = m ? SOURCE_KEYS.flatMap((k) => {
    if (k === 'loop' && signInOwnsLoop) return [];
    const text = sourceNote(t, k, m.sources[k]);
    if (!text) return [];
    return [{ key: k, text }];
  }) : [];
  const summary = m ? (
    <SummaryLine
      lead={[
        // Nothing found yet while a source is unread: "At least 0" reads broken, so the count drops out.
        t(m.atLeast ? (m.total === 0 ? 'sum.lineNoneSoFar' : 'sum.lineAtLeast') : 'sum.line', { count: m.total, name }),
        m.next && 'at' in m.next.next ? t('sum.nextIs', { name: labelText(t, m.next.label), when: nextShort(t, m.next, now, zone)?.rel ?? '' }) : '',
        m.failedToday > 0 ? t('sum.failedToday', { count: m.failedToday }) : '',
      ].filter(Boolean).join(' · ')}
      after={[
        ...(computersLink ? [{ key: 'computers', text: t('sum.computers'), node: <TextButton onPress={() => followPageLink(computersLink, go)}>{t('sum.computers')}</TextButton> }] : []),
        ...(m.programsRunning > 0
          ? [{
              key: 'programs',
              text: t('sum.programs', { count: m.programsRunning }),
              node: programsLink ? (
                <TextButton onPress={() => followPageLink(programsLink, go)}>{t('sum.programs', { count: m.programsRunning })}</TextButton>
              ) : (
                t('sum.programs', { count: m.programsRunning })
              ),
            }]
          : []),
      ]}
    />
  ) : (
    name
  );

  const empty = m && m.atLeast ? (
    <EmptyState icon="schedules" title={t('empty.title')} body={t('st.incomplete')} size="sm" action={<Button variant="primary" onPress={() => setEdit('new')}>{t('action.new')}</Button>} />
  ) : (
    <FirstUseState
      icon="schedules"
      title={t('empty.title2', { name })}
      body={t('empty.body2')}
      action={<Button variant="primary" onPress={() => setEdit('new')}>{t('action.new')}</Button>}
      {...(guideLink ? { learn: <TextButton onPress={() => followPageLink(guideLink, go)}>{t('empty.guide')}</TextButton> } : {})}
    />
  );

  const confirmFound = confirm && confirm.computer === computerKey ? m?.rows.find((r) => r.key === confirm.key) : undefined;
  const confirmRow = confirm && confirmFound && confirmStands(confirm, confirmFound) ? confirmFound : undefined;
  if (confirmFound && !confirmRow) setConfirm(null);
  const confirmName = confirmRow ? labelText(t, confirmRow.label) : '';
  const editKey = saveKey(editing);
  const editOp = ops.get(editKey);

  return (
    <>
      <ListDetailPage
        mode="side"
        inspectorWidth={520}
        storageKey="schedules"
        header={header(summary, !!m && m.rows.length === 0)}
        {...(notes.length > 0 || orphans.length > 0 || signInShows
          ? {
              toolbar: (
                <>
                  {signInShows ? <AgentSignIn comp={signInComp} state={signIn} place="own" need={t('n.agentSignedOut')} /> : null}
                  {orphans.map(([k, op]) => (
                    <Band key={k} tone="warn" size="table">
                      <OpNote op={op} onCheck={() => void onCheck(op.row as SchedRow)} onDismiss={() => onDismiss(op.row as SchedRow)} />
                    </Band>
                  ))}
                  {notes.length > 0 ? <SourceBand lines={notes} /> : null}
                </>
              ),
            }
          : {})}
        list={
          <DataTable
            label={t('title')}
            columns={columns}
            view={view}
            search={t('search')}
            onRetry={() => void data.refetch()}
            onRefresh={() => void data.refetch()}
            onRowAction={(r) => view.open(r.key)}
            empty={empty}
            countLabel={(n) => t('count', { count: n })}
            actions={(r) => {
              const toScript = onScriptsFor(r);
              return rowEntries(t, r, isHeld(ops.get(ok(r.key))), { onRun: () => onRun(r), onPause: () => onPause(r, r.paused), onEdit: () => onEdit(r), onDelete: () => onDelete(r), ...(toScript ? { onScripts: toScript } : {}), ...(botsLink ? { onChat: () => onChat(r) } : {}) });
            }}
          />
        }
        detail={
          view.activeId === undefined ? null : current ? (
            <Detail
              key={computerKey}
              row={current}
              now={now}
              zone={zone}
              op={ops.get(ok(current.key))}
              onRun={onRun}
              onPause={onPause}
              onEdit={onEdit}
              onDelete={onDelete}
              onCheck={(r) => void onCheck(r)}
              onDismiss={onDismiss}
              {...(currentToScript ? { onScripts: currentToScript } : {})}
              {...(botsLink ? { onChat } : {})}
            />
          ) : m ? (
            <EmptyState icon="warn" title={t('detail.notFound')} size="sm" />
          ) : null
        }
      />
      {editing && (
        <Editor
          target={editing}
          now={now}
          zone={zone}
          busy={saving.busy}
          key={editKey}
          outcome={editOp?.status === 'unknown' ? { kind: 'pending' } : saving.outcome ? { kind: saving.outcome, ...(saving.code ? { code: saving.code } : {}) } : undefined}
          {...(editOp?.earlier ? {} : { onCheck: () => void onCheckSave(editKey) })}
          checking={!!editOp?.checking}
          stuck={!!editOp?.stuck}
          earlier={!!editOp?.earlier}
          onForget={(asked) => onAllowAgain(editKey, asked)}
          held={savedArgs.get(editKey)}
          onSave={(d, expr, row) => void onSave(d, expr, row)}
          onClose={() => {
            setSaving({ busy: false });
            setEdit(undefined);
          }}
          {...(scriptsLink ? { onScripts: () => followPageLink(scriptsLink, go) } : {})}
          {...(onAskSend && onAskPanel ? { onAskSend, onAskPanel } : {})}
          {...(botsLink ? { onChat } : {})}
          {...(programsLink ? { onPrograms: () => followPageLink(programsLink, go) } : {})}
        />
      )}
      <ConfirmDialog
        isOpen={!!confirmRow}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === 'loop' ? t('c.loopTitle', { name: confirmName }) : t('c.delTitle', { name: confirmName })}
        body={confirm?.kind === 'loop' ? t(confirmRow?.confirm === 'resume' ? 'c.loop.resume' : 'c.loop.once') : t('c.delBody')}
        confirmLabel={confirm?.kind === 'loop' ? t('action.runNow') : t('action.delete')}
        tone={confirm?.kind === 'loop' ? 'default' : 'danger'}
        onConfirm={onConfirm}
      />
    </>
  );
}

