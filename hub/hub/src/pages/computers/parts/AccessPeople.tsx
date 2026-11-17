// "Only people or keys I pick", in the Permissions tab's access part (Access.tsx): the Hub's own entries (a person who signs in
// with a name and password, or a key link), adding and removing one, and finishing a change that stopped partway.
//
// Each change is a list of steps (access.picked.ts), sent one at a time with If-Match on the version the previous
// answer (or a fresh read after it: the API's step answers may carry no version) gave, under the lock every access
// change of the computer shares ('computer.access'). A lost answer stops the run and core holds that step: the
// section's band offers Check again, which runs that step's own read-back and frees it only on a proof
// (stepVerdict); a held step is never sent again unproved. A done answer no read has shown yet (unread) blocks
// every send until a read newer than that step's version arrives. Once free, Finish adding sends only what a fresh
// read shows missing.
//
// A password or key is made here, kept only in this component's state, sent only with its own group step and shown
// once (SecretField). It is never in a step, a held change, the query cache, a log or an Agent snapshot; leaving
// the tab drops it.
//
// The add form and the shown-once secret live in one small drawer: nothing behind it can be pressed, it cannot be
// closed (or left by Back) while steps are still to send, and a close that would drop a started form or a secret not
// yet taken asks first.
import { type ActionSpec, AnatomySection, Band, Button, Checkbox, CheckboxGroup, InlineActions, ConfirmDialog, CopyField, createColumnHelper, DataTable, Drawer, type RowActionEntry, SecretField, Tag, TextField, useDrawer, useStrings } from '@kit';
import { useMounted } from './AccessPeople.pure';
export { useStepHold, useMounted } from './AccessPeople.pure';
import { type ReactNode, useEffect, useState } from 'react';
import { refreshAccess, useAccessSteps } from '../data';
import { maskUrl, PROGRAMS, type ProgramLink, SLUG } from '../logic';
import type { Computer } from '../types';
import { programUrl } from '../urls';
import { type AccessMode, type AccessRules, shownRange } from './access.logic';
import { addrGoing, addSteps, type Entry, type EntryKind, entryGroup, finishSteps, KEY_PREFIX, keyLink, makeSecret, personName, remainingSteps, removeSteps, type RunEnd, runSteps, type Step, stepKey } from './access.picked';
import strings from './AccessDrawer.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;

const col = createColumnHelper<Entry>();

const PASSWORD_LENGTH = 20;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

interface Draft {
  kind: EntryKind;
  name: string;
  picked: ProgramLink[];
  /** Every program, ones added later too ('*'): allowed or not, never ports or numbers. Logs stay their own tick. */
  all: boolean;
  logs: boolean;
}

/** A made secret and what it is for, held only here until the person presses Done (or the drawer closes). */
interface Made {
  kind: EntryKind;
  group: string;
  secret: string;
  salt: string;
  links: ProgramLink[];
}

/** `read` re-reads the computer's rules now (null when that read fails): a run goes on after a done answer only on
 *  a document newer than the step's version that shows it. */
/** `readOnly`: why nothing may be changed here (an expired computer): the entries show, every action is off with it. */
/** `onSecret`: told while the shown-once secret's drawer is open; `heldBand`: the held step's band (Check again, Stop
 *  tracking), drawn inside that drawer while it is open so it stays in reach with the secret still on screen. */
