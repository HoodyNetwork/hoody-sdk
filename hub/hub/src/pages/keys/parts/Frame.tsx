// The page frame: header (title, lede, the tab's primary action) and the three tabs. The tabs are the kit's route
// tabs (links), so Back walks between them and each is a deep link. The page's questions end the body of a tab
// that scrolls with the page; the API keys tab (fill, a list/detail) shows them at the end of its list instead.
import {
  AgentHint,
  Faq,
  PageBlock,
  PageHeader,
  Tabs,
  useStrings,
  type PageHeaderProps,
  type PrimaryAction,
} from "@kit";
import { useAgentScopeFacts } from "@core";
import type { ReactNode } from "react";
import { pageFaq } from "../faq";
import strings from "../strings.en.json";
import s from "./keys.module.css";

export type TabId = "keys" | "ssh" | "shared";

const HREF: Record<TabId, string> = {
  keys: "/keys",
  ssh: "/keys/ssh",
  shared: "/keys/shared",
};

export interface FrameProps {
  tab: TabId;
  /** The primary action of the current tab: last in the header, the floating button on phone width. */
  primary?: PrimaryAction;
  /** One accent per screen: an open detail's own primary is the accent, so the tab's turns secondary and does not
   * float. */
  primaryQuiet?: boolean;
  counts?: Partial<Record<TabId, number | undefined>>;
  /** Extra header actions before the primary one. */
  actions?: ReactNode;
  /** A strip between the tabs and the body (realm band, outcome notices). */
  notice?: ReactNode;
  children: ReactNode;
  /** The body scrolls itself (the list/detail tab does). */
  fill?: boolean;
}

export function Frame({
  tab,
  primary,
  primaryQuiet = false,
  actions,
  counts,
  notice,
  children,
  fill,
}: FrameProps) {
  const t = useStrings(strings);
  const agentFacts = useAgentScopeFacts(null);
  const header: PageHeaderProps = {
    title: t("title"),
    subtitle: t("subtitle"),
    breadcrumbs: undefined,
    actions: (
      // One group that wraps within the header (a pagehead container): the hint and a tab's extra actions do not fit
      // one line on a narrow phone, and the header's action row never wraps on its own.
      <div className={s.headActions}>
        <AgentHint page="keys" facts={agentFacts} />
        {actions}
      </div>
    ),
    primary,
    primaryQuiet,
    primaryAsFab: !primaryQuiet,
  };
  // A count badge says what it counts ("3 keys", "1 share"), and those words join the tab's name.
  // The SSH tab never has a count.
  const unit: Partial<Record<TabId, (n: number) => string>> = {
    keys: (n) => t("tab.keysUnit", { count: n }),
    shared: (n) => t("tab.sharedUnit", { count: n }),
  };
  const item = (id: TabId, label: string) => ({
    id,
    label,
    href: HREF[id],
    badge: counts?.[id],
    badgeUnit: unit[id],
  });
  const tabs = (
    <Tabs
      label={t("tabs.label")}
      value={tab}
      items={[
        item("keys", t("tab.keys")),
        item("ssh", t("tab.ssh")),
        item("shared", t("tab.shared")),
      ]}
    />
  );
  return (
    <div className={fill ? `${s.frame} ${s.frameFill}` : s.frame}>
      <div className={s.frameHead}>
        <PageHeader {...header} tabsFollow />
        <PageBlock gap={Boolean(fill && !notice)}>{tabs}</PageBlock>
      </div>
      {/* A tab whose body scrolls itself (fill) has no body padding: one gap closes the strip, or the notice under
          it when there is one (never a gap between the strip and its notice), as the kit's page layouts place theirs.
          A page-scrolling tab's body padding is its gap. */}
      {notice && (
        <div className={s.notice}>
          {fill ? <PageBlock>{notice}</PageBlock> : notice}
        </div>
      )}
      <div className={fill ? s.bodyFill : s.body}>
        {children}
        {!fill && (
          <div className={s.faq}>
            <Faq faq={{ items: pageFaq(t).items }} titleLevel={2} />
          </div>
        )}
      </div>
    </div>
  );
}
