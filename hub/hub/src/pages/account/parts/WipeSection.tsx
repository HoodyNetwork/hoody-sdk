// This browser: Remove all local data (fail closed). The row opens a danger confirm
// (?sheet=wipe) that asks the person to close their other Hoody Hub tabs and names, for the shown account, the changes
// that may already have gone through (grouped by the page that sent them, each linking there) and its questions still
// waiting; while it names any, a second explicit tick is needed. Work still running from this tab is named on its own
// line (the sign-out stops it; core refuses a confirm when more runs than the line said). A payment in this browser with no final answer (or
// payments that cannot be read) keeps the button disabled, with a link to Billing. Confirming passes exactly the
// warning shown to core's removeLocalData; every answer but 'started' removed nothing and says why: other tabs open,
// a payment not settled, the stores it could not check (named), or a warning that changed. 'started' signs out and
// wipes (the page then leaves); the dialog never says the data was removed.
import { Button, Checkbox, ConfirmDialog, HeldFromLink, OutcomeBanner, SettingRow, StatusLine, useStrings } from '@kit';
import { pageFaq } from '../faq';
import type { LocalWipe, LocalWipeWarning, WipeCheck } from '@core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalWipe } from '../data';
import strings from '../strings.en.json';
import s from './Wipe.module.css';

const PAGES = ['account', 'ai', 'apps', 'billing', 'board', 'bots', 'computers', 'guide', 'home', 'keys', 'logs', 'market', 'notes', 'notifications', 'programs', 'schedules', 'scripts', 'vault'] as const;
type KnownPage = (typeof PAGES)[number];
const known = (p: string | null): p is KnownPage => p !== null && (PAGES as readonly string[]).includes(p);

export function WipeRow({ onOpen }: { onOpen: () => void }) {
  const t = useStrings(strings);
  return (
    <SettingRow label={t('w.title')} help={t('w.help')}>
      <Button size="sm" tone="danger" onPress={onOpen}>
        {t('w.open')}
      </Button>
    </SettingRow>
  );
}

/** How many things the confirm names (the tick is needed when any). */
export function wipeItemCount(w: LocalWipeWarning | null): number {
  return w ? w.holds.length + w.asks.length : 0;
}

/** Why the confirm is off, when the dialog itself has to say it: the warning is not read yet, or the list needs the tick.
 *  Null when it is on, or when payments not settled keep it off (their banner says so). Same gate as the confirm. */
export function wipeReason(w: LocalWipeWarning | null, paymentsOpen: boolean, count: number, ticked: boolean): 'w.reason.reading' | 'w.reason.tick' | null {
  if (!w) return 'w.reason.reading';
  if (paymentsOpen) return null;
  return count > 0 && !ticked ? 'w.reason.tick' : null;
}

type Note = Exclude<LocalWipe, { kind: 'started' }>;

