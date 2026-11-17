// From GitHub: a github.com address, parsed strictly (github.ts parseRepo), the plain
// warning, then one run on the launcher's computer (run.ts: the agent on that computer clones, installs and starts
// it). The run's live steps, its approvals and questions answered in place, then the result with Put on Board and
// Open in a new tab. Nothing is sent before Start; one run per Start; leaving the pane or changing the computer ends
// this page's watch of the run (never the run itself). The run is held in core (held.ts) until a known end: after a
// reload or from another tab, a computer's unsettled run shows above the form as unknown with Check and the warned
// Dismiss, and a new run there is refused until it is settled. It needs only @ask/io (the agent's IO and Ask's
// pure rules), never the Ask dock, so it works while ASK_ENABLED is off.
// Error banners pass no error=: the agent's answers are Ask's shape, already worded by Ask's readView/errorView
// (so noDetails is accepted).
import { buildPortUrl, heldAttempts, useAttemptsVersion, useCore, type HeldAttempt, type Target } from '@core';
import { Band, Button, CardBody, CardFrame, CardHead, CodeBlock, InlineActions, LinkButton, OutcomeBanner, RadioGroup, Stack, TextField, cleanAgentText, followPageLink, scrubSecrets, shownText, useContainerNarrow, useGo, useServedPageLink, useShellData, usePageLink } from '@kit';
import { liveIO } from '@ask/io';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { boardAddPath } from '../../board/links';
import type { Placement } from '../launch/placement';
import { links as computerLinks } from '../../computers/links';
import type { Repo, Result } from '../github';
import { tileFits } from '../parts/board';
import { AddressCard, LibraryView, START, categoryTint, useLibrary, type Browse } from './Library';
import { readInput, type LibraryProgram } from './library';
import { AgentWayOut, BlockActions, Ready } from './Ready';
import { keyFor, readyOf } from './ready';
import { useLaunchComputer } from '../data';
import type { Apps } from '../launch/useApps';
import { BY, admitOn, heldHandle, lockFor } from './held';
import { GitHubRun, computerBlock, readMeta, type Block, type Freed, type RunHold, type Snapshot } from './run';
import g from './github.module.css';

type T = Apps['t'];
const noRun = { subscribe: () => () => undefined, getSnapshot: () => null };

export interface GitHubPaneProps {
  a: Apps;
  target?: Target | null | undefined;
  /** The Ready step's key (`gh=` in the address: a library id or owner/repo; ready.ts), when the host keeps it. Given
   *  with `onReady`, the host owns it (Programs keeps it in the URL); otherwise the pane keeps its own. */
  ready?: string | undefined;
  onReady?: (key: string | undefined, o?: { replace?: boolean }) => void;
  /** The host's column stands beside the host's own rail (a dialog): the narrow layout at any width, so the library
   *  draws no second rail, and the programs' marks are ink letters on the card's own ground. */
  compact?: boolean | undefined;
  /** The host draws the one box itself (the library's words or an address) and gives what it holds; the pane draws
   *  none. `onText` clears it (the library's own "clear the search"). */
  text?: string | undefined;
  onText?: ((text: string) => void) | undefined;
  /** How many programs the library holds, once it is read (the host's hint under its box). */
  onLibraryCount?: ((count: number) => void) | undefined;
}

/** How often a computer's status that holds Start back is read again. */
export const NOT_READY_POLL_MS = 5000;

