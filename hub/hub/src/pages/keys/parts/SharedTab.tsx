// Shared access tab: what a share gives, "Share this realm", and the shares that are live or paused now. A share this
// page manages (shareConforms) offers Edit details, Change what they can do and Pause/Resume; any other offers Stop only.
import {
  ActionMenu,
  Band,
  Button,
  ConfirmDialog,
  createColumnHelper,
  DataTable,
  EmptyState,
  ErrorState,
  OutcomeBanner,
  Skeleton,
  StatusPill,
  showToast,
  useDataView,
  useGo,
  useSearch,
  useStrings,
  type OutcomeKind,
  fitWidth,
  statusPillMetrics,
  textWidth,
  useFontsReady,
} from "@kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { capture, useAttemptsVersion, useRealms as useCoreRealms } from "@core";
import {
  anyChangePending,
  elsewhereOfChange,
  heldEditBody,
  heldElsewhere,
  isChangePending,
  useChangesVersion,
  useEditKey,
  useFreshKey,
  useFreshList,
  useKeyList,
  useKeySends,
  useSetEnabled,
  type Change,
  useSettleChange,
  useRealm,
  useRealms,
  useStopShare,
  type Elsewhere,
  NOT_SETTLED,
} from "../data";
import {
  shareColumns,
  shareConforms,
  dismissUnknown,
  ledgerFor,
  settle,
  shareRows,
  status,
  unknownAliases,
  utc,
  PREFIX,
  type LedgerState,
  type ShareField,
  type ShareFieldBody,
  type ShareListRow,
} from "../share-logic";
import { links } from "../links";
import { editProven, RID, type Body } from "../logic";
import type { RawToken } from "../types";
import strings from "../strings.en.json";
import { DismissButton } from "./Dismiss";
import { Frame } from "./Frame";
import { ShareDrawer } from "./ShareDrawer";
import { shareNote } from "./ShareNote";
import { ShareEditDrawer, type ShareSave } from "./ShareEditDrawer";
import { outcomeText, realmName, stopScope } from "./words";
import { ElsewhereLink } from "./Elsewhere";
import s from "./keys.module.css";

/** A stop that may have gone through: this page's (`hold`: core's hold of that send; Check again or Dismiss free
 *  only it), or another page's (`away`: read-only, with that page's link). */
type Unsure = { hold?: string; away?: Elsewhere };

/** A pause, resume or details edit of a share, from the press until it is answered, or, when it may have gone
 *  through, until a fresh read proves it or the person's warned Dismiss ends it (C9). `want`: the state a pause or
 *  resume asked for; `edit`: the body an edit sent (null: a held edit whose body was not recorded). */
type ShareOp =
  | { kind: "busy"; word: "state.pausing" | "state.resuming" | "state.saving" }
  | {
      kind: "unknown";
      want?: boolean;
      edit?: Body | null;
      hold?: string;
      away?: Elsewhere;
      /** What the last Check again found when it proved nothing. */
      said?: { short: string; full: string };
    };
type Unknown = Extract<ShareOp, { kind: "unknown" }>;

const col = createColumnHelper<ShareListRow & { realm: string }>();

/** Ends' floor: the widest a share's end date draws, every digit drawn as the cell font's widest digit. Cells draw
 *  proportional digits (no tabular-nums), so a date with more of a wide digit (a midnight end's zeros) is wider than a
 *  sample date. Digits are compared over a run of 12 (fitWidth rounds up), so a difference under
 *  about a twelfth of a pixel per glyph can tie; a tie keeps the earlier digit, and the date's width is then within that. */
function widestDate(): number {
  const digit = [..."0123456789"].reduce((w, d) => (fitWidth([d.repeat(12)]) > fitWidth([w.repeat(12)]) ? d : w));
  return fitWidth([utc("2000-08-28T08:08:00Z").replace(/\d/g, digit)]);
}

