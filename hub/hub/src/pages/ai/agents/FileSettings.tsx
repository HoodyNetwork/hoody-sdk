// The settings an agent keeps only in its file (frontmatter.ts), each on its own row of one group: its value, whether
// it comes from the file or is the default, and an Edit that opens the row's editor in place. The Hub checks the typed
// value before anything is sent; a save writes the whole file with that one line changed, checked against the revision
// the file was read at (source.ts), sent once.
//   - conflict: the file changed since it was read. Nothing was written; the rows then show the file as it is now.
//   - a lost answer may have saved: nothing is sent again, every row waits, and Check again reads the file back. Only a
//     file that holds the sent text settles it. Stop tracking (asked first) sends nothing and shows the file as last read.
//   - While the host's file editor holds a draft or an unconfirmed save (`blocked`), no row offers Edit; while a row holds
//     a typed value or a save out or unconfirmed, the host locks the file editor: one writer of the file at a time.
//   - A save out or of unknown outcome outlives the rows: its attempt is kept per agent and place (account, project,
//     computer, realm) for the page's life, so leaving the agent and coming back still shows it, and the rows and the
//     file editor keep waiting until it is proved or the person stops tracking it. Its answer is told only to the rows
//     on screen then; a page left meanwhile is never touched.
import { capture, useCurrentComputer } from '@core';
import { Band, ConfirmDialog, Select, SettingGroup, SettingRow, SubSection, Tag, TextButton, TextField, useStrings, type OutcomeLike, type SectionState } from '@kit';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  COMPACTION_MAX, COMPACTION_MIN, FILE_KEYS, MAX_STEPS_LIMIT, REPLY_JSON, TEMPERATURE_MAX, checkInput, fileValues, writeKey,
  type FileKey, type FileValue, type InputProblem,
} from './frontmatter';
import { createSourceStore, type SourceStore } from './source';
import { agentSourceApi, type SourceApi } from './sourceApi';
import strings from './FileSettings.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;

export interface AgentFileSettingsProps {
  /** The agent's name (its file's stem). */
  name: string;
  /** Hoody owns the agent's file: the rows are read-only. */
  productOwned: boolean;
  /** Another editor of this file on the page holds a draft or an unconfirmed save: no row offers Edit. */
  blocked?: boolean;
  /** A setting was saved: the host reads again whatever shows the file. */
  onSaved?: () => void;
  /** Told whenever the rows hold something another writer of the file must not write over: a row's typed value, or a
   *  save running or of unknown outcome (the host's other writers of the file wait); false when it closes. */
  onHeldChange?: (held: boolean) => void;
  /** Requests; tests give their own. */
  api?: Pick<SourceApi, 'get' | 'put'>;
  /** The realm the file is read and written in (default: the context's). Under All realms the page names the computer's own
   *  (aiRealm.ts): the context's is then 'all', which these one-realm calls refuse unsent. */
  realm?: string;
}

const READY: SectionState = { kind: 'ready' };

/** The outcome of the last save, on the row it was made from. */
type Said = { key: FileKey; out: OutcomeLike; detail: string };

/** One agent's row saves in one place: the store that sends and checks them, the row the save out or unsure was made from,
 *  and the rows on screen now (null while none are), which alone hear a save's answer. */
interface Attempt { store: SourceStore; row: FileKey | null; host: { said(s: Said): void; saved(): void } | null }
const attempts = new Map<string, Attempt>();
/** Tests: forgets every kept attempt. */
export function resetFileSettingAttempts(): void { attempts.clear(); }
const holds = (s: SourceStore): boolean => { const p = s.view().save; return p === 'saving' || p === 'unsure'; };

const BOUNDS: Record<FileKey, { min: string; max: string; example: string }> = {
  temperature: { min: '0', max: String(TEMPERATURE_MAX), example: '0.7' },
  response_format: { min: '', max: '', example: '' },
  max_steps_per_turn: { min: '1', max: MAX_STEPS_LIMIT.toLocaleString('en'), example: '50' },
  compaction_max_tokens: { min: COMPACTION_MIN.toLocaleString('en'), max: COMPACTION_MAX.toLocaleString('en'), example: '131072' },
  ask_timeout: { min: '', max: '', example: '' },
};

