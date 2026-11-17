// The inspector of one key: state, rights grouped (read-only), allowed IPs, realms, when it was made.
// It never shows a secret: the server returns a key's secret only when it is made.
import { STATE_TONE } from './KeyInspector.pure';
export { STATE_TONE } from './KeyInspector.pure';
export type { Lineage } from './KeyInspector.pure';
import type { Lineage } from './KeyInspector.pure';
import { Button, DetailHeader, Facts, IdChip, Link, OutcomeBanner, PageLinkTo, Section, SettingGroup, SettingRow, StatusPill, Tag, TextButton, useStrings, Verdict, type Fact } from '@kit';
import { useEffect, useRef } from "react";
import { useRealms as useShellRealm } from "@core";
import { links as computers } from "../../computers/links";
import { links as programs } from "../../programs/links";
import { heldGroups, leafOf, rightKind } from "../logic";
import { links as keys } from "../links";
import strings from "../strings.en.json";
import type { Catalogue, Key, Realm } from "../types";
import {
  outcomeText,
  accessText,
  dayUtc,
  groupName,
  realmName,
  rightName,
} from "./words";
import { DismissButton } from "./Dismiss";
import type { Elsewhere } from "../data";
import { ElsewhereNote } from "./Elsewhere";
import s from "./keys.module.css";

export interface KeyInspectorProps {
  k: Key;
  cat: Catalogue | null;
  realms: readonly Realm[] | undefined;
  editable: boolean;
  /** A copy keeps the source's realms: in a realm only a key of exactly that realm is copied. */
  copyOk?: boolean;
  /** An unconfirmed or running pause/resume: its actions wait. */
  busy: boolean;
  /** The last pause, resume or delete may have gone through: say so, read it back on request, or dismiss it. */
  unconfirmed?: boolean;
  /** A Check of this key's change is out: Check again shows it is busy and Dismiss is off until it answers. */
  checking?: boolean;
  /** The unconfirmed change is another page's: shown read-only with its link (no Check again, no Dismiss). */
  elsewhere?: Elsewhere;
  /** What the last Check again found when it proved nothing: the banner's words instead of the general ones. */
  said?: string;
  /** True only when a fresh read proved the change. */
  onCheck?: () => Promise<boolean>;
  /** The person's warned Dismiss (it may have gone through): here too, since a narrow screen shows no list. */
  onDismiss?: () => unknown;
  /** The hold of the send the Dismiss concerns: a later send closes an open warning instead of being freed. */
  dismissKey?: string;
  /** Pause/Resume and Copy (absent: a share the Shared tab does not manage, which keeps Delete alone). */
  onToggle?: () => void;
  onCopy?: () => void;
  /** The warning of the unconfirmed change's Dismiss (default: the general one). */
  dismissBody?: string;
  /** Edit (absent: this key is never edited here, a share or one of the agent's own). */
  onEdit?: () => void;
  onDelete: () => void;
  /** The keys this one is linked to by who made whom, from the list read. */
  lineage?: Lineage;
  /** Open another key's details. */
  onOpen?: (k: Key) => void;
}

