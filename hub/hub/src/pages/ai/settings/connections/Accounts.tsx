// AI → Settings → Connections → GitHub accounts: the realm's linked accounts on the top bar's
// computer, which one is in use and whether GitHub still accepts it; add one with a device code, switch the one in use, log
// one out. No session is needed: it loads at once. Every change is sent once; a lost answer is "may have gone through" with
// Check again (a status read, nothing sent) until the account list shows it, or Stop waiting (C9). Logging out says what it
// cannot reach: copies of the token in stopped computers or in folders no open chat uses stay until revoked on GitHub.
// github.com only (no GitHub Enterprise Server host yet). Mounted in Connections by the /ai routes.
import { Band, Button, CellLines, ConfirmDialog, CopyField, DataTable, Dialog, EmptyState, Outcome, RowNote, SegmentedControl, SettingGroup, SettingRow, SettingSwitch, Spinner, Stack, StatusPill, StepList, createColumnHelper, useStrings, type RowActionEntry, type Tone, Widget } from '@kit';
import { refusal, useCurrentComputer } from '@core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type AccountsPlace, type GitHubAt, pickAccountsPlace, useAccountsPlace, useActivate, useDeviceLogin, useGitHubAt, useGitHubStatus, useLateResult, useLogout, useLogouts } from './data';
import { factsFor, type GhAccount, type GhStatus, type Health } from './logic';
import strings from './strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;
const HEALTH_TONE: Record<Exclude<Health, 'none'>, Tone> = { ok: 'ok', invalid: 'danger', forbidden: 'warn', unchecked: 'neutral' };
const FAIL_WORDS: Record<string, 'add.expired' | 'add.denied' | 'add.rejected'> = {
  github_login_expired: 'add.expired',
  github_login_denied: 'add.denied',
  github_token_rejected: 'add.rejected',
};

// The section is a Widget, the same frame as MCP servers beside it: one heading, the one primary action (Add a GitHub
// account) in its head. The place choice is a SettingRow, the accounts a DataTable whose empty state is inside it, and the
// add flow a dialog.
export default function GitHubAccounts() {
  const t = useStrings(strings);
  const at = useGitHubAt();
  const computer = useCurrentComputer();
  const place = at ? `${at.target.container.id}\u0000${at.realm}` : null;
  // The add dialog belongs to one computer and place: another one closes it (its flow is that place's).
  const [adding, setAdding] = useState<string | null>(null);
  const open = place !== null && adding === place;
  // The place whose sign-in is out (a code asked for, a wait, or one held unknown): its Add waits for it.
  const [flowOut, setFlowOut] = useState<string | null>(null);
  const onFlowOut = useCallback((out: boolean) => setFlowOut((p) => (out ? place : p === place ? null : p)), [place]);
  return (
    <Widget
      size="l"
      title={t('title')}
      description={t('subtitle')}
      actions={at ? <AddStart at={at} t={t} waits={flowOut === place} onPress={() => setAdding(place)} /> : undefined}
    >
      {/* The same rhythm as MCP servers: the place, then the list and its outcome lines. */}
      <Stack gap={4}>
        {computer && <SettingGroup label={t('place')}><PlacePick t={t} /></SettingGroup>}
        {at ? (
          <Accounts key={place ?? ''} at={at} t={t} adding={open} onAdding={(o) => setAdding(o ? place : null)} onFlowOut={onFlowOut} />
        ) : computer ? (
          // A computer is shown, so the realm is All realms: ask for a realm; otherwise ask for a computer.
          <EmptyState icon="realm" title={t('allRealms.title')} body={t('allRealms.body')} size="sm" />
        ) : (
          <EmptyState icon="github" title={t('title')} body={t('noComputer')} size="sm" />
        )}
      </Stack>
    </Widget>
  );
}

/** The section's one primary: the add flow needs the accounts read, so none before it (a failed read offers Try again,
 *  never Add). While a sign-in of this place is out it waits, and says so: its lines are in the section. Its own component:
 *  the status read exists only with a computer and one place. */
