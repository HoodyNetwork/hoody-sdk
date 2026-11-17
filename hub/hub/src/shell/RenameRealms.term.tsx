// Rename realms in the terminal: the same provider, hold and C9 rules as RenameRealms.tsx (read its header first);
// only the view differs. Each realm is one line (colour name, name, short id, an Rename button); Edit opens that row's
// form under it: the name field (Enter saves) and the colour as a segmented choice (named colours: the terminal draws
// no realm tint swatch). Escape on any control of the open form (the field, the colour choice, Save, Cancel) cancels
// the form, not the dialog, as the web's form does; anywhere else in the dialog (another row's Rename button, Close)
// it closes the dialog. Focus after a closed form goes back to that row's
// Rename button (autoFocus on its next mount). Keep the provider logic in step with the web file.
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from 'react';
import { errorInfo, outcomeOf, readRealmAliases, type RealmColor, useRealms } from '@core';
import { loadRealms, REALM_PALETTE, realmShortId, setRealmAlias, setRealmTint } from '@core/shell';
import { Button } from '@kit/controls/Button';
import { TextButton } from '@kit/controls/Link';
import type { OutcomeLike } from '@kit/outcome';
import { TextField } from '@kit/forms/fields';
import { Dialog } from '@kit/overlays/Dialog';
import { errorSentence } from '@kit/states/ErrorDetails';
import { type OpenRenameRealms as Open, RenameRealmsContext } from '@kit/realmRename';
import { useStrings } from '@kit/strings';
import type * as Web from './RenameRealms';
import strings from './strings.en.json';
import termStrings from '../term/shell/strings.en.json';

/** The kit field's own key handler type (no cast). */
type FieldKey = NonNullable<ComponentProps<typeof TextField>['onKeyDown']>;
import { Box, Pressable, Text, useFocusControl, useKeys } from '../term/prim';
import type { BoxRenderable } from '../term/prim/otui';
import { FieldSwatch } from '../term/prim/FieldSwatch';
import { REALM_HEX } from '../term/shell/realmColour';

export { useRenameRealms } from '@kit/realmRename';

interface Held { id: string; alias: string; prev: string; shown: string }
/** What a read found for a held rename: renamed, the old name still (not yet: the hold stays), another name now, or
 *  the person stopped waiting (`shown`: the name it shows). */
interface Settled { kind: 'done' | 'old' | 'other' | 'left'; shown: string }
interface Holds { hold: Held | null; settled: Settled | null; lose: (h: Held) => void; check: (h: Held) => Promise<boolean>; clearSettled: () => void; leave: (h: Held) => void }

export const RenameRealmsProvider: typeof Web.RenameRealmsProvider = ({ children }: { children?: ReactNode }) => {
  const view = useRealms();
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState<string | null>(null);
  const [seq, setSeq] = useState(0);
  const [hold, setHold] = useState<Held | null>(null);
  const holdRef = useRef<Held | null>(null);
  const [settled, setSettled] = useState<Settled | null>(null);
  const lose = useCallback((h: Held) => {
    holdRef.current = h;
    setHold(h);
    setSettled(null);
  }, []);
  // The old name still there settles nothing: the write may yet land, so the hold stays (false keeps the toast) and the
  // dialog says not yet, with a way out.
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
  // Stop waiting once a read found the old name: the hold ends unsettled (nothing is sent); the rename may still land
  // and the names will show it.
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
};

const COLOR_KEY = {
  red: 'rename.color.red',
  orange: 'rename.color.orange',
  green: 'rename.color.green',
  teal: 'rename.color.teal',
  blue: 'rename.color.blue',
  purple: 'rename.color.purple',
  pink: 'rename.color.pink',
} as const satisfies Record<RealmColor, keyof typeof strings>;

interface DialogProps { isOpen: boolean; onOpenChange: (open: boolean) => void; first: string | null; holds: Holds }

