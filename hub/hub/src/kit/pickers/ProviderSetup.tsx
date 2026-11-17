// ProviderSetup: connect one AI provider in place, over core's provider flows (the same flows and truth rules
// the AI page uses). Two ways, both on the computer's agent:
//   - API key: the agent checks it; the key lives only in this step's state, is never prefilled, is cleared the
//     moment it is sent and dropped when the step closes. A lost answer is read back by fingerprint (2, 8, 25 s);
//     "not confirmed" is never "not saved"; Check again only reads, "Type the key again" starts over.
//   - Every key save is core's hold on the provider's credential on the computer (`at`; core/providers/keySave.ts), the
//     lock the AI page's own key saves and its key and endpoint removals take: while one may still land, nothing else
//     changing that credential is sent. The hold is taken before the key leaves (refused: nothing is sent and the
//     typed key stays); it goes when the answer is known, on a Check again that proves the key, or when the person
//     stops tracking the save. An unknown save the step leaves stays held: the AI page shows it with Check again.
//   - ChatGPT sign-in by device code (OpenAI, when the agent offers it): the code and the link live only while the
//     step is open; leaving cancels this attempt's job (one followed from another attempt is left running) and reads
//     the answer (signinLeave: an end still unknown leaves the unknown toast), and a cancel that races a finished
//     sign-in reads the job's end before it says anything. A login stored before the attempt proves nothing about this one.
//   - OpenRouter's own sign-in (when the agent lists `signin` for it): OpenRouterSetup, the same rules.
//   - A custom endpoint's key (`endpoint`) goes only with the definition revision the step read when it opened,
//     and only while the step's attempt and the context it opened in hold (endpointRev.tsx).
// Creating a custom endpoint, and Claude Code, happen on the AI page: callers link there.
import { providers } from '@core';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../controls/Button';
import { Form, FormFooter, RadioGroup, SecretField, SecretInput } from '../forms/more';
import { useOutcome, usePendingToast } from '../forms/Outcome';
import type { OutcomeLike } from '../outcome';
import { openOutside } from '../states/openOutside';
import { EmptyState, ErrorState, OutcomeBanner } from '../states/States';
import { showToast } from '../states/Toast';
import { EndpointRevNote, useEndpointRev } from './endpointRev';
import { ConfirmDialog } from '../overlays/Dialog';
import { OpenRouterSetup } from './OpenRouterSetup';
import { leaveSignIn } from './signinLeave';
import { useStrings } from '../strings';
import strings from './ProviderSetup.strings.en.json';
import s from './ProviderSetup.module.css';

type Api = providers.ProvidersApi;
type Env = providers.Env;
type Outcome = providers.Outcome;
type Ui = OutcomeLike & { message?: string };
type SaveResult = providers.KeySaveResult;

const SAVED: ReadonlySet<providers.KeyState> = new Set(['valid', 'inconclusive', 'untested', 'saved']);
const NOT_SAVED: ReadonlySet<providers.KeyState> = new Set(['refused', 'failed', 'def_changed', 'not_sent']);
/** Refused before the key left (another change of this credential is held, or the hold could not be kept): nothing sent. */
const notHeld = (r: SaveResult): r is { state: 'held' } | { state: 'not_held' } => r.state === 'held' || r.state === 'not_held';

export type Connected = { how: 'valid' | 'inconclusive' | 'untested' | 'saved' | 'signin' };

