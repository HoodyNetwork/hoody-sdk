// The held operation of one schedule (C9): working, "may have gone through" with a read-back
// button, or a definite failure. Compact in a table cell, a full banner in the inspector.
import { Outcome, OutcomeBanner, Spinner, useStrings, type StringKey } from '@kit';
import strings from '../strings.en.json';
import type { Op } from './ops';

type Key = StringKey<typeof strings>;

const NO_CODES = ['exists', 'disabled', 'expired', 'invalid', 'inProgress', 'tooMany', 'didntStart', 'changed', 'gone'] as const;

// A run leaves nothing a read of the list can show: only the person's Close frees it, knowingly.
const RAN: ReadonlySet<string> = new Set(['run', 'exec.run', 'loop.run']);

const UNKNOWN: Record<string, Key> = {
  save: 'u.saved', create: 'u.saved', edit: 'u.saved', del: 'u.deleted', 'curl.del': 'u.deleted', 'loop.del': 'u.deleted',
  run: 'u.ran', 'exec.run': 'u.ran', 'loop.run': 'u.ranLoop', pause: 'u.saved', 'curl.pause': 'u.saved', 'curl.edit': 'u.saved', 'loop.pause': 'u.saved',
};

export interface OpNoteProps {
  op: Op;
  compact?: boolean;
  /** Compact only: a list row's line 2 (one fixed line beside the row menu), so a held change says it in fewer words. */
  narrow?: boolean;
  onCheck: () => void;
  onDismiss: () => void;
}

export function OpNote({ op, compact, narrow, onCheck, onDismiss }: OpNoteProps) {
  const t = useStrings(strings);
  const unknownText = t(UNKNOWN[op.act] ?? 'u.saved');
  const code = op.code ?? '';
  const failText = (NO_CODES as readonly string[]).includes(code) ? t(`no.${code}` as Key) : t('no.generic');

  if (op.status === 'working') {
    return (
      <span role="status" /* role: one-line note for a send under way; the kit Outcome has no working kind */ data-op="working">
        {/* The words are the status (this span's text); the spinner is only the mark. A labelled Spinner here said it twice:
            two status roles on the web, "… Working…  Working…" in the terminal (Spinner.term draws its label). */}
        <Spinner /> {t('u.working')}
      </span>
    );
  }

  if (compact) {
    // The kit's Outcome line: one row at button height, Check again on a pending one.
    if (op.status === 'unknown') {
      // An earlier send (READ_BACK_FIRST): no read can confirm it, so no Check; the full note offers the warned Close.
      const short = narrow ? { title: t('op.pendingShort') } : {};
      if (op.earlier) return <Outcome outcome={{ kind: 'pending' }} {...short} />;
      return <Outcome outcome={{ kind: 'pending' }} onCheck={onCheck} checking={op.checking} {...short} />;
    }
    return <Outcome outcome={{ kind: op.status === 'refused' ? 'not_sent' : 'failed' }} title={op.status === 'refused' ? t('op.refusedShort') : t('op.failedShort')} onDismiss={onDismiss} />;
  }

  if (op.status === 'unknown' && op.earlier) {
    // Only cron's pause shares its lock's sender with saves; any other action's earlier send is the same action.
    const earlierText = `${unknownText} ${t(op.act === 'pause' ? 'op.earlierShared' : 'op.earlier')}`;
    return <OutcomeBanner kind="pending" body={earlierText} onDismiss={onDismiss} />;
  }
  if (op.status === 'unknown') {
    return (
      <OutcomeBanner
        kind="pending"
        body={op.stuck ? `${unknownText} ${RAN.has(op.act) ? t('op.stuck.run') : t('op.stuck')}` : unknownText}
        onCheck={onCheck}
        checking={op.checking}
        {...(op.stuck ? { onDismiss } : {})}
      />
    );
  }
  // Another sender's change of the same entry may have gone through: this press was not sent, but nothing is "unchanged".
  if (op.status === 'refused') return <OutcomeBanner kind="not_sent" body={t(op.code === 'HELD_BY_OTHER' ? 'op.heldOther' : 'op.refused')} onDismiss={onDismiss} />;
  return (
    <OutcomeBanner
      kind="failed"
      body={failText}
      onDismiss={onDismiss}
    />
  );
}
