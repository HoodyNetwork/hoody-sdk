// New key: basics on the left, access on the right (one column on a narrow drawer). The result replaces the
// body: the key shown once, or the plain words for an unknown outcome. The secret is wiped on close.
import {
  Button,
  Drawer,
  DrawerCancel,
  type DrawerProps,
  Form,
  Outcome,
  useStrings,
} from "@kit";
import { useState } from "react";
import { pageFaq } from "../faq";
import { inRealmBody, newForm, RID, toBody } from "../logic";
import strings from "../strings.en.json";
import type { Catalogue, NewKeyForm, Realm } from "../types";
import { DismissButton } from "./Dismiss";
import { ElsewhereNote } from "./Elsewhere";
import { KeyFields } from "./KeyFields";
import { NoSecretPanel, PendingPanel, ShownPanel } from "./MintPanels";
import { useMintFlow } from "./mint-flow";
import { deleteMadeText, outcomeText, realmName, worksText } from "./words";
import { enterSubmits } from "./words";
import s from "./keys.module.css";

export interface NewKeyDrawerProps {
  realms: readonly Realm[] | undefined;
  /** 'all' or the realm the shell shows. */
  realm: string;
  cat: Catalogue | null;
  onClose: () => void;
  onChanged: () => void;
}

export function NewKeyDrawer({
  realms,
  realm,
  cat,
  onClose,
  onChanged,
}: NewKeyDrawerProps) {
  const t = useStrings(strings);
  const bound = RID.test(realm);
  const [form, setForm] = useState<NewKeyForm>(() => newForm(realm));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const flow = useMintFlow(cat, onChanged);
  /** Sets a field; an updater gets the field's latest value (edits made while an await ran are kept). */
  const set = <F extends keyof NewKeyForm>(
    k: F,
    v: NewKeyForm[F] | ((cur: NewKeyForm[F]) => NewKeyForm[F]),
  ) => {
    setTouched(true);
    setForm((f) => ({
      ...f,
      [k]:
        typeof v === "function"
          ? (v as (cur: NewKeyForm[F]) => NewKeyForm[F])(f[k])
          : v,
    }));
    setErrors((e) =>
      k in e
        ? Object.fromEntries(Object.entries(e).filter(([x]) => x !== k))
        : e,
    );
  };
  const phase = flow.phase;
  const sending = phase.kind === "sending";
  const shown = phase.kind === "shown";
  const submit = async () => {
    const r = toBody(form, cat, Date.now());
    if (r.errors) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    if (bound && !inRealmBody(r.body, realm)) {
      flow.refuse("REALM_SCOPE");
      return;
    }
    const res = await flow.start({
      kind: "create",
      body: r.body,
      alias: r.body.alias ?? null,
    });
    if (res?.code === "DUPLICATE_ALIAS") setErrors({ name: "dup" });
  };

  // The kit Drawer asks first when typed input or a shown-once key would be lost; this runs once it is agreed.
  const request = (open: boolean) => {
    if (open) return;
    flow.wipe();
    onClose();
  };

  const banner = flow.banner ? (
    <Outcome
      wrap
      outcome={
        flow.banner.kind === "not_sent" || flow.banner.kind === "pending"
          ? flow.banner.kind
          : "failed"
      }
      detail={
        flow.banner.said ??
        (phase.kind === "nosecret"
          ? deleteMadeText(t, { outcome: flow.banner.kind, code: flow.banner.code }, phase.key.name || t("unnamed"))
          : outcomeText(
              t,
              { outcome: flow.banner.kind, code: flow.banner.code },
              form.name.trim() || t("unnamed"),
              true,
            ))
      }
    />
  ) : undefined;

  let body;
  let foot: Pick<
    DrawerProps,
    "primary" | "secondary" | "outcome" | "cancel" | "dirty" | "busy"
  > = {};
  let title = t("nk.title");
  let sub: string | undefined = bound
    ? t("nk.madeIn", { realm: realmName(realms, realm) })
    : t("nk.sub");
  if (phase.kind === "shown") {
    const k = phase.key;
    title = t("sh.title", { name: k.name || t("unnamed") });
    sub = undefined;
    body = (
      <ShownPanel
        held={phase.held}
        ctx={phase.ctx}
        where={worksText(t, k, realms)}
        ends={k.endsAt}
      />
    );
    // Done is the primary; it closes through the same guard as Esc (the key is shown once).
    foot = {
      primary: <DrawerCancel variant="secondary" label={t("sh.close")} />,
      cancel: false,
      dirty: true,
    };
  } else if (phase.kind === "pending") {
    body = (
      <PendingPanel
        candidates={phase.candidates}
        named={phase.named}
        failed={phase.failed}
        checked={phase.checked}
        settled={phase.settled === true}
      />
    );
    foot = {
      // Settled: nothing is left to check, so Close is the primary.
      cancel: phase.settled ? false : t("pd.close"),
      // The person can always end it, warned that a key may have been made: whatever the reads show (a
      // namesake listed, a read that failed), Check again may not prove it.
      // A read proved it here (settled): nothing is left to check or dismiss.
      secondary:
        !phase.reading && !phase.settled ? (
          <DismissButton
            key={phase.hold ?? ""}
            onDismiss={() => flow.dismiss(phase)}
            body={t("dismiss.bodyMint")}
            variant="secondary"
            size="md"
          />
        ) : undefined,
      primary: phase.settled ? (
        <DrawerCancel variant="primary" label={t("pd.close")} />
      ) : (
        <Button
          variant="primary"
          icon="reload"
          busy={phase.reading}
          onPress={() => void flow.check()}
        >
          {t("action.checkAgain")}
        </Button>
      ),
    };
  } else if (phase.kind === "nosecret") {
    body = (
      <>
        <NoSecretPanel />
        {phase.away && <ElsewhereNote away={phase.away} />}
      </>
    );
    foot = {
      busy: phase.reading,
      cancel: t("pd.close"),
      outcome: banner,
      // A delete that may have gone through: Check again, or the person's warned Dismiss (another page's: neither).
      secondary:
        phase.unsure && !phase.away && !phase.reading ? (
          <DismissButton
            key={phase.hold ?? ""}
            onDismiss={() => flow.dismissMade(phase)}
            variant="secondary"
            size="md"
          />
        ) : undefined,
      primary: phase.away ? undefined : phase.unsure ? (
        <Button
          variant="primary"
          icon="reload"
          busy={phase.reading}
          onPress={() => void flow.checkMade()}
        >
          {t("action.checkAgain")}
        </Button>
      ) : (
        <Button
          tone="danger"
          busy={phase.reading}
          onPress={() => void flow.deleteMade()}
        >
          {t("ns.action")}
        </Button>
      ),
    };
  } else {
    body = (
      <div role="presentation" onKeyDown={enterSubmits(() => void submit())}>
        <Form onSubmit={() => void submit()} busy={sending} className={s.newForm}>
          <KeyFields
            form={form}
            set={set}
            errors={errors}
            cat={cat}
            realms={realms}
            realm={realm}
            sending={sending}
            realmsFaq={pageFaq(t).byId.realms}
            rightsFaq={pageFaq(t).byId.rights}
          />
        </Form>
      </div>
    );
    foot = {
      dirty: touched,
      busy: sending,
      outcome: banner,
      primary: (
        <Button variant="primary" busy={sending} onPress={() => void submit()}>
          {sending ? t("nk.sending") : t("nk.go")}
        </Button>
      ),
    };
  }

  return (
    <Drawer resizeKey="keys-new"
      isOpen
      onOpenChange={request}
      title={title}
      subtitle={sub}
      size="md"
      {...foot}
      {...(shown
        ? { discardText: t("sh.closeAsk"), discardLabel: t("sh.closeNow") }
        : {})}
    >
      {body}
    </Drawer>
  );
}
