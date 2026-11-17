// SSH key tab: the key of the computer the top bar shows (a container field; there is no account-level key).
// A private key is refused before anything else. An unknown answer reads the computer back; nothing is resent.
import {
  Button,
  ComputerRequired,
  ConfirmDialog,
  CopyField,
  Link,
  OutcomeBanner,
  SettingGroup,
  SettingRow,
  Skeleton,
  SshKeyFinish,
  SshKeyHelp,
  ErrorState,
  showToast,
  TextField,
  usePageLink,
  useShellData,
  useStrings,
  type OutcomeKind,
} from "@kit";
import {
  capture,
  heldChanges,
  keepsChanges,
  onBump,
  type HeldChange,
} from "@core";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useWipeOn } from "@kit/forms/Secret";
import {
  isOwnSshHold,
  readBackSsh,
  useChangesVersion,
  useFreshComputer,
  useSetSshKey,
  useSettleChange,
  useComputerReadFail,
  useTopComputer,
  NOT_SETTLED,
} from "../data";
import { applied, checkSshKey, secretLike, sshHost, sshKeyDisplay } from "../ssh-logic";
import strings from "../strings.en.json";
import { links as computers } from "../../computers/links";
import { DismissButton } from "./Dismiss";
import { Frame } from "./Frame";
import type { K } from "./words";
import s from "./keys.module.css";

interface Result {
  kind: OutcomeKind;
  want: string | null;
  computer: string;
  /** The computer's name at the time of the send: the banner names it, whatever the screen shows later. */
  name: string;
  code?: string;
  note?: string;
  /** Known only from core's hold (this tab's own result was lost): only core's read-back can prove it. */
  held?: true;
  /** Held for another page (Computers sent it): core frees a sender's own change only, so this page can neither
   *  prove nor dismiss it; the banner sends the person to Computers. */
  other?: true;
  /** The realm it was sent in: only that realm's host is asked about the computer. */
  realm?: string | null;
  /** This send's own number: a Check settles only the send it examined, never a later one for the computer. */
  n?: number;
  /** Core's hold of the send this result shows (its own send's, or the held entry's): the lock is the computer
   *  alone, so Check and Dismiss free only this send, never a later one of the computer. */
  hold?: string;
}

// The results live here, not in the component: a change that may have gone through is still unconfirmed after
// the person leaves this tab and comes back (core holds its lock the same way). A switch drops both.
let kept: Record<string, Result> = {};
let sends = 0;
/** Moves each time a switch of account, or a sign-out, drops the results: a send answered after it shows nothing. */
let keptEpoch = 0;
/** Tests: forget every result (what a page that never saw the change would hold). */
export const forgetKept = () => setKept(() => ({}));
const keptListeners = new Set<() => void>();
const setKept = (f: (o: Record<string, Result>) => Record<string, Result>) => {
  kept = f(kept);
  keptListeners.forEach((l) => l());
};
// Core keeps its lock across a realm switch (keepsChanges): so does the banner that says so. Only a switch of
// account, or a sign-out, drops it with the lock.
onBump((reason) => {
  if (keepsChanges(reason)) return;
  keptEpoch++;
  setKept(() => ({}));
});
/** The computer core holds an SSH change of (from its hold's identity). */
const heldComputer = (h: HeldChange): string | undefined => {
  const id = (h.identity as { computer?: unknown } | undefined)?.computer;
  return typeof id === "string" ? id : undefined;
};
/** A change known only from core's hold, named `name`: only core's read-back proves it; its hold binds Check and
 *  Dismiss to that send. */
const heldResult = (h: HeldChange, computer: string, name: string): Result => ({
  kind: "pending",
  want: null,
  computer,
  name,
  held: true,
  ...(isOwnSshHold(h) ? {} : { other: true as const }),
  realm: h.realm,
  hold: h.hold,
});
const subscribeKept = (l: () => void) => {
  keptListeners.add(l);
  return () => void keptListeners.delete(l);
};

