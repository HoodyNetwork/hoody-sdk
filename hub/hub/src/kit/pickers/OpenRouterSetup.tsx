// OpenRouterSetup: OpenRouter's own sign-in in place (the AI page's step is an adapter over this). The agent runs OpenRouter's sign-in on the computer; OpenRouter then sends the browser to
// localhost on the person's own machine, a page that does not load, so the person pastes that page's address here
// (masked, never shown back) and the code in it is sent once. What was typed leaves the field the moment it is
// accepted for sending and is dropped with the step; closing the step cancels this attempt's job, a start still on
// its way included (a job followed from another attempt is left running), and a cancel whose answer and job's end stay
// unknown leaves the unknown toast (signinLeave). "Signed in" comes only from the job's own end, or from the stored
// sign-in when there was none before this attempt; a job that times out or disappears is "may have gone through",
// never failed. Check again only reads (C9): a start whose answer was lost is never sent again from it.
// Offered only when the computer's agent lists `signin` for openrouter (ProviderSetup `signin`).
import { providers } from '@core';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../controls/Button';
import { SecretInput } from '../forms/more';
import { openOutside } from '../states/openOutside';
import { EmptyState, ErrorState, OutcomeBanner } from '../states/States';
import { useStrings } from '../strings';
import strings from './ProviderSetup.strings.en.json';
import { leaveSignIn } from './signinLeave';
import s from './ProviderSetup.module.css';

const PID = 'openrouter';

type St = 'starting' | 'waiting' | 'finishing' | 'busy' | 'unconfirmed' | 'failed' | 'signedout' | 'ended';
type Why = 'empty' | 'no_code' | 'key' | null;

export interface OpenRouterSetupProps {
  api: providers.ProvidersApi;
  env: providers.Env;
  /** The caller's words for a refusal (a failed start, a refused code); the kit's sentence otherwise. */
  failedText?: (err: providers.Outcome) => string;
  /** Signed in: the job ended complete, or a sign-in is stored that was not there before this attempt. The caller re-reads. */
  onSigned: () => void;
  /** Leave the step (a cancelled sign-in, or Back). */
  onBack: () => void;
}

