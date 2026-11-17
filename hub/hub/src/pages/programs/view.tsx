// The programs page: the background programs of the selected computer, each row with its one inline action (Start, else
// Restart) and the rest in its ⋯ menu, and an inspector for the selected one. The selection, the filters
// and the search live in the URL, so Back and deep links work.
// Three tabs: Running programs (this page's list), Apps (?tab=apps: the apps launched on
// demand, and Launch an app; the apps page's AppsSection, loaded on demand, with its own app-prefixed URL keys) and
// Ports & aliases (?tab=ports: every open port of the computer and its aliases, parts/PortsTab).
import {
  AgentHint, Button, ComputerLink, ComputerRequired, DataTable, EmptyState, Link, PageFrame, ErrorState, ListDetailPage, PageHeader, Skeleton, StatusPill, When, createColumnHelper,
  followPageLink, useDataView, useGo, usePageLink, useSearchParam, useStringParts, useStrings, UnreachableState, type RowAction,
} from '@kit';
import { reachOf, portAddress, programModel as model, programProof as proves, temporaryStopProves, useAgentScopeFacts, useCan, useChangesVersion, type Target } from '@core';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { launchSearch, loadLauncher } from '../apps/links';
import { links as computersLinks } from '../computers/links';
import { links as guideLinks } from '../guide/links';
import { logsLinkFor } from '../logs/links';
import { links as scriptsLinks } from '../scripts/links';
import { NEW_PARAM } from './links';
import { useNewProgramAsk } from './newAsk';
import { coreHolds, discardPress, dismissPress, errorKind, heldOf, liveHold, readOverview, completePress, useAliases, useComputer, useOpScope, useOverview, usePress, useReceipt, type CoreHold } from './data';
import {
  type Action, type Row, STATE_FILTERS, duration, portText, programAliases, rangeSize, rangeText, searchText, stateTest, tone,
} from './logic';
import { pageFaq } from './faq';
import { Detail, type Confirm } from './parts/Detail';
import { OpNote } from './parts/OpNote';
import { EditNote, useEditProgram } from './parts/EditProgram';
import { editBusy, editStore } from './parts/edit';
import { RemoveNote, useRemoveProgram } from './parts/RemoveProgram';
import { removeBusy, removeStore } from './parts/remove';
import { nameCell, TabsBlock } from './parts/NameCell';
import { PortsTab, type ProgramsTab } from './parts/PortsTab';
import { isHeld, opKey, opsStore, useOps, type Op } from './parts/ops';
import { endsText, stateLabel } from './parts/words';
import strings from './strings.en.json';
import sbStrings from './sandbox/strings.en.json';
import { sandboxColumns } from './sandbox/SandboxChip';
import { NewProgram } from './sandbox/NewProgram';
import { editOut, lifecycleOut, removalOut, sandboxBusy as sandboxBusyNow, useSandboxBusy } from './sandbox/busy';

const col = createColumnHelper<Row>();
const TAB_IDS: readonly ProgramsTab[] = ['running', 'apps', 'ports'];
const AppsSection = lazy(() => loadLauncher().then((m) => ({ default: m.AppsSection })));

// Whether core holds this page's send `hold` names on the row.
const ownHeld = (holds: readonly CoreHold[], rowKey: string, hold: string | undefined) => hold !== undefined && holds.some((h) => h.own && h.rowKey === rowKey && h.hold === hold);

// A change core holds, as the row shows it: this page's own with its token (Check again, Dismiss), another page's
// read-only with its sender.
function opOfHold(h: CoreHold): Op {
  const p = h.press;
  const base = { act: p.action, target: p.target, port: p.port, press: p, status: 'unknown' as const, ...(p.boot !== undefined ? { boot: p.boot } : {}) };
  if (!h.own) return { ...base, from: 'other', ...(h.fromPage ? { fromPage: h.fromPage } : {}) };
  return { ...base, ...(h.hold ? { hold: h.hold } : {}), ...(p.action === 'restart' && h.key ? { key: h.key } : {}) };
}

