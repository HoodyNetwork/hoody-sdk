// Signup.tsx: the standalone Hub's "Create an account" (core/signin.ts startSignup holds the rules). Returns the card's
// title and body (the one primary directly under the fields), like usePasswordSignIn, which shows it in its 'sign-up'
// mode.
//
// Contract:
//   - Reads GET /auth/config when opened: sign-up closed shows one sentence and no form; the invite code field shows
//     only where Hoody asks for one. Unreadable config = the form, and the request's answer decides.
//   - Under the form, after a line, one "Continue with GitHub" / "Continue with Google" button per provider that read
//     names (ProviderWays.tsx), only while sign-up is open and none while it is unread or unreadable. A press empties
//     the typed password and hands the provider to the page (`onProvider`), which starts its device flow: the account
//     is made with that provider on Hoody's own page. Disabled while an account request is out.
//   - Under the Create account button, one sentence: creating an account agrees to the Terms and the Privacy Policy,
//     each a link to Hoody's site in a new tab (core/site.ts), underlined: in muted text colour alone does not set a link apart. It stands above the provider buttons, which make an
//     account too. Only beside the form: not on sign-in, the check, "check your email" or sign-up closed.
//   - The password must pass the API's rule before anything is sent (passwordFitsRule). It lives in the field's state
//     only (kit SecretInput, with its Show toggle) and is emptied when the request ends, whatever the answer: nothing
//     keeps it after sign-up.
//   - A check (CHALLENGE_REQUIRED) is done on Hoody's own page in a new tab (link + the match code to compare); this
//     screen keeps asking until it passes. Leaving the screen or Cancel stops asking.
//   - Success is "check your email" (the answer is the same for a new and a known address). The person opens the
//     link, then signs in here; "Send the email again" asks again (same answer for every address).
//   - Focus: the form's address when it appears; a state with no field (the check, "check your email", sign-up
//     closed) sets `focusTitle`, so the card's title takes it. A refusal hands it back to the form: the address when
//     Hoody refused its domain, else the password, which every request empties.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Band, Button, Facts, Form, Link, LinkButton, SecretInput, StatusLine, TextButton, TextField } from '@kit';
import { useStringParts, useStrings } from '@kit/strings';
import { LEGAL } from '@core/site';
import { passwordFitsRule, readSignupConfig, resendVerification, startSignup, type ResetResult, type SignInProvider, type SignupRefusal, type SignupRun, type SignupState } from '@core/signin';
import s from './FirstRun.module.css';
import { useFocusOnMount } from './focusOnMount';
import { ProviderWays } from './ProviderWays';
import { retryWords } from './retryWords';
import strings from './strings.en.json';

type Key = keyof typeof strings;

const REFUSED: Record<Exclude<SignupRefusal, 'retry' | 'stopped'>, Key> = {
  invalid: 'up.err.invalid',
  domain: 'up.err.domain',
  closed: 'up.closed',
  paused: 'up.err.paused',
  'challenge-expired': 'up.err.challenge',
  network: 'pw.err.network',
  unavailable: 'up.err.unavailable',
  framed: 'pw.err.framed',
  'no-api': 'signIn.err.noApi',
};

export interface SignupOptions {
  enabled: boolean;
  /** True while the sign-up screen is the one shown. */
  active: boolean;
  /** Back to sign in, with the address to prefill (empty when none was sent). */
  onBack: (email: string) => void;
  /** A provider button was pressed: the page starts its device flow with it. Without it, no provider button. */
  onProvider?: (provider: SignInProvider) => void;
  /** The provider whose device sign-in is starting (its button shows busy). */
  providerBusy?: SignInProvider | null;
  /** Ends the page's other sign-in ways (a device flow a provider press started): called before an account request
   *  goes out and on Back, so a late device answer never covers the way the person chose. */
  onOtherWay?: () => void;
}

