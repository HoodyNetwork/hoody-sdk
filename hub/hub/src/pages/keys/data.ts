// The keys page's data: its queries and mutations, declared in one place over core (defineQuery,
// defineMutation, mintSecret) and the routes in routes.ts: live in the Hub, core's fixture transport in dev,
// shots and tests. The pure rules are in logic.ts, share-logic.ts and ssh-logic.ts; the fixtures are in fixtures.ts.
//
// 2FA: every change goes through core's api(), which asks the shell's prompt on OTP_REQUIRED and retries with the
// code; this page adds nothing. A cancelled prompt resolves as { outcome: 'not_sent', cancelled: true }: nothing
// was applied, nothing is pending.
//
// Secrets: a freshly made key or share text never leaves this file except inside a HeldSecret (core secret.ts).
// mintSecret wipes the answer at the boundary; the held secret is bound to the context that minted it and is
// wiped on teardown, realm change and view change.
import {
  alive,
  capture,
  defineMutation,
  defineQuery,
  heldChanges,
  holdSecret,
  mintSecret,
  otpCancelled,
  outcomeOf,
  useCan,
  useCurrentComputer,
  onBump,
  useChangesVersion,
  useRealms as useCoreRealms,
  type Ctx,
  type HeldByOther,
  type HeldChange,
  type HeldFrom,
  type HeldSecret,
} from "@core";
import { ipDetailsFrom, type IpDetails, type OutcomeKind } from "@kit";
import { useMemo, useSyncExternalStore } from "react";
import { routes } from "./routes";
import { future, take } from "./share-logic";
import { keyBody, keyPrint } from "./ssh-logic";
import type { Body } from "./logic";
import type {
  RawList,
  RawTemplate,
  RawToken,
  Realm,
  TopComputer,
} from "./types";

// BRIDGE: "Show all realms" overrides the shell's realm for this page only; the shell's switcher owns the
// real switch (core: pages never switch the realm themselves).
let realmOverride: string | null = null;
const realmListeners = new Set<() => void>();
// A realm or account switch, or a sign-out, ends the override: the page follows the shell again.
onBump(() => {
  if (realmOverride === null) return;
  realmOverride = null;
  realmListeners.forEach((f) => f());
});
const subscribeRealm = (f: () => void) => {
  realmListeners.add(f);
  return () => void realmListeners.delete(f);
};

/** Core's realm rows, as this page reads them. */
export function useRealms(): Realm[] | undefined {
  const v = useCoreRealms();
  return useMemo(
    () =>
      v.rows?.map((r) => ({
        id: r.id,
        name: "text" in r.name ? r.name.text : r.name.kind,
        named: r.name.kind === "alias" && r.name.text.trim() !== "",
        color: r.tint || "blue",
      })),
    [v.rows],
  );
}

/** The realm this page works in: 'all' or a 24-hex id (the shell's, unless "Show all realms" was pressed). */
export function useRealm(): { realm: string; showAll: () => void } {
  const v = useCoreRealms();
  const over = useSyncExternalStore(subscribeRealm, () => realmOverride);
  return {
    realm: over ?? v.selected,
    showAll: () => {
      realmOverride = "all";
      realmListeners.forEach((f) => f());
    },
  };
}

/** Keys are an account page: a shared-access (token) session holds no right to them. */
export function useIsAccount(): boolean {
  return useCan("account");
}

export type { RawList };

const listQ = defineQuery<{ data?: RawToken[]; truncated?: boolean }, RawList>(
  routes.list,
  {
    select: (r) => ({
      rows: Array.isArray(r?.data) ? r.data : [],
      truncated: r?.truncated === true,
    }),
  },
);
const templatesQ = defineQuery<{ data?: RawTemplate[] }, RawTemplate[]>(
  routes.templates,
  { select: (r) => (Array.isArray(r?.data) ? r.data : []) },
);
const computerQ = defineQuery<
  {
    data?: {
      id?: string;
      name?: string;
      ssh_hostname?: string;
      ssh_public_key?: string | null;
    };
  },
  TopComputer | null,
  string
