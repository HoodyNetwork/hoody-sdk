// The API-key step of the connect drawer (also "Replace key"). The key lives only in this component's
// state: it is never prefilled, cleared the moment it is sent, and dropped when the step closes. A lost
// answer reads GET auth by fingerprint (2, 8, 25 s); Check again only reads, "Type the key again" starts over.
// A custom endpoint's key (`endpoint`) goes only with the definition revision the step read when it opened, under
// the kit's endpoint guard; a built-in provider's key is sent as before. Every send belongs to the
// scope it began in (account, realm, computer), as the kit's KeySetup's does: its end, even one undone before anything
// asks, drops the step's "may have been saved" line and closes the leave toast the step left.
import { Button, ConfirmDialog, EndpointRevNote, Form, FormFooter, SecretInput, useEndpointRev, useOutcome, usePendingToast, useStrings } from '@kit';
import { HeldBand } from '@kit';
import { providers } from '@core';
import { useEffect, useRef, useState } from 'react';
import { checkDisconnect, disconnectAtOf, stopDisconnect, useHeldDisconnect } from '../disconnectHold';
import { saveEndpointKey, saveKey, type KeyResult } from '../flows-key';
import { readEndpoint } from '../flows-endpoint';
import { checkKeySave, sendKeySave, stopKeySave, useHeldKeySave, type HeldKeySave } from '../keySaveHold';
import { shownComputer } from '../shownGate';
import strings from '../strings.en.json';
import { useAi } from './ctx';
import { failedUi, pendingUi, type Ui } from './outcome';
import s from './parts.module.css';

export type Saved = { how: 'valid' | 'inconclusive' | 'untested' | 'saved' };

