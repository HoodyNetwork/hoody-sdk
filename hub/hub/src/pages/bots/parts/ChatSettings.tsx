// Chat apps, Settings: the agent's settings of one chat app (the five main controls, then All settings by group) and of one chat.
// Values start from what the agent reports as effective; a change is held in a draft until Save sends it as one change, and a
// lost answer holds the form (C9). The agent validates; the form checks only a number's range and a value's shape before a send.
import { key, has, emptyDraft, draftDirty, draftSendable, draftAfterSave, useRefusal, withRefusal } from './ChatSettings.pure';
import type { Key } from './ChatSettings.pure';
export { emptyDraft, draftDirty, draftSendable, draftAfterSave, useRefusal, withRefusal } from './ChatSettings.pure';
export type { SettingsDraft } from './ChatSettings.pure';
import type { SettingsDraft } from './ChatSettings.pure';
import { AnatomySection, Band, Button, CHAT_SLOTS, ChatNames, markChatApps, Checkbox, CheckboxGroup, ConfirmDialog, Dialog, Disclosure, Icon, OutcomeBanner, Select, SettingGroup, SettingRow, Switch, TextField, useStrings, type OutcomeLike } from '@kit';
import { Fragment, useEffect, useState } from 'react';
import {
  SETTING_GROUPS,
  allSettingRows,
  effectiveOf,
  enumFor,
  homeChatOptions,
  maxFor,
  parseSetting,
  settingDiffers,
  settingRows,
  sourceOf,
  type SettingRow as SettingRowDef,
  type SettingScope,
  type SettingsView,
} from '../chatSettings';
import type { Change, Channel, ChannelChange, ChannelKind, ChannelSettings, ChannelVars, ChatRow } from '../data';
import strings from '../strings.en.json';
import s from './pane.module.css';
import { withBotFather } from './botFather';

type ChangeT = Change<ChannelChange, ChannelVars>;

/** The banner of a chat app change the agent refused: what happened, and which setting and why when the agent said. */
export function ChangeFailed({ change }: { change: ChangeT }) {
  const t = useStrings(strings);
  const refusal = useRefusal();
  if (change.outcome !== 'failed') return null;
  const line = refusal(change.details);
  return <OutcomeBanner kind="failed" title={t('chan.failed')} body={line === undefined ? undefined : <ChatNames text={markChatApps(line)} />} />;
}

/** A code press (Issue, Cancel) that was refused before it was sent: the code was hidden at the press, and it may still work. */
export interface RefusedPress {
  kind: 'issue' | 'cancel';
  code: string | undefined;
}

/** The line for a refused press: what was not sent and why, in the kit's words for a refusal, without the failure wording. */
export function PressRefused({ refused, onHide }: { refused: RefusedPress | null; onHide: () => void }) {
  const t = useStrings(strings);
  if (!refused) return null;
  return <OutcomeBanner kind="not_sent" title={t(refused.kind === 'cancel' ? 'chan.press.cancelNotSent' : 'chan.press.issueNotSent')} error={{ outcome: 'not_sent', code: refused.code }} onDismiss={onHide} />;
}

/** The refusal line on a failed outcome's line in a dialog, with each chat app it names carrying its mark (rule 19). */
export function refusalDetail(o: OutcomeLike | undefined, line: string | undefined): React.ReactNode {
  return o && o.kind === 'failed' && line ? <ChatNames text={markChatApps(line)} /> : undefined;
}

/** Closing a dialog that holds a draft asks first. */
export function DiscardAsk({ isOpen, onOpenChange, onDiscard }: { isOpen: boolean; onOpenChange: (o: boolean) => void; onDiscard: () => void }) {
  const t = useStrings(strings);
  return <ConfirmDialog overlayId="bots-chat-settings-discard" isOpen={isOpen} onOpenChange={onOpenChange} title={t('set.discardAsk.title')} body={t('set.discardAsk.body')} confirmLabel={t('set.discardAsk.go')} tone="danger" onConfirm={onDiscard} />;
}

