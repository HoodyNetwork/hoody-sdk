// Claude Code: its state, and whether new Hub chats use it. Install, update and sign-in enter a fixed command
// into a terminal on the computer (Enter included), once per step and per press; a write whose
// answer may have gone through is never sent again (typeSetup). "Do it myself" shows the same command to copy. Every
// change is read back before it is called saved.
// A setup terminal that showed nothing ("nothing seems to appear"): the terminal shows inline at once (the Board's Frame: its sandbox lets a
// link Claude prints open a new tab), addressed exactly as a Board tile (useInlineProgramUrls: the Hub's palette, no
// terminal toolbar; Open in a new tab gets the plain address), resizable by its bottom edge (kit Splitter), and while it
// waits the page reads Claude Code again on its own (useSetupWatch) until the step reads done.
// Layout: the state and use rows (SettingGroup), then the setup step as its own block (SubSection: one
// sentence, the terminal, then one row of actions), then the copies to other computers.
import { capture, hostEnv } from '@core';
import { Button, CopyField, EmptyState, ErrorState, InlineActions, OutcomeBanner, SettingGroup, SettingRow, Skeleton, Splitter, SubSection, TextButton, useStrings, type AnyAction } from '@kit';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Frame, useInlineProgramUrls } from '../../board/links';
import { isStale, type Api, type TermOwned } from '../api';
import { checkClaude, sendClaude, stopClaude, useHeldClaude, type ClaudeChange } from '../claudeHold';
import { closeSetup, setupDone, typeSetup, type SetupStep } from '../flows-claude';
import { claudeCard, claudeOf, COMMANDS } from '../logic';
import strings from '../strings.en.json';
import type { ModelAt } from '../modelHold';
import { shownComputer } from '../shownGate';
import type { ClaudeState } from '../types';
import { ClaudeCopies, ClaudeTransfer } from '../models/claude/Transfer';
import { useAi } from './ctx';
import { failedUi, pendingUi, type Ui } from './outcome';
import s from './parts.module.css';

/** The setup watch: one read of Claude Code every POLL_MS, never two at once, for at most POLL_MAX reads (10 min). */
export const POLL_MS = 5_000;
export const POLL_MAX = 120;

/** While `on` (a typed step waits): reads Claude Code again every POLL_MS, the next read only after the last answered, and
 *  calls `done` once a read says the step is done. Stops on unmount, when `on` or `where` (computer and realm) changes,
 *  after POLL_MAX reads, and once done. A failed or stale read is only "not yet". */
