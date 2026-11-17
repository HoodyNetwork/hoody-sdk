// AI → Settings → Connections → MCP servers. The agent answers MCP requests only for a live
// session, so entering this section opens the settings chat of its place (Realm or one folder; settings/rules/Session.ts) and
// only then reads the list; leaving closes it. Each change says what it will start or where it will send before it is sent,
// mints a one-time permission at the press and is checked against the settings file as the person saw it: a change made
// meanwhile is refused and shown (Compare, Reload). The hash a change is checked against is the one the person reviewed, taken when
// its dialog or confirm opened, never a later list's; the hashes of the OTHER layers are taken with it, since an entry is merged
// from every layer: any of them changing closes the confirm, and nothing is sent. A lost answer is "may have gone through" with Check again (reads only) and
// Stop tracking, never a resend. env and header VALUES are never shown: the agent sends names only. An import
// (McpImport.tsx) is previewed first and sent as previewed, checked like any change.
import { useCurrentComputer, type Target } from '@core';
import {
  Band, Button, ButtonStrip, Checkbox, CodeBlock, ConfirmEffect, createColumnHelper, DataTable, Dialog, EmptyState, ErrorState, Facts, OutcomeBanner,
  RadioGroup, Row, SegmentedControl, Select, SettingGroup, SettingRow, Skeleton, Stack, StatusPill, TextField, useDataView, useStrings, useWipeOn, Widget, type RowActionEntry,
} from '@kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettingsHold } from '../rules/data';
import { PlaceFolder, usePlaceFolder } from '../rules/Place';
import { type SettingsAt } from '../rules/Session';
import { useGitHubAt } from './data';
import { listSessionLost, reconnect, useMcpList, useMcpSession, useMcpWrite, type McpWrite, type ReconnectResult, type WriteInput, type WriteVars, type Written } from './mcp.data';
import {
  clearedBy, clearsAny, credsOf, draftArgs, draftProblem, effectOf, toolModeOf, toolsBody, toolsLocked, toolsProblem, type ToolMode, importStillReviewed, layersOf, looksLikeCredential, nameProblem, seenOf, serverBody,
  setsValues, shapeAfter, shapeOf, stillReviewed, type Cleared, type Seen, type CredRow, type Draft, type Effect, type Layers, type McpList, type McpOp, type McpScope, type McpServer, type Transport,
} from './mcp.logic';
import { ImportDialog, importEffects, type ImportReview, type ImportStart } from './McpImport';
import strings from './Mcp.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;
const ONE_REALM = /^(?:global|[0-9a-f]{24})$/;
const col = createColumnHelper<McpServer>();
const word = (t: T, k: string, v?: Record<string, string | number>): string => t(k as never, v as never);

export interface McpSectionProps {
  /** The shown computer's name for words. */
  computer: string;
  target: Target;
  realm: string;
}

/** The MCP servers of the shown computer and one realm, with their own place choice (Realm or one folder). */
export function McpSection({ computer, target, realm }: McpSectionProps) {
  const t = useStrings(strings);
  // The section is a Widget, as GitHub accounts beside it: its states (opening, loading, error, unreadable) come from the kit's
  // state renderer inside it.
  return ONE_REALM.test(realm)
    ? <McpBody key={`${target.container.id}\u0000${realm}`} computer={computer} target={target} realm={realm} />
    : <Widget size="l" title={t('title')} description={t('description', { computer })}>{null}</Widget>;
}

/** What the header's actions do, set by the shown Listing (null while no list is shown: the actions are off). */
interface Presses { add: () => void; import: () => void; reconnect: () => void }
/** Why each header action waits (a strings key), or null when it can be pressed. */
type OffWhy = 'actions.wait' | 'actions.busy' | 'actions.noScope' | null;
interface Offs { readonly add: OffWhy; readonly reconnect: OffWhy }
const ALL_OFF: Offs = { add: 'actions.wait', reconnect: 'actions.wait' };
interface Bind { setPress: (p: Presses | null) => void; setOffs: (o: Offs) => void }

