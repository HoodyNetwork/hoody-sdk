// One vault entry: its facts, its metadata, its value on an explicit press only, Replace value and Delete.
//
// Layout: the object's notices (a Hoody-owned entry, a refused delete, held changes), then one section each for the
// facts, the person's metadata and the value. An entry with no encryption recorded gets a setting row under its facts
// that says so and opens Replace value with "Encrypt with a password" ticked; the value section ends in one closed Why.
//
// The value: one kit SecretField with `load`. While it is masked this
// page holds no copy of the plain value. Its eye reads the value once (data.ts readValue) into a HeldSecret bound to the
// context and shows it; its eye-off drops every held copy. Copy on the unread box reads, copies and drops in one press,
// never showing it (kit copyWhenRead: the clipboard write starts inside the press). An encrypted value asks its password;
// decrypt runs here and the plaintext is held the same way, or with "Open and copy" goes only to the clipboard; the
// password field is cleared right after, whatever happened. Every exit (eye-off, the tab going to the background, Cancel,
// closing the entry, another entry, a partition change) bumps one read generation and aborts the attempt in flight, so a
// read or decrypt that answers later keeps nothing; a realm switch and sign-out drop every held copy through core.
import {
  AnatomySection,
  Band,
  Button,
  copyWhenRead,
  ConfirmDialog,
  CopyButton,
  DetailPage,
  FaqLink,
  Facts,
  Form,
  Row,
  SecretField,
  SecretInput,
  SettingGroup,
  SettingRow,
  Stack,
  Why,
  formatBytes,
  formatDateTime,
  showToast,
  useStrings,
  type CopyAttempt,
  type Fact,
} from '@kit';
import { alive, capture, holdSecret, hostEnv, type Ctx, type HeldSecret } from '@core';
import { useEffect, useRef, useState } from 'react';
import { decrypt, VaultCryptoError } from '../crypto';
import { pageFaq } from '../faq';
import { deleteEntry, readValue, type Change, type Problem, type VaultHold } from '../data';
import { ALIAS_KEY, isHoodyKey, looksEncrypted, metadataValueText, userMetadata, type Partition, type VaultRow } from '../logic';
import strings from '../strings.en.json';
import { Holds } from './Holds';
import { changeText, problemText, rateUntil, useCountdown } from './words';

/** The context still lives and its view is still the one shown (core/secret.ts keeps a held value by the same rule). */
const inView = (ctx: Ctx): boolean => alive(ctx) && capture().vgen === ctx.vgen;

export interface EntryProps {
  row: VaultRow;
  partition: Partition;
  partitionName: string;
  seen: ReadonlySet<string>;
  /** Held changes about this entry (shown here, not above the list). */
  holds: readonly VaultHold[];
  nameOf: (partition: string) => string;
  onSeenEncrypted: (key: string) => void;
  onReplace: () => void;
  /** Replace value, opened with "Encrypt with a password" already ticked (nothing is sent by opening it). */
  onEncrypt: () => void;
  onDeleted: () => void;
}

/** A metadata value longer than this shows cut, with an ellipsis (the API allows 256 KB). */
const META_SHOWN = 500;
const cut = (s: string | null, deep: string): string => (s === null ? deep : s.length > META_SHOWN ? `${s.slice(0, META_SHOWN)}…` : s);

