// Secrets (security tier; RULES: a secret shows only in SecretField). Nothing here ever logs,
// stores or sends a value.
//
// SecretField shows a secret the server returned once (an API key, a Bot key, backup codes, a
// hand-over text):
//   - masked until Show: while masked the DOM holds bullets only, never the value;
//   - Copy works without Show (only the press handler reads the value);
//   - wiped on route change, realm switch / sign-out / any end of the context it was shown in, page
//     hide, and a `resetKey` change. A wipe drops core's HeldSecret, tells the page through onWipe
//     (so it drops its copy too) and leaves "It is no longer shown here.";
//   - closing it (unmount) drops core's HeldSecret and tells the page nothing: a `value` the page
//     still holds is the page's, and its next field shows it again (an access code stays while its
//     page is open). A page that must forget on close drops its copy where it closes the field;
//   - the tab going to the background, and a `maskKey` change, mask it again (nothing dropped);
//   - an optional "I saved it" tick (`confirm`) for flows that must not close before it is kept.
// `load` (opt-in, the vault's entry value): a stored value read only on a press. With
// no `held` the field shows a masked "not read yet" box whose eye reads and shows (`onShow`) and whose Copy reads, copies
// and drops (`onCopy`, see copyWhenRead); the page holds nothing while it is masked. A `held` it then supplies shows at
// once. With `dropOnHide` the eye-off and the tab going to the background drop the value (onWipe tells the page) instead
// of masking it. `json` shows a JSON object or array formatted (highlight.ts jsonView) with a Formatted | Raw switch;
// Copy always gives the exact stored text.
// Prefer `held` (core mintSecret → HeldSecret, read through useSecret); `value` is for secrets the
// page received some other way, and is held the same way from the moment it is shown.
//
// SecretInput is the write-only entry (a password-style field): never pre-filled, never echoed
// unless the person asks, and cleared (onChange('')) on route change, the end of its context and
// page hide. `multiline` makes it a textarea (vertical resize) for secrets of several lines (a PEM
// key, a certificate). While hidden it is read-only and holds one bullet per character and the line
// ends, never the value (no DOM value, accessibility tree or screenshot holds it at any moment); it
// takes typed keys, a paste and Backspace/Delete itself, and IME or a touch keyboard needs Show. A paste goes into the value as the
// clipboard has it, so its line ends (CRLF too) reach the page byte for byte.
import { type ClipboardEvent, type KeyboardEvent, type ReactNode, type SyntheticEvent, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FieldError, Input, Label, Text, TextArea, TextField as AriaTextField } from 'react-aria-components';
import { holdSecret, useSecret, type Ctx, type HeldSecret } from '@core';
import { Button, IconButton, cx } from '../controls/Button';
import { SegmentedControl } from '../controls/SegmentedControl';
import { CodeBlock, CopyStatus, copyText, useCopy } from '../data/Ids';
import { jsonView } from '../data/highlight';
import { Spinner } from '../states/States';
import { Icon } from '../icons';
import { useStrings } from '../strings';
import { Checkbox } from './fields';
import b from './fieldBox.module.css';
import f from './fields.module.css';
import { useFieldLock } from './lock';
import { describedProps } from './described';
import { pageErrorProps } from './pageError';
import { safeCapture, useWipeOn } from './wipe';
import { ITEM_MASK, bullets, localHold, secretEdit, secretSplice, secretView, useDropOnUnmount } from './Secret.pure';
import strings from './forms.strings.en.json';
import s from './Secret.module.css';

export { useWipeOn };
// The pure parts live in Secret.pure.ts (shared with the terminal); their names stay importable from here.
export { secretView, secretSplice, secretEdit } from './Secret.pure';

export interface SecretConfirm {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Defaults to "I saved it" ("I saved them" for `format="lines"`). */
  label?: string;
}

/**
 * What a copy of a value read on the press came to (SecretField `load`). `none`: the page supplied no plain text to copy
 * (encrypted and asking its password, empty, a failed or stale read, or the attempt fenced by a hide): no note. `refused`:
 * plain text was supplied and the clipboard did not take it: the field shows its copy-failed note.
 */
export type CopyAttempt = { wrote: true } | { wrote: false; reason: 'refused' | 'none' };

/** The cause copyWhenRead's text promise rejects with when there is nothing to copy (`none`, never a refusal). */
const NOTHING = Symbol('nothing to copy');

/**
 * Copy a text that is still being read (the GET, then a decrypt), called inside the press handler. Where the browser has
 * ClipboardItem, `navigator.clipboard.write` is called before this returns, with a promise of the text: Safari refuses a
 * write started after the press's activation is gone (an await). `text()` resolving to null means nothing to copy.
 * Without ClipboardItem the text is read first, then written with writeText. `handoff`, when given, runs in the same step
 * that hands the text to the browser (right before the Blob is made, or writeText is called): false cancels it (`none`),
 * so a page can recheck that the text may still leave, and drop its own copies, at the last moment it can.
 */