function McpBody({ computer, target, realm }: McpSectionProps) {
  const t = useStrings(strings);
  const [place, setPlace] = useState<'realm' | 'folder'>('realm');
  // The folder choice is the rules' (Place.tsx): listed, home, typed or browsed. A folder chosen from elsewhere (a held change's,
  // goTo) gets a new field, which shows it even when the list does not name it; the old field's last commit never replaces it.
  const { folder, gen, pickAt, goTo, folders } = usePlaceFolder(target, realm, place === 'folder');
  const at: SettingsAt | null = place === 'realm' ? { target, realm } : folder !== '' ? { target, realm, cwd: folder } : null;
  const hold = useSettingsHold(at);
  const session = useMcpSession(at, hold);
  const list = useMcpList(at ?? { target, realm }, session.sid, at !== null && !session.gaveUp);
  const write = useMcpWrite(at, session.sid);
  const { lost, answered } = session;
  // The list says the session is gone (an agent restart, an expiry): one new session, then a fresh list.
  useEffect(() => {
    if (session.sid && list.isError && listSessionLost(list.error)) lost(session.sid);
  }, [session.sid, list.isError, list.error, lost]);
  useEffect(() => { if (session.sid && list.isSuccess) answered(session.sid); }, [session.sid, list.isSuccess, answered]);

  const data: McpList | null = list.data ?? null;
  // What belongs to another place or session is never shown under this one.
  const shown = data && at && data.realm === at.realm && (data.cwd ?? null) === (at.cwd ?? null) && data.sid === session.sid ? data : null;
  // A session replaced under a place already listed (a lost session, reopened) keeps that place's Listing mounted, so an open
  // dialog and its draft stay; the Listing shows no rows and sends nothing until the new session's list is read. Another place,
  // a session given up or failed, or a list error unmounts it as before.
  const placeKey = at ? `${at.realm}\u0000${at.cwd ?? ''}` : null;
  const [listedKey, setListedKey] = useState<string | null>(null);
  const swapping = !session.gaveUp && session.phase !== 'failed' && (!session.sid || list.isPending || (list.isError && listSessionLost(list.error)));
  // (also while the lost session's last list is still in the cache: it is never shown once its session is gone)
  const keep = placeKey !== null && listedKey === placeKey && swapping;
  const nextListed = shown !== null ? placeKey : keep ? listedKey : null;
  useEffect(() => { if (nextListed !== listedKey) setListedKey(nextListed); }, [nextListed, listedKey]);

  // The section's actions are one header cluster, Add the one primary and Import and
  // Reconnect a quiet strip, the same with or without servers. The Listing owns what they do and hands them up here;
  // until it does (opening, loading, failed), they wait with the reason said.
  const press = useRef<Presses | null>(null);
  const [offs, setOffs] = useState<Offs>(ALL_OFF);
  const setPress = useCallback((p: Presses | null) => { press.current = p; }, []);
  const bind = useMemo(() => ({ setPress, setOffs }), [setPress]);
  const off = (why: OffWhy) => (why === null ? {} : { isDisabled: true, disabledReason: t(why) });
  const head = (
    <>
      <ButtonStrip label={t('more')}>
        <Button icon="upload" {...off(offs.add)} onPress={() => press.current?.import()}>{t('import')}</Button>
        <Button icon="reload" {...off(offs.reconnect)} onPress={() => press.current?.reconnect()}>{t('reconnect')}</Button>
      </ButtonStrip>
      <Button variant="primary" icon="plus" {...off(offs.add)} onPress={() => press.current?.add()}>{t('add')}</Button>
    </>
  );

  return (
    <Widget size="l" title={t('title')} description={t('description', { computer })} actions={head}>
      <Stack gap={4}>
        <SettingGroup label={t('place')}>
          <SettingRow label={t('place')}>
            <SegmentedControl
              label={t('place')}
              items={[{ id: 'realm', label: t('place.realm') }, { id: 'folder', label: t('place.folder') }]}
              value={place}
              onChange={setPlace}
            />
          </SettingRow>
          {place === 'folder' && (
            <SettingRow label={t('place.folder')} wide>
              <PlaceFolder computer={computer} folder={folder} gen={gen} pickAt={pickAt} folders={folders} noFolders={t('place.noFolders')} />
            </SettingRow>
          )}
        </SettingGroup>
        {/* Where the list comes from: facts of the place, never a strip of prose. */}
        <Facts
          label={t('facts.label')}
          layout="spec"
          columns={1}
          items={[
            { label: t('facts.from'), value: place === 'folder' ? t('facts.from.folder', { computer }) : t('facts.from.realm', { computer }) },
            { label: t('facts.open'), value: t('facts.open.value') },
          ]}
        />
        <HeldNotice write={write} t={t} />
        <HeldElsewhere write={write} t={t} go={(cwd) => { if (cwd === '') setPlace('realm'); else { goTo(cwd); setPlace('folder'); } }} />
        {at === null ? (
          <EmptyState icon="files" title={t('place.folder')} body={t('place.noFolder')} size="sm" />
        ) : session.gaveUp ? (
          <ErrorState size="sm" /* noDetails: the session was lost twice; each loss was a 404 already read as a loss, with no reason of its own */ title={t('open.failed')} body={t('lost')} onRetry={session.retry} />
        ) : session.phase === 'failed' ? (
          <ErrorState size="sm" /* noDetails: the settings session keeps only its failure's code (rules/Session.ts), worded here */ title={t('open.failed')} body={openFailText(session.failure, computer, t)} onRetry={session.retry} />
        ) : keep ? (
          // the same slot and key as the Listing below, so React keeps it mounted across the swap
          <Listing key={placeKey ?? ''} computer={computer} at={at} list={null} hold={hold} write={write} t={t} reload={() => void list.refetch()} bind={bind} />
        ) : !session.sid ? (
          <Stack gap={2}>
            <Band tone="neutral" size="table">{t('opening', { computer })}</Band>
            <Skeleton variant="table" rows={3} columns={3} />
          </Stack>
        ) : list.isError && !listSessionLost(list.error) ? (
          <ErrorState size="compact" title={t('loadFailed')} error={list.error} onRetry={() => void list.refetch()} />
        ) : list.isLoading || list.isError ? (
          <Skeleton variant="table" rows={3} columns={3} />
        ) : shown === null ? (
          <EmptyState icon="warn" title={t('unreadable.title')} body={t('unreadable.body')} size="sm" />
        ) : (
          <Listing key={placeKey ?? ''} computer={computer} at={at} list={shown} hold={hold} write={write} t={t} reload={() => void list.refetch()} bind={bind} />
        )}
      </Stack>
    </Widget>
  );
}

function openFailText(kind: string | null, computer: string, t: T): string {
  const k = `open.failed.${kind ?? 'other'}`;
  return k in strings ? word(t, k, { computer }) : t('open.failed.other');
}

function HeldNotice({ write, t }: { write: McpWrite; t: T }) {
  const [checking, setChecking] = useState(false);
  const [asked, setAsked] = useState(false);
  const held = write.held;
  if (!held) return null;
  const scope = String((held.identity as { scope?: unknown; cwd?: unknown } | undefined)?.scope ?? 'user') as McpScope;
  const realmPlace = (held.identity as { cwd?: unknown } | undefined)?.cwd === '';
  return (
    <>
      <OutcomeBanner
        kind="pending" /* noDetails: no answer came back, so there is no rejection to show */
        body={t('held', { scope: scopeText(scope, t, realmPlace) })}
        onCheck={() => { setChecking(true); void write.check().finally(() => setChecking(false)); }}
        checking={checking}
        onDismiss={() => setAsked(true)}
        dismissWarned
      />
      <ConfirmEffect
        isOpen={asked}
        onOpenChange={setAsked}
        title={t('held.stopTitle')}
        effects={[t('held.stopEffect')]}
        confirmLabel={t('held.stopConfirm')}
        onConfirm={() => { setAsked(false); void write.stopWaiting(); }}
      />
    </>
  );
}

/** A change held in another place of this computer and realm: it blocks changes here as well, so say where it is and go there
 *  (its Check again and Stop tracking are shown in its own place). */
function HeldElsewhere({ write, t, go }: { write: McpWrite; t: T; go: (cwd: string) => void }) {
  const h = write.elsewhere;
  if (!h || write.held) return null;
  const cwd = (h.identity as { cwd?: unknown } | undefined)?.cwd;
  if (typeof cwd !== 'string') return null;
  return (
    <Stack gap={2}>
      <Band tone="neutral" size="table">{cwd === '' ? t('elsewhere.realm') : t('elsewhere.folder', { folder: cwd })}</Band>
      <Row gap={2}><Button size="sm" variant="secondary" onPress={() => go(cwd)}>{t('elsewhere.go')}</Button></Row>
    </Stack>
  );
}

/** A change's last answer, shown when it is not a success and cleared by the next press. */
interface Res { outcome: 'done' | 'failed' | 'not_sent' | 'stale'; code?: string; status?: number; traceId?: string; route?: string; name?: string; op?: McpOp }