export function SharedTab({ keysCount }: { keysCount?: number }) {
  // The ledger is the account's: it is dropped when the account changes.
  const ACCOUNT = capture().account;
  const settleChange = useSettleChange();
  const changes = useChangesVersion();
  // Core's share holds (any tab): the ledgers take them in on every render.
  const attempts = useAttemptsVersion();
  const t = useStrings(strings);
  const list = useKeyList();
  const freshList = useFreshList();
  const realms = useRealms();
  const { realm: sel } = useRealm();
  // The shell's own realm: "Show all realms" widens this page's list (sel), never what a share link may share.
  const shell = useCoreRealms().selected;
  const stop = useStopShare();
  const setEnabled = useSetEnabled();
  const editKey = useEditKey();
  const freshKey = useFreshKey();
  // Live sends, read at admission (a ref, so an async handler sees the latest render's).
  const sends = useKeySends();
  const sendsNow = useRef(sends);
  sendsNow.current = sends;
  const [ops, setOps] = useState<Record<string, ShareOp>>({});
  const opsNow = useRef(ops);
  opsNow.current = ops;
  const [editing, setEditing] = useState<(ShareListRow & { realm: string }) | null>(null);
  const [replacing, setReplacing] = useState<(ShareListRow & { realm: string }) | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [stopping, setStopping] = useState<{
    id: string;
    /** The shared realm's name, taken when Stop was pressed (its toasts name it after the row is gone). */
    realm: string;
    /** What the confirm may name, taken with the realm (stopScope). */
    scope: { wide: boolean; alias: string | null };
    busy: boolean;
    outcome?: OutcomeKind;
    /** An unconfirmed stop: core's hold of that send (its Check frees only it). */
    hold?: string;
    /** What the dialog's last Check again found when it proved nothing (shown in the dialog, never a toast). */
    said?: string;
  } | null>(null);
  // A stop that may have gone through: true (this page's, Check again or Dismiss), or another page's (read-only).
  const [unknown, setUnknown] = useState<Record<string, Unsure>>({});
  const [checking, setCheckingState] = useState(false);
  // Read synchronously by the guards: a Dismiss confirmed while the banner's Check is out is refused (its read may
  // still settle those shares), and a second Check does not start beside the first.
  const checkingRef = useRef(false);
  const setChecking = (on: boolean) => {
    checkingRef.current = on;
    setCheckingState(on);
  };
  // The shares whose row Check (of a pause, resume or edit) is out: that Check again shows it is busy and its Dismiss
  // is off until the read answers (a Dismiss now could free a change the read is about to settle). State for the
  // render, the ref for the guards. A stop needs none: it is checked in the Stop dialog, which cannot be closed while
  // its Check reads, so the row's Dismiss cannot be reached meanwhile.
  const [checkingIds, setCheckingIds] = useState<ReadonlySet<string>>(new Set());
  const checkingNow = useRef<ReadonlySet<string>>(new Set());
  const markChecking = (id: string, on: boolean) => {
    const next = new Set(checkingNow.current);
    if (on) next.add(id);
    else next.delete(id);
    checkingNow.current = next;
    setCheckingIds(next);
  };
  const [rev, bump] = useState(0);
  const bound = RID.test(sel ?? "");
  const scan = bound ? [sel as string] : (realms ?? []).map((r) => r.id);
  const search = useSearch();
  const go = useGo();
  const [preselect, setPreselect] = useState<string | undefined>(undefined);
  // The realm a link's drawer is bound to: the shell's, when the shell is on one realm.
  const [linkRealm, setLinkRealm] = useState<string | undefined>(undefined);
  // links.shareRealm (`?share=1&open_realm=<id>`, the shell's realm menu): open the drawer once, once the realm list is
  // in. Both keys leave the address so a reload or Back does not reopen it. Only a realm the account lists is
  // picked, and with the shell on one realm only that realm is shared (even after "Show all realms" on this page): a
  // link naming another opens nothing, and so does a shell realm the list lacks. A link made before open_realm says
  // `realm=<id>`: it is read the same way (the shell did not switch for it, so the rule above refuses another realm),
  // and it leaves the address too. A link naming two different realms contradicts itself and opens nothing: while
  // open_realm is in the address this page sees both keys and refuses; the shell drops share=1 with open_realm
  // (shell/realmParam.tsx), so after that the link is no share link here, whichever realm is shown by then.
  const wantShare = search.share;
  useEffect(() => {
    if (wantShare === undefined || realms === undefined) return;
    const want = search.open_realm ?? search.realm;
    const contradicts = search.open_realm !== undefined && search.realm !== undefined && search.open_realm !== search.realm;
    const rest = new URLSearchParams(
      Object.entries(search).filter(([k]) => k !== "share" && k !== "open_realm" && k !== "realm"),
    ).toString();
    go(rest ? `${links.shared}?${rest}` : links.shared, { replace: true });
    // A drawer already open keeps its own pick, send and shown secret: the link opens nothing over it.
    if (drawer || contradicts) return;
    const shellBound = RID.test(shell ?? "");
    if (shellBound ? (want !== undefined && want !== shell) || !realms.some((r) => r.id === shell) : realms.length === 0) return;
    setLinkRealm(shellBound ? shell : undefined);
    setPreselect(!shellBound && realms.some((r) => r.id === want) ? want : undefined);
    setDrawer(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once per link, when the realm list is in
  }, [wantShare, realms === undefined]);
  // One array per list read, ledger change or realm choice: a new one every render rebuilds the table's rows.
  // A share that reaches several realms is one row, under the first realm shown that it reaches.
  const rows = useMemo(() => {
    if (!list.data) return [];
    const seen = new Set<string>();
    return scan.flatMap((r) =>
      shareRows(list.data?.rows ?? [], r, ledgerFor(ACCOUNT, r), Date.now())
        .filter((x) => {
          if (seen.has(x.id)) return false;
          seen.add(x.id);
          return true;
        })
        .map((x) => ({ ...x, realm: r })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, sel, realms, rev, attempts]);
  const states = scan.map((r) => status(ledgerFor(ACCOUNT, r)));
  const cantCheck = states.some((x) => x.state === "cantCheck");
  const lostText = states.some((x) => x.state === "lostSecret");

  /** A share stopped and confirmed: its ledger entries are gone, so Create is not held for it. */
  const markGone = (id: string) => {
    scan.forEach((r) =>
      ledgerFor(ACCOUNT, r).forEach((x) => {
        if (x.state === "lost" && x.id === id) x.state = "gone";
      }),
    );
    bump((n) => n + 1);
  };

  // True only when the read proved every unresolved share of these realms (kit rule: an unknown-outcome toast
  // closes only on true). A list without an unresolved share's alias proves nothing (share-logic settle).
  const check = async (): Promise<boolean> => {
    if (checkingRef.current) return false;
    setChecking(true);
    try {
      return await readShares();
    } finally {
      // A read that throws still ends the check: Dismiss comes back.
      setChecking(false);
    }
  };
  const readShares = async (): Promise<boolean> => {
    // What each ledger held when this read was sent: an entry that became unknown while it was out is not
    // something it can settle.
    const sent = new Map(
      scan.map((id) => [
        id,
        ledgerFor(ACCOUNT, id).map((x): LedgerState => x.state),
      ]),
    );
    const r = await freshList();
    if (r.error || !r.data) return false;
    scan.forEach((id) => {
      const led = ledgerFor(ACCOUNT, id);
      const was = sent.get(id) ?? [];
      settle(
        led,
        was,
        r.data?.rows ?? [],
        r.data?.truncated ?? false,
        Date.now(),
      );
    });
    bump((n) => n + 1);
    return scan.every(
      (id) => status(ledgerFor(ACCOUNT, id)).state === "notFound",
    );
  };

  /** The unresolved creates each realm shows now: what a Dismiss warning opened now would end. */
  const shownShares = scan.map((r) => ({
    realm: r,
    aliases: unknownAliases(ledgerFor(ACCOUNT, r)),
  }));
  /** The person's warned Dismiss of the unresolved shares it was shown (taken when the warning opened): Create is
   *  offered again; one may have been made. One that moved meanwhile stays, and the person is told. */
  const dismissShares = (shown: typeof shownShares) => {
    // A Check is out: its answer may still settle these shares.
    if (checkingRef.current) return;
    const moved: string[] = [];
    for (const x of shown)
      if (!dismissUnknown(ledgerFor(ACCOUNT, x.realm), x.aliases)) moved.push(realmName(realms, x.realm));
    bump((n) => n + 1);
    if (moved.length > 0)
      showToast({ title: t("share.dismissNotSettled", { realm: moved.join(", ") }), tone: "warn" });
  };

  /** Drops a row's unconfirmed stop only while it is still the send `shown` (a later stop keeps its row). */
  const clearStop = useCallback(
    (id: string, shown: Unsure) =>
      setUnknown((u) =>
        u[id]?.hold === shown.hold
          ? Object.fromEntries(Object.entries(u).filter(([k]) => k !== id))
          : u,
      ),
    [],
  );
  /** The person's warned Dismiss of an unconfirmed stop: the share may be stopped already, or still live. `shown`
   *  is the row's stop when the warning opened: only its send's hold is freed. */
  const dismissStop = useCallback(
    async (id: string, realm: string, shown: Unsure) => {
      const away = await settleChange.remove({ id }, shown.hold);
      if (away === NOT_SETTLED) {
        showToast({ title: t("share.notSettled", { realm }), tone: "warn" });
        return;
      }
      if (away) {
        setUnknown((u) =>
          u[id]?.hold === shown.hold ? { ...u, [id]: { ...shown, away } } : u,
        );
        showToast({ title: t("share.heldElsewhere", { realm }), tone: "warn" });
        return;
      }
      clearStop(id, shown);
    },
    [settleChange, t, clearStop],
  );

  // A stop that may have gone through stays unconfirmed when this view is closed and opened again.
  useEffect(() => {
    if (!list.data) return;
    let live = true;
    void (async () => {
      const found: Record<string, Unsure> = {};
      // Nothing held any more clears what was synced before: the change was settled elsewhere.
      if (await anyChangePending("remove"))
        for (const r of list.data?.rows ?? [])
          if (await isChangePending("remove", { id: r.id })) {
            const away = await heldElsewhere("remove", { id: r.id });
            const hold = await settleChange.holdOf.remove({ id: r.id });
            found[r.id] = {
              ...(away ? { away } : {}),
              ...(hold ? { hold } : {}),
            };
          }
      if (live)
        // The same sends keep the same objects (a row's open Dismiss warning stays open); another send of a share
        // (a new hold) is a new entry, and its row's warning closes.
        setUnknown((u) => {
          const same =
            Object.keys(found).length === Object.keys(u).length &&
            Object.keys(found).every(
              (k) =>
                u[k]?.hold === found[k]?.hold &&
                !u[k]?.away === !found[k]?.away &&
                u[k]?.away?.from?.page === found[k]?.away?.from?.page,
            );
          return same ? u : found;
        });
    })();
    return () => {
      live = false;
    };
  }, [list.data, changes, settleChange]);

  // A pause, resume or edit of a share that may have gone through stays unconfirmed when this view is closed and opened
  // again (another tab's too: core's holds are shared), with the body an edit sent.
  useEffect(() => {
    if (!list.data) return;
    let live = true;
    const ids = (list.data.rows ?? []).filter((r) => typeof r.alias === "string" && r.alias.startsWith(PREFIX)).map((r) => r.id);
    void (async () => {
      const found: Record<string, Unknown> = {};
      if (await anyChangePending("setEnabled"))
        for (const id of ids)
          for (const on of [true, false])
            if (await isChangePending("setEnabled", { id, on })) {
              const away = await heldElsewhere("setEnabled", { id, on });
              const hold = await settleChange.holdOf.setEnabled({ id, on });
              found[id] = { kind: "unknown", want: on, ...(away ? { away } : {}), ...(hold ? { hold } : {}) };
            }
      if (await anyChangePending("edit"))
        for (const id of ids)
          if (await isChangePending("edit", { id, body: {} })) {
            const away = await heldElsewhere("edit", { id, body: {} });
            const hold = await settleChange.holdOf.edit({ id, body: {} });
            found[id] = { kind: "unknown", edit: heldEditBody(id) ?? null, ...(away ? { away } : {}), ...(hold ? { hold } : {}) };
          }
      if (!live) return;
      setOps((o) => {
        const next: Record<string, ShareOp> = {};
        // A send on its way stays as it is; a held one keeps what its last Check said while it is still that send.
        for (const [id, v] of Object.entries(o)) if (v.kind === "busy") next[id] = v;
        for (const [id, v] of Object.entries(found)) {
          const was = o[id];
          if (next[id]) continue;
          next[id] = was?.kind === "unknown" && was.hold === v.hold && !was.away === !v.away ? was : v;
        }
        const same = Object.keys(next).length === Object.keys(o).length && Object.entries(next).every(([k, v]) => o[k] === v);
        return same ? o : next;
      });
    })();
    return () => {
      live = false;
    };
  }, [list.data, changes, settleChange]);

  const setOp = (id: string, op: ShareOp | null) =>
    setOps((o) => (op ? { ...o, [id]: op } : Object.fromEntries(Object.entries(o).filter(([k]) => k !== id))));
  /** Clears a row only while it still shows the send `op` (a later send of the share keeps its row). */
  const clearOp = (id: string, op: Unknown) =>
    setOps((o) => {
      const v = o[id];
      return v?.kind === "unknown" && v.hold === op.hold ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== id)) : o;
    });
  /** A Check again that proved nothing says so on its row while the row still shows that send; else a toast. */
  const sayOp = (id: string, op: Unknown, short: string, full: string): false => {
    const cur = opsNow.current[id];
    if (cur?.kind === "unknown" && !cur.away && cur.hold === op.hold)
      setOps((o) => {
        const v = o[id];
        return v?.kind === "unknown" && !v.away && v.hold === op.hold ? { ...o, [id]: { ...v, said: { short, full } } } : o;
      });
    else showToast({ /* noDetails: a read-back finding (not yet, moved, cut), no rejection */ title: full, tone: "warn" });
    return false;
  };
  const nameOf = (r: { realm: string }) => t("share.nameOf", { realm: realmName(realms, r.realm) });

  /** Pause or resume a share. An edit on its way (any key, any tab) or held for this share holds it back; resume needs a
   *  share this page manages. No await before the send: the checks and the send share one tick. */
  const toggleShare = async (r: ShareListRow & { realm: string }, want: boolean) => {
    if (want && !r.conforms) return;
    const code = sendsNow.current.edit ? "KEY_SENDING" : sendsNow.current.heldNow(r.id).edit ? "KEY_BUSY" : null;
    if (code) {
      showToast({ /* noDetails: refused here before any send, no rejection */ title: outcomeText(t, { outcome: "not_sent", code }, nameOf(r), false), tone: "warn" });
      return;
    }
    setOp(r.id, { kind: "busy", word: want ? "state.resuming" : "state.pausing" });
    const c = await setEnabled({ id: r.id, on: want });
    if (c.cancelled) return setOp(r.id, null);
    if (c.outcome === "pending") {
      const away = elsewhereOfChange(c);
      setOp(r.id, { kind: "unknown", want, ...(away ? { away } : {}), ...(c.hold ? { hold: c.hold } : {}) });
      return;
    }
    setOp(r.id, null);
    // Done: the row shows its new state in place (no toast).
    if (c.outcome === "done") void list.refetch();
    // As the Keys tab: a pause or resume that did not change has no row note to show it.
    else showToast({ title: outcomeText(t, c, nameOf(r), false), tone: "info" });
  };

  /** Saves one field of a share's details. Just before the send a fresh read must show the field as the form opened
   *  it, and the share must still conform; otherwise nothing is sent and the form reloads it. */
  const saveShare = async (
    r: ShareListRow & { realm: string },
    field: ShareField,
    opened: RawToken,
    body: ShareFieldBody,
  ): Promise<ShareSave> => {
    const busy = (): Change | null =>
      sendsNow.current.other
        ? { outcome: "not_sent", code: "KEY_SENDING" }
        : sendsNow.current.heldNow(r.id).other
          ? { outcome: "not_sent", code: "KEY_BUSY" }
          : null;
    const first = busy();
    if (first) return first;
    const fresh = await freshList();
    if (fresh.error || !fresh.data) return { outcome: "failed" };
    const now = fresh.data.rows.find((x) => x.id === r.id);
    if (!now) return fresh.data.truncated ? { outcome: "failed" } : { ended: true };
    const key = field === "who" ? "alias" : field === "ends" ? "expires_at" : "ip_whitelist";
    const same = JSON.stringify(now[key] ?? null) === JSON.stringify(opened[key] ?? null);
    if (!same || !shareConforms(now, Date.now())) return { changed: now };
    // The read was awaited: what is live or held at this point is checked again, in the send's own tick.
    const again = busy();
    if (again) return again;
    const sent = body as Body;
    setOp(r.id, { kind: "busy", word: "state.saving" });
    const c = await editKey({ id: r.id, body: sent });
    if (c.outcome === "pending" && c.code === "READ_BACK_FIRST") {
      // Another tab's edit of the share is held: nothing went out from here. The row shows that edit.
      setOp(r.id, { kind: "unknown", edit: heldEditBody(r.id) ?? null, ...(c.hold ? { hold: c.hold } : {}) });
      return { outcome: "not_sent", code: "KEY_BUSY" };
    }
    if (c.outcome === "pending") {
      const away = elsewhereOfChange(c);
      setOp(r.id, { kind: "unknown", edit: sent, ...(away ? { away } : {}), ...(c.hold ? { hold: c.hold } : {}) });
      setEditing(null);
      return c;
    }
    setOp(r.id, null);
    if (c.outcome === "done") {
      setEditing(null);
      showToast({ title: t("share.editSaved", { realm: realmName(realms, r.realm) }), tone: "ok" });
      void list.refetch();
    }
    if (c.outcome === "failed" && c.code === "NOT_FOUND") {
      void list.refetch();
      return { ended: true };
    }
    return c;
  };

  // True only when a fresh read proves the change: the share's state asked for, or every field sent. One still showing
  // the old state proves nothing (the change may still land): it stays unconfirmed, with Check again and Dismiss.
  const checkShareOp = async (r: ShareListRow & { realm: string }, op: Unknown): Promise<boolean> => {
    if (checkingNow.current.has(r.id)) return false;
    markChecking(r.id, true);
    try {
      return await readShareOp(r, op);
    } finally {
      markChecking(r.id, false);
    }
  };
  const readShareOp = async (r: ShareListRow & { realm: string }, op: Unknown): Promise<boolean> => {
    if (op.away) return false;
    const name = nameOf(r);
    const now = await (op.edit !== undefined
      ? settleChange.holdOf.edit({ id: r.id, body: op.edit ?? {} })
      : settleChange.holdOf.setEnabled({ id: r.id, on: op.want === true }));
    if (now !== undefined && now !== op.hold) return sayOp(r.id, op, t("said.moved"), t("op.notSettledOf", { name }));
    let away: Elsewhere | undefined | typeof NOT_SETTLED;
    if (op.edit !== undefined) {
      if (!op.edit) return sayOp(r.id, op, t("said.noBody"), t("op.editNoBody", { name }));
      const got = await freshKey(r.id);
      if (got.error) return sayOp(r.id, op, t("said.readFailed"), t("op.readFailed", { name }));
      if (!editProven(op.edit, got.data)) return sayOp(r.id, op, t("said.notYet"), t("op.editNotYet", { name }));
      away = await settleChange.edit({ id: r.id, body: op.edit }, op.hold);
    } else {
      const got = await freshList();
      if (got.error || !got.data) return sayOp(r.id, op, t("said.readFailed"), t("op.readFailed", { name }));
      const row = got.data.rows.find((x) => x.id === r.id);
      if (!row && got.data.truncated) return sayOp(r.id, op, t("said.cut"), t("op.cutList", { name }));
      if (row && (row.is_enabled === true) !== op.want) return sayOp(r.id, op, t("said.notYet"), t("op.notYet", { name }));
      away = await settleChange.setEnabled({ id: r.id, on: op.want === true }, op.hold);
    }
    if (away === NOT_SETTLED) return sayOp(r.id, op, t("said.moved"), t("op.notSettledOf", { name }));
    if (away) {
      setOps((o) => ({ ...o, [r.id]: { ...op, away } }));
      showToast({ /* noDetails: another page holds the change, no rejection */ title: t("op.heldElsewhereOf", { name }), tone: "warn" });
      return false;
    }
    clearOp(r.id, op);
    void list.refetch();
    return true;
  };

  /** The person's warned Dismiss of a pause, resume or edit that may have gone through: only its send is freed. */
  const dismissShareOp = async (r: ShareListRow & { realm: string }, op: Unknown): Promise<void> => {
    if (op.away) return;
    // That share's Check is out: its answer may still settle this change.
    if (checkingNow.current.has(r.id)) return;
    const away =
      op.edit !== undefined
        ? await settleChange.edit({ id: r.id, body: op.edit ?? {} }, op.hold)
        : await settleChange.setEnabled({ id: r.id, on: op.want === true }, op.hold);
    if (away === NOT_SETTLED) {
      showToast({ /* noDetails: the hold moved meanwhile, no rejection */ title: t("op.notSettledOf", { name: nameOf(r) }), tone: "warn" });
      return;
    }
    if (away) {
      setOps((o) => ({ ...o, [r.id]: { ...op, away } }));
      showToast({ /* noDetails: another page holds the change, no rejection */ title: t("op.heldElsewhereOf", { name: nameOf(r) }), tone: "warn" });
      return;
    }
    clearOp(r.id, op);
    void list.refetch();
  };

  // What the Stop confirm names comes from the stopped share's CURRENT row: a share widened to more realms while the
  // dialog is open says so before Confirm (the stop always deletes the share everywhere). With no row, the scope taken
  // at open stays.
  const stopRowNow = stopping ? rows.find((r) => r.id === stopping.id) : undefined;
  const stopScopeNow = stopRowNow ? stopScope(realms, stopRowNow) : stopping?.scope;

  /** Opens the Stop dialog; a stop that may have gone through opens as unconfirmed, with its read-back. */
  const openStop = useCallback(
    async (id: string, realm: string, scope: { wide: boolean; alias: string | null }) => {
      const unsure = await isChangePending("remove", { id });
      const hold = unsure
        ? await settleChange.holdOf.remove({ id })
        : undefined;
      setStopping({
        id,
        realm,
        scope,
        busy: false,
        ...(unsure ? { outcome: "pending" as const } : {}),
        ...(hold ? { hold } : {}),
      });
    },
    [settleChange],
  );

  const doStop = async () => {
    if (!stopping) return;
    // An edit of the share on its way, or held, holds the stop back (as the Keys tab's Delete). No await before the
    // send: the checks and the send share one tick.
    const code = sendsNow.current.edit ? "KEY_SENDING" : sendsNow.current.heldNow(stopping.id).edit ? "KEY_BUSY" : null;
    if (code) {
      setStopping({ ...stopping, busy: false, outcome: "not_sent", said: outcomeText(t, { outcome: "not_sent", code }, t("share.nameOf", { realm: stopping.realm }), false) });
      return;
    }
    setStopping({ ...stopping, busy: true });
    const r = await stop({ id: stopping.id });
    if (r.cancelled) {
      setStopping({ ...stopping, busy: false });
      return;
    }
    if (r.outcome === "done") {
      showToast({ title: t("share.stopped", { realm: stopping.realm }), tone: "ok" });
      setUnknown((u) =>
        Object.fromEntries(
          Object.entries(u).filter(([k]) => k !== stopping.id),
        ),
      );
      markGone(stopping.id);
      setStopping(null);
      void list.refetch();
    } else if (r.outcome === "pending") {
      const away = elsewhereOfChange(r);
      const hold = r.hold;
      setUnknown((u) => ({
        ...u,
        [stopping.id]: { ...(away ? { away } : {}), ...(hold ? { hold } : {}) },
      }));
      // Another page's stop: its row shows it read-only; this dialog has nothing to check.
      if (away) {
        showToast({ title: t("share.heldElsewhere", { realm: stopping.realm }), tone: "warn" });
        setStopping(null);
      } else
        setStopping({
          ...stopping,
          busy: false,
          outcome: "pending",
          ...(hold ? { hold } : {}),
        });
    } else setStopping({ ...stopping, busy: false, outcome: r.outcome });
  };

  // True only when a fresh, complete read shows the share stopped. One still showing it live proves nothing (the
  // stop may still land): it stays unconfirmed, with Check again here and Dismiss on its row.
  const checkStop = async (): Promise<boolean> => {
    if (!stopping) return false;
    const shown: Unsure = stopping.hold ? { hold: stopping.hold } : {};
    // What the check found when it proved nothing: in the dialog, while it still shows this stop.
    const say = (said: string): false => {
      setStopping((x) => (x && x.id === stopping.id && x.hold === stopping.hold ? { ...x, said } : x));
      return false;
    };
    // Bound to the stop this dialog sent: a later stop of the share is not proved or freed by this read.
    const now = await settleChange.holdOf.remove({ id: stopping.id });
    if (now !== undefined && now !== shown.hold) return say(t("op.notSettled"));
    const hold = shown.hold;
    const r = await freshList();
    if (r.error || !r.data) return say(t("share.stopReadFailed"));
    const row = r.data.rows.find((x) => x.id === stopping.id);
    // A cut list is no proof the share is gone.
    if (!row && r.data.truncated) return say(t("share.stopCut"));
    // Any row still listed, paused or not, proves nothing: only its absence from a complete list does.
    if (row) return say(t("share.stopNotYet"));
    const away = await settleChange.remove({ id: stopping.id }, hold);
    if (away === NOT_SETTLED) return say(t("op.notSettled"));
    if (away) {
      setUnknown((u) => ({ ...u, [stopping.id]: { ...shown, away } }));
      setStopping(null);
      showToast({ title: t("share.heldElsewhere", { realm: stopping.realm }), tone: "warn" });
      return false;
    }
    markGone(stopping.id);
    setStopping(null);
    clearStop(stopping.id, shown);
    showToast({ title: t("share.stopped", { realm: stopping.realm }), tone: "ok" });
    return true;
  };

  // The row actions as of this render, for cells built once per change of what they show.
  const rowActs = useRef({ toggleShare, checkShareOp, dismissShareOp });
  rowActs.current = { toggleShare, checkShareOp, dismissShareOp };
  const cols = useMemo(() => shareColumns(bound), [bound]);
  // Measured columns: Made, Ends and Can take their words' width, Realm (all realms) takes the rest; the action
  // buttons keep their 260 px. The words a Made cell shows, for its cell and its measured width.
  const madeWords = useCallback(
    (r: ShareListRow) => {
      const date = r.made ? utc(r.made) : "";
      // Every row names who it is for (or that it was made for whoever gets the link), so no row is only a date.
      return t("share.madeFor", { who: r.who || t("share.rvNoWho"), date });
    },
    [t],
  );
  // When a share ends is never cut or dropped: Ends fits its whole date and time
  // with a paused share's pill before it (the pill's own measure, statusPillMetrics, plus the --sp-2 gap). Its floor is
  // the widest date (widestDate: cells draw proportional digits): narrower than date + pill, the pill wraps above the
  // date (.shareEnds wraps; the date never breaks). Ends is priority 1 in both layouts (shareColumns), so a table too
  // narrow for that floor becomes the two-line list, which shows "Ends <date>" whole. Both are measured again once the
  // web fonts load (as DataTable's own fit widths are), so a floor measured in a fallback font never stays.
  const fontsReady = useFontsReady();
  const { endsPill, endsFloor } = useMemo(
    () => ({ endsPill: textWidth([t("state.paused")], statusPillMetrics()) + 8, endsFloor: widestDate() }),
    // fontsReady: the faces arrived, so a fallback font's measures are stale (as DataTable's fit widths, LogList).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fontsReady measures again once the web fonts load
    [t, fontsReady],
  );
  const columns = useMemo(
    () => [
      col.accessor("made", {
        id: "made",
        header: t("share.colMade"),
        // The first cell's wider start (16 px, not 12) is the kit's: DataTable pads whichever 'fit' column is drawn first.
        meta: { ...cols.made, size: "fit", fitText: madeWords },
        // Who it was made for (Advanced) leads, so a phone's list row names the share.
        cell: (c) => madeWords(c.row.original),
      }),
      col.accessor((r) => r.ends ?? "", {
        id: "ends",
        header: t("share.colEnds"),
        meta: {
          ...cols.ends,
          size: "fit",
          // Its date, whole. When Ends is drawn first (Made dropped across all realms, or hidden), last (Stop hidden) or
          // alone, the kit adds that edge cell's 4 px (DataTable Edges, table-fit-first-cell-pad), so it is not added here.
          minWidth: endsFloor,
          fitText: (r: ShareListRow) => (r.ends ? utc(r.ends) : ""),
          fitPad: endsPill,
        },
        // A paused share says so first, so a phone's line 2 shows it before the end.
        cell: (c) => {
          const ends = c.getValue() ? utc(c.getValue()) : "";
          return c.row.original.paused ? (
            <span className={s.shareEnds}>
              <StatusPill tone="neutral">{t("state.paused")}</StatusPill>
              {ends}
            </span>
          ) : (
            ends
          );
        },
      }),
      col.accessor((r) => (r.can ? t(`share.start.${r.can}` as "share.start.see") : ""), {
        id: "can",
        header: t("share.colCan"),
        meta: { ...cols.can, size: "fit" },
        enableSorting: false,
      }),
      ...(bound
        ? []
        : [
            col.accessor((r) => realmName(realms, r.realm), {
              id: "realm",
              header: t("share.colRealm"),
              meta: { ...shareColumns(false).realm, size: "fill" },
              // Across all realms Made is no list column, so a phone's row names who it is for here.
              cell: (c) => {
                const realm = String(c.getValue());
                const who = c.row.original.who;
                return who ? t("share.realmFor", { realm, who }) : realm;
              },
            }),
          ]),
      col.display({
        id: "action",
        header: t("share.colAction"),
        enableSorting: false,
        // Stop is the row's list status, so a narrow screen shows the two-line list rather than shed it.
        meta: cols.action,
        cell: (c) => {
          const r = c.row.original;
          const held = unknown[r.id];
          // Another page's stop: that page checks or dismisses it; nothing to press here.
          if (held?.away)
            return (
              <span className={s.shareActions}>
                {shareNote(t("op.heldElsewhere"), t("state.heldElsewhere"))}
                <ElsewhereLink away={held.away} />
              </span>
            );
          const op = ops[r.id];
          return (
            <span className={s.shareActions}>
              {/* A change on its way or held is shown, checked and dismissed whether or not the share still conforms. */}
              {!r.conforms && !op && !held && shareNote(t(r.opens ? "share.notManaged" : "share.cantOpen"), t(r.opens ? "share.notManagedShort" : "share.cantOpenShort"))}
              {!held && op?.kind === "busy" && (
                shareNote(
                  <>
                    <span className={s.pulseDot} aria-hidden="true" />
                    {" "}
                    {t(op.word)}
                  </>,
                )
              )}
              {!held && op?.kind === "unknown" && op.away && (
                <>
                  {shareNote(t("state.heldElsewhere"))}
                  <ElsewhereLink away={op.away} />
                </>
              )}
              {!held && op?.kind === "unknown" && !op.away && (
                <>
                  {op.said ? (
                    <>
                      <StatusPill tone="warn" dot>
                        {op.said.short}
                      </StatusPill>
                      <span className={s.srOnly} role="status">{/* reason: spoken words of the row's last Check, which answers in place */}
                        {op.said.full}
                      </span>
                    </>
                  ) : (
                    shareNote(t("state.unknown"))
                  )}
                  <Button
                    variant="row"
                    size="sm"
                    busy={checkingIds.has(r.id)}
                    onPress={() => void rowActs.current.checkShareOp(r, op)}
                  >
                    {t("state.checkAgain")}
                  </Button>
                  <DismissButton
                    key={op.hold ?? ""}
                    variant="row"
                    isDisabled={checkingIds.has(r.id)}
                    onDismiss={() => rowActs.current.dismissShareOp(r, op)}
                    {...(op.edit !== undefined ? { body: t("dismiss.bodyEdit") } : {})}
                  />
                </>
              )}
              {r.conforms && !held && !op && (
                <ActionMenu
                  size="sm"
                  label={t("share.menu", { realm: realmName(realms, r.realm) })}
                  items={[
                    { id: "edit", label: t("share.editDetails"), opens: true, onAction: () => setEditing(r) },
                    { id: "rights", label: t("share.changeRights"), opens: true, onAction: () => setReplacing(r) },
                    r.paused
                      ? { id: "resume", label: t("share.resume"), onAction: () => void rowActs.current.toggleShare(r, true) }
                      : { id: "pause", label: t("share.pause"), onAction: () => void rowActs.current.toggleShare(r, false) },
                  ]}
                />
              )}
              {r.lost && (
                shareNote(t("share.lostRow"), t("share.lostRowShort"))
              )}
              {unknown[r.id] && (
                shareNote(t("share.stopUnknown"))
              )}
              {held && (
                <DismissButton
                  key={held.hold ?? ""}
                  onDismiss={() => dismissStop(r.id, realmName(realms, r.realm), held)}
                />
              )}
              {/* A stop that may have gone through is checked, never stopped again: its Check again opens the dialog as
                  unconfirmed (its read-back, nothing sent). A lost share (no stop sent) is stopped again, in danger. */}
              <Button
                size="sm"
                tone={r.lost && !unknown[r.id] ? "danger" : "default"}
                onPress={() => void openStop(r.id, realmName(realms, r.realm), stopScope(realms, r))}
              >
                {unknown[r.id]
                  ? t("share.checkStop")
                  : r.lost
                    ? t("share.stopAgain")
                    : t("share.stop")}
              </Button>
            </span>
          );
        },
      }),
    ],
    [t, bound, cols, realms, unknown, ops, checkingIds, dismissStop, openStop, madeWords, endsPill, endsFloor],
  );
  const dv = useDataView<(typeof rows)[number]>({
    rows: list.data ? rows : undefined,
    columns,
    getRowId: (r) => r.id,
    search: (r) => [r.made, r.ends ?? "", realmName(realms, r.realm), r.who ?? ""],
    sort: "-made",
    isLoading: list.isPending,
    error: list.error,
    pageSize: 25,
  });

  let body;
  if (list.isPending) body = <Skeleton variant="table" />;
  else if (list.error)
    body = (
      <ErrorState
        title={t("share.listFailed.title")}
        body={t("share.listFailed.body")}
        error={list.error}
        onRetry={() => void list.refetch()}
      />
    );
  else
    body = (
      <div className={s.shared}>
        <p className={s.sharedLede}>{t("share.header")}</p>
        {cantCheck && (
          <div className={s.heldBanner}>
            <OutcomeBanner
              kind="pending"
              title={t("share.cantCheck")}
              body={t("share.cantCheckBody")}
              onCheck={() => check()}
              checking={checking}
            />
            <span className={s.sshActions}>
              <DismissButton
                key={shownShares
                  .map((x) => `${x.realm}:${x.aliases.join(",")}`)
                  .join("|")}
                isDisabled={checking}
                onDismiss={() => dismissShares(shownShares)}
                body={t("dismiss.bodyShare")}
              />
            </span>
          </div>
        )}
        {lostText && !cantCheck && (
          <OutcomeBanner
            kind="pending"
            title={t("share.lostBanner")}
            body={t("share.lostBannerBody")}
            onCheck={() => check()}
            checking={checking}
          />
        )}
        {list.data?.truncated && (
          <Band size="table">{t("share.truncated")}</Band>
        )}
        <h2 className={s.sectionTitle}>{t("share.active")}</h2>
        <DataTable
          label={t("share.active")}
          columns={columns}
          view={dv}
          onRetry={() => void list.refetch()}
          onRefresh={() => void list.refetch()}
          empty={
            <EmptyState
              icon="share"
              size="sm"
              title={bound ? t("share.empty.title") : t("share.allEmpty.title")}
              body={bound ? t("share.empty.body") : t("share.allEmpty.body")}
              // Its next step in place, the header's own action (the header can sit screens above an empty list).
              action={
                bound || (realms ?? []).length > 0 ? (
                  <Button variant="primary" icon="share" onPress={() => setDrawer(true)}>
                    {bound ? t("action.share") : t("share.titleAll")}
                  </Button>
                ) : undefined
              }
            />
          }
          noMatch={t("share.noMatch")}
          countLabel={(n) => t("share.count", { count: n })}
          storageKey="keys-shared"
        />
      </div>
    );

  return (
    <Frame
      tab="shared"
      primary={{
        // With no realm chosen the drawer asks which one: the button says so too.
        label: bound ? t("action.share") : t("share.titleAll"),
        icon: "share",
        isDisabled: !bound && (realms ?? []).length === 0,
        onPress: () => setDrawer(true),
      }}
      counts={{ keys: keysCount, shared: list.data ? rows.length : undefined }}
    >
      {body}
      {editing && (
        <ShareEditDrawer
          key={editing.id}
          share={editing.raw}
          realm={realmName(realms, editing.realm)}
          onClose={() => setEditing(null)}
          onSave={(field, opened, body) => saveShare(editing, field, opened, body)}
        />
      )}
      {replacing && (
        <ShareDrawer
          key={replacing.id}
          realms={realms}
          realm={replacing.realm}
          ledgerOf={(r) => ledgerFor(ACCOUNT, r)}
          onClose={() => setReplacing(null)}
          onChanged={() => void list.refetch()}
          replace={{
            raw: replacing.raw,
            onStopOld: () => void openStop(replacing.id, realmName(realms, replacing.realm), stopScope(realms, replacing)),
          }}
        />
      )}
      {drawer && (
        <ShareDrawer
          realms={realms}
          realm={linkRealm ?? (bound ? (sel as string) : "all")}
          preselect={preselect}
          ledgerOf={(r) => ledgerFor(ACCOUNT, r)}
          onClose={() => {
            setDrawer(false);
            setPreselect(undefined);
            setLinkRealm(undefined);
          }}
          onChanged={() => void list.refetch()}
        />
      )}
      <ConfirmDialog
        isOpen={!!stopping}
        onOpenChange={(o) => !o && setStopping(null)}
        title={
          stopScopeNow?.wide
            ? t("share.stopTitleWide")
            : stopScopeNow?.alias
              ? t("share.stopTitle", { realm: stopScopeNow.alias })
              : t("share.stopTitleNoName")
        }
        body={stopScopeNow?.wide ? t("share.stopConfirmWide") : t("share.stopConfirm")}
        confirmLabel={t("share.stopGo")}
        tone="danger"
        busy={stopping?.busy}
        // A refused stop is the dialog's failed outcome line, which the kit announces as an alert. A stop that was not sent
        // says why in the same slot, announced at once too (outcomeAlert): the reason is something the person must hear.
        outcome={
          stopping?.outcome === "pending"
            ? { kind: "pending", ...(stopping.said ? { message: stopping.said } : {}) }
            : stopping?.outcome === "failed"
              ? { kind: "failed", message: t("share.stopFailed") }
              : stopping?.outcome === "not_sent" && stopping.said
                ? { kind: "not_sent", message: stopping.said }
                : undefined
        }
        outcomeAlert
        onCheck={() => checkStop()}
        onConfirm={() => void doStop()}
      />
    </Frame>
  );
}
