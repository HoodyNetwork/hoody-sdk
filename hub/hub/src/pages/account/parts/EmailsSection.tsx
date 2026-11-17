// Emails: what Hoody also sends to the account's address. One setting today: the mail that says support replied
// (PUT /users/{id} {support_reply_email}; the notice in the Hub comes either way). The switch shows what the profile
// says; a change counts only once a fresh profile read shows the asked value. An unknown outcome locks the row: Check
// again reads the profile back, nothing is sent again, and after an inconclusive check a warned Stop tracking (C9).
// The setting is the account's own: a shared-access (token) session sees it and cannot change it (the API refuses the
// write from a token), so there the switch is off, its help says why, and nothing is sent.
import { capture } from '@core';
import { ConfirmDialog, SettingRow, Switch, useStrings } from '@kit';
import { useEffect, useState } from 'react';
import { pressContext, supportMailAfterSave, useArmedHolds, useProfile, useSupportMail } from '../data';
import { refusal } from '../logic';
import strings from '../strings.en.json';
import { stillOut } from './locks';

/** Whether the section shows: the profile offers the setting (an API that does not report it offers none), or a change
 *  of it is still held. Before the profile answered the section is there with its switch off limits, so a link to it
 *  (?section=emails) finds it; it leaves only when the profile answered without the setting. */
export function useEmailsOffered(): boolean {
  const profile = useProfile();
  const known = profile.data?.supportMail !== undefined;
  const held = useSupportMail().pending;
  // Once the profile offered it, it stays for this visit: a later failed read never takes a row away mid-change. The
  // first load does not count as an offer (the section leaves when that answer has no setting).
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (known || held) setSeen(true);
  }, [known, held]);
  return seen || known || held || profile.isPending;
}

/** The value the held change asked for, when core's hold names one. */
function heldValue(rows: readonly { identity: unknown }[]): boolean | null {
  for (const r of rows) {
    const on = (r.identity as { on?: unknown } | null)?.on;
    if (typeof on === 'boolean') return on;
  }
  return null;
}

export function EmailsSection() {
  const t = useStrings(strings);
  const profile = useProfile();
  const change = useSupportMail();
  // The value of the send that is out, so the switch does not jump back while it runs.
  const [sending, setSending] = useState<boolean | null>(null);
  // The value a fresh read proved in this visit; dropped as soon as the profile itself says anything else.
  const [proved, setProved] = useState<boolean | null>(null);
  const [out, setOut] = useState<{ kind: 'done' } | { kind: 'failed'; error?: { outcome: string; code?: string; status?: number }; unconfirmed?: true } | null>(null);
  const [unsure, setUnsure] = useState(false);
  const [asking, setAsking] = useState(false);
  // The value of a send whose outcome is not known, as this visit saw it. Core's own hold of the change survives a
  // reload (this does not): either one locks the switch.
  const [stuck, setStuck] = useState<boolean | null>(null);
  const held = stuck !== null || change.pending;
  const armed = useArmedHolds(unsure, change.heldNow);
  const stored = profile.data?.supportMail;
  const byToken = capture().page?.kind === 'token';
  useEffect(() => {
    setProved(null);
  }, [stored]);
  useEffect(() => {
    if (!held) setUnsure(false);
  }, [held]);

  const value = sending ?? stuck ?? (held ? heldValue(change.holds) : null) ?? proved ?? stored ?? true;

  const toggle = async (on: boolean) => {
    if (byToken || change.running || held || sending !== null) return;
    setOut(null);
    setSending(on);
    const r = await change.run({ on });
    if (r.outcome === 'done') {
      // Done only when a fresh read of the profile shows the asked value.
      const after = supportMailAfterSave(await profile.refetch(), on);
      if (after === 'proved') {
        setProved(on);
        setOut({ kind: 'done' });
      } else if (after === 'unknown') {
        // The change was taken and the read after it told nothing: not known, so held until a read tells.
        setStuck(on);
      } else setOut({ kind: 'failed', unconfirmed: true });
    } else if (stillOut(r)) {
      // Unknown: locked until a read tells. A refusal for an earlier send still out names no value of its own.
      if (r.outcome === 'pending') setStuck(on);
    } else if (!r.cancelled && (r.outcome === 'failed' || r.outcome === 'not_sent')) {
      setOut({ kind: 'failed', error: { outcome: r.outcome, ...refusal(r) } });
    }
    setSending(null);
  };

  // Check again: core's read-back (its proof is the profile showing the asked value), then the profile for display.
  const check = async (): Promise<boolean> => {
    const proven = await change.readBack();
    const p = await profile.refetch();
    if (proven && !p.isError) {
      setStuck(null);
      setUnsure(false);
      return true;
    }
    armed.retake();
    setUnsure(true);
    return false;
  };

  const stop = () => {
    const at = pressContext();
    setAsking(false);
    void change.dismissRows(armed.shown()).then((freed) => {
      if (!at.still() || !freed) return;
      setStuck(null);
      setUnsure(false);
      void profile.refetch();
    });
  };

  return (
    <>
      <SettingRow
        label={t('mail.support')}
        help={byToken ? t('mail.supportHelpToken') : t('mail.supportHelp')}
        outcome={held ? { kind: 'pending' } : out}
        error={!held && out?.kind === 'failed' ? out.error : undefined}
        // noDetails: the change was answered as saved, and the profile read after it shows another value; there is no rejection to show.
        detail={!held && out?.kind === 'failed' && out.unconfirmed ? t('mail.unconfirmed') : undefined}
        onCheck={held ? check : undefined}
        // Stop tracking only after a Check again that could not tell; the page asks first.
        onStop={held && unsure ? () => setAsking(true) : undefined}
      >
        {(ids) => (
          <Switch
            labelledBy={ids.nameId}
            aria-describedby={ids.helpId}
            isSelected={value}
            // Not before the profile said what is stored: a switch drawn from nothing is never one to press.
            isDisabled={byToken || change.running || held || sending !== null || (stored === undefined && proved === null)}
            onChange={(on) => void toggle(on)}
          />
        )}
      </SettingRow>
      <ConfirmDialog
        overlayId="account-support-mail-stop"
        isOpen={asking}
        onOpenChange={setAsking}
        tone="danger"
        title={t('mail.stopTitle')}
        body={t('check.dismissWarn')}
        confirmLabel={t('check.startOver')}
        onConfirm={stop}
      />
    </>
  );
}