function effectText(e: Effect, computer: string, t: T): string {
  return e.kind === 'runs' ? t('effect.runs', { command: e.command, computer }) : e.kind === 'sends' ? t('effect.sends', { host: e.host }) : t('effect.unknown');
}
function scopeText(s: McpScope | null, t: T, realmPlace: boolean): string {
  if (s === null) return t('scope.none');
  return s === 'user' && realmPlace ? t('scope.userRealm') : word(t, `scope.${s}`);
}
function stateText(s: McpServer, t: T): string {
  if (s.revoked) return s.revokedReason ? t('state.revoked', { reason: s.revokedReason }) : t('state.revokedNoReason');
  if (!s.enabled) return t('state.off');
  if (s.connected) return s.toolCount !== null ? t('state.connectedTools', { count: s.toolCount }) : t('state.connected');
  return t('state.notConnected');
}

/** A change the agent refused because the file moved under it: what the person reviewed, for Compare (an import: its paste,
 *  to preview again). */
interface Kept { op: McpOp; scope: McpScope; name: string; row: McpServer | null; draft: Draft | null; imp?: ImportStart }

// Every dialog keeps the layer hashes as the person saw them when it opened (what its change is checked against).
type Dlg =
  | { kind: 'add'; layers: Layers; start: Kept | null }
  | { kind: 'edit'; row: McpServer; layers: Layers; start: Kept | null }
  | { kind: 'confirm'; draft: Draft; orig: McpServer | null; scope: McpScope; layers: Layers }
  | { kind: 'on'; row: McpServer; layers: Layers }
  | { kind: 'remove'; row: McpServer; layers: Layers }
  | { kind: 'compare'; kept: Kept }
  // Reads only: the entry as the list shows it (no layer hashes: it sends nothing).
  | { kind: 'details'; row: McpServer }
  | { kind: 'import'; start: ImportStart | null }
  // An import's confirm keeps the layers and the effective entries of the previewed names, as the person saw them when it opened.
  | { kind: 'importConfirm'; r: ImportReview; layers: Layers; seen: Seen[] }
  | null;

interface ListingProps {
  computer: string;
  at: SettingsAt;
  /** null while a replaced session's list is read: no rows are shown (the opening note instead), open dialogs and drafts stay,
   *  and nothing is sent. */
  list: McpList | null;
  hold: ReturnType<typeof useSettingsHold>;
  write: McpWrite;
  t: T;
  reload: () => void;
  /** The section header's actions: this Listing says what they do and whether they are off. */
  bind: Bind;
}

