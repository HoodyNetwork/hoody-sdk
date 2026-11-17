// Share a realm: the hand-over text is shown once, held for the page context that made it and dropped on
// close. One create at a time: the alias ledger blocks Create while an earlier attempt is unresolved, and an
// unknown outcome only ever reads the list back.
import {
  Band,
  Button,
  DateTimeField,
  Disclosure,
  Drawer,
  DrawerCancel,
  type DrawerProps,
  Facts,
  followPageLink,
  Notice,
  OutcomeBanner,
  PickerPanel,
  Row,
  SegmentedControl,
  Spinner,
  Stack,
  StatusLine,
  SubSection,
  Tag,
  TextField,
  Track,
  TrackStep,
  Verdict,
  showToast,
  useGo,
  usePageLink,
  useMedia,
  useStrings,
} from "@kit";
import {
  alive,
  capture,
  heldAttempts,
  hostEnv,
  holdAttempt,
  hubSiteOrigin,
  type Ctx,
  type HeldSecret,
} from "@core";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  elsewhereOfChange,
  heldElsewhere,
  isChangePending,
  useFreshList,
  useSettleChange,
  useShareMint,
  useStopShare,
  useTemplates,
  type Elsewhere,
  NOT_SETTLED,
} from "../data";
import { catalogue } from "../logic";
import {
  availableRights,
  blocked,
  cantList,
  DAYS,
  DEFAULT_DAYS,
  effectiveRights,
  dismissUnknown,
  unknownAliases,
  freshAlias,
  settle,
  shareAlias,
  shareBodyV3,
  shareLimitsProblems,
  shareLink,
  sharePrompt,
  shareText,
  shortened,
  status,
  startOf,
  replaceStart,
  rightsDiff,
  toggleRight,
  utc,
  SHARE_BASE,
  areaOf,
  tagsOf,
  SHARE_NEVER,
  SHARE_OFFER,
  SHARE_STARTS,
  type ShareArea,
  type Days,
  type ShareLimits,
  type ShareStart,
  type ShareTag,
  SHARE_BY,
  shareLock,
  type LedgerEntry,
  type LedgerState,
} from "../share-logic";
import { links } from "../links";
import { links as realmLinks } from "../../realms/links";
import strings from "../strings.en.json";
import type { Catalogue, RawToken, Realm, Tree } from "../types";
import { DismissButton } from "./Dismiss";
import { RightsPicker, type RightsArea } from "./RightsPicker";
import { ElsewhereNote } from "./Elsewhere";
import { IpAllowlistField } from "./IpAllowlistField";
import { Panel } from "./MintPanels";
import { ShareComputers } from "./ShareComputers";
import { ShareShown, shareApiUrl } from "./ShareShown";
import { realmName } from "./words";
import s from "./keys.module.css";

type Phase =
  | { kind: "form" }
  | { kind: "sending" }
  | {
      kind: "shown";
      held: HeldSecret;
      heldPrompt: HeldSecret | null;
      heldLink: HeldSecret | null;
      ctx: Ctx;
      realm: string;
      expires: string | null;
      short: boolean;
      place: string;
    }
  | { kind: "pending"; reading: boolean; failed: boolean }
  | { kind: "lost"; id: string | null };

const AREAS: readonly ShareArea[] = ["computers", "inside", "features", "projects", "network"];
const TAG_ORDER: readonly ShareTag[] = ["money", "undo", "secrets", "outlast", "account"];
/** The whole offer as a catalogue: what a right turns on with it, whatever the server lists now. */
const OFFER_CAT: Catalogue = { rights: [...SHARE_BASE, ...SHARE_OFFER.map((o) => o.right)], full: null, billing: false, templates: [] };
const alsoOf = (p: string): string[] => toggleRight([], p, true, OFFER_CAT).filter((r) => r !== p);
const countTags = (rights: readonly string[]): Array<[ShareTag, number]> =>
  TAG_ORDER.map((tg) => [tg, rights.filter((r) => tagsOf(r).includes(tg)).length] as [ShareTag, number]).filter(([, n]) => n > 0);
/** Every true leaf of a tree, as dotted paths. */
const leavesOf = (tree: Tree, prefix = ""): string[] =>
  Object.entries(tree).flatMap(([k, v]) =>
    v === true ? [prefix + k] : v && typeof v === "object" ? leavesOf(v, `${prefix}${k}.`) : [],
  );
const ZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
})();
const localTime = (ms: number): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));

export interface ShareDrawerProps {
  realms: readonly Realm[] | undefined;
  /** The realm the shell shows ('all' or 24-hex). */
  realm: string;
  /** In All realms: the realm picked when the drawer opens (a link named it); the person can still change it. */
  preselect?: string;
  /** The ledger of the realm being shared (changes with the picked realm in All realms). */
  ledgerOf: (realm: string) => LedgerEntry[];
  onClose: () => void;
  onChanged: () => void;
  /** Change what they can do: a new share prefilled from this one, whose Review shows the difference.
   *  The old share keeps its rights until it is stopped: `onStopOld` opens the tab's Stop for it, never by itself. */
  replace?: { raw: RawToken; onStopOld: () => void };
}