export interface ProviderSetupProps {
  api: Api;
  env: Env;
  providerId: string;
  providerLabel: string;
  /** The computer's name, for "Stored on … only". */
  computer?: string;
  /** The agent offers ChatGPT sign-in by device code (OpenAI only). */
  device?: boolean;
  /** The agent lists `signin` in this provider's `status.methods`: OpenRouter's own sign-in is offered (openrouter only). */
  signin?: boolean;
  /** A custom endpoint: the step reads its definition revision and sends the key only with it. */
  endpoint?: boolean;
  /** The computer `api` sends to (its project and container id): a key save is held on the provider's credential there.
   *  Required, so no caller forgets it; `null` (no computer known) sends no key (nothing could be held), a sign-in does
   *  not need it. */
  at: providers.CredentialAt | null;
  /** The caller's words for a refusal; the kit's generic sentence otherwise. */
  failedText?: (err: Outcome) => string;
  /** Connected, from an answer or a read-back. The caller re-reads the catalogue. */
  onConnected: (r: Connected) => void;
  /** Leave the step (a cancelled sign-in, or Back). */
  onBack?: () => void;
  /** Told whether the key step's send is in flight or its outcome is unknown ("may have been saved"), and false when
   *  the key step goes. While it is true the caller keeps this step: no Back, and the same kind of setup (C9). */
  onLock?: (locked: boolean) => void;
}

/** One ProviderSetup is one provider's step: a caller that changes `providerId` gives it a new `key` (a remount), so a
 *  key typed or sent for one provider never stays under another. */
export function ProviderSetup(p: ProviderSetupProps) {
  const t = useStrings(strings);
  // A sign-in is offered only where the agent says it can run one: ChatGPT for openai (device), OpenRouter's own for
  // openrouter (`signin` listed). Every other provider, or an agent that lists neither, gets the key alone.
  const gpt = p.device === true && p.providerId === 'openai';
  const or = p.signin === true && p.providerId === 'openrouter';
  // `how` keeps its first value: when the version read lands late and a sign-in appears, a person already on the key
  // stays there, with the choice shown above it.
  const [how, setHow] = useState<'sign' | 'key'>(gpt || or ? 'sign' : 'key');
  // Without a sign-in the key step shows, and it stays the choice when the sign-in comes back: whatever was typed or
  // sent there stays in place.
  if (!gpt && !or && how !== 'key') setHow('key');
  // The key step's send is in flight or its outcome is unknown: the choice waits, since leaving the key step would
  // drop that answer (C9).
  const [keyLocked, setKeyLocked] = useState(false);
  // One tree whether or not a sign-in is offered, so KeySetup keeps its place when `device`/`signin` arrive: a remount
  // would drop the typed key and the answer of a save in flight (C9).
  return (
    <div className={s.stack}>
      {(gpt || or) && (
        <RadioGroup
          label={t('ps.how', { provider: p.providerLabel })}
          value={how}
          onChange={setHow}
          isDisabled={keyLocked}
          options={[
            gpt ? { value: 'sign' as const, label: t('ps.how.gpt'), description: t('ps.how.gptHint') } : { value: 'sign' as const, label: t('ps.how.or'), description: t('ps.how.orHint') },
            { value: 'key' as const, label: t('ps.how.key'), description: t(gpt ? 'ps.how.keyHint' : 'ps.how.keyHintOr') },
          ]}
        />
      )}
      {how === 'key' ? (
        <KeySetup
          key="key"
          {...p}
          onLock={(l) => {
            setKeyLocked(l);
            p.onLock?.(l);
          }}
        />
      ) : gpt ? (
        <ChatGptSetup {...p} onBack={() => setHow('key')} />
      ) : (
        <OpenRouterSetup api={p.api} env={p.env} failedText={p.failedText} onSigned={() => p.onConnected({ how: 'signin' })} onBack={() => setHow('key')} />
      )}
    </div>
  );
}

function failedUi(err: Outcome, text: string): Ui {
  return { kind: err.kind === 'pending' || err.code === 'READ_BACK_FIRST' ? 'pending' : err.kind === 'not_sent' ? 'not_sent' : 'failed', code: err.code, message: text };
}

