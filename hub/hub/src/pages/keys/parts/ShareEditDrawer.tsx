// Edit a share's details: who it is for, when it ends and the addresses it works from. Each detail is a setting row
// showing the share as stored; its Change… opens that one field's editor under the row, and the editor's Save sends that
// field and nothing else (shareFieldEditBody: never the rights, the realm, a flag or a cleared end). With more than one
// field changed no Save is pressable: one change at a time. The Shared tab owns the send: just before it, a fresh read
// must still show the field as this form opened it, and the share must still conform; otherwise nothing is sent and the
// form reloads the share as it is.
import { DateTimeField, Drawer, Outcome, SettingGroup, SettingRow, TextField, useStrings } from "@kit";
import { useEffect, useRef, useState } from "react";
import type { Change } from "../data";
import { shareFieldEditBody, shareLimitsProblems, utc, whoOf, type ShareField, type ShareFieldBody } from "../share-logic";
import strings from "../strings.en.json";
import type { RawToken } from "../types";
import { IpAllowlistField } from "./IpAllowlistField";
import { outcomeText } from "./words";

/** What the tab's save answered: sent (its Change), or nothing sent because the share changed or ended. */
export type ShareSave = Change | { changed: RawToken } | { ended: true };

export interface ShareEditDrawerProps {
  /** The share as listed when the drawer opened. */
  share: RawToken;
  /** The share's realm, by name. */
  realm: string;
  onClose: () => void;
  /** Sends `body` once, for `field` as `opened` showed it; the tab closes the drawer on done or pending. */
  onSave: (field: ShareField, opened: RawToken, body: ShareFieldBody) => Promise<ShareSave>;
}

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const FIELDS: readonly ShareField[] = ["who", "ends", "ips"];

/** The form's values for a share as stored, and its end as a row shows it (UTC to the minute; empty without an end). */
function valuesOf(r: RawToken) {
  const end = typeof r.expires_at === "string" ? Date.parse(r.expires_at) : NaN;
  const at = Number.isFinite(end) ? end : null;
  const ips = Array.isArray(r.ip_whitelist) ? r.ip_whitelist.filter((x) => x !== "*") : [];
  return { who: whoOf(r.alias) ?? "", at, ips: ips.join(", "), ends: at === null ? "" : utc(new Date(at).toISOString()) };
}

