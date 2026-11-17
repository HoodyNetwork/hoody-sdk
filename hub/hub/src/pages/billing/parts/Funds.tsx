// Add funds: pay with a card or crypto, pick an amount, continue on the provider's own page. The wallet balance
// changes only after the provider confirms (the payment-return band on this page says so). No card data or
// secret is ever typed or shown here.
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Ledger,
  type LedgerRow,
  Link,
  LinkButton,
  OutcomeBanner,
  SegmentedControl,
  SettingGroup,
  SettingRow,
  Skeleton,
  Stack,
  TextField,
  Why,
  usePathname,
  useSearch,
} from '@kit';
import { type ErrorInfo, isStandalone, servedHubUrl } from '@core';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { leaveTo, noteTopUpEnded, type TopUpShown, useBalance, useTopUp } from '../data';
import { pageFaq } from '../faq';
import { amountFits, cents, normalizeAmount, presets, usd } from '../logic';
import type { TopUpMethod, Word } from '../types';
import { Band, type T, say } from './Bits';
import { Resend } from './Resend';
import { legalUrl } from './legal';
import { MoneyHandoff, moneyInWebHub } from './moneyHandoff';
import s from './parts.module.css';

type Phase = { kind: 'form' } | { kind: 'resolved'; key?: string } | { kind: 'redirect'; url: string } | { kind: 'error'; word: Word; unknown: boolean; info?: ErrorInfo };

export interface Funds {
  /** The form's one sentence on what it does: its home shows it as the drawer's subtitle. */
  subtitle: string;
  body: ReactNode;
  footer: ReactNode;
  /** The form holds an amount: leaving it asks nothing, but the drawer counts it as input. */
  dirty: boolean;
  /** A send or a read-back is in flight: nothing closes the drawer. */
  busy: boolean;
}

/** Where the form is shown, when its home has more to say than the form knows. */
export interface FundsHome {
  /** What the checkout is buying (a plan's or a listing's name): the "still needed" row names it. */
  subject?: string;
  /** The home shows `subtitle` under its drawer title. Without it the body opens with that sentence, so it is never lost. */
  subtitleShown?: boolean;
}

/** Cents as the amount field's text ("300" is "3.00"). */
const amountText = (c: number): string => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;

/**
 * One hook for both homes of the form: the Add funds drawer and the in-place step of a checkout. `need` is what the
 * checkout is short by, in cents: the amount starts there, raised to the chosen provider's
 * minimum and kept under its maximum, until the person picks or types another amount. `banned`: the page knows the
 * account is suspended, so nothing that sends is offered (no fresh payment, no "Send the same request again"); a held
 * top-up keeps its read-only Check again and its Forget.
 *
 * The body, top to bottom: the answer of a send (one banner), the wallet as a Ledger (the balance and, from a checkout,
 * what the purchase still needs), the two choices (method, amount), the terms sentence and one Why. While a payment
 * page is not confirmed the footer holds Cancel and Check again only: the confirmed resend and Stop tracking sit in
 * the pending banner, with the same handlers and the same disabled conditions wherever they are drawn.
 *
 * On the standalone Hub the body opens with a band that sends the person to the served Hub, and the footer has no
 * "Continue to payment".
 */