const text = (v: unknown): string => (Array.isArray(v) ? v.join('\n') : v === null || v === undefined ? '' : String(v));

interface FormProps {
  scope: SettingScope;
  kind: ChannelKind | '';
  view: SettingsView;
  rows: readonly SettingRowDef[];
  /** The notes the agent attached to a setting; shown beside it. */
  notes?: readonly { code: string; field: string }[];
  /** Chats that may be the home chat. */
  chats?: readonly ChatRow[];
  draft: SettingsDraft;
  onDraft: (next: SettingsDraft) => void;
  disabled: boolean;
  /** One group per setting group, each under its name. */
  grouped?: boolean;
}

export function SettingsForm({ scope, kind, view, rows, notes = [], chats = [], draft, onDraft, disabled, grouped }: FormProps) {
  const t = useStrings(strings);
  const homeIds = homeChatOptions(chats).map((c) => c.id);
  const word = (r: SettingRowDef, v: unknown): string => {
    if (v === true) return t('set.on');
    if (v === false) return t('set.off');
    if (v === null || v === undefined) return '';
    const k = `set.v.${r.name}.${String(v)}`;
    return has(k) ? t(key(k)) : String(v);
  };
  // `text` is what was typed into a text field: kept in the draft so a refused value stays on screen while the draft's edits
  // hold only what was accepted.
  const setEdit = (r: SettingRowDef, value: unknown, bad: boolean, text?: string) => {
    const edits = { ...draft.edits };
    if (bad || !settingDiffers(view, r.name, value)) delete edits[r.name];
    else edits[r.name] = value;
    const refused = draft.bad.filter((n) => n !== r.name);
    // Typed text stays as typed while the field is being edited, even where it parses to what the agent reports (a separator after
    // the only ID, say, must not vanish under the cursor). It is shown only while it is an outstanding edit, a refused value or
    // still reads as the agent's value (see `shown` below), so a refresh of that value is never hidden behind old text.
    const raw = { ...draft.raw };
    if (text === undefined) delete raw[r.name];
    else raw[r.name] = text;
    onDraft({ edits, bad: bad ? [...refused, r.name] : refused, raw, shown: bad ? draft.shown : draft.shown.filter((n) => n !== r.name) });
  };
  const take = (r: SettingRowDef, raw: unknown, text?: string) => {
    const p = parseSetting(r, kind, raw, homeIds);
    setEdit(r, p.ok ? p.value : undefined, !p.ok, text);
  };
  const current = (r: SettingRowDef): unknown => (r.name in draft.edits ? draft.edits[r.name] : effectiveOf(view, r.name));

  const row = (r: SettingRowDef) => {
    const name = t(key(`set.n.${r.name}`));
    // A setting of one chat app only names that app: its name carries the app's logo before it, and the control is named by the row.
    const app = r.only;
    const label =
      app === null ? (
        name
      ) : (
        <>
          <Icon name={app} size="sm" />
          {` ${name}`}
        </>
      );
    const v = current(r);
    const edited = r.name in draft.edits;
    const refused = draft.bad.includes(r.name) && draft.shown.includes(r.name);
    const source = sourceOf(view, r.name);
    // What the agent noted about this setting is a warning about its one field: the band attached under the control.
    const noted = notes.filter((n) => n.field === r.name && has(`set.note.${n.code}`));
    const warn =
      noted.length === 0
        ? undefined
        : noted.map((n, i) => (
            <Fragment key={n.code}>
              {i > 0 && ' '}
              {withBotFather(t(key(`set.note.${n.code}`), CHAT_SLOTS), (p) => <ChatNames text={p} />)}
            </Fragment>
          ));
    if (r.place === 'ro') {
      return (
        <SettingRow key={r.name} label={label} help={t('set.readOnly')}>
          {(ids) => (
            <Band tone="warn" /* noDetails: what the agent notes about this setting; no request was refused */ attach={<TextField aria-labelledby={ids.nameId} aria-describedby={ids.helpId} value={Array.isArray(v) ? v.map((x) => word(r, x)).join(', ') || t('set.none') : word(r, v)} isReadOnly />}>
              {warn}
            </Band>
          )}
        </SettingRow>
      );
    }
    // Where the value comes from: plain words at the start of the row's help, under its name like every other help line.
    const from = edited && draft.edits[r.name] === null ? t('set.willDefault') : source === 'bot' ? t('set.from.bot') : source === 'channel' ? t('set.from.channel') : source === 'chat' ? t('set.from.chat') : source === 'default' ? t('set.from.default') : undefined;
    // The way back to the default for a value set at this scope: the row's reset cell. Every row keeps the cell (hidden
    // while there is nothing to reset), so the controls of a group share one width.
    const reset = { shown: source === scope && !edited && !disabled, label: t('set.reset'), onPress: () => setEdit(r, null, false) };
    const restart = r.restart ? t('set.restart') : undefined;
    const help = from !== undefined && restart !== undefined ? `${from} \u00b7 ${restart}` : (from ?? restart);
    if (r.kind === 'bool') {
      return (
        <SettingRow key={r.name} label={label} help={help} reset={reset}>
          {(ids) => (
            <Band tone="warn" /* noDetails: what the agent notes about this setting; no request was refused */ attach={<Switch labelledBy={ids.nameId} aria-describedby={ids.helpId} isSelected={v === true} isDisabled={disabled} onChange={(on) => take(r, on)} />}>
              {warn}
            </Band>
          )}
        </SettingRow>
      );
    }
    if (r.kind === 'enum') {
      return (
        <SettingRow key={r.name} label={label} help={help} reset={reset}>
          {(ids) => (
            <Band tone="warn" /* noDetails: what the agent notes about this setting; no request was refused */ attach={<Select aria-label={name} aria-describedby={ids.helpId} value={typeof v === 'string' ? v : undefined} isDisabled={disabled} options={enumFor(r, kind).map((x) => ({ value: x, label: word(r, x) }))} onChange={(x) => take(r, x)} />}>
              {warn}
            </Band>
          )}
        </SettingRow>
      );
    }
    if (r.kind === 'chat') {
      const options = [{ value: '', label: t('set.home.none') }, ...homeChatOptions(chats).map((c) => ({ value: c.id, label: c.title || c.platformChat || t('chan.chat.noTitle') }))];
      return (
        <SettingRow key={r.name} label={label} help={help} reset={reset}>
          {(ids) => (
            <Band tone="warn" /* noDetails: what the agent notes about this setting; no request was refused */ attach={<Select aria-label={name} aria-describedby={ids.helpId} value={typeof v === 'string' ? v : ''} isDisabled={disabled} options={options} onChange={(x) => take(r, x)} />}>
              {warn}
            </Band>
          )}
        </SettingRow>
      );
    }
    if (r.kind === 'set') {
      const picked = Array.isArray(v) ? v.map(String) : [];
      // A set of tick boxes is no single field a band can attach to: what the agent noted joins the row's help.
      return (
        <SettingRow
          key={r.name}
          label={label}
          help={
            help === undefined && warn === undefined ? undefined : (
              <>
                {help}
                {help !== undefined && warn !== undefined && ' '}
                {warn}
              </>
            )
          }
          reset={reset}
        >
          {(ids) => (
            <CheckboxGroup aria-labelledby={ids.nameId} aria-describedby={ids.helpId} isDisabled={disabled} value={picked} onChange={(next) => take(r, next)}>
              {(r.values ?? []).map((x) => (
                <Checkbox key={x} value={x} label={word(r, x)} />
              ))}
            </CheckboxGroup>
          )}
        </SettingRow>
      );
    }
    const typed = r.name in draft.raw ? (draft.raw[r.name] as string) : undefined;
    const parsedTyped = typed === undefined ? undefined : parseSetting(r, kind, typed, homeIds);
    // The typed text, while it is an edit, is refused, or still means what the agent reports; once the agent's value moves on
    // under it, the agent's value shows.
    const keepTyped = typed !== undefined && (edited || draft.bad.includes(r.name) || (parsedTyped?.ok === true && !settingDiffers(view, r.name, parsedTyped.value)));
    const shown = keepTyped ? (typed as string) : text(v);
    const why = refused ? (parseSetting(r, kind, shown) as { why?: { key: string; min?: number; max?: number } }).why : undefined;
    // A number's range and an ID list's shape are the field's own description, under the field.
    const hint = r.kind === 'int' ? t(r.zeroOff ? 'set.rangeOff' : 'set.range', { min: r.min, max: maxFor(r, kind) }) : r.kind === 'ids' ? t('set.idsHelp') : undefined;
    // A number stays a text field: what is typed is judged as typed (a refused value stays on screen with its error, and
    // zero can mean off below the range's start), which a stepping number field would clamp or drop on blur.
    return (
      <SettingRow key={r.name} label={label} help={help} reset={reset}>
        {(ids) => (
          <Band
            tone="warn"
            /* noDetails: what the agent notes about this setting; no request was refused */
            attach={
              <TextField
                aria-labelledby={ids.nameId}
                aria-describedby={ids.helpId}
                description={hint}
                value={shown}
                isDisabled={disabled}
                multiline={r.kind === 'ids'}
                rows={4}
                mono
                inputMode={r.kind === 'int' ? 'numeric' : undefined}
                errorMessage={why ? t(why.key as Key, { min: why.min ?? 0, max: why.max ?? 0 }) : undefined}
                onChange={(x) => take(r, x, x)}
                onBlur={() => !draft.shown.includes(r.name) && onDraft({ ...draft, shown: [...draft.shown, r.name] })}
              />
            }
          >
            {warn}
          </Band>
        )}
      </SettingRow>
    );
  };

  if (!grouped) return <SettingGroup variant="field">{rows.map(row)}</SettingGroup>;
  return (
    <div className={s.formStack}>
      {SETTING_GROUPS.map((g) => {
        const inGroup = rows.filter((r) => r.group === g);
        return inGroup.length === 0 ? null : (
          <SettingGroup key={g} variant="field" title={t(key(`set.g.${g}`))}>
            {inGroup.map(row)}
          </SettingGroup>
        );
      })}
    </div>
  );
}