function AddStart({ at, t, waits, onPress }: { at: GitHubAt; t: T; waits: boolean; onPress: () => void }) {
  const status = useGitHubStatus(at);
  if (status.data === undefined || status.error) return null;
  // An answer that did not list the accounts: the add flow needs the list, so Add waits for a read that has one.
  const unread = !status.data.known;
  const off = waits || unread;
  return <Button variant="primary" icon="github" isDisabled={off} {...(off ? { disabledReason: t(waits ? 'add.waits' : 'unknown.addWaits') } : {})} onPress={onPress}>{t('add.start')}</Button>;
}

// This realm or Global. Global is offered under any top-bar realm (data.ts useAccountsPlace);
// in a shared-access session it is off and the row's help says why (the help describes the choice).
function PlacePick({ t }: { t: T }) {
  const { globalOk, shown } = useAccountsPlace();
  return (
    <SettingRow label={t('place')} help={globalOk ? (shown === 'global' ? t('place.globalNote') : t('place.globalOk')) : t('place.globalOff')}>
      {(ids) => (
        <SegmentedControl<AccountsPlace>
          label={t('place')}
          {...(ids.helpId ? { 'aria-describedby': ids.helpId } : {})}
          items={[{ id: 'realm', label: t('place.realm') }, { id: 'global', label: t('place.global'), isDisabled: !globalOk }]}
          value={shown}
          onChange={pickAccountsPlace}
        />
      )}
    </SettingRow>
  );
}

/** Where the shown accounts live, for the add and log-out words. */
const placeWords = (at: GitHubAt, t: T): string => (at.realm === 'global' ? t('place.inGlobal') : t('place.inRealm'));

/** A log-out's state as its row's actions read it (busy sending, or held unknown). */
interface OutState { readonly busy: boolean; readonly held: boolean }
const OUT_IDLE: OutState = { busy: false, held: false };

const accountCol = createColumnHelper<GhAccount>();