export function KeySetup({ api, env, providerId, providerLabel, computer, endpoint = false, at, failedText, onConnected, onLock }: ProviderSetupProps) {
  const t = useStrings(strings);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Ui | null>(null);
  const [field, setField] = useState<string | undefined>();
  const [checking, setChecking] = useState(false);
  // "Stop tracking this save" asks first, for the save shown when it was pressed (its number): a newer save closes it.
  const [askStop, setAskStop] = useState<number | null>(null);
  // The send in flight, one object per send: if the step goes before it answers, its outcome is unknown (C9), never
  // failed or dropped.
  const [inFlight, setInFlight] = useState<OutcomeLike | null>(null);
  const live = useRef(true);
  const ep = useEndpointRev(api, providerId, endpoint);
  // Each send is a save attempt; "Type the key again" and the next send end the earlier one. `sent` keeps the last
  // send's number and its endpoint guard (an endpoint's revision attempt and computer; a built-in has none): its
  // answer, and a later Check again, change this step only while both hold, so an older check can never complete,
  // fail or clear a newer save. `held` is its hold while the answer is unknown: Check again reads that one only.
  const saves = useRef(0);
  const checks = useRef(0);
  const sent = useRef<{ n: number; guard: () => boolean; scope: providers.StepScope | null; held: providers.HeldKeySave | null }>({ n: 0, guard: () => true, scope: null, held: null });
  // The last send's answer. A step that goes while its send is in flight (the drawer holds its own close, not a scope
  // change, a parent reset or an unmount) leaves a toast that follows it: its Check again reads this answer, then the
  // save's hold. A send the step left before the PUT sends nothing and answers "ended", which stays unknown here.
  const flight = useRef<{ p: Promise<SaveResult>; scope: providers.StepScope } | null>(null);
  // The save this step stopped tracking while core lets its hold go: the next save waits for that.
  const dropping = useRef<Promise<boolean> | null>(null);
  // A send's env: while the step is up, the step's own env.alive() holds it too; once the step went, only the scope the
  // send began in (account, realm, computer) does. The step's env dies with the step (a chooser's step reset or
  // unmount), the unknown it leaves does not: its answer and its Check again still read while that scope holds.
  const scopedEnv = (sc: providers.StepScope | null): Env => (sc ? { ...env, alive: () => providers.stepScopeLive(sc) && (!live.current || env.alive()) } : env);
  const owns = (x: { n: number; guard: () => boolean }) => saves.current === x.n && x.guard();
  // The last send's scope watch: a change undone before anything asks (another computer and back) still ends it. It
  // stops at the scope's end, at the next send, when the step goes with nothing unknown left (no send in flight, no
  // "may have been saved"), and when the step's leave toast settles after the step went.
  const unwatch = useRef<() => void>(() => {});
  const unknown = useRef(false);
  unknown.current = !!inFlight || out?.kind === 'pending';
  const ready = !endpoint || ep.state.s === 'ok';
  const locked = busy || out?.kind === 'pending';
  // The latest onLock, told on every change of `locked` and once more (false) when the step goes.
  const onLockRef = useRef(onLock);
  onLockRef.current = onLock;
  useLayoutEffect(() => {
    onLockRef.current?.(locked);
  }, [locked]);
  useLayoutEffect(() => () => onLockRef.current?.(false), []);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (!unknown.current) unwatch.current();
    };
  }, []);

  const checkFlight = async (): Promise<boolean> => {
    const f = flight.current;
    if (!f) return false;
    const r = await f.p;
    if (!providers.stepScopeLive(f.scope)) return false;
    if (notHeld(r) || NOT_SAVED.has(r.state)) return false;
    if (SAVED.has(r.state)) return true;
    // Not confirmed, ended or stale: the save's hold (none: its answer was known, or the key never left) is read back
    // once by the fingerprint this tab kept, in the send's scope, and goes on proof.
    return !!r.held && (await providers.checkKeySave(api, scopedEnv(f.scope), providerId, r.held)) === 'saved';
  };
  // The step's one leave toast: the send in flight, else the footer's "may have been saved" (the footer's own toast is
  // off), so a scope's end retires whichever the step left.
  const footerOut = useOutcome(out ?? undefined);
  const leave = inFlight ?? (footerOut?.kind === 'pending' ? footerOut : null);
  const leaveCheck = async (): Promise<boolean> => {
    const proved = await (inFlight ? checkFlight() : again());
    if (proved && !live.current) unwatch.current();
    return proved;
  };
  const leftFlight = usePendingToast(leave, leaveCheck);
  // A toast the step left that settled: nothing is left for the send's watch.
  const settledLeft = () => {
    leftFlight();
    if (!live.current) unwatch.current();
  };
  // A save refused before the key left: another change of this credential is held, or the hold could not be kept.
  const notSentWords = (r: { state: 'held' } | { state: 'not_held' }) => (r.state === 'held' ? t('key.held', { provider: providerLabel }) : t('key.notHeld'));

  // The answer of a send the step left: a proved save closes its toast, a definite refusal (or a save refused before the
  // key left) replaces it with the refusal; anything else (not confirmed, ended, stale) leaves the unknown toast and its
  // Check again. A scope that ended has closed that toast already (the send's watch), so its answer changes nothing.
  const afterLeft = (r: SaveResult, sc: providers.StepScope) => {
    if (!providers.stepScopeLive(sc)) return;
    if (!notHeld(r) && SAVED.has(r.state)) settledLeft();
    else if (notHeld(r) || NOT_SAVED.has(r.state)) {
      settledLeft();
      // The step is gone, so the fix is in the body: a kit step has no way back to where it was set up (Toast.calls KNOWN).
      showToast({
        tone: 'error',
        title: t(r.state === 'refused' ? 'key.leftRefused' : 'key.leftFailed', { provider: providerLabel }),
        body: notHeld(r) ? notSentWords(r) : t('key.leftBody', { provider: providerLabel }),
      });
    }
  };

  const apply = (r: providers.KeyResult) => {
    if (!live.current) return;
    if (r.state === 'valid' || r.state === 'inconclusive' || r.state === 'untested' || r.state === 'saved') return onConnected({ how: r.state });
    if (r.state === 'stale' || r.state === 'ended') return;
    if (endpoint && (r.state === 'def_changed' || r.state === 'not_sent')) return r.state === 'def_changed' ? ep.changed() : ep.read();
    if (r.state === 'refused') {
      setField(t('key.refused', { provider: providerLabel }));
      setOut({ kind: 'failed', message: t('key.refusedTitle') });
    } else if (r.state === 'def_changed') setOut({ kind: 'failed', message: t('key.changed') });
    else if (r.state === 'not_confirmed') setOut({ kind: 'pending', message: t('key.notConfirmed') });
    else if (r.err) setOut(failedUi(r.err, failedText?.(r.err) ?? t('key.failed')));
  };

  const submit = async () => {
    if (!key.trim() || busy) return;
    // An endpoint without its revision sends nothing, and the typed key stays.
    const rev = ep.state.s === 'ok' ? ep.state.rev : null;
    if (endpoint && rev === null) return;
    const scope = providers.stepScope();
    unwatch.current();
    // The send belongs to the scope it began in. Its end (another account, realm or computer, even one switched back)
    // retires the step's leave toast, as an account or realm switch closes any leave toast, and drops the step's own
    // unknown line; every answer path then asks the send's guard, which holds only while the scope does.
    unwatch.current = providers.watchStepScope(scope, () => {
      unwatch.current = () => {};
      leftFlight();
      if (!live.current) return;
      setInFlight(null);
      setOut(null);
    });
    const attempt = endpoint ? ep.guard() : () => true;
    const mine = { n: ++saves.current, guard: () => attempt() && providers.stepScopeLive(scope), scope, held: null as providers.HeldKeySave | null };
    sent.current = mine;
    const guard = () => owns(mine);
    const k = key.trim();
    setBusy(true);
    setInFlight({ kind: 'pending' });
    setOut(null);
    setField(undefined);
    const se = scopedEnv(scope);
    const p = (async () => {
      // A save this step stopped tracking goes first: until core let it go, it would refuse this one.
      if (dropping.current) await dropping.current;
      // Core holds the save before the key leaves (refused: nothing is sent and the typed key stays). Sent only while the
      // step is up; the answer of a PUT that went out is this send's even after the step went.
      return providers.holdKeySave(api, se, at, providerId, (a) => {
        if (live.current) setKey('');
        return endpoint
          ? providers.saveEndpointKey(a, se, providerId, k, rev, () => live.current && guard(), () => !live.current || guard())
          : providers.saveKey(a, se, providerId, k, null, () => live.current);
      });
    })();
    flight.current = { p, scope };
    const r = await p;
    if (!notHeld(r)) mine.held = r.held ?? null;
    if (!live.current) return afterLeft(r, scope);
    if (saves.current !== mine.n) return;
    // Answered here: no leave toast for this send, even when the step goes in the same commit (a connected key).
    leftFlight();
    setInFlight(null);
    setBusy(false);
    // An answer for an attempt the step moved on from (a new read, another computer) is not this step's outcome.
    if (!guard()) return;
    if (notHeld(r)) return setOut({ kind: 'not_sent', message: notSentWords(r) });
    apply(r);
  };

  const again = async (): Promise<boolean> => {
    const mine = sent.current;
    const c = ++checks.current;
    if (live.current) setChecking(true);
    // Once the step went (its footer's leave toast runs this), only the send's scope holds the read. The send's own
    // hold is read back once by the fingerprint this tab kept, and goes on proof.
    const reads = () => (mine.scope ? providers.stepScopeLive(mine.scope) : true) && (!live.current || owns(mine));
    const r = mine.held ? await providers.checkKeySave(api, scopedEnv(mine.scope), providerId, mine.held, reads) : 'not_confirmed';
    // The step went (its leave toast runs this Check again): the read alone answers, nothing here changes.
    if (!live.current) return r === 'saved';
    if (checks.current === c) setChecking(false);
    // A newer save (or Type the key again) took over: this check is not its outcome and changes nothing.
    if (saves.current !== mine.n) return false;
    if (!mine.guard()) {
      reset();
      return false;
    }
    if (r === 'saved') {
      apply({ state: 'saved' });
      return true;
    }
    // No read can tell (the same key was stored before, or what was stored could not be read): the line says so.
    setOut({ kind: 'pending', message: t(r === 'unproved' ? 'key.saveUnproved' : 'key.stillNot') });
    return false;
  };

  // The step leaves its unknown save (the scope it began in ended): the hold stays core's.
  const reset = () => {
    saves.current++;
    setOut(null);
  };
  // "Stop tracking this save", the person's own (its hint says when): the step takes a new key at once, and core lets the
  // hold go meanwhile. The next save waits for that; refused, that save is refused too and says so.
  const typeAgain = () => {
    const h = sent.current.held;
    reset();
    if (!h) return;
    const done = providers.stopKeySave(h);
    dropping.current = done;
    void done.finally(() => {
      if (dropping.current === done) dropping.current = null;
    });
  };

  return (
    <Form onSubmit={() => void submit()}>
      <div className={s.stack}>
        <SecretInput
          label={t('key.label', { provider: providerLabel })}
          description={t('key.stored', { computer: computer || t('ps.thisComputer') })}
          value={key}
          onChange={setKey}
          isDisabled={locked}
          errorMessage={field}
          isRequired
          reveal={false}
        />
        {out?.kind === 'pending' && (
          <>
            <p className={s.muted}>{t('key.pendingHint')}</p>
            <Button variant="secondary" size="sm" onPress={() => setAskStop(saves.current)}>
              {t('key.typeAgain')}
            </Button>
          </>
        )}
        <ConfirmDialog
          overlayId="kit-key-save-retype"
          isOpen={askStop !== null && askStop === saves.current && out?.kind === 'pending'}
          onOpenChange={(o) => !o && setAskStop(null)}
          title={t('key.typeAgainTitle')}
          body={t('key.stopWarn')}
          confirmLabel={t('key.typeAgainGo')}
          onConfirm={() => {
            const n = askStop;
            setAskStop(null);
            if (n === saves.current) typeAgain();
          }}
        />
        {endpoint && <EndpointRevNote rev={ep} endpoint={providerLabel} />}
        <FormFooter nested toastOnLeave={false} dirty={key.trim().length > 0} busy={busy} outcome={out ?? undefined} onCheck={again} checking={checking} submitLabel={t('key.save')} submitDisabled={!ready} />
      </div>
    </Form>
  );
}

