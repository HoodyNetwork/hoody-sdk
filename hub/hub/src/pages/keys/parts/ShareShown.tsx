// A made share, shown once: the message to send first, then the other ways to hand it over (the sign-in link, a QR
// code and a prompt for an agent), each behind its own fold. One Verdict says what anyone holding the text can open.
// "Include the token" is this component's own state: off on every open, never stored. Off, the code opens this Hub
// and the prompt carries a placeholder; on, the code holds the sign-in link (the message when no link was held) and the
// prompt the token, and both stay hidden until Show. The sign-in link is shown like the message: masked, with Copy
// reading the held link at the press. Every token-bearing text is a core held secret minted with the message. This
// component owns their wipe whatever the switch shows (useWipeOn: route change, page hide, core ending the context).
// The prompt with the token is never put on screen: it shows with the token masked and Copy reads the held prompt at
// the press (HeldCopy), so the switch only changes what is drawn and never drops or reveals it. The code is drawn from
// the held text only while shown, hides again by the kit's reveal rules (useRevealGuard: the tab hidden; in the terminal
// also the terminal losing focus, or no key pressed for a while), and no text with the token ever goes in a link.
// Without a realm API address (no realm domain on this page) there is no prompt: a share token works only on its
// realm's address.
import {
  Button,
  CopyButton,
  Disclosure,
  Notice,
  QrCode,
  QrSecret,
  Row,
  SubSection,
  Verdict,
  VerdictMark,
  Why,
  useWipeOn,
  Switch,
  qrMatrix,
  qrTextMatrix,
  standInMatrix,
  useRevealGuard,
  useStrings,
} from "@kit";
import { hostEnv, hubApiBase, hubSiteOrigin, realmDomain, type Ctx, type HeldSecret } from "@core";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { pageFaq } from "../faq";
import { sharePrompt, utc } from "../share-logic";
import strings from "../strings.en.json";
import { HeldCopy, HeldField } from "./HeldField";
import { Panel } from "./MintPanels";
import s from "./keys.module.css";

/** The held text while it can be read in `ctx`, else null; follows the held secret's drop. */
function useHeldText(held: HeldSecret | null, ctx: Ctx, on: boolean): string | null {
  const subscribe = (cb: () => void) => (held ? held.onDrop(cb) : () => {});
  return useSyncExternalStore(subscribe, () =>
    on && held && !held.dropped ? held.reveal(ctx) : null,
  );
}

/** This realm's API URL for an agent (core hubApiBase), or null when the page names no realm API domain: a share
 *  token is refused on any other address (realm_ids, allow_no_realm false), so no prompt is offered then. */
export function shareApiUrl(realm: string): string | null {
  if (!realmDomain() || !/^[0-9a-f]{24}$/.test(realm)) return null;
  // realmDomain() set and a 24-hex realm: hubApiBase is absolute, so no page origin is needed to resolve it.
  return new URL(hubApiBase(realm)).href;
}

export function TokenQr({ held, ctx, warning, label }: { held: HeldSecret; ctx: Ctx; warning: string; label?: string }) {
  const t = useStrings(strings);
  const [shown, setShown] = useState(false);
  // A dropped text hides the code again (the held secret is gone; nothing to show); so do the kit's reveal rules, as
  // for its secret fields and QR surface: coming back needs Show again.
  useEffect(() => held.onDrop(() => setShown(false)), [held]);
  useRevealGuard(shown, () => setShown(false));
  const text = useHeldText(held, ctx, shown);
  const matrix = useMemo(() => (text ? qrTextMatrix(text) : null), [text]);
  const standIn = useMemo(() => standInMatrix(), []);
  return (
    <>
      {shown && text && !matrix ? (
        <Notice level="warn">{t("share.qrTooLong")}</Notice>
      ) : (
        <div className={s.qrBox}>
          {/* The caption under the code is the warning: what anyone who scans it gets. */}
          <QrSecret note={warning}>
            {shown && matrix ? (
              <QrCode matrix={matrix} label={label ?? t("share.qrTokenLabel")} className={s.qr} secret />
            ) : (
              <QrCode matrix={standIn} label={t("share.qrHiddenLabel")} className={`${s.qr} ${s.qrHidden}`} secret />
            )}
          </QrSecret>
        </div>
      )}
      <Row>
        <Button size="sm" icon={shown ? "eye-off" : "eye"} isDisabled={held.dropped} onPress={() => setShown((v) => !v)}>
          {shown ? t("share.qrHide") : t("share.qrShow")}
        </Button>
      </Row>
    </>
  );
}

export interface ShareShownProps {
  held: HeldSecret;
  /** The agent prompt with the token; null when it could not be held (the switch then offers no prompt with it). */
  heldPrompt: HeldSecret | null;
  /** The sign-in link with the token; null when it could not be held (no link section, and the code holds the message). */
  heldLink: HeldSecret | null;
  ctx: Ctx;
  /** The shared realm (24-hex): the prompt's API URL is its host. */
  realm: string;
  place: string;
  expires: string | null;
  short: boolean;
}