export function KeyStep({ providerId, providerLabel, endpoint = false, onSaved }: { providerId: string; providerLabel: string; endpoint?: boolean; onSaved: (r: Saved) => void }) {
  const t = useStrings(strings);
  const { api, env, m } = useAi();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Ui | null>(null);
  const [field, setField] = useState<string | undefined>();
  // "Stop tracking this save" asks first, as every other Stop tracking does (the kit's question, dis.stopWarn's line).
  const [askRetype, setAskRetype] = useState(false);
  const [checking, setChecking] = useState(false);
  const live = useRef(true);
  const ep = useEndpointRev(api, providerId, endpoint);
  // A removal of this provider's key or endpoint on this computer whose answer is unknown is core's hold on the
  // provider's credential lock (disconnectHold.ts; 'key' names that lock, an endpoint removal included). While it is held
  // the step sends no key: a removal that lands late would end the new one too. The step offers that removal's Check
  // again and Stop tracking instead. A sign-out takes its own lock, so it never stops the step. Every read goes only to
  // the computer this step was drawn for (`on`).
  const at = disconnectAtOf(m);
  const on = shownComputer();
  const removal = useHeldDisconnect(at, providerId, 'key');
  const [stillThere, setStillThere] = useState(false);
  // "Still there" belongs to the hold it was read for: another hold starts without it.
  const removalId = removal?.id ?? null;
  useEffect(() => setStillThere(false), [removalId]);
  // A key save of this provider on this computer whose answer is unknown is core's hold too (keySaveHold.ts), on the same
  // lock: while it is held no removal goes and no second key. This step's own unknown save shows as before (its line,
  // Check again, Stop tracking this save, the leave toast). Any other one (sent before this step opened, or from another
  // tab) shows as a band with Check again and Stop tracking, and the step takes no key until it goes.
  const saving = useHeldKeySave(at, providerId);
  const [saveNote, setSaveNote] = useState<'still' | 'unproved' | 'kept' | null>(null);
  // The save this step stopped tracking while core lets its hold go: not shown, and the next save waits for that.
  const [dropping, setDropping] = useState<{ id: string; done: Promise<boolean> } | null>(null);
  const held = saving && saving.id !== dropping?.id ? saving : null;
  const band = held && !busy && out?.kind !== 'pending' ? held : null;
  // A band's note belongs to the hold it was read for.
  const bandId = band?.id ?? null;
  useEffect(() => setSaveNote(null), [bandId]);
  // Each send is a save attempt; "Type the key again" and the next send end the earlier one. `sent` keeps the last
  // send's number and its endpoint guard (an endpoint's revision attempt and computer; a built-in has none): its
  // answer, and a later Check again, change this step only while both hold, so an older check can never complete,
  // fail or clear a newer save. `held` is its hold while the answer is unknown and `on` the computer it went to: Check
  // again reads that one only, there only.
  const saves = useRef(0);
  const checks = useRef(0);
  // `scope`: the account, realm and computer (project and container) the send began in, as the kit's KeySetup keeps it.
  // The page's env ends only on a change of computer id or realm; once the step went, this scope alone holds its reads.
  const sent = useRef<{ n: number; guard: () => boolean; scope: providers.StepScope | null; held: HeldKeySave | null; on: string }>({ n: 0, guard: () => true, scope: null, held: null, on: '' });
  const owns = (x: { n: number; guard: () => boolean }) => saves.current === x.n && x.guard();
  // The last send's scope watch (KeySetup's): it latches the scope's end the moment it happens, so a change undone
  // before Check again still ends the send. It stops at the next send, when the step goes with nothing unknown left,
  // and when the leave toast proves the save after the step went.
  const unwatch = useRef<() => void>(() => {});
  const unknown = useRef(false);
  unknown.current = out?.kind === 'pending';
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (!unknown.current) unwatch.current();
    };
  }, []);

  const apply = (r: KeyResult) => {
    if (!live.current) return;
    if (r.state === 'valid' || r.state === 'inconclusive' || r.state === 'untested' || r.state === 'saved') return onSaved({ how: r.state });
    if (r.state === 'stale' || r.state === 'ended') return;
    if (endpoint && (r.state === 'def_changed' || r.state === 'not_sent')) return r.state === 'def_changed' ? ep.changed() : ep.read();
    if (r.state === 'refused') {
      setField(t('key.refused', { provider: providerLabel }));
      setOut({ kind: 'failed', message: t('key.refusedTitle') });
    } else if (r.state === 'def_changed') setOut({ kind: 'failed', message: t('key.changed') });
    else if (r.state === 'not_confirmed') setOut(pendingUi());
    else if (r.err) setOut(failedUi(r.err, { provider: providerLabel }));
  };

  const submit = async () => {
    if (!key.trim() || busy || removal || held) return;
    // An endpoint without its revision sends nothing, and the typed key stays.
    const epRev = ep.state.s === 'ok' ? ep.state.rev : null;
    if (endpoint && epRev === null) return;
    const scope = providers.stepScope();
    unwatch.current();
    unwatch.current = providers.watchStepScope(scope, () => {
      unwatch.current = () => {};
      leftToast();
      if (!live.current) return;
      setOut(null);
    });
    // A built-in send has no endpoint attempt; the scope holds both kinds.
    const attempt = endpoint ? ep.guard() : () => true;
    const mine = { n: ++saves.current, guard: () => attempt() && providers.stepScopeLive(scope), scope, held: null as HeldKeySave | null, on };
    sent.current = mine;
    const guard = () => owns(mine);
    const k = key.trim();
    setBusy(true);
    setOut(null);
    setField(undefined);
    setSaveNote(null);
    // A save this step stopped tracking goes first: until core let it go, it would refuse this one.
    if (dropping) await dropping.done;
    // Core holds the save before the key leaves (refused: nothing is sent and the typed key stays), and every call goes
    // only to the computer this step was drawn for.
    const r = await sendKeySave(api, env, at, providerId, on, async (a) => {
      if (live.current) setKey('');
      if (endpoint) return saveEndpointKey(a, env, providerId, k, epRev, () => live.current && guard());
      // A built-in provider: its revision rides the save when the read gives one.
      const e = await readEndpoint(a, providerId);
      return saveKey(a, env, providerId, k, e.state === 'ok' ? e.rev : null, () => live.current);
    });
    if (r.state !== 'held' && r.state !== 'not_held') mine.held = r.held ?? null;
    if (!live.current || saves.current !== mine.n) return;
    setBusy(false);
    // Refused by another hold of this provider: its band shows it.
    if (r.state === 'held') return;
    if (r.state === 'not_held') return setOut({ kind: 'not_sent', message: t('def.notHeld') });
    // An answer for an attempt the step moved on from (a new read, another computer) is not this step's outcome.
    if (!guard()) return;
    apply(r);
  };

  const again = async (): Promise<boolean> => {
    const mine = sent.current;
    const c = ++checks.current;
    if (live.current) setChecking(true);
    // Once the step went (the footer's leave toast runs this), its endpoint guard has ended with it: the read alone
    // answers, in the send's scope, so the toast closes on proof (C9), as the kit's KeySetup does.
    const inScope = () => !mine.scope || providers.stepScopeLive(mine.scope);
    // The send's own hold, read back once by the fingerprint this tab kept (keySaveHold.ts), from the computer it went
    // to; the hold goes on proof.
    const r = mine.held ? await checkKeySave(api, env, providerId, mine.held, mine.on, () => inScope() && (!live.current || owns(mine))) : 'not_confirmed';
    if (!live.current) return r === 'saved' && inScope();
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
    if (live.current) setOut({ kind: 'pending', message: t(r === 'unproved' ? 'key.saveUnproved' : 'key.stillNot') });
    return false;
  };

  const checkRemoval = async () => {
    if (!removal) return;
    const r = await checkDisconnect(api, providerId, removal, on);
    if (live.current) setStillThere(r === 'present');
  };
  const stopRemoval = async () => {
    if (!removal) return;
    await stopDisconnect(removal);
    if (live.current) setStillThere(false);
  };

  const checkSave = async () => {
    if (!band) return;
    const r = await checkKeySave(api, env, providerId, band, on);
    if (live.current) setSaveNote(r === 'saved' ? null : r === 'unproved' ? 'unproved' : 'still');
  };
  const stopSave = async () => {
    if (!band) return;
    const freed = await stopKeySave(band);
    if (live.current) setSaveNote(freed ? null : 'kept');
  };

  // The step leaves its unknown save (the scope it began in ended): the hold stays core's.
  const reset = () => {
    saves.current++;
    setOut(null);
  };
  // "Stop tracking this save", the person's own (its hint says when): the step takes a new key at once, and core lets
  // the hold go meanwhile. The next save waits for that; refused, the hold shows as a band again.
  const typeAgain = () => {
    const h = sent.current.held;
    reset();
    if (!h) return;
    const done = stopKeySave(h);
    setDropping({ id: h.id, done });
    void done.then(() => {
      if (live.current) setDropping((d) => (d && d.id === h.id ? null : d));
    });
  };

  // The step's leave toast is its own, not the footer's (toastOnLeave off), so the send's scope end can close it
  // (usePendingToast's settled), as KeySetup's. A save it proves after the step went stops the scope watch.
  const footerOut = useOutcome(out ?? undefined);
  const leaveCheck = async (): Promise<boolean> => {
    const proved = await again();
    if (proved && !live.current) unwatch.current();
    return proved;
  };
  const leftToast = usePendingToast(footerOut?.kind === 'pending' ? footerOut : null, leaveCheck);

  return (
    <Form onSubmit={() => void submit()}>
      <div className={s.stack}>
        {removal && (
          <HeldBand
            text={t('key.removalHeld', { provider: providerLabel })}
            readOnly={false}
            onCheck={checkRemoval}
            onDismiss={stopRemoval}
            dismissBody={t('dis.stopWarn')}
            overlayId="ai-key-removal-stop-tracking"
            note={stillThere ? t('dis.stillThere') : undefined}
            inFlight={removal.inFlight}
          />
        )}
        {band && (
          <HeldBand
            text={t('key.saveHeld', { provider: providerLabel })}
            readOnly={false}
            onCheck={checkSave}
            onDismiss={stopSave}
            dismissBody={t('dis.stopWarn')}
            overlayId="ai-key-save-stop-tracking"
            note={saveNote === 'still' ? t('key.saveStill') : saveNote === 'unproved' ? t('key.saveUnproved') : saveNote === 'kept' ? t('dis.stopKept') : undefined}
            inFlight={band.inFlight}
          />
        )}
        <SecretInput
          label={t('key.label', { provider: providerLabel })}
          description={t('key.stored', { computer: m.computer?.name ?? t('key.thisComputer') })}
          value={key}
          onChange={setKey}
          isDisabled={busy || out?.kind === 'pending' || removal !== null || band !== null}
          errorMessage={field}
          isRequired
          reveal={false}
          focusOnError
        />
        {out?.kind === 'pending' && (
          <>
            <p className={s.muted}>{t('key.pendingHint')}</p>
            <Button variant="secondary" size="sm" onPress={() => setAskRetype(true)}>
              {t('key.typeAgain')}
            </Button>
          </>
        )}
        {endpoint && <EndpointRevNote rev={ep} endpoint={providerLabel} />}
        <ConfirmDialog
          overlayId="ai-key-save-retype"
          isOpen={askRetype && out?.kind === 'pending'}
          onOpenChange={(o) => !o && setAskRetype(false)}
          title={t('key.typeAgainTitle')}
          body={t('dis.stopWarn')}
          confirmLabel={t('key.typeAgainGo')}
          onConfirm={() => {
            setAskRetype(false);
            typeAgain();
          }}
        />
        <FormFooter toastOnLeave={false} dirty={key.trim().length > 0} busy={busy} outcome={out ?? undefined} onCheck={again} checking={checking} submitLabel={t('key.save')} submitDisabled={removal !== null || band !== null || (endpoint && ep.state.s !== 'ok')} />
      </div>
    </Form>
  );
}
