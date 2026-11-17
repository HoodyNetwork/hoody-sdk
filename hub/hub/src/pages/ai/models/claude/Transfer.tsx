// AI → Models & keys → Claude Code: copy Claude Code's sign-in or its settings from one computer of the realm to another
// Each copy is two steps in a drawer: Preview (the agent reads both computers and writes nothing: what
// would be written, what the target already holds) and Copy (the agent applies exactly that preview, once). Rules:
//   - Copy needs a preview made from the drawer's current inputs; changing From, To or what drops it.
//   - Every file the target already holds, or that could not be checked, is replaced only with the person's tick, per path
//     (a sign-in: one tick). Nothing is ticked for them.
//   - A preview runs out after ten minutes: Copy is then off and Preview again is offered (nothing sent).
//   - A copy is sent once. Its token is spent by that send (marked before the request goes, so a second press before any
//     render sends nothing), so after any answer the next step is a new preview: a stale plan or a changed target wrote
//     nothing; a lost answer, or a 200 that is not a whole receipt, may have written part or all (C9) and is never sent again.
//   - Such an unknown copy keeps the target paths it may have written, and stays shown ("may have copied") until later
//     previews of that computer have read every one of those paths with a known state (settleCopies). A preview that could
//     not check them, read other files or only some of them keeps the rest unknown. A preview that fails says the target
//     could not be checked; it never says nothing was copied.
//   - A preview settles only copies already unknown when it was sent (eligibleOf): one still out may write after the read.
//   - The account owns the unknown copies (copyStore, a module store outside React), never a component: closing a drawer,
//     choosing another computer or realm, or the page going and coming back leaves each one bound to its own copy. Shown
//     under the Claude Code section (ClaudeCopies, above its loading, error and unavailable returns) or in whichever
//     drawer is open; with no section shown, the store holds each copy's one sticky toast, showing its current state, and
//     retires it when the copy settles (the applies go with the copy's context, so core adds no notice). Every preview
//     settles through the store (copyStore.settle), so a drawer gone before its answer changes nothing.
//   - The drawers belong to the top bar's computer and one realm: another computer or realm starts them over.
import {
  Band, Button, Checkbox, CodeBlock, ComputerPicker, DataTable, Drawer, EmptyState, Outcome, PathField, RadioGroup, ReasonButton, SettingGroup, SettingRow,
  createColumnHelper, formatBytes, useShellData, useStrings, type ComputerChoice, type OutcomeLike,
} from '@kit';
import { useCurrentComputer } from '@core';
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAiRealm } from '../../aiRealm';
import strings from './Transfer.strings.en.json';
import {
  applyResultOf, askedPath, expired, filesApplyable, filesDoneOf, filesPlanOf, loginApplyable, loginDoneOf, loginPlanOf, needsConsent, onTheWay,
  overwriteOf, pathOk, refusalKey, writesOf, writtenPathsOf, EXPIRY_MARGIN_MS, type ApplyResult, type FilePlanRow, type FilesDone,
  type FilesPlan, type LoginDone, type LoginPlan, type Source, type TargetRead, type UnknownCopy,
} from './transfer';
import { copyCtx, copyStore, type CopyRecord } from './copyStore';
import { applyFiles, applyLogin, previewFiles, previewLogin, type CopyAt } from './transferApi';
import type { Settled } from '../../types';
import { useFolders } from '../../new/data';
import { NO_PATH_READS, usePathReads } from '../../parts/mentionFiles';

type T = ReturnType<typeof useStrings<typeof strings>>;
const RE24 = /^[0-9a-f]{24}$/;
const SETTINGS_DIR = '.claude';

/** The top bar's computer and the page's one realm (aiRealm.ts: under All realms the computer's own; never All realms), or
 *  null. */
function useCopyAt(): CopyAt | null {
  const target = useCurrentComputer();
  const { realm } = useAiRealm();
  return useMemo(() => (target && (realm === 'global' || RE24.test(realm)) ? { target, realm } : null), [target, realm]);
}

