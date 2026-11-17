// A change that may have gone through (C9), shown where it was sent: what was sent, Check again (reads, never
// resends) and a warned Dismiss. Used in place of a fresh form while core holds the change.
import type { HeldFrom } from '@core';
import { Band, Button, ConfirmDialog, PageLinkTo, usePageVisible, useStrings } from '@kit';
import { useState } from 'react';
import strings from '../strings.en.json';

// The kinds whose send makes something: sending one again makes a second one. Any other is a change, repeated.
const MAKES: ReadonlySet<string> = new Set(['create', 'copy', 'aliasCreate', 'projectCreate']);

// The pages that share a lock with this one, by name; any other sender reads as "another page".
const PAGE_NAME = { computers: 'held.from.computers', scripts: 'held.from.scripts', keys: 'held.from.keys', home: 'held.from.home', programs: 'held.from.programs', board: 'held.from.board', bots: 'held.from.bots' } as const;

/** `elsewhere`: another page sent the change (core's heldBy 'other') and only that page can settle it, so there is
 *  no Dismiss here (it would not release it): a link to that page instead, when this load serves it. When core
 *  does not know which page it was, or that page is hidden, Check again: it only reads (core never judges another
 *  page's change, so it frees nothing here); the band goes when the sender's own proof or Dismiss frees the change. */
export function Held({
  kind,
  name,
  text,
  checking,
  dismissOnly,
  elsewhere,
  onCheck,
  onDismiss,
}: {
  kind: 'create' | 'copy' | 'remove' | 'rename' | 'colour' | 'realms' | 'ssh' | 'aliasCreate' | 'aliasRemove' | 'redeem' | 'run' | 'lifecycle' | 'projectCreate' | 'projectUpdate' | 'projectRemove';
  name: string;
  /** The band's sentence, for a part that keeps its own words (it then takes the place of `held.<kind>`). */
  text?: string;
  checking?: boolean;
  dismissOnly?: boolean;
  elsewhere?: { from: HeldFrom | null } | null;
  onCheck: () => unknown;
  /** Absent: no Dismiss (the change frees only on its proof, as a lost project delete until a read found it). */
  onDismiss?: () => unknown;
}) {
  const t = useStrings(strings);
  // The question keeps the Dismiss the band had when it was opened: confirming frees what was shown then, never
  // a later send that took its place while the question was open.
  const [asked, setAsked] = useState<{ go: () => unknown } | null>(null);
  const ask = asked !== null;
  const from = elsewhere?.from ?? null;
  const page = from && Object.hasOwn(PAGE_NAME, from.page) ? t(PAGE_NAME[from.page as keyof typeof PAGE_NAME]) : t('held.from.other');
  // Only a sender page this load serves gets a link: a hidden one gets none (not even its classic view).
  const fromServed = usePageVisible(from?.page ?? '');
  return (
    <>
      <Band
        tone="warn"
        size="table"
        actions={
          elsewhere ? (
            from && fromServed ? (
              <PageLinkTo page={from.page} href={from.path} variant="inline">{t('held.open', { page })}</PageLinkTo>
            ) : dismissOnly ? null : (
              <Button size="sm" onPress={() => void onCheck()} busy={checking}>{t('held.check')}</Button>
            )
          ) : (
            <>
              {dismissOnly ? null : <Button size="sm" onPress={() => void onCheck()} busy={checking}>{t('held.check')}</Button>}
              {onDismiss && <Button size="sm" variant="ghost" onPress={() => setAsked({ go: onDismiss })}>{t('held.dismiss')}</Button>}
            </>
          )
        }
      >
        {elsewhere ? t('held.elsewhere', { page }) : (text ?? t(`held.${kind}`, { name }))}
      </Band>
      <ConfirmDialog overlayId="computers-held-dismiss"
        // A band that turned read-only (another page's hold) takes its open question with it.
        isOpen={ask && !elsewhere}
        onOpenChange={(o) => !o && setAsked(null)}
        title={t('held.dismissTitle')}
        body={t(MAKES.has(kind) ? 'held.dismissBody' : 'held.dismissBodyChange')}
        confirmLabel={t('held.dismissGo')}
        onConfirm={() => {
          const go = asked?.go;
          setAsked(null);
          if (go) void go();
        }}
      />
    </>
  );
}