export function useFunds(t: T, onCancel: () => void, cancelLabel: string, need: number | null, banned: boolean, home: FundsHome = {}): Funds {
  const topup = useTopUp();
  // The wallet row reads the page's one balance read; it gates nothing here (a top-up needs no balance).
  const balance = useBalance();
  // The standalone Hub sends no payment: a fresh one is started in the served Hub, at this same route (path and
  // query). Null on the served Hub; '' when the served Hub's address is not known yet (the reason shows, no link).
  const pathname = usePathname();
  const search = useSearch();
  const handoff = isStandalone() ? servedHubUrl(`${pathname}?${new URLSearchParams(search).toString()}`) : null;
  // The live terminal sends no payment either (moneyHandoff.term.tsx): the body says so with the web Hub's address, and
  // the footer has no "Continue to payment".
  const webHub = handoff === null && moneyInWebHub();
  // One availability answer: the machine that sends reads it and the form lists exactly its methods and bounds, so the two never disagree.
  const methods = topup.avail.methods;
  const readFailed = topup.avail.state === 'error';
  const recheck = (): void => {
    void topup.reload();
  };
  const [method, setMethod] = useState<TopUpMethod['key'] | null>(null);
  const [preset, setPreset] = useState<number | null>(20);
  const [other, setOther] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  // Choosing "Other" moves the caret into the amount field (a prefilled shortfall does not move it).
  const otherInput = useRef<HTMLInputElement | null>(null);
  const custom = preset === null;
  const quietCustom = useRef(false);
  useEffect(() => {
    if (custom && !quietCustom.current) otherInput.current?.focus();
    quietCustom.current = false;
  }, [custom]);
  // The person's own amount wins over the prefilled shortfall; a new shortfall (another Add funds press) prefills again.
  const amountTouched = useRef(false);
  useEffect(() => {
    amountTouched.current = false;
  }, [need]);

  const chosen = methods.find((m) => m.key === method) ?? methods[0] ?? null;
  // Only amounts the chosen provider takes are offered: a button for one it refuses would silently jump to another amount.
  const amounts = presets(chosen ? [chosen] : methods);
  const raw = preset !== null ? String(preset) : other;
  const amount = normalizeAmount(raw);
  const fits = amountFits(amount, chosen);

  // A top-up left unknown (the drawer was closed, or the page reopened) comes back frozen on its own method and
  // amount, with only Check again: reopening never starts a second payment.
  const held = topup.pending;
  useEffect(() => {
    if (!held) return;
    setMethod(held.method);
    setPreset(null);
    setOther(held.amount);
    setPhase((p) => (p.kind === 'form' ? { kind: 'error', word: { k: 'top.unknown' }, unknown: true } : p));
  }, [held?.method, held?.amount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!method && methods[0]) setMethod(methods[0].key);
  }, [method, methods]);

  // The preselected amount is one the chosen provider takes: a minimum above the first preset (or another provider's bounds)
  // moves it to the first preset that fits, else to a typed amount. Otherwise Continue would stay disabled with nothing to say why.
  useEffect(() => {
    if (held || preset === null || !chosen || amountFits(normalizeAmount(String(preset)), chosen)) return;
    setPreset(presets([chosen])[0] ?? null);
  }, [held, preset, chosen]);

  // A checkout's shortfall starts the amount: at least what is missing, within the chosen provider's bounds.
  useEffect(() => {
    if (held || need === null || need <= 0 || !chosen || amountTouched.current) return;
    const c = Math.min(Math.max(need, Math.round(chosen.min * 100)), Math.round(chosen.max * 100));
    if (preset !== null) quietCustom.current = true;
    setPreset(null);
    setOther(amountText(c));
  }, [held, need, chosen]); // eslint-disable-line react-hooks/exhaustive-deps

  // A method switch or another amount after an attempt is another payment: the old error goes.
  const touch =
    <A,>(set: (a: A) => void) =>
    (a: A) => {
      // While the last payment page is unknown, the form is frozen: Check again only reads; the resend sends that same request.
      if (phase.kind === 'error' && phase.unknown) return;
      setPhase({ kind: 'form' });
      set(a);
    };

  const unknown = phase.kind === 'error' && phase.unknown;
  const [forgetAsk, setForgetAsk] = useState(false);
  const finish = (r: Awaited<ReturnType<typeof topup.submit>>) => {
    // A second press while this drawer's own send is out: the first one's answer is the outcome.
    if ('ignored' in r) return;
    // The key this send actually used (a fresh send has no `held` yet): its end is this tab's own.
    const key = r.key ?? held?.key;
    if (r.ok) {
      noteTopUpEnded(key);
      setPhase({ kind: 'redirect', url: r.url });
      leaveTo(r.url);
    } else if (r.resolved) {
      // The band's own note stands in until this drawer's notice is really on screen (see the effect below).
      setPhase({ kind: 'resolved', key });
    } else {
      if (!r.unknown) noteTopUpEnded(key);
      setPhase({ kind: 'error', word: r.word, unknown: r.unknown, ...(r.info ? { info: r.info } : {}) });
    }
  };
  // The drawer's resolved notice is drawn only past its loading skeleton: only then does it stand in for the band's
  // "No longer waiting here". While it is hidden (or after the drawer closes) the band keeps its own.
  const drawerBusy = topup.avail.state === 'loading' || topup.loading;
  useEffect(() => {
    if (phase.kind === 'resolved' && !drawerBusy) noteTopUpEnded(phase.key);
  }, [phase, drawerBusy]);
  // After an unknown answer the default action only reads; the confirmed resend is separate (below).
  const go = async () => {
    if (unknown || held) return finish(await topup.checkAgain());
    if (banned || !chosen || !amount || !fits) return;
    finish(await topup.submit(chosen.key, amount));
  };

  // The answer of a send: shown wherever the body ends up, so a failing availability read never hides it.
  const done: ReactNode =
    phase.kind === 'redirect' ? (
      <OutcomeBanner
        kind="done"
        title={t('top.redirectTitle')}
        body={
          <>
            {t('top.redirectBody')} <Link href={phase.url}>{t('top.open')}</Link>
          </>
        }
      />
    ) : phase.kind === 'resolved' ? (
      <OutcomeBanner kind="stale" title={t('top.resolvedTitle')} body={t('top.resolved')} />
    ) : null;

  // What the body is, decided once so the footer knows whether the pending banner is on screen.
  const noMethods = readFailed || methods.length === 0;
  const shape = drawerBusy ? 'loading' : done && noMethods ? 'done' : noMethods && (held || unknown) ? 'held' : readFailed ? 'readFailed' : methods.length === 0 ? 'none' : 'form';
  // A payment that is not confirmed keeps its banner while the form under it is still loading, so the banner's
  // actions are in one place from the first render on and never move under a press.
  const pendingShown = shape === 'held' || ((shape === 'form' || shape === 'loading') && unknown) || (shape === 'loading' && !!held);

  // The two recovery actions of a payment page that is not confirmed, each defined once for both places it can be drawn
  // (the pending banner; the footer in the rare body that has no such banner), so neither place gains or loses a
  // condition. The confirmed resend is not drawn for a suspended account. Stop tracking is off while a send runs or
  // the hold is still being sent; it only asks (the dialog in the footer below confirms).
  const canResend = (unknown || !!held) && !banned;
  const canForget = !!held && !!topup.forget;
  const forgetButton = (place: 'banner' | 'footer'): ReactNode => (
    <Button
      variant={place === 'banner' ? 'ghost' : 'secondary'}
      {...(place === 'banner' ? { size: 'sm' as const } : {})}
      isDisabled={topup.running || held?.sending === true}
      onPress={() => setForgetAsk(true)}
    >
      {t('top.forget')}
    </Button>
  );
  const resendControl = (place: 'banner' | 'footer'): ReactNode => (
    <Resend
      overlayId="billing-resend-funds"
      {...(place === 'banner' ? { size: 'sm' as const } : {})}
      chargeOf={(sh) => ({ topUpAmount: sh?.amount ?? null })}
      busy={topup.running || topup.loading || held?.sending === true}
      prepare={(): TopUpShown | null => (topup.pending ? { key: topup.pending.key, method: topup.pending.method, amount: topup.pending.amount } : null)}
      // Only the held request whose amount the dialog stated is sent.
      onSend={(shown) => void topup.resend(shown && shown.amount === (held?.amount ?? null) ? shown : null).then(finish)}
    />
  );
  // In the banner they read as the page's held band does: the resend, then the quiet Stop tracking.
  const bannerActions: ReactNode =
    canResend || canForget ? (
      <>
        {canResend ? resendControl('banner') : null}
        {canForget ? forgetButton('banner') : null}
      </>
    ) : undefined;
  // "Not confirmed", one line each: what is known and what Check again does; that only this tab remembers the payment
  // (when the browser would not save it); that it is still being sent (so Stop tracking is off).
  const pendingBanner = (known: ReactNode, info?: ErrorInfo): ReactNode => (
    <OutcomeBanner
      kind="pending"
      error={info}
      title={t('top.unknownTitle')}
      known={known}
      checkLine={held?.persisted === false ? t('top.notSaved') : undefined}
      stopLine={held?.sending === true ? t('top.forgetSending') : undefined}
      actions={bannerActions}
    />
  );

  // The wallet, as money always reads: the balance and, from a checkout, what that purchase still needs. A balance
  // that is not read is a dash with its sentence, never an amount.
  const walletRows: LedgerRow[] = [
    balance.isPending
      ? { id: 'balance', label: t('general'), amount: t('mkt.balanceLoading'), tone: 'muted' }
      : balance.isError || !balance.data
        ? { id: 'balance', label: t('general'), amount: usd(''), note: t('mkt.balanceUnavailable'), tone: 'muted' }
        : { id: 'balance', label: t('general'), amount: usd(balance.data.general) },
    ...(need !== null && need > 0 ? [{ id: 'need', label: home.subject ? t('top.neededFor', { name: home.subject }) : t('top.needed'), amount: cents(need) }] : []),
  ];

  // One banner at the top (the answer of a send), then what the shape shows, then the one Why in every shape.
  let notice: ReactNode = done;
  let main: ReactNode = null;
  // What the last attempt said, when it said something (a framed page gets its way out).
  const errorWords: ReactNode =
    phase.kind !== 'error' ? null : phase.word.k === 'top.framed' ? (
      <>
        {say(t, phase.word)} <Link href={window.location.href}>{t('top.framedOpen')}</Link>
      </>
    ) : phase.word.k === 'top.handoff' ? (
      // The standalone Hub's refused resend: where payments are made, and this place in the served Hub.
      <>
        {say(t, phase.word)}
        {handoff ? (
          <>
            {' '}
            <Link href={handoff}>{t('co.standaloneOpen')}</Link>
          </>
        ) : null}
      </>
    ) : (
      say(t, phase.word)
    );
  const pendingNotice = phase.kind === 'error' && phase.unknown ? pendingBanner(errorWords, phase.info) : pendingBanner(say(t, { k: 'top.unknown' }));
  if (shape === 'loading') {
    notice = pendingShown ? pendingNotice : null;
    main = <Skeleton variant="rows" rows={4} />;
  } else if (shape === 'held') {
    // Core reads and resends a held top-up from its own record, so neither needs a method list: never hide them behind one.
    notice = pendingBanner(say(t, { k: 'top.unknown' }));
  } else if (shape === 'readFailed') main = <ErrorState size="sm" title={t('top.availErr')} onRetry={recheck} />;
  else if (shape === 'none')
    main = (
      <EmptyState
        size="sm"
        icon="wallet"
        title={t('top.none')}
        action={
          <Button size="sm" icon="reload" busy={topup.loading} onPress={recheck}>
            {t('top.noneRetry')}
          </Button>
        }
      />
    );
  else if (shape === 'form') {
    const terms = legalUrl('terms');
    const privacy = legalUrl('privacy');
    const bounds = chosen ? t('top.bounds', { min: usd(`${chosen.min}.00`), max: usd(`${chosen.max}.00`) }) : undefined;
    if (phase.kind === 'error') notice = phase.unknown ? pendingNotice : <OutcomeBanner kind="failed" error={phase.info} body={errorWords} />;
    main = (
      <>
        {!home.subtitleShown && <p className={s.hint}>{t('top.lede')}</p>}
        <Ledger label={t('wallet')} rows={walletRows} />
        <SettingGroup variant="field" label={t('top.title')}>
          <SettingRow label={t('top.method')}>
            <SegmentedControl
              label={t('top.method')}
              value={chosen?.key ?? 'card'}
              items={methods.map((m) => ({
                id: m.key,
                label: m.key === 'card' ? t('top.card') : t('top.crypto'),
              }))}
              onChange={touch(setMethod)}
            />
          </SettingRow>
          <SettingRow label={t('top.amount')} help={preset !== null ? bounds : undefined}>
            <SegmentedControl
              label={t('top.amount')}
              value={preset === null ? 'other' : String(preset)}
              items={[...amounts.map((n) => ({ id: String(n), label: `$${n}` })), { id: 'other', label: t('top.custom') }]}
              onChange={touch((v: string) => {
                amountTouched.current = true;
                if (v === 'other') setPreset(null);
                else {
                  setPreset(Number(v));
                  setOther('');
                }
              })}
            />
          </SettingRow>
          {preset === null && (
            <SettingRow label={t('top.otherLabel')}>
              <TextField
                aria-label={t('top.otherLabel')}
                inputRef={otherInput}
                value={other}
                onChange={touch((v: string) => {
                  amountTouched.current = true;
                  setOther(v);
                })}
                inputMode="decimal"
                mono
                description={bounds}
                errorMessage={other !== '' && !fits ? t('top.range') : undefined}
              />
            </SettingRow>
          )}
        </SettingGroup>
        <p className={s.legal}>
          {t('top.legalLead')} {terms ? <Link href={terms}>{t('market.legalTerms')}</Link> : t('market.legalTerms')} {t('top.legalAnd')}{' '}
          {privacy ? <Link href={privacy}>{t('market.legalPrivacy')}</Link> : t('market.legalPrivacy')}
          {t('top.legalEnd')}
        </p>
      </>
    );
  }
  const body = (
    <Stack gap={4}>
      {/* Never beside a payment that is not confirmed or held: its "nothing was sent" would contradict that banner. */}
      {webHub && !unknown && !held ? <MoneyHandoff /> : null}
      {handoff !== null && (
        <Band
          tone="info"
          dataAttr="handoff"
          actions={
            handoff ? (
              <LinkButton variant="primary" size="sm" href={handoff}>
                {t('co.standaloneOpen')}
              </LinkButton>
            ) : undefined
          }
        >
          {t('co.standalone')}
        </Band>
      )}
      {notice}
      {main}
      <Why question={t('top.why.q')} faq={{ item: pageFaq(t).byId.addFunds, label: t('top.more') }}>
        {t('top.why.a')}
      </Why>
    </Stack>
  );

  // A fresh payment starts only from a clean read; a held one keeps its own Check again.
  const ready = !banned && !!chosen && fits && !readFailed && phase.kind !== 'redirect';
  const footer = (
    <>
      <ConfirmDialog
        overlayId="billing-funds-forget"
        isOpen={forgetAsk}
        onOpenChange={setForgetAsk}
        title={t('top.forgetTitle')}
        body={t('top.forgetBody')}
        confirmLabel={t('top.forgetConfirm')}
        tone="danger"
        onConfirm={() => {
          // Only after this confirm: core drops its held record and sends nothing; the form starts again.
          // Refused (still being sent, or another drawer holds a different key): not forgotten, the drawer stays as it is.
          const key = held?.key;
          if (topup.forget?.()) {
            setPhase({ kind: 'form' });
            // The page band follows core's record: this confirmed Forget is its own Dismiss, not "answered elsewhere".
            noteTopUpEnded(key);
          }
          setForgetAsk(false);
        }}
      />
      <Button variant="secondary" chip={false} isDisabled={topup.running} onPress={onCancel}>
        {cancelLabel}
      </Button>
      {/* Only a body without the pending banner keeps the recovery actions here (a held payment beside another
          answer): the same controls, never both places at once. */}
      {!pendingShown && canForget ? forgetButton('footer') : null}
      {!pendingShown && held?.sending === true ? <span className={s.hint}>{t('top.forgetSending')}</span> : null}
      {!pendingShown && canResend ? resendControl('footer') : null}
      {/* On the standalone Hub no fresh payment starts here (the band in the body links to the served Hub): only a
          payment that is not confirmed keeps this button, as its read-only Check again. */}
      {((handoff === null && !webHub) || unknown || !!held) && (
        <Button
          variant="primary"
          busy={topup.running}
          isDisabled={topup.loading || !(ready || unknown || !!held) || ((unknown || !!held) && held?.sending === true)}
          onPress={() => void go()}
        >
          {unknown || held ? t('buy.checkAgain') : t('top.go')}
        </Button>
      )}
    </>
  );
  // A typed custom amount that has not been sent is lost on close; a held top-up is not (it comes back on reopen).
  return { subtitle: t('top.lede'), body, footer, dirty: phase.kind === 'form' && custom && other.trim() !== '' && !held, busy: topup.running };
}