export function copyWhenRead(text: () => Promise<string | null>, handoff?: () => boolean): Promise<CopyAttempt> {
  const leaves = (v: string | null): v is string => v !== null && (!handoff || handoff());
  const clip = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (typeof ClipboardItem !== 'undefined' && clip && typeof clip.write === 'function') {
    let nothing = false;
    const data = text().then(
      (v) => {
        if (!leaves(v)) {
          nothing = true;
          throw NOTHING;
        }
        return new Blob([v], { type: 'text/plain' });
      },
      () => {
        nothing = true;
        throw NOTHING;
      },
    );
    let wrote: Promise<void>;
    try {
      wrote = clip.write([new ClipboardItem({ 'text/plain': data })]);
    } catch {
      wrote = Promise.reject(new Error('refused'));
    }
    return wrote.then(
      (): CopyAttempt => ({ wrote: true }),
      // The data promise settles before the write does: a rejection it caused is `none`, anything else a refusal.
      () => data.then(
        (): CopyAttempt => ({ wrote: false, reason: 'refused' }),
        (): CopyAttempt => ({ wrote: false, reason: nothing ? 'none' : 'refused' }),
      ),
    );
  }
  return text().then(
    async (v): Promise<CopyAttempt> => (!leaves(v) ? { wrote: false, reason: 'none' } : (await copyText(v)) ? { wrote: true } : { wrote: false, reason: 'refused' }),
    (): CopyAttempt => ({ wrote: false, reason: 'none' }),
  );
}

/**
 * A secret a page shows outside a SecretField (a code holding a key, a shown link) hidden again by the field's rules:
 * while `shown`, the tab going to the background calls `hide`. The terminal also calls it when the terminal loses focus
 * and after its reveal idle time with no key press, as its SecretField does.
 */
