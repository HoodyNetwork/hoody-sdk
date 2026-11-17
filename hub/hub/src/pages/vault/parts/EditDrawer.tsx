// New entry and Replace value, in a drawer. The value and passwords are never prefilled: Replace starts empty and
// never shows the old value (only the metadata field, when asked for, starts from the entry's metadata). The value and the passwords live only in this drawer's state; the passwords are cleared after every
// press, the value once it was sent; closing the drawer drops all of it. A Retry-After wait locks the form.
//
// One press sends at most once: a synchronous guard stops a second pipeline, data.ts savePut checks the
// partition, reads the list fresh and encrypts before its one run. A pending answer locks the form; Check
// again reads the vault for this write's id (the hold banner on the page offers the same, and the warned
// Dismiss). Once the drawer closes, that banner is the one place the hold shows: no kit leave-toast.
//
// Metadata (the person's own JSON object; the Hub keeps `encrypted` and `write_id` itself): New may set it; Replace
// keeps the entry's current metadata unless "Change metadata" is ticked, which opens it as JSON to edit or empty.
// The tick waits for the list (unknown metadata is never shown as none, which would clear it on save). Metadata too
// deep to write out here cannot be shown or sent: ticking opens an empty field that replaces it (empty removes it),
// said in the field's description; with the box off such a save is refused, nothing sent.
// All of it sits in a closed "Optional metadata" fold: metadata is rare and not encrypted. It is open by default only
// on Replace when the entry already has metadata. A press blocked by the metadata (a field error, or a refusal before sending:
// too large, too deep) opens it, so the field to fix is in view; closed with "Change metadata" ticked, its line says the save
// replaces or removes the entry's metadata.
//
// Layout: at most one Band (a refusal and a held save never show together), the fields, the fold, then one closed Why
// that holds the three questions the form raises (what a value takes, encrypting, metadata), each ending in its answer.
import { Band, Checkbox, Disclosure, Drawer, FaqLink, Form, FormFooter, SecretInput, Stack, TextField, Why, showToast, useStrings } from '@kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { canEncrypt } from '../crypto';
import { pageFaq } from '../faq';
import { checkHold, currentEpoch, moveEpoch, savePut, useVaultHolds, type Change, type CheckResult } from '../data';
import { keyProblem, metadataText, parseMetadata, type Partition } from '../logic';
import strings from '../strings.en.json';
import { changeText, rateUntil, useCountdown } from './words';

export interface EditDrawerProps {
  partition: Partition;
  partitionName: string;
  /** Replace: the entry's name. Absent: New. */
  entryKey?: string;
  /** Replace: the entry's metadata as listed, to start the metadata field from; undefined while the list loads. */
  metadata?: Readonly<Record<string, unknown>> | null;
  /** Replace: start with "Encrypt with a password" ticked (opened from an entry's Encrypt… row). Only the box's first
   *  state: the person may untick it, and the save reads the box as it stands at the press. */
  encryptFirst?: boolean;
  onClose: () => void;
  onSaved: (key: string) => void;
}

