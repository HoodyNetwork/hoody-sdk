// The fields of a key, shared by New key and Edit: one column, Basics, Realms, Limits and Access, each a kit SubSection
// (each region's help stays inside the explanation budget). The drawer
// owns the form, its errors and the send; this owns the helpers of the fields (add a realm by id; Add my IP is
// IpAllowlistField's, shared with Share realm). Edit differs only where the server does: a realm-limited
// key cannot become an all-realms key, and without the catalogue its rights cannot be changed.
import {
  Button,
  Checkbox,
  DateField,
  PickerPanel,
  matchesSearch,
  RadioGroup,
  SegmentedControl,
  SettingRow,
  SubSection,
  TextField,
  useStrings,
  Why,
  type FaqItem,
} from "@kit";
import { type KeyboardEvent, useRef, useState } from "react";
import { fullHelpKey, RID } from "../logic";
import strings from "../strings.en.json";
import type { Catalogue, Ends, NewKeyForm, Realm } from "../types";
import { IpAllowlistField } from "./IpAllowlistField";
import { RightsPicker } from "./RightsPicker";
import { composing, realmName, type K } from "./words";
import s from "./keys.module.css";

export type SetField = <F extends keyof NewKeyForm>(
  k: F,
  v: NewKeyForm[F] | ((cur: NewKeyForm[F]) => NewKeyForm[F]),
) => void;

export interface KeyFieldsProps {
  form: NewKeyForm;
  set: SetField;
  errors: Record<string, string>;
  cat: Catalogue | null;
  realms: readonly Realm[] | undefined;
  /** 'all' or the realm the shell shows (New key: a key made in a realm is made for it). */
  realm: string;
  sending: boolean;
  /** Edit: whether the key is limited to realms (All realms is then off). */
  edit?: { limited: boolean };
  /** The page's answers the realms and access Whys end with (pageFaq byId); the drawers pass them, a bare render draws no Why. */
  realmsFaq?: FaqItem | undefined;
  rightsFaq?: FaqItem | undefined;
}