export function ClaudeTransfer() {
  const t = useStrings(strings);
  const at = useCopyAt();
  const hasComputer = useCurrentComputer() !== null;
  const [open, setOpen] = useState<'login' | 'files' | null>(null);
  const why = at ? undefined : t(hasComputer ? 'noRealm' : 'noComputer');
  const key = at ? `${at.target.container.id}\u0000${at.realm}` : '';
  const copies = useCopies();
  // The page's notices step aside while a drawer is open (it shows them itself), and come back when this section goes.
  const setDrawerOpen = copies.setDrawerOpen;
  useEffect(() => {
    setDrawerOpen(open !== null);
    return () => setDrawerOpen(false);
  }, [open, setDrawerOpen]);
  return (
    <>
      <SettingGroup>
        <SettingRow
          label={t('login.row')}
          help={why ?? t('login.help')}
          actions={<Button size="sm" variant="secondary" isDisabled={!at} onPress={() => setOpen('login')}>{t('login.open')}</Button>}
        />
        <SettingRow
          label={t('files.row')}
          help={why ?? t('files.help')}
          actions={<Button size="sm" variant="secondary" isDisabled={!at} onPress={() => setOpen('files')}>{t('files.open')}</Button>}
        />
      </SettingGroup>
      {at && <LoginDrawer key={`l${key}`} at={at} copies={copies} isOpen={open === 'login'} onClose={() => setOpen(null)} t={t} />}
      {at && <FilesDrawer key={`f${key}`} at={at} copies={copies} isOpen={open === 'files'} onClose={() => setOpen(null)} t={t} />}
    </>
  );
}

// ── shared pieces ────────────────────────────────────────────────────────────────────────────────

interface Ends { from: string; to: string | undefined }

/** From and To: From is this computer (the default) or another; To is any other computer of the list but From. */
function useEnds(at: CopyAt, t: T) {
  const shell = useShellData();
  const here = at.target.container.id;
  const hereName = shell.computers.find((c) => c.id === here)?.name ?? at.target.container.id;
  const [ends, setEnds] = useState<Ends>({ from: here, to: undefined });
  const choice = (c: { id: string; name: string; running?: boolean; color?: string }): ComputerChoice => ({
    id: c.id, name: c.id === here ? t('here', { name: c.name }) : c.name, ...(c.running !== undefined ? { running: c.running } : {}), ...(c.color ? { color: c.color } : {}),
  });
  const all = shell.computers.some((c) => c.id === here) ? shell.computers : [{ id: here, name: hereName }, ...shell.computers];
  const fromChoices = all.map(choice);
  const toChoices = all.filter((c) => c.id !== here && c.id !== ends.from).map(choice);
  const source: Source = ends.from === here ? { kind: 'host' } : { kind: 'container', id: ends.from };
  const nameOf = (id: string | undefined) => (id ? all.find((c) => c.id === id)?.name ?? id : '');
  // Listed computers win; with none to offer, a list still loading or not read is never "no other computer" (C9).
  const toRead = toChoices.length ? undefined : shell.computersRead;
  return { ends, setEnds, fromChoices, toChoices, source, nameOf, toRead, retry: shell.retryComputers };
}

function EndPickers({ e, onChange, t, isDisabled }: { e: ReturnType<typeof useEnds>; onChange: () => void; t: T; isDisabled: boolean }) {
  const set = (next: Ends) => { e.setEnds(next); onChange(); };
  return (
    <>
      <ComputerPicker label={t('from')} computers={e.fromChoices} value={e.ends.from} isDisabled={isDisabled}
        onChange={(id) => set({ from: id, to: e.ends.to === id ? undefined : e.ends.to })} />
      {e.toChoices.length === 0 && !e.toRead ? (
        <EmptyState size="sm" icon="computer" title={t('to.none')} />
      ) : (
        <ComputerPicker label={t('to')} placeholder={t('to.placeholder')} computers={e.toRead ? undefined : e.toChoices} value={e.ends.to} isDisabled={isDisabled}
          status={e.toRead === 'unknown' ? { error: true, ...(e.retry ? { onRetry: () => void e.retry?.() } : {}) } : undefined}
          onChange={(id) => set({ ...e.ends, to: id })} />
      )}
    </>
  );
}