>(routes.computer, {
  input: (id) => ({ params: { id } }),
  select: (r) => {
    const d = r?.data;
    if (!d || typeof d.id !== "string" || !d.id) return null;
    return {
      id: d.id,
      name: d.name || `${d.id.slice(0, 4)}…${d.id.slice(-4)}`,
      ...(d.ssh_hostname ? { ssh_hostname: d.ssh_hostname } : {}),
      ssh_public_key:
        typeof d.ssh_public_key === "string" ? d.ssh_public_key : "",
    };
  },
});
const keyQ = defineQuery<{ data?: RawToken }, RawToken | null, string>(
  routes.read,
  {
    input: (id) => ({ params: { id } }),
    select: (r) => r?.data ?? null,
  },
);
// The address and what the API knows of its place (kit IpInfo reads only the fields it gives).
const myIpQ = defineQuery<{ data?: { ip?: string } }, IpDetails | null>(
  routes.myIp,
  { select: (r) => ipDetailsFrom(r) },
);

export function useKeyList() {
  return listQ.use();
}

/** The rights catalogue (GET /auth/tokens/templates). A failed read only hides Choose rights. */
export function useTemplates() {
  return templatesQ.use();
}

/** One computer of a realm, as the Share drawer lists it. */
export interface ShareComputer {
  id: string;
  name: string;
  project: string;
}
/** The rows one page of the realm's list holds; a full page means the list may go on. */
export const SHARE_COMPUTERS_PAGE = 100;
const GONE_STATUS = /^(deleting|deleted)$/;
const realmComputersQ = defineQuery<
  { data?: { computers?: unknown[] } },
  { rows: ShareComputer[]; more: boolean },
  string
>(routes.realmComputers, {
  // Base host, filtered by the server on realm_ids: the membership a share token is checked against, so the
  // list is what the share reaches today (computers added later are reached too).
  input: (realm) => ({
    query: { realm_id: realm, page: 1, limit: SHARE_COMPUTERS_PAGE },
  }),
  select: (r) => {
    const list = Array.isArray(r?.data?.computers) ? r.data.computers : [];
    const seen = new Set<string>();
    const rows: ShareComputer[] = [];
    for (const x of list) {
      const c = (x ?? {}) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === "string" ? v : "");
      const id = str(c.id);
      if (!id || seen.has(id) || GONE_STATUS.test(str(c.status).toLowerCase()))
        continue;
      seen.add(id);
      rows.push({
        id,
        name: str(c.name) || `${id.slice(0, 4)}…${id.slice(-4)}`,
        project: str(c.project_alias) || str(c.project_name),
      });
    }
    rows.sort(
      (a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
        (a.id < b.id ? -1 : 1),
    );
    return { rows, more: list.length >= SHARE_COMPUTERS_PAGE };
  },
});

/** The computers a share of `realm` reaches today (one page of 100). Off until a realm id is picked; keyed by the
 *  realm, so another realm's answer never shows. */
export function useShareComputers(realm: string | undefined) {
  const on = !!realm && /^[0-9a-f]{24}$/.test(realm);
  return realmComputersQ.use(on ? realm : "", { enabled: on });
}

const NO_COMPUTER = {
  data: null,
  error: null,
  isPending: false,
  isError: false,
  refetch: async () => ({ data: null, error: null }),
};

/** The computer the top bar shows (data null: none picked). */
export function useTopComputer() {
  const target = useCurrentComputer();
  const q = computerQ.use(target?.container.id ?? "", { enabled: !!target });
  return (target ? q : NO_COMPUTER) as typeof q;
}

/** Why the top bar's computer could not be read, for the SSH tab's words. realm: the selected realm's host refused
 *  it (403 INSUFFICIENT_PERMISSIONS while one realm is selected: the computer is in another realm); access: any other
 *  403; signin: 401; gone: 404 (the API answers 404 for a computer that is not the account's too, so "no longer
 *  available", never "deleted"); server: 5xx; offline: no answer (no status, or 0: core's TIMEOUT is {status: 0});
 *  other: anything else, the general line. */