function Listing({ computer, at, list, hold, write, t, reload, bind }: ListingProps) {
  const folderPlace = at.cwd !== undefined;
  const waiting = write.state !== 'free';
  // The layers an add can go to, kept from the last list while a replaced session's list is read (an open dialog keeps its
  // choices; it sends nothing until the new list is read and checked).
  const lastScopes = useRef<McpScope[]>([]);
  if (list) lastScopes.current = (folderPlace ? (['user', 'project', 'local'] as const) : (['user'] as const)).filter((s) => list.files[s] !== undefined);
  const addScopes = lastScopes.current;
  const [dlg, setDlg] = useState<Dlg>(null);
  const [res, setRes] = useState<Res | null>(null);
  const [note, setNote] = useState<ReconnectResult | 'off' | 'saved' | null>(null);
  const [imported, setImported] = useState<number | null>(null);
  // The change refused by a conflict, kept so the person can compare it with what is saved now.
  const [kept, setKept] = useState<Kept | null>(null);
  // An import's confirm and a refused import kept for Review again both hold the pasted text: a page hide (or the context
  // ending) drops them, as the paste box drops its own.
  useWipeOn(() => {
    if (dlg?.kind === 'importConfirm') setDlg(null);
    if (kept?.imp) {
      setKept(null);
      setRes(null);
    }
  });
  const hashOf = (scope: McpScope | null): string | null => (scope && list ? list.files[scope]?.hash ?? null : null);
  const [busyReconnect, setBusyReconnect] = useState(false);
  // A confirm is bound to the entry as the person reviewed it: when a newer list is incomplete,
  // shows ANY layer changed (the entry is merged from all of them), or shows the entry or its layer otherwise than reviewed
  // (stillReviewed), the confirm closes and sends nothing, and Compare shows what changed.
  useEffect(() => {
    // A replaced session's list not read yet judges nothing; the new list judges every open confirm when it comes.
    if (!list) return;
    if (dlg?.kind === 'importConfirm') {
      const names = dlg.r.preview.servers.map((s) => s.name);
      if (importStillReviewed(list, { layers: dlg.layers, names, seen: dlg.seen })) return;
      setDlg(null);
      setKept({ op: 'import', scope: dlg.r.scope, name: '', row: null, draft: null, imp: { doc: dlg.r.doc, scope: dlg.r.scope, replace: dlg.r.replace } });
      setRes({ outcome: 'not_sent', code: 'changed', op: 'import' });
      return;
    }
    if (dlg?.kind !== 'confirm' && dlg?.kind !== 'on' && dlg?.kind !== 'remove') return;
    const scope = dlg.kind === 'confirm' ? dlg.scope : dlg.row.scope;
    const seen = dlg.kind === 'confirm' ? dlg.orig : dlg.row;
    const name = dlg.kind === 'confirm' ? dlg.orig?.name ?? dlg.draft.name : dlg.row.name;
    if (scope === null || stillReviewed(list, { layers: dlg.layers, name, before: seen ? shapeOf(seen) : null, from: seen?.scope ?? null })) return;
    const k: Kept = dlg.kind === 'confirm'
      ? { op: 'upsert', scope, name: dlg.orig?.name ?? dlg.draft.name, row: dlg.orig, draft: dlg.draft }
      : { op: dlg.kind === 'on' ? 'set_enabled' : 'delete', scope, name: dlg.row.name, row: dlg.row, draft: null };
    setDlg(null);
    setKept(k);
    setRes({ outcome: 'not_sent', code: 'changed', name: k.name });
  }, [dlg, list]);

  /** One change, checked against the hashes in `v` (the ones reviewed); answers its outcome's code ('done', 'pending', or the
   *  refusal's code). A conflict, or a layer changed before the send, keeps what was reviewed for Compare. */
  const send = useCallback(async (v: WriteInput, kept: Kept, after?: (w: Written | undefined) => void): Promise<string> => {
    setRes(null);
    setNote(null);
    setImported(null);
    setKept(null);
    if (!hold || !v.layers[v.scope]) { setRes({ outcome: 'not_sent', code: 'NO_FILE' }); return 'NO_FILE'; }
    // Never sent before the replaced session's list is read (its confirms are not shown then either).
    if (!list) return 'not_sent';
    const r = await write.run({ ...at, hold, ...v } as WriteVars);
    if (r.outcome === 'done') { after?.(r.data); reload(); return 'done'; }
    // A change that may have gone through is the section's hold banner (Check again, Stop tracking).
    if (r.outcome === 'pending') return 'pending';
    setRes({
      outcome: r.outcome === 'failed' || r.outcome === 'not_sent' || r.outcome === 'stale' ? r.outcome : 'failed',
      ...(r.code ? { code: r.code } : {}), ...(r.status !== undefined ? { status: r.status } : {}),
      ...(r.traceId ? { traceId: r.traceId } : {}), ...(r.route ? { route: r.route } : {}), name: v.name, op: v.op,
    });
    // The settings file moved under this change: keep what was reviewed (Compare) and read the file again.
    if (r.code === 'mcp_conflict' || r.code === 'changed') setKept(kept);
    if (r.code === 'mcp_conflict' || r.code === 'changed' || r.code === 'mcp_not_in_layer') reload();
    return r.code ?? r.outcome;
  }, [at, hold, list, reload, write]);

  const saveDraft = useCallback((draft: Draft, orig: McpServer | null, scope: McpScope, layers: Layers) => {
    const name = orig?.name ?? draft.name;
    void send(
      { op: 'upsert', scope, name, layers, before: orig ? shapeOf(orig) : null, from: orig?.scope ?? null, server: serverBody(draft, orig), shape: shapeAfter(draft, orig), setsValues: setsValues(draft) },
      { op: 'upsert', scope, name, row: orig, draft },
      () => setNote('saved'),
    );
  }, [send]);
  const toggle = (row: McpServer, enabled: boolean, layers: Layers) => {
    if (!row.scope) return;
    void send(
      { op: 'set_enabled', scope: row.scope, name: row.name, enabled, layers, before: shapeOf(row), from: row.scope },
      { op: 'set_enabled', scope: row.scope, name: row.name, row, draft: null },
      enabled ? undefined : () => setNote('off'),
    );
  };
  /** The import as reviewed: the text exactly as previewed, checked against the layers and the names seen at its confirm. */
  const importNow = (d: { r: ImportReview; layers: Layers; seen: Seen[] }) => {
    const imp: ImportStart = { doc: d.r.doc, scope: d.r.scope, replace: d.r.replace };
    void send(
      {
        op: 'import', scope: d.r.scope, name: '', layers: d.layers, before: null, from: null,
        document: d.r.doc, replace: d.r.replace, names: d.r.preview.servers.map((s) => s.name), seen: d.seen,
      },
      { op: 'import', scope: d.r.scope, name: '', row: null, draft: null, imp },
      (w) => { if (typeof w?.imported === 'number') setImported(w.imported); },
    );
  };
  const remove = (row: McpServer, layers: Layers) => {
    if (!row.scope) return;
    void send({ op: 'delete', scope: row.scope, name: row.name, layers, before: shapeOf(row), from: row.scope }, { op: 'delete', scope: row.scope, name: row.name, row, draft: null });
  };

  const columns = useMemo(
    () => [
      col.display({ id: 'name', header: t('col.name'), meta: { minWidth: 160 }, cell: (c) => `${c.row.original.name} · ${word(t, `kind.${c.row.original.transport}`)}` }),
      col.display({ id: 'effect', header: t('col.effect'), meta: { minWidth: 240 }, cell: (c) => effectText(effectOf(c.row.original), computer, t) }),
      col.display({
        id: 'state', header: t('col.state'),
        cell: (c) => {
          const s = c.row.original;
          return <StatusPill tone={s.revoked ? 'danger' : s.enabled && s.connected ? 'ok' : 'neutral'}>{stateText(s, t)}</StatusPill>;
        },
      }),
      ...(folderPlace ? [col.display({ id: 'scope', header: t('col.scope'), cell: (c: { row: { original: McpServer } }) => scopeText(c.row.original.scope, t, false) })] : []),
    ],
    [t, computer, folderPlace],
  );

  const actions = (row: McpServer): readonly RowActionEntry[] => {
    const why = waiting ? t('waiting') : row.scope === null ? t('readonly.none') : undefined;
    const hash = hashOf(row.scope);
    const off = waiting || hash === null || !hold;
    const open = (d: Dlg) => () => { if (hash !== null) setDlg(d); };
    if (!list) return [];
    const layers = layersOf(list);
    return [
      // Reading the entry needs no permission and no hash: it is offered whatever the layer or a held change.
      { id: 'details', label: t('details'), icon: 'info', opens: true, onAction: () => setDlg({ kind: 'details', row }) },
      row.enabled
        ? { id: 'off', label: t('turnOff'), icon: 'pause', isDisabled: off, ...(why ? { disabledReason: why } : {}), onAction: () => toggle(row, false, layers) }
        : { id: 'on', label: t('turnOn'), icon: 'play', isDisabled: off, ...(why ? { disabledReason: why } : {}), onAction: open({ kind: 'on', row, layers }) },
      { id: 'edit', label: t('edit'), icon: 'pen', isDisabled: off, ...(why ? { disabledReason: why } : {}), onAction: () => { setRes(null); open({ kind: 'edit', row, layers, start: null })(); } },
      { id: 'remove', label: t('remove'), icon: 'trash', tone: 'danger', isDisabled: off, ...(why ? { disabledReason: why } : {}), onAction: open({ kind: 'remove', row, layers }) },
    ];
  };
  const view = useDataView({ rows: list?.servers ?? [], columns, getRowId: (r: McpServer) => r.name, search: [], param: 'mcp' });
  const nowOf = (name: string) => list?.servers.find((s) => s.name === name) ?? null;
  // Compare never edits on its own: an add reopens its kept draft (checked against the hashes seen at that reopen); an edit
  // reopens only when the entry now is readable AND still comes from the layer the edit was for, so its scope never changes.
  // Anything else (a turn on/off, a remove, an entry gone, unreadable or from another layer) shows the entry as reviewed beside
  // the entry now, with Reload only.
  const compare = (k: Kept) => {
    if (!list) return;
    // An import is never compared: its paste reopens, to be previewed again against the list now.
    if (k.imp) { setRes(null); setKept(null); setDlg({ kind: 'import', start: k.imp }); return; }
    if (!k.draft) { setDlg({ kind: 'compare', kept: k }); return; }
    if (!k.row) { setDlg({ kind: 'add', layers: layersOf(list), start: k }); return; }
    const now = nowOf(k.row.name);
    if (!now || now.scope !== k.scope) { setDlg({ kind: 'compare', kept: k }); return; }
    setDlg({ kind: 'edit', row: now, layers: layersOf(list), start: k });
  };

  // While a replaced session's list is read (list null) the actions wait for it: the scopes and the session handle kept from
  // before describe the old session, so nothing opens or sends on them.
  const unread = list === null;
  const addOff = addScopes.length === 0 || waiting || !hold || unread;
  const addPress = () => { if (!list || addOff) return; setRes(null); setDlg({ kind: 'add', layers: layersOf(list), start: null }); };
  const importPress = () => { if (!list || addOff) return; setRes(null); setDlg({ kind: 'import', start: null }); };
  const reconnectOff = busyReconnect || !hold || unread;
  const reconnectPress = () => {
    if (!hold || reconnectOff) return;
    setBusyReconnect(true);
    setNote(null);
    void reconnect(at, hold).then((r) => { setNote(r); reload(); }).finally(() => setBusyReconnect(false));
  };
  // The header's actions run this Listing's presses (the latest render's) and are off as its own state says; unmounted, off.
  const { setOffs, setPress } = bind;
  useEffect(() => { setPress({ add: addPress, import: importPress, reconnect: reconnectPress }); });
  const addWhy: OffWhy = !addOff ? null : waiting ? 'actions.busy' : !hold || unread ? 'actions.wait' : 'actions.noScope';
  const reconnectWhy: OffWhy = !reconnectOff ? null : busyReconnect ? 'actions.busy' : 'actions.wait';
  useEffect(() => { setOffs({ add: addWhy, reconnect: reconnectWhy }); }, [setOffs, addWhy, reconnectWhy]);
  useEffect(() => () => { setPress(null); setOffs(ALL_OFF); }, [setOffs, setPress]);

  return (
    <Stack gap={3}>
      {list && list.unreadable.length > 0 && (
        <Band tone="warn" size="table" /* noDetails: entries of the agent's own list the page could not read, not a rejection */>
          {t('unreadableRows', { count: list.unreadable.length, names: list.unreadable.map((n) => n ?? '?').join(', ') })}
        </Band>
      )}
      {list?.warnings.slice(0, 3).map((w) => <Band key={w} tone="warn" size="table" /* noDetails: the agent's own warning about a settings file, not a rejection */>{t('warnings', { text: w })}</Band>)}
      {note === 'saved' && <OutcomeBanner kind="done" /* noDetails: a success, nothing was rejected */ title={t('saved')} onDismiss={() => setNote(null)} />}
      {note === 'off' && <OutcomeBanner kind="done" /* noDetails: a success, nothing was rejected */ title={t('off.done')} onDismiss={() => setNote(null)} />}
      {note !== null && typeof note === 'object' && <ReconnectBanner r={note} t={t} onDismiss={() => setNote(null)} />}
      {imported !== null && <OutcomeBanner kind="done" /* noDetails: a success, nothing was rejected */ title={t('imp.done', { count: imported })} onDismiss={() => setImported(null)} />}
      {res && dlg === null && (
        res.code === 'mcp_conflict' || res.code === 'changed' ? (
          // While a replaced session's list is unread the banner claims nothing about the entry now (gone needs a list) and its
          // Compare and Reload wait for that list.
          <ConflictBanner computer={computer} t={t} res={res} kept={kept} gone={list !== null && !!kept?.row && !nowOf(kept.name)} paused={list === null} onReload={reload} onCompare={() => { if (kept) compare(kept); }} onDismiss={() => { setRes(null); setKept(null); }} />
        ) : (
          <OutcomeBanner kind={res.outcome} error={res} body={resText(res, t)} onDismiss={() => setRes(null)} />
        )
      )}
      {list === null ? (
        // the replaced session's list is not read yet: no rows of either session
        <Band tone="neutral" size="table">{t('opening', { computer })}</Band>
      ) : (
        <DataTable<McpServer>
          label={t('title')}
          columns={columns}
          view={view}
          actions={actions}
          onRefresh={reload}
          noViewMenu
          presentation="auto"
          countLabel={(n) => t('count', { count: n })}
          // No server yet: the table's own empty state, which points at the header's Add (the one primary).
          empty={<EmptyState icon="server" title={t('empty.title')} body={t('empty.body')} size="sm" />}
          toolbarNote={waiting ? t('waiting') : undefined}
        />
      )}
      {dlg?.kind === 'details' && (
        <DetailsDialog computer={computer} t={t} s={nowOf(dlg.row.name) ?? dlg.row} gone={!nowOf(dlg.row.name)} onClose={() => setDlg(null)} />
      )}
      {(dlg?.kind === 'add' || dlg?.kind === 'edit') && (
        <ServerDialog
          key={dlg.kind === 'edit' ? dlg.row.name : 'add'}
          computer={computer}
          t={t}
          orig={dlg.kind === 'edit' ? dlg.row : null}
          start={dlg.start?.draft ?? null}
          startScope={dlg.start?.scope ?? null}
          now={dlg.start ? (dlg.kind === 'edit' ? nowOf(dlg.row.name) : null) : null}
          taken={list ? [...list.servers.map((s) => s.name), ...list.unreadable.filter((n): n is string => n !== null)] : []}
          paused={list === null}
          addScopes={addScopes}
          folderPlace={folderPlace}
          onClose={() => setDlg(null)}
          onNext={(draft, scope) => setDlg({ kind: 'confirm', draft, orig: dlg.kind === 'edit' ? dlg.row : null, scope, layers: dlg.layers })}
        />
      )}
      {/* A confirm is not shown while a replaced session's list is read: it stays open in state and the new list judges it. */}
      {dlg?.kind === 'confirm' && list && (
        <ConfirmEffect
          isOpen
          onOpenChange={(o) => { if (!o) setDlg(null); }}
          title={dlg.orig ? t('save.title.edit', { name: dlg.orig.name }) : t('save.title.add', { name: dlg.draft.name })}
          effects={saveEffects(dlg.draft, dlg.orig, dlg.scope, computer, folderPlace, t)}
          note={t('save.note')}
          confirmLabel={t('save.confirm')}
          onConfirm={() => { const d = dlg; setDlg(null); saveDraft(d.draft, d.orig, d.scope, d.layers); }}
        />
      )}
      {dlg?.kind === 'on' && list && (
        <ConfirmEffect
          isOpen
          onOpenChange={(o) => { if (!o) setDlg(null); }}
          title={t('on.title', { name: dlg.row.name })}
          effects={[effectText(effectOf(dlg.row), computer, t)]}
          note={t('on.note')}
          confirmLabel={t('on.confirm')}
          onConfirm={() => { const d = dlg; setDlg(null); toggle(d.row, true, d.layers); }}
        />
      )}
      {dlg?.kind === 'remove' && list && (
        <ConfirmEffect
          isOpen
          onOpenChange={(o) => { if (!o) setDlg(null); }}
          title={t('rm.title', { name: dlg.row.name })}
          effects={removeEffects(dlg.row, computer, folderPlace, t)}
          confirmLabel={t('rm.confirm')}
          tone="danger"
          onConfirm={() => { const d = dlg; setDlg(null); remove(d.row, d.layers); }}
        />
      )}
      {dlg?.kind === 'import' && hold && (
        <ImportDialog
          computer={computer}
          t={t}
          at={at}
          hold={hold}
          list={list}
          addScopes={addScopes}
          folderPlace={folderPlace}
          scopeLabel={(s) => scopeText(s, t, !folderPlace)}
          start={dlg.start}
          onClose={() => setDlg(null)}
          onNext={(r) => { if (list) setDlg({ kind: 'importConfirm', r, layers: layersOf(list), seen: seenOf(r.preview.servers.map((s) => s.name), list) }); }}
        />
      )}
      {dlg?.kind === 'importConfirm' && list && (
        <ConfirmEffect
          isOpen
          onOpenChange={(o) => { if (!o) setDlg(null); }}
          title={t('imp.confirm.title', { count: dlg.r.preview.servers.length })}
          effects={importEffects(dlg.r, computer, scopeText(dlg.r.scope, t, !folderPlace), t)}
          confirmLabel={t('imp.confirm')}
          onConfirm={() => { const d = dlg; setDlg(null); importNow(d); }}
        />
      )}
      {dlg?.kind === 'compare' && list && (
        <Dialog isOpen overlayId="ai.mcp.compare" onOpenChange={(o) => { if (!o) setDlg(null); }} title={t('conflict.compare')} primaryLabel={t('conflict.reload')} onPrimary={() => { setDlg(null); setRes(null); setKept(null); reload(); }}>
          <Stack gap={3}>
            {dlg.kept.row && <ServerFacts computer={computer} t={t} label={t('conflict.reviewed')} s={dlg.kept.row} />}
            <CompareNow computer={computer} t={t} kept={dlg.kept} list={list} folderPlace={folderPlace} />
          </Stack>
        </Dialog>
      )}
    </Stack>
  );
}

