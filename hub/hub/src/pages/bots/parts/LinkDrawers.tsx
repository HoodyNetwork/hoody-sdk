// The drawers behind the Link and keys tab: Give it a link, New key / Edit key, Limits and
// websites, and Re-point. Each says its outcome in words and never resends an unknown send.
import { Band, Button, ComputerMark, ConfirmDialog, DateField, FormSection, OutcomeBanner, PickerPanel, SecretField, SettingGroup, SettingRow, SettingSwitch, Stack, TextField, Drawer, Verdict, Why, useStrings } from '@kit';
import { parseAllowlist } from '@core';
import { useEffect, useState } from 'react';
import { holderNoteTooLong, keyNotesTooLong, type BotLink, type BotView, type Change, type Computer, type KeyFields, type LinkKey, type LinkOffer, type MintResult } from '../data';
import { LIMITS, MINT_LOCKED, expiryFromDate, freeKeyName, keyNameOk, keyNameTaken, labelProblem, limitProblem, previewUrl, type LimitName } from '../logic';
import { pageFaq } from '../faq';
import strings from '../strings.en.json';
import { DrawerFooter, dialogOutcome } from './Bits';
import { IpField } from './IpField';
import { KeyShare, issueKey } from './KeyShare';
import s from './pane.module.css';
import { livePreview } from './textBits';

// ── Give it a link ──────────────────────────────────────────────────────────────────

export function GiveLinkDrawer({
  open,
  onClose,
  bot,
  offer,
  create,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  bot: BotView;
  offer: LinkOffer | undefined;
  create: Change<BotLink, { label: string; cors: boolean }>;
  /** Called in place of onClose once the create is done (never on a failed or unknown one): the page decides where to go. */
  onDone?: () => void;
}) {
  const t = useStrings(strings);
  const { byId } = pageFaq(t);
  const [label, setLabel] = useState('');
  const [cors, setCors] = useState(true);
  // The name the last Create link of this opening was sent with ('' = the suggested one): a refusal of the name is said at
  // the field until the person changes it.
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setLabel('');
    setSent(null);
  }, [open]);
  const problem = label === '' ? null : labelProblem(label);
  // The API's own refusals of a name that passes the rule here (409): taken (names are permanent), or reserved.
  const refusedLabel = create.outcome === 'failed' && (create.code === 'BOT_LABEL_TAKEN' || create.code === 'BOT_LABEL_RESERVED') ? create.code : null;
  const labelRefused = refusedLabel !== null && sent === label;
  const preview = offer ? previewUrl(label, offer.zone, offer.suggestedLabel) : '';
  const ready = offer?.door === 'ready';
  return (
    <Drawer overlayId="bots-give-link-drawer" resizeKey="bots-give-link"
      isOpen={open}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={t('giveLink.title')}
      subtitle={t('giveLink.desc', { name: bot.name })}
      dirty={label !== ''}
      footer={
        <DrawerFooter
          cancelLabel={t('ui.cancel')}
          submitLabel={t('giveLink.create')}
          busy={create.running}
          pending={create.outcome === 'pending'}
          isDisabled={!ready || problem !== null || create.outcome === 'pending'}
          onSubmit={() => {
            setSent(label);
            void create.run({ label, cors }).then((r) => r.outcome === 'done' && (onDone ?? onClose)());
          }}
          note={
            <>
              {create.outcome === 'pending' && <OutcomeBanner kind="pending" title={t('giveLink.maybe')} body={t('giveLink.maybeBody')} onCheck={() => create.readBack()} onDismiss={() => create.dismiss()} />}
              {create.outcome === 'failed' && <OutcomeBanner kind="failed" title={t('giveLink.failed')} body={refusedLabel ? t(refusedLabel === 'BOT_LABEL_TAKEN' ? 'label.err.taken' : 'label.err.reserved') : undefined} />}
            </>
          }
        />
      }
    >
      <div className={s.drawerForm}>
        {/* No offer (its read is still on its way, or failed): Create link waits on it, so the same band says so. */}
        {offer?.door !== 'ready' && <Band size="table">{offer ? t(`link.door.${offer.door}`) : t('giveLink.unread')}</Band>}
        {offer?.door !== 'off' && (
          <Verdict label={t('giveLink.previewLabel')} next={t('giveLink.keyNext')}>
            {/* The address follows the typed name: a change is announced, never interrupting. */}
            {livePreview(offer?.zoneFrom === 'platform' ? t('link.platformPreview', { url: preview }) : preview || t('link.noZone'))}
          </Verdict>
        )}
        <TextField
          label={t('giveLink.labelField')}
          description={t('giveLink.labelHelp')}
          placeholder={offer?.suggestedLabel}
          value={label}
          onChange={setLabel}
          mono
          errorMessage={problem ? t(`label.err.${problem}`) : labelRefused ? t(refusedLabel === 'BOT_LABEL_TAKEN' ? 'label.err.taken' : 'label.err.reserved') : undefined}
        />
        <SettingGroup label={t('linkSet.browser')}>
          <SettingSwitch label={t('giveLink.cors')} help={t('giveLink.corsHelp')} isSelected={cors} onChange={setCors} />
        </SettingGroup>
        <Why question={t('giveLink.corsWhy')} faq={{ item: byId.corsLimits, label: t('limits.more') }}>
          {t('giveLink.corsWhyText')}
        </Why>
      </div>
    </Drawer>
  );
}