export function ShareEditDrawer({ share, realm, onClose, onSave }: ShareEditDrawerProps) {
  const t = useStrings(strings);
  // The share as this form shows it: replaced by a fresh read when the share changed elsewhere.
  const [opened, setOpened] = useState<RawToken>(share);
  const [who, setWho] = useState(() => valuesOf(share).who);
  const [at, setAt] = useState<number | null>(() => valuesOf(share).at);
  const [ips, setIps] = useState(() => valuesOf(share).ips);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ kind: "changed" } | { kind: "ended" } | { kind: "change"; change: Change } | null>(null);
  const once = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const now = Date.now();
  const problems = shareLimitsProblems({ days: null, at, ips, who }, now);
  // The fields the person changed (as typed), and the one-field body Save would send for the one changed: never a
  // body for a field left as it was (a stored end with milliseconds would otherwise read as a change).
  const shown = valuesOf(opened);
  const touched = FIELDS.filter((f) => (f === "who" ? who.trim() !== shown.who : f === "ends" ? at !== shown.at : ips.trim() !== shown.ips));
  const field = touched.length === 1 ? (touched[0] as ShareField) : null;
  const body = field ? shareFieldEditBody(field, opened, { who, at, ips }, now) : null;
  const one = field && body ? ([field, body] as const) : null;

  const reload = (fresh: RawToken) => {
    const v = valuesOf(fresh);
    setOpened(fresh);
    setWho(v.who);
    setAt(v.at);
    setIps(v.ips);
  };

  /** Sends `f` when it is the one field changed. True when the send went out and its answer closes the drawer (done, or
   *  may have gone through); false when nothing went out or it was refused, so its editor stays open as it is. */
  const submit = async (f: ShareField): Promise<boolean> => {
    if (once.current || !one || one[0] !== f) return false;
    once.current = true;
    setNote(null);
    setSending(true);
    try {
      const res = await onSave(one[0], opened, one[1]);
      if (!mounted.current) return true;
      if ("changed" in res) {
        reload(res.changed);
        setNote({ kind: "changed" });
        return false;
      }
      if ("ended" in res) {
        setNote({ kind: "ended" });
        return false;
      }
      // The sign-in code was cancelled: nothing was sent, the form stays as it was.
      if (res.cancelled) return false;
      if (res.outcome === "done" || res.outcome === "pending") return true;
      setNote({ kind: "change", change: res });
      return false;
    } finally {
      once.current = false;
      if (mounted.current) setSending(false);
    }
  };

  const outcome = note ? (
    <Outcome
      /* noDetails: a Change keeps only its outcome and code; the changed and ended notes are no rejection */
      wrap
      outcome={note.kind === "changed" ? "not_sent" : note.kind === "ended" ? "failed" : note.change.outcome === "not_sent" ? "not_sent" : "failed"}
      detail={
        note.kind === "changed"
          ? t("share.editChanged")
          : note.kind === "ended"
            ? t("share.editEnded")
            : outcomeText(t, note.change, t("share.nameOf", { realm }), false)
      }
    />
  ) : undefined;

  // Why every Save is off while more than one field has changed.
  const status = touched.length > 1 ? t("share.editOne") : undefined;

  /** A row's Save: sends only this field. The kit keeps the editor open while the promise is out and when it rejects
   *  (nothing went out, or the form reloaded the share as it is). */
  const saveField = (f: ShareField) => submit(f).then((closes) => (closes ? undefined : Promise.reject(new Error("not saved"))));

  return (
    <Drawer
      resizeKey="keys-share-edit"
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={t("share.editTitle", { realm })}
      subtitle={t("share.editSub")}
      size="md"
      dirty={touched.length > 0}
      busy={sending}
      outcome={outcome}
      reason={status}
      cancel={t("share.done")}
    >
      <SettingGroup label={t("share.editTitle", { realm })}>
        <SettingRow
          label={t("share.rvWho")}
          data-share-field="who"
          reveal={{
            label: t("share.editChange"),
            saveLabel: t("share.editGo"),
            canSave: !sending && one?.[0] === "who",
            onSave: () => saveField("who"),
            onCancel: () => setWho(shown.who),
            editor: (
              <TextField
                label={t("share.who")}
                description={t("share.whoH")}
                value={who}
                onChange={setWho}
                errorMessage={problems.who ? t("share.whoBad") : undefined}
                isDisabled={sending}
              />
            ),
          }}
        >
          {shown.who || t("share.rvNoWho")}
        </SettingRow>
        <SettingRow
          label={t("share.rvEnds")}
          data-share-field="ends"
          reveal={{
            label: t("share.editChange"),
            saveLabel: t("share.editGo"),
            canSave: !sending && one?.[0] === "ends",
            onSave: () => saveField("ends"),
            onCancel: () => setAt(shown.at),
            editor: (
              <DateTimeField
                label={t("share.endsAt")}
                value={at}
                onChange={setAt}
                description={t("share.endsZone", { zone: ZONE })}
                errorMessage={
                  problems.ends === "timePast"
                    ? t("share.timePast")
                    : problems.ends === "dateFar"
                      ? t("share.dateFar")
                      : problems.ends
                        ? t("share.dateBad")
                        : undefined
                }
                isDisabled={sending}
              />
            ),
          }}
        >
          {shown.ends}
        </SettingRow>
        <SettingRow
          label={t("share.rvAddresses")}
          data-share-field="ips"
          reveal={{
            label: t("share.editChange"),
            saveLabel: t("share.editGo"),
            canSave: !sending && one?.[0] === "ips",
            onSave: () => saveField("ips"),
            onCancel: () => setIps(shown.ips),
            editor: (
              <IpAllowlistField
                label={t("share.ips")}
                description={t("share.ipsH")}
                value={ips}
                onChange={(next) => setIps((v) => next(v))}
                errorMessage={problems.ips === "ipsNone" ? t("share.ipsNone") : problems.ips === "ipsMany" ? t("share.ipsMany") : problems.ips ? t("share.ipsBad") : undefined}
                isDisabled={sending}
              />
            ),
          }}
        >
          {shown.ips || t("share.rvAny")}
        </SettingRow>
      </SettingGroup>
    </Drawer>
  );
}
