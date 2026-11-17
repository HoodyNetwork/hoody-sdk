// FirstRun.tsx: the standalone Hub's sign-in card, shown instead of the Hub until a session is stored for this file's
// Hoody (boot.ts decides). The file knows its Hoody: nobody types an address.
//
// Contract:
//   - One centred card (Card.tsx): Hoody's mark and word, the state's title as the one h1, the state's body with its one
//     primary directly under its fields. No stepper, no page header, no footer, no Back.
//   - A page shown inside another page draws only the card's frame, one sentence and "Open in a new tab": no field, no
//     sign-in way, no request (device.ts and token.ts refuse there too, before any request).
//   - The Hoody is boot.ts's choice (shared.js standaloneChoice). The card names a host only when that choice is not the
//     built-in one (Card.tsx).
//   - Before any sign-in way: GET <origin>/api/v1/hub/config (no credential) answers, then the Hoody is named through
//     shared.js (origin.ts setStandaloneApi). Until it answered: "Connecting to Hoody…". Any failed read offers no
//     sign-in way at all, whatever record is stored, only "Try again": no answer or a timeout is "Can't reach Hoody"
//     (check the connection); an answer that is not the config (a refusal such as a 404, a wrong body) is "Hoody can't
//     open this Hub right now".
//   - Sign-in: email or user name and password, with the 2FA step (PasswordSignIn.tsx, core/signin.ts). Sign in is the
//     card's one primary, the form's submit button (Enter in a field submits). "Forgot password?" is a text action under
//     it; "New to Hoody? Create an account" a line under the card. Under a line: one "Continue with GitHub" /
//     "Continue with Google" button per provider Hoody's /auth/config offers (ProviderWays.tsx; read once Hoody answered
//     its config, none when that read fails) and, under them, one line: continuing with a provider agrees to the Terms
//     and the Privacy Policy (two links, core/site.ts; a provider can make a new account). Then one closed fold "Other ways to sign in" with two text actions:
//     "Sign in on <site>" (the device flow: the person signs in on Hoody's own page in another tab; this page holds the
//     code, never that password) and "Use an access key", which replaces the password form with the key's own
//     (TokenSignIn.tsx, token.ts). One way at a time. Once a session is stored, `onSignedIn` opens the Hub (entry.tsx: a
//     reload, or in place when the page keeps everything in memory, where a reload would sign out).
//   - A provider button (here and on "Create your account", Signup.tsx) starts the same device flow: a provider answers
//     only Hoody's own origin, so the person finishes with that provider on Hoody's own page (a new account can be made
//     there too) and this page gets its session by the device code. The waiting card says what to press there. When
//     Hoody does not run the device flow ('off'), the band says the provider cannot finish here and "Open <site>" opens
//     Hoody's own page in a new tab (its sign-up page from "Create your account", its sign-in page from sign-in; the
//     address is built from the listed origin and passes the kit's webAddress gate, else no link).
//   - Focus: each state's first field, or its title when it has none. A link that chose another server or was refused
//     focuses the sign-in card's title first (its band is the title's description). A refusal naming the password (it
//     is empty while the address is filled, or the credentials did not match) focuses the password field.
//   - A page opened as a file keeps its sign-in in memory only (fileMemory.ts) and says so; when the browser would not
//     allow that, nothing can be signed in from it.
//   - A browser holding a session that no stored Hoody owns is offered "Sign out here" (the Hub's one purge) first. It
//     ends only the session storage held when that card was drawn: one another tab stored since is kept, and the
//     reload draws whatever is stored then.
//   - No request here is a change on the person's account; nothing is pending: every failure says what to do next.
//   - The Hoody's `hub_file_min` (build.ts): a file below it shows the out-of-date state with a download link on the
//     same Hoody, and offers no sign-in. A Hoody that names no floor changes nothing.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Band, Button, CopyField, Disclosure, Link, LinkButton, StatusLine, TextButton } from '@kit';
import { useStringParts, useStrings } from '@kit/strings';
import { readHubConfig, setStandaloneApi, type StandaloneApi, type StandaloneChoice } from '@core/origin';
import { clearAuthTokens, isFramed, purgeOutgoingSession, readPage, type PageIdentity } from '@core/session';
import { adoptInjectedStyles } from '../app/csp-styles';
import { siteOf, type Start } from './boot';
import { fileTooOld } from './build';
import { readSignupConfig, type SignInProvider } from '@core/signin';
import { LEGAL } from '@core/site';
import { webAddress } from '@kit/controls/Link';
import { Card } from './Card';
import { startDeviceSignIn, type DeviceSignIn, type DeviceState } from './device';
import { OldFile } from './OldFile';
import { secureEnough } from './secure';
import { usePasswordSignIn } from './PasswordSignIn';
import { ProviderWays } from './ProviderWays';
import { TokenSignIn } from './TokenSignIn';
import s from './FirstRun.module.css';
import strings from './strings.en.json';