export function Entry({ row, partition, partitionName, seen, holds, nameOf, onSeenEncrypted, onReplace, onEncrypt, onDeleted }: EntryProps) {
  const t = useStrings(strings);
  const hoody = isHoodyKey(row.key);
  const encrypted = looksEncrypted(row, seen);
  const own = userMetadata(row.metadata);
  const others = Object.keys(own);
  const del = useDelete(row, partition, onDeleted);
  const delText = del.result ? changeText(t, del.result, del.left) : null;
  const rateOver = del.result?.outcome === 'failed' && del.result.problem.kind === 'rate' && del.left === 0;
  const hasNotice = hoody || (!!delText && !rateOver) || holds.length > 0;
  // A fact the vault did not give is left out, never drawn as a dash.
  const facts: Fact[] = [
    { label: t('fact.partition'), value: partitionName },
    { label: t('fact.lock'), value: encrypted ? t('lock.yes') : t('lock.noLong') },
    { label: t('fact.size'), value: formatBytes(row.size_bytes) },
    ...(row.updated_at ? [{ label: t('fact.updated'), value: formatDateTime(row.updated_at) }] : []),
    ...(row.created_at ? [{ label: t('fact.created'), value: formatDateTime(row.created_at) }] : []),
    { label: t('fact.metadata'), value: others.length ? t('fact.metaCount', { count: others.length }) : t('fact.none') },
  ];
  return (
    <DetailPage
      // The partition is named once, in Facts (Belongs to); Delete is in the menu, not the header.
      header={{
        title: row.key,
        actions: (
          <Row gap={2}>
            <CopyButton text={row.key} label={t('action.copyName')} />
            {!hoody && (
              <Button size="sm" icon="pen" onPress={onReplace}>
                {t('action.replace')}
              </Button>
            )}
          </Row>
        ),
      }}
      menu={[
        {
          id: 'delete',
          label: t('action.delete'),
          icon: 'trash',
          tone: 'danger',
          opens: true,
          isDisabled: del.busy || del.left > 0,
          disabledReason: del.left > 0 ? t('problem.rateButton', { seconds: del.left }) : t('notSent.busy'),
          onAction: () => del.setStep('confirm'),
        },
      ]}
      {...(hasNotice
        ? {
            notice: (
              <>
                {hoody && <Band tone="neutral">{t('detail.hoodyNote')}</Band>}
                {delText && !rateOver && <Band tone="warn" error={del.result?.outcome === 'failed' ? del.result.error : undefined} /* noDetails: only a failed delete (refused by the API, or by core before sending) carries a rejection; held and stale have none */>{delText}</Band>}
                <Holds holds={holds} nameOf={nameOf} />
              </>
            ),
          }
        : {})}
    >
      <Stack gap={5}>
        <AnatomySection id="vault-entry-facts" title={t('detail.facts')} state={{ kind: 'ready' }}>
          <Stack gap={3}>
            <Facts columns={2} items={facts} label={t('detail.facts')} />
            {!hoody && !encrypted && (
              // No encryption recorded: the way to add one sits beside the fact, not in a standing notice above the entry.
              <SettingGroup>
                <SettingRow
                  label={t('protect.label')}
                  help={t('detail.plainHint')}
                  actions={
                    <Button size="sm" onPress={onEncrypt}>
                      {t('action.encrypt')}
                    </Button>
                  }
                />
              </SettingGroup>
            )}
          </Stack>
        </AnatomySection>
        {others.length > 0 && (
          <AnatomySection id="vault-entry-metadata" title={t('detail.metadata')} state={{ kind: 'ready' }}>
            {/* The person's own details, as stored: not secret (never encrypted), shown in full up to a long cut. */}
            <Facts columns={1} items={others.map((k) => ({ label: k, value: cut(metadataValueText(own[k]), t('fact.metaTooDeep')), mono: true }))} label={t('detail.metadata')} />
          </AnatomySection>
        )}
        <AnatomySection id="vault-entry-value" title={t('value.title')} state={{ kind: 'ready' }}>
          <ValuePanel key={`${partition}\u0000${row.key}\u0000${row.updated_at ?? ''}`} partition={partition} entryKey={row.key} onSeenEncrypted={onSeenEncrypted} />
        </AnatomySection>
      </Stack>
      <DeleteConfirms row={row} partitionName={partitionName} del={del} />
    </DetailPage>
  );
}

/** A read value: its stored form, and the plaintext once an encrypted one is opened. `copy`: read for Copy, its
 *  password row offers "Open and copy" (the plaintext then goes only to the clipboard). */
type Shown = { env: HeldSecret; encrypted: boolean; ctx: Ctx; plain: HeldSecret | null; copy: boolean };