export function ShareDrawer({
  realms,
  realm,
  preselect,
  ledgerOf,
  onClose,
  onChanged,
  replace,
}: ShareDrawerProps) {
  const t = useStrings(strings);
  const freshList = useFreshList();
  const go = useGo();
  const realmsLink = usePageLink("realms");
  const mint = useShareMint();
  const stop = useStopShare();
  const settleChange = useSettleChange();
  /** A stop that may have gone through: only a read-back, never a second stop. `hold`: core's hold of that send
   *  (Check again and Dismiss free only it). */
  const [stopUnsure, setStopUnsure] = useState<{ hold?: string } | null>(null);
  // The lost share's stop is another page's: shown read-only with its link (no Check again, Dismiss or Stop).
  const [stopAway, setStopAway] = useState<Elsewhere | null>(null);
  const [picked, setPicked] = useState<string | undefined>(
    /^[0-9a-f]{24}$/.test(realm) ? realm : preselect,
  );
  const templates = useTemplates();
  // The server's catalogue narrows the offer; undefined while it loads, null when it failed (starting points only).
  const cat = useMemo<Catalogue | null | undefined>(() => {
    if (templates.data) {
      const c = catalogue(templates.data);
      return c.rights.length ? c : null;
    }
    return templates.isError ? null : undefined;
  }, [templates.data, templates.isError]);
  const known = cat ?? null;
  // The catalogue as of now, for a create that waited for its hold: the press's own render may be stale by then.
  const catNow = useRef(cat);
  catNow.current = cat;
  // The ticks (the base is never one), the starting point shown, and the limits. effectiveRights() of the ticks is
  // the one selection every view and the body read.
  // A replacement starts from the old share's rights and limits; a new share from See only, 7 days.
  const [from] = useState(() => (replace ? replaceStart(replace.raw) : null));
  const [ticked, setTicked] = useState<string[]>(from?.ticked ?? []);
  const [pick, setPick] = useState<ShareStart>(from ? startOf(from.ticked) : "see");
  const [ends, setEnds] = useState<string>(from?.at ? "pick" : String(DEFAULT_DAYS));
  const [at, setAt] = useState<number | null>(from?.at ?? null);
  const [ips, setIps] = useState(from?.ips ?? "");
  const [who, setWho] = useState(from?.who ?? "");
  const [step, setStep] = useState<"choose" | "review">("choose");
  // The selection the Review showed: Create sends it or nothing.
  const [reviewed, setReviewed] = useState<string[] | null>(null);
  // The end the Review showed, fixed at the press in whole seconds: Create sends this instant, never a later one.
  const [reviewedEnd, setReviewedEnd] = useState<number | null>(null);
  const [voided, setVoided] = useState(false);
  const [offNote, setOffNote] = useState<string | null>(null);
  const narrow = useMedia("(max-width: 719px)");
  const [phase, setPhaseState] = useState<Phase>({ kind: "form" });
  const [busy, setBusy] = useState(false);
  // From the press of Create until its outcome the form is locked: the request is built from what was pressed,
  // so nothing may change on screen while the hold is taken (it would show other access than the one sent).
  const [admitting, setAdmitting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [, bump] = useState(0);
  const phaseRef = useRef<Phase>(phase);
  const mounted = useRef(true);
  const target = picked ?? "";
  const ledger = target ? ledgerOf(target) : [];

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    if (mounted.current) setPhaseState(p);
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const p = phaseRef.current;
      if (p.kind === "shown") {
        p.held.drop();
        p.heldPrompt?.drop();
        p.heldLink?.drop();
      }
    };
  }, []);

  // Reopened (or the realm picked) with a share unresolved or lost for it: recovery is here, not only behind.
  useEffect(() => {
    if (phaseRef.current.kind !== "form" || !target) return;
    const st = status(ledgerOf(target));
    if (st.state === "lostSecret") {
      setPhase({ kind: "lost", id: st.id });
      // A stop sent before the drawer was closed may have gone through: only a read-back, never a second stop.
      const id = st.id;
      if (id)
        void isChangePending("remove", { id }).then(async (unsure) => {
          const away = unsure
            ? await heldElsewhere("remove", { id })
            : undefined;
          const hold = unsure
            ? await settleChange.holdOf.remove({ id })
            : undefined;
          if (unsure && mounted.current) {
            setStopUnsure(hold ? { hold } : {});
            setStopAway(away ?? null);
          }
        });
    } else if (st.state === "cantCheck")
      setPhase({ kind: "pending", reading: false, failed: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const place = target ? realmName(realms, target) : "";
  const isBlocked = blocked(ledger, busy);
  const locked = admitting || phase.kind === "sending";
  const limits: ShareLimits = {
    days: ends === "pick" ? null : (Number(ends) as Days),
    at,
    ips,
    who,
  };
  const problems = shareLimitsProblems(limits, Date.now());
  const hasProblem = Object.keys(problems).length > 0;
  const avail = availableRights(known);
  const effective = effectiveRights(ticked, known);
  const effKey = effective.join(",");
  const rightWords = (p: string) => t(`share.r.${p}` as "share.r.computers.read");
  const tagWords = (p: string) => tagsOf(p).map((tg) => t(`share.tag.${tg}` as "share.tag.money"));
  const tagCountText = (rights: readonly string[]) =>
    countTags(rights).map(([tg, n]) => t(`share.tagN.${tg}` as "share.tagN.money", { count: n }));
  const startOk = (k: Exclude<ShareStart, "custom">) => SHARE_STARTS[k].every((r) => avail.includes(r));
  // Why Review is off, the first reason only; null: it can be pressed.
  const why = !target
    ? t("share.whyRealm")
    : hasProblem
      ? // "Pick a date and time" with nothing picked yet has no error at its field (an empty date is not a wrong one):
        // the reason names it, in place of the general "fix the limits".
        ends === "pick" && at === null
        ? t("share.whyDate")
        : t("share.whyLimits")
      : cat === undefined
        ? t("share.whyLoading")
        : cat === null && pick === "custom"
          ? t("share.whyCustom")
          : isBlocked
            ? t("share.createBlocked")
            : null;

  // The effective selection moved under an open Review (the catalogue changed): the Review is void, back to Choose.
  useEffect(() => {
    // Custom without a catalogue is never reviewable (whyCustom), so a catalogue lost under it voids the Review too.
    const moved = !!reviewed && (reviewed.join(",") !== effKey || (cat === null && pick === "custom"));
    if (step === "review" && moved && phaseRef.current.kind === "form") {
      setStep("choose");
      setReviewed(null);
      setVoided(true);
    }
  }, [effKey, step, reviewed, cat, pick]);

  // All permissions picked, then a loaded catalogue shrank (a refusal's refetch): the pick no longer holds every offered
  // right, so it becomes Custom and the card that says "Everything" goes; the ticks stay and the Review shows what is
  // sent. Only a loaded catalogue: while it loads, or with a failed read, the start stays as the person left it.
  const allOk = startOk("all");
  useEffect(() => {
    if (cat && pick === "all" && !allOk) setPick("custom");
  }, [cat, pick, allOk]);

  const pickStart = (k: ShareStart) => {
    setPick(k);
    setOffNote(null);
    setVoided(false);
    if (k !== "custom") setTicked([...SHARE_STARTS[k]]);
  };
  // What the last untick also dropped (rights that need it), said politely beside the list.
  const dropped = useRef<string[]>([]);
  const toggle = (list: readonly string[], p: string, on: boolean) => {
    const next = toggleRight(list, p, on, known);
    if (!on) dropped.current.push(...list.filter((r) => r !== p && !next.includes(r)));
    return next;
  };
  const onTicks = (next: string[]) => {
    const gone = [...new Set(dropped.current)].filter((r) => !next.includes(r));
    dropped.current = [];
    setOffNote(gone.length ? t("share.alsoOff", { rights: gone.map(rightWords).join(", ") }) : null);
    setTicked(next);
    setPick(startOf(next) === "custom" ? "custom" : startOf(next));
    setVoided(false);
  };

  const sending = useRef(false);
  const create = async () => {
    if (!target || isBlocked || sending.current) return;
    sending.current = true;
    setAdmitting(true);
    try {
      await createOnce();
    } finally {
      sending.current = false;
      if (mounted.current) setAdmitting(false);
    }
  };
  const createOnce = async () => {
    if (!target || hasProblem || !reviewed || reviewedEnd === null) return;
    // Custom as the Review showed it, taken at the press: chosen by name (its ticks may equal a starting point) or by
    // ticks. Without a catalogue it is never sent, however long the hold wait.
    const custom = pick === "custom" || startOf(ticked) === "custom";
    const led = ledger;
    const alias = shareAlias(freshAlias(led, undefined, who), who);
    // The context the person acted under: the hold is taken for it, and the mint runs under it or not at all.
    const ctx = capture();
    const lock = shareLock(target);
    // Held in core before it leaves: every tab of the account sees it, and a reload keeps it, until a read proves
    // it or the person dismisses it (warned). Its meta is the alias only (never a secret).
    const got = await holdAttempt(lock, {
      by: SHARE_BY,
      meta: { alias },
      realm: target,
    });
    if (!got.ok) {
      bump((n) => n + 1);
      // Another tab holds a create for this realm: it is shown (the ledger takes it in), nothing is sent. Storage
      // that can't keep the hold (NOT_DURABLE) says so; any other refusal (core's cap of the account's holds, no
      // account) sends nothing either and says so.
      if (got.code === "HELD" && got.held?.lock === lock) {
        if (mounted.current)
          setPhase({ kind: "pending", reading: false, failed: false });
      } else if (mounted.current)
        setNote(
          t(got.code === "NOT_DURABLE" ? "share.noStorage" : "share.notSent"),
        );
      return;
    }
    const hold = got.hold;
    // The drawer closed or the account or realm changed while the hold was taken: nothing goes out.
    if (!mounted.current || !alive(ctx)) {
      hold.release();
      bump((n) => n + 1);
      return;
    }
    // A hold only this tab knows would not survive a reload, and Create would then send again: nothing is sent.
    // Core refuses such a hold up front (NOT_DURABLE, above); this is the last check before the send.
    if (!heldAttempts(lock).some((h) => h.id === hold.id && h.persisted)) {
      hold.release();
      bump((n) => n + 1);
      setNote(t("share.noStorage"));
      return;
    }
    // The catalogue as of now (the press's own render may be stale after the hold wait), and the Review's own end.
    const now = catNow.current;
    const body = shareBodyV3(alias, target, ticked, now ?? null, { ...limits, days: null, at: reviewedEnd }, Date.now());
    // Nothing goes out when the Review no longer holds: its end has passed, the rights differ from what it showed (the
    // catalogue moved meanwhile), or a Custom choice lost its catalogue. The drawer goes back to Choose and says why.
    const same =
      !!body &&
      leavesOf(body.permissions).sort().join(",") === [...reviewed].sort().join(",") &&
      !(now === null && custom);
    if (!body || !same) {
      hold.release();
      bump((n) => n + 1);
      if (mounted.current) {
        setStep("choose");
        setReviewed(null);
        if (!body) setNote(t("share.timePast"));
        else setVoided(true);
      }
      return;
    }
    const can = reviewed.map(rightWords).join("; ");
    const entry: LedgerEntry = {
      alias,
      state: "out",
      id: null,
      hold: hold.id,
    };
    led.push(entry);
    bump((n) => n + 1);
    setBusy(true);
    setNote(null);
    setPhase({ kind: "sending" });
    const asked = Date.parse(body.expires_at);
    const where = realmName(realms, target);
    // No realm API address on this page: no agent prompt is made (ShareShown says why).
    const api = shareApiUrl(target);
    // Where the person signs in: this Hub's Hoody (hubSiteOrigin). With none chosen yet (a standalone Hub), the message
    // names no address and no sign-in link is made. Off the web (a terminal) it is the web Hub's address the host
    // carries (hostEnv().pageAddress), else none.
    const env = hostEnv();
    const site = env.browserPage ? hubSiteOrigin() : (env.pageAddress?.origin ?? "");
    const res = await mint(
      ctx,
      body as unknown as Record<string, unknown>,
      (token, expires) =>
        shareText({
          head: t("share.textHead", { place: where }),
          how: site ? t("share.textHow", { url: site }) : null,
          realm: t("share.textRealm", { realm: where }),
          can: t("share.textCan", { rights: can }),
          token: t("share.textToken", { token }),
          ends: expires ? t("share.textEnds", { date: utc(expires) }) : null,
        }),
      asked,
      api
        ? (token, expires) =>
            sharePrompt({
              head: t("share.promptHead", { realm: where }),
              can: t("share.promptCan", { rights: can }),
              api: t("share.promptApi", { url: api }),
              auth: t("share.promptAuth", { token }),
              ends: expires ? t("share.promptEnds", { date: utc(expires) }) : null,
            })
        : undefined,
      site ? (token) => shareLink(site, token, target) : undefined,
    );
    setBusy(false);
    onChanged();
    if (res.outcome === "pending") hold.sent();
    else hold.release();
    if (res.outcome === "done") {
      entry.id = res.id ?? null;
      if (!mounted.current) {
        res.held?.drop();
        res.heldPrompt?.drop();
        res.heldLink?.drop();
        entry.state = "lost";
        showToast({ title: t("share.lateMade"), tone: "info" });
        return;
      }
      if (res.held) {
        entry.state = "made";
        setPhase({
          kind: "shown",
          held: res.held,
          heldPrompt: res.heldPrompt ?? null,
          heldLink: res.heldLink ?? null,
          ctx: res.ctx,
          realm: target,
          expires: res.expiresAt ?? null,
          short: shortened(res.expiresAt ?? null, asked),
          place: where,
        });
      } else {
        res.heldPrompt?.drop();
        res.heldLink?.drop();
        entry.state = "lost";
        setPhase({ kind: "lost", id: entry.id });
      }
    } else if (res.outcome === "pending") {
      entry.id = res.id ?? null;
      entry.state = "unknown";
      if (!mounted.current)
        showToast({
          title: t("share.latePending"),
          tone: "unknown",
          // Only a read: the Shared access tab shows the share once listed, or its held state with Check again.
          action: { label: t("share.checkShared"), onAction: () => go(links.shared) },
          /* noDetails: the answer was lost (pending), so there is no rejection to show */
        });
      else setPhase({ kind: "pending", reading: false, failed: false });
    } else {
      led.splice(led.indexOf(entry), 1);
      setPhase({ kind: "form" });
      // A 400 is a definite refusal, and one this page can't name (a code core does not keep, such as a right the
      // server no longer knows): the catalogue is read again and the choice checked again; nothing was made.
      if (res.status === 400 && !res.cancelled) {
        void templates.refetch();
        setStep("choose");
        setReviewed(null);
        setNote(t("share.rejected"));
      } else if (!res.cancelled) setNote(t("share.failed"));
      // A cancelled sign-in-code prompt sent nothing and says nothing.
    }
    bump((n) => n + 1);
  };

  const check = async () => {
    const p = phaseRef.current;
    if (p.kind !== "pending") return;
    setPhase({ ...p, reading: true });
    setNote(null);
    const was: LedgerState[] = ledger.map((x) => x.state);
    const r = await freshList();
    if (r.error || !r.data) {
      setPhase({ kind: "pending", reading: false, failed: true });
      return;
    }
    settle(ledger, was, r.data.rows, r.data.truncated, Date.now());
    const st = status(ledger);
    bump((n) => n + 1);
    onChanged();
    if (st.state === "lostSecret") {
      setPhase({ kind: "lost", id: st.id });
      // A stop sent before the drawer was closed may have gone through: only a read-back, never a second stop.
      const id = st.id;
      if (id)
        void isChangePending("remove", { id }).then(async (unsure) => {
          const away = unsure
            ? await heldElsewhere("remove", { id })
            : undefined;
          const hold = unsure
            ? await settleChange.holdOf.remove({ id })
            : undefined;
          if (unsure && mounted.current) {
            setStopUnsure(hold ? { hold } : {});
            setStopAway(away ?? null);
          }
        });
    } else if (st.state === "notFound") setPhase({ kind: "form" });
    else {
      // The list does not show the token yet: that proves nothing (the create may still be in work).
      setPhase({ kind: "pending", reading: false, failed: false });
      setNote(t("share.notYet"));
    }
  };

  // The person's warned Dismiss: the unresolved creates it was shown (`shown`, taken when the warning opened) are
  // forgotten and Create comes back; one may have been made. One that moved meanwhile is not ended: it says so.
  const dismiss = (shown: readonly string[]) => {
    if (phaseRef.current.kind !== "pending") return;
    const all = dismissUnknown(ledger, shown);
    bump((n) => n + 1);
    if (!all) {
      setNote(t("op.notSettled"));
      return;
    }
    setPhase({ kind: "form" });
    setNote(t("share.notFound"));
  };

  const stopLost = async (id: string | null) => {
    if (!id) return;
    // The realm the lost share is of, taken at the press (a realm picked meanwhile is another share's).
    const realm = place;
    setBusy(true);
    const r = await stop({ id });
    setBusy(false);
    onChanged();
    if (r.cancelled) return;
    if (r.outcome === "done") {
      ledger.forEach((x) => {
        if (x.id === id) x.state = "gone";
      });
      showToast({ title: t("share.stopped", { realm }), tone: "ok" });
      setPhase({ kind: "form" });
    } else {
      setStopUnsure(
        r.outcome === "pending" ? (r.hold ? { hold: r.hold } : {}) : null,
      );
      setStopAway(elsewhereOfChange(r) ?? null);
      setNote(
        r.outcome === "pending"
          ? t("share.stopUnknown")
          : t("share.stopFailed"),
      );
    }
  };

  // `shown` is the unconfirmed stop when Check was pressed: the read proves that send and frees only its hold.
  const checkStopLost = async (
    id: string | null,
    shown: { hold?: string } | null,
  ) => {
    if (!id || !shown) return;
    const realm = place;
    setBusy(true);
    const now = await settleChange.holdOf.remove({ id });
    if (now !== undefined && now !== shown.hold) {
      setBusy(false);
      setNote(t("op.notSettled"));
      return;
    }
    const hold = shown.hold;
    const r = await freshList();
    setBusy(false);
    // A read that proves nothing says so, as the Shared tab's Check does: the stop stays unconfirmed.
    if (r.error || !r.data) {
      setNote(t("share.stopReadFailed"));
      return;
    }
    const row = r.data.rows.find((x) => x.id === id);
    // A cut list is no proof the share is gone.
    if (!row && r.data.truncated) {
      setNote(t("share.stopCut"));
      return;
    }
    // Any row still listed, paused or not, proves nothing (a stop deletes the key; SharedTab's checkStop has the same
    // rule): the stop may still land. It stays unconfirmed (Check again, or Dismiss).
    if (row) {
      setNote(t("share.stopNotYet"));
      return;
    }
    const away = await settleChange.remove({ id }, hold);
    if (away === NOT_SETTLED) {
      setNote(t("op.notSettled"));
      return;
    }
    if (away) {
      setStopAway(away);
      return;
    }
    onChanged();
    setStopUnsure((u) => (u?.hold === shown.hold ? null : u));
    ledger.forEach((x) => {
      if (x.id === id) x.state = "gone";
    });
    showToast({ title: t("share.stopped", { realm }), tone: "ok" });
    setNote(null);
    setPhase({ kind: "form" });
  };

  /** The person's warned Dismiss of a stop that may have gone through: the share may still be live, so Stop it
   *  is offered again (a second stop of the same share does nothing more). */
  const dismissStopLost = async (
    id: string | null,
    shown: { hold?: string } | null,
  ) => {
    if (!id || !shown) return;
    // Only the stop the warning was opened for: a later stop of the share stays held.
    const away = await settleChange.remove({ id }, shown.hold);
    if (away === NOT_SETTLED) {
      setNote(t("op.notSettled"));
      return;
    }
    if (away) {
      setStopAway(away);
      return;
    }
    setStopUnsure((u) => (u?.hold === shown.hold ? null : u));
    setNote(null);
    onChanged();
  };

  // The kit Drawer asks first when a shown-once text would be lost; this runs once it is agreed.
  const close = () => {
    const p = phaseRef.current;
    if (p.kind === "shown") {
      p.held.drop();
      p.heldPrompt?.drop();
      p.heldLink?.drop();
    }
    onClose();
  };
  const request = (open: boolean) => {
    if (!open) close();
  };

  let body;
  let foot: Pick<
    DrawerProps,
    "primary" | "secondary" | "outcome" | "cancel" | "dirty" | "busy" | "reason"
  > = {};
  // Where the person is: choosing, then the Review that Create sends from.
  const steps = (
    <Track label={t("share.steps")} open={null}>
      <TrackStep id="choose" state={step === "review" ? "done" : "now"} name={t("share.stepChoose")} />
      <TrackStep id="review" state={step === "review" ? "now" : "later"} name={t("share.stepReview")} />
    </Track>
  );
  if (phase.kind === "shown") {
    body = (
      <ShareShown
        held={phase.held}
        heldPrompt={phase.heldPrompt}
        heldLink={phase.heldLink}
        ctx={phase.ctx}
        realm={phase.realm}
        place={phase.place}
        expires={phase.expires}
        short={phase.short}
      />
    );
    if (replace)
      body = (
        <Stack gap={4}>
          {body}
          <Band
            tone="warn"
            size="table"
            /* noDetails: what a replacement leaves in place, not a rejection */
            actions={
              <Button variant="secondary" size="sm" onPress={replace.onStopOld}>
                {t("share.stopOld")}
              </Button>
            }
          >
            {t("share.replaceKeeps")}
          </Band>
        </Stack>
      );
    // Done is the primary: nothing is left to send, and it closes through the same guard as Esc.
    foot = {
      primary: <DrawerCancel variant="primary" label={t("share.done")} />,
      cancel: false,
      dirty: true,
    };
  } else if (phase.kind === "pending") {
    // The unresolved creates shown now (a fresh nonce each): a Dismiss warning opened now ends only these.
    const shownAliases = unknownAliases(ledger);
    body = (
      <Panel gap={3}>
        <OutcomeBanner
          kind="pending"
          title={t("share.cantCheck")}
          known={t("share.cantCheckBody")}
          checkLine={phase.failed ? t("pd.readFailedHelp") : (note ?? undefined)}
        />
      </Panel>
    );
    foot = {
      cancel: t("pd.close"),
      secondary: phase.reading ? undefined : (
        <DismissButton
          key={shownAliases.join(",")}
          onDismiss={() => dismiss(shownAliases)}
          body={t("dismiss.bodyShare")}
          variant="secondary"
          size="md"
        />
      ),
      primary: (
        <Button
          variant="primary"
          icon="reload"
          busy={phase.reading}
          onPress={() => void check()}
        >
          {t("action.checkAgain")}
        </Button>
      ),
    };
  } else if (phase.kind === "lost") {
    body = (
      <Panel>
        <OutcomeBanner
          kind="failed"
          title={t("share.lostSecret")}
          body={t("share.lostSecretBody")}
        />
        {stopAway ? (
          <ElsewhereNote away={stopAway} />
        ) : (
          note && (
            <OutcomeBanner
              kind={stopUnsure ? "pending" : "failed"}
              title={note}
            />
          )
        )}
      </Panel>
    );
    foot = {
      cancel: t("pd.close"),
      busy,
      secondary:
        phase.id && stopUnsure && !stopAway && !busy ? (
          <DismissButton
            key={stopUnsure.hold ?? ""}
            onDismiss={() => dismissStopLost(phase.id, stopUnsure)}
            variant="secondary"
            size="md"
          />
        ) : undefined,
      primary:
        phase.id && !stopAway ? (
          stopUnsure ? (
            <Button
              variant="primary"
              icon="reload"
              busy={busy}
              onPress={() => void checkStopLost(phase.id, stopUnsure)}
            >
              {t("action.checkAgain")}
            </Button>
          ) : (
            <Button
              tone="danger"
              busy={busy}
              onPress={() => void stopLost(phase.id)}
            >
              {t("share.stopIt")}
            </Button>
          )
        ) : undefined,
    };
  } else if (step === "review" && reviewed) {
    // The Review shows exactly the selection Create sends: per area, in plain words with their tags.
    const held = reviewed;
    const endMs = reviewedEnd;
    const tagKinds = TAG_ORDER.filter((tg) => held.some((r) => tagsOf(r).includes(tg)));
    const cant = cantList(held);
    // A replacement: what the new share adds and leaves out, against the old one's rights.
    const diff = from ? rightsDiff(from.ticked, held.filter((r) => !SHARE_BASE.includes(r))) : null;
    body = (
      <Stack gap={4}>
        {steps}
        {diff && (
          <Band tone="warn" size="table" /* noDetails: what the new share changes, not a rejection */>
            <strong>{t("share.replaceKeeps")}</strong>
            <ul className={s.reviewList}>
              <li>{t("share.diffNew", { list: diff.added.length ? diff.added.map(rightWords).join(" · ") : t("share.diffNone") })}</li>
              <li>{t("share.diffGone", { list: diff.removed.length ? diff.removed.map(rightWords).join(" · ") : t("share.diffNone") })}</li>
            </ul>
          </Band>
        )}
        <Facts
            label={t("share.rvTitle")}
            items={[
              { label: t("share.rvRealm"), value: place },
              {
                label: t("share.rvEnds"),
                value: endMs
                  ? t("share.rvEndsAt", { local: localTime(endMs), zone: ZONE, utc: utc(new Date(endMs).toISOString()) })
                  : "",
              },
              { label: t("share.rvAddresses"), value: ips.trim() ? ips.trim() : t("share.rvAny") },
              { label: t("share.rvWho"), value: who.trim() || t("share.rvNoWho") },
            ]}
          />
        <SubSection title={t("share.rvCan")} state={{ kind: "ready" }}>
            {AREAS.map((area) => {
              const rows = held.filter((r) => areaOf(r) === area);
              if (!rows.length) return null;
              return (
                <div key={area} className={s.reviewArea}>
                  <p className={s.reviewAreaName}>{t(`share.area.${area}` as "share.area.computers")}</p>
                  <ul className={s.reviewList}>
                    {rows.map((r) => (
                      <li key={r} className={s.reviewRight}>
                        <span>{rightWords(r)}</span>
                        {tagWords(r).map((x) => (
                          <Tag key={x} tone="warn">
                            {x}
                          </Tag>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
        </SubSection>
        <SubSection title={from ? t("share.rvCantNew") : t("share.rvCant")} description={t("share.cant.never")} state={{ kind: "ready" }}>
            <ul className={s.reviewList}>
              {cant
                .filter((c) => c !== "never" && c !== "keyEnds")
                .map((c) => (
                  <li key={c}>{t(`share.cant.${c}` as "share.cant.act")}</li>
                ))}
            </ul>
            <Notice>{t("share.cant.keyEnds")}</Notice>
        </SubSection>
        <ShareComputers realm={picked} locked={locked} />
        {tagKinds.length > 0 && (
          <Band
            tone="warn"
            size="table"
            /* noDetails: a warning about what the chosen rights allow, not a rejection */
          >
            <strong>{t("share.warnTitle")}</strong>
            <ul className={s.reviewList}>
              {tagKinds.map((tg) => (
                <li key={tg}>{t(`share.warn.${tg}` as "share.warn.money")}</li>
              ))}
            </ul>
          </Band>
        )}
        <Notice>
          <strong>{t("share.noteTitle")}</strong> {t("share.notePrograms")}
        </Notice>
        {/* The kit's one live line, kept mounted so the words are heard as they arrive; the spinner is only its mark. */}
        <StatusLine>
          {phase.kind === "sending" ? (
            <>
              <Spinner /> {t("share.creating")}
            </>
          ) : null}
        </StatusLine>
        {note && (
          <OutcomeBanner
            kind="failed"
            title={note}
            /* noDetails: the same note the form shows; mintFailed keeps the outcome and status only, no rejection */
          />
        )}
      </Stack>
    );
    foot = {
      busy: phase.kind === "sending",
      ...(isBlocked && phase.kind !== "sending" ? { reason: t("share.createBlocked") } : {}),
      // Back is the way out of the Review (the header's close stays): three buttons don't fit a phone footer.
      cancel: false,
      secondary: (
        <Button
          variant="secondary"
          chip={false}
          isDisabled={locked}
          onPress={() => {
            setStep("choose");
            setReviewed(null);
            setNote(null);
          }}
        >
          {t("share.back")}
        </Button>
      ),
      primary: (
        <Button
          variant="primary"
          busy={locked}
          isDisabled={!target || isBlocked || hasProblem}
          onPress={() => void create()}
        >
          {phase.kind === "sending" ? t("share.creating") : t("share.create")}
        </Button>
      ),
    };
  } else {
    const areas: RightsArea[] = AREAS.map((area) => ({
      key: area,
      label: t(`share.area.${area}` as "share.area.computers"),
      paths: [
        ...SHARE_BASE.filter((b) => areaOf(b) === area),
        ...SHARE_OFFER.filter((o) => o.area === area && avail.includes(o.right)).map((o) => o.right),
      ],
    })).filter((a) => a.paths.length > 0);
    const endsProblem = problems.ends;
    body = (
      <Stack gap={4}>
        <Verdict label={t("share.introLabel")} next={t("share.introNext")}>
          {t("share.intro")}
        </Verdict>
        {steps}
        {!/^[0-9a-f]{24}$/.test(realm) && (
          <PickerPanel
            label={t("share.pickRealm")}
            showLabel
            mode="single"
            items={realms?.map((r) => ({
              id: r.id,
              label: r.name,
              // Its short handle, never the full id: the id is the value only.
              description: realmName(undefined, r.id),
            }))}
            value={picked ? [picked] : []}
            onChange={(ids) => setPicked(ids[0])}
            isDisabled={locked}
          />
        )}
        <ShareComputers realm={picked} locked={locked} />
        {voided && (
          <Band
            tone="warn"
            size="table"
            /* noDetails: a notice that the rights changed under the Review, not a rejection */
          >
            {t("share.changedRights")}
          </Band>
        )}
        <SubSection title={t("share.can")} state={{ kind: "ready" }}>
          <SegmentedControl<ShareStart>
            label={t("share.can")}
            fullWidth
            value={pick}
            onChange={pickStart}
            isDisabled={locked}
            items={(["see", "act", "work", "all", "custom"] as const).map((k) => {
              const off = k !== "custom" && !startOk(k);
              const label = t(`share.start.${k}` as "share.start.see");
              return { id: k, label: off ? t("share.startNA", { start: label }) : label, isDisabled: off };
            })}
          />
          {pick === "all" && (
            <Band tone="warn" size="table" /* noDetails: what All permissions holds and still leaves out, not a rejection */>
              {t("share.start.allH")}
            </Band>
          )}
          {cat === undefined && <Notice icon={null}>{t("share.catLoading")}</Notice>}
          {cat === null && (
            <>
              <Notice level="warn">{t("share.catFailed")}</Notice>
              <Row>
                <Button variant="secondary" size="sm" onPress={() => void templates.refetch()}>
                  {t("share.catRetry")}
                </Button>
              </Row>
            </>
          )}
          {cat && (
            <RightsPicker
              cat={{ ...OFFER_CAT, rights: avail }}
              ticked={ticked.filter((r) => avail.includes(r))}
              onChange={onTicks}
              areas={areas}
              locked={{ paths: SHARE_BASE, hint: t("share.baseH") }}
              tags={tagWords}
              note={(p) => {
                const also = alsoOf(p);
                return also.length ? t("share.alsoOn", { rights: also.map(rightWords).join(", ") }) : undefined;
              }}
              toggle={toggle}
              count={[t("share.rights", { count: effective.length }), ...tagCountText(effective)].join(" · ")}
              groupNote={(paths) =>
                [
                  t("share.areaCount", { n: paths.filter((p) => effective.includes(p)).length, m: paths.length }),
                  ...tagCountText(effective.filter((r) => paths.includes(r))),
                ].join(" · ")
              }
              collapsible={narrow}
              name={rightWords}
              isDisabled={locked}
            />
          )}
          {offNote && (
            <p
              className={s.help}
              role="status" // reason: polite note that an untick also dropped the rights needing it
            >
              {offNote}
            </p>
          )}
          <Disclosure title={t("share.never")}>
            <ul className={s.reviewList}>
              {[...new Set(SHARE_NEVER.map((n) => n.reason))].map((r) => (
                <li key={r}>{t(`share.never.${r}` as "share.never.money")}</li>
              ))}
            </ul>
          </Disclosure>
        </SubSection>
        <SubSection title={t("share.limits")}>
          <SegmentedControl
            label={t("share.ends")}
            showLabel
            fullWidth
            value={ends}
            onChange={(v) => setEnds(v)}
            isDisabled={locked}
            items={[
              ...DAYS.map((d) => ({ id: String(d), label: t(`share.d${d}` as "share.d1") })),
              { id: "pick", label: t("share.endsPick") },
            ]}
          />
          {ends === "pick" && (
            <DateTimeField
              label={t("share.endsAt")}
              value={at}
              onChange={setAt}
              description={t("share.endsZone", { zone: ZONE })}
              errorMessage={
                endsProblem === "timePast"
                  ? t("share.timePast")
                  : endsProblem === "dateFar"
                    ? t("share.dateFar")
                    : endsProblem && at !== null
                      ? t("share.dateBad")
                      : undefined
              }
              isDisabled={locked}
            />
          )}
          <IpAllowlistField
            label={t("share.ips")}
            description={t("share.ipsH")}
            value={ips}
            onChange={(next) => setIps((v) => next(v))}
            errorMessage={
              problems.ips === "ipsNone" ? t("share.ipsNone") : problems.ips === "ipsMany" ? t("share.ipsMany") : problems.ips ? t("share.ipsBad") : undefined
            }
            isDisabled={locked}
          />
          <TextField
            label={t("share.who")}
            description={t("share.whoH")}
            value={who}
            onChange={setWho}
            errorMessage={problems.who ? t("share.whoBad") : undefined}
            isDisabled={locked}
          />
          <p className={s.help}>
            <strong>{t("share.some")}</strong> {t("share.someH")}{" "}
            {realmsLink && (
              <Button
                variant="ghost"
                size="sm"
                onPress={() => (realmsLink.kind === "hub" ? go(realmLinks.create) : followPageLink(realmsLink, go))}
              >
                {t("share.newRealm")}
              </Button>
            )}
          </p>
        </SubSection>
        {note && <OutcomeBanner kind="failed" title={note} />}
      </Stack>
    );
    foot = {
      ...(why ? { reason: why } : {}),
      primary: (
        <Button
          variant="primary"
          isDisabled={!!why || locked}
          onPress={() => {
            setReviewed(effective);
            const end = limits.days === null ? limits.at : Date.now() + limits.days * 86400000;
            setReviewedEnd(end === null ? null : Math.floor(end / 1000) * 1000);
            setStep("review");
            setVoided(false);
            setNote(null);
          }}
        >
          {t("share.review")}
        </Button>
      ),
    };
  }

  return (
    <Drawer resizeKey="keys-share"
      isOpen
      onOpenChange={request}
      title={target ? t("share.title", { place }) : t("share.titleAll")}
      size={phase.kind === "form" || phase.kind === "sending" ? "lg" : "sm"}
      {...foot}
      {...(phase.kind === "shown"
        ? {
            discardText: t("share.closeAsk"),
            discardLabel: t("sh.closeNow"),
          }
        : {})}
    >
      {body}
    </Drawer>
  );
}
