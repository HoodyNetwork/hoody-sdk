// The way out of a shared-access (access key) session, one control for every notifications view that cannot read the
// account's lists. In the terminal the shell's signOut is its Leave (term/shell/TermShell.tsx pageData), so this button
// leaves the Hub there and never signs the CLI out.
import { Button, useShellData, useStrings } from '@kit';
import strings from '../strings.en.json';

/** The shell's own Sign out, or nothing when the shell has none (as Vault's). */
export function SignOutAction() {
  const t = useStrings(strings);
  const { signOut } = useShellData();
  if (!signOut) return null;
  return (
    <Button icon="logout" onPress={signOut}>
      {t('token.signOut')}
    </Button>
  );
}