export default function ProgramsPage() {
  const t = useStrings(strings);
  const tp = useStringParts(strings);
  const ts = useStrings(sbStrings);
  const { items, byId } = pageFaq(t);
  const go = useGo();
  const computer = useComputer();
  const [tab, setTab] = useSearchParam('tab');
  const overview = useOverview();
  const press = usePress();
  const readReceipt = useReceipt();
  const allOps = useOps();
  const scope = useOpScope();
  const part = scope.part;
  // links.newProgram (?new=1): a one-time ask bound to the part and tab it landed on (newAsk.ts).
  const [newParam, setNewParam] = useSearchParam(NEW_PARAM);
  const clearNewParam = useCallback(() => setNewParam(undefined, { replace: true }), [setNewParam]);
  const newAsk = useNewProgramAsk({ param: newParam, clearParam: clearNewParam, part, hasTarget: Boolean(scope.target), tab });
  // A sandbox save of a program that may have gone through holds its actions (the save can itself restart it).
  const sandboxBusy = useSandboxBusy();
  // The changes core holds on this computer (any realm, this page's and other pages'), read from core on every
  // lock move.
  const changes = useChangesVersion();
  const holds = useMemo(() => {
    void changes;
    return coreHolds(scope.target);
  }, [changes, scope.target]);
  // This computer's ops only, by row key, reconciled with core: this page's "may have gone through" counts only
  // while core still holds that send (by its token): proved, dismissed or sent again in another tab, it never
  // masks what core holds now. A held change of this page with no row here (a realm switch, a reload) shows from
  // core with its token, so Check again and the warned Dismiss stay reachable. A change another page holds shows
  // read-only on its program (and blocks every action of it) unless this page's own press there is still working
  // or unconfirmed.
  const ops = useMemo(() => {
    const out = new Map<string, Op>();
    const pre = `${part}|`;
    for (const [k, v] of allOps) {
      if (!k.startsWith(pre)) continue;
      const rk = k.slice(pre.length);
      if (v.status === 'unknown' && !ownHeld(holds, rk, v.hold)) continue;
      out.set(rk, v);
    }
    for (const h of [...holds].sort((a, b) => Number(b.own) - Number(a.own))) {
      if (isHeld(out.get(h.rowKey))) continue;
      out.set(h.rowKey, opOfHold(h));
    }
    return out;
  }, [allOps, part, holds]);
  // The page's own store follows core, read afresh here: a row whose send core no longer holds goes, a Check under
  // way included (its late answer then shows only what it freed itself), and a held change of this page with no
  // row is recorded with its token, so Check again and Dismiss act on it (and on exactly its send).
  const target = scope.target;
  useEffect(() => {
    const now = coreHolds(target);
    const pre = `${part}|`;
    for (const [k, v] of opsStore.snapshot()) {
      if (k.startsWith(pre) && v.status === 'unknown' && !ownHeld(now, k.slice(pre.length), v.hold)) opsStore.clear(k);
    }
    for (const h of now) if (h.own && !isHeld(opsStore.get(opKey(part, h.rowKey)))) opsStore.set(opKey(part, h.rowKey), opOfHold(h));
  }, [holds, allOps, part, target]);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const m = useMemo(() => (overview.data ? model(overview.data) : null), [overview.data]);
  // Remove (programs the person added only; parts/remove.ts): asked from the row menu or the inspector's, confirmed in
  // the inspector's dialog. No removal is asked or sent while another change of the program is held or out.
  const refetchList = useCallback(() => void overview.refetch(), [overview]);
  // Edit (the same programs; parts/edit.ts): its drawer is the inspector's too. An edit and a removal of one program
  // each wait for the other, as both wait for a held start or stop and for a sandbox save. Edit also waits for a start,
  // stop, restart, boot change or a removal of the program out or held in ANY tab (core's lists, sandbox/busy.ts; this
  // tab's stores know only its own sends), as Remove does (parts/RemoveProgram.tsx): the view re-renders on core's
  // change version through useSandboxBusy.
  const edit = useEditProgram({ part, target, rows: m?.rows, refetch: refetchList, blocked: (r) => isHeld(ops.get(r.key)) || sandboxBusy(r.key, r.id) || removeBusy(removeStore.get(opKey(part, r.key))) || lifecycleOut(target, r.key, r.id) || removalOut(target, r.id) });
  const remove = useRemoveProgram({ part, target, rows: m?.rows, refetch: refetchList, blocked: (r) => isHeld(ops.get(r.key)) || sandboxBusy(r.key, r.id) || edit.busy(r.key) });

  // ── Actions (C9: one request per press, never resent) ──────────────────────────────

  const run = useCallback(
    async (row: Row, action: Action, o: { port: number | null; range: boolean; boot?: boolean }, at: { part: string; target: Target }) => {
      const k = opKey(at.part, row.key);
      if (sandboxBusyNow(at.part, at.target, row.key, row.id)) return;
      // A removal of the program that is being sent or is not known yet holds every other action of it.
      if (removeBusy(removeStore.get(k))) return;
      // So does an edit of it (a save can restart the program), this tab's or one out or held in any tab.
      if (editBusy(editStore.get(k)) || (row.key.startsWith('prog:') && editOut(at.target, row.id))) return;
      const cur = opsStore.get(k);
      // A row of this page's whose send core no longer holds blocks nothing (core refuses what it still holds).
      if (isHeld(cur) && !(cur?.status === 'unknown' && !liveHold(cur.press, cur.hold))) return;
      const args = { kind: row.scope === 'temporary' ? 'temp' : 'prog', id: row.id, action, port: o.port, range: o.range, target: at.target, ...(o.boot !== undefined ? { boot: o.boot } : {}) } as const;
      // A change Computers holds on this program blocks every action of it, read straight from core: nothing is
      // sent and nothing flashes "Working" (the row already shows it read-only).
      if (coreHolds(at.target).some((f) => !f.own && f.rowKey === row.key)) return;
      opsStore.set(k, { act: action, target: at.target, port: o.port, status: 'working', press: args, ...(o.boot !== undefined ? { boot: o.boot } : {}) });
      const res = await press(args);
      if (res.outcome === 'done' || res.outcome === 'stale') opsStore.clear(k);
      else if (res.outcome === 'pending') opsStore.patch(k, { status: 'unknown', ...(res.key ? { key: res.key } : {}), ...(res.hold ? { hold: res.hold } : {}) });
      else if (res.outcome === 'not_sent' && res.code === 'HELD_BY_OTHER') opsStore.clear(k);
      else if (res.outcome === 'not_sent' && res.code === 'READ_BACK_FIRST') {
        // HELD_BY_OTHER (a core that names it) and a READ_BACK_FIRST for Computers' hold: the row shows that hold
        // read-only from core, never "not sent".
        // An earlier send of this action (this page's or Computers') may have gone through: held, never "not
        // sent". One Computers sent is its own to check or dismiss (core frees it only for its sender): the row
        // shows it read-only from core. This page's own restart's Check reads its receipt by the key core keeps.
        const held = heldOf(args);
        if (held?.by === 'other') opsStore.clear(k);
        else opsStore.patch(k, { status: 'unknown', ...(action === 'restart' && held?.key ? { key: held.key } : {}), ...(held?.hold ? { hold: held.hold } : {}) });
      } else if (res.outcome === 'not_sent') opsStore.patch(k, { status: 'refused', ...(res.code ? { code: res.code } : {}) });
      else opsStore.patch(k, { status: 'failed', ...(res.code ? { code: res.code } : {}) });
      void overview.refetch();
      return res.outcome;
    },
    [press, overview],
  );

  const selectRef = useRef<(key: string) => void>(() => undefined);
  const select = useCallback((key: string) => selectRef.current(key), []);

  const onAct = useCallback(
    (row: Row, action: Action, o: { port: number | null; range: boolean; boot?: boolean }) => {
      const target = scope.target;
      if (!target) return;
      if (row.scope === 'system' && (action === 'stop' || action === 'restart')) {
        select(row.key);
        setConfirm({ part, key: row.key, act: action, port: o.port, range: o.range });
        return;
      }
      // The press's outcome goes back to the caller (the Sandbox note's Restart now closes on a known 'done').
      return run(row, action, o, { part, target });
    },
    [run, select, part, scope.target],
  );

  // A confirmation belongs to the computer it was asked on: a switch closes it.
  useEffect(() => {
    setConfirm((c) => (c && c.part !== part ? null : c));
  }, [part]);

  const onConfirm = useCallback(() => {
    if (!confirm) return;
    setConfirm(null);
    const target = scope.target;
    // Validate the captured target before sending: same partition, and the row read on it.
    if (!target || confirm.part !== part) return;
    const row = m?.rows.find((r) => r.key === confirm.key);
    if (row) void run(row, confirm.act, { port: confirm.port, range: confirm.range }, { part, target });
  }, [confirm, m, run, part, scope.target]);

  // Check again reads only: it never sends the action a second time. It reads the op's own computer.
  const onCheck = useCallback(
    async (row: Row, shown: Op) => {
      const k = opKey(part, row.key);
      const op = opsStore.get(k);
      // One Check at a time, of the send its control showed (its token): a newer send in the store since then is
      // not this Check's. An answer counts only while its op is still the one shown (no dismiss or new press in
      // between), so a stale answer never completes or discards a newer press. Computers' change is checked on
      // Computers.
      if (shown.status !== 'unknown' || shown.from === 'other') return;
      if (!op || op.status !== 'unknown' || op.checking || op.from === 'other' || op.hold !== shown.hold) return;
      opsStore.patch(k, { checking: true });
      const mine = opsStore.get(k);
      const current = () => opsStore.get(k) === mine;
      if (op.act === 'restart') {
        const held = liveHold(op.press, op.hold);
        // Core no longer holds this op's send (proved or dismissed elsewhere, or sent again: a new token): a receipt
        // of its key says nothing about a newer one. The list shows the real state.
        if (!held) {
          opsStore.clear(k);
          void overview.refetch();
          return;
        }
        const key = op.key ?? held.key;
        const receipt = key ? await readReceipt(row.id, key, op.target) : 'unknown';
        if (!current()) return;
        // Core hears what the check proved before the row frees up (the next press must find it completed: a new request).
        if (receipt === 'completed') {
          // Core's answer decides: a send it did not free is still held, so the row stays (stuck) and shows it.
          const freed = await completePress(op.press, op.hold);
          if (current()) {
            if (freed) opsStore.clear(k);
            else opsStore.patch(k, { checking: false, stuck: true });
          }
        } else if (receipt === 'failed') {
          // It stopped and did not start again: the restart is over, so its key goes with its lock. Freeing it
          // drops the row from core at once (the store follows), so the failure shows when this Check freed it.
          const freed = await discardPress(op.press, op.hold);
          if (freed && (current() || !opsStore.get(k))) opsStore.set(k, { act: op.act, target: op.target, port: op.port, press: op.press, status: 'failed', code: 'START_FAILED' });
          // Core's answer decides, as for a proof: a send it did not free is still held, so the Check ends and the row shows it.
          else if (current()) opsStore.patch(k, { checking: false, stuck: true });
        }
        else if (current()) opsStore.patch(k, { checking: false, stuck: true });
        void overview.refetch();
        return;
      }
      let raw: unknown;
      let next: ReturnType<typeof model> = null;
      try {
        raw = await readOverview(op.target);
        next = model(raw);
      } catch {
        next = null;
      }
      if (!current()) return;
      if (!next) {
        opsStore.patch(k, { checking: false, stuck: true });
        return;
      }
      const after = next.rows.find((r) => r.key === row.key) ?? null;
      // A temporary program's stop is proved only as its declared proves judges it: leaving the list counts
      // only in a read that carries the temporary list at all.
      const proof =
        op.press.kind === 'temp'
          ? temporaryStopProves({ id: op.press.id }, [[raw]]) === 'applied'
          : proves(op.act, after, op.port, op.boot === undefined ? undefined : { boot: op.boot });
      if (proof === 'gone') {
        // The program left the computer: its change can no longer apply, so core lets go of it (key kept).
        const freed = await dismissPress(op.press, op.hold);
        if (freed && (current() || !opsStore.get(k))) opsStore.set(k, { act: op.act, target: op.target, port: op.port, press: op.press, status: 'gone' });
        else if (current()) opsStore.patch(k, { checking: false, stuck: true });
      }
      else if (proof) {
        const freed = await completePress(op.press, op.hold);
        if (current()) {
          if (freed) opsStore.clear(k);
          else opsStore.patch(k, { checking: false, stuck: true });
        }
      } else if (current()) opsStore.patch(k, { checking: false, stuck: true });
    },
    [overview, readReceipt, part],
  );

  // Dismiss on "may have gone through" is the person's "forget it": core frees the held change (key kept). It acts
  // on the op its control showed: that op's hold only, never the store's op at the time,
  // which may be a newer send that landed while the warning was open. True when that send was let go.
  const onDismiss = useCallback(
    async (row: Row, shown: Op): Promise<boolean> => {
      const k = opKey(part, row.key);
      // Computers' change: core frees it only for Computers, so the note stays while core holds it.
      if (shown.from === 'other') return false;
      // A held change goes only when core freed it; an outcome already shown (failed, gone) just closes and frees
      // nothing in core.
      if (shown.status === 'unknown' && !(await dismissPress(shown.press, shown.hold))) return false;
      // The store's row goes only while it is still that send: by token for a held change, by identity otherwise.
      const now = opsStore.get(k);
      const same = shown.status === 'unknown' ? now?.status === 'unknown' && now.hold === shown.hold : now === shown;
      if (same) opsStore.clear(k);
      return true;
    },
    [part],
  );

  // Logs through the shell's page link and the Logs page's own logsLinkFor: inside the Hub the
  // program's output on this computer; a hidden page no Logs control (no classic fallback).
  const logsLink = usePageLink('logs');
  // Computers may be hidden in this Hub: then the stopped-computer message shows without the button.
  const computersLink = usePageLink('computers');
  // The Guide's topics through the shell's page link: the exact place inside the Hub, no button when this load hides
  // the Guide (no classic Guide).
  const guideLink = usePageLink('guide');
  const openGuide = useCallback(() => {
    if (!guideLink) return;
    if (guideLink.kind === 'hub') go(guideLinks.section('topics'));
    else followPageLink(guideLink, go);
  }, [guideLink, go]);
  const handle = computer.data?.handle ?? '';
  // Where a change another page sent is checked or dismissed: on Computers, this computer's Programs tab.
  const senderPath = useCallback((page: string) => (page === 'computers' && handle ? `${computersLinks.item(handle)}&tab=programs` : undefined), [handle]);
  const onLogsCb = useCallback(
    (row: Row, port: number | null) => {
      if (!logsLink) return;
      if (logsLink.kind === 'hub') go(logsLinkFor({ computer: handle, program: row.id, ...(port === null ? {} : { port }) }));
      else followPageLink(logsLink, go);
    },
    [logsLink, handle, go],
  );
  // Create alias: Computers' alias drawer for this computer (links.alias), for one port, or with no port (the Ports &
  // aliases tab's own Create alias), where the person types any port; Computers outside this Hub opens through its page
  // link. Not offered until the computer has a handle, nor on a Hub without Computers, nor in a token session whose
  // token cannot manage aliases (the drawer's create would be refused; the Ports & aliases tab already hides it).
  const canAliases = useCan('resources.proxy_aliases');
  const onAlias = useMemo(
    () =>
      computersLink && handle && canAliases
        ? (port?: number) => {
            if (computersLink.kind === 'hub') go(computersLinks.alias(handle, port));
            else followPageLink(computersLink, go);
          }
        : undefined,
    [computersLink, handle, canAliases, go],
  );
  // That computer's Ports tab on Computers, where an alias is removed (the Ports & aliases tab's Manage on Computers).
  const onManagePorts = useMemo(
    () =>
      computersLink && handle
        ? () => {
            if (computersLink.kind === 'hub') go(computersLinks.ports(handle));
            else followPageLink(computersLink, go);
          }
        : undefined,
    [computersLink, handle, go],
  );
  // What an alias goes to, linked where this Hub has the page: a script on Scripts, a desktop on Computers' Desktop tab;
  // none until the computer has a handle.
  const scriptsLink = usePageLink('scripts');
  const scriptHref = useMemo(
    () => (scriptsLink && handle ? (rootRel: string) => scriptsLinks.script(handle, rootRel) : undefined),
    [scriptsLink, handle],
  );
  const desktopHref = computersLink && handle ? computersLinks.desktop(handle) : undefined;
  // No Logs control until the computer has a handle (its name still loading), nor on a Hub without Logs.
  const onLogs = logsLink && handle ? onLogsCb : undefined;
  // The row's Open computer through the shell's page link: inside the Hub this computer on
  // Computers; none until the computer has a handle, nor when this load hides Computers (the classic
  // branch is unused).
  const openComputerCb = useCallback(() => {
    if (!computersLink) return;
    if (computersLink.kind === 'hub') go(computersLinks.item(handle));
    else followPageLink(computersLink, go);
  }, [computersLink, handle, go]);
  const openComputer = computersLink && handle ? openComputerCb : undefined;

  // A port's address on the computer shown (core builds it as Computers does).
  const addressOf = useCallback((port: number) => (scope.target ? portAddress(scope.target.project, scope.target.container, port) : ''), [scope.target]);

  // ── Table ───────────────────────────────────────────────────────────────────────────

  // A row's ports: a range with how many parts run, or its one port. A single port opens its address in a new tab (the
  // kit Link: a program address is secret by shape, so it is a button that shows only the port number and never puts
  // the address in the page); with no address yet, the number.
  const portsCell = useCallback(
    (r: Row) => {
      if (r.range) return r.parts.length > 0 ? t('ports.range', { range: rangeText(r.range), up: r.partsUp, n: rangeSize(r.range) }) : rangeText(r.range);
      if (r.port === null) return '';
      const url = addressOf(r.port);
      return url ? (
        <Link href={url} variant="nav">
          {portText(r.port)}
        </Link>
      ) : (
        portText(r.port)
      );
    },
    [t, addressOf],
  );

  // How long it has been up, or when a temporary one ends; null with neither.
  const upCell = useCallback(
    (r: Row): ReactNode => {
      if (r.up !== null) return duration(r.up);
      if (r.ends !== null) return <When at={r.ends} text={endsText(t, r.ends)} />;
      return null;
    },
    [t],
  );
  const changeOrPorts = useCallback(
    (r: Row): ReactNode => {
      // Only one of the two can be working or not known (each waits for the other), and that one comes first: its
      // Check again must not sit behind the other's settled refusal.
      const rm = remove.attempt(r.key);
      const ed = edit.attempt(r.key);
      if (ed && (edit.busy(r.key) || !rm)) return <EditNote attempt={ed} compact onCheck={(a) => edit.check(r.key, a)} onDismiss={(a) => edit.dismiss(r.key, a)} />;
      if (rm) return <RemoveNote attempt={rm} compact onCheck={(a) => remove.check(r.key, a)} onDismiss={(a) => remove.dismiss(r.key, a)} />;
      const op = ops.get(r.key);
      return op ? <OpNote op={op} name={r.name} compact onCheck={(o) => void onCheck(r, o)} onDismiss={(o) => onDismiss(r, o)} /> : portsCell(r);
    },
    [ops, onCheck, onDismiss, portsCell, remove, edit],
  );

  const columns = useMemo(
    () => [
      col.accessor('name', {
        header: t('col.name'),
        meta: { pinned: true },
        cell: (c) => {
          const r = c.row.original;
          return nameCell({ attention: !!r.attention, attentionLabel: t('summary.attention', { count: 1 }), name: r.name || t('unnamed') });
        },
      }),
      // List rows only: on a phone row the name keeps line 1 beside the state and truncates first, and the kind
      // leads line 2. A table says the kind once, in its group rows (Temporary programs, System programs).
      col.display({
        id: 'kind',
        header: t('col.kind'),
        meta: { list: 'meta', table: false },
        cell: (c) => {
          const r = c.row.original;
          if (r.scope === 'system') return <StatusPill>{t('systemTag')}</StatusPill>;
          if (r.scope === 'temporary') return <StatusPill>{t('tempTag')}</StatusPill>;
          return null;
        },
      }),
      col.display({
        id: 'state',
        header: t('col.state'),
        meta: { width: '164px', priority: 1, list: 'status' },
        cell: (c) => {
          const r = c.row.original;
          return (
            <StatusPill tone={tone(r.state)} dot>
              {stateLabel(t, r.state, r.exitCode)}
            </StatusPill>
          );
        },
      }),
      // A table cell with nothing to say shows the dash (t('none')), never a blank; a list row leaves the field out,
      // so Up and Ports each have a table column and a list field.
      col.display({
        id: 'up',
        header: t('col.up'),
        // 210: "Ends in 40 minutes (05:48 PM)" needs 206 (as measured).
        meta: { align: 'end', width: '210px', priority: 2, list: false },
        cell: (c) => upCell(c.row.original) ?? t('none'),
      }),
      col.display({
        id: 'upList',
        header: t('col.up'),
        meta: { list: 'meta', table: false },
        cell: (c) => upCell(c.row.original),
      }),
      // The row's last change sent from here while it is in flight (OpNote, C9: working, Unsure with Check again, a
      // failure with Dismiss), else its ports: one place in a table and in a list row, so no column stands empty
      // waiting for a change. Priority 1: the note and its Check again never drop; kit tableFits turns the table into a
      // list first. The row's actions are the kit row actions: one inline (Start, else Restart), the
      // rest in ⋯. 248: "Unsure · Check again" beside the working mark fits without a cut.
      col.display({
        id: 'ports',
        header: t('col.ports'),
        meta: { width: '248px', priority: 1, list: false },
        cell: (c) => changeOrPorts(c.row.original) || t('none'),
      }),
      col.display({
        id: 'portsList',
        header: t('col.ports'),
        meta: { list: 'meta', table: false },
        cell: (c) => changeOrPorts(c.row.original),
      }),
      ...sandboxColumns(col, t('none')),
      col.display({
        id: 'policy',
        header: t('col.policy'),
        meta: { width: '120px', priority: 4 },
        cell: (c) => {
          const p = c.row.original.policy;
          return p === 'always' ? t('policy.always') : p === 'unexpected' ? t('policy.crash') : p === 'never' ? t('policy.once') : t('none');
        },
      }),
      col.display({
        id: 'boot',
        header: t('col.boot'),
        meta: { width: '96px', priority: 3 },
        cell: (c) => {
          const r = c.row.original;
          return r.can.boot || r.boot ? (r.boot ? t('boot.on') : t('boot.off')) : t('none');
        },
      }),
    ],
    [t, upCell, changeOrPorts],
  );

  const view = useDataView<Row>({
    rows: m?.rows,
    columns,
    getRowId: (r) => r.key,
    search: (r) => [searchText(r)],
    filters: [
      { id: 'state', label: t('filter.state'), display: 'segmented', value: (r) => STATE_FILTERS.filter((f) => stateTest(r, f)), options: STATE_FILTERS.map((f) => ({ value: f, label: t(`f.${f}`) })) },
    ],
    pageSize: 50,
    isLoading: overview.isPending,
    error: overview.error,
  });
  selectRef.current = (key) => view.open(key);
  const selected = view.activeId;
  const current = m?.rows.find((r) => r.key === selected);
  // The open program's aliases by port (a small spinner at each port while the first read is out); a failed read shows its
  // own line with Try again. A token without the alias permission reads none (as the Ports & aliases tab): api() would
  // refuse the read unsent (TOKEN_LACKS), and the refusal would show as a failed read whose Try again can never work.
  const aliasRead = useAliases(canAliases);
  const aliasRows = aliasRead.data;
  const currentAliases = useMemo(() => (current && aliasRows ? programAliases(current, aliasRows) : undefined), [current, aliasRows]);

  // ── Page ────────────────────────────────────────────────────────────────────────────

  const name = computer.data?.name ?? '';
  // Reload lives at the right end of the list toolbar; the header's actions are the agent hint and the
  // page's primary, Launch an app: this page's Apps tab with the apps launcher open (launchSearch, the launcher's own
  // URL contract in apps/links), so there is one launcher. The Apps tab sets its own primary over this one.
  const agentFacts = useAgentScopeFacts();
  const hint = <AgentHint page="programs" facts={agentFacts} />;
  const launchApp = () => go(`/programs?${new URLSearchParams({ tab: 'apps', ...launchSearch() })}`);
  // The Running tab's list also offers New program: a secondary beside the primary. Its row opens
  // after the list refresh only if the page is still here, on the part the add was made in.
  const addedPart = useRef(part);
  useEffect(() => {
    addedPart.current = part;
    return () => void (addedPart.current = '');
  }, [part]);
  const onAdded = async (key: string) => {
    const at = addedPart.current;
    await overview.refetch();
    if (key && addedPart.current === at) view.open(key);
  };
  // One accent on screen: while the list is empty its own EmptyState carries Launch an app, so the header's goes.
  const noPrograms = m !== null && m.rows.length === 0;
  const header = (subtitle?: ReactNode, add = false) => ({
    title: t('title'),
    ...(subtitle ? { subtitle } : {}),
    actions: add ? <>{hint}<NewProgram target={scope.target} onAdded={onAdded} startDone={byId.startDone} keepOrOnce={byId.keepOrOnce} openAsked={newAsk.asked} onOpenTaken={newAsk.take} /></> : hint,
    ...(add && noPrograms ? {} : { primary: { label: t('runApp'), icon: 'plus' as const, onPress: launchApp } }),
    // Every page this header heads draws the tab bar (Running / Apps) directly under it.
    tabsFollow: true,
  });

  // No computer shown (All computers): the shared none state, with the pick in place. While the
  // shell's computer list loads or failed, ComputerRequired shows loading or not loaded with Try again, and the header
  // asks for no pick (C9).
  if (computer.data === null) {
    return <ComputerRequired state="none" header={{ title: t('title'), ...(computer.read ? {} : { subtitle: t('subtitle.none') }), actions: hint }} title={t('st.title.noComputer')} body={t('st.pick')} />;
  }
  if (!computer.data.running) {
    return (
      <PageFrame>
        <PageHeader title={t('title')} actions={hint} />
        <EmptyState icon="computer" title={t('st.title.stopped')} body={t('st.stopped', { name })} action={computersLink ? <Button onPress={() => followPageLink(computersLink, go)}>{t('st.openComputers')}</Button> : undefined} />
      </PageFrame>
    );
  }

  // The tab bar right under the header, above either tab's list. What each tab holds is said in a kit place: the
  // Running tab's first question (faq.whatIsProgram) and the Apps tab's header line (subtitle.apps).
  const tabs = <TabsBlock />;
  // Ports & aliases: every open port of the computer and its aliases (reads only; changes open on Computers).
  if (tab === 'ports') {
    const views = {
      label: t('tabs.label'),
      items: TAB_IDS.map((id) => ({ id, label: t(`tab.${id}`) })),
      value: 'ports' as const,
      onChange: (id: ProgramsTab) => setTab(id === 'running' ? undefined : id),
    };
    return <PortsTab header={header(t('subtitle.ports', { name }))} views={views} name={name} target={scope.target} {...(onAlias ? { onAlias } : {})} {...(onManagePorts ? { onManage: onManagePorts } : {})} {...(scriptHref ? { scriptHref } : {})} {...(desktopHref ? { desktopHref } : {})} />;
  }
  if (tab === 'apps') {
    const appsHeader = header(t('subtitle.apps', { name }));
    return (
      <Suspense fallback={<PageFrame><PageHeader {...appsHeader} />{tabs}<Skeleton rows={4} /></PageFrame>}>
        <AppsSection header={appsHeader} toolbar={tabs} />
      </Suspense>
    );
  }

  if (overview.error && !m) {
    const kind = errorKind(overview.error);
    const [title, body] =
      kind === 'private' ? [t('st.title.private'), t('st.private', { name })]
      : kind === 'old' ? [t('st.title.old'), t('st.old', { name })]
      : [undefined, t('st.failed', { name })];
    return (
      <PageFrame>
        <PageHeader {...header(t('subtitle.on', { name }))} />
        {tabs}
        {/* The computer did not answer at all (core reachOf): the shared not-reachable state, never "couldn't read".
            Old version: retrying cannot help, so the Guide's update steps lead. */}
        {reachOf(overview.error) === 'unreachable' ? (
          <UnreachableState
            computer={name || undefined}
            lastSeen={overview.dataUpdatedAt || undefined}
            onRetry={() => void overview.refetch()}
            retrying={overview.isFetching}
            error={overview.error}
            {...(computersLink ? { secondary: <Button onPress={() => followPageLink(computersLink, go)}>{t('st.openComputers')}</Button> } : {})}
          />
        ) : (
        <ErrorState
          {...(title ? { title } : {})}
          body={body}
          {...(kind === 'old' ? {} : { onRetry: () => void overview.refetch() })}
          {...(kind === 'old' && guideLink ? { secondary: <Button variant="primary" onPress={openGuide}>{t('st.oldGuide')}</Button> } : {})}
        />
        )}
      </PageFrame>
    );
  }

  // One count everywhere: the header, the toolbar count and the rows all count every program
  // the computer lists (temporary ones aside); the filters only narrow the rows.
  const c = m?.counts;
  // The computer's name is a link to it; the loading line below stays plain text. The line is live status with a
  // link: it is the header's context row, never its subtitle, a two-line clamp that cut "4 need a look" off beside the
  // header's three buttons (768 px).
  const summary =
    c && m ? (
      <>
        {tp('summary', { count: m.rows.length, name: <ComputerLink name={name} handle={handle} underlined />, running: m.rows.filter((r) => r.state === 'running').length })}
        {c.attention > 0 ? ` · ${t('summary.attention', { count: c.attention })}` : ''}
      </>
    ) : (
      t('loadingOn', { name })
    );

  const sysProblems = c?.systemAttention ?? 0;
  const groups = [
    { id: 'temporary', label: t('group.temporary') },
    {
      id: 'system',
      label: t('group.system'),
      defaultCollapsed: true,
      ...(sysProblems > 0 ? { extra: <StatusPill tone="danger" dot>{t('group.problems', { count: sysProblems })}</StatusPill> } : {}),
    },
  ];

  const empty = (
    <EmptyState
      icon="programs"
      title={t('empty.none.title')}
      body={t('empty.none.body', { name })}
      size="sm"
      action={<Button variant="primary" onPress={launchApp}>{t('runApp')}</Button>}
      {...(guideLink ? { secondary: <Button onPress={openGuide}>{t('empty.guide')}</Button> } : {})}
    />
  );

  // Start, Restart and Stop of one row: the first of Start or Restart it can do is its one inline action, the rest are in
  // ⋯. While its last change is held (or the sandbox is changing), each says why it is off instead of going grey alone.
  const programActions = (r: Row): RowAction[] => {
    const sb = sandboxBusy(r.key, r.id);
    const off = isHeld(ops.get(r.key)) || sb || remove.busy(r.key) || edit.busy(r.key);
    const offProps = off ? { isDisabled: true, disabledReason: sb ? ts('sb.actionsWait') : t('ports.held') } : {};
    const v = { name: r.name || t('unnamed') };
    const main = r.can.start ? 'start' : r.can.restart ? 'restart' : null;
    const act = (a: 'start' | 'restart' | 'stop', icon: 'play' | 'reload' | 'stop'): RowAction => ({
      id: a,
      label: r.range && a !== 'start' ? t(`action.${a}AllName`, v) : t(`action.${a}Name`, v),
      short: t(`action.${a}`),
      icon,
      ...(a === main ? { inline: true } : {}),
      onAction: () => onAct(r, a, { port: null, range: !!r.range }),
      ...offProps,
    });
    return [...(r.can.start ? [act('start', 'play')] : []), ...(r.can.restart ? [act('restart', 'reload')] : []), ...(r.can.stop ? [act('stop', 'stop')] : [])];
  };

  // Edit and Remove, last and apart, only for a program the person added: each opens the inspector, whose drawer
  // (Edit) or dialog (Remove) takes it from there.
  const ownActions = (r: Row): ('-' | RowAction)[] => {
    if (!remove.offers(r)) return [];
    const sb = sandboxBusy(r.key, r.id);
    const off = isHeld(ops.get(r.key)) || sb || remove.busy(r.key) || edit.busy(r.key);
    const offProps = off ? { isDisabled: true, disabledReason: sb ? ts('sb.actionsWait') : t('ports.held') } : {};
    const v = { name: r.name || t('unnamed') };
    return [
      '-',
      { id: 'edit', label: t('action.editName', v), icon: 'pen', opens: true, onAction: () => { select(r.key); edit.ask(r); }, ...offProps },
      { id: 'remove', label: t('action.removeName', v), icon: 'trash', tone: 'danger', opens: true, onAction: () => { select(r.key); remove.ask(r); }, ...offProps },
    ];
  };

  return (
    <ListDetailPage
      mode="side"
      storageKey="programs"
      faq={{ items }}
      header={{ ...header(undefined, true), context: summary }}
      toolbar={tabs}
      list={
        <DataTable
          label={t('title')}
          columns={columns}
          view={view}
          search={t('search')}
          onRetry={() => void overview.refetch()}
          onRowAction={(r) => view.open(r.key)}
          empty={empty}
          countLabel={(n) => t('count', { count: n })}
          onRefresh={() => void overview.refetch()}
          // No Check again here: the row draws its own in every layout (a table's Ports cell, a list row's line 2),
          // so the menu would offer it twice. A table always keeps that cell: it is a
          // priority-1 column beside State, and kit tableFits turns the table into a list before it would drop.
          actions={(r) => [
            ...programActions(r),
            ...(onLogs ? [{ id: 'logs', label: t('action.logsName', { name: r.name || t('unnamed') }), short: t('action.logs'), icon: 'logs' as const, onAction: () => onLogs(r, null) }] : []),
            '-' as const,
            { id: 'copyId', label: t('action.copyId'), icon: 'copy' as const, copy: r.id, onAction: () => undefined },
            ...(openComputer ? [{ id: 'computer', label: t('action.openComputer'), icon: 'computer' as const, onAction: openComputer }] : []),
            ...ownActions(r),
          ]}
          noViewMenu
          // Your programs first with no header, then Temporary, then System collapsed into one group row with its
          // problem count: the system programs are a click away, never a filter.
          groupBy={(r) => (r.scope === 'system' ? 'system' : r.scope === 'temporary' ? 'temporary' : undefined)}
          groups={groups}
          // Remembers which groups are open, so System programs opened, then a program's Logs, then Back, is still open;
          // collapsed until the person opens it.
          storageKey="programs"
        />
      }
      detail={
        selected === undefined ? null : current ? (
          <Detail
            row={current}
            systemFaq={byId.systemPrograms}
            op={ops.get(current.key)}
            confirm={confirm}
            onAct={onAct}
            onConfirm={onConfirm}
            onCancelConfirm={() => setConfirm(null)}
            onCheck={(r, o) => void onCheck(r, o)}
            onDismiss={onDismiss}
            remove={remove}
            edit={edit}
            computer={name}
            {...(onLogs ? { onLogs } : {})}
            senderPath={senderPath}
            addressOf={addressOf}
            {...(onAlias ? { onAlias } : {})}
            {...(currentAliases ? { aliases: currentAliases } : {})}
            {...(aliasRead.error ? { aliasesFailed: { error: aliasRead.error, retry: aliasRead.retry } } : {})}
            aliasesLoading={aliasRead.loading}
            onRefresh={() => {
              void overview.refetch();
              aliasRead.retry();
            }}
          />
        ) : m ? (
          <EmptyState icon="warn" title={t('detail.notFound')} size="sm" />
        ) : null
      }
    />
  );
}
