// Rename realms. One Dialog lists every realm the
// session sees: its colour, its name, its short id (never the full id) and a pen. The pen opens that row's form in
// place: the name, sent through core's alias write, and the colour, kept in this browser (core's tint).
// C9: Save sends the name once, and a second press while it runs sends nothing. A refusal before sending, or a
// failed write, keeps the form and its text with the words under the field. A lost answer may have gone through: it is
// never shown as failed. The Dialog's own pending outcome holds it, with Check again: a fresh read of the alias map
// shows the new name (renamed), the name before it (it didn't apply), or another name (renamed somewhere else
// meanwhile); every one reloads the shell's names. Closing the Dialog moves it to the kit's sticky toast, whose Check
// again settles the same rename and closes the toast (it answers true) once a read proves it.
// While it is held, every pen waits: another rename would read the map before the lost write lands and could put the
// old name back. The hold, its Check again and what settled it live in the provider, not in one open of the dialog:
// a Check again bound to a rename that is no longer the held one (an old toast, a read that lost the race) settles
// nothing and changes nothing. A token session pinned to one realm cannot rename (core refuses it): no entry anywhere,
// and useRenameRealms() is null.
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Label, Radio, RadioGroup } from 'react-aria-components';
import { errorInfo, outcomeOf, readRealmAliases, type RealmColor, useRealms } from '@core';
import { loadRealms, REALM_PALETTE, realmShortId, setRealmAlias, setRealmTint } from '@core/shell';
import { Button, cx, IconButton } from '@kit/controls/Button';
import type { OutcomeLike } from '@kit/outcome';
import { TextButton } from '@kit/controls/Link';
import { TextField } from '@kit/forms/fields';
import { Dialog } from '@kit/overlays/Dialog';
import { errorSentence } from '@kit/states/ErrorDetails';
import { type OpenRenameRealms as Open, RenameRealmsContext } from '@kit/realmRename';
import { useStrings } from '@kit/strings';
import strings from './strings.en.json';
import s from './RenameRealms.module.css';

// Pages read the opener through @kit (they never import the shell); the shell's own switchers read it here.
export { useRenameRealms } from '@kit/realmRename';

/** A rename sent whose answer was lost: held until a fresh read of the alias map settles it. `prev` is the alias it
 *  replaced ('' = none), so a read can tell "didn't apply" from "renamed somewhere else". */
interface Held {
  id: string;
  alias: string;
  prev: string;
  shown: string;
}
/** What a read found for a held rename: renamed, the old name still (not yet: the hold stays), or another name now
 *  (`shown`: the name it shows). */
interface Settled {
  kind: 'done' | 'old' | 'other' | 'left';
  shown: string;
}
/** The provider's one hold: the dialog of every open and the sticky toast act on it through these. */
interface Holds {
  hold: Held | null;
  settled: Settled | null;
  lose: (h: Held) => void;
  check: (h: Held) => Promise<boolean>;
  clearSettled: () => void;
  /** Stop waiting on a held rename a read found not yet applied: frees the pens; the rename may still land. */
  leave: (h: Held) => void;
}

export function RenameRealmsProvider({ children }: { children?: ReactNode }) {
  const view = useRealms();
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState<string | null>(null);
  const [seq, setSeq] = useState(0);
  // The held rename outlives one open of the dialog (it remounts per open, for a fresh form): kept here, with the
  // shell. The ref is the one current hold every Check again compares with, before it reads and when its read ends.
  const [hold, setHold] = useState<Held | null>(null);
  const holdRef = useRef<Held | null>(null);
  const [settled, setSettled] = useState<Settled | null>(null);
  const lose = useCallback((h: Held) => {
    holdRef.current = h;
    setHold(h);
    setSettled(null);
  }, []);
  // Check again for one held rename: a fresh read of the alias map, never a resend. True once that rename is settled
  // (by this read, or already by another), which closes the sticky toast; a read that fails rejects and keeps the hold.
  // The old name still there settles nothing: the write may yet land, so the hold stays (false keeps the toast) and the
  // dialog says not yet.
  const check = useCallback((h: Held): Promise<boolean> => {
    if (holdRef.current !== h) return Promise.resolve(true);
    return readRealmAliases().then((map) => {
      if (holdRef.current !== h) return true;
      void loadRealms();
      const now = map[h.id] ?? '';
      if (now === h.prev && now !== h.alias) {
        setSettled({ kind: 'old', shown: now || realmShortId(h.id) });
        return false;
      }
      holdRef.current = null;
      setHold(null);
      setSettled(now === h.alias ? { kind: 'done', shown: h.shown } : { kind: 'other', shown: now || realmShortId(h.id) });
      return true;
    });
  }, []);
  const clearSettled = useCallback(() => setSettled(null), []);
  // The way out once a read found the old name: the hold ends unsettled (nothing is sent), with words that it may
  // still land and the names will show it.
  const leave = useCallback((h: Held) => {
    if (holdRef.current !== h) return;
    holdRef.current = null;
    setHold(null);
    setSettled({ kind: 'left', shown: h.shown });
    void loadRealms();
  }, []);
  const holds = useMemo<Holds>(() => ({ hold, settled, lose, check, clearSettled, leave }), [hold, settled, lose, check, clearSettled, leave]);
  const can = view.pinned === null;
  const openFn = useCallback<Open>((realmId) => {
    setFirst(realmId ?? null);
    setSettled(null);
    setSeq((n) => n + 1);
    setOpen(true);
  }, []);
  return (
    <RenameRealmsContext.Provider value={can ? openFn : null}>
      {children}
      {can && <RenameRealmsDialog key={seq} isOpen={open} onOpenChange={setOpen} first={first} holds={holds} />}
    </RenameRealmsContext.Provider>
  );
}