export function KeyInspector({
  k,
  cat,
  realms,
  editable,
  copyOk = true,
  busy,
  unconfirmed,
  checking = false,
  elsewhere,
  said,
  onCheck,
  onDismiss,
  dismissKey,
  onToggle,
  onCopy,
  onEdit,
  dismissBody,
  onDelete,
  lineage,
  onOpen,
}: KeyInspectorProps) {
  const t = useStrings(strings);
  // Delete sits in the danger group at the inspector's foot and this banner near its top: when this key's change turns
  // unconfirmed while it is open, bring the banner into view, or the person who just pressed sees nothing happen.
  // Only a change of the key on screen counts: opening a key that already was unconfirmed scrolls nothing.
  const unknownRef = useRef<HTMLDivElement>(null);
  const was = useRef({ id: k.id, unknown: unconfirmed });
  useEffect(() => {
    if (unconfirmed && was.current.id === k.id && !was.current.unknown) unknownRef.current?.scrollIntoView?.({ block: "nearest" });
    was.current = { id: k.id, unknown: unconfirmed };
  }, [k.id, unconfirmed]);
  const held =
    cat && k.perms ? cat.rights.filter((p) => leafOf(k.perms, p)) : null;
  const shown = useShellRealm().selected;
  const facts: Fact[] = [
    // A key the agent keeps: what it is for, as a fact rather than a notice.
    ...(k.managed === "boot" || k.managed === "realm"
      ? [{ label: t("insp.agent"), value: t(k.managed === "boot" ? "insp.boot" : "insp.realmKey") }]
      : []),
    {
      label: t("insp.prefix"),
      value: (
        <code className={s.mono}>{t("prefixShort", { prefix: k.prefix })}</code>
      ),
    },
    {
      label: t("insp.works"),
      value: k.allRealms ? (
        t("allRealms")
      ) : (
        <span className={s.realmChips}>
          {k.realms.map((r) => (
            <IdChip key={r} id={r} label={realmName(realms, r)} />
          ))}
        </span>
      ),
    },
    // Where the key's work is: the pages of the realm shown now, when the key works in it. Pages never switch the
    // realm, so another realm's computers are reached through the shell's realm picker. With all realms shown
    // there is no one realm to name: the row is left out. A page this Hub hides gets no link.
    ...(shown === "all"
      ? []
      : [
          {
            label: t("insp.where"),
            value:
              k.allRealms || k.realms.includes(shown) ? (
                <span className={s.whereLinks}>
                  <PageLinkTo page="computers" href={computers.list}>
                    {t("insp.whereComputers")}
                  </PageLinkTo>
                  <PageLinkTo page="programs" href={programs.list}>
                    {t("insp.wherePrograms")}
                  </PageLinkTo>
                  <Link variant="nav" href={keys.shared}>
                    {t("insp.whereShares")}
                  </Link>
                </span>
              ) : (
                t("insp.whereSwitch")
              ),
          },
        ]),
    { label: t("insp.access"), value: accessText(t, k) },
    {
      label: t("insp.ends"),
      value: k.endsAt ? t("endsUtc", { date: dayUtc(k.endsAt) }) : t("never"),
    },
    {
      label: t("insp.ips"),
      value: k.ips.length ? (
        <span className={s.mono}>{k.ips.join(", ")}</span>
      ) : (
        t("insp.ipsAny")
      ),
    },
  ];
  if (k.createdAt)
    facts.push({ label: t("insp.created"), value: dayUtc(k.createdAt) });
  facts.push({
    label: t("insp.lastUsed"),
    value: k.lastUsedAt
      ? k.lastUsedIp
        ? t("insp.lastUsedFrom", {
            date: dayUtc(k.lastUsedAt),
            ip: k.lastUsedIp,
          })
        : dayUtc(k.lastUsedAt)
      : t("insp.neverUsed"),
  });
  const keyLink = (x: Key) =>
    onOpen ? (
      <TextButton key={x.id} onPress={() => onOpen(x)}>
        {x.name || t("unnamed")}
      </TextButton>
    ) : (
      x.name || t("unnamed")
    );
  if (lineage?.parent)
    facts.push({ label: t("insp.madeBy"), value: keyLink(lineage.parent) });
  else if (lineage?.parentHidden)
    facts.push({ label: t("insp.madeBy"), value: t("insp.madeByHidden") });
  if (lineage && lineage.children.length > 0)
    facts.push({
      label: t("insp.made", { count: lineage.children.length }),
      value: (
        // Without onOpen the names are plain text, one list (as the flags below): bare text items would run together in the chip row.
        onOpen ? (
          <span className={s.realmChips}>{lineage.children.map(keyLink)}</span>
        ) : (
          lineage.children.map((x) => x.name || t("unnamed")).join(" · ")
        )
      ),
    });
  const flags = [
    k.delegates && t("insp.canMake"),
    k.vault && t("insp.vault"),
    k.events && t("insp.events"),
  ].filter(Boolean) as string[];
  if (flags.length)
    facts.push({ label: t("insp.flags"), value: flags.join(" · ") });

  // Why this key's actions are off here, if they are: the one line under the verdict.
  const offWhy = !editable ? t("band.readonly") : onCopy && !copyOk ? t("copy.notHere") : undefined;

  return (
    <div>
      <DetailHeader
        title={k.name || t("unnamed")}
        status={
          <StatusPill tone={unconfirmed ? "neutral" : STATE_TONE[k.state]} dot>
            {unconfirmed ? t("state.unknown") : t(`state.${k.state}`)}
          </StatusPill>
        }
        // The everyday actions in the header, Edit last as the one primary; Delete is the danger group at the foot.
        actions={
          onToggle || onCopy || onEdit ? (
            <>
              {onToggle ? (
                <Button isDisabled={!editable || busy || k.state === "expired"} onPress={onToggle}>
                  {k.enabled ? t("act.pause") : t("act.resume")}
                </Button>
              ) : null}
              {onCopy ? (
                <Button isDisabled={!editable || busy || !copyOk} onPress={onCopy}>
                  {t("act.copy")}
                </Button>
              ) : null}
              {onEdit ? (
                <Button variant="primary" isDisabled={!editable || busy} onPress={onEdit}>
                  {t("act.edit")}
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      />
      <div className={s.insp}>
        <Verdict label={t("insp.verdict")} {...(offWhy ? { next: offWhy } : {})}>
          {unconfirmed ? t("insp.now.unknown") : t(`insp.now.${k.state}`)}
        </Verdict>
        {unconfirmed && elsewhere && <ElsewhereNote away={elsewhere} />}
        {unconfirmed && !elsewhere && (
          <div ref={unknownRef} className={s.unknownAnchor}>
            <OutcomeBanner
              kind="pending"
              title={t("insp.unknownTitle")}
              body={said ?? outcomeText(t, { outcome: "pending" }, k.name || t("unnamed"), false)}
              onCheck={onCheck}
              checking={checking}
            />
          </div>
        )}
        {unconfirmed && !elsewhere && onDismiss && (
          <span className={s.sshActions}>
            <DismissButton
              key={dismissKey ?? ""}
              isDisabled={checking}
              onDismiss={onDismiss}
              {...(dismissBody ? { body: dismissBody } : {})}
            />
          </span>
        )}
        <Facts items={facts} />
        <Section
          title={t("insp.rights")}
          description={
            k.access?.full
              ? t("access.full")
              : held === null
                ? t("insp.rightsUnknown")
                : held.length === 0
                  ? t("insp.noRights")
                  : undefined
          }
        >
          {k.access?.full || held === null || held.length === 0 ? null : (
            // By area, as "Choose rights" groups them: the plain name first, the API's id under it, and a mark
            // per right (Read or Write); an area the key holds whole says Full.
            <div className={s.heldGroups}>
              {(cat ? heldGroups(cat.rights, held) : []).map((g) => {
                const name = groupName(t, g.key);
                return (
                  <section key={g.key} aria-label={name}>
                    <div className={s.heldHead}>
                      <h4 className={s.heldTitle}>{name}</h4>
                      {g.paths.length === g.of ? (
                        <Tag tone="ok">{t("insp.markFull")}</Tag>
                      ) : (
                        <Tag>{t("insp.groupOf", { n: g.paths.length, of: g.of })}</Tag>
                      )}
                    </div>
                    <ul className={s.heldList}>
                      {g.paths.map((p) => {
                        const plain = rightName(t, p);
                        return (
                          <li key={p}>
                            <span className={s.heldName}>
                              {plain}
                              {plain !== p && (
                                <span className={s.heldId}>{p}</span>
                              )}
                            </span>
                            <Tag>
                              {rightKind(p) === "read"
                                ? t("insp.markRead")
                                : t("insp.markWrite")}
                            </Tag>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </Section>
        <SettingGroup tone="danger" title={t("insp.danger")}>
          <SettingRow
            label={t("insp.deleteLabel")}
            help={t("insp.deleteHelp")}
            tone="danger"
            actions={
              <Button tone="danger" icon="trash" isDisabled={!editable || busy} onPress={onDelete}>
                {t("act.delete")}
              </Button>
            }
          />
        </SettingGroup>
      </div>
    </div>
  );
}
