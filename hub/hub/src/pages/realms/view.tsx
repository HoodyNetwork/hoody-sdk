// New realm: a flow wizard (WizardPage variant flow: a step strip over the page) in three steps kept in the URL (?step=), with a summary aside.
//   1. Name and colour. The name is checked against every realm's name, read fresh from the vault on open.
//   2. Computers, optional: every computer of the account; each picked one keeps its other realms.
//   3. Create: the id is made here (logic.ts mintId), the name is saved first (it is what makes an empty realm
//      exist), the colour is set, then each computer is added once (logic.ts engine).
// C9: nothing is sent twice by itself. An unknown name or computer shows "may have gone through" with Check again,
// which only reads; sending again is a separate press, offered only where a read or a refusal proved that nothing
// landed. Once Create is pressed the wizard is locked: no step changes, no second realm from the same press.
// Switching to the new realm is the shell's (a ?realm= link): pages never switch realms.
import {
  AnatomySection, Band, Button, ComputerMark, ConfirmDialog, DataTable, EmptyState, ErrorDetails, ErrorState, errorSentence, useErrorInfo, Facts, FaqLink, Form, InlineActions, LeaveGuard, NoAccessState, Outcome, ReasonButton, Section, Select, StatusPill,
  TextField, Why, WizardFooter, WizardPage, createColumnHelper, followPageLink, useDataView, useGo, usePageLink, useServedPageLink, useStrings, useWizardStep, type OutcomeLike,
} from '@kit';
import { REALM_LIMIT_CODE, REALM_PALETTE, foldRealmAlias, loadRealms, realmLabel, useCan, useRealmCap, useRealms, validateRealmAliases, type RealmColor } from '@core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { liveIo, useAllComputers, useNames, useSetRealms } from './data';
import { pageFaq } from './faq';
import { computersIn } from './links';
import { checkName, engine, freshId, notSeenText, stillOut, summary, type Engine, type EngineState, type ItemState, type NameCheck, type PickRow } from './logic';
import strings from './strings.en.json';
import { ColourName } from './parts/ColourName';
import { PickedList } from './parts/PickedList';

const col = createColumnHelper<PickRow>();
// The first colour no realm has yet, so the new one stands out in the switcher (the first one when all are used).
const freeColor = (taken: readonly string[]): RealmColor => REALM_PALETTE.find((c) => !taken.includes(c)) ?? REALM_PALETTE[0] ?? 'blue';
// Past this many picks the rail's list scrolls (a keyboard stop, so it can be scrolled without a mouse).
const PICKED_SCROLL = 8;
// Every step and the side card are built into the page (the computers table draws its own read states): always ready.
const READY = { kind: 'ready' } as const;
const RESENDABLE: ReadonlySet<ItemState> = new Set(['missing', 'changed', 'failed', 'gone']);
const TONE: Record<ItemState, 'neutral' | 'ok' | 'warn' | 'danger' | 'info'> = {
  waiting: 'neutral', sending: 'info', saved: 'ok', unknown: 'warn', unchecked: 'warn', changed: 'warn', gone: 'warn', missing: 'danger', failed: 'danger',
};
// An earlier send still out may land yet: a refusal or a read without the realm is about the latest try only.
const toneOf = (it: EngineState['items'][number]) => (it.sent !== null && (it.state === 'missing' || it.state === 'failed') ? 'warn' : TONE[it.state]);

// Something may have gone through and only this page can check it (the name has no hold anywhere else).
const mayBeOut = (s: EngineState) =>
  s.phase === 'running' || s.name.state === 'unknown' || (s.name.out && s.name.state !== 'saved') || s.items.some((it) => it.state === 'unknown' || it.state === 'sending' || it.sent !== null);

const NAME_PROBLEM: Record<Exclude<NameCheck, { ok: true }>['reason'], 'name.required' | 'name.taken' | 'name.reserved' | 'name.length' | 'name.control' | 'name.rule'> = {
  empty: 'name.required', taken: 'name.taken', reserved: 'name.reserved', length: 'name.length', control: 'name.control', rule: 'name.rule',
};