type FirstRunStart = Exclude<Start, { kind: 'app' }>;
type Key = keyof typeof strings;
/** A device sign-in a provider button started, and which card it was pressed on. */
type Via = { provider: SignInProvider; from: 'sign-in' | 'sign-up' };
/** The config read of this load. */
type Read = { kind: 'checking' } | { kind: 'failed'; network: boolean } | { kind: 'old'; floor: number } | { kind: 'ok' } | { kind: 'stop'; why: 'signed_in' | 'storage' | 'invalid' };

const reload = (): void => { window.location.reload(); };


/** A check that throws counts as framed: nothing is offered then. */
const framedNow = (): boolean => {
  try {
    return isFramed();
  } catch {
    return true;
  }
};

const FAILED: Record<Extract<DeviceState, { kind: 'failed' }>['why'], Key> = {
  off: 'signIn.err.off', expired: 'signIn.err.expired', denied: 'signIn.err.denied', network: 'signIn.err.network',
  refused: 'signIn.err.refused', storage: 'signIn.err.storage', 'no-api': 'signIn.err.noApi', framed: 'signIn.err.framed',
};
const PROVIDER_NAME: Record<SignInProvider, Key> = { github: 'prov.name.github', google: 'prov.name.google' };
const STOP: Record<'signed_in' | 'storage' | 'invalid' | 'memory', { title: Key; body: Key }> = {
  signed_in: { title: 'signedIn.title', body: 'signedIn.body' },
  storage: { title: 'storage.title', body: 'storage.body' },
  invalid: { title: 'invalid.title', body: 'invalid.body' },
  memory: { title: 'memory.title', body: 'memory.body' },
};

/** Minutes left on a device code, at least 1. */
const minutesLeft = (expiresAt: number): number => Math.max(1, Math.round((expiresAt - Date.now()) / 60_000));