function ValuePanel({ partition, entryKey, onSeenEncrypted }: { partition: Partition; entryKey: string; onSeenEncrypted: (key: string) => void }) {
  const t = useStrings(strings);
  const { byId } = pageFaq(t);
  const [reading, setReading] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [problem, setProblem] = useState<Problem | { kind: 'empty' } | { kind: 'stale' } | null>(null);
  // The rejection behind a failed read, for the band's Details.
  const [readError, setReadError] = useState<unknown>(undefined);
  const [password, setPassword] = useState('');
  const [opening, setOpening] = useState(false);
  const [cryptoErr, setCryptoErr] = useState<string | null>(null);
  // Open pressed with no password: say so in the field and put the caret there (Open never sits disabled unexplained).
  const [needPw, setNeedPw] = useState(false);
  const pwBox = useRef<HTMLDivElement | null>(null);
  const [envShown, setEnvShown] = useState(false);
  // How the last "Open and copy" went (null: none yet, or nothing was there to copy). Keyed to its attempt so a slower
  // earlier one never overwrites a later one.
  const [rowCopy, setRowCopy] = useState<'copied' | 'refused' | null>(null);
  const rowTry = useRef(0);
  // Every held copy this panel made.
  const helds = useRef(new Set<HeldSecret>());
  // One read generation for every attempt (read, decrypt, copy), with the attempt's abort: an exit bumps and aborts,
  // whether or not anything is held yet, so an answer that comes later is dropped unseen.
  const gen = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const keep = (h: HeldSecret): HeldSecret => {
    helds.current.add(h);
    return h;
  };
  const begin = () => {
    abort.current?.abort();
    abort.current = new AbortController();
    return { mine: ++gen.current, signal: abort.current.signal };
  };
  /** Bump the generation, abort the attempt in flight and drop every held copy. */
  const fence = useRef(() => undefined as void);
  const fencing = useRef(false);
  fence.current = () => {
    gen.current++;
    abort.current?.abort();
    abort.current = null;
    if (fencing.current) return;
    fencing.current = true;
    try {
      for (const h of [...helds.current]) h.drop();
      helds.current.clear();
    } finally {
      fencing.current = false;
    }
  };
  const exit = () => {
    fence.current();
    setReading(false);
    setOpening(false);
    setShown(null);
    setEnvShown(false);
    setPassword('');
    setCryptoErr(null);
    setNeedPw(false);
    setProblem(null);
    setReadError(undefined);
  };
  const exitRef = useRef(exit);
  exitRef.current = exit;
  // Closing the entry (unmount) and the tab going to the background (owned here, not only by the field) are exits.
  useEffect(() => {
    const f = fence;
    const env = hostEnv();
    const offVis = env.onVisibilityChange(() => { if (!env.visible()) exitRef.current(); });
    return () => {
      offVis();
      f.current();
    };
  }, []);

  /** One read of the value under a fresh attempt; null when it was fenced or failed (the band says why). */
  const read = async (forCopy: boolean): Promise<{ held: HeldSecret; encrypted: boolean; ctx: Ctx; mine: number } | null> => {
    const { mine, signal } = begin();
    setReading(true);
    setProblem(null);
    setReadError(undefined);
    rowTry.current++;
    setRowCopy(null);
    try {
      const r = await readValue(partition, entryKey, signal);
      if (mine !== gen.current) {
        if (r.ok) r.held.drop();
        return null;
      }
      if (!r.ok) {
        setProblem(r.problem);
        setReadError(r.error);
        return null;
      }
      keep(r.held);
      if (r.encrypted) {
        onSeenEncrypted(entryKey);
        r.held.onDrop(() => {
          fence.current();
          // The fence moved the generation, so the attempt it cut never clears its own busy state: clear it here, or
          // the next read's Open stays "Opening…".
          setOpening(false);
          setReading(false);
          setShown((s) => (s && s.env === r.held ? null : s));
        });
        // A drop between the read's hold and here ran that listener at once: the value is gone, so no password row.
        if (r.held.dropped) return null;
        setShown({ env: r.held, encrypted: true, ctx: r.ctx, plain: null, copy: forCopy });
      }
      return { held: r.held, encrypted: r.encrypted, ctx: r.ctx, mine };
    } finally {
      if (mine === gen.current) setReading(false);
    }
  };

  const show = async () => {
    const r = await read(false);
    if (!r || r.encrypted) return;
    r.held.onDrop(() => setShown((s) => (s && s.env === r.held ? null : s)));
    setShown({ env: r.held, encrypted: false, ctx: r.ctx, plain: null, copy: false });
  };

  // Copy on the unread box: read, copy, drop. An encrypted value opens the password row with "Open and copy" instead.
  // The handoff checks again, in the step that gives the text to the clipboard, that the read's attempt is still the
  // panel's (an exit, an unmount or a newer press moves the generation) and its context still in view: any of them after
  // the read answered keeps the text off.
  const copy = () => {
    let ctx: Ctx | null = null;
    let mine = -1;
    return copyWhenRead(async () => {
      const r = await read(true);
      if (!r || r.encrypted) return null;
      ctx = r.ctx;
      mine = r.mine; // the read's own attempt
      const v = r.held.reveal(r.ctx);
      r.held.drop();
      helds.current.delete(r.held);
      return v;
    }, () => ctx !== null && mine === gen.current && inView(ctx));
  };

  /** The plaintext of the encrypted value with the typed password, or null (fenced, wrong password: the row says so). */
  const decryptNow = async (s: Shown, pw: string): Promise<string | null> => {
    const { mine } = begin();
    setOpening(true);
    setCryptoErr(null);
    try {
      const env = s.env.reveal(s.ctx);
      if (env === null) {
        setShown(null);
        return null;
      }
      const text = await decrypt(env, pw);
      // The plaintext leaves only for the same attempt, while its envelope is still held and its context still lives: a
      // sign-out or realm switch that drops the envelope mid-decrypt keeps it off the screen and off the clipboard.
      return mine === gen.current && !s.env.dropped && alive(s.ctx) ? text : null;
    } catch (e) {
      if (mine === gen.current) setCryptoErr(t(`crypto.${e instanceof VaultCryptoError ? e.kind : 'unavailable'}`));
      return null;
    } finally {
      if (mine === gen.current) setOpening(false);
    }
  };

  /** The password, taken and cleared; null (and the field says so) when none was typed. */
  const takePassword = (): string | null => {
    if (!password) {
      setCryptoErr(null);
      setNeedPw(true);
      pwBox.current?.querySelector('input')?.focus();
      return null;
    }
    const pw = password;
    setPassword('');
    return pw;
  };

  const open = async () => {
    if (!shown) return;
    const pw = takePassword();
    if (pw === null) return;
    const s = shown;
    const text = await decryptNow(s, pw);
    // Checked again here: a drop, a context end or a view change since decryptNow's own check makes no new hold of the
    // plaintext.
    if (text === null || s.env.dropped || !inView(s.ctx)) return;
    const plain = holdSecret(text, s.ctx);
    if (!plain) {
      setShown(null);
      return;
    }
    keep(plain);
    setShown((cur) => (cur && cur.env === s.env ? { ...cur, plain } : cur));
  };

  // "Open and copy": the clipboard write starts inside this press; the plaintext goes only to the clipboard, then every
  // held copy is dropped and the field is back to unread, showing how the copy went.
  const openAndCopy = () => {
    if (!shown) return;
    const pw = takePassword();
    if (pw === null) return;
    const s = shown;
    const mine = ++rowTry.current;
    setRowCopy(null);
    void copyWhenRead(
      async () => {
        const text = await decryptNow(s, pw);
        return text === null || s.env.dropped ? null : text;
      },
      // The handoff, in the step that gives the text to the clipboard: a drop, a context end or a view change at any point
      // before it keeps the plaintext off. Every held copy is dropped there either way (the exit), after the check.
      () => {
        const ok = !s.env.dropped && inView(s.ctx);
        exitRef.current();
        return ok;
      },
    ).then((a: CopyAttempt) => {
      if (mine === rowTry.current) setRowCopy(a.wrote ? 'copied' : a.reason === 'refused' ? 'refused' : null);
    });
  };

  const plainHeld = shown ? (shown.encrypted ? shown.plain : shown.env) : null;
  // The password row: an encrypted value read and not opened yet. The field's eye and Copy wait while it is open.
  const rowOpen = !!shown && shown.encrypted && !shown.plain;
  return (
    <Stack gap={3}>
      {problem && problem.kind !== 'empty' && <Band tone="warn" error={readError}>{problem.kind === 'forbidden' ? t('problem.forbiddenRead') : problemText(t, problem)}</Band>}
      <SecretField
        label={t('value.field')}
        held={plainHeld}
        ctx={shown?.ctx}
        once={false}
        description={t('value.desc')}
        format="text"
        json
        dropOnHide
        emptyText={problem?.kind === 'empty' ? t('value.empty') : undefined}
        onRead={() => void show()}
        onReadCopy={copy}
        isReading={reading}
        isReadDisabled={rowOpen}
        showLabel={t('value.showEye')}
        hideLabel={t('value.hideEye')}
        copyLabel={t('value.copy')}
        readingLabel={t('value.showing')}
        onWipe={exit}
      />
      {rowCopy && (
        <Band tone={rowCopy === 'copied' ? 'neutral' : 'warn'} /* noDetails: a clipboard refusal is the browser's answer, with no error object */>{rowCopy === 'copied' ? t('value.openCopied') : t('value.openCopyRefused')}</Band>
      )}
      {rowOpen && (
        <Stack gap={2}>
          <div ref={pwBox}>
            {/* A form: Enter opens, as the button does, and the field is locked while the open is out. */}
            <Form layout="bare" busy={opening} onSubmit={shown.copy ? openAndCopy : () => void open()}>
            <SecretInput
              focusOnError
              label={t('value.password')}
              description={t('value.encryptedNote')}
              value={password}
              onChange={(v) => {
                setPassword(v);
                setNeedPw(false);
              }}
              errorMessage={cryptoErr ?? (needPw ? t('value.passwordFirst') : undefined)}
              reveal={false}
            />
            </Form>
          </div>
          <Row gap={2}>
            {/* Read for Copy: the row's button opens and copies, never showing it. */}
            <Button variant="primary" icon={shown.copy ? 'copy' : undefined} onPress={shown.copy ? openAndCopy : () => void open()} isDisabled={opening}>
              {opening ? t('value.opening') : shown.copy ? t('value.openCopy') : t('value.open')}
            </Button>
            <Button chip={false} onPress={exit}>
              {t('value.cancel')}
            </Button>
          </Row>
        </Stack>
      )}
      {shown?.encrypted && (
        // The field's own Show reads it in: one press shows the encrypted form; its Copy copies it without showing it.
        <SecretField
          label={t('value.envelope')}
          held={envShown ? shown.env : null}
          ctx={shown.ctx}
          once={false}
          description={t('value.envelopeDesc')}
          format="text"
          onRead={() => setEnvShown(true)}
          onReadCopy={() => {
            const at = shown;
            // An exit drops the envelope: a Copy pressed after it copies nothing (as the open-and-copy path).
            return copyWhenRead(
              async () => (at.env.dropped ? null : at.env.reveal(at.ctx)),
              () => !at.env.dropped && inView(at.ctx),
            );
          }}
          showLabel={t('value.copyEnvelope')}
        />
      )}
      <Why question={t('value.why.q')} faq={{ item: byId.showValue, label: t('value.more') }}>
        {t('value.why.a')}
        <FaqLink item={byId.encrypt}>{t('value.encryptedMore')}</FaqLink>
      </Why>
    </Stack>
  );
}

