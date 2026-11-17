// PasswordSignIn.tsx: the standalone Hub's password sign-in and its 2FA step (core/signin.ts holds the rules).
// Returns what the sign-in card shows for it: the card's title and its body, with the one primary directly under the
// fields as the form's submit button (Enter in any field submits; the kit Form refuses while a request is out), and
// what sits under the card (FirstRun.tsx draws the card).
//
// Contract:
//   - Shown only once Hoody answered its config read and this file is new enough (FirstRun decides; same rule as the
//     access key).
//   - The password is held in the field's state only (kit SecretInput, with its Show toggle, wipes it when its context
//     ends) and emptied after every attempt that does not sign in. The 2FA temp token stays inside core/signin.ts's
//     step object.
//   - Leaving the screen (unmount) or starting again ends every attempt in flight: nothing of theirs is stored.
//   - `onBeforeSend` lets the page stop its other sign-in ways (the device flow) before a password goes out.
//   - `onProvider` / `providerBusy` go to "Create your account" (Signup.tsx), whose provider buttons start the page's
//     device flow.
//   - Every refusal is one sentence from strings.en.json; nothing the server said is shown.
//   - "Forgot password?" asks Hoody to email a reset link (core/signin.ts requestPasswordReset). The answer is the same
//     whether or not the address has an account; the link opens Hoody's own reset page, and the person comes back here
//     to sign in.
//   - "Forgot password?" is a text action under Sign in; "New to Hoody? Create an account" is a line under the card
//     (`below`), never a button beside Sign in. Create shows Signup.tsx in place of the sign-in form; back from it
//     prefills the address it used.
//   - `others`: the plain sign-in form is shown, so the card may offer its other ways under it.
//   - `focusTitle`: the state has no field (the reset link's "Check your email", sign-up's own), so the card's title
//     takes the focus when it appears.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Band, Button, Form, SecretInput, TextButton, TextField } from '@kit';
import { useStrings } from '@kit/strings';
import { cancelSignIn, passwordSignIn, requestPasswordReset, type ResetResult, type SignInProvider, type SignInRefusal, type SignInResult, type TwoFactorStep } from '@core/signin';
import { useSignup } from './Signup';
import { useFocusOnMount } from './focusOnMount';
import s from './FirstRun.module.css';
import { retryWords } from './retryWords';
import strings from './strings.en.json';

type Key = keyof typeof strings;

const RESET_REFUSED: Record<Exclude<Extract<ResetResult, { kind: 'refused' }>['why'], 'retry'>, Key> = {
  address: 'forgot.err.address',
  network: 'pw.err.network',
  unavailable: 'pw.err.unavailable',
  framed: 'pw.err.framed',
  'no-api': 'signIn.err.noApi',
};

const REFUSED: Record<Exclude<SignInRefusal, 'retry' | 'stale'>, Key> = {
  credentials: 'pw.err.credentials',
  unverified: 'pw.err.unverified',
  banned: 'pw.err.banned',
  otp: 'tfa.err.otp',
  expired: 'tfa.err.expired',
  ended: 'tfa.err.ended',
  network: 'pw.err.network',
  unavailable: 'pw.err.unavailable',
  framed: 'pw.err.framed',
  storage: 'signIn.err.storage',
  'no-api': 'signIn.err.noApi',
};

export interface PasswordSignInOptions {
  /** False while the page may not sign in. */
  enabled: boolean;
  onSignedIn: () => void;
  onBeforeSend: () => void;
  /** False: the sign-in form does not take the focus when it first appears (the card's title has it). */
  focusLogin?: boolean;
  /** A provider button on "Create your account" was pressed: the page starts its device flow (Signup.tsx). */
  onProvider?: (provider: SignInProvider) => void;
  /** The provider whose device sign-in is starting (its button shows busy). */
  providerBusy?: SignInProvider | null;
}

/** What the card shows: its title, its body, whether the plain sign-in form is up (`others`), and the line under the
 *  card (`below`); and `leavePassword`, for the screen to call when it leaves the password way for another one. */
export interface CardPart {
  title: string;
  body: ReactNode;
  others: boolean;
  below?: ReactNode;
  /** The state has no field: the card focuses its title (Card.tsx). */
  focusTitle?: boolean;
  /** Ends the password way: every sign-in in flight is cancelled (core/signin.ts cancelSignIn: its late answer is
   *  'stale', stores nothing and changes nothing here), a 2FA step already granted is dropped (its verify answers
   *  'stale' unsent), and the typed password and code are emptied. The address is kept. */
  leavePassword: () => void;
}

