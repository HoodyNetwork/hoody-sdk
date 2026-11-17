// ProviderWays.tsx: "Continue with GitHub" / "Continue with Google" on the standalone Hub's sign-in card (FirstRun.tsx)
// and its "Create your account" card (Signup.tsx).
//
// Contract:
//   - One kit Button per provider Hoody's own pages offer (core/signin.ts readSignupConfig: GET /auth/config), in that
//     order (GitHub first); nothing while that read is out or when it failed. Secondary, full width, the provider's
//     own mark in the text colour (kit Icon) as its one mark (no end glyph): the card's one primary stays its form's
//     submit button.
//   - A press only names the provider. The page starts its device flow (device.ts): the person finishes with that
//     provider on Hoody's own page in another tab, where a new account can be made too. A provider answers only Hoody's
//     own origin, so this page never takes that answer; it gets its session by the device code.
import { Button } from '@kit';
import { useStrings } from '@kit/strings';
import type { SignInProvider } from '@core/signin';
import s from './FirstRun.module.css';
import strings from './strings.en.json';

const LABEL: Record<SignInProvider, 'prov.github' | 'prov.google'> = { github: 'prov.github', google: 'prov.google' };

export interface ProviderWaysProps {
  providers: readonly SignInProvider[];
  /** The provider whose sign-in is starting: its button shows busy. */
  busy?: SignInProvider | null;
  isDisabled?: boolean;
  onStart: (provider: SignInProvider) => void;
}

export function ProviderWays({ providers, busy = null, isDisabled = false, onStart }: ProviderWaysProps) {
  const t = useStrings(strings);
  if (providers.length === 0) return null;
  return (
    <div className={s.providers}>
      {providers.map((p) => (
        <Button key={p} variant="secondary" chip={false} fullWidth icon={p} busy={busy === p} isDisabled={isDisabled} onPress={() => { onStart(p); }}>
          {t(LABEL[p])}
        </Button>
      ))}
    </div>
  );
}