function Accounts({ at, t, adding, onAdding, onFlowOut }: { at: GitHubAt; t: T; adding: boolean; onAdding: (open: boolean) => void; onFlowOut: (out: boolean) => void }) {
  const status = useGitHubStatus(at);
  // One switch at a time on a computer: its outcome is the section's, not a row's, so it stays in view (with Check again and
  // Stop waiting) even when the account it names leaves the list.
  const use = useActivate(at);
  const [asked, setAsked] = useState<GhAccount | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  // Each account's log-out runner lives in its LogoutLine under the table (its held line shows there); the row's actions read
  // its state from here.
  const [outs, setOuts] = useState<Readonly<Record<string, OutState>>>({});
  const report = useCallback((key: string, st: OutState) => {
    setOuts((m) => (m[key]?.busy === st.busy && m[key]?.held === st.held ? m : { ...m, [key]: st }));
  }, []);
  // Log-outs of this computer and realm (data.ts useLogouts): a readable list without the key is the log-out done, whether its
  // answer came or a read proved it later (never inferred from a hold that went away: Stop waiting frees one too). Rows answered
  // done that a list read before the answer still shows are marked logged out with nothing offered, also after leaving and
  // coming back, until a readable list without the key drops them.
  const out = useLogouts(at);
  const s = status.data;
  const { retire } = out;
  useEffect(() => {
    if (!s?.known) return;
    const shown = s.accounts.map((a) => a.key);
    const logins = retire(shown);
    if (logins.length) setGone(logins[logins.length - 1]!);
    if (asked && !shown.includes(asked.key)) setAsked(null);
  }, [s, asked, retire]);
  const goneKeys = out.keys;
  const columns = useMemo(() => [
    accountCol.accessor('login', {
      header: t('col.account'),
      cell: (c) => {
        const a = c.row.original;
        // A logged-out row shows no health: those facts were read before the log-out.
        const facts = s && !goneKeys.includes(a.key) ? factsFor(s, a) : null;
        const help = [a.host !== 'github.com' ? a.host : '', facts ? t(`health.help.${facts.health}`) : '', facts?.noPush ? t('noPush') : ''].filter(Boolean).join(' ');
        return help ? <CellLines>{a.login}<RowNote>{help}</RowNote></CellLines> : a.login;
      },
      meta: { pinned: true, list: 'primary' },
    }),
    accountCol.display({
      id: 'state',
      header: t('col.state'),
      cell: (c) => {
        const a = c.row.original;
        const isGone = goneKeys.includes(a.key);
        const facts = s && !isGone ? factsFor(s, a) : null;
        return (
          <>
            {isGone && <StatusPill tone="neutral">{t('logout.gone')}</StatusPill>}
            {a.active && !isGone && <StatusPill tone="ok" dot>{t('active')}</StatusPill>}
            {facts && <StatusPill tone={HEALTH_TONE[facts.health]}>{t(`health.${facts.health}`)}</StatusPill>}
          </>
        );
      },
      meta: { list: 'meta' },
    }),
  ], [t, s, goneKeys]);
  const useHeld = use.outcome?.kind === 'pending';
  const listed = !s || s.known;
  const heldLogin = String((use.held as { login?: unknown } | null)?.login ?? '');
  const actions = (a: GhAccount): readonly RowActionEntry[] => {
    const isGone = goneKeys.includes(a.key);
    const o = outs[a.key] ?? OUT_IDLE;
    const useOff = isGone || use.busy || useHeld || o.held;
    const outOff = isGone || o.held || o.busy;
    const why = (off: boolean) => (off ? { disabledReason: isGone ? t('reason.gone') : t('reason.busy') } : {});
    return [
      ...(a.active ? [] : [{ id: 'use', label: t('action.use'), inline: true, isDisabled: useOff, ...why(useOff), onAction: () => void use.run({ ...at, key: a.key, login: a.login }) }]),
      { id: 'logout', label: t('action.logout'), opens: true, tone: 'danger' as const, isDisabled: outOff, ...why(outOff), onAction: () => setAsked(a) },
    ];
  };
  return (
    <>
      <DataTable<GhAccount>
        label={t('title')}
        // The table draws the read's own states: loading, and a failed read with Try again (never "no account").
        data={s?.accounts}
        isLoading={status.isPending}
        error={status.error ?? undefined}
        onRetry={() => void status.refetch()}
        onRefresh={() => void status.refetch()}
        countLabel={(n) => t('count', { count: n })}
        columns={columns}
        getRowId={(a) => a.key}
        actions={actions}
        // An answer without a list is not "no account": it says the list was not read, offers the read again in place (the
        // empty table has no toolbar), and Add waits for a list.
        empty={
          <EmptyState
            icon={listed ? 'github' : 'warn'}
            title={t(listed ? 'empty.title' : 'unknown.title')}
            body={t(listed ? 'empty.body' : 'unknown.body')}
            size="sm"
            {...(listed ? {} : { action: <Button variant="secondary" size="sm" busy={status.isFetching} onPress={() => void status.refetch()}>{t('unknown.retry')}</Button> })}
          />
        }
        noViewMenu
        sortParam={false}
      />
      {s?.accounts.map((a) => <LogoutLine key={a.key} at={at} a={a} t={t} report={report} />)}
      {(useHeld || (use.outcome && use.outcome.kind !== 'done')) && (
        <Held runner={use} t={t} text={use.elsewhere ? t('use.heldElsewhere') : t('use.held', { login: heldLogin })} />
      )}
      {gone !== null && (
        <Outcome
          // noDetails: a done log-out has no rejection; the line says what may remain.
          outcome={{ kind: 'done' }}
          doneText={t('logout.done')}
          variant="block"
        />
      )}
      {asked && (
        <LogoutDialog
          at={at}
          a={asked}
          t={t}
          onClose={() => setAsked(null)}
          onSent={() => out.begin(asked.key, asked.login)}
          onDone={(key, login, n) => {
            // Its answer came: done now, whether or not a fresh list has come back yet.
            setGone(login);
            out.answered(key, n, true);
            setAsked(null);
          }}
          onFailed={(key, n) => out.answered(key, n, false)}
        />
      )}
      {s && <AddAccount at={at} s={s} t={t} open={adding} onOpen={onAdding} onFlowOut={onFlowOut} />}
    </>
  );
}

type Use = ReturnType<typeof useActivate>;
/** One account's log-out runner: its held line (Check again, Stop waiting) under the table, its state for the row's actions. */
function LogoutLine({ at, a, t, report }: { at: GitHubAt; a: GhAccount; t: T; report: (key: string, st: OutState) => void }) {
  const out = useLogout(at, a.key);
  const held = out.outcome?.kind === 'pending';
  const busy = out.busy;
  useEffect(() => { report(a.key, { busy, held }); }, [report, a.key, busy, held]);
  return held ? <Held runner={out} t={t} text={out.elsewhere ? t('use.heldElsewhere') : t('logout.held', { login: a.login })} /> : null;
}