function useSetupWatch(on: boolean, where: string, api: Api, realm: string | null, step: SetupStep | null, done: () => void) {
  const cb = useRef(done);
  cb.current = done;
  useEffect(() => {
    if (!on || !realm || !step) return;
    let live = true;
    let n = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      n += 1;
      let ok = false;
      try {
        const r = await api.acp(realm);
        ok = !isStale(r) && setupDone(step, claudeOf(r, null));
      } catch {
        ok = false;
      }
      if (!live) return;
      if (ok) {
        cb.current();
        return;
      }
      if (n < POLL_MAX) timer = setTimeout(() => void tick(), POLL_MS);
    };
    timer = setTimeout(() => void tick(), POLL_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [on, where, api, realm, step]);
}

const noop = () => undefined;

/** The setup terminal's height: dragged or stepped by its bottom edge between these, in CSS pixels. */
export const TERM_H = { min: 160, max: 720, initial: 288 } as const;
const pctOf = (h: number) => ((h - TERM_H.min) / (TERM_H.max - TERM_H.min)) * 100;
const clampH = (h: number) => Math.min(TERM_H.max, Math.max(TERM_H.min, Math.round(h)));

/** The watch as a component, so it runs above ClaudeBody's early returns' order (hooks stay unconditional). */
function SetupWatch(p: { on: boolean; where: string; api: Api; realm: string | null; step: SetupStep | null; done: () => void }) {
  useSetupWatch(p.on, p.where, p.api, p.realm, p.step, p.done);
  return null;
}

// The copies made from the section outlive its loading, error and unavailable returns (another computer chosen).
export function ClaudeSection() {
  return <ClaudeCopies><ClaudeBody /></ClaudeCopies>;
}

/** The same rows inside the connect drawer ("Use your Claude plan"): Claude Code's state, its setup step and whether new
 *  chats use it, drawn in place. The copies to other computers stay in the section. */
export function ClaudePlanStep() {
  return <ClaudeBody copies={false} />;
}

/** Claude Code's state in words: one literal key per state (the search index and the explain rule read each). */
function StateWords({ state, verified }: { state: ClaudeState; verified: boolean }) {
  const t = useStrings(strings);
  switch (state) {
    case 'unknown':
      return t('cc.unknown');
    case 'unavailable':
      return t('cc.unavailable');
    case 'agent_update':
      return t('cc.agent_update');
    case 'check_failed':
      return t('cc.check_failed');
    case 'not_installed':
      return t('cc.not_installed');
    case 'outdated':
      return t('cc.outdated');
    case 'signed_out':
      return t('cc.signed_out');
    case 'sign_in_unknown':
      return t('cc.sign_in_unknown');
    case 'signed_in':
      return verified ? t('cc.signed_in_verified') : t('cc.signed_in');
  }
}

/** The computer and realm core shows now. */
const shownAt = (): string => `${shownComputer()}\n${capture().realm}`;

function ClaudeBody({ copies = true }: { copies?: boolean }) {
  const t = useStrings(strings);
  const { m, api, reload } = useAi();
  const [busy, setBusy] = useState<string | null>(null);
  const [ui, setUi] = useState<Ui | null>(null);
  // The setup step's own feedback, apart from the backend change's (ui), kept with the step it is for: a setup press never
  // touches a pending change's banner, and a fresh read that no longer asks for that step drops it.
  const [setupUi, setSetupUi] = useState<(Ui & { step: SetupStep }) | null>(null);
  const [typed, setTyped] = useState<SetupStep | null>(null);
  const [manual, setManual] = useState(false);
  const owned = useRef<TermOwned | null>(null);
  // The setup press now on its way. Leaving it (this section closes, or shows another computer or realm) raises the number:
  // that press then writes nothing more, closes a terminal it made, and its late answer is not taken. The press also
  // reads the computer and realm core shows itself (shownAt), so a change counts before this section has drawn it.
  const attempt = useRef(0);
  const [termH, setTermH] = useState<number>(TERM_H.initial);
  const [dragging, setDragging] = useState(false);
  const termBox = useRef<HTMLDivElement>(null);
  // A change whose answer is unknown is core's hold of this computer and realm (claudeHold.ts), never this section's state:
  // leaving Settings, a realm switch and back, or another tab still shows it with Check again and every change button off.
  // `ui` keeps only a refusal and "Nothing was sent".
  const holdAt = useMemo((): ModelAt | null => (m.computer && m.target && m.realm ? { project: m.target.project.id, computer: m.computer.id, realm: m.realm } : null), [m.computer, m.target, m.realm]);
  const held = useHeldClaude(holdAt);
  // Check again reads only from the computer this render shows (`on`), the one whose hold it draws.
  const on = shownComputer();
  useEffect(
    () => () => {
      attempt.current += 1;
      if (owned.current) void closeSetup(api, owned.current);
    },
    [api],
  );
  // Another computer or realm: the terminal made on the old one is not this one's, so the setup starts over.
  const where = `${m.computer?.id ?? ''}|${m.realm ?? ''}`;
  const was = useRef(where);
  useEffect(() => {
    if (was.current === where) return;
    const sameComputer = was.current.split('|')[0] === where.split('|')[0];
    was.current = where;
    attempt.current += 1;
    // A realm switch on the same computer: the terminal this section made there is closed (its sign-in step is not the new
    // realm's to see or finish). On another computer the calls go to the new one, so the old terminal is left as it is.
    if (sameComputer && owned.current) void closeSetup(api, owned.current);
    owned.current = null;
    setTyped(null);
    setUi(null);
    setSetupUi(null);
  }, [where, api]);
  // The setup terminal's addresses, as a Board tile of it (above the early returns: a hook).
  const urls = useInlineProgramUrls('terminal', typed !== null && owned.current ? owned.current.n : null, m.target ?? null);
  // The held change is shown once this tab's own send is done (busy); the change buttons stay off while it is held.
  const shown = busy !== null && busy !== 'setup' ? null : held;

  const [checking, setChecking] = useState(false);
  // What the last Check again found while the hold stays, for that hold only.
  const [still, setStill] = useState<string | null>(null);
  const check = async (): Promise<boolean> => {
    if (!shown || !holdAt) return false;
    setChecking(true);
    const r = await checkClaude(api, holdAt.realm, shown, on).finally(() => setChecking(false));
    if (r.state !== 'saved') {
      setStill(shown.id);
      return false;
    }
    setUi(null);
    reload();
    return true;
  };
  // The banner is the hold's only reader here (Check again, Stop tracking), so it stays under the section's own words when
  // Claude Code's state cannot be read or the agent no longer lists Claude Code.
  const heldBanner = shown ? (
    <OutcomeBanner kind="pending" body={pendingUi().message} onCheck={check} checking={checking} result={still === shown.id ? t('def.stillNot') : null} onDismiss={shown.inFlight ? undefined : () => void stopClaude(shown)} /* noDetails: a change whose answer never came has no rejection; Check again reads it back */ />
  ) : null;
  const cc = m.claude;
  // In the connect drawer (no copies): the rows are the plan step.
  const plan = !copies;
  if (m.loads.claude === 'loading') return <Skeleton variant="rows" rows={2} />;
  if (!cc) return <EmptyState size="sm" icon="realm" title={t('def.chooseRealm')} body={t('def.chooseRealmBody')} />;
  if (m.loads.claude === 'error' && cc.state === 'unknown') {
    return (
      <>
        <ErrorState size="compact" title={t('claude.loadFailed')} onRetry={reload} />
        {heldBanner}
      </>
    );
  }
  if (cc.state === 'unavailable') {
    return (
      <>
        <SettingGroup><SettingRow label={t('claude.title')} help={t('cc.unavailable')} /></SettingGroup>
        {heldBanner}
      </>
    );
  }
  const card = claudeCard(cc, { acpDefault: m.acpDefaultCap });
  const realm = m.realm;
  const step: SetupStep | null = card.act === 'install' || card.act === 'update' ? 'install' : card.act === 'login' ? 'login' : null;
  const hint = step === 'install' ? cc.installHint : step === 'login' ? cc.loginHint : null;
  const offered = step !== null && hint === COMMANDS[step];
  // Done by hand (or another step now due): the note about that step's terminal no longer applies.
  if (setupUi && setupUi.step !== step) setSetupUi(null);
  // The typed panel belongs to the step it was typed for: an install done leaves the sign-in its own button again.
  const waiting = typed !== null && typed === step;
  const term = waiting ? urls : null;
  const locked = busy !== null || held !== null;

  const run = async (id: string, change: ClaudeChange) => {
    // C9: a change that may have gone through is never sent again; Check again (the banner) settles it first.
    if (locked) return;
    setBusy(id);
    setUi(null);
    const r = holdAt ? await sendClaude(api, holdAt, change, on) : ({ state: 'not_held' } as const);
    setBusy(null);
    // Not confirmed, a context that moved on, or already held: the hold shows it.
    if (r.state === 'stale' || r.state === 'not_confirmed' || r.state === 'held') return;
    if (r.state === 'saved') return reload();
    if (r.state === 'not_held') return setUi({ kind: 'not_sent', message: t('def.notHeld') });
    // A refusal that may still have landed is the hold's (failedUi says pending): only a definite one is shown here.
    if (r.state === 'failed') {
      const u = failedUi(r.err);
      if (u.kind !== 'pending') setUi(u);
    }
  };

  const open = async (st: SetupStep) => {
    // Once per press: a press while another runs, or while this step's command is already in, sends nothing.
    if (busy !== null || typed === st) return;
    // The press is for the computer this section draws (the one its title names). While core already shows another one,
    // not drawn here yet, nothing is sent: the button pressed is not that computer's. (An api without termOn has one
    // computer only.)
    const drawn = m.target ? `${m.target.project.id}\n${m.target.container.id}` : '';
    if (api.termOn && drawn !== shownComputer()) return;
    setBusy('setup');
    attempt.current += 1;
    const mine = attempt.current;
    const at = shownAt();
    const left = () => attempt.current !== mine || shownAt() !== at;
    const r = await typeSetup(api.termOn ? api.termOn(m.target) : api, st, cc.setupUser ?? '', owned.current, left);
    setBusy(null);
    if (left()) return;
    if (r.state === 'typed') {
      owned.current = r.owned;
      setTyped(st);
      setSetupUi(null);
    } else if (r.state !== 'stale') {
      setManual(true);
      setSetupUi({ kind: 'failed', message: t(r.state === 'unsupported' ? 'claude.noTerminal' : 'claude.terminalFailed'), step: st });
    }
  };

  // The setup block's one row: Check again, Do it myself (while the terminal waits; before it, the state row has it), Open in a new tab (the plain
  // address, no Board option).
  const setupActions: AnyAction[] = [
    { id: 'check', label: t('claude.check'), onPress: reload },
    ...(offered && waiting ? [{ id: 'myself', label: t('claude.myself'), onPress: () => setManual((v) => !v) }] : []),
    ...(term ? [{ id: 'tab', label: t('claude.termTab'), href: term.shareUrl, icon: 'external' as const }] : []),
  ];
  return (
    <div>
      <SetupWatch on={waiting} where={where} api={api} realm={realm} step={step} done={() => { setTyped(null); reload(); }} />
      {/* This computer: Claude Code's state and whether chats use it. The typed setup and its commands follow the group.
          In the connect drawer the group is a section of its own, headed with the computer's name; its first row is the
          state in words, with the one action the state asks for as the step's primary. */}
      <SettingGroup {...(plan ? { title: m.computer?.name ? t('claude.on', { computer: m.computer.name }) : t('claude.status') } : {})}>
        <SettingRow
          label={t('claude.status')}
          {...(plan
            ? { label: <StateWords state={cc.state} verified={card.state === 'cc.signed_in_verified'} /> }
            : { help: <StateWords state={cc.state} verified={card.state === 'cc.signed_in_verified'} /> })}
          actions={
            card.act === 'check' ? (
              <Button size="sm" variant="secondary" onPress={reload}>
                {t('claude.check')}
              </Button>
            ) : offered && step && !waiting ? (
              <>
                <Button size="sm" variant={plan ? 'primary' : 'secondary'} busy={busy === 'setup'} onPress={() => void open(step)}>
                  {t(card.act === 'login' ? 'claude.signIn' : card.act === 'update' ? 'claude.update' : 'claude.install')}
                </Button>
                <TextButton onPress={() => setManual((v) => !v)}>{t('claude.myself')}</TextButton>
              </>
            ) : undefined
          }
        >
          {step && !offered && card.act && card.act !== 'check' ? t('claude.noHint') : undefined}
        </SettingRow>
        {card.sel && (
          <SettingRow
            label={t('claude.use')}
            help={
              card.sel === 'claude.inUse'
                ? t('claude.inUse')
                : card.sel === 'claude.notReady'
                  ? t('claude.notReady')
                  : card.sel === 'claude.off'
                    ? t('claude.off')
                    : card.sel === 'claude.cantStart'
                      ? t('claude.cantStart')
                      : t('claude.needUpdate')
            }
            actions={
              <>
                {card.selAct === 'use' && !!realm && (
                  <Button size="sm" variant={plan && step === null ? 'primary' : 'secondary'} busy={busy === 'use'} isDisabled={locked} onPress={() => void run('use', { kind: 'backend', v: 'claude' })}>
                    {t('claude.useIt')}
                  </Button>
                )}
                {card.selAct === 'undo' && !!realm && (
                  <Button size="sm" variant="secondary" busy={busy === 'undo'} isDisabled={locked} onPress={() => void run('undo', { kind: 'backend', v: '' })}>
                    {t('claude.undo')}
                  </Button>
                )}
                {card.selAct === 'turnOn' && !!realm && (
                  <Button size="sm" variant="secondary" busy={busy === 'on'} isDisabled={locked} onPress={() => void run('on', { kind: 'enabled', v: true })}>
                    {t('claude.turnOn')}
                  </Button>
                )}
                {card.selAct === 'check' && (
                  <Button size="sm" variant="secondary" onPress={reload}>
                    {t('claude.check')}
                  </Button>
                )}
              </>
            }
          />
        )}
        {!card.sel && card.selAct === 'use' && realm && (
          <SettingRow
            label={t('claude.use')}
            help={t('claude.useHint')}
            actions={
              <Button size="sm" variant={plan && step === null ? 'primary' : 'secondary'} busy={busy === 'use'} isDisabled={locked} onPress={() => void run('use', { kind: 'backend', v: 'claude' })}>
                {t('claude.useIt')}
              </Button>
            }
          />
        )}
      </SettingGroup>
      {(waiting || (manual && step && offered)) && step && (
        // The setup step, its own block: one sentence, the terminal while its command runs, the command to copy when asked,
        // then one row of actions.
        <SubSection
          title={waiting ? t('claude.typedTitle') : t('claude.myselfTitle')}
          description={waiting ? (step === 'login' ? t('claude.typedLogin') : t('claude.typedInstall')) : t('claude.runIt')}
        >
          {/* The inline terminal only where the Hub is a web page: a terminal draws no frame (an empty box and a splitter that
              resized nothing); there its words say the command runs on the computer, and Open in a new tab shows it. */}
          {waiting && term && hostEnv().browserPage === true && (
            <div className={s.setupTermWrap} data-claude-typed>
              <div
                ref={termBox}
                className={dragging ? `${s.setupTerm} ${s.setupTermDrag}` : s.setupTerm}
                style={{ ['--setup-term-h' as string]: `${termH}px` } as CSSProperties}
              >
                <Frame src={term.url} title={t('claude.termTitle', { name: m.computer?.name ?? '' })} inTabOrder onState={noop} register={noop} />
              </div>
              <Splitter
                orientation="horizontal"
                value={pctOf(termH)}
                label={t('claude.termResize')}
                onStep={(d) => setTermH((h) => clampH(h + (d / 100) * (TERM_H.max - TERM_H.min)))}
                onEqualise={() => setTermH(TERM_H.initial)}
                onDragStart={() => setDragging(true)}
                onDrag={(_x, y) => {
                  const top = termBox.current?.getBoundingClientRect().top;
                  if (top !== undefined) setTermH(clampH(y - top));
                }}
                onDragEnd={() => setDragging(false)}
              />
            </div>
          )}
          {manual && offered && <CopyField label={t('claude.command')} value={COMMANDS[step]} />}
          <InlineActions label={t('claude.setupActions')} actions={setupActions} />
        </SubSection>
      )}
      {setupUi && setupUi.step === step && (
        <OutcomeBanner kind={setupUi.kind} body={setupUi.message} /* noDetails: the terminal opener answers only a category (no terminal, or it did not open); the sentence says what to do */ />
      )}
      {heldBanner ?? (ui && <OutcomeBanner kind={ui.kind} body={ui.message} />)}
      {copies && <ClaudeTransfer />}
    </div>
  );
}