export function GitHubPane({ a, target, ready: readyIn, onReady, compact, text: hostText, onText, onLibraryCount }: GitHubPaneProps) {
  const { t } = a;
  const core = useCore();
  const shell = useShellData();
  const on = target ?? a.live.target ?? null;
  const cid = on?.container.id ?? '';
  const computer = shell.computers.find((c) => c.id === cid)?.name || t('gh.thisComputer');
  // What the shell already knows against installing: the computer's status, by the run's own mapping. Only a read
  // that answered counts (a failed refresh keeps old data: it holds nothing back, the run's own check decides), and while
  // it says not ready it is read again, so Start comes back once the computer runs.
  const [watchStatus, setWatchStatus] = useState(false);
  const computerRead = useLaunchComputer(target, { refetchInterval: watchStatus ? NOT_READY_POLL_MS : false });
  const computerColor = computerRead.data?.color ?? null;
  const known = on && computerRead.data && !computerRead.isError ? computerBlock(computerRead.data.status) : null;
  const notReadyNow = !!known;
  useEffect(() => setWatchStatus(notReadyNow), [notReadyNow]);
  const [ownText, setOwnText] = useState('');
  const hostBox = hostText !== undefined;
  const text = hostText ?? ownText;
  const setText = (v: string) => (hostBox ? onText?.(v) : setOwnText(v));
  const input = readInput(text);
  const repo: Repo | null = input.kind === 'address' ? input.repo : null;
  // The library under the box: what is chosen there, the words in the box and the card opened last outlive a
  // pick, so Library returns to them.
  const library = useLibrary();
  const [browse, setBrowse] = useState<Browse>(START);
  const [here, setHere] = useState<string | undefined>(undefined);
  // Ready: its key, the host's or the pane's own; the card Library gives focus back to; where focus goes when
  // Ready opens (null for a key that came in by a link).
  const [readyOwn, setReadyOwn] = useState<string | undefined>(undefined);
  const readyKey = onReady ? readyIn : readyOwn;
  const setReady = (key: string | undefined, o?: { replace?: boolean }) => (onReady ? onReady(key, o) : setReadyOwn(key));
  const [cameFrom, setCameFrom] = useState<string | undefined>(undefined);
  const [focusOn, setFocusOn] = useState<'heading' | 'start' | null>(null);
  // A focus request for the card opened last: made by Library (back from an address) and dropped by the next edit or
  // browse, so a grid drawn again later (a search with no match, then one with) never takes focus from the box.
  const [focusReq, setFocusReq] = useState<string | undefined>(undefined);
  const paneRef = useRef<HTMLDivElement>(null);
  const measuredNarrow = useContainerNarrow(600, paneRef);
  const narrow = measuredNarrow || !!compact;
  const [run, setRun] = useState<Watch | null>(null);
  const [back, setBack] = useState<Back | null>(null);
  // Holds whose Dismiss is out: core hides a free in progress from its list, which is not "freed elsewhere".
  const dismissing = useRef(new Set<string>());
  const track = (id: string, p: Promise<Freed>): Promise<Freed> => {
    dismissing.current.add(id);
    return p.finally(() => dismissing.current.delete(id));
  };
  const src = run?.r ?? noRun;
  const snap = useSyncExternalStore(src.subscribe, src.getSnapshot, src.getSnapshot) as Snapshot | null;

  // This computer's held run that this page's own run does not hold: after a reload, or another tab's. A send out
  // from this tab is this page's own run, not yet named, unless it is the shown held run's own Check.
  useAttemptsVersion();
  const lock = on && core.account ? lockFor(on) : null;
  const ownId = run?.r.holdId() ?? null;
  const holds = lock ? heldAttempts(lock).filter((h) => h.by === BY) : [];
  const held: HeldAttempt | null = holds.find((h) => h.id !== ownId && (h.inFlight !== 'here' || h.id === back?.id)) ?? null;
  /** This page's own run's hold as core shows it (its Dismiss frees that version only). */
  const ownHeld = ownId ? (holds.find((h) => h.id === ownId) ?? null) : null;
  // The same for this page's own run: another tab saved its record since (a Check there), and it is idle here.
  const ownMoved = !!run && !!ownHeld && ownHeld.metaVersion !== run.r.holdVersion() && !!snap && snap.phase === 'unknown' && !snap.checking;
  useEffect(() => {
    if (!ownMoved || !run || !ownHeld || !core.account) return;
    const hold = heldHandle(ownHeld.id, ownHeld.metaVersion);
    const r = hold ? GitHubRun.resume(liveIO(run.on), { computer: run.on.container.id, account: run.account, realm: core.realm, admit: admitOn(run.on) }, { hold, meta: ownHeld.meta }) : null;
    if (r) setRun({ ...run, r });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ownMoved is the trigger; the rest is read when it turns on
  }, [ownMoved]);
  const heldId = held?.id ?? null;
  const bsrc = back?.r ?? noRun;
  const bsnap = useSyncExternalStore(bsrc.subscribe, bsrc.getSnapshot, bsrc.getSnapshot) as Snapshot | null;
  // Another tab saved the shown run since it was rebuilt (a newer step or key): an idle card is rebuilt from the
  // stored record, so its Check repeats what is stored now (its compare-and-set would refuse the old version).
  const moved = !!back && !!held && held.id === back.id && held.metaVersion !== back.hold.version() && (!bsnap || (bsnap.phase === 'unknown' && !bsnap.checking));
  useEffect(() => {
    if (!held || !on || !core.account || (back?.id === held.id && !moved)) {
      // Freed elsewhere (another tab's Check or Dismiss; this run did not free it): nothing left to show here.
      if (!held && back && !dismissing.current.has(back.id) && (!back.r || back.r.getSnapshot().held)) setBack(null);
      return;
    }
    const hold = heldHandle(held.id, held.metaVersion);
    if (!hold) return;
    const r = GitHubRun.resume(liveIO(on), { computer: on.container.id, account: core.account, realm: core.realm, admit: admitOn(on) }, { hold, meta: held.meta });
    const m = readMeta(held.meta);
    setBack({ id: held.id, v: held.metaVersion, r, hold, repo: m ? `${m.repo.owner}/${m.repo.name}` : '', on, account: core.account, gen: core.gen });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- heldId names the hold, moved its newer version; the rest is read when they change
  }, [heldId, back?.id, moved]);

  // A run belongs to the computer, account and realm generation it started on: another one ends this page's watch.
  useEffect(() => {
    const r = run?.r;
    return () => r?.end();
  }, [run]);
  useEffect(() => {
    const r = back?.r;
    return () => r?.end();
  }, [back]);
  useEffect(() => {
    const off = (w: { on: Target; account: string; gen: number } | null) => !!w && (w.on.container.id !== cid || w.account !== core.account || w.gen !== core.gen);
    if (off(run)) setRun(null);
    if (off(back)) setBack(null);
  }, [cid, core.account, core.gen, run, back]);

  const lib = library.state.kind === 'ready' ? library.state.lib : null;
  const libCount = lib ? lib.programs.length : null;
  useEffect(() => {
    if (libCount !== null) onLibraryCount?.(libCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per count; the host's callback is not a trigger
  }, [libCount]);
  const shown = readyOf(readyKey, library.state);
  // A key that names nothing (an id the library does not hold, an address that does not parse): the Library, in place.
  const noneKey = shown.kind === 'none' && !!readyKey;
  useEffect(() => {
    if (noneKey) setReady(undefined, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setReady is the host's or the pane's; noneKey is the trigger
  }, [noneKey]);
  const shownRepo = shown.kind === 'ready' ? shown.repo : null;

  function start() {
    if (!shownRepo || !on || !core.account) return;
    const r = new GitHubRun(liveIO(on), { computer: on.container.id, account: core.account, realm: core.realm, admit: admitOn(on) });
    setRun({ r, repo: shownRepo, on, account: core.account, gen: core.gen });
    r.start(shownRepo);
  }

  const backCard = back ? (
    back.r ? (
      <RunCard key={`${back.id}:${back.v}`} t={t} r={back.r} repo={back.repo} computer={computer} on={back.on} shown={held?.id === back.id ? held : null} track={track} onGone={() => setBack(null)} />
    ) : (
      <Unreadable key={back.id} t={t} computer={computer} hold={back.hold} shown={held?.id === back.id ? held : null} track={track} onGone={() => setBack(null)} />
    )
  ) : null;
  /** Ready for a key, from the card `from` (focus goes back to it), focusing its heading or Start. */
  const open = (key: string, from: string, focus: 'heading' | 'start') => {
    setFocusOn(focus);
    setCameFrom(from);
    setFocusReq(undefined);
    setReady(key);
  };
  const pick = (p: LibraryProgram) => {
    setHere(p.id);
    open(p.id, p.id, 'heading');
  };
  // A run of which nothing was sent (its checks out, or refused by them) stays on Ready: its reason in the
  // caution's place, Start to run the checks again. Anything sent (the create, a turn) is the run card.
  const preStart = !!run && !!snap && !snap.sent && !snap.held && (snap.phase === 'idle' || snap.phase === 'checking' || snap.phase === 'creating' || (snap.phase === 'blocked' && !!snap.block));
  // Leaving Ready (Library, or another key) drops such a run, decided by the run itself at that moment: one that went on
  // to send since this render keeps its watch.
  const dropUnsent = () => {
    if (run && run.r.abandonUnsent()) setRun(null);
  };
  useEffect(() => {
    dropUnsent();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key is the trigger
  }, [readyKey]);
  const notReady = (b: Block) => t(b.key === 'stopped' ? 'gh.notReady.stopped' : b.key === 'starting' ? 'gh.notReady.starting' : 'gh.notReady.computerFailed', { computer });
  const shownBlock = preStart && snap?.block ? { text: t(`gh.block.${snap.block.key}`, { computer }), notSent: true, act: snap.block, on } : known ? { text: notReady(known), act: known } : null;
  const backToLibrary = () => {
    dropUnsent();
    setFocusOn(null);
    setReady(undefined);
    setFocusReq(cameFrom);
  };
  // A pasted address is one card (Enter in the box, or a press on the card, opens Ready).
  const addressKey = repo ? keyFor(repo, lib) : '';
  // One element at one place whatever the step (the box and the library, Ready, or the run), observed for its width.
  return (
    <div className={g.pane} ref={paneRef}>
      {backCard}
      {run && snap && !preStart ? (
        <RunCard t={t} r={run.r} repo={`${run.repo.owner}/${run.repo.name}`} computer={computer} on={run.on} shown={ownHeld} track={track} again onGone={() => setRun(null)} />
      ) : shown.kind === 'ready' ? (
        <Ready
          key={readyKey}
          repo={shown.repo}
          program={shown.program}
          tint={shown.program && lib ? categoryTint(lib, shown.program.category) : undefined}
          computer={computer}
          computerColor={computerColor}
          canStart={!!on && !!core.account && !known}
          checking={preStart && snap?.phase !== 'blocked'}
          block={shownBlock}
          noComputer={!on}
          onStart={start}
          onBack={backToLibrary}
          narrow={narrow}
          focus={focusOn}
        />
      ) : (
        <>
          {known ? (
            <Band tone="warn" actions={<BlockActions b={known} />} /* noDetails: the computer's status as the shell read it, mapped to its sentence; nothing is sent */>
              {notReady(known)}
            </Band>
          ) : null}
          {hostBox ? (
            // The host's box holds the words: only what is wrong with them is said here.
            input.kind === 'badAddress' ? <Band tone="warn" /* noDetails: the typed address read by the Hub's own rule; nothing was sent */>{t('gh.addressBad')}</Band> : null
          ) : <TextField
            label={t('gh.address')}
            placeholder={t('gh.addressExample')}
            description={repo ? t('gh.isAddress') : lib ? t('gh.addressHint', { count: lib.programs.length }) : t('gh.addressHintPlain')}
            value={text}
            onChange={(v) => {
              setText(v);
              setFocusReq(undefined);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !repo) return;
              // Cancelled, so this Enter's keypress never reaches Start, which takes focus as Ready opens: Enter opens
              // Ready, a second press starts.
              e.preventDefault();
              open(addressKey, addressKey, 'start');
            }}
            errorMessage={input.kind === 'badAddress' ? t('gh.addressBad') : undefined}
          />}
          {repo ? (
            <AddressCard repo={repo} lib={lib} cardKey={addressKey} focusKey={focusReq} onPick={() => open(addressKey, addressKey, 'heading')} />
          ) : (
            <LibraryView
              state={library.state}
              retry={library.retry}
              q={input.kind === 'words' ? input.q : ''}
              browse={browse}
              onBrowse={(b) => {
                setBrowse(b);
                setFocusReq(undefined);
              }}
              here={here}
              focusKey={focusReq}
              onPick={pick}
              onClearSearch={() => {
                setText('');
                setFocusReq(undefined);
              }}
              narrow={narrow}
            />
          )}
        </>
      )}
    </div>
  );
}

interface Watch { r: GitHubRun; repo: Repo; on: Target; account: string; gen: number }
/** A held run rebuilt from core (r null: its record does not read as a run; only Dismiss). */
interface Back { id: string; v: number; r: GitHubRun | null; hold: RunHold; repo: string; on: Target; account: string; gen: number }

/** A held run whose record does not read as one: only the warned Dismiss (refused while it may still be sending). */
type Track = (id: string, p: Promise<Freed>) => Promise<Freed>;
function Unreadable({ t, computer, hold, shown, track, onGone }: { t: T; computer: string; hold: RunHold; shown: HeldAttempt | null; track: Track; onGone: () => void }) {
  const [why, setWhy] = useState<Exclude<Freed, 'freed'> | null>(null);
  return (
    <>
      <OutcomeBanner
        // noDetails: no request failed; the stored record of the run does not read as one
        kind="pending"
        title={t('gh.unknown.unreadable', { computer })}
        body={t('gh.unreadableBody')}
        onDismiss={shown && shown.inFlight !== 'elsewhere' ? () => void track(hold.id, hold.dismiss(shown)).then((r) => (r === 'freed' ? onGone() : setWhy(r))) : undefined}
      />
      {why ? <DismissLine t={t} why={why} check={false} /> : null}
    </>
  );
}

/** Why the warned Dismiss did not free the run, and when to try again. */
function DismissLine({ t, why, check }: { t: T; why: Exclude<Freed, 'freed'>; check: boolean }) {
  return (
    <p className={g.phase} role="status" /* reason: the one answer to the person's Dismiss press, read once */>
      {why === 'unresolved' ? t('gh.dismissStorage') : t(check ? 'gh.dismissWait' : 'gh.dismissWaitOnly')}
    </p>
  );
}

/** Nothing of this run is in flight or unknown: another run may start (an unknown one keeps its Check). */
const settled = (s: Snapshot): boolean => ['done', 'failed', 'cancelled', 'interrupted', 'blocked', 'notSent'].includes(s.phase);

/** One run's card. `shown`: its hold as core shows it (Check and Dismiss wait while another tab's request of it is
 *  out). `again`: the settled run offers Run another (this page's own run); otherwise Close. */
function RunCard({ t, r, repo, computer, on, shown, track, again, onGone }: { t: T; r: GitHubRun; repo: string; computer: string; on: Target; shown: HeldAttempt | null; track: Track; again?: boolean; onGone: () => void }) {
  const s = useSyncExternalStore(r.subscribe, r.getSnapshot, r.getSnapshot);
  return (
    <>
      <RunView t={t} s={s} r={r} repo={repo} computer={computer} on={on} shown={shown} track={track} onGone={onGone} />
      {settled(s) ? (
        <InlineActions size="md" actions={[{ id: 'close', label: t(again ? 'gh.again' : 'gh.close'), onPress: onGone, ...(again ? {} : { dismiss: true }) }]} />
      ) : null}
    </>
  );
}

function RunView({ t, s, r, repo, computer, on, shown, track, onGone }: { t: T; s: Snapshot; r: GitHubRun; repo: string; computer: string; on: Target; shown: HeldAttempt | null; track: Track; onGone: () => void }) {
  const away = shown?.inFlight === 'elsewhere';
  // A refused Dismiss says why and when; Check stays usable, and pressing it clears the line.
  const [why, setWhy] = useState<Exclude<Freed, 'freed'> | null>(null);
  const live = s.phase === 'working' || s.phase === 'waiting' || s.phase === 'stopping' || s.phase === 'finishing';
  return (
    <>
      {s.phase === 'checking' || s.phase === 'creating' || s.phase === 'sending' || live ? (
        <p className={g.phase} role="status" /* reason: the run's one progress line; steps and gates have their own rows */>
          {t(`gh.phase.${s.phase}` as 'gh.phase.working', { repo, computer })}
        </p>
      ) : null}
      {s.steps.length ? <Steps t={t} s={s} /> : null}
      {s.gate ? <RunGate key={`${s.gate.id}:${s.gate.generation}`} t={t} s={s} r={r} computer={computer} on={on} /> : null}
      {/* The agent applied a session allow to its one call only (a locked approval policy): the next call like it asks. */}
      {s.onceOnly && !s.gate ? <Band tone="neutral" /* noDetails: the agent's own answer to this person's press, nothing failed */>{t('gh.onceOnly')}</Band> : null}
      {s.unknown && (s.phase === 'unknown' || s.unknown === 'stop') ? (
        <OutcomeBanner
          // noDetails: the agent's answer never came (no rejection to show); Check asks it again under the same key
          kind="pending"
          title={t(`gh.unknown.${s.unknown}`, { computer })}
          body={t(s.unknown === 'running' ? 'gh.unknownBody.running' : 'gh.unknownBody', { repo, computer })}
          onCheck={away ? undefined : () => { setWhy(null); void r.check(); }}
          checking={s.checking}
          onDismiss={s.held && shown && !away && s.phase === 'unknown' ? () => void track(shown.id, r.dismiss(shown)).then((x) => (x === 'freed' ? onGone() : setWhy(x))) : undefined}
        />
      ) : null}
      {why && s.unknown && s.phase === 'unknown' ? <DismissLine t={t} why={why} check={!away} /> : null}
      {s.phase === 'blocked' || s.phase === 'notSent' || (s.phase === 'failed' && s.block) ? <BlockView t={t} s={s} r={r} computer={computer} on={on} /> : null}
      {(s.phase === 'failed' && !s.block) || s.phase === 'cancelled' || s.phase === 'interrupted' ? (
        <OutcomeBanner
          // noDetails: the agent ended its own turn; there is no rejection, only its outcome
          kind={s.phase === 'failed' ? 'failed' : 'done'}
          title={t(`gh.end.${s.phase}`, { computer })}
          body={null}
        />
      ) : null}
      {s.phase === 'done' && s.result ? <ResultCard t={t} res={s.result} repo={repo} computer={computer} on={on} /> : null}
      {live || s.phase === 'unknown' ? <p className={g.phase}>{t('gh.keepOpen')}</p> : null}
      {s.phase === 'working' || s.phase === 'waiting' ? (
        <InlineActions size="md" actions={[{ id: 'stop', label: t('gh.stop'), onPress: () => void r.stop() }]} />
      ) : null}
    </>
  );
}

function Steps({ t, s }: { t: T; s: Snapshot }) {
  return (
    <ul className={g.steps} aria-label={t('gh.steps')}>
      {s.steps.map((x) => (
        <li key={x.id} className={g.step}>
          <span className={g.stepName}>{gateText(x.name, 80)}</span>
          {x.summary ? <span className={g.stepSummary} title={gateText(x.summary, 300)}>{gateText(x.summary, 300)}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Agent text as the gate card shows it (the steps' names and summaries too, the tool
 *  rows the daemon writes from the calls' arguments): a key or token hidden first, over the whole raw
 *  text, then cleaned and bounded, so no cut leaves a piece of a key the scrub would no longer know. The bounds are the
 *  kit card's (a question 4000, an option or a label 300, a tool name 80). */
const gateText = (x: string, max: number): string => cleanAgentText(scrubSecrets(x), max).text;

/** The gate shown, answered in place. One the Hub cannot decide (an approver lease needed, or unreadable) is
 *  answered in the Agent; a batch of questions is answered as one, every question. */
function RunGate({ t, s, r, computer, on }: { t: T; s: Snapshot; r: GitHubRun; computer: string; on: Target }) {
  const gate = s.gate;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  if (!gate) return null;
  const seen = { id: gate.id, generation: gate.generation };
  const inAgent = gate.blocked === 'policy' || !!gate.invalid;
  // Where the gate is answered instead: one note naming the Agent app, with the way there (nothing failed).
  const elsewhere = inAgent ? (
    <Band tone="neutral" size="table" actions={<AgentWayOut on={on} />} /* noDetails: a gate this page cannot answer; nothing was sent */>
      {t('gh.inAgent', { computer })}
    </Band>
  ) : null;
  if (gate.kind === 'confirm') {
    const cmd = gate.params && typeof gate.params.command === 'string' ? gate.params.command : '';
    const title = t('gh.gate.confirm', { tool: gateText(gate.tool ?? '', 80) });
    // While an answer is on its way the other choices wait, saying why (the pressed one shows busy).
    const wait = s.deciding ? { disabledReason: t('gh.deciding') } : {};
    return (
      <CardFrame label={title}>
        <CardHead>{title}</CardHead>
        <CardBody>
        {/* The command itself is code to read and copy, never prose; a gate without one keeps its detail line. */}
        {cmd ? (
          <CodeBlock code={gateText(cmd, 4000)} label={t('gh.gate.command')} wrap lang="plain" // reason: the agent's command as sent, no colouring that could misread it
          />
        ) : gate.detail ? (
          <p className={g.detail}>{gateText(gate.detail, 4000)}</p>
        ) : null}
        {elsewhere ?? (
          <InlineActions
            size="md"
            label={t('gh.gate.actions')}
            // Allow for this session only when the gate offers it (the agent decides which calls a session allow may
            // cover, and deny rules still win); always this person's own press, never sent for them.
            actions={[
              ...(gate.offerSession === true ? [{ id: 'session', label: t('gh.allowSession'), onPress: () => void r.decide('session', seen), ...wait }] : []),
              { id: 'deny', label: t('gh.deny'), onPress: () => void r.decide('deny', seen), ...wait },
            ]}
            primary={{ id: 'once', label: t('gh.allowOnce'), busy: s.deciding, onPress: () => void r.decide('once', seen) }}
          />
        )}
        </CardBody>
      </CardFrame>
    );
  }
  // One group per question ('' for a single question); each answer is picked from the agent's options or typed.
  const batch = !!gate.questions?.length;
  const groups = batch
    ? (gate.questions ?? []).map((q) => ({ id: q.id, text: q.question, options: q.options }))
    : [{ id: '', text: gate.question ?? '', options: gate.options ?? [] }];
  // A picked option is sent exactly as the agent wrote it; only a typed answer is trimmed.
  const value = (x: (typeof groups)[number]) => (x.options.length ? (answers[x.id] ?? '') : (answers[x.id] ?? '').trim());
  const ready = groups.every((x) => value(x).trim() !== '');
  const send = () => {
    if (!ready) return;
    void r.answer(batch ? Object.fromEntries(groups.map((x) => [x.id, value(x)])) : value(groups[0]!), seen);
  };
  // When any two labels look the same (two keys, both [hidden]; or labels apart only in spaces the page collapses or in
  // characters that never show), every option gets its place in the list after its label, so the person can tell which
  // one they pick. Each label then ends in its own "(n)", so no two
  // match, an option written as "use [hidden] (1)" included. A label cut at its bound ends in an ellipsis.
  const optionsOf = (opts: readonly string[]) => {
    const raw = [...new Set(opts)];
    const labels = raw.map((o) => {
      const c = cleanAgentText(scrubSecrets(o), 300);
      return c.cut ? `${c.text}…` : c.text;
    });
    const looks = labels.map((l) => shownText(l).replace(/\s+/g, ' ').trim());
    const numbered = new Set(looks).size < looks.length;
    return raw.map((o, i) => ({ value: o, label: numbered ? `${labels[i]} (${i + 1})` : labels[i]! }));
  };
  const set = (id: string) => (v: string) => setAnswers((m) => ({ ...m, [id]: v }));
  return (
    <CardFrame label={t('gh.gate.question')}>
      <CardHead>{t('gh.gate.question')}</CardHead>
      <CardBody>
      {groups.map((x, i) => (
        <div key={x.id || i}>
          {/* Each question is said once: in a batch it is its answer's label; the whole line shows too only when that label cuts it (300). */}
          {x.text && (!batch || inAgent || gateText(x.text, 300) !== gateText(x.text, 4000)) ? <p className={g.detail}>{gateText(x.text, 4000)}</p> : null}
          {inAgent ? null : x.options.length ? (
            // The agent's own options, as written (its words keep their case), a key in one hidden as the card hides it;
            // one is picked, then sent as the agent wrote it.
            <RadioGroup label={batch ? gateText(x.text, 300) || t('gh.answer') : t('gh.answer')} options={optionsOf(x.options)} value={answers[x.id]} onChange={set(x.id)} isDisabled={s.deciding} />
          ) : (
            <TextField label={batch ? gateText(x.text, 300) || t('gh.answer') : t('gh.answer')} value={answers[x.id] ?? ''} onChange={set(x.id)} isDisabled={s.deciding} />
          )}
        </div>
      ))}
      {elsewhere ?? (
        <InlineActions
          size="md"
          actions={[]}
          primary={{ id: 'send', label: t('gh.send'), busy: s.deciding, onPress: send, ...(!ready && !s.deciding ? { disabledReason: t('gh.answerFirst') } : {}) }}
        />
      )}
      </CardBody>
    </CardFrame>
  );
}

function BlockView({ t, s, r, computer, on }: { t: T; s: Snapshot; r: GitHubRun; computer: string; on: Target }) {
  const go = useGo();
  const programs = usePageLink('programs');
  const computers = usePageLink('computers');
  const b = s.block;
  if (!b) return null;
  return (
    <>
      <OutcomeBanner
        // noDetails: the agent's answers are Ask's (@ask/io), not core rejections; Ask's readView/errorView already map them to the sentence shown
        kind={s.phase === 'failed' ? 'failed' : 'not_sent'}
        title={t(s.phase === 'blocked' ? 'gh.blocked' : 'gh.notSent')}
        body={t(`gh.block.${b.key}`, { computer })}
      />
      <div className={g.row}>
        {b.act === 'retry' ? (
          <Button variant="primary" onPress={() => void r.retry()}>
            {t('gh.tryAgain')}
          </Button>
        ) : null}
        {b.act === 'agent' ? <AgentWayOut on={on} /> : null}
        {b.act === 'programs' && programs ? (
          <Button variant="secondary" onPress={() => followPageLink(programs, go)}>
            {t('gh.openPrograms')}
          </Button>
        ) : null}
        {b.act === 'computers' && computers ? (
          <Button variant="secondary" onPress={() => followPageLink(computers, go)}>
            {t('gh.openComputers')}
          </Button>
        ) : null}
        {/* The create form is a place in the Hub's Computers page; no button when this load hides Computers. */}
        {b.key === 'unreachable' && computers ? (
          <Button variant="secondary" onPress={() => (computers.kind === 'hub' ? go(computerLinks.create) : followPageLink(computers, go))}>
            {t('gh.newComputer')}
          </Button>
        ) : null}
      </div>
    </>
  );
}

/** Where the result runs, as the Board's place and as a new-tab address (core builds https URLs only). */
function placeOf(res: Result): Placement | null {
  if (res.kind === 'web') return { kind: 'port', port: res.port, path: '/' };
  if (res.kind === 'terminal') return { kind: 'terminal', session: res.terminal };
  return null;
}

function ResultCard({ t, res, repo, computer, on }: { t: T; res: Result; repo: string; computer: string; on: Target }) {
  // Put on Board means nothing outside this Hub (the classic Board takes no add): only a served Board offers it.
  const board = useServedPageLink('board');
  const at = placeOf(res);
  const tab = at ? (at.kind === 'port' ? buildPortUrl(on.project, on.container, 'http', at.port) : buildPortUrl(on.project, on.container, 'terminal', at.session)) : '';
  const href = tab && at?.kind === 'port' ? tab + '/' : tab;
  const fits = at ? tileFits(on, at) : false;
  const add = at && fits && board ? boardAddPath(on, at) : '';
  const title =
    res.kind === 'web' ? t('gh.result.web', { repo, port: res.port })
    : res.kind === 'terminal' ? t('gh.result.terminal', { repo, n: res.terminal })
    : res.kind === 'failed' ? t('gh.result.failed', { repo, why: res.why })
    : t('gh.result.none', { repo, computer });
  // The banner is the frame: no card around it (no double frame).
  return (
    <Stack gap={2}>
      <OutcomeBanner
        // noDetails: the agent's own RESULT line, shown in the title; no request failed
        kind={res.kind === 'failed' ? 'failed' : 'done'}
        title={title}
        body={at && !fits ? t('gh.noTile') : null}
      />
      {at ? (
        <div className={g.row}>
          {add ? (
            <LinkButton variant="primary" icon="board" href={add}>
              {t('gh.putOnBoard')}
            </LinkButton>
          ) : null}
          {href ? (
            <LinkButton variant="secondary" href={href} iconEnd="external">
              {t('gh.openTab')}
            </LinkButton>
          ) : null}
        </div>
      ) : null}
    </Stack>
  );
}
