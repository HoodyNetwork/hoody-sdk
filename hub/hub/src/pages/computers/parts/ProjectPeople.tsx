// The People tab's changes: add one
// account by username or account ID, change a member's level, remove a member. Each is confirmed with what it
// grants or takes away, sent once, and its outcome shown (C9). Offered only up to the caller's own level
// (levelsFor: the API's ceiling); a member above the caller keeps no controls. An owner's own row has none either.
// A write whose answer was lost stays held (core's lock project.member, ONE per project): a
// membership row has no version, so no read can prove it went through or not. Check again reads the whole list (every
// page, up to its bound) and says how it reads now; only the person's warned Dismiss ends the hold. While held, no
// people write on that project is offered, whichever account it would name.
import { useCore } from '@core';
import { type ActionSpec, AnatomySection, Band, Button, ConfirmDialog, createColumnHelper, DataTable, EmptyState, RadioGroup, Row, type RowActionEntry, Stack, Tag, TextField, useStrings } from '@kit';
import { type ComponentProps, useState } from 'react';
import { type MemberHeldId, memberVarsOf, type MemberAdd, type MemberRemove, type MemberSet, readRosterAll, type RosterRead, useAddMember, useMemberHolds, useRemoveMember, useSetMember } from '../data';
import strings from '../strings.en.json';
import type { Project } from '../types';
import { addTargetOf, heldNames, heldNow, LEVELS, levelsFor, linesOf, lost, memberRefusal, myLevel, type Level, type Member, type MemberOp, type Mine, peopleOf, type Roster, rosterWhole } from './projectPerms.logic';
import { Line } from './PartBits';
import { type RefusalFacts, useRunner, useShownRealm } from './runner';
import s from './parts.module.css';

type T = ReturnType<typeof useStrings<typeof strings>>;
const col = createColumnHelper<Member>();
/** Why a level change offered nothing to confirm (the fresh read said so). */
type LevelNote = 'unread' | 'moved' | 'already' | 'cannot';
type Ask = { op: 'add'; vars: MemberAdd } | { op: 'set'; vars: MemberSet; from: Level } | { op: 'remove'; vars: MemberRemove };