/** The entry now, for a Compare that cannot reopen the edit: as saved now, unreadable, gone, or declared by another layer. */
function CompareNow({ computer, t, kept, list, folderPlace }: { computer: string; t: T; kept: Kept; list: McpList; folderPlace: boolean }) {
  const now = list.servers.find((s) => s.name === kept.name) ?? null;
  if (!now) return <Band tone="neutral" size="table">{list.unreadable.includes(kept.name) ? t('conflict.unreadable') : t('conflict.gone')}</Band>;
  return (
    <Stack gap={2}>
      {now.scope !== kept.scope && <Band tone="neutral" size="table">{t('conflict.otherLayer', { scope: scopeText(now.scope, t, !folderPlace) })}</Band>}
      <ServerFacts computer={computer} t={t} label={t('conflict.now', { computer })} s={now} />
    </Stack>
  );
}

/** The saved values a re-pointed change removes, env names and header names apart (names only, never a value). */
function clearedLines(c: Cleared, t: T): string[] {
  return [
    ...(c.env.length ? [t('cleared.env', { names: c.env.join(', ') })] : []),
    ...(c.headers.length ? [t('cleared.headers', { names: c.headers.join(', ') })] : []),
  ];
}

function saveEffects(d: Draft, orig: McpServer | null, scope: McpScope, computer: string, folderPlace: boolean, t: T): string[] {
  const e = effectOf({ transport: d.transport, command: d.command.trim() || null, args: draftArgs(d), url: d.url.trim() || null });
  const out = [effectText(e, computer, t), `${t('dlg.savedIn')}: ${scopeText(scope, t, !folderPlace)}`];
  const c = clearedBy(orig, d);
  if (clearsAny(c)) out.push(t('save.cleared'), ...clearedLines(c, t));
  const tools = toolsLine(d, orig, t);
  if (tools) out.push(tools);
  return out;
}