export function WipeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useStrings(strings);
  const wipe = useLocalWipe(open);
  // The warning the person is looking at: it follows the live one while nothing runs, frozen while a press runs.
  const [busy, setBusy] = useState(false);
  const [ticked, setTicked] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const shown = useRef<LocalWipeWarning | null>(null);
  if (!busy) shown.current = wipe.warning;
  const w = shown.current;
  const count = wipeItemCount(w);
  const paymentsOpen = !!w && w.payments !== 'settled';
  // A list that changed clears the tick: the person agrees to what is listed now.
  const sig = useMemo(() => (w ? JSON.stringify([w.account, w.holds.map((h) => [h.ref.id, h.ref.token, h.ref.sending === true]), w.asks.map((a) => a.askId)]) : ''), [w]);
  useEffect(() => setTicked(false), [sig]);

  const groups = useMemo(() => {
    const by = new Map<string, { page: KnownPage | null; count: number; sending: number }>();
    for (const h of w?.holds ?? []) {
      const page = known(h.page) ? h.page : null;
      const k = page ?? '';
      const g = by.get(k) ?? { page, count: 0, sending: 0 };
      g.count += 1;
      if (h.ref.sending === true) g.sending += 1;
      by.set(k, g);
    }
    return [...by.values()].sort((a, b) => (a.page === null ? 1 : b.page === null ? -1 : a.page.localeCompare(b.page)));
  }, [w]);

  const confirm = async () => {
    if (busy || !w || paymentsOpen || (count > 0 && !ticked)) return;
    setBusy(true);
    setNote(null);
    let r: LocalWipe = { kind: 'failed' };
    try {
      r = await wipe.run(w);
    } catch {
      r = { kind: 'failed' };
    }
    setBusy(false);
    if (r.kind === 'started') {
      // Live, the page signs out and leaves; under fixtures the dialog just closes.
      onClose();
      return;
    }
    if (r.kind === 'changed') {
      // The person agrees again to what is listed now.
      setTicked(false);
    }
    wipe.reread();
    setNote(r);
  };

  const billing = (
    <HeldFromLink page="billing" fallback={t('w.billing')}>
      {t('w.billing')}
    </HeldFromLink>
  );
  const checks = (what: readonly WipeCheck[]) => what.map((c) => t(`w.check.${c}`)).join(', ');
  const noteBody = (n: Note) => {
    switch (n.kind) {
      case 'tabs': return <><strong>{t('w.tabs')}</strong> {t('w.tabsLead')}</>;
      case 'payments': return <>{t('w.payHeld')} {billing}</>;
      case 'unchecked': return t('w.unchecked', { what: checks(n.what) });
      // Only a terminal answers it (core KeyValueStore.cannotDelete): web storage can always remove its keys.
      case 'store': return t(n.why === 'busy' ? 'w.storeBusy' : 'w.storeFailed');
      case 'changed': return t('w.changed');
      default: return t('w.failed');
    }
  };
  const sending = <span className={s.faint}> {t('w.sending')}</span>;
  const reason = wipeReason(w, paymentsOpen, count, ticked);
  // The line mounts empty and gets its reason on the next render: a live page reads the warning synchronously, and text
  // mounted together with its live region may never be announced.
  const [heard, setHeard] = useState(false);
  useEffect(() => setHeard(open), [open]);
  return (
    <ConfirmDialog
      overlayId="account-wipe-confirm"
      isOpen={open}
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
      title={t('w.confirmTitle')}
      tone="danger"
      confirmLabel={t('w.confirm')}
      onConfirm={() => void confirm()}
      busy={busy}
      confirmDisabled={!w || paymentsOpen || (count > 0 && !ticked)}
      body={<p>{t('w.bodyShort')}</p>}
      // What the person must know before confirming stays in the dialog; the full answer is the page FAQ's (the
      // dialog's own faq link, which the kit puts right after the body, before the consequences).
      consequences={[
        t('w.oneTab'),
        ...(w && (w.running ?? 0) > 0 ? [t('w.running', { count: w.running ?? 0 })] : []),
        t('w.otherAccounts'),
      ]}
      faq={{ item: pageFaq(t).byId.removeLocal, label: t('w.more') }}
    >
      {note && (
        <div className={s.banner}>
          <OutcomeBanner
            // Every note is a definite local refusal: nothing was removed (never "may have gone through").
            kind="not_sent"
            title={t('w.notRemoved')}
            // noDetails: core answered a local verdict (other tabs, payments, stores it could not check, a changed
            // warning); no server answer exists to show.
            body={noteBody(note)}
          />
        </div>
      )}
      {paymentsOpen && w && (!note || note.kind !== 'payments') && (
        <div className={s.banner}>
          <OutcomeBanner
            kind="failed"
            // Its own title: nothing was tried yet, so the kit's "This didn't go through" would contradict the body.
            title={t('w.payTitle')}
            // noDetails: a local reading of this browser's saved payments; no server answer exists to show.
            body={<>{t(w.payments === 'held' ? 'w.payHeld' : 'w.payUnreadable')} {billing}</>}
          />
        </div>
      )}
      {count > 0 && w && (
        <>
          <p>{t('w.itemsTitle')}</p>
          <ul className={s.list} aria-label={t('w.itemsTitle')}>
            {groups.map((g) => {
              const page = g.page ? t(`w.page.${g.page}`) : t('w.page.other');
              const text = t('w.held', { count: g.count, page });
              return (
                <li key={g.page ?? ''}>
                  <HeldFromLink page={g.page ?? ''} fallback={text}>
                    {text}
                  </HeldFromLink>
                  {g.sending > 0 && sending}
                </li>
              );
            })}
            {w.asks.length > 0 && <li>{t('w.asks', { count: w.asks.length })}</li>}
          </ul>
          <Checkbox label={t('w.tick')} isSelected={ticked} onChange={setTicked} isDisabled={busy || paymentsOpen} />
        </>
      )}
      {/* A disabled confirm says why, as visible text (touch has no hover), in the gate's order: the warning not read
          yet, then the tick. Payments that are not settled already say so in their own banner above. One StatusLine that
          stays mounted, so a reason that changes is heard. The button itself carries no reason for focus yet (K10). */}
      <StatusLine>{heard && reason === 'w.reason.reading' ? t('w.reason.reading') : heard && reason === 'w.reason.tick' ? t('w.reason.tick') : null}</StatusLine>
    </ConfirmDialog>
  );
}
