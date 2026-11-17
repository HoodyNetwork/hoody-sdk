// The held operation of one program (C9): working, "may have gone through" with a read-back
// button, or a definite failure. The kit Outcome line in a table cell, a full banner in the inspector.
import { ConfirmDialog, HeldFromLink, Outcome, OutcomeBanner, Spinner, useStrings, type StringKey } from '@kit';
import { useState } from 'react';
import strings from '../strings.en.json';
import type { Op } from './ops';

type Key = StringKey<typeof strings>;

const FAIL_CODES = ['PROGRAM_DISABLED', 'NOTHING_RUNNING', 'START_FAILED', 'NOT_APPLIED', 'READ_FAILED'] as const;

export interface OpNoteProps {
  op: Op;
  name: string;
  compact?: boolean;
  /** Each control names the op it showed (C9): a Check or Dismiss acts on exactly that send, never on a newer one
   *  the page's store holds by the time it runs. Dismiss answers true when that send was let go. */
  onCheck: (shown: Op) => void;
  onDismiss: (shown: Op) => Promise<boolean>;
  /** The place inside the sending page to open (its own Hub path, e.g. this computer's Programs tab on
   *  Computers); undefined: the page itself. */
  senderPath?: (page: string) => string | undefined;
}

// The pages that send program changes, by id, for the note's words; another sender reads "another page".
const SENDER_NAMES: Readonly<Record<string, Key>> = { computers: 'page.computers' };

export function OpNote({ op, name, compact, onCheck, onDismiss, senderPath }: OpNoteProps) {
  const t = useStrings(strings);
  // Dismissing "may have gone through" frees the held change, so the next press sends again: ask first (C9).
  // The ask belongs to the op it was raised on: another op (a new press, another program) never inherits it.
  const [askedFor, setAskedFor] = useState<Op | null>(null);
  // A confirmed Dismiss that freed nothing: its send was settled or sent again meanwhile, so the row stays and says so.
  const [moved, setMoved] = useState(false);
  const v = { name: name || t('unnamed') };
  const unknownText = t(`op.unk.${op.act}` as Key, v);
  const failText = (FAIL_CODES as readonly string[]).includes(op.code ?? '') ? t(`op.f.${op.code}` as Key, v) : t('op.f.generic', v);

  if (op.status === 'working') {
    // The words are the status (this span's text); the spinner is only the mark. A labelled Spinner before the same
    // words is said twice in the terminal, whose Spinner draws its label.
    return (
      <span role="status" /* reason: one-line note for a press under way; the kit Outcome has no working kind */ data-op="working">
        <Spinner /> {t('op.working')}
      </span>
    );
  }

  // A change another page sent and core holds for it (C9): only that page can check or dismiss it, so this page
  // shows it read-only, with the way there; a Dismiss here would free nothing (core frees only its own sender's).
  if (op.status === 'unknown' && op.from === 'other') {
    const named = op.fromPage ? SENDER_NAMES[op.fromPage] : undefined;
    const page = named ? t(named) : undefined;
    const place = op.fromPage ? senderPath?.(op.fromPage) : undefined;
    if (compact) return <Outcome outcome="pending" title={page ? t('op.elsewhereRow', { page }) : t('op.elsewhereRowAny')} />;
    return (
      <OutcomeBanner
        kind="pending"
        body={
          <>
            {page ? t('op.elsewhere', { ...v, page }) : t('op.elsewhereAny', v)}
            {op.fromPage && (
              <>
                {' '}
                {/* The shared "held on <page>" link: none when this load hides that page (never the classic Hub). */}
                <HeldFromLink page={op.fromPage} {...(place ? { path: place } : {})}>
                  {page ? t('op.openSender', { page }) : t('op.openSenderAny')}
                </HeldFromLink>
              </>
            )}
          </>
        }
      />
    );
  }

  // In the row: the kit Outcome line, short words that fit the Actions cell, with Check again on an
  // unknown outcome and Dismiss after a definite one (the inspector shows the full sentence).
  if (compact) {
    if (op.status === 'unknown') {
      // One word: beside Check again the narrow Actions cell cuts anything longer ("May …").
      return <Outcome outcome="pending" title={t('op.pendingRow')} onCheck={() => onCheck(op)} checking={op.checking} />;
    }
    const title = op.status === 'refused' ? t('op.refusedShort') : op.status === 'gone' ? t('op.goneShort') : t('op.failedShort');
    return <Outcome outcome={op.status === 'refused' ? 'not_sent' : 'failed'} title={title} onDismiss={() => void onDismiss(op)} />;
  }

  if (op.status === 'unknown') {
    return (
      <>
        <OutcomeBanner
          kind="pending"
          known={unknownText}
          checkLine={op.stuck ? t('op.stuck') : undefined}
          stopLine={moved ? t('op.moved') : undefined}
          onCheck={() => onCheck(op)}
          checking={op.checking}
          onDismiss={() => {
            setMoved(false);
            setAskedFor(op);
          }}
          dismissWarned
        />
        <ConfirmDialog overlayId="programs-op-dismiss"
          isOpen={askedFor === op}
          onOpenChange={(o) => !o && setAskedFor(null)}
          title={t('op.dismissTitle')}
          body={t('op.dismissBody')}
          confirmLabel={t('op.dismissGo')}
          // The warning's own op, exactly: the hold it showed, never one that replaced it since it opened.
          onConfirm={() => {
            const shown = askedFor;
            setAskedFor(null);
            if (shown) void onDismiss(shown).then((freed) => !freed && setMoved(true));
          }}
        />
      </>
    );
  }
  const close = () => void onDismiss(op);
  if (op.status === 'gone') return <OutcomeBanner kind="failed" title={t('op.goneShort')} body={t('op.gone', v)} onDismiss={close} />;
  if (op.status === 'refused') return <OutcomeBanner kind="not_sent" body={t('op.refused')} onDismiss={close} />;
  return <OutcomeBanner kind="failed" body={failText} onDismiss={close} />;
}
