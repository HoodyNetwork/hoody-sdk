// New browser with options: the picker's form for a new browser-N on a running computer.
//
// Contract, in plain words:
//   - The fields are browserOptions.ts's, prefilled with the browser kit's own defaults, so Add with nothing changed
//     starts the browser the Board shows today. The basics show (engine, fingerprint profile, stealth, session name);
//     Identity, Network, Extensions and Advanced are folded. The fingerprint profile is a free id with the two shipped
//     profiles named as suggestions. Fields Firefox has no use for (CHROMIUM_ONLY) are disabled with why.
//   - Add names each field core would refuse (browserProblems) and opens its folded section; nothing is sent.
//   - Add then reads whether browser-N already runs (browserUp, a read): the kit's start is create-or-get, so options
//     sent to a running browser would not apply. Running: the form moves to the next free number and says so;
//     nothing was sent. The read failed: nothing was sent, Add comes back.
//   - Not running: one start (startBrowser). Started: the pick is a browser tile on browser-N's display. Refused or
//     never sent: the outcome says why (the kit's code) and Add comes back. Unknown (a timeout, a lost answer): Add
//     locks and the outcome offers Check again, a read back (browserUp), never a resend: running → the pick; not
//     running yet → still unknown (it may still be starting), and Add comes back to start that same number again
//     (create-or-get: a start that lands late cannot make a second browser). Leaving the form while unknown moves it
//     to the kit's sticky notice (usePendingToast).
//   - Nothing here is stored: the tile is {program: browser, session: N, view: display}; the proxy password lives in
//     this form only, is sent once, in the start, exactly as typed, and is wiped when a kept Board hides.
//   - The number is the next free one within the browser range (1-7500), wrapping to the lowest free one past it; the
//     picker offers this form on the same rule.
import { Button, Disclosure, Notice, NumberField, Outcome, Row, SecretInput, Select, Switch, TextField, useHiddenNow, usePendingToast, type OutcomeLike } from '@kit';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BROWSER_DEFAULTS, browserProblems, CHROMIUM_ONLY, FINGERPRINT_SUGGESTIONS, startQuery, type BrowserField, type BrowserOptions, type Engine } from '../browserOptions';
import type { BoardComputer } from '../computers';
import type { Tile } from '../model/boards';
import { nextFree } from '../termSessions';
import { browserUp, startBrowser } from './browserStart';
import { useFormFocus } from './formFocus';
import { useT } from './text';
import s from './board.module.css';

export interface BrowserFormProps {
  computer: BoardComputer;
  /** Browser numbers the Boards and recents already hold on this computer. */
  taken: readonly number[];
  /** The highest browser number the Board may start (core's BOARD_BROWSER_IDS). */
  max: number;
  onPick: (t: Tile) => void;
  onBack: () => void;
  /** When the form may take the focus as it mounts (the Picker's opening()). Absent: always. */
  mayFocus?: () => boolean;
}

type Section = 'identity' | 'network' | 'extensions' | 'advanced';
const SECTION_OF: Partial<Record<BrowserField, Section>> = {
  userAgent: 'identity', locale: 'identity', timezone: 'identity', width: 'identity', height: 'identity', latitude: 'identity', longitude: 'identity', accuracy: 'identity',
  proxyServer: 'network', proxyUser: 'network', proxyPassword: 'network', proxyBypass: 'network', dohUrl: 'network',
  storeIds: 'extensions', extensionDirs: 'extensions',
  chromiumVersion: 'advanced',
};