export type ComputerReadFail = "realm" | "access" | "signin" | "gone" | "server" | "offline" | "other";

export function computerReadFail(e: unknown, selectedRealm: string): ComputerReadFail {
  const x = e as { status?: unknown; stale?: unknown; cancelled?: unknown; superseded?: unknown } | null;
  // Core's own refusals of a dead context (another session took over: {status: 401, superseded}) say nothing
  // about the computer or the sign-in: the general line.
  if (!x || typeof x !== "object" || x.stale === true || x.cancelled === true || x.superseded === true) return "other";
  const code = codeOf(e);
  const st = typeof x.status === "number" ? x.status : 0;
  if (st === 0) return "offline";
  if (st === 401) return "signin";
  if (st === 403) return code === "INSUFFICIENT_PERMISSIONS" && selectedRealm !== "all" ? "realm" : "access";
  if (st === 404) return "gone";
  if (st >= 500 && st < 600) return "server";
  return "other";
}

/** computerReadFail for the realm core reads the computer in (the shell's selection; this page's own Show all
 *  realms widens the key lists only, never the host the computer is read from). */
export function useComputerReadFail(e: unknown): ComputerReadFail {
  return computerReadFail(e, useCoreRealms().selected);
}

// ── changes: each resolves with a C9 outcome, never retries, never resends ───────────────

export interface Change {
  outcome: OutcomeKind;
  code?: string;
  /** HELD_BY_OTHER: the page whose change holds it (null: it named none). Nothing went out from here. */
  from?: HeldFrom | null;
  /** The 2FA prompt was cancelled: nothing was sent, nothing is pending. */
  cancelled?: boolean;
  /** Pending: core's hold of this one send (MutationResult.hold; for READ_BACK_FIRST, the held send that refused it).
   *  A later Check or Dismiss frees only this send, never a later one of the same lock (the SSH lock is the
   *  computer alone). */
  hold?: string;
}

const codeOf = (e: unknown): string | undefined => {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === "string" && c ? c : undefined;
};

/** A change's end as the page reads it. */
function settle(r: {
  outcome: OutcomeKind | "done";
  error?: unknown;
  heldFrom?: HeldFrom | null;
  hold?: string;
}): Change {
  if (r.outcome === "done") return { outcome: "done" };
  if (otpCancelled(r.error)) return { outcome: "not_sent", cancelled: true };
  const code = codeOf(r.error);
  // Core holds a change that may have gone through: its refusal to send again is not "nothing was sent".
  // Another page's change holds the lock (HELD_BY_OTHER): nothing went out from here, but a change that may have gone
  // through is held, so it reads as held, never as "nothing was sent" (SshTab shows it as the other page's).
  if (code === "HELD_BY_OTHER")
    return { outcome: "pending", code, from: r.heldFrom ?? null };
  if (code === "READ_BACK_FIRST") return { outcome: "pending", code };
  return {
    outcome: r.outcome,
    ...(code ? { code } : {}),
    ...(r.outcome === "pending" && r.hold ? { hold: r.hold } : {}),
  };
}