export function KeyFields({
  form,
  set: setRaw,
  errors,
  cat,
  realms,
  realm,
  sending,
  edit,
  realmsFaq,
  rightsFaq,
}: KeyFieldsProps) {
  const t = useStrings(strings);
  const bound = !edit && RID.test(realm);
  const [extra, setExtra] = useState<string[]>([]);
  // The id typed lives on the form (realmDraft): Save waits while it is neither added nor cleared.
  const addText = form.realmDraft ?? "";
  const [addError, setAddError] = useState("");
  // Save has started: nothing changes the form until it is answered (the body sent is already taken), neither a
  // field nor a helper (Add my IP keeps its own generation: IpAllowlistField).
  const sendingRef = useRef(sending);
  sendingRef.current = sending;
  const set: SetField = (k, v) => {
    if (!sendingRef.current) setRaw(k, v);
  };
  const err = (field: string): string | undefined =>
    errors[field] ? t(`e.${field}.${errors[field]}` as K) : undefined;

  const addRealm = () => {
    if (sendingRef.current) return;
    const v = addText.trim().toLowerCase();
    if (!RID.test(v)) {
      setAddError(t("nk.addBad"));
      return;
    }
    setAddError("");
    set("realmDraft", "");
    tick(v);
  };
  const tick = (v: string) => {
    if (RID.test(v)) setExtra((x) => (x.includes(v) || pickable.includes(v) ? x : [...x, v]));
    set("picked", (cur) => (cur.includes(v) ? cur : [...cur, v]));
  };

  const pickable = [...new Set([...(realms ?? []).map((r) => r.id), ...extra])];
  const items = [...new Set([...pickable, ...form.picked])].map((id) => ({
    id,
    label: realmName(realms, id),
    // Its short handle, never the full id: the id is the value only.
    description: realmName(undefined, id),
  }));
  // Enter in the realm search (a filter): the one realm it shows is ticked; several or none shown, nothing is. It
  // never sends; Ctrl/Cmd+Enter still sends, an input method's Enter is its own. An id not listed is added only in
  // "Add a realm by its id", whose text left pending blocks Save. On rows the kit's keys stay: Space
  // ticks, Enter never sends.
  const searchEnter = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || e.metaKey || e.ctrlKey || composing(e)) return;
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || el.type !== "search") return;
    // No browser form submit; the drawer's own Enter leaves search boxes (enterSubmits).
    e.preventDefault();
    if (sendingRef.current) return;
    const q = el.value.trim();
    if (!q) return;
    const shown = items.filter((i) => matchesSearch([i.label, i.description, i.id], q));
    if (shown.length === 1) tick(shown[0]!.id);
  };

  return (
    <div className={s.newCol}>
      <SubSection title={t("nk.basics")}>
        <TextField
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the first field of a drawer takes focus
          autoFocus
          label={t("nk.name")}
          description={t("nk.nameH")}
          value={form.name}
          onChange={(v) => set("name", v)}
          errorMessage={
            errors.name === "dup"
              ? t("out.err.DUPLICATE_ALIAS")
              : err("name")
          }
          isDisabled={sending}

          maxLength={254}
        />
      </SubSection>
      <SubSection title={t("nk.realmsTitle")}>
        {bound ? (
          // A key made in a realm works only there: a fact, not a choice.
          <SettingRow
            label={t("nk.works")}
            help={t("nk.onlyH")}
            {...(err("realms") ? { outcome: "not_sent" as const, detail: err("realms") } : {})}
          >
            {t("nk.only", { realm: realmName(realms, realm) })}
          </SettingRow>
        ) : (
        <RadioGroup
          variant="cards"
          label={t("nk.works")}
          value={form.worksIn}
          onChange={(v) => set("worksIn", v)}
          isDisabled={sending}
          errorMessage={err("realms")}
          options={[
                  {
                    value: "all",
                    label: t("nk.all"),
                    // The server refuses an empty realm list for a realm-limited key (it would mean every realm).
                    description: edit?.limited ? t("ed.allLimited") : t("nk.allH"),
                    isDisabled: !!edit?.limited,
                  },
                  {
                    value: "pick",
                    label: t("nk.pick"),
                    description: t("nk.pickH"),
                  },
                ]}
        />
        )}
        {realmsFaq && (
          <Why question={t("nk.realmsMore")} faq={{ item: realmsFaq, label: realmsFaq.q }}>
            {t("nk.realmsWhy")}
          </Why>
        )}
        {!bound && form.worksIn === "pick" && (
          <div className={s.pick}>
            {pickable.length === 0 && form.picked.length === 0 ? (
              <p className={s.help}>{t("nk.noRealms")}</p>
            ) : (
              <div role="presentation" onKeyDown={searchEnter}>
                <PickerPanel
                  label={t("nk.pickList")}
                  showLabel
                  searchLabel={t("nk.findRealm")}
                  mode="multi"
                  // The account's realms, then ids added by hand or already on the key (shown even when not listed).
                  items={items}
                  value={form.picked}
                  onChange={(ids) => set("picked", ids)}
                  isDisabled={sending}
                />
              </div>
            )}
            <div className={s.addRow}>
              <TextField
                label={t("nk.add")}
                placeholder={t("nk.addPh")}
                value={addText}
                onChange={(v) => {
                  setAddError("");
                  set("realmDraft", v);
                }}
                // Enter here adds the realm typed (the drawer's own Enter would send without it); Ctrl/Cmd+Enter still sends,
                // and an input method's Enter is its own (enterSubmits leaves it too). Enter in the empty field adds nothing
                // and says nothing (no bad-id error for an id never typed); it still does not send. On the field itself,
                // not on a wrapper: the terminal's fields hand no key to a wrapper, and there a prevented Enter is what
                // keeps the field from sending the form. Every other key goes on to the drawer (React Aria stops a key
                // unless told to continue).
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.metaKey || e.ctrlKey || composing(e)) {
                    e.continuePropagation();
                    return;
                  }
                  e.preventDefault();
                  if (!addText.trim()) return;
                  addRealm();
                }}
                errorMessage={addError || err("realmDraft")}
                mono
                maxLength={24}
              />
              <Button onPress={addRealm} isDisabled={sending}>
                {t("nk.addGo")}
              </Button>
            </div>
          </div>
        )}
      </SubSection>
      <SubSection title={t("nk.limitsTitle")}>
        <SegmentedControl<Ends>
          label={t("nk.ends")}
          showLabel
          fullWidth
          value={form.ends}
          onChange={(v) => set("ends", v)}
          isDisabled={sending}
          items={[
            { id: "never", label: t("nk.endsNever") },
            { id: "90d", label: t("nk.ends90") },
            { id: "1y", label: t("nk.ends1y") },
            { id: "date", label: t("nk.endsDate") },
          ]}
        />
        {form.ends === "date" && (
          <DateField
            label={t("nk.endsOn")}
            value={form.date}
            onChange={(v) => set("date", v)}
            description={t("nk.endsUtc")}
            errorMessage={err("date")}
            mono
          />
        )}
        <IpAllowlistField
          label={t("nk.ips")}
          description={t("nk.ipsH")}
          value={form.ips}
          onChange={(next) => set("ips", next)}
          errorMessage={err("ips")}
          isDisabled={sending}
        />
        <Checkbox
          label={t("nk.delegate")}
          description={err("delegate") ?? t("nk.delegateH")}
          isSelected={form.delegate}
          onChange={(v) => set("delegate", v)}
          isDisabled={sending || !cat?.full}
        />
      </SubSection>
      <SubSection title={t("nk.accessTitle")}>
        <RadioGroup
          variant="cards"
          value={form.access}
          onChange={(v) => set("access", v)}
          // Edit without the catalogue: what the key holds cannot be shown, so it cannot be changed either.
          isDisabled={sending || (!!edit && (!cat || !cat.full))}
          description={
            !cat || !cat.full
              ? t(edit ? "ed.noCatalogue" : "nk.noCatalogue")
              : undefined
          }
          aria-label={t("nk.accessTitle")}
          options={[
            {
              value: "full",
              label: t("access.full"),
              description: t(fullHelpKey(cat)),
            },
            ...(cat && cat.full
              ? [
                  {
                    value: "choose" as const,
                    label: t("nk.choose"),
                    description: t("nk.chooseH"),
                  },
                ]
              : []),
          ]}
        />
        {form.access === "choose" && cat && cat.full && (
          <RightsPicker
            cat={cat}
            ticked={form.rights}
            onChange={(r) => set("rights", r)}
            error={err("rights")}
          />
        )}
        {rightsFaq && (
          <Why question={t("nk.rightsMore")} faq={{ item: rightsFaq, label: rightsFaq.q }}>
            {t("nk.rightsWhy")}
          </Why>
        )}
      </SubSection>
    </div>
  );
}
