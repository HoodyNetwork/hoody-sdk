// The one place a held secret meets the screen: the kit SecretField, given core's held secret and the context
// that minted it. Copy buttons and the masked command read it through core's useSecret(held, ctx) at press time.
import { CopyButton, SecretField, useStrings } from "@kit";
import type { Ctx, HeldSecret } from "@core";
import { useSyncExternalStore } from "react";
import strings from "../strings.en.json";
import s from "./keys.module.css";

export interface HeldFieldProps {
  held: HeldSecret | null;
  ctx: Ctx | null;
  label: string;
  description?: string;
  /** A hand-over note is several lines; a key is one. */
  format?: "single" | "text";
  /** A change masks a shown value again without dropping it (its fold closed). */
  maskKey?: unknown;
  /** Copy as a worded primary button (when copying is the point of the step), with these words. */
  copyPrimary?: boolean;
  copyLabel?: string;
}

/**
 * The held secret in the kit SecretField (hidden until Show, Copy works without Show). The kit reads it from
 * core's held secret itself and wipes it on close, route change, realm change, page hide and teardown.
 */
export function HeldField({
  held,
  ctx,
  label,
  description,
  format = "single",
  maskKey,
  copyPrimary,
  copyLabel,
}: HeldFieldProps) {
  const t = useStrings(strings);
  return (
    <SecretField
      label={label}
      held={held}
      ctx={ctx}
      format={format}
      {...(format === "single" ? { visiblePrefix: 7 } : {})}
      description={description}
      goneText={t("gone.title")}
      maskKey={maskKey}
      {...(copyPrimary ? { copyPrimary } : {})}
      {...(copyLabel !== undefined ? { copyLabel } : {})}
    />
  );
}

/**
 * Copy for a held secret: the kit CopyButton reads it at press time (`getValue`), so the secret never sits in the
 * element tree or in this component's state. `prefix` is text put before it ("export HOODY_TOKEN="). `secret`: in a
 * terminal the copy is asked and refused like the SecretField's own Copy beside it.
 */
export function HeldCopy({
  held,
  ctx,
  label,
  prefix = "",
  withLabel,
}: {
  held: HeldSecret | null;
  ctx: Ctx | null;
  label: string;
  prefix?: string;
  withLabel?: boolean;
}) {
  const subscribe = (cb: () => void) => (held ? held.onDrop(cb) : () => {});
  const available = useSyncExternalStore(
    subscribe,
    () => !!held && !held.dropped && held.reveal(ctx) !== null,
  );
  return (
    <CopyButton
      label={label}
      withLabel={withLabel}
      size="md"
      isDisabled={!available}
      secret
      getValue={() => {
        const v = held && !held.dropped ? held.reveal(ctx) : null;
        return v === null ? null : prefix + v;
      }}
    />
  );
}

/**
 * `export HOODY_TOKEN=…` with the value masked until Copy: the displayed text never holds the key, and the
 * copy reads the whole command from the held secret at press time.
 */
export function MaskedCommand({
  held,
  ctx,
  label,
}: {
  held: HeldSecret | null;
  ctx: Ctx | null;
  label: string;
}) {
  const t = useStrings(strings);
  const subscribe = (cb: () => void) => (held ? held.onDrop(cb) : () => {});
  const shown = useSyncExternalStore(
    subscribe,
    () => !!held && !held.dropped && held.reveal(ctx) !== null,
  );
  if (!shown) return null;
  return (
    <div className={s.maskedCommand}>
      <span className={s.maskedLabel}>{label}</span>
      <code className={s.maskedCode} translate="no">
        {t("sh.envCmd").replace("…", "••••••••")}
      </code>
      <HeldCopy
        held={held}
        ctx={ctx}
        label={t("sh.copyEnv")}
        prefix="export HOODY_TOKEN="
      />
    </div>
  );
}
