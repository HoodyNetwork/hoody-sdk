// Small shared pieces of the scripts page.
import { ConfirmDialog, HeldFromLink, Outcome, OutcomeBanner, Spinner, TextButton, useStrings } from '@kit';
import { useEffect, useRef, useState } from 'react';
import strings from '../strings.en.json';
import { heldByOther, type Out } from './ops';
import { askNoteKey, askNoteVars } from './useAsk';
import s from './parts.module.css';

/** The word for a refusal code: only codes we know are shown, anything else gets the plain sentence. */
export function errorWord(t: (k: never, v?: Record<string, string | number>) => string, code: string | undefined): string {
  const known = ['BAD_REVISION', 'REVISION_MISMATCH', 'SCRIPT_BUSY', 'ENV_TOO_LARGE', 'ENV_LIMIT', 'INVALID_ENV_KEY', 'INVALID_ENV_VALUE', 'AGENT_DOWN', 'REFUSED', 'BAD_ARGS'];
  return t((code && known.includes(code) ? `err.${code}` : 'err.generic') as never);
}

/** What a failed or unsent ask says: the sentence of askNoteKey. */
export function askWord(t: (k: never, v?: Record<string, string | number>) => string, code: string | undefined): string {
  return t(askNoteKey(code) as never, askNoteVars(code));
}

/** The line under a banner's title: a refusal names its reason; an ask names why nothing was sent too. */
function bodyOf(t: (k: never, v?: Record<string, string | number>) => string, what: ChangeBannerProps['what'], kind: string, code: string | undefined): string | undefined {
  if (what === 'ask') return kind === 'failed' || kind === 'not_sent' ? askWord(t, code) : undefined;
  // A link name already used: only a link create can say it, so every banner that carries one (New script, the detail's Overview) explains it.
  if (kind === 'failed' && code === 'ALIAS_IN_USE') return t('err.aliasTaken' as never);
  // A create without its own words (new/liveErrors.ts) never borrows an edit's refusal words.
  if (what === 'create' && kind === 'failed') return t('err.generic' as never);
  return kind === 'failed' ? errorWord(t, code) : undefined;
}

export interface ChangeBannerProps {
  out: Out | null;
  /** The sentence for the thing being changed: "Saving", "Deleting"… is not used; titles come from `what`. */
  what: 'save' | 'delete' | 'restore' | 'settings' | 'create' | 'secrets' | 'tests' | 'links' | 'link' | 'ask';
  onCheck?: () => void | Promise<unknown>;
  checking?: boolean;
  onDismiss: () => void;
  /** Frees a change no read could prove (core's settle plus the local state). Offered, with a warning, once a Check found nothing. */
  onForce?: () => void;
  /** A create's own words for this outcome (new/liveErrors.ts, resolved): they replace the generic title and body. A create
   *  is sent with ifRevision null, so it never takes an edit's "changed while you were editing". */
  words?: { title: string; body: string; extra?: string } | null;
}

/**
 * A pending change's way out when no read proves it: Check again first, and only after a Check that left it pending the
 * warned "Close without knowing". Closing lets the person do it again, which may do it twice.
 */
function usePendingExit(onCheck: ChangeBannerProps['onCheck'], onForce: (() => void) | undefined, out: Out | null) {
  const pending = out?.kind === 'pending';
  const [checked, setChecked] = useState(false);
  const [ask, setAsk] = useState(false);
  // A Check and an open confirmation concern the pending outcome they were made on: another outcome (another place's, or a later
  // one in this place) starts again at Check again, and a Check that answers after the outcome changed counts for nothing.
  const shownOut = useRef(out);
  useEffect(() => {
    shownOut.current = out;
    setChecked(false);
    setAsk(false);
  }, [out]);
  const check = onCheck ? async () => { const on = out; await onCheck(); if (shownOut.current === on) setChecked(true); } : undefined;
  const show = pending && !!onForce && (checked || !onCheck);
  return { check, show, ask, setAsk };
}