export function OpenRouterSetup({ api, env, failedText, onSigned, onBack }: OpenRouterSetupProps) {
  const t = useStrings(strings);
  const [st, setSt] = useState<St>('starting');
  const [uri, setUri] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [why, setWhy] = useState<Why>(null);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  // The agent's refusal of the start: its words and Details show with the failed state.
  const [refusal, setRefusal] = useState<providers.Outcome | null>(null);
  const job = useRef<string | null>(null);
  // The code was accepted for sending to this job: from then on it is never sent again, whatever happens to the answer
  // (lost, late, or after the poll ran out of time); the job decides. Only a definite refusal of that same send,
  // answered while it is still the step's current one, lets the person paste again.
  const sent = useRef(false);
  // A send in flight: a second press (a double click lands before the re-render) sends nothing.
  const inflight = useRef(false);
  const stop = useRef<providers.Stop>({ stopped: false });
  const live = useRef(true);
  // The scope (account, realm, computer) this step runs in, taken as it mounts: what its leave says belongs to it.
  const stepScope = useRef<providers.StepScope | null>(null);
  // Bumped by every start, cancel and end of a job: an answer that comes back after it is read by nobody.
  const gen = useRef(0);
  // Whether OpenRouter was already signed in before this attempt: then a stored sign-in proves nothing about it.
  const before = useRef<boolean | null>(null);
  // The job is another attempt's (the agent named it when refusing a second sign-in): followed, never stopped on leaving.
  const [adopted, setAdopted] = useState(false);
  const followed = useRef(false);
  const adopt = (v: boolean) => {
    followed.current = v;
    setAdopted(v);
  };

  const signed = () => {
    gen.current++;
    job.current = null;
    onSigned();
  };

  // A job whose end nobody saw (the poll ran out of time, the job is gone): "may have gone through", never failed.
  const unknown = () => {
    gen.current++;
    stop.current.stopped = true;
    stop.current.wake?.();
    setSt('unconfirmed');
  };

  const follow = async (j: string) => {
    const g = ++gen.current;
    stop.current = { stopped: false };
    setSt(sent.current ? 'finishing' : 'waiting');
    const p = await providers.pkcePoll(api, env, PID, j, (x) => setUri((u) => x.uri ?? u), stop.current);
    if (!live.current || g !== gen.current) return;
    if (p.state === 'complete') return signed();
    if (p.state === 'stopped' || p.state === 'stale') return;
    if (p.state === 'expired') return unknown();
    if (p.state === 'gone') {
      job.current = null;
      return unknown();
    }
    gen.current++;
    job.current = null;
    // Cancelled elsewhere: the same words as the ChatGPT sign-in.
    if (p.state === 'cancelled') return setSt('ended');
    setMsg(t('or.error'));
    setSt('failed');
  };

  const start = async () => {
    const g = ++gen.current;
    sent.current = false;
    job.current = null;
    adopt(false);
    setSt('starting');
    setRefusal(null);
    setUri(null);
    setText('');
    setWhy(null);
    setMsg('');
    const b = await providers.signedInTo(api, PID);
    if (!live.current || g !== gen.current || b.state === 'stale') return;
    before.current = b.state === 'signed_in' ? true : b.state === 'signed_out' ? false : null;
    // One key per start: a lost answer is replayed once with it (pkceStart), never from Check again. A later start
    // under a new key meets the job a lost one made as one in progress, and follows it.
    const r = await providers.pkceStart(api, PID, { idem: env.newKey(), another: false, replay: false }, () => live.current);
    // Closed while the start was on its way: the job it made is cancelled, never left running for 15 minutes, and the
    // cancel's answer is read as on any leave (signinLeave: a lost one whose job is still open leaves the unknown toast).
    if (!live.current) {
      const sc = stepScope.current;
      if (r.state === 'job' && sc) void leaveSignIn(sc, 'OpenRouter', () => providers.pkceCancel(api, PID, r.job), () => providers.pkceJobEnd(api, PID, r.job));
      return;
    }
    if (g !== gen.current || r.state === 'stale') return;
    if (r.state === 'failed') {
      setMsg(r.err.code === 'oauth_unsupported' ? t('or.unsupported') : (failedText?.(r.err) ?? ''));
      setRefusal(r.err);
      return setSt('failed');
    }
    if (r.state === 'not_confirmed') return setSt('unconfirmed');
    job.current = r.job;
    if (r.state === 'job') setUri(r.uri);
    else adopt(true);
    await follow(r.job);
  };

  useEffect(() => {
    live.current = true;
    const sc = providers.stepScope();
    stepScope.current = sc;
    void start();
    const stopRef = stop;
    const jobRef = job;
    const followedRef = followed;
    return () => {
      live.current = false;
      stopRef.current.stopped = true;
      stopRef.current.wake?.();
      // Leaving cancels this attempt's job and reads the answer (signinLeave); nothing typed here is kept. A followed
      // job is another attempt's.
      const j = jobRef.current;
      if (j && !followedRef.current) void leaveSignIn(sc, 'OpenRouter', () => providers.pkceCancel(api, PID, j), () => providers.pkceJobEnd(api, PID, j));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async () => {
    const j = job.current;
    if (!j || sent.current || inflight.current) return;
    const g = gen.current;
    const input = { text };
    inflight.current = true;
    const pending = providers.pkceSubmit(api, PID, j, input).finally(() => void (inflight.current = false));
    // pkceSubmit clears input.text the moment it accepts the text for sending: the field and its state drop it now,
    // not when the answer comes back.
    setText(input.text);
    // Accepted for sending: there was text, and pkceSubmit took it (an empty field is refused, nothing is sent).
    if (text !== '' && input.text === '') {
      sent.current = true;
      setSending(true);
    }
    const r = await pending;
    if (!live.current) return;
    setSending(false);
    // A cancel, a new start, the job's end or a timeout came first: this answer changes nothing, and a code accepted
    // for sending stays sent.
    if (g !== gen.current || job.current !== j || r.state === 'stale') return;
    if (r.state === 'refused') return setWhy(r.why);
    setWhy(null);
    if (r.state === 'failed') {
      // The agent refused the code and did not take it: the person may paste again.
      sent.current = false;
      setMsg(failedText?.(r.err) ?? t('or.codeFailed'));
      return;
    }
    if (r.state === 'gone') {
      job.current = null;
      return unknown();
    }
    // sent, already fed, or a lost answer: the poll that is running says how it ended.
    setMsg('');
    setSt('finishing');
  };

  // Cancels the job, then `then` once it saved nothing. A sign-in that won the race is kept; a lost cancel answer
  // reads the job's own end, and an end still unknown is "not confirmed" (Check again), never a new step.
  const endJob = async (j: string, then: () => void) => {
    const g = ++gen.current;
    setSt('busy');
    const r = await providers.pkceCancel(api, PID, j);
    if (!live.current || g !== gen.current || r.state === 'stale') return;
    if (r.state === 'complete') return signed();
    if (r.state !== 'cancelled') {
      const end = await providers.pkceJobEnd(api, PID, j);
      if (!live.current || g !== gen.current || end.state === 'stale') return;
      if (end.state === 'complete') return signed();
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
    if (!j) return onBack();
    void endJob(j, onBack);
  };

  // The followed job is cancelled, then a new attempt starts under a new key.
  const restart = () => {
    const j = job.current;
    halt();
    if (!j) return void start();
    void endJob(j, () => void start());
  };


  // "Check again" only reads (C9): a job still there is read (still waiting: follow it again); without one (a lost
  // start included), the stored sign-in decides, only when there was none before this attempt.
  const check = async () => {
    const g = ++gen.current;
    const j = job.current;
    if (j) {
      const end = await providers.pkceJobEnd(api, PID, j);
      if (!live.current || g !== gen.current || end.state === 'stale') return;
      if (end.state === 'complete') return signed();
      if (end.state === 'signed_out') {
        job.current = null;
        return setSt('signedout');
      }
      if (end.state === 'pending') return follow(j);
    }
    const a = await providers.signedInTo(api, PID);
    if (!live.current || g !== gen.current || a.state === 'stale') return;
    if (a.state === 'signed_in' && before.current === false) return signed();
    setSt('unconfirmed');
  };

  const link = uri ? providers.pkceLink(PID, uri) : null;
  if (st === 'starting' || st === 'busy') return <p className={s.muted}>{t(st === 'busy' ? 'gpt.cancelling' : 'gpt.starting')}</p>;
  if (st === 'waiting' || st === 'finishing') {
    return (
      <div className={s.stack}>
        <ol className={s.steps}>
          <li>{t('or.step1')}</li>
          <li>{t('or.step2')}</li>
          <li>{t('or.step3')}</li>
        </ol>
        {link && (
          <div className={s.actions}>
            <Button variant="secondary" onPress={() => void openOutside(link)} iconEnd="external">
              {t('or.open')}
            </Button>
          </div>
        )}
        {!link && uri && <p className={`${s.muted} ${s.small}`}>{t('or.noLink')}</p>}
        {st === 'waiting' ? (
          <SecretInput
            label={t('or.paste')}
            description={t('or.pasteHint')}
            value={text}
            onChange={(v) => {
              setText(v);
              setWhy(null);
              setMsg('');
            }}
            reveal={false}
            isDisabled={sending}
            errorMessage={why ? t(why === 'empty' ? 'or.empty' : why === 'key' ? 'or.key' : 'or.noCode') : msg || undefined}
          />
        ) : (
          <p className={s.muted}>{t('or.finishing')}</p>
        )}
        {/* The same row in both states: the second click of a double click on Finish lands on Finish (now off), never on Cancel. */}
        <div className={s.actions}>
          <Button variant="primary" onPress={() => void finish()} isDisabled={st !== 'waiting' || sending || !job.current}>
            {t('or.finish')}
          </Button>
          {adopted && st === 'waiting' && (
            <Button variant="secondary" onPress={restart}>
              {t('gpt.restart')}
            </Button>
          )}
          <Button variant="ghost" onPress={cancel}>
            {t('gpt.cancel')}
          </Button>
        </div>
        {st === 'waiting' && <p className={`${s.muted} ${s.small}`}>{t('or.minutes')}</p>}
      </div>
    );
  }
  if (st === 'unconfirmed') {
    return (
      <div className={s.stack}>
        <OutcomeBanner
          kind="pending"
          title={t('gpt.unconfirmedTitle')}
          body={t('gpt.unconfirmed')}
          onCheck={() => void check()}
          /* noDetails: no rejection exists here: an answer was lost, the poll ran out of time or the job disappeared */
        />
        <Button variant="secondary" onPress={onBack}>
          {t('gpt.back')}
        </Button>
      </div>
    );
  }
  const backBtn = (
    <Button variant="ghost" onPress={onBack}>
      {t('gpt.back')}
    </Button>
  );
  if (st === 'failed' && refusal) {
    // The body is the page's own mapping of this rejection (failedText, from its code and status; or.unsupported for
    // oauth_unsupported) when given, else ErrorState's mapped sentence: never two mappings side by side.
    // Details carries every fact; facts that say pending override both (ErrorState).
    return <ErrorState size="sm" title={t('gpt.failedTitle')} body={msg || undefined} error={refusal} onRetry={() => void start()} secondary={backBtn} pendingSecondary={backBtn} />;
  }
  const body = st === 'signedout' ? t('gpt.signedOut') : st === 'ended' ? t('gpt.ended') : msg || t('or.error');
  // noDetails: no rejection exists here: the job ended or was cancelled, or the poll answered an error state
  return (
    <EmptyState
      size="sm"
      icon="warn"
      title={t('gpt.failedTitle')}
      body={body}
      action={
        <Button variant="primary" onPress={() => void start()}>
          {t('gpt.again')}
        </Button>
      }
      secondary={backBtn}
    />
  );
}