type Runner = Use;
/** One change's outcome line: unknown with Check again and Stop waiting (after a warning), or its refusal. */
function Held({ runner, t, text }: { runner: Runner; t: T; text: string }) {
  const [asked, setAsked] = useState(false);
  const held = runner.outcome?.kind === 'pending';
  return (
    <>
      <Outcome outcome={runner.outcome} onCheck={held ? runner.check : undefined} detail={held ? text : undefined} error={refusal(runner.outcome)} />
      {held && !runner.elsewhere && (
        <Button size="sm" variant="ghost" onPress={() => setAsked(true)}>{t('dismiss')}</Button>
      )}
      <StopTracking t={t} isOpen={asked} onOpenChange={setAsked} onConfirm={() => void runner.dismiss()} />
    </>
  );
}

/** The question before a held change stops being tracked: the one such dialog of the section, whichever change asks. */
function StopTracking({ t, isOpen, onOpenChange, onConfirm }: { t: T; isOpen: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void }) {
  return (
    <ConfirmDialog
      overlayId="ai-github-stop-waiting"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t('dismiss.title')}
      body={t('dismiss.body')}
      confirmLabel={t('dismiss')}
      onConfirm={() => { onOpenChange(false); onConfirm(); }}
    />
  );
}

function LogoutDialog({ at, a, t, onClose, onSent, onDone, onFailed }: {
  at: GitHubAt; a: GhAccount; t: T; onClose: () => void; onSent: () => number;
  onDone: (key: string, login: string, n: number) => void; onFailed: (key: string, n: number) => void;
}) {
  const out = useLogout(at, a.key);
  return (
    <ConfirmDialog
      overlayId="ai-github-logout"
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
      tone="danger"
      title={t('logout.title', { login: a.login })}
      body={a.active ? `${t('logout.body', { login: a.login, place: placeWords(at, t) })} ${t('logout.bodyActive')}` : t('logout.body', { login: a.login, place: placeWords(at, t) })}
      confirmLabel={t('logout.confirm')}
      busy={out.busy}
      outcome={out.outcome?.kind === 'done' ? undefined : out.outcome}
      onCheck={out.outcome?.kind === 'pending' ? out.check : undefined}
      confirmDisabled={out.busy || out.outcome?.kind === 'pending'}
      onConfirm={() => {
        const n = onSent();
        // A refused log-out did nothing: it is no longer one to show as done when the list lacks the key.
        void out.run({ ...at, key: a.key, login: a.login }).then((r) => {
          if (r.outcome === 'done') onDone(a.key, a.login, n);
          else if (r.outcome === 'failed') onFailed(a.key, n);
        });
      }}
    />
  );
}