/** The footer's line: an outcome and its title. */
interface Note { o: OutcomeLike; title: string }

/** What a preview's failure says: nothing was planned. A preview never writes, so it says nothing about what an earlier
 *  copy did; when one to this target is unknown, it says the target could not be checked (`unknownTo`: its name). */
function previewNote(r: Settled<unknown>, t: T, unknownTo: string | null): Note | null {
  if (!r.ok && r.err.kind === 'stale') return null;
  const message = r.ok ? t('preview.bad') : r.err.kind === 'pending' ? t('preview.noAnswer') : t(refusalKey(r.err.code, r.err.details.reason ?? '') as 'why.other');
  const kind = !r.ok && r.err.kind === 'not_sent' ? 'not_sent' : 'failed';
  return { o: { kind, message: unknownTo ? `${t('preview.checkFailed', { to: unknownTo })} ${message}` : message }, title: t('preview.failedTitle') };
}

/** What an apply's definite answer says (a pending one is an Unresolved instead). Every kind leads to Preview again. */
function applyNote<B>(res: Exclude<ApplyResult<B>, { kind: 'pending' }>, to: string, t: T, done: (b: B) => string): Note | null {
  switch (res.kind) {
    case 'gone': return null;
    case 'done': return { o: { kind: 'done', message: done(res.body) }, title: '' };
    case 'stale': return { o: { kind: 'failed', message: t(`stale.${res.why}`, { to }) }, title: t('refused.title') };
    case 'refused': return { o: { kind: 'failed', message: `${t(refusalKey(res.code, res.reason) as 'why.other')} ${t('refused.nothingWritten')}` }, title: t('refused.title') };
  }
}

const UNKNOWN: OutcomeLike = { kind: 'pending' };
type FileAsk = { mode: 'file' | 'dir'; path: string };
/** While a copy of this kind to the plan's target (in its realm) is unknown, Copy is off: Check again or a preview that
 *  reads every path it may have written comes first (no resend over an unknown). */
const heldFor = (mine: readonly UnknownCopy[], plan: { to: string; at: CopyAt }) => mine.some((u) => u.to === plan.to && u.realm === plan.at.realm);
/** The words of a copy's leave toast, fixed when it is sent. */
const toastOf = (t: T, subject: 'login.subject' | 'files.subject', to: string) => ({ title: t('toast.title', { subject: t(subject, { to }) }), body: t('toast.body'), check: t('check') });
/** A sign-in preview, parsed once: the answer and its plan (null when it planned nothing). */
const loginAsk = (at: CopyAt, src: Source, to: string) => async () => {
  const r = await previewLogin(at, src, to);
  return { r, p: r.ok ? loginPlanOf(r.body) : null };
};
/** What a sign-in plan read on the target: the copy's settling read. */
const loginReadOf = (to: string, realm: string) => ({ p }: { p: LoginPlan | null }): TargetRead | null =>
  p ? { op: 'login', to, realm, rows: [{ path: p.targetPath, targetState: p.targetState }] } : null;
/** A settings preview of what was asked, parsed once. */
const filesAsk = (at: CopyAt, src: Source, to: string, ask: FileAsk) => async () => {
  const r = await previewFiles(at, src, to, ask);
  return { r, p: r.ok ? filesPlanOf(r.body) : null };
};
const filesReadOf = (to: string, realm: string) => ({ p }: { p: FilesPlan | null }): TargetRead | null =>
  p ? { op: 'files', to, realm, rows: p.files } : null;
/** Check again: the same read of the copy's captured target. */
const loginRead = (at: CopyAt, src: Source, to: string) => async () => loginReadOf(to, at.realm)(await loginAsk(at, src, to)());
const filesRead = (at: CopyAt, src: Source, to: string, ask: FileAsk) => async () => filesReadOf(to, at.realm)(await filesAsk(at, src, to, ask)());