export function ProjectPeople({ project, roster, mine, onRead }: { project: Project; roster: Roster; mine: Mine; onRead: () => Promise<unknown> }) {
  const t = useStrings(strings);
  const core = useCore();
  const realm = useShownRealm();
  const can = levelsFor(mine);
  const holds = useMemberHolds(project.id, realm);
  const add = useRunner(useAddMember());
  const set = useRunner(useSetMember());
  const remove = useRunner(useRemoveMember());
  const [ask, setAsk] = useState<Ask | null>(null);
  // The page's own words for a refusal of the asked write (pp.add.exists, pp.member.notFound...), shown in its dialog.
  const [refused, setRefused] = useState<string | null>(null);
  // The last people write that went through (its done line).
  const [done, setDone] = useState<Ask | null>(null);
  const [adding, setAdding] = useState(false);
  // A level change reads the list first: the confirm says what changes from the level read now.
  const [preparing, setPreparing] = useState(false);
  const [note, setNote] = useState<LevelNote | null>(null);
  const busy = add.busy || set.busy || remove.busy || preparing;
  const people = peopleOf(roster);
  const owners = roster.members.filter((m) => m.owner);
  // Any held people write of this project holds every one (one lock key per project): nothing new is offered.
  const held = holds.length > 0;

  async function send(a: Ask) {
    setRefused(null);
    setDone(null);
    const runner = a.op === 'add' ? add : a.op === 'set' ? set : remove;
    const res = (await (runner.run as (v: Ask['vars']) => ReturnType<typeof runner.run>)(a.vars)) as Awaited<ReturnType<typeof runner.run>> & RefusalFacts;
    if (res.outcome === 'done') {
      setAsk(null);
      runner.reset();
      setAdding(false);
      setDone(a);
      void onRead();
      return;
    }
    if (res.outcome === 'pending') {
      // Held by core (its band below); the dialog goes, nothing is sent again.
      setAsk(null);
      runner.reset();
      setAdding(false);
      return;
    }
    const mine = memberRefusal(a.op as MemberOp, res.status, res.code);
    if (mine) {
      runner.reset();
      setRefused(mine);
      if (res.status === 404 && a.op !== 'add') void onRead();
    }
  }

  /** A level change's confirm is built from a fresh read of the list (every page, through core), never from the shown
   *  rows: the member's level now and the caller's own ceiling now. When that read can't establish both (it failed,
   *  the row is gone or past it, either level is now outside what the caller may set) nothing is offered to confirm. */
  async function prepareSet(m: Member, to: Level, name: string) {
    setRefused(null);
    setDone(null);
    setNote(null);
    setPreparing(true);
    const read = await readRosterAll(project.id, project.owner);
    setPreparing(false);
    if (read.kind !== 'ok') return setNote('unread');
    // The shown list catches up with what was just read (not after a failed read: it would only fail too).
    void onRead();
    const row = read.roster.members.find((x) => heldNames({ mid: m.id, account: m.accountId || undefined }, x));
    const ceiling = levelsFor(myLevel(project, read.roster, core.account));
    // Gone from the whole read, or the project's owner now: the list did change. A level outside the caller's ceiling as
    // read now does not prove a change, so that note says only that the change can't be confirmed.
    if (!row || row.owner || !row.id) return setNote('moved');
    if (row.level === to) return setNote('already');
    if (!ceiling.includes(row.level) || !ceiling.includes(to)) return setNote('cannot');
    setAsk({ op: 'set', vars: { pid: project.id, mid: row.id, level: to, name, ...(row.accountId ? { account: row.accountId } : {}) }, from: row.level });
  }

  const runnerOf = (a: Ask | null) => (a?.op === 'add' ? add : a?.op === 'set' ? set : remove);
  const shown = runnerOf(ask);

  const ownerIds = new Set(owners.map((m) => m.id || m.accountId));
  const rows: Member[] = [...owners, ...people];
  const blockedReason = held ? t('pp.held.blocks') : busy ? t('pp.busy') : undefined;
  const nameOf = (m: Member) => m.name || t('pp.people.unnamed');
  // A person's row menu: a level change to each other level the caller may set (each read
  // fresh before its confirm, prepareSet), then Remove, danger last. The owner's row and a person above the caller have
  // none.
  const actions = (m: Member): RowActionEntry[] => {
    if (ownerIds.has(m.id || m.accountId) || !can.includes(m.level) || !m.id) return [];
    const name = nameOf(m);
    const off = blockedReason ? { isDisabled: true, disabledReason: blockedReason } : {};
    return [
      ...can.filter((l) => l !== m.level).map((l): RowActionEntry => ({ id: `level-${l}`, label: t('pp.lvl.change.to', { person: name, level: t(`pp.lvl.${l}`) }), opens: true, ...off, onAction: () => void prepareSet(m, l, name) })),
      '-',
      {
        id: 'remove',
        label: t('pp.remove.label', { person: name }),
        tone: 'danger',
        opens: true,
        ...off,
        onAction: () => {
          setRefused(null);
          setAsk({ op: 'remove', vars: { pid: project.id, mid: m.id, name, ...(m.accountId ? { account: m.accountId } : {}) } });
        },
      },
    ];
  };
  const columns = [
    col.display({ id: 'name', header: t('pp.people.col.person'), meta: { pinned: true, list: 'primary', label: t('pp.people.col.person') }, cell: (x) => nameOf(x.row.original) }),
    col.display({
      id: 'level',
      header: t('pp.people.col.level'),
      meta: { list: 'status', label: t('pp.people.col.level') },
      cell: (x) => {
        const m = x.row.original;
        if (ownerIds.has(m.id || m.accountId)) return <Tag tip={t('pp.owner.rowHelp')}>{t('pp.owner.row')}</Tag>;
        // Someone above the caller: their level, and why there is nothing to change.
        if (can.length > 0 && (!can.includes(m.level) || !m.id)) return <Tag tip={t('pp.people.aboveYou')}>{t(`pp.lvl.${m.level}`)}</Tag>;
        return <Tag>{t(`pp.lvl.${m.level}`)}</Tag>;
      },
    }),
  ];
  // Off while a people write is held or out, and while the form is already open below.
  const addOff = blockedReason ?? (adding ? t('pp.add.open') : undefined);
  const addAction: ActionSpec | undefined = can.length > 0 ? {
    id: 'add',
    label: t('pp.add'),
    icon: 'plus',
    onPress: () => { setDone(null); setAdding(true); },
    ...(addOff ? { disabledReason: addOff } : {}),
  } : undefined;
  const whole = rosterWhole(roster);
  // The section's notices, two bands at most. What holds about the list (a held write blocking changes, what the read
  // left out) is one band, each fact its own sentence; the answer to the last people action (done, or why a level change
  // asked nothing) is the other, and only that one can be closed. An empty list is the table's own empty state.
  const about = [
    ...(held && can.length > 0 ? [{ key: 'held', text: t('pp.held.blocks') }] : []),
    ...(roster.unknown > 0 ? [{ key: 'unknown', text: t('pp.people.unknownLevel', { count: roster.unknown }) }] : []),
    ...(roster.total === null ? [{ key: 'total', text: t('pp.people.noTotal') }] : []),
    ...(roster.total !== null && roster.total > roster.members.length + roster.unknown
      ? [{ key: 'more', text: t('pp.people.more', { shown: roster.members.length + roster.unknown, total: roster.total }) }]
      : []),
  ];
  const answers = [
    ...(done ? [{
      key: 'done',
      text: done.op === 'add' ? t('pp.add.done', { person: done.vars.name, level: t(`pp.lvl.${done.vars.level}`) })
        : done.op === 'set' ? t('pp.lvl.done', { person: done.vars.name, level: t(`pp.lvl.${done.vars.level}`) })
        : t('pp.remove.done', { person: done.vars.name }),
    }] : []),
    // Why a level change offered nothing to confirm: the fresh read said so.
    ...(note ? [{ key: 'note', text: note === 'unread' ? t('pp.lvl.change.unread') : note === 'moved' ? t('pp.lvl.change.moved') : note === 'already' ? t('pp.lvl.change.already') : t('pp.lvl.change.cannot') }] : []),
  ];
  const sentences = (list: readonly { key: string; text: string }[]) => list.map((n, i) => <span key={n.key}>{i > 0 ? ' ' : null}{n.text}</span>);
  // Undefined when no band shows: an empty fragment is truthy and the section would draw an empty notices box.
  const notices = about.length > 0 || answers.length > 0 ? (
    <>
      {about.length > 0 ? <Band size="table">{sentences(about)}</Band> : null}
      {answers.length > 0 ? <Band size="table" onDismiss={() => { setDone(null); setNote(null); }}>{sentences(answers)}</Band> : null}
    </>
  ) : undefined;

  return (
    <Stack gap={3}>
      {holds.map((h, i) => (
        // A held write's own band and Dismiss, above the section: one per project, a second only while two tabs' records merge.
        <MemberHeld key={i} held={h} owner={project.owner} onRead={onRead} />
      ))}
      <AnatomySection
        id="pp-people"
        title={t('pp.tab.people')}
        description={t('pp.people.lede')}
        // Who the caller is on this project: the owner, or a member at their level.
        {...(mine === 'owner' ? { note: t('pp.people.owner') } : mine !== 'unknown' ? { note: t('pp.people.youAre', { level: t(`pp.lvl.${mine}`) }) } : {})}
        actions={addAction ? { primary: addAction } : undefined}
        notices={notices}
        state={{ kind: 'ready' }}
        flush
      >
        <DataTable
          label={t('pp.tab.people')}
          data={rows}
          columns={columns}
          getRowId={(m) => m.id || m.accountId}
          fill={false}
          bare
          noViewMenu
          sortParam={false}
          onRowAction={false}
          // Nobody else only when the list was read whole; otherwise the band above says what is not known.
          empty={<EmptyState size="sm" title={whole ? t('pp.people.none') : t('pp.people.noneShown')} />}
          actions={actions}
        />
      </AnatomySection>
      {can.length > 0 && adding ? (
        <AddForm
          project={project}
          levels={can}
          me={{ id: core.account, username: core.identity?.username ?? null }}
          held={held}
          busy={busy}
          onCancel={() => setAdding(false)}
          onContinue={(vars) => {
            setRefused(null);
            setAsk({ op: 'add', vars });
          }}
        />
      ) : null}
      <AskConfirm
        ask={ask}
        project={project}
        busy={busy}
        refused={refused}
        outcome={refused ? undefined : shown.outcome}
        onCancel={() => {
          setAsk(null);
          setRefused(null);
          shown.reset();
        }}
        onConfirm={() => { if (ask) void send(ask); }}
      />
    </Stack>
  );
}

