// API keys tab: the list with its inspector, New key, Edit, Copy, Pause/Resume and Delete.
// Changes never retry. An unknown answer reads the list back; nothing is sent twice.
import {
  Band,
  Button,
  ConfirmDialog,
  createColumnHelper,
  DataTable,
  EmptyState,
  Link,
  useGo,
  usePageLink,
  usePageShortcuts,
  ListDetailPage,
  Shortcut,
  showToast,
  closeToast,
  RowNote,
  StatusPill,
  Tag,
  useDataView,
  useSearch,
  useStrings,
  type OutcomeKind,
  type RowActionEntry,
} from "@kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { links } from "../links";
import {
  anyChangePending,
  useKeySends,
  elsewhereOfChange,
  heldEditBody,
  heldElsewhere,
  isChangePending,
  useChangesVersion,
  useEditKey,
  useFreshKey,
  useFreshList,
  useSettleChange,
  useKeyList,
  useRealm,
  useRealms,
  useRemoveKey,
  useSetEnabled,
  useTemplates,
  type Change,
  type Elsewhere,
  NOT_SETTLED,
} from "../data";
import {
  accessChoices,
  accessLabel,
  canEdit,
  copyableIn,
  catalogue,
  editProven,
  endsBucket,
  findByHandle,
  handleOf,
  inRealmCount,
  normToken,
  RID,
  searchText,
  view,
  type Body,
} from "../logic";
import { PREFIX, shareConforms } from "../share-logic";
import { pageFaq } from "../faq";
import strings from "../strings.en.json";
import type { Key, KeyRow } from "../types";
import { CopyKeyDrawer } from "./CopyKeyDrawer";
import { DismissButton } from "./Dismiss";
import { EditKeyDrawer } from "./EditKeyDrawer";
import { Frame } from "./Frame";
import { KeyInspector, type Lineage, STATE_TONE } from "./KeyInspector";
import { NewKeyDrawer } from "./NewKeyDrawer";
import {
  accessChoice,
  accessText,
  dayUtc,
  localTime,
  outcomeText,
  realmName,
  type K,
} from "./words";
import { ElsewhereLink } from "./Elsewhere";
import s from "./keys.module.css";

/** `del`: the change is a delete that may have gone through (it outlives the dialog it was sent from). `edit`: an
 *  edit, with the body its hold records (what Check again reads back); null when the hold records none, so no read
 *  can prove it and only the warned Dismiss ends it. */
type Op = {
  kind: "pausing" | "resuming" | "saving" | "unknown";
  want: boolean;
  del?: true;
  edit?: Body | null;
  /** An unconfirmed change another page holds: read-only here, with that page's link. */
  away?: Elsewhere;
  /** Core's hold of the send this row shows (MutationResult.hold, or holdOf when synced): Check and Dismiss free
   *  only that send, never a later one of the key (another tab's replacement, the opposite want included). */
  hold?: string;
  /** What the last Check again of this send found when it proved nothing (the change may still go through, or no
   *  read could tell): shown on the row and in the inspector, never as a toast. */
  said?: Said;
};
/** A Check again that proved nothing: `short` on the row (warn), `full` in the inspector and the Delete dialog. */
type Said = { short: string; full: string };
type Drawer =
  | { kind: "new"; realm: string | undefined }
  | { kind: "copy"; key: Key }
  | { kind: "edit"; key: Key }
  | null;
interface Del {
  key: Key;
  outcome?: OutcomeKind;
  code?: string;
  busy: boolean;
  /** An unconfirmed delete: core's hold of that send (its Check frees only it). */
  hold?: string;
  /** What the dialog's last Check again found when it proved nothing. */
  said?: string;
}

const col = createColumnHelper<KeyRow>();

const badgesOf = (t: ReturnType<typeof useStrings<typeof strings>>, k: Key) =>
  [
    k.managed === "boot" && t("badge.boot"),
    k.managed === "realm" && t("badge.realm"),
    k.ips.length === 1 && t("badge.ips", { ips: k.ips[0] as string }),
    k.ips.length > 1 && t("badge.ipsMany", { count: k.ips.length }),
    k.delegates && t("badge.delegates"),
  ].filter(Boolean) as string[];