export function BrowserForm({ computer, taken, max, onPick, onBack, mayFocus }: BrowserFormProps) {
  const t = useT();
  // The first control takes the focus when the form opens (as `mayFocus` allows), and again when the control holding it
  // goes away (formFocus.ts).
  const focus = useFormFocus(mayFocus);
  const [o, setO] = useState<BrowserOptions>(BROWSER_DEFAULTS);
  // Numbers found running when Add read them: skipped from then on.
  const [skip, setSkip] = useState<readonly number[]>([]);
  // Within the browser range: past its last number, the lowest free one (the picker offers the form on the same rule).
  const n = nextFree([...taken, ...skip], max);
  // The number an unknown start went to: Check again reads that one, and Add (once a read found it not running) starts it again.
  const [held, setHeld] = useState<number | null>(null);
  const heldNow = useRef<number | null>(null);
  heldNow.current = held;
  const [open, setOpen] = useState<ReadonlySet<Section>>(new Set());
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<OutcomeLike | undefined>(undefined);
  // The refusal behind a failed or not-sent outcome (core's rejection, safe facts only), for the outcome's Details.
  const [refusal, setRefusal] = useState<unknown>(undefined);
  // A read back found nothing running: still unknown, but Add may start that number again.
  const [retry, setRetry] = useState(false);
  const live = useRef(true);
  // A read or a start that settles while the effects are stopped (a Board kept loaded, hidden) lands when it shows
  // again; one whose form unloaded is dropped with it (core's own notice tells of an unknown start).
  const late = useRef<Array<() => void>>([]);
  const hiddenNow = useHiddenNow();
  const settledToast = useRef<() => void>(() => {});
  useEffect(() => {
    live.current = true;
    for (const land of late.current.splice(0)) land();
    return () => {
      live.current = false;
      // The proxy password is wiped when a kept Board hides (this cleanup runs then, as on leaving): a hidden page's
      // effects stop, so the field's own wipe could not run. A start already sent carried it; nothing else keeps it.
      setO((p) => (p.proxyPassword ? { ...p, proxyPassword: '' } : p));
    };
  }, []);
  // Runs now, or on return to a kept Board hidden meanwhile; false when the form is gone.
  const land = (f: () => void): boolean => {
    if (live.current) { f(); return true; }
    if (hiddenNow()) late.current.push(f);
    return false;
  };
  const set = (x: Partial<BrowserOptions>) => setO((p) => ({ ...p, ...x }));
  const problems = browserProblems(o);
  const firefox = o.engine === 'firefox';
  const unknown = outcome?.kind === 'pending';
  const locked = unknown && !retry;
  const at = held ?? n;
  const name = at === null ? '' : t('tile.name', { program: 'browser', session: at });

  const done = (k: number) => {
    settledToast.current();
    onPick({ project: computer.project_id, computer: computer.id, program: 'browser', session: k, view: 'display' });
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (busy || locked || at === null) return;
    const q = startQuery(o);
    if (!q) {
      // Open the folded sections that hold a field to fix.
      const bad = Object.keys(problems).map((k) => SECTION_OF[k as BrowserField]).filter((x): x is Section => !!x);
      if (bad.length) setOpen((p) => new Set([...p, ...bad]));
      return;
    }
    const k = at;
    setBusy(true);
    setOutcome(undefined);
    setRefusal(undefined);
    setRetry(false);
    // A number an unknown start already went to is not read first: it may still be starting, and a start of the same
    // number cannot make a second browser.
    const kName = t('tile.name', { program: 'browser', session: k });
    const again = held !== null;
    if (!again) {
      const up = await browserUp(computer, k);
      if (up !== 'down') {
        // Nothing was sent.
        land(() => {
          setBusy(false);
          if (up === 'up') setSkip((x) => [...x, k]);
          setOutcome({ kind: 'not_sent', message: t(up === 'up' ? 'browser.running' : 'browser.readFailed', { name: kName }) });
        });
        return;
      }
      // The form went (not just hidden) while it read: nothing is sent.
      if (!live.current && !hiddenNow()) return;
    }
    const r = await startBrowser(computer, k, q);
    land(() => settle(r, k, kName, again));
  };
  const errWords = (r: { error: string; code?: string }) => t(r.error === 'failed' && !r.code ? 'browser.err.failedBare' : 'browser.err.' + r.error, { code: r.code ?? '' });
  const settle = (r: Awaited<ReturnType<typeof startBrowser>>, k: number, kName: string, again: boolean) => {
    setBusy(false);
    if (r === 'started') { setHeld(null); done(k); return; }
    if ('pending' in r) { setHeld(k); setOutcome({ kind: 'pending', message: t('browser.unknown', { name: kName }) }); return; }
    if (again) {
      // A second try that did not go through settles nothing about the first.
      setRetry(true);
      setRefusal(r.cause);
      setOutcome({ kind: 'pending', message: t('browser.retryNot', { name: kName, why: errWords(r) }) });
      return;
    }
    setRefusal(r.cause);
    setOutcome({ kind: r.error === 'failed' ? 'failed' : 'not_sent', message: errWords(r) });
  };
  // Check again: a read back, never a resend.
  const check = async () => {
    const k = held;
    if (k === null) return false;
    const up = await browserUp(computer, k);
    if (up === null) return false;
    land(() => {
      // A read of a number this form no longer holds shows nothing.
      if (heldNow.current !== k) return;
      setRefusal(undefined);
      if (up === 'up') { setHeld(null); setOutcome(undefined); done(k); return; }
      setRetry(true);
      setOutcome({ kind: 'pending', message: t('browser.notYet', { name: t('tile.name', { program: 'browser', session: k }) }) });
    });
    return up === 'up';
  };
  const settledPending = usePendingToast(outcome ?? null, check);
  settledToast.current = settledPending;

  const lock = busy || unknown;
  const err = (k: BrowserField) => (tried && problems[k] ? t('browser.problem.' + problems[k]) : undefined);
  const chromiumOnly = (k: BrowserField) => firefox && CHROMIUM_ONLY.includes(k);
  const why = (k: BrowserField) => (chromiumOnly(k) ? t('browser.chromiumOnly') : undefined);
  const text = (k: 'fingerprint' | 'sessionName' | 'userAgent' | 'locale' | 'timezone' | 'proxyServer' | 'proxyUser' | 'proxyBypass' | 'dohUrl' | 'chromiumVersion', extra: { placeholder?: string; description?: string; mono?: boolean; isDisabled?: boolean } = {}) => (
    <TextField label={t('browser.f.' + k)} value={o[k]} onChange={(v) => set({ [k]: v })} errorMessage={err(k)} isDisabled={lock || chromiumOnly(k) || extra.isDisabled} description={why(k) ?? extra.description} placeholder={extra.placeholder} mono={extra.mono} />
  );
  const num = (k: 'width' | 'height' | 'latitude' | 'longitude' | 'accuracy', extra: { isDisabled?: boolean; unit?: string } = {}) => (
    <NumberField label={t('browser.f.' + k)} value={o[k]} onChange={(v) => set({ [k]: v })} errorMessage={err(k)} isDisabled={lock || extra.isDisabled} unit={extra.unit} formatOptions={{ useGrouping: false, maximumFractionDigits: k === 'width' || k === 'height' ? 0 : 6 }} />
  );
  const section = (id: Section, children: ReactNode) => (
    <Disclosure title={t('browser.s.' + id)} description={t('browser.s.' + id + '.desc')} isExpanded={open.has(id)} onExpandedChange={(x) => setOpen((p) => { const next = new Set(p); if (x) next.add(id); else next.delete(id); return next; })}>
      <div className={s.pickerForm}>{children}</div>
    </Disclosure>
  );

  if (n === null && held === null) {
    return (
      <div className={s.pickerForm}>
        <Notice>{t('browser.full', { max })}</Notice>
        <div className={s.pickerFormActions}>
          <Button variant="ghost" onPress={onBack}>{t('picker.backStep')}</Button>
        </div>
      </div>
    );
  }
  return (
    <form className={s.pickerForm} onSubmit={(e) => { void submit(e); }} noValidate ref={focus.ref} onFocus={focus.onFocus} onBlur={focus.onBlur}>
      <Notice>{t('browser.intro', { name, computer: computer.name })}</Notice>
      <Select label={t('browser.f.engine')} options={[{ value: 'chromium', label: t('browser.engine.chromium') }, { value: 'firefox', label: t('browser.engine.firefox') }]} value={o.engine} onChange={(v) => set({ engine: v as Engine })} isDisabled={lock} />
      {text('fingerprint', { placeholder: FINGERPRINT_SUGGESTIONS[0], description: t('browser.fingerprintHint', { a: FINGERPRINT_SUGGESTIONS[0], b: FINGERPRINT_SUGGESTIONS[1] }), mono: true })}
      <Switch label={t('browser.f.stealth')} description={why('stealth') ?? t('browser.stealthHint')} isSelected={o.stealth && !firefox} onChange={(v) => set({ stealth: v })} isDisabled={lock || firefox} />
      {text('sessionName')}
      {section('identity', <>
        {text('userAgent', { mono: true })}
        {text('locale', { placeholder: 'en-US', mono: true })}
        {text('timezone', { placeholder: t('browser.ph.timezone'), mono: true })}
        <Switch label={t('browser.f.fitTile')} description={t('browser.fitTileHint')} isSelected={o.fitTile} onChange={(v) => set({ fitTile: v })} isDisabled={lock} />
        <Row gap={2} align="start" wrap>
          {num('width', { isDisabled: o.fitTile, unit: 'px' })}
          {num('height', { isDisabled: o.fitTile, unit: 'px' })}
        </Row>
        <Row gap={2} align="start" wrap>
          {num('latitude')}
          {num('longitude')}
        </Row>
        {num('accuracy', { unit: 'm' })}
      </>)}
      {section('network', <>
        {text('proxyServer', { placeholder: 'socks5://host:1080', mono: true })}
        {text('proxyUser', { isDisabled: !o.proxyServer.trim() })}
        <SecretInput label={t('browser.f.proxyPassword')} value={o.proxyPassword} onChange={(v) => set({ proxyPassword: v })} errorMessage={err('proxyPassword')} description={t('browser.passwordHint')} isDisabled={lock || !o.proxyServer.trim()} />
        {text('proxyBypass', { placeholder: 'localhost, *.internal', isDisabled: !o.proxyServer.trim() })}
        <Switch label={t('browser.f.quic')} isSelected={o.quic} onChange={(v) => set({ quic: v })} isDisabled={lock} />
        <Switch label={t('browser.f.doh')} isSelected={o.doh} onChange={(v) => set({ doh: v })} isDisabled={lock} />
        {text('dohUrl', { placeholder: 'https://cloudflare-dns.com/dns-query', mono: true, isDisabled: !o.doh })}
      </>)}
      {section('extensions', <>
        <TextField label={t('browser.f.storeIds')} value={o.storeIds} onChange={(v) => set({ storeIds: v })} multiline rows={2} mono errorMessage={err('storeIds')} description={why('storeIds') ?? t('browser.storeIdsHint')} isDisabled={lock || firefox} />
        <TextField label={t('browser.f.extensionDirs')} value={o.extensionDirs} onChange={(v) => set({ extensionDirs: v })} multiline rows={2} mono errorMessage={err('extensionDirs')} description={why('extensionDirs') ?? t('browser.extensionDirsHint')} isDisabled={lock || firefox} />
      </>)}
      {section('advanced', <>
        <Switch label={t('browser.f.devtools')} description={why('devtools')} isSelected={o.devtools && !firefox} onChange={(v) => set({ devtools: v })} isDisabled={lock || firefox} />
        {text('chromiumVersion', { placeholder: '136', mono: true })}
      </>)}
      {/* The kit popover is at most 480px tall and this form is longer: the outcome and Start stay in view at its foot. */}
      <div className={s.formFoot}>
        {/* The form's own sentence (it names the browser and the kit's code) stays the detail; Details holds the facts. */}
        {outcome && <Outcome outcome={outcome} variant="block" {...(unknown ? { onCheck: check } : {})} error={refusal} detail={outcome.message} />}
        <div className={s.pickerFormActions}>
          <Button variant="ghost" onPress={onBack} isDisabled={busy}>{t('picker.backStep')}</Button>
          <Button variant="primary" type="submit" busy={busy} isDisabled={locked}>{t('browser.add', { name })}</Button>
        </div>
      </div>
    </form>
  );
}