export function usePasswordSignIn({ enabled, onSignedIn, onBeforeSend, focusLogin = true, onProvider, providerBusy = null }: PasswordSignInOptions): CardPart {
  const t = useStrings(strings);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<TwoFactorStep | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<'login' | 'password' | 'code' | 'email' | null>(null);
  const [mode, setMode] = useState<'sign-in' | 'forgot' | 'sent' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  // While a request is out the kit Form locks its fields and its submit button (disabled), so the focused one loses the
  // focus to <body>. Every refusal therefore hands it back: to the field to fill again (Password on the sign-in step,
  // whatever the refusal; the code on the 2FA step; the address on the reset form). The kit SecretInput has no
  // focusOnError or input ref, so the password box is reached through this wrapper.
  const passwordBox = useRef<HTMLDivElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const [refocus, setRefocus] = useState<{ field: 'password' | 'code' | 'email'; n: number } | null>(null);
  const focusAgain = (field: 'password' | 'code' | 'email'): void => { setRefocus((p) => ({ field, n: (p?.n ?? 0) + 1 })); };
  useEffect(() => {
    if (!refocus) return;
    const el = refocus.field === 'password' ? passwordBox.current?.querySelector<HTMLInputElement>('input') : refocus.field === 'code' ? codeInput.current : emailInput.current;
    el?.focus();
  }, [refocus]);
  // First focus (as autoFocus, without the attribute: focusOnMount.ts): the login field when the sign-in form appears
  // (unless the card's title goes first), the address on the reset form, the code on the 2FA step.
  const loginFirst = useFocusOnMount<HTMLInputElement>(focusLogin);
  const emailFirst = useFocusOnMount(true, emailInput);
  const codeFirst = useFocusOnMount(true, codeInput);

  useEffect(() => () => { cancelSignIn(); }, []);

  const signup = useSignup({
    enabled,
    active: mode === 'sign-up',
    onBack: (address) => { if (address) setLogin(address); setMode('sign-in'); },
    onProvider,
    providerBusy,
    onOtherWay: onBeforeSend,
  });

  // A wait, said the same way on every step of this card (retryWords.ts).
  const waitText = (retryAfter: number | undefined): string => {
    const w = retryWords(retryAfter);
    return 'vars' in w ? t(w.key, w.vars) : t(w.key);
  };
  const textOf = (r: Extract<SignInResult, { kind: 'refused' }>): string | null => {
    if (r.why === 'stale') return null;
    // A lockout can last 15 minutes: from two minutes up the wait is said in minutes, beyond two hours as "later".
    if (r.why === 'retry') return waitText(r.retryAfter);
    return t(REFUSED[r.why]);
  };

  const settle = (r: SignInResult): void => {
    // An attempt this screen ended (left for reset or sign-up, started again, unmounted) changes nothing.
    if (r.kind === 'refused' && r.why === 'stale') return;
    setBusy(false);
    if (r.kind === 'signed-in') { setPassword(''); setCode(''); onSignedIn(); return; }
    if (r.kind === 'two-factor') { setPassword(''); setStep(r.step); setError(null); setFieldError(null); return; }
    const over = r.why === 'expired' || r.why === 'ended';
    if (over) { setStep(null); setCode(''); }
    if (r.why !== 'otp') setPassword('');
    setCode('');
    setError(textOf(r));
    setFieldError(r.why === 'otp' ? 'code' : r.why === 'credentials' ? 'password' : null);
    // A 2FA attempt that is over (it took too long, or it ended) is back on the password step; any other refusal stays on the step it was sent from.
    focusAgain(step && !over ? 'code' : 'password');
  };

  const leavePassword = (): void => {
    cancelSignIn();
    setBusy(false);
    setStep(null);
    setCode('');
    setPassword('');
    setError(null);
    setFieldError(null);
  };

  const openForgot = (): void => {
    onBeforeSend(); // one way at a time: a device sign-in in progress ends, so its late answer cannot replace the form
    leavePassword();
    setEmail(login.includes('@') ? login.trim() : '');
    setMode('forgot');
  };
  const openSignup = (): void => {
    onBeforeSend(); // one way at a time: a device sign-in in progress ends
    leavePassword();
    setMode('sign-up');
  };
  // Each reset request takes a number; Back moves it on, so an answer that comes back after the person left the reset
  // form (and maybe went on to sign-up) changes nothing: no 'sent' card, no busy sign-in form.
  const resetRun = useRef(0);
  const backToSignIn = (): void => {
    resetRun.current++;
    setBusy(false);
    setError(null);
    setFieldError(null);
    setMode('sign-in');
  };

  const sendReset = async (): Promise<void> => {
    if (!email.trim().includes('@')) { setFieldError('email'); setError(t('forgot.err.address')); return; }
    const mine = ++resetRun.current;
    setBusy(true);
    setError(null);
    setFieldError(null);
    const r = await requestPasswordReset(email);
    if (mine !== resetRun.current) return;
    setBusy(false);
    if (r.kind === 'sent') { setMode('sent'); return; }
    focusAgain('email');
    if (r.why === 'retry') { setError(waitText(r.retryAfter)); return; }
    setError(t(RESET_REFUSED[r.why]));
    if (r.why === 'address') setFieldError('email');
  };

  const submit = async (): Promise<void> => {
    if (busy || !enabled) return;
    if (mode === 'sent') { backToSignIn(); return; }
    if (mode === 'forgot') { await sendReset(); return; }
    if (step) {
      if (!code.trim()) { setFieldError('code'); setError(t('tfa.err.empty')); return; }
      setBusy(true);
      setError(null);
      settle(await step.verify(code));
      return;
    }
    if (!login.trim() || !password) {
      setFieldError(!login.trim() ? 'login' : 'password');
      setError(t('pw.err.empty'));
      if (login.trim()) focusAgain('password');
      return;
    }
    onBeforeSend();
    setBusy(true);
    setError(null);
    setFieldError(null);
    settle(await passwordSignIn(login, password));
  };

  const startAgain = leavePassword;
  // The card's one primary. Inside a Form it is the form's submit button, so Enter in a field submits too.
  // While a password is out, Sign in reads "Signing in…" (the Form refuses another submit meanwhile).
  const primary = (label: Key, inForm = true) => (
    <Button variant="primary" fullWidth busy={busy} isDisabled={!enabled} {...(inForm ? { type: 'submit' as const } : { onPress: () => { void submit(); } })}>
      {t(busy && label === 'signIn.start' ? 'signIn.busy' : label)}
    </Button>
  );

  if (mode === 'sign-up') return { ...signup, others: false, leavePassword };

  const errorBand = error && !fieldError ? <Band tone="warn" /* noDetails: a sign-in refusal mapped to one sentence */>{error}</Band> : null;
  if (mode === 'sent') {
    return {
      title: t('forgot.sentTitle'),
      leavePassword,
      others: false,
      focusTitle: true,
      body: (
        <>
          <p className={s.text}>{t('forgot.sent', { email: email.trim() })}</p>
          {primary('forgot.back', false)}
        </>
      ),
    };
  }
  if (mode === 'forgot') {
    return {
      title: t('forgot.title'),
      leavePassword,
      others: false,
      body: (
        <>
          <p className={s.text}>{t('forgot.lead')}</p>
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
            {primary('forgot.send')}
          </Form>
          <div className={s.links}>
            <TextButton onPress={backToSignIn}>{t('forgot.back')}</TextButton>
          </div>
        </>
      ),
    };
  }
  if (step) {
    return {
      title: t('tfa.title'),
      leavePassword,
      others: false,
      body: (
        <>
          <p className={s.text}>{t('tfa.lead')}</p>
          {errorBand}
          <Form onSubmit={() => { void submit(); }} busy={busy}>
            <TextField
              label={t('tfa.label')}
              value={code}
              onChange={(v) => { setCode(v); if (fieldError === 'code') { setFieldError(null); setError(null); } }}
              autoComplete="one-time-code"
              spellCheck="false"
              inputRef={codeFirst}
              isDisabled={!enabled}
              errorMessage={fieldError === 'code' ? error ?? undefined : undefined}
              focusOnError
            />
            {primary('tfa.verify')}
          </Form>
          <div className={s.links}>
            <TextButton onPress={startAgain}>{t('tfa.again')}</TextButton>
          </div>
        </>
      ),
    };
  }
  return {
    title: t('signIn.title'),
    others: true,
    leavePassword,
    body: (
      <>
        {errorBand}
        <Form onSubmit={() => { void submit(); }} busy={busy}>
          <TextField
            label={t('pw.login')}
            value={login}
            onChange={(v) => { setLogin(v); if (fieldError === 'login') { setFieldError(null); setError(null); } }}
            autoComplete="username"
            spellCheck="false"
            inputRef={loginFirst}
            isDisabled={!enabled}
            errorMessage={fieldError === 'login' ? error ?? undefined : undefined}
            focusOnError
          />
          <div ref={passwordBox}>
            <SecretInput
              kind="current-password"
              label={t('pw.password')}
              value={password}
              onChange={(v) => { setPassword(v); if (fieldError === 'password') { setFieldError(null); setError(null); } }}
              isDisabled={!enabled}
              errorMessage={fieldError === 'password' ? error ?? undefined : undefined}
            />
          </div>
          {primary('signIn.start')}
        </Form>
        <div className={s.end}>
          <TextButton onPress={openForgot}>{t('forgot.open')}</TextButton>
        </div>
      </>
    ),
    below: (
      <p className={s.below}>
        {t('up.prompt')} <TextButton onPress={openSignup}>{t('up.open')}</TextButton>
      </p>
    ),
  };
}
