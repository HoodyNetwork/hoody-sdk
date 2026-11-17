// Share a realm: the computers the share reaches, by name, before Create. A realm share reaches
// every computer in the realm when it is used, so the list always ends with the computers added later, and a list
// that could not be read still says plainly what the share reaches.
import { Button, Disclosure, Section, Spinner, useStrings } from "@kit";
import { useShareComputers, type ShareComputer } from "../data";
import strings from "../strings.en.json";
import s from "./keys.module.css";

/** Names shown before "Show all". */
export const SHARE_COMPUTERS_SHOWN = 8;

function Names({ rows }: { rows: readonly ShareComputer[] }) {
  return (
    <ul className={s.getList}>
      {rows.map((c) => (
        <li key={c.id}>
          {c.name}
          {c.project && <span className={s.muted}> · {c.project}</span>}
        </li>
      ))}
    </ul>
  );
}

/** `locked`: the drawer is sending the share; Try again waits, like the rest of the form. */
export function ShareComputers({ realm, locked = false }: { realm: string | undefined; locked?: boolean }) {
  const t = useStrings(strings);
  const q = useShareComputers(realm);
  if (!realm || !/^[0-9a-f]{24}$/.test(realm)) return null;
  const later = <p className={s.help}>{t("share.compLater")}</p>;
  let body;
  if (q.isPending) {
    body = (
      <>
        <p className={s.help} role="status" /* reason: the words are the status of the computers read; the spinner is only its mark */>
          <Spinner /> {t("share.compReading")}
        </p>
        {later}
      </>
    );
  } else if (q.isError || !q.data) {
    body = (
      <>
        <p className={s.help}>{t("share.compFailed")}</p>
        <p className={s.help}>{t("share.compEvery")}</p>
        <div>
          <Button variant="secondary" isDisabled={locked} onPress={() => void q.refetch()}>
            {t("share.compRetry")}
          </Button>
        </div>
      </>
    );
  } else if (q.data.rows.length === 0) {
    body = <p className={s.help}>{t("share.compNone")}</p>;
  } else {
    const { rows, more } = q.data;
    const first = rows.slice(0, SHARE_COMPUTERS_SHOWN);
    const rest = rows.slice(SHARE_COMPUTERS_SHOWN);
    body = (
      <>
        <Names rows={first} />
        {rest.length > 0 && (
          <Disclosure title={t("share.compAll", { count: rows.length })}>
            <Names rows={rest} />
          </Disclosure>
        )}
        {more && <p className={s.help}>{t("share.compMore")}</p>}
        {later}
      </>
    );
  }
  const n = q.data && !q.isError ? q.data.rows.length : null;
  return (
    <Section
      title={t("share.compTitle")}
      description={
        n !== null && n > 0
          ? t(q.data?.more ? "share.compCountMore" : "share.compCount", { count: n })
          : undefined
      }
    >
      <div className={s.newCol} data-testid="share-computers">
        {body}
      </div>
    </Section>
  );
}