/** The confirm's tools line, only when the write changes them (a new server says so unless it gets every tool). */
function toolsLine(d: Draft, orig: McpServer | null, t: T): string | null {
  const sent = toolsBody(d, orig);
  if (!sent) return null;
  return sent.length === 0 ? t('save.toolsNone') : t('save.toolsOnly', { names: sent.join(', ') });
}

/** The tools an entry offers agents, in words: every one, none, or the names. */
function toolsText(s: McpServer, t: T): string {
  if (s.allowedTools === null) return t('tools.all');
  return s.allowedTools.length === 0 ? t('tools.none') : t('tools.only', { names: s.allowedTools.join(', ') });
}

function removeEffects(row: McpServer, computer: string, folderPlace: boolean, t: T): string[] {
  const e = effectOf(row);
  return [
    t('rm.effect', { scope: scopeText(row.scope, t, !folderPlace) }),
    ...(e.kind === 'runs' ? [t('rm.effectRuns', { command: e.command, computer })] : e.kind === 'sends' ? [t('rm.effectSends', { host: e.host })] : []),
    ...(row.envKeys.length || row.headerKeys.length ? [t('rm.effect2')] : []),
  ];
}

function resText(res: Res, t: T): string | undefined {
  if (res.outcome === 'failed' && res.code && res.op === 'import') { const k = `imp.refused.${res.code}`; if (k in strings) return word(t, k); }
  if (res.outcome === 'failed' && res.code) { const k = `refused.${res.code}`; return k in strings ? word(t, k) : undefined; }
  if (res.outcome === 'not_sent' && res.code) { const k = `notsent.${res.code}`; return k in strings ? word(t, k) : undefined; }
  return undefined;
}

function ReconnectBanner({ r, t, onDismiss }: { r: ReconnectResult; t: T; onDismiss: () => void }) {
  if (r.outcome === 'done') return <OutcomeBanner kind="done" /* noDetails: a success, nothing was rejected */ title={t('reconnect.done')} onDismiss={onDismiss} />;
  if (r.outcome === 'background') return <Band tone="neutral" size="table">{t('reconnect.background')}</Band>;
  if (r.outcome === 'skipped') return <Band tone="neutral" size="table">{t('reconnect.skipped')}</Band>;
  if (r.outcome === 'partial') return <Band tone="warn" size="table" /* noDetails: the agent's own count of layers it could not read, not a rejection */>{t('reconnect.partial')}</Band>;
  if (r.outcome === 'pending') return <Band tone="neutral" size="table">{t('reconnect.pending')}</Band>;
  if (r.code === 'rate_limited') return <Band tone="neutral" size="table">{t('reconnect.rate_limited')}</Band>;
  return <OutcomeBanner kind={r.outcome} error={r} onDismiss={onDismiss} />;
}