const COLOR_KEY = {
  red: 'rename.color.red',
  orange: 'rename.color.orange',
  green: 'rename.color.green',
  teal: 'rename.color.teal',
  blue: 'rename.color.blue',
  purple: 'rename.color.purple',
  pink: 'rename.color.pink',
} as const satisfies Record<RealmColor, keyof typeof strings>;

interface DialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  first: string | null;
  holds: Holds;
}

function RenameRealmsDialog({ isOpen, onOpenChange, first, holds }: DialogProps) {
  const { hold, settled, lose, check, clearSettled, leave } = holds;
  const t = useStrings(strings);
  const view = useRealms();
  const rows = useMemo(() => view.rows ?? [], [view.rows]);
  const nameOf = useCallback((id: string) => {
    const r = rows.find((x) => x.id === id);
    return r && (r.name.kind === 'alias' || r.name.kind === 'short') ? r.name.text : realmShortId(id);
  }, [rows]);
  const aliasOf = (id: string) => {
    const r = rows.find((x) => x.id === id);
    return r?.name.kind === 'alias' ? r.name.text : '';
  };
  // Opened on one realm: straight into its form, unless a rename is held (every pen waits then).
  const [editing, setEditing] = useState<string | null>(!hold && first && rows.some((r) => r.id === first) ? first : null);
  const [name, setName] = useState(() => (editing ? aliasOf(editing) : ''));
  const [color, setColor] = useState<RealmColor | ''>(() => (editing ? rows.find((r) => r.id === editing)?.tint ?? '' : ''));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  // The outcome follows the provider's hold: pending while one is held (in any open of the dialog), with the not-yet
  // words once a read still found the old name.
  const notYet = t('rename.notYet');
  const outcome = useMemo<OutcomeLike | undefined>(
    () => (hold ? { kind: 'pending' } : undefined),
    [hold],
  );
  const notYetShown = !!hold && settled?.kind === 'old';
  const settledStatus = settled?.kind === 'done' ? t('rename.done', { name: settled.shown }) : settled?.kind === 'other' ? t('rename.elsewhere', { name: settled.shown }) : settled?.kind === 'left' ? t('rename.left') : '';
  // Check again bound to this hold: the sticky toast keeps it after the dialog closes.
  const checkHeld = useMemo(() => (hold ? () => check(hold) : undefined), [hold, check]);
  // After the form closes with the pen usable again (Escape, Cancel, a Save that finished), focus goes back to that
  // row's pen; the kit's own rescue covers a row that went away.
  const rowEls = useRef(new Map<string, HTMLLIElement>());
  const [penBack, setPenBack] = useState<string | null>(null);
  useEffect(() => {
    if (!penBack || editing) return;
    const pen = rowEls.current.get(penBack)?.querySelector<HTMLButtonElement>('button');
    if (pen && !pen.disabled) pen.focus();
    setPenBack(null);
  }, [penBack, editing]);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const edit = (id: string) => {
    setEditing(id);
    setName(aliasOf(id));
    setColor(rows.find((r) => r.id === id)?.tint ?? '');
    setError(null);
    setStatus('');
    clearSettled();
  };
  const cancelEdit = () => {
    setPenBack(editing);
    setEditing(null);
    setError(null);
  };

  const words = (e: unknown): string => {
    const x = (e ?? {}) as { code?: string; reason?: string; word?: string };
    if (x.code === 'NAME_TAKEN') return t('rename.taken');
    if (x.code === 'ALIAS_INVALID') {
      if (x.reason === 'reserved') return t('rename.reserved', { word: x.word ?? name.trim() });
      if (x.reason === 'length') return t('rename.length');
      if (x.reason === 'control') return t('rename.control');
    }
    if (x.code === 'TOKEN_SESSION_REFUSED') return t('rename.cannot');
    // The realm-name map was read without a usable ETag (core setAlias): refused before any write, so nothing
    // was sent; the form and the typed name stay for Try again.
    if (x.code === 'CAS_REQUIRED') return t('rename.unsafe');
    // A rename made elsewhere since this tab read the map (the write's If-Match): nothing saved; the kit's
    // conflict sentence (reload, then try again). Never resent by itself; the typed name stays in the form.
    const info = errorInfo(e);
    if (x.code === 'PRECONDITION_FAILED' || info.status === 412) return errorSentence(info);
    return outcomeOf(e, true) === 'not_sent' ? t('rename.notSent') : t('rename.failed');
  };

  const save = () => {
    if (!editing || sending || hold) return;
    const id = editing;
    const r = rows.find((x) => x.id === id);
    // The colour is this browser's alone: kept at once, nothing sent.
    if (color && r && color !== r.tint) setRealmTint(id, color);
    const prev = aliasOf(id);
    const alias = name.trim();
    if (alias === prev) {
      setPenBack(id);
      setEditing(null);
      return;
    }
    const shown = alias || realmShortId(id);
    setSending(true);
    setError(null);
    setRealmAlias(id, alias).then(
      () => {
        if (!live.current) return;
        setSending(false);
        setPenBack(id);
        setEditing(null);
        setStatus(t('rename.done', { name: shown }));
      },
      (e: unknown) => {
        const lost = outcomeOf(e, true) === 'pending';
        if (lost) lose({ id, alias, prev, shown });
        if (!live.current) return;
        setSending(false);
        if (lost) {
          setEditing(null);
          return;
        }
        setError(words(e));
      },
    );
  };

  const onFormKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // Enter that ends an IME composition picks a candidate; it never saves (as the kit Dialog's own Enter).
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape' && !sending) {
      e.stopPropagation();
      e.preventDefault();
      cancelEdit();
    } else if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type === 'text') {
      e.preventDefault();
      save();
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t('rename.title')}
      cancelLabel={t('rename.close')}
      busy={sending}
      outcome={outcome}
      onCheck={checkHeld}
      outcomeDetail={notYetShown ? notYet : undefined}
      outcomeActions={notYetShown && hold ? ({ detailId }) => <TextButton aria-describedby={detailId} onPress={() => leave(hold)}>{t('rename.stopWaiting')}</TextButton> : undefined}
    >
      <p className={s.status} role="status">
        {status || settledStatus}
      </p>
      <ul className={s.list}>
        {rows.map((r) => {
          const shownName = nameOf(r.id);
          const isHeld = hold?.id === r.id;
          return (
            <li
              key={r.id}
              className={s.row}
              ref={(el) => {
                if (el) rowEls.current.set(r.id, el);
                else rowEls.current.delete(r.id);
              }}
            >
              <div className={s.head}>
                <span className={cx(s.dot, r.tint && `rc-${r.tint}`)} aria-hidden="true" />
                <span className={s.names}>
                  <span className={s.name}>{shownName}</span>
                  <span className={s.short}>{realmShortId(r.id)}</span>
                  {isHeld && <span className={s.held}>{t('rename.held')}</span>}
                </span>
                {editing !== r.id && (
                  <IconButton icon="pen" label={t('rename.pen', { name: shownName })} variant="ghost" isDisabled={!!hold || sending} onPress={() => edit(r.id)} />
                )}
              </div>
              {editing === r.id && (
                // Escape and Enter from the form's own controls bubble here; the div itself is never focused.
                // eslint-disable-next-line jsx-a11y/no-static-element-interactions
                <div className={s.form} onKeyDown={onFormKey}>
                  <TextField
                    label={t('rename.name')}
                    value={name}
                    onChange={setName}
                    placeholder={realmShortId(r.id)}
                    description={t('rename.nameHint')}
                    errorMessage={error ?? undefined}
                    isDisabled={sending}
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- the person just pressed this row's pen
                    autoFocus
                  />
                  <RadioGroup className={s.colors} value={color || null} onChange={(v) => setColor(v as RealmColor)} isDisabled={sending}>
                    <Label className={s.colorsLabel}>{t('rename.color')}</Label>
                    <div className={s.swatches}>
                      {REALM_PALETTE.map((c) => (
                        <Radio key={c} value={c} aria-label={t(COLOR_KEY[c])} className={cx(s.swatch, `rc-${c}`)} />
                      ))}
                    </div>
                    <span className={s.hint}>{t('rename.colorHint')}</span>
                  </RadioGroup>
                  <div className={s.actions}>
                    <Button variant="primary" size="sm" className={s.action} busy={sending} onPress={save}>
                      {t('rename.save')}
                    </Button>
                    <Button size="sm" chip={false} className={s.action} isDisabled={sending} onPress={cancelEdit}>
                      {t('rename.cancel')}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
