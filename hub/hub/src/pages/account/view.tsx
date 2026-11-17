// The account page: your sign-in security and profile in one place. SettingsPage with a section rail and a
// security summary rail; every change is a kit Drawer, every confirmation a centred dialog, and the open one
// is kept in the URL (?sheet=…, ?end=…) so Back closes it. A suspended account sees only its sessions.
import { capture, lockSupport, lockView, useCan, useCore, useLockVersion } from '@core';
import { Button, ConfirmDialog, Dialog, NoAccessState, useShellData, FormFooter, OutcomeBanner, SettingsPage, TextButton, useSearchParam, useStrings } from '@kit';
import { useEffect, useRef, useState } from 'react';
import type { Session } from './data';
import { pageFaq } from './faq';
import {
  provenBy,
  readAgentDays,
  saveAgentDays,
  useEndOthers,
  useEndSession,
  useArmedHolds,
  useIdentity,
  useNewCodes,
  useSessions,
  useSetGate,
  useTurnOff,
  useTwoFactor,
} from './data';
import { deviceLabel, endTargetOf, errorWords, refusal, openableLockSheet, openableSheet, parseDays, twoStepRead, type LockSheetMode } from './logic';
import { AgentSection } from './parts/AgentSection';
import { CodeSheet } from './parts/CodeSheet';
import { HistorySection } from './parts/HistorySection';
import { KeysSection } from './parts/KeysSection';
import { LanguageRow } from './parts/LanguageRow';
import { LockSection } from './parts/LockSection';
import { LockSheet } from './parts/LockSheet';
import { WipeDialog, WipeRow } from './parts/WipeSection';
import { EmailSheet } from './parts/EmailSheet';
import { EmailsSection, useEmailsOffered } from './parts/EmailsSection';
import { NameSheet } from './parts/NameSheet';
import { PasswordSection } from './parts/PasswordSection';
import { PasswordSheet } from './parts/PasswordSheet';
import { PerfRow } from './parts/PerfRow';
import { ProfileSection } from './parts/ProfileSection';
import { RelatedSection } from './parts/RelatedSection';
import { NewCodes } from './parts/Secrets';
import { SecuritySummary } from './parts/SecuritySummary';
import { SessionsSection } from './parts/SessionsSection';
import { SetupSheet } from './parts/SetupSheet';
import { TwoFactorSection } from './parts/TwoFactorSection';
import strings from './strings.en.json';


/** How long a save's "Saved" shows before the footer goes. */
const SAVED_FLASH_MS = 2400;

// A shared-access (token) session: core refuses the account's own reads and changes (two-step sign-in, sessions,
// history, keys) unsent, so their Try again could never work; say where they are instead, as Keys and Vault do.
export default function AccountPage() {
  return useCan('account') ? <AccountSettings /> : <SharedAccessNotice />;
}

// The page keeps its frame (title, subtitle); one section holds the notice, as Vault's list does. The questions stay with
// the settings they are about (AccountSettings is the page's one FAQ root): none of them applies to this session.
function SharedAccessNotice() {
  const t = useStrings(strings);
  return (
    <SettingsPage
      header={{ title: t('title'), subtitle: t('subtitle') }}
      sections={[{ id: 'access', title: t('token.section'), content: <NoAccessState title={t('token.title')} body={t('token.body')} action={<SignOutAction />} /> }]}
    />
  );
}

/** The way out of a shared-access session: the shell's own Sign out, or nothing when the shell has none (as Vault's). */
function SignOutAction() {
  const t = useStrings(strings);
  const { signOut } = useShellData();
  if (!signOut) return null;
  return (
    <Button icon="logout" onPress={signOut}>
      {t('token.signOut')}
    </Button>
  );
}