export function EditDrawer({ partition, partitionName, entryKey, metadata, encryptFirst = false, onClose, onSaved }: EditDrawerProps) {
  const t = useStrings(strings);
  const { byId } = pageFaq(t);
  const isNew = entryKey === undefined;
  // The epoch this form works under: a partition change, a realm switch or a close moves it (data.ts).
  const [epoch] = useState(() => currentEpoch());
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [encrypt, setEncrypt] = useState(encryptFirst);
  // A browser that cannot encrypt here (no secure context) says so on the box, briefly (the form's explanation budget),
  // before any password is typed; an entry already encrypted keeps its box (turning it off is still the person's choice).
  const [cryptoOk] = useState(canEncrypt);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  // Replace: whether this save sets the metadata (else the entry's current metadata is kept). New always may.
  const [changeMeta, setChangeMeta] = useState(false);
  const [meta, setMeta] = useState('');
  const [tried, setTried] = useState(false);
  // Why the last press refused the passwords: the fields are empty again by then, so the reason is kept apart.
  const [pwRefused, setPwRefused] = useState<'required' | 'mismatch' | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Change | null>(null);
  const [settled, setSettled] = useState(false);
  // The held save whose hold went elsewhere (proved or stopped there; the drawer cannot tell which): nothing is held
  // for it and nothing here proved it, so the form opens again without calling it saved. Kept per result: a later
  // save of this drawer whose answer is lost is held and shown as held.
  const [freed, setFreed] = useState<Change | null>(null);
  // What the last Check again found when it proved nothing: said here in the same words as the page banner.
  const [checkNote, setCheckNote] = useState<CheckResult | null>(null);
  // The name this drawer saved: from then on it holds nothing to discard and takes no more input or presses (the
  // form locks). onSaved runs after that render, so the drawer's leave guard is gone before the page closes it (the
  // close may step back in history, which lands later).
  const [saved, setSaved] = useState<string | null>(null);
  const [until, setUntil] = useState<number | null>(null);
  const left = useCountdown(until);
  const sending = useRef(false);
  const holds = useVaultHolds();

  const key = entryKey ?? name;
  const nameErr = isNew && (tried || name) ? keyProblem(name) : null;
  const valueErr = tried && !value ? t('value.required') : undefined;
  const pwErr = encrypt && pwRefused === 'required' && !password ? t('password.required') : undefined;
  const repeatErr = encrypt && pwRefused === 'mismatch' && !password && !repeat ? t('password.mismatch') : undefined;
  // Replace: the metadata field's starting text; undefined while unknown, null when it cannot be edited here.
  const metaStart = useMemo(() => (isNew || metadata === undefined ? undefined : metadataText(metadata)), [isNew, metadata]);
  const setsMeta = isNew || changeMeta;
  const metaParsed = parseMetadata(meta);
  const metaErr = setsMeta && (tried || meta) && !metaParsed.ok ? t(`meta.${metaParsed.why}`) : undefined;
  // The Advanced fold: the person's own choice once they open or close it (a press blocked by the metadata opens it, as if
  // chosen); before that, open only when Replace shows an entry that has metadata (null: too deep to show here, still metadata).
  // Unknown (the list loading) stays closed until it is known.
  const [advChosen, setAdvChosen] = useState<boolean | null>(null);
  const hasMeta = !isNew && metaStart !== undefined && metaStart !== '';
  const advOpen = advChosen ?? hasMeta;
  const advLine = !isNew && changeMeta ? t(metaParsed.ok && metaParsed.value === null ? 'edit.advancedRemoves' : 'edit.advancedReplaces') : t('edit.advancedDesc');
  const pending = result?.outcome === 'pending' && !settled && freed !== result;
  const dirty = saved === null && !!(name || value || password || repeat || (setsMeta && meta) || changeMeta);

  const submit = async () => {
    // Every press clears both password fields, whatever happens next, a refused press included; the checks
    // read the snapshot.
    const pw = encrypt ? password : '';
    const again = encrypt ? repeat : '';
    setPassword('');
    setRepeat('');
    if (sending.current || pending || left > 0) return;
    setTried(true);
    const pwProblem = !encrypt ? null : !pw ? 'required' : pw !== again ? 'mismatch' : null;
    setPwRefused(pwProblem);
    if (setsMeta && !metaParsed.ok) setAdvChosen(true);
    if ((isNew && keyProblem(name)) || !value || pwProblem || (setsMeta && !metaParsed.ok)) return;
    const metaOut = setsMeta && metaParsed.ok ? { metadata: metaParsed.value } : {};
    sending.current = true;
    setBusy(true);
    try {
      const c = await savePut({ partition, key, mode: isNew ? 'new' : 'replace', value, password: pw, epoch, ...metaOut });
      setResult(c);
      setUntil(rateUntil(c));
      if (c.outcome === 'not_sent' && (c.why === 'metadata' || c.why === 'unwritable' || c.why === 'unwritableOwn')) setAdvChosen(true);
      if (c.outcome === 'done' || c.outcome === 'pending') {
        // Sent: the field is empty because the value left, not because the person forgot it.
        setValue('');
        setTried(false);
      }
      if (c.outcome === 'done') {
        showToast({ tone: 'ok', title: t('done.saved') });
        setSaved(key);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  // Check again: only for this press's own hold (its token), by a fresh read of this partition.
  const check = async () => {
    if (result?.outcome !== 'pending' || !result.hold) return false;
    const h = holds.find((x) => x.change.hold === result.hold);
    if (!h) {
      // Freed already (Check or Dismiss on the page's banner): nothing is held for this press, and nothing is proved.
      setFreed(result);
      return true;
    }
    setCheckNote(null);
    const r = await checkHold(h);
    setCheckNote(r === 'applied' ? null : r);
    if (r === 'applied') {
      setSettled(true);
      setSaved(key);
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (saved !== null) onSaved(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per save, whatever the parent passes later
  }, [saved]);

  const close = () => {
    moveEpoch();
    setValue('');
    setPassword('');
    setRepeat('');
    onClose();
  };
  const text = result ? changeText(t, result, left) : null;
  const rateOver = result?.outcome === 'failed' && result.problem.kind === 'rate' && left === 0;
  const outcome = settled ? 'done' : pending ? 'pending' : undefined;
  // A held save says what happened and why the value field is empty (it was sent, then dropped here). Once its
  // hold was freed elsewhere (checked or dismissed on the page), Check again reads nothing, so it is not promised.
  const heldNow = !!result && result.outcome === 'pending' && !!result.hold && holds.some((h) => h.change.hold === result.hold);
  const checkText = heldNow && checkNote === 'unproven' ? t('hold.unproven') : heldNow && checkNote === 'unread' ? t('hold.unread') : null;
  // One fact per line (what may have happened, what we know, why the field is empty, the check), never joined.
  const pendingLines = pending
    ? [t('hold.title.put', { key, partition: partitionName }), heldNow ? t('hold.bodyPut') : t('edit.freedElsewhere'), t('edit.sentCleared'), checkText].filter(
        (l): l is string => !!l,
      )
    : null;
  // A refusal's one line, or the held save's lines: changeText is null for a pending change, so only one of them shows.
  const refusal = text && !rateOver ? text : null;
  return (
    <Drawer overlayId="vault-edit" resizeKey="vault-edit-drawer"
      isOpen
      onOpenChange={(o) => (o ? undefined : close())}
      title={isNew ? t('edit.newTitle') : t('edit.replaceTitle')}
      subtitle={isNew ? partitionName : `${entryKey} · ${partitionName}`}
      size="sm"
      dirty={dirty && !pending}
      busy={busy}
      footer={
        <FormFooter
          dirty={dirty || pending}
          busy={busy}
          outcome={outcome}
          onCheck={check}
          toastOnLeave={false}
          onSubmit={() => void submit()}
          submitDisabled={left > 0}
          submitLabel={left > 0 ? t('problem.rateButton', { seconds: left }) : busy ? t('edit.saving') : t('edit.save')}
        />
      }
    >
      <Form onSubmit={() => void submit()} busy={busy} outcome={outcome} onCheck={check} locked={left > 0 || saved !== null}>
        <Stack gap={3}>
          {(pendingLines || refusal) && (
            <Band tone="warn">
              {pendingLines ? (
                <Stack gap={1}>
                  {pendingLines.map((l, i) => (i === 0 ? <strong key={i}>{l}</strong> : <span key={i}>{l}</span>))}
                </Stack>
              ) : (
                refusal
              )}
            </Band>
          )}
          {isNew && (
            <TextField
              label={t('edit.name')}
              description={t('edit.nameDesc')}
              value={name}
              onChange={setName}
              errorMessage={nameErr ? t(`name.${nameErr}`) : undefined}
              mono
              reserveError
            />
          )}
          <SecretInput
            label={t('edit.value')}
            description={t('edit.valueDesc')}
            // Replace: what happens to the old value, said on the field that replaces it.
            {...(isNew ? {} : { promises: [t('edit.promiseReplaces'), t('edit.promiseOldHidden')] })}
            value={value}
            onChange={setValue}
            errorMessage={valueErr}
            resetKey={partition}
            multiline
            rows={3}
          />
          <Checkbox
            isSelected={encrypt}
            onChange={(on) => {
              setEncrypt(on);
              if (!on) {
                setPassword('');
                setRepeat('');
                setPwRefused(null);
              }
            }}
            label={t('edit.encrypt')} description={cryptoOk ? t('edit.encryptDesc') : t('edit.encryptNoCrypto')}
            isDisabled={!cryptoOk && !encrypt} />
          {encrypt && (
            <>
              <SecretInput label={t('edit.password')} value={password} onChange={setPassword} errorMessage={pwErr} resetKey={partition} />
              <SecretInput label={t('edit.repeat')} value={repeat} onChange={setRepeat} errorMessage={repeatErr} resetKey={partition} />
            </>
          )}
          <Disclosure title={t('edit.advanced')} description={advLine} isExpanded={advOpen} onExpandedChange={setAdvChosen}>
            <Stack gap={3}>
              {!isNew && (
                <Checkbox
                  isSelected={changeMeta}
                  isDisabled={!changeMeta && metaStart === undefined}
                  onChange={(on) => {
                    if (on && metaStart === undefined) return;
                    setChangeMeta(on);
                    setMeta(on ? (metaStart ?? '') : '');
                  }}
                  label={t('edit.changeMeta')}
                  description={metaStart === null ? t('edit.metaTooDeep') : metaStart === undefined ? t('edit.metaLoading') : t('edit.changeMetaDesc')}
                />
              )}
              {setsMeta && (
                <TextField
                  label={t('edit.meta')}
                  description={isNew ? t('edit.metaDescNew') : metaStart === null ? t('edit.metaUnshownDesc') : t('edit.metaDesc')}
                  value={meta}
                  onChange={setMeta}
                  errorMessage={metaErr}
                  multiline
                  rows={5}
                  mono
                  autoComplete="off"
                  spellCheck="false"
                />
              )}
            </Stack>
          </Disclosure>
          {/* The links follow the answer's order (value, encrypting, metadata): Why draws its faq link last. */}
          <Why question={t('edit.why.q')} faq={{ item: byId.metadata, label: t('edit.metaMore') }}>
            {t('edit.why.a')}
            <FaqLink item={byId.valueInput}>{t('edit.valueMore')}</FaqLink>
            <FaqLink item={byId.encrypt}>{t('edit.encryptMore')}</FaqLink>
          </Why>
        </Stack>
      </Form>
    </Drawer>
  );
}
