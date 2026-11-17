// The secrets gate (check.ts) must check every case. SECRETS_CASES narrows a hand run of secrets.ts to the cases and
// flows its regex matches (secrets.ts: `only`). netns.sh keeps it (net-policy ENV_RULES), so a stray
// one left in a shell would narrow the gate and still let it pass.
// The gate refuses to run instead.
import type { Problem } from './goldens';

/** A problem when the env the secrets child would get narrows its cases; null when the gate may run. */
export function secretsGateRefusal(env: Readonly<Record<string, string | undefined>>): Problem | null {
  // secrets.ts treats an empty value as "every case" (`process.env.SECRETS_CASES ? … : null`).
  if (!env.SECRETS_CASES) return null;
  return {
    file: 'scripts/term/secrets.ts',
    rule: 'secrets',
    message: 'SECRETS_CASES is set, so the secrets gate would check only the cases it matches: refused, nothing checked',
    fix: 'Unset SECRETS_CASES (it is for a hand run of `bun scripts/term/secrets.ts`) and run the gate again.',
  };
}