// Proof (C9, "held unless proven"). Pause/Resume and Delete are freed only by the tabs' own fresh, complete read
// (KeysTab checkOp/checkDelete, SharedTab checkStop: the field asked for, or the key's absence; a cut list proves no
// absence) or by the person's warned Dismiss. A read still showing the old state proves nothing (the write may
// still land): it stays unconfirmed, with Check again and the warned Dismiss. A create is freed only by a read
// that proves it (mint-flow.ts: a new key of its name; share-logic.ts), never by one that does not show it: only a
// warned Dismiss ends it then. The SSH key, shared with Computers, also has core's
// `proves`, but core frees only the sender's own change: a read-back here never frees one Computers sent, nor
// Computers' one ours. Each page shows the other's hold read-only and sends the person to the page that sent it.
// Every definition here is the keys page's sender (`page`, core's per-page senders): a change it sends is recorded
// as sent from Keys, and another page's change of the same lock is never this page's to free.
const PAGE = "keys";
// Pause/Resume and Delete keep their own locks (holds stored before stay theirs). Their lockKey is exactly their
// variables, in the same order, so the lock digest is unchanged; it makes core record the key in each hold's identity,
// so admission can read the holds of a key synchronously (heldNow). A hold stored before has no identity and
// counts for every key until it is settled.
const setEnabledM = defineMutation<{ id: string; on: boolean }>(
  routes.setEnabled,
  {
    lockKey: (v) => ({ id: v.id, on: v.on }),
    input: (v) => ({ params: { id: v.id }, body: { is_enabled: v.on } }),
    page: PAGE,
  },
);
// An edit holds its own lock per key: one edit of a key at a time, whatever it changes. It writes other fields than
// Pause (is_enabled). Across locks, a send checks first, synchronously, with no await before it is sent: live sends
// (useKeySends) and core's holds of the key (its heldNow). An edit is not sent while a pause, resume or delete is on its way
// or held for the key, nor those while an edit is (any tab: core's store is shared).
// What it holds is the key and the body sent (no secret: a key's settings only), so a reload still shows what to
// read back.
const editM = defineMutation<{ id: string; body: Body }>(routes.update, {
  lock: "keys.key_edit",
  lockKey: (v) => ({ id: v.id }),
  identity: (v) => ({ id: v.id, body: v.body }),
  input: (v) => ({
    params: { id: v.id },
    body: v.body as Record<string, unknown>,
  }),
  page: PAGE,
});
const removeM = defineMutation<{ id: string }>(routes.remove, {
  lockKey: (v) => ({ id: v.id }),
  input: (v) => ({ params: { id: v.id } }),
  page: PAGE,
});
const sshSetM = defineMutation<{ computer: string; key: string | null }>(
  routes.setSshKey,
  {
    // Shared with the Computers drawer: both send this change, so each sees the other's pending one. A computer
    // has one SSH key slot, so one lock per computer; the key itself is never part of the lock's identity.
    lock: "computer.ssh_key",
    lockKey: (v) => ({ computer: v.computer }),
    // What the held change shows and proves: the computer and short prints of the key sent (computers/data.ts
    // records { computer, key } the same way; `body` lets a stored key without its comment still match).
    identity: (v) => ({
      computer: v.computer,
      key: keyPrint(v.key),
      body: keyPrint(keyBody(v.key)),
    }),
    reads: [computerQ],
    // Only a read showing the key sent (or none after a removal) proves it, as on Computers; a read showing
    // another key leaves it held (the tab's own Check again says so and offers Dismiss).
    proves: (identity, answers) => {
      const i = (identity ?? {}) as {
        computer?: string;
        key?: string;
        body?: string;
      };
      const c = (
        (answers[0] ?? []) as readonly (TopComputer | null | undefined)[]
      ).find((x) => !!x && x.id === i.computer);
      if (!c) return undefined;
      const now = c.ssh_public_key || null;
      if (keyPrint(now) === i.key) return "applied";
      return i.body && i.body !== "none" && keyPrint(keyBody(now)) === i.body
        ? "applied"
        : undefined;
    },
    input: (v) => ({
      params: { id: v.computer },
      body: { ssh_public_key: v.key },
    }),
    page: PAGE,
  },
);

const runner =
  <V>(m: {
    run(v: V): Promise<{
      outcome: OutcomeKind | "done";
      error?: unknown;
      heldFrom?: HeldFrom | null;
      hold?: string;
    }>;
    holdOf(v: V): Promise<string | undefined>;
  }) =>
  async (vars: V): Promise<Change> => {
    const c = settle(await m.run(vars));
    if (c.code !== "READ_BACK_FIRST") return c;
    // Refused because this page already holds the change (sent from another tab): nothing went out, and the
    // result is that held send with its hold, so the caller's Check and warned Dismiss bind to it. Freed
    // meanwhile (no hold): the result stays pending without one; nothing is held for it to bind.
    const hold = await m.holdOf(vars);
    return hold ? { ...c, hold } : c;
  };

const setEnabled = runner(setEnabledM);
const editKey = runner(editM);
const removeKey = runner(removeM);
const setSsh = runner(sshSetM);