export function SshTab({
  keysCount,
  sharedCount,
}: {
  keysCount?: number;
  sharedCount?: number;
}) {
  const t = useStrings(strings);
  const comp = useTopComputer();
  const readFail = useComputerReadFail(comp.error);
  /** The shell's realm switch; undefined while the session is pinned to one realm. */
  const setRealm = useShellData().setRealm;
  const freshComputer = useFreshComputer();
  const settleChange = useSettleChange();
  const computersLink = usePageLink("computers");
  /** The computer opened on Computers, addressed by its handle (name.last4): a full id never enters a URL. Without
   *  its name (a hold for a computer not on screen) the list. Null while this Hub hides Computers: no link then. */
  const computerHref = (id: string, name: string | null): string | null =>
    !computersLink
      ? null
      : computersLink.kind !== "hub"
        ? computersLink.href
        : name
          ? computers.item(`${name}.${id.slice(-4)}`)
          : computers.list;
  const set = useSetSshKey();
  const [editing, setEditing] = useState(false);
  /** A key made here that went through: its computer and file, for the steps that finish it on the person's machine. */
  const [finished, setFinished] = useState<{ computer: string; name: string; file: string } | null>(null);
  // Every key line sent per computer (Save or the help's Use): once its key is among them, the help never again says
  // it was not sent. A Dismiss proves nothing, so nothing is taken out.
  const [sentKeys, setSentKeys] = useState<Record<string, readonly string[]>>({});
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  // Counts the private keys (and pieces of one) the field refused since the editor was opened. Each refusal gives
  // the field a new editor: when the text was already empty and the error already shown (a second paste), nothing
  // else here changes, so nothing would draw again and the terminal's editor would keep the pasted key on screen.
  // The old editor goes with its text and its undo. After the first refusal the field is strict (secretLike).
  const [refusals, setRefusals] = useState(0);
  const [busy, setBusy] = useState(false);
  // The computers whose Check is out: each banner is busy only while its own read is out.
  const [checking, setCheckingState] = useState<ReadonlySet<string>>(new Set());
  // Read synchronously: a Dismiss confirmed while that computer's Check is out is refused.
  const checkingRef = useRef<ReadonlySet<string>>(new Set());
  const setChecking = (id: string, on: boolean) => {
    const next = new Set(checkingRef.current);
    if (on) next.add(id);
    else next.delete(id);
    checkingRef.current = next;
    setCheckingState(next);
  };
  // One result per computer it was sent for: a switch of the computer on screen moves none of them.
  const results = useSyncExternalStore(subscribeKept, () => kept);
  const [removing, setRemoving] = useState(false);
  const live = useRef<string | undefined>(undefined);
  // A route change, page hide or core ending the context (realm, account, sign-out) drops what was typed: a key
  // text typed for one account is never left behind for the next, and a private key pasted by mistake goes too.
  const c = comp.data;
  // The computer on screen is part of what was typed: text typed for one is never saved to another.
  useWipeOn(() => {
    setEditing(false);
    setText("");
    setFieldError(undefined);
    setRemoving(false);
  }, c?.id);
  live.current = c?.id;
  // A change that Computers sent and core still holds: shown here as one that may have gone through.
  const changes = useChangesVersion();
  useEffect(() => {
    const held = new Map<string, HeldChange>();
    for (const h of heldChanges("computer.ssh_key")) {
      const id = heldComputer(h);
      if (id) held.set(id, h);
    }
    setKept((o) => {
      const next: Record<string, Result> = {};
      // A hold core still keeps wins over an older ended result for that computer; a result stays only while it
      // shows that very send (the lock is the computer alone: another tab may have dismissed this page's send and
      // sent again, and that later send is shown as held, proved only by core's read-back). A hold core let go goes.
      for (const [id, r] of Object.entries(o)) {
        const h = held.get(id);
        if (
          h
            ? (r.held || r.kind === "pending") &&
              r.hold !== undefined &&
              r.hold === h.hold
            : !r.held
        )
          next[id] = r;
      }
      for (const [id, h] of held)
        if (!next[id])
          next[id] = heldResult(
            h,
            id,
            comp.data?.id === id ? comp.data.name : t("ssh.otherComputer"),
          );
      const same =
        Object.keys(next).length === Object.keys(o).length &&
        Object.keys(next).every((k) => o[k] === next[k]);
      return same ? o : next;
    });
  }, [changes, comp.data?.id, comp.data?.name, t]);
  const result = c ? (results[c.id] ?? null) : null;
  const put = (r: Result) => setKept((o) => ({ ...o, [r.computer]: r }));
  // Another page's change holds this computer's key (core freed nothing): shown as that page's, read-only.
  const notSettled = (name: string): false => {
    showToast({ title: t("op.notSettledOf", { name }), tone: "warn" });
    return false;
  };
  const heldOther = (r: Result): false => {
    // Another page's change holds the computer now: the remove dialog has nothing left to check (as on HELD_BY_OTHER).
    if (c?.id === r.computer) setRemoving(false);
    put({ ...r, held: true, other: true });
    return false;
  };
  const drop = (id: string) =>
    setKept((o) =>
      Object.fromEntries(Object.entries(o).filter(([k]) => k !== id)),
    );
  /** Drops a result only while its computer still shows that send (a later one keeps its banner). */
  const dropShown = (r: Result) =>
    setKept((o) =>
      o[r.computer]?.hold === r.hold && o[r.computer]?.n === r.n
        ? Object.fromEntries(
            Object.entries(o).filter(([k]) => k !== r.computer),
          )
        : o,
    );

  /** `madeFile`: the key was made here and downloaded as that file; once it is set, the tab keeps the steps to put
   *  it in place and connect. */
  const send = async (want: string | null, madeFile?: string): Promise<void> => {
    if (!c) return;
    if (busy || result?.kind === "pending") return;
    const target = c.id;
    const targetName = c.name;
    const realm = capture().realm;
    const epoch = keptEpoch;
    setBusy(true);
    drop(target);
    setFinished(null);
    if (want) setSentKeys((m) => ({ ...m, [target]: [...(m[target] ?? []), want] }));
    const r = await set({ computer: target, key: want });
    setBusy(false);
    // A cancelled sign-in-code prompt sent nothing and says nothing.
    if (r.cancelled) return;
    // The account switched, or signed out, while it was out: its answer is the previous account's, and neither its
    // computer's name nor its outcome is shown to the next one (core keeps or drops its hold by its own rules).
    if (keptEpoch !== epoch) return;
    // Refused because core already holds a change of this computer (READ_BACK_FIRST): nothing went out, and what
    // is shown is that held change with its hold, never a result without one that no Check or Dismiss could bind.
    if (r.code === "READ_BACK_FIRST") {
      const h = heldChanges("computer.ssh_key").find(
        (x) => heldComputer(x) === target,
      );
      if (h) put(heldResult(h, target, targetName));
      return;
    }
    if (live.current !== target && r.outcome === "done") {
      // The change went through for the computer it was sent for, which is no longer the one on screen.
      showToast({
        title: t(want ? "ssh.saved" : "ssh.removed", { name: targetName }),
        tone: "ok",
      });
      // The computer it was sent for is read again, so it shows the new key when it is next on screen.
      void freshComputer(target);
      return;
    }
    if (live.current !== target && r.outcome === "not_sent") {
      // The Hub shows another computer now and nothing was sent: say so.
      put({
        kind: "not_sent",
        want,
        computer: target,
        name: targetName,
        code: "SWITCHED",
        realm,
      });
      return;
    }
    if (r.outcome === "done") {
      setEditing(false);
      setText("");
      setRemoving(false);
      if (want && madeFile) setFinished({ computer: target, name: targetName, file: madeFile });
      // Done: the tab shows the computer's key (or none) in place once it is read again (no toast).
      void comp.refetch();
    } else {
      // Held by another page: that page's change shows read-only on the tab; the remove dialog has nothing left to check.
      if (r.code === "HELD_BY_OTHER") setRemoving(false);
      put({
        kind: r.outcome,
        want,
        computer: target,
        name: targetName,
        code: r.code,
        realm,
        n: ++sends,
        ...(r.hold ? { hold: r.hold } : {}),
        // Refused under another page's hold: that page's change is what is shown, read-only.
        ...(r.code === "HELD_BY_OTHER"
          ? { held: true, other: true as const }
          : {}),
      });
    }
  };

  const save = () => {
    const chk = checkSshKey(text);
    if (!chk.ok) {
      setFieldError(t(`ssh.e.${chk.code}` as K));
      // A rejected text may be a private key pasted by mistake: it does not stay in the box.
      setText("");
      return;
    }
    setFieldError(undefined);
    void send(chk.key);
  };

  // True only when a fresh read proved what happened (kit rule: an unknown-outcome toast closes only on true).
  const check = async (
    result: Result | null = results[c?.id ?? ""] ?? null,
  ): Promise<boolean> => {
    // Another page's change: only that page can prove or dismiss it (the banner says so and links there).
    if (!result || result.other) return false;
    // Only the realm it was sent in knows the computer: another realm's host proves nothing (its 404 least of all).
    // Checked again after every read: a switch while it ran makes its answer another realm's.
    const otherRealm = () => {
      if (!result.realm || capture().realm === result.realm) return false;
      showToast({ title: t("ssh.otherRealm", { name: result.name }), tone: "warn" });
      return true;
    };
    if (otherRealm()) return false;
    // The send this Check examines must still be the one shown after its read: dismissed meanwhile, or replaced by
    // a later save, the answer settles nothing (it would free, or note, the later send, whose outcome is unknown).
    const stillShown = () => {
      const now = kept[result.computer];
      return (
        !!now &&
        now.kind === "pending" &&
        now.n === result.n &&
        now.want === result.want &&
        now.hold === result.hold
      );
    };
    setChecking(result.computer, true);
    if (result.held) {
      // Core reads the computer and frees this page's own change only when the read shows the key that was sent
      // (a Computers-sent hold never reaches here: check() refuses `other` above).
      // A read that throws still ends the check: "checking" clears and Dismiss comes back.
      let ok: boolean;
      try {
        ok = await readBackSsh(result.computer);
      } finally {
        setChecking(result.computer, false);
      }
      if (otherRealm() || !stillShown()) return false;
      if (!ok) {
        put({ ...result, note: t("ssh.heldNotYet", { name: result.name }) });
        return false;
      }
      drop(result.computer);
      showToast({
        title: t("ssh.checkedHeld", { name: result.name }),
        tone: "ok",
      });
      return true;
    }
    // Bound to the send this result shows: core's hold for the computer must still be that send's (or none, when
    // something freed it), else a later send of the computer holds it and this read proves nothing of it.
    let now: Awaited<ReturnType<typeof settleChange.holdOf.ssh>>;
    try {
      now = await settleChange.holdOf.ssh({
        computer: result.computer,
        key: result.want,
      });
    } catch (e) {
      setChecking(result.computer, false);
      throw e;
    }
    if (now !== undefined && now !== result.hold) {
      setChecking(result.computer, false);
      return notSettled(result.name);
    }
    const hold = result.hold;
    let r: Awaited<ReturnType<typeof freshComputer>>;
    try {
      r = await freshComputer(result.computer);
    } finally {
      setChecking(result.computer, false);
    }
    if (otherRealm()) return false;
    if (!stillShown()) return false;
    if (r.gone) {
      // The computer no longer exists in the realm the key was sent in: there is nothing left to send it to.
      const away = await settleChange.ssh(
        { computer: result.computer, key: result.want },
        hold,
      );
      if (away === NOT_SETTLED) return notSettled(result.name);
      if (away) return heldOther(result);
      dropShown(result);
      showToast({ title: t("ssh.gone", { name: result.name }), tone: "info" });
      return true;
    }
    if (r.error || !r.data) {
      // The read failed: nothing is proved, and the banner says so (as the API keys tab does).
      put({ ...result, note: t("op.readFailed", { name: result.name }) });
      return false;
    }
    if (!applied(r.data.ssh_public_key, result.want)) {
      // Another key on the computer proves nothing yet: the change may still land. Check again, or Dismiss.
      // A remove reads the key still there; a save reads another key: each says what it saw.
      put({ ...result, note: t(result.want === null ? "ssh.checkedNotRemoved" : "ssh.checkedNot", { name: result.name }) });
      return false;
    }
    const away = await settleChange.ssh(
      { computer: result.computer, key: result.want },
      hold,
    );
    if (away === NOT_SETTLED) return notSettled(result.name);
    if (away) return heldOther(result);
    dropShown(result);
    if (c?.id === result.computer) {
      setEditing(false);
      setText("");
      setRemoving(false);
    }
    showToast({
      title: t(result.want ? "ssh.checkedHolds" : "ssh.removed", {
        name: result.name,
      }),
      tone: "ok",
    });
    return true;
  };

  /** The person's warned Dismiss of this page's own unconfirmed change: it may have gone through. */
  const dismiss = async (result: Result) => {
    // A Check is out: its answer may still settle this change (and a Dismiss now would let a second save go out).
    if (checkingRef.current.has(result.computer)) return;
    // Core frees a hold only in the realm it was sent in: dismissed from another, it would stay held.
    if (result.realm && capture().realm !== result.realm) {
      showToast({ title: t("ssh.otherRealmDismiss", { name: result.name }), tone: "warn" });
      return;
    }
    // Frees only the send this banner shows: a later send of the computer (another tab's) stays held.
    const away = await settleChange.ssh(
      { computer: result.computer, key: result.want },
      result.hold,
    );
    if (away === NOT_SETTLED) {
      notSettled(result.name);
      return;
    }
    if (away) {
      heldOther(result);
      return;
    }
    dropShown(result);
  };

  const display = c?.ssh_public_key ? sshKeyDisplay(c.ssh_public_key) : null;
  const host = sshHost(c?.ssh_hostname);
  const banners = Object.values(results).map((res) => ({
    res,
    otherHref: res.other
      ? computerHref(res.computer, c?.id === res.computer ? c.name : null)
      : null,
    kind: res.kind,
    title: res.kind === "pending" ? t("ssh.pendingTitle") : undefined,
    body:
      (res.other ? t("ssh.heldElsewhere", { name: res.name }) : undefined) ??
      res.note ??
      (res.kind === "pending"
        ? t("ssh.pending", { name: res.name })
        : res.code === "SSH_PUBLIC_KEY_IN_USE"
          ? t("ssh.inUse", { name: res.name })
          : res.kind === "not_sent"
          ? t(
              `ssh.refused.${res.code === "SWITCHED" || res.code === "BUSY" ? res.code : "other"}` as K,
              { name: res.name },
            )
          : t("ssh.failed", { name: res.name })),
  }));
  // Keyed by the send it shows too: when a later send of the computer replaces it, a Dismiss warning opened for
  // the earlier one closes instead of freeing the later one.
  const bannerNodes = banners.map((b) => (
    <div key={`${b.res.computer}#${b.res.hold ?? ""}`} className={s.heldBanner}>
      <OutcomeBanner
        kind={b.kind}
        title={b.title}
        body={b.body}
        onCheck={
          b.res.kind === "pending" && !b.res.other
            ? // A check that throws has already cleared "checking" (its reads end in finally); like the kit's own
              // Check again, the banner's ends quietly and the change stays tracked.
              () => void check(b.res).catch(() => false)
            : undefined
        }
        checking={checking.has(b.res.computer)}
        // A banner that only reports (the save failed, nothing was sent) can be hidden; a pending one is closed by
        // Dismiss beside it, and another page's change only by that page.
        onDismiss={
          b.res.kind !== "pending" && !b.res.held
            ? () => dropShown(b.res)
            : undefined
        }
      />
      {b.res.kind === "pending" && !b.res.other && (
        <span className={s.sshActions}>
          <DismissButton
            onDismiss={() => dismiss(b.res)}
            isDisabled={checking.has(b.res.computer)}
          />
        </span>
      )}
      {b.otherHref && (
        <span className={s.sshActions}>
          <Link href={b.otherHref}>{t("ssh.openComputers")}</Link>
        </span>
      )}
    </div>
  ));

  let body;
  if (comp.isPending) body = <Skeleton rows={3} />;
  else if (comp.error) {
    // Each known failure says why and what to do; Try again only where a second read can answer otherwise.
    const listHref = computerHref("", null);
    const choose = listHref && <Link href={listHref}>{t("ssh.read.choose")}</Link>;
    const retry = () => void comp.refetch();
    body =
      readFail === "realm" ? (
        <ErrorState
          // noDetails: a known failure, said in its own words with its own way on.
          title={t("ssh.read.realm.title")}
          body={t(setRealm ? "ssh.read.realm.body" : "ssh.read.realm.bodyPinned")}
          secondary={
            <>
              {setRealm && (
                <Button onPress={() => setRealm("all")}>{t("ssh.read.showAll")}</Button>
              )}
              {choose}
            </>
          }
        />
      ) : readFail === "access" || readFail === "gone" ? (
        <ErrorState
          // noDetails: a known failure, said in its own words with its own way on.
          title={t(`ssh.read.${readFail}.title`)}
          body={t(`ssh.read.${readFail}.body`)}
          secondary={choose}
        />
      ) : readFail === "signin" ? (
        <ErrorState
          // noDetails: a known failure, said in its own words with its own way on.
          title={t("ssh.read.signin.title")}
          body={t("ssh.read.signin.body")}
        />
      ) : readFail === "server" || readFail === "offline" ? (
        <ErrorState
          // noDetails: a known failure, said in its own words with its own way on.
          title={t(`ssh.read.${readFail}.title`)}
          body={t(`ssh.read.${readFail}.body`)}
          onRetry={retry}
        />
      ) : (
        <ErrorState title={t("ssh.loadFailed")} error={comp.error} onRetry={retry} />
      );
  }
  else if (!c)
    // The shell's no-computer state: these words for the pick, its own once the account has no computer at all.
    body = (
      <ComputerRequired
        inline
        state="none"
        title={t("ssh.noComputer.title")}
        body={t("ssh.noComputer.body")}
        action={
          computersLink ? (
            <Link href={computersLink.href}>{t("ssh.noComputer.action")}</Link>
          ) : null
        }
      />
    );
  // (A change sent for a computer that is no longer on screen keeps its banner below the empty state.)
  else {
    const nameHref = computerHref(c.id, c.name);
    body = (
      <div className={s.ssh}>
        <SettingGroup label={t("ssh.group")}>
          <SettingRow label={t("ssh.computer")}>
            {nameHref ? <Link href={nameHref}>{c.name}</Link> : c.name}
          </SettingRow>
          <SettingRow
            label={t("ssh.current")}
            actions={
              !editing ? (
                <Button
                  variant={display ? "secondary" : "primary"}
                  isDisabled={busy || result?.kind === "pending"}
                  onPress={() => {
                    setEditing(true);
                    setRefusals(0);
                    if (c) drop(c.id);
                  }}
                >
                  {display ? t("ssh.replace") : t("ssh.set")}
                </Button>
              ) : undefined
            }
          >
            {display ? (
              <span className={s.sshValue}>
                {display.name ? <span>{display.name}</span> : null}
                <span className={s.mono}>{display.detail}</span>
              </span>
            ) : (
              <span className={s.muted}>{t("ssh.none", { name: c.name })}</span>
            )}
          </SettingRow>
          {/* Only with a key set: without one the command could not sign in. */}
          {host && display ? (
            <SettingRow label={t("ssh.connect")}>
              <CopyField label={t("ssh.host")} value={`ssh ${host}`} />
            </SettingRow>
          ) : null}
        </SettingGroup>
        {editing && (
          <div className={s.sshEdit}>
            <TextField
              key={refusals}
              // The editor that replaces one that refused a private key takes the focus with its error: the person
              // stays in the field.
              focusOnError={refusals > 0}
              // Replace / Set unmounts the button that had the focus: the field takes it, which also brings it into view
              // on a short screen.
              // eslint-disable-next-line jsx-a11y/no-autofocus -- opened by the person's own press, whose button is gone
              autoFocus
              label={t("ssh.field")}
              description={t("ssh.fieldH")}
              multiline
              rows={4}
              mono
              value={text}
              onChange={(v) => {
                // A private key pasted by mistake is refused at once: it never stays on screen until Save. So is a
                // piece of one with no armour words (a paste a terminal delivers as typed characters, in pieces),
                // and, once a private key was refused here, anything that does not start as a public key line.
                if (secretLike(v, refusals > 0)) {
                  setText("");
                  setFieldError(t("ssh.e.private"));
                  setRefusals((n) => n + 1);
                  return;
                }
                setText(v);
                setFieldError(undefined);
              }}
              errorMessage={fieldError}
              isDisabled={busy}
              {...{ "data-secret": "masked" }}
            />
            {/* A key made here is named for this computer; "Use this key on this computer" puts its public line in the
                field and sends it through the same save (its C9 outcome). Nothing is sent before that press. */}
            <SshKeyHelp
              computer={c.name}
              {...(host ? { host } : {})}
              useSets
              sentKeys={sentKeys[c.id] ?? []}
              onKey={(k, file) => {
                setText(k);
                const chk = checkSshKey(k);
                if (!chk.ok) {
                  setFieldError(t(`ssh.e.${chk.code}` as K));
                  return;
                }
                setFieldError(undefined);
                void send(chk.key, file);
              }}
            />
            <div className={s.sshActions}>
              {/* Cancel first, then the action: the order of every form footer. */}
              <Button chip={false}
                onPress={() => {
                  setEditing(false);
                  setText("");
                  setFieldError(undefined);
                }}
              >
                {t("ssh.cancel")}
              </Button>
              <Button
                variant="primary"
                busy={busy}
                isDisabled={result?.kind === "pending"}
                onPress={save}
              >
                {display ? t("ssh.saveReplace") : t("ssh.save")}
              </Button>
            </div>
          </div>
        )}
        {/* The danger group, last: taking the key off the computer (asked first, in the confirm dialog). */}
        {display && !editing ? (
          <SettingGroup tone="danger" title={t("ssh.rmGroup")}>
            <SettingRow
              label={t("ssh.rmLabel", { name: c.name })}
              tone="danger"
              actions={
                <Button
                  tone="danger"
                  isDisabled={busy || result?.kind === "pending"}
                  onPress={() => {
                    setRemoving(true);
                    if (c) drop(c.id);
                  }}
                >
                  {t("ssh.remove")}
                </Button>
              }
            />
          </SettingGroup>
        ) : null}
        {finished && finished.computer === c.id && (
          <section
            className={s.heldBanner}
            aria-label={t("ssh.made.title", { name: finished.name })}
          >
            <OutcomeBanner
              kind="done"
              title={t("ssh.made.title", { name: finished.name })}
              body={t("ssh.made.body")}
            />
            <SshKeyFinish file={finished.file} {...(host ? { host } : {})} />
            <span className={s.sshActions}>
              <Button onPress={() => setFinished(null)}>{t("ssh.made.dismiss")}</Button>
            </span>
          </section>
        )}
        {bannerNodes}
        <ConfirmDialog
          isOpen={removing}
          onOpenChange={(o) => !o && setRemoving(false)}
          title={t("ssh.rmTitle", { name: c.name })}
          body={t("ssh.rmBody", { name: c.name })}
          confirmLabel={t("ssh.rmGo")}
          tone="danger"
          busy={busy}
          outcome={result && removing ? { kind: result.kind, message: result.note } : undefined}
          onCheck={() => check()}
          onConfirm={() => void send(null)}
        />
      </div>
    );
  }

  return (
    <Frame tab="ssh" counts={{ keys: keysCount, shared: sharedCount }}>
      {c && <p className={`${s.help} ${s.sshSub}`}>{t("ssh.sub")}</p>}
      {body}
      {/* With no computer on screen, or one that can no longer be read (deleted), the banners sit below. */}
      {(!c || !!comp.error) && bannerNodes}
    </Frame>
  );
}