export function AccessPeople({ c, rules, mode, held, read, onBusy, onSecret, heldBand, readOnly }: { c: Computer; rules: AccessRules; mode: AccessMode; held: boolean; read: () => Promise<AccessRules | null>; onBusy: (waiting: boolean, sending: boolean) => void; onSecret?: (open: boolean) => void; heldBand?: ReactNode; readOnly?: string }) {
  const t = useStrings(strings);
  const m = useAccessSteps();
  const entries: Entry[] = mode.kind === 'people' ? mode.entries : [];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [asking, setAsking] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<Entry | null>(null);
  const [finishing, setFinishing] = useState(false);
  // The version of the rules the open question (add, remove or finish) was asked over.
  const [askedAt, setAskedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [end, setEnd] = useState<RunEnd | null>(null);
  // The steps of the last add, kept so Finish adding can send what a fresh read shows missing (names only).
  const [plan, setPlan] = useState<Step[] | null>(null);
  const [made, setMade] = useState<Made | null>(null);
  // A run never goes on sending after the tab is left (the component unmounts): its next step is not sent.
  const alive = useMounted();
  // An unfinished form, a confirm, a send or a secret not yet taken: the access part's other controls wait.
  useEffect(() => onBusy(busy || made !== null || draft !== null || asking !== null, busy), [busy, made, draft, asking, onBusy]);
  const secretOpen = made !== null;
  useEffect(() => onSecret?.(secretOpen), [secretOpen, onSecret]);

  async function go(steps: Step[], secret?: Made) {
    setBusy(true);
    setEnd(null);
    const r = await runSteps(steps, rules, async (step, from) => {
      if (!alive.current) return { outcome: 'not_sent', code: 'CLOSED' };
      const withSecret = step.op === 'group' && secret && secret.group === step.group ? { secret: secret.secret, salt: secret.salt } : {};
      const a = await m[stepKey(step)].mutateAsync({ id: c.id, from, step, ...withSecret });
      return { outcome: a.outcome, data: a.data ?? null, ...(a.code ? { code: a.code } : {}), ...(a.status ? { status: a.status } : {}), ...(a.retryAfter ? { retryAfter: a.retryAfter } : {}), ...(a.traceId ? { traceId: a.traceId } : {}), ...(a.route ? { route: a.route } : {}) };
    }, read);
    if (!alive.current) return;
    setBusy(false);
    setEnd(r);
    // A secret whose group step was refused, or met changed rules, is not stored: it goes. A group step is sent only
    // while a read newer than any earlier send of it shows the group missing (a held or unread one blocks every
    // send), so no earlier send of this secret can have stored it. Any other end may have (done, held, unread): it
    // stays until Done.
    // The add itself is abandoned too: a group of that name read later may be someone else's, and its programs must
    // never be sent for it.
    if (r.kind !== 'done' && r.step.op === 'group' && (r.kind === 'stale' || r.kind === 'refused')) {
      if (secret) setMade(null);
      setPlan(null);
    }
    if (r.kind === 'done') setPlan(null);
    void refreshAccess();
  }

  function add(d: Draft) {
    setAsking(null);
    if (shut || askedAt !== rules.version) return;
    const group = entryGroup(d.kind, d.name);
    if (!group) return;
    // The name may have been taken since Continue (another tab or person, read in while the confirm was open): back
    // to the form, which says so. Its group step would otherwise read as done and its programs go to that entry.
    if (rules.groups.some((g) => g.name === group)) {
      setDraft(d);
      return;
    }
    const secret: Made = {
      kind: d.kind,
      group,
      secret: makeSecret(d.kind === 'person' ? PASSWORD_LENGTH : KEY_LENGTH),
      salt: makeSecret(SALT_LENGTH),
      links: d.all ? [...PROGRAMS] : d.picked,
    };
    const steps = addSteps(group, d.kind, [...(d.all ? ['*'] : d.picked.map((p) => SLUG[p])), ...(d.logs ? ['logs'] : [])], rules);
    setDraft(null);
    setPlan(steps);
    setMade(secret);
    void go(steps, secret);
  }

  // A done answer no read has shown, or a lost one (held, or dismissed unproved): nothing is sent until the rules
  // read newer than the version it was sent against. A dismissed hold proves nothing: the write may still land.
  const unread = (end?.kind === 'unread' || end?.kind === 'held') && rules.version <= end.from;
  const locked = held || busy || unread;
  const left = plan && !locked ? remainingSteps(plan, rules) : [];
  // A missing group step goes again only with its secret still here (and only once no hold covers it).
  const canResume = left.length > 0 && (left[0]?.op !== 'group' || made?.group === left[0].group);
  const finish = mode.kind === 'people' && mode.unfinished ? finishSteps(rules) : [];
  const empty = entries.filter((e) => e.programs.length === 0);
  // A confirm belongs to what it was opened over. Once nothing may be sent here (a change is held or unread, the
  // computer turned read-only), the rules read as a newer version than the one it was asked over (an entry of the
  // same name may be another one by now), the entry to remove is no longer listed, or nothing is left to finish,
  // the question closes unanswered. A run of this part's own keeps its confirm open until it ends (busy).
  const shut = held || unread || readOnly !== undefined;
  const askedOld = askedAt !== null && rules.version !== askedAt;
  const removingGone = removing !== null && !entries.some((e) => e.group === removing.group && e.kind === removing.kind);
  const finishGone = finishing && finish.length === 0;
  useEffect(() => {
    if (busy) return;
    if (shut || askedOld || removingGone) setRemoving(null);
    if (shut || askedOld || finishGone) setFinishing(false);
    if (shut || askedOld) setAsking(null);
  }, [busy, shut, askedOld, removingGone, finishGone]);
  const keepsOut = rules.allowByDefault === false && rules.groups.length > 0;
  // The addresses an add removes (Only my IP, Only these IPs): its confirm names them.
  const going = addrGoing(rules);

  // The entries are one table in a "People and key links" section. Add a person and Add a
  // key link are its head actions (off while a change is out or held, a secret waits for Done, or the form is open);
  // Remove is in each row's menu, with the same confirm. The run's bands are the section's notices.
  const off = readOnly ?? (locked ? t('acc.change.busy') : made ? t('acc.p.addOff.secret') : draft ? t('acc.p.addOff.form') : undefined);
  const addOf = (kind: EntryKind): ActionSpec => ({
    id: kind === 'person' ? 'add-person' : 'add-key',
    label: t(kind === 'person' ? 'acc.p.addPerson' : 'acc.p.addKey'),
    icon: 'plus',
    onPress: () => setDraft({ kind, name: '', picked: [], all: false, logs: false }),
    ...(off ? { disabledReason: off } : {}),
  });
  const rowActions = (e: Entry): RowActionEntry[] => [{
    id: 'remove',
    label: t('acc.p.removeLabel', { name: maskUrl(e.name) }),
    tone: 'danger',
    opens: true,
    ...(readOnly !== undefined || locked || made ? { isDisabled: true, disabledReason: readOnly ?? (locked ? t('acc.change.busy') : t('acc.p.addOff.secret')) } : {}),
    onAction: () => { setAskedAt(rules.version); setRemoving(e); },
  }];
  const columns = [
    // The name and what it can open wrap rather than cut (a 32-letter name has no place to break; a key link can open
    // every program), in the column table (the kit's wraps) and in list rows (its listWraps) alike.
    col.display({ id: 'name', header: t('acc.p.col.name'), meta: { pinned: true, list: 'primary', label: t('acc.p.col.name'), wraps: true, listWraps: true }, cell: (x) => maskUrl(x.row.original.name) }),
    col.display({
      id: 'kind',
      header: t('acc.p.col.kind'),
      meta: { list: 'status', label: t('acc.p.col.kind') },
      // The rule's own words: a person signs in with a password; a key link carries its key, shown once.
      cell: (x) => (x.row.original.kind === 'person'
        ? <Tag tip={t('acc.p.person')}>{t('acc.p.kind.person')}</Tag>
        : <Tag tip={t('acc.p.keyOnce')}>{t('acc.p.key')}</Tag>),
    }),
    col.display({
      id: 'opens',
      header: t('acc.p.col.opens'),
      meta: { label: t('acc.p.col.opens'), wraps: true, listWraps: true },
      cell: (x) => (x.row.original.programs.length ? programsText(x.row.original.programs, t) : t('acc.p.opensNone')),
    }),
  ];
  // Only the bands that show: an empty fragment is truthy and would draw an empty notices box.
  const noticeList = [
    end && end.kind === 'held' && !held && unread ? (
      <Band key="heldWait" tone="warn" size="table" /* noDetails: a dismissed unknown outcome */ actions={<Button size="sm" onPress={() => void refreshAccess()}>{t('acc.held.check')}</Button>}>
        {t('acc.p.heldWait')}
      </Band>
    ) : null,
    end && end.kind !== 'done' && end.kind !== 'held' ? (
      end.kind === 'unread'
        ? (
          <Band key="end" tone="warn" size="table" /* noDetails: the step answered done; no read has shown it yet */ actions={unread ? <Button size="sm" onPress={() => void refreshAccess()}>{t('acc.held.check')}</Button> : undefined}>
            {t(unread ? 'acc.p.unreadWait' : 'acc.p.unread')}
          </Band>
        )
        : <Band key="end" tone="warn" size="table" error={{ ...end.answer, data: undefined }}>{t(`acc.p.${end.kind}`)}</Band>
    ) : null,
    // A cut change of this opening speaks through its own band (held, or Finish adding): this one is for one found on opening.
    mode.kind === 'people' && mode.unfinished && !locked && !plan ? (
      <Band
        key="unfinished"
        tone="warn"
        size="table"
        /* noDetails: what a fresh read of the rules shows, not a rejection */
        actions={finish.length && !locked && !made && readOnly === undefined ? <Button size="sm" onPress={() => { setAskedAt(rules.version); setFinishing(true); }}>{t('acc.p.finish')}</Button> : undefined}
      >
        {empty.length ? t('acc.p.unfinishedNothing', { names: empty.map((e) => maskUrl(e.name)).join(', ') }) : mode.myIp ? t(mode.listLeft ? 'acc.p.unfinishedIps' : 'acc.p.unfinishedMyIp') : t('acc.p.unfinishedOpen')}
      </Band>
    ) : null,
    canResume && readOnly === undefined ? (
      <Band key="resume" tone="warn" size="table" /* noDetails: steps a fresh read shows missing, not a rejection */ actions={<Button size="sm" onPress={() => void go(left, made ?? undefined)}>{t('acc.p.resume')}</Button>}>
        {t('acc.p.resumeHelp')}
      </Band>
    ) : null,
  ].filter(Boolean);
  const none = entries.length === 0 ? <Band key="none" size="table">{t('acc.p.none')}</Band> : null;

  return (
    <>
      <AnatomySection
        id="acc-people"
        title={t('acc.p.title')}
        actions={{ primary: addOf('person'), secondary: [addOf('key')] }}
        // While the new secret is shown, the run's bands (and Finish adding) are in its drawer: the section is behind it.
        notices={!made && (noticeList.length > 0 || none) ? <>{noticeList}{none}</> : undefined}
        state={{ kind: 'ready' }}
        flush
      >
        {entries.length > 0 ? (
          <DataTable
            label={t('acc.p.title')}
            data={entries}
            columns={columns}
            getRowId={(e) => e.group}
            fill={false}
            bare
            noViewMenu
            sortParam={false}
            onRowAction={false}
            actions={rowActions}
          />
        ) : null}
      </AnatomySection>
      {/* One drawer for the add: the form, then the secret shown once. The kit's drawer keeps what is behind it out of
          reach, waits while steps are still to send (Esc, the close button, Back) and asks before a close would drop
          a started form or a secret not yet taken. */}
      <Drawer
        overlayId="computers-access-people-add"
        resizeKey="computers-access-people-add"
        size="sm"
        isOpen={draft !== null || made !== null}
        onOpenChange={(o) => { if (!o) { setDraft(null); setMade(null); } }}
        title={made ? (made.kind === 'person' ? t('acc.p.madePerson', { name: personName(made.group) }) : t('acc.p.madeKey')) : t(draft?.kind === 'key' ? 'acc.p.formKey' : 'acc.p.formPerson')}
        {...(made ? { subtitle: t('perm.secretOnce'), discardText: t('acc.p.secretClose'), discardLabel: t('acc.p.secretCloseGo') } : {})}
        dirty={made !== null || (draft !== null && (draft.name !== '' || draft.picked.length > 0 || draft.all || draft.logs))}
        busy={busy}
      >
        {made ? (
          <>
            {heldBand}
            {noticeList}
            <MadeSecret c={c} made={made} maybe={end?.kind === 'held' || end?.kind === 'unread'} busy={busy} onDone={() => setMade(null)} t={t} />
          </>
        ) : draft ? (
          <DraftForm draft={draft} linkable={(p) => !!programUrl(c, p)} taken={(g) => rules.groups.some((x) => x.name === g)} onChange={setDraft} onCancel={() => setDraft(null)} onContinue={() => { if (!shut) { setAskedAt(rules.version); setAsking(draft); } }} off={shut ? (readOnly ?? t('acc.change.busy')) : undefined} t={t} />
        ) : null}
      </Drawer>
      <ConfirmDialog overlayId="computers-access-people-confirm-dialog"
        isOpen={asking !== null && !shut}
        onOpenChange={(o) => !o && setAsking(null)}
        title={asking?.kind === 'key'
          ? t('acc.p.confirmKeyTitle', { key: (entryGroup('key', asking.name) ?? '').slice(KEY_PREFIX.length), computer: c.name })
          : t('acc.p.confirmPersonTitle', { name: asking ? personName(entryGroup('person', asking.name) ?? '') : '', computer: c.name })}
        body={asking ? (
          <>
            <p>{asking.kind === 'key' ? t('acc.p.confirmKey') : t('acc.p.confirmPerson', { name: personName(entryGroup('person', asking.name) ?? '') })}</p>
            {keepsOut ? null : <p>{t('acc.p.confirmKeepOut')}</p>}
          </>
        ) : ''}
        // The addresses the add removes, as the confirm's own row.
        consequences={going.length ? [t('acc.p.confirmAddrGo', { ips: going.map(shownRange).join(', ') })] : undefined}
        confirmLabel={t('acc.p.confirmGo')}
        onConfirm={() => { if (asking) add(asking); }}
      />
      <ConfirmDialog overlayId="computers-access-people-remove"
        isOpen={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        tone="danger"
        title={t('acc.p.removeTitle', { name: removing ? maskUrl(removing.name) : '', computer: c.name })}
        body={removing ? (
          <>
            {/* While everyone else is still let in (a cut add), removing an entry keeps nobody out: say so, never "stops working". */}
            {mode.kind === 'people' && mode.myIp
              ? <p>{t(mode.listLeft ? 'acc.p.removeIps' : 'acc.p.removeMyIp')}</p>
              : rules.allowByDefault === false
              ? <p>{removing.kind === 'person' ? t('acc.p.removePerson', { name: maskUrl(removing.name) }) : t('acc.p.removeKey')}</p>
              : <p>{t(removing.kind === 'person' ? 'acc.p.removePersonOpen' : 'acc.p.removeKeyOpen', { name: maskUrl(removing.name) })}</p>}
            {entries.length === 1 && rules.allowByDefault === false && !(mode.kind === 'people' && mode.myIp) ? <p>{t('acc.p.removeLast')}</p> : null}
          </>
        ) : ''}
        confirmLabel={t('acc.p.removeGo')}
        // Open and busy until the run ends: nothing behind it can be pressed while steps are still to send.
        busy={busy}
        onConfirm={() => { const e = removing; if (e && !shut && askedAt === rules.version) { setPlan(null); void go(removeSteps(e.group)).finally(() => setRemoving(null)); } }}
      />
      <ConfirmDialog overlayId="computers-access-people-finish"
        isOpen={finishing}
        onOpenChange={(o) => !o && setFinishing(false)}
        title={t('acc.p.finishTitle', { computer: c.name })}
        body={t('acc.p.finishBody')}
        confirmLabel={t('acc.p.finishGo')}
        busy={busy}
        onConfirm={() => { if (shut || askedAt !== rules.version) return; setPlan(null); void go(finishSteps(rules)).finally(() => setFinishing(false)); }}
      />
    </>
  );
}

// The CheckboxGroup values of All programs and Logs (the programs are their own names; neither of these is one).
const ALL = '*';
const LOGS = 'logs';

const LINK_OF: Record<string, ProgramLink> = Object.fromEntries(PROGRAMS.map((p) => [SLUG[p], p]));

function programsText(programs: readonly string[], t: T): string {
  return programs
    .map((p) => (p === 'logs' ? t('acc.p.prog.logs') : p === '*' ? t('acc.adv.everyProgram') : LINK_OF[p] ? t(`acc.p.prog.${LINK_OF[p]}`) : maskUrl(p)))
    .join(', ');
}

/** `off`: why nothing may be added now (a change is out or held, the computer is read-only): Continue says it and asks nothing. */
function DraftForm({ draft, linkable, taken, onChange, onCancel, onContinue, off, t }: { draft: Draft; linkable: (p: ProgramLink) => boolean; taken: (group: string) => boolean; onChange: (d: Draft) => void; onCancel: () => void; onContinue: () => void; off?: string | undefined; t: T }) {
  // Cancel closes as the drawer's own close does: a started form asks first.
  const drawer = useDrawer();
  const group = entryGroup(draft.kind, draft.name);
  const nameError = draft.name.trim() === '' ? undefined : !group ? t('acc.p.nameBad') : taken(group) ? t('acc.p.nameTaken') : undefined;
  // A key link opens a program's address: a key needs at least one program (logs alone would leave no link to give).
  const none = draft.picked.length === 0 && !draft.all && (draft.kind === 'key' || !draft.logs);
  // A key is only worth making with a link to give: at least one of its programs has an address now.
  const noAddress = draft.kind === 'key' && !none && !(draft.all ? PROGRAMS : draft.picked).some(linkable);
  const ready = !!group && !nameError && !none && !noAddress;
  // Why Continue is off, said on the button itself.
  const offReason = none ? t(draft.kind === 'key' ? 'acc.p.pickOneKey' : 'acc.p.pickOne') : noAddress ? t('acc.p.noAddress') : t('acc.p.continueOff');
  // The group's ticks: All programs, each program (all of them while All programs is ticked) and Logs.
  const ticked = [...(draft.all ? [ALL, ...PROGRAMS] : draft.picked), ...(draft.logs ? [LOGS] : [])];
  // The picked programs stay as they were while All programs is ticked, or as it is unticked (the singles shown ticked
  // under it were never picked), so unticking it brings back the person's own picks. A new pick goes last: the order
  // ticked is the order sent.
  const pick = (next: string[]) => {
    const all = next.includes(ALL);
    const picked = all || draft.all ? draft.picked : [...draft.picked.filter((p) => next.includes(p)), ...PROGRAMS.filter((p) => next.includes(p) && !draft.picked.includes(p))];
    onChange({ ...draft, all, logs: next.includes(LOGS), picked });
  };
  return (
    <>
      <TextField
        label={t('acc.p.name')}
        description={t(draft.kind === 'person' ? 'acc.p.nameHelpPerson' : 'acc.p.nameHelpKey')}
        value={draft.name}
        onChange={(v: string) => onChange({ ...draft, name: v })}
        errorMessage={nameError}
        reserveError
      />
      <CheckboxGroup label={t('acc.p.programs')} value={ticked} onChange={pick}>
        <Checkbox value={ALL} label={t('acc.p.all')} description={t('acc.p.allHelp')} />
        {/* With All programs ticked the single programs are covered (and not sent): shown ticked and locked. */}
        {PROGRAMS.map((p) => (
          <Checkbox key={p} value={p} label={t(`acc.p.prog.${p}`)} isDisabled={draft.all} />
        ))}
        <Checkbox value={LOGS} label={t('acc.p.logs')} />
      </CheckboxGroup>
      <InlineActions
        label={t('acc.p.formActions')}
        actions={[{ id: 'draft-cancel', label: t('acc.p.cancel'), dismiss: true, onPress: () => (drawer ? drawer.requestClose() : onCancel()) }]}
        primary={{ id: 'draft-continue', label: t('acc.p.continue'), opens: 'dialog' as const, onPress: onContinue, ...(off !== undefined ? { disabledReason: off } : ready ? {} : { disabledReason: offReason }) }}
      />
    </>
  );
}

/** A new sign-in or key link, shown once: each value in a SecretField, wiped by Done (and by the field's own wipe). */
function MadeSecret({ c, made, maybe, busy, onDone, t }: { c: Computer; made: Made; maybe: boolean; busy: boolean; onDone: () => void; t: T }) {
  const name = personName(made.group);
  const links = made.kind === 'person' ? [] : made.links.map((p) => {
    const u = programUrl(c, p);
    return { p, link: u ? keyLink(u, made.secret) : null };
  });
  const missing = links.filter((x) => !x.link).map((x) => t(`acc.p.prog.${x.p}`));
  return (
    <>
      {maybe ? <Band tone="warn" size="table" /* noDetails: an unknown outcome */>{t('acc.p.secretMaybe')}</Band> : null}
      {made.kind === 'person' ? (
        <>
          <CopyField label={t('acc.p.signInName')} value={name} />
          <SecretField label={t('acc.p.secretPerson', { name })} value={made.secret} onWipe={onDone} />
        </>
      ) : links.map((x) => (x.link ? <SecretField key={x.p} label={t('acc.p.secretKey', { program: t(`acc.p.prog.${x.p}`) })} value={x.link} onWipe={onDone} /> : null))}
      {/* A program with no address has no link to give. */}
      {missing.length > 0 ? <Band size="table" /* noDetails: a program without an address, not a rejection */>{t('acc.p.noLinks', { programs: missing.join(', ') })}</Band> : null}
      {/* Done waits for the steps still to send, as every other close of the drawer does. */}
      <InlineActions actions={[]} primary={{ id: 'made-done', label: t('acc.p.secretDone'), onPress: onDone, ...(busy ? { disabledReason: t('acc.change.busy') } : {}) }} />
    </>
  );
}
