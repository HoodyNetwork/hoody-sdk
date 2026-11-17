// The shell's live data: realms, computers, account, bell count and sign-out, read from core for the
// shown session (fixture core in hub:dev and tests, the real session in a live Hub). AppShell mounts
// <LiveShellData> around itself, so every shell part and every page using useShellData() sees it.
// - Realms: core's realm list (names are aliases or short ids, never a full id); picking one runs
//   core's realm switch (through switchOp.ts, so the switch line can cancel it), which tears down and re-reads
//   everything under the new realm. switchingTo is the switch in progress, shown once it has run 300 ms.
// - Computers: GET /computers under the current realm (core's realm scope), only the selected realm's rows
//   kept (the browser filter when realm hosts are off). Picking one is core's
//   chooseComputer (shown everywhere and remembered per account). The shell's own picks below pass { auto: true }:
//   they are not the person's choice, so core's computerChoiceRev does not move. With no current computer, the
//   remembered or first running one is chosen. A current computer the selected realm's list
//   does not hold (chosen in another realm, or its realms changed) is chosen again from that list, or dropped
//   (core's dropComputer keeps the remembered id) when nothing there can be picked. Every answer that has not failed is
//   handed to core's noteComputerRows: the routing evidence of its computers, and the target's own server_name follows its row.
// - Sign-out: core's logout, the only path that clears the session (and purges registered keys), asked first
//   through requestSignOut while the account has changes that may have gone through.
// - Bots waiting: core's count for the Bots badge (sidebar, phone bar); unset while core does not know. A rise of it
//   alerts once (notify/botAlert).
// - AI chats nobody is looking at: core's chat-attention observer (GET /gates page 1 every 30 s while visible, and the
//   chats left running), mounted here once so the AI dot (ask useAskWaiting) lights on every page. It alerts nothing.
import { type ReactNode, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { chooseComputer, chooseNoComputer, computerColor, defineQuery, dropComputer, noteComputerRows, pickComputer, useCore, useRealms } from '@core';
import { containersRoute, notificationSummary, onNotificationSummary, switchRevision, useBotsWaitingRead, useChatAttention } from '@core/shell';
import { countryFlag } from '@kit/format';
import { useStrings } from '@kit/strings';
import { useBotWaitingAlert } from './notify/botAlert';
import { refreshRealms } from './realmsRefresh';
import { requestSignOut } from './signOut';
import { ShellDataProvider, type ShellComputer, type ShellData, type ShellRealm } from './context';
import { startSwitch } from './switchOp';
import strings from './strings.en.json';

/** A realm switch shows only once it has run this long, so a fast one never flashes. */
export const SWITCH_SHOW_MS = 300;

/**
 * Core's switch target as the shell shows it, only once a switch has run SWITCH_SHOW_MS (so a fast one never
 * flashes). A run is one stretch of core showing a switch pending:
 * - A newer pick inside it (core's switchRevision moves) follows at once when the run already shows, and otherwise
 *   keeps the run's delay. It belongs to the generation it started in.
 * - It hides once the generation moved with no switch started since. Such a probe is dead (a suspension), and core
 *   clears its `switching` only when that probe ends (realm.ts stale()).
 * - A switch that commits, fails or is cancelled clears core's `switching`. So a retry after any of them, even to the
 *   same realm, is a new run with its own delay.
 */
function useShownSwitch(target: string | null, gen: number): string | undefined {
  const rev = target === null ? null : switchRevision();
  const [run, setRun] = useState<{ first: number; rev: number; target: string; gen: number; shown: boolean } | null>(null);
  // Derived from core while rendering, so the run always matches what core shows.
  if (target === null || rev === null) {
    if (run !== null) setRun(null);
  } else if (run === null) setRun({ first: rev, rev, target, gen, shown: false });
  else if (run.rev !== rev) setRun({ ...run, rev, target, gen });
  else if (run.target !== target) setRun({ ...run, target });
  const waiting = run !== null && !run.shown ? run.first : null;
  useEffect(() => {
    if (waiting === null) return;
    // A run that ends or restarts changes `waiting`, so the cleanup drops its timer.
    const id = setTimeout(() => setRun((r) => (r ? { ...r, shown: true } : r)), SWITCH_SHOW_MS);
    return () => clearTimeout(id);
  }, [waiting]);
  return target !== null && run !== null && run.shown && run.rev === rev && run.target === target && run.gen === gen ? target : undefined;
}

interface ContainerWire {
  id: string;
  name?: string;
  status?: unknown;
  project_id?: string;
  server_name?: string;
  realm_ids?: string[];
  color?: string;
  server?: { city?: string; country?: string; country_name?: string; name?: string };
}

const containersQuery = defineQuery(containersRoute, {
  input: () => ({ query: { page: 1, limit: 100 } }),
  // `whole`: this one page is the realm's whole list (no later page), so a computer it lacks is not in the realm.
  select: (r): { list: ContainerWire[]; whole: boolean } => {
    const d = (r as { data?: { computers?: unknown; pagination?: { totalPages?: unknown } } } | null)?.data;
    // A body with no list is a read error (the query's error state), never a whole list of zero (core computersPage: BAD_LIST).
    if (!Array.isArray(d?.computers)) throw { kind: 'unavailable', status: 0, code: 'BAD_LIST' };
    const raw: unknown[] = d.computers;
    // A row that is not an object with an id (null, {}, {id: 123}) is no computer: it is dropped here, once, so no reader
    // of this list (the picker, pickComputer, core's bots) can throw on it and blank the Hub.
    const list = raw.filter((c): c is ContainerWire => !!c && typeof c === 'object' && !Array.isArray(c) && typeof (c as { id?: unknown }).id === 'string' && (c as { id: string }).id !== '');
    const pages = d.pagination?.totalPages;
    // No usable pagination: a full page is not known to be the whole list (the same rule as core's computersPage).
    // Counted on the raw page, so a dropped row never makes a full page read as whole.
    return { list, whole: typeof pages === 'number' ? pages <= 1 : raw.length < 100 };
  },
  staleTime: 30_000,
});

/** A row's text field as text: the shell draws these as React children and labels, so anything else (an object, a
 *  number from a malformed row) reads as none. */
const textOf = (v: unknown): string => (typeof v === 'string' ? v : '');

function cappedOf(): boolean {
  return notificationSummary()?.is_capped === true;
}

function unreadOf(): number | undefined {
  const s = notificationSummary();
  return s ? s.unread_count : undefined;
}

export function LiveShellData({ children }: { children: ReactNode }) {
  const t = useStrings(strings);
  const core = useCore();
  const realmsView = useRealms();
  const rows = containersQuery.use(undefined, { enabled: core.account !== null && !core.loggingOut });
  const unreadCapped = useSyncExternalStore(
    (l) => onNotificationSummary(() => l()),
    cappedOf,
    cappedOf,
  );
  const unread = useSyncExternalStore(
    (l) => onNotificationSummary(() => l()),
    unreadOf,
    unreadOf,
  );

  useChatAttention();
  const botsRead = useBotsWaitingRead();
  const botsWaiting = botsRead?.count;
  const botsWaitingAtLeast = botsRead?.atLeast ?? false;
  // A Bot that starts waiting: one browser alert per rise of the count, for a person who has looked away (notify/botAlert).
  useBotWaitingAlert(botsWaiting, `${core.account ?? ''}\u0000${core.realm}`);
  const switchingTo = useShownSwitch(core.switching, core.gen);
  // The selected realm's computers. The query is keyed by the realm (undefined until that realm answers), but the
  // answer is the realm's only behind a realm host: with realm host scoping off it is the whole account's and the
  // Hub filters in the browser (core/realm filterRows). pickComputer holds that one filter: asked for a row by its
  // own id it answers the row only when the selected realm holds it (stopped too). The picker, setComputer and the
  // effect below all read this list, so they agree on what the realm holds.
  const realmRows = rows.data?.list;
  const realm = core.realm;
  const containers = useMemo(() => realmRows?.filter((c) => pickComputer([c], { realm, remembered: c.id }) === c), [realmRows, realm]);
  // Whole means whole as of a read that has not failed since: TanStack keeps the old answer beside a failed refetch's error, and
  // absence from those rows must not drop or re-pick the person's computer.
  const whole = rows.data?.whole === true && !rows.error;
  // Each answer that has not failed since is the latest accepted row of every computer it holds (core noteComputerRows): a row
  // that withholds its server_name suspends new requests to the computer, and the current target follows its row's routing node.
  // A failed refetch (TanStack keeps the old answer beside its error) or a list without the computer changes nothing.
  const answered = rows.error ? undefined : rows.data?.list;
  const account = core.account;
  useEffect(() => { if (answered) noteComputerRows(account, answered); }, [answered, account]);
  // No computer shown yet: choose the remembered one, else the first running one. Not when the person chose none
  // (All computers): core remembers that choice and pickComputer returns null for it. A computer shown that the
  // realm's list does not hold is chosen again from it, or dropped when nothing there can be picked; with more
  // pages the list cannot tell, so it stays. Held means in the list the picker shows, so a computer the person
  // picks is never taken back.
  useEffect(() => {
    if (!containers) return;
    const shown = core.target?.container.id;
    if (shown) {
      if (!whole || containers.some((c) => c.id === shown)) return;
      const pick = pickComputer(containers);
      if (pick) chooseComputer(pick, { auto: true });
      else dropComputer();
      return;
    }
    if (containers.length === 0) return;
    const pick = pickComputer(containers);
    if (pick) chooseComputer(pick, { auto: true });
  }, [core.target, containers, whole]);
  // Whether the realm's list is known (C9: an unknown list never reads as none). Known once rows came, or a whole
  // list answered zero and no read since failed (TanStack keeps the old answer beside a failed refetch's error).
  // Otherwise loading while a read runs (or none has answered yet; fetching wins over a held error), else unknown:
  // the read failed, or an empty first page of a longer list may hide the realm's computers on a later page.
  const listKnown = !!containers && (containers.length > 0 || (whole && !rows.error));
  const computersRead: ShellData['computersRead'] = listKnown ? undefined : rows.isFetching || (!rows.data && !rows.error) ? 'loading' : 'unknown';
  const refetchComputers = rows.refetch;

  const value = useMemo<ShellData>(() => {
    const realms: ShellRealm[] = (realmsView.rows ?? []).map((r) => ({
      id: r.id,
      name: r.name.kind === 'alias' || r.name.kind === 'short' ? r.name.text : t('top.realmAll'),
      color: r.tint || undefined,
      computers: r.computers,
    }));
    const computers: ShellComputer[] = (containers ?? []).map((c) => ({
      id: c.id,
      name: textOf(c.name) || textOf(c.server_name) || t('top.computerUnnamed'),
      location: [textOf(c.server?.city), textOf(c.server_name)].filter(Boolean).join(' · ') || undefined,
      flag: countryFlag(c.server?.country) || undefined,
      running: String(c.status ?? '').toLowerCase() === 'running',
      // Only a normalised hex reaches the shell; anything else is no colour, so no mark.
      color: computerColor(c) ?? undefined,
    }));
    const id = core.identity;
    // The account's display name first (alias), else its username, else its email.
    const name = id?.alias || id?.username || id?.email;
    return {
      realms,
      realmId: realmsView.selected,
      setRealm: realmsView.pinned === null ? (r: string) => void startSwitch(r).done : undefined,
      refreshRealms: realmsView.pinned === null ? () => refreshRealms(core.gen) : undefined,
      switchingTo,
      computers,
      computersRead,
      retryComputers: () => refetchComputers(),
      computerId: core.target?.container.id,
      setComputer: (cid: string) => {
        const c = containers?.find((x) => x.id === cid);
        if (c) chooseComputer(c);
      },
      // Core remembers the choice, so no list answer picks a computer again until the person does.
      clearComputer: () => void chooseNoComputer(),
      account: name ? { name, detail: id?.email && id.email !== name ? id.email : undefined } : undefined,
      signOut: () => requestSignOut(),
      unread,
      unreadCapped,
      botsWaiting,
      botsWaitingAtLeast,
    };
  }, [realmsView, containers, computersRead, refetchComputers, core.identity, core.target, core.gen, switchingTo, unread, unreadCapped, botsWaiting, botsWaitingAtLeast, t]);

  return <ShellDataProvider value={value}>{children}</ShellDataProvider>;
}