function RenameRealmsDialog({ isOpen, onOpenChange, first, holds }: DialogProps) {
  const { hold, settled, lose, check, clearSettled, leave } = holds;
  const t = useStrings(strings);
  const tt = useStrings(termStrings);
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
  const [editing, setEditing] = useState<string | null>(!hold && first && rows.some((r) => r.id === first) ? first : null);
  const [name, setName] = useState(() => (editing ? aliasOf(editing) : ''));
  const [color, setColor] = useState<RealmColor | ''>(() => (editing ? rows.find((r) => r.id === editing)?.tint ?? '' : ''));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const outcome = useMemo<OutcomeLike | undefined>(() => (hold ? { kind: 'pending' } : undefined), [hold]);
  const notYetShown = !!hold && settled?.kind === 'old';
  const settledStatus = settled?.kind === 'done' ? t('rename.done', { name: settled.shown }) : settled?.kind === 'other' ? t('rename.elsewhere', { name: settled.shown }) : settled?.kind === 'left' ? t('rename.left') : '';
  const checkHeld = useMemo(() => (hold ? () => check(hold) : undefined), [hold, check]);
  // The row whose Rename button takes focus when its form closes (its button mounts again with autoFocus).
  const [penBack, setPenBack] = useState<string | null>(null);
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
    setPenBack(null);
    clearSettled();
  };
  // The open form's own box: Escape cancels the form only while the focus is inside it (FormEscape).
  const formBox = useRef<BoxRenderable | null>(null);
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
    if (x.code === 'CAS_REQUIRED') return t('rename.unsafe');
    const info = errorInfo(e);
    if (x.code === 'PRECONDITION_FAILED' || info.status === 412) return errorSentence(info);
    return outcomeOf(e, true) === 'not_sent' ? t('rename.notSent') : t('rename.failed');
  };

  const save = () => {
    if (!editing || sending || hold) return;
    const id = editing;
    const r = rows.find((x) => x.id === id);
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

  // A DOM-shaped key from the kit field (fields.term onKeyDown): Escape closes the form, not the dialog.
  const onFieldKey: FieldKey = (e) => {
    if (e.key === 'Escape' && !sending) {
      e.stopPropagation();
      e.preventDefault();
      cancelEdit();
    } else if (e.key === 'Enter') {
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
      size="lg"
      busy={sending}
      outcome={outcome}
      onCheck={checkHeld}
      outcomeDetail={notYetShown ? t('rename.notYet') : undefined}
      outcomeActions={notYetShown && hold ? <TextButton onPress={() => leave(hold)}>{t('rename.stopWaiting')}</TextButton> : undefined}
    >
      <Box dir="column" gap={1}>
        {(status || settledStatus) ? <Text colour="muted" sem={{ role: 'status' }}>{status || settledStatus}</Text> : null}
        {rows.map((r) => {
          const shownName = nameOf(r.id);
          const isHeld = hold?.id === r.id;
          return (
            <Box key={r.id} dir="column">
              <Box dir="row" gap={2}>
                {r.tint ? <FieldSwatch value={REALM_HEX[r.tint]} /> : null}
                <Text colour="muted" shrink={0}>{r.tint ? t(COLOR_KEY[r.tint]) : '·'}</Text>
                <Text bold truncate>{shownName}</Text>
                <Text colour="faint" shrink={0}>{realmShortId(r.id)}</Text>
                {isHeld ? <Text colour="warn" shrink={0}>{t('rename.held')}</Text> : null}
                {editing !== r.id && (
                  // The row already shows the name: the button draws the verb alone and keeps "Rename <name>" as its
                  // name. With the name in it too, a long name (up to 64 characters) left the row's own name no cell
                  // and ran the button off the dialog's edge.
                  <Button size="sm" variant="ghost" aria-label={t('rename.pen', { name: shownName })} isDisabled={!!hold || sending} autoFocus={penBack === r.id} onPress={() => edit(r.id)}>
                    {tt('rename.go')}
                  </Button>
                )}
              </Box>
              {editing === r.id && (
                <Box boxRef={formBox} dir="column" gap={1} padX={2}>
                  <FormEscape within={formBox} onEscape={cancelEdit} off={sending} />
                  <TextField
                    label={t('rename.name')}
                    value={name}
                    onChange={setName}
                    placeholder={realmShortId(r.id)}
                    description={t('rename.nameHint')}
                    errorMessage={error ?? undefined}
                    isDisabled={sending}
                    autoFocus
                    onKeyDown={onFieldKey}
                  />
                  <ColourChoice
                    label={t('rename.color')}
                    hint={t('rename.colorHint')}
                    names={Object.fromEntries(REALM_PALETTE.map((c) => [c, t(COLOR_KEY[c])])) as Record<RealmColor, string>}
                    value={color}
                    onChange={setColor}
                    disabled={sending}
                  />
                  <Box dir="row" gap={2}>
                    <Button variant="primary" size="sm" busy={sending} onPress={save}>{t('rename.save')}</Button>
                    <Button size="sm" isDisabled={sending} onPress={cancelEdit}>{t('rename.cancel')}</Button>
                  </Box>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Dialog>
  );
}

/** Escape on a control of the open form that does not take it itself (the colour choice, Save, Cancel) cancels the
 *  form, as it does on the name field and as the web's form does (its keydown handler is on the form's own element).
 *  Shortcut handlers run newest first, and this one is mounted with the form, after the dialog's own: it takes the key
 *  before the dialog closes on it. Only while the focus is in the form: shortcut handlers hear every key of the
 *  dialog, and Escape on another row's Rename button or on Close is the dialog's, as on the web. While a save is being
 *  sent it takes nothing, as on the web. */
function FormEscape({ within, onEscape, off }: { within: RefObject<BoxRenderable | null>; onEscape: () => void; off: boolean }): null {
  const fc = useFocusControl();
  useKeys((k) => {
    if (k.name !== 'escape' || off || !fc.containsFocus(within.current)) return false;
    onEscape();
    return true;
  });
  return null;
}

/** The colour choice (the web's RadioGroup of swatches): one stop for Tab, Left/Right (or Up/Down) move the choice, a
 *  click picks one. Each colour is its swatch and its name; the choice is marked ‹ › and bold, never by colour alone. */
function ColourChoice({ label, hint, names, value, onChange, disabled }: {
  label: string; hint: string; names: Readonly<Record<RealmColor, string>>;
  value: RealmColor | ''; onChange: (c: RealmColor) => void; disabled: boolean;
}) {
  const at = value ? REALM_PALETTE.indexOf(value) : -1;
  const step = (d: number): boolean => {
    if (disabled) return false;
    const n = REALM_PALETTE.length;
    onChange(REALM_PALETTE[at < 0 ? (d > 0 ? 0 : n - 1) : (at + d + n) % n]!);
    return true;
  };
  return (
    <Box dir="column">
      <Text>{label}</Text>
      <Pressable
        dir="row"
        wrap
        gapX={1}
        disabled={disabled}
        sem={{ role: 'radiogroup', name: label, ...(value ? { value: names[value] } : {}) }}
        onKey={(k) => (k.name === 'right' || k.name === 'down' ? step(1) : k.name === 'left' || k.name === 'up' ? step(-1) : false)}
      >
        {({ focused }) => REALM_PALETTE.map((c) => {
          const on = c === value;
          return (
            <Pressable key={c} dir="row" shrink={0} tabStop={false} disabled={disabled} focusPaint={false} onPress={() => onChange(c)} sem={{ role: 'radio', name: names[c], checked: on }}>
              <Text colour={on ? (focused ? 'blueText' : 'ink') : 'muted'} bold={on}>{on ? '‹' : ' '}</Text>
              <FieldSwatch value={REALM_HEX[c]} />
              <Text colour={on ? (focused ? 'blueText' : 'ink') : 'muted'} bold={on}>{' ' + names[c] + (on ? '›' : ' ')}</Text>
            </Pressable>
          );
        })}
      </Pressable>
      <Text colour="muted">{hint}</Text>
    </Box>
  );
}