/** What the drawer's foot shows for a chat app's settings draft: the status line, Discard and the one Save. */
export interface SettingsFoot {
  /** The draft's writer for the form: a new edit ends "Saved". */
  onDraft: (d: SettingsDraft) => void;
  reason: string | undefined;
  secondary: React.ReactNode;
  primary: React.ReactNode;
}

/** Save and Discard for a chat app's draft, as the parts of the drawer's foot; what Save sends is one change of the whole draft.
 *  `active`: the Settings section is the one shown ("Saved" does not outlive a visit to another section). */
export function useSettingsSave({ channel, change, draft, onDraft, active }: { channel: Channel | undefined; change: ChangeT; draft: SettingsDraft; onDraft: (d: SettingsDraft) => void; active: boolean }): SettingsFoot {
  const t = useStrings(strings);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!active) setSaved(false);
  }, [active]);
  const busy = change.running || change.outcome === 'pending';
  const dirty = draftDirty(draft);
  const edit = (d: SettingsDraft) => {
    setSaved(false);
    onDraft(d);
  };
  const save = () => {
    if (!channel) return;
    void change.run({ channelId: channel.id, action: 'settings', settings: draft.edits }).then((r) => {
      if (r.outcome !== 'done') return;
      onDraft(draftAfterSave(draft));
      setSaved(true);
    });
  };
  return {
    onDraft: edit,
    reason: draft.bad.length > 0 ? t('set.skipsBad') : dirty ? t('set.unsaved') : saved ? t('set.saved') : undefined,
    secondary: (
      <Button variant="ghost" isDisabled={!dirty || busy} onPress={() => edit(emptyDraft)}>
        {t('set.discard')}
      </Button>
    ),
    primary: (
      <Button variant="primary" busy={change.running} isDisabled={!draftSendable(draft) || busy} onPress={save}>
        {t('set.save')}
      </Button>
    ),
  };
}