/**
 * Frees core's hold on a change that may have gone through, keeping its key. Called after the page's own fresh,
 * complete read proved what happened (the same rules as `proves` above), or for the person's warned Dismiss
 * ("it may have gone through"), with exactly the variables the change was run with. Frees only this page's own
 * change: one Computers sent under the shared SSH lock is freed only on Computers (its Check or Dismiss).
 * Answers Elsewhere when another page's change holds these variables (core's settle frees nothing then and says
 * nothing): asked before, and again after, so one another page took meanwhile is never announced as freed. The
 * caller then shows it read-only with that page's link; undefined: freed (or nothing was held). NOT_SETTLED: the
 * context moved while it asked (a realm switch, even one back again, an account change or sign-out: checked after
 * every await by the generation as well as the realm), or this page's change is still held by a send the proof
 * does not cover; the caller keeps its unconfirmed result as it was.
 * `hold` is core's hold of this page's change taken BEFORE the page's own read (holdOf.*; undefined: none held
 * then). Only that send is freed: a later send of the change (another incarnation) was not covered by the read.
 */
export const settleOwn = async <V>(
  m: {
    heldByOther(v: V): Promise<HeldByOther | undefined>;
    settle(v: V, hold: string): Promise<boolean>;
    holdOf(v: V): Promise<string | undefined>;
  },
  v: V,
  hold: string | undefined,
): Promise<Settled> => {
  const at = capture();
  const moved = () => !alive(at) || capture().realm !== at.realm;
  const before = elsewhereOf(await m.heldByOther(v));
  if (moved()) return NOT_SETTLED;
  if (before) return before;
  if (hold) await m.settle(v, hold);
  if (moved()) return NOT_SETTLED;
  // Still held by this page (core kept the hold: a send the read did not cover, or one adopted again under a new
  // token meanwhile): nothing is announced as freed.
  const mine = await m.holdOf(v);
  if (moved() || mine) return NOT_SETTLED;
  const after = elsewhereOf(await m.heldByOther(v));
  return moved() ? NOT_SETTLED : after;
};
/** settleOwn's answer when nothing is known freed (the context moved, or this page's change is still held): the
 *  result stays as it was. */
export const NOT_SETTLED = "notSettled" as const;
export type Settled = Elsewhere | typeof NOT_SETTLED | undefined;
/** Another page sent this change and still holds it: only that page (`from`, its link; null when it named none)
 *  can check or dismiss it. Shown read-only here. */
export interface Elsewhere {
  from: HeldFrom | null;
}
const elsewhereOf = (h: HeldByOther | undefined): Elsewhere | undefined =>
  h ? { from: h.heldFrom ?? null } : undefined;
/** Elsewhere when the change was refused under another page's hold (HELD_BY_OTHER), else undefined. */
export const elsewhereOfChange = (r: Change): Elsewhere | undefined =>
  r.code === "HELD_BY_OTHER" ? { from: r.from ?? null } : undefined;
type SetEnabledV = { id: string; on: boolean };
type RemoveV = { id: string };
type EditV = { id: string; body: Body };
type SshV = { computer: string; key: string | null };
/** Core's hold of this page's change, taken BEFORE the page's own read: settleChange.* frees only that send. */
const holdOf = {
  setEnabled: (v: SetEnabledV) => setEnabledM.holdOf(v),
  remove: (v: RemoveV) => removeM.holdOf(v),
  edit: (v: EditV) => editM.holdOf(v),
  ssh: (v: SshV) => sshSetM.holdOf(v),
};
const settleChange = {
  /** Frees exactly the send `hold` names: the one the page showed (its row's or result's hold, carried from
   *  MutationResult.hold or HeldChange.hold). A proving read and the person's warned Dismiss both pass it; there
   *  is no "free whatever is held now", which would hand core a later send's hold (another tab's replacement). */
  setEnabled: (v: SetEnabledV, hold: string | undefined) =>
    settleOwn(setEnabledM, v, hold),
  remove: (v: RemoveV, hold: string | undefined) => settleOwn(removeM, v, hold),
  edit: (v: EditV, hold: string | undefined) => settleOwn(editM, v, hold),
  ssh: (v: SshV, hold: string | undefined) => settleOwn(sshSetM, v, hold),
  holdOf,
};
export const useSettleChange = () => settleChange;

