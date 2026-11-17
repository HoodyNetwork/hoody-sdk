// A change another page sent and still holds: shown read-only with that page's link. Only that page can check
// or dismiss it, so no Check again or Dismiss is offered here.
import { OutcomeBanner, PageLinkTo, useStrings } from "@kit";
import type { Elsewhere } from "../data";
import strings from "../strings.en.json";
import s from "./keys.module.css";

/** The sending page's link (none when it named no page, or this Hub hides it). */
export function ElsewhereLink({ away }: { away: Elsewhere }) {
  const t = useStrings(strings);
  if (!away.from) return null;
  return (
    <PageLinkTo page={away.from.page} href={away.from.path}>
      {t("op.openSender")}
    </PageLinkTo>
  );
}

/** The note a drawer or inspector shows for it. */
export function ElsewhereNote({ away }: { away: Elsewhere }) {
  const t = useStrings(strings);
  return (
    <div className={s.elsewhere}>
      <OutcomeBanner kind="pending" title={t("op.heldElsewhere")} />
      <ElsewhereLink away={away} />
    </div>
  );
}
