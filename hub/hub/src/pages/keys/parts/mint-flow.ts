// The state machine shared by "New key" and "Copy with a new secret": send once, then show the secret once,
// or say plainly that the outcome is unknown.
//
// Rules (C9): the sends go out once and are never repeated; an unknown outcome reads the list back and never
// attributes a new key to this send ("a key of this name appeared", never "your key"); the secret lives only
// in a HeldSecret, dropped when the drawer closes, the realm changes or the page unmounts.
import {
  alive,
  attemptFor,
  capture,
  heldAttempts,
  holdAttempt,
  useAttemptsVersion,
  type Ctx,
  type HeldAttempt,
  type HeldSecret,
} from "@core";
import { makeT, showToast, type OutcomeKind } from "@kit";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  elsewhereOfChange,
  useKeyReader,
  useMint,
  useRemoveKey,
  useSettleChange,
  type Elsewhere,
  NOT_SETTLED,
} from "../data";
import {
  candidates,
  normToken,
  sameScope,
  scopeLessEnds,
  type Body,
} from "../logic";
import { PREFIX, shareConforms } from "../share-logic";
import strings from "../strings.en.json";
import type { Catalogue, Key, RawToken } from "../types";

export type Phase =
  | { kind: "form" }
  | { kind: "sending" }
  | { kind: "shown"; held: HeldSecret; ctx: Ctx; key: Key }
  | {
      kind: "pending";
      candidates: Key[];
      /** The send named its key: only then can a read prove it (a name is unique per account). */
      named: boolean;
      reading: boolean;
      failed: boolean;
      checked: boolean;
      /** A read proved it here and freed the hold: what it found stays on screen. */
      settled?: boolean;
      /** The core attempt (its id) this phase shows: Dismiss and Check act only while it is still the one held. */
      hold?: string;
    }
  | {
      kind: "nosecret";
      key: Key;
      unsure?: boolean;
      reading?: boolean;
      /** The delete is another page's: read-only, with its link (no Check again, no Dismiss). */
      away?: Elsewhere;
      /** An unconfirmed delete: core's hold of that send (Check again and Dismiss free only it). */
      hold?: string;
    };

export interface Banner {
  kind: OutcomeKind;
  code?: string;
  /** What the last Check again found when it proved nothing: the banner's words instead of the general ones. */
  said?: string;
}

export interface StartInput {
  kind: "create" | "copy";
  body: Body;
  /** The key a copy is made of. */
  source?: Key;
  alias: string | null;
}

export interface MintFlow {
  phase: Phase;
  banner: Banner | null;
  /** Resolves with the refusal/failure code, or undefined when the send went out and was handled. */
  start(input: StartInput): Promise<{ code?: string } | undefined>;
  /** Reads the list back. Frees a named send only when the read shows a new key of its name (names are unique per
   *  account, so sending it again could make no second key). An unnamed send is never freed by a read: any new
   *  key may be another client's, so only the person's warned dismiss() ends it. */
  check(): Promise<void>;
  /** The person's warned Dismiss ("a key may have been made") of the phase it was shown (`shown`, taken when the
   *  warning opened): forgets that send only and shows the form. Refused while the request is still out; when a
   *  later send holds the operation, nothing is freed, the later one is shown and the person is told (false). */
  dismiss(shown: Phase): boolean;
  /** Delete the key that was made without its secret, then back to the form. */
  deleteMade(): Promise<void>;
  /** After a delete that may have gone through: read the list back; only a complete read without the key settles
   *  it (one still listing it proves nothing: the delete may still land). */
  checkMade(): Promise<void>;
  /** The person's warned Dismiss of that delete (`shown`: the phase when the warning opened; only its send is
   *  freed): it may have gone through. Delete is offered again. */
  dismissMade(shown: Phase): Promise<void>;
  /** Back to the form (after a refusal or a deleted key). */
  reset(): void;
  /** Say that nothing was sent, and why, before any request. */
  refuse(code: string): void;
  /** Wipe the held secret now. */
  wipe(): void;
}