/** Core's read-back of this page's SSH changes held for this computer: true only when a fresh read of the computer
 *  proved each one (proves above). A change Computers sent is never freed here, so false while one is held, even
 *  when the key is on the computer. Needs the computer on screen (its read observed). */
export const readBackSsh = (computer: string): Promise<boolean> =>
  sshSetM.readBack({ computer, key: null });

/** Whether a held SSH change is this page's own (only then can readBackSsh prove it, or Dismiss free it here).
 *  Core records the sender (heldBy); a hold with no record falls back to the identity's shape: sshSetM's
 *  carries a body print, Computers' does not. */
export const isOwnSshHold = (h: HeldChange): boolean => {
  const by = sshSetM.heldBy(h);
  if (by !== undefined) return by === "self";
  return (
    typeof (h.identity as { body?: unknown } | null | undefined)?.body ===
    "string"
  );
};

// ── what core still holds as unresolved, for a view that was closed and opened again ─────

const pendingDefs = {
  setEnabled: setEnabledM,
  remove: removeM,
  edit: editM,
  ssh: sshSetM,
};

/** The body of the edit core holds for a key (what Check again reads back), from the hold's identity; undefined
 *  when none is held or it records no body. */
export const heldEditBody = (id: string): Body | undefined => {
  for (const h of heldChanges("keys.key_edit")) {
    const i = h.identity as { id?: unknown; body?: unknown } | null;
    if (i && i.id === id && i.body && typeof i.body === "object")
      return i.body as Body;
  }
  return undefined;
};
type PendingKind = keyof typeof pendingDefs;

const forKey = (rows: readonly { identity: unknown }[], id: string): boolean =>
  rows.some((r) => {
    const i = r.identity as { id?: unknown } | null | undefined;
    return !i || typeof i !== "object" || i.id === id;
  });
/** Sends on their way (this tab's or another tab's, before any answer; core's live sends), so that admission across
 *  the locks also counts what is not yet held: `other` a pause, resume or delete, `edit` an edit. Core gives pages a
 *  live-send probe per definition only, not per key, so a send of any key counts (it refuses a moment longer than
 *  needed, never less). */
export interface KeySends {
  other: boolean;
  edit: boolean;
  /** Core's holds of a key as they stand when called, whoever sent them (any tab, page or declaration of the lock,
   *  or a hold that records no sender), read synchronously so that admission awaits nothing between this check and
   *  the send: `other` a pause, resume or delete, `edit` an edit. A hold whose identity names no key (stored before
   *  the key was recorded) counts for every key. */
  heldNow(id: string): { other: boolean; edit: boolean };
}
export function useKeySends(): KeySends {
  const pause = setEnabledM.use();
  const remove = removeM.use();
  const edit = editM.use();
  return {
    other: pause.running || remove.running,
    edit: edit.running,
    heldNow: (id) => ({
      other: forKey(setEnabledM.heldAny(), id) || forKey(removeM.heldAny(), id),
      edit: forKey(editM.heldAny(), id),
    }),
  };
}

/** True while some change of this kind may have gone through and is not released. */
export const anyChangePending = (kind: PendingKind): Promise<boolean> =>
  pendingDefs[kind].isPending();

/** True while this exact change (same variables) may have gone through and is not released. */
export const isChangePending = <K extends PendingKind>(
  kind: K,
  vars: Parameters<(typeof pendingDefs)[K]["isPending"]>[0],
): Promise<boolean> =>
  (pendingDefs[kind].isPending as (v: typeof vars) => Promise<boolean>)(vars);

/** Elsewhere while another page's change of these variables is held (pending, or kept with its key). */
export const heldElsewhere = <K extends PendingKind>(
  kind: K,
  vars: Parameters<(typeof pendingDefs)[K]["isPending"]>[0],
): Promise<Elsewhere | undefined> =>
  (
    pendingDefs[kind].heldByOther as (
      v: typeof vars,
    ) => Promise<HeldByOther | undefined>
  )(vars).then(elsewhereOf);