/** The settings of one chat app: the main controls, then All settings. Its Save and Discard are the drawer's foot (useSettingsSave). */
export function ChannelSettingsSection({ channel, change, draft, onDraft }: { channel: Channel; change: ChangeT; draft: SettingsDraft; onDraft: (d: SettingsDraft) => void }) {
  const t = useStrings(strings);
  const locked = change.running || change.outcome === 'pending';
  const common = { scope: 'channel' as const, kind: channel.kind, view: channel.view, notes: channel.notes, chats: channel.chatRows, draft, onDraft, disabled: locked };
  return (
    <>
      <AnatomySection id="bot-chat-settings-main" title={t('set.main')} description={t('set.mainHelp')} state={{ kind: 'ready' }}>
        <SettingsForm {...common} rows={settingRows('channel', channel.kind, 'main')} />
      </AnatomySection>
      <Disclosure title={t('set.all')} description={t('set.allHelp')}>
        <SettingsForm {...common} rows={allSettingRows('channel', channel.kind)} grouped />
      </Disclosure>
    </>
  );
}

/** The Bot's own settings, for every chat app, saved as one change. With `onOpenChange` the caller opens it (the Chat apps
 *  head menu; it mounts this while open, so each opening starts from an empty draft) and no button is drawn. */
export function AllAppsSettings({ settings, change, open, onOpenChange }: { settings: ChannelSettings; change: ChangeT; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const t = useStrings(strings);
  const refusal = useRefusal();
  const [own, setOwn] = useState(false);
  const isOpen = onOpenChange ? open === true : own;
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setOwn(o));
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const busy = change.running || change.outcome === 'pending';
  const last: OutcomeLike | undefined = change.outcome === 'pending' || change.outcome === 'failed' ? { kind: change.outcome, code: change.code } : undefined;
  const show = () => {
    setDraft(emptyDraft);
    setOpen(true);
  };
  const close = (o: boolean) => {
    if (o) return;
    if (draftDirty(draft)) setAsking(true);
    else setOpen(false);
  };
  return (
    <>
      {!onOpenChange && (
        <Button variant="secondary" icon="settings" isDisabled={busy} onPress={show}>
          {t('set.bot.open')}
        </Button>
      )}
      {isOpen && (
        <Dialog
          overlayId="bots-chat-settings-bot"
          isOpen
          onOpenChange={close}
          title={t('set.bot.title')}
          body={t('set.bot.help')}
          size="lg"
          primaryLabel={t('set.save')}
          primaryDisabled={!draftSendable(draft)}
          busy={change.running}
          outcome={withRefusal(last, refusal(change.details))}
          outcomeDetail={refusalDetail(last, refusal(change.details))}
          onCheck={() => change.readBack()}
          onPrimary={() =>
            void change.run({ channelId: '', action: 'botSettings', settings: draft.edits }).then((r) => {
              if (r.outcome !== 'done') return;
              if (draft.bad.length > 0) setDraft(draftAfterSave(draft));
              else setOpen(false);
            })
          }
        >
          {draft.bad.length > 0 && <Band tone="warn" size="table" /* noDetails: typed values the form holds back; no request was refused */>{t('set.skipsBad')}</Band>}
          <SettingsForm scope="bot" kind="" view={settings.view} rows={allSettingRows('bot', '')} draft={draft} onDraft={setDraft} disabled={busy} />
        </Dialog>
      )}
      <DiscardAsk
        isOpen={asking}
        onOpenChange={setAsking}
        onDiscard={() => {
          setAsking(false);
          setOpen(false);
        }}
      />
    </>
  );
}