/** The page's copies whose outcome is not known yet: one entry per apply, from its send until a definite answer or until
 *  reads have settled every path it may have written. Kept past settlement (state `settled`) so its notice unmounts never;
 *  it only stops showing, and its leave toast is retired rather than fired. */
/** The account's copies, live, and whether a drawer is open (the page's notices step aside while one is). */
interface Copies { list: readonly CopyRecord[]; drawerOpen: boolean; setDrawerOpen: (open: boolean) => void }
const CopiesCtx = createContext<Copies | null>(null);
function useCopies(): Copies {
  const c = useContext(CopiesCtx);
  if (!c) throw new Error('ClaudeTransfer outside ClaudeCopies');
  return c;
}
const unknownOf = (copies: Copies, op?: UnknownCopy['op']) => copies.list.filter((c) => (!op || c.op === op) && c.state === 'unknown');

/** Shows the account's unknown copies around the whole Claude Code section, above its loading, error and unavailable
 *  returns: under the section while no drawer is open. While it is attached the store holds no toasts. */
export function ClaudeCopies({ children }: { children: ReactNode }) {
  const t = useStrings(strings);
  const list = useSyncExternalStore(copyStore.subscribe, copyStore.get);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => copyStore.attach(), []);
  const shell = useShellData();
  const nameOf = (id: string) => shell.computers.find((c) => c.id === id)?.name ?? id;
  const value = useMemo(() => ({ list, drawerOpen, setDrawerOpen }), [list, drawerOpen]);
  return (
    <CopiesCtx.Provider value={value}>
      {children}
      {!drawerOpen && list.filter((c) => c.state === 'unknown').map((c) => <UnknownLine key={c.id} c={c} name={nameOf(c.to)} t={t} />)}
    </CopiesCtx.Provider>
  );
}

/** One drawer's own state: the footer note and the tokens already sent (marked before the send). */
function useCopyState() {
  const [note, setNote] = useState<Note | null>(null);
  const spent = useRef(new Set<string>());
  /** Marks the token spent; false when it already was (a second press: nothing is sent). */
  const spend = (token: string): boolean => {
    if (spent.current.has(token)) return false;
    spent.current.add(token);
    return true;
  };
  return { note, setNote, spend };
}

/** The plan is past its expiry margin now; turns true by itself when that moment comes. */
function useExpired(plan: { expiresMs: number } | null): boolean {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!plan) return;
    const ms = plan.expiresMs - EXPIRY_MARGIN_MS - Date.now();
    if (ms <= 0) return;
    const id = setTimeout(() => tick((n) => n + 1), Math.min(ms, 2_147_000_000));
    return () => clearTimeout(id);
  }, [plan]);
  return !!plan && expired(plan, Date.now());
}

/** One drawer's request in flight: an answer for a drawer that has since unmounted (another computer or realm) is dropped. */
function useAlive() {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return alive;
}

/** The footer: the last answer's line. */
function FooterOutcome({ note }: { note: Note | null }) {
  if (!note) return null;
  return (
    <Outcome
      // noDetails: the agent's copy refusal is already shown as its own reason words (refusalKey); providers.call keeps only a normalised outcome, no rejection to pass.
      variant="block"
      outcome={note.o}
      {...(note.title ? { title: note.title } : {})}
      detail={note.o.message}
    />
  );
}

/** One unknown copy's line (C9 words only). */
function UnknownLine({ c, name, t }: { c: CopyRecord; name: string; t: T }) {
  return (
    <Outcome
      // noDetails: a lost or unreadable answer has no rejection to show; C9 words only.
      variant="block"
      outcome={UNKNOWN}
      onCheck={() => copyStore.check(c.id)}
      title={t(c.op === 'login' ? 'pending.title.login' : 'pending.title.files')}
      detail={t(c.unreadable ? 'pending.unreadable' : 'pending.body', { to: name })}
    />
  );
}

