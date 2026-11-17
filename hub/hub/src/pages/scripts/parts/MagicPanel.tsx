// The script's magic comments, by hand: one panel drawn from the computer's own field list (magic-comments/schema), filled from
// its own read (magic-comments/read), checked by a dry run of the same update, and saved by that update (ifRevision, opId).
// Turning the script on or off, its schedule and its key are three of these fields, not separate editors. A secret is never
// prefilled or shown: the page can set or remove it, and a key it makes is shown once, after the change is known to have gone through.
import { Band, Button, Dialog, Disclosure, EmptyState, ErrorState, ItemList, Panel, ProblemList, ReasonButton, Row, ScheduleField, SecretField, SecretInput, Select, SettingGroup, SettingRow, Skeleton, Stack, StatusLine, SubSection, Switch, TextField, Why, showToast, useStrings, type FaqItem } from '@kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCommentsCheck, useCommentsRead, useCommentsSchema, useSetComments } from '../data';
import { folderOf, isRevisionClash, itemKey, newKey, newOpId } from '../logic';
import { MAX_KEYS, changeLine, effectiveBool, helpOf, inShowOrder, isRetired, keepKeys, keyCount, parseSchema, patchOf, samePatch, secretIsSet, sendsMade, textOf, heldKeyPlaces, unseenPlaces, withEdit, type Draft, type Field, type Patch, type Problem, type Raw, type UnseenKind, type UnseenMark } from '../magic';
import strings from '../strings.en.json';
import type { CommentsDry, CompScripts, ScriptItem } from '../types';
import { ChangeBanner } from './Bits';
import { forScript, ofPath, readBackOf, useChange } from './ops';
import { sentOf, useOpCheck } from './opcheck';

const rand = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));
const table = strings as Record<string, string>;
const labelOf = (key: string): string => table[`magic.f.${key}`] ?? key;
const categoryOf = (c: string): string => table[`magic.cat.${c}`] ?? c;
/** A listed value in the Hub's words when it has some (`magic.e.<key>.<value>`), else as the computer names it. */
const choiceOf = (key: string, value: string): string => table[`magic.e.${key}.${value}`] ?? value;
/** The categories a person looks at first are open groups; the rest sit together under one More settings fold. */
const OPEN = ['execution', 'auth'];

interface Reviewed {
  patch: Patch;
  rev: string;
  dry: CommentsDry;
}

/** `faq`: the page's answer about these settings; the link shows only when it is given (the page gives it). */
/** `focusSchedule`: Overview's pending "Set schedule" ask (0 = none); once the fields show, focus moves to the schedule and
 *  `onScheduleFocused` answers it. */
