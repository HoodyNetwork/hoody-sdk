// Open with's drawer and the Preview's "Open in ‹Top›": the one surface every
// Files entry point mounts (pages/apps/links.ts useOpenWithEntry), loaded on demand.
//
// Contract, in plain words:
//   - Every launch is a plan from planFor and a start through useOpenWith (claim, list, send): this file never builds
//     a request (toLaunch is called by useOpenWith only), never sends a probe itself (useProbes), and offers a row only
//     when planFor accepts it (Run in a terminal: a regular file with its execute bit).
//   - A program row is offered once its check found it; rows past the check budget sit under More programs, where a
//     press is allowed (the exec decides). An absent program is not offered. A screen row stays enabled when the
//     screen is not confirmed, with one note.
//   - A listed launch is followed in place: its words are the row's (wordsFor), and once it has a place (terminal or
//     display N) the page goes to its program's board on this computer, keyed. Where the Board is not served
//     here or can't address the place, nothing navigates: "Open in a new tab" with the kit address.
//   - A refusal keeps the person here with the words why. Held: Check reads (never sends) or, for a hold no row shows,
//     the warned Remove hold. Running: Show it, or Open another. After a hand-off: start again only when asked.
//   - The remembered choice (remember.ts) is set only from this drawer's checkbox, only for a template or Other
//     command on a file; a stored one is planned again when used, and a template no longer found is said.
import { capture, heldAttempts, hostEnv, useCan, type Target } from '@core';
import { Button, Checkbox, Disclosure, Drawer, LinkButton, RadioGroup, SettingGroup, SettingRow, Spinner, SubSection, Tag, TextField, Verdict, VerdictMark, useGo, usePageLink, useStrings, type Translate } from '@kit';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { boardAddPath } from '../../../board/links';
import type { OpenApp } from '../../logic';
import { boardOffer, programBoard, tileFits } from '../../parts/board';
import { isOpening, liveCheck } from '../../parts/live';
import { merge, useOps } from '../../parts/ops';
import { AppLauncher } from '../AppLauncher';
import { placementOf, runAt, type Placement } from '../placement';
import { CMD_MAX_BYTES, utf8Bytes } from './argv';
import { owText, type Words } from './facts';
import { lockOf, removeUnlisted, subjectOf } from './ledger';
import { planFor, type Entry, type PlanInput, type PlanReason, type ScriptPlan } from './plan';
import { useProbes, type ProbeRow, type Probes } from './probes';
import { choiceFor, typeOf, useRemembered, type Choice } from './remember';
import { templateById, type Template, type TemplateId } from './templates';
import { kindOf } from './types';
import { studioUrlFor } from './sqlite';
import { watchEnd } from './ends';
import { useOpenWith, type OwOutcome } from './useOpenWith';
import s from './openWith.module.css';
import strings from './strings.en.json';

const EXEC = 'computers.actions.exec';
/** At most this many found programs show before More programs (in the default order). */
const SHOWN_MAX = 6;

/** A file or folder as Files hands it over. `label` is its name already made safe (Files safeLabel); `name` the raw
 *  name, used only to tell its kind and remembered type. */
export interface OwFile {
  readonly path: string;
  readonly name: string;
  readonly label: string;
  readonly type: Entry['type'];
  readonly exec?: boolean | null;
  /** True when Files did not know the entry's kind and `type` is its guess ('file' for a non-folder): programs take
   *  the guess (the exec decides), SQLite Studio does not (it opens regular files only). */
  readonly typeGuessed?: boolean;
}
/** One of Files' own ways in this browser (Preview, Open in viewer, Download, Open in editor). */
export interface OwBrowserAction {
  readonly id: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly isDisabled?: boolean;
}
/** What the drawer was opened for. */
export type OwAsk =
  | { kind: 'choose'; file: OwFile; decodedText?: boolean; browser?: readonly OwBrowserAction[] }
  /** One template at once (the Preview's Open in ‹Top›). */
  | { kind: 'tpl'; file: OwFile; tpl: TemplateId; decodedText?: boolean }
  /** The remembered choice of the file's type (the row menu's Open in ‹Last used›). */
  | { kind: 'last'; file: OwFile }
  | { kind: 'run'; file: OwFile }
  | { kind: 'here'; dir: OwFile }
  | { kind: 'apphere'; dir: OwFile };

