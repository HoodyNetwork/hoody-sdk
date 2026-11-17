// Edit a key: New key's fields, opened as the key is (logic.ts editForm). Save sends only the groups changed, once
// (KeysTab owns the send and its held state); the drawer closes on done or on an outcome that may have gone through,
// and stays open with the reason when nothing changed. The key's secret is never read, shown or sent.
import {
  Button,
  Drawer,
  Form,
  Outcome,
  useStrings,
} from "@kit";
import { useEffect, useRef, useState } from "react";
import type { Change } from "../data";
import { pageFaq } from "../faq";
import { editBody, editChanges, editForm, guardedEdit, type Body } from "../logic";
import strings from "../strings.en.json";
import type { Catalogue, Key, NewKeyForm, Realm } from "../types";
import { KeyFields, type SetField } from "./KeyFields";
import { outcomeText, enterSubmits } from "./words";
import s from "./keys.module.css";

export interface EditKeyDrawerProps {
  k: Key;
  realms: readonly Realm[] | undefined;
  cat: Catalogue | null;
  onClose: () => void;
  /** Sends the body once; the tab closes the drawer on done or pending. */
  onSave: (body: Body) => Promise<Change>;
}

export function EditKeyDrawer({ k, realms, cat: catNow, onClose, onSave }: EditKeyDrawerProps) {
  const t = useStrings(strings);
  // The catalogue the form was opened with stays its catalogue: a key opened without one shows Full for whatever it
  // holds (locked), and a catalogue that loads later must not unlock a comparison made without it.
  const [cat] = useState(catNow);
  const [before] = useState<NewKeyForm>(() => editForm(k, cat));
  const [form, setForm] = useState<NewKeyForm>(before);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState<Change | null>(null);
  const once = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    // Set again on setup: a remount (StrictMode replays effects) keeps the ref but ran the cleanup.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const set: SetField = (f, v) => {
    setForm((cur) => ({
      ...cur,
      [f]: typeof v === "function" ? (v as (x: unknown) => unknown)(cur[f]) : v,
    }));
    setErrors((e) =>
      f in e ? Object.fromEntries(Object.entries(e).filter(([x]) => x !== f)) : e,
    );
  };
  const groups = editChanges(before, form, cat);
  // A realm id typed and not added: Save stays offered, and says to add or clear it (editBody), never drops it.
  const draft = form.worksIn === "pick" && !!form.realmDraft?.trim();

  const submit = async () => {
    if (once.current || (!groups.length && !draft)) return;
    const r = editBody(before, form, cat, Date.now());
    if (r.errors) {
      setErrors(r.errors);
      return;
    }
    once.current = true;
    setErrors({});
    setBanner(null);
    setSending(true);
    try {
      const res = await onSave(r.body);
      if (!mounted.current) return;
      // The 2FA prompt was cancelled: nothing was sent, the form stays as it was.
      if (res.cancelled) return;
      if (res.code === "DUPLICATE_ALIAS") setErrors({ name: "dup" });
      else setBanner(res);
    } finally {
      once.current = false;
      if (mounted.current) setSending(false);
    }
  };

  const outcome = banner ? (
    <Outcome
      wrap
      outcome={banner.outcome === "not_sent" ? "not_sent" : "failed"}
      detail={outcomeText(t, banner, k.name || t("unnamed"), false)}
    />
  ) : undefined;

  return (
    <Drawer resizeKey="keys-edit"
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={t("ed.title", { name: k.name || t("unnamed") })}
      subtitle={t("ed.sub")}
      size="md"
      dirty={groups.length > 0 || draft}
      busy={sending}
      outcome={outcome}
      // What Save may ask for: a change to what the key can do, where or until when can need the 2FA code.
      reason={guardedEdit(groups) ? t("ed.guard") : undefined}
      secondary={
        <span
          className={s.help}
          role="status" // reason: live count of the changes Save would send
        >
          {groups.length
            ? t("ed.changes", { count: groups.length })
            : t("ed.none")}
        </span>
      }
      primary={
        <Button
          variant="primary"
          busy={sending}
          isDisabled={!groups.length && !draft}
          onPress={() => void submit()}
        >
          {sending ? t("ed.sending") : t("ed.go")}
        </Button>
      }
    >
      <div role="presentation" onKeyDown={enterSubmits(() => void submit())}>
        <Form onSubmit={() => void submit()} busy={sending} className={s.newForm}>
          <KeyFields
            form={form}
            set={set}
            errors={errors}
            cat={cat}
            realms={realms}
            realm="all"
            sending={sending}
            edit={{ limited: !k.allRealms }}
            realmsFaq={pageFaq(t).byId.realms}
            rightsFaq={pageFaq(t).byId.rights}
          />
        </Form>
      </div>
    </Drawer>
  );
}
