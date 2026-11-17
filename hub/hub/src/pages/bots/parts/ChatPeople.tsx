// Chat apps, People: who is paired with an app and what each may do, an invite code, and adding, editing and removing a person.
// Every send is a held change (C9): a lost answer holds the button and offers Check again, never a second send. An invite code is shown
// once, from the code holder (codes.ts: one per chat app, cleared by Done, a cancel, the code's expiry or the drawer closing), and is
// never put in a lock key, an identity or a change's answer.
import { AnatomySection, Band, Button, CHAT_SLOTS, CellLines, ChatNames, Checkbox, ConfirmDialog, DataTable, Dialog, EmptyState, Fieldset, FormSection, RowNote, SecretField, Select, Switch, Tag, TextField, createColumnHelper, fitWidth, useStrings, type ActionSpec, type RowActionEntry, type StringKey } from '@kit';
import { Fragment, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { LANGS, effectiveOf, platformIdOk, tooLong, NAME_MAX } from '../chatSettings';
import { adoptDemo, beginIssue, clearCode, settlePress, useCodeMayHaveChanged, useHeldCode, type HeldCode } from '../codes';
import { personPatch } from '../logic';
import { RIGHTS, ownerCodeOff, ownerless, type Change, type Channel, type ChannelChange, type ChannelVars, type Person, type Right } from '../data';
import strings from '../strings.en.json';
import { dialogOutcome } from './Bits';
import { InviteSteps } from './ChatFlow';
import { PressRefused, type RefusedPress } from './ChatSettings';
import s from './pane.module.css';
import { ownSentence } from './textBits';

type ChangeT = Change<ChannelChange, ChannelVars>;
const colP = createColumnHelper<Person>();
type Dlg = { kind: 'add' } | { kind: 'edit'; person: Person } | { kind: 'remove'; person: Person } | null;

/** A person's name; without one, their ID in the app said as an ID (`idLabel`, never a bare number); else `none`. */
const label = (p: Person, none: string, idLabel?: (id: string) => string): string => p.name || (p.platformUser ? (idLabel ? idLabel(p.platformUser) : p.platformUser) : none);
/** The languages the agent accepts, with a stored one it does not list kept so it can be seen and replaced. */
const langOptions = (current: string): string[] => (current === '' || (LANGS as readonly string[]).includes(current) ? [...LANGS] : [...LANGS, current]);

/** A code shown once with the time it stops working, to copy and send, in its step's row. A pairing code is a
 *  secret, so it stays a kit SecretField (masked until shown, wiped when the page hides), not a plain CopyField. The
 *  holder clears it then, and a code past its time is never handed to this field. */
export function IssuedCodeField({ issued, label: text, note }: { issued: HeldCode; label: string; note: string }) {
  const t = useStrings(strings);
  const until = issued.expiresAt > 0 ? t('chan.code.expires', { time: new Date(issued.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : '';
  return <SecretField label={text} value={issued.code} description={until ? `${note} ${until}` : note} />;
}

/** The rights as checkboxes. `titled`: a named set (the kit Fieldset); without it the form section around them is their title. */
function RightsBoxes({ value, onChange, isDisabled, titled }: { value: readonly Right[]; onChange: (v: readonly Right[]) => void; isDisabled?: boolean; titled?: boolean }) {
  const t = useStrings(strings);
  const boxes = RIGHTS.map((r) => (
    <Checkbox key={r} label={t(`chan.right.${r}`)} isSelected={value.includes(r)} isDisabled={isDisabled} onChange={(on) => onChange(on ? [...value, r] : value.filter((x) => x !== r))} />
  ));
  return titled ? <Fieldset label={t('chan.person.rights')}>{boxes}</Fieldset> : <>{boxes}</>;
}

interface PeopleProps {
  channel: Channel;
  change: ChangeT;
  /** The Bot's uid: with the chat app it names the holder of the invite code. */
  botUid: string;
  /** Go to the chat app's Settings. */
  onSettings?: () => void;
  /** Go to the chat app's Setup, where the first owner's code is made. */
  onSetup?: () => void;
  /** A refused code press belongs to the drawer's one code holder, so Setup and People share it; without a drawer People keeps its own. */
  codeLine?: CodeLine;
}

/** The line of a refused code press (Issue, Cancel). */
export interface CodeLine {
  refused: RefusedPress | null;
  /** A code press starts: the line goes, and the press's answer is shown through the returned callback, which drops an answer that no longer counts. */
  press: () => (line: RefusedPress) => void;
  hide: () => void;
}

/** A person's language under their name in the table (a CellLines line): a note, only when one is set. */
function LangNote({ lang }: { lang: string }) {
  const t = useStrings(strings);
  return lang !== '' ? <RowNote>{t('chan.person.langIs', { lang: `set.v.lang.${lang}` in strings ? t(`set.v.lang.${lang}` as StringKey<typeof strings>) : lang })}</RowNote> : null;
}

export function PeopleSection({ channel, change, botUid, onSettings, onSetup, codeLine }: PeopleProps) {
  const t = useStrings(strings);
  // The app's name as words (an accessible name) and as a ChatNames slot (drawn with the app's mark).
  const app = t(`chan.kind.${channel.kind}`);
  const appSlot = CHAT_SLOTS[channel.kind];
  const langName = (x: string): string => (`set.v.lang.${x}` in strings ? t(`set.v.lang.${x}` as StringKey<typeof strings>) : x);
  const [dlg, setDlg] = useState<Dlg>(null);
  // The code holder has one code per chat app; People shows it when it is an invite (an owner code shows in Setup).
  const holder = useHeldCode(botUid, channel.id);
  const invite = holder?.kind === 'invite' ? holder : null;
  // An issue or a cancel was pressed and nothing has answered: the agent may have replaced or removed the code.
  const mayHaveChanged = useCodeMayHaveChanged(botUid, channel.id);
  // Which change the shared hook last ran: a dialog shows its own outcome, never another action's.
  const [last, setLast] = useState('');
  const [userId, setUserId] = useState('');
  // The ID's error shows once the field has been left; Add is held back while it is wrong.
  const [idTouched, setIdTouched] = useState(false);
  const [name, setName] = useState('');
  const [lang, setLang] = useState('');
  const [rights, setRights] = useState<readonly Right[]>(['chat']);
  const [owner, setOwner] = useState(false);
  // Edit: the fields the person changed in this dialog. Only those are sent; every other field follows the person as the agent lists
  // them now, through any refresh while the dialog is open. `ownersAtTouch` is who owned the app when the Owner switch first moved
  // away from the person as listed (null while it has not): a change before that is what the person chose against.
  const [touched, setTouched] = useState<{ name?: true; lang?: true; rights?: true; owner?: true }>({});
  const [ownersAtTouch, setOwnersAtTouch] = useState<string | null>(null);
  const [ownRefused, setOwnRefused] = useState<RefusedPress | null>(null);
  const line: CodeLine = codeLine ?? {
    refused: ownRefused,
    press: () => {
      setOwnRefused(null);
      return setOwnRefused;
    },
    hide: () => setOwnRefused(null),
  };
  const [inviteRights, setInviteRights] = useState<readonly Right[]>(['chat']);
  const [makeHome, setMakeHome] = useState(false);
  // An invite code works only while direct messages are set to pairing: under the other policies the agent issues it and then
  // refuses to redeem it. A policy the Hub does not know yet is not blocked.
  const policy = effectiveOf(channel.view, 'dm_policy');
  const pairingOff = typeof policy === 'string' && policy !== 'pairing';

  const busy = change.running || change.outcome === 'pending';
  const run = (vars: Omit<ChannelVars, 'channelId'>) => {
    setLast(`${vars.action}:${vars.target ?? ''}`);
    return change.run({ ...vars, channelId: channel.id });
  };
  const own = (action: string, target = '') => (last === `${action}:${target}` ? dialogOutcome(change) : undefined);
  const open = (d: Dlg) => {
    setLast('');
    setUserId('');
    setIdTouched(false);
    setName(d?.kind === 'edit' ? d.person.name : '');
    setLang(d?.kind === 'edit' ? d.person.lang : '');
    setRights(d?.kind === 'edit' ? d.person.rights : ['chat']);
    setOwner(d?.kind === 'edit' ? d.person.owner : false);
    setTouched({});
    setOwnersAtTouch(null);
    setDlg(d);
  };
  const close = () => setDlg(null);
  const done = (r: { outcome: string }) => {
    if (r.outcome === 'done') close();
  };
  const otherOwner = channel.principals.some((p) => p.owner && !(dlg?.kind === 'edit' && p.id === dlg.person.id));
  // The agent refuses to make anyone the first owner here: the first owner pairs with an owner code, and can then hand over.
  const hasOwner = !ownerless(channel);
  const ownersKey = channel.principals.filter((p) => p.owner).map((p) => p.id).sort().join(',');
  // Whether the Owner switch can be on: it cannot while the app has no owner (a refresh can take the owner away while a dialog is open).
  // What is sent counts the selection only while it is available.
  const ownerOn = hasOwner && owner;
  useEffect(() => {
    if (owner && !hasOwner) setOwner(false);
  }, [owner, hasOwner]);
  const idBad = userId.trim() !== '' && !platformIdOk(channel.kind, 'user', userId.trim());
  const addNameBad = tooLong(name.trim());
  // What the Edit dialog shows and sends: the person as listed now, with only the touched fields from the form.
  const found = dlg?.kind === 'edit' ? channel.principals.find((x) => x.id === dlg.person.id) : undefined;
  // A person the refreshed list no longer has cannot be edited: the dialog says so and sends nothing.
  const gone = dlg?.kind === 'edit' && found === undefined;
  const live = dlg?.kind === 'edit' ? (found ?? dlg.person) : undefined;
  // Remove works on the person as listed now: one the refreshed list no longer has is already removed, and nothing is sent for it.
  const removing = dlg?.kind === 'remove' ? channel.principals.find((x) => x.id === dlg.person.id) : undefined;
  const removeGone = dlg?.kind === 'remove' && removing === undefined;
  const nameV = live && !touched.name ? live.name : name;
  const langV = live && !touched.lang ? live.lang : lang;
  const rightsV = live && !touched.rights ? live.rights : rights;
  // The owner switch counts as touched only while it still differs from the person as listed now.
  const ownerTouched = live !== undefined && touched.owner === true && owner !== live.owner;
  const ownerV = live ? hasOwner && (ownerTouched ? owner : live.owner) : false;
  // Ownership moved while the dialog was open and the person had touched the Owner switch: what they chose was about another state.
  const ownerMoved = !gone && ownerTouched && ownersKey !== ownersAtTouch;
  const editNameBad = tooLong(nameV);
  // What is said about the Owner switch, attached under it: ownership moved while editing (warn), else no owner yet, the
  // first owner pairs with a code, with the way to where that code is made. None while neither holds.
  const ownerBand = (sw: ReactElement<{ 'aria-describedby'?: string }>, moved: boolean): ReactNode =>
    moved ? (
      <Band tone="warn" attach={sw} /* noDetails: the owner list read back changed under the edit, not a rejection */>
        {t('chan.person.ownerMoved')}
      </Band>
    ) : !hasOwner ? (
      <Band
        // noDetails: the app has no owner yet, a state read back, not a rejection
        attach={sw}
        actions={
          onSetup ? (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => {
                close();
                onSetup();
              }}
            >
              {t('chan.person.ownerOpenSetup')}
            </Button>
          ) : undefined
        }
      >
        {t('chan.person.ownerNeedsPairing')}
        {ownerCodeOff(policy) && (
          <>
            {' '}
            {ownSentence(t('chan.ownerCode.needsPolicy'))}
          </>
        )}
      </Band>
    ) : (
      sw
    );
  const nameError = (bad: boolean): string | undefined => (bad ? t('chan.nameTooLong', { max: NAME_MAX }) : undefined);

  const add = () =>
    void run({ action: 'personAdd', person: { platformUser: userId.trim(), name: name.trim() || undefined, ...(ownerOn ? { owner: true } : { rights }) } }).then(done);
  const edit = (p: Person) => {
    if (gone || ownerMoved || !live) return;
    void run({ action: 'personEdit', target: p.id, person: personPatch(live, { name: nameV, lang: langV, rights: rightsV, owner: ownerV }) }).then(done);
  };
  // The request number is taken here, as the button is pressed (the shown code drops now), not when the send is admitted.
  const invited = () => {
    const ticket = beginIssue(botUid, channel.id);
    const refuse = line.press();
    void run({ action: 'invite', invite: { rights: inviteRights, owner: false, makeHome }, ticket }).then((r) => {
      if (r.outcome !== 'done' && r.outcome !== 'pending') settlePress(botUid, channel.id);
      if (r.outcome === 'not_sent') refuse({ kind: 'issue', code: r.code });
      if (r.outcome === 'done') adoptDemo(botUid, channel.id, 'invite', r.data, ticket);
    });
  };
  const cancelInvite = () => {
    beginIssue(botUid, channel.id);
    const refuse = line.press();
    void run({ action: 'cancelCode' }).then((r) => {
      if (r.outcome !== 'done' && r.outcome !== 'pending') settlePress(botUid, channel.id);
      if (r.outcome === 'not_sent') refuse({ kind: 'cancel', code: r.code });
      if (r.outcome === 'done') clearCode(botUid, channel.id);
    });
  };
  const editPatchEmpty = gone || live === undefined || Object.keys(personPatch(live, { name: nameV, lang: langV, rights: rightsV, owner: ownerV })).length === 0;

  // The table: who, what they may do, their language. Edit is the row's inline fix and Remove sits in its menu (confirmed as before).
  const columns = useMemo(() => {
    const words = (p: Person): string[] => [...(p.owner ? [t('chan.person.owner')] : []), ...RIGHTS.filter((r) => p.rights.includes(r)).map((r) => t(`chan.right.${r}`))];
    // Each right is a Tag beside the next (a Tag's padding and border plus the gap before it): the column is as wide as the most Tags a
    // person holds, so none is ever cut.
    const tagPad = 26 * Math.max(1, ...channel.principals.map((p) => words(p).length));
    const canMax = 640;
    const canText = (p: Person) => words(p).join(' ');
    return [
      colP.accessor((p) => label(p, t('chan.person.noName'), (id) => t('chan.person.idOnly', { id })), {
        id: 'person',
        enableSorting: false,
        header: t('people.col.person'),
        meta: { pinned: true, size: 'fit', list: 'primary', label: t('people.col.person'), fitText: (p: Person) => label(p, t('chan.person.noName'), (id) => t('chan.person.idOnly', { id })) },
        // The name, and under it the language the agent answers them in, when one is set.
        cell: (x) => (
          <CellLines>
            {x.getValue()}
            <LangNote lang={x.row.original.lang} />
          </CellLines>
        ),
      }),
      colP.display({
        id: 'can',
        enableSorting: false,
        header: t('people.col.can'),
        meta: { size: 'fit', priority: 1, fitPad: tagPad, fitText: canText, maxWidth: canMax, minWidth: fitWidth(channel.principals.map(canText), { extra: tagPad, max: canMax }), list: 'meta', listLabel: true, listWraps: true },
        // The Tags straight in the cell, a space between them (kit parts only). listWraps: on the phone list the field takes
        // the lines it needs, the Tags wrapping whole (the Bots list's Chat apps field).
        cell: (x) => (
          <>
            {words(x.row.original).map((w, i) => (
              <Fragment key={w}>
                {i > 0 ? ' ' : null}
                <Tag tone={x.row.original.owner && i === 0 ? 'accent' : 'neutral'}>{w}</Tag>
              </Fragment>
            ))}
          </>
        ),
      }),
    ];
  }, [t, channel.principals]);
  const entries = (p: Person): RowActionEntry[] => [
    { id: 'edit', label: t('chan.person.edit'), inline: true, opens: true, isDisabled: busy, onAction: () => open({ kind: 'edit', person: p }) },
    '-',
    { id: 'remove', label: t('chan.person.remove'), icon: 'trash', tone: 'danger', opens: true, isDisabled: busy, onAction: () => open({ kind: 'remove', person: p }) },
  ];
  const addAction: ActionSpec = { id: 'people-add', label: t('chan.person.add'), icon: 'plus', opens: 'dialog', ...(busy ? { disabledReason: t('chan.pause.maybeBody') } : {}), onPress: () => open({ kind: 'add' }) };

  return (
    <div className={s.tabBody}>
      <AnatomySection id="bot-people" title={t('chan.rail.people')} description={t('chan.peopleHelp')} actions={{ primary: addAction }} state={{ kind: 'ready' }} flush={channel.principals.length > 0}>
        <DataTable bare fill={false} label={t('chan.people.list', { name: channel.label })} data={channel.principals} columns={columns} getRowId={(p) => p.id} noViewMenu sortParam={false} onRowAction={false} actions={entries} empty={<EmptyState size="sm" icon="account" title={t('chan.people.empty')} />} />
      </AnatomySection>

      <AnatomySection id="bot-invite" title={t('chan.invite.title')} notices={
          <>
            {!invite && mayHaveChanged && busy && <Band size="table">{t('chan.code.mayHaveChanged')}</Band>}
            {!invite && pairingOff && (
              <Band tone="warn" size="table" /* noDetails: a setting the invite needs, not a rejection: there is nothing to show */ actions={onSettings ? <Button variant="secondary" onPress={onSettings}>{t('chan.invite.openSettings')}</Button> : undefined}>
                {t('chan.invite.needsPolicy')}
              </Band>
            )}
          </>
        } state={{ kind: 'ready' }}>
        {/* The steps first; the issued code sits under its Send row (its SecretField), the form after the list. */}
        <InviteSteps channel={channel} code={invite ? <IssuedCodeField issued={invite} label={t('chan.invite.codeTitle')} note={t('chan.invite.codeNote')} /> : undefined} />
        {invite ? (
          <div className={s.formStack}>
            <div className={s.chipRow}>
              <Button onPress={() => clearCode(botUid, channel.id)}>{t('chan.invite.done')}</Button>
              <Button variant="ghost" isDisabled={busy} onPress={cancelInvite}>
                {t('chan.invite.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div className={s.formStack}>
            <PressRefused refused={line.refused} onHide={line.hide} />
            <RightsBoxes titled value={inviteRights} onChange={setInviteRights} isDisabled={busy || pairingOff} />
            <Checkbox label={t('chan.invite.makeHome')} isSelected={makeHome} isDisabled={busy || pairingOff} onChange={setMakeHome} />
            <div>
              {/* With every right unticked the button says so (the other causes have their own notice above). */}
              <Button busy={change.running} isDisabled={busy || pairingOff || inviteRights.length === 0} {...(!busy && !pairingOff && inviteRights.length === 0 ? { disabledReason: t('chan.invite.needRight') } : {})} onPress={invited}>
                {t('chan.invite.go')}
              </Button>
            </div>
          </div>
        )}
      </AnatomySection>

      <Dialog
        overlayId="bots-people-add"
        isOpen={dlg?.kind === 'add'}
        onOpenChange={(o) => !o && close()}
        title={t('chan.person.addTitle', { name: channel.label })}
        body={<ChatNames text={t('chan.person.addBody', { app: appSlot })} />}
        size="lg"
        primaryLabel={t('chan.person.addGo')}
        primaryDisabled={userId.trim() === '' || idBad || addNameBad || (!ownerOn && rights.length === 0)}
        primaryDisabledReason={userId.trim() === '' ? t('chan.person.needUserId') : idBad ? t('chan.person.needValidId') : !addNameBad && !ownerOn && rights.length === 0 ? t('chan.person.needRight') : undefined}
        busy={change.running}
        outcome={own('personAdd')}
        onCheck={() => change.readBack()}
        onPrimary={add}
      >
        <FormSection>
          {/* The label names the app, so it is drawn here with the app's mark; the field keeps it as its accessible name. */}
          <div className={s.appField}>
            <span className={s.appFieldLabel} aria-hidden="true">
              <ChatNames text={t('chan.person.userId', { app: appSlot })} />
            </span>
            <TextField
              aria-label={t('chan.person.userId', { app })}
              description={t('chan.person.userIdHelp')}
              isRequired
              value={userId}
              onChange={setUserId}
              onBlur={() => setIdTouched(true)}
              errorMessage={idBad && idTouched ? t('chan.person.userIdBad') : undefined}
            />
          </div>
          <TextField label={t('chan.person.name')} value={name} onChange={setName} errorMessage={nameError(addNameBad)} />
        </FormSection>
        <FormSection title={t('chan.person.rights')}>
          {ownerBand(<Switch label={t('chan.person.ownerSwitch')} description={ownerOn ? t('chan.person.ownerHelp') : undefined} isSelected={ownerOn} isDisabled={!hasOwner} onChange={setOwner} />, false)}
          {!ownerOn && <RightsBoxes value={rights} onChange={setRights} />}
        </FormSection>
      </Dialog>

      {dlg?.kind === 'edit' && (
        <Dialog
          overlayId="bots-people-edit"
          isOpen
          onOpenChange={(o) => !o && close()}
          title={t('chan.person.editTitle', { name: label(dlg.person, t('chan.person.noName')) })}
          size="lg"
          primaryLabel={t('chan.person.save')}
          primaryDisabled={editPatchEmpty || editNameBad || gone || ownerMoved || (!ownerV && rightsV.length === 0)}
          primaryDisabledReason={!editPatchEmpty && !editNameBad && !gone && !ownerMoved && !ownerV && rightsV.length === 0 ? t('chan.person.needRight') : undefined}
          busy={change.running}
          outcome={own('personEdit', dlg.person.id)}
          onCheck={() => change.readBack()}
          onPrimary={() => edit(dlg.person)}
        >
          <FormSection>
            <TextField label={t('chan.person.name')} value={nameV} onChange={(x) => { setName(x); setTouched((o) => ({ ...o, name: true })); }} errorMessage={nameError(editNameBad)} />
            <Select
              label={t('chan.person.lang')}
              description={t('chan.person.langHelp')}
              value={langV}
              options={[{ value: '', label: t('chan.person.langNone') }, ...langOptions(langV).map((x) => ({ value: x, label: langName(x) }))]}
              onChange={(x) => { setLang(x); setTouched((o) => ({ ...o, lang: true })); }}
            />
          </FormSection>
          <FormSection title={t('chan.person.rights')}>
            {ownerBand(
              <Switch
                label={t('chan.person.ownerSwitch')}
                description={ownerV && !live?.owner && otherOwner ? t('chan.person.ownerHelp') : undefined}
                isSelected={ownerV}
                isDisabled={!hasOwner}
                onChange={(on) => {
                  setOwner(on);
                  // Back at what the agent lists is no change at all.
                  setTouched((o) => (on === live?.owner ? { ...o, owner: undefined } : { ...o, owner: true }));
                  // Editing starts at the first move away from the listed person and keeps that baseline through later toggles, so a
                  // change between two toggles still shows; put back, it starts again at the next move.
                  setOwnersAtTouch((b) => (on === live?.owner ? null : (b ?? ownersKey)));
                }}
              />,
              ownerMoved,
            )}
            {gone && <Band size="table">{t('chan.person.gone')}</Band>}
            <RightsBoxes value={ownerV ? RIGHTS : rightsV} onChange={(v) => { setRights(v); setTouched((o) => ({ ...o, rights: true })); }} isDisabled={ownerV} />
          </FormSection>
        </Dialog>
      )}

      {dlg?.kind === 'remove' && (
        <ConfirmDialog
          overlayId="bots-people-remove"
          isOpen
          onOpenChange={(o) => !o && close()}
          title={t('chan.person.removeTitle', { name: label(dlg.person, t('chan.person.noName')) })}
          body={
            removeGone ? (
              t('chan.person.removeGone')
            ) : (
              <>
                <ChatNames text={t('chan.person.removeBody', { app: appSlot })} />
                {removing?.owner ? ` ${t('chan.person.removeOwner')}` : null}
              </>
            )
          }
          confirmDisabled={removeGone}
          confirmLabel={t('chan.person.removeGo')}
          tone="danger"
          busy={change.running}
          outcome={own('personRemove', dlg.person.id)}
          onCheck={() => change.readBack()}
          onConfirm={() => void run({ action: 'personRemove', target: dlg.person.id }).then(done)}
        />
      )}
    </div>
  );
}