/** An open drawer's unknown copies, of both kinds (the page's notices step aside while it is open). */
function UnknownCopies({ list, nameOf, t }: { list: readonly CopyRecord[]; nameOf: (id: string) => string; t: T }) {
  return <>{list.map((c) => <UnknownLine key={c.id} c={c} name={nameOf(c.to)} t={t} />)}</>;
}

// ── the sign-in ──────────────────────────────────────────────────────────────────────────────────

function LoginDrawer({ at, copies, isOpen, onClose, t }: { at: CopyAt; copies: Copies; isOpen: boolean; onClose: () => void; t: T }) {
  const e = useEnds(at, t);
  const alive = useAlive();
  const c = useCopyState();
  const unknown = unknownOf(copies);
  const mine = unknownOf(copies, 'login');
  const [plan, setPlan] = useState<{ p: LoginPlan; to: string; from: string; src: Source; at: CopyAt } | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const isExpired = useExpired(plan?.p ?? null);
  const drop = () => { setPlan(null); setConsent(false); c.setNote(null); };
  const to = e.ends.to;

  const preview = async () => {
    if (!to) return;
    setBusy('preview');
    c.setNote(null);
    // Settled in the store: a drawer gone before the answer changes nothing.
    const { r, p } = await copyStore.settle('login', to, at.realm, loginAsk(at, e.source, to), loginReadOf(to, at.realm));
    if (!alive.current) return;
    setBusy(null);
    if (p) { setPlan({ p, to, from: e.ends.from, src: e.source, at }); setConsent(false); }
    else c.setNote(previewNote(r, t, mine.some((u) => u.to === to) ? e.nameOf(to) : null));
  };
  const apply = async () => {
    if (!plan || !loginApplyable(plan.p, consent, Date.now())) return;
    const { p, to: dest, at: where, src } = plan;
    if (heldFor(mine, plan)) return;
    // The token is spent by this send, marked before it goes: the plan goes whatever the answer.
    if (!c.spend(p.token)) return;
    setBusy('apply');
    const ctx = copyCtx(where.target);
    const id = copyStore.begin({ op: 'login', to: dest, realm: where.realm, paths: [p.targetPath], toast: toastOf(t, 'login.subject', e.nameOf(dest)), check: loginRead(where, src, dest), ctx });
    setPlan(null);
    const r = await applyLogin(where, p.token, needsConsent(p.targetState) && consent, ctx);
    const res = applyResultOf(r, loginDoneOf);
    // The page's record of the copy is settled even when this drawer has gone (another computer chosen meanwhile).
    copyStore.end(id, res.kind === 'pending' ? (res.unreadable ? 'unreadable' : 'unknown') : 'settled');
    if (!alive.current) return;
    setBusy(null);
    setConsent(false);
    const toName = e.nameOf(dest);
    if (res.kind === 'pending') { c.setNote(null); return; }
    c.setNote(applyNote<LoginDone>(res, toName, t, (b) => t(b.overwrote ? 'login.doneReplaced' : 'login.done', { to: toName })
      + (b.ownerOnly ? '' : ` ${t('login.notOwnerOnly', { to: toName })}`)));
  };

  const showPlan = plan && !isExpired ? plan : null;
  const toName = e.nameOf(plan?.to ?? to);
  // Why a button is off, for the blockers nothing else names: no target computer (Preview), and a sign-in already on the
  // target (or one that could not be checked) that the person has not ticked to replace (Copy). An unknown earlier copy
  // (heldFor) is named by its own line above, so Copy stays plainly off for it.
  const needTo = busy === null && !to && !(e.toChoices.length === 0 && !e.toRead) ? t('need.to') : null;
  const needTick = showPlan && busy === null && !heldFor(mine, showPlan) && needsConsent(showPlan.p.targetState) && !consent
    ? t('need.consent', { to: toName }) : null;
  const previewLabel = t(plan || c.note || mine.length ? 'preview.again' : 'preview');
  const primary = showPlan ? (
    needTick !== null ? (
      <ReasonButton variant="primary" reason={needTick}>{t('login.copy')}</ReasonButton>
    ) : (
      <Button variant="primary" busy={busy === 'apply'} isDisabled={!loginApplyable(showPlan.p, consent, Date.now()) || heldFor(mine, showPlan)} onPress={() => void apply()}>{t('login.copy')}</Button>
    )
  ) : needTo !== null ? (
    <ReasonButton variant={plan || c.note || mine.length ? 'secondary' : 'primary'} reason={needTo}>{previewLabel}</ReasonButton>
  ) : (
    <Button variant={plan || c.note || mine.length ? 'secondary' : 'primary'} busy={busy === 'preview'} isDisabled={!to || busy !== null} onPress={() => void preview()}>{t(plan || c.note || mine.length ? 'preview.again' : 'preview')}</Button>
  );
  return (
    <Drawer resizeKey="ai-claude-login-copy" overlayId="claude-copy-login" isOpen={isOpen} onOpenChange={(o) => { if (!o) onClose(); }} title={t('login.title')} subtitle={t('login.subtitle')}
      size="sm" busy={busy !== null} primary={primary}
      outcome={<FooterOutcome note={c.note} />}>
      <UnknownCopies list={unknown} nameOf={e.nameOf} t={t} />
      <EndPickers e={e} onChange={drop} t={t} isDisabled={busy !== null} />
      {plan && isExpired && (
        <Band
          // noDetails: the sign-in preview ran out on this page's clock; nothing was sent, so there is no rejection.
          tone="warn"
        >
          {t('plan.expired')}
        </Band>
      )}
      {showPlan && (
        <>
          <SettingGroup>
            <SettingRow label={t('login.where', { path: showPlan.p.targetPath, to: toName })} help={t('login.size', { size: formatBytes(showPlan.p.bytes), from: e.nameOf(showPlan.from) })} />
          </SettingGroup>
          <CodeBlock label={t('login.outline')} code={showPlan.p.outline} wrap lang="plain" // reason: the copy plan's outline: masked file and field names with a fingerprint, a summary to read, not code
          />
          <Band
            // noDetails: what the target holds, read from a successful preview; advice before the copy, not a rejection.
            tone={needsConsent(showPlan.p.targetState) ? 'warn' : 'neutral'}
          >{t(`login.${showPlan.p.targetState}`, { to: toName })}</Band>
          {needsConsent(showPlan.p.targetState) && (
            <Checkbox label={t('login.consent', { to: toName })} isSelected={consent} onChange={setConsent} isDisabled={busy !== null} />
          )}
        </>
      )}
    </Drawer>
  );
}