export function FirstRun({ start, onSignedIn = reload }: { start: FirstRunStart; onSignedIn?: () => void }) {
  const t = useStrings(strings);
  const tp = useStringParts(strings);
  // The two legal links of the provider line: underlined, since in muted text colour alone does not set a link apart.
  const legalTerms = <Link href={LEGAL.terms} underlined>{t('up.legalTerms')}</Link>;
  const legalPrivacy = <Link href={LEGAL.privacy} underlined>{t('up.legalPrivacy')}</Link>;
  const choice: StandaloneChoice | null = start.choice;
  const origin = choice?.origin ?? null;
  const site = origin ? siteOf(origin) : '';
  const framed = framedNow();
  const secure = secureEnough();
  // The sign-in step reads its Hoody's config first; nothing else can open the read.
  const reads = start.step === 'sign-in' && !framed && secure;
  const [read, setRead] = useState<Read>({ kind: 'checking' });
  const [attempt, setAttempt] = useState(0);
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [via, setVia] = useState<Via | null>(null);
  const [providers, setProviders] = useState<readonly SignInProvider[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [way, setWay] = useState<'password' | 'key'>('password');
  const run = useRef<DeviceSignIn | null>(null);
  /** The device run whose states draw (stopDevice clears it). */
  const owner = useRef<object | null>(null);

  useEffect(() => () => { run.current?.stop(); }, []);
  useEffect(() => {
    if (!reads || !origin) return undefined;
    let live = true;
    setRead({ kind: 'checking' });
    void readHubConfig(origin).then((r) => {
      if (!live) return;
      // Every failed read is one state: no sign-in way until Hoody answered.
      if (!r.ok) { setRead({ kind: 'failed', network: r.why === 'network' }); return; }
      if (r.fileMin !== null && fileTooOld(r.fileMin)) { setRead({ kind: 'old', floor: r.fileMin }); return; }
      const cfg: StandaloneApi = { origin, realmApiDomain: r.realmApiDomain, proxyDomain: r.proxyDomain };
      const named = setStandaloneApi(cfg);
      setRead(named === 'set' ? { kind: 'ok' } : { kind: 'stop', why: named === 'signed_in' ? 'signed_in' : named === 'storage' ? 'storage' : 'invalid' });
    });
    return () => { live = false; };
  }, [reads, origin, attempt]);

  const open = read.kind === 'ok' && reads;
  // The providers Hoody offers, for the sign-in card's buttons: read once Hoody answered its config (Signup.tsx reads
  // its own when opened). Unreadable = none.
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    void readSignupConfig().then((c) => { if (live) setProviders(c?.providers ?? []); });
    return () => { live = false; };
  }, [open]);
  /** Starts the device flow; `by` names the provider button that started it (null: "Sign in on <site>"). */
  const startSignIn = (by: Via | null): void => {
    if (!open) return;
    // One way at a time: the device flow ends the password way (an attempt still out is cancelled, its late answer
    // does nothing; the typed password is emptied). `pw` is declared below; this runs only on a press, after render.
    pw.leavePassword();
    run.current?.stop();
    setVia(by);
    setDevice({ kind: 'starting' });
    // Only the run still current draws; a stopped or replaced run's late answer changes nothing (a session it stored
    // still signs in).
    const mine = {};
    owner.current = mine;
    run.current = startDeviceSignIn((next) => {
      if (owner.current !== mine && next.kind !== 'signed-in') return;
      setDevice(next);
      if (next.kind === 'signed-in') onSignedIn();
    });
  };
  const stopDevice = (): void => { owner.current = null; run.current?.stop(); run.current = null; setDevice(null); setVia(null); };
  const starting = device?.kind === 'starting';

  // A link that chose another server, or was refused: the ready sign-in card first focuses its title (the band is the
  // title's description), not the email field. Only on entry: a form shown again later (back from reset) takes focus.
  const [titleFirst, setTitleFirst] = useState(choice !== null && choice.asked !== 'default');
  useEffect(() => { if (open) setTitleFirst(false); }, [open]);

  const pw = usePasswordSignIn({
    enabled: open,
    onSignedIn,
    // A password going out ends a device sign-in in progress: one way at a time.
    onBeforeSend: stopDevice,
    focusLogin: !titleFirst,
    onProvider: (provider) => { startSignIn({ provider, from: 'sign-up' }); },
    providerBusy: starting ? via?.provider ?? null : null,
  });

  const stop = start.step === 'blocked' ? start.why : read.kind === 'stop' ? read.why : null;
  // "Sign out here" ends what storage held when its card was drawn, read once then (a throw reads as nothing read).
  const shownAs = useRef<{ page: PageIdentity | null } | null>(null);
  useEffect(() => {
    shownAs.current = null;
    if (stop !== 'signed_in' || framed) return;
    try { shownAs.current = { page: readPage() }; } catch { /* nothing read: the press purges nothing */ }
  }, [stop, framed]);
  const signOutHere = (): void => {
    try {
      const shown = shownAs.current;
      // The session shown is ended by shared.js's own sign-out purge, which purges only while storage still holds it
      // (kind, user and sid; or what an earlier purge left of it) and keeps a session another tab stored since. With
      // none shown (nothing usable stored at the draw) it purges only while storage still holds nothing usable.
      if (shown?.page) purgeOutgoingSession(shown.page, { reason: 'signout' });
      else if (shown && readPage() === null) clearAuthTokens();
    } finally {
      reload();
    }
  };

  const card = (title: string, body: ReactNode, focusTitle = true, below?: ReactNode) => (
    <Card title={title} choice={choice} focusTitle={focusTitle} below={below}>
      {body}
    </Card>
  );

  if (framed) {
    // Every link here passes the kit's webAddress gate (an absolute http(s) URL); an address that fails draws no link.
    const framedHref = webAddress(window.location.href);
    return card(t('framed.title'), (
      <>
        <p className={s.text}>{t('framed.body')}</p>
        {framedHref && <LinkButton href={framedHref} target="_blank" rel="noopener noreferrer" variant="primary">{t('framed.open')}</LinkButton>}
      </>
    ));
  }
  if (stop === 'signed_in') {
    return card(t(STOP.signed_in.title), (
      <>
        <p className={s.text}>{t(STOP.signed_in.body)}</p>
        <Button variant="primary" fullWidth onPress={signOutHere}>{t('signedIn.signOut')}</Button>
      </>
    ));
  }
  if (stop === 'memory') {
    const homeHref = origin ? webAddress(`${origin}/auth/home`) : '';
    return card(t(STOP.memory.title), (
      <>
        <p className={s.text}>{t(STOP.memory.body)}</p>
        {homeHref && <LinkButton literal href={homeHref} target="_blank" rel="noopener noreferrer" variant="primary">{t('memory.open', { site })}</LinkButton>}
      </>
    ));
  }
  if (stop !== null) return card(t(STOP[stop].title), <p className={s.text}>{t(STOP[stop].body)}</p>);
  if (!secure) return card(t('insecure.title'), <p className={s.text}>{t('insecure.body')}</p>);
  if (read.kind === 'checking') return card(t('signIn.title'), <StatusLine>{t('connecting')}</StatusLine>);
  if (read.kind === 'failed') {
    // No answer: the connection. An answer that is not the config (a 404, a wrong body): Hoody's side, its own title.
    return card(t(read.network ? 'unreach.title' : 'unreach.refusedTitle'), (
      <>
        <p className={s.text}>{t(read.network ? 'unreach.network' : 'unreach.refused')}</p>
        <Button variant="primary" fullWidth onPress={() => { setAttempt((n) => n + 1); }}>{t('unreach.retry')}</Button>
      </>
    ));
  }
  if (read.kind === 'old') return card(t('old.title'), <OldFile floor={read.floor} origin={origin} />);

  // Signed in on Hoody's page, or waiting for it: that is the card.
  if (device?.kind === 'waiting') {
    const verifyHref = webAddress(device.verifyUrl);
    return card(t('dev.title', { site }), (
      <>
        {via && <p className={s.text}>{t('dev.provLead', { site, provider: t(PROVIDER_NAME[via.provider]) })}</p>}
        <CopyField label={t('signIn.code')} value={device.userCode} plain description={minutesLeft(device.expiresAt) === 1 ? t('dev.codeLeadOne') : t('dev.codeLead', { n: minutesLeft(device.expiresAt) })} />
        {verifyHref && <LinkButton literal href={verifyHref} target="_blank" rel="noopener noreferrer" variant="primary">{t('dev.open', { site })}</LinkButton>}
        <StatusLine>{t('signIn.waiting')}</StatusLine>
        <div className={s.links}>
          <TextButton onPress={stopDevice}>{t('dev.cancel')}</TextButton>
        </div>
      </>
    ));
  }
  if (device?.kind === 'signed-in') return card(t('signIn.title'), <StatusLine>{t('signIn.done')}</StatusLine>);

  // The access key's own form, in place of the password form; its confirm card retitles the card. The form focuses its
  // key field (TokenSignIn.tsx); the confirm card has no field, so its title takes the focus.
  if (way === 'key') {
    return card(
      t(confirming ? 'key.confirm.title' : 'key.title'),
      <TokenSignIn onSignedIn={onSignedIn} onConfirming={setConfirming} onBack={() => { setWay('password'); }} />,
      confirming,
    );
  }

  const failed = device?.kind === 'failed' ? device : null;
  // Hoody does not run the device flow, after a provider button: that provider can only finish on Hoody's own page.
  const offVia = failed?.why === 'off' ? via : null;
  const offPage = offVia && origin ? webAddress(`${origin}/auth/${offVia.from === 'sign-up' ? 'signup' : 'login'}`) : '';
  return card(pw.title, (
    <>
      {failed && (
        <Band tone="warn" /* noDetails: the device flow's own outcome, mapped to one sentence per reason */>
          {offVia ? t('prov.err.off', { provider: t(PROVIDER_NAME[offVia.provider]), site }) : t(FAILED[failed.why], { site })}
        </Band>
      )}
      {offPage && (
        <LinkButton literal href={offPage} target="_blank" rel="noopener noreferrer" variant="secondary">
          {t('dev.open', { site })}
        </LinkButton>
      )}
      {pw.body}
      {pw.others && (
        <div className={s.others}>
          <ProviderWays providers={providers} busy={starting ? via?.provider ?? null : null} onStart={(provider) => { startSignIn({ provider, from: 'sign-in' }); }} />
          {/* A provider button can make a new account too (on Hoody's own page): what that agrees to, only where the
              buttons are, naming only the providers shown. "Create your account" says it for its whole card
              (Signup.tsx). */}
          {providers.length > 0 && (
            <p className={s.legal}>
              {tp('prov.legal', { terms: legalTerms, privacy: legalPrivacy })}
            </p>
          )}
          <Disclosure title={t('other.title')} level={2}>
            <div className={s.otherWays}>
              <div className={s.otherWay}>
                <TextButton literal busy={starting && via === null} onPress={() => { startSignIn(null); }}>{t('dev.start', { site })}</TextButton>
                <p className={s.text}>{t('dev.lead')}</p>
              </div>
              <div className={s.otherWay}>
                {/* One way at a time: the key's form ends a device sign-in and the password way (an attempt still out
                    is cancelled, its late answer does nothing; the typed password is emptied). */}
                <TextButton onPress={() => { stopDevice(); pw.leavePassword(); setWay('key'); }}>{t('key.way')}</TextButton>
              </div>
            </div>
          </Disclosure>
        </div>
      )}
    </>
  ), titleFirst || pw.focusTitle === true, pw.below);
}

/** Draws the sign-in card into #root; `onSignedIn` runs once a session is stored. Answers the root (entry.tsx
 *  unmounts it to open the Hub in place). */
export function mountFirstRun(start: FirstRunStart, onSignedIn?: () => void): Root | null {
  adoptInjectedStyles();
  const el = document.getElementById('root');
  if (!el) return null;
  const root = createRoot(el);
  root.render(<FirstRun start={start} onSignedIn={onSignedIn} />);
  return root;
}