export function useSignup({ enabled, active, onBack, onProvider, providerBusy = null, onOtherWay }: SignupOptions): { title: string; body: ReactNode; focusTitle?: boolean } {
  const t = useStrings(strings);
  const tp = useStringParts(strings);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [config, setConfig] = useState<{ open: boolean; invite: boolean; providers: readonly SignInProvider[] } | null | 'reading'>('reading');
  const [state, setState] = useState<SignupState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<'email' | 'password' | null>(null);
  const [resent, setResent] = useState<string | null>(null);
  const run = useRef<SignupRun | null>(null);
  // First focus on the address when the form appears (as autoFocus, without the attribute: focusOnMount.ts).
  const emailFirst = useFocusOnMount<HTMLInputElement>(true);
  // While a request is out the kit Form locks its fields (disabled), so the focus falls to <body>. A refusal other than
  // the domain's (the address field's own focusOnError) refocuses the password; the kit SecretInput has no focusOnError
  // or input ref, so its box is reached through a wrapper.
  const passwordBox = useRef<HTMLDivElement>(null);
  const [refocus, setRefocus] = useState(0);
  useEffect(() => {
    if (refocus > 0) passwordBox.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [refocus]);

  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    setConfig('reading');
    void readSignupConfig().then((c) => { if (live) setConfig(c); });
    return () => { live = false; run.current?.stop(); run.current = null; };
  }, [active]);

  // A wait, said the same way on every step of this card (retryWords.ts).
  const waitText = (retryAfter: number | undefined): string => {
    const w = retryWords(retryAfter);
    return 'vars' in w ? t(w.key, w.vars) : t(w.key);
  };
  const busy = state?.kind === 'sending' || state?.kind === 'challenge';
  const closed = config !== null && config !== 'reading' && !config.open;

  const submit = async (): Promise<void> => {
    if (!enabled || busy || closed) return;
    if (state?.kind === 'sent') { back(); return; }
    if (!email.trim().includes('@')) { setFieldError('email'); setError(t('forgot.err.address')); return; }
    if (!passwordFitsRule(password)) { setFieldError('password'); setError(t('up.err.rule')); return; }
    setError(null);
    setFieldError(null);
    setResent(null);
    onOtherWay?.(); // one way at a time: a device sign-in still starting ends
    const r = startSignup({ email, password, inviteCode: invite }, setState);
    run.current = r;
    const end = await r.done;
    // A run ended by Cancel, Back or leaving the screen settles late: cancel() already dropped its password, and what
    // the field holds now was typed afterwards, so the old run changes nothing.
    if (run.current !== r) return;
    run.current = null;
    setPassword('');
    if (end.kind !== 'refused' || end.why === 'stopped') return;
    setError(end.why === 'retry' ? waitText(end.retryAfter) : t(REFUSED[end.why]));
    if (end.why === 'domain' || end.why === 'invalid') setFieldError(end.why === 'domain' ? 'email' : null);
    if (end.why !== 'domain') setRefocus((n) => n + 1);
  };

  const cancel = (): void => {
    run.current?.stop();
    run.current = null;
    setState(null);
    setPassword('');
  };

  const back = (): void => {
    onOtherWay?.();
    cancel();
    setError(null);
    setFieldError(null);
    setResent(null);
    onBack(state?.kind === 'sent' ? email.trim() : '');
  };

  // One way at a time: no account request is out (the buttons are disabled then); the typed password is emptied.
  const withProvider = (provider: SignInProvider): void => {
    if (!enabled || busy || !onProvider) return;
    setPassword('');
    setError(null);
    setFieldError(null);
    onProvider(provider);
  };
  const providers = config !== null && config !== 'reading' ? config.providers : [];

  const resend = async (): Promise<void> => {
    const r: ResetResult = await resendVerification(email);
    if (r.kind === 'sent') { setResent(t('up.resent')); return; }
    setResent(r.why === 'retry' ? waitText(r.retryAfter) : t('pw.err.unavailable'));
  };

  const errorBand = error && !fieldError ? <Band tone="warn" /* noDetails: a sign-up refusal mapped to one sentence */>{error}</Band> : null;
  if (state?.kind === 'sent') {
    return {
      title: t('up.sentTitle'),
      focusTitle: true,
      body: (
        <>
          <p className={s.text}>{t('up.sent', { email: email.trim() })}</p>
          <Button variant="primary" fullWidth onPress={back}>{t('forgot.back')}</Button>
          <StatusLine>{resent}</StatusLine>
          <div className={s.links}>
            <TextButton onPress={() => { void resend(); }}>{t('up.resend')}</TextButton>
          </div>
        </>
      ),
    };
  }
  if (state?.kind === 'challenge') {
    return {
      title: t('up.checkTitle'),
      focusTitle: true,
      body: (
        <>
          <p className={s.text}>{t('up.checkLead')}</p>
          {state.matchCode && <Facts columns={1} layout="spec" items={[{ label: t('up.match'), value: <span translate="no">{state.matchCode}</span> }]} />}
          <LinkButton href={state.url} target="_blank" rel="noopener noreferrer" variant="primary">{t('up.openCheck')}</LinkButton>
          <StatusLine>{t('up.waiting')}</StatusLine>
          <div className={s.links}>
            <TextButton onPress={cancel}>{t('up.cancel')}</TextButton>
          </div>
        </>
      ),
    };
  }
  if (closed) {
    return {
      title: t('up.title'),
      focusTitle: true,
      body: (
        <>
          <p className={s.text}>{t('up.closed')}</p>
          <Button variant="primary" fullWidth onPress={back}>{t('forgot.back')}</Button>
        </>
      ),
    };
  }
  return {
    title: t('up.title'),
    body: (
      <>
        <p className={s.text}>{t('up.lead')}</p>
        {errorBand}
        <Form onSubmit={() => { void submit(); }} busy={busy}>
          <TextField
            label={t('forgot.email')}
            type="email"
            value={email}
            onChange={(v) => { setEmail(v); if (fieldError === 'email') { setFieldError(null); setError(null); } }}
            autoComplete="email"
            spellCheck="false"
            inputRef={emailFirst}
            isDisabled={!enabled}
            errorMessage={fieldError === 'email' ? error ?? undefined : undefined}
            focusOnError
          />
          <div ref={passwordBox}>
            <SecretInput
              kind="new-password"
              label={t('pw.password')}
              value={password}
              onChange={(v) => { setPassword(v); if (fieldError === 'password') { setFieldError(null); setError(null); } }}
              description={t('up.rule')}
              isDisabled={!enabled}
              errorMessage={fieldError === 'password' ? error ?? undefined : undefined}
            />
          </div>
          {config !== null && config !== 'reading' && config.invite && (
            <TextField label={t('up.invite')} value={invite} onChange={setInvite} spellCheck="false" description={t('up.inviteLead')} isDisabled={!enabled} />
          )}
          <Button variant="primary" fullWidth type="submit" busy={busy} isDisabled={!enabled || config === 'reading'}>
            {t('up.create')}
          </Button>
        </Form>
        <p className={s.legal}>
          {tp('up.legal', { terms: <Link href={LEGAL.terms} underlined>{t('up.legalTerms')}</Link>, privacy: <Link href={LEGAL.privacy} underlined>{t('up.legalPrivacy')}</Link> })}
        </p>
        {onProvider && providers.length > 0 && (
          <div className={s.others}>
            <ProviderWays providers={providers} busy={providerBusy} isDisabled={!enabled || busy} onStart={withProvider} />
          </div>
        )}
        <div className={s.links}>
          <TextButton onPress={back}>{t('up.haveAccount')}</TextButton>
        </div>
      </>
    ),
  };
}