// ── the settings ─────────────────────────────────────────────────────────────────────────────────

const col = createColumnHelper<FilePlanRow>();

/** The path of "Another file or folder" (kit PathField), relative to the home folder: typed, picked from the
 *  list or browsed below the agent's home folder on this computer (GET /sessions/cwds `home`), with the "@" picker's reads and
 *  fence (usePathReads). Copied from another computer, nothing is listed (only this computer's files are read here): the path
 *  is typed. A folder picked on the way to a file is not called wrong; the path sent is askedPath's. */
function CopyPath({ at, here, kind, path, onChange, isDisabled, t }: {
  at: CopyAt; here: boolean; kind: 'file' | 'dir'; path: string; onChange: (v: string) => void; isDisabled: boolean; t: T;
}) {
  const home = useFolders(here ? at.target : null, at.realm).home;
  const root = here ? home : null;
  const reads = usePathReads(root ? { target: at.target, folder: root } : null) ?? NO_PATH_READS;
  const bad = path !== '' && !pathOk(askedPath(kind, path)) && !onTheWay(kind, path);
  return (
    <PathField label={t('path')} mode={kind === 'file' ? 'file' : 'folder'} rootLabel={root} read={reads} value={path}
      description={!here ? t('path.elsewhere') : root ? t('path.helpHome') : t('path.help')}
      isRequired {...(bad ? { errorMessage: t('path.bad') } : {})} {...(isDisabled ? { isDisabled } : {})} onChange={(v) => onChange(v)} />
  );
}

