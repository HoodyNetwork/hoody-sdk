// The keys page: three tabs (API keys, SSH key, Shared access) behind one route. A shared-access (token)
// session never gets here in the shell; the limited state covers the page being opened anyway.
import { EmptyState, useStrings, useSubPath } from "@kit";
import { useIsAccount } from "./data";
import { KeysTab } from "./parts/KeysTab";
import { SharedTab } from "./parts/SharedTab";
import { SshTab } from "./parts/SshTab";
import { useTabCounts } from "./parts/tabCounts";
import strings from "./strings.en.json";

export default function KeysPage() {
  const t = useStrings(strings);
  const [tab] = useSubPath("/keys");
  const account = useIsAccount();
  if (!account)
    return (
      <EmptyState
        icon="key"
        title={t("st.limited.title")}
        body={t("st.limited.body")}
      />
    );
  return <AccountTabs tab={tab} />;
}

/** Account sessions only: the counts read the key list, which a token session never asks for. Every tab shows both
 *  count badges, not only its own. */
function AccountTabs({ tab }: { tab: string | undefined }) {
  const counts = useTabCounts();
  if (tab === "ssh") return <SshTab keysCount={counts.keys} sharedCount={counts.shared} />;
  if (tab === "shared") return <SharedTab keysCount={counts.keys} />;
  return <KeysTab sharedCount={counts.shared} />;
}