type St = 'starting' | 'waiting' | 'verifying' | 'busy' | 'ended' | 'unconfirmed' | 'failed' | 'expired' | 'signedout';

export function ChatGptSetup({ api, env, failedText, onConnected, onBack }: Omit<ProviderSetupProps, 'at'>) {
  const t = useStrings(strings);
  const [st, setSt] = useState<St>('starting');
  const [code, setCode] = useState<providers.DeviceCode>({ code: null, uri: null });
  const [msg, setMsg] = useState('');
  // The agent's refusal of the start: its words and Details show with the failed state.
  const [refusal, setRefusal] = useState<Outcome | null>(null);
  const job = useRef<string | null>(null);
  // The last code seen stays here after a wipe: the link filter still hides a link that carries it, and a later poll
  // cannot bring it back. It belongs to its job: another job's code is shown afresh.
  const seen = useRef<{ job: string | null; code: string | null; wiped: boolean }>({ job: null, code: null, wiped: false });
  const stop = useRef<providers.Stop>({ stopped: false });
  const live = useRef(true);
  // Whether a login was already stored before this attempt: then "signed in" proves nothing about it.
  const before = useRef<boolean | null>(null);
  const back = () => onBack?.();

  // This attempt's job said it completed. Kept for the attempt: a login read that fails leaves it for Check again.
  const proved = useRef(false);
  // `jobDone`: the job said it completed. Without that (now or earlier in this attempt), only a login read as signed
  // out before the attempt and signed in now is new; an unknown start (the first read failed) proves nothing. `on`:
  // the caller's own fence, read again once the login is read.
  const finish = async (jobDone: boolean, on: () => boolean) => {
    job.current = null;
    if (jobDone) proved.current = true;
    setSt('verifying');
    const r = await providers.signedIn(api);
    if (!on() || r.state === 'stale') return;
    const fresh = before.current === false || (proved.current && before.current === null);
    if (r.state === 'signed_in' && !fresh) setSt('unconfirmed');
    else if (r.state === 'signed_in') onConnected({ how: 'signin' });
    else setSt(r.state === 'signed_out' ? 'signedout' : 'unconfirmed');
  };

  // One attempt is one Idempotency-Key: a start run again under the same attempt (the dev build mounts twice) replays
  // the same job, where a new key would meet that job as a sign-in already in progress. Only "start again" mints a key.
  const plan = useRef<providers.Plan | null>(null);
  // Each start and each leave bumps it: an older start reads it after every wait and stops there.
  const gen = useRef(0);
  // The job is another attempt's (the agent named it when refusing a second sign-in): followed, never stopped on leaving.
  const [adopted, setAdopted] = useState(false);
  const followed = useRef(false);
  const follow = (v: boolean) => {
    followed.current = v;
    setAdopted(v);
  };

  const start = async (fresh = false) => {
    const g = ++gen.current;
    const on = () => live.current && g === gen.current;
    stop.current = { stopped: false };
    proved.current = false;
    follow(false);
    setSt('starting');
    setCode({ code: null, uri: null });
    setRefusal(null);
    const b = await providers.signedIn(api);
    if (!on() || b.state === 'stale') return;
    before.current = b.state === 'signed_in' ? true : b.state === 'signed_out' ? false : null;
    if (fresh || !plan.current) plan.current = { idem: env.newKey(), another: false, replay: false };
    else plan.current.replay = false;
    const r = await providers.deviceStart(api, plan.current, on);
    // Left while starting: the job this start made is cancelled too (one already in progress is not ours to stop). A
    // start run again under the same attempt replays the same job, so a superseded start leaves it to that one.
    if (!live.current && r.state === 'job') void providers.deviceCancel(api, r.job);
    if (!on() || r.state === 'stale') return;
    if (r.state === 'failed') {
      setMsg(failedText?.(r.err) ?? '');
      setRefusal(r.err);
      return setSt('failed');
    }
    if (r.state === 'not_confirmed') return setSt('unconfirmed');
    const j = r.job;
    job.current = j;
    if (r.state === 'job') {
      seen.current = { job: j, code: r.code.code, wiped: false };
      setCode(r.code);
    } else {
      if (seen.current.job !== j) seen.current = { job: j, code: null, wiped: false };
      follow(true);
    }
    return watch(j, on);
  };

  // Follows the job until it ends. `on` is the start's (or the check's) own: false once a newer step or a leave came.
  const watch = async (j: string, on: () => boolean) => {
    setSt('waiting');
    const res = await providers.devicePoll(api, env, j, (c) => {
      if (c.code && !seen.current.wiped) seen.current.code = c.code;
      setCode((x) => ({ code: seen.current.wiped ? null : (c.code ?? x.code), uri: c.uri ?? x.uri }));
    }, stop.current);
    if (!on()) return;
    if (res.state === 'complete') return void finish(true, on);
    if (res.state === 'stopped' || res.state === 'stale') return;
    job.current = null;
    // The job ending may be a finished sign-in (done in another tab): read the login before showing an end.
    // C9: only a login new since the start is a sign-in (finish's rule), and only a login read as signed out is the end;
    // an unreadable login, or one stored when the attempt began or whose start was never read, may have gone through.
    if (res.state === 'expired' || res.state === 'gone') {
      const r2 = await providers.signedIn(api);
      if (!on() || r2.state === 'stale') return;
      if (r2.state === 'signed_in' && before.current === false) return onConnected({ how: 'signin' });
      if (r2.state !== 'signed_out') return setSt('unconfirmed');
    }
    setSt(res.state === 'expired' ? 'expired' : res.state === 'gone' || res.state === 'cancelled' ? 'ended' : 'failed');
    if (res.state === 'error') setMsg(t('gpt.error'));
  };

  useEffect(() => {
    live.current = true;
    // The scope (account, realm, computer) this step runs in: what its leave says belongs to it.
    const sc = providers.stepScope();
    void start();
    const stopRef = stop;
    const jobRef = job;
    const genRef = gen;
    const followedRef = followed;
    return () => {
      live.current = false;
      genRef.current++;
      stopRef.current.stopped = true;
      stopRef.current.wake?.();
      // Leaving cancels this attempt's job and reads the answer (signinLeave); nothing here is kept. A followed job is
      // another attempt's.
      const j = jobRef.current;
      if (j && !followedRef.current) void leaveSignIn(sc, 'ChatGPT', () => providers.deviceCancel(api, j), () => providers.jobEnd(api, j));
      jobRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Cancels the job, then `then` once it saved nothing. A sign-in that won the race is kept; a lost cancel answer
  // reads the job's own end, and an end still unknown is "not confirmed" (Check again), never a new step.
  const endJob = async (j: string, then: () => void) => {
    const g = ++gen.current;
    const on = () => live.current && g === gen.current;
    setSt('busy');
    const r = await providers.deviceCancel(api, j);
    if (!on() || r.state === 'stale') return;
    if (r.state === 'complete') return void finish(true, on);
    if (r.state !== 'cancelled') {
      const end = await providers.jobEnd(api, j);
      if (!on() || end.state === 'stale') return;
      if (end.state === 'complete') return void finish(true, on);
      if (end.state !== 'signed_out') return setSt('unconfirmed');
    }
    job.current = null;
    then();
  };

  const halt = () => {
    stop.current.stopped = true;
    stop.current.wake?.();
  };

  const cancel = () => {
    const j = job.current;
    halt();
    if (!j) return back();
    void endJob(j, back);
  };

  // The followed job is cancelled, then a new attempt starts under a new key.
  const restart = () => {
    const j = job.current;
    halt();
    if (!j) return void start(true);
    void endJob(j, () => void start(true));
  };

  // "Check again": a job still held (its cancel or end never confirmed) is read, never dropped (checkHeldJob); without
  // one, the stored sign-in decides. Every Check supersedes older work, its login read included.
  const check = () => {
    const j = job.current;
    const g = ++gen.current;
    const on = () => live.current && g === gen.current;
    if (!j) return void finish(false, on);
    setSt('verifying');
    void providers.checkHeldJob(api, j, on, {
      complete: () => void finish(true, on),
      ended: () => void finish(false, on),
      pending: () => {
        stop.current = { stopped: false };
        void watch(j, on);
      },
      unknown: () => setSt('unconfirmed'),
    });
  };

  const link = code.uri ? providers.linkFor(code.uri, code.code ?? seen.current.code) : null;
  if (st === 'starting' || st === 'verifying' || st === 'busy') return <p className={s.muted}>{t(st === 'verifying' ? 'gpt.verifying' : st === 'busy' ? 'gpt.cancelling' : 'gpt.starting')}</p>;
  if (st === 'waiting') {
    return (
      <div className={s.stack}>
        <p>{t('gpt.steps')}</p>
        {code.code && (
          <SecretField
            label={t('gpt.code')}
            value={code.code}
            once={false}
            description={t('gpt.codeHint')}
            onWipe={() => {
              seen.current.wiped = true;
              setCode((x) => ({ ...x, code: null }));
            }}
          />
        )}
        <div className={s.actions}>
          {link && (
            <Button variant="primary" onPress={() => void openOutside(link)} iconEnd="external">
              {t('gpt.open')}
            </Button>
          )}
          {adopted && (
            <Button variant="secondary" onPress={restart}>
              {t('gpt.restart')}
            </Button>
          )}
          <Button variant="ghost" onPress={cancel}>
            {t('gpt.cancel')}
          </Button>
        </div>
        {!link && code.uri && <p className={`${s.muted} ${s.small}`}>{t('gpt.noLink')}</p>}
        <p className={`${s.muted} ${s.small}`}>{t('gpt.minutes')}</p>
        <p className={s.muted}>{t('gpt.waiting')}</p>
      </div>
    );
  }
  if (st === 'unconfirmed') {
    return (
      <div className={s.stack}>
        <OutcomeBanner kind="pending" title={t('gpt.unconfirmedTitle')} body={t('gpt.unconfirmed')} onCheck={check} />
        <Button variant="secondary" onPress={back}>
          {t('gpt.back')}
        </Button>
      </div>
    );
  }
  const backBtn = (
    <Button variant="ghost" onPress={back}>
      {t('gpt.back')}
    </Button>
  );
  if (st === 'failed' && refusal) {
    // The body is the page's own mapping of this rejection (failedText, from its code and status) when given, else
    // ErrorState's mapped sentence: never two mappings side by side.
    // Details carries every fact; facts that say pending override both (ErrorState).
    return <ErrorState size="sm" title={t('gpt.failedTitle')} body={msg || undefined} error={refusal} onRetry={() => void start(true)} secondary={backBtn} pendingSecondary={backBtn} />;
  }
  const body = st === 'expired' ? t('gpt.expired') : st === 'ended' ? t('gpt.ended') : st === 'signedout' ? t('gpt.signedOut') : msg || t('gpt.error');
  // noDetails: no rejection exists here: the job ended, the code ran out, or the poll answered an error state
  return (
    <EmptyState
      size="sm"
      icon="warn"
      title={t('gpt.failedTitle')}
      body={body}
      action={
        <Button variant="primary" onPress={() => void start(true)}>
          {t('gpt.again')}
        </Button>
      }
      secondary={backBtn}
    />
  );
}