function AddAccount({ at, s, t, open, onOpen, onFlowOut }: { at: GitHubAt; s: GhStatus; t: T; open: boolean; onOpen: (open: boolean) => void; onFlowOut: (out: boolean) => void }) {
  const flow = useDeviceLogin(at);
  const { start, login, shown, bad, linked } = flow;
  // How a wait sent before the page was left ended (shown once it is no longer out; cleared by the next start).
  const late = useLateResult(at);
  const [activate, setActivate] = useState(false);
  const [asked, setAsked] = useState(false);
  const held = login.outcome?.kind === 'pending';
  const waiting = shown !== null && login.busy;
  // A wait still out from before the page was left (or from another of its views): no code here, no second one.
  const earlier = login.inFlight && !login.busy && !held;
  const failCode = login.outcome?.kind === 'failed' ? login.outcome.code ?? '' : '';
  const busy = start.busy || login.busy || held || earlier || start.outcome?.kind === 'pending';
  // With the dialog closed the head's Add would only reopen a start that is off: it waits instead.
  const out = busy && !open;
  useEffect(() => { onFlowOut(out); return () => onFlowOut(false); }, [onFlowOut, out]);
  // The flow's lines (the code and its steps, the wait, every outcome): in the dialog while it is open, else under the table,
  // so a wait or an unknown outcome stays in sight after the dialog is closed (the flow itself is unchanged).
  const lines = (
    <>
      {(start.busy || earlier) && (
        <Band tone="neutral" size="table" icon="clock" /* noDetails: a wait in progress, nothing was rejected */>
          {start.busy ? t('add.starting') : t('add.earlier')}
        </Band>
      )}
      {start.outcome?.kind === 'pending' && (
        <Outcome
          // noDetails: a start whose answer never came has no rejection; Check again reads the accounts.
          outcome={start.outcome}
          onCheck={start.check}
          detail={t('add.startHeld')}
        />
      )}
      {start.outcome && start.outcome.kind !== 'pending' && start.outcome.kind !== 'done' && <Outcome outcome={start.outcome} error={refusal(start.outcome)} />}
      {bad && (
        <Outcome
          // noDetails: the agent answered, but without a usable code; there is no rejection to show.
          outcome={{ kind: 'failed' }}
          detail={t('add.badStart')}
        />
      )}
      {waiting && shown && (
        <StepList
          label={t('add.steps.label')}
          groups={[{
            where: t('add.steps.where'),
            ...(shown.link ? { open: { label: t('add.open'), url: shown.link } } : {}),
            items: [
              { id: 'code', text: t('add.steps'), note: t('add.minutes', { minutes: Math.max(1, Math.round(shown.expiresIn / 60)) }), act: <CopyField label={t('add.code')} value={shown.userCode} description={t('add.codeHelp')} /> },
              ...(shown.link ? [] : [{ id: 'nolink', text: t('add.noLink') }]),
              { id: 'wait', text: t('add.waiting'), act: <Spinner label={t('add.waiting')} /> },
            ],
          }]}
        />
      )}
      {held && (
        <>
          <Outcome
            // noDetails: a wait whose answer never came has no rejection; Check again reads the accounts.
            outcome={login.outcome}
            onCheck={login.check}
            detail={login.elsewhere ? t('add.heldElsewhere') : t('add.held')}
          />
          {!login.elsewhere && <Button size="sm" variant="ghost" onPress={() => setAsked(true)}>{t('dismiss')}</Button>}
        </>
      )}
      {login.outcome && login.outcome.kind !== 'pending' && login.outcome.kind !== 'done' && (
        <Outcome outcome={login.outcome} detail={FAIL_WORDS[failCode] ? t(FAIL_WORDS[failCode]) : undefined} error={refusal(login.outcome)} />
      )}
      {late && !earlier && !login.busy && late.kind === 'failed' && (
        <Outcome
          // noDetails: the earlier view held the refusal; its words are kept by code (FAIL_WORDS), never the agent's text.
          outcome={{ kind: 'failed' }}
          detail={`${t('add.late')} ${t(FAIL_WORDS[late.code] ?? 'add.lateFailed')}`}
        />
      )}
      {late && !earlier && !login.busy && late.kind === 'done' && (
        <Outcome
          // noDetails: a done login has no rejection.
          outcome={{ kind: 'done' }}
          doneText={`${t('add.late')} ${late.login ? t('add.done', { login: late.login }) : t('add.doneUnnamed')}`}
        />
      )}
      {linked !== null && (
        <Outcome
          // noDetails: a done login has no rejection.
          outcome={{ kind: 'done' }}
          doneText={linked ? t('add.done', { login: linked }) : t('add.doneUnnamed')}
        />
      )}
    </>
  );
  return (
    <>
      {open ? null : lines}
      <Dialog
        overlayId="ai-github-add"
        isOpen={open}
        onOpenChange={onOpen}
        title={t('add.title')}
        body={t('add.body', { place: placeWords(at, t) })}
        {...(waiting ? {} : {
          primaryLabel: linked !== null ? t('add.again') : t('add.go'),
          onPrimary: () => void flow.begin(activate, s.accounts.map((a) => a.key)),
          primaryDisabled: busy || !s.known,
        })}
        cancelLabel={t('add.close')}
      >
        <Stack gap={4}>
          {!waiting && (
            <SettingGroup label={t('add.title')}>
              <SettingSwitch label={t('add.activate')} help={t('add.activateHelp')} isSelected={activate} onChange={setActivate} isDisabled={busy} />
            </SettingGroup>
          )}
          {open ? lines : null}
        </Stack>
      </Dialog>
      <StopTracking t={t} isOpen={asked} onOpenChange={setAsked} onConfirm={() => void login.dismiss()} />
    </>
  );
}