function ConflictBanner({ computer, t, res, kept, gone, paused, onReload, onCompare, onDismiss }: {
  computer: string; t: T; res: Res; kept: Kept | null; gone: boolean; paused: boolean;
  onReload: () => void; onCompare: () => void; onDismiss: () => void;
}) {
  return (
    <Stack gap={2}>
      {res.code === 'changed'
        ? <OutcomeBanner kind="not_sent" /* noDetails: the page closed the confirm before sending; nothing was rejected */ body={t('conflict.before', { computer })} onDismiss={onDismiss} />
        : <OutcomeBanner kind="failed" error={res} body={t('conflict', { computer })} onDismiss={onDismiss} />}
      <Row gap={2}>
        {kept && <Button size="sm" variant="secondary" isDisabled={paused} onPress={onCompare}>{kept.imp ? t('imp.reviewAgain') : t('conflict.compare')}</Button>}
        <Button size="sm" variant="ghost" isDisabled={paused} onPress={onReload}>{t('conflict.reload')}</Button>
      </Row>
      {gone && <Band tone="neutral" size="table">{t('conflict.gone')}</Band>}
    </Stack>
  );
}

// ---- the editor ----

const emptyDraft = (): Draft => ({ name: '', transport: 'stdio', command: '', args: '', origArgs: null, argsEdited: false, url: '', requireConfirmation: false, env: [], headers: [], tools: 'all', toolNames: '', toolsEdited: false });
const draftOf = (s: McpServer): Draft => ({
  name: s.name, transport: s.transport, command: s.command ?? '', args: s.args.join('\n'), origArgs: [...s.args], argsEdited: false, url: s.url ?? '',
  requireConfirmation: s.requireConfirmation,
  env: s.envKeys.map((name) => ({ name, kind: 'kept' as const })), headers: s.headerKeys.map((name) => ({ name, kind: 'kept' as const })),
  tools: toolModeOf(s.allowedTools), toolNames: (s.allowedTools ?? []).join('\n'), toolsEdited: false,
});

interface DialogProps {
  computer: string;
  t: T;
  orig: McpServer | null;
  /** A draft kept after a conflict, to start from, and the layer it was for. */
  start: Draft | null;
  startScope: McpScope | null;
  /** The entry as the latest list shows it (Compare). */
  now: McpServer | null;
  taken: readonly string[];
  /** A replaced session's list is being read: the draft stays, Next waits for it. */
  paused: boolean;
  addScopes: readonly McpScope[];
  folderPlace: boolean;
  onClose: () => void;
  onNext: (draft: Draft, scope: McpScope) => void;
}

function ServerDialog({ computer, t, orig, start, startScope, now, taken, paused, addScopes, folderPlace, onClose, onNext }: DialogProps) {
  const [d, setD] = useState<Draft>(() => start ?? (orig ? draftOf(orig) : emptyDraft()));
  // A reopened draft keeps the layer it was for (Compare never changes it), before the entry's own.
  const [scope, setScope] = useState<McpScope>(startScope ?? orig?.scope ?? addScopes[0] ?? 'user');
  const [touched, setTouched] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const set = (p: Partial<Draft>) => { setD((x) => ({ ...x, ...p })); setTouched(true); };
  const stdio = d.transport === 'stdio';
  const creds = credsOf(d);
  const setCreds = (rows: CredRow[]) => set(stdio ? { env: rows } : { headers: rows });
  const problem = draftProblem(d, taken, orig !== null);
  const toolsP = toolsProblem(d, orig);
  const locked = toolsLocked(orig);
  const nameP = orig === null ? nameProblem(d.name, taken) : null;
  const showP = touched && problem !== null;
  const credInText = looksLikeCredential({ url: stdio ? null : d.url.trim(), args: stdio ? draftArgs(d) : [] });
  const cleared = clearedBy(orig, d);
  const kinds: { value: Transport; label: string }[] = [
    { value: 'stdio', label: t('dlg.kind.stdio') }, { value: 'http', label: t('dlg.kind.http') }, { value: 'sse', label: t('dlg.kind.sse') },
  ];
  const addCred = () => {
    if (newName.trim() === '') return;
    const name = newName.trim();
    setCreds([...creds.filter((c) => c.name !== name), { name, kind: 'set', value: newValue }]);
    setNewName('');
    setNewValue('');
  };
  return (
    <Dialog
      isOpen
      overlayId="ai.mcp.server"
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={orig ? t('dlg.editTitle', { name: orig.name }) : t('dlg.addTitle')}
      size="lg"
      primaryLabel={t('dlg.next')}
      primaryDisabled={(touched && (problem !== null || toolsP !== null)) || paused}
      onPrimary={() => {
        if (paused) return;
        setTouched(true);
        if (problem !== null || toolsP !== null) return;
        onNext(d, scope);
      }}
    >
      <Stack gap={3}>
        {now && start && <ServerFacts computer={computer} t={t} label={t('conflict.now', { computer })} s={now} />}
        {orig === null && (
          <TextField
            label={t('dlg.name')} description={t('dlg.nameHint')} value={d.name} mono
            onChange={(v) => set({ name: v })}
            errorMessage={showP && nameP ? word(t, `problem.name.${nameP}`) : undefined}
          />
        )}
        <Select label={t('dlg.kind')} options={kinds} value={d.transport} onChange={(v) => set({ transport: v })} />
        {stdio ? (
          <>
            <TextField label={t('dlg.command')} description={t('dlg.commandHint')} value={d.command} mono onChange={(v) => set({ command: v })}
              errorMessage={showP && problem === 'command' ? t('problem.command') : undefined} />
            <TextField label={t('dlg.args')} description={t('dlg.argsHint')} value={d.args} mono multiline rows={3} onChange={(v) => set({ args: v, argsEdited: true })} />
          </>
        ) : (
          <TextField label={t('dlg.url')} description={t('dlg.urlHint')} value={d.url} mono onChange={(v) => set({ url: v })}
            errorMessage={showP && problem === 'url' ? t('problem.url') : undefined} />
        )}
        {credInText && <Band tone="warn" size="table" /* noDetails: a check made on this page before anything is sent */>{t('dlg.credInText')}</Band>}
        <Checkbox isSelected={d.requireConfirmation} onChange={(v) => set({ requireConfirmation: v })} label={t('dlg.confirmCalls')} />
        {/* Which tools agents get: no list (all), the names typed, or an empty list (none). A saved list cannot be lifted from
            here yet, so All tools is off on a restricted server, with the reason on the option itself. */}
        <RadioGroup<ToolMode>
          label={t('dlg.tools')}
          value={d.tools}
          onChange={(v) => set({ tools: v, toolsEdited: true })}
          options={[
            { value: 'all', label: t('dlg.tools.all'), ...(locked ? { isDisabled: true, description: t('dlg.tools.allLocked') } : {}) },
            { value: 'only', label: t('dlg.tools.only') },
            { value: 'none', label: t('dlg.tools.none') },
          ]}
        />
        {d.tools === 'only' && (
          <TextField label={t('dlg.toolNames')} description={t('dlg.toolNamesHint')} value={d.toolNames} mono multiline rows={3}
            onChange={(v) => set({ toolNames: v, toolsEdited: true })}
            errorMessage={touched && (toolsP === 'tools_empty' || toolsP === 'tool_name') ? word(t, `problem.${toolsP}`) : undefined} />
        )}
        <Stack gap={2}>
          <Band tone="neutral" size="table">{t(stdio ? 'dlg.envHint' : 'dlg.headersHint', { computer })}</Band>
          {creds.map((c) => (
            <Row key={c.name} gap={2}>
              <span>{c.name}</span>
              <StatusPill tone="neutral">{c.kind === 'removed' ? t('dlg.removing') : c.kind === 'kept' ? t('dlg.kept') : t('dlg.newValue')}</StatusPill>
              {c.kind === 'kept' && <Button size="sm" variant="ghost" onPress={() => setCreds(creds.map((x) => (x.name === c.name ? { name: c.name, kind: 'removed' } : x)))}>{t('dlg.removeValue')}</Button>}
              {c.kind === 'removed' && <Button size="sm" variant="ghost" onPress={() => setCreds(creds.map((x) => (x.name === c.name ? { name: c.name, kind: 'kept' } : x)))}>{t('dlg.keep')}</Button>}
              {c.kind === 'set' && <Button size="sm" variant="ghost" onPress={() => setCreds(creds.filter((x) => x.name !== c.name))}>{t('dlg.removeValue')}</Button>}
            </Row>
          ))}
          <Row gap={2} align="end">
            <TextField label={t('dlg.newName')} value={newName} mono onChange={setNewName} />
            <TextField label={t('dlg.newValue')} value={newValue} type="password" autoComplete="off" onChange={setNewValue} />
            <Button size="sm" variant="secondary" onPress={addCred} isDisabled={newName.trim() === ''}>{t('dlg.addValue')}</Button>
          </Row>
          {clearsAny(cleared) && (
            <Band tone="warn" size="table" /* noDetails: a check made on this page before anything is sent */>{[t('dlg.repoint'), ...clearedLines(cleared, t)].join(' ')}</Band>
          )}
          {showP && (problem === 'env_key' || problem === 'header_key' || problem === 'header_reserved' || problem === 'duplicate_key') && (
            <Band tone="warn" size="table" /* noDetails: a check made on this page before anything is sent */>{word(t, `problem.${problem}`)}</Band>
          )}
        </Stack>
        {folderPlace && orig === null && addScopes.length > 1 && (
          <Select label={t('dlg.savedIn')} options={addScopes.map((s) => ({ value: s, label: word(t, `scope.${s}`) }))} value={scope} onChange={setScope} />
        )}
      </Stack>
    </Dialog>
  );
}