/** The one confirm of a people write: what it grants or takes away, a refusal in the page's own words in place of the
 *  kit's line (anything else is the kit's, C9). */
function AskConfirm({ ask, project, busy, refused, outcome, onCancel, onConfirm }: {
  ask: Ask | null;
  project: Project;
  busy: boolean;
  refused: string | null;
  outcome: ComponentProps<typeof ConfirmDialog>['outcome'];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useStrings(strings);
  return (
    <ConfirmDialog overlayId="computers-project-people-confirm-dialog"
      isOpen={ask !== null}
      onOpenChange={(o) => { if (!o && !busy) onCancel(); }}
      title={ask ? titleOf(ask, project, t) : ''}
      tone={ask?.op === 'remove' ? 'danger' : 'default'}
      confirmLabel={ask?.op === 'add' ? t('pp.add.confirm.go') : ask?.op === 'set' ? t('pp.lvl.change.go') : t('pp.remove.go')}
      busy={busy}
      outcome={outcome}
      confirmDisabled={refused !== null}
      onConfirm={onConfirm}
      body={ask ? <AskBody ask={ask} project={project} refused={refused} t={t} /> : null}
    />
  );
}

function titleOf(a: Ask, project: Project, t: T): string {
  if (a.op === 'add') return t('pp.add.confirm.title', { person: a.vars.name, name: project.name, level: t(`pp.lvl.${a.vars.level}`) });
  if (a.op === 'set') return t('pp.lvl.change.title', { person: a.vars.name, level: t(`pp.lvl.${a.vars.level}`) });
  return t('pp.remove.title', { person: a.vars.name, name: project.name });
}

/** What the asked write grants or takes away, from the one level table (linesOf / lost). */
function AskBody({ ask, project, refused, t }: { ask: Ask; project: Project; refused: string | null; t: T }) {
  const lines = ask.op === 'add' ? linesOf(ask.vars.level) : ask.op === 'set' ? (rank(ask.vars.level) > rank(ask.from) ? linesOf(ask.vars.level) : lost(ask.from, ask.vars.level)) : [];
  const down = ask.op === 'set' && rank(ask.vars.level) < rank(ask.from);
  return (
    <Stack gap={3}>
      {ask.op === 'add' ? <Line>{t('pp.add.confirm.body', { person: ask.vars.name, name: project.name, level: t(`pp.lvl.${ask.vars.level}`) })}</Line> : null}
      {ask.op === 'set' ? <Line>{t(down ? 'pp.lvl.change.down' : 'pp.lvl.change.up', { person: ask.vars.name })}</Line> : null}
      {ask.op === 'remove' ? <Line>{t('pp.remove.body', { name: project.name })}</Line> : null}
      {lines.length > 0 ? (
        <Stack gap={1}>
          {lines.map((k) => (
            <span key={k}>{t(k as never)}</span>
          ))}
        </Stack>
      ) : null}
      {down ? <span>{t('pp.lvl.change.downAfter')}</span> : null}
      {refused ? <span role="alert" /* the API refused this write: its one line in the page's words */>{t(refused as never)}</span> : null}
    </Stack>
  );
}

const rank = (l: Level): number => LEVELS.indexOf(l);

/** Add a person: a username or an account ID, and a level (See first: least privilege). Checked before anything is
 *  sent (format, the caller's own account, the owner's ID, a held people write on this project). */
function AddForm({ project, levels, me, held, busy, onCancel, onContinue }: {
  project: Project;
  levels: readonly Level[];
  me: { id: string | null | undefined; username: string | null };
  held: boolean;
  busy: boolean;
  onCancel: () => void;
  onContinue: (v: MemberAdd) => void;
}) {
  const t = useStrings(strings);
  const [typed, setTyped] = useState('');
  const [level, setLevel] = useState<Level>(levels[0] ?? 'read');
  const [tried, setTried] = useState(false);
  const got = addTargetOf(typed, me, project.owner);
  const problem = 'problem' in got ? got.problem : held ? 'pp.held.blocks' : null;
  return (
    <form
      aria-label={t('pp.add')}
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (problem || !('target' in got)) return;
        const name = 'user_id' in got.target ? t('pp.add.idName', { end: got.target.user_id.slice(-4) }) : got.target.username;
        onContinue({ pid: project.id, target: got.target, level, name });
      }}
    >
      <Stack gap={3}>
      <TextField
        label={t('pp.add.who')}
        description={t('pp.add.whoHelp')}
        value={typed}
        onChange={setTyped}
        autoComplete="off"
        maxLength={100}
        errorMessage={tried && problem ? t(problem as never) : undefined}
        isInvalid={tried && !!problem}
      />
      <RadioGroup<Level>
        label={t('pp.add.level')}
        value={level}
        onChange={setLevel}
        options={levels.map((l) => ({ value: l, label: t(`pp.lvl.${l}`), description: linesOf(l).map((k) => t(k as never)).join('. ') }))}
      />
      <Row gap={2} wrap>
        <Button type="submit" size="sm" isDisabled={busy || held}>{t('pp.add.continue')}</Button>
        <Button size="sm" variant="ghost" onPress={onCancel}>{t('pp.add.cancel')}</Button>
      </Row>
      </Stack>
    </form>
  );
}