export default function NewRealmPage() {
  const t = useStrings(strings);
  const { items: faqItems, byId } = pageFaq(t);
  const go = useGo();
  const computersPage = useServedPageLink('computers');
  const homePage = usePageLink('home');
  // The account's Realm limit, read again when the wizard opens (the realm list's answer carries it). While the API says
  // it is reached nothing starts: the name is the first thing Create saves, and a realm past the limit could take no
  // computer. No answer about the limit (none reported): nothing is closed.
  const cap = useRealmCap();
  const limited = cap.k !== 'none' && cap.reached;
  const billingPage = usePageLink('billing');
  // Nothing starts before this opening's own read has ended: a count from an earlier read could let Create through.
  // A read that fails or reports no limit closes nothing (the write itself is still refused past the limit).
  const [capRead, setCapRead] = useState(false);
  useEffect(() => {
    let on = true;
    const done = () => { if (on) setCapRead(true); };
    loadRealms().then(done, done);
    return () => { on = false; };
  }, []);
  const realms = useRealms();
  // A shared-access (token) session never holds 'account': it cannot write the realm names.
  const account = useCan('account');
  const names = useNames();
  const picker = useAllComputers();
  const setRealms = useSetRealms();
  const steps = [
    { id: 'name', label: t('step.name') },
    { id: 'computers', label: t('step.computers') },
    { id: 'review', label: t('step.review') },
  ];
  const [name, setName] = useState('');
  const [color, setColor] = useState<RealmColor>(() => freeColor((realms.rows ?? []).map((r) => r.tint)));
  const [tried, setTried] = useState(false);
  const [noSecure, setNoSecure] = useState(false);
  const [run, setRun] = useState<{ e: Engine; s: EngineState } | null>(null);
  const check = names.state === 'ok' ? checkName(name, names.map, validateRealmAliases, foldRealmAlias) : null;
  // The exact rule broken, in the words Rename realms uses; 'rule' stays for a throw core gives no reason for.
  const problem = check && !check.ok ? NAME_PROBLEM[check.reason] : undefined;
  const nameOk = check?.ok === true;
  const started = run !== null;
  // A link that opens on a later step (a reload, a shared link) has no name yet: the URL goes back to step 1 with
  // it, so the first valid character typed does not jump ahead. Only once the names are read (a re-read keeps the step).
  // A later step is reached only through Next on this visit: a name typed while the names were still being read
  // does not make the link's step reachable when the read lands.
  const [walked, setWalked] = useState(false);
  const [step, setStep] = useWizardStep(steps, { reachable: started || (nameOk && walked) ? steps.length - 1 : 0, ready: names.state === 'ok' });
  const [leaving, setLeaving] = useState<{ go: () => void; stay: () => void } | null>(null);
  // Leaving the page stops the engine like a realm switch: what is not sent yet stays unsent, except a name write
  // already started (core runs it to its answer, so it may land after leaving; the leave warning says so).
  const mounted = useRef(true);
  // Set again on mount: a development double mount runs the cleanup once in between.
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Made in full (the name saved, every picked computer saved, nothing unknown or held): go on to the new realm's
  // Computers at once, the shell switching to it. Any other end stays on the results and their ways on.
  const fullyDone = !!run && !mayBeOut(run.s) && run.s.phase === 'done' && run.s.name.state === 'saved' && ['ok', 'empty'].includes(summary(run.s).kind);
  const wentFor = useRef<string | null>(null);
  useEffect(() => {
    if (!fullyDone || !run || computersPage === null || wentFor.current === run.s.id) return;
    wentFor.current = run.s.id;
    go(computersIn(run.s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullyDone]);

  const header = { title: t('title'), subtitle: t('subtitle') };
  const realmName = (id: string) => {
    const n = realmLabel(id);
    return n.kind === 'alias' || n.kind === 'short' ? n.text : '';
  };
  const colors = REALM_PALETTE.map((c) => ({ value: c, label: t(`color.${c}`), swatch: [`var(--hx-r-${c})`] }));
  const columns = [
    // The computer's colour mark before its name. A fragment, not a wrapper element: these columns are made per
    // render and the table mounts a cell function as a component, so the cell is mounted again on every render; with
    // the name's text directly in the table's own cell node, that node stays while the table keeps its layout.
    col.accessor('name', { header: t('col.name'), meta: { priority: 1 }, cell: (c) => <><ComputerMark color={c.row.original.color} />{' '}{c.getValue()}</> }),
    col.accessor('project', { header: t('col.project') }),
    col.accessor('server', { header: t('col.server') }),
    col.accessor((r) => r.realms.map(realmName).join(', '), { id: 'realms', header: t('col.realms'), cell: (c) => c.getValue() || t('realms.none') }),
  ];
  // The picks live in the view: they stay while the steps change, and a realm or account switch drops them.
  const view = useDataView({ rows: picker.rows, columns, getRowId: (r: PickRow) => r.id, search: (r: PickRow) => [r.name, r.project, r.server, ...r.realms.map(realmName)], isLoading: picker.loading, error: picker.error ?? undefined });
  const rows = picker.rows;
  const chosen = useMemo(() => (rows ?? []).filter((r) => view.selected.has(r.id)), [rows, view.selected]);

  if (!account || realms.pinned !== null) {
    return (
      <WizardPage variant="flow" header={header} steps={steps} current={0}>
        <NoAccessState title={t('pinned.title')} body={t('pinned.body')} />
      </WizardPage>
    );
  }

  const current = !started && step > 0 && !nameOk ? 0 : started ? 2 : step;
  const last = current === steps.length - 1;
  const busy = run?.s.phase === 'running';
  // Why the step's main button cannot be used yet, in words (the footer shows it on the button). Step 1 needs the
  // realm names read before a name can be checked; Create needs a usable name and a browser that can make the id.
  const blocked = !capRead ? t('limit.checking') : limited ? t('limit.reached') : last
    ? noSecure ? t('noSecure') : !nameOk ? t('name.required') : undefined
    : current === 0 && names.state === 'failed' ? t('names.failed') : undefined;
  // The short wait for the names is a plain disabled Next (the name field's help line says what is being read), so the
  // button a person may already have focused is the same element once the read ends.
  const waiting = current === 0 && names.state === 'reading';

  const next = () => {
    if (current === 0 && !nameOk) return setTried(true);
    setWalked(true);
    setStep(current + 1);
  };
  const create = () => {
    if (started || !capRead || limited || !check?.ok) return;
    // Every id already known: the switcher's list, every named one, every realm a listed computer carries.
    const known = [...(realms.rows ?? []).map((r) => r.id), ...(names.state === 'ok' ? Object.keys(names.map) : []), ...(rows ?? []).flatMap((r) => r.realms)];
    const id = freshId(known);
    if (!id) return setNoSecure(true);
    const alias = check.alias;
    const free = (m: Readonly<Record<string, string>>) => checkName(alias, m, validateRealmAliases, foldRealmAlias).ok;
    const e = engine({ id, alias, color, rows: chosen, io: liveIo(setRealms, () => mounted.current), free, onChange: (s) => setRun((r) => (r ? { ...r, s } : r)) });
    setRun({ e, s: e.state() });
    void e.start();
  };

  const nameStep = (
    <AnatomySection id="new-realm-name" state={READY} title={t('name.title')} description={t('name.lead')}>
      {/* What a realm is, before anything is asked: three facts that stay in view, then the link to the full answer. */}
      <Facts
        columns={1}
        label={t('intro.title')}
        items={[
          { label: t('intro.apart'), value: t('intro.apartV') },
          { label: t('intro.shared'), value: t('intro.sharedV') },
          { label: t('intro.free'), value: t('intro.freeV') },
        ]}
      />
      <FaqLink item={byId.whatIs}>{t('intro.more')}</FaqLink>
      <TextField
        label={t('name.label')}
        // While the names are being read the field says so in its own help line; Next waits for the read.
        description={names.state === 'reading' ? t('names.reading') : t('name.help')}
        value={name}
        onChange={setName}
        errorMessage={tried && problem ? (check && !check.ok && check.reason === 'reserved' ? t('name.reserved', { word: check.word ?? foldRealmAlias(name.trim()) }) : t(problem)) : undefined}
        focusOnError
        reserveError
      />
      {names.state === 'failed' && (
        <Band tone="warn" error={names.error} actions={<Button size="sm" onPress={names.retry}>{t('names.retry')}</Button>}>{t('names.failed')}</Band>
      )}
      <Select label={t('color.label')} description={t('color.help')} options={colors} value={color} onChange={setColor} />
    </AnatomySection>
  );

  const computersStep = (
    <AnatomySection id="new-realm-computers" state={READY} title={t('pick.title')} description={t('pick.body')}>
      {/* One band: "still listing" while later pages are out, then the lasting warning if some stayed unread. */}
      {(picker.more || picker.partial) && (
        <Band tone={picker.more ? 'neutral' : 'warn'} /* noDetails: a list longer than the pages read, or a later page unread: the rows read are shown and the sentence says what to do */>
          {t(picker.more ? 'pick.more' : 'pick.partial')}
        </Band>
      )}
      {picker.error ? (
        // A step body has room for the whole sentence: the small state wraps it, where compact cuts it to one line.
        <ErrorState size="sm" error={picker.error} title={t('pick.error')} onRetry={picker.refetch} />
      ) : (
        <DataTable
          label={t('pick.table')}
          view={view}
          columns={columns}
          search={t('pick.search')}
          onRefresh={picker.refetch}
          selectable="pick"
          countLabel={(n) => t('pick.count', { count: n })}
          empty={<EmptyState size="compact" icon="computer" title={t('pick.empty')} />}
          sortParam={false}
          noViewMenu
        />
      )}
      <Why question={t('pick.faqMoves')} faq={{ item: byId.pickMoves, label: t('pick.faqMore') }}>{t('pick.whyMoves')}</Why>
      <Why question={t('pick.faqProjects')} faq={{ item: byId.projects, label: t('pick.faqMore') }}>{t('pick.whyProjects')}</Why>
    </AnatomySection>
  );

  // Nothing was sent at all (the name was refused here): back to step 1 with the names read again.
  const restart = () => {
    setRun(null);
    names.retry();
    setStep(0);
  };
  const open = !!run && mayBeOut(run.s);
  const reviewStep = run ? <Results run={run} color={color} onOpen={(to) => computersPage && go(to)} canOpen={computersPage !== null} onRestart={restart} /> : (
    <AnatomySection id="new-realm-review" state={READY} title={t('review.title')} description={t('review.body')}>
      {noSecure && <Band tone="danger" /* noDetails: the Hub's own check (no secure context for a fresh id); nothing was sent or refused */>{t('noSecure')}</Band>}
      {/* What Create does, in its order (logic.ts engine: the name first, then each computer; view: a full success opens the
          realm's Computers, only when Computers is served here, so the Last row shows only then). */}
      <Facts
        columns={1}
        items={[
          { label: t('review.first'), value: t('review.firstV') },
          { label: t('review.then'), value: chosen.length ? t('review.thenV') : t('review.thenNone') },
          ...(computersPage !== null ? [{ label: t('review.last'), value: t('review.lastV') }] : []),
          { label: t('review.starts'), value: t('review.startsV') },
        ]}
      />
    </AnatomySection>
  );

  return (
    <>
    <LeaveGuard active={open} onBlock={(proceed, reset) => setLeaving({ go: proceed, stay: reset })} />
    <ConfirmDialog
      overlayId="realm-leave"
      isOpen={leaving !== null}
      onOpenChange={(o) => {
        if (!o) { leaving?.stay(); setLeaving(null); }
      }}
      tone="danger"
      title={t('leave.title')}
      body={t('leave.body')}
      confirmLabel={t('leave.go')}
      onConfirm={() => { leaving?.go(); setLeaving(null); }}
    />
    <WizardPage
      variant="flow"
      header={header}
      steps={steps}
      current={current}
      // The Realm limit is reached: said once above the steps, with the way to more realms where there is one. Not shown
      // once a realm is being made (its own results are on the page then).
      notice={capRead && limited && !started ? (
        <Band tone="warn" /* noDetails: the realm list's own answer about the limit; nothing was sent or refused */ actions={cap.k !== 'none' && cap.upgrade && billingPage ? <Button size="sm" onPress={() => followPageLink(billingPage, go)}>{t('limit.upgrade')}</Button> : undefined}>
          {t('limit.band')}
        </Band>
      ) : undefined}
      onStep={started ? undefined : (i) => (i === 0 || nameOk ? (setWalked(true), setStep(i)) : setTried(true))}
      faq={{ items: faqItems }}
      asideTitle={t('summary.title')}
      aside={
        // The same kit card as New script's "Your script so far": an AnatomySection beside the steps.
        <AnatomySection id="new-realm-summary" title={t('summary.title')} state={READY}>
          <Facts
            layout="spec"
            columns={1}
            items={[
              { label: t('summary.name'), value: check?.ok ? check.alias : t('summary.none') },
              { label: t('summary.color'), value: <ColourName color={color} label={t(`color.${color}`)} /> },
              {
                label: t('summary.computers'),
                value: chosen.length ? (
                  <PickedList count={t('summary.count', { count: chosen.length })} label={t('summary.picked')} items={chosen} scroll={chosen.length > PICKED_SCROLL} />
                ) : t('summary.empty'),
              },
            ]}
          />
        </AnatomySection>
      }
      footer={
        started ? undefined : (
          <WizardFooter
            back={current > 0 ? { onPress: () => setStep(current - 1) } : undefined}
            // Names that could not be read close Next: say so beside it, where a short screen still shows it (the Band with
            // the full reason and Try again sits under the field, below the fold there).
            note={current === 0 && names.state === 'failed' ? t('names.waitNext') : undefined}
            // Nothing is made before Create, so Cancel leaves at once: home (New realm has no list page of its own).
            secondary={homePage ? <Button chip={false} onPress={() => followPageLink(homePage, go)}>{t('cancel')}</Button> : undefined}
            primary={
              blocked ? (
                <ReasonButton variant="primary" reason={blocked}>{last ? t('create') : t('next')}</ReasonButton>
              ) : last ? (
                <Button variant="primary" onPress={create}>{t('create')}</Button>
              ) : (
                <Button variant="primary" iconEnd="arrow-right" isDisabled={waiting} onPress={next}>{t('next')}</Button>
              )
            }
          />
        )
      }
    >
      {/* bare: the step's section card takes the column's width, as New script's (a stack Form caps it at --form-max). */}
      <Form layout="bare" onSubmit={last ? create : next} busy={busy}>
        {current === 0 && nameStep}
        {current === 1 && computersStep}
        {current === 2 && reviewStep}
      </Form>
    </WizardPage>
    </>
  );
}

/** A pill says what is known: "not there" after a lost send is a reading, not a failure. */
/** A computer's send the account's Realm limit refused: the one sentence every surface shows for it, with its details. */
function LimitRefused({ error }: { error: unknown }) {
  const t = useStrings(strings);
  const info = useErrorInfo(error);
  return <Band tone="warn" error={error}>{info ? errorSentence(info) : t('limit.reached')}</Band>;
}

function itemLabel(it: EngineState['items'][number]): `item.${ItemState}` | 'item.notSeen' | 'item.unread' | 'item.retryRefused' {
  if (it.state === 'unchecked' && it.sent === null) return 'item.unread';
  if (it.state === 'missing' && it.sent !== null) return 'item.notSeen';
  if (it.state === 'failed' && it.sent !== null) return 'item.retryRefused';
  return `item.${it.state}`;
}

const NAME_TEXT: Record<string, 'name.takenNow' | 'name.unreadNow' | 'name.unsafeNow' | 'name.lost'> = { NAME_TAKEN: 'name.takenNow', NAMES_UNREAD: 'name.unreadNow', CAS_REQUIRED: 'name.unsafeNow', NAME_LOST: 'name.lost' };
// The latest try's reason while an earlier one is still out: no "nothing was saved", which that one may undo.
const NAME_WHY: Record<string, 'name.whyTaken' | 'name.whyUnread' | 'name.whyUnsafe'> = { NAME_TAKEN: 'name.whyTaken', NAMES_UNREAD: 'name.whyUnread', CAS_REQUIRED: 'name.whyUnsafe' };

/** What Create did: the name's outcome, each computer's state, the checks and second sends, and the way on. */
function Results({ run, color, onOpen, canOpen, onRestart }: { run: { e: Engine; s: EngineState }; color: RealmColor; onOpen: (to: string) => void; canOpen: boolean; onRestart: () => void }) {
  const t = useStrings(strings);
  const { e, s } = run;
  const sum = summary(s);
  const n = s.name;
  // An earlier name send still out may land yet: whatever the latest read or try said, the outcome stays pending
  // (Check again reads); a refusal is said to be about the latest try only.
  const outLater = n.out && n.state !== 'saved' && n.state !== 'sending';
  const nameOutcome: OutcomeLike | null =
    n.state === 'saved' ? { kind: 'done' }
      : n.state === 'unknown' ? { kind: 'pending', message: t(n.code === 'NAME_UNCHECKED' ? 'name.unchecked' : n.unread ? 'name.unread' : 'name.mayNotSave') }
        : outLater && n.state === 'missing' ? { kind: 'pending', message: t(notSeenText(n)) }
        : outLater ? { kind: 'pending', message: t('name.retryRefused', { why: t(NAME_WHY[n.code ?? ''] ?? 'name.whyRefused') }) }
        : n.state === 'missing' ? { kind: 'failed', message: t(NAME_TEXT[n.code ?? ''] ?? 'name.lost') }
          : n.state === 'failed' ? { kind: n.notSent ? 'not_sent' : 'failed', message: t(NAME_TEXT[n.code ?? ''] ?? 'name.refused') }
            : null;
  const icol = createColumnHelper<EngineState['items'][number]>();
  const columns = [
    icol.accessor('name', { header: t('col.name'), meta: { priority: 1 } }),
    icol.accessor('state', { header: t('col.state'), cell: (c) => <><StatusPill tone={toneOf(c.row.original)}>{t(itemLabel(c.row.original))}</StatusPill>{c.row.original.state === 'failed' && c.row.original.error != null ? <>{' '}<ErrorDetails error={c.row.original.error} mode="button" /></> : null}</> }),
  ];
  const done = s.phase === 'done' && n.state === 'saved';
  const joined = s.items.filter((it) => it.state === 'saved').map((it) => it.name);
  const has = (st: ItemState) => s.items.some((it) => it.state === st);
  // A computer whose lost send core still holds: adding it again is offered with this warning in view. When its
  // realms moved since, the earlier send would put back the set it had then, so that one says so.
  const held = s.items.some((it) => it.sent !== null && RESENDABLE.has(it.state) && it.state !== 'changed');
  const heldMoved = s.items.some((it) => it.sent !== null && it.state === 'changed');
  const counts = (['saved', 'unknown', 'refused', 'waiting'] as const).filter((k) => sum[k] > 0);
  const [dismissing, setDismissing] = useState(false);
  const notes = [
    ...(s.items.some((it) => it.state === 'unknown' || stillOut(it)) ? [{ label: t('items.check'), value: t('items.unknownHelp') }] : []),
    ...(e.canDismissHeld() ? [{ label: t('items.dismissHeld'), value: t('items.heldSavedHelp') }] : []),
    ...(s.items.some((it) => it.sent !== null && it.code === 'ELSEWHERE') ? [{ label: t('items.elsewhereLabel'), value: t('items.heldElsewhereHelp') }] : []),
    ...(has('changed') ? [{ label: t('item.changed'), value: t('items.changedHelp') }] : []),
    ...(has('gone') ? [{ label: t('item.gone'), value: t('items.goneHelp') }] : []),
    ...(held ? [{ label: t('items.heldLabel'), value: t('items.heldHelp') }] : []),
    ...(heldMoved ? [{ label: t('items.heldMovedLabel'), value: t('items.heldMovedHelp') }] : []),
  ];
  return (
    <>
      <ConfirmDialog
        overlayId="realm-stop-tracking"
        isOpen={dismissing}
        onOpenChange={(o) => { if (!o) setDismissing(false); }}
        tone="danger"
        title={t('dismiss.title')}
        body={t('dismiss.body')}
        confirmLabel={t('dismiss.go')}
        onConfirm={() => { setDismissing(false); void e.dismissHeld(); }}
      />
      {n.state === 'sending' ? (
        <StatusPill tone="info">{t('name.saving')}</StatusPill>
      ) : (
        <Outcome
          variant="block"
          outcome={nameOutcome}
          error={n.error}
          // "Not made" only when no earlier write may still land; with one, the earlier-try sentence stays the body
          // (error= alone would replace it with the generic pending words) and the refusal's facts stay in Details.
          title={n.state === 'failed' && n.error && !n.out ? t('name.notMade') : undefined}
          detail={outLater ? nameOutcome?.message : undefined}
          doneText={t(n.code === 'RENAMED' ? 'name.renamed' : 'name.saved', { name: s.alias })}
          onCheck={e.canCheckName() ? () => e.checkName() : undefined}
          onRetry={!outLater && e.canSendName() ? () => void e.sendName() : undefined}
        />
      )}
      <InlineActions
        label={t('name.actions')}
        actions={[
          ...(outLater && e.canSendName() ? [{ id: 'name-again', label: t('name.tryAgain'), onPress: () => void e.sendName() }] : []),
          ...(e.canRestart() ? [{ id: 'restart', label: t('restart'), icon: 'arrow-left' as const, onPress: onRestart }] : []),
        ]}
      />
      {e.limitRefused() && <LimitRefused error={s.items.find((it) => it.code === REALM_LIMIT_CODE)?.error} />}
      {s.phase === 'stopped' && <Band tone="warn" /* noDetails: the page was left or the realm switched: what was not sent stays unsent, nothing was refused */>{t('stopped')}</Band>}
      {s.items.length > 0 && (
        <Section title={t('items.title')}>
          <DataTable label={t('items.table')} data={s.items} columns={columns} getRowId={(r) => r.id} sortParam={false} noViewMenu bare />
          {/* What each state or action in the table means, only the ones in view: one list, each sentence under the
              words the table or its buttons use. */}
          {notes.length > 0 && <Facts columns={1} label={t('items.notes')} items={notes} />}
          <InlineActions
            label={t('items.actions')}
            actions={[
              ...(e.canCheckComputers() ? [{ id: 'items-check', label: t('items.check'), icon: 'reload' as const, onPress: () => void e.checkComputers() }] : []),
              ...(e.canDismissHeld() ? [{ id: 'items-dismiss', label: t('items.dismissHeld'), tone: 'danger' as const, opens: 'dialog' as const, onPress: () => setDismissing(true) }] : []),
              ...(e.canSendComputers()
                ? [{ id: 'items-send', label: t(!has('waiting') ? 'items.resend' : s.items.some((it) => RESENDABLE.has(it.state)) ? 'items.rest' : 'items.start'), onPress: () => void e.sendComputers() }]
                : []),
            ]}
          />
        </Section>
      )}
      {done && (
        <Section title={sum.kind === 'empty' ? t('done.empty', { name: s.alias }) : sum.kind === 'ok' ? t('done.ok', { name: s.alias }) : t('done.made', { name: s.alias })}>
          {/* The recap: on a partial result, first how many computers ended in each state; then what was made, as the
              wizard's summary rail shows it. Only computers a read or an answer proved in the realm are listed. */}
          <Facts
            columns={1}
            items={[
              ...(sum.kind === 'part' ? counts.map((k) => ({ label: t(`count.${k}Label`), value: t(`count.${k}`, { count: sum[k] }) })) : []),
              { label: t('summary.name'), value: s.alias },
              { label: t('summary.color'), value: <ColourName color={color} label={t(`color.${color}`)} /> },
              { label: t('done.joined'), value: joined.length ? joined.join(', ') : t('done.joinedNone') },
              ...(canOpen ? [{ label: t('done.newComputers'), value: t('done.newComputersV') }] : []),
            ]}
          />
          {/* The shell's realm-link key, so the shell switches to the new realm first (?realm= is only the Computers
              filter: without it a computer from Get lands in no realm). */}
          {canOpen && (
            <InlineActions
              label={t('done.actions')}
              size="md"
              primary={{ id: 'open', label: t('open'), onPress: () => onOpen(computersIn(s.id)) }}
              actions={[{ id: 'get', label: t('get'), onPress: () => onOpen(computersIn(s.id, true)) }]}
            />
          )}
        </Section>
      )}
    </>
  );
}