/** The way out of a pending outcome, offered once Check again has answered: the page's own usePendingExit says when. */
function ForceExit({ exit, onForce }: { exit: ReturnType<typeof usePendingExit>; onForce: (() => void) | undefined }) {
  const t = useStrings(strings);
  return (
    <>
      <TextButton onPress={() => exit.setAsk(true)}>{t('force.label')}</TextButton>
      <ConfirmDialog isOpen={exit.ask} onOpenChange={exit.setAsk} title={t('force.title')} body={t('force.body')} confirmLabel={t('force.confirm')} onConfirm={() => { exit.setAsk(false); onForce?.(); }} />
    </>
  );
}

/**
 * Another page's change holds this lock (C9): it may have gone through, and only the page that sent it can free it.
 * Read-only here: no Check again and no Dismiss for that change, a link to the sender, and a Hide that clears only this notice.
 */
export function HeldElsewhere({ out, onHide, inline }: { out: Out; onHide: () => void; inline?: boolean }) {
  const t = useStrings(strings);
  const from = out.from ?? null;
  const page = from && ['computers', 'keys', 'home'].includes(from.page) ? t(`held.page.${from.page}` as never) : t('held.page.other');
  const body = t('held.body', { page });
  const links = (
    <>
      {/* Only while this load serves the sender's page: a hidden page gets no link, not even the classic one. */}
      {from ? <HeldFromLink page={from.page} path={from.path}>{t('held.go', { page })}</HeldFromLink> : null}
      <TextButton onPress={onHide}>{t('held.hide')}</TextButton>
    </>
  );
  if (inline) return <span className={s.inline}><Outcome outcome={{ kind: 'pending' }} title={t('held.title')} detail={body} wrap />{links}</span>;
  return (
    <>
      <OutcomeBanner kind="pending" title={t('held.title')} body={body} />
      {links}
    </>
  );
}

/** Shows a change that did not finish cleanly: refused, may have gone through, never sent. */
export function ChangeBanner({ out, what, onCheck, checking, onDismiss, onForce, words }: ChangeBannerProps) {
  const t = useStrings(strings);
  const exit = usePendingExit(onCheck, onForce, out);
  if (!out || out.kind === 'busy' || out.kind === 'done') return null;
  if (heldByOther(out)) return <HeldElsewhere out={out} onHide={onDismiss} />;
  const { kind, code } = out;
  return (
    <>
      <OutcomeBanner
        kind={kind}
        title={words ? words.title : t(`outcome.${kind}.${what}` as never)}
        body={words ? (words.extra ? `${words.body} ${words.extra}` : words.body) : bodyOf(t as never, what, kind, code)}
        onCheck={kind === 'pending' ? exit.check : undefined}
        checking={checking}
        onDismiss={kind === 'pending' ? undefined : onDismiss}
      />
      {exit.show && <ForceExit exit={exit} onForce={onForce} />}
    </>
  );
}

export interface InlineOutcomeProps {
  out: Out | null;
  what: ChangeBannerProps['what'];
  onCheck?: () => void | Promise<unknown>;
  checking?: boolean;
  onDismiss: () => void;
  onForce?: () => void;
}

/**
 * The settle outcome in the place of the action (C9): one line to the right of the control. While a change is out
 * it says so; "may have gone through" offers a read-back (never a resend); a refusal names the reason.
 */
export function InlineOutcome({ out, what, onCheck, checking, onDismiss, onForce }: InlineOutcomeProps) {
  const t = useStrings(strings);
  const exit = usePendingExit(onCheck, onForce, out);
  if (!out) return null;
  if (out.kind === 'busy') return <span className={s.inline}><Spinner label={t('outcome.busy')} /></span>;
  if (out.kind === 'done') return null;
  if (heldByOther(out)) return <HeldElsewhere out={out} onHide={onDismiss} inline />;
  return (
    <>
      <Outcome
        outcome={{ kind: out.kind }}
        title={t(`outcome.${out.kind}.${what}` as never)}
        detail={bodyOf(t as never, what, out.kind, out.code)}
        onCheck={out.kind === 'pending' ? exit.check : undefined}
        checking={checking}
        onDismiss={out.kind === 'pending' ? undefined : onDismiss}
        wrap
      />
      {exit.show && <ForceExit exit={exit} onForce={onForce} />}
    </>
  );
}