/** Delete…: one confirm naming the entry and its partition; a hoody.* entry asks a second time, saying what breaks. */
function useDelete(row: VaultRow, partition: Partition, onDeleted: () => void) {
  const t = useStrings(strings);
  const [step, setStep] = useState<'none' | 'confirm' | 'hoody'>('none');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Change | null>(null);
  const [until, setUntil] = useState<number | null>(null);
  const left = useCountdown(until);
  const run = async () => {
    setBusy(true);
    try {
      const c = await deleteEntry(partition, row.key);
      setStep('none');
      setResult(c);
      setUntil(rateUntil(c));
      if (c.outcome === 'done') {
        showToast({ tone: 'ok', title: t('done.deleted') });
        onDeleted();
      }
    } finally {
      setBusy(false);
    }
  };
  return { step, setStep, busy, result, left, run };
}

function DeleteConfirms({ row, partitionName, del }: { row: VaultRow; partitionName: string; del: ReturnType<typeof useDelete> }) {
  const t = useStrings(strings);
  const hoody = isHoodyKey(row.key);
  const close = (o: boolean) => {
    if (!o) del.setStep('none');
  };
  return (
    <>
      <ConfirmDialog
        overlayId="vault-delete"
        isOpen={del.step === 'confirm'}
        onOpenChange={close}
        tone="danger"
        title={t('delete.title', { key: row.key })}
        body={t('delete.body', { key: row.key, partition: partitionName })}
        confirmLabel={t('delete.confirm')}
        busy={del.busy}
        onConfirm={() => (hoody ? del.setStep('hoody') : void del.run())}
      />
      <ConfirmDialog
        overlayId="vault-delete-hoody"
        isOpen={del.step === 'hoody'}
        onOpenChange={close}
        tone="danger"
        title={t('delete.hoodyTitle')}
        body={row.key === ALIAS_KEY ? t('delete.aliasBody') : t('delete.hoodyBody', { key: row.key })}
        confirmLabel={t('delete.hoodyConfirm')}
        busy={del.busy}
        onConfirm={() => void del.run()}
      />
    </>
  );
}
