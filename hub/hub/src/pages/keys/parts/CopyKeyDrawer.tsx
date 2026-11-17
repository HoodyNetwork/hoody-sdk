// Copy with a new secret: same rights, realms and addresses, a new key. The source is re-read first and
// nothing is sent if it changed; then the same shown-once body as New key.
import {
  Button,
  DateField,
  Drawer,
  DrawerCancel,
  Form,
  Outcome,
  SegmentedControl,
  TextField,
  useStrings,
  type DrawerProps,
} from "@kit";
import { useRef, useState } from "react";
import { useRealm } from "../data";
import { copyableIn, copyBody, RID } from "../logic";
import strings from "../strings.en.json";
import type { CopyEnds, CopyInput, Key, Realm } from "../types";
import { DismissButton } from "./Dismiss";
import { ElsewhereNote } from "./Elsewhere";
import { NoSecretPanel, PendingPanel, ShownPanel } from "./MintPanels";
import { useMintFlow } from "./mint-flow";
import { deleteMadeText, outcomeText, worksText } from "./words";
import type { Catalogue } from "../types";
import { enterSubmits } from "./words";
import s from "./keys.module.css";

export interface CopyKeyDrawerProps {
  source: Key;
  realms: readonly Realm[] | undefined;
  cat: Catalogue | null;
  onClose: () => void;
  onChanged: () => void;
}

export function CopyKeyDrawer({
  source,
  realms,
  cat,
  onClose,
  onChanged,
}: CopyKeyDrawerProps) {
  const t = useStrings(strings);
  const [input, setInput] = useState<CopyInput>({
    name: "",
    ends: "same",
    date: "",
  });
  const initial = useRef(JSON.stringify(input));
  const [error, setError] = useState<string | undefined>();
  const [nameError, setNameError] = useState<string | undefined>();
  const { realm } = useRealm();
  const flow = useMintFlow(cat, onChanged, `copy:${source.id}`);
  const phase = flow.phase;
  const sending = phase.kind === "sending";
  // "Same as the key it copies" cannot be sent for a key that has ended (the API refuses to copy a past end and asks
  // for a new one): said before the press, at the footer, and nothing is sent.
  const endedAt = source.endsAt ? Date.parse(source.endsAt) : NaN;
  const sameEnded = input.ends === "same" && endedAt <= Date.now();

  const submit = async () => {
    if (sameEnded) return;
    const r = copyBody(input, Date.now());
    if (r.errors) {
      // The name's own refusal shows at the name, so a refused character never stops the press with nothing said.
      setNameError(
        r.errors.name
          ? t(`e.name.${r.errors.name}` as "e.name.chars")
          : undefined,
      );
      setError(
        r.errors.date
          ? t(`e.date.${r.errors.date}` as "e.date.bad")
          : undefined,
      );
      return;
    }
    setError(undefined);
    setNameError(undefined);
    // Checked at send, against the realm the page shows now: the row that opened this drawer may be from another.
    if (!copyableIn(source, RID.test(realm) ? realm : undefined)) {
      flow.refuse("NOT_HERE");
      return;
    }
    const alias = typeof r.body.alias === "string" ? r.body.alias : null;
    await flow.start({ kind: "copy", body: r.body, source, alias });
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
              // The copy is a new key: its outcome names the copy, never the original (which was not touched).
              input.name.trim() || t("cp.copyOf", { name: source.name || t("unnamed") }),
              true,
            ))
      }
    />
  ) : undefined;

  let body;
  let foot: Pick<
    DrawerProps,
    "primary" | "secondary" | "outcome" | "reason" | "cancel" | "dirty" | "busy"
  > = {};
  let title = t("cp.title", { name: source.name || t("unnamed") });
  if (phase.kind === "shown") {
    title = t("sh.title", { name: phase.key.name || t("unnamed") });
    body = (
      <ShownPanel
        held={phase.held}
        ctx={phase.ctx}
        where={worksText(t, phase.key, realms)}
        ends={phase.key.endsAt}
      />
    );
    // Done is the primary; it closes through the same guard as Esc (the key is shown once).
    foot = { primary: <DrawerCancel variant="secondary" label={t("sh.close")} />, cancel: false, dirty: true };
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
        <Form onSubmit={() => void submit()} className={s.newForm}>
          <div className={s.newCol}>
            <p className={s.help}>{t("cp.intro")}</p>
            <TextField
              label={t("nk.name")}
              description={t("cp.nameH")}
              value={input.name}
              onChange={(v) => {
                setInput({ ...input, name: v });
                setNameError(undefined);
              }}
              isDisabled={sending}
              maxLength={254}
              errorMessage={nameError}
              focusOnError
            />
            <SegmentedControl<CopyEnds>
              label={t("nk.ends")}
              showLabel
              fullWidth
              value={input.ends}
              onChange={(v) => setInput({ ...input, ends: v })}
              isDisabled={sending}
              items={[
                { id: "same", label: t("nk.endsSame") },
                { id: "never", label: t("nk.endsNever") },
                { id: "90d", label: t("nk.ends90") },
                { id: "1y", label: t("nk.ends1y") },
                { id: "date", label: t("nk.endsDate") },
              ]}
            />
            {input.ends === "date" && (
              <DateField
                label={t("nk.endsOn")}
                value={input.date}
                onChange={(v) => setInput({ ...input, date: v })}
                description={t("nk.endsUtc")}
                errorMessage={error}
                mono
              />
            )}
          </div>
        </Form>
      </div>
    );
    foot = {
      dirty: JSON.stringify(input) !== initial.current,
      busy: sending,
      outcome: banner,
      ...(sameEnded ? { reason: t("cp.endsEnded") } : {}),
      primary: (
        // The busy name says what the whole wait is (read, hold, copy request; the line under the form is gone).
        // It starts with the label (WCAG 2.5.3).
        <Button
          variant="primary"
          busy={sending}
          isDisabled={sameEnded}
          {...(sameEnded ? { disabledReason: t("cp.endsEnded") } : {})}
          aria-label={sending ? t("cp.goBusy") : undefined}
          onPress={() => void submit()}
        >
          {t("cp.go")}
        </Button>
      ),
    };
  }

  return (
    <Drawer resizeKey="keys-copy"
      isOpen
      onOpenChange={request}
      title={title}
      size="sm"
      {...foot}
      {...(phase.kind === "shown"
        ? { discardText: t("sh.closeAsk"), discardLabel: t("sh.closeNow") }
        : {})}
    >
      {body}
    </Drawer>
  );
}
