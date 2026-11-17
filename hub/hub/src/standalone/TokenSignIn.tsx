// TokenSignIn.tsx: the access-key way in, drawn in place of the password form once the person picked "Use an access
// key" under "Other ways to sign in" (token.ts holds the rules). The key is held in this component's state only while
// the person checks it, never shown back. Its form's one primary is "Check the key" (Enter in the field submits it);
// "Back to sign in" (`onBack`) ends it and drops any answer still out; hiding the page (closing the tab, going
// back, the page kept in the browser's back/forward cache) does the same, so a key checked or still out is not
// kept in a page the person left (kit useWipeOn). The confirm card names the account, the place,
// the end date and the key's name as facts, and what acting with a key means, before Open installs the session (then
// `onSignedIn` opens the Hub); a realm shows by its masked id (kit maskId, IdChip), never whole. While the card is up,
// `onConfirming(true)` lets the page retitle the card: its Open is the one primary then.
import { useEffect, useRef, useState } from "react";
import {
  Band,
  Button,
  Facts,
  Form,
  InlineActions,
  SecretInput,
  Select,
  TextButton,
  TextField,
  formatDate,
  maskId,
  useWipeOn,
} from "@kit";
import s from "./FirstRun.module.css";
import { useStrings } from "@kit/strings";
import { retryWords } from "./retryWords";
import strings from "./strings.en.json";
import { useFocusOnMount } from "./focusOnMount";
import {
  checkToken,
  liveGlobals,
  openToken,
  type Checked,
  type CheckResult,
  type Intro,
  type TokenError,
} from "./token";

type Choice = Extract<CheckResult, { choose: unknown }>;
type Key = keyof typeof strings;
const ERR: Record<Exclude<TokenError, "retry">, Key> = {
  empty: "key.err.empty",
  jwt: "key.err.jwt",
  shape: "key.err.shape",
  two: "key.err.two",
  invalid: "key.err.invalid",
  noComputers: "key.err.noComputers",
  realmNeeded: "key.err.realmNeeded",
  realmMismatch: "key.err.realmMismatch",
  realmShape: "key.err.realmShape",
  realmUnsupported: "key.err.realmUnsupported",
  offline: "key.err.offline",
  network: "key.err.network",
  unavailable: "key.err.unavailable",
  storage: "key.err.storage",
  stale: "key.err.stale",
  signedIn: "key.err.signedIn",
  framed: "key.err.framed",
};
const REALM_ERRORS: readonly TokenError[] = [
  "realmNeeded",
  "realmMismatch",
  "realmShape",
];

/** A value that is data (a name, an id): never translated, never made a link. */
const data = (v: string) => <span translate="no">{v}</span>;

