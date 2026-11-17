// The person's warned Dismiss of a change that may have gone through (C9): offered beside Check again where no
// read can prove what happened (a create that does not show up, a cut or unreadable list, a computer that cannot
// be read). It asks first; only "Dismiss anyway" frees the hold, and the change may still have gone through.
// The warning acts on what was shown when it opened: `onDismiss` is taken at the press, so a newer send that lands
// while the warning is open is never the one it frees (callers also key the button by the shown send's hold, so a
// replacement closes an open warning).
import { Button, ConfirmDialog, useStrings } from "@kit";
import { useState } from "react";
import strings from "../strings.en.json";

export function DismissButton({
  onDismiss,
  body,
  variant = "ghost",
  size = "sm",
  isDisabled = false,
}: {
  /** Taken when the warning opens (the closure of the send shown then), and run on "Dismiss anyway". */
  onDismiss: () => unknown;
  /** What dismissing risks here; default: the general warning. */
  body?: string;
  variant?: "ghost" | "secondary" | "row";
  size?: "sm" | "md";
  /** Off while a read of the same change is out: its answer may still settle it. */
  isDisabled?: boolean;
}) {
  const t = useStrings(strings);
  const [ask, setAsk] = useState<{ run: () => unknown } | null>(null);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        isDisabled={isDisabled}
        onPress={() => setAsk({ run: onDismiss })}
      >
        {t("dismiss.act")}
      </Button>
      <ConfirmDialog
        isOpen={!!ask}
        onOpenChange={(o) => !o && setAsk(null)}
        title={t("dismiss.title")}
        body={body ?? t("dismiss.body")}
        confirmLabel={t("dismiss.go")}
        onConfirm={() => {
          const asked = ask;
          setAsk(null);
          if (asked && !isDisabled) void asked.run();
        }}
      />
    </>
  );
}