export function ShareShown({ held, heldPrompt, heldLink, ctx, realm, place, expires, short }: ShareShownProps) {
  const t = useStrings(strings);
  const [withToken, setWithToken] = useState(false);
  // Closing a fold hides what it showed again (a fold's panel stays mounted while closed): reopened, the code and the
  // link need Show again. Only Show is reset; nothing held is dropped, so Copy keeps working.
  const [qrFold, setQrFold] = useState(0);
  const [linkFold, setLinkFold] = useState(0);
  // The owner of every held text's wipe, mounted whatever the switch shows.
  useWipeOn(() => {
    held.drop();
    heldPrompt?.drop();
    heldLink?.drop();
  });
  const linkLive = useSyncExternalStore(
    (cb) => (heldLink ? heldLink.onDrop(cb) : () => {}),
    () => !!heldLink && !heldLink.dropped,
  );
  const promptLive = useSyncExternalStore(
    (cb) => (heldPrompt ? heldPrompt.onDrop(cb) : () => {}),
    () => !!heldPrompt && !heldPrompt.dropped,
  );
  const api = shareApiUrl(realm);
  // The token-free code opens this Hub's sign-in for shared access, where they paste the message (the site root is
  // not the Hub). With no Hoody address chosen yet (a standalone Hub) there is no code; the section says so. Off the web
  // (a terminal) the address is the web Hub's the host carries (hostEnv().pageAddress), else none.
  const site = useMemo(() => {
    const env = hostEnv();
    return env.browserPage ? hubSiteOrigin() : (env.pageAddress?.origin ?? "");
  }, []);
  const hub = useMemo(() => (site ? qrMatrix(`${site}/auth/login?signin=token`) : null), [site]);
  const promptWith = (token: string) =>
    api
      ? sharePrompt({
          head: t("share.promptHead", { realm: place }),
          api: t("share.promptApi", { url: api }),
          auth: t("share.promptAuth", { token }),
          ends: expires ? t("share.promptEnds", { date: utc(expires) }) : null,
        })
      : null;
  const plainPrompt = promptWith(t("share.promptPlaceholder"));
  // The same prompt as the held one, token masked: what is drawn when Include the token is on.
  const maskedPrompt = promptWith(t("share.promptMask"));
  const faq = pageFaq(t).byId.shareMessage;
  return (
    <Panel>
      <Verdict
        label={t("share.shownLabel")}
        {...(short && expires ? { next: t("share.shortened", { date: utc(expires) }) } : {})}
      >
        <VerdictMark tone="warn">{t("share.shownNow")}</VerdictMark>{" "}
        {expires ? t("share.shownRest", { place, date: utc(expires) }) : t("share.shownRestNoDate")}
      </Verdict>
      <SubSection title={t("share.msgTitle")}>
        <HeldField held={held} ctx={ctx} label={t("share.ready")} description={t("share.readyNote")} format="text" />
        <div>
          <HeldCopy held={held} ctx={ctx} label={t("share.copy")} withLabel />
        </div>
      </SubSection>
      {heldLink && linkLive && (
        <Disclosure
          title={t("share.linkTitle")}
          description={t("share.linkFold")}
          onExpandedChange={(open) => {
            if (!open) setLinkFold((n) => n + 1);
          }}
        >
          <HeldField
            held={heldLink}
            ctx={ctx}
            label={t("share.linkLabel")}
            description={t("share.linkNote")}
            format="text"
            maskKey={linkFold}
          />
          <div>
            <HeldCopy held={heldLink} ctx={ctx} label={t("share.linkCopy")} withLabel />
          </div>
        </Disclosure>
      )}
      <Disclosure
        title={t("share.moreTitle")}
        description={t("share.moreFold")}
        onExpandedChange={(open) => {
          if (!open) setQrFold((n) => n + 1);
        }}
      >
        <Switch
          label={t("share.withToken")}
          description={t("share.withTokenH")}
          isSelected={withToken}
          onChange={setWithToken}
        />
        <SubSection title={t("share.qrTitle")} {...(!withToken && hub ? { description: t("share.qrHubHelp") } : {})}>
          {withToken ? (
            <TokenQr
              key={`token-${qrFold}`}
              held={heldLink && linkLive ? heldLink : held}
              ctx={ctx}
              {...(heldLink && linkLive ? { label: t("share.qrLinkLabel") } : {})}
              warning={expires ? t("share.qrTokenWarn", { place, date: utc(expires) }) : t("share.qrTokenWarnNoDate")}
            />
          ) : hub ? (
            <div className={s.qrBox}>
              <QrCode matrix={hub} label={t("share.qrHubLabel")} className={s.qr} secret={false} />
            </div>
          ) : (
            <Notice>{t(site ? "share.qrNoHub" : "share.qrNoSite")}</Notice>
          )}
        </SubSection>
        <SubSection title={t("share.promptTitle")} {...(plainPrompt ? { description: t("share.promptHelp") } : {})}>
          {!plainPrompt ? (
            <Notice>{t("share.promptNoApi")}</Notice>
          ) : (
            <>
              {withToken && heldPrompt && promptLive && (
                <>
                  <Notice>{t("share.promptMasked")}</Notice>
                  <pre className={s.prompt} data-testid="share-prompt-masked" translate="no" /* reason: the prompt is plain English for an agent, not JSON or code; the kit CodeBlock would colour prose */>
                    {maskedPrompt}
                  </pre>
                  <div>
                    <HeldCopy held={heldPrompt} ctx={ctx} label={t("share.promptCopy")} withLabel />
                  </div>
                </>
              )}
              {!(withToken && promptLive) && (
                <>
                  {withToken && <Notice level="warn">{t("share.promptNoToken")}</Notice>}
                  <pre className={s.prompt} data-testid="share-prompt" translate="no" /* reason: the prompt is plain English for an agent, not JSON or code; the kit CodeBlock would colour prose */>
                    {plainPrompt}
                  </pre>
                  <Row>
                    <CopyButton text={plainPrompt} label={t("share.promptCopy")} withLabel size="md" />
                  </Row>
                </>
              )}
            </>
          )}
        </SubSection>
      </Disclosure>
      <Why question={t("share.sendMore")} faq={{ item: faq, label: faq.q }}>
        {t("share.sendMoreA")}
      </Why>
    </Panel>
  );
}