/** The held people write of a project: what may have happened, Check again (reads the whole list, says how it
 *  reads now, frees nothing) and a warned Dismiss (frees only this send). Another page's hold is that page's. */
function MemberHeld({ held, owner, onRead }: { held: MemberHeldId; owner?: string; onRead: () => Promise<unknown> }) {
  const t = useStrings(strings);
  // Stable per band (core's runner re-reads its holds when `pick` changes).
  const [pick] = useState(() => (i: Record<string, unknown>) => i.project === held.project);
  const add = useRunner(useAddMember(), { lock: 'project.member', change: 'memberAdd', pick, vars: (i) => memberVarsOf(i) as MemberAdd });
  const set = useRunner(useSetMember(), { lock: 'project.member', change: 'memberSet', pick, vars: (i) => memberVarsOf(i) as MemberSet });
  const remove = useRunner(useRemoveMember(), { lock: 'project.member', change: 'memberRemove', pick, vars: (i) => memberVarsOf(i) as MemberRemove });
  const r = held.op === 'add' ? add : held.op === 'set' ? set : remove;
  const [read, setRead] = useState<RosterRead | null>(null);
  const [checking, setChecking] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const now = read?.kind === 'ok' ? heldNow(read.roster, held) : null;
  async function check() {
    setChecking(true);
    const x = await readRosterAll(held.project, owner);
    setChecking(false);
    setRead(x);
    // The shown list reads again too (its first page); the hold stays whatever either read says.
    void onRead();
  }
  return (
    <>
      <Band
        tone="warn"
        size="table"
        /* noDetails: an unknown outcome has no rejection to show; Check again reads the list, never resends */
        actions={r.elsewhere ? undefined : (
          <>
            <Button size="sm" isDisabled={checking} onPress={() => void check()}>{t('pp.held.check')}</Button>
            <Button size="sm" variant="ghost" onPress={() => setDismissing(true)}>{t('pp.held.dismiss')}</Button>
          </>
        )}
      >
        <span className={s.stack}>
          <strong>{held.name}</strong>
          <span>{t(held.op === 'add' ? 'pp.add.held' : held.op === 'set' ? 'pp.lvl.held' : 'pp.remove.held')}</span>
          {now === 'cut' ? <span>{t('pp.held.cut')}</span> : null}
          {now && now !== 'cut' ? (
            <span>{t('pp.held.now', { state: now === 'absent' ? t('pp.held.state.absent') : now === 'owner' ? t('pp.held.state.owner') : t('pp.held.state.level', { level: t(`pp.lvl.${now}`) }) })}</span>
          ) : null}
          {read?.kind === 'failed' ? <span>{t('pp.people.error')}</span> : null}
        </span>
      </Band>
      <ConfirmDialog overlayId="computers-project-people-held-dismiss"
        isOpen={dismissing && !r.elsewhere}
        onOpenChange={setDismissing}
        title={t('pp.held.dismissTitle')}
        body={t('pp.held.dismissBody')}
        confirmLabel={t('pp.held.dismissGo')}
        onConfirm={() => { setDismissing(false); void r.dismiss(); }}
      />
    </>
  );
}