export function MagicPanel({ item, comp, editable, onChanged, faq, focusSchedule = 0, onScheduleFocused }: { item: ScriptItem; comp: CompScripts; editable: boolean; onChanged: () => unknown; faq?: FaqItem; focusSchedule?: number; onScheduleFocused?: () => void }) {
  const t = useStrings(strings);
  const schemaQ = useCommentsSchema(true, folderOf(item.path));
  const read = useCommentsRead(item.id, true);
  const schema = useMemo(() => parseSchema(schemaQ.data), [schemaQ.data]);
  const comments = useSetComments();
  const check = useCommentsCheck();
  const place = `${comp.id}\u0000${item.path}`;
  const commentsH = forScript(comments, ofPath(item.path, comp.id));
  const setting = useChange(place, commentsH);
  const opSetting = useOpCheck();
  const [draft, setDraft] = useState<Draft>({});
  const [reviewed, setReviewed] = useState<Reviewed | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [note, setNote] = useState<'refused' | 'unavailable' | 'conflict' | null>(null);
  // The secret whose buttons were pressed last: its state is read out below the groups as it changes.
  const [said, setSaid] = useState<string | null>(null);
  // A new picker for each fresh draft, so a kind picked in the last one (custom) does not outlive it.
  const [pickerGen, setPickerGen] = useState(0);
  // The schedule's kind select: Overview's "Set schedule" moves focus there (focusSchedule).
  const scheduleRef = useRef<HTMLButtonElement>(null);
  // False while the schedule's time box shows text that is not a time: the draft still holds the last good time, so neither
  // review nor save may run until the box and the draft agree again.
  const [scheduleOk, setScheduleOk] = useState(true);
  // A secret field whose input is open but still empty (an empty input is no edit).
  const [typing, setTyping] = useState<Record<string, boolean>>({});
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [keyUnseen, setKeyUnseen] = useState(false);
  // The key this panel made for the draft, kept only to show it once after the save is known to have gone through.
  const madeKey = useRef<string | null>(null);
  // What the last save sent: the Check by op may later prove it, and only then is the draft done.
  const sentKey = useRef<string | null>(null);
  // That send added the made key beside the script's other keys (keepKeys): an unseen key there is not replaced by making another.
  const sentBeside = useRef(false);
  // A key that may have gone in beside the others and was never shown: a warned close gave up on knowing (forceSetting). It
  // stays live until removed, so its line stays through later saves. Only a save that replaces the
  // whole key list ends it, or a read with no key.
  // It is kept per computer and script outside the panel (unseenPlaces), so it survives a remount.
  const [liveUnseen, setLiveState] = useState<UnseenMark | null>(() => unseenPlaces.get(place) ?? null);
  const setLiveUnseen = (v: UnseenMark | null) => {
    if (v) unseenPlaces.set(place, v);
    else unseenPlaces.delete(place);
    setLiveState(v);
  };
  // That save sent the token as one value or null, which replaces every stored key.
  const sentWhole = useRef(false);
  // The revision that save was sent against.
  const sentRev = useRef<string | null>(null);

  const stored = read.data?.comments ?? {};
  const rev = read.data?.revision ?? null;
  const built = schema ? patchOf(schema, draft) : null;
  const problems: Record<string, Problem> = built && 'problems' in built ? built.problems : {};
  const keys = keyCount(stored);
  // A read that shows no key at a later revision than the save was sent against proves the unseen one is gone: the line ends for
  // good, whatever is added later. A read still at that revision proves nothing: it can predate the held save, as a
  // cached read after a remount does. The line stays hidden while that read shows no key.
  if (liveUnseen && read.data && keys === 0 && rev !== liveUnseen.sentRev) setLiveUnseen(null);
  // A key made here never drops the script's other keys (keepKeys): what is checked and saved is that list.
  const patch = built && 'patch' in built ? keepKeys(built.patch, madeKey.current, keys) : null;
  // The made key is held (keepKeys null): the read since it was made gives no key count, or a full one. Nothing is checked or saved.
  const keyHeld = !!built && 'patch' in built && patch === null;
  const dirty = Object.keys(draft).length > 0;
  const locked = setting.locked || reviewing;
  const free = editable && rev !== null && !setting.locked;
  const ready = !!patch && !!reviewed && reviewed.rev === rev && samePatch(reviewed.patch, patch);

  const edit = (f: Field, raw: Raw) => {
    setDraft((d) => withEdit(d, f, stored, raw));
    setReviewed(null);
    setNote(null);
  };
  const discard = () => {
    setDraft({});
    setReviewed(null);
    setNote(null);
    setPickerGen((n) => n + 1);
    setTyping({});
    setSaid(null);
    madeKey.current = null;
  };

  const review = async () => {
    if (!patch || !rev || reviewing || !scheduleOk) return;
    setReviewing(true);
    setNote(null);
    const r = await check.mutateAsync({ path: item.path, ifRevision: rev, comments: patch }).catch(() => null);
    setReviewing(false);
    if (r?.outcome === 'done' && r.data) setReviewed({ patch, rev, dry: r.data });
    else if (isRevisionClash(r)) {
      void read.refetch();
      setNote('conflict');
    } else setNote(r?.outcome === 'failed' || r?.outcome === 'not_sent' ? 'refused' : 'unavailable');
  };

  // A change the computer is known to have made: the draft is done, a key made for it is shown once, the views read again.
  const applied = () => {
    setKeyUnseen(false);
    const key = sentKey.current;
    const made = madeKey.current;
    sentKey.current = null;
    madeKey.current = null;
    setDraft({});
    setReviewed(null);
    setPickerGen((n) => n + 1);
    setTyping({});
    setSaid(null);
    if (made && key === made) setShownKey(made);
    heldKeyPlaces.delete(place);
    if (sentWhole.current) setLiveUnseen(null);
    void read.refetch();
    void onChanged();
  };

  const save = async () => {
    if (!ready || !rev || !reviewed || !scheduleOk) return;
    const opId = newOpId(rand);
    const sent = reviewed.patch;
    const made = madeKey.current;
    const before = { key: sentKey.current, beside: sentBeside.current, whole: sentWhole.current, rev: sentRev.current };
    sentRev.current = rev;
    sentKey.current = sendsMade(sent.token, made) ? made : null;
    sentBeside.current = Array.isArray(sent.token);
    sentWhole.current = sent.token !== undefined && !Array.isArray(sent.token);
    setKeyUnseen(false);
    const r = await setting.run(() => comments.mutateAsync({ compId: comp.id, path: item.path, ifRevision: rev, opId, comments: sent }));
    const rec = sentOf(comments, { compId: comp.id, path: item.path, opId, vars: { compId: comp.id, path: item.path } }, r);
    opSetting.remember(rec, place);
    if (rec === undefined) {
      // Core refused the press for an older hold, here or in another tab: it answers "pending" but sent nothing under this op id
      // (sentOf). No key of this press can be live, so it gets no "may have been added" line.
      sentKey.current = before.key;
      sentBeside.current = before.beside;
      sentWhole.current = before.whole;
      sentRev.current = before.rev;
      return;
    }
    if (r?.outcome === 'done') applied();
    else if (isRevisionClash(r)) {
      // Nothing was written: read the script again and ask for a new review of the same edits.
      sentKey.current = null;
      setReviewed(null);
      setNote('conflict');
      void read.refetch();
    } else if (r?.outcome === 'failed' || r?.outcome === 'not_sent') {
      // A refusal changed nothing, but the script may have: read it again and check the same edits against what is there now.
      sentKey.current = null;
      setReviewed(null);
      void read.refetch();
    } else if (r?.outcome === 'pending') {
      setKeyUnseen(!!sentKey.current);
      // Kept past a remount: the hold outlives this panel's record of what it sent.
      if (sentKey.current) heldKeyPlaces.set(place, { kind: sentBeside.current ? 'beside' : 'whole', sentRev: rev });
    }
  };

  // Check again: the computer's own answer for the op first, then a fresh read; a proof ends the banner and applies the draft.
  // A Check that frees the hold without proof of the send (a warned close, a refusal, "never ran") leaves the draft but not the old
  // review: the script is read again and the same edits are checked anew. The hold is released through an alias of settle.
  const endSetting = setting.settle;
  // The warned "Close without knowing" frees the hold with no proof about the send: the draft stays, but the review made before it no
  // longer stands, the made key (never shown) is not owed to anyone, and the script is read again.
  // A key that went beside the others is different. If the held save wrote it, the read now lists it, and
  // sending it again would be a second copy, which the computer refuses. So it leaves the draft, and the notice that it may work
  // until removed stays. A single key is still resent: written twice, it is the same one key.
  const forceSetting = () => {
    // Only a held send that carried this draft's made key beside the others can have added it: sentKey is
    // set only by a press that sent the made key, never by a refused one or an earlier save.
    const ours = sentKey.current !== null && sentKey.current === madeKey.current;
    const heldBeside = ours && sentBeside.current;
    // After a remount the panel has no record of the held send, only the place's mark: the draft and its key are gone, so
    // whatever that send may have added stays said.
    const mark = heldKeyPlaces.get(place);
    heldKeyPlaces.delete(place);
    setting.force();
    sentKey.current = null;
    setReviewed(null);
    const made = madeKey.current;
    if (heldBeside && made !== null) {
      // The held save's notice hands over to liveUnseen, which a read with no key ends.
      setKeyUnseen(false);
      setLiveUnseen({ kind: 'beside', sentRev: sentRev.current ?? '' });
      madeKey.current = null;
      setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k, v]) => !(k === 'token' && v === made))));
    } else {
      setKeyUnseen(false);
      if (!ours && mark) setLiveUnseen(mark);
    }
    void read.refetch();
  };
  // A Check that ends the hold without the change proves it never ran or was refused: no key of it is live.
  const checkSetting = () => opSetting.checkWith(place, () => { heldKeyPlaces.delete(place); endSetting(); setReviewed(null); setKeyUnseen(false); void read.refetch(); }, () => readBackOf(setting.settle, commentsH), applied);

  const makeKey = (f: Field) => {
    const k = newKey(rand);
    madeKey.current = k;
    setSaid(f.key);
    edit(f, k);
  };
  const clearMade = (f: Field, raw: Raw, open = false) => {
    // Only the field that holds the made key gives it up: editing another secret must not forget a key still in the draft.
    if (draft[f.key] === madeKey.current) madeKey.current = null;
    setTyping((x) => ({ ...x, [f.key]: open }));
    setSaid(f.key);
    edit(f, raw);
  };

  // Every setting is the same row: its plain name and help, the line as it is written in the code under them, and its
  // control in the group's field column. A control is described by the row's help.
  const row = (f: Field) => {
    const label = labelOf(f.key);
    const placeholder = table[`magic.p.${f.key}`];
    const bad = problems[f.key];
    const err = bad ? t(`magic.problem.${bad}` as never) : undefined;
    const off = !free;
    const raw = draft[f.key];
    const control = (helpId: string | undefined): React.ReactNode => {
      switch (f.kind) {
        case 'bool':
          return <Switch aria-label={label} aria-describedby={helpId} label={t(effectiveBool(f, stored, draft) ? 'magic.on' : 'magic.off')} isSelected={effectiveBool(f, stored, draft)} isDisabled={off} onChange={(v) => edit(f, v)} />;
        case 'enum':
          return (
            <Select
              aria-label={label}
              aria-describedby={helpId}
              value={typeof raw === 'string' ? raw : raw === null ? '' : textOf(f, stored)}
              isDisabled={off}
              options={[{ value: '', label: typeof f.runtime === 'string' && f.enums.includes(f.runtime) ? t('magic.defaultIs', { value: choiceOf(f.key, f.runtime) }) : t('magic.default') }, ...f.enums.map((e) => ({ value: e, label: choiceOf(f.key, e) }))]}
              onChange={(v) => edit(f, v === '' ? null : v)}
            />
          );
        case 'secret':
          return secretValue(f, off);
        case 'readonly':
          return t('magic.readonly');
        default:
          if (f.key === 'schedule') return scheduleControl(f, off, err, helpId);
          return (
            <TextField
              aria-label={label}
              aria-describedby={helpId}
              value={typeof raw === 'string' ? raw : raw === null ? '' : textOf(f, stored)}
              isDisabled={off}
              errorMessage={err}
              mono={f.kind !== 'text' || f.key === 'cors'}
              placeholder={placeholder ?? (f.fallback === undefined || f.fallback === null ? undefined : String(f.fallback))}
              onChange={(v) => edit(f, v)}
            />
          );
      }
    };
    return (
      <SettingRow key={f.key} label={label} help={helpOf(f, table)} code={f.directive} actions={f.kind === 'secret' ? secretActions(f, off) : undefined}>
        {(ids) => control(ids.helpId)}
      </SettingRow>
    );
  };

  // The schedule: the kit schedule field over the draft's expression, null for never.
  const scheduleControl = (f: Field, off: boolean, err: string | undefined, helpId: string | undefined) => {
    const raw = draft[f.key];
    const text = typeof raw === 'string' ? raw : raw === null ? '' : textOf(f, stored);
    return <ScheduleField key={pickerGen} label={labelOf(f.key)} aria-describedby={helpId} value={raw === null || (raw === undefined && !text) ? null : text} onChange={(v) => edit(f, v)} isDisabled={off} errorMessage={err} kindRef={scheduleRef} onValid={setScheduleOk} />;
  };

  // A secret field: whether it is set, and setting or removing it. Its stored value is never read into the page.
  // What the page knows about it, for the row's value and its actions.
  const secretOf = (f: Field) => {
    const raw = draft[f.key];
    const typable = f.type.includes('string');
    // Several keys (the token's `@token` lines): the lines say so, a made key goes beside them, and Remove removes them all.
    const many = f.key === 'token' && keys !== null && keys >= 2 ? keys : null;
    // No key is made when the read does not say how many there are, or when the script holds the most the computer takes. A key
    // already made before such a read is held too (keyHeld).
    const noMake = f.key !== 'token' ? null : keys === null ? t('key.countUnknown') : keys >= MAX_KEYS ? t('key.full', { count: MAX_KEYS }) : null;
    return { raw, typable, many, noMake, isSet: secretIsSet(f, stored), made: madeKey.current === raw };
  };

  // The row's value: where the secret stands, in words that change as it is replaced or removed; while a new value is
  // typed, the input with those words under it.
  const secretState = (f: Field) => {
    const { raw, many, isSet, made } = secretOf(f);
    return raw === null ? (many ? t('magic.keysRemoving', { count: many }) : t('magic.secretRemoving'))
      : typeof raw === 'string' ? (made ? (keyHeld ? t('magic.keyOnHold') : many ? t('key.keep', { count: many }) : t('magic.keyMaking')) : t('magic.secretReplacing'))
      : many ? t('magic.keysSet', { count: many }) : t(isSet ? 'magic.secretSet' : 'magic.secretNone');
  };
  const secretValue = (f: Field, off: boolean) => {
    const { raw, typable, made } = secretOf(f);
    const state = secretState(f);
    if (!typable || !(typing[f.key] || typeof raw === 'string') || made) return state;
    return <SecretInput aria-label={labelOf(f.key)} description={state} value={typeof raw === 'string' ? raw : ''} onChange={(v) => clearMade(f, v, true)} isDisabled={off} reveal={false} errorMessage={problems[f.key] ? t(`magic.problem.${problems[f.key]}` as never) : undefined} resetKey={itemKey(item)} />;
  };

  // The row's actions: make a key or type a value, remove what is set, undo the edit. A key that cannot be made keeps its
  // button, which says why when it is focused, pointed at or pressed. None of them leaves the row, so none draws the
  // forward glyph.
  const secretActions = (f: Field, off: boolean) => {
    const { raw, typable, many, noMake, isSet } = secretOf(f);
    return (
      <>
        {f.key !== 'token' ? (
          typable && !typing[f.key] && typeof raw !== 'string' ? (
            <Button size="sm" chip={false} isDisabled={off} onPress={() => clearMade(f, '', true)}>
              {t(isSet ? 'magic.secretReplace' : 'magic.secretAdd')}
            </Button>
          ) : null
        ) : noMake !== null ? (
          <ReasonButton size="sm" dismiss reason={noMake}>
            {t('key.replace')}
          </ReasonButton>
        ) : (
          <Button size="sm" chip={false} isDisabled={off} onPress={() => makeKey(f)}>
            {t('key.replace')}
          </Button>
        )}
        {isSet && raw !== null ? (
          <Button size="sm" chip={false} isDisabled={off} onPress={() => clearMade(f, null)}>
            {many ? t('magic.keysRemove', { count: many }) : t('magic.secretRemove')}
          </Button>
        ) : null}
        {raw !== undefined || typing[f.key] ? (
          <Button size="sm" chip={false} isDisabled={off} onPress={() => clearMade(f, '')}>
            {t('magic.undo')}
          </Button>
        ) : null}
      </>
    );
  };

  // The page's answer is a Why: a closed question whose answer ends with the link, in every state of the panel.
  const faqLink = faq ? (
    <Why question={t('magic.why.q')} faq={{ item: faq, label: t('settings.more') }}>
      {t('magic.why.a')}
    </Why>
  ) : null;
  // Overview's "Set schedule": once the schedule field is drawn, focus moves to it (the How it runs group opens by default).
  const scheduleDrawn = !!schema?.fields.some((f) => f.key === 'schedule');
  // Each ask is served once: the one being answered is remembered until the page clears it (0).
  const servedAsk = useRef(0);
  useEffect(() => {
    if (!focusSchedule) servedAsk.current = 0;
    if (!focusSchedule || focusSchedule === servedAsk.current || !schema) return;
    const el = scheduleRef.current;
    // A select that can't be used takes no focus: wait for it while the lock is passing, and only a script that can't be
    // edited at all ends the ask unserved (its Overview button says why).
    if (el && !free) {
      if (editable) return;
    } else if (el) {
      el.focus();
      el.scrollIntoView?.({ block: 'center' });
    } else if (scheduleDrawn) return;
    servedAsk.current = focusSchedule;
    onScheduleFocused?.();
  }, [focusSchedule, schema, scheduleDrawn, read.data, onScheduleFocused, free, editable]);

  if (schemaQ.isPending || read.isPending) {
    return (
      <Panel title={t('magic.title')}>
        <Stack gap={3}>
          {faqLink}
          <Skeleton rows={4} />
        </Stack>
      </Panel>
    );
  }
  if (schemaQ.isError || read.isError) {
    return (
      <Panel title={t('magic.title')}>
        <Stack gap={3}>
          {faqLink}
          <ErrorState size="sm" onRetry={() => { void schemaQ.refetch(); void read.refetch(); }} />
        </Stack>
      </Panel>
    );
  }
  if (!schema) {
    return (
      <Panel title={t('magic.title')}>
        <Stack gap={3}>
          {faqLink}
          <EmptyState size="sm" icon="info" title={t('magic.noSchema')} body={t('magic.noSchemaBody')} />
        </Stack>
      </Panel>
    );
  }

  // The unseen-key line: this panel's held send first, then a held send it was remounted over, then a key a warned close left.
  const heldMark = setting.out?.kind === 'pending' ? (heldKeyPlaces.get(place)?.kind ?? null) : null;
  const unseen: UnseenKind | null = keyUnseen ? (sentBeside.current ? 'beside' : 'whole') : (heldMark ?? (liveUnseen && keys !== 0 ? liveUnseen.kind : null));
  const lines = ready && reviewed ? reviewed.dry.changes.map((k) => changeLine(k, reviewed.dry.current, reviewed.dry.proposed)) : [];
  const warnings = read.data?.warnings ?? [];
  const count = patch ? Object.keys(patch).length : 0;
  // Each category is one titled group of its settings in the Hub's order; a setting that changes nothing is never a control,
  // and shows (read-only, under No longer used) only while the script still has its line.
  const fieldsOf = (c: string) => inShowOrder(schema.fields.filter((f) => f.category === c && !isRetired(f)));
  const shown = schema.categories.filter((c) => fieldsOf(c).length > 0);
  const open = shown.filter((c) => OPEN.includes(c));
  const folded = shown.filter((c) => !OPEN.includes(c));
  const group = (c: string) => (
    <SettingGroup key={c} variant="field" title={categoryOf(c)}>
      {fieldsOf(c).map(row)}
    </SettingGroup>
  );
  const saidField = said === null ? undefined : schema.fields.find((f) => f.key === said && f.kind === 'secret');
  const retired = schema.fields.filter((f) => isRetired(f) && stored[f.key] !== undefined && stored[f.key] !== null);

  return (
    <Panel title={t('magic.title')} description={t('magic.body')}>
      <Stack gap={3}>
        {faqLink}
        {warnings.length > 0 ? (
          <SubSection title={t('magic.warnings')} state={{ kind: 'ready' }}>
            <ProblemList label={t('magic.warnings')} problems={warnings.map((w, i) => ({ id: `${w.directive}:${i}`, line: null, message: `${w.directive}: ${w.message}`, tone: 'warn' as const }))} />
          </SubSection>
        ) : null}
        <ChangeBanner out={setting.out} what="settings" onDismiss={setting.settle} onCheck={checkSetting} onForce={forceSetting} />
        {/* A made key is withheld while its save is held, or may be live unseen: a status that comes and goes. */}
        {unseen ? <Band size="table">{t(unseen === 'beside' ? 'key.unseenBeside' : 'key.unseen')}</Band> : null}
        {open.map(group)}
        {folded.length > 0 ? (
          <Disclosure title={t('magic.more')} defaultExpanded={open.length === 0}>
            <Stack gap={4}>{folded.map(group)}</Stack>
          </Disclosure>
        ) : null}
        {retired.length > 0 ? (
          <SettingGroup variant="field" title={t('magic.retired')}>
            {retired.map((f) => (
              <SettingRow key={f.key} label={labelOf(f.key)} help={t('magic.retiredHelp')} code={f.directive}>
                {t(stored[f.key] === true ? 'magic.on' : stored[f.key] === false ? 'magic.off' : 'magic.retiredSet')}
              </SettingRow>
            ))}
          </SettingGroup>
        ) : null}
        {/* A made key the latest read has no room for holds the check and the save: said beside them, with the way out. */}
        {keyHeld ? <Band size="table" tone="warn" /* noDetails: nothing was refused; the latest read has no room for the key made here, and Undo is the way out */>{t('key.held')}</Band> : null}
        {/* What became of the last check or save: one line that stays in place and changes its words. */}
        <StatusLine>{note ? t(`magic.note.${note}` as never) : null}</StatusLine>
        {/* A secret's row states where it stands; this line reads the change out when one of the row's buttons is pressed. */}
        <StatusLine>{saidField ? t('magic.secretSaid', { name: labelOf(saidField.key), state: secretState(saidField) }) : null}</StatusLine>
        {ready && reviewed ? (
          <SubSection title={t('magic.changes')} state={{ kind: 'ready' }}>
            <ItemList
              label={t('magic.changes')}
              items={[
                ...lines.map((l) => ({
                  id: l.key,
                  title: l.before === null && l.after === null ? t('magic.line.hidden', { name: labelOf(l.key) }) : t('magic.line.change', { name: labelOf(l.key), before: l.before ?? t('magic.unset'), after: l.after ?? t('magic.unset') }),
                })),
                ...(reviewed.dry.ignored.length > 0 ? [{ id: 'ignored', title: t('magic.ignored', { names: reviewed.dry.ignored.join(', ') }) }] : []),
              ]}
            />
          </SubSection>
        ) : null}
        <Row gap={3} wrap>
          <Button variant="ghost" isDisabled={!dirty || locked} onPress={discard}>
            {t('magic.discard')}
          </Button>
          <Button isDisabled={!free || !dirty || !patch || locked || ready || !scheduleOk} busy={reviewing} onPress={() => void review()}>
            {t('magic.review')}
          </Button>
          <Button variant="primary" isDisabled={!free || !ready || locked || !scheduleOk} busy={setting.busy} onPress={() => void save()}>
            {t('magic.save', { n: String(count) })}
          </Button>
        </Row>
      </Stack>
      <Dialog
        isOpen={shownKey !== null}
        onOpenChange={(o) => !o && setShownKey(null)}
        title={t('key.shownTitle')}
        body={t('key.shownBody')}
        primaryLabel={t('key.done')}
        onPrimary={() => { setShownKey(null); showToast({ title: t('magic.saved'), tone: 'ok' }); }}
        hideCancel
        isDismissable={false}
      >
        {shownKey ? <SecretField label={t('key.label')} value={shownKey} description={t('key.once')} onWipe={() => setShownKey(null)} /> : null}
      </Dialog>
    </Panel>
  );
}
