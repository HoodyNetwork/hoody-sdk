// ChatGPT sign-in by device code. The code and the link live only while this step is open; closing it
// cancels this attempt's job (a job followed from another attempt is left running) and reads the answer (`leave`). A cancel that races a finished sign-in reads the job's end before it says anything.
import { providers } from '@core';
import { Button, EmptyState, OutcomeBanner, SecretField, closeToast, showToast, openOutside, useStrings } from '@kit';
import { useEffect, useRef, useState } from 'react';
import type { Stop } from '../api';
import { checkHeldJob, codeOf, deviceCancel, devicePoll, deviceStart, jobEnd, linkFor, signedIn, type DeviceCode, type Plan } from '../flows-oauth';
import strings from '../strings.en.json';
import { errorText } from '../words';
import { useAi } from './ctx';
import s from './parts.module.css';

type St = 'starting' | 'waiting' | 'verifying' | 'busy' | 'ended' | 'unconfirmed' | 'failed' | 'expired' | 'signedout';

export function GptStep({ onSigned, onBack }: { onSigned: () => void; onBack: () => void }) {
  const t = useStrings(strings);
  const { api, env, reload } = useAi();
  const [st, setSt] = useState<St>('starting');
  const [code, setCode] = useState<DeviceCode>({ code: null, uri: null });
  const [msg, setMsg] = useState('');
  const job = useRef<string | null>(null);
  // The last code seen stays here after a wipe: the link filter still hides a link that carries it, and a later poll
  // cannot bring it back. It belongs to its job: another job's code is shown afresh.
  const seen = useRef<{ job: string | null; code: string | null; wiped: boolean }>({ job: null, code: null, wiped: false });
  const stop = useRef<Stop>({ stopped: false });
  const live = useRef(true);
  // Whether a login was already stored before this attempt: then "signed in" proves nothing about it.
  const before = useRef<boolean | null>(null);

  // `on`: the caller's own fence, read again once the login is read.
  const finish = async (on: () => boolean) => {
    job.current = null;
    setSt('verifying');
    const r = await signedIn(api);
    if (!on() || r.state === 'stale') return;
    if (r.state === 'signed_in' && before.current === true) setSt('unconfirmed');
    else if (r.state === 'signed_in') {
      reload();
      onSigned();
    } else setSt(r.state === 'signed_out' ? 'signedout' : 'unconfirmed');
  };

  // One attempt is one Idempotency-Key: a start run again under the same attempt (the dev build mounts twice) replays
  // the same job, where a new key would meet that job as a sign-in already in progress. Only "start again" mints a key.
  const plan = useRef<Plan | null>(null);
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
    follow(false);
    setSt('starting');
    setCode({ code: null, uri: null });
    const b = await signedIn(api);
    if (!on() || b.state === 'stale') return;
    before.current = b.state === 'signed_in' ? true : b.state === 'signed_out' ? false : null;
    if (fresh || !plan.current) plan.current = { idem: env.newKey(), another: false, replay: false };
    else plan.current.replay = false;
    const r = await deviceStart(api, plan.current, on);
    // Left while starting: the job this start made is cancelled too (one already in progress is not ours to stop). A
    // start run again under the same attempt replays the same job, so a superseded start leaves it to that one.
    if (!live.current && r.state === 'job') void deviceCancel(api, r.job);
    if (!on() || r.state === 'stale') return;
    if (r.state === 'failed') {
      setMsg(errorText(r.err, { write: true }).text);
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
    const p = await devicePoll(api, env, j, (c) => {
      if (c.code && !seen.current.wiped) seen.current.code = c.code;
      setCode((x) => ({ code: seen.current.wiped ? null : (c.code ?? x.code), uri: c.uri ?? x.uri }));
    }, stop.current);
    if (!on()) return;
    if (p.state === 'complete') return void finish(on);
    if (p.state === 'stopped' || p.state === 'stale') return;
    job.current = null;
    // The job ending may be a finished sign-in (done in another tab): read the login before showing an end.
    // C9: only a login new since the start is a sign-in, and only a login read as signed out is the end; an unreadable
    // login, or one stored when the attempt began or whose start was never read, may have gone through.
    if (p.state === 'expired' || p.state === 'gone') {
      const r = await signedIn(api);
      if (!on() || r.state === 'stale') return;
      if (r.state === 'signed_in' && before.current === false) {
        reload();
        return onSigned();
      }
      if (r.state !== 'signed_out') return setSt('unconfirmed');
    }
    setSt(p.state === 'expired' ? 'expired' : p.state === 'gone' || p.state === 'cancelled' ? 'ended' : 'failed');
    if (p.state === 'error') setMsg(t('gpt.error'));
  };

  // The step left while its job ran: its cancel's answer is read, never dropped, as the kit's ChatGptSetup reads it
  // (kit signinLeave, which a page cannot import). Cancelled, or a job read as ended: nothing to
  // say. A sign-in that won the race re-reads the page, so it shows connected. Neither known (the cancel's answer lost
  // and the job's end unreadable, or the job still open): the C9 unknown toast, whose Check again only reads the job's
  // end and closes once it is known (a sign-in proved there re-reads the page too). All of it belongs to the scope the
  // step ran in (account, realm, computer): once that ends nothing shows, and an open toast closes.
  const leave = async (sc: providers.StepScope, j: string) => {
    const r = await deviceCancel(api, j);
    if (r.state === 'cancelled' || r.state === 'stale' || !providers.stepScopeLive(sc)) return;
    if (r.state === 'complete') return reload();
    const e = await jobEnd(api, j);
    if (e.state === 'stale' || e.state === 'signed_out' || !providers.stepScopeLive(sc)) return;
    if (e.state === 'complete') return reload();
    let off = () => {};
    const id = showToast({
      // noDetails: the cancel's answer never came and the job's end is not known, so there is no rejection to show
      tone: 'unknown',
      title: t('gpt.leftTitle', { provider: 'ChatGPT' }),
      body: t('gpt.leftBody'),
      action: {
        label: t('gpt.leftCheck'),
        // Known (complete or ended): the toast closes. Unreadable: "couldn't check". Still open: as it was.
        onAction: async () => {
          const x = await jobEnd(api, j);
          if (!providers.stepScopeLive(sc) || x.state === 'stale') return undefined;
          if (x.state === 'complete' || x.state === 'signed_out') {
            off();
            if (x.state === 'complete') reload();
            return true;
          }
          return x.state === 'pending' ? undefined : false;
        },
      },
    });
    off = providers.watchStepScope(sc, () => closeToast(id));
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
      // Leaving cancels this attempt's job and reads the answer (`leave`); nothing here is kept. A followed job is
      // another attempt's.
      const j = jobRef.current;
      if (j && !followedRef.current) void leave(sc, j);
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
    const r = await deviceCancel(api, j);
    if (!on() || r.state === 'stale') return;
    if (r.state === 'complete') return void finish(on);
    if (r.state !== 'cancelled') {
      const end = await jobEnd(api, j);
      if (!on() || end.state === 'stale') return;
      if (end.state === 'complete') return void finish(on);
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
    if (!j) return void start(true);
    void endJob(j, () => void start(true));
  };

  // "Check again": a job still held (its cancel or end never confirmed) is read, never dropped (checkHeldJob); without
  // one, the stored sign-in decides. Every Check supersedes older work, its login read included.
  const check = () => {
    const j = job.current;
    const g = ++gen.current;
    const on = () => live.current && g === gen.current;
    if (!j) return void finish(on);
    setSt('verifying');
    void checkHeldJob(api, j, on, {
      complete: () => void finish(on),
      ended: () => void finish(on),
      pending: () => {
        stop.current = { stopped: false };
        void watch(j, on);
      },
      unknown: () => setSt('unconfirmed'),
    });
  };

  const link = code.uri ? linkFor(code.uri, code.code ?? seen.current.code) : null;
  if (st === 'starting' || st === 'verifying' || st === 'busy') return <p className={s.muted}>{t(st === 'verifying' ? 'gpt.verifying' : st === 'busy' ? 'gpt.cancelling' : 'gpt.starting')}</p>;
  if (st === 'waiting') {
    return (
      <div className={s.stack}>
        <p>{t('gpt.steps')}</p>
        {code.code && <SecretField label={t('gpt.code')} value={code.code} once={false} description={t('gpt.codeHint')} onWipe={() => {
            seen.current.wiped = true;
            setCode((x) => ({ ...x, code: null }));
          }} />}
        <div className={s.actions}>
          {link && (
            <Button variant="primary" onPress={() => { openOutside(link); }} iconEnd="external">
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
        <Button variant="secondary" onPress={onBack}>
          {t('connect.back')}
        </Button>
      </div>
    );
  }
  const body = st === 'expired' ? t('gpt.expired') : st === 'ended' ? t('gpt.ended') : st === 'signedout' ? t('gpt.signedOut') : msg || t('gpt.error');
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
      secondary={
        <Button variant="ghost" onPress={onBack}>
          {t('connect.back')}
        </Button>
      }
    />
  );
}

export { codeOf };