/** Where the person was when they picked the entry point (Files' row menu, Run here, the Preview's Open in ‹Top›):
 *  the context generation and the address, taken at that press, before the drawer's chunk or any check loads. */
export type OwPressedAt = { readonly gen: number; readonly href: string };

export interface OpenWithProps {
  target: Target;
  ask: OwAsk;
  onClose: () => void;
  /** The entry point's press (the landing fence): a one-program ask lands only while this still holds. Without it, the mount. */
  pressedAt?: OwPressedAt;
}

type T = Translate<typeof strings>;
type Press = { plan: PlanInput; program: string; remember?: { tpl?: TemplateId; text?: string; opens?: 'terminal' | 'screen' } };
type Fence = { gen: number; href: string; cid: string };
type Shown =
  | { k: 'idle' }
  | { k: 'pressed'; program: string }
  | { k: 'listed'; key: string }
  | { k: 'out'; out: Exclude<OwOutcome, { kind: 'listed' }>; pick: Press; plan: ScriptPlan }
  | { k: 'said'; text: string };

const entryOf = (f: OwFile): Entry => ({ path: f.path, type: f.type, ...(f.exec !== undefined ? { exec: f.exec } : {}) });
const fileOf = (a: OwAsk): OwFile => ('file' in a ? a.file : a.dir);
const decodedOf = (a: OwAsk): boolean => ('decodedText' in a && !!a.decodedText);

/** The words of a plan planFor refused. */
function refusedText(t: T, why: PlanReason, program: string): string {
  if (why === 'collision') return t('r.collision');
  if (why === 'name_refused') return t('ow.chooser.nameRefused', { p: program });
  if (why === 'cmd_too_long') return t('ow.chooser.cmdTooLong', { n: CMD_MAX_BYTES });
  if (why === 'cmd_empty') return t('ow.chooser.cmdEmpty');
  if (why === 'not_executable') return t('ow.chooser.notExecutable');
  return t('ow.chooser.pathRefused');
}

/** The template row of the found or still unchecked programs, in the default order, with the path a press runs. */
function exeOf(r: ProbeRow, t: Template): string | null {
  if (r.state === 'found') return r.exe ?? null;
  // Past the budget or a failed check: the press is allowed, the first checked path runs and the exec decides.
  if (r.state === 'unchecked' || r.state === 'failed') return t.probe[0] ?? null;
  return null;
}

/** The Preview's top program: the remembered template if found, else the first found in the default order, once
 *  every program before it answered. 'checking' while that is not known; null when nothing can be the top. */
export function topOf(p: Pick<Probes, 'rows' | 'checking' | 'launcher'>, chosen: Choice | null): ProbeRow | 'checking' | null {
  if (p.launcher === null || p.launcher === 'failed') return null;
  const busy = p.checking || p.launcher === 'checking';
  if (chosen?.k === 'tpl') {
    const r = p.rows.find((x) => x.tpl === chosen.id);
    if (r?.state === 'found' && r.exe) return busy ? 'checking' : r;
  }
  for (const r of p.rows) {
    if (r.state === 'found' && r.exe) return busy ? 'checking' : r;
    if (r.state === 'absent') continue;
    // Unchecked or failed before any found one: still checking, or a partial result (nothing then).
    return busy ? 'checking' : null;
  }
  return busy ? 'checking' : null;
}

/** The Preview's "Open in ‹Top›": shown once the top template's check found it; a small placeholder while checking;
 *  nothing on a failure or a partial result. Never Run in a terminal. */