export { useChangesVersion };

export const useSetEnabled = () => setEnabled;
export const useEditKey = () => editKey;
export const useRemoveKey = () => removeKey;
export const useSetSshKey = () => setSsh;
/** Stopping a share is deleting its key. */
export const useStopShare = () => removeKey;

export interface MintResult {
  outcome: OutcomeKind;
  code?: string;
  /** The refusal's HTTP status, so a 400 without a kept code is still known for one (a definite refusal). */
  status?: number;
  cancelled?: boolean;
  /** The answer with every copy of the secret nulled. */
  answer?: RawToken;
  /** The secret, held for the context that minted it; null when the answer carried none. */
  held: HeldSecret | null;
  ctx: Ctx;
}

type MintVars = { id?: string; body: Body; ctx?: Ctx };

const pickToken = (raw: { data?: RawToken }): unknown => raw?.data?.token;

/** A failed mint as the page reads it. */
function mintFailed(e: unknown, ctx: Ctx): MintResult {
  if (otpCancelled(e))
    return { outcome: "not_sent", cancelled: true, held: null, ctx };
  const code = codeOf(e);
  const st = (e as { status?: unknown } | null)?.status;
  return {
    outcome: outcomeOf(e, true),
    ...(code ? { code } : {}),
    ...(typeof st === "number" && st > 0 ? { status: st } : {}),
    held: null,
    ctx,
  };
}

/** A new key (kind 'create') or a copy of one ('copy'), with its secret held. */
export function useMint(
  kind: "create" | "copy",
): (vars: MintVars) => Promise<MintResult> {
  return async (vars) => {
    // The context the person acted under (taken before any preliminary read), else now.
    const ctx = vars.ctx ?? capture();
    try {
      const m = await mintSecret(
        kind === "create" ? routes.create : routes.copy,
        {
          ctx,
          recovers: true,
          ...(vars.id ? { params: { id: vars.id } } : {}),
          body: vars.body as Record<string, unknown>,
        },
        pickToken,
      );
      const answer: RawToken = { ...(m.answer?.data ?? ({} as RawToken)) };
      answer.token = null;
      return { outcome: "done", answer, held: m.held, ctx };
    } catch (e) {
      return mintFailed(e, ctx);
    }
  };
}

export interface ShareMint {
  outcome: OutcomeKind;
  code?: string;
  /** The refusal's HTTP status (see MintResult). */
  status?: number;
  cancelled?: boolean;
  /** The id of the key that was made (never token-shaped). */
  id?: string | null;
  /** The hand-over text, held; null when the answer carried no usable token. */
  held: HeldSecret | null;
  /** The agent prompt with the token, held in the same context; null when not asked or not held. */
  heldPrompt?: HeldSecret | null;
  /** The sign-in link with the token, held in the same context; null when not asked or not held. */
  heldLink?: HeldSecret | null;
  expiresAt?: string | null;
  /** The answer arrived and the key exists, but its text did not reach this page. */
  lost?: boolean;
  ctx: Ctx;
}

/**
 * Makes a share key. `text(token, expires)` builds the hand-over text inside this boundary, so the token is
 * never returned: only the held text is. When the answer carries no end date in the future, one id read
 * supplies it, else the text has no Ends line.
 */
