// The bodies a made key can leave a drawer in: shown once, unknown outcome, made without a secret.
// A secret reaches the screen only through HeldField and MaskedCommand. The shown panel's Verdict says to copy it now
// and holds where the key works and when it ends; the unknown-outcome panel says what the last read found on its one
// banner, lists the keys that appeared, and names what to do next. The drawers' footers hold Done and Check again.
import {
  Facts,
  ItemList,
  Link,
  Notice,
  OutcomeBanner,
  Stack,
  SubSection,
  Verdict,
  Why,
  usePageLink,
  useStrings,
} from "@kit";
import type { Ctx, HeldSecret } from "@core";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { pageFaq } from "../faq";
import strings from "../strings.en.json";
import type { Key } from "../types";
import { HeldField, MaskedCommand } from "./HeldField";
import { dayUtc } from "./words";
import s from "./keys.module.css";

/**
 * A body that takes focus when it replaces the form: the field that had it is gone, and Esc only reaches a
 * dialog that holds focus.
 */
export function Panel({
  gap = 4,
  children,
}: {
  /** The space between the body's parts, on the kit scale. */
  gap?: 3 | 4;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <div ref={ref} tabIndex={-1} className={s.panel}>
      <Stack gap={gap}>{children}</Stack>
    </div>
  );
}

export function ShownPanel({
  held,
  ctx,
  where,
  ends,
}: {
  held: HeldSecret;
  ctx: Ctx;
  where: string;
  ends: string | null;
}) {
  const t = useStrings(strings);
  const guide = usePageLink("guide");
  const panel = useRef<HTMLDivElement>(null);
  // `c` copies the key while this panel has the keyboard. It is the panel's own key, not a page key: the panel lives
  // in a drawer (a dialog), where page keys do not run, and a dialog opened over it takes the focus away.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "c" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (
      e.target instanceof HTMLElement &&
      /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
    )
      return;
    e.preventDefault();
    // The same press as the field's Copy key button: the kit button does the copying.
    [...(panel.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
      .find((b) => b.textContent?.trim() === t("action.copyKey"))
      ?.click();
  };
  const faq = pageFaq(t).byId.whatIsKey;
  return (
    <div role="presentation" ref={panel} onKeyDown={onKey}>
      <Panel>
        <Verdict
          label={t("sh.verdict")}
          facts={
            <Facts
              columns={1}
              layout="spec"
              label={t("sh.about")}
              items={[
                { label: t("sh.works"), value: where },
                {
                  label: t("sh.ends"),
                  value: ends
                    ? t("endsUtc", { date: dayUtc(ends) })
                    : t("sh.endsNever"),
                },
              ]}
            />
          }
        >
          {t("sh.warn")}
        </Verdict>
        {/* One Copy: the field's own, as the drawer's one accent button (the footer's close steps back). */}
        <HeldField held={held} ctx={ctx} label={t("secret.label")} copyPrimary copyLabel={t("action.copyKey")} />
        <MaskedCommand held={held} ctx={ctx} label={t("sh.env")} />
        <Why question={t("sh.guide")} faq={{ item: faq, label: faq.q }}>
          {t("sh.guideA")}{" "}
          {guide && <Link href={guide.href}>{t("sh.guideOpen")}</Link>}
        </Why>
      </Panel>
    </div>
  );
}

export function PendingPanel({
  candidates,
  named,
  failed,
  checked,
  settled = false,
}: {
  candidates: readonly Key[];
  /** The send named its key; without a name no listed key can be told to be it. */
  named: boolean;
  failed: boolean;
  checked: boolean;
  /** A read proved a key of this name was made (see mint-flow): what is left is to replace it. */
  settled?: boolean;
}) {
  const t = useStrings(strings);
  const listed = !failed && candidates.length > 0;
  // What the last read found, as the banner's second line: a failed read, or no key in the list yet. With keys listed
  // the sections under the banner say it.
  const found = failed
    ? t("pd.readFailedHelp")
    : listed
      ? undefined
      : t(named ? "pd.none" : "pd.noneUnnamed");
  return (
    <Panel gap={3}>
      <OutcomeBanner
        kind="pending"
        title={t("pd.title")}
        known={t("pd.body")}
        checkLine={found}
      />
      {listed && (
        <>
          <SubSection
            title={t("pd.found")}
            state={{ kind: "ready" }}
            description={t(named ? "pd.appeared" : "pd.appearedUnnamed")}
          >
            <ItemList
              label={t("pd.table")}
              items={candidates.map((k) => ({
                id: k.id,
                title: k.name || t("unnamed"),
                details: [
                  ...(k.prefix
                    ? [
                        {
                          label: t("insp.prefix"),
                          value: t("prefixShort", { prefix: k.prefix }),
                          mono: true,
                        },
                      ]
                    : []),
                  ...(k.createdAt
                    ? [
                        {
                          label: t("insp.created"),
                          value: dayUtc(k.createdAt),
                        },
                      ]
                    : []),
                ],
              }))}
            />
          </SubSection>
          {/* A listed key's secret is gone either way, so one that is yours is replaced. Settled (a key of this name
              exists), the two cases are alternatives: one fact per case, never numbered steps. */}
          <SubSection
            title={t("pd.stepsLabel")}
            description={t(settled ? "pd.settled" : "pd.next")}
          >
            {settled && (
              <Facts
                columns={1}
                items={[
                  { label: t("pd.ifYours"), value: t("pd.stepYours") },
                  { label: t("pd.ifNotYours"), value: t("pd.stepNotYours") },
                ]}
              />
            )}
          </SubSection>
        </>
      )}
      {checked && (
        <Notice inline icon={null}>
          {t("pd.checked")}
        </Notice>
      )}
    </Panel>
  );
}

export function NoSecretPanel() {
  const t = useStrings(strings);
  return (
    <Panel>
      <OutcomeBanner kind="failed" title={t("ns.title")} body={t("ns.body")} />
    </Panel>
  );
}