function AccountSettings() {
  const t = useStrings(strings);
  const shell = useShellData();
  const identity = useIdentity();
  // The core's identity counts too: the boot GET /users/auth/me, flipped in place by a 403 ACCOUNT_BANNED. A failed page
  // read never makes a suspended account look ordinary, and a stale one never hides the core's flip.
  const core = useCore().identity;
  const suspended = core?.banned === true || identity.data?.banned === true;
  // Known only when something answered: the page's read, or (it failed) the core's identity. Pending opens nothing.
  const known = identity.data !== undefined || (identity.isError && core !== null);
  const [sheetParam, setSheet] = useSearchParam('sheet');
  const [endParam, setEnd] = useSearchParam('end');
  // Not before the identity answered: a suspended account must never see a change sheet flash open. Set up opens only
  // while two-step sign-in reads off; once open (as last drawn) it stays while its link does, whatever the status says since.
  const twofa = useTwoFactor();
  const setupDrawn = useRef(false);
  const sheet = known ? openableSheet(sheetParam, { suspended, twoStep: twoStepRead(twofa), setupOpen: setupDrawn.current }) : undefined;
  useEffect(() => {
    setupDrawn.current = sheet === 'setup';
  }, [sheet]);
  // The passcode lock belongs to an account session: a token session has no passcode, so no section and no sheet.
  useLockVersion();
  const tokenPage = capture().page?.kind === 'token';
  // The record is read when the link changes, so an open sheet stays open when another window changes the passcode
  // meanwhile: its Save then says what happened (removed elsewhere, wrong passcode), never a sheet that vanishes.
  const [lockAt, setLockAt] = useState(() => ({ param: sheetParam, record: lockView().record }));
  if (lockAt.param !== sheetParam) setLockAt({ param: sheetParam, record: lockView().record });
  // A press in the section reads the record afresh even when the link already names that sheet: a link refused earlier
  // (Change before another window set a passcode) must not leave the button the section now shows opening nothing.
  const openLock = (m: LockSheetMode) => {
    setLockAt({ param: m, record: lockView().record });
    setSheet(m);
  };
  const lockSheet = known
    ? openableLockSheet(sheetParam, { suspended, token: tokenPage, record: lockAt.record, supported: lockSupport() })
    : undefined;
  // The page's one notice. A refusal (a cancel that did not go through) is said as one, never in the done banner.
  const [notice, setNotice] = useState<{ text: string; kind: 'done' | 'failed' } | null>(null);
  // A revoke whose outcome is unknown has its own banner: a later done message never takes its place (C9).
  const [revokeUnsure, setRevokeUnsure] = useState(false);
  const [noticeChecking, setNoticeChecking] = useState(false);
  const [endChecking, setEndChecking] = useState(false);
  // The row End was pressed on: it may sit on a later page of the list, which the first-page query does not hold.
  const [endRow, setEndRow] = useState<Session | null>(null);
  // The revoke in the dialog may have gone through (core's own lock also says so on a live page).
  const [endUnsureFor, setEndUnsureFor] = useState<string | null | false>(false);
  // The last Start over found its holds already replaced or freed: nothing was dismissed, the doubt stays.
  const [endNothing, setEndNothing] = useState(false);
  const [changedPassword, setChangedPassword] = useState<'changed' | 'unsure' | false>(false);

  const sessions = useSessions('active');
  const emailsOffered = useEmailsOffered();
  const turnOff = useTurnOff();
  const newCodes = useNewCodes();
  const gate = useSetGate();
  const endOne = useEndSession();
  const endOthers = useEndOthers();
  // A revoke whose outcome is not known is core's to remember: its hold (or its pending mark) outlives this visit, so the
  // page's notice is drawn from it too. A return to the page, or a reload, then still says a revoke may not have gone
  // through; the notice leaves when a read proved the revoke and core let the hold go.
  const revokeHeld = endOne.pending || endOthers.pending || endOne.holds.length > 0 || endOthers.holds.length > 0;
  const [ending, setEnding] = useState(false);
  // The target the send that is out was pressed for: its dialog alone shows it busy (a link may open another meanwhile).
  const [endingFor, setEndingFor] = useState<string | undefined>(undefined);
  const [endError, setEndError] = useState<string | null>(null);

  const [savedDays, setSavedDays] = useState(() => readAgentDays());
  const [days, setDays] = useState(() => String(readAgentDays()));
  const [daysError, setDaysError] = useState<string | undefined>();
  const [daysOutcome, setDaysOutcome] = useState<{ kind: 'done' | 'failed'; message?: string } | undefined>();
  const daysDirty = days.trim() !== String(savedDays);
  // A save's "Saved" shows for its flash, then the footer goes: nothing is left to save or discard.
  useEffect(() => {
    if (daysOutcome?.kind !== 'done') return;
    const id = setTimeout(() => setDaysOutcome(undefined), SAVED_FLASH_MS);
    return () => clearTimeout(id);
  }, [daysOutcome]);
  const saveDays = () => {
    const n = parseDays(days);
    if (n === null) {
      setDaysError(t('ag.bad'));
      return;
    }
    setDaysError(undefined);
    if (saveAgentDays(n)) {
      setSavedDays(n);
      setDays(String(n));
      setDaysOutcome({ kind: 'done' });
    } else setDaysOutcome({ kind: 'failed', message: t('ag.notSaved') });
  };

  const close = () => setSheet(undefined);
  // Back / Forward / a link changed ?end: the pressed row and any doubt about it belong to the old dialog.
  useEffect(() => {
    if (!endParam) {
      setEndRow(null);
      setEndUnsureFor(false);
      setEndNothing(false);
    }
  }, [endParam]);
  // Check again: the change's own core lock reads back, and so does the 2FA status; both must answer fresh.
  const readBackWith = (hook: { readBack: () => Promise<boolean> }) => async (): Promise<boolean> => {
    // Core's own read-back decides (network-only, and it releases the change's lock); the status is then
    // re-read for display only, never as the proof.
    const own = await hook.readBack();
    const r = await twofa.refetch();
    const proven = provenBy(own, r);
    // What the proving read showed, for a sheet that asks whether its change already landed.
    provenStatus.current = proven ? (r.data ?? null) : null;
    return proven;
  };
  const provenStatus = useRef<{ enabled: boolean; gate: boolean } | null>(null);
  const say = (text: string, kind: 'done' | 'failed' = 'done') => setNotice({ text, kind });
  // The page's locks are module state and survive leaving the page (a pending change is still pending when you
  // come back); parts/locks.ts keeps them across a realm switch and clears them on an account change or sign-out.

  const sessionsBlock = {
    id: 'sessions',
    wide: true,
    title: t('s.title'),
    description: t('s.lead'),
    content: (
      <SessionsSection
        onEnd={(row) => {
          setEndRow(row);
          setEnd(row.id);
        }}
        onEndOthers={() => setEnd('others')}
      />
    ),
  };

  const historyBlock = { id: 'history', wide: true, title: t('h.title'), description: t('h.lead'), content: <HistorySection /> };

  // A suspended account keeps what it can still read: its sessions and its security history (the API serves both to it).
  const sections = suspended
    ? [sessionsBlock, historyBlock]
    : [
        { id: 'profile', title: t('p.title'), content: <ProfileSection onRename={() => setSheet('name')} onEmail={() => setSheet('email')} onSay={say} /> },
        { id: 'password', title: t('pw.title'), content: <PasswordSection onOpen={() => setSheet('password')} /> },
        { id: 'two-step', title: t('2fa.title'), content: <TwoFactorSection onOpen={(x) => setSheet(x)} /> },
        ...(tokenPage ? [] : [{ id: 'passcode', title: t('lock.title'), content: <LockSection onOpen={openLock} /> }]),
        sessionsBlock,
        {
          id: 'agent-sign-in',
          title: t('ag.title'),
          content: (
            <AgentSection
              value={days}
              onChange={(v) => {
                setDays(v);
                setDaysOutcome(undefined);
                // A refusal is about the value it was given: an edit takes it away (Save judges the new one).
                setDaysError(undefined);
              }}
              error={daysError}
            />
          ),
        },
        historyBlock,
        { id: 'ssh', wide: true, title: t('k.title'), description: t('k.lead'), content: <KeysSection /> },
        // What Hoody also emails: only where the account's profile offers the setting.
        ...(emailsOffered ? [{ id: 'emails', title: t('mail.title'), description: t('mail.lead'), content: <EmailsSection /> }] : []),
        { id: 'elsewhere', title: t('rel.title'), description: t('rel.lead'), content: <RelatedSection /> },
        { id: 'browser', title: t('w.section'), description: t('w.sectionLead'), content: (
            <>
              <LanguageRow />
              <PerfRow />
              <WipeRow onOpen={() => setSheet('wipe')} />
            </>
          ),
        },
      ];

  const endTarget = endTargetOf(endParam, endRow, sessions.data?.sessions);
  // The target a revoke may have gone through for: one pending revoke does not lock another session's confirmation.
  const targetKey = endTarget === 'others' ? 'others' : endTarget?.id;
  const markUnsure = () => setEndUnsureFor(targetKey ?? null);
  // The dialog's target now: a Check again answers for the target it was pressed on, never for the one open when it lands.
  const liveTarget = useRef(targetKey);
  useEffect(() => {
    liveTarget.current = targetKey;
  }, [targetKey]);
  // Each opening of the dialog (a target set, changed or cleared) is a new generation: a Start over answers only for the
  // opening it was pressed in, never for the same target closed and opened again meanwhile.
  const dialogGen = useRef(0);
  useEffect(() => {
    dialogGen.current++;
  }, [endParam]);
  // The "nothing was dismissed" note and a refusal belong to the dialog that showed them: another target opens clean.
  useEffect(() => {
    setEndNothing(false);
    setEndError(null);
  }, [targetKey]);
  // The holds core shows for THIS target (a row's identity is the session's id; end-others has one identity), whichever mount
  // sent them: a reopened dialog over a pending hold finds it here, with no local flag. Another session's hold is not this one's.
  const targetHolds = endTarget === 'others' ? endOthers.holds : endTarget ? endOne.holds.filter((row) => row.identity === endTarget.id) : [];
  // A pending change core does not list (the fixture transport) has no known target: it shows on every dialog.
  const unlisted = (endOne.pending && endOne.holds.length === 0) || (endOthers.pending && endOthers.holds.length === 0);
  const unsureHere = targetHolds.length > 0 || unlisted || (endUnsureFor !== false && (endUnsureFor === null || endUnsureFor === targetKey));
  // The target's rows shown when its warning armed (the dialog's target is its key): Start over frees those, by token.
  const armedEnd = useArmedHolds(
    unsureHere,
    () => (endTarget === 'others' ? endOthers.heldNow() : endTarget ? endOne.heldNow().filter((row) => row.identity === endTarget.id) : []),
    targetKey,
  );
  const confirmEnd = async () => {
    if (!endTarget || ending) return;
    setEnding(true);
    setEndingFor(targetKey);
    setEndError(null);
    // The row the dialog was opened on (a cold link has none yet) stays with it until it closes.
    if (endTarget !== 'others') setEndRow(endTarget);
    // The opening this send was pressed in: its answer closes, locks or refuses that dialog only, never one a link opened
    // meanwhile. What the answer says about the account (the page's notice and banner, the list) holds either way.
    const pressedIn = dialogGen.current;
    const r = endTarget === 'others' ? await endOthers.run() : await endOne.run({ id: endTarget.id });
    setEnding(false);
    setEndingFor(undefined);
    const same = dialogGen.current === pressedIn;
    if (r.outcome === 'done') {
      if (same) {
        setEndUnsureFor(false);
        setEnd(undefined);
        setEndRow(null);
      }
      await sessions.refetch();
      const data = r.data as { ended?: number; alreadyEnded?: boolean } | undefined;
      say(endTarget === 'others' ? t('s.endedN', { n: data?.ended ?? 0 }) : t(data?.alreadyEnded ? 's.already' : 's.endedOne'));
    } else if (r.outcome === 'pending') {
      // The dialog stays open and locked (its Check again reads the revoke back, and the pressed row keeps it
      // open after the list was re-read); the page notice remains for when it is closed.
      markUnsure();
      setRevokeUnsure(true);
      await sessions.refetch();
    } else if (r.outcome === 'not_sent' && (r.code === 'BUSY' || r.code === 'READ_BACK_FIRST')) {
      // The send that is still out (this page's or one it replaced) owns the outcome: nothing failed here.
      markUnsure();
      setRevokeUnsure(true);
    } else if (r.outcome !== 'stale' && same) {
      // Too many tries says the wait when the answer named one.
      const w = errorWords(refusal(r), 'none');
      setEndError('vars' in w ? t(w.key, w.vars) : t(w.key));
    }
  };

  return (
    <>
      <SettingsPage
        header={{ title: t('title'), subtitle: suspended ? t('suspended.lead') : t('subtitle') }}
        // A suspended account sees only its sessions, so its page lists no questions about the rest.
        faq={suspended ? undefined : { items: pageFaq(t).items }}
        notice={
          <>
            {suspended && <OutcomeBanner kind="failed" title={t('suspended.title')} body={t('suspended.body')} />}
            {(revokeUnsure || revokeHeld) && (
              <OutcomeBanner
                kind="pending"
                title={t('err.pending')}
                body={null}
                checking={noticeChecking}
                onCheck={() => {
                  setNoticeChecking(true);
                  // Core's read-back releases each revoke's lock; the list is re-read for display. The answer is the proof:
                  // only true closes a leave toast.
                  return Promise.all([endOne.readBack(), endOthers.readBack(), sessions.refetch()]).then(([a, b, r]) => {
                    setNoticeChecking(false);
                    const proven = a && b && !r.isError;
                    if (proven) {
                      // Both reads proved the revoke done (a read that proves nothing frees nothing): the dialog must not keep claiming it may not have gone through.
                      setEndUnsureFor(false);
                      setRevokeUnsure(false);
                    }
                    return proven;
                  });
                }}
              />
            )}
            {notice && <OutcomeBanner kind={notice.kind} title={notice.text} onDismiss={() => setNotice(null)} /* noDetails: a section says a fixed sentence here; it keeps the refusal itself and does not pass it up */ />}
          </>
        }
        sections={sections}
        summary={suspended ? undefined : <SecuritySummary onOpen={(x) => setSheet(x)} />}
        footer={
          !suspended && (daysDirty || daysOutcome) ? (
            <FormFooter
              dirty={daysDirty}
              outcome={daysOutcome}
              doneText={t('ag.saved')}
              doneFor={SAVED_FLASH_MS}
              onSubmit={saveDays}
              submitLabel={t('ag.save')}
              onDiscard={() => {
                setDays(String(savedDays));
                setDaysError(undefined);
                setDaysOutcome(undefined);
              }}
            />
          ) : undefined
        }
      />

      {/* A sheet is mounted only while it is the open one: closing it (Cancel, Discard, Back, the URL) unmounts it, so
          every typed password, code and shown secret leaves with it. */}
      {sheet === 'name' && <NameSheet open onClose={close} onDone={() => say(t('p.renamed'))} />}
      {sheet === 'email' && <EmailSheet open onClose={close} onSent={(email, other) => say(t(other ? 'e.sentOther' : 'e.sent', { email }))} />}
      {sheet === 'wipe' && <WipeDialog open onClose={close} />}
      {lockSheet && <LockSheet key={lockSheet} mode={lockSheet} onClose={close} onDone={(text) => say(text)} />}
      {sheet === 'password' && <PasswordSheet open onClose={close} onChanged={() => setChangedPassword('changed')} onUnsure={() => setChangedPassword('unsure')} />}
      {sheet === 'setup' && (
        <SetupSheet
          open
          onClose={close}
          onOn={() => void twofa.refetch().then(() => say(t('2fa.nowOn')))}
        />
      )}
      {sheet === 'off' && (
        <CodeSheet resizeKey="account-two-step-off"
          open
          onClose={close}
          title={t('2fa.offTitle')}
          lead={t('2fa.offLead')}
          confirm={t('2fa.turnOff')}
          danger
          backupOk
          landed={() => provenStatus.current?.enabled === false}
          holds={turnOff.heldNow}
          dismiss={turnOff.dismissRows}
          op="off"
          send={(password, code) => turnOff.run({ password, code })}
          readBack={readBackWith(turnOff)}
          onDone={() => void twofa.refetch().then(() => say(t('2fa.nowOff')))}
        />
      )}
      {sheet === 'codes' && (
        <CodeSheet resizeKey="account-backup-codes"
          open
          onClose={close}
          title={t('2fa.newCodes')}
          lead={t('2fa.regenLead')}
          confirm={t('2fa.makeCodes')}
          op="codes"
          repeatRisk
          send={(password, code) => newCodes.run({ password, code })}
          readBack={readBackWith(newCodes)}
          holds={newCodes.heldNow}
          dismiss={newCodes.dismissRows}
          onDone={() => void twofa.refetch()}
          release={(h) => h.drop()}
          after={(data, saved, setSaved) => <NewCodes held={data ?? null} saved={saved} onSaved={setSaved} onGone={() => setSaved(true)} />}
        />
      )}
      {sheet === 'gate-off' && (
        <CodeSheet resizeKey="account-code-gate-off"
          open
          onClose={close}
          title={t('2fa.gateOffTitle')}
          lead={t('2fa.gateOffLead')}
          confirm={t('2fa.gateOff')}
          danger
          backupOk
          landed={() => provenStatus.current?.gate === false}
          holds={gate.heldNow}
          dismiss={gate.dismissRows}
          op="gate"
          send={(password, code) => gate.run({ enabled: false, password, code })}
          readBack={readBackWith(gate)}
          onDone={() => void twofa.refetch().then(() => say(t('2fa.gateNowOff')))}
        />
      )}

      <ConfirmDialog
        overlayId="account-sessions-end-confirm"
        isOpen={endTarget !== undefined}
        onOpenChange={(o) => {
          if (!o) {
            setEnd(undefined);
            setEndRow(null);
            setEndError(null);
          }
        }}
        tone="danger"
        title={endTarget === 'others' ? t('s.endOthersTitle') : t('s.endTitle')}
        body={
          endTarget === 'others'
            ? t('s.endOthersBody')
            : endTarget
              ? t('s.endBody', { device: deviceLabel(endTarget, t).name })
              : null
        }
        confirmLabel={endTarget === 'others' ? t('s.endOthers') : t('s.end')}
        busy={ending && endingFor === targetKey}
        // Another dialog's send is still out: one at a time, so this End waits for it (and says so) instead of doing nothing.
        confirmDisabled={ending && endingFor !== targetKey}
        confirmDisabledReason={t('s.endWait')}
        outcome={unsureHere ? { kind: 'pending' as const } : undefined}
        checking={endChecking}
        onCheck={() => {
          setEndChecking(true);
          const pressedOn = targetKey;
          const pressedIn = dialogGen.current;
          // The answer is the proof (only true closes a leave toast), whichever target the dialog is on by then.
          return Promise.all([endOne.readBack(), endOthers.readBack(), sessions.refetch()]).then(([a, b, r]) => {
            setEndChecking(false);
            const proven = a && b && !r.isError;
            if (liveTarget.current !== pressedOn || dialogGen.current !== pressedIn) {
              // The dialog is on another target now, or was closed and opened again on this one: nothing here touches it. A proof still ends the page's own doubt about the revokes.
              if (proven) {
                setEndUnsureFor(false);
                setRevokeUnsure(false);
              }
              return proven;
            }
            if (proven) {
              setEndUnsureFor(false);
              setEnd(undefined);
              setEndRow(null);
              setRevokeUnsure(false);
            } else {
              // An inconclusive Check again is the person's refresh: the warning is shown over the rows on screen now, and an earlier "not dismissed" note is stale.
              armedEnd.retake();
              setEndNothing(false);
              markUnsure();
            }
            return proven;
          });
        }}
        onConfirm={() => void confirmEnd()}
        // The warned Stop tracking lives on the dialog's own pending outcome (after Check again): the warning is the
        // outcome's line and describes the button, so it is heard with Stop tracking however focus reaches it.
        outcomeDetail={unsureHere ? t('s.endWarn') : undefined}
        outcomeNote={unsureHere && endNothing ? t('s.endNothing') : null}
        outcomeActions={
          unsureHere
            ? ({ detailId }) => (
              <TextButton
                aria-describedby={detailId}
                onPress={() => {
                  // Only the hold of the target this dialog is about, as shown when its warning armed (each by its token):
                  // end-others for "others", else the session's own revoke. Another session's revoke, shown or not, and a
                  // send that replaced the shown one meanwhile are left held (false: the note). The answer lands after a
                  // store-lock turn: when the dialog is on another target, or was closed and opened again, by then, it
                  // touches nothing here.
                  const pressedOn = targetKey;
                  const pressedIn = dialogGen.current;
                  void (endTarget === 'others' ? endOthers : endOne).dismissRows(armedEnd.shown()).then((freed) => {
                    if (liveTarget.current !== pressedOn || dialogGen.current !== pressedIn) return;
                    if (!freed) {
                      setEndNothing(true);
                      return;
                    }
                    setEndNothing(false);
                    setEndUnsureFor(false);
                    // The page's banner is about every revoke still held: it goes only when this was the last one.
                    if (endOne.heldNow().length === 0 && endOthers.heldNow().length === 0) setRevokeUnsure(false);
                    setEnd(undefined);
                    setEndRow(null);
                  });
                }}
              >
                {t('check.startOver')}
              </TextButton>
            )
            : undefined
        }
      >
        {/* The refusal sits under the sentence, in the dialog's own place for extra content: the body stays one plain
            sentence, so a terminal draws it and the banner stacked (a sentence beside a banner in one body was laid out
            as one row there). */}
        {endError && <OutcomeBanner kind="failed" body={endError} />}
      </ConfirmDialog>

      {/* Not dismissible: every session is already ended, so the one way forward is to sign in again. An alert dialog that
          needs that action: it opens with focus on the dialog itself, so its title and sentence are read first, and Sign in
          again is the next Tab (a confirm never opens on its action). */}
      <Dialog
        overlayId="account-password-done"
        isOpen={changedPassword !== false}
        onOpenChange={() => undefined}
        role="alertdialog"
        title={changedPassword === 'unsure' ? t('pw.unsureTitle') : t('pw.doneTitle')}
        body={changedPassword === 'unsure' ? t('pw.unsure') : t('pw.done')}
        primaryLabel={t('pw.signIn')}
        onPrimary={() => (shell.signOut ? shell.signOut() : window.location.reload())}
        hideCancel
        isDismissable={false}
      />
    </>
  );
}