// ── New key / Edit key ──────────────────────────────────────────────────────────────

export function KeyDrawer({
  open,
  onClose,
  editing,
  editId,
  known = true,
  mint,
  edit,
  url,
  taken = [],
}: {
  open: boolean;
  onClose: () => void;
  editing: LinkKey | null;
  /** The id the drawer was opened for (`?drawer=key:<id>`); none opens New key. A drawer opened for an id only ever
   *  edits that key: while the key is not in the list (revoked elsewhere, the link gone) or the list is not read, it
   *  says so and sends nothing. It never turns into New key. */
  editId?: string;
  /** The link's keys are read. */
  known?: boolean;
  /** The names of the link's other keys: a key name is unique on its link, whatever the case. */
  taken?: readonly string[];
  /** The link's address, offered beside a fresh key. */
  url?: string;
  mint: Change<MintResult, KeyFields>;
  edit: Change<LinkKey, { keyId: string; action: 'pause' | 'resume' | 'revoke' | 'edit'; fields?: KeyFields }>;
}) {
  const t = useStrings(strings);
  const [name, setName] = useState('default');
  // The name the form opened on: a new key's is the first free one (New Bot already made "default").
  const [startName, setStartName] = useState('default');
  const [ips, setIps] = useState('');
  const [expiry, setExpiry] = useState('');
  const [notes, setNotes] = useState('');
  const [holder, setHolder] = useState('');
  // Opened for a key: an edit, whether or not that key is in hand. Only a drawer opened for no key makes one.
  const forKey = editId !== undefined || editing !== null;
  const lost = editId !== undefined && !editing ? (known ? 'gone' : 'unread') : null;
  useEffect(() => {
    // A key that is not in hand (gone mid-edit, or not read yet) leaves the form and any outcome of its edit as they are.
    if (!open || lost) return;
    const start = editing?.name ?? freeKeyName(taken);
    setName(start);
    setStartName(start);
    setIps(editing?.allowlist.join('\n') ?? '');
    setExpiry(editing?.expiresAt ? editing.expiresAt.slice(0, 10) : '');
    setNotes(editing?.notes ?? '');
    setHolder(editing?.holderNote ?? '');
    mint.reset();
    edit.reset();
    // Re-initialise when the drawer opens and when the key it shows changes (a refreshed key resets the form).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);
  const parsed = parseAllowlist(ips);
  const exp = expiryFromDate(expiry);
  // The day the form showed when it opened: only a date the person changed is sent on an edit (the stored time is kept otherwise).
  const expiryTouched = expiry !== (editing?.expiresAt ? editing.expiresAt.slice(0, 10) : '');
  const expiryPast = expiryTouched && typeof exp === 'string' && Date.parse(exp) <= Date.now();
  const nameBad = !keyNameOk(name);
  const nameTaken = !nameBad && keyNameTaken(name, taken);
  const holderBad = holderNoteTooLong(holder.trim());
  const notesBad = keyNotesTooLong(notes);
  const bad = nameBad || nameTaken || notesBad || parsed.errors.length > 0 || parsed.tooMany || exp === undefined || expiryPast || holderBad;
  // A new key's secret is shown here until the drawer closes; closing wipes it.
  const secret = !forKey && mint.outcome === 'done' ? mint.data : undefined;
  const act = forKey ? edit : mint;
  const close = () => {
    mint.reset();
    edit.reset();
    onClose();
  };
  return (
    <Drawer overlayId="bots-link-key-drawer" resizeKey="bots-link-key"
      isOpen={open}
      onOpenChange={(o) => !o && close()}
      size="md"
      title={secret ? t('secret.title', { name }) : forKey ? t('keyForm.editTitle') : t('keyForm.newTitle')}
      subtitle={t('keyForm.desc')}
      dirty={!lost && (Boolean(secret) || name !== startName || ips !== (editing?.allowlist.join('\n') ?? '') || expiryTouched || notes !== (editing?.notes ?? '') || holder !== (editing?.holderNote ?? ''))}
      discardText={secret ? t('secret.closeAsk') : undefined}
      discardLabel={secret ? t('secret.closeNow') : undefined}
      footer={
        secret ? (
          <DrawerFooter cancelLabel={t('ui.close')} submitLabel={t('secret.done')} onSubmit={close} />
        ) : (
          <DrawerFooter
            cancelLabel={t('ui.cancel')}
            submitLabel={forKey ? t('ui.save') : t('keyForm.create')}
            busy={act.running}
            pending={act.outcome === 'pending'}
            isDisabled={bad || lost !== null || act.outcome === 'pending'}
            onSubmit={() => {
              // The note goes only when the person changed it: stale text must not overwrite a note written elsewhere since the key was loaded.
              const fields: KeyFields = { name, allowlist: parsed.entries, ...(!editing || expiryTouched ? { expiresAt: exp ?? null } : {}), notes, ...(holder !== (editing?.holderNote ?? '') ? { holderNote: holder.trim() } : {}) };
              if (editing) void edit.run({ keyId: editing.id, action: 'edit', fields }).then((r) => r.outcome === 'done' && close());
              else if (!forKey) void mint.run(fields);
            }}
            note={
              <>
                {act.outcome === 'pending' && <OutcomeBanner kind="pending" title={t(forKey ? 'keyForm.editMaybe' : 'keyForm.maybe')} body={t(forKey ? 'keyForm.editMaybeBody' : 'keyForm.maybeBody')} onCheck={() => act.readBack()} onDismiss={() => act.dismiss()} />}
                {act.outcome === 'failed' && <OutcomeBanner kind="failed" title={t(forKey ? 'keyForm.editFailed' : 'keyForm.failed')} body={act.code === MINT_LOCKED ? t('keyForm.locked') : act.code === 'BOT_KEY_NAME_TAKEN' ? t('keyForm.nameTaken') : undefined} />}
              </>
            }
          />
        )
      }
    >
      {secret ? (
        <div className={s.drawerForm}>
          <SecretField label={t('secret.title', { name })} value={secret.secret} description={t('secret.note')} onWipe={() => mint.reset()} />
          <KeyShare key={issueKey(secret)} secret={secret.secret} url={url} />
        </div>
      ) : (
        <Stack gap={0}>
          {lost ? (
            <Band size="table">{t(lost === 'gone' ? 'keyForm.gone' : 'keyForm.unread')}</Band>
          ) : (
            <>
              <FormSection>
                <TextField label={t('keyForm.name')} description={t('keyForm.nameHelp')} value={name} onChange={setName} errorMessage={nameBad ? t('keyForm.nameBad') : nameTaken ? t('keyForm.nameTaken') : undefined} />
              </FormSection>
              <FormSection title={t('keyForm.sec.access')} description={t('keyForm.sec.accessHelp')}>
                <IpField value={ips} onChange={setIps} locked={act.running} />
                <DateField label={t('keyForm.expires')} description={t(editing ? 'keyForm.expiresHelp' : 'keyForm.expiresHelpNew')} value={expiry} onChange={setExpiry} errorMessage={exp === undefined ? t('keyForm.expiresBad') : expiryPast ? t('keyForm.expiresPast') : undefined} />
              </FormSection>
              <FormSection>
                <TextField label={t('keyForm.notes')} description={t('keyForm.notesHelp')} multiline rows={3} value={notes} onChange={setNotes} errorMessage={notesBad ? t('keyForm.notesBad') : undefined} />
                <TextField label={t('keyForm.holderNote')} description={t('keyForm.holderNoteHelp')} multiline rows={3} value={holder} onChange={setHolder} errorMessage={holderBad ? t('keyForm.holderBad') : undefined} />
              </FormSection>
            </>
          )}
        </Stack>
      )}
    </Drawer>
  );
}

// ── Limits and websites ─────────────────────────────────────────────────────────────

export function LimitsDrawer({
  open,
  onClose,
  link,
  patch,
  remove,
}: {
  open: boolean;
  onClose: () => void;
  link: BotLink | null;
  patch: Change<BotLink, { enabled?: boolean; cors?: boolean; limits?: BotLink['limits'] }>;
  remove: Change<void, { action: 'deleteLink' }>;
}) {
  const t = useStrings(strings);
  const { byId } = pageFaq(t);
  const [cors, setCors] = useState(true);
  const [lim, setLim] = useState<Record<LimitName, string>>({ key_rpm: '', bot_rpm: '', key_concurrency: '', bot_concurrency: '' });
  // The delete confirm holds the id of the link it was opened over: a link deleted and made again elsewhere has another
  // id, and a delete sent then would remove that new link and burn its label for good.
  const [deleting, setDeleting] = useState<string | null>(null);
  const deletingGone = deleting !== null && deleting !== link?.id;
  useEffect(() => {
    // Once no delete of its own is running, a confirm whose link is gone or replaced closes; Confirm sends nothing meanwhile.
    if (deletingGone && !remove.running) setDeleting(null);
  }, [deletingGone, remove.running]);
  // A Save this opening sent that was refused (the change is shared with the tab's Turn link on and off: only this
  // drawer's own Save is said here). Forgotten when the drawer closes.
  const [refused, setRefused] = useState<{ code: string | undefined } | null>(null);
  useEffect(() => {
    if (!open) {
      setRefused(null);
      // A delete confirm left open when the drawer went (Back, another Bot) never comes back on the next opening.
      setDeleting(null);
    }
  }, [open]);
  useEffect(() => {
    if (!open || !link) return;
    setCors(link.cors);
    setLim({
      key_rpm: String(link.limits.key_rpm ?? 60),
      bot_rpm: String(link.limits.bot_rpm ?? 120),
      key_concurrency: String(link.limits.key_concurrency ?? 4),
      bot_concurrency: String(link.limits.bot_concurrency ?? 8),
    });
  }, [open, link]);
  const problems = LIMITS.map((l) => limitProblem(l.name, lim[l.name]));
  const bad = problems.some((p) => p !== null);
  return (
    <Drawer overlayId="bots-link-limits-drawer" resizeKey="bots-link-limits"
      isOpen={open && link !== null}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={t('linkSet.title')}
      subtitle={t('linkSet.desc')}
      footer={
        <DrawerFooter
          cancelLabel={t('ui.cancel')}
          submitLabel={t('ui.save')}
          busy={patch.running}
          pending={patch.outcome === 'pending'}
          isDisabled={bad || patch.outcome === 'pending'}
          onSubmit={() => {
            setRefused(null);
            void patch
              .run({ cors, limits: { key_rpm: Number(lim.key_rpm), bot_rpm: Number(lim.bot_rpm), key_concurrency: Number(lim.key_concurrency), bot_concurrency: Number(lim.bot_concurrency) } })
              .then((r) => {
                if (r.outcome === 'done') onClose();
                else if (r.outcome === 'failed') setRefused({ code: r.code });
              });
          }}
          note={
            patch.outcome === 'pending' ? (
              <OutcomeBanner kind="pending" onCheck={() => patch.readBack()} onDismiss={() => patch.dismiss()} />
            ) : refused && patch.outcome === 'failed' ? (
              <OutcomeBanner kind="failed" error={{ outcome: 'failed', code: refused.code }} />
            ) : undefined
          }
        />
      }
    >
      <div className={s.drawerForm}>
        <SettingGroup title={t('linkSet.browser')}>
          <SettingSwitch label={t('giveLink.cors')} help={t('giveLink.corsHelp')} isSelected={cors} onChange={setCors} />
        </SettingGroup>
        {/* The limits stay text fields: what is typed is what is judged and shown, a value outside its range is named
            under its field and never changed to the nearest allowed one. */}
        <SettingGroup variant="field" title={t('linkSet.limits')}>
          {LIMITS.map((l, i) => (
            <SettingRow key={l.name} label={t(`linkSet.lim.${l.name}`)} help={t('linkSet.range', { min: l.min, max: l.max })}>
              {(ids) => (
                <TextField
                  aria-labelledby={ids.nameId}
                  aria-describedby={ids.helpId}
                  inputMode="numeric"
                  value={lim[l.name]}
                  onChange={(v) => setLim((cur) => ({ ...cur, [l.name]: v }))}
                  errorMessage={problems[i] ? t('linkSet.rangeBad', { min: l.min, max: l.max }) : undefined}
                />
              )}
            </SettingRow>
          ))}
        </SettingGroup>
        <Why question={t('linkSet.why')} faq={{ item: byId.corsLimits, label: t('limits.more') }}>
          {t('linkSet.whyText')}
        </Why>
        <SettingGroup tone="danger" title={t('linkSet.delete')}>
          <SettingRow
            label={t('linkSet.deleteGo')}
            help={t('linkSet.deleteHelp')}
            tone="danger"
            actions={
              <Button tone="danger" icon="trash" busy={remove.running} onPress={() => { if (link) setDeleting(link.id); }}>
                {t('linkSet.deleteGo')}
              </Button>
            }
          />
        </SettingGroup>
        <ConfirmDialog
          overlayId="bots-link-limits-delete"
          isOpen={open && deleting !== null}
          onOpenChange={(o) => !o && setDeleting(null)}
          title={t('linkSet.deleteTitle')}
          body={t('linkSet.deleteBody')}
          confirmLabel={t('linkSet.deleteGo')}
          tone="danger"
          busy={remove.running}
          outcome={dialogOutcome(remove)}
          onCheck={() => remove.readBack()}
          onConfirm={() => { if (deleting !== null && deleting === link?.id) void remove.run({ action: 'deleteLink' }).then((r) => r.outcome === 'done' && (setDeleting(null), onClose())); }}
        />
      </div>
    </Drawer>
  );
}

// ── Re-point ────────────────────────────────────────────────────────────────────────

export function RepointDrawer({
  open,
  onClose,
  bot,
  computers,
  repoint,
}: {
  open: boolean;
  onClose: () => void;
  bot: BotView;
  computers: readonly Computer[];
  repoint: Change<BotLink, { computerId: string }>;
}) {
  const t = useStrings(strings);
  const running = computers.filter((c) => c.state === 'running' && c.listState !== 'other_realm');
  const [picked, setTarget] = useState<string | undefined>(undefined);
  // A pick that stopped, or left this realm, since it was made is no pick: its row is gone, so it cannot be sent.
  const target = picked !== undefined && running.some((c) => c.id === picked) ? picked : undefined;
  useEffect(() => {
    if (open) setTarget(undefined);
  }, [open]);
  return (
    <Drawer overlayId="bots-link-repoint-drawer" resizeKey="bots-link-repoint"
      isOpen={open}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={t('repoint.title')}
      subtitle={t('repoint.desc', { name: bot.name })}
      footer={
        <DrawerFooter
          cancelLabel={t('ui.cancel')}
          submitLabel={t('repoint.go')}
          busy={repoint.running}
          pending={repoint.outcome === 'pending'}
          isDisabled={target === undefined || repoint.outcome === 'pending'}
          onSubmit={() => target && void repoint.run({ computerId: target }).then((r) => r.outcome === 'done' && onClose())}
          note={
            <>
              {repoint.outcome === 'pending' && <OutcomeBanner kind="pending" onCheck={() => repoint.readBack()} onDismiss={() => repoint.dismiss()} />}
              {repoint.outcome === 'failed' && <OutcomeBanner kind="failed" title={t('repoint.failed')} />}
            </>
          }
        />
      }
    >
      <div className={s.drawerForm}>
        <Verdict label={t('repoint.whatLabel')}>{t('repoint.what')}</Verdict>
        <PickerPanel
          label={t('picker.computer.label')}
          showLabel
          mode="single"
          items={running.map((c) => ({ id: c.id, label: `${c.flag} ${c.name}`.trim(), lead: <ComputerMark color={c.color} /> }))}
          value={target === undefined ? [] : [target]}
          onChange={(ids) => setTarget(ids[0])}
          emptyText={t('repoint.noComputers')}
        />
      </div>
    </Drawer>
  );
}