export function KeysTab({ sharedCount }: { sharedCount?: number }) {
  const t = useStrings(strings);
  // The name the page says for a key: a key saved with no name is "Unnamed key" (its row, its title, its messages).
  const nameOf = (k: Key) => k.name || t("unnamed");
  const list = useKeyList();
  const freshList = useFreshList();
  const settleChange = useSettleChange();
  // Live sends, read at admission (a ref, so an async handler sees the latest render's).
  const sends = useKeySends();
  const sendsNow = useRef(sends);
  sendsNow.current = sends;
  const guideLink = usePageLink("guide");
  const changes = useChangesVersion();
  const templates = useTemplates();
  const realms = useRealms();
  const { realm: sel, showAll } = useRealm();
  const setEnabled = useSetEnabled();
  const editKey = useEditKey();
  const freshKey = useFreshKey();
  const removeKey = useRemoveKey();
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [del, setDel] = useState<Del | null>(null);
  const [ops, setOps] = useState<Record<string, Op>>({});
  // What each row shows now, read after an await: a Check or Dismiss clears its row only while it is still the
  // send it acted on.
  const opsNow = useRef(ops);
  opsNow.current = ops;
  // Each local write to a row's op is stamped: a sync from core that began before it is older news and must not
  // undo it (it would drop a fresh "Not confirmed", or bring back one just checked; the next sync is current).
  const opSeq = useRef(0);
  const opAt = useRef<Record<string, number>>({});
  const setOp = (id: string, op: Op | null) => {
    opAt.current[id] = ++opSeq.current;
    setOps((o) =>
      op
        ? { ...o, [id]: op }
        : Object.fromEntries(Object.entries(o).filter(([x]) => x !== id)),
    );
  };

  const cat = useMemo(
    () => (templates.data ? catalogue(templates.data) : null),
    [templates.data],
  );
  const keys = useMemo(
    () =>
      list.data
        ? list.data.rows.map((r) => normToken(r, cat, Date.now()))
        : undefined,
    [list.data, cat],
  );
  // Shares the Shared tab manages (shareConforms). Any other share is not paused, resumed or copied here either: the
  // Shared tab offers it Stop only, so here it keeps Delete alone.
  const conforming = useMemo(
    () => new Set((list.data?.rows ?? []).filter((r) => shareConforms(r, Date.now())).map((r) => r.id)),
    [list.data],
  );
  const unmanaged = (k: Key) => k.name.startsWith(PREFIX) && !conforming.has(k.id);
  // The same, from the list as read now: a Try again pressed after a refetch judges the share as it is then.
  const unmanagedNow = useRef(new Set<string>());
  unmanagedNow.current = new Set((keys ?? []).filter(unmanaged).map((k) => k.id));
  // /auth/tokens lists every key: in a realm the list is narrowed to the keys that work there.
  const scoped = useMemo(
    () => (keys ? view(keys, sel) : undefined),
    [keys, sel],
  );
  const bound = RID.test(sel ?? "");
  const total = keys ? inRealmCount(keys, sel) : 0;

  const refresh = () => void list.refetch();

  // The realm the drawer was opened for is the one it makes keys for: when the shell's realm changes, a New key
  // drawer closes instead of keeping a form for the old one.
  useEffect(() => {
    setDrawer((d) => (d?.kind === "new" && d.realm !== sel ? null : d));
  }, [sel]);

  // links.create (`?new=1`, Home's first steps): opens the New key drawer once, for the shell's realm. The key leaves
  // the address so a reload or Back does not reopen it; a drawer already open keeps its own form.
  const search = useSearch();
  const go = useGo();
  const wantNew = search.new;
  useEffect(() => {
    if (wantNew === undefined) return;
    const rest = new URLSearchParams(
      Object.entries(search).filter(([k]) => k !== "new"),
    ).toString();
    go(rest ? `${links.list}?${rest}` : links.list, { replace: true });
    setDrawer((d) => d ?? { kind: "new", realm: sel });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once per link
  }, [wantNew]);

  usePageShortcuts([
    {
      key: "n",
      label: t("short.new"),
      enabled: !drawer && !del,
      run: () => setDrawer({ kind: "new", realm: sel }),
    },
  ]);

  // A pause or resume that may have gone through stays unconfirmed when this view is closed and opened again:
  // core still holds it, so the row says so and offers the read-back.
  useEffect(() => {
    if (!keys) return;
    let live = true;
    const began = opSeq.current;
    void (async () => {
      const found: Record<string, Op> = {};
      // Nothing held any more clears what was synced before: the change was settled elsewhere.
      if (await anyChangePending("setEnabled"))
        for (const k of keys)
          for (const on of [true, false])
            if (await isChangePending("setEnabled", { id: k.id, on })) {
              const away = await heldElsewhere("setEnabled", { id: k.id, on });
              const hold = await settleChange.holdOf.setEnabled({
                id: k.id,
                on,
              });
              found[k.id] = {
                kind: "unknown",
                want: on,
                ...(away ? { away } : {}),
                ...(hold ? { hold } : {}),
              };
            }
      if (await anyChangePending("remove"))
        for (const k of keys)
          if (await isChangePending("remove", { id: k.id })) {
            const away = await heldElsewhere("remove", { id: k.id });
            const hold = await settleChange.holdOf.remove({ id: k.id });
            found[k.id] = {
              kind: "unknown",
              want: k.enabled,
              del: true,
              ...(away ? { away } : {}),
              ...(hold ? { hold } : {}),
            };
          }
      // An edit is held per key (its lock is the key alone); the body sent comes from the hold.
      if (await anyChangePending("edit"))
        for (const k of keys)
          if (await isChangePending("edit", { id: k.id, body: {} })) {
            const away = await heldElsewhere("edit", { id: k.id, body: {} });
            const hold = await settleChange.holdOf.edit({ id: k.id, body: {} });
            found[k.id] = {
              kind: "unknown",
              want: k.enabled,
              edit: heldEditBody(k.id) ?? null,
              ...(away ? { away } : {}),
              ...(hold ? { hold } : {}),
            };
          }
      if (live)
        setOps((o) => {
          // What core still holds replaces what was synced before; a send in flight here stays, and so does
          // any row written here after this sync began (its answer is newer than what this sync read).
          const fresh = (id: string) => (opAt.current[id] ?? 0) > began;
          const next = {
            ...Object.fromEntries(
              Object.entries(o).filter(
                ([id, v]) => v.kind !== "unknown" || fresh(id),
              ),
            ),
            ...Object.fromEntries(
              Object.entries(found).filter(([id]) => !fresh(id)),
            ),
          };
          // The same entries keep the same object: a new one rebuilds the table and its buttons under the pointer.
          // Another send of the key (a new hold) is a new entry: the row's open Dismiss warning closes with it.
          const keep =
            Object.keys(next).length === Object.keys(o).length &&
            Object.keys(next).every(
              (id) =>
                o[id]?.kind === next[id]?.kind &&
                o[id]?.want === next[id]?.want &&
                o[id]?.del === next[id]?.del &&
                JSON.stringify(o[id]?.edit) === JSON.stringify(next[id]?.edit) &&
                o[id]?.hold === next[id]?.hold &&
                o[id]?.away?.from?.page === next[id]?.away?.from?.page &&
                !o[id]?.away === !next[id]?.away,
            );
          if (keep) return o;
          // A rebuilt list keeps what the last Check said of a send it still shows (the same hold, still unknown).
          for (const [id, v] of Object.entries(next)) {
            const was = o[id];
            if (was?.said && v !== was && v.kind === "unknown" && was.kind === "unknown" && v.hold === was.hold && !v.away)
              next[id] = { ...v, said: was.said };
          }
          return next;
        });
    })();
    return () => {
      live = false;
    };
  }, [keys, changes, settleChange]);

  /** Opens the Delete dialog (a delete that may have gone through is on its row, with Check again, instead). */
  const openDelete = (k: Key) => setDel({ key: k, busy: false });

  /** An edit on its way (any key, any tab) or held for the key (any tab) holds a pause, resume or delete back:
   *  nothing is sent until it is answered or settled. Synchronous: the caller awaits nothing before it, and calls its
   *  send in the same tick, so nothing can go live or become held between this check and the send. */
  const editFirst = (k: Key): boolean => {
    const code = sendsNow.current.edit ? "KEY_SENDING" : sendsNow.current.heldNow(k.id).edit ? "KEY_BUSY" : null;
    if (!code) return false;
    showToast({ title: outcomeText(t, { outcome: "not_sent", code }, nameOf(k), false), tone: "warn" });
    return true;
  };

  // Whether this tab shows now. Its effect cleanup (an unmount, or a hide) ends it, and closes the Try again toasts
  // it showed: a retry is offered, and sent, only while the tab that shows its answer is on screen.
  const live = useRef(true);
  const retries = useRef(new Set<string>());
  useEffect(() => {
    live.current = true;
    const open = retries.current;
    return () => {
      live.current = false;
      for (const key of open) closeToast(key);
      open.clear();
    };
  }, []);
  /** `want`: what to ask for (default: the opposite of what the row shows). Try again passes the failed press's own
   *  want, so a new send asks for the same thing even if the list moved meanwhile. */
  const toggle = async (k: Key, want = !k.enabled): Promise<void> => {
    // A Try again left over from a tab that has gone sends nothing.
    if (!live.current) return;
    // No await before the send: the checks and the send share one tick.
    if (editFirst(k)) return;
    if (unmanagedNow.current.has(k.id)) return;
    setOp(k.id, { kind: want ? "resuming" : "pausing", want });
    const r = await setEnabled({ id: k.id, on: want });
    if (r.cancelled) {
      // The sign-in-code prompt was cancelled: nothing was sent, nothing to say.
      setOp(k.id, null);
      return;
    }
    if (!live.current) {
      // Answered after the tab went: no row shows it and nothing is offered that sends. A change that may have gone
      // through says so, with Keys to check it (its row shows it held, with Check again); a failure says so, with
      // Keys to press again there; not sent or stale only says so. Done says so quietly, with nothing to press: the
      // answer has no place on screen now (the row shows it when Keys is next open).
      if (r.outcome === "pending")
        showToast({
          title: t("op.latePending", { name: nameOf(k) }),
          tone: "unknown",
          action: { label: t("op.checkOnKeys"), onAction: () => go(links.list) },
        });
      else if (r.outcome === "failed")
        showToast({
          title: outcomeText(t, r, nameOf(k), false),
          tone: "error",
          action: { label: t("op.openKeys"), onAction: () => go(links.list) },
        });
      else if (r.outcome === "done") showToast({ title: t(want ? "op.lateResumed" : "op.latePaused", { name: nameOf(k) }), tone: "ok" });
      else showToast({ title: outcomeText(t, r, nameOf(k), false), tone: "info" });
      return;
    }
    if (r.outcome === "pending") {
      const away = elsewhereOfChange(r);
      setOp(k.id, {
        kind: "unknown",
        want,
        ...(away ? { away } : {}),
        ...(r.hold ? { hold: r.hold } : {}),
      });
      return;
    }
    setOp(k.id, null);
    // Done: the row's pill shows the new state in place (no toast).
    if (r.outcome === "done") refresh();
    else if (r.outcome === "failed") {
      // Nothing went through: Try again is the person's new press, a new send (never a replay of this one).
      const key = showToast({
        title: outcomeText(t, r, nameOf(k), false),
        tone: "error",
        action: {
          label: t("action.tryAgain"),
          onAction: () => {
            retries.current.delete(key);
            return toggle(k, want);
          },
        },
      });
      retries.current.add(key);
    } else showToast({ title: outcomeText(t, r, nameOf(k), false), tone: "info" });
  };

  /** Sends an edit once. Done: saved; may have gone through: the drawer closes into the row's held state (Check
   *  again, a warned Dismiss); not sent or refused: the drawer stays open with the reason (the answer is returned). */
  const saveEdit = async (k: Key, body: Body): Promise<Change> => {
    // A pause, resume or delete on its way (any key, any tab) or held for this key (any tab, an already-open drawer
    // included): nothing is sent. No await before the send: the checks and the send share one tick, so nothing can go
    // live or become held between them.
    if (sendsNow.current.other) return { outcome: "not_sent", code: "KEY_SENDING" };
    if (sendsNow.current.heldNow(k.id).other) return { outcome: "not_sent", code: "KEY_BUSY" };
    setOp(k.id, { kind: "saving", want: k.enabled, edit: body });
    const r = await editKey({ id: k.id, body });
    const name = (body.alias ?? k.name) || t("unnamed");
    if (r.outcome === "pending" && r.code === "READ_BACK_FIRST") {
      // Another tab's edit of the key is held: nothing went out from here. The row shows that edit, with the body
      // its hold records (never this unsent one); the drawer stays open, saying nothing was sent.
      const held = heldEditBody(k.id);
      setOp(k.id, {
        kind: "unknown",
        want: k.enabled,
        edit: held ?? null,
        ...(r.hold ? { hold: r.hold } : {}),
      });
      return { outcome: "not_sent", code: "KEY_BUSY" };
    }
    if (r.outcome === "pending") {
      const away = elsewhereOfChange(r);
      setOp(k.id, {
        kind: "unknown",
        want: k.enabled,
        edit: body,
        ...(away ? { away } : {}),
        ...(r.hold ? { hold: r.hold } : {}),
      });
      setDrawer((d) => (d?.kind === "edit" && d.key.id === k.id ? null : d));
      return r;
    }
    setOp(k.id, null);
    if (r.outcome === "done") {
      setDrawer((d) => (d?.kind === "edit" && d.key.id === k.id ? null : d));
      showToast({ title: t("done.edited", { name }), tone: "ok" });
      refresh();
    }
    return r;
  };

  // True only when a fresh, complete read proved the change (kit rule: an unknown-outcome toast closes only on
  // true). Only a read showing the state asked for (paused/resumed, or the key gone) proves it: one showing the
  // old state proves nothing, since the change may still land, so it stays unconfirmed with Check again and Dismiss.
  /** Another page holds the change (core freed nothing): it stays on its row read-only, with that page's link. */
  const heldThere = (id: string, name: string, op: Op, away: Elsewhere): false => {
    setOp(id, { ...op, kind: "unknown", away });
    showToast({ title: t("op.heldElsewhereOf", { name }), tone: "warn" });
    return false;
  };
  const notSettled = (name: string): false => {
    showToast({ title: t("op.notSettledOf", { name }), tone: "warn" });
    return false;
  };
  /** A Check again that proved nothing says so on the row it was pressed on, while the row still shows that send
   *  (`op`). A row that moved meanwhile (another send of the key) has nowhere to show it: a toast says it. */
  const sayHeld = (id: string, op: Op, short: string, full: string): false => {
    if (!sayRow(id, op, short, full)) showToast({ title: full, tone: "warn" });
    return false;
  };
  /** Puts a Check's finding on the row while it still shows the send `op`; false when it shows another. */
  const sayRow = (id: string, op: Op, short: string, full: string): boolean => {
    const cur = opsNow.current[id];
    if (cur?.kind !== "unknown" || cur.away || cur.hold !== op.hold) return false;
    const said = { short, full };
    setOps((o) => {
      const v = o[id];
      return v?.kind === "unknown" && !v.away && v.hold === op.hold ? { ...o, [id]: { ...v, said } } : o;
    });
    return true;
  };
  /** Clears a row only while it still shows the send `op` (a later send of the key keeps its row). */
  const clearShown = (id: string, op: Op) => {
    if (opsNow.current[id]?.hold !== op.hold) return;
    opAt.current[id] = ++opSeq.current;
    setOps((o) =>
      o[id]?.hold === op.hold
        ? Object.fromEntries(Object.entries(o).filter(([x]) => x !== id))
        : o,
    );
  };
  /** Core's hold for the change `op` shows is still that send's (or none: something freed it). Otherwise a later
   *  send holds it, and nothing read here proves or frees it. */
  const stillThatSend = async (id: string, op: Op): Promise<boolean> => {
    const now = await (op.edit !== undefined
      ? settleChange.holdOf.edit({ id, body: op.edit ?? {} })
      : op.del
        ? settleChange.holdOf.remove({ id })
        : settleChange.holdOf.setEnabled({ id, on: op.want }));
    return now === undefined || now === op.hold;
  };
  // `shown` is the row's op when Check was pressed: the read proves that send (its want), and frees only its hold.
  // The keys whose Check is out: that row's Check again shows it is busy and its Dismiss is off until the read
  // answers (a Dismiss now could free a change the read is about to settle). Read synchronously by the guards.
  const [checkingIds, setCheckingIds] = useState<ReadonlySet<string>>(new Set());
  const checkingNow = useRef<ReadonlySet<string>>(new Set());
  const markChecking = (id: string, on: boolean) => {
    const next = new Set(checkingNow.current);
    if (on) next.add(id);
    else next.delete(id);
    checkingNow.current = next;
    setCheckingIds(next);
  };
  const checkOp = async (k: Key, shown?: Op): Promise<boolean> => {
    if (checkingNow.current.has(k.id)) return false;
    markChecking(k.id, true);
    try {
      return await readOp(k, shown);
    } finally {
      markChecking(k.id, false);
    }
  };
  const readOp = async (k: Key, shown?: Op): Promise<boolean> => {
    const op = shown ?? ops[k.id];
    if (op?.kind !== "unknown" || op.away) return false;
    if (!(await stillThatSend(k.id, op)))
      return sayHeld(k.id, op, t("said.moved"), t("op.notSettledOf", { name: nameOf(k) }));
    const hold = op.hold;
    if (op.edit !== undefined) {
      // A hold that records no body: no read can prove it; only the warned Dismiss ends it.
      if (!op.edit)
        return sayHeld(k.id, op, t("said.noBody"), t("op.editNoBody", { name: nameOf(k) }));
      // Only a fresh read of the key showing every field sent proves the edit (editProven); anything else, a
      // failed read included, keeps it held.
      const got = await freshKey(k.id);
      if (got.error)
        return sayHeld(k.id, op, t("said.readFailed"), t("op.readFailed", { name: nameOf(k) }));
      if (!editProven(op.edit, got.data))
        return sayHeld(k.id, op, t("said.notYet"), t("op.editNotYet", { name: nameOf(k) }));
      const away = await settleChange.edit({ id: k.id, body: op.edit }, hold);
      if (away === NOT_SETTLED)
        return sayHeld(k.id, op, t("said.moved"), t("op.notSettledOf", { name: nameOf(k) }));
      if (away) return heldThere(k.id, nameOf(k), op, away);
      // Proved: the row shows the saved key in place (no toast).
      clearShown(k.id, op);
      refresh();
      return true;
    }
    const r = await freshList();
    const row = r.data?.rows.find((x) => x.id === k.id);
    if (r.error || !r.data)
      return sayHeld(k.id, op, t("said.readFailed"), t("op.readFailed", { name: nameOf(k) }));
    // A cut list does not show a missing key as gone: the change stays unconfirmed.
    if (!row && r.data.truncated) {
      // The cut read is the list shown now, and the key is not in it: its row is gone from view, so the finding is a
      // toast (the change stays held; the row shows it again once the key is listed).
      showToast({ title: t("op.cutList", { name: nameOf(k) }), tone: "warn" });
      return false;
    }
    if (op.del) {
      if (row)
        return sayHeld(k.id, op, t("said.notYet"), t("del.notYet", { name: nameOf(k) }));
      const away = await settleChange.remove({ id: k.id }, hold);
      if (away === NOT_SETTLED)
        return sayHeld(k.id, op, t("said.moved"), t("op.notSettledOf", { name: nameOf(k) }));
      if (away) return heldThere(k.id, nameOf(k), op, away);
      clearShown(k.id, op);
      showToast({ title: t("done.deleted", { name: nameOf(k) }), tone: "ok" });
      if (current?.id === k.id) dv.open(undefined);
      refresh();
      return true;
    }
    if (row && (row.is_enabled === true) !== op.want)
      return sayHeld(k.id, op, t("said.notYet"), t("op.notYet", { name: nameOf(k) }));
    const away = await settleChange.setEnabled({ id: k.id, on: op.want }, hold);
    if (away === NOT_SETTLED)
      return sayHeld(k.id, op, t("said.moved"), t("op.notSettledOf", { name: nameOf(k) }));
    if (away) return heldThere(k.id, nameOf(k), op, away);
    clearShown(k.id, op);
    // Proved: the row's pill shows the new state in place. A key no longer listed has no row: a toast says so.
    if (!row) showToast({ title: t("op.gone", { name: nameOf(k) }), tone: "info" });
    refresh();
    return true;
  };

  /** The person's warned Dismiss of an unconfirmed pause, resume or delete: it may have gone through. `op` is the
   *  row's op when the warning opened: only its send's hold is freed; on false the row stays (moved meanwhile). */
  const dismissOp = async (k: Key, op: Op | undefined): Promise<boolean> => {
    if (!op || op.kind !== "unknown" || op.away) return false;
    if (checkingNow.current.has(k.id)) return false;
    const away = op.edit !== undefined
      ? await settleChange.edit({ id: k.id, body: op.edit ?? {} }, op.hold)
      : op.del
        ? await settleChange.remove({ id: k.id }, op.hold)
        : await settleChange.setEnabled({ id: k.id, on: op.want }, op.hold);
    if (away === NOT_SETTLED) return notSettled(nameOf(k));
    if (away) return heldThere(k.id, nameOf(k), op, away);
    clearShown(k.id, op);
    refresh();
    return true;
  };

  const doDelete = async () => {
    if (!del) return;
    // No await before the send: the checks and the send share one tick.
    if (editFirst(del.key)) return;
    setDel({ ...del, busy: true });
    const r = await removeKey({ id: del.key.id });
    if (r.cancelled) {
      setDel({ ...del, busy: false });
      return;
    }
    if (r.outcome === "done") {
      showToast({
        title: t("done.deleted", { name: nameOf(del.key) }),
        tone: "ok",
      });
      setDel(null);
      dv.open(undefined);
      refresh();
    } else {
      // A delete that may have gone through stays on its row after the dialog is closed.
      const away = elsewhereOfChange(r);
      if (r.outcome === "pending" && away) {
        // Another page's change holds this key: only that page can check or dismiss it, so the dialog offers
        // nothing here (no Check again); the row shows it read-only with that page's link.
        setDel(null);
        heldThere(
          del.key.id,
          nameOf(del.key),
          { kind: "unknown", want: del.key.enabled, del: true },
          away,
        );
        return;
      }
      const hold = r.outcome === "pending" ? r.hold : undefined;
      if (r.outcome === "pending")
        setOp(del.key.id, {
          kind: "unknown",
          want: del.key.enabled,
          del: true,
          ...(hold ? { hold } : {}),
        });
      setDel({
        ...del,
        busy: false,
        outcome: r.outcome,
        code: r.code,
        ...(hold ? { hold } : {}),
      });
    }
  };

  // The dialog's Check again shares the row's guard (checkingNow): no second read while one is out for the key, and
  // the row's Check again and Dismiss show it busy until this read answers.
  const checkDelete = async (): Promise<boolean> => {
    if (!del || checkingNow.current.has(del.key.id)) return false;
    const id = del.key.id;
    markChecking(id, true);
    try {
      return await readDelete();
    } finally {
      markChecking(id, false);
    }
  };
  const readDelete = async (): Promise<boolean> => {
    // True only when a fresh, complete read shows the key gone. A cut or failed read proves nothing, and neither
    // does one still listing it (the delete may still land): the row keeps Check again and Dismiss.
    if (!del) return false;
    const op: Op = {
      kind: "unknown",
      want: del.key.enabled,
      del: true,
      ...(del.hold ? { hold: del.hold } : {}),
    };
    // What the check found when it proved nothing: in the dialog (while it still shows this delete) and on the row.
    const say = (short: string, full: string): false => {
      setDel((d) => (d && d.key.id === del.key.id && d.hold === del.hold ? { ...d, said: full } : d));
      sayRow(del.key.id, op, short, full);
      return false;
    };
    // Bound to the delete this dialog sent: a later send of the key is not proved or freed by this read.
    if (!(await stillThatSend(del.key.id, op))) return say(t("said.moved"), t("op.notSettledOf", { name: nameOf(del.key) }));
    const hold = del.hold;
    const r = await freshList();
    if (r.error || !r.data)
      return say(t("said.readFailed"), t("op.readFailed", { name: nameOf(del.key) }));
    const present = r.data.rows.some((x) => x.id === del.key.id);
    if (present) return say(t("said.notYet"), t("del.notYet", { name: nameOf(del.key) }));
    // A cut list is no proof the key is gone.
    if (r.data.truncated) return say(t("said.cut"), t("op.cutList", { name: nameOf(del.key) }));
    const away = await settleChange.remove({ id: del.key.id }, hold);
    if (away === NOT_SETTLED) return say(t("said.moved"), t("op.notSettledOf", { name: nameOf(del.key) }));
    if (away) {
      setDel(null);
      return heldThere(
        del.key.id,
        nameOf(del.key),
        { kind: "unknown", want: del.key.enabled, del: true },
        away,
      );
    }
    clearShown(del.key.id, op);
    setDel(null);
    showToast({
      title: t("done.deleted", { name: nameOf(del.key) }),
      tone: "ok",
    });
    return true;
  };

  const stateCell = (k: Key) => {
    const op = ops[k.id];
    // Another page's change: that page checks or dismisses it.
    if (op?.kind === "unknown" && op.away)
      return (
        <span className={`${s.stateCell} ${s.stateWrap}`}>
          <span>{t("state.heldElsewhere")}</span>
          <ElsewhereLink away={op.away} />
        </span>
      );
    if (op?.kind === "unknown")
      return (
        <span className={`${s.stateCell} ${s.stateWrap}`}>
          {op.said ? (
            // The last Check proved nothing: a warn on the row; its full words are read out and shown in the inspector.
            <>
              <StatusPill tone="warn" dot>
                {op.said.short}
              </StatusPill>
              <span className={s.srOnly} role="status">{/* reason: spoken words of the row's last Check, which answers in place with no toast */}
                {op.said.full}
              </span>
            </>
          ) : (
            <span>{t("state.unknown")}</span>
          )}
          <Button
            variant="row"
            size="sm"
            busy={checkingIds.has(k.id)}
            onPress={() => void checkOp(k, op)}
          >
            {t("state.checkAgain")}
          </Button>
          <DismissButton
            key={op.hold ?? ""}
            variant="row"
            isDisabled={checkingIds.has(k.id)}
            onDismiss={() => dismissOp(k, op)}
            {...(op.edit !== undefined ? { body: t("dismiss.bodyEdit") } : {})}
          />
        </span>
      );
    if (op)
      return (
        <span className={s.stateCell}>
          <span className={s.pulseDot} aria-hidden="true" />
          {t(
            op.kind === "saving"
              ? "state.saving"
              : op.kind === "pausing"
                ? "state.pausing"
                : "state.resuming",
          )}
        </span>
      );
    return (
      <StatusPill tone={STATE_TONE[k.state]} dot>
        {t(`state.${k.state}`)}
      </StatusPill>
    );
  };

  const columns = useMemo(
    () => [
      col.accessor((r) => r.key.name, {
        id: "name",
        header: t("col.name"),
        // Measured columns: Key, Works on, Access and Ends take their words' width (declared widths stay their
        // floors), the name takes the rest; Tags and State draw tags, pills and buttons and keep their widths.
        meta: { pinned: true, size: "fill" },
        cell: (c) => (
          <span className={s.nameCell}>
            {c.row.original.key.name ? (
              <span className={s.nameLine}>{c.row.original.key.name}</span>
            ) : (
              // A key saved with no name: the kit's muted item meta says so, never a made-up name.
              <RowNote cut>{t("unnamed")}</RowNote>
            )}
          </span>
        ),
      }),
      // The notes (boot key, IP limits, can make keys) are their own column, so a list row keeps one line of
      // name and one of facts instead of tags laid over them.
      col.accessor((r) => badgesOf(t, r.key).join(" "), {
        id: "tags",
        header: t("col.tags"),
        enableSorting: false,
        meta: { width: "220px", priority: 4 },
        cell: (c) => {
          const badges = badgesOf(t, c.row.original.key);
          return badges.length > 0 ? (
            <span className={s.badges}>
              {badges.map((b) => (
                <Tag key={b}>{b}</Tag>
              ))}
            </span>
          ) : null;
        },
      }),
      col.accessor((r) => r.key.prefix, {
        id: "key",
        header: t("col.key"),
        // Priority 4: the prefix gives way before the end date (an 80-column table otherwise lost Ends first).
        meta: { width: "110px", priority: 4, size: "fit", mono: true, fitText: (r: KeyRow) => t("prefixShort", { prefix: r.key.prefix }) },
        cell: (c) => (
          <span className={s.mono}>
            {t("prefixShort", { prefix: c.getValue() })}
          </span>
        ),
      }),
      col.accessor((r) => (r.key.allRealms ? "" : r.key.realms.join(",")), {
        id: "works",
        header: t("col.works"),
        meta: {
          width: "150px",
          priority: 2,
          size: "fit",
          fitText: (r: KeyRow) => (r.key.allRealms ? t("allRealms") : r.key.realms.map((x) => realmName(realms, x)).join(", ")),
        },
        cell: (c) => {
          const k = c.row.original.key;
          return k.allRealms ? (
            <span className={s.muted}>{t("allRealms")}</span>
          ) : (
            <span>{k.realms.map((r) => realmName(realms, r)).join(", ")}</span>
          );
        },
      }),
      col.accessor((r) => accessText(t, r.key), {
        id: "access",
        header: t("col.access"),
        meta: { width: "130px", priority: 4, size: "fit" },
      }),
      col.accessor((r) => r.key.endsAt ?? "", {
        id: "ends",
        header: t("col.ends"),
        meta: { width: "120px", priority: 3, size: "fit", fitText: (r: KeyRow) => (r.key.endsAt ? dayUtc(r.key.endsAt) : t("never")) },
        cell: (c) => {
          const k = c.row.original.key;
          return k.endsAt ? (
            <span title={t("endsLocal", { when: localTime(k.endsAt) })}>
              {dayUtc(k.endsAt)}
            </span>
          ) : (
            <span className={s.muted}>{t("never")}</span>
          );
        },
      }),
      col.accessor((r) => r.key.state, {
        id: "state",
        header: t("col.state"),
        // Priority 1: State gives way last (after Works in). A narrow table or an 80-column terminal otherwise dropped it,
        // and with it a paused or expired key's mark.
        // wraps: a key whose change is not confirmed shows its words with Check again and Stop tracking (or, held by
        // another page, that page's link), which do not fit the cell on one line; they wrap inside the cell instead.
        meta: { width: "140px", priority: 1, wraps: true, listWraps: true },
        cell: (c) => stateCell(c.row.original.key),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, realms, ops, checkingIds],
  );

  /** In a realm only a key of exactly that realm is copied (the copy keeps the source's realms). */
  const copyOk = (k: Key) => copyableIn(k, bound ? sel : undefined);

  const actions = (r: KeyRow): readonly RowActionEntry[] => {
    const k = r.key;
    const off = !r.editable || !!ops[k.id];
    const own = !unmanaged(k);
    // Every disabled item says why (the kit's menu rule): read-only here, a change in flight, expired, not copyable here.
    const op = ops[k.id];
    const offWhy = !r.editable
      ? t("band.readonly")
      : op?.kind === "unknown"
        ? op.away
          ? t("op.heldElsewhereOf", { name: nameOf(k) })
          : t("act.why.unknown", { name: nameOf(k) })
        : op
          ? t("act.why.busy", { name: nameOf(k) })
          : undefined;
    return [
      ...(own
        ? [
            {
              id: "toggle",
              label: k.enabled ? t("act.pause") : t("act.resume"),
              icon: k.enabled ? ("pause" as const) : ("play" as const),
              key: "p",
              isDisabled: off || k.state === "expired",
              disabledReason: offWhy ?? (k.state === "expired" ? t("act.why.expired", { name: nameOf(k) }) : undefined),
              onAction: () => void toggle(k),
            },
          ]
        : []),
      // Shares and the agent's own keys are never edited here (canEdit). A key with a change in flight or held
      // offers neither Edit nor Pause.
      ...(canEdit(k)
        ? [
            {
              id: "edit",
              label: t("act.edit"),
              icon: "pen" as const,
              isDisabled: off,
              disabledReason: offWhy,
              onAction: () => setDrawer({ kind: "edit", key: k }),
            },
          ]
        : []),
      ...(own
        ? [
            {
              id: "copy",
              label: t("act.copy"),
              icon: "copy" as const,
              isDisabled: !r.editable || !!ops[k.id] || !copyOk(k),
              disabledReason: offWhy ?? (!copyOk(k) ? t("copy.notHere") : undefined),
              onAction: () => setDrawer({ kind: "copy", key: k }),
            },
          ]
        : []),
      "-",
      {
        id: "delete",
        label: t("act.delete"),
        icon: "trash",
        tone: "danger",
        isDisabled: !r.editable || !!ops[k.id],
        disabledReason: offWhy,
        onAction: () => void openDelete(k),
      },
    ];
  };

  // The keys listed under the chosen State (see the State filter below).
  const kept = useRef<{ state: string | undefined; ids: Set<string> }>({ state: undefined, ids: new Set() });
  const dv = useDataView<KeyRow>({
    rows: scoped?.rows,
    columns,
    getRowId: (r) => handleOf(r.key),
    search: (r) => [searchText(r.key)],
    filters: [
      {
        id: "access",
        label: t("filter.access"),
        value: (r) => accessLabel(r.key),
        options: accessChoices(keys ?? []).map((a) => ({
          value: a,
          label: accessChoice(t, a),
        })),
      },
      {
        id: "state",
        label: t("filter.state"),
        // A key listed under the chosen State stays listed while it is chosen: a Pause pressed here never takes the
        // row away from under the press. A key that arrives in another state is not listed. A key with a change still
        // held (sent, its outcome not known: Check again) is listed under every State, so the default Active never
        // hides a held pause, resume, edit or delete when the tab is opened again.
        value: (r) => {
          if (ops[r.key.id]) return ["active", "paused", "expired"];
          const was = kept.current;
          return was.state !== undefined && was.state !== r.key.state && was.ids.has(r.key.id) ? [r.key.state, was.state] : r.key.state;
        },
        options: (["active", "paused", "expired"] as const).map((a) => ({
          value: a,
          label: t(`state.${a}`),
        })),
      },
      {
        id: "ends",
        label: t("filter.ends"),
        value: (r) => endsBucket(r.key, Date.now()),
        options: (["never", "expired", "soon", "later"] as const).map((a) => ({
          value: a,
          label: t(`ends.${a}` as K),
        })),
      },
    ],
    sort: "name",
    isLoading: list.isPending,
    error: list.error,
    pageSize: 25,
  });
  // The list opens on active keys: once the first list arrives with keys in it, no State in the address and no key
  // opened by a link, State is set to Active (a replace, no history step). An address that names a State keeps it, an
  // empty list keeps its first-key empty state, and clearing the chip shows every key until the tab is opened again.
  // The default is not the person's choice, so a link's ?page stays.
  const stateDefaulted = useRef(false);
  const chosen = dv.filterValue("state");
  const stateChosen = chosen?.kind === "single" ? chosen.value : undefined;
  if (kept.current.state !== stateChosen) kept.current = { state: stateChosen, ids: new Set() };
  if (stateChosen !== undefined) for (const r of scoped?.rows ?? []) if (r.key.state === stateChosen) kept.current.ids.add(r.key.id);
  const { setFilter } = dv;
  const stateInUrl = dv.filterValue("state") !== undefined;
  const opened = dv.activeId !== undefined;
  const firstRows = scoped === undefined ? undefined : scoped.rows.length;
  useEffect(() => {
    if (stateDefaulted.current || firstRows === undefined) return;
    stateDefaulted.current = true;
    if (firstRows > 0 && !stateInUrl && !opened) setFilter("state", { kind: "single", value: "active" }, { keepPage: true });
  }, [setFilter, stateInUrl, opened, firstRows]);
  const handle = dv.activeId;
  const current = handle
    ? findByHandle(scoped?.rows.map((r) => r.key) ?? [], handle)
    : undefined;
  const currentRow = current
    ? scoped?.rows.find((r) => r.key.id === current.id)
    : undefined;
  // Who made whom, among the keys this view lists (only those can be opened from here).
  const lineageOf = (k: Key): Lineage => {
    const shown = scoped?.rows.map((r) => r.key) ?? [];
    const parent = k.madeBy
      ? (shown.find((x) => x.id === k.madeBy) ?? null)
      : null;
    return {
      parent,
      parentHidden: !!k.madeBy && !parent,
      children: shown.filter((x) => x.madeBy === k.id),
    };
  };

  // One accent per screen: while a key's detail is open its Edit… is the primary, so New key steps back.
  const newButton = (
    <Button
      variant={current ? "secondary" : "primary"}
      icon="plus"
      onPress={() => setDrawer({ kind: "new", realm: sel })}
    >
      {t("action.new")}
    </Button>
  );

  // The empty-realm state offers Show all realms itself: the band above it would be a second one.
  const notice = bound && !(keys && total === 0 && list.data?.rows.length) ? (
    <Band
      size="table"
      actions={
        <Button variant="ghost" size="sm" onPress={showAll}>
          {t("band.showAll")}
        </Button>
      }
    >
      {t("band.realm", { realm: realmName(realms, sel as string) })}
    </Band>
  ) : undefined;

  const emptyAll = list.data && list.data.rows.length === 0;
  const emptyRealm = !emptyAll && keys && bound && total === 0;
  const emptyState = emptyAll ? (
    <EmptyState
      icon="key"
      title={t("st.empty.title")}
      body={t("st.empty.body")}
      action={newButton}
      secondary={
        guideLink && <Link href={guideLink.href}>{t("st.guide")}</Link>
      }
      hint={
        <span>
          <Shortcut keys="n" /> {t("st.empty.hint")}
        </span>
      }
    />
  ) : emptyRealm ? (
    <EmptyState
      icon="key"
      title={t("st.emptyRealm.title", {
        realm: realmName(realms, sel as string),
      })}
      body={t("st.emptyRealm.body")}
      action={
        <Button variant="secondary" onPress={showAll}>
          {t("band.showAll")}
        </Button>
      }
    />
  ) : undefined;

  // The body names the key as the title does: an unnamed key reads "Unnamed key" in both.
  const delName = del ? nameOf(del.key) : "";
  const delText = del
    ? del.key.managed === "boot"
      ? t("del.boot", { name: delName })
      : del.key.managed === "realm"
        ? t("del.realm", { name: delName })
        : t("del.plain", { name: delName })
    : "";

  return (
    <Frame
      tab="keys"
      primary={{ label: t("action.new"), icon: "plus", onPress: () => setDrawer({ kind: "new", realm: sel }) }}
      // A key open in the detail gives way to its Edit, and so does a stale one (the detail says "Key not found");
      // an open key that cannot be edited here leaves New key the page's primary. An empty list's own empty state
      // holds the primary New key: the header's stays secondary and never floats.
      primaryQuiet={!!emptyAll || (handle !== undefined && (!current || !!currentRow?.editable))}
      counts={{ keys: keys ? total : undefined, shared: sharedCount }}
      notice={notice}
      fill
    >
      <ListDetailPage
        mode="side"
        storageKey="keys"
        inspectorWidth={440}
        faq={{ items: pageFaq(t).items }}
        list={
          <DataTable
            label={t("title")}
            columns={columns}
            view={dv}
            onRetry={refresh}
            onRefresh={refresh}
            empty={emptyState}
            noMatch={t("st.noMatch")}
            // No count while the list never loaded: 0 would claim there are no keys. The expired part counts the whole
            // realm: beside a search's or an Access or Ends filter's count it reads as part of the match ("5 keys · 323
            // expired"), so it shows only without them. Under the State filter (Active by default) it is the note that
            // expired keys exist.
            countLabel={(n) =>
              !keys
                ? ""
                : scoped && scoped.expired > 0 && dv.q.trim() === "" && dv.filterValue("access") === undefined && dv.filterValue("ends") === undefined
                  ? `${t("count", { count: n })} · ${t("expired", { count: scoped.expired })}`
                  : t("count", { count: n })
            }
            actions={actions}
            storageKey="keys"
            fill
          />
        }
        detail={
          handle === undefined ? null : current && currentRow ? (
            <KeyInspector
              k={current}
              cat={cat}
              realms={realms}
              editable={currentRow.editable}
              copyOk={copyOk(current)}
              busy={!!ops[current.id]}
              unconfirmed={ops[current.id]?.kind === "unknown"}
              {...(ops[current.id]?.said
                ? { said: ops[current.id]?.said?.full }
                : {})}
              {...(ops[current.id]?.away
                ? { elsewhere: ops[current.id]?.away }
                : {})}
              checking={checkingIds.has(current.id)}
              onCheck={() => checkOp(current, ops[current.id])}
              onDismiss={() => dismissOp(current, ops[current.id])}
              dismissKey={ops[current.id]?.hold ?? ""}
              {...(ops[current.id]?.edit !== undefined
                ? { dismissBody: t("dismiss.bodyEdit") }
                : {})}
              {...(!unmanaged(current)
                ? {
                    onToggle: () => void toggle(current),
                    onCopy: () => setDrawer({ kind: "copy", key: current }),
                  }
                : {})}
              {...(canEdit(current)
                ? { onEdit: () => setDrawer({ kind: "edit", key: current }) }
                : {})}
              onDelete={() => void openDelete(current)}
              lineage={lineageOf(current)}
              onOpen={(x) => dv.open(handleOf(x))}
            />
          ) : keys ? (
            <EmptyState icon="warn" title={t("insp.notFound")} size="sm" />
          ) : null
        }
      />
      {drawer?.kind === "new" && (
        <NewKeyDrawer
          realms={realms}
          realm={bound ? (sel as string) : "all"}
          cat={cat}
          onClose={() => setDrawer(null)}
          onChanged={refresh}
        />
      )}
      {drawer?.kind === "edit" && (
        <EditKeyDrawer
          k={drawer.key}
          realms={realms}
          cat={cat}
          onClose={() => setDrawer(null)}
          onSave={(body) => saveEdit(drawer.key, body)}
        />
      )}
      {drawer?.kind === "copy" && (
        <CopyKeyDrawer
          source={drawer.key}
          realms={realms}
          cat={cat}
          onClose={() => setDrawer(null)}
          onChanged={refresh}
        />
      )}
      <ConfirmDialog
        isOpen={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={t("del.title", { name: delName })}
        body={[delText, t("del.once")].join(" ")}
        confirmLabel={t("del.go")}
        tone="danger"
        busy={del?.busy}
        // A refused delete says why in the dialog's outcome line, under the question, announced at once (outcomeAlert).
        outcome={
          del?.outcome === "pending"
            ? { kind: "pending", ...(del.said ? { message: del.said } : {}) }
            : del?.outcome
              ? { kind: del.outcome, message: outcomeText(t, { outcome: del.outcome, code: del.code }, nameOf(del.key), false) }
              : undefined
        }
        outcomeAlert
        onCheck={() => checkDelete()}
        onConfirm={() => void doDelete()}
      />
    </Frame>
  );
}