export function OpenTop({ target, file, decodedText, onOpen }: { target: Target; file: OwFile; decodedText: boolean; onOpen: (tpl: TemplateId) => void }) {
  const t = useStrings(strings);
  const exec = useCan(EXEC);
  const kind = kindOf(file.name, { dir: file.type === 'dir', decodedText });
  const { doc } = useRemembered(target.container.id);
  const chosen = choiceFor(doc, typeOf(file.name, { decodedText }));
  const studio = studioUrlFor(target, file);
  const probes = useProbes({ computer: target, kind, enabled: exec && file.type === 'file' && !studio });
  // A database opens in SQLite Studio: no exec, no launcher, no probe. One the studio can't take keeps the programs.
  if (studio) return <LinkButton variant="secondary" icon="database" href={studio} iconEnd="external">{t('ow.sqlite.open')}</LinkButton>;
  if (!exec || file.type !== 'file') return null;
  const top = topOf(probes, chosen);
  if (top === 'checking') return <Spinner label={t('ow.chooser.topChecking')} />;
  const tpl = top ? templateById(top.tpl) : undefined;
  if (!top || !tpl || !planFor({ p: 'tpl', tpl: tpl.id, entry: entryOf(file), exe: top.exe ?? '' }).ok) return null;
  return (
    <Button variant="secondary" icon={tpl.opens === 'screen' ? 'display' : 'terminal'} onPress={() => onOpen(tpl.id)}>
      {t('ow.chooser.openIn', { p: tpl.name })}
    </Button>
  );
}

/** The same reading as the entry's press (pages/apps/links.ts owHere; that file loads this chunk on demand, so each keeps its
 *  own copy): a web page's address; in a terminal the host's route, else ''. */
const owHere = (): string => (hostEnv().browserPage === true ? window.location.href : hostEnv().pageRoute ?? '');