function FilesDrawer({ at, copies, isOpen, onClose, t }: { at: CopyAt; copies: Copies; isOpen: boolean; onClose: () => void; t: T }) {
  const e = useEnds(at, t);
  const alive = useAlive();
  const [what, setWhat] = useState<'settings' | 'path'>('settings');
  const [kind, setKind] = useState<'dir' | 'file'>('file');
  const [path, setPath] = useState('');
  const c = useCopyState();
  const unknown = unknownOf(copies);
  const mine = unknownOf(copies, 'files');
  const [plan, setPlan] = useState<{ p: FilesPlan; to: string; src: Source; ask: FileAsk; at: CopyAt } | null>(null);
  const [consent, setConsent] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const isExpired = useExpired(plan?.p ?? null);
  const drop = () => { setPlan(null); setConsent(new Set()); c.setNote(null); };
  const to = e.ends.to;
  const wanted = askedPath(kind, path);
  const ask = what === 'settings' ? { mode: 'dir' as const, path: SETTINGS_DIR } : { mode: kind, path: wanted };
  const askOk = what === 'settings' || pathOk(wanted);

  const preview = async () => {
    if (!to || !askOk) return;
    setBusy('preview');
    c.setNote(null);
    const { r, p } = await copyStore.settle('files', to, at.realm, filesAsk(at, e.source, to, ask), filesReadOf(to, at.realm));
    if (!alive.current) return;
    setBusy(null);
    if (p) { setPlan({ p, to, src: e.source, ask, at }); setConsent(new Set()); }
    else c.setNote(previewNote(r, t, mine.some((u) => u.to === to) ? e.nameOf(to) : null));
  };
  const apply = async () => {
    if (!plan || !filesApplyable(plan.p, consent, Date.now())) return;
    const { p, to: dest, at: where, src, ask: asked } = plan;
    if (heldFor(mine, plan)) return;
    const overwrite = overwriteOf(p, consent);
    // The token is spent by this send, marked before it goes: the plan goes whatever the answer.
    if (!c.spend(p.token)) return;
    setBusy('apply');
    const ctx = copyCtx(where.target);
    const id = copyStore.begin({ op: 'files', to: dest, realm: where.realm, paths: writtenPathsOf(p, consent), toast: toastOf(t, 'files.subject', e.nameOf(dest)), check: filesRead(where, src, dest, asked), ctx });
    setPlan(null);
    const r = await applyFiles(where, p.token, overwrite, ctx);
    const res = applyResultOf(r, filesDoneOf);
    // The page's record of the copy is settled even when this drawer has gone (another computer chosen meanwhile).
    copyStore.end(id, res.kind === 'pending' ? (res.unreadable ? 'unreadable' : 'unknown') : 'settled');
    if (!alive.current) return;
    setBusy(null);
    setConsent(new Set());
    const toName = e.nameOf(dest);
    if (res.kind === 'pending') { c.setNote(null); return; }
    c.setNote(applyNote<FilesDone>(res, toName, t, (b) => t('files.done', { count: b.written.length, to: toName })
      + (b.skipped.length ? ` ${t('files.skipped', { count: b.skipped.length, paths: b.skipped.join(', ') })}` : '')));
  };

  const showPlan = plan && !isExpired ? plan : null;
  const toName = e.nameOf(plan?.to ?? to);
  const flip = (p: string, on: boolean) => setConsent((c) => { const n = new Set(c); if (on) n.add(p); else n.delete(p); return n; });
  const columns = useMemo(() => [
    col.accessor('path', { header: t('col.path') }),
    col.accessor('size', { header: t('col.size'), cell: (c) => formatBytes(c.getValue()) }),
    col.accessor('targetState', { header: t('col.there', { to: toName }), cell: (c) => t(`there.${c.getValue()}`) }),
    col.display({
      id: 'replace',
      header: t('col.replace'),
      cell: (c) => (needsConsent(c.row.original.targetState)
        ? <Checkbox aria-label={t('replace', { path: c.row.original.path })} isSelected={consent.has(c.row.original.path)} isDisabled={busy !== null} onChange={(on) => flip(c.row.original.path, on)} />
        : null),
    }),
  ], [t, toName, consent, busy]);

  const n = showPlan ? writesOf(showPlan.p, consent) : 0;
  // Why Preview is off, for the blockers no field names by itself: no target computer, an empty path, a folder picked
  // where a file is asked. A path that is wrong is said at the field (path.bad), so the button stays plainly off for it.
  const need = busy !== null ? null
    : !to ? (e.toChoices.length === 0 && !e.toRead ? null : t('need.to'))
      : what !== 'path' || askOk ? null
        : path === '' ? t('need.path')
          : onTheWay(kind, path) ? t('need.file') : null;
  const previewLabel = t(plan || c.note || mine.length ? 'preview.again' : 'preview');
  const primary = showPlan ? (
    <Button variant="primary" busy={busy === 'apply'} isDisabled={!filesApplyable(showPlan.p, consent, Date.now()) || heldFor(mine, showPlan)} onPress={() => void apply()}>{t('files.copy', { count: n })}</Button>
  ) : need !== null ? (
    <ReasonButton variant={plan || c.note || mine.length ? 'secondary' : 'primary'} reason={need}>{previewLabel}</ReasonButton>
  ) : (
    <Button variant={plan || c.note || mine.length ? 'secondary' : 'primary'} busy={busy === 'preview'} isDisabled={!to || !askOk || busy !== null} onPress={() => void preview()}>{t(plan || c.note || mine.length ? 'preview.again' : 'preview')}</Button>
  );
  return (
    <Drawer resizeKey="ai-claude-files-copy" overlayId="claude-copy-files" isOpen={isOpen} onOpenChange={(o) => { if (!o) onClose(); }} title={t('files.title')} subtitle={t('files.subtitle')}
      size="md" busy={busy !== null} primary={primary}
      outcome={<FooterOutcome note={c.note} />}>
      <UnknownCopies list={unknown} nameOf={e.nameOf} t={t} />
      <EndPickers e={e} onChange={drop} t={t} isDisabled={busy !== null} />
      <RadioGroup label={t('what')} value={what} isDisabled={busy !== null} onChange={(v) => { setWhat(v); drop(); }}
        options={[{ value: 'settings', label: t('what.settings'), description: t('what.settingsNote') }, { value: 'path', label: t('what.path') }]} />
      {what === 'path' && (
        <>
          <RadioGroup label={t('kind')} orientation="horizontal" value={kind} isDisabled={busy !== null} onChange={(v) => { setKind(v); drop(); }}
            options={[{ value: 'file', label: t('kind.file') }, { value: 'dir', label: t('kind.dir') }]} />
          <CopyPath at={at} here={e.source.kind === 'host'} kind={kind} path={path} isDisabled={busy !== null} t={t}
            onChange={(v) => { setPath(v); drop(); }} />
        </>
      )}
      {plan && isExpired && (
        <Band
          // noDetails: the files preview ran out on this page's clock; nothing was sent, so there is no rejection.
          tone="warn"
        >
          {t('plan.expired')}
        </Band>
      )}
      {showPlan && (
        <>
          <SettingGroup>
            <SettingRow label={t('files.label')} help={t('files.summary', { count: showPlan.p.files.length, size: formatBytes(showPlan.p.totalBytes) })} />
          </SettingGroup>
          {showPlan.p.files.some((f) => needsConsent(f.targetState)) && <Band tone="neutral">{t('files.consentNote')}</Band>}
          <DataTable label={t('files.label')} data={showPlan.p.files} columns={columns} getRowId={(f) => f.path} fill={false} bare noViewMenu />
          {n === 0 && (
            <Band
              // noDetails: no file would be written with the current ticks; a page fact, not a rejection.
              tone="warn"
            >
              {t('files.nothing', { to: toName })}
            </Band>
          )}
        </>
      )}
    </Drawer>
  );
}