export function useRevealGuard(shown: boolean, hide: () => void): void {
  const latest = useRef(hide);
  latest.current = hide;
  useEffect(() => {
    if (!shown) return;
    const onVis = () => { if (document.visibilityState === 'hidden') latest.current(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [shown]);
}

/** A value read only on a press (`onRead`), as the field uses it internally. */
interface SecretLoad {
  /** The eye's read is under way: the eye shows a spinner, both buttons are off. */
  reading: boolean;
  /** Both buttons off, no spinner (the page's password row is open). */
  disabled?: boolean;
  /** The eye on the unread box: read the value and supply it as `held`. */
  onShow: () => void;
  /** Copy on the unread box: read, copy and drop without showing (the page calls copyWhenRead). */
  onCopy: () => Promise<CopyAttempt>;
}

export interface SecretFieldProps {
  label: string;
  /** The secret as core holds it (mintSecret). Preferred. */
  held?: HeldSecret | null;
  /** The context it was minted under (defaults to the held secret's own). */
  ctx?: Ctx | null;
  /** A secret the page holds as a string; the kit holds it the same way from first render. */
  value?: string | null;
  /**
   * `single` (default): one value on one line. `lines`: one item per line (backup codes), shown as
   * a grid with "Copy all". `text`: a multi-line text (a hand-over note), wrapped as written.
   */
  format?: 'single' | 'lines' | 'text';
  /** Characters at the start that stay visible while masked (a key prefix such as "hk_3f9a"). */
  visiblePrefix?: number;
  /** Under the field; defaults to "Copy it now: it won't be shown again." (see `once`). */
  description?: ReactNode;
  /** A shown-once secret (default true): the lock note under the field. */
  once?: boolean;
  /** The "I saved it" tick, for flows whose Done/Close waits for it. */
  confirm?: SecretConfirm;
  /** Copy as the primary button (when copying is the point of the step). */
  copyPrimary?: boolean;
  /** Called after a successful Copy (never with the value). */
  onCopy?: () => void;
  /** Called once when the kit wipes the secret: drop your copy. Not called when the field closes (unmounts). */
  onWipe?: () => void;
  /** A change (realm id, object id) wipes the secret. */
  resetKey?: unknown;
  /** A change masks a shown secret again without dropping it (a fold closing): Copy and Show still work, onWipe is not
   *  called. Compared with Object.is, like `resetKey`; the render after the change is already masked. */
  maskKey?: unknown;
  /** Shown in place of the value once wiped. Defaults to "It is no longer shown here." */
  goneText?: string;
  /** A stored value read only on a press (see the file comment): the eye on the unread box reads it and supplies it as
   *  `held`. Giving it turns the field into a load field (nothing held until read). */
  onRead?: () => void;
  /** With `onRead`: Copy on the unread box reads, copies and drops without showing (the page calls copyWhenRead). */
  onReadCopy?: () => Promise<CopyAttempt>;
  /** With `onRead`: the eye's read is under way (the eye shows a spinner, both buttons are off). */
  isReading?: boolean;
  /** With `onRead`: both buttons off, no spinner (the page's own step is open, such as a password row). */
  isReadDisabled?: boolean;
  /** Eye-off and the tab going to the background drop the value (onWipe) instead of masking it. */
  dropOnHide?: boolean;
  /** With `onRead`: the value is known to be empty; the box says this text and offers no button. */
  emptyText?: string;
  /** Show a JSON object or array formatted, with a Formatted | Raw switch (Copy stays the exact text). */
  json?: boolean;
  /** The page's words for the buttons ("Show value" rather than the kit's "Show"). */
  showLabel?: string;
  hideLabel?: string;
  copyLabel?: string;
  /** With `onRead`: the spinner's name while the value is read. */
  readingLabel?: string;
  className?: string;
}

export function SecretField({
  label,
  held: heldProp,
  ctx,
  value,
  format = 'single',
  visiblePrefix = 0,
  description,
  once = true,
  confirm,
  copyPrimary,
  onCopy,
  onWipe,
  resetKey,
  maskKey,
  goneText,
  onRead,
  onReadCopy,
  isReading,
  isReadDisabled,
  dropOnHide,
  emptyText,
  json,
  showLabel,
  hideLabel,
  copyLabel,
  readingLabel,
  className,
}: SecretFieldProps) {
  const load: SecretLoad | undefined = onRead
    ? { reading: !!isReading, disabled: isReadDisabled, onShow: onRead, onCopy: onReadCopy ?? (async () => ({ wrote: false, reason: 'none' })) }
    : undefined;
  const t = useStrings(strings);
  const id = useId();
  // A page string is held from first render, bound to the context it was shown in.
  const own = useMemo(() => {
    if (heldProp !== undefined || !value) return null;
    const c = safeCapture();
    return c ? holdSecret(value, c) : localHold(value);
  }, [heldProp, value]);
  const held = heldProp !== undefined ? heldProp : own;
  const secret = useSecret(held, ctx ?? held?.ctx);
  // Show belongs to the secret it was pressed on: a replaced one (another app's code, a new key)
  // comes back masked in the same render, never revealed for a frame.
  const [shownFor, setShownFor] = useState<HeldSecret | null>(null);
  // With `load` a supplied secret shows at once (it was read for the eye); masking it again marks it here.
  const [maskedFor, setMaskedFor] = useState<HeldSecret | null>(null);
  // A `maskKey` change masks again during this render (state adjusted while rendering), so no commit draws it shown.
  // Boxed: React would call a bare function as an initializer or updater instead of storing it as the key.
  const [maskSeen, setMaskSeen] = useState<{ key: unknown }>(() => ({ key: maskKey }));
  if (!Object.is(maskSeen.key, maskKey)) {
    setMaskSeen({ key: maskKey });
    setShownFor(null);
    if (load) setMaskedFor(held ?? null);
  }
  const shown = load ? !!held && maskedFor !== held : shownFor !== null && shownFor === held;
  const heldNow = useRef(held);
  heldNow.current = held;
  const hide = () => {
    if (dropOnHide) heldNow.current?.drop();
    else if (load) setMaskedFor(heldNow.current ?? null);
    setShownFor(null);
  };
  const toggleShown = () => (shown ? hide() : load ? setMaskedFor(null) : setShownFor(held));
  const [wiped, setWiped] = useState(false);
  const [copied, copy] = useCopy();
  // A failed copy, kept on screen past the copy state's short reset until a copy works: pressing closes the icon
  // button's tooltip, so the field's note line is where a sighted user sees it (CopyStatus says it aloud). Like Show,
  // it belongs to the secret it was pressed on: a replaced secret, or a refusal answering after the replacement,
  // never shows it.
  const copiedFor = useRef<HeldSecret | null>(null);
  const [failedFor, setFailedFor] = useState<HeldSecret | null>(null);
  useEffect(() => {
    if (copied === 'failed') setFailedFor(copiedFor.current);
    else if (copied === 'copied') setFailedFor(null);
  }, [copied]);
  // With `load` a copy's outcome belongs to the attempt (a counter, never the secret): the unread copy drops the value, and
  // its refusal still shows, in the unread box. Cleared by the next attempt.
  const attempt = useRef(0);
  const [tried, setTried] = useState<{ n: number; state: 'copied' | 'failed' } | null>(null);
  const tryCopy = (run: () => Promise<CopyAttempt>) => {
    const n = ++attempt.current;
    setTried(null);
    void run().then((a) => {
      if (n !== attempt.current) return;
      setTried(a.wrote ? { n, state: 'copied' } : a.reason === 'refused' ? { n, state: 'failed' } : null);
    });
  };
  const copyFailed = load ? tried?.state === 'failed' : failedFor !== null && failedFor === held;
  const copyState = load ? (tried?.state ?? 'idle') : copied;
  const told = useRef(false);

  useDropOnUnmount(own);
  useDropOnUnmount(heldProp ?? null);

  // The secret went (core dropped it, or the kit wiped it): tell the page once.
  const gone = wiped || !secret;
  useEffect(() => {
    if (!gone) {
      told.current = false;
      return;
    }
    setShownFor(null);
    if (!told.current && (held || value)) {
      told.current = true;
      onWipe?.();
    }
  }, [gone, held, value, onWipe]);

  // With `load` and nothing read, the field holds no secret: it listens to nothing (no wipe sentinel either).
  useWipeOn(
    () => {
      held?.drop();
      setWiped(true);
    },
    resetKey,
    !load || !!held,
  );
  // A new secret replaces a wiped one.
  useEffect(() => setWiped(false), [held]);

  // The tab going to the background masks it again (drops it, with dropOnHide).
  const dropRef = useRef(dropOnHide);
  dropRef.current = dropOnHide;
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'hidden') return;
      if (dropRef.current) heldNow.current?.drop();
      setShownFor(null);
      setMaskedFor(heldNow.current ?? null);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // JSON is looked at only once the value is shown; the switch goes back to Formatted for every new secret.
  const [rawFor, setRawFor] = useState<HeldSecret | null>(null);
  const raw = rawFor !== null && rawFor === held;
  const view = useMemo(() => (json && shown && secret ? jsonView(secret) : null), [json, shown, secret]);

  const items = useMemo(() => (format === 'lines' && secret ? secret.split(/\r?\n/).filter((x) => x.trim() !== '') : []), [format, secret]);

  const doCopy = () => {
    // The value is read here, at the press, and goes only to the clipboard.
    const v = !wiped && held ? (held.reveal(ctx ?? held.ctx) ?? null) : null;
    if (!v) return;
    if (load) {
      // The exact stored text, whatever the view shows (formatted JSON included).
      tryCopy(async () => ((await copyText(v)) ? { wrote: true } : { wrote: false, reason: 'refused' }));
      onCopy?.();
      return;
    }
    copiedFor.current = held;
    copy(format === 'lines' ? items.join('\n') : v);
    onCopy?.();
  };

  const copyWord = copyLabel ?? t('secret.copy');
  const copyNow = copyState === 'copied' ? t('secret.copied') : copyState === 'failed' ? t('secret.copyFailed') : format === 'lines' ? t('secret.copyAll') : copyWord;
  const noteText = description ?? (once ? t('secret.once') : undefined);
  // `load` never shows the "no longer shown" box: a dropped value goes back to the unread box.
  const unread = !!load && gone;
  const showWord = showLabel ?? t('secret.show');
  const hideWord = hideLabel ?? t('secret.hide');
  const jsonSwitch = view?.kind === 'json' && (
    <SegmentedControl
      label={t('secret.viewAs')}
      items={[
        { id: 'formatted', label: t('secret.formatted') },
        { id: 'raw', label: t('secret.raw') },
      ]}
      value={raw ? 'raw' : 'formatted'}
      onChange={(k) => setRawFor(k === 'raw' ? held : null)}
    />
  );

  return (
    <div className={cx(s.field, className)} data-secret={unread ? 'unread' : gone ? 'gone' : shown ? 'shown' : 'masked'}>
      {jsonSwitch ? (
        <div className={s.labelLine}>
          <span className={f.label} id={`${id}-label`}>
            {label}
          </span>
          {jsonSwitch}
        </div>
      ) : (
        <span className={f.label} id={`${id}-label`}>
          {label}
        </span>
      )}
      {unread ? (
        emptyText ? (
          <div className={cx(s.box, s.gone)} aria-labelledby={`${id}-label`} data-secret-empty="">
            <span>{emptyText}</span>
          </div>
        ) : (
          <div className={s.box} role="group" aria-labelledby={`${id}-label`} aria-busy={load.reading || undefined}>
            <div className={s.value} translate="no">
              <span className={cx(s.text, s.masked)}>
                <span className={s.srOnly}>{t('secret.notRead')}</span>
                <span aria-hidden="true">{bullets(0)}</span>
              </span>
            </div>
            <div className={s.actions}>
              {load.reading ? (
                <span className={s.reading}>
                  <Spinner label={readingLabel ?? t('secret.reading')} />
                </span>
              ) : (
                <IconButton size="sm" icon="eye" label={showWord} aria-pressed={false} isDisabled={load.disabled} onPress={load.onShow} />
              )}
              <IconButton size="sm" icon={copyState === 'copied' ? 'check' : 'copy'} label={copyNow} isDisabled={load.reading || load.disabled} onPress={() => tryCopy(load.onCopy)} />
            </div>
            <CopyStatus state={copyState} done={t('secret.copied')} failed={t('secret.copyFailed')} />
          </div>
        )
      ) : gone ? (
        <div className={cx(s.box, s.gone)} aria-labelledby={`${id}-label`}>
          <Icon name="lock" size="sm" />
          <span>{goneText ?? t('secret.gone')}</span>
        </div>
      ) : (
        <div className={cx(s.box, format !== 'single' && s.multi)} role="group" aria-labelledby={`${id}-label`}>
          <div className={s.value} translate="no">
            {format === 'lines' ? (
              <ol className={s.lines} aria-label={shown ? undefined : t('secret.masked')}>
                {items.map((item, i) => (
                  <li key={i} className={s.lineItem} aria-hidden={shown ? undefined : true}>
                    {shown ? item : ITEM_MASK}
                  </li>
                ))}
              </ol>
            ) : shown && view && view.kind !== 'plain' ? (
              view.kind === 'json' && !raw ? (
                <CodeBlock code={view.text} lang="json" label={label} maxHeight="md" noCopy />
              ) : (
                <CodeBlock code={secret ?? ''} lang="plain" label={label} maxHeight="md" noCopy wrap /> // reason: a stored secret value is data as typed, not code
              )
            ) : shown ? (
              <span className={cx(s.text, format === 'text' && s.pre)}>{secret}</span>
            ) : (
              <span className={cx(s.text, s.masked)}>
                {/* The hint is text, not an aria-label: a role-less span's label is never read. */}
                <span className={s.srOnly}>{t('secret.masked')}</span>
                {visiblePrefix > 0 && secret ? <span className={s.prefix}>{secret.slice(0, visiblePrefix)}</span> : null}
                <span aria-hidden="true">{bullets((secret?.length ?? 0) - visiblePrefix)}</span>
              </span>
            )}
          </div>
          <div className={s.actions}>
            {format === 'lines' ? (
              <>
                <Button size="sm" variant="ghost" icon={shown ? 'eye-off' : 'eye'} aria-pressed={shown} onPress={toggleShown}>
                  {shown ? t('secret.hideCodes') : t('secret.showCodes')}
                </Button>
                <Button size="sm" variant={copyPrimary ? 'primary' : 'secondary'} icon={copied === 'copied' ? 'check' : 'copy'} onPress={doCopy}>
                  {copied === 'copied' ? t('secret.copied') : copied === 'failed' ? t('secret.copyFailed') : t('secret.copyCodes')}
                </Button>
              </>
            ) : (
              <>
                <IconButton size="sm" icon={shown ? 'eye-off' : 'eye'} label={shown ? hideWord : showWord} aria-pressed={shown} isDisabled={load?.disabled} onPress={toggleShown} />
                {copyPrimary ? (
                  <Button size="sm" variant="primary" icon={copied === 'copied' ? 'check' : 'copy'} onPress={doCopy}>
                    {copyNow}
                  </Button>
                ) : (
                  <IconButton size="sm" icon={copyState === 'copied' ? 'check' : 'copy'} label={copyNow} isDisabled={load?.disabled} onPress={doCopy} />
                )}
              </>
            )}
          </div>
          <CopyStatus state={copyState} done={t('secret.copied')} failed={t('secret.copyFailed')} />
        </div>
      )}
      {shown && view && (view.kind === 'tooLong' || view.kind === 'tooBig') && (
        <span className={s.note}>{view.kind === 'tooLong' ? t('secret.tooLong') : t('secret.rawOnly')}</span>
      )}
      {format === 'lines' && !gone && <span className={s.count}>{t('secret.count', { count: items.length })}</span>}
      {copyFailed && (!gone || unread) ? (
        <span className={cx(s.note, s.noteWarn)}>
          <Icon name="warn" size="sm" />
          {t('secret.copyFailed')}
        </span>
      ) : (
        noteText &&
        (!gone || unread) && (
          <span className={s.note}>
            <Icon name="lock" size="sm" />
            {noteText}
          </span>
        )
      )}
      {confirm && !gone && (
        <Checkbox
          className={s.confirm}
          isSelected={confirm.checked}
          onChange={confirm.onChange}
          label={confirm.label ?? (format === 'lines' ? t('secret.savedMany') : t('secret.saved'))}
        />
      )}
    </div>
  );
}

// ── SecretInput ─────────────────────────────────────────────────────────────────────

// A browser ignores autocomplete="off" on a password input and pairs the text field before it as the username, filling a
// saved login into both. So a secret says "new-password" (never "off"), and these attributes keep the password managers
// (1Password, LastPass, Bitwarden, plus the generic data-form-type hint) away. They go on the input itself: the field wrapper
// does not pass data-* down to it. The one exception is an existing password the user asks for again ('current-password'):
// it says so and carries no opt-out, so the saved password still fills and no generator is offered on it. A password being
// chosen ('new-password') also carries no opt-out, so a manager may offer to save or generate it.
const NO_FILL = { 'data-1p-ignore': 'true', 'data-lpignore': 'true', 'data-bwignore': 'true', 'data-form-type': 'other' } as const;

const SECRET = { autoComplete: 'new-password', hints: NO_FILL } as const;
const CURRENT = { autoComplete: 'current-password', hints: {} } as const;
const NEWPW = { autoComplete: 'new-password', hints: {} } as const;
const FILL = { secret: SECRET, 'current-password': CURRENT, 'new-password': NEWPW } as const;

/** A secret field's description with its promises after it: one glyph row, each promise whole. The row is
 *  drawn for the eye only; a screen reader hears the promises as one line of sentences (each promise is a fragment
 *  without its own full stop), so no element edge reads as a space before a stop. */
function withPromises(description: ReactNode, promises: readonly string[] | undefined): ReactNode {
  const list = (promises ?? []).filter((p) => p.trim() !== '');
  if (list.length === 0) return description;
  const spoken = list.map((p) => `${p.trim()}.`).join(' ');
  return (
    <>
      {description}
      <span className={s.promises} data-secret-promises="">
        {list.map((p) => (
          <span key={p} className={s.promise} aria-hidden="true" data-secret-promise="">
            <Icon name="lock" size="sm" className={s.promiseMark} />
            {p}
          </span>
        ))}
        <span className={s.spoken}>{spoken}</span>
      </span>
    </>
  );
}

export interface SecretInputProps {
  /**
   * 'secret' (default): an API key or token; the browser is told to fill nothing (new-password + the opt-outs).
   * 'current-password': the user's existing password asked again (re-auth); the browser may fill the saved one.
   * 'new-password': a password being chosen; a manager may offer to save or generate it. Neither of the last two carries the opt-outs.
   */
  kind?: 'secret' | 'current-password' | 'new-password';
  label?: string;
  description?: ReactNode;
  /** The reassurance as short promises with a lock glyph each: "Pasted here only", "This
   *  page doesn't store it". Read with the field's description, after `description`; never a grey caption. */
  promises?: readonly string[];
  errorMessage?: string;
  className?: string;
  /** Write-only: the kit never pre-fills a stored secret; the page clears it after submit. */
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  /** Accessible name when there is no visible label. */
  'aria-label'?: string;
  /** Form field name (server field errors map onto it). */
  name?: string;
  /** A change (realm id, object id) clears what was typed. */
  resetKey?: unknown;
  autoFocus?: boolean;
  /** Move focus into the field when `errorMessage` appears (the one field a refusal is about), as TextField's. */
  focusOnError?: boolean;
  /** false: no Show toggle at all (provider API keys, KA-E). Default true. */
  reveal?: boolean;
  /** A textarea for a secret of several lines (resizable vertically); masked the same way while hidden. */
  multiline?: boolean;
  /** Rows of a multiline field. Default 4. */
  rows?: number;
  /** The keyboard a touch device offers ('numeric': digits, e.g. a numbers-only passcode). A hint, never a check. */
  inputMode?: 'numeric' | 'text';
}

/** A password-style input for entering a secret (API key, token, password). */
export function SecretInput({ kind = 'secret', label, description: text, promises, errorMessage, className, value, onChange, placeholder, isDisabled, resetKey, reveal = true, multiline, rows = 4, focusOnError, ...rest }: SecretInputProps) {
  const description = withPromises(text, promises);
  const t = useStrings(strings);
  const [shownState, setShown] = useState(false);
  const disabled = useFieldLock(isDisabled);
  const fill = FILL[kind];
  // What was shown masks again once cleared (a submit), locked or the tab hidden; derived here too
  // so the cleared or locked render is already masked. Multiline, hidden is read-only and IME or a touch keyboard needs Show, so
  // Show stays on an empty field and on one the person emptied; only a clear from outside (a submit, a wipe) masks it.
  const prevValue = useRef(value);
  const ownValue = useRef<string | null>(null);
  const cleared = multiline ? value === '' && prevValue.current !== '' && ownValue.current !== '' : value === '';
  const shown = shownState && !disabled && !cleared;
  useEffect(() => {
    if (disabled || cleared) setShown(false);
    // The person's own edit is known only until a value from outside replaces it.
    if (value !== ownValue.current) ownValue.current = null;
    prevValue.current = value;
  }, [disabled, cleared, value]);
  useEffect(() => {
    const onVis = () => document.visibilityState === 'hidden' && setShown(false);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  const latest = useRef(value);
  latest.current = value;
  useWipeOn(() => {
    setShown(false);
    if (latest.current !== '') onChange('');
  }, resetKey);
  // Multiline. Hidden, the textarea is read-only and holds secretView(value, true): bullets and line ends, so no browser edit
  // (typing, IME, drop, autocorrect, undo) can put a character into it. Hidden it takes keys (onKeyDown), a paste (spliced
  // over the selection as the clipboard has it) and Backspace/Delete; IME and touch keyboards need Show. Shown, it is an ordinary textarea, and each edit is spliced
  // onto the value from the selection it began with (beforeinput), so line ends the field shows as LF keep their bytes.
  const masked = !(shown && reveal);
  const view = useMemo(() => (multiline ? secretView(value, masked).text : ''), [multiline, value, masked]);
  const area = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);
  const before = useRef<{ start: number; end: number } | null>(null);
  const sameText = useRef<() => void>(() => undefined);
  // focusOnError: focus goes into the field when an error appears, not while it stays (TextField's rule, fields.tsx).
  const line = useRef<HTMLInputElement>(null);
  const hadError = useRef(false);
  // An error that arrives while the field is locked (a send's busy lifts one render later) waits for the unlock: a
  // disabled input takes no focus. At the unlock it takes the focus back unless the person moved it during the lock
  // (what held it when the lock began, or nothing, still holds it: no steal).
  const wantFocus = useRef<'now' | 'unlock' | null>(null);
  const atLock = useRef<Element | null>(null);
  useEffect(() => {
    if (disabled) atLock.current = (line.current ?? area.current)?.ownerDocument.activeElement ?? null;
  }, [disabled]);
  useEffect(() => {
    if (focusOnError && errorMessage && !hadError.current) wantFocus.current = disabled ? 'unlock' : 'now';
    if (!errorMessage || !focusOnError) wantFocus.current = null;
    hadError.current = Boolean(errorMessage);
    if (!wantFocus.current || disabled) return;
    const el = multiline ? area.current : line.current;
    const at = el?.ownerDocument.activeElement ?? null;
    const free = wantFocus.current === 'now' || !at || at === el?.ownerDocument.body || at === el || at === atLock.current;
    wantFocus.current = null;
    if (free) el?.focus();
  }, [errorMessage, focusOnError, multiline, disabled]);
  // An answer that is no field error (said in the step, not on the field) leaves nothing to ask for the focus, and the
  // browser took it from the field when the send disabled it. The field that held the focus when the lock began takes
  // it back at the unlock, only when no other control took it meanwhile: the focus is on nothing, or on a container
  // of the field (where the browser or a focus scope put it).
  // Read while rendering the lock: the commit disables the field, and the browser moves the focus away at once.
  const heldAtLock = useRef(false);
  const wasLocked = useRef(disabled);
  if (disabled && !wasLocked.current) {
    const el = multiline ? area.current : line.current;
    heldAtLock.current = !!el && el.ownerDocument.activeElement === el;
  }
  useLayoutEffect(() => {
    const el = multiline ? area.current : line.current;
    if (!disabled && wasLocked.current) {
      const held = heldAtLock.current;
      heldAtLock.current = false;
      const active = el?.ownerDocument.activeElement;
      if (held && el && (!active || active === el.ownerDocument.body || active.contains(el))) el.focus();
    }
    wasLocked.current = disabled;
  }, [disabled, multiline]);
  useLayoutEffect(() => {
    const el = area.current;
    const at = caret.current;
    caret.current = null;
    if (el && at !== null && el.ownerDocument.activeElement === el) el.setSelectionRange(at, at);
  });
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const note = () => {
      before.current = { start: el.selectionStart, end: el.selectionEnd };
    };
    const input = () => sameText.current();
    el.addEventListener('beforeinput', note);
    el.addEventListener('input', input);
    return () => {
      el.removeEventListener('beforeinput', note);
      el.removeEventListener('input', input);
    };
  }, [multiline]);
  if (multiline) {
    const put = (r: { value: string; caret: number }) => {
      ownValue.current = r.value;
      onChange(r.value);
      // The same value renders nothing, so the caret is put after the edit here (a key typed over the same character).
      if (r.value === value) area.current?.setSelectionRange(r.caret, r.caret);
      else caret.current = r.caret;
    };
    // Shown, an edit that leaves the field's text as it was (Enter over a CR LF, which shows as LF) gets no change from React;
    // the native input event carries it. Any other edit is onText's.
    sameText.current = () => {
      const el = area.current;
      if (!el || masked || disabled || el.value !== view) return;
      const b = before.current;
      before.current = null;
      if (b) {
        const r = secretEdit(value, el.value, el.selectionEnd, b);
        if (r.value !== value) put(r);
      }
    };
    const onText = (next: string) => {
      const b = before.current;
      before.current = null;
      // Hidden, the field is read-only and nothing edits it; a change arriving anyway is dropped, never taken as text.
      if (masked) return;
      put(secretEdit(value, next, area.current?.selectionEnd ?? next.length, b));
    };
    const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      if (!text || disabled) return;
      put(secretSplice(value, masked, e.currentTarget.selectionStart, e.currentTarget.selectionEnd, text));
    };
    // Hidden, the read-only field never edits itself: a key that types one character (or Enter) goes into the value here, and
    // Backspace/Delete remove the selection or one character. Shortcuts (Ctrl or Cmd, not AltGr), Tab, dead keys and IME
    // composition are left alone; composing needs Show.
    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!masked || disabled || e.nativeEvent.isComposing) return;
      const el = e.currentTarget;
      let start = el.selectionStart;
      let end = el.selectionEnd;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        // With Ctrl, Alt or Cmd it is a shortcut (a word or line delete): left alone, it deletes nothing here.
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        e.preventDefault();
        if (start === end) {
          if (e.key === 'Backspace') start = Math.max(0, start - 1);
          else end = Math.min(view.length, end + 1);
        }
        if (start !== end) put(secretSplice(value, true, start, end, ''));
        return;
      }
      const shortcut = e.metaKey || (e.ctrlKey && !e.altKey);
      const typed = e.key === 'Enter' ? '\n' : [...e.key].length === 1 ? e.key : '';
      if (!typed || shortcut) return;
      e.preventDefault();
      put(secretSplice(value, true, start, end, typed));
    };
    // Hidden, the selection is bullets: copying or dragging it out would hand out bullets, and a drop is no way in.
    const onMaskedOut = (e: SyntheticEvent<HTMLTextAreaElement>) => {
      if (masked) e.preventDefault();
    };
    return (
      <AriaTextField
        {...rest}
        {...describedProps(description)}
        value={view}
        onChange={onText}
        autoComplete={fill.autoComplete}
        spellCheck="false"
        isDisabled={disabled}
        isReadOnly={masked}
        isInvalid={errorMessage ? true : undefined}
        {...pageErrorProps(errorMessage)}
        className={cx(f.field, className)}
      >
        {label && <Label className={f.label}>{label}</Label>}
        <div className={f.control}>
          <TextArea
            ref={area}
            rows={rows}
            className={cx(b.box, f.input, f.textarea, f.mono, reveal && s.inputWithAction)}
            placeholder={placeholder ?? (masked && reveal ? t('secretInput.pasteOrShow') : undefined)}
            data-secret-input=""
            {...fill.hints}
            data-secret-hidden={masked ? '' : undefined}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
            onCopy={onMaskedOut}
            onCut={onMaskedOut}
            onDragStart={onMaskedOut}
            onDrop={onMaskedOut}
            autoCapitalize="off"
            autoCorrect="off"
          />
          {reveal && <IconButton
            icon={shown ? 'eye-off' : 'eye'}
            label={shown ? t('secretInput.hide') : t('secretInput.show')}
            size="sm"
            className={cx(s.inputAction, s.areaAction)}
            isDisabled={disabled}
            onPress={() => setShown((v) => !v)}
          />}
        </div>
        {description && (
          <Text slot="description" className={f.description}>
            {description}
          </Text>
        )}
        <FieldError className={f.error}>{errorMessage}</FieldError>
      </AriaTextField>
    );
  }
  return (
    <AriaTextField
      {...rest}
      {...describedProps(description)}
      value={value}
      onChange={onChange}
      type={shown && reveal ? 'text' : 'password'}
      autoComplete={fill.autoComplete}
      spellCheck="false"
      isDisabled={disabled}
      isInvalid={errorMessage ? true : undefined}
      {...pageErrorProps(errorMessage)}
      className={cx(f.field, className)}
    >
      {label && <Label className={f.label}>{label}</Label>}
      <div className={f.control}>
        <Input ref={line} className={cx(b.box, f.input, f.mono, reveal && s.inputWithAction)} placeholder={placeholder} data-secret-input="" {...fill.hints} />
        {reveal && <IconButton
          icon={shown ? 'eye-off' : 'eye'}
          label={shown ? t('secretInput.hide') : t('secretInput.show')}
          size="sm"
          className={s.inputAction}
          isDisabled={disabled}
          onPress={() => setShown((v) => !v)}
        />}
      </div>
      {description && (
        <Text slot="description" className={f.description}>
          {description}
        </Text>
      )}
      <FieldError className={f.error}>{errorMessage}</FieldError>
    </AriaTextField>
  );
}