export function TokenSignIn({
  onSignedIn,
  onConfirming,
  onBack,
}: {
  onSignedIn: () => void;
  onConfirming?: (on: boolean) => void;
  /** Back to the password form: this way ends here. */
  onBack: () => void;
}) {
  const t = useStrings(strings);
  const [text, setText] = useState("");
  const [realm, setRealm] = useState("");
  const [needRealm, setNeedRealm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{
    key: TokenError;
    retryAfter?: number;
  } | null>(null);
  const [choice, setChoice] = useState<{ c: Choice; picked: string } | null>(
    null,
  );
  const [checked, setChecked] = useState<Checked | null>(null);
  const g = liveGlobals();
  const confirming = checked !== null;
  useEffect(() => {
    onConfirming?.(confirming);
  }, [confirming, onConfirming]);
  useEffect(() => () => onConfirming?.(false), [onConfirming]);
  // Each check takes a number; Back, Cancel or leaving the screen moves it on, so an answer that comes
  // back after that is dropped (no confirm card, no key held, the page keeps its own primary).
  const gen = useRef(0);
  useEffect(() => () => { gen.current++; }, []);
  // While a check is out the kit Form locks its field and button (disabled), so the focus falls to <body>. A refusal
  // hands it back to the field to fix: the realm ID for a realm refusal, else the key (the kit SecretInput has no
  // focusOnError or input ref, so its box is reached through a wrapper).
  const keyBox = useRef<HTMLDivElement>(null);
  const realmInput = useRef<HTMLInputElement>(null);
  // On the realm pick no key field is shown: a refusal there hands the focus to the pick's Select, unless the person is
  // typing in a field. The pick is no Form, so its fields stay enabled while the check is out and the person may be in
  // one: a late answer never takes the focus from them. Anywhere else (the busy Continue, which keeps the focus, or the
  // page) the Select takes it.
  const pickTrigger = useRef<HTMLButtonElement>(null);
  const [refocus, setRefocus] = useState<{ realm: boolean; n: number } | null>(null);
  useEffect(() => {
    if (!refocus) return;
    const field = refocus.realm ? realmInput.current : keyBox.current?.querySelector<HTMLInputElement>("input");
    if (field) field.focus();
    else {
      const a = document.activeElement;
      const typing =
        a instanceof HTMLInputElement ||
        a instanceof HTMLTextAreaElement ||
        (a instanceof HTMLElement && a.isContentEditable);
      if (!typing) pickTrigger.current?.focus();
    }
  }, [refocus]);
  // First focus on the key when its form appears (as autoFocus, without the attribute: focusOnMount.ts, through the
  // same wrapper).
  const keyFirst = useFocusOnMount(true, keyBox);
  // The realm pick replaces the form (its field and button go): the pick's Select takes the focus when it appears.
  const choosing = choice !== null;
  useEffect(() => {
    if (choosing) pickTrigger.current?.focus();
  }, [choosing]);

  const reset = (): void => {
    gen.current++;
    setBusy(false);
    setText("");
    setChoice(null);
    setChecked(null);
    setError(null);
  };
  // Page hide ends the way like Back: the key's answer still out is dropped, a checked key or a realm pick holding it
  // goes, and the empty key form is back if the page is shown again.
  useWipeOn(reset);
  const settle = (r: CheckResult): void => {
    setBusy(false);
    if (r.ok) {
      setChecked(r.checked);
      setText("");
      setChoice(null);
      return;
    }
    if ("choose" in r) {
      setChoice({ c: r, picked: "" });
      return;
    }
    setError({
      key: r.error,
      ...(r.retryAfter ? { retryAfter: r.retryAfter } : {}),
    });
    if (REALM_ERRORS.includes(r.error)) setNeedRealm(true);
    setRefocus((p) => ({ realm: REALM_ERRORS.includes(r.error), n: (p?.n ?? 0) + 1 }));
  };

  const check = async (): Promise<void> => {
    if (!g || busy) return;
    const mine = ++gen.current;
    setBusy(true);
    setError(null);
    const r = await checkToken(g, { text, realm: needRealm ? realm : "" }, () => mine === gen.current);
    if (mine === gen.current) settle(r);
  };
  const pick = async (): Promise<void> => {
    if (!g || busy || !choice) return;
    const { c, picked } = choice;
    const pin = picked === "one" ? realm.trim().toLowerCase() : picked;
    if (!pin) return;
    const mine = ++gen.current;
    setBusy(true);
    setError(null);
    const r = await checkToken(g, {
      token: c.token,
      rev0: c.rev0,
      intro: c.intro as Intro,
      pin,
    }, () => mine === gen.current);
    if (mine === gen.current) settle(r);
  };
  const open = (): void => {
    if (!g || !checked) return;
    const r = openToken(g, checked);
    if (r === "ok") {
      setChecked(null);
      onSignedIn();
      return;
    }
    setChecked(null);
    setError({ key: r });
  };

  // Too many checks: the wait in the words every other way on this card uses (seconds, minutes, or no time promised).
  const wait = retryWords(error?.retryAfter);
  const errorText = !error
    ? undefined
    : error.key === "retry"
      ? "vars" in wait ? t(wait.key, wait.vars) : t(wait.key)
      : t(ERR[error.key]);
  const realmField = (
    <TextField
      label={t("key.realm")}
      description={t("key.realmDescription")}
      value={realm}
      onChange={setRealm}
      mono
      spellCheck="false"
      autoComplete="off"
      inputRef={realmInput}
    />
  );

  const back = (): void => {
    reset();
    onBack();
  };

  return (
    <>
      {checked ? (
        <>
          <Facts
            columns={1}
            layout="spec"
            label={t("key.confirm.label")}
            items={[
              {
                label: t("key.confirm.account"),
                value: data(checked.owner.username),
              },
              checked.pin === "all"
                ? {
                    label: t("key.confirm.place"),
                    value: t("key.confirm.allPlaces"),
                  }
                : { label: t("key.confirm.place"), id: checked.pin },
              {
                label: t("key.confirm.ends"),
                value:
                  checked.intro.expiresAt === null
                    ? t("key.confirm.never")
                    : formatDate(checked.intro.expiresAt),
              },
              {
                label: t("key.confirm.name"),
                value: data(checked.intro.alias),
              },
            ]}
          />
          <Band
            tone="warn" /* noDetails: what opening with this key means, said before anything is stored */
          >
            {t("key.confirm.warn", { owner: checked.owner.username })}
          </Band>
          <InlineActions
            label={t("key.confirm.actions")}
            actions={[
              {
                id: "key-cancel",
                label: t("key.cancel"),
                dismiss: true,
                onPress: reset,
              },
            ]}
            primary={{
              id: "key-open",
              label: t("key.open"),
              name: t("key.openName", { owner: checked.owner.username }),
              onPress: open,
            }}
          />
        </>
      ) : choice ? (
        <>
          <Select
            label={
              choice.c.choose.choose === "multi"
                ? t("key.pick.multi", { n: choice.c.choose.realms.length })
                : t("key.dest.title")
            }
            options={
              choice.c.choose.choose === "multi"
                ? choice.c.choose.realms.map((id, i) => ({
                    value: id,
                    label: t("key.pick.place", { i: i + 1 }),
                    description: maskId(id),
                  }))
                : [
                    { value: "all", label: t("key.dest.all") },
                    { value: "one", label: t("key.dest.one") },
                  ]
            }
            value={choice.picked || undefined}
            onChange={(v) => setChoice({ ...choice, picked: v })}
            errorMessage={errorText}
            triggerRef={pickTrigger}
          />
          {choice.picked === "one" && realmField}
          <InlineActions
            label={t("key.pick.actions")}
            actions={[
              {
                id: "key-pick",
                label: t("key.continue"),
                busy,
                onPress: () => {
                  void pick();
                },
                ...(choice.picked
                  ? {}
                  : { disabledReason: t("key.pick.first") }),
              },
              {
                id: "key-cancel",
                label: t("key.cancel"),
                dismiss: true,
                onPress: reset,
              },
            ]}
          />
        </>
      ) : (
        <>
          <Form
            onSubmit={() => {
              void check();
            }}
            busy={busy}
          >
            <div ref={keyFirst}>
              <SecretInput
                label={t("key.label")}
                description={t("key.description")}
                promises={[t("key.promise.here"), t("key.promise.send")]}
                value={text}
                onChange={setText}
                errorMessage={errorText}
              />
            </div>
            {needRealm && realmField}
            <Button
              variant="primary"
              fullWidth
              type="submit"
              busy={busy}
              isDisabled={!g}
              {...(g ? {} : { disabledReason: t("key.err.unready") })}
            >
              {t("key.check")}
            </Button>
          </Form>
          <div className={s.links}>
            <TextButton onPress={back}>{t("forgot.back")}</TextButton>
          </div>
        </>
      )}
    </>
  );
}