export function useShareMint(): (
  /** The context the share's hold was taken under: the mint runs under it (a later one makes it stale). */
  ctx: Ctx,
  body: Record<string, unknown>,
  text: (token: string, expires: string | null) => string,
  asked: number,
  /** The agent prompt with the token, built here like `text` and held beside it. */
  prompt?: (token: string, expires: string | null) => string,
  /** The sign-in link with the token, built and held the same way. */
  link?: (token: string) => string,
) => Promise<ShareMint> {
  return async (ctx, body, text, _asked, prompt, link) => {
    try {
      const minted = await mintSecret(
        routes.create,
        { ctx, recovers: true, body },
        pickToken,
      );
      const made = take(minted.answer);
      let expires = future(made.expires, Date.now());
      if (!expires && made.id) {
        try {
          const r = await keyQ.fetch(made.id);
          expires = future(r?.expires_at, Date.now());
        } catch {
          expires = null;
        }
      }
      const raw = minted.held?.reveal(ctx) ?? null;
      const token = take({ data: { id: made.id, token: raw } }).token;
      minted.held?.drop();
      if (!token || !made.id)
        return { outcome: "done", id: made.id, held: null, lost: true, ctx };
      const held = holdSecret(text(token, expires), ctx);
      // holdSecret refuses only a context that is no longer current; the text then never reaches this page.
      if (!held)
        return { outcome: "done", id: made.id, held: null, lost: true, ctx };
      const heldPrompt = prompt ? holdSecret(prompt(token, expires), ctx) : null;
      const heldLink = link ? holdSecret(link(token), ctx) : null;
      return { outcome: "done", id: made.id, held, heldPrompt, heldLink, expiresAt: expires, ctx };
    } catch (e) {
      return mintFailed(e, ctx);
    }
  };
}

/** The caller's own address as Hoody sees it ("Add my IP"), with its place. null when it could not be read. */
export function useReadMyIp(): () => Promise<IpDetails | null> {
  return async () => {
    try {
      return await myIpQ.fetch();
    } catch {
      return null;
    }
  };
}

/** A fresh read of the key list for send-time checks; null when it could not be read. */
export function useKeyReader(): () => Promise<RawList | null> {
  return freshList;
}

// Recovery reads are core's fresh reads (readFresh): one flight per query, the load in flight is cancelled, an
// overlapping press joins the open flight, and only a network answer from after the flight began counts.
async function freshList(): Promise<RawList | null> {
  return (await listQ.readFresh())?.data ?? null;
}

/** useKeyReader() in the shape the tabs read: an answer or an error, never a stale cache. */
export function useFreshList(): () => Promise<{
  data: RawList | undefined;
  error: boolean;
}> {
  return async () => {
    // A read can be cancelled by the list's own refresh, or fail once: a recovery asks again before saying it
    // could not read (a real outage still ends as an error after the last try).
    let data: RawList | null = null;
    for (let i = 0; i < 3 && !data; i++) {
      if (i) await new Promise((r) => setTimeout(r, 200 * i));
      data = await freshList();
    }
    return { data: data ?? undefined, error: !data };
  };
}

/** A fresh read of one key, for an edit's read-back: its answer, or an error (a read after a switch of realm or
 *  account is another context's and counts as failed). */
export function useFreshKey(): (id: string) => Promise<{
  data: RawToken | null | undefined;
  error: boolean;
}> {
  return async (id) => {
    const at = capture();
    const r = await keyQ.readFresh(id);
    const now = capture();
    if (now.gen !== at.gen || now.realm !== at.realm)
      return { data: undefined, error: true };
    return r ? { data: r.data, error: false } : { data: undefined, error: true };
  };
}

/** The same for the computer the SSH key sits on. `gone`: the realm host answered 404 for it (deleted, or
 *  never in this realm: the caller reads it only in the realm the change was sent in). */
export function useFreshComputer(): (id: string) => Promise<{
  data: TopComputer | null | undefined;
  error: boolean;
  gone?: boolean;
}> {
  return async (id) => {
    // Bound to the context it began in: an answer read after a switch (realm, computer, account) is another
    // context's and proves nothing here, so it counts as a failed read.
    const at = capture();
    const same = () => {
      const now = capture();
      return now.gen === at.gen && now.realm === at.realm;
    };
    const r = await computerQ.readFresh(id);
    if (!same()) return { data: undefined, error: true };
    if (r) return { data: r.data, error: false };
    // A fresh read hides why it failed: one more read tells a missing computer from an outage. Its data is not
    // used (only an error status is read from it).
    try {
      await computerQ.fetch(id);
    } catch (e) {
      if (same() && (e as { status?: unknown } | null)?.status === 404)
        return { data: undefined, error: true, gone: true };
    }
    return { data: undefined, error: true };
  };
}