/**
 * A send whose outcome is not known is held in core (holdAttempt), outside the drawer and this tab: closing the
 * drawer, a reload or a second tab must not hand the person a form that can send the same change again. One lock
 * per operation ("create", or a copy of one key); cleared only by a known answer, a read that proves it (see
 * check()), or the person's warned Dismiss; never by closing, and never by a read that merely does not show it (a
 * create is no idempotent write: sending it again makes two).
 * The hold's meta is what a later read needs (ids listed before the send, the name, the source scope, the newest
 * key time a cut list showed): never a secret, and no key's secret is ever part of it.
 */
interface Meta {
  before: string[] | null;
  alias: string | null;
  /** A copy's source scope (what the copy inherits): an unnamed copy's candidates are shown on it, never proof. */
  scope: string | null;
  /** With no whole list from before the send (it was cut): the newest key the cut list showed was made at this
   *  server time, so a namesake made after it may be this send's (shown, never proof). null: no list at all. */
  newestBefore: string | null;
}
const BY = "keys";
/** A short, stable tag of a key id for a lock name: the id itself never names a lock. */
function tag(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
const lockOf = (op: string): string =>
  op.startsWith("copy:") ? `keys.copy.${tag(op.slice(5))}` : `keys.${op}`;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
/** A share the Shared tab does not manage (shareConforms), as read now: the Keys tab offers it no Copy, so an
 *  already-open Copy drawer sends nothing once a fresh read shows it so. */
const unmanagedShare = (row: RawToken, now: number): boolean =>
  typeof row.alias === "string" && row.alias.startsWith(PREFIX) && !shareConforms(row, now);
function metaOf(h: HeldAttempt): Meta {
  const m = (h.meta ?? {}) as Record<string, unknown>;
  const before = Array.isArray(m.before)
    ? m.before.filter((x): x is string => typeof x === "string")
    : null;
  return {
    before,
    alias: str(m.alias),
    scope: str(m.scope),
    newestBefore: str(m.newestBefore),
  };
}
/** A key in a sentence: its name, or "Unnamed key" for one saved with none (as the table and the inspector say it). */
const nameOf = (k: { name: string }): string => k.name || strings["unnamed"];
/** Another page holds the change (core freed nothing): it stays unconfirmed here, and that page settles it. */
const heldElsewhere = (name: string): void => {
  showToast({ title: makeT(strings)("op.heldElsewhereOf", { name }), tone: "warn" });
};
const notSettled = (name: string): void => {
  showToast({ title: makeT(strings)("op.notSettledOf", { name }), tone: "warn" });
};
/** A create's hold moved meanwhile: the key being made may have no name yet. */
const mintNotSettled = (): void => {
  showToast({ title: makeT(strings)("mint.notSettled"), tone: "warn" /* noDetails: core moved the hold to a later send (attempts heldFor); there is no rejection */ });
};
/** The hold is kept in storage, so a reload or another tab sees it (false: this tab only, or gone). */
const heldPersisted = (lock: string, id: string): boolean =>
  heldAttempts(lock).some((h) => h.id === id && h.persisted);
/** The account's hold for this operation, whichever tab sent it. */
const heldFor = (op: string): HeldAttempt | undefined =>
  heldAttempts(lockOf(op)).find((h) => h.by === BY);
const pendingOf = (h: HeldAttempt): Phase => ({
  kind: "pending",
  candidates: [],
  named: !!metaOf(h).alias,
  reading: false,
  failed: false,
  checked: false,
  hold: h.id,
});

/**
 * The new keys that may be this send's: of its name, or, for an unnamed copy, with the source's scope (realms and
 * rights; shown, never proof). An unnamed create matches none. Without a whole list from before the send, a
 * namesake counts only when the server made it after the newest key the cut list showed (both server times, so
 * no clock is compared with another); with no list at all, none counts.
 */
function matching(
  before: readonly string[] | null,
  rows: Parameters<typeof candidates>[1],
  alias: string | null,
  scope: string | null,
  newestBefore: string | null,
  cat: Catalogue | null,
): Key[] {
  const found = candidates(before, rows, alias, cat, Date.now());
  // An unnamed copy may set its own Ends: matched on the rest of its source's scope.
  if (!alias)
    return found.filter(
      (k) => !!scope && scopeLessEnds(k.scope) === scopeLessEnds(scope),
    );
  if (before) return found;
  const base = newestBefore ? Date.parse(newestBefore) : NaN;
  if (Number.isNaN(base)) return [];
  return found.filter((k) => !!k.createdAt && Date.parse(k.createdAt) > base);
}

export function useMintFlow(
  cat: Catalogue | null,
  onChanged: () => void,
  op = "create",
): MintFlow {
  const [phase, setPhaseState] = useState<Phase>(() => {
    const h = heldFor(op);
    return h ? pendingOf(h) : { kind: "form" };
  });
  const [banner, setBanner] = useState<Banner | null>(null);
  const phaseRef = useRef<Phase>(phase);
  const mounted = useRef(true);
  // Set synchronously before the first await: a second press (Ctrl+Enter, double click) finds it taken.
  const lock = useRef(false);
  const read = useKeyReader();
  const create = useMint("create");
  const copy = useMint("copy");
  const remove = useRemoveKey();
  const settleChange = useSettleChange();

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    if (mounted.current) setPhaseState(p);
  }, []);

  // Another tab (or this one, before a reload) holds or frees the same operation: the form follows core's hold.
  const attempts = useAttemptsVersion();
  useEffect(() => {
    const p = phaseRef.current;
    const h = heldFor(op);
    if (p.kind === "form" && h && !lock.current) setPhase(pendingOf(h));
    else if (p.kind === "pending" && !p.settled && !p.reading && !h)
      setPhase({ kind: "form" });
    // Another send of the operation is held now (another tab dismissed this one and sent again): it is shown in its
    // place, and an open Dismiss warning for the earlier one closes with it.
    else if (p.kind === "pending" && !p.reading && h && h.id !== p.hold)
      setPhase(pendingOf(h));
  }, [attempts, op, setPhase]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const p = phaseRef.current;
      if (p.kind === "shown") p.held.drop();
    };
  }, []);

  const wipe = useCallback(() => {
    const p = phaseRef.current;
    if (p.kind === "shown") p.held.drop();
  }, []);

  const start = useCallback(
    async (input: StartInput) => {
      if (lock.current || phaseRef.current.kind !== "form") return undefined;
      lock.current = true;
      try {
        return await run(input);
      } finally {
        lock.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cat, copy, create, onChanged, read, setPhase, op],
  );

  const run = useCallback(
    async (input: StartInput) => {
      setBanner(null);
      setPhase({ kind: "sending" });
      const now = Date.now();
      // The context the person acted under: a realm change during the read below ends the send unsent.
      const ctx = capture();
      const snap = await read();
      if (!mounted.current || !alive(ctx)) {
        onChanged();
        return undefined;
      }
      // Only a whole list says which keys were there before: a cut one leaves `before` unknown.
      const before =
        snap && !snap.truncated ? snap.rows.map((r) => r.id) : null;
      // The server's own time base for a cut list: the newest key it showed.
      const newestBefore = snap
        ? snap.rows.reduce<string | null>((m, r) => {
            const c = typeof r.created_at === "string" ? r.created_at : "";
            return c && (!m || Date.parse(c) > Date.parse(m)) ? c : m;
          }, null)
        : null;
      const scope =
        input.kind === "copy" ? (input.source?.scope ?? null) : null;
      // A copy takes the source's CURRENT server config: the key as read now must be what the row showed.
      if (input.kind === "copy" && input.source) {
        const row = snap?.rows.find((r) => r.id === input.source?.id);
        const code = !snap
          ? "NO_CHECK"
          : !row
            ? "NO_KEY"
            : !sameScope(input.source, normToken(row, cat, now)) || unmanagedShare(row, now)
              ? "CHANGED"
              : null;
        if (code) {
          setBanner({ kind: "not_sent", code });
          setPhase({ kind: "form" });
          onChanged();
          return { code };
        }
      }
      // From here the send may go out: it is held in core first (every tab of the account, and after a reload),
      // and until it ends with a known outcome it stays held, whoever is watching. A list of ids too large for a
      // stored hold is left out: the send is then judged like one after a cut list (a namesake never proves it).
      const meta: Meta = { before, alias: input.alias, scope, newestBefore };
      const holdOf = (m: Meta) =>
        holdAttempt(lockOf(op), { by: BY, meta: m, realm: ctx.realm });
      let got = await holdOf(meta);
      if (!got.ok && got.code === "TOO_LARGE" && meta.before) {
        meta.before = null;
        got = await holdOf(meta);
      }
      if (!got.ok) {
        // Held already (another tab sent it while this form was open): nothing is sent, the hold is shown.
        if (
          got.code === "HELD" &&
          got.held &&
          got.held.by === BY &&
          got.held.lock === lockOf(op)
        ) {
          setPhase(pendingOf(got.held));
          return undefined;
        }
        // Core's cap of the account's holds (FULL) is other holds, not this send's: it is refused, never shown as
        // this one. Storage that can't keep the hold (NOT_DURABLE) would let a reload send it twice: refused too.
        const code =
          got.code === "HELD" || got.code === "FULL"
            ? "HELD_OTHER"
            : got.code === "NOT_DURABLE"
              ? "NO_STORAGE"
              : got.code;
        setBanner({ kind: "not_sent", code });
        setPhase({ kind: "form" });
        return { code };
      }
      const hold = got.hold;
      if (!mounted.current || !alive(ctx)) {
        // Nothing went out: the hold is let go.
        hold.release();
        onChanged();
        return undefined;
      }
      // A hold only this tab knows would not survive a reload, and the form would then send again: nothing is sent.
      // Core refuses such a hold up front (NOT_DURABLE, above); this is the last check before the send.
      if (!heldPersisted(lockOf(op), hold.id)) {
        hold.release();
        setBanner({ kind: "not_sent", code: "NO_STORAGE" });
        setPhase({ kind: "form" });
        return { code: "NO_STORAGE" };
      }
      const res = await (input.kind === "create" ? create : copy)({
        id: input.source?.id,
        body: input.body,
        ctx,
      });
      if (res.outcome !== "pending") hold.release();
      else hold.sent();
      if (!mounted.current) {
        // The drawer is gone: the secret is dropped unseen. A key that was made says so (its secret is lost); a
        // pending send stays held in core for the next opening (any tab), and core shows its own notice.
        res.held?.drop();
        if (res.outcome === "done")
          showToast({ title: strings["mint.lateMade"], tone: "info" });
        onChanged();
        return undefined;
      }
      if (res.outcome === "done") {
        const key = normToken(res.answer, cat, Date.now());
        onChanged();
        if (res.held && key.id)
          setPhase({ kind: "shown", held: res.held, ctx: res.ctx, key });
        else setPhase({ kind: "nosecret", key });
        return undefined;
      }
      if (res.outcome === "pending") {
        onChanged();
        const after = await read();
        // The read right after the answer frees nothing even when it shows a match: the person sees the keys that
        // appeared, and their own Check again (check()) is what settles it.
        const found = after
          ? matching(
              meta.before,
              after.rows,
              input.alias,
              scope,
              newestBefore,
              cat,
            )
          : [];
        setPhase({
          kind: "pending",
          candidates: found,
          named: !!input.alias,
          reading: false,
          failed: !after,
          checked: false,
          hold: hold.id,
        });
        return undefined;
      }
      setPhase({ kind: "form" });
      if (res.outcome === "failed" && res.code === "DUPLICATE_ALIAS")
        return { code: res.code };
      // A cancelled sign-in-code prompt sends nothing and says nothing.
      if (res.cancelled) return undefined;
      setBanner({ kind: res.outcome, code: res.code });
      return { code: res.code };
    },
    [cat, copy, create, onChanged, read, setPhase, op],
  );

  const check = useCallback(async () => {
    const p = phaseRef.current;
    if (p.kind !== "pending") return;
    const h = heldFor(op);
    // Freed meanwhile (another tab's Check or Dismiss): the form comes back.
    if (!h) {
      if (!p.settled) setPhase({ kind: "form" });
      return;
    }
    // Another send than the one shown: it is shown instead, and judged by its own Check.
    if (p.hold && h.id !== p.hold) {
      setPhase(pendingOf(h));
      return;
    }
    // The first request may still be out (another tab, or a drawer closed and opened again): nothing is read as
    // proof yet.
    if (h.inFlight) {
      setPhase({ ...p, reading: false, checked: false });
      return;
    }
    setPhase({ ...p, reading: true });
    const after = await read();
    const now = heldFor(op);
    if (!now || now.id !== h.id) {
      setPhase(now ? pendingOf(now) : { kind: "form" });
      return;
    }
    if (now.inFlight) {
      setPhase({ ...p, reading: false, checked: false });
      return;
    }
    const { before, alias, scope, newestBefore } = metaOf(now);
    const found = after
      ? matching(before, after.rows, alias, scope, newestBefore, cat)
      : p.candidates;
    // Only a read that shows a new key of this send's name, against a whole list from before the send, settles
    // it: the name is unique per account, so sending again could make no second key, and the whole list says the
    // key is new. After a cut list a namesake is shown but proves nothing (it may be another client's, made in
    // the gap); a key without a name proves nothing (any new one may be another client's), and a read that shows
    // none, even whole, proves nothing either (the request may still be in work). The person may Dismiss it, warned.
    const proved = !!after && !!alias && !!before && found.length > 0;
    if (proved) attemptFor(now.id, BY)?.release();
    setPhase({
      kind: "pending",
      candidates: found,
      named: !!alias,
      reading: false,
      failed: !after,
      checked: !!after,
      hold: now.id,
      ...(proved ? { settled: true } : {}),
    });
    if (after) onChanged();
  }, [cat, onChanged, op, read, setPhase]);

  const dismiss = useCallback(
    (shown: Phase): boolean => {
      const p = phaseRef.current;
      if (shown.kind !== "pending" || shown.settled) return false;
      if (p.kind !== "pending" || p.reading) return false;
      const h = heldFor(op);
      if (h?.inFlight) return false;
      // A later send holds the operation (or the shown one had none): it is not this warning's to free.
      if (h && h.id !== shown.hold) {
        mintNotSettled();
        setPhase(pendingOf(h));
        return false;
      }
      if (h) attemptFor(h.id, BY)?.dismiss(true);
      setBanner(null);
      setPhase({ kind: "form" });
      return true;
    },
    [op, setPhase],
  );

  const deleteMade = useCallback(async () => {
    const p = phaseRef.current;
    if (p.kind !== "nosecret" || lock.current) return;
    lock.current = true;
    setPhase({ ...p, reading: true });
    const r = await remove({ id: p.key.id });
    lock.current = false;
    if (!mounted.current) return;
    if (r.cancelled) {
      setPhase({ ...p, reading: false });
      return;
    }
    if (r.outcome === "done") {
      onChanged();
      setBanner(null);
      setPhase({ kind: "form" });
    } else if (r.outcome === "pending") {
      // It may have gone through: no second delete, only a read-back (another page's: only that page's).
      const away = elsewhereOfChange(r);
      setBanner(away ? null : { kind: "pending", code: r.code });
      setPhase({
        ...p,
        unsure: true,
        reading: false,
        ...(away ? { away } : {}),
        ...(r.hold ? { hold: r.hold } : {}),
      });
    } else {
      setBanner({ kind: r.outcome, code: r.code });
      setPhase({ ...p, reading: false });
    }
  }, [onChanged, remove, setPhase]);

  const checkMade = useCallback(async () => {
    const p = phaseRef.current;
    if (p.kind !== "nosecret" || !p.unsure || p.away) return;
    setPhase({ ...p, reading: true });
    // Bound to the delete this phase shows: a later send of the key is not proved or freed by this read.
    const now = await settleChange.holdOf.remove({ id: p.key.id });
    // What the check found when it proved nothing goes on the pending banner, in the drawer (never a toast).
    const said = (words: string) => {
      setBanner((b) => ({ kind: "pending", ...(b?.code ? { code: b.code } : {}), said: words }));
      setPhase({ ...p, reading: false });
    };
    if (now !== undefined && now !== p.hold) {
      said(makeT(strings)("op.notSettledOf", { name: nameOf(p.key) }));
      return;
    }
    const hold = p.hold;
    const after = await read();
    if (!mounted.current) return;
    const present = after?.rows.some((x) => x.id === p.key.id);
    // No read, a cut one that does not show the key, or one still listing it, proves nothing: each says which.
    if (!after) return said(makeT(strings)("op.readFailed", { name: nameOf(p.key) }));
    if (present) return said(makeT(strings)("del.notYet", { name: nameOf(p.key) }));
    if (after.truncated) return said(makeT(strings)("op.cutList", { name: nameOf(p.key) }));
    const away = await settleChange.remove({ id: p.key.id }, hold);
    if (away === NOT_SETTLED) {
      said(makeT(strings)("op.notSettledOf", { name: nameOf(p.key) }));
      return;
    }
    if (away) {
      heldElsewhere(nameOf(p.key));
      setBanner(null);
      setPhase({ ...p, reading: false, away });
      return;
    }
    onChanged();
    setBanner(null);
    setPhase({ kind: "form" });
  }, [onChanged, read, setPhase, settleChange]);

  const dismissMade = useCallback(
    async (shown: Phase) => {
      const p = phaseRef.current;
      if (shown.kind !== "nosecret" || !shown.unsure || shown.away) return;
      if (p.kind !== "nosecret" || !p.unsure || p.reading || p.away) return;
      // Only the delete the warning was opened for: a later delete of the key stays held.
      const away = await settleChange.remove({ id: shown.key.id }, shown.hold);
      if (away === NOT_SETTLED) {
        notSettled(nameOf(shown.key));
        return;
      }
      // What the phase shows now must still be that send to be changed (a later one keeps its own state).
      const cur = phaseRef.current;
      const same =
        cur.kind === "nosecret" &&
        cur.key.id === shown.key.id &&
        cur.hold === shown.hold;
      if (away) {
        heldElsewhere(nameOf(shown.key));
        if (!mounted.current || !same) return;
        setBanner(null);
        setPhase({ ...cur, away });
        return;
      }
      if (!mounted.current || !same) return;
      setBanner(null);
      setPhase({ kind: "nosecret", key: shown.key });
      onChanged();
    },
    [onChanged, setPhase, settleChange],
  );

  const reset = useCallback(() => {
    setBanner(null);
    setPhase({ kind: "form" });
  }, [setPhase]);

  const refuse = useCallback(
    (code: string) => setBanner({ kind: "not_sent", code }),
    [],
  );

  return {
    phase,
    banner,
    start,
    check,
    dismiss,
    deleteMade,
    checkMade,
    dismissMade,
    reset,
    refuse,
    wipe,
  };
}