export default function OpenWith({ target, ask: given, onClose, pressedAt }: OpenWithProps) {
  const t = useStrings(strings);
  const go = useGo();
  const board = usePageLink('board');
  const served = board !== null;
  const [ask, setAsk] = useState<OwAsk>(given);
  const file = fileOf(ask);
  const dir = file.type === 'dir';
  const decoded = decodedOf(ask);
  const kind = kindOf(file.name, { dir, decodedText: decoded });
  const type = typeOf(file.name, { dir, decodedText: decoded });
  const cid = target.container.id;
  const exec = useCan(EXEC);
  const probes = useProbes({ computer: target, kind, enabled: exec && ask.kind !== 'apphere' });
  const mem = useRemembered(cid);
  const chosen = choiceFor(mem.doc, type);
  const ow = useOpenWith({ target });
  const snap = useOps();
  const rows = useMemo(() => merge(undefined, snap), [snap]);
  const [shown, setShown] = useState<Shown>({ k: 'idle' });
  const [always, setAlways] = useState<boolean | null>(null);
  const alwaysOn = always ?? !!chosen;
  const [cmd, setCmd] = useState('');
  const [cmdOpens, setCmdOpens] = useState<'terminal' | 'screen'>('terminal');
  const [asking, setAsking] = useState(false);
  const [checking, setChecking] = useState(false);
  const landed = useRef(new Set<string>());
  const autoRan = useRef(false);
  // The landing fence: navigation only while the press's context is alive, the drawer is still on that computer and the address has
  // not changed since the press (a folder change in Files moves it). Otherwise the status offers Show it.
  const pressAt = useRef<Fence | null>(null);
  const [fenced, setFenced] = useState(false);
  const fenceHere = (): Fence => ({ gen: capture().gen, href: owHere(), cid });
  const fenceOk = (f: Fence | null): boolean => !!f && capture().gen === f.gen && owHere() === f.href && f.cid === cid;
  // The entry point's own press: a one-program ask (Top, Last used, Run, Terminal here) starts by itself once its
  // checks allow, and lands only while the place the person pressed it from still holds, however long that took.
  const entryAt = useRef<Fence>(pressedAt ? { gen: pressedAt.gen, href: pressedAt.href, cid } : fenceHere());
  // Launch an app here: opened from Files, the entry's press; opened from the chooser, when that panel opens.
  useEffect(() => { if (ask.kind === 'apphere') pressAt.current = ask === given ? entryAt.current : fenceHere(); }, [ask.kind]); // eslint-disable-line react-hooks/exhaustive-deps -- once per panel
  const [appOut, setAppOut] = useState<{ text: string; href?: string } | null>(null);
  const appN = useRef(0);
  const launcher = probes.launcher;
  const launcherReady = typeof launcher === 'object' && launcher !== null;

  const row: OpenApp | undefined = shown.k === 'listed' ? rows.find((r) => r.key === shown.key) : shown.k === 'out' && 'key' in shown.out && shown.out.key ? rows.find((r) => r.key === (shown.out as { key?: string }).key) : undefined;
  const run = row ? snap.runs.get(row.key) : undefined;
  const at: Placement | undefined = row && shown.k === 'listed' ? placementOf(row, run, isOpening(row.key)).now : undefined;
  const keyed = row ? programBoard(row) : undefined;
  const fits = !!at && tileFits(target, at);
  const landTo = at && fits && served && keyed && at.kind !== 'port' ? boardAddPath(target, { kind: at.kind, session: at.session, board: keyed }) : '';

  // A listed launch with a place lands once on its program board; the Board replaces the address at once, so
  // Back returns to this folder.
  useEffect(() => {
    if (!landTo || !row || landed.current.has(row.key)) return;
    landed.current.add(row.key);
    if (fenceOk(pressAt.current)) go(landTo);
    else setFenced(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per launch; the fence reads the press's capture
  }, [landTo, row, go]);

  // What a launch's end says about discovery (the probe cache) is watched for the launch's life (ends.ts), not the drawer's.

  /** Plans, remembers when asked, and starts one launch. `at`: the press it lands for (the chooser's: now). */
  async function press(pick: Press, at?: Fence) {
    if (shown.k === 'pressed') return;
    const planned = planFor(pick.plan);
    if (!planned.ok) return setShown({ k: 'said', text: refusedText(t, planned.reason, pick.program) });
    const plan = planned.plan;
    if (plan.p === 'apphere') return;
    if (pick.remember && type) {
      if (alwaysOn && ask.kind === 'choose') mem.keep(type, { p: plan.p, target: 'file', ...pick.remember });
      else if (chosen && ask.kind !== 'choose') mem.used(type);
    }
    setShown({ k: 'pressed', program: pick.program });
    pressAt.current = at ?? fenceHere();
    setFenced(false);
    const out = await ow.start(plan, { launcher: launcherReady ? launcher : launcher === null ? null : undefined, program: pick.program, label: `${pick.program} · ${file.label}` });
    if (out.kind === 'listed') { watchEnd(out.key, target); setShown({ k: 'listed', key: out.key }); }
    else setShown({ k: 'out', out, pick, plan });
  }

  const tplPick = (tp: Template, exe: string): Press => ({ plan: { p: 'tpl', tpl: tp.id, entry: entryOf(file), exe }, program: tp.name, remember: { tpl: tp.id } });
  const cmdPick = (text: string, opens: 'terminal' | 'screen'): Press => ({ plan: { p: 'cmd', text, entry: entryOf(file), opens }, program: t('ow.chooser.cmdName'), remember: { text, opens } });
  const runPick = (): Press => ({ plan: { p: 'run', entry: entryOf(file) }, program: t('ow.chooser.runName') });
  const herePick = (): Press => ({ plan: { p: 'here', entry: entryOf(file) }, program: t('ow.chooser.hereName') });

  // A one-program ask (Top, Last used, Run, Terminal here) starts once its checks allow, and says why it can't.
  const auto: { pick: Press } | { said: string } | 'wait' | null = (() => {
    if (ask.kind === 'choose' || ask.kind === 'apphere') return null;
    if (!exec) return { said: t('w.execOff') };
    if (launcher === 'checking') return 'wait';
    if (launcher === null) return { said: t('w.noBash') };
    if (launcher === 'failed') return { said: t('ow.chooser.launcherFailed') };
    if (ask.kind === 'run') return { pick: runPick() };
    if (ask.kind === 'here') return { pick: herePick() };
    const c: Choice | null = ask.kind === 'tpl' ? { k: 'tpl', id: ask.tpl } : chosen;
    if (!c) return { said: t('ow.chooser.nothingKept') };
    if (c.k === 'cmd') return { pick: cmdPick(c.text, c.opens) };
    const tp = templateById(c.id);
    const r = probes.rows.find((x) => x.tpl === c.id);
    if (!tp) return { said: t('ow.chooser.gone', { p: c.id }) };
    if (r?.state === 'found' && r.exe) return { pick: tplPick(tp, r.exe) };
    if (probes.checking) return 'wait';
    if (!r || r.state === 'absent') return { said: t('ow.chooser.gone', { p: tp.name }) };
    const exe = exeOf(r, tp);
    return exe ? { pick: tplPick(tp, exe) } : { said: t('ow.chooser.gone', { p: tp.name }) };
  })();
  const autoKey = auto === null ? '' : auto === 'wait' ? 'wait' : 'said' in auto ? 'said:' + auto.said : 'go';
  useEffect(() => {
    if (!auto || auto === 'wait' || autoRan.current) return;
    autoRan.current = true;
    if ('said' in auto) setShown({ k: 'said', text: auto.said });
    else void press(auto.pick, entryAt.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the checks allow
  }, [autoKey]);

  const title = (() => {
    switch (ask.kind) {
      case 'choose': return t('ow.chooser.title', { file: file.label });
      case 'run': return t('ow.chooser.titleRun', { file: file.label });
      case 'here': return t('ow.chooser.titleHere', { file: file.label });
      case 'apphere': return t('ow.chooser.titleAppHere', { file: file.label });
      default: return t('ow.chooser.titleOne', { file: file.label });
    }
  })();

  // ── What the last press shows ─────────────────────────────────────────────────────────────────────────────
  const offer = row ? boardOffer(row, run, target, isOpening(row.key)) : null;
  const showTo = offer && 'to' in offer && served ? offer.to : null;
  const newTab = row && at && (!fits || !served) ? (at.kind === 'display' ? row.urls.screen : row.urls.terminal) : undefined;
  const check = row ? (
    <Button size="sm" busy={checking} onPress={() => { setChecking(true); void liveCheck(ow.live, row.key).finally(() => setChecking(false)); }}>
      {t('ow.chooser.check')}
    </Button>
  ) : null;

  async function removeHold(plan: ScriptPlan) {
    const ctx = capture(target);
    const subject = await subjectOf({ account: ctx.account ?? '', project: target.project.id, computer: cid, plan }).catch(() => null);
    const h = subject ? heldAttempts(lockOf(cid, subject))[0] : undefined;
    const r = h ? await removeUnlisted(h) : 'freed';
    setAsking(false);
    setShown({ k: 'said', text: r === 'freed' ? t('ow.chooser.holdRemoved') : t('ow.chooser.holdKept') });
  }

  let status: ReactNode = null;
  if (shown.k === 'pressed') status = <Said>{owText({ key: 'w.opening', vars: { p: shown.program } })}</Said>;
  else if (shown.k === 'said') status = <Said>{shown.text}</Said>;
  else if (shown.k === 'listed') {
    const words = row ? ow.wordsOf(row) : null;
    status = (
      <div className={s.statusBox}>
        <Said>{words ? owText(words) : t('ow.chooser.listed')}</Said>
        <div className={s.actions}>
          {row?.state === 'unknown' ? check : null}
          {row && (!landTo || fenced) && showTo ? <Button size="sm" onPress={() => go(showTo)}>{t('ow.chooser.show')}</Button> : null}
          {newTab ? <LinkButton size="sm" href={newTab} iconEnd="external">{t('ow.chooser.newTab')}</LinkButton> : null}
        </div>
      </div>
    );
  } else if (shown.k === 'out') {
    const { out, pick, plan } = shown;
    const words: Words | null = 'words' in out ? out.words : null;
    const text = words ? owText(words) : t(out.kind === 'dropped' && out.kept ? 'ow.chooser.droppedKept' : 'ow.chooser.dropped');
    const kept = (out.kind === 'held' || out.kind === 'running') && out.kept ? t('ow.chooser.kept') : null;
    status = (
      <div className={s.statusBox}>
        <Said>{text}{kept ? ` ${kept}` : ''}</Said>
        {asking ? <p className={s.status}>{t('r.removeHoldAsk')}</p> : null}
        <div className={s.actions}>
          {out.kind === 'held' && out.key ? check : null}
          {out.kind === 'held' && !out.key && !asking ? <Button size="sm" variant="ghost" onPress={() => setAsking(true)}>{t('r.removeHold')}</Button> : null}
          {out.kind === 'held' && !out.key && asking ? (
            <>
              <Button size="sm" variant="secondary" tone="danger" onPress={() => void removeHold(plan)}>{t('ow.chooser.removeHoldYes')}</Button>
              <Button size="sm" variant="ghost" onPress={() => setAsking(false)}>{t('ow.chooser.cancel')}</Button>
            </>
          ) : null}
          {out.kind === 'running' && showTo ? <Button size="sm" onPress={() => go(showTo)}>{t('ow.chooser.showIt')}</Button> : null}
          {out.kind === 'running' ? <Button size="sm" onPress={() => void startAgain(pick, plan, { another: true })}>{t('ow.chooser.another')}</Button> : null}
          {out.kind === 'ask' ? <Button size="sm" variant="primary" onPress={() => void startAgain(pick, plan, { again: true })}>{t('ow.chooser.again')}</Button> : null}
        </div>
      </div>
    );
  }

  async function startAgain(pick: Press, plan: ScriptPlan, more: { another?: boolean; again?: boolean }) {
    setShown({ k: 'pressed', program: pick.program });
    pressAt.current = fenceHere();
    setFenced(false);
    const out = await ow.start(plan, { launcher: launcherReady ? launcher : null, program: pick.program, label: `${pick.program} · ${file.label}`, ...more });
    if (out.kind === 'listed') { watchEnd(out.key, target); setShown({ k: 'listed', key: out.key }); }
    else setShown({ k: 'out', out, pick, plan });
  }

  // ── The chooser's rows ──────────────────────────────────────────────────────────────────────────────────────
  const busy = shown.k === 'pressed';
  const canLaunch = exec && launcherReady && !busy;
  const offered = probes.rows.flatMap((r) => {
    const tp = templateById(r.tpl);
    const exe = tp ? exeOf(r, tp) : null;
    if (!tp || !exe || !planFor({ p: 'tpl', tpl: tp.id, entry: entryOf(file), exe }).ok) return [];
    return [{ r, tp, exe }];
  });
  // The remembered template first (★ last used), then the default order.
  const ordered = chosen?.k === 'tpl' ? [...offered.filter((x) => x.tp.id === chosen.id), ...offered.filter((x) => x.tp.id !== chosen.id)] : offered;
  const found = ordered.filter((x) => x.r.state === 'found');
  const top = found.slice(0, SHOWN_MAX);
  const more = [...found.slice(SHOWN_MAX), ...ordered.filter((x) => x.r.state !== 'found')];
  // One program per setting row: its name, a Last used tag on the remembered one, and Open at the row's end.
  const programRow = (x: (typeof offered)[number]) => (
    <SettingRow
      key={x.tp.id}
      label={
        <>
          {x.tp.name}
          {chosen?.k === 'tpl' && chosen.id === x.tp.id ? <> <Tag>{t('ow.chooser.lastUsedTag')}</Tag></> : null}
        </>
      }
      actions={
        <Button variant="ghost" size="sm" icon={x.tp.opens === 'screen' ? 'display' : 'terminal'} isDisabled={!canLaunch} aria-label={t('ow.chooser.openIn', { p: x.tp.name })} onPress={() => void press(tplPick(x.tp, x.exe))}>
          {t('ow.chooser.open')}
        </Button>
      }
    />
  );
  const programs = (heading: string, list: typeof offered) => (
    <SubSection title={heading} state={{ kind: 'ready' }}>
      <SettingGroup label={heading}>{list.map(programRow)}</SettingGroup>
    </SubSection>
  );
  const runOk = !dir && planFor({ p: 'run', entry: entryOf(file) }).ok;
  const cmdBytes = utf8Bytes(cmd);

  const notes: string[] = [];
  if (!exec) notes.push(t('w.execOff'));
  else if (launcher === null) notes.push(t('w.noBash'));
  else if (launcher === 'failed') notes.push(t('ow.chooser.launcherFailed'));
  if (probes.screen === 'unconfirmed' && offered.some((x) => x.tp.opens === 'screen')) notes.push(t('ow.chooser.noScreen'));

  let body: ReactNode;
  if (ask.kind === 'apphere') {
    body = appOut ? (
      <div className={s.statusBox}>
        <Said>{appOut.text}</Said>
        <div className={s.actions}>
          {appOut.href ? <LinkButton size="sm" href={appOut.href} iconEnd="external">{t('ow.chooser.newTab')}</LinkButton> : null}
          <Button size="sm" variant="ghost" onPress={() => { pressAt.current = fenceHere(); setAppOut(null); }}>{t('ow.chooser.anotherApp')}</Button>
        </div>
      </div>
    ) : <AppLauncher key={`app-${appN.current}`} target={target} cwd={file.path} onPlaced={(p, key) => landApp(p, key)} />;
  } else if (ask.kind !== 'choose') {
    body = (
      <div className={s.stack}>
        {auto === 'wait' && shown.k === 'idle' ? <Said>{t('ow.chooser.checking')}</Said> : null}
        {status}
      </div>
    );
  } else {
    const term = top.filter((x) => x.tp.opens === 'terminal');
    const screen = top.filter((x) => x.tp.opens === 'screen');
    const studio = studioUrlFor(target, file);
    body = (
      <div className={s.stack}>
        {studio ? (
          <section className={s.section}>
            <h3 className={s.head}>{t('ow.sqlite.section')}</h3>
            <div className={s.row}>
              <LinkButton variant="secondary" icon="database" href={studio} iconEnd="external">{t('ow.sqlite.name')}</LinkButton>
              <span className={s.note}>{t('ow.sqlite.note')}</span>
            </div>
          </section>
        ) : null}
        {/* What stops or limits a start here, one verdict: the first reason marked, a display we couldn't confirm as its next line. */}
        {notes.length ? (
          <Verdict label={t('ow.chooser.verdict')} next={notes[1]}>
            <VerdictMark tone="warn">{notes[0]}</VerdictMark>
          </Verdict>
        ) : null}
        {status}
        {term.length ? programs(t('ow.chooser.inTerminal'), term) : null}
        {screen.length ? programs(t('ow.chooser.onScreen'), screen) : null}
        {probes.checking || launcher === 'checking' ? <Said quiet>{t('ow.chooser.checking')}</Said> : null}
        {more.length ? (
          <Disclosure title={t(probes.checking ? 'ow.chooser.moreUnchecked' : 'ow.chooser.more', { count: more.length })}>
            <SettingGroup label={t(probes.checking ? 'ow.chooser.moreUnchecked' : 'ow.chooser.more', { count: more.length })}>{more.map(programRow)}</SettingGroup>
          </Disclosure>
        ) : null}
        {runOk ? (
          <SubSection title={t('ow.chooser.runSection')} state={{ kind: 'ready' }}>
            <SettingGroup label={t('ow.chooser.runSection')}>
              <SettingRow
                label={t('ow.chooser.runName')}
                help={t('ow.chooser.runNote', { file: file.label })}
                actions={<Button variant="ghost" size="sm" icon="play" isDisabled={!canLaunch} aria-label={t('ow.chooser.runInTerminal')} onPress={() => void press(runPick())}>{t('ow.chooser.runName')}</Button>}
              />
            </SettingGroup>
          </SubSection>
        ) : null}
        {dir ? (
          <section className={s.section}>
            <h3 className={s.head}>{t('ow.chooser.folderSection')}</h3>
            <div className={s.actions}>
              <Button variant="ghost" icon="terminal" isDisabled={!canLaunch} onPress={() => void press(herePick())}>{t('ow.chooser.here')}</Button>
              <Button variant="ghost" icon="apps" isDisabled={!exec || busy} onPress={() => setAsk({ kind: 'apphere', dir: file })}>{t('ow.chooser.appHere')}</Button>
            </div>
          </section>
        ) : null}
        {/* Your own command is a section of its own: the kit has no reveal row for a setting group. */}
        <section className={s.section}>
          <h3 className={s.head}>{t('ow.chooser.ownSection')}</h3>
          <TextField
            label={t('ow.chooser.cmdLabel')}
            description={t(dir ? 'ow.chooser.cmdHelpDir' : 'ow.chooser.cmdHelp')}
            value={cmd}
            onChange={setCmd}
            mono
            errorMessage={cmdBytes > CMD_MAX_BYTES ? t('ow.chooser.cmdTooLong', { n: CMD_MAX_BYTES }) : undefined}
          />
          <RadioGroup
            label={t('ow.chooser.cmdOpens')}
            orientation="horizontal"
            value={cmdOpens}
            onChange={setCmdOpens}
            options={[{ value: 'terminal', label: t('ow.chooser.terminal') }, { value: 'screen', label: t('ow.chooser.screen') }]}
          />
          <div className={s.actions}>
            <Button size="sm" isDisabled={!canLaunch || !cmd.trim() || cmdBytes > CMD_MAX_BYTES} onPress={() => void press(cmdPick(cmd, cmdOpens))}>{t('ow.chooser.cmdRun')}</Button>
          </div>
        </section>
        {ask.browser?.length ? (
          <section className={s.section}>
            <h3 className={s.head}>{t('ow.chooser.browserSection')}</h3>
            <div className={s.actions}>
              {ask.browser.map((b) => <Button key={b.id} size="sm" variant="ghost" isDisabled={!!b.isDisabled} onPress={b.onPress}>{b.label}</Button>)}
            </div>
          </section>
        ) : null}
        {type ? (
          <div className={s.remember}>
            <Checkbox
              label={chosen ? t('ow.chooser.always', { p: chosen.k === 'tpl' ? (templateById(chosen.id)?.name ?? chosen.id) : t('ow.chooser.cmdName'), type: typeWords(t, type) }) : t('ow.chooser.alwaysPick', { type: typeWords(t, type) })}
              isSelected={alwaysOn}
              onChange={(on) => { setAlways(on); if (!on && chosen) mem.drop(type); }}
            />
            <PrefLine t={t} status={mem.status} changed={always !== null} />
          </div>
        ) : null}
      </div>
    );
  }

  /** Launch an app here placed its launch: its program board (`app:<name>`), keyed by its own row. Where that can't be
   *  (no Board here, a web port, a place the tile host can't address, the press's context or address moved), the
   *  launcher panel gives way to the words, the app's own address in a new tab, and Launch another app. */
  function landApp(p: Placement, ownKey: string) {
    // The launch the panel followed, by its own key: a place alone never names a launch (two apps can share a port).
    const own = rows.find((r) => r.key === ownKey);
    const st = own ? snap.runs.get(own.key) : undefined;
    const mine = own && own.computer === cid && own.p === 'apphere' && own.code !== 'terminal_left' && st && !st.left && runAt(st, cid, p) ? own : undefined;
    const key = mine ? programBoard(mine) : null;
    const to = served && key && p.kind !== 'port' && tileFits(target, p) ? boardAddPath(target, { kind: p.kind, session: p.session, board: key }) : '';
    if (to && fenceOk(pressAt.current)) return go(to);
    const href = !mine ? undefined : p.kind === 'port' ? mine.urls.web : p.kind === 'display' ? mine.urls.screen : mine.urls.terminal;
    appN.current += 1;
    setAppOut({ text: t('ow.chooser.placedElsewhere'), ...(href ? { href } : {}) });
  }

  return (
    <Drawer overlayId="apps-open-with" resizeKey="apps-open-with"
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={title}
      size="md"
      cancel={t('ow.chooser.close')}
      actions={ask.kind === 'choose' ? <Button size="sm" variant="ghost" icon="reload" onPress={probes.refresh}>{t('ow.chooser.refresh')}</Button> : undefined}
    >
      {ask.kind === 'apphere' ? <div className={s.stack}>{status}{body}</div> : body}
    </Drawer>
  );
}

const typeWords = (t: T, type: string): string => (type.startsWith('.') ? t('ow.chooser.typeExt', { ext: type }) : t('ow.chooser.typeKind'));

/** The checkbox's store line (usePrefStatus): Saving…, Saved, or why it was not saved. "Saved" only after a change here. */
function PrefLine({ t, status, changed }: { t: T; status: string; changed: boolean }) {
  const text =
    status === 'saving' || status === 'conflict' ? t('ow.chooser.saving')
      : status === 'unsaved' ? t('ow.chooser.unsaved')
        : status === 'oversized' ? t('ow.chooser.oversized')
          : status === 'locked' ? t('ow.chooser.locked')
            : status === 'ok' && changed ? t('ow.chooser.saved')
              : '';
  return text ? <Said quiet>{text}</Said> : null;
}
/** One status line of the drawer, read out when it changes. */
function Said({ children, quiet }: { children: ReactNode; quiet?: boolean }) {
  return <p className={quiet ? s.note : s.status} role="status">{children}</p>; // a one-line observation (never a change outcome: those are useOpenWith's words)
}