function problemWords(t: T, key: FileKey, why: InputProblem): string {
  switch (why) {
    case 'notNumber':
      return t('bad.notNumber', { example: BOUNDS[key].example });
    case 'notWhole':
      return t('bad.notWhole');
    case 'tooLow':
      return t('bad.tooLow', { min: key === 'ask_timeout' ? t('ask_timeout.min') : BOUNDS[key].min });
    case 'tooHigh':
      return t('bad.tooHigh', { max: key === 'ask_timeout' ? t('ask_timeout.max') : BOUNDS[key].max });
    case 'notDuration':
      return t('bad.notDuration');
    case 'notChoice':
      return t('bad.notChoice');
  }
}

function stateWord(t: T, v: FileValue): string {
  switch (v.state) {
    case 'default':
      return t('state.default');
    case 'set':
      return t('state.set');
    case 'ignored':
      return t('state.ignored');
    case 'twice':
      return t('state.twice');
  }
}

export function AgentFileSettings({ name, productOwned, blocked = false, onSaved, onHeldChange, api: given, realm }: AgentFileSettingsProps) {
  const t = useStrings(strings);
  const computer = useCurrentComputer();
  // The place the rows opened in. With no computer there is no place to keep an attempt for: the rows keep their own.
  const [scope] = useState(() => {
    const c = capture(computer);
    const p = c.target?.project?.id, k = c.target?.container?.id, r = realm ?? c.realm;
    return p && k && r ? [c.account ?? '', p, k, r, name].join('\u0000') : null;
  });
  const api = useMemo(() => given ?? agentSourceApi(name, realm ? { realm } : {}), [given, name, realm]);
  const attempt = useMemo<Attempt>(() => {
    const own = (): Attempt => ({ store: createSourceStore({ api }), row: null, host: null });
    // Requests a test gives belong to that test's rows alone.
    if (scope === null || given) return own();
    let a = attempts.get(scope);
    if (!a) { a = own(); attempts.set(scope, a); }
    return a;
  }, [api, scope, given]);
  const store = attempt.store;
  const view = useSyncExternalStore(store.subscribe, store.view, store.view);
  useEffect(() => {
    // A kept save out or of unknown outcome stays as it is (its answer still lands in the store); anything else is read fresh.
    if (!holds(store)) store.reset();
    void store.load();
    return () => { if (!holds(store)) store.reset(); };
  }, [store]);

  const [said, setSaid] = useState<Said | null>(null);
  const savedCb = useRef(onSaved);
  savedCb.current = onSaved;
  useEffect(() => {
    const host = { said: setSaid, saved: () => savedCb.current?.() };
    attempt.host = host;
    return () => { if (attempt.host === host) attempt.host = null; };
  }, [attempt]);
  // What each open editor holds (a key with no entry shows the file's value).
  const [drafts, setDrafts] = useState<Partial<Record<FileKey, string>>>({});
  const setDraft = (key: FileKey, text: string | null) => setDrafts((d) => { const n = { ...d }; if (text === null) delete n[key]; else n[key] = text; return n; });
  const [stopAsk, setStopAsk] = useState(false);
  // The row whose editor sent the running save: it keeps its editor until the save has settled and the editor closed.
  const [busyKey, setBusyKey] = useState<FileKey | null>(null);

  const held = view.save === 'saving' || view.save === 'unsure';
  // A typed value counts too: the file editor writing the file meanwhile would close the row and drop it.
  const holding = held || Object.keys(drafts).length > 0;
  const heldCb = useRef(onHeldChange);
  heldCb.current = onHeldChange;
  useEffect(() => { heldCb.current?.(holding); }, [holding]);
  useEffect(() => () => heldCb.current?.(false), []);

  const read = useMemo(() => (view.base === null ? null : fileValues(view.base)), [view.base]);

  const save = async (key: FileKey): Promise<void> => {
    const text = drafts[key];
    setDraft(key, null);
    // Only what the person typed or chose is saved: an editor opened and left as it was changes nothing.
    if (text === undefined) return;
    const checked = checkInput(key, text);
    const v = store.view();
    if (!checked.ok || v.base === null || v.save !== 'idle' && v.save !== 'saved' && v.save !== 'refused' || v.stale || blocked || productOwned) return;
    const next = writeKey(v.base, key, checked.value);
    if (!next.ok) { setSaid({ key, out: { kind: 'failed' }, detail: t('cannot') }); return; }
    if (next.content === v.base) return;
    setSaid(null);
    setBusyKey(key);
    attempt.row = key;
    store.setDraft(next.content);
    await store.save();
    const now = store.view();
    // An unsure save keeps its row; any other answer ends the attempt.
    if (now.save !== 'unsure') attempt.row = null;
    if (now.save === 'saved') {
      attempt.host?.said({ key, out: { kind: 'done' }, detail: t('saved') });
      attempt.host?.saved();
    } else if (now.save === 'conflict') {
      // Nothing was written. Their file replaces what the rows show (the draft was this one line).
      await store.reload();
      const after = store.view();
      attempt.host?.said({ key, out: { kind: 'failed' }, detail: after.save === 'conflict' || after.stale ? t('conflict.unread') : t('conflict') });
    } else if (now.save === 'refused') {
      const r = now.refusal;
      if (now.base !== null) store.setDraft(now.base);
      attempt.host?.said({ key, out: { kind: r?.unsent ? 'not_sent' : 'failed' }, detail: r?.unsent ? t('refused.unsent') : t('refused', { code: r?.code || String(r?.status ?? 0) }) });
    } else if (now.save !== 'unsure' && now.base !== null && now.dirty) {
      // Never sent (the page moved under the call): the line edit is dropped.
      store.setDraft(now.base);
      attempt.host?.said({ key, out: { kind: 'not_sent' }, detail: t('refused.unsent') });
    }
  };

  const check = async (): Promise<boolean> => {
    await store.check();
    const now = store.view();
    if (now.save !== 'saved') return false;
    const key = attempt.row;
    attempt.row = null;
    if (key) attempt.host?.said({ key, out: { kind: 'done' }, detail: t('saved') });
    attempt.host?.saved();
    return true;
  };

  const stop = () => {
    setStopAsk(false);
    store.abandon();
    const now = store.view();
    if (now.save !== 'unsure') attempt.row = null;
    // The one-line edit is dropped: the rows show the file as last read.
    if (now.save === 'idle' && now.base !== null && now.dirty) store.setDraft(now.base);
  };

  if (view.load === 'gone') return <Band size="table" /* noDetails: the agent is no longer listed; nothing failed */>{t('gone')}</Band>;
  // The read's states are the kit's (a skeleton while it reads, its error with Try again when it failed).
  const state: SectionState | undefined =
    view.load === 'failed' ? { kind: 'failed', error: view.loadError, onRetry: () => void store.load(), busy: view.reading } : !read ? { kind: 'loading', rows: FILE_KEYS.length } : undefined;
  if (state || !read) return <SubSection title={t('title')} state={state} />;
  if (!read.ok) return <SubSection title={t('title')} state={READY}><Band size="table" /* noDetails: the file was read; it has no settings block */>{t('noBlock')}</Band></SubSection>;

  const unsure = view.save === 'unsure';
  const seen = view.checked === 'same' ? t('unsure.same') : view.checked === 'changed' ? t('unsure.changed') : view.checked === 'failed' ? t('unsure.failed') : view.checked === 'gone' ? t('unsure.gone') : null;
  // The rows may be behind the file (a conflict whose re-read failed): no edit until Reload has read it.
  const behind = view.stale || view.save === 'conflict';
  const canEdit = !productOwned && !blocked && !held && !view.reading && !behind;
  const note = productOwned ? t('owned') : blocked ? t('blocked') : view.path === null ? t('newCopy') : null;

  return (
    <SubSection title={t('title')} state={READY}>
      {behind ? (
        <Band tone="warn" size="table" /* noDetails: nothing was written; the file only has to be read again */ actions={<TextButton onPress={() => void store.reload()} isDisabled={view.reading}>{t('reload')}</TextButton>}>{t('conflict.unread')}</Band>
      ) : note ? (
        <Band size="table" /* noDetails: a note on what can be edited here, nothing failed */>{note}</Band>
      ) : null}
      <SettingGroup label={t('group', { name })}>
        {FILE_KEYS.map((key) => {
          const v = read.values[key];
          const was = v.state === 'set' ? v.raw : '';
          const typed = drafts[key];
          const checked = checkInput(key, typed ?? was);
          const next = typed !== undefined && checked.ok && view.base !== null ? writeKey(view.base, key, checked.value) : null;
          const changed = !!next && next.ok && next.content !== view.base;
          const mine = unsure && attempt.row === key;
          const outcome: OutcomeLike | undefined = mine ? { kind: 'pending' } : said?.key === key ? said.out : undefined;
          const detail = mine ? `${t('unsure')}${seen ? ` ${seen}` : ''}` : said?.key === key ? said.detail : undefined;
          // The value the agent uses: the file's when it can use it, else the default (a key listed twice shows none).
          const value =
            v.state === 'twice' ? null
            : v.state !== 'set' ? t(`${key}.default`)
            : key === 'response_format' ? t('response_format.json')
            : key === 'temperature' ? Number(v.raw)
            : key === 'max_steps_per_turn' ? t('max_steps_per_turn.value', { n: Number(v.raw).toLocaleString('en'), count: Number(v.raw) })
            : key === 'compaction_max_tokens' ? t('compaction_max_tokens.value', { n: Number(v.raw).toLocaleString('en') })
            : t('ask_timeout.value', { time: v.raw });
          const odd = v.state === 'ignored' || v.state === 'twice';
          return (
            <SettingRow
              key={key}
              label={t(`${key}.label`)}
              help={t(`${key}.help`)}
              outcome={outcome}
              // noDetails: the store keeps only the outcome and the agent's code; the sentence says what it means.
              detail={detail}
              onCheck={mine ? check : undefined}
              reveal={(canEdit || busyKey === key) && v.state !== 'twice' ? {
                label: t('edit'),
                canSave: changed,
                // The editor closes on the save's answer; only after that does the row stop keeping it.
                onSave: () => { const p = save(key); void p.finally(() => setTimeout(() => setBusyKey((k) => (k === key ? null : k)), 0)); return p; },
                onCancel: () => setDraft(key, null),
                editor: key === 'response_format' ? (
                  <Select<string>
                    label={t('response_format.field')}
                    options={[{ value: 'default', label: t('response_format.default') }, { value: REPLY_JSON, label: t('response_format.json') }]}
                    value={typed !== undefined ? (typed === '' ? 'default' : typed) : v.state === 'set' ? REPLY_JSON : 'default'}
                    onChange={(c) => setDraft(key, c === 'default' ? '' : c)}
                  />
                ) : (
                  <TextField
                    label={t(`${key}.field`)}
                    value={typed ?? was}
                    onChange={(x) => setDraft(key, x)}
                    errorMessage={typed !== undefined && !checked.ok ? problemWords(t, key, checked.why) : undefined}
                    mono
                  />
                ),
              } : undefined}
            >
              {value}{value !== null && ' '}
              <Tag tone={odd ? 'warn' : 'neutral'} {...(odd ? { tip: v.state === 'twice' ? t('twice') : t('ignored') } : {})}>{stateWord(t, v)}</Tag>
            </SettingRow>
          );
        })}
      </SettingGroup>
      {unsure && <TextButton onPress={() => setStopAsk(true)} isDisabled={view.reading}>{t('stop')}</TextButton>}
      <ConfirmDialog
        overlayId="ai-agent-file-setting-stop"
        isOpen={stopAsk}
        onOpenChange={setStopAsk}
        tone="danger"
        title={t('stop.title')}
        body={t('stop.body')}
        confirmLabel={t('stop.confirm')}
        onConfirm={stop}
      />
    </SubSection>
  );
}