/** One entry as facts (Compare): what it is, what it does, its saved NAMES (never a value), its confirmation and state. */
function ServerFacts({ computer, t, label, s: e }: { computer: string; t: T; label: string; s: McpServer }) {
  return (
    <Stack gap={2}>
      <Band tone="neutral" size="table">{label}</Band>
      <Facts
        columns={1}
        label={label}
        items={[
          { label: t('dlg.kind'), value: word(t, `kind.${e.transport}`) },
          { label: t('col.effect'), value: effectText(effectOf(e), computer, t), wide: true },
          { label: t('dlg.env'), value: e.envKeys.join(', ') || '—' },
          { label: t('dlg.headers'), value: e.headerKeys.join(', ') || '—' },
          { label: t('dlg.confirmCalls'), value: e.requireConfirmation ? '✓' : '—' },
          { label: t('dlg.tools'), value: toolsText(e, t), wide: true },
          { label: t('col.state'), value: e.enabled ? t('state.on') : t('state.off') },
        ]}
      />
    </Stack>
  );
}

/** How many tools agents get from it. The agent counts its last build after the tool list (tool_count), also while it is off
 *  or not connected, and a stopped server's tools are taken away: only a connected, running one gives that count now. */
function offersText(s: McpServer, t: T): string {
  if (s.revoked) return t('details.offersStopped');
  if (s.toolCount === null) return t('details.offersUnknown');
  return s.enabled && s.connected ? t('details.offersCount', { count: s.toolCount }) : t('details.offersIdle', { count: s.toolCount });
}

/** One entry as the latest list shows it: what is saved (names only), which tools agents get, how many it offers, and the last
 *  lines it wrote to its error output (the agent's own tail, secrets redacted by the agent). Reads only. */
function DetailsDialog({ computer, t, s, gone, onClose }: { computer: string; t: T; s: McpServer; gone: boolean; onClose: () => void }) {
  return (
    <Dialog isOpen overlayId="ai.mcp.details" onOpenChange={(o) => { if (!o) onClose(); }} title={t('details.title', { name: s.name })} size="xl" cancelLabel={t('details.close')}>
      <Stack gap={3}>
        {gone && <Band tone="warn" size="table" /* noDetails: the latest list no longer has this entry, not a rejection */>{t('details.gone')}</Band>}
        <ServerFacts computer={computer} t={t} label={t('details.saved', { computer })} s={s} />
        <Facts
          columns={1}
          label={t('details.now')}
          items={[
            { label: t('col.state'), value: stateText(s, t) },
            { label: t('details.offers'), value: offersText(s, t) },
          ]}
        />
        {s.stderrTail ? <CodeBlock code={s.stderrTail} lang="ansi" label={t('details.stderr')} /> : <Band tone="neutral" size="table">{t('details.noStderr')}</Band>}
      </Stack>
    </Dialog>
  );
}

/** The section as the Connections page mounts it: the top bar's computer and realm (one realm only, as GitHub accounts). */
export default function McpServers({ computer }: { computer: string }) {
  const t = useStrings(strings);
  const at = useGitHubAt();
  const shown = useCurrentComputer();
  if (at) return <McpSection computer={computer} target={at.target} realm={at.realm} />;
  return (
    <Widget size="l" title={t('title')}>
      <EmptyState icon="realm" title={t('title')} body={t(shown ? 'allRealms' : 'noComputer')} size="sm" />
    </Widget>
  );
}
